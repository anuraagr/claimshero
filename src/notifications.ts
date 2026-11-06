import { DEMO_CONFIG } from './demoScenarios';
import { DIABETES_ID, FALSE_POSITIVE_ID, getEncounters, HERO_ID, RAW } from './portfolio';
import { defaultQuery, resolved, transition, WorkflowError } from './workflow';
import type { DemoNotification, WorkbenchState } from './model';

export function simulateNotification(state: WorkbenchState, now = new Date().toISOString()): WorkbenchState {
  const index = state.demo.notificationIndex;
  if (index >= DEMO_CONFIG.totalNotifications) throw new WorkflowError('All three demo notifications have been delivered. Reset the demo to replay them.');
  let next = structuredClone(state);
  let notification: DemoNotification;
  if (index === 0) {
    const e = getEncounters(next).find(e => e.id === HERO_ID)!;
    next.reviews[HERO_ID].analysisReady = true;
    next.reviews[HERO_ID].isNew = !resolved(e);
    notification = {
      id: 'event-analysis', type: 'analysis', encounterId: HERO_ID, timestamp: now, read: false,
      title: 'New claim analysis ready',
      message: `David Okafor · Dural complication and fusion-site documentation reviewed.${resolved(e) ? ' Previous reviewer disposition retained.' : ' A coding decision is required.'}`,
    };
  } else if (index === 1) {
    const e = getEncounters(next).find(e => e.id === DIABETES_ID)!;
    if (!resolved(e) && !e.review.query) next = transition(next, DIABETES_ID, { type: 'request-query', rationale: 'Simulated clinical documentation request for the diabetes demonstration.', queryText: defaultQuery(e) }, now);
    if (!resolved(e) && next.reviews[DIABETES_ID].query?.status === 'open') next = transition(next, DIABETES_ID, { type: 'answer-query', answer: 'hyperglycemia' }, now);
    const response = next.reviews[DIABETES_ID].query?.response;
    notification = {
      id: 'event-query', type: 'query-response', encounterId: DIABETES_ID, timestamp: now, read: false,
      title: 'Documentation response received',
      message: `Nadia Rodriguez · ${response === 'hyperglycemia' ? 'The simulated provider confirms hyperglycemia; no CKD. Review E11.65 before approval.' : 'Provider response is available for review. Existing claim disposition is preserved.'}`,
    };
  } else {
    const e = getEncounters(next).find(e => e.id === FALSE_POSITIVE_ID)!;
    if (!resolved(e)) {
      next.reviews[FALSE_POSITIVE_ID].status = 'review';
      next.reviews[FALSE_POSITIVE_ID].owner = DEMO_CONFIG.coderName;
      next.reviews[FALSE_POSITIVE_ID].coderDecision = {
        decision: 'reject', author: `${DEMO_CONFIG.coderName} (simulated)`, timestamp: now,
        reason: 'Reject J95.821: the provider does not diagnose respiratory failure, and the recovery narrative describes routine extubation. Retain the current diagnosis codes.',
      };
    }
    notification = {
      id: 'event-coder', type: 'coder-decision', encounterId: FALSE_POSITIVE_ID, timestamp: now, read: false,
      title: 'Coder decision available',
      message: resolved(e) ? 'Nadia Washington · Coder review confirms the existing disposition. No claim changes were applied.' : 'Nadia Washington · Jordan Ellis recommends rejecting the respiratory-failure alert. Administrator disposition is required; claim codes are unchanged.',
    };
  }
  const originalClaim = state.reviews[notification.encounterId].claim;
  const latestClaim = next.reviews[notification.encounterId].claim;
  if (JSON.stringify(originalClaim) !== JSON.stringify(latestClaim)) throw new WorkflowError('A notification cannot modify a claim.');
  next.audit.unshift({
    id: `${notification.id}-${next.audit.length + 1}`, encounterId: notification.encounterId, timestamp: now,
    actor: notification.type === 'coder-decision' ? `${DEMO_CONFIG.coderName} (simulated)` : 'Notification simulator',
    action: notification.title, rationale: notification.message,
    before: `MS-DRG ${originalClaim.drg} | claim revision ${originalClaim.revision}`,
    after: 'No claim change; administrator review required',
  });
  next.demo.notificationIndex = index + 1;
  next.demo.notifications.unshift(notification);
  return next;
}

export function rememberReviewed(state: WorkbenchState, id: string, now = new Date().toISOString()): WorkbenchState {
  if (!RAW.some(e => e.id === id)) throw new WorkflowError('Encounter not found.');
  return {
    ...state,
    reviews: { ...state.reviews, [id]: { ...state.reviews[id], isNew: false } },
    demo: { ...state.demo, lastReviewed: [{ encounterId: id, timestamp: now }, ...state.demo.lastReviewed.filter(r => r.encounterId !== id)].slice(0, 4) },
  };
}

export function markNotificationRead(state: WorkbenchState, id: string): WorkbenchState {
  if (!state.demo.notifications.some(n => n.id === id)) throw new WorkflowError('Notification not found.');
  return { ...state, demo: { ...state.demo, notifications: state.demo.notifications.map(n => n.id === id ? { ...n, read: true } : n) } };
}
