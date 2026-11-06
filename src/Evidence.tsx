import { useState } from 'react';
import { Activity, ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, Clock3, ExternalLink, FileCode2, FileText, FlaskConical, GitCompareArrows, Info, LockKeyhole, ScanBarcode, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, Confidence, EvidenceButton, Modal, Notice, SectionHeading } from './components';
import { caseKind, CHARGE_ID, DIABETES_ID, DRG_LABELS, HERO_ID, notesFor, REFERENCES, deviceItems, type Encounter } from './portfolio';
import { agentChecks, baselinePayment, codeLabel, documentationLinks, expectedPayment, fullDate, groupClaim, money, proposal, resolved } from './workflow';
import { PAYMENT_ASSUMPTIONS } from './paymentAssumptions';
import type { ClaimSnapshot } from './model';

export type OpenEvidence = (checkId?: string, sourceId?: string, code?: string) => void;

export function SourceSilos({ encounter: e, onEvidence }: { encounter: Encounter; onEvidence: OpenEvidence }) {
  const devices = deviceItems(e);
  return <section className="source-section">
    <SectionHeading title="Clinical source records" subtitle="Three read-only Epic silos linked to this encounter." action={<span className="source-readonly"><LockKeyhole size={13} />Original records unchanged</span>} />
    <div className="silo-grid">
      <button className="silo-card" onClick={() => onEvidence(undefined, 'silo-1')}>
        <div className="silo-heading"><span className="silo-icon blue"><ScanBarcode size={19} /></span><span className="eyebrow">SILO 1</span><LockKeyhole size={12} /></div>
        <h3>Nurse OpTime</h3><span className="silo-subtitle">FDA UDI barcodes & OR log</span>
        <div className="silo-highlight"><b>{devices.length}</b><span>scanned devices</span><i /><b>{e.nurse.actual_or_minutes}</b><span>OR minutes</span></div>
        <p>{e.nurse.optime_default_checkbox_selected}</p>
        <div className="silo-footer"><code>{e.nurse.optime_default_icd10_pcs_dropped}</code><span>View original<ChevronRight size={13} /></span></div>
      </button>
      <button className="silo-card" onClick={() => onEvidence(undefined, 'silo-2')}>
        <div className="silo-heading"><span className="silo-icon purple"><FileText size={19} /></span><span className="eyebrow">SILO 2</span><LockKeyhole size={12} /></div>
        <h3>Surgeon op note</h3><span className="silo-subtitle">Dictated procedure & complications</span>
        <div className="silo-quote">“{e.surgeon.unstructured_op_note_narrative.replace('OPERATIVE REPORT: ', '').slice(0, 130)}{e.surgeon.unstructured_op_note_narrative.length > 148 ? '…' : ''}”</div>
        <div className="silo-footer"><span className="ellipsis">{e.surgeon.documented_anatomical_levels_or_sites}</span><span>View original<ChevronRight size={13} /></span></div>
      </button>
      <button className="silo-card" onClick={() => onEvidence(undefined, 'silo-3')}>
        <div className="silo-heading"><span className="silo-icon amber"><FlaskConical size={19} /></span><span className="eyebrow">SILO 3</span><LockKeyhole size={12} /></div>
        <h3>Recovery labs / MAR</h3><span className="silo-subtitle">LOINC-mapped labs & treatment</span>
        <div className="silo-highlight"><span>Hgb</span><b>{e.recovery.preop_hgb_g_dl}</b><ArrowRight size={14} /><b className={e.recovery.postop_nadir_hgb_g_dl < 8 ? 'warning-text' : ''}>{e.recovery.postop_nadir_hgb_g_dl}</b><span>g/dL</span></div>
        <p>{e.recovery.prbc_units_transfused} units PRBC · Sodium {e.recovery.postop_sodium_meq_l} mEq/L</p>
        <div className="silo-footer"><span>LOINC overlay · not in raw input</span><ChevronRight size={13} /></div>
      </button>
    </div>
    <div className="silo-trace"><span /><div><LayersIcon />Source documents</div><ArrowRight size={13} /><div><Sparkles size={13} />Code validation</div><ArrowRight size={13} /><div><ShieldCheck size={13} />Reviewer approval</div><span /></div>
  </section>;
}

