import { describe, expect, it } from 'vitest';
import { CHARGE_ID, createInitialState, DEEP_IDS, DIABETES_ID, FALSE_POSITIVE_ID, getEncounters, HERO_ID, ledgerFor, notesFor, RAW, SOURCE_TOTALS } from './portfolio';
import { blockers, chargeTotal, defaultQuery, documentationLinks, expectedPayment, groupClaim, metrics, parseSavedState, proposal, ready, transition, validatedRecovery } from './workflow';
import type { QueryResponse, WorkbenchState } from './model';

const rationale = 'Reviewed original evidence, signed demo clarification, reportability, coding year and scoped grouping.';
const now = '2026-11-05T16:30:00Z';
const get = (state: WorkbenchState, id = HERO_ID) => getEncounters(state).find(e => e.id === id)!;
function clarify(state: WorkbenchState, id: string, answer: QueryResponse) {
  const requested = transition(state, id, { type: 'request-query', rationale, queryText: defaultQuery(get(state, id)) }, now);
  return transition(requested, id, { type: 'answer-query', answer }, now);
}
function approveHero() {
  return transition(clarify(createInitialState(), HERO_ID, 'anemia-confirmed'), HERO_ID, { type: 'approve', rationale, evidenceReviewed: true }, now);
}

describe('Source portfolio and financial boundaries', () => {
  it('imports all 80 unique encounters and the exact unvalidated exposure', () => {
    expect(RAW).toHaveLength(80);
    expect(new Set(RAW.map(e => e.id)).size).toBe(80);
    expect(SOURCE_TOTALS).toEqual({ encounters: 80, baseline: 2143116, proposed: 3495535, exposure: 1352419, flagged: 66 });
    expect(RAW.reduce((sum, e) => sum + e.claim.revenue_left_on_table_usd, 0)).toBe(1352419);
  });
  it('has four deep walkthroughs within the verified FY2026 window', () => {
    expect(DEEP_IDS).toHaveLength(4);
    for (const id of DEEP_IDS) {
      const e = get(createInitialState(), id);
      expect(e.census.discharge_date >= '2026-04-01' && e.census.discharge_date <= '2026-09-30').toBe(true);
    }
  });
  it('never counts imported estimates as validated recovery', () => {
    const stats = metrics(getEncounters(createInitialState()));
    expect(stats.exposure).toBe(1352419);
    expect(stats.validated).toBe(0);
    expect(stats.ready).toBe(0);
    expect(stats.queries).toBe(2);
  });
  it('does not mutate the source rows, initial state or imported proposal', () => {
    const raw = JSON.stringify(RAW);
    const initial = createInitialState();
    const before = JSON.stringify(initial);
    transition(clarify(initial, HERO_ID, 'anemia-confirmed'), HERO_ID, { type: 'approve', rationale, evidenceReviewed: true }, now);
    expect(JSON.stringify(RAW)).toBe(raw);
    expect(JSON.stringify(initial)).toBe(before);
    expect(get(initial).claim.optimized_ms_drg).toBe('459');
    expect(get(initial).claim.optimized_reimbursement_usd).toBe(52400);
  });
  it('links every displayed code excerpt to text actually present in its source document', () => {
    const states = [createInitialState(), clarify(createInitialState(), HERO_ID, 'anemia-confirmed'), clarify(createInitialState(), DIABETES_ID, 'both'), clarify(createInitialState(), DIABETES_ID, 'no-change')];
    for (const state of states) {
      for (const id of DEEP_IDS) {
        const e = get(state, id);
        for (const link of documentationLinks(e)) {
          expect(notesFor(e).find(n => n.id === link.sourceId)?.text).toContain(link.excerpt);
        }
      }
    }
  });
  it('changes the D62 documentation link from a lab indicator to the actual signed clarification', () => {
    const original = documentationLinks(get(createInitialState())).find(l => l.code === 'D62')!;
    expect(original.status).toBe('Query required');
    expect(original.sourceId).toBe('silo-3');
    const clarified = documentationLinks(get(clarify(createInitialState(), HERO_ID, 'anemia-confirmed'))).find(l => l.code === 'D62')!;
    expect(clarified.status).toBe('Linked');
    expect(clarified.sourceId).toContain('response-');
    const notSupported = documentationLinks(get(clarify(createInitialState(), HERO_ID, 'no-change'))).find(l => l.code === 'D62')!;
    expect(notSupported.status).toBe('Not supported');
  });
});

