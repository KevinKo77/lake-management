/**
 * LANOVA Advantage Lab — starting points. Every example is ILLUSTRATIVE and ANONYMOUS: invented organisations and
 * invented figures, chosen to be plausible in order of magnitude only. They describe no real club, budget, wage or
 * athlete. Nothing below is a result: every output is calculated from these inputs when the example is loaded.
 */
import {SCHEMA, SCHEMA_V0, migrate} from './lab.js';

const opt = (id, name, category, o) => ({id, name, category, upfrontType: 'expense', usefulLifeMonths: null, startMonth: 0, commitmentMonths: 0, monthlyCost: 0, effectMonths: 0,
  monthlyGain: 0, gainMonths: 12, shortTermScore: null, longTermScore: null, risk: null, confidence: 'low', ...o});
// Examples 1–3 are written in the v0 form and migrated (identical results); example 4 uses the v1 features directly.
const model = o => migrate({schema: SCHEMA_V0, fictional: true, asOf: '2026-11-23', startMonth: '2027-01', currency: 'EUR', objective: 'immediate', ...o});

/** A neutral, empty workspace: no organisation imposed, no option. */
export function blank() {
  return migrate({schema: SCHEMA_V0, fictional: false, asOf: '2026-11-23', label: 'My organisation', sport: '', structure: '', startMonth: '2027-01', horizonMonths: 24, currency: 'EUR', objective: 'immediate',
    finance: {openingCash: null, annualRevenue: null, annualOperatingCosts: null, minimumCash: null, decisionBudget: null, downsideRevenuePct: 10}, options: []});
}
// A v1 option with every field explicit (project or signing).
const v1 = (id, name, category, o) => ({id, name, category, kind: 'project', upfront: 0, upfrontType: 'expense', usefulLifeMonths: null, instalments: 1, instalmentEveryMonths: 1, startMonth: 0, monthlyCost: 0, costType: 'operating',
  commitmentMonths: 0, effectMonths: 0, monthlyGain: 0, gainMonths: 12, shortTermScore: null, longTermScore: null, risk: null, confidence: 'low', mandatory: false, requires: [], exclusiveGroup: '', ...o});
export const newOption = n => opt(`option-${n}`, `Option ${n}`, '', {upfront: 0, monthlyCost: 0, commitmentMonths: 12, monthlyGain: null, kind: 'project', costType: 'operating', mandatory: false, requires: [], exclusiveGroup: '', instalments: 1, instalmentEveryMonths: 1});

