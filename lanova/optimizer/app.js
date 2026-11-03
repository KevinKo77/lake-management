import {defaults,demoCandidates,MAX_CANDIDATES,POSITIONS,optimize,parseWorkspace} from './model.js';
import {decisionRecord,decisionCsv,decisionHtml} from './report.js';
import {money,esc} from '../src/format.js';
const $=id=>document.getElementById(id),KEY='lanova-optimizer-v2-draft';
const monetary=new Set(['budget','wageCap','capital','reserve','minNpv','maxDownsideLoss']);
let candidates=structuredClone(demoCandidates),result=null,selected=0,saved=[],nextId=1;
function number(el,scale=1){if(!el.value.trim())throw Error('Complete every numeric input');const v=Number(el.value)*scale;if(!Number.isFinite(v))throw Error('Use finite numeric inputs');return v;}
function readInputs(){
 const assumptions=Object.fromEntries(Object.keys(defaults).map(k=>[k,k==='objective'?$(k).value:number($(k),monetary.has(k)?1e6:1)]));
 const list=candidates.map(c=>{const row=$('candidates').querySelector(`[data-row="${c.id}"]`);return {id:c.id,name:row.querySelector('[data-field="name"]').value,position:row.querySelector('[data-field="position"]').value,enabled:row.querySelector('[data-field="enabled"]').checked,...Object.fromEntries(['fee','wage','revenue','resale','score'].map(k=>[k,number(row.querySelector(`[data-field="${k}"]`),k==='score'?1:1e6)]))};});
 return parseWorkspace({schema:'lanova-optimizer-v2',assumptions,candidates:list});
}
function renderCandidates(){
 $('candidates').innerHTML=candidates.map(c=>`<tr data-row="${esc(c.id)}"><td><input type="checkbox" data-field="enabled" aria-label="Include ${esc(c.name)}" ${c.enabled?'checked':''}></td><td><input data-field="name" aria-label="Candidate name" maxlength="80" value="${esc(c.name)}"></td><td><select data-field="position" aria-label="Role for ${esc(c.name)}">${POSITIONS.map(p=>`<option ${c.position===p?'selected':''}>${p}</option>`).join('')}</select></td>${['fee','wage','revenue','resale','score'].map(k=>`<td><input data-field="${k}" aria-label="${esc(({fee:'Transfer fee',wage:'Annual wage',revenue:'Annual incremental revenue',resale:'Terminal resale',score:'Priority score'})[k])} for ${esc(c.name)}${k==='score'?'':' in million euros'}" type="number" min="0" max="100" step="${k==='score'?'1':'0.01'}" value="${c[k]/(k==='score'?1:1e6)}"></td>`).join('')}<td><button data-remove="${esc(c.id)}" class="remove" aria-label="Remove ${esc(c.name)}">×</button></td></tr>`).join('');
 $('candidate-count').textContent=`${candidates.length} / ${MAX_CANDIDATES}`;$('add-candidate').disabled=candidates.length>=MAX_CANDIDATES;
}
function setExportState(enabled){for(const id of ['export-json','export-csv','export-html','print'])$(id).disabled=!enabled;}
function stale(){result=null;selected=0;setExportState(false);$('result-content').hidden=true;$('empty-results').hidden=false;$('empty-results').innerHTML='<span>↗</span><h3>Inputs changed.</h3><p>Run the optimizer to refresh every combination, scenario and constraint.</p>';$('search-proof').textContent='Recalculation required';$('run-status').textContent='Inputs changed — run the optimizer again.';$('error').textContent='';}
function handleError(e){$('error').textContent=e.message;}
function run(){
 try{const workspace=readInputs();candidates=workspace.candidates;result=optimize(workspace.assumptions,candidates);selected=0;$('error').textContent='';
 $('search-proof').textContent=`${result.activeCount} available · ${result.possibleSubsets.toLocaleString()} possible subsets · ${result.feasibleCount.toLocaleString()} feasible`;
 if(!result.portfolios.length){$('empty-results').hidden=false;$('empty-results').innerHTML='<span>∅</span><h3>No feasible combination.</h3><p>'+esc(result.noFeasibleReason)+'</p>';$('result-content').hidden=true;setExportState(false);$('run-status').textContent='Search complete. No combination meets all constraints.';return;}
 $('run-status').textContent='Search complete. Exact optimum within the available shortlist and stated assumptions.';renderResult();
 }catch(e){stale();handleError(e);$('run-status').textContent='Inputs need attention. No decision can be exported.';}
}
function renderResult(){
 const p=result.portfolios[selected],a=result.assumptions;$('empty-results').hidden=true;$('result-content').hidden=false;setExportState(true);
 $('kpis').innerHTML=[['Selected priority',p.score+' pts',`${p.count} signings · ${p.ids.map(id=>result.candidates.find(c=>c.id===id).position).join(' / ')||'No signings'}`],['Base incremental NPV',money(p.npv),'Year-end discounted cash flows'],['Downside NPV',money(p.downsideNpv),`Revenue −${a.downRevenue}% · resale −${a.haircut}%`],['Uncommitted lifetime cash',money(p.uncommittedCapital),`${money(a.reserve)} protected reserve included`]].map(([label,value,note])=>`<div class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
 $('selection-note').textContent=`Inspecting combination ${selected+1}: ${p.names.join(' + ')||'No signings'}. Objective: ${({'score':'highest total analyst priority','npv':'highest base NPV','downside':'highest downside NPV'})[a.objective]}. Financial values are assumptions, not forecasts.`;
 $('combinations').innerHTML=result.portfolios.map((r,i)=>`<tr class="${selected===i?'selected':''}"><td><b>${i===0?'01 / Optimal':String(i+1).padStart(2,'0')+' / Alternative'}</b><span class="names">${esc(r.names.join(' + ')||'No signings')}</span></td><td>${r.score}</td><td>${money(r.initial)}</td><td>${money(r.total)}</td><td class="${r.npv<0?'negative':'positive'}">${money(r.npv)}</td><td class="${r.downsideNpv<0?'negative':'positive'}">${money(r.downsideNpv)}</td><td>${money(r.upsideNpv)}</td><td><button data-inspect="${i}" aria-label="Inspect combination ${i+1}" ${selected===i?'disabled':''}>${selected===i?'Selected':'Inspect'}</button></td></tr>`).join('');
 const scenarios=[['Downside',p.downsideNpv],['Base',p.npv],['Upside',p.upsideNpv]],max=Math.max(1,...scenarios.map(([,v])=>Math.abs(v)));
 $('scenario-chart').innerHTML=scenarios.map(([name,value])=>{const w=Math.abs(value)/max*49;return `<div class="scenario"><div><b>${name}</b><span>${money(value)}</span></div><div class="bar-track" role="img" aria-label="${name} NPV ${esc(money(value))}"><span class="zero"></span><span class="bar ${value<0?'loss':'gain'}" style="left:${value<0?50-w:50}%;width:${w}%"></span></div></div>`;}).join('');
 $('constraint-audit').innerHTML=p.constraints.map(c=>`<div class="audit"><span class="pass" aria-label="Passed">✓</span><span>${esc(c.name)}<small>${c.unit==='EUR'?money(c.actual):c.actual} ${c.minimum?'≥':'≤'} ${c.unit==='EUR'?money(c.limit):c.limit}</small></span></div>`).join('');
 $('cash-flows').innerHTML=p.base.map((v,i)=>`<tr><th>${i===0?'0 / Upfront':i}</th><td>${money(v)}</td><td>${money(p.downside[i])}</td><td>${money(p.upside[i])}</td><td>${i?money(p.wages[i-1]):'—'}</td></tr>`).join('');$('pin').disabled=saved.length>=3;
}
function renderSaved(){
 $('saved-comparisons').innerHTML=saved.length?saved.map((s,i)=>`<article class="saved"><div class="saved-top"><span>DECISION ${i+1}</span><button data-delete-saved="${i}" aria-label="Remove saved decision ${i+1}">×</button></div><h3>${esc(s.portfolio.names.join(' + ')||'No signings')}</h3><p>${esc(s.label)}</p><dl><div><dt>Base NPV</dt><dd>${money(s.portfolio.npv)}</dd></div><div><dt>Downside NPV</dt><dd>${money(s.portfolio.downsideNpv)}</dd></div><div><dt>Upside NPV</dt><dd>${money(s.portfolio.upsideNpv)}</dd></div><div><dt>Gross commitments</dt><dd>${money(s.portfolio.total)}</dd></div><div><dt>Analyst priority</dt><dd>${s.portfolio.score} pts</dd></div></dl><p class="fine">${s.assumptions.years} years · transfer cap ${money(s.assumptions.budget)} · capital ${money(s.assumptions.capital)} · ${esc(s.assumptions.objective)} objective</p><details><summary>Frozen assumptions</summary><pre>${esc(JSON.stringify({assumptions:s.assumptions,candidates:s.candidates},null,2))}</pre></details></article>`).join(''):'<p class="fine">No saved comparisons yet. Save a feasible combination above, change assumptions, rerun and save another. Up to three decision snapshots.</p>';
 $('clear-comparisons').disabled=!saved.length;if(result?.portfolios.length)$('pin').disabled=saved.length>=3;
}
function populate(workspace){for(const [k,v] of Object.entries(workspace.assumptions))$(k).value=monetary.has(k)?v/1e6:v;candidates=structuredClone(workspace.candidates);renderCandidates();stale();}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('run').onclick=run;
for(const key of Object.keys(defaults))$(key).addEventListener(key==='objective'?'change':'input',stale);
$('candidates').addEventListener('input',stale);$('candidates').addEventListener('change',stale);
$('candidates').addEventListener('click',event=>{const b=event.target.closest('[data-remove]');if(!b)return;try{candidates=readInputs().candidates.filter(c=>c.id!==b.dataset.remove);renderCandidates();stale();}catch(e){handleError(e);}});
$('add-candidate').onclick=()=>{try{const w=readInputs();if(w.candidates.length>=MAX_CANDIDATES)throw Error('Shortlist limit reached');let id;do{id='candidate-'+nextId++;}while(w.candidates.some(c=>c.id===id));candidates=[...w.candidates,{id,name:'New analyst candidate',position:'MF',fee:1000000,wage:300000,revenue:200000,resale:1500000,score:70,enabled:true}];renderCandidates();stale();}catch(e){handleError(e);}};
$('combinations').addEventListener('click',e=>{const b=e.target.closest('[data-inspect]');if(b&&result){selected=Number(b.dataset.inspect);renderResult();}});
$('pin').onclick=()=>{if(!result?.portfolios[selected]||saved.length>=3)return;saved.push(structuredClone({label:new Date().toLocaleString('en-GB'),assumptions:result.assumptions,candidates:result.candidates,portfolio:result.portfolios[selected]}));renderSaved();$('run-status').textContent='Decision frozen in comparison. Change inputs and rerun to compare another.';};
$('saved-comparisons').addEventListener('click',e=>{const b=e.target.closest('[data-delete-saved]');if(b){saved.splice(Number(b.dataset.deleteSaved),1);renderSaved();}});
$('clear-comparisons').onclick=()=>{saved=[];renderSaved();};
$('save-draft').onclick=()=>{try{localStorage.setItem(KEY,JSON.stringify(readInputs()));$('run-status').textContent='Inputs saved in this browser only. Results are recomputed when loaded.';$('error').textContent='';}catch(e){handleError(e);}};
$('load-draft').onclick=()=>{try{const raw=localStorage.getItem(KEY);if(!raw)throw Error('No saved LANOVA V2 inputs in this browser');populate(parseWorkspace(JSON.parse(raw)));run();}catch(e){handleError(e);}};
$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async()=>{try{const file=$('import-file').files[0];if(!file)return;if(file.size>256000)throw Error('Import limit is 256 KB');populate(parseWorkspace(JSON.parse(await file.text())));run();}catch(e){handleError(e);}finally{$('import-file').value='';}};
$('reset').onclick=()=>{populate({assumptions:defaults,candidates:demoCandidates});run();};
for(const [id,name,type,build] of [['export-json','lanova-v2-decision.json','application/json',r=>JSON.stringify(r,null,2)],['export-csv','lanova-v2-decision.csv','text/csv',decisionCsv],['export-html','lanova-v2-report.html','text/html',decisionHtml]])$(id).onclick=()=>{try{download(name,build(decisionRecord(result,selected,saved)),type);}catch(e){handleError(e);}};
$('print').onclick=()=>window.print();
renderCandidates();renderSaved();run();
