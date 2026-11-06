import { z } from 'zod';
import { stateSchema, type AgentCheck, type ClaimSnapshot, type CodeDocumentation, type QueryResponse, type WorkbenchState, type WorkflowAction } from './model';
import { caseKind, CHARGE_ID, CODE_LABELS, CURRENT_USER, DEEP_IDS, DIABETES_ID, FALSE_POSITIVE_ID, getEncounters, HERO_ID, ledgerFor, notesFor, RAW, type Encounter, type RawEncounter } from './portfolio';
import { CHARGE_ASSUMPTIONS, PAYMENT_ASSUMPTIONS } from './paymentAssumptions';

export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const compactMoney = (value: number) => value >= 1e6 ? `$${(value / 1e6).toFixed(2)}M` : money(value);
export const fullDate = (value: string) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
export const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const initials = (name: string) => name.split(' ').map(n => n[0]).slice(0, 2).join('');
export const resolved = (e: Encounter) => ['approved', 'rejected', 'submitted'].includes(e.review.status);
export const dueHours = (e: RawEncounter) => e.id === HERO_ID ? 6 : e.id === DIABETES_ID ? 8 : e.id === CHARGE_ID ? 18 : e.id === FALSE_POSITIVE_ID ? 36 : 24 + Number(e.id.slice(-2)) % 6 * 12;

export class WorkflowError extends Error {
  constructor(message: string) { super(message); this.name = 'WorkflowError'; }
}

// Only the four documented walkthrough branches are implemented. Imported mappings are never trusted.
export function groupClaim(e: RawEncounter, claim: ClaimSnapshot): string | undefined {
  if (!DEEP_IDS.includes(e.id) || e.census.discharge_date < PAYMENT_ASSUMPTIONS.validFrom || e.census.discharge_date > PAYMENT_ASSUMPTIONS.validThrough) return undefined;
  if ([HERO_ID, DIABETES_ID].includes(e.id)) {
    const allowed = ['M48.062', 'G97.41', 'D62', 'E11.9', 'E11.65', 'E11.22', 'N18.32'];
    if (claim.diagnoses[0] !== 'M48.062' || claim.diagnoses.some(c => !allowed.includes(c)) ||
      claim.procedures.some(c => !['0SG00AJ', '0SG30AJ'].includes(c)) || !claim.procedures.includes('0SG00AJ')) return undefined;
    if (claim.diagnoses.includes('E11.22') !== claim.diagnoses.includes('N18.32')) return undefined;
    if (claim.diagnoses.includes('E11.9') && claim.diagnoses.some(c => ['E11.65', 'E11.22'].includes(c))) return undefined;
    return claim.procedures.includes('0SG30AJ') ? '448' : '451';
  }
  if (claim.diagnoses.length === 1 && claim.diagnoses[0] === 'C71.2' &&
    claim.procedures.length === 1 && claim.procedures[0] === '00B00ZZ') return '027';
  return undefined;
}

export function proposal(e: Encounter): ClaimSnapshot {
  const c = structuredClone(e.review.claim);
  if (e.id === HERO_ID) {
    c.procedures = ['0SG00AJ', '0SG30AJ'];
    c.diagnoses = ['M48.062', 'G97.41', ...(e.review.query?.response === 'anemia-confirmed' ? ['D62'] : [])];
    c.drg = '448';
  } else if (e.id === DIABETES_ID) {
    const response = e.review.query?.response;
    c.diagnoses = ['M48.062', ...(
      response === 'hyperglycemia' ? ['E11.65'] :
        response === 'ckd' ? ['E11.22', 'N18.32'] :
          response === 'both' ? ['E11.65', 'E11.22', 'N18.32'] : ['E11.9']
    )];
    c.drg = '451';
  } else if (e.id === CHARGE_ID) {
    c.chargePosted = true;
  }
  return c;
}