export const EXAMPLES = {
  amateur: {
    title: 'Rugby', text: 'Amateur, volunteer-run club, about €180,000 a year, choosing how to use €25,000 saved over three seasons.',
    make: () => model({label: 'Illustrative amateur rugby club (anonymous; all figures invented)', sport: 'Rugby union', structure: 'Amateur club (volunteer-run)', horizonMonths: 24,
      finance: {openingCash: 48_000, annualRevenue: 182_000, annualOperatingCosts: 176_000, minimumCash: 15_000, decisionBudget: 25_000, downsideRevenuePct: 15},
      options: [
        opt('coach', 'Part-time qualified head coach', 'Staff', {upfront: 0, monthlyCost: 1_400, commitmentMonths: 24, effectMonths: 2, shortTermScore: 7, longTermScore: 6, risk: 'low', confidence: 'medium'}),
        opt('lights', 'Floodlights on the training pitch', 'Facilities', {upfront: 22_000, upfrontType: 'capital', usefulLifeMonths: 180, monthlyCost: 150, commitmentMonths: 24, monthlyGain: 450, gainMonths: 24, effectMonths: 4, shortTermScore: 4, longTermScore: 7, risk: 'medium', confidence: 'medium'}),
        opt('youth', 'Under-12 and under-14 sections', 'Development', {upfront: 3_500, monthlyCost: 600, commitmentMonths: 24, monthlyGain: 700, gainMonths: 24, effectMonths: 6, shortTermScore: 1, longTermScore: 8, risk: 'low', confidence: 'medium'}),
        opt('minibus', 'Club minibus', 'Logistics', {upfront: 24_000, upfrontType: 'capital', usefulLifeMonths: 96, monthlyCost: 250, commitmentMonths: 24, effectMonths: 0, shortTermScore: 3, longTermScore: 3, risk: 'medium', confidence: 'high'}),
        opt('physio', 'Physiotherapy partnership', 'Medical', {upfront: 0, monthlyCost: 900, commitmentMonths: 12, effectMonths: 1, shortTermScore: 5, longTermScore: 3, risk: 'low', confidence: 'low'}),
        opt('signings', 'Two experienced players (expenses paid)', 'Squad', {upfront: 2_000, monthlyCost: 1_900, commitmentMonths: 10, effectMonths: 0, shortTermScore: 7, longTermScore: 1, risk: 'high', confidence: 'low'}),
      ]}),
  },
  semipro: {
    title: 'Basketball', text: 'Semi-professional, second-tier club, about €2.4M a year, comparing staff, academy, facility and squad options.',
    make: () => model({label: 'Illustrative semi-professional basketball organisation (anonymous; all figures invented)', sport: 'Basketball', structure: 'Semi-professional club', horizonMonths: 24, objective: 'development',
      finance: {openingCash: 520_000, annualRevenue: 2_400_000, annualOperatingCosts: 2_330_000, minimumCash: 250_000, decisionBudget: 300_000, downsideRevenuePct: 12},
      options: [
        opt('analyst', 'Performance analyst and video tools', 'Staff', {upfront: 18_000, monthlyCost: 4_200, commitmentMonths: 24, effectMonths: 2, shortTermScore: 6, longTermScore: 6, risk: 'low', confidence: 'medium'}),
        opt('academy', 'Academy with a local school', 'Development', {upfront: 60_000, monthlyCost: 9_000, commitmentMonths: 36, monthlyGain: 4_000, gainMonths: 36, effectMonths: 6, shortTermScore: 1, longTermScore: 9, risk: 'medium', confidence: 'medium'}),
        opt('hospitality', 'Courtside hospitality upgrade', 'Facilities', {upfront: 240_000, upfrontType: 'capital', usefulLifeMonths: 120, monthlyCost: 2_000, commitmentMonths: 24, monthlyGain: 14_000, gainMonths: 24, effectMonths: 4, shortTermScore: 0, longTermScore: 4, risk: 'medium', confidence: 'medium'}),
        opt('guard', 'Experienced guard, two-season contract', 'Squad', {upfront: 25_000, monthlyCost: 16_000, commitmentMonths: 20, effectMonths: 0, monthlyGain: null, shortTermScore: 8, longTermScore: 2, risk: 'high', confidence: 'low'}),
        opt('scisci', 'Sports science and injury prevention', 'Medical', {upfront: 35_000, upfrontType: 'capital', usefulLifeMonths: 60, monthlyCost: 3_500, commitmentMonths: 24, effectMonths: 3, shortTermScore: 5, longTermScore: 5, risk: 'low', confidence: 'medium'}),
        opt('scouting', 'Regional scouting network', 'Recruitment', {upfront: 5_000, monthlyCost: 2_800, commitmentMonths: 24, effectMonths: 9, shortTermScore: 2, longTermScore: 6, risk: 'low', confidence: 'low'}),
      ]}),
  },
  pro: {
    title: 'Hockey', text: 'Professional, top-flight organisation, about €19M a year, testing a training centre, data, medical and roster options over 36 months.',
    make: () => model({label: 'Illustrative professional ice hockey organisation (anonymous; all figures invented)', sport: 'Ice hockey', structure: 'Professional club', horizonMonths: 36, objective: 'financial',
      finance: {openingCash: 3_200_000, annualRevenue: 19_000_000, annualOperatingCosts: 18_600_000, minimumCash: 1_500_000, decisionBudget: 2_500_000, downsideRevenuePct: 6},
      options: [
        opt('centre', 'Training centre extension', 'Facilities', {upfront: 2_400_000, upfrontType: 'capital', usefulLifeMonths: 300, monthlyCost: 18_000, commitmentMonths: 36, monthlyGain: 25_000, gainMonths: 36, effectMonths: 10, shortTermScore: 3, longTermScore: 8, risk: 'medium', confidence: 'medium'}),
        opt('data', 'Data and decision-support department', 'Staff', {upfront: 120_000, monthlyCost: 32_000, commitmentMonths: 36, effectMonths: 4, monthlyGain: null, shortTermScore: 5, longTermScore: 7, risk: 'low', confidence: 'medium'}),
        opt('medical', 'Medical and recovery unit', 'Medical', {upfront: 450_000, upfrontType: 'capital', usefulLifeMonths: 96, monthlyCost: 21_000, commitmentMonths: 36, effectMonths: 3, shortTermScore: 6, longTermScore: 6, risk: 'low', confidence: 'medium'}),
        opt('star', 'Marquee forward, three-season contract', 'Squad', {upfront: 600_000, monthlyCost: 95_000, commitmentMonths: 36, monthlyGain: 35_000, gainMonths: 36, effectMonths: 0, shortTermScore: 8, longTermScore: 3, risk: 'high', confidence: 'low'}),
        opt('arena', 'Arena hospitality and digital ticketing', 'Commercial', {upfront: 900_000, upfrontType: 'capital', usefulLifeMonths: 120, monthlyCost: 12_000, commitmentMonths: 36, monthlyGain: 70_000, gainMonths: 36, effectMonths: 6, shortTermScore: 0, longTermScore: 4, risk: 'medium', confidence: 'medium'}),
        opt('juniors', 'Junior programme and affiliate team', 'Development', {upfront: 150_000, monthlyCost: 40_000, commitmentMonths: 36, monthlyGain: 6_000, gainMonths: 36, effectMonths: 12, shortTermScore: 1, longTermScore: 9, risk: 'medium', confidence: 'low'}),
        opt('veterans', 'Two experienced depth players', 'Squad', {upfront: 80_000, monthlyCost: 60_000, commitmentMonths: 24, effectMonths: 0, shortTermScore: 6, longTermScore: 1, risk: 'medium', confidence: 'low'}),
      ]}),
  },
};