function LayersIcon() { return <FileCode2 size={13} />; }

function Highlight({ text, phrase }: { text: string; phrase?: string }) {
  if (!phrase || !text.includes(phrase)) return <>{text}</>;
  const at = text.indexOf(phrase);
  return <>{text.slice(0, at)}<mark>{phrase}</mark>{text.slice(at + phrase.length)}</>;
}

export function EvidenceDrawer({ encounter: e, checkId, sourceId, code, onClose }: {
  encounter: Encounter; checkId?: string; sourceId?: string; code?: string; onClose: () => void;
}) {
  const checks = agentChecks(e);
  const links = documentationLinks(e);
  const initialCode = code ?? links.find(link => link.checkId === checkId)?.code;
  const [selectedCode, setSelectedCode] = useState(initialCode);
  const support = links.find(link => link.code === selectedCode);
  const check = checks.find(c => c.id === (support?.checkId ?? checkId));
  const notes = notesFor(e);
  const [selectedSource, setSelectedSource] = useState(sourceId ?? support?.sourceId ?? check?.sourceIds[0] ?? 'silo-2');
  const [tab, setTab] = useState('source');
  const note = notes.find(n => n.id === selectedSource) ?? notes[0];
  const rawSource = selectedSource === 'silo-1' ? e.nurse : selectedSource === 'silo-2' ? e.surgeon : selectedSource === 'silo-3' ? e.recovery : undefined;
  return <Modal title="Supporting documentation" subtitle={`${e.census.patient_name} · ${e.id}`} onClose={onClose} drawer>
    {links.length > 0 && <div className="documentation-code-picker" role="group" aria-label="Code documentation links">{links.map(link => <button key={link.code} className={selectedCode === link.code ? 'active' : ''} onClick={() => { setSelectedCode(link.code); setSelectedSource(link.sourceId); setTab('source'); }}><code>{link.code}</code><span className={`link-status-dot ${link.status === 'Linked' ? 'linked' : link.status === 'Query required' ? 'query' : 'neutral'}`} /></button>)}</div>}
    {(check || support || selectedCode) && <div className="evidence-check-heading"><div><span className="eyebrow">{support ? `${support.classification} / DOCUMENTATION REVIEW` : selectedCode ? 'CLAIM CODE / SOURCE DOCUMENTATION' : 'CODING VALIDATION'}</span><h3>{support ? <><code className="review-code">{support.code}</code>{support.description}</> : selectedCode ? <><code className="review-code">{selectedCode}</code>{codeLabel(selectedCode)}</> : check?.title}</h3>{support ? <div className="code-document-status"><Badge tone={support.status === 'Linked' || support.status === 'Current code' ? 'green' : support.status === 'Query required' ? 'amber' : 'neutral'}>{support.status}</Badge><span>Reviewer: {e.review.evidenceVerified ? e.review.owner : 'Pending review'}</span></div> : <p>{check?.subtitle}</p>}</div>{check && <Confidence score={check.confidence} />}</div>}
    <div className="modal-tabs">{(check ? ['source', 'reasoning', 'criteria'] : ['source', 'criteria']).map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'reasoning' ? 'Code rationale' : t === 'source' ? 'Documentation' : 'Coding guidance'}</button>)}</div>
    {tab === 'reasoning' && check && <div className="reasoning-content">
      <Notice tone={check.status === 'blocked' || check.status === 'query' ? 'warning' : 'success'} title="Coding assessment">{check.conclusion}</Notice>
      <section className="evidence-list"><h4><Check size={16} />Documented findings</h4>{check.forEvidence.map(t => <p key={t}><span className="evidence-dot" />{t}</p>)}</section>
      <section className="evidence-list counter-evidence"><h4><CircleAlert size={16} />{support?.code === 'G97.41' ? 'Alternative considered: G97.48' : 'Coding considerations'}</h4>{check.againstEvidence.map(t => <p key={t}><span className="evidence-dot" />{t}</p>)}</section>
      <section className="missing-box"><h4><Info size={15} />Outstanding documentation requirements</h4>{check.missing.length ? check.missing.map(t => <p key={t}>{t}</p>) : <p>No outstanding documentation requirement in this review. Reviewer approval is pending unless already recorded.</p>}</section>
      <div className="linked-notes"><h4>Related documents</h4>{notes.filter(n => check.sourceIds.includes(n.id)).map(n => <button key={n.id} onClick={() => { setSelectedSource(n.id); setTab('source'); }}><FileText size={16} /><div><strong>{n.title}</strong><span>{n.timestamp ? fullDate(n.timestamp) : 'Documentation timestamp not supplied'}</span></div><ChevronRight size={16} /></button>)}</div>
      <p className="fine-print">Scores are illustrative check-level confidence, not calibrated clinical probabilities. The deterministic demo agent does not independently diagnose a patient.</p>
    </div>}
    {tab === 'source' && <>
      {support && selectedSource === support.sourceId && <div className={`supporting-excerpt ${support.status === 'Query required' || support.status === 'Not supported' ? 'incomplete' : ''}`}><div><FileText size={15} /><strong>{support.status === 'Query required' ? 'Clinical indicators · provider clarification required' : support.status === 'Not supported' ? 'Source reviewed · diagnosis not established' : `Documentation linked to ${support.code}`}</strong></div><blockquote>“{support.excerpt}”</blockquote><span>{note.title} · {note.timestamp ? fullDate(note.timestamp) : 'Timestamp not supplied'}</span></div>}
      <label className="field-label">Source record<select className="full-select" aria-label="Select evidence source" value={note.id} onChange={ev => setSelectedSource(ev.target.value)}>{notes.map(n => <option value={n.id} key={n.id}>{n.title}{n.synthetic ? ' (demo extension)' : ' (untouched input)'}</option>)}</select></label>
      <div className="document-card">
        <div className="document-top"><span><FileText size={17} />{note.title}</span><Badge tone={note.synthetic ? 'purple' : 'green'}>{note.synthetic ? 'Separate demo extension' : 'Read-only source'}</Badge></div>
        <dl className="document-metadata"><div><dt>Encounter</dt><dd className="mono">{e.id}</dd></div><div><dt>Author</dt><dd>{note.author}</dd></div><div><dt>Documented at</dt><dd>{note.timestamp ? `${fullDate(note.timestamp)} ET` : 'Not supplied in the attached source'}</dd></div><div><dt>Authentication</dt><dd>{note.kind === 'response' ? 'Simulated signed provider response' : note.synthetic ? 'Labeled synthetic fixture' : 'Signature metadata not supplied'}</dd></div><div><dt>Source</dt><dd className="source-path">{note.source}</dd></div>{selectedSource === 'silo-2' && <><div><dt>Preoperative diagnosis</dt><dd>{e.surgeon.preop_diagnosis_text}</dd></div><div><dt>Postoperative diagnosis</dt><dd>{e.surgeon.postop_diagnosis_text}</dd></div></>}</dl>
        <div className="document-body"><Highlight text={note.text} phrase={support && support.sourceId === note.id ? support.excerpt : note.highlight} /></div>
        {selectedSource === 'silo-3' && <div className="mapping-note"><BookOpen size={15} /><div><strong>Semantic overlay (not original source fields)</strong><p>Hgb → <a href="https://loinc.org/718-7/" target="_blank" rel="noreferrer">LOINC 718-7</a>; sodium → <a href="https://loinc.org/2951-2/" target="_blank" rel="noreferrer">LOINC 2951-2</a>. Original inputs have no LOINC IDs or result timestamps.</p></div></div>}
        {selectedSource === 'silo-1' && <p className="mapping-note"><Info size={15} />UDI strings are synthetic supplied barcode examples, not FDA/GUDID-verified device identities. Acquisition costs are not charges.</p>}
      </div>
      {rawSource && <details className="raw-source"><summary>Inspect untouched source row (all fields)</summary><pre>{JSON.stringify(rawSource, null, 2)}</pre></details>}
      <p className="source-record-footer"><LockKeyhole size={13} />Read-only clinical record. Claim revisions and review decisions are stored separately.</p>
    </>}
    {tab === 'criteria' && <div className="criteria-panel">
      {check && <section className="evidence-list"><h4>Rules applied to this decision</h4>{check.criteria.map(t => <p key={t}><BookOpen size={15} />{t}</p>)}</section>}
      <Notice tone="warning" title="Use the coding year of discharge">The four walkthroughs use FY2026 v43.1 (April–September 2026). October 2026 records remain queued for FY2027 validation. Imported retired DRGs are not accepted as current results.</Notice>
      {REFERENCES.slice(0, 8).map(r => <a className="reference-card" href={r.url} key={r.id} target="_blank" rel="noreferrer"><div><span>{r.source}</span><strong>{r.title}</strong><p>{r.finding}</p></div><ExternalLink size={16} /></a>)}
    </div>}
  </Modal>;
}

