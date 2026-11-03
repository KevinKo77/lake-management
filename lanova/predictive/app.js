import {promotionProbability,validateHistoricalPrediction} from './inference.js';
import {promotionEconomics,historicalAllocation} from './finance.js';
import {defaults} from '../lanova-demo/model.js';
import {money,pct,esc} from '../src/format.js';
const $=id=>document.getElementById(id);let evidence,rows,models,current=null,allocation=null;
const stat=(v,label)=>`<div class="stat"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
function selections(changed){
 if(changed==='season'||changed==='stage'){
  const options=rows.filter(r=>r.season===$('season').value&&r.stage===Number($('stage').value)).sort((a,b)=>a.rank-b.rank);
  $('club').innerHTML=options.map(r=>`<option value="${esc(r.club)}">${esc(r.club)} · rank ${r.rank}</option>`).join('');
 }
 render();
}
function render(){try{
 const row=rows.find(r=>r.season===$('season').value&&r.stage===Number($('stage').value)&&r.club===$('club').value);validateHistoricalPrediction(row);
 const inferred=promotionProbability(models[row.season],row.x);if(Math.abs(inferred-row.probability)>1e-10)throw Error('Model/prediction mismatch');
 const a=Object.fromEntries(Object.keys(defaults).map(k=>[k,Number($(k).value)]));const terms={promotionUplift:Number($('promotionUplift').value),reinvest:Number($('reinvest').value)/100};
 for(const input of document.querySelectorAll('input'))if(input.value.trim()==='')throw Error('Complete every financial assumption');
 const financial=promotionEconomics(a,row,terms,evidence.financialIntegrationGate);allocation=null;current={row,a,terms,financial};
 $('status').textContent='Historical test prediction loaded. No current forecast. Financial inputs are fictional.';
 $('estimate').innerHTML=stat(pct(row.probability),'Estimated promotion probability at the historical cutoff')+stat(row.interval.map(pct).join(' – '),'90% bootstrap parameter range; no guaranteed coverage')+stat(pct(row.rankBaseline),'Prior-seasons empirical rank baseline');
 $('lineage').textContent=`${row.club} · ${row.season} · end-of-day cutoff ${row.cutoff} · ${row.played} games played · ${row.points} points · training through ${row.trainingEnd}; calibration ${row.calibrationSeason}. Stage uses completed fixture count, not a precise common matchday. Outcome labels are not inputs.`;
 $('finance-summary').innerHTML=stat(money(financial.expectedAnnualPromotionUplift),'Probability-weighted annual promotion uplift, from year 2')+stat(money(financial.policyBudget),'Initial-outlay policy envelope, capped by lifetime cash')+stat(money(financial.conservativeAnnualPromotionUplift),'Uplift using lower bootstrap probability');
 $('decisions').innerHTML=financial.rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${money(r.stayNpv)}</td><td>${money(r.promotedNpv)}</td><td>${money(r.expectedNpv)}</td><td>${money(r.conservativeExpectedNpv)} / ${money(r.optimisticExpectedNpv)}</td><td>${money(r.downsideNpv)}</td><td>${pct(r.economicLossWeight)}</td><td><button data-id="${r.id}" ${r.allocationAllowed?'':'disabled'}>Simulate allocation</button></td></tr>`).join('');
 $('allocation').textContent='No allocation simulated. Historical probability weighting is a research overlay, not a club recommendation.';
 document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{allocation=historicalAllocation(a,row,terms,evidence.financialIntegrationGate,b.dataset.id);$('allocation').textContent='Fictional allocation: '+allocation.strategy.name+' · Remaining lifetime cash '+money(allocation.uncommittedLifetimeCapital);});
 $('export').disabled=false;
 }catch(e){current=null;allocation=null;$('status').textContent=e.message;$('decisions').innerHTML='';$('finance-summary').innerHTML='';$('estimate').innerHTML='';$('lineage').textContent='';$('allocation').textContent='No valid decision available.';$('export').disabled=true;}}
function renderEvidence(){const h=evidence.holdout;$('evidence-period').textContent=evidence.holdoutSeasons.join(' · ');
 $('metrics').innerHTML=[['Calibrated logistic',h.calibrated],['Raw logistic',h.rawLogistic],['Constant prevalence',h.constant],['Empirical rank baseline',h.rankBaseline]].map(([name,m])=>`<tr><td>${name}</td><td>${m.brier.toFixed(4)}</td><td>${m.logLoss.toFixed(4)}</td><td>${m.auc.toFixed(4)}</td><td>${m.ece.toFixed(4)}</td></tr>`).join('');
 const ci=h.brierDifference90ClusterIntervalVsRank;
 $('evidence-note').textContent=`${h.calibrated.n} club snapshots from ${evidence.holdoutSeasons.length} seasons; the same club-season appears at three stages. Rank-baseline Brier difference, central 90% season-cluster bootstrap range: ${ci.map(x=>x.toFixed(4)).join(' to ')}. Negative favours logistic. This range ${ci[0]<=0&&ci[1]>=0?'includes zero: superiority over rank is not established.':'does not include zero in this small sample.'} Calibration did not improve the pooled scores over raw logistic here. Research integration gate: ${evidence.financialIntegrationGate.passed?'passed the pre-specified engineering thresholds; no independent validation.':'failed; financial use disabled.'}`;
 $('reliability').innerHTML=h.calibrated.reliability.map(b=>`<tr><td>${pct(b.from)} – ${pct(b.to)}</td><td>${b.n}</td><td>${pct(b.meanPrediction)}</td><td>${pct(b.observedRate)}</td></tr>`).join('');
 $('data-audit').innerHTML='<ul>'+evidence.audit.map(a=>`<li>${esc(a.season)}: ${a.accepted?'included, 462 matches':esc(a.reason)}</li>`).join('')+'</ul>';
}
$('export').onclick=()=>{if(!current)return;const payload={kind:'Historical predictive research decision',modelVersion:evidence.modelVersion,historicalPrediction:current.row,financialAssumptions:current.a,promotionEconomics:current.terms,financialResults:current.financial,allocation,evaluation:evidence.holdout,limitations:evidence.scope+' Financial paths are hypothetical; no causal player-impact model.'};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lanova-historical-promotion-decision.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function start(){const load=async path=>{const r=await fetch(path);if(!r.ok)throw Error('Unable to load '+path);return r.json();};[evidence,{rows},models]=await Promise.all([load('artifacts/evaluation.json'),load('artifacts/predictions.json'),load('artifacts/models.json')]);
 if(evidence.schemaVersion!==1||!Array.isArray(rows)||!rows.length)throw Error('Invalid research artifacts');rows.forEach(validateHistoricalPrediction);renderEvidence();
 const seasons=[...new Set(rows.map(r=>r.season))].sort().reverse();$('season').innerHTML=seasons.map(s=>`<option>${s}</option>`).join('');for(const id of ['season','stage','club']){$(id).disabled=false;$(id).onchange=()=>selections(id);}
 document.querySelectorAll('input').forEach(el=>el.oninput=render);selections('season');}
start().catch(e=>{$('status').textContent='Research unavailable: '+e.message;$('export').disabled=true;});