/**
 * Worked example of the V1 financial workflow (anonymous; every figure invented). Not one of the sport selectors
 * (which stay Rugby, Basketball, Hockey): it is offered separately, as a worked example.
 */
export const WORKED = {
    title: 'Worked example: the full financial decision workflow', sport: 'Football', text: 'Semi-professional, third-tier club, about €7.6M a year: two signings, a goalkeeper choice, a training pitch built in instalments, an academy that needs the pitch, and a mandatory licensing upgrade.',
    // Written directly in the v1 schema: dated scenarios, staff costs, signings (Finance engine player decisions with the
    // corrected signing-bonus treatment), instalments, dependencies, an exclusive group and a mandatory decision.
    make: () => ({schema: SCHEMA, fictional: true, asOf: '2026-11-24', label: 'Illustrative semi-professional football club (anonymous; all figures invented)', sport: 'Football', structure: 'Semi-professional club',
      startMonth: '2027-07', horizonMonths: 24, currency: 'EUR', objective: 'immediate',
      finance: {openingCash: 1_500_000, annualRevenue: 7_600_000, annualOperatingCosts: 7_000_000, staffCosts: 4_300_000, minimumCash: 600_000, decisionBudget: 1_400_000},
      scenarios: {downside: {revenuePct: -6, operatingPct: 2, wagePct: 0, fromMonth: 3}, upside: {revenuePct: 5, operatingPct: 0, wagePct: 0, fromMonth: 6}},
      constraints: {downsideMustHold: false},
      options: [
        v1('licence', 'Medical room upgrade for the league licence', 'Compliance', {mandatory: true, upfront: 40_000, monthlyCost: 3_000, commitmentMonths: 24, shortTermScore: 3, longTermScore: 3, risk: 'low', confidence: 'high', monthlyGain: 0}),
        v1('striker', 'Experienced striker, two-season contract', 'Squad', {kind: 'signing', transferFee: 500_000, feeInstalments: 2, agentFee: 50_000, signingBonus: 120_000, contractMonths: 24, monthlyWage: 24_000, employerChargeRate: 0.3,
          shortTermScore: 8, longTermScore: 3, risk: 'high', confidence: 'low', monthlyGain: null, gainMonths: 24}),
        v1('keeper-a', 'Established goalkeeper (free transfer)', 'Squad', {kind: 'signing', transferFee: 0, feeInstalments: 1, agentFee: 20_000, signingBonus: 40_000, contractMonths: 24, monthlyWage: 14_000, employerChargeRate: 0.3,
          exclusiveGroup: 'goalkeeper', shortTermScore: 6, longTermScore: 4, risk: 'medium', confidence: 'medium', monthlyGain: 0}),
        v1('keeper-b', 'Young goalkeeper, three-season contract', 'Squad', {kind: 'signing', transferFee: 150_000, feeInstalments: 1, agentFee: 15_000, signingBonus: 0, contractMonths: 36, monthlyWage: 6_000, employerChargeRate: 0.3,
          exclusiveGroup: 'goalkeeper', shortTermScore: 4, longTermScore: 7, risk: 'medium', confidence: 'medium', monthlyGain: 0}),
        v1('pitch', 'Artificial training pitch, paid in three quarterly instalments', 'Facilities', {upfront: 900_000, upfrontType: 'capital', usefulLifeMonths: 240, instalments: 3, instalmentEveryMonths: 3, monthlyCost: 5_000, commitmentMonths: 24,
          effectMonths: 6, monthlyGain: null, gainRange: {low: 8_000, high: 20_000, basis: 'Two written hire enquiries from local clubs (illustrative)'}, gainMonths: 24, shortTermScore: 2, longTermScore: 7, risk: 'low', confidence: 'medium'}),
        v1('academy', 'Academy programme (needs the pitch)', 'Development', {requires: ['pitch'], upfront: 80_000, monthlyCost: 22_000, costType: 'staff', commitmentMonths: 24, effectMonths: 6, monthlyGain: null, gainMonths: 24,
          shortTermScore: 1, longTermScore: 9, risk: 'medium', confidence: 'low'}),
        v1('analyst', 'Performance analyst', 'Staff', {upfront: 15_000, monthlyCost: 9_500, costType: 'staff', commitmentMonths: 24, effectMonths: 1, shortTermScore: 5, longTermScore: 5, risk: 'low', confidence: 'medium', monthlyGain: 0}),
      ]}),
  };