describe('Correct FY2026 spine grouping', () => {
  it('regroups a single standard fusion to 451, not the imported retired 460', () => {
    const e = get(createInitialState());
    expect(e.review.claim.drg).toBe('460');
    expect(groupClaim(e, e.review.claim)).toBe('451');
  });
  it('D62 and G97.41 do not create an MCC uplift', () => {
    const e = get(createInitialState());
    expect(groupClaim(e, { ...e.review.claim, diagnoses: ['M48.062', 'D62', 'G97.41'] })).toBe('451');
  });
  it('uses the lumbosacral code rather than an incorrect multi-lumbar substitution', () => {
    const e = get(createInitialState());
    expect(proposal(e).procedures).toEqual(['0SG00AJ', '0SG30AJ']);
    expect(proposal(e).procedures).not.toContain('0SG10AJ');
    expect(groupClaim(e, proposal(e))).toBe('448');
  });
  it('rejects unknown procedures and out-of-scope diagnosis sets', () => {
    const e = get(createInitialState());
    expect(groupClaim(e, { ...e.review.claim, procedures: ['0SG00AJ', '0SG10AJ'] })).toBeUndefined();
    expect(groupClaim(e, { ...e.review.claim, diagnoses: ['M48.062', 'J95.821'] })).toBeUndefined();
  });
  it('does not apply the FY2026 branch to October FY2027 records', () => {
    const e = get(createInitialState());
    expect(groupClaim({ ...e, census: { ...e.census, discharge_date: '2026-10-08' } }, proposal(e))).toBeUndefined();
    expect(blockers(get(createInitialState(), 'EPIC-ENC-80001'))).toContain('FY2027 coding / grouper validation required');
  });
  it('holds generic imported proposals for specialist review', () => {
    const state = createInitialState();
    expect(groupClaim(get(state, 'EPIC-ENC-80002'), get(state, 'EPIC-ENC-80002').review.claim)).toBeUndefined();
    expect(() => transition(state, 'EPIC-ENC-80002', { type: 'approve', rationale, evidenceReviewed: true })).toThrow('not validated');
  });
});

