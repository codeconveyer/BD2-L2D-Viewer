export function parseCompositeDefinitions(source) {
  const value = source.replace(/^[\s\S]*?const cutsceneComposites:[^=]+=/, '').replace(/\nexport default cutsceneComposites\s*$/, '')
  return Function(`return (${value})`)()
}

export function selectPlayableMotions(requested, native, definitions, readSource) {
  const nativeNames = new Set(native.motions)
  const byName = new Map((definitions ?? []).map(definition => [definition.name || 'cut_all', definition.composite ?? definition.animations]))
  const composites = {}
  const failures = []
  const motions = []
  const missingMotions = []
  function compile(name, ancestors = []) {
    if (ancestors.includes(name)) throw new Error(`Circular composite: ${[...ancestors, name].join(' -> ')}`)
    const mapping = byName.get(name)
    if (!Array.isArray(mapping) || !mapping.length) throw new Error(`Invalid composite: ${name}`)
    const nextAncestors = [...ancestors, name]
    const compileSpec = spec => {
      if (typeof spec === 'string' && byName.has(spec)) return compile(spec, nextAncestors)
      const options = typeof spec === 'string' ? { name: spec } : { ...spec }
      const source = options.source?.replace(/\\/g, '/').replace(/\.(skel|json|atlas)$/i, '')
      const data = source ? readSource(source) : native
      if (!data.motions.includes(options.name)) throw new Error(`${source || 'main skeleton'}: animation ${options.name} not found`)
      if (options.skin && !data.skins.includes(options.skin)) throw new Error(`${source || 'main skeleton'}: skin ${options.skin} not found`)
      if (source) options.source = source.replace(/^cutscene\//, '')
      return { kind: 'animation', spec: options }
    }
    return {
      kind: 'sequence',
      children: mapping.map(phase => Array.isArray(phase)
        ? { kind: 'parallel', children: phase.map(compileSpec) }
        : compileSpec(phase)),
    }
  }
  for (const name of requested) {
    try {
      if (byName.has(name)) composites[name] = compile(name)
      else if (!nativeNames.has(name)) throw new Error('No native animation or web composite definition')
      motions.push(name)
    } catch (error) {
      missingMotions.push(name)
      const normalized = value => value.toLowerCase().replace(/_/g, '')
      const tokens = value => value.toLowerCase().split('_').sort().join('_')
      const candidates = [...new Set([...nativeNames, ...byName.keys()])].filter(candidate => normalized(candidate) === normalized(name) || tokens(candidate) === tokens(name))
      failures.push({ name, reason: error.message, ...(candidates.length ? { suggestedMotions: candidates } : {}) })
    }
  }
  return { motions, missingMotions, composites, failures }
}
