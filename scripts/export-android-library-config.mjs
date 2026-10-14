import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { categoryLabels, datingSkins, entryKey, parseAllowlist } from './android-motion-allowlist.mjs'
import { parseCompositeDefinitions, selectPlayableMotions } from './android-motion-composites.mjs'

const projectRoot = resolve(new URL('..', import.meta.url).pathname)
const spineRoot = resolve(projectRoot, 'src/assets/spines')
const iconRoot = resolve(projectRoot, 'src/assets/char_icons')
const configPath = resolve(projectRoot, 'android-live2d.json')
const allowlistPath = resolve(projectRoot, 'config/android-motion-allowlist.md')
const reportPath = resolve(projectRoot, 'config/android-motion-report.json')
const androidAllowlistPath = resolve(projectRoot, '../live2d-mobile-android/app/src/main/assets/android-motion-allowlist.json')
const specifications = parseAllowlist(readFileSync(allowlistPath, 'utf8'))
const specificationByKey = new Map(specifications.map(specification => [entryKey(specification.role, specification.costume), specification]))
const matchedKeys = new Set()
const missingPacks = []
const missingMotions = []
const compositeDefinitions = parseCompositeDefinitions(readFileSync(resolve(projectRoot, 'src/utils/cutscene_mappings.ts'), 'utf8'))

const converter = process.env.SPINE_CONVERTER
  ?? resolve(projectRoot, '../SpineSkeletonDataConverter/build/SpineSkeletonDataConverter')
const canEnumerateMotions = existsSync(converter)
if (!canEnumerateMotions) throw new Error(`Native animation verification requires a Spine converter at ${converter}. Set SPINE_CONVERTER to its path.`)

function parseDefaultExport(file, pattern, suffix) {
  let source = readFileSync(resolve(projectRoot, file), 'utf8')
  source = source.replace(pattern, '')
  if (suffix) source = source.replace(suffix, '')
  return Function(`return (${source})`)()
}

const characters = parseDefaultExport('src/utils/character_list.ts', /^export default /, /(?<=}) as \{[\s\S]*$/)
const characterNamesZh = parseDefaultExport(
  'src/utils/character_list_zh.ts',
  /^[\s\S]*?const characterListZh: Record<string, string> = /,
  /\nexport default characterListZh\s*$/,
)
const costumeNamesZh = parseDefaultExport(
  'src/utils/costume_list_zh.ts',
  /^[\s\S]*?const costumeListZh: Record<string, string> = /,
  /\nexport default costumeListZh\s*$/,
)

function chineseCharacterName(name) {
  return (characterNamesZh[name]?.trim() || (name === 'Minigame' ? '小游戏' : '未命名角色'))
    .replace(/\s*\(Npc\)$/i, '（NPC）')
}

function chineseCostumeName(name) {
  return (costumeNamesZh[name]?.trim() || (name === '???' ? '未命名服装' : '未命名服装'))
    .replace(/\s*\(Censored\)$/i, '（审查版）')
}

const animationCache = new Map()