export function CodeComparison({ encounter: e, onEvidence }: { encounter: Encounter; onEvidence: OpenEvidence }) {
  const kind = caseKind(e.id);
  const applied = e.review.status === 'approved' || e.review.status === 'submitted';
  return <section className="panel code-comparison">
    <SectionHeading title="Coding recommendation" subtitle="Current claim compared with documented procedures and diagnoses." action={<Badge tone="purple"><Sparkles size={12} />Agent review</Badge>} />
    <div className="code-paths">
      <div className="code-path current"><div className="code-path-label"><span className="dot neutral-dot" />Current claim{applied && <Badge>Original baseline</Badge>}</div>
        <strong className="code-path-title">{kind === 'fusion' ? 'Single fusion site coded; secondary diagnoses absent' : kind === 'diabetes' ? 'Diabetes without complications' : kind === 'charge' ? 'Implant missing from the ledger' : kind === 'false-positive' ? 'Uncomplicated craniotomy' : 'Imported baseline'}</strong>
        <div className="code-tag-row"><code>{e.claim.baseline_icd10_cm.split(' ')[0]}</code>{kind === 'diabetes' && <code>E11.9</code>}<code>{e.claim.baseline_icd10_pcs}</code></div>
        <p>{kind === 'fusion' ? 'The default picklist captures L4-L5 only. The supplied claim uses retired MS-DRG 460.' : kind === 'diabetes' ? 'E11.9 is a labeled baseline extension. Source records remain unchanged; no complication is assumed.' : kind === 'charge' ? 'One consumed cranial mesh event is absent from the separate demo ledger.' : kind === 'false-positive' ? 'A legacy alert inferred J95.821 from 2 logged ventilator hours. It is not on the current claim.' : e.claim.baseline_icd10_cm}</p>
        <span className="code-path-state"><LockKeyhole size={13} />Unchanged until human approval</span>
      </div>
      <div className="code-path-connector"><ArrowRight size={19} /></div>
      <button className="code-path recommended" onClick={() => onEvidence(kind === 'fusion' ? 'dura' : kind === 'diabetes' ? 'diabetes' : kind === 'charge' ? 'charge' : kind === 'false-positive' ? 'false-positive' : 'imported')}>
        <div className="code-path-label"><Sparkles size={14} />Agent recommendation<Badge tone={applied ? 'green' : 'purple'}>{applied ? 'Human approved' : 'Review required'}</Badge></div>
        <strong className="code-path-title">{kind === 'fusion' ? 'Add L5-S1 fusion and documented dural complication' : kind === 'diabetes' ? 'Request diabetes documentation clarification' : kind === 'charge' ? 'Add the unposted implant charge' : kind === 'false-positive' ? 'Reject unsupported respiratory failure code' : 'Route for coding validation'}</strong>
        <div className="code-tag-row">{kind === 'fusion' ? <><code>0SG30AJ</code><code>G97.41 · CC</code>{e.review.query?.response !== 'no-change' && <code className={e.review.query?.response === 'anemia-confirmed' ? '' : 'pending-code'}>D62 · {e.review.query?.response === 'anemia-confirmed' ? 'CC' : 'query'}</code>}</> : kind === 'diabetes' ? <><code>E11.9</code><code>E11.65</code><code>E11.22 + N18.-</code></> : kind === 'charge' ? <><code>REV 0278</code><Badge tone="blue">No DRG change</Badge></> : kind === 'false-positive' ? <code className="rejected-code">J95.821 · not supported</code> : <code>Coder review</code>}</div>
        <p>{kind === 'fusion' ? 'The operative report documents two fusion sites and an accidental dural tear. G97.41 corresponds to dura; G97.48 would require another nervous-system structure. D62 requires a separate physician clarification.' : kind === 'diabetes' ? 'Compare E11.9, E11.65 and E11.22 against the provider response. Hyperglycemia and CKD may coexist; E11.22 also requires the documented CKD stage.' : kind === 'charge' ? 'The consumption record and duplicate check support one $3,900 illustrative gross charge. Acquisition cost is $2,300; expected payment is unchanged.' : kind === 'false-positive' ? 'The supplied operative and recovery records do not establish postprocedural respiratory failure. Retain the current diagnosis codes.' : 'Validate the imported mapping against the full clinical record and applicable-year grouping before approval.'}</p>
        <span className="code-path-link"><FileText size={14} />View supporting documentation<ArrowRight size={15} /></span>
      </button>
    </div>
  </section>;
}

