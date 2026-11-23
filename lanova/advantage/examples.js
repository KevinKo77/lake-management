/**
 * LANOVA Advantage Lab — starting points. Every example is ILLUSTRATIVE and ANONYMOUS: invented organisations and
 * invented figures, chosen to be plausible in order of magnitude only. They describe no real club, budget, wage or
 * athlete. Nothing below is a result: every output is calculated from these inputs when the example is loaded.
 */
import {SCHEMA} from './lab.js';

const opt = (id, name, category, o) => ({id, name, category, upfrontType: 'expense', usefulLifeMonths: null, startMonth: 0, commitmentMonths: 0, monthlyCost: 0, effectMonths: 0,
  monthlyGain: 0, gainMonths: 12, shortTermScore: null, longTermScore: null, risk: null, confidence: 'low', ...o});
const model = o => ({schema: SCHEMA, fictional: true, asOf: '2026-11-23', startMonth: '2027-01', currency: 'EUR', objective: 'immediate', ...o});

/** A neutral, empty workspace: no organisation imposed, no option. */
export function blank() {
  return {schema: SCHEMA, fictional: false, asOf: '2026-11-23', label: 'My organisation', sport: '', structure: '', startMonth: '2027-01', horizonMonths: 24, currency: 'EUR', objective: 'immediate',
    finance: {openingCash: null, annualRevenue: null, annualOperatingCosts: null, minimumCash: null, decisionBudget: null, downsideRevenuePct: 10}, options: []};
}
export const newOption = n => opt(`option-${n}`, `Option ${n}`, '', {upfront: 0, monthlyCost: 0, commitmentMonths: 12, monthlyGain: null});

export const EXAMPLES = {
  amateur: {
    title: 'Example 1 · Amateur rugby club', text: 'Volunteer-run club, about €180,000 a year, choosing how to use €25,000 saved over three seasons.',
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
    title: 'Example 2 · Semi-professional basketball organisation', text: 'Second-tier club, about €2.4M a year, comparing staff, academy, facility and squad options.',
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
    title: 'Example 3 · Professional ice hockey organisation', text: 'Top-flight organisation, about €19M a year, testing a training centre, data, medical and roster options over 36 months.',
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
