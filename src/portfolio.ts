import imported from './data/imported.json';
import type { CaseKind, LedgerLine, SourceNote, WorkbenchState } from './model';
import { CHARGE_ASSUMPTIONS } from './paymentAssumptions';

export type RawEncounter = typeof imported.encounters[number];
export type Encounter = RawEncounter & { review: WorkbenchState['reviews'][string] };
export const RAW = imported.encounters;
export const SOURCE_TOTALS = imported.sourceTotals;
export const INPUT_FILES = imported.files;
export const INPUT_RULES = imported.rules;
export const STORAGE_KEY = 'claimshero-workbench-v1';
export const CURRENT_USER = 'Morgan Lee';
export const HERO_ID = 'EPIC-ENC-80026';
export const DIABETES_ID = 'EPIC-ENC-80076';
export const CHARGE_ID = 'EPIC-ENC-80073';
export const FALSE_POSITIVE_ID = 'EPIC-ENC-80068';
export const DEEP_IDS = [HERO_ID, DIABETES_ID, CHARGE_ID, FALSE_POSITIVE_ID];
export const CODE_LABELS: Record<string, string> = {
  'M48.062': 'Spinal stenosis, lumbar region with neurogenic claudication',
  'D62': 'Acute posthemorrhagic anemia',
  'G97.41': 'Accidental puncture or laceration of dura during a procedure',
  'G97.48': 'Accidental puncture and laceration of other nervous system organ or structure during a nervous system procedure',
  'E11.9': 'Type 2 diabetes mellitus without complications',
  'E11.65': 'Type 2 diabetes mellitus with hyperglycemia',
  'E11.22': 'Type 2 diabetes mellitus with diabetic chronic kidney disease',
  'N18.32': 'Chronic kidney disease, stage 3b',
  'C71.2': 'Malignant neoplasm of temporal lobe',
  'J95.821': 'Acute postprocedural respiratory failure',
  'G93.6': 'Cerebral edema',
  '0SG00AJ': 'L4-L5: lumbar vertebral joint fusion, interbody device, posterior approach, anterior column, open',
  '0SG30AJ': 'L5-S1: lumbosacral joint fusion, interbody device, posterior approach, anterior column, open',
  '0SG10AJ': 'Fusion of 2 or more lumbar vertebral joints, interbody device, posterior approach, anterior column, open',
  '00B00ZZ': 'Excision of brain, open approach',
};
export const DRG_LABELS: Record<string, string> = {
  '451': 'Single level spinal fusion except cervical without MCC',
  '450': 'Single level spinal fusion except cervical with MCC or custom-made device',
  '448': 'Multiple level spinal fusion except cervical without MCC',
  '447': 'Multiple level spinal fusion except cervical with MCC or custom-made device',
  '027': 'Craniotomy and endovascular intracranial procedures without CC/MCC',
  '460': 'Legacy spinal fusion except cervical without MCC (retired)',
  '459': 'Legacy spinal fusion except cervical with MCC (retired)',
};
export const WALKTHROUGHS = [
  { id: HERO_ID, kind: 'fusion', number: '01', title: 'Multi-level lumbar fusion', subtitle: 'Procedure / D62 / G97.41 review', tag: 'Featured case', icon: 'brain' },
  { id: DIABETES_ID, kind: 'diabetes', number: '02', title: 'Diabetes specificity', subtitle: 'Documentation clarification', tag: 'Query required', icon: 'message' },
  { id: CHARGE_ID, kind: 'charge', number: '03', title: 'Missing implant charge', subtitle: 'Consumption-to-ledger match', tag: 'Charge review', icon: 'scan' },
  { id: FALSE_POSITIVE_ID, kind: 'false-positive', number: '04', title: 'Unsupported coding alert', subtitle: 'Postoperative respiratory review', tag: 'False positive', icon: 'shield' },
] as const;