function baselineClaim(e: Encounter): ClaimSnapshot {
  return {
    diagnoses: [e.claim.baseline_icd10_cm.split(' ')[0], ...(e.id === DIABETES_ID ? ['E11.9'] : [])],
    procedures: e.claim.baseline_icd10_pcs.split(',').map(p => p.trim()),
    drg: e.claim.baseline_ms_drg, chargePosted: false, revision: 1,
  };
}

export function PaymentComparison({ encounter: e, onEvidence, onAssumptions }: { encounter: Encounter; onEvidence: OpenEvidence; onAssumptions: () => void }) {
  const base = baselineClaim(e);
  const proposed = proposal(e);
  const beforeGroup = groupClaim(e, base);
  const afterGroup = groupClaim(e, proposed);
  const delta = expectedPayment(e, proposed) - baselinePayment(e);
  if (e.id !== HERO_ID) return <section className="panel padded payment-impact">
    <SectionHeading title="Payment impact" subtitle="No DRG or reimbursement increase is proposed for this review." action={<Badge tone="neutral">No payment change</Badge>} />
    <Notice title="Current grouping retained">{e.id === CHARGE_ID ? 'The implant correction adds an illustrative gross charge only. It does not change the diagnosis/procedure group or fixed scenario payment.' : 'The reviewed diagnosis alternatives do not establish an MCC or change the scoped grouping. No additional reimbursement is attributed to this coding review.'}</Notice>
    <dl className="assumption-list"><div><dt>Verified grouping branch</dt><dd>MS-DRG {beforeGroup ?? 'Not validated'} · FY2026 v43.1</dd></div><div><dt>Illustrative payment difference</dt><dd>{money(0)}</dd></div><div><dt>Payer</dt><dd>{e.census.payer_name}</dd></div></dl>
    <Button onClick={onAssumptions}>View payment assumptions<ChevronRight size={14} /></Button>
  </section>;
  return <section className="panel payment-panel">
    <SectionHeading title="DRG and reimbursement comparison" subtitle="Current and proposed code inputs, grouping results and illustrative payment." action={<Badge tone="blue">FY2026 v43.1 · scoped demo</Badge>} />
    {e.id === HERO_ID && <Notice tone="warning" title="Imported 460 → 459 proposal is not valid for this encounter">
      Both DRGs were retired before this discharge. D62 and G97.41 are CCs, not MCCs. The valid comparison below is driven by the additional fusion site, not a complication-driven payment jump.
    </Notice>}
    <div className="payment-paths">
      {[{ label: 'Baseline codes, regrouped', claim: base, group: beforeGroup, amount: baselinePayment(e), isNew: false }, { label: 'Agent-proposed claim', claim: proposed, group: afterGroup, amount: expectedPayment(e, proposed), isNew: true }].map(p => <div className={`payment-path ${p.isNew ? 'new' : ''}`} key={p.label}>
        <div className="payment-path-head"><span>{p.label}</span>{p.isNew ? <Sparkles size={16} /> : <FileText size={16} />}</div>
        <div className="grouper-input"><span className="eyebrow">ICD-10-CM</span><div>{p.claim.diagnoses.map(c => <code key={c} title={codeLabel(c)}>{c}</code>)}</div></div>
        <div className="grouper-input"><span className="eyebrow">ICD-10-PCS</span><div>{p.claim.procedures.map(c => <code key={c} title={codeLabel(c)}>{c}</code>)}</div></div>
        <div className="grouper-bridge"><span /><GitCompareArrows size={16} /><span /><small>{e.id === HERO_ID && p.isNew ? 'Two qualifying fusion sites · no MCC' : 'Full scoped inputs · no MCC'}</small></div>
        <div className="drg-result"><span>MS-DRG</span><strong>{p.group ?? 'Hold'}</strong><p>{p.group ? DRG_LABELS[p.group] : 'Applicable-year grouper validation required'}</p></div>
        <div className="payment-amount"><span>Illustrative expected payment</span><strong>{money(p.amount)}</strong></div>
      </div>)}
    </div>
    <div className="payment-delta"><div><Activity size={18} /><div><strong>{delta ? 'Procedure-driven payment difference' : 'No payment difference'}</strong><span>D62 and G97.41 do not independently increase the payment tier.</span></div></div><strong>{delta > 0 ? '+' : ''}{money(delta)}<small>Illustrative</small></strong></div>
    <p className="payment-formula">Illustrative fixed-rate calculation: <strong>{money(expectedPayment(e, proposed))} − {money(baselinePayment(e))} = {money(delta)}</strong>. No CMS relative weights or payment adjustments are applied.</p>
    <div className="assumptions-inline"><Info size={14} /><span>{e.census.payer_name}. Amounts are scenario assumptions, not CMS prices or actual payer entitlements.</span><button className="text-button" onClick={onAssumptions}>View assumptions<ChevronRight size={14} /></button></div>
    <div className="grouper-disclosure"><h4>Grouping rationale and exclusions</h4>
      <p>{e.id === HERO_ID ? 'The second recorded site is L5-S1, a lumbosacral joint: add 0SG30AJ, not the imported 0SG10AJ (two or more lumbar joints). 0SG00AJ + 0SG30AJ meet the two-site anterior-column branch, even though the surgical approach is posterior. Anemia and dural tear remain CCs; standard cages are not custom-made anatomical devices.' : 'The scoped claim is evaluated on actual codes and the applicable grouping branch. Changing a gross charge, finding a lab result, or scanning a device does not by itself change the DRG.'}</p>
      <p>Excluded by the completed demonstration record: pre-MDC overrides, spinal curvature/malignancy/infection or extensive fusion, other qualifying procedures, combined-column fusion, other MCCs, and custom-made anatomical devices. This is a verified branch demonstration, not a certified CMS grouper.</p>
      <EvidenceButton onClick={() => onEvidence(e.id === HERO_ID ? 'grouper' : undefined)}>Inspect grouping evidence</EvidenceButton>
    </div>
    <details className="raw-source imported-proposal"><summary>Compare with the untouched imported proposal</summary><dl className="imported-comparison"><div><dt>Imported baseline DRG</dt><dd>{e.claim.baseline_ms_drg}</dd></div><div><dt>Imported proposed DRG</dt><dd>{e.claim.optimized_ms_drg}</dd></div><div><dt>Imported illustrative baseline</dt><dd>{money(e.claim.baseline_reimbursement_usd)}</dd></div><div><dt>Imported illustrative proposal</dt><dd>{money(e.claim.optimized_reimbursement_usd)}</dd></div><div><dt>Imported claimed uplift (unvalidated)</dt><dd>{money(e.claim.revenue_left_on_table_usd)}</dd></div></dl><p>Preserved for provenance, not accepted as the approved claim or validated recovery.</p></details>
  </section>;
}