export function expectedPayment(e: Encounter, claim = e.review.claim) {
  if (e.id === HERO_ID && claim.drg === '448') return PAYMENT_ASSUMPTIONS.fusionRates['448'];
  return baselinePayment(e);
}
export const baselinePayment = (e: Encounter) => e.id === HERO_ID ? PAYMENT_ASSUMPTIONS.fusionRates['451'] : e.claim.baseline_reimbursement_usd;
export const proposedDelta = (e: Encounter) => expectedPayment(e, proposal(e)) - baselinePayment(e);
export const validatedRecovery = (e: Encounter) => resolved(e) ? Math.max(0, expectedPayment(e) - baselinePayment(e)) : 0;
export const chargeTotal = (e: Encounter) => ledgerFor(e).filter(c => c.status === 'posted').reduce((n, c) => n + c.units * c.unitPrice, 0);

export function blockers(e: Encounter): string[] {
  if (e.review.status === 'submitted') return [];
  const items: string[] = [];
  if (!DEEP_IDS.includes(e.id)) items.push('Imported grouper and payer assumptions require specialist validation');
  if (e.census.discharge_date >= '2026-10-01') items.push('FY2027 coding / grouper validation required');
  if (e.review.query?.status === 'open') items.push('Awaiting provider documentation response');
  if ([HERO_ID, DIABETES_ID].includes(e.id) && (!e.review.query || e.review.query.response === 'undetermined')) items.push('Documentation clarification required before disposition');
  if (!resolved(e)) items.push('Human review and rationale required');
  if (resolved(e) && groupClaim(e, e.review.claim) !== e.review.claim.drg) items.push('Claim DRG does not match the applicable verified branch');
  return items;
}
export const ready = (e: Encounter) => ['approved', 'rejected'].includes(e.review.status) && blockers(e).length === 0;

export function metrics(encounters: Encounter[]) {
  const open = encounters.filter(e => !resolved(e));
  return {
    open: open.length,
    exposure: open.reduce((n, e) => n + e.claim.revenue_left_on_table_usd, 0),
    coding: open.filter(e => e.claim.revenue_leakage_occurred === 1).length,
    charges: open.some(e => e.id === CHARGE_ID) ? 1 : 0,
    chargeAmount: open.some(e => e.id === CHARGE_ID) ? CHARGE_ASSUMPTIONS.missingMeshCharge : 0,
    queries: open.filter(e => e.review.query?.status === 'open' || ([HERO_ID, DIABETES_ID].includes(e.id) && !e.review.query)).length,
    validated: encounters.reduce((n, e) => n + validatedRecovery(e), 0),
    ready: encounters.filter(ready).length,
    submitted: encounters.filter(e => e.review.status === 'submitted').length,
  };
}

export function defaultQuery(e: Encounter) {
  if (e.id === HERO_ID) return `Clinical clarification requested for ${e.id}. The recovery record shows Hgb ${e.recovery.preop_hgb_g_dl} to ${e.recovery.postop_nadir_hgb_g_dl} g/dL and ${e.recovery.prbc_units_transfused} units PRBC; no physician anemia diagnosis is supplied. Please clarify the clinical significance: acute posthemorrhagic anemia, another type/cause of anemia, no clinically significant anemia, other condition, or unable to determine. Please document evaluation/treatment and present-on-admission status. Also verify the documented accidental durotomy and the L4-L5 / L5-S1 fusion sites.`;
  if (e.id === DIABETES_ID) return 'In this explicitly synthetic extension, type 2 diabetes is documented with glucose 268 mg/dL and a single eGFR of 42. Please clarify clinically significant diabetes manifestations, if any: without complications, with hyperglycemia, with chronic kidney disease (identify documented stage and chronicity), both, another explanation, or unable to determine. Do not diagnose CKD from a single result. This query does not request a particular payment tier.';
  return 'Please clarify the clinically significant conditions and/or performed services associated with the attached source discrepancy. Document the condition or service, its relationship to the encounter, evaluation or treatment, or state another explanation, no additional condition, or unable to determine. No particular reimbursement outcome is requested.';
}

