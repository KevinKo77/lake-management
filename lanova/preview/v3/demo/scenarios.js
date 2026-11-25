/**
 * "Try LANOVA" demonstration scenarios. ALL CLUBS, PLAYERS AND NUMBERS ARE FICTIONAL.
 * Player names are invented labels; expected points are illustrative analyst estimates, not real performance data.
 * Each scenario is a complete input for the unchanged engine (recruitment/engine) in the canonical schema.
 * Verified outputs: v3/demo/verified-outputs.json (engine + exhaustive search + independent spreadsheet MILP).
 *
 * What-if adjustments are data, not code: `set` replaces context fields, `add` adds to numeric context fields
 * (per-season arrays element-wise).
 */
const loan = (o) => ({dealType: 'loan', instalments: [1], ...o});

export const SCENARIOS = [
  {
    id: 'small-club',
    club: 'Atlético Rivermar',
    tier: 'Fictional third-division club',
    headline: 'A small club with a limited transfer budget',
    decision: 'Which of 8 shortlisted players should Rivermar sign this summer to strengthen defence and attack, with only €350,000 to spend at signing?',
    scenario: {
      schema: 'lanova-recruitment-v2', fictional: true, label: 'Atlético Rivermar (FICTIONAL) — limited budget',
      context: {
        horizon: 3, discountRate: 0.1, transferBudget: 350000,
        squadCostLimit: [3200000, 3200000, 3300000], committedSquadCost: [2650000, 2100000, 1500000],
        openingCash: 900000, operatingCashFlow: [-100000, 50000, 100000], minCash: 0, protectedReserve: 200000,
        lifetimeCapital: null, maxDownsideLoss: null,
        currentSquadSize: 21, maxSquadSize: 25, currentNonEU: 1, maxNonEU: 2, maxSignings: 3,
        positionNeeds: {CB: 1, ST: 1}, objective: 'blended', valuePerPoint: 60000, samePositionFactor: 0.5, minPortfolioNpv: null,
        stress: {resaleHaircut: 0.5, revenueHaircut: 0.3, upsideResale: 0.2, upsideRevenue: 0.2},
      },
      candidates: [
        {id: 'r-cb-veteran', name: 'Centre-back R1 · free agent (31)', position: 'CB', age: 31, dealType: 'free', agentFee: 25000, signingBonus: 30000, contractYears: 2, wage: 140000, points: 1.6, exitValue: 0},
        {id: 'r-cb-young', name: 'Centre-back R2 · transfer (22)', position: 'CB', age: 22, dealType: 'permanent', fee: 220000, instalments: [0.5, 0.5], agentFee: 20000, contractYears: 3, wage: 90000, wageGrowth: 0.05, points: 1.2, exitSeason: 3, exitValue: 400000, saleCostPct: 0.05},
        {id: 'r-cb-loan', name: 'Centre-back R3 · loan (20)', position: 'CB', age: 20, ...loan({fee: 15000, contractYears: 1, wage: 100000, wageShare: 0.6, points: 1.0})},
        {id: 'r-st-experienced', name: 'Striker R4 · transfer (29)', position: 'ST', age: 29, dealType: 'permanent', fee: 180000, agentFee: 20000, signingBonus: 20000, contractYears: 2, wage: 170000, points: 2.0, exitValue: 0},
        {id: 'r-st-loan', name: 'Striker R5 · loan (21)', position: 'ST', age: 21, ...loan({fee: 40000, contractYears: 1, wage: 160000, wageShare: 0.5, points: 1.5})},
        {id: 'r-st-free', name: 'Striker R6 · free agent (33)', position: 'ST', age: 33, dealType: 'free', agentFee: 15000, signingBonus: 25000, contractYears: 1, wage: 150000, points: 1.3, exitValue: 0},
        {id: 'r-w-young', name: 'Winger R7 · transfer (20)', position: 'W', age: 20, nonEU: true, dealType: 'permanent', fee: 120000, agentFee: 12000, contractYears: 3, wage: 60000, wageGrowth: 0.05, points: 0.8, exitSeason: 3, exitValue: 350000, sellOnPct: 0.1, saleCostPct: 0.05},
        {id: 'r-fb-free', name: 'Full-back R8 · free agent (27)', position: 'FB', age: 27, dealType: 'free', agentFee: 10000, contractYears: 2, wage: 85000, points: 0.9, exitValue: 0},
      ],
      modes: {},
    },
    whatIfs: [
      {id: 'budget-cut', label: 'The board cuts the signing budget to €150,000', set: {transferBudget: 150000}},
      {id: 'loan-falls-through', label: 'The loan of Striker R5 falls through', exclude: ['r-st-loan']},
    ],
  },
  {
    id: 'promotion',
    club: 'CF Valdemar',
    tier: 'Fictional second-division club',
    headline: 'A promotion-chasing club balancing sporting gain and wages',
    decision: 'Which of 8 shortlisted players should Valdemar sign to push for promotion, without letting the wage bill run away in later seasons?',
    scenario: {
      schema: 'lanova-recruitment-v2', fictional: true, label: 'CF Valdemar (FICTIONAL) — promotion push',
      context: {
        horizon: 3, discountRate: 0.1, transferBudget: 2500000,
        squadCostLimit: [14000000, 14000000, 14500000], committedSquadCost: [12100000, 10200000, 8300000],
        openingCash: 5000000, operatingCashFlow: [-600000, 300000, 600000], minCash: 0, protectedReserve: 1000000,
        lifetimeCapital: 9000000, maxDownsideLoss: 4000000,
        currentSquadSize: 22, maxSquadSize: 25, currentNonEU: 2, maxNonEU: 3, maxSignings: 3,
        positionNeeds: {ST: 1}, objective: 'blended', valuePerPoint: 250000, samePositionFactor: 0.5, minPortfolioNpv: null,
        stress: {resaleHaircut: 0.5, revenueHaircut: 0.3, upsideResale: 0.2, upsideRevenue: 0.2},
      },
      candidates: [
        {id: 'v-st-star', name: 'Striker V1 · transfer (26)', position: 'ST', age: 26, nonEU: true, dealType: 'permanent', fee: 1800000, instalments: [0.4, 0.3, 0.3], agentFee: 180000, signingBonus: 150000, contractYears: 4, wage: 900000, wageGrowth: 0.04, points: 4.2, exitSeason: 3, exitValue: 2200000, exitValueDownside: 900000, sellOnPct: 0.1, saleCostPct: 0.05, revenue: 100000},
        {id: 'v-st-veteran', name: 'Striker V2 · transfer (32)', position: 'ST', age: 32, dealType: 'permanent', fee: 400000, agentFee: 60000, signingBonus: 120000, contractYears: 2, wage: 850000, points: 3.4, exitValue: 0},
        {id: 'v-st-loan', name: 'Striker V3 · loan (23)', position: 'ST', age: 23, ...loan({fee: 300000, contractYears: 1, wage: 1100000, wageShare: 0.7, points: 3.0})},
        {id: 'v-am-creator', name: 'Attacking midfielder V4 · transfer (24)', position: 'AM', age: 24, dealType: 'permanent', fee: 900000, instalments: [0.5, 0.5], agentFee: 90000, contractYears: 4, wage: 520000, wageGrowth: 0.03, points: 2.6, exitSeason: 3, exitValue: 1500000, saleCostPct: 0.05},
        {id: 'v-am-free', name: 'Attacking midfielder V5 · free agent (30)', position: 'AM', age: 30, dealType: 'free', agentFee: 120000, signingBonus: 200000, contractYears: 3, wage: 700000, points: 2.3, exitValue: 0},
        {id: 'v-cb-solid', name: 'Centre-back V6 · transfer (27)', position: 'CB', age: 27, dealType: 'permanent', fee: 600000, instalments: [0.5, 0.5], agentFee: 60000, contractYears: 3, wage: 450000, points: 1.8, exitValue: 500000, saleCostPct: 0.05},
        {id: 'v-w-loan', name: 'Winger V7 · loan (21)', position: 'W', age: 21, ...loan({fee: 100000, contractYears: 1, wage: 600000, wageShare: 0.5, points: 1.7})},
        {id: 'v-dm-free', name: 'Defensive midfielder V8 · free agent (29)', position: 'DM', age: 29, nonEU: true, dealType: 'free', agentFee: 50000, signingBonus: 80000, contractYears: 2, wage: 420000, points: 1.4, exitValue: 0},
      ],
      modes: {},
    },
    whatIfs: [
      {id: 'wage-cap', label: 'Wages: the squad-cost limit falls by €700,000 every season', add: {squadCostLimit: -700000}},
      {id: 'promotion-value', label: 'Promotion worth less: each point is worth €150,000', set: {valuePerPoint: 150000}},
    ],
  },
  {
    id: 'cash-squeeze',
    club: 'Deportivo Norte Alto',
    tier: 'Fictional second-division club',
    headline: 'A club under financial pressure that needs alternative routes',
    decision: 'Norte Alto must replace two first-team players while cash is tight. Which mix of loans, free agents and transfers keeps the club safe if the seasons go badly?',
    scenario: {
      schema: 'lanova-recruitment-v2', fictional: true, label: 'Deportivo Norte Alto (FICTIONAL) — cash squeeze',
      context: {
        horizon: 3, discountRate: 0.1, transferBudget: 800000,
        squadCostLimit: [8000000, 8000000, 8200000], committedSquadCost: [6900000, 5600000, 4100000],
        openingCash: 1700000, operatingCashFlow: [-700000, -100000, 300000], minCash: 0, protectedReserve: 300000,
        lifetimeCapital: 3000000, maxDownsideLoss: 1500000,
        currentSquadSize: 20, maxSquadSize: 25, currentNonEU: 2, maxNonEU: 3, maxSignings: 4,
        positionNeeds: {CB: 1, CM: 1}, objective: 'blended', valuePerPoint: 120000, samePositionFactor: 0.5, minPortfolioNpv: null,
        stress: {resaleHaircut: 0.5, revenueHaircut: 0.3, upsideResale: 0.2, upsideRevenue: 0.2},
      },
      candidates: [
        {id: 'n-cb-transfer', name: 'Centre-back N1 · transfer (25)', position: 'CB', age: 25, dealType: 'permanent', fee: 500000, instalments: [0.5, 0.5], agentFee: 50000, signingBonus: 60000, contractYears: 4, wage: 300000, wageGrowth: 0.03, points: 2.8, exitSeason: 3, exitValue: 800000, exitValueDownside: 300000, saleCostPct: 0.05},
        {id: 'n-cb-loan', name: 'Centre-back N2 · loan (21)', position: 'CB', age: 21, ...loan({fee: 50000, contractYears: 1, wage: 260000, wageShare: 0.5, points: 1.4})},
        {id: 'n-cb-free', name: 'Centre-back N3 · free agent (33)', position: 'CB', age: 33, dealType: 'free', agentFee: 40000, signingBonus: 70000, contractYears: 2, wage: 280000, points: 1.5, exitValue: 0},
        {id: 'n-cm-transfer', name: 'Central midfielder N4 · transfer (24)', position: 'CM', age: 24, dealType: 'permanent', fee: 450000, agentFee: 45000, contractYears: 3, wage: 260000, points: 2.5, exitSeason: 3, exitValue: 600000, saleCostPct: 0.05},
        {id: 'n-cm-loan', name: 'Central midfielder N5 · loan (20)', position: 'CM', age: 20, ...loan({fee: 0, contractYears: 1, wage: 180000, wageShare: 1, points: 1.1})},
        {id: 'n-cm-free', name: 'Central midfielder N6 · free agent (30)', position: 'CM', age: 30, nonEU: true, dealType: 'free', agentFee: 30000, signingBonus: 40000, contractYears: 2, wage: 230000, points: 1.3, exitValue: 0},
        {id: 'n-st-loan', name: 'Striker N7 · loan (22)', position: 'ST', age: 22, ...loan({fee: 80000, contractYears: 1, wage: 400000, wageShare: 0.5, points: 1.8})},
        {id: 'n-w-transfer', name: 'Winger N8 · transfer (23)', position: 'W', age: 23, dealType: 'permanent', fee: 350000, instalments: [0.5, 0.5], agentFee: 35000, contractYears: 3, wage: 200000, points: 1.2, exitSeason: 3, exitValue: 500000, saleCostPct: 0.05},
      ],
      modes: {},
    },
    whatIfs: [
      {id: 'cash-shock', label: 'Bad news: opening cash is €400,000 lower', add: {openingCash: -400000}},
      {id: 'player-sale', label: 'Good news: a player sale brings €800,000 of cash now', add: {openingCash: 800000}},
    ],
  },
];