function spineData(skelPath) {
  if (animationCache.has(skelPath)) return animationCache.get(skelPath)
  const scratch = mkdtempSync(resolve(tmpdir(), 'spine-anim-'))
  try {
    const jsonPath = resolve(scratch, 'model.json')
    execFileSync(converter, [skelPath, jsonPath], { stdio: 'ignore' })
    const skeleton = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const data = {
      motions: Object.keys(skeleton.animations ?? {}),
      skins: Array.isArray(skeleton.skins) ? skeleton.skins.map(skin => skin.name) : Object.keys(skeleton.skins ?? {}),
    }
    animationCache.set(skelPath, data)
    return data
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// A pack the user has already curated keeps its shorter list: rewriting it would
// silently un-block whatever was removed. Regenerating only ever fills in packs
// that are still null, so new animations arrive unfiltered.
function curatedMotions(id, label) {
  const entry = previous?.entries?.find(candidate => candidate.id === id)
  const pack = entry?.packs?.find(candidate => candidate.label === label)
  return Array.isArray(pack?.motions) ? pack.motions : null
}

function curatedPackOptions(id, label) {
  const entry = previous?.entries?.find(candidate => candidate.id === id)
  const pack = entry?.packs?.find(candidate => candidate.label === label)
  return {
    ...(pack?.skins ? { skins: pack.skins } : {}),
  }
}

function pack(id, directory, model, label, specification) {
  const category = Object.keys(categoryLabels).find(candidate => categoryLabels[candidate] === label)
  const requested = specification?.categories[category]
  if (specification && !requested) return null
  const base = resolve(spineRoot, directory)
  if (!existsSync(resolve(base, model)) || !existsSync(resolve(base, model.replace(/\.skel$/i, '.atlas')))) {
    if (requested) {
      requested.availableMotions = []
      requested.missingMotions = [...requested.motions]
      missingPacks.push({ id, role: specification.role, costume: specification.costume, category, model: `${directory}/${model}` })
    }
    return null
  }

  if (requested) {
    const native = spineData(resolve(base, model))
    const selection = selectPlayableMotions(requested.motions, native, category === 'ultimate' ? compositeDefinitions[id] : [], source => {
      const path = resolve(spineRoot, id, `${source}.skel`)
      if (!existsSync(path) || !existsSync(path.replace(/\.skel$/i, '.atlas'))) throw new Error(`Missing composite skeleton or atlas: ${id}/${source}`)
      return spineData(path)
    })
    requested.availableMotions = selection.motions
    requested.missingMotions = selection.missingMotions
    requested.composites = selection.composites
    if (selection.missingMotions.length) missingMotions.push({ id, role: specification.role, costume: specification.costume, category, motions: selection.missingMotions, details: selection.failures })
    const skins = category === 'fated guest' ? datingSkins(selection.motions, native.skins, requested.skins) : {}
    if (Object.keys(skins).length) requested.skins = skins
    enumerated += 1
    if (!selection.motions.length) return null
    return {
      label,
      path: directory,
      model,
      atlas: model.replace(/\.skel$/i, '.atlas'),
      motions: selection.motions,
      motionCount: selection.motions.length,
      ...(Object.keys(selection.composites).length ? { composites: selection.composites } : {}),
      ...(selection.missingMotions.length ? { missingMotions: selection.missingMotions } : {}),
      ...(Object.keys(skins).length ? { skins } : {}),
    }
  }

  const curated = curatedMotions(id, label)
  const curatedOptions = curatedPackOptions(id, label)
  if (curated) {
    preserved += 1
    return {
      label,
      path: directory,
      model,
      atlas: model.replace(/\.skel$/i, '.atlas'),
      motions: curated,
      ...curatedOptions,
    }
  }

  let motions = null
  if (canEnumerateMotions) {
    try {
      const names = spineData(resolve(base, model)).motions
      // An empty array would hide every animation, so leave the pack unfiltered.
      if (names.length) {
        motions = names
        enumerated += 1
      }
    } catch (error) {
      console.warn(`Could not read animations from ${directory}/${model}: ${error.message}`)
    }
  }
  return {
    label,
    path: directory,
    model,
    atlas: model.replace(/\.skel$/i, '.atlas'),
    motions,
    ...curatedOptions,
  }
}

let preserved = 0
let enumerated = 0
const previous = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null

const entries = Object.entries(characters).flatMap(([id, character]) => {
  const role = chineseCharacterName(character.charName)
  const costume = chineseCostumeName(character.costumeName)
  const key = entryKey(role, costume)
  const specification = specificationByKey.get(key)
  if (specification) matchedKeys.add(key)
  const packs = [
    pack(id, id, `${character.spine}.skel`, '基础动作', specification),
    character.cutscene || specification?.categories.ultimate ? pack(id, `${id}/cutscene`, `${character.cutscene || `cutscene_${character.spine}`}.skel`, '必杀动作', specification) : null,
    character.dating || specification?.categories['fated guest'] ? pack(id, `${id}/dating`, `${character.dating || `illust_${character.spine}`}.skel`, '约会动作', specification) : null,
  ].filter(Boolean)
  if (!packs.length) return []
  const iconCandidates = [`icon_${character.spine}.png`, `icon_${id}.png`]
  const icon = iconCandidates.find(file => existsSync(resolve(iconRoot, file)))
  return [{
    id,
    role,
    costume,
    icon: icon ? `src/assets/char_icons/${icon}` : null,
    packs,
    ...(specification ? { motionCount: packs.reduce((count, pack) => count + pack.motions.length, 0) } : {}),
  }]
})

const output = {
  version: 1,
  resourceRoot: 'src/assets/spines',
  description: 'Android-only motion catalog. Name-matched entries use config/android-motion-allowlist.md. Native animations and verified original web composite definitions are playable; missing dependencies are reported, never invented.',
  entries,
}
const outputPath = configPath
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(`Wrote ${entries.length} entries and ${entries.reduce((count, entry) => count + entry.packs.length, 0)} action packs to ${outputPath}`)
console.log(`motions enumerated: ${enumerated}, previously curated and kept: ${preserved}`)
const matched = specifications.filter(specification => matchedKeys.has(entryKey(specification.role, specification.costume)))
const summary = {
  configuredRoles: new Set(specifications.map(specification => specification.role)).size,
  configuredEntries: specifications.length,
  configuredPacks: specifications.reduce((count, specification) => count + Object.keys(specification.categories).length, 0),
  configuredMotions: specifications.reduce((count, specification) => count + specification.motionCount, 0),
  matchedEntries: matched.length,
  availablePacks: matched.reduce((count, specification) => count + Object.values(specification.categories).filter(category => category.availableMotions?.length).length, 0),
  availableMotions: matched.reduce((count, specification) => count + Object.values(specification.categories).reduce((total, category) => total + (category.availableMotions?.length ?? 0), 0), 0),
  compositeMotions: matched.reduce((count, specification) => count + Object.values(specification.categories).reduce((total, category) => total + Object.keys(category.composites ?? {}).length, 0), 0),
}
summary.nativeMotions = summary.availableMotions - summary.compositeMotions
summary.missingMotions = summary.configuredMotions - summary.availableMotions
const report = {
  summary,
  unmatchedEntries: specifications.filter(specification => !matchedKeys.has(entryKey(specification.role, specification.costume))).map(({ role, costume, motionCount }) => ({ role, costume, motionCount })),
  missingPacks,
  missingMotions,
}
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
mkdirSync(dirname(androidAllowlistPath), { recursive: true })
writeFileSync(androidAllowlistPath, `${JSON.stringify({ version: 2, nativeOnly: false, summary, entries: specifications }, null, 2)}\n`)
console.log(JSON.stringify(summary))
console.log(`Missing resources and animations are recorded in ${reportPath}`)
