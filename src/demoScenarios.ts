import { CHARGE_ID, createInitialState, DIABETES_ID, FALSE_POSITIVE_ID, getEncounters, HERO_ID } from './portfolio';
import { defaultQuery, transition } from './workflow';
import type { WorkbenchState } from './model';

export const DEMO_CONFIG = {
  notificationIntervalMs: 45000,
  totalNotifications: 3,
  coderName: 'Jordan Ellis, CCS',
  queue: [
    { id: HERO_ID, issue: 'Documented dural tear is missing from the claim', detail: 'Lumbar fusion · diagnosis and procedure review', category: 'Coding discrepancy' },
    { id: CHARGE_ID, issue: 'Implanted cranial mesh has no posted charge', detail: 'Consumption confirmed · duplicate check complete', category: 'Missing charge' },
    { id: DIABETES_ID, issue: 'Diabetes documentation needs clarification', detail: 'Hyperglycemia vs. CKD · provider response requested', category: 'Documentation query' },
    { id: FALSE_POSITIVE_ID, issue: 'Respiratory failure alert lacks provider documentation', detail: 'Routine postoperative ventilation · coder review', category: 'Coding alert' },
  ],
} as const;

export function createDemoState(): WorkbenchState {
  const initial = createInitialState();
  const hero = getEncounters(initial).find(e => e.id === HERO_ID)!;
  const requested = transition(initial, HERO_ID, {
    type: 'request-query', rationale: 'Seeded documentation context for the lumbar fusion demonstration.',
    queryText: defaultQuery(hero),
  }, '2026-07-22T13:00:00-04:00');
  const clarified = transition(requested, HERO_ID, { type: 'answer-query', answer: 'anemia-confirmed' }, '2026-07-22T14:15:00-04:00');
  const diabetes = getEncounters(clarified).find(e => e.id === DIABETES_ID)!;
  const state = transition(clarified, DIABETES_ID, {
    type: 'request-query', rationale: 'Seeded open query: clarify diabetes manifestations and renal chronicity.',
    queryText: defaultQuery(diabetes),
  }, '2026-11-05T08:30:00-05:00');
  state.reviews[HERO_ID].analysisReady = false;
  state.reviews[HERO_ID].isNew = true;
  state.reviews[FALSE_POSITIVE_ID].status = 'routed';
  state.reviews[FALSE_POSITIVE_ID].owner = DEMO_CONFIG.coderName;
  state.audit = [{
    id: 'demo-context', encounterId: 'portfolio', timestamp: '2026-11-05T09:05:00-05:00',
    actor: 'Demonstration setup', action: 'Review queue initialized',
    rationale: 'Separate synthetic lumbar clarification is available for analysis. Diabetes query is open. The respiratory alert is assigned to a simulated coder. No claim has been approved or changed.',
    before: 'Imported claims', after: 'Original claim codes and charges retained',
  }, ...initial.audit];
  return state;
}