/** Apply a what-if to a scenario (returns a new scenario; the original is never mutated). */
export function applyWhatIf(scenario, whatIf) {
  const s = structuredClone(scenario);
  for (const [k, v] of Object.entries(whatIf.set ?? {})) s.context[k] = v;
  for (const [k, v] of Object.entries(whatIf.add ?? {})) s.context[k] = Array.isArray(s.context[k]) ? s.context[k].map(x => x + v) : s.context[k] + v;
  for (const id of whatIf.exclude ?? []) s.modes = {...s.modes, [id]: 'exclude'};
  return s;
}

/** Human description of exactly what a what-if changes (shown before the user confirms it). */
export function describeChange(scenario, whatIf) {
  const after = applyWhatIf(scenario, whatIf).context;
  const label = {transferBudget: 'Budget available at signing', valuePerPoint: 'Value of one league point', squadCostLimit: 'Squad-cost limit (wages + amortisation) per season', openingCash: 'Cash available today'};
  const fmt = v => Array.isArray(v) ? v.map(fmtEur).join(' / ') : fmtEur(v);
  const names = new Map(scenario.candidates.map(c => [c.id, c.name]));
  return [...Object.keys({...whatIf.set, ...whatIf.add}).map(k => ({field: k, label: label[k] ?? k, from: fmt(scenario.context[k]), to: fmt(after[k])})),
    ...(whatIf.exclude ?? []).map(id => ({field: 'exclude', label: names.get(id), from: 'available', to: 'not available'}))];
}
export const fmtEur = n => (n < 0 ? '−' : '') + '€' + Math.round(Math.abs(n)).toLocaleString('en-GB');