describe('Documentation and human-review gates', () => {
  it('blocks approval until the required query is resolved', () => {
    expect(() => transition(createInitialState(), HERO_ID, { type: 'approve', rationale, evidenceReviewed: true })).toThrow('clarification');
  });
  it('leaves the claim untouched when requesting and answering a query', () => {
    const initial = createInitialState();
    const clarified = clarify(initial, HERO_ID, 'anemia-confirmed');
    expect(clarified.reviews[HERO_ID].claim).toEqual(initial.reviews[HERO_ID].claim);
    expect(clarified.reviews[HERO_ID].notes).toHaveLength(1);
    expect(clarified.reviews[HERO_ID].notes[0].synthetic).toBe(true);
    expect(clarified.reviews[HERO_ID].notes[0].timestamp).toBe(now);
  });
  it('requires an evidence attestation and a specific rationale', () => {
    const state = clarify(createInitialState(), HERO_ID, 'anemia-confirmed');
    expect(() => transition(state, HERO_ID, { type: 'approve', rationale, evidenceReviewed: false })).toThrow('Confirm');
    expect(() => transition(state, HERO_ID, { type: 'approve', rationale: 'yes', evidenceReviewed: true })).toThrow('rationale');
  });
  it('adds only approved supported diagnoses and procedures', () => {
    const state = approveHero();
    const e = get(state);
    expect(e.review.claim.diagnoses).toEqual(['M48.062', 'G97.41', 'D62']);
    expect(e.review.claim.procedures).toEqual(['0SG00AJ', '0SG30AJ']);
    expect(e.review.claim.drg).toBe('448');
    expect(e.review.claim.revision).toBe(2);
    expect(ready(e)).toBe(true);
    expect(state.audit[0].rationale).toBe(rationale);
    expect(state.audit[0].before).toContain('460');
    expect(state.audit[0].after).toContain('448');
  });
  it('does not add D62 when the simulated clinician does not establish anemia', () => {
    const state = transition(clarify(createInitialState(), HERO_ID, 'no-change'), HERO_ID, { type: 'approve', rationale, evidenceReviewed: true });
    expect(get(state).review.claim.diagnoses).toEqual(['M48.062', 'G97.41']);
    expect(get(state).review.claim.drg).toBe('448');
  });
  it('keeps clinically indeterminate encounters on hold', () => {
    const state = clarify(createInitialState(), HERO_ID, 'undetermined');
    expect(get(state).review.status).toBe('escalated');
    expect(ready(get(state))).toBe(false);
    expect(() => transition(state, HERO_ID, { type: 'approve', rationale, evidenceReviewed: true })).toThrow('clarification');
  });
  it('prevents duplicate open queries and invalid response types', () => {
    const state = createInitialState();
    const action = { type: 'request-query' as const, rationale, queryText: defaultQuery(get(state)) };
    const requested = transition(state, HERO_ID, action);
    expect(() => transition(requested, HERO_ID, action)).toThrow('already exists');
    expect(() => transition(requested, HERO_ID, { type: 'answer-query', answer: 'ckd' })).toThrow('not valid');
    expect(() => transition(state, HERO_ID, { type: 'answer-query', answer: 'anemia-confirmed' })).toThrow('no open query');
  });
  it('routing and escalation preserve the claim and append rationale', () => {
    const state = createInitialState();
    const routed = transition(state, HERO_ID, { type: 'route', rationale, owner: 'Jordan Ellis, CCS' });
    expect(get(routed).review.owner).toBe('Jordan Ellis, CCS');
    expect(get(routed).review.claim).toEqual(get(state).review.claim);
    const escalated = transition(routed, HERO_ID, { type: 'escalate', rationale });
    expect(get(escalated).review.status).toBe('escalated');
    expect(get(escalated).review.claim).toEqual(get(state).review.claim);
    expect(escalated.audit).toHaveLength(3);
  });
  it('rejecting an unsupported legacy claim does not make its invalid DRG ready', () => {
    const state = transition(clarify(createInitialState(), HERO_ID, 'no-change'), HERO_ID, { type: 'reject', rationale, evidenceReviewed: true });
    expect(get(state).review.claim.drg).toBe('460');
    expect(ready(get(state))).toBe(false);
    expect(() => transition(state, HERO_ID, { type: 'submit', fail: false })).toThrow('blockers');
  });
});

describe('Diabetes ambiguity', () => {
  it.each([
    ['hyperglycemia', ['M48.062', 'E11.65']],
    ['ckd', ['M48.062', 'E11.22', 'N18.32']],
    ['both', ['M48.062', 'E11.65', 'E11.22', 'N18.32']],
    ['no-change', ['M48.062', 'E11.9']],
  ] as const)('handles %s without inventing a payment uplift', (answer, codes) => {
    const initial = createInitialState();
    const state = transition(clarify(initial, DIABETES_ID, answer), DIABETES_ID, { type: 'approve', rationale, evidenceReviewed: true });
    const e = get(state, DIABETES_ID);
    expect(e.review.claim.diagnoses).toEqual(codes);
    expect(e.review.claim.drg).toBe('451');
    expect(expectedPayment(e)).toBe(e.claim.baseline_reimbursement_usd);
    expect(validatedRecovery(e)).toBe(0);
  });
  it('requires a stage code for the scoped E11.22 scenario', () => {
    const e = get(createInitialState(), DIABETES_ID);
    expect(groupClaim(e, { ...e.review.claim, diagnoses: ['M48.062', 'E11.22'] })).toBeUndefined();
    expect(groupClaim(e, { ...e.review.claim, diagnoses: ['M48.062', 'E11.9', 'E11.65'] })).toBeUndefined();
  });
  it('does not change codes for an indeterminate answer', () => {
    const initial = createInitialState();
    const state = clarify(initial, DIABETES_ID, 'undetermined');
    expect(state.reviews[DIABETES_ID].claim).toEqual(initial.reviews[DIABETES_ID].claim);
    expect(ready(get(state, DIABETES_ID))).toBe(false);
  });
});

