import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseFigBinary } from 'openfig-core';
import { expandScope } from './scope-dependencies.mjs';

function extractScope(allNodes, pageIds) {
  const guidId = g => g && Number.isInteger(g.sessionID) && Number.isInteger(g.localID) ? `${g.sessionID}:${g.localID}` : null;
  const nodes = allNodes.filter(n => n.phase !== 'REMOVED');
  const byId = new Map(), children = new Map(), assets = new Map();
  const push = (m,k,v) => { if(k == null) return; if(!m.has(k)) m.set(k,[]); m.get(k).push(v); };
  for (const n of nodes) {
    const id = guidId(n.guid);
    if(!id) continue;
    if(byId.has(id)) throw new Error(`Duplicate node ID: ${id}`);
    byId.set(id,n);
    push(children,guidId(n.parentIndex?.guid),id);
    if(n.type === 'SYMBOL' || n.styleType) {
      for(const k of new Set([id,n.key,n.componentKey,guidId(n.publishID)])) push(assets,k,id);
    }
  }
  const selected = new Set(), dependencies = new Set(), styleIds = new Set(), queue = [];
  const walk = (root, dest) => {
    const todo = [root];
    while(todo.length) {
      const id=todo.pop();
      if(dest.has(id)) continue;
      dest.add(id); queue.push(id);
      for(const c of children.get(id) || []) todo.push(c);
    }
  };
  for(const id of pageIds) {
    if(byId.get(id)?.type !== 'CANVAS') throw new Error(`Page not found or not a CANVAS: ${id}`);
    walk(id,selected);
  }
  const designFields = /^(name|type|phase|visible|opacity|blendMode|size|transform|parentIndex|fillPaints|strokePaints|strokeWeight|strokeAlign|strokeJoin|strokeCap|dashPattern|effects|cornerRadius|cornerSmoothing|rectangle.*Radius|rectangleCornerRadiiIndependent|border.*|stack.*|grid.*|layoutGrids|horizontalConstraint|verticalConstraint|minSize|maxSize|font.*|letterSpacing|lineHeight|paragraph.*|text.*|styleIdFor.*|styleType|key|publishID|version|sourceLibraryKey|component.*|variantPropSpecs|stateGroup.*|isStateGroup|symbolData|derivedSymbolData|derivedSymbolDataLayoutVersion|detachedSymbolId|overriddenSymbolID|overrideKey|variable.*|parameterConsumptionMap|background.*|scroll.*)$/i;
  const referenceFields = /^(styleIdFor.*|symbolData|derivedSymbolData|detachedSymbolId|overriddenSymbolID|componentPropAssignments|parameterConsumptionMap|fillPaints|strokePaints|effects|textData)$/i;
  const extract = n => {
    const fields = {};
    for(const [k,v] of Object.entries(n)) if(designFields.test(k)) fields[k]=v;
    return {id:guidId(n.guid),parentId:guidId(n.parentIndex?.guid),...fields};
  };
  function referenceKeys(n) {
    const keys=new Set(), todo=Object.entries(n).filter(([k])=>referenceFields.test(k)).map(([,v])=>v);
    while(todo.length) {
      const x=todo.pop();
      if(typeof x==='string') { if(assets.has(x)) keys.add(x); continue; }
      if(!x || typeof x!=='object' || ArrayBuffer.isView(x)) continue;
      const id=guidId(x);
      if(id && assets.has(id)) keys.add(id);
      for(const v of Object.values(x)) todo.push(v);
    }
    return keys;
  }
  const examined=new Set(), instanceWithoutCandidate=[], ambiguousReferences=[];
  for(let i=0;i<queue.length;i++) {
    const id=queue[i];
    if(examined.has(id)) continue;
    examined.add(id);
    const n=byId.get(id);
    let hasSymbol=false;
    for(const k of referenceKeys(n)) {
      const matches=assets.get(k);
      if(matches.length>1) ambiguousReferences.push({nodeId:id,reference:k,candidates:matches});
      for(const candidate of matches) {
        const target=byId.get(candidate);
        if(target.styleType && !styleIds.has(candidate)) { styleIds.add(candidate); queue.push(candidate); }
        if(target.type==='SYMBOL') {
          hasSymbol=true;
          if(!selected.has(candidate)) walk(candidate,dependencies);
        }
      }
    }
    if(n.type==='INSTANCE' && !hasSymbol) instanceWithoutCandidate.push(id);
  }
  const toRecords = ids => [...ids].map(id=>extract(byId.get(id)));
  const pageSummary=pageIds.map(id=>{
    const page=byId.get(id), sections=[];
    const todo=[id], seen=new Set();
    while(todo.length) {
      const k=todo.pop(); if(seen.has(k)) continue; seen.add(k);
      const n=byId.get(k);
      if(n.type==='SECTION') sections.push({id:k,name:n.name,parentId:guidId(n.parentIndex?.guid),size:n.size});
      for(const c of children.get(k)||[]) todo.push(c);
    }
    return {id,name:page.name,nodeCount:seen.size,sections};
  });
  return {
    pageSummary,
    counts:{selectedNodes:selected.size,dependencyNodes:[...dependencies].filter(id=>!selected.has(id)).length,styleCandidates:styleIds.size,instancesWithoutCandidate:instanceWithoutCandidate.length},
    nodes:toRecords(selected),
    componentDependencyCandidates:toRecords([...dependencies].filter(id=>!selected.has(id))),
    styleCandidates:toRecords(styleIds),
    diagnostics:{instanceWithoutCandidate,ambiguousReferences},
    notes:[
      'Evidence only: values are decoded properties, not computed or fully resolved styles.',
      'Component and style dependencies are candidates matched by GUID, publish ID or asset key; version conflicts and override paths are not resolved.',
      'Hidden nodes and instance overrides are preserved. Do not infer usage from frequency alone.',
      'Contains source design names, text and overrides; review before sharing.'
    ]
  };
}

const [input, ...pageIds] = process.argv.slice(2);
if (!input || !pageIds.length || pageIds.some(id => !/^\d+:\d+$/.test(id))) {
  console.error('Usage: node inspect-scope.mjs /path/to/canvas.fig PAGE_ID [PAGE_ID ...]');
  process.exit(1);
}
const doc = parseFigBinary(new Uint8Array(readFileSync(resolve(input))));
const result = expandScope(doc.nodes, extractScope(doc.nodes, [...new Set(pageIds)]));
const output = resolve('inspection-scope');
mkdirSync(output, { recursive: true });
const file = join(output, 'scope.raw.json');
writeFileSync(file, JSON.stringify({header:doc.header,...result}, (_,v)=>typeof v==='bigint'?v.toString():v, 2)+'\n');
console.log(JSON.stringify({pageSummary:result.pageSummary,counts:result.counts},null,2));
console.log('Saved '+file+'; review contents before sharing.');