export function agentChecks(e: Encounter): AgentCheck[] {
  const kind = caseKind(e.id);
  const base = Math.round(e.claim.agent_confidence_score * 100);
  if (kind === 'fusion') return [
    { id: 'anatomy', title: 'Procedure & implant match', subtitle: 'Silo 1 + Silo 2 / ICD-10-PCS', confidence: 98, status: 'supported',
      conclusion: 'Add 0SG30AJ for L5-S1; retain 0SG00AJ for L4-L5. Two sites, not two lumbar-only joints.',
      forEvidence: ['Two named cages match L4-L5 and L5-S1 in the dictated procedure.', 'L5-S1 is the lumbosacral joint; 0SG30AJ matches that body part.'],
      againstEvidence: ['The imported 0SG10AJ means 2+ lumbar joints and does not substitute for the lumbosacral site.', 'UDI scans or longer OR time alone do not prove a procedure.'],
      missing: ['Original signature and documentation timestamps are not supplied. Human source verification is required.'],
      sourceIds: ['silo-1', 'silo-2'], criteria: ['FY2026 PCS anatomy, root operation, approach, device and qualifier must match.', 'CMS v43.1: two qualifying anterior-column fusion sites enter the multiple-level branch.'] },
    { id: 'dura', title: 'Documented dural complication', subtitle: 'Surgeon note / G97.41', confidence: 96, status: 'supported',
      conclusion: 'G97.41 is supported for coder review as a CC, never an MCC.',
      forEvidence: ['Source explicitly records accidental dural tear during the procedure.', 'Primary repair and DuraGen overlay demonstrate clinical management.'],
      againstEvidence: ['Alternative G97.48 concerns another nervous-system organ or structure; no such injury is documented. The note specifically names dura.', 'DuraGen use alone would not establish a procedural complication.', 'The source reference incorrectly labels G97.41 an MCC.'],
      missing: ['Verify provider authentication and full record; a demo signed response can complete this walkthrough.'],
      sourceIds: ['silo-2', 'silo-1'], criteria: ['Provider-documented causal relationship and clinically significant complication.', 'CMS Appendix C: G97.41 = CC.'] },
    { id: 'anemia', title: 'Postoperative anemia check', subtitle: 'Silo 3 + physician clarification / D62', confidence: e.review.query?.response === 'anemia-confirmed' || e.review.query?.response === 'no-change' ? 96 : 54,
      status: e.review.query?.response === 'anemia-confirmed' ? 'supported' : e.review.query?.response === 'no-change' ? 'blocked' : 'query',
      conclusion: e.review.query?.response === 'anemia-confirmed' ? 'Signed demo clarification supports D62 as a CC. No additional DRG change.' : e.review.query?.response === 'no-change' ? 'Provider clarification does not establish reportable anemia. D62 is excluded from the proposed claim.' : 'A physician anemia diagnosis is not supplied. Request documentation clarification before assigning D62.',
      forEvidence: [`Hgb ${e.recovery.preop_hgb_g_dl} to ${e.recovery.postop_nadir_hgb_g_dl} g/dL; ${e.recovery.prbc_units_transfused} units PRBC recorded.`, 'Therapeutic treatment supports reportability if the provider confirms the diagnosis.'],
      againstEvidence: ['Anemia etiology is not stated by a physician in the supplied progress record.', 'A transfusion is not itself a diagnosis. D62 is a CC, not an MCC.'],
      missing: e.review.query?.response === 'anemia-confirmed' || e.review.query?.response === 'no-change' ? [] : ['Provider diagnosis, clinical significance, and POA clarification.'],
      sourceIds: ['silo-3', ...e.review.notes.map(n => n.id)], criteria: ['ICD-10-CM I.A.19: provider diagnostic statement.', 'Section III: clinically significant additional diagnosis; abnormal findings require clinical significance.'] },
    { id: 'grouper', title: 'Coding year & grouper validation', subtitle: 'FY2026 v43.1 / independent rule check', confidence: 99, status: 'blocked',
      conclusion: 'Block imported 460 -> 459. Corrected demo path: 451 -> 448, driven by procedure extent, not an invented MCC.',
      forEvidence: ['July 23, 2026 discharge uses FY2026 v43.1.', '0SG00AJ + 0SG30AJ represent two qualifying sites; no MCC or custom-made device in the scoped scenario.'],
      againstEvidence: ['459/460 were retired effective FY2025.', 'D62 and G97.41 cannot create an MCC tier.', 'The $20,600 imported uplift is not a validated Medicare payment.'],
      missing: ['Production grouper, complete claim edits and payer-specific pricing are outside this demo.'],
      sourceIds: ['silo-1', 'silo-2', 'silo-3'], criteria: ['CMS v43.1 single-level 451 and multiple-level 448 definitions.', 'No curvature, malignancy, infection, extensive-fusion, combined-column or pre-MDC override in this scoped demo.'] },
  ];
  if (kind === 'diabetes') return [
    { id: 'diabetes', title: 'Diabetes specificity', subtitle: 'E11.9 vs E11.65 vs E11.22', confidence: e.review.query?.status === 'answered' && e.review.query.response !== 'undetermined' ? 95 : 48, status: e.review.query?.status === 'answered' && e.review.query.response !== 'undetermined' ? 'supported' : 'query',
      conclusion: e.review.query?.status === 'answered' && e.review.query.response !== 'undetermined' ? `Provider clarification supports ${proposal(e).diagnoses.slice(1).join(' + ')}. Review the linked signed response before approval.` : 'Clarify the documented diabetes manifestations. Hyperglycemia and CKD can coexist; neither is established by an isolated result.',
      forEvidence: ['The separate demo extension documents type 2 diabetes and active monitoring.', 'Glucose 268 and a single eGFR 42 are reasons to review, not diagnoses.'],
      againstEvidence: ['The untouched Epic inputs contain no diabetes data; all diabetes details are a labeled demo extension.', 'No documented CKD chronicity/stage or diabetic hyperglycemia in the initial extension.'],
      missing: e.review.query?.status === 'answered' && e.review.query.response !== 'undetermined' ? [] : ['Provider clarification of manifestations and clinical significance.', 'A provider CKD diagnosis and stage before E11.22 + N18.-.'],
      sourceIds: ['demo-diabetes', ...e.review.notes.map(n => n.id)], criteria: ['I.A.15: when diabetes and CKD are both documented, the indexed relationship is presumed unless stated unrelated.', 'E11.22: add the documented CKD stage. Do not retain E11.9 alongside a diabetes complication code.', 'E11.9, E11.65 and E11.22 alone are non-CC/MCC; the scoped fusion remains 451.'] },
    { id: 'group', title: 'DRG impact assessment', subtitle: 'Diabetes codes and severity classification', confidence: 99, status: 'supported',
      conclusion: 'The available diabetes clarification paths do not add an MCC. Keep the single-level fusion group.',
      forEvidence: ['The surgeon describes one L4-L5 fusion site.', 'N18.32 in the optional confirmed-CKD fixture is not an MCC.'],
      againstEvidence: ['A single eGFR does not establish chronic kidney disease.', 'The proposed diabetes code alternatives do not independently qualify as an MCC.'],
      missing: [], sourceIds: ['silo-2', 'demo-diabetes'], criteria: ['CMS v43.1 MS-DRG 451 without MCC.', 'Full code-set and exclusion checks, not disease labels, determine severity.'] },
  ];
  if (kind === 'charge') return [
    { id: 'charge', title: 'Implant-to-ledger reconciliation', subtitle: 'Silo 1 + separate consumption fixture', confidence: 98, status: 'supported',
      conclusion: 'Post one missing $3,900 illustrative gross charge after human approval. Expected payment does not change.',
      forEvidence: ['The original scan identifies the cranial mesh device.', 'The separate demo fixture confirms consumption and a missing, nonduplicate ledger event.'],
      againstEvidence: ['A scanned item may be unused, returned or wasted; a barcode is not sufficient.', 'Acquisition cost ($2,300) is not a charge or reimbursement.'],
      missing: [], sourceIds: ['silo-1', 'demo-charge'], criteria: ['Verify actual consumption, order, quantity, local charge item and duplicate status.', 'No change to the diagnosis/procedure group; bundled-payment assumption.'] },
  ];
  if (kind === 'false-positive') return [
    { id: 'false-positive', title: 'Respiratory failure alert rejected', subtitle: 'Silo 2 + Silo 3 / J95.821 not supported', confidence: 99, status: 'blocked',
      conclusion: 'Recommend rejecting the legacy alert, retaining the current claim. Routine airway management is not respiratory failure.',
      forEvidence: ['The operative report is uncomplicated.', 'Recovery note says extubated in OR; no physician diagnosis of postprocedural failure.'],
      againstEvidence: ['Two logged ventilator hours do not establish an unexpected complication.', 'Timing fields conflict; do not silently resolve the conflict into a diagnosis.'],
      missing: ['No provider diagnosis or evidence of clinically significant postprocedural respiratory failure.'],
      sourceIds: ['silo-2', 'silo-3', 'demo-alert'], criteria: ['Provider documentation and clinical significance are required.', 'Rejecting an unsupported alert does not add a code, a charge, or recovery.'] },
  ];
  return [
    { id: 'imported', title: 'Imported procedure & acuity signals', subtitle: 'Three read-only Epic silos', confidence: base, status: 'review',
      conclusion: 'Imported scoring is available for inspection, not authorization. Route the full record to a qualified coder.',
      forEvidence: [e.claim.exact_audit_evidence_extracted],
      againstEvidence: ['The supplied reference contains retired DRGs and incorrect severity labels.', 'This encounter is outside the four independently scoped walkthroughs.'],
      missing: ['Applicable-year grouping and complete provider-documentation validation.', 'Payer-specific pricing: an MS-DRG is not an NY Medicaid APR-DRG.'],
      sourceIds: ['silo-1', 'silo-2', 'silo-3'], criteria: ['No claim mutation from an imported score.', 'Full source-level human coding review required.'] },
  ];
}

