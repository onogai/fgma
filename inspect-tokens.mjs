import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseFigBinary, nodeId } from 'openfig-core';

// Run from the project directory where openfig-core is installed.
const input = resolve(process.argv[2] || 'canvas.fig');
const output = resolve(process.argv[3] || 'inspection');
const doc = parseFigBinary(new Uint8Array(readFileSync(input)));
const nodes = doc.nodes.filter(n => n.phase !== 'REMOVED');
const id = n => { try { return nodeId(n) || null; } catch { return null; } };
const byId = new Map(nodes.map(n => [id(n), n]).filter(([k]) => k));
const count = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
const counters = () => Object.create(null);
const ordered = obj => Object.fromEntries(Object.entries(obj).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])));
const parentId = n => n.parentIndex?.guid ? id({guid:n.parentIndex.guid}) : null;
const pageCache = new Map();
function pageOf(n) {
  const trail = [], seen = new Set();
  let page = null;
  while(n) {
    const k = id(n);
    if (!k || seen.has(k)) break;
    if (pageCache.has(k)) { page = pageCache.get(k); break; }
    trail.push(k); seen.add(k);
    if (n.type === 'CANVAS') { page = k; break; }
    const p = parentId(n);
    n = p ? byId.get(p) : null;
  }
  for(const k of trail) pageCache.set(k, page);
  return page;
}
// Keep the original variable payload, including aliases, modes and library references.
// No image assets or full scene graph are written. Review STRING variable values before sharing.
const sets = nodes.filter(n => n.type === 'VARIABLE_SET');
const variables = nodes.filter(n => n.type === 'VARIABLE');
const catalogs = {
  header: doc.header,
  collections: sets.map(n => ({ id: id(n), raw: n })),
  variables: variables.map(n => ({ id: id(n), parentId: parentId(n), raw: n }))
};
const pages = new Map(nodes.filter(n => n.type === 'CANVAS').map(n => [id(n), { id: id(n), name: n.name, counts: counters() }]));
const unassigned = counters(), fieldStats = new Map(), styleFields = counters(), styleTypes = counters();
const styleSamples = [];
const collectionIds = new Set(sets.map(id));
let directCollectionParent = 0, withoutParent = 0;
for (const n of variables) {
  const p = parentId(n);
  if (collectionIds.has(p)) directCollectionParent++;
  if (!p) withoutParent++;
}
for (const n of nodes) {
  const page = pages.get(pageOf(n));
  count(page ? page.counts : unassigned, n.type || 'UNKNOWN');
  const t = n.type || 'UNKNOWN';
  if (!fieldStats.has(t)) fieldStats.set(t, { count: 0, fields: counters() });
  const stats = fieldStats.get(t); stats.count++;
  for (const k of Object.keys(n)) {
    count(stats.fields, k);
    if (/style|variable|override|symbol|component/i.test(k)) count(styleFields,k);
  }
  if (n.styleType !== undefined) {
    count(styleTypes, String(n.styleType));
    if (styleSamples.length < 30) styleSamples.push({id:id(n), type:t, name:n.name, styleType:n.styleType, fields:Object.keys(n)});
  }
}
const report = {
  header: doc.header, totalNodes:nodes.length,
  counts: { collections:sets.length, variables:variables.length },
  collectionParentDiagnostics:{directCollectionParent, withoutParent},
  pages:[...pages.values()].map(p => ({...p, counts:ordered(p.counts)})),
  unassignedNodes:ordered(unassigned),
  fieldsByNodeType:Object.fromEntries([...fieldStats].map(([t,s]) => [t,{count:s.count,fields:ordered(s.fields)}])),
  styleVariableAndComponentFieldFrequency:ordered(styleFields),
  styleTypeFrequency:ordered(styleTypes), styleSamples,
  parentIndexExample:nodes.find(n=>n.parentIndex?.guid)?.parentIndex ?? null,
  notes:['Raw variables retain soft-deleted records when phase is not REMOVED.','Page mapping uses parentIndex.guid; check unassignedNodes before relying on page counts.','Style samples are diagnostic only; absence of styleType does not establish absence of styles.']
};
mkdirSync(output,{recursive:true});
const replacer = (_,v) => typeof v === 'bigint' ? v.toString() : v;
for (const [name, data] of [['variables.raw.json',catalogs], ['structure.report.json',report]]) {
  const file = join(output,name);
  writeFileSync(file,JSON.stringify(data,replacer,2)+'\n');
  console.log(`Saved ${file}`);
}
console.log(`Nodes: ${nodes.length}; pages: ${pages.size}; collections: ${sets.length}; variables: ${variables.length}`);
console.log(`Variables with direct collection parent: ${directCollectionParent}/${variables.length}`);
console.log('Done. Review exported content before sharing.');