export function AssumptionsModal({ encounter: e, onClose }: { encounter?: Encounter; onClose: () => void }) {
  return <Modal title="Payment & coding assumptions" subtitle="Illustrative scenarios, not reimbursement advice." onClose={onClose} wide>
    <Notice tone="warning" title="No production pricing or payer submission">All dollar amounts are illustrative. This workbench is a synthetic demonstration, not an Epic integration, certified grouper, claim scrubber, or payer-pricing engine.</Notice>
    <dl className="assumption-list">
      <div><dt>Payer</dt><dd>{e?.census.payer_name ?? 'Mixed payer portfolio, preserved from supplied census'}</dd></div>
      <div><dt>Imported portfolio</dt><dd>$2,143,116 baseline and $3,495,535 proposed; $1,352,419 difference. These supplied figures are unvalidated, not recovered revenue.</dd></div>
      <div><dt>Corrected lumbar scenario</dt><dd>MS-DRG 451: {money(PAYMENT_ASSUMPTIONS.fusionRates['451'])}. MS-DRG 448: {money(PAYMENT_ASSUMPTIONS.fusionRates['448'])}. Difference: {money(PAYMENT_ASSUMPTIONS.fusionRates['448'] - PAYMENT_ASSUMPTIONS.fusionRates['451'])}. These fixed demo rates are explicit new assumptions, not Medicare relative weights. The imported $52,400 / $20,600 uplift is not reused as a validated result.</dd></div>
      <div><dt>Other walkthroughs</dt><dd>The supplied baseline amount is held fixed as a demo contractual allowance. Diabetes clarification and the charge-only correction do not add payment. NY Medicaid APR-DRG and Medicare MS-DRG are different systems; no conversion is implemented.</dd></div>
      <div><dt>Excluded payment adjustments</dt><dd>Wage index (including the 1.32 text in the source payer name), IME/DSH, transfers, outliers, quality adjustments, sequestration, new technology add-ons and contract-specific carve-outs. They are not calculated or applied twice.</dd></div>
      <div><dt>Gross charges vs costs</dt><dd>The illustrative ledger is a separate fixture. Room $1,250/day; OR $45/minute; recovery bundle $1,450; ordinary device charges = acquisition cost × 1.65. The missed mesh has an explicit $3,900 demo charge, not its $2,300 acquisition cost. No gross-charge amount is counted as payment recovery.</dd></div>
      <div><dt>Code year & scope</dt><dd>The four walkthroughs use FY2026 v43.1. October discharges need FY2027 validation. Other imported clinical mappings remain unvalidated and cannot be automatically approved.</dd></div>
      <div><dt>Source limits</dt><dd>Inputs contain no original note timestamps, signature metadata, LOINC identifiers, or item-level charge ledger. Those gaps are shown, never silently filled. Diabetes, consumed-device confirmation, signed query responses and the ledger are clearly tagged synthetic extensions.</dd></div>
      <div><dt>Confidence</dt><dd>Scores are illustrative, deterministic per-check scores. They are not clinical probabilities, calibrated model performance, or a substitute for human review.</dd></div>
    </dl>
    <Button variant="primary" onClick={onClose}>Understood<Check size={16} /></Button>
  </Modal>;
}