function responseText(e: Encounter, answer: QueryResponse) {
  if (answer === 'anemia-confirmed') return 'SIMULATED SIGNED PROVIDER CLARIFICATION: Acute posthemorrhagic anemia developed after surgery (not present on admission), evaluated and treated with 2 units PRBC and repeat hemoglobin monitoring. The accidental 4 mm durotomy occurred during the procedure and required primary repair with DuraGen. L4-L5 and L5-S1 anterior-column interbody fusions were performed via a posterior open approach with standard, non-custom cages. No additional fused levels, spinal curvature, malignancy, infection, combined anterior/posterior-column fusion, other MCC, or higher-priority grouping condition in this completed demo record. These are supplemental synthetic assertions, not edits to the supplied Epic notes.';
  if (answer === 'no-change') return e.id === HERO_ID
    ? 'SIMULATED SIGNED PROVIDER CLARIFICATION: No additional reportable anemia diagnosis is established. The operative record confirms accidental durotomy requiring repair and L4-L5 plus L5-S1 interbody fusions, posterior open approach, anterior column, standard non-custom devices. No other MCC or higher-priority grouping branch in this scoped demo.'
    : 'SIMULATED SIGNED PROVIDER CLARIFICATION: Type 2 diabetes mellitus without complications; active inpatient monitoring. Transient laboratory changes do not establish diabetic hyperglycemia or CKD. No additional reportable diabetes complication is diagnosed.';
  if (answer === 'undetermined') return 'SIMULATED SIGNED PROVIDER RESPONSE: Unable to determine from available documentation. Keep the claim on hold and escalate; do not select a diagnosis for payment.';
  const hyper = answer === 'hyperglycemia' || answer === 'both';
  const ckd = answer === 'ckd' || answer === 'both';
  return `SIMULATED SIGNED PROVIDER CLARIFICATION: ${hyper ? 'Type 2 diabetes mellitus with hyperglycemia, present on admission, evaluated and treated with correctional insulin and monitoring. ' : ''}${ckd ? 'Type 2 diabetes mellitus with diabetic chronic kidney disease, stage 3b, present on admission; longitudinal records confirm chronicity. Renal function evaluated and medications reviewed. ' : 'No CKD is established. '}${!hyper ? 'No diabetic hyperglycemia is diagnosed. ' : ''}No additional MCC; all added conditions affected inpatient care. Temporary insulin is not long-term insulin use. This is a separate synthetic completion, not a finding in the imported data.`;
}

