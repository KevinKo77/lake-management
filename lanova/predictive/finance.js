/** Historical model probabilities + explicitly analyst-supplied promotion economics. */
import {simulate,strategies,validate} from '../lanova-demo/model.js';
import {npv} from '../src/finance.js';
import {validateHistoricalPrediction} from './inference.js';
export function promotionEconomics(input,row,terms,{passed=false}={}){
 if(!passed)throw Error('Historical evaluation gate has not passed');
 validateHistoricalPrediction(row);const a=validate(input);
 if(!terms||!Number.isFinite(terms.promotionUplift)||terms.promotionUplift<0||terms.promotionUplift>1e8||!Number.isFinite(terms.reinvest)||terms.reinvest<0||terms.reinvest>1)throw Error('Invalid analyst promotion economics');
 const upliftFlows=[0,...Array.from({length:a.years},(_,i)=>i===0?0:terms.promotionUplift)];
 const upliftPv=npv(upliftFlows,a.discount/100);const p=row.probability;
 // Policy envelope is capped by existing lifetime cash, not an assertion that future receipts are available now.
 const policyBudget=Math.min(a.capital,a.budget+p*terms.reinvest*upliftPv);
 const rows=strategies.map(s=>{const r=simulate({...a,budget:policyBudget},s);const promoted=r.base.map((f,i)=>f+upliftFlows[i]);
 const promotedNpv=npv(promoted,a.discount/100),stayNpv=r.npv;
 const weighted=prob=>prob*promotedNpv+(1-prob)*stayNpv;
 return {...r,promotedFlows:promoted,promotedNpv,stayNpv,expectedNpv:weighted(p),conservativeExpectedNpv:weighted(row.interval[0]),optimisticExpectedNpv:weighted(row.interval[1]),economicLossWeight:p*Number(promotedNpv<0)+(1-p)*Number(stayNpv<0),downsideNpv:r.downsideNpv,allocationAllowed:r.feasible&&weighted(p)>=0};});
 return {historical:true,financialAssumptionsFictional:true,probability:p,probabilityRange:[...row.interval],policyBudget,expectedAnnualPromotionUplift:p*terms.promotionUplift,conservativeAnnualPromotionUplift:row.interval[0]*terms.promotionUplift,upliftPv,rows};
}
export function historicalAllocation(input,row,terms,gate,id){const e=promotionEconomics(input,row,terms,gate);const r=e.rows.find(r=>r.id===id);if(!r?.allocationAllowed)throw Error('Allocation fails capital limits or nonnegative expected-NPV policy');return {historical:true,fictionalFinancials:true,club:row.club,season:row.season,cutoff:row.cutoff,probability:row.probability,interval:row.interval,terms:{...terms},assumptions:{...input},strategy:r,uncommittedLifetimeCapital:input.capital-r.total};}
