import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {prepare,optimize} from '../../lanova/recruitment/engine/optimizer.js';
import {canonicalScenario,inputsKey} from '../../lanova/recruitment/scenario.js';
import {createDecisionState} from '../../lanova/recruitment/decision-state.js';
const dir=new URL('./',import.meta.url);
// Deliberately restricted one-season cases: independent arithmetic, no shared economics/evaluator.
const player=(id,position,fee,wage,points,extra={})=>({id,name:`Fictional ${id}`,position,dealType:'permanent',contractYears:1,fee,wage,points,exitValue:0,...extra});
const candidates=[player('CB-value','CB',300000,180000,1.4),player('CB-premium','CB',700000,300000,2.3),player('ST-value','ST',450000,250000,2),player('ST-premium','ST',1000000,450000,3.4),player('W-loan','W',100000,160000,1.2,{dealType:'loan',wageShare:0.5}),player('CM-free','CM',0,200000,1.1,{dealType:'free',agentFee:50000,signingBonus:40000})];
const base={horizon:1,discountRate:0.1,transferBudget:1500000,squadCostLimit:[6500000],committedSquadCost:[4000000],openingCash:3000000,operatingCashFlow:[0],minCash:200000,protectedReserve:100000,currentSquadSize:21,maxSquadSize:25,currentNonEU:0,maxNonEU:3,maxSignings:4,positionNeeds:{CB:1,ST:1},objective:'blended',valuePerPoint:600000,samePositionFactor:0.5};
const cases=[{label:'Second-tier balanced window',context:base,candidates},{label:'Cash-constrained survival window',context:{...base,openingCash:1500000,transferBudget:800000,valuePerPoint:400000},candidates},{label:'Promotion push with registration bottleneck',context:{...base,maxSquadSize:23,valuePerPoint:900000,objective:'points'},candidates}];
function independent(s){
 let best=null,feasibleCount=0;
 for(let mask=0;mask<2**s.candidates.length;mask++){
  const cs=s.candidates.filter((c,i)=>mask&(1<<i)),ctx=s.context;
  let upfront=0,cost=0,npv=0,points=0;
  const positions={};
  for(const c of cs){const paid=c.fee+(c.agentFee??0)+(c.signingBonus??0);const end=c.wage*(c.dealType==='loan'?(c.wageShare??1):1)+(c.bonusExpected??0);upfront+=paid;cost+=paid+end;npv-=paid+end/(1+ctx.discountRate);(positions[c.position]??=[]).push(c.points);}
  for(const ps of Object.values(positions))ps.sort((a,b)=>b-a).forEach((p,k)=>points+=p*ctx.samePositionFactor**k);
  const cash0=ctx.openingCash-upfront,cash1=ctx.openingCash+ctx.operatingCashFlow[0]-cost;
  const feasible=upfront<=ctx.transferBudget+.01&&cost+ctx.committedSquadCost[0]<=ctx.squadCostLimit[0]+.01&&Math.min(cash0,cash1)>=ctx.minCash+ctx.protectedReserve-.01&&cs.length<=ctx.maxSignings&&cs.length+ctx.currentSquadSize<=ctx.maxSquadSize&&Object.entries(ctx.positionNeeds).every(([p,n])=>(positions[p]?.length??0)>=n);
  if(!feasible)continue;feasibleCount++;
  const objective=ctx.objective==='points'?points:npv+ctx.valuePerPoint*points/(1+ctx.discountRate);
  if(!best||objective>best.objective+1e-6||(Math.abs(objective-best.objective)<=1e-6&&npv>best.npv))best={selection:cs.map(c=>c.id),objective,npv,points,upfront,squadCost:cost+ctx.committedSquadCost[0],cash:[cash0,cash1]};
 }
 return {best,feasibleCount};
}
const results=[];
for(const s of cases){
 const canonical=canonicalScenario({...s,schema:'lanova-recruitment-v2',fictional:true});
 fs.writeFileSync(new URL(`case-${cases.indexOf(s)+1}.json`,dir),JSON.stringify(canonical,null,2));
 const runs=[];
 for(let rep=-1;rep<20;rep++){
  let t=performance.now();const p=prepare(s.candidates,s.context);const setup=performance.now()-t;
  t=performance.now();const actual=optimize(p);const computation=performance.now()-t;
  t=performance.now();const reference=independent(s);const referenceComputation=performance.now()-t;
  assert.equal(Boolean(actual.best),Boolean(reference.best));
  if(actual.best){assert.ok(Math.abs(actual.best.objective.primary-reference.best.objective)<1e-6);assert.ok(Math.abs(actual.best.npv-reference.best.npv)<1e-6);assert.deepEqual([...actual.best.selection].sort(),[...reference.best.selection].sort());assert.ok(Math.abs(actual.best.upfront-reference.best.upfront)<.01);assert.ok(Math.abs(actual.best.cashDownside[1]-reference.best.cash[1])<.01);assert.ok(Math.abs(actual.best.squadCost[0]-reference.best.squadCost)<.01);}
  if(rep>=0)runs.push({rep,prepareMs:setup,engineMs:computation,independentEnumerationMs:referenceComputation});
 }
 const edited=structuredClone(s);edited.context.transferBudget=0;
 assert.equal(optimize(prepare(edited.candidates,edited.context)).best,null);assert.equal(independent(edited).best,null);
 results.push({label:s.label,...independent(s),runs,infeasibleBudgetEdit:'pass'});
 assert.deepEqual(canonicalScenario(JSON.parse(JSON.stringify(canonical))),canonical);
}
const state=createDecisionState();let seq=state.submit('a');assert.equal(state.receive(seq,{ok:true}),'accepted');assert.ok(state.exportable('a'));assert.equal(state.exportable('b'),null);state.invalidate();assert.equal(state.exportable('a'),null);seq=state.submit('b');state.invalidate();assert.equal(state.receive(seq,{ok:true}),'stale');
fs.writeFileSync(new URL('results.json',dir),JSON.stringify({timestamp:new Date().toISOString(),environment:{node:process.version,platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model},warmups:1,repetitions:20,results,checks:{scenarioRoundtrip:'pass',staleStateUnit:'pass'},unmeasured:['Excel execution','human manual performance','browser integration','deployed parity','setup labour','reporting labour']},null,2));
console.log(JSON.stringify(results.map(({runs,...r})=>r),null,2));
