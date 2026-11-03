/** LANOVA V2: exact, deterministic shortlist optimisation. No sporting forecasts. */
import {npv, MODEL_VERSION} from '../src/finance.js';
export const VERSION='LANOVA Sports V2.0';
export const POSITIONS=['GK','DF','MF','FW'];
export const MAX_CANDIDATES=16;
export const defaults={budget:6000000,wageCap:2200000,capital:15000000,reserve:2000000,years:4,agent:5,inflation:3,discount:10,maxSignings:4,minNpv:-4000000,maxDownsideLoss:8000000,downRevenue:30,haircut:50,upRevenue:20,upResale:20,objective:'score',minGK:0,minDF:1,minMF:1,minFW:1};
export const demoCandidates=[
 {id:'gk-a',name:'Fictional keeper A',position:'GK',fee:700000,wage:220000,revenue:120000,resale:900000,score:66,enabled:true},
 {id:'df-a',name:'Fictional defender A',position:'DF',fee:1200000,wage:350000,revenue:220000,resale:2000000,score:79,enabled:true},
 {id:'df-b',name:'Fictional defender B',position:'DF',fee:500000,wage:250000,revenue:150000,resale:700000,score:63,enabled:true},
 {id:'mf-a',name:'Fictional midfielder A',position:'MF',fee:1700000,wage:450000,revenue:350000,resale:3000000,score:86,enabled:true},
 {id:'mf-b',name:'Fictional midfielder B',position:'MF',fee:800000,wage:280000,revenue:180000,resale:1400000,score:70,enabled:true},
 {id:'fw-a',name:'Fictional forward A',position:'FW',fee:2400000,wage:600000,revenue:500000,resale:4000000,score:91,enabled:true},
 {id:'fw-b',name:'Fictional forward B',position:'FW',fee:900000,wage:350000,revenue:250000,resale:1500000,score:74,enabled:true},
 {id:'fw-c',name:'Fictional forward C',position:'FW',fee:4000000,wage:1000000,revenue:650000,resale:4500000,score:95,enabled:true}
];
const ranges={budget:[0,1e9],wageCap:[0,1e9],capital:[0,1e9],reserve:[0,1e9],years:[1,10],agent:[0,20],inflation:[-20,50],discount:[0,50],maxSignings:[0,16],minNpv:[-1e10,1e10],maxDownsideLoss:[0,1e10],downRevenue:[0,100],haircut:[0,100],upRevenue:[0,200],upResale:[0,200],minGK:[0,16],minDF:[0,16],minMF:[0,16],minFW:[0,16]};
export function validateAssumptions(input){
 if(!input||typeof input!=='object')throw Error('Missing financial constraints');
 const a={};for(const [k,[min,max]] of Object.entries(ranges)){const v=input[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${k}: enter a number from ${min} to ${max}`);a[k]=v;}
 for(const k of ['years','maxSignings','minGK','minDF','minMF','minFW'])if(!Number.isInteger(a[k]))throw Error(`${k}: use a whole number`);
 if(a.reserve>a.capital)throw Error('Cash reserve cannot exceed lifetime capital');
 if(!['score','npv','downside'].includes(input.objective))throw Error('Choose a supported objective');
 a.objective=input.objective;return a;
}
export function validateCandidates(input){
 if(!Array.isArray(input)||input.length>MAX_CANDIDATES)throw Error('Use a shortlist of at most 16 candidates');
 const ids=new Set();return input.map((c,i)=>{
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!/^[-a-zA-Z0-9_]{1,50}$/.test(c.id)||ids.has(c.id))throw Error(`Candidate ${i+1}: invalid or duplicate identifier`);ids.add(c.id);
  if(typeof c.name!=='string'||!c.name.trim()||c.name.length>80)throw Error(`Candidate ${i+1}: enter a name of 1–80 characters`);
  if(!POSITIONS.includes(c.position)||typeof c.enabled!=='boolean')throw Error(`Candidate ${i+1}: invalid role or availability`);
  const row={id:c.id,name:c.name.trim(),position:c.position,enabled:c.enabled};
  for(const k of ['fee','wage','revenue','resale','score']){const max=k==='score'?100:1e8;if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<0||c[k]>max)throw Error(`${c.name}: ${k} must be between 0 and ${max}`);row[k]=c[k];}return row;
 });
}
function flowsFor(a,c){
 const initial=c.fee*(1+a.agent/100),wages=Array.from({length:a.years},(_,i)=>c.wage*(1+a.inflation/100)**i);
 const flows=(rev,resale)=>[-initial,...wages.map((w,i)=>rev-w+(i===a.years-1?resale:0))];
 const base=flows(c.revenue,c.resale),downside=flows(c.revenue*(1-a.downRevenue/100),c.resale*(1-a.haircut/100)),upside=flows(c.revenue*(1+a.upRevenue/100),c.resale*(1+a.upResale/100));
 return {...c,initial,wages,total:initial+wages.reduce((s,v)=>s+v,0),base,downside,upside,npv:npv(base,a.discount/100),downsideNpv:npv(downside,a.discount/100),upsideNpv:npv(upside,a.discount/100)};
}
export function candidateEconomics(input,c){const a=validateAssumptions(input);return flowsFor(a,validateCandidates([c])[0]);}
const sum=(rows,key,length)=>Array.from({length},(_,i)=>rows.reduce((s,r)=>s+r[key][i],0));
export function evaluatePortfolio(input,candidates,ids){
 const a=validateAssumptions(input),list=validateCandidates(candidates);
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Select unique candidate identifiers');
 const selected=ids.map(id=>{const c=list.find(c=>c.id===id);if(!c||!c.enabled)throw Error('Selected candidate is missing or unavailable');return flowsFor(a,c);});
 const base=sum(selected,'base',a.years+1),downside=sum(selected,'downside',a.years+1),upside=sum(selected,'upside',a.years+1),wages=sum(selected,'wages',a.years);
 const initial=selected.reduce((s,c)=>s+c.initial,0),total=selected.reduce((s,c)=>s+c.total,0),score=selected.reduce((s,c)=>s+c.score,0);
 let cumulative=0,peakFunding=0;for(const v of downside){cumulative+=v;peakFunding=Math.max(peakFunding,-cumulative);}
 const result={ids:[...ids],names:selected.map(c=>c.name),count:selected.length,initial,total,wages,score,base,downside,upside,npv:npv(base,a.discount/100),downsideNpv:npv(downside,a.discount/100),upsideNpv:npv(upside,a.discount/100),peakFunding,uncommittedCapital:a.capital-total,spendableHeadroom:a.capital-a.reserve-total,positions:Object.fromEntries(POSITIONS.map(p=>[p,selected.filter(c=>c.position===p).length]))};
 result.constraints=constraintStatus(a,result);result.feasible=result.constraints.every(c=>c.passed);return result;
}
const EPS=.00001;
export function constraintStatus(a,r){return [
 {name:'Transfer + agent budget',actual:r.initial,limit:a.budget,passed:r.initial<=a.budget+EPS,unit:'EUR'},
 {name:'Highest annual wage bill',actual:Math.max(0,...r.wages),limit:a.wageCap,passed:r.wages.every(v=>v<=a.wageCap+EPS),unit:'EUR'},
 {name:'Gross commitments after reserve',actual:r.total,limit:a.capital-a.reserve,passed:r.total<=a.capital-a.reserve+EPS,unit:'EUR'},
 {name:'Maximum signings',actual:r.count,limit:a.maxSignings,passed:r.count<=a.maxSignings,unit:'count'},
 {name:'Minimum base NPV',actual:r.npv,limit:a.minNpv,passed:r.npv+EPS>=a.minNpv,unit:'EUR',minimum:true},
 {name:'Maximum downside NPV loss',actual:Math.max(0,-r.downsideNpv),limit:a.maxDownsideLoss,passed:r.downsideNpv+EPS>=-a.maxDownsideLoss,unit:'EUR'},
 ...POSITIONS.map(p=>({name:`Minimum ${p} signings`,actual:r.positions[p],limit:a['min'+p],passed:r.positions[p]>=a['min'+p],unit:'count',minimum:true}))
 ];}
const primary=(a,r)=>a.objective==='score'?r.score:a.objective==='downside'?r.downsideNpv:r.npv;
export function rankPortfolios(a,x,y){return primary(a,y)-primary(a,x)||y.downsideNpv-x.downsideNpv||y.npv-x.npv||x.initial-y.initial||x.ids.join('|').localeCompare(y.ids.join('|'));}
export function optimize(input,candidates,{limit=5}={}){
 const a=validateAssumptions(input),list=validateCandidates(candidates),active=list.filter(c=>c.enabled).map(c=>flowsFor(a,c));
 if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Invalid comparison count');
 // Depth-first enumeration visits every subset. Only monotonic cost/count violations prune.
 const results=[];let evaluated=0,feasibleCount=0,pruned=0;
 const positions={GK:0,DF:0,MF:0,FW:0},wages=Array(a.years).fill(0),base=Array(a.years+1).fill(0),downside=Array(a.years+1).fill(0),upside=Array(a.years+1).fill(0),ids=[];
 function visit(index,initial,total,score){
  if(initial>a.budget+EPS||total>a.capital-a.reserve+EPS||wages.some(w=>w>a.wageCap+EPS)||ids.length>a.maxSignings){pruned++;return;}
  if(index===active.length){
   evaluated++;
   if(POSITIONS.some(p=>positions[p]<a['min'+p]))return;
   const n=npv(base,a.discount/100),d=npv(downside,a.discount/100);
   if(n+EPS<a.minNpv||d+EPS< -a.maxDownsideLoss)return;
   feasibleCount++;
   const item={ids:[...ids],score,npv:n,downsideNpv:d,initial};results.push(item);results.sort((x,y)=>rankPortfolios(a,x,y));if(results.length>limit)results.pop();return;
  }
  visit(index+1,initial,total,score);
  const c=active[index];ids.push(c.id);positions[c.position]++;
  for(let j=0;j<=a.years;j++){base[j]+=c.base[j];downside[j]+=c.downside[j];upside[j]+=c.upside[j];if(j<a.years)wages[j]+=c.wages[j];}
  visit(index+1,initial+c.initial,total+c.total,score+c.score);
  for(let j=0;j<=a.years;j++){base[j]-=c.base[j];downside[j]-=c.downside[j];upside[j]-=c.upside[j];if(j<a.years)wages[j]-=c.wages[j];}positions[c.position]--;ids.pop();
 }
 visit(0,0,0,0);
 return {version:VERSION,financeVersion:MODEL_VERSION,method:'Exact enumeration of all available candidate subsets with monotonic cost pruning',objective:a.objective,assumptions:a,candidates:list,activeCount:active.length,possibleSubsets:2**active.length,evaluated,pruned,feasibleCount,portfolios:results.map(r=>evaluatePortfolio(a,list,r.ids)),noFeasibleReason:feasibleCount?null:'No combination meets all constraints. Review required roles, budgets, minimum NPV and permitted downside loss.'};
}
export function parseWorkspace(value){
 if(!value||value.schema!=='lanova-optimizer-v2')throw Error('This is not a LANOVA V2 workspace');
 return {schema:'lanova-optimizer-v2',assumptions:validateAssumptions(value.assumptions),candidates:validateCandidates(value.candidates)};
}