export function CheckCards({ encounter: e, onEvidence }: { encounter: Encounter; onEvidence: OpenEvidence }) {
  return <section className="panel checks-panel"><SectionHeading title="Coding validation checks" subtitle="Procedure, diagnosis and grouper review with per-check confidence." />
    <div className="check-list">{agentChecks(e).map(c => <button className="agent-check" key={c.id} onClick={() => onEvidence(c.id)}>
      <span className={`check-status-icon ${c.status}`}>{c.status === 'supported' ? <Check size={16} /> : c.status === 'query' ? <Clock3 size={16} /> : <CircleAlert size={16} />}</span>
      <div className="check-info"><h3>{c.title}<Badge tone={c.status === 'supported' ? 'green' : c.status === 'query' ? 'amber' : 'neutral'}>{c.status === 'supported' ? 'Supported' : c.status === 'query' ? 'Query required' : c.status === 'blocked' ? 'Validation issue' : 'Not validated'}</Badge></h3><p>{c.conclusion}</p><small>{c.subtitle}</small></div>
      <Confidence score={c.confidence} compact /><ChevronRight size={17} />
    </button>)}</div><p className="check-footnote"><Info size={12} />Illustrative confidence scores, not calibrated clinical probabilities. {resolved(e) ? 'Human disposition recorded.' : 'All recommendations await human review.'}</p>
  </section>;
}

