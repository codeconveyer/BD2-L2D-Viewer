export const categoryLabels = {
  character: '基础动作',
  ultimate: '必杀动作',
  'fated guest': '约会动作',
}

export function normalizedName(value) {
  return value.normalize('NFKC').replace(/\s*\(npc\)$/i, '(NPC)').replace(/\s/g, '')
}

export function costumeKey(value) {
  const normalized = normalizedName(value)
  return normalized === '???' || normalized === '未命名服装' ? '' : normalized
}

export function entryKey(role, costume) {
  return `${normalizedName(role)}/${costumeKey(costume)}`
}

export function parseAllowlist(source) {
  const entries = []
  const keys = new Set()
  for (const line of source.split(/\r?\n/)) {
    if (!line.includes('character:')) continue
    const header = /^(.+?):\s*(.+?),\s*character:/.exec(line)
    if (!header) throw new Error(`Invalid allowlist line: ${line}`)
    const role = header[1].trim()
    const costume = header[2].trim()
    const key = entryKey(role, costume)
    if (keys.has(key)) throw new Error(`Duplicate allowlist entry: ${role}: ${costume}`)
    keys.add(key)
    const categories = {}
    const sections = [...line.matchAll(/(?:^|[,，])\s*(character|ultimate|fated guest):\s*/g)]
    for (const [index, section] of sections.entries()) {
      const content = line.slice(section.index + section[0].length, sections[index + 1]?.index ?? line.length)
      const skins = {}
      let names
      if (content.includes('skins:')) {
        const groups = [...content.matchAll(/skins:\s*([^（(]+)[（(]([^）)]+)[）)]/g)]
        if (!groups.length) throw new Error(`Invalid skin groups: ${line}`)
        for (const group of groups) skins[group[1].trim()] = motionNames(group[2])
        names = Object.values(skins).flat()
      } else {
        names = motionNames(content)
      }
      const motions = [...new Set(names)]
      categories[section[1]] = { motions, ...(Object.keys(skins).length ? { skins } : {}) }
    }
    entries.push({ role, costume, categories, motionCount: Object.values(categories).reduce((count, category) => count + category.motions.length, 0) })
  }
  if (!entries.length) throw new Error('The allowlist contains no character entries')
  return entries
}

function motionNames(value) {
  return value.split('、').map(name => name.trim()).filter(Boolean)
}

export function selectNativeMotions(requested, native) {
  const available = new Set(native)
  return {
    motions: requested.filter(name => available.has(name)),
    missingMotions: requested.filter(name => !available.has(name)),
  }
}

export function datingSkins(motions, skinNames, explicit = {}) {
  const available = new Set(skinNames)
  const skins = {}
  const assigned = new Set()
  for (const [skin, names] of Object.entries(explicit)) {
    if (!available.has(skin)) continue
    const selected = names.filter(name => motions.includes(name))
    if (selected.length) skins[skin] = selected
    for (const name of selected) assigned.add(name)
  }
  for (const name of motions) {
    if (assigned.has(name)) continue
    const group = /^(?:idle|mix|motion)(\d+)(?:_|$)/i.exec(name)?.[1]
    const skin = group && (available.has(`idle${group}_1`) ? `idle${group}_1` : skinNames.find(candidate => candidate === `idle${group}` || candidate.startsWith(`idle${group}_`)))
    if (skin) (skins[skin] ??= []).push(name)
  }
  return skins
}