const CMS = 'https://www.cms.gov/icd10m/FY2026-fr-v43.1-fullcode-cms/fullcode_cms/';
export const REFERENCES = [
  { id: 'single', title: 'Single-level fusion: MS-DRGs 450 / 451', source: 'CMS MS-DRG v43.1 · FY2026', url: `${CMS}P0202.html`, finding: 'A qualifying single-level non-cervical fusion without MCC maps to 451, not the retired 460. The demo excludes custom-made anatomical devices and higher-priority branches.' },
  { id: 'multi', title: 'Multiple-level fusion: MS-DRGs 447 / 448', source: 'CMS MS-DRG v43.1 · FY2026', url: `${CMS}P0199.html`, finding: 'Two qualifying single-level anterior-column fusion procedures, without MCC or a custom-made anatomical device, support MS-DRG 448. Posterior surgical approach does not mean posterior-column fusion.' },
  { id: 'd62', title: 'D62 is a CC, not an MCC', source: 'CMS v43.1 · Appendix C', url: `${CMS}P1221.html`, finding: 'Acute posthemorrhagic anemia is a CC. Low hemoglobin and transfusion are query indicators, not permission to invent a provider diagnosis.' },
  { id: 'g9741', title: 'G97.41 is a CC, not an MCC', source: 'CMS v43.1 · Appendix C', url: `${CMS}P1223.html`, finding: 'Accidental puncture or laceration of dura during a procedure is a CC. Provider documentation, procedural relationship and clinical significance must be reviewed.' },
  { id: 'guidelines', title: 'FY2026 coding and reporting guidelines', source: 'CMS / NCHS · I.A.15, I.A.19, I.C.4, Section III', url: 'https://www.cms.gov/files/document/fy-2026-icd-10-cm-coding-guidelines.pdf', finding: 'Use provider documentation and reportability criteria. Do not infer CKD from one eGFR or hyperglycemia from a glucose value. When diabetes and CKD are both documented, the indexed "with" relationship is presumed unless stated unrelated; add the documented CKD stage.' },
  { id: 'diabetes', title: 'E11.9, E11.65 and E11.22 severity', source: 'CMS v43.1 · Appendix C, diabetes range', url: `${CMS}P1221.html`, finding: 'These three diabetes codes are not CC/MCCs by themselves. E11.22 requires an additional N18.- stage code; any severity comes from the actual full code set, not diabetes alone.' },
  { id: 'cranial', title: 'Craniotomy: MS-DRGs 025 / 026 / 027', source: 'CMS v43.1 · MDC 01', url: `${CMS}P0052.html`, finding: 'Without a qualifying CC/MCC and without a higher-priority branch, the seeded uncomplicated craniotomy remains 027. Routine postoperative ventilation is not a diagnosis of respiratory failure.' },
  { id: 'retired', title: 'Spinal fusion DRG redesign effective FY2025', source: 'ISASS summary of the Medicare 2025 final rule', url: 'https://isass.org/medicare-2025-inpatient-final-rule/', finding: '459/460 and 453-455 were deleted. The imported proposals are preserved as supplied, but are not accepted as current-year grouper results.' },
  { id: 'loinc-hgb', title: 'LOINC 718-7: hemoglobin in blood', source: 'Regenstrief Institute · LOINC', url: 'https://loinc.org/718-7/', finding: 'Demo semantic mapping to the supplied hemoglobin fields. The original source has no LOINC identifiers; the mapping is explicitly a separate overlay.' },
  { id: 'loinc-na', title: 'LOINC 2951-2: sodium in serum or plasma', source: 'Regenstrief Institute · LOINC', url: 'https://loinc.org/2951-2/', finding: 'Demo semantic mapping, not a newly discovered source identifier. Original source rows remain unchanged.' },
];