export function CodeDocumentationTable({ encounter: e, onEvidence }: { encounter: Encounter; onEvidence: OpenEvidence }) {
  const links = documentationLinks(e);
  if (!links.length) return null;
  const notes = notesFor(e);
  return <section className="panel documentation-panel">
    <SectionHeading title="Code-to-documentation links" subtitle="Select a code or document to inspect the supporting text and source metadata." action={<Badge tone={e.review.evidenceVerified ? 'green' : 'neutral'}>{e.review.evidenceVerified ? `Reviewed by ${e.review.owner}` : 'Reviewer verification pending'}</Badge>} />
    <div className="table-scroll"><table className="code-documentation-table"><thead><tr><th>Code / description</th><th>Supporting document / excerpt</th><th>Documentation status</th><th><span className="sr-only">Open supporting document</span></th></tr></thead><tbody>{links.map(link => {
      const note = notes.find(n => n.id === link.sourceId)!;
      return <tr key={link.code}><td><button className="document-code-link" aria-label={`View supporting documentation for ${link.code}`} onClick={() => onEvidence(link.checkId, link.sourceId, link.code)}><code>{link.code}</code><ChevronRight size={12} /></button><strong>{link.description}</strong><span>{link.classification}</span></td><td><button className="document-title-link" onClick={() => onEvidence(link.checkId, link.sourceId, link.code)}><FileText size={14} />{note.title}</button><p className="document-excerpt">“{link.excerpt}”</p><div className="document-source-meta"><span>{note.author}</span><span>{note.timestamp ? `${fullDate(note.timestamp)} ET` : 'Timestamp not supplied'}</span>{note.synthetic && <Badge tone="purple">Demo extension</Badge>}</div></td><td><Badge tone={link.status === 'Linked' || link.status === 'Current code' ? 'green' : link.status === 'Query required' ? 'amber' : 'neutral'} dot>{link.status}</Badge></td><td><button className="text-button" onClick={() => onEvidence(link.checkId, link.sourceId, link.code)}>Open<ArrowRight size={13} /></button></td></tr>;
    })}</tbody></table></div>
  </section>;
}

export function DocumentationSummary({ encounter: e, onEvidence }: { encounter: Encounter; onEvidence: OpenEvidence }) {
  const links = documentationLinks(e);
  return <section className="panel documentation-summary"><h3><FileText size={17} />Supporting documents</h3>{links.length ? links.map(link => <button key={link.code} onClick={() => onEvidence(link.checkId, link.sourceId, link.code)}><code>{link.code}</code><span>{link.status}</span><ChevronRight size={14} /></button>) : <button onClick={() => onEvidence(undefined, 'silo-2')}><FileText size={15} /><span>Surgeon operative report</span><ChevronRight size={14} /></button>}<p>Reviewer: <strong>{e.review.evidenceVerified ? e.review.owner : 'Pending verification'}</strong></p></section>;
}