const claimSummary = (c: ClaimSnapshot) => `${c.diagnoses.join(', ')} | ${c.procedures.join(', ')} | MS-DRG ${c.drg} | charge ${c.chargePosted ? 'posted' : 'unchanged'} | r${c.revision}`;

export function transition(state: WorkbenchState, id: string, action: WorkflowAction, now = new Date().toISOString()): WorkbenchState {
  const raw = RAW.find(e => e.id === id);
  const original = state.reviews[id];
  if (!raw || !original) throw new WorkflowError('Encounter not found.');
  const review = structuredClone(original);
  const e: Encounter = { ...raw, review };
  if (review.status === 'submitted') throw new WorkflowError('This claim is already submitted in the simulator.');
  if (resolved(e) && !['submit', 'reopen'].includes(action.type)) throw new WorkflowError('This review is complete. Reopen it before making a new decision.');
  if ('rationale' in action && action.rationale.trim().length < 10) throw new WorkflowError('Record a specific rationale of at least 10 characters.');
  let actionLabel = '';
  let rationale = '';
  let actor = CURRENT_USER;
  switch (action.type) {
    case 'approve':
    case 'reject': {
      if (!DEEP_IDS.includes(id)) throw new WorkflowError('This imported mapping is not validated. Route it to a coder; automated claim changes are blocked.');
      if (!action.evidenceReviewed) throw new WorkflowError('Confirm that you reviewed the original sources and separately labeled demo supplements.');
      if ([HERO_ID, DIABETES_ID].includes(id) && (!review.query || review.query.status === 'open' || review.query.response === 'undetermined')) throw new WorkflowError('Request and resolve documentation clarification before approving or rejecting.');
      if (review.query?.status === 'open') throw new WorkflowError('Resolve the open query before completing this review.');
      if (action.type === 'approve' && id === FALSE_POSITIVE_ID) throw new WorkflowError('The respiratory failure alert is unsupported. Reject it instead of adding a diagnosis.');
      if (action.type === 'approve') {
        const proposed = proposal(e);
        const grouped = groupClaim(e, proposed);
        if (!grouped || grouped !== proposed.drg) throw new WorkflowError('The proposed claim does not pass the scoped grouper.');
        review.claim = { ...proposed, revision: original.claim.revision + 1 };
        review.status = 'approved';
        actionLabel = id === CHARGE_ID ? 'Charge correction approved' : 'Coding corrections approved';
      } else {
        review.status = 'rejected';
        actionLabel = id === FALSE_POSITIVE_ID ? 'False-positive alert rejected' : 'Recommendation rejected';
      }
      review.evidenceVerified = true;
      review.owner = CURRENT_USER;
      rationale = action.rationale;
      break;
    }
    case 'route':
      if (!['Jordan Ellis, CCS', 'Taylor Reed, RHIA'].includes(action.owner)) throw new WorkflowError('Select a coder from the demonstration roster.');
      review.status = 'routed'; review.owner = action.owner; review.coderDecision = undefined;
      actionLabel = 'Routed to coder'; rationale = `${action.owner}: ${action.rationale}`;
      break;
    case 'escalate':
      review.status = 'escalated'; review.owner = 'Clinical validation team';
      actionLabel = 'Escalated for clinical validation'; rationale = action.rationale;
      break;
    case 'request-query':
      if (review.query?.status === 'open') throw new WorkflowError('An open documentation query already exists.');
      if (action.queryText.trim().length < 30) throw new WorkflowError('Include the clinical context and a neutral clarification request.');
      review.query = { id: `Q-${id.slice(-5)}-${state.audit.length + 1}`, text: action.queryText.trim(), createdAt: now, status: 'open' };
      review.status = 'query-open'; actionLabel = 'Documentation query requested (simulated)';
      rationale = `${action.rationale}\n${action.queryText}`;
      break;
    case 'answer-query': {
      if (review.query?.status !== 'open') throw new WorkflowError('There is no open query to answer.');
      const permitted: QueryResponse[] = id === HERO_ID ? ['anemia-confirmed', 'no-change', 'undetermined'] : id === DIABETES_ID ? ['hyperglycemia', 'ckd', 'both', 'no-change', 'undetermined'] : ['undetermined'];
      if (!permitted.includes(action.answer)) throw new WorkflowError('This simulated response is not valid for this encounter.');
      review.query.status = 'answered'; review.query.response = action.answer;
      const text = responseText(e, action.answer);
      review.notes.push({
        id: `response-${state.audit.length + 1}`, title: 'Signed clarification / simulated',
        author: `${e.surgeon.attending_neurosurgeon} (demo persona)`, timestamp: now,
        text, source: 'Separate provider-response simulator; no Epic writeback', kind: 'response', synthetic: true,
      });
      review.status = action.answer === 'undetermined' ? 'escalated' : 'review';
      if (action.answer === 'undetermined') review.owner = 'Clinical validation team';
      actor = 'Provider response simulator'; actionLabel = 'Simulated signed clarification received'; rationale = text;
      break;
    }
    case 'reopen':
      review.status = 'review'; actionLabel = 'Review reopened'; rationale = action.rationale;
      break;
    case 'submit':
      if (!ready(e)) throw new WorkflowError('Resolve all claim blockers and complete human approval before submission.');
      if (action.fail) {
        actionLabel = 'Simulated submission failed';
        rationale = 'Demo transport unavailable. No claim transmitted or acknowledgement created. Approved claim remains ready for retry.';
      } else {
        review.status = 'submitted';
        review.receipt = `SIM-${id.slice(-5)}-R${review.claim.revision}`;
        actionLabel = 'Claim accepted by simulator';
        rationale = `Simulated receipt ${review.receipt}. No EDI transmission, payer connection, clinical writeback, or actual payment.`;
      }
      break;
  }
  return {
    ...state, reviews: { ...state.reviews, [id]: review },
    audit: [{
      id: `${id}-${state.audit.length + 1}`, encounterId: id, timestamp: now, actor,
      action: actionLabel, rationale: rationale.trim(), before: claimSummary(original.claim), after: claimSummary(review.claim),
    }, ...state.audit],
  };
}

