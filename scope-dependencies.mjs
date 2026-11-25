// Extend raw evidence, without claiming effective-style resolution.
export function expandScope(allNodes, initial) {
  const guid = v => v && Number.isInteger(v.sessionID) && Number.isInteger(v.localID) ? `${v.sessionID}:${v.localID}` : null;
  const id = n => guid(n.guid);
  const parent = n => guid(n.parentIndex?.guid);
  const nodes = allNodes.filter(n => n.phase !== 'REMOVED' && id(n));
  const byId = new Map(), children = new Map(), indices = new Map();
  const put = (m, key, value) => {
    if (!key) return;
    if (!m.has(key)) m.set(key, new Set());
    m.get(key).add(value);
  };
  const index = (kind, key, value) => put(indices, `${kind}:${key}`, value);
  const keys = n => [id(n), n.key, n.componentKey, guid(n.publishID)].filter(k => typeof k === 'string' && k.length);
  const kinds = n => [
    ...(n.type === 'SYMBOL' ? ['symbol'] : []),
    ...(n.styleType != null ? ['style'] : []),
    ...(n.type === 'VARIABLE' ? ['variable'] : []),
    ...(n.type === 'VARIABLE_SET' ? ['collection'] : [])
  ];
  for (const n of nodes) {
    const k = id(n);
    if (byId.has(k)) throw new Error(`Duplicate node ID: ${k}`);
    byId.set(k, n);
    put(children, parent(n), k);
    for (const kind of kinds(n)) for (const key of keys(n)) index(kind, key, k);
    for (const def of Array.isArray(n.componentPropDefs) ? n.componentPropDefs : []) {
      const defId = guid(def.id);
      if (defId) index('property', defId, k);
    }
  }
  const selected = new Set(initial.nodes.map(n => n.id));
  const dependencies = new Set(initial.componentDependencyCandidates.map(n => n.id));
  const styles = new Set(initial.styleCandidates.map(n => n.id));
  const ancestors = new Set(), propertyOwners = new Set(), expanded = new Set(), queued = new Set(), queue = [];
  const missingParents = [], references = [], overridePaths = [];
  const enqueue = k => {
    if (byId.has(k) && !queued.has(k)) {
      queued.add(k); queue.push(k);
    }
  };
  const addDependency = k => {
    if (!selected.has(k)) dependencies.add(k);
    enqueue(k);
  };
  const subtree = root => {
    const todo = [root];
    while (todo.length) {
      const k = todo.pop();
      if (!byId.has(k) || expanded.has(k)) continue;
      expanded.add(k); addDependency(k);
      for (const child of children.get(k) || []) todo.push(child);
    }
  };
  const addAncestors = root => {
    const seen = new Set([root]);
    let k = root;
    while (byId.has(k)) {
      const p = parent(byId.get(k));
      if (!p) break;
      if (!byId.has(p)) { missingParents.push({nodeId:k, parentId:p, sourceNodeId:root, reason:'missing'}); break; }
      if (seen.has(p)) { missingParents.push({nodeId:k, parentId:p, sourceNodeId:root, reason:'cycle'}); break; }
      seen.add(p);
      const n = byId.get(p);
      if (!selected.has(p)) ancestors.add(p);
      if (n.type !== 'CANVAS' && n.type !== 'DOCUMENT') addDependency(p);
      k = p;
    }
  };
  const allVariables = nodes.filter(n => n.type === 'VARIABLE' || n.type === 'VARIABLE_SET');
  for (const k of [...selected, ...dependencies, ...styles, ...allVariables.map(id)]) enqueue(k);
  const refKeys = v => {
    if (typeof v === 'string') return [v];
    if (!v || typeof v !== 'object') return [];
    return [...new Set([guid(v), guid(v.guid), guid(v.guidKey), v.assetRef?.key, v.key].filter(k => typeof k === 'string' && k.length))];
  };
  const kindOf = key => {
    if (/^(symbolid|overriddensymbolid|detachedsymbolid|symbolidvalue)$/i.test(key)) return 'symbol';
    if (/^styleIdFor/i.test(key)) return 'style';
    if (/^(alias|variableid)$/i.test(key)) return 'variable';
    if (/^(variableSetID|variableCollectionID)$/i.test(key)) return 'collection';
    if (/^(defID|propDefId|parentPropDefId)$/i.test(key)) return 'property';
    return null;
  };
  function visitReference(nodeId, path, kind, raw) {
    if (raw == null) return;
    const identifiers = refKeys(raw);
    const matches = new Set();
    for (const k of identifiers) for (const match of indices.get(`${kind}:${k}`) || []) matches.add(match);
    const candidateIds = [...matches].sort();
    references.push({
      nodeId, path, kind, identifiers,
      requestedVersion: raw?.assetRef?.version ?? raw?.version ?? null,
      candidateIds,
      status: !identifiers.length ? 'unrecognized-reference' : !candidateIds.length ? 'missing' : candidateIds.length > 1 ? 'ambiguous' : 'candidate'
    });
    for (const target of candidateIds) {
      if (kind === 'symbol') subtree(target);
      else if (kind === 'style') { styles.add(target); enqueue(target); }
      else if (kind === 'property') { propertyOwners.add(target); addDependency(target); }
      else enqueue(target);
    }
  }
  const scan = n => {
    const rootId = id(n), todo = [];
    const relevant = /^(symbolData|derivedSymbolData|detachedSymbolId|overriddenSymbolID|component.*|variant.*|stateGroup.*|parameter.*|variable.*|styleIdFor.*|fillPaints|strokePaints|effects|textData|.*(?:Binding|Bindings|ConsumptionMap))$/i;
    const rawVariable = n.type === 'VARIABLE' || n.type === 'VARIABLE_SET';
    for (const [key, value] of Object.entries(n)) if (rawVariable || relevant.test(key)) todo.push({key, value, path:key});
    while (todo.length) {
      const {key, value, path} = todo.pop();
      const kind = kindOf(key);
      if (kind) visitReference(rootId, path, kind, value);
      if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) continue;
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) todo.push({key:'', value:value[i], path:`${path}[${i}]`});
        continue;
      }
      if (value.guidPath && Array.isArray(value.guidPath.guids)) {
        overridePaths.push({nodeId:rootId, path, guidPath:value.guidPath.guids.map(guid), fields:Object.keys(value).filter(k => k !== 'guidPath')});
      }
      for (const [k, v] of Object.entries(value)) todo.push({key:k, value:v, path:`${path}.${k}`});
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i], n = byId.get(k);
    if (n.type !== 'VARIABLE' && n.type !== 'VARIABLE_SET') addAncestors(k);
    scan(n);
  }
  const extraFields = /^(component.*|variant.*|stateGroup.*|isStateGroup|parameter.*|variable.*|property.*|.*(?:Binding|Bindings|ConsumptionMap))$/i;
  const designFields = /^(name|type|phase|visible|opacity|blendMode|size|transform|parentIndex|fillPaints|strokePaints|strokeWeight|strokeAlign|strokeJoin|strokeCap|dashPattern|effects|cornerRadius|cornerSmoothing|rectangle.*Radius|rectangleCornerRadiiIndependent|border.*|stack.*|grid.*|layoutGrids|horizontalConstraint|verticalConstraint|minSize|maxSize|font.*|letterSpacing|lineHeight|paragraph.*|text.*|styleIdFor.*|styleType|key|publishID|version|sourceLibraryKey|symbolData|derivedSymbolData|derivedSymbolDataLayoutVersion|detachedSymbolId|overriddenSymbolID|overrideKey|background.*|scroll.*)$/i;
  const existing = new Map([...initial.nodes,...initial.componentDependencyCandidates,...initial.styleCandidates].map(n => [n.id,n]));
  const record = k => {
    const n = byId.get(k);
    const result = {id:k,parentId:parent(n),...existing.get(k)};
    for (const [key,value] of Object.entries(n)) if (designFields.test(key) || extraFields.test(key)) result[key] = value;
    return result;
  };
  const records = ids => [...ids].filter(k => byId.has(k)).map(record);
  const rawRecord = n => ({id:id(n),parentId:parent(n),raw:n});
  const unresolved = references.filter(r => r.status === 'missing' || r.status === 'unrecognized-reference');
  const ambiguous = references.filter(r => r.status === 'ambiguous');
  return {
    ...initial,
    counts:{...initial.counts,selectedNodes:selected.size,dependencyNodes:dependencies.size,styleCandidates:styles.size,ancestorCandidates:ancestors.size,propertyDefinitionOwners:propertyOwners.size,variableCollections:allVariables.filter(n => n.type === 'VARIABLE_SET').length,variables:allVariables.filter(n => n.type === 'VARIABLE').length,referenceOccurrences:references.length,unresolvedReferenceOccurrences:unresolved.length,ambiguousReferenceOccurrences:ambiguous.length,overridePathOccurrences:overridePaths.length},
    nodes:records(selected),
    componentDependencyCandidates:records(dependencies),
    styleCandidates:records(styles),
    ancestorCandidates:records(ancestors),
    propertyDefinitionOwnerIds:[...propertyOwners],
    variableCatalog:{collections:allVariables.filter(n => n.type === 'VARIABLE_SET').map(rawRecord),variables:allVariables.filter(n => n.type === 'VARIABLE').map(rawRecord)},
    referenceLedger:references,
    overridePathInventory:overridePaths,
    diagnostics:{...initial.diagnostics,missingParents,unresolvedReferences:unresolved,ambiguousReferenceCandidates:ambiguous},
    notes:[...(initial.notes || []),'Dependency closure includes ancestor/property-definition candidates, explicit symbol swaps, and the raw document-wide variable catalog. Ancestors are not expanded into sibling subtrees unless separately referenced.','Reference matches are candidates only: GUID paths, library versions, property defaults, variable modes, alias precedence and visibility are not evaluated. Unrecognized or missing references are reported, not guessed.']
  };
}
