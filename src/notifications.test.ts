import { describe, expect, it } from 'vitest';
import { createDemoState } from './demoScenarios';
import { markNotificationRead, rememberReviewed, simulateNotification } from './notifications';
import { CHARGE_ID, DEEP_IDS, DIABETES_ID, FALSE_POSITIVE_ID, getEncounters, HERO_ID, RAW } from './portfolio';
import { parseSavedState, ready, transition } from './workflow';

const now = '2026-11-05T15:00:00Z';
const reason = 'Reviewed physician documentation, reportability, procedure anatomy and applicable-year grouping.';

describe('ClaimsHero demonstration events', () => {
  it('initializes the four queue scenarios without approving or changing any claim', () => {
    const state = createDemoState();
    expect(state.reviews[HERO_ID].analysisReady).toBe(false);
    expect(state.reviews[HERO_ID].isNew).toBe(true);
    expect(state.reviews[HERO_ID].claim.drg).toBe('460');
    expect(state.reviews[HERO_ID].claim.diagnoses).toEqual(['M48.062']);
    expect(state.reviews[HERO_ID].query?.status).toBe('answered');
    expect(state.reviews[DIABETES_ID].query?.status).toBe('open');
    expect(state.reviews[FALSE_POSITIVE_ID].status).toBe('routed');
    expect(getEncounters(state).filter(ready)).toHaveLength(0);
    expect(state.demo.notifications).toHaveLength(0);
  });
  it('publishes the new claim analysis and updates its row state', () => {
    const before = createDemoState();
    const after = simulateNotification(before, now);
    expect(after.reviews[HERO_ID].analysisReady).toBe(true);
    expect(after.demo.notifications[0]).toMatchObject({ type: 'analysis', encounterId: HERO_ID, read: false });
    expect(after.reviews[HERO_ID].claim).toEqual(before.reviews[HERO_ID].claim);
    expect(before.reviews[HERO_ID].analysisReady).toBe(false);
  });
  it('adds a signed provider response but does not apply its diabetes codes', () => {
    const initial = createDemoState();
    const after = simulateNotification(simulateNotification(initial, now), now);
    expect(after.reviews[DIABETES_ID].query).toMatchObject({ status: 'answered', response: 'hyperglycemia' });
    expect(after.reviews[DIABETES_ID].status).toBe('review');
    expect(after.reviews[DIABETES_ID].notes.at(-1)?.kind).toBe('response');
    expect(after.reviews[DIABETES_ID].claim).toEqual(initial.reviews[DIABETES_ID].claim);
    expect(after.reviews[DIABETES_ID].claim.diagnoses).toContain('E11.9');
    expect(after.demo.notifications[0].type).toBe('query-response');
  });
  it('records a coder decision without bypassing administrator disposition', () => {
    let state = createDemoState();
    const original = state.reviews[FALSE_POSITIVE_ID].claim;
    for (let i = 0; i < 3; i++) state = simulateNotification(state, now);
    expect(state.reviews[FALSE_POSITIVE_ID].coderDecision?.decision).toBe('reject');
    expect(state.reviews[FALSE_POSITIVE_ID].status).toBe('review');
    expect(state.reviews[FALSE_POSITIVE_ID].claim).toEqual(original);
    expect(ready(getEncounters(state).find(e => e.id === FALSE_POSITIVE_ID)!)).toBe(false);
    expect(state.demo.notifications.filter(n => !n.read)).toHaveLength(3);
    expect(state.audit[0].actor).toContain('Jordan Ellis');
    expect(() => simulateNotification(state)).toThrow('All three');
  });
  it('does not reopen an already reviewed claim when analysis arrives', () => {
    const approved = transition(createDemoState(), HERO_ID, { type: 'approve', rationale: reason, evidenceReviewed: true }, now);
    const after = simulateNotification(approved, now);
    expect(after.reviews[HERO_ID].status).toBe('approved');
    expect(after.reviews[HERO_ID].claim).toEqual(approved.reviews[HERO_ID].claim);
    expect(after.reviews[HERO_ID].isNew).toBe(false);
  });
  it('never mutates imported Epic records or claim snapshots during all three events', () => {
    const raw = JSON.stringify(RAW);
    const initial = createDemoState();
    let state = initial;
    for (let i = 0; i < 3; i++) state = simulateNotification(state, now);
    for (const id of DEEP_IDS) expect(state.reviews[id].claim).toEqual(initial.reviews[id].claim);
    expect(JSON.stringify(RAW)).toBe(raw);
  });
  it('marks only the selected notification read and persists its state', () => {
    const state = simulateNotification(simulateNotification(createDemoState(), now), now);
    const after = markNotificationRead(state, 'event-analysis');
    expect(after.demo.notifications.filter(n => !n.read)).toHaveLength(1);
    expect(state.demo.notifications.filter(n => !n.read)).toHaveLength(2);
    expect(parseSavedState(JSON.stringify(after))).toEqual(after);
    expect(() => markNotificationRead(after, 'missing')).toThrow('not found');
  });
  it('keeps a unique bounded last-reviewed list without changing claims', () => {
    let state = createDemoState();
    for (const id of [...DEEP_IDS, 'EPIC-ENC-80001', HERO_ID]) state = rememberReviewed(state, id, now);
    expect(state.demo.lastReviewed).toHaveLength(4);
    expect(state.demo.lastReviewed[0].encounterId).toBe(HERO_ID);
    expect(new Set(state.demo.lastReviewed.map(item => item.encounterId)).size).toBe(4);
    expect(state.reviews[HERO_ID].isNew).toBe(false);
    expect(state.reviews[HERO_ID].claim.drg).toBe('460');
    expect(state.reviews[CHARGE_ID].claim.chargePosted).toBe(false);
    expect(() => rememberReviewed(state, 'unknown')).toThrow('not found');
  });
});