export function caseKind(id: string): CaseKind {
  return id === HERO_ID ? 'fusion' : id === DIABETES_ID ? 'diabetes' : id === CHARGE_ID ? 'charge' : id === FALSE_POSITIVE_ID ? 'false-positive' : 'portfolio';
}
export function shortArchetype(e: RawEncounter) {
  const name = e.claim.clinical_archetype;
  return name.startsWith('Lumbar') ? 'Lumbar fusion' : name.startsWith('Combined') ? 'Combined spinal fusion' : name.startsWith('Craniotomy') ? 'Craniotomy' : name.startsWith('Cervical') ? 'Cervical fusion' : 'Ventricular shunt';
}
export function titleFor(e: RawEncounter) {
  return caseKind(e.id) === 'diabetes' ? 'Diabetes documentation query' : caseKind(e.id) === 'charge' ? 'Unposted implant charge' : caseKind(e.id) === 'false-positive' ? 'Unsupported respiratory alert' : shortArchetype(e);
}
export function createInitialState(): WorkbenchState {
  const reviews: WorkbenchState['reviews'] = {};
  for (const e of RAW) {
    const principal = e.claim.baseline_icd10_cm.split(' ')[0];
    reviews[e.id] = {
      status: 'review', owner: 'Unassigned', evidenceVerified: false, notes: [], analysisReady: true, isNew: false,
      claim: {
        diagnoses: [principal, ...(e.id === DIABETES_ID ? ['E11.9'] : [])],
        procedures: e.claim.baseline_icd10_pcs.split(',').map(p => p.trim()),
        drg: e.claim.baseline_ms_drg, chargePosted: false, revision: 1,
      },
    };
  }
  return {
    version: 2, reviews,
    demo: { automaticNotifications: true, notificationIndex: 0, notifications: [], lastReviewed: [] },
    audit: [{
      id: 'import-1', encounterId: 'portfolio', timestamp: '2026-11-05T09:00:00-05:00',
      actor: 'Read-only import (demo)', action: '80 encounters reconciled',
      rationale: 'CSV/SQLite values reconcile. Three Epic silos and all nine attachments preserved byte-for-byte. Imported estimates are unvalidated. Demonstration extensions are stored separately.',
      before: 'Source files', after: 'No clinical source or claim modified',
    }],
  };
}
export function getEncounters(state: WorkbenchState): Encounter[] {
  return RAW.map(e => ({ ...e, review: state.reviews[e.id] }));
}
export function deviceItems(e: RawEncounter): { udi: string; item: string; cost_usd: number }[] {
  return JSON.parse(e.nurse.udi_barcodes_scanned_json);
}

