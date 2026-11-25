import { expandScope } from './scope-dependencies.mjs';
function testExpansion(expand) {
  const g = localID => ({sessionID:1,localID});
  const n = (localID,type,parentID,extra={}) => ({guid:g(localID),type,...(parentID==null?{}:{parentIndex:{guid:g(parentID)}}),...extra});
  const all = [
    n(1,'CANVAS',null),
    n(2,'INSTANCE',1,{symbolData:{symbolID:g(10),symbolOverrides:[{guidPath:{guids:[g(30),g(31)]},overriddenSymbolID:g(20),fillPaints:[{color:{r:0,g:0,b:0}}]}]},componentPropAssignments:[{defID:g(99),value:{boolValue:false}}]}),
    n(3,'CANVAS',null),
    n(4,'FRAME',3,{componentPropDefs:[{id:g(98),defaultValue:{boolValue:false}}]}),
    n(10,'SYMBOL',4,{componentPropDefs:[{id:g(99),parentPropDefId:g(98)}]}),
    n(11,'FRAME',10,{componentPropRefs:[{defID:g(99)}],styleIdForFill:{assetRef:{key:'example-style',version:'a'}}}),
    n(12,'SYMBOL',4),
    n(20,'SYMBOL',3),
    n(21,'TEXT',20,{textData:{styleOverrideTable:[{styleIdForText:{assetRef:{key:'missing-style'}}}]}}),
    n(22,'FRAME',20,{symbolData:{symbolID:g(10)}}),
    n(40,'FRAME',3,{styleType:'FILL',key:'example-style'}),
    n(41,'FRAME',3,{styleType:'FILL',key:'example-style'}),
    n(50,'VARIABLE_SET',3,{modes:[{id:'mode-a'}]}),
    n(51,'VARIABLE',50,{value:{alias:{guid:g(52)}},variableSetID:{guid:g(50)}}),
    n(52,'VARIABLE',50,{value:{floatValue:1}}),
    n(53,'VARIABLE',50,{value:{alias:{assetRef:{key:'missing-variable'}}}}),
    n(54,'VARIABLE',50,{phase:'REMOVED'})
  ];
  const init={nodes:[{id:'1:1'},{id:'1:2'}],componentDependencyCandidates:[{id:'1:10'},{id:'1:11'}],styleCandidates:[],counts:{},diagnostics:{instanceWithoutCandidate:[]},notes:[]};
  const out=expand(all,init), deps=new Set(out.componentDependencyCandidates.map(x=>x.id));
  const expect=(ok,label)=>{if(!ok)throw new Error(label);};
  expect(deps.has('1:4')&&out.ancestorCandidates.some(x=>x.id==='1:4'),'parent component set');
  expect(out.componentDependencyCandidates.find(x=>x.id==='1:4').componentPropDefs[0].defaultValue.boolValue===false,'false property default');
  expect(out.propertyDefinitionOwnerIds.includes('1:4'),'parent property owner');
  expect(deps.has('1:20')&&deps.has('1:21')&&deps.has('1:22'),'swap subtree and cycle');
  expect(!deps.has('1:12'),'unreferenced sibling excluded');
  expect(out.styleCandidates.length===2,'ambiguous style candidates retained');
  expect(out.diagnostics.ambiguousReferenceCandidates.some(x=>x.kind==='style'&&x.requestedVersion==='a'),'version retained');
  expect(out.diagnostics.unresolvedReferences.some(x=>x.identifiers.includes('missing-style')),'missing style');
  expect(out.diagnostics.unresolvedReferences.some(x=>x.identifiers.includes('missing-variable')),'missing variable');
  expect(out.variableCatalog.variables.length===3&&out.variableCatalog.collections.length===1,'raw variables including alias target, removed excluded');
  expect(out.referenceLedger.some(x=>x.kind==='variable'&&x.candidateIds.includes('1:52')),'variable alias');
  expect(out.overridePathInventory.some(x=>x.guidPath.join('/')==='1:30/1:31'),'full override path');
  expect(out.nodes.length===2&&out.diagnostics.instanceWithoutCandidate.length===0,'compatible existing collections');
  expect(new Set(out.referenceLedger.map(x=>x.nodeId+':'+x.path)).size===out.referenceLedger.length,'no repeated node scan');
  return 14;
}
console.log(`Passed ${testExpansion(expandScope)} synthetic dependency checks`);