describe('Charge reconciliation and false positives', () => {
  it('posts the $3,900 charge exactly once without changing payment or DRG', () => {
    const initial = createInitialState();
    const before = get(initial, CHARGE_ID);
    expect(ledgerFor(before).filter(l => l.status === 'missing')).toHaveLength(1);
    const state = transition(initial, CHARGE_ID, { type: 'approve', rationale, evidenceReviewed: true });
    const after = get(state, CHARGE_ID);
    expect(chargeTotal(after) - chargeTotal(before)).toBe(3900);
    expect(after.review.claim.drg).toBe(before.review.claim.drg);
    expect(expectedPayment(after)).toBe(expectedPayment(before));
    expect(validatedRecovery(after)).toBe(0);
    expect(() => transition(state, CHARGE_ID, { type: 'approve', rationale, evidenceReviewed: true })).toThrow('complete');
  });
  it('blocks the respiratory-failure false-positive and allows a reasoned rejection', () => {
    const state = createInitialState();
    expect(() => transition(state, FALSE_POSITIVE_ID, { type: 'approve', rationale, evidenceReviewed: true })).toThrow('unsupported');
    const rejected = transition(state, FALSE_POSITIVE_ID, { type: 'reject', rationale, evidenceReviewed: true });
    expect(rejected.reviews[FALSE_POSITIVE_ID].claim).toEqual(state.reviews[FALSE_POSITIVE_ID].claim);
    expect(ready(get(rejected, FALSE_POSITIVE_ID))).toBe(true);
    expect(validatedRecovery(get(rejected, FALSE_POSITIVE_ID))).toBe(0);
  });
});

describe('Persistence and simulated submission', () => {
  it('round-trips approved state and rejects corrupt or partial storage', () => {
    const state = approveHero();
    expect(parseSavedState(JSON.stringify(state))).toEqual(state);
    expect(() => parseSavedState('{"version":2}')).toThrow();
    expect(() => parseSavedState(JSON.stringify({ ...state, reviews: {} }))).toThrow('80-encounter');
    const tampered = structuredClone(state);
    tampered.reviews[HERO_ID].claim.drg = '459';
    expect(() => parseSavedState(JSON.stringify(tampered))).toThrow('validated');
  });
  it('blocks unapproved submission', () => {
    expect(() => transition(createInitialState(), HERO_ID, { type: 'submit', fail: false })).toThrow('blockers');
  });
  it('preserves the approved claim on failure and succeeds on retry without duplicate recovery', () => {
    const approved = approveHero();
    expect(metrics(getEncounters(approved)).validated).toBe(8000);
    const failed = transition(approved, HERO_ID, { type: 'submit', fail: true });
    expect(get(failed).review.claim).toEqual(get(approved).review.claim);
    expect(get(failed).review.receipt).toBeUndefined();
    expect(ready(get(failed))).toBe(true);
    const submitted = transition(failed, HERO_ID, { type: 'submit', fail: false });
    expect(get(submitted).review.receipt).toBe('SIM-80026-R2');
    expect(get(submitted).review.status).toBe('submitted');
    expect(metrics(getEncounters(submitted)).validated).toBe(8000);
    expect(metrics(getEncounters(submitted)).submitted).toBe(1);
    expect(() => transition(submitted, HERO_ID, { type: 'submit', fail: false })).toThrow('already submitted');
  });
});