export function notesFor(e: Encounter): SourceNote[] {
  const notes: SourceNote[] = [
    { id: 'silo-1', title: 'Nurse OpTime & device scan record', author: e.nurse.circulating_nurse_id, source: 'epic_optime_nurse_logs', kind: 'procedure', synthetic: false, text: `Default picklist: ${e.nurse.optime_default_checkbox_selected}\nDefault PCS: ${e.nurse.optime_default_icd10_pcs_dropped}\nOR start ${e.nurse.or_cut_time}; close ${e.nurse.or_close_time} (date not supplied).\n${e.nurse.actual_or_minutes} minutes; estimated blood loss ${e.nurse.estimated_blood_loss_ml} mL.\n${deviceItems(e).map(d => `${d.udi} | ${d.item} | acquisition cost $${d.cost_usd}`).join('\n')}` },
    { id: 'silo-2', title: 'Surgeon operative report', author: e.surgeon.attending_neurosurgeon, source: 'epic_surgeon_op_notes', kind: 'note', synthetic: false, text: e.surgeon.unstructured_op_note_narrative, highlight: e.id === HERO_ID ? 'An incidental 4mm ventral durotomy at L5-S1 was repaired primarily with 6-0 Prolene and overlaid with DuraGen matrix.' : undefined },
    { id: 'silo-3', title: 'Recovery nursing, labs & MAR', author: 'Recovery nursing (source author not supplied)', source: 'epic_postop_nursing_labs', kind: 'lab', synthetic: false, text: `${e.recovery.nursing_flowsheet_note}\nPre-op Hgb ${e.recovery.preop_hgb_g_dl} g/dL; postoperative nadir ${e.recovery.postop_nadir_hgb_g_dl} g/dL; PRBC ${e.recovery.prbc_units_transfused} units.\nSodium ${e.recovery.postop_sodium_meq_l} mEq/L. Ventilator hours ${e.recovery.icu_ventilator_hours}.\nSurgeon diagnosis in progress note: ${e.recovery.surgeon_wrote_diagnosis_in_progress_note ? 'flag present (text not supplied)' : 'not documented'}.` },
  ];
  if (e.id === DIABETES_ID) notes.push({
    id: 'demo-diabetes', title: 'Diabetes review fixture', author: 'Demonstration extension', timestamp: '2026-09-12T08:30:00-04:00',
    source: 'Separate synthetic extension; not an Epic source row', kind: 'note', synthetic: true,
    text: 'Baseline demonstration claim includes E11.9. Medical assessment: type 2 diabetes, bedside monitoring and short-term correctional insulin. Serum glucose 268 mg/dL. A single eGFR of 42 mL/min/1.73 m2 is present; renal chronicity, a provider CKD diagnosis, and CKD stage are not established. No documented diabetic hyperglycemia, DKA or HHS. Ask the provider to clarify the clinically significant conditions; do not infer them from these measurements.',
    highlight: 'renal chronicity, a provider CKD diagnosis, and CKD stage are not established.',
  });
  if (e.id === CHARGE_ID) notes.push({
    id: 'demo-charge', title: 'Implant consumption / ledger fixture', author: 'Demo circulating nurse + charge analyst', timestamp: '2026-08-29T13:15:00-04:00',
    source: 'Separate synthetic consumption and charge ledger', kind: 'procedure', synthetic: true,
    text: 'For this walkthrough only: one cranial titanium mesh set from the existing scan record was confirmed implanted, not returned or wasted. Consumption event IMP-80073-01 is matched to the operative case. The demonstration charge ledger omits this event; a duplicate search found none. Acquisition cost $2,300 is NOT the charge. Local illustrative gross charge: $3,900. No separate payment or DRG change is assumed.',
  });
  if (e.id === FALSE_POSITIVE_ID) notes.push({
    id: 'demo-alert', title: 'Legacy rules alert / false-positive fixture', author: 'Demonstration rule', timestamp: '2026-07-07T10:00:00-04:00',
    source: 'Separate synthetic alert; not a provider diagnosis', kind: 'note', synthetic: true,
    text: 'A deliberately over-sensitive rule flagged J95.821 (acute postprocedural respiratory failure) because the source has 2 ventilator hours. The source narrative says extubated in OR; no provider diagnosis of failure or unexpected ventilatory support exists. The source fields conflict on timing. Do not infer a complication from routine airway management; reject the unsupported alert.',
  });
  return [...notes, ...e.review.notes];
}

export function ledgerFor(e: Encounter): LedgerLine[] {
  const devices = deviceItems(e);
  return [
    { id: 'room', description: 'Room & board / inpatient stay', revenueCode: '0120', units: e.census.length_of_stay_days, unitPrice: CHARGE_ASSUMPTIONS.roomPerDay, status: 'posted', sourceId: 'silo-3' },
    { id: 'or', description: 'Operating room / illustrative time charge', revenueCode: '0360', units: e.nurse.actual_or_minutes, unitPrice: CHARGE_ASSUMPTIONS.operatingRoomPerMinute, status: 'posted', sourceId: 'silo-1' },
    { id: 'lab', description: 'Recovery laboratory & pharmacy bundle', revenueCode: '0300', units: 1, unitPrice: CHARGE_ASSUMPTIONS.recoveryBundle, status: 'posted', sourceId: 'silo-3' },
    ...devices.map((d, i): LedgerLine => ({
      id: `device-${i}`, description: d.item, revenueCode: '0278', units: 1,
      unitPrice: e.id === CHARGE_ID && i === 1 ? CHARGE_ASSUMPTIONS.missingMeshCharge : Math.round(d.cost_usd * CHARGE_ASSUMPTIONS.deviceChargeMultiplier),
      status: e.id === CHARGE_ID && i === 1 && !e.review.claim.chargePosted ? 'missing' : 'posted',
      sourceId: e.id === CHARGE_ID && i === 1 ? 'demo-charge' : 'silo-1',
    })),
  ];
}