export function parseSavedState(raw: string): WorkbenchState {
  const state = stateSchema.parse(JSON.parse(raw));
  if (Object.keys(state.reviews).length !== RAW.length || RAW.some(e => !state.reviews[e.id])) throw new WorkflowError('The saved portfolio does not match the 80-encounter dataset.');
  getEncounters(state).forEach(e => {
    if (['approved', 'submitted'].includes(e.review.status) && groupClaim(e, e.review.claim) !== e.review.claim.drg) throw new WorkflowError('The saved claim does not match the validated demonstration branch.');
  });
  return state;
}

export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return 'The saved demo is incomplete or invalid. Reset the demo to restore the original portfolio.';
  return error instanceof Error ? error.message : 'The operation failed. No claim changes were saved.';
}
export function exportCsv(encounters: Encounter[]) {
  const rows = [
    ['Synthetic patient', 'Encounter', 'Facility', 'Payer', 'Status', 'Imported exposure (illustrative/unvalidated)', 'Current claim DRG', 'Validated recovery (illustrative)', 'Owner'],
    ...encounters.map(e => [e.census.patient_name, e.id, e.census.facility_name, e.census.payer_name, e.review.status, e.claim.revenue_left_on_table_usd, e.review.claim.drg, validatedRecovery(e), e.review.owner]),
  ];
  return rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
export function codeLabel(code: string) { return CODE_LABELS[code] ?? 'Imported code: full validation required'; }

export function documentationLinks(e: Encounter): CodeDocumentation[] {
  const notes = notesFor(e);
  const response = [...e.review.notes].reverse().find(n => n.kind === 'response');
  const source = (id: string) => notes.find(n => n.id === id)!;
  const statement = (text: string, start: string) => {
    const index = text.indexOf(start);
    if (index < 0) return text;
    const end = text.indexOf('. ', index);
    return text.slice(index, end < 0 ? text.length : end + 1);
  };
  if (e.id === HERO_ID) return [
    { code: '0SG30AJ', description: codeLabel('0SG30AJ'), checkId: 'anatomy', sourceId: 'silo-2', classification: 'ICD-10-PCS',
      status: 'Linked', excerpt: 'Two titanium interbody cages were impacted at L4-L5 and L5-S1 with local autograft and DBM.' },
    { code: 'G97.41', description: codeLabel('G97.41'), checkId: 'dura', sourceId: 'silo-2', classification: 'CC',
      status: 'Linked', excerpt: 'An incidental 4mm ventral durotomy at L5-S1 was repaired primarily with 6-0 Prolene and overlaid with DuraGen matrix.' },
    { code: 'G97.48', description: codeLabel('G97.48'), checkId: 'dura', sourceId: 'silo-2', classification: 'CC · alternative considered',
      status: 'Not supported', excerpt: 'An incidental 4mm ventral durotomy at L5-S1 was repaired primarily with 6-0 Prolene and overlaid with DuraGen matrix.' },
    { code: 'D62', description: codeLabel('D62'), checkId: 'anemia',
      sourceId: response && e.review.query?.response === 'anemia-confirmed' ? response.id : 'silo-3', classification: 'CC',
      status: e.review.query?.response === 'anemia-confirmed' ? 'Linked' : e.review.query?.response === 'no-change' ? 'Not supported' : 'Query required',
      excerpt: response && e.review.query?.response === 'anemia-confirmed' ? statement(response.text, 'Acute posthemorrhagic anemia') : e.recovery.nursing_flowsheet_note },
  ];
  if (e.id === DIABETES_ID) {
    const result = e.review.query?.response;
    return [
      { code: 'E11.9', description: codeLabel('E11.9'), checkId: 'diabetes', classification: 'Non-CC/MCC',
        sourceId: response && result === 'no-change' ? response.id : 'demo-diabetes',
        status: result && ['hyperglycemia', 'ckd', 'both'].includes(result) ? 'Not selected' : 'Current code',
        excerpt: response && result === 'no-change' ? statement(response.text, 'Type 2 diabetes mellitus without complications') : 'Baseline demonstration claim includes E11.9.' },
      { code: 'E11.65', description: codeLabel('E11.65'), checkId: 'diabetes', classification: 'Non-CC/MCC',
        sourceId: response && ['hyperglycemia', 'both'].includes(result ?? '') ? response.id : 'demo-diabetes',
        status: result && ['hyperglycemia', 'both'].includes(result) ? 'Linked' : result && ['ckd', 'no-change'].includes(result) ? 'Not supported' : 'Query required',
        excerpt: response && ['hyperglycemia', 'both'].includes(result ?? '') ? statement(response.text, 'Type 2 diabetes mellitus with hyperglycemia') : 'Serum glucose 268 mg/dL.' },
      { code: 'E11.22', description: `${codeLabel('E11.22')} · add documented N18.- stage`, checkId: 'diabetes', classification: 'Non-CC/MCC',
        sourceId: response && ['ckd', 'both'].includes(result ?? '') ? response.id : 'demo-diabetes',
        status: result && ['ckd', 'both'].includes(result) ? 'Linked' : result && ['hyperglycemia', 'no-change'].includes(result) ? 'Not supported' : 'Query required',
        excerpt: response && ['ckd', 'both'].includes(result ?? '') ? statement(response.text, 'Type 2 diabetes mellitus with diabetic chronic kidney disease') : 'A single eGFR of 42 mL/min/1.73 m2 is present; renal chronicity, a provider CKD diagnosis, and CKD stage are not established.' },
    ];
  }
  if (e.id === CHARGE_ID) return [{
    code: '0278', description: 'Cranial mesh implant / local charge item', checkId: 'charge', sourceId: 'demo-charge',
    classification: 'Revenue code', status: 'Linked',
    excerpt: statement(source('demo-charge').text, 'For this walkthrough only:'),
  }];
  if (e.id === FALSE_POSITIVE_ID) return [{
    code: 'J95.821', description: codeLabel('J95.821'), checkId: 'false-positive', sourceId: 'silo-3',
    classification: 'Diagnosis not supported', status: 'Not supported', excerpt: e.recovery.nursing_flowsheet_note,
  }];
  return [];
}
