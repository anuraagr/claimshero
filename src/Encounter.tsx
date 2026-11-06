import { useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, BookOpen, Check, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileCheck2, FileText, GitBranch, Hospital, LockKeyhole, MessageSquareText, Pill, Send, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Badge, Button, DownloadButton, EvidenceButton, FlowLine, Notice, SectionHeading, StatusBadge } from './components';
import { CheckCards, CodeDocumentationTable, DocumentationSummary, PaymentComparison, SourceSilos, type OpenEvidence } from './Evidence';
import { AgentOverview, ClaimDiscrepancy, PersistentClaimActions } from './ClaimsReview';
import { CHARGE_ID, DEEP_IDS, DIABETES_ID, DRG_LABELS, FALSE_POSITIVE_ID, HERO_ID, ledgerFor, notesFor, type Encounter as EncounterData } from './portfolio';
import { baselinePayment, blockers, chargeTotal, codeLabel, defaultQuery, documentationLinks, dueHours, expectedPayment, fullDate, groupClaim, initials, money, proposal, ready, resolved, shortDate } from './workflow';
import type { AuditEvent, EncounterTab, QueryResponse, WorkflowAction } from './model';

export type RunAction = (id: string, action: WorkflowAction) => boolean;

export function EncounterView({ encounter: e, tab, onTab, onBack, onEvidence, onAssumptions, onAction, audit, simulateFailure, onModify, onAnalyze, onHome }: {
  encounter: EncounterData; tab: EncounterTab; onTab: (tab: EncounterTab) => void; onBack: () => void;
  onEvidence: OpenEvidence; onAssumptions: () => void; onAction: RunAction; audit: AuditEvent[]; simulateFailure: boolean;
  onModify: () => void; onAnalyze: () => void; onHome: () => void;
}) {
  const tabs: { id: EncounterTab; label: string }[] = [
    { id: 'review', label: 'Agent review' }, { id: 'sources', label: 'Epic source silos' }, { id: 'clinical', label: 'Clinical record' },
    { id: 'charges', label: 'Charge ledger' }, { id: 'comparison', label: 'DRG & payment' }, { id: 'claim', label: 'Claim preview' }, { id: 'history', label: 'Audit trail' },
  ];
  return <div className="encounter-page">
    <button className="text-button encounter-back" onClick={onBack}><ArrowLeft size={15} />Back to home</button>
    <div className="encounter-heading"><div className="encounter-identity"><span className="avatar large">{initials(e.census.patient_name)}</span><div><div className="patient-title"><h1>{e.census.patient_name}</h1><Badge>Synthetic patient</Badge>{e.id === HERO_ID && <Badge tone="purple"><Sparkles size={12} />Featured case</Badge>}</div><div className="patient-subline"><span>{e.census.age} years · {e.census.sex}</span><span className="mono">{e.id}</span><span>{e.census.patient_id}</span></div></div></div><div className="encounter-status"><StatusBadge status={e.review.status} /><span><Clock3 size={12} />{dueHours(e)}h demo review SLA</span></div></div>
    <div className="encounter-facts"><span><Hospital size={14} />{e.census.facility_name}</span><span><UserRound size={14} />{e.surgeon.attending_neurosurgeon.replace('Dr. ', '')}</span><span>{shortDate(e.census.admission_date)} – {shortDate(e.census.discharge_date)}, 2026 · {e.census.length_of_stay_days}d stay</span><span>{e.census.payer_category}</span></div>
    <nav className="encounter-tabs" aria-label="Encounter sections">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => onTab(t.id)}>{t.id === 'review' && <Sparkles size={14} />}{t.label}{t.id === 'history' && <span>{audit.filter(a => a.encounterId === e.id).length}</span>}{t.id === 'claim' && ready(e) && <i className="dot green" />}</button>)}</nav>
    {tab === 'review' && <div className="review-content">
      <AgentOverview encounter={e} onEvidence={onEvidence} onAnalyze={onAnalyze} onModify={onModify} />
      {e.id === DIABETES_ID && <Notice tone="info" title="Diabetes is an explicitly labeled demonstration extension">The untouched inputs contain no diabetes history or renal/glucose data. E11.9, E11.65 and E11.22 are compared using a separate synthetic fixture; the agent requests clarification rather than inferring a complication.</Notice>}
      <SourceSilos encounter={e} onEvidence={onEvidence} />
      {e.review.analysisReady && <><CodeDocumentationTable encounter={e} onEvidence={onEvidence} /><ClaimDiscrepancy encounter={e} onCompare={() => onTab('comparison')} />
      <div className="review-bottom"><details className="validation-details"><summary><ShieldCheck size={16} />Coding validation checks and confidence</summary><CheckCards encounter={e} onEvidence={onEvidence} /></details><div className="review-side"><ReviewSummary encounter={e} onCompare={() => onTab('comparison')} onAssumptions={onAssumptions} /><DocumentationSummary encounter={e} onEvidence={onEvidence} /></div></div></>}
    </div>}
    {tab === 'sources' && <><SourceSilos encounter={e} onEvidence={onEvidence} /><section className="panel source-full-list"><SectionHeading title="Encounter documents" subtitle="Original clinical records and separately identified documentation extensions." />{notesFor(e).map(n => <button className="source-list-row" key={n.id} onClick={() => onEvidence(undefined, n.id)}><FileText size={20} /><div><strong>{n.title}</strong><span>{n.author}</span><small>{n.timestamp ? `${fullDate(n.timestamp)} ET` : 'Timestamp and authentication metadata not provided in input'}</small></div><Badge tone={n.synthetic ? 'purple' : 'green'}>{n.synthetic ? 'Demo extension' : 'Untouched source'}</Badge><ChevronRight size={17} /></button>)}</section></>}
    {tab === 'clinical' && <ClinicalRecord encounter={e} onEvidence={onEvidence} />}
    {tab === 'charges' && <ChargeLedger encounter={e} onEvidence={onEvidence} onReview={() => onTab('review')} />}
    {tab === 'comparison' && (DEEP_IDS.includes(e.id) ? <PaymentComparison encounter={e} onEvidence={onEvidence} onAssumptions={onAssumptions} /> : <section className="panel padded"><Notice tone="warning" title="Imported grouping has not been validated">This encounter is outside the four scoped walkthroughs. The imported {e.claim.baseline_ms_drg} → {e.claim.optimized_ms_drg} proposal and {money(e.claim.revenue_left_on_table_usd)} illustrative delta are preserved as unvalidated inputs, not an actual grouper result. {e.census.discharge_date >= '2026-10-01' ? 'This discharge requires FY2027 validation.' : 'Applicable-year procedures and severity need coder validation.'}</Notice><Button onClick={() => onTab('review')}>Route for review<ArrowRight size={15} /></Button></section>)}
    {tab === 'claim' && <ClaimPreview encounter={e} onAction={onAction} onReview={() => onTab('review')} onEvidence={onEvidence} onAssumptions={onAssumptions} simulateFailure={simulateFailure} />}
    {tab === 'history' && <AuditTrail events={audit.filter(a => a.encounterId === e.id)} />}
    <PersistentClaimActions encounter={e} preview={tab === 'claim'} canSubmit={ready(e)} onModify={onModify} onHome={onHome} onSubmit={() => { if (tab === 'claim' && ready(e)) onAction(e.id, { type: 'submit', fail: simulateFailure }); else onTab('claim'); }} />
  </div>;
}

function ReviewSummary({ encounter: e, onCompare, onAssumptions }: { encounter: EncounterData; onCompare: () => void; onAssumptions: () => void }) {
  const proposed = proposal(e);
  const delta = expectedPayment(e, proposed) - baselinePayment(e);
  const before = groupClaim(e, { ...e.review.claim, procedures: e.claim.baseline_icd10_pcs.split(',').map(p => p.trim()), diagnoses: [e.claim.baseline_icd10_cm.split(' ')[0]] });
  const after = groupClaim(e, proposed);
  return <section className="panel summary-card"><div className="summary-title"><span>Claim impact</span><GitBranch size={17} /></div><div className="summary-drg"><span>{before ?? e.claim.baseline_ms_drg}</span>{before && after && before !== after ? <><ArrowRight size={18} /><strong>{after}</strong></> : <Badge>{before ? 'Unchanged' : 'Not validated'}</Badge>}</div><span className="summary-drg-label">{DEEP_IDS.includes(e.id) ? 'MS-DRG · FY2026 scoped review' : 'Imported / not validated'}</span><div className="summary-money"><span>Illustrative payment difference</span><strong>{delta > 0 ? '+' : ''}{money(delta)}</strong></div>{e.id === CHARGE_ID && <p className="small-note">+{money(3900)} gross charges only; no payment recovery.</p>}<Button onClick={onCompare}>{delta ? 'Compare the claim' : 'View payment impact'}<ArrowRight size={15} /></Button><button className="text-button summary-assumptions" onClick={onAssumptions}>Payer & payment assumptions<ChevronRight size={13} /></button></section>;
}

export function ResolutionPanel({ encounter: e, onAction, onClaim }: { encounter: EncounterData; onAction: RunAction; onClaim: () => void }) {
  const [rationale, setRationale] = useState('');
  const [attested, setAttested] = useState(false);
  const [mode, setMode] = useState<'decision' | 'query' | 'route' | 'escalate'>('decision');
  const [queryText, setQueryText] = useState(defaultQuery(e));
  const [owner, setOwner] = useState('Jordan Ellis, CCS');
  const [response, setResponse] = useState<QueryResponse>(e.id === HERO_ID ? 'anemia-confirmed' : e.id === DIABETES_ID ? 'hyperglycemia' : 'undetermined');
  const isDeep = DEEP_IDS.includes(e.id);
  const needsQuery = [HERO_ID, DIABETES_ID].includes(e.id) && (!e.review.query || e.review.query.response === 'undetermined');
  const queryOpen = e.review.query?.status === 'open';
  const canApprove = isDeep && !needsQuery && !queryOpen && e.id !== FALSE_POSITIVE_ID;
  const submitDecision = (type: 'approve' | 'reject') => {
    if (onAction(e.id, { type, rationale, evidenceReviewed: attested })) { setRationale(''); setAttested(false); }
  };
  if (resolved(e)) return <section className="panel resolution-complete"><div className="complete-icon"><ShieldCheck size={25} /></div><div><h3>{e.review.status === 'submitted' ? 'Claim accepted by the simulator' : e.review.status === 'rejected' ? 'Recommendation rejected. Claim unchanged.' : 'Approved changes are now on the claim.'}</h3><p>Reviewer disposition and rationale are recorded in the audit trail. Original source documents are unchanged.</p></div><Button variant="primary" onClick={onClaim}>View claim<ArrowRight size={16} /></Button>{e.review.status !== 'submitted' && <Button onClick={() => onAction(e.id, { type: 'reopen', rationale: 'Reviewer explicitly reopened the encounter for further review.' })}>Reopen review</Button>}</section>;
  return <section className="panel resolution-panel" id="resolution-panel">
    <SectionHeading title="Review disposition" subtitle="Record the decision and rationale. Approved changes update the claim." icon={<ClipboardCheck size={20} />} action={<Badge tone="amber"><LockKeyhole size={12} />Claim unchanged</Badge>} />
    {needsQuery && !queryOpen && <Notice tone="warning" title="Documentation clarification required">{e.id === HERO_ID ? 'The operative note documents the dural complication and two fusion sites. A physician diagnosis is required to add D62. Request clarification, then review the simulated provider response.' : 'The record does not establish diabetic hyperglycemia or CKD. Request clarification of the diabetes manifestations, renal chronicity and CKD stage.'}</Notice>}
    {queryOpen && <div className="query-response-box">
      <div className="query-box-heading"><MessageSquareText size={20} /><div><h3>Documentation query is open</h3><span>{e.review.query?.id} · {e.review.query && fullDate(e.review.query.createdAt)}</span></div><Badge tone="amber">Claim held</Badge></div>
      <details className="query-text"><summary>Read the neutral query</summary><p>{e.review.query?.text}</p></details>
      <div className="response-simulator"><label className="field-label">Provider response simulator<select value={response} onChange={event => setResponse(event.target.value as QueryResponse)} aria-label="Simulated provider response">
        {e.id === HERO_ID ? <><option value="anemia-confirmed">Confirms acute posthemorrhagic anemia and procedure</option><option value="no-change">No additional anemia; confirms procedure and dural repair</option><option value="undetermined">Unable to determine / keep on hold</option></> : e.id === DIABETES_ID ? <><option value="hyperglycemia">Confirms hyperglycemia; no CKD</option><option value="ckd">Confirms diabetic CKD stage 3b; no hyperglycemia</option><option value="both">Confirms hyperglycemia and diabetic CKD stage 3b</option><option value="no-change">Confirms diabetes without complications</option><option value="undetermined">Unable to determine / keep on hold</option></> : <option value="undetermined">Unable to determine / specialist review required</option>}
      </select></label><Button onClick={() => onAction(e.id, { type: 'answer-query', answer: response })}><FileCheck2 size={16} />Load simulated signed response</Button></div>
      <p className="fine-print">Demo only. No message is sent to a clinician. Responses are appended as separate synthetic records; they do not update the claim.</p>
    </div>}
    {e.review.query?.status === 'answered' && <Notice tone={e.review.query.response === 'undetermined' ? 'warning' : 'success'} title={e.review.query.response === 'undetermined' ? 'Unable to determine: hold maintained' : 'Simulated signed clarification received'}>{e.review.query.response === 'undetermined' ? 'No unsupported code will be selected. Escalate or request further clarification.' : 'Review the new evidence before approving. The current claim is still unchanged.'}</Notice>}
    <div className="resolution-modes" role="group" aria-label="Resolution action">{[
      ['decision', 'Review decision'], ['query', 'Request clarification'], ['route', 'Route to coder'], ['escalate', 'Escalate'],
    ].map(([value, label]) => <button key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value as typeof mode)} disabled={value === 'query' && queryOpen}>{label}</button>)}</div>
    <form onSubmit={event => {
      event.preventDefault();
      const action: WorkflowAction = mode === 'query' ? { type: 'request-query', rationale, queryText } : mode === 'route' ? { type: 'route', rationale, owner } : { type: 'escalate', rationale };
      if (onAction(e.id, action)) { setRationale(''); setMode('decision'); }
    }}>
      {mode === 'query' && <label className="field-label">Neutral clarification request<textarea className="query-editor" value={queryText} onChange={event => setQueryText(event.target.value)} minLength={30} required /></label>}
      {mode === 'route' && <label className="field-label">Assign to coder<select value={owner} onChange={event => setOwner(event.target.value)}><option>Jordan Ellis, CCS</option><option>Taylor Reed, RHIA</option></select></label>}
      {mode === 'escalate' && <Notice>Route to the clinical validation team. The claim stays on hold and all source records remain unchanged.</Notice>}
      <label className="field-label">Review rationale <span className="required-label">Required</span><textarea value={rationale} onChange={event => setRationale(event.target.value)} placeholder={mode === 'query' ? 'Why does this documentation need clarification?' : 'Record the evidence you reviewed and the reason for your decision...'} minLength={10} required aria-label="Review rationale" /><span className="field-hint">At least 10 characters. Included verbatim in the local audit trail.</span></label>
      {mode === 'decision' && <label className="attestation"><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} /><span>I reviewed the original sources, the separately labeled demo supplements, reportability, coding year, and grouper assumptions. I approve only defensible capture of delivered care.</span></label>}
      <div className="resolution-actions"><span><ShieldCheck size={14} />Human review required · no automatic claim changes</span><div>{mode === 'decision' ? <>
        <Button variant="ghost" disabled={!attested || rationale.trim().length < 10 || !isDeep || needsQuery || queryOpen} onClick={() => submitDecision('reject')}>{e.id === FALSE_POSITIVE_ID ? 'Reject false-positive alert' : 'Reject recommendation'}</Button>
        <Button variant="primary" disabled={!canApprove || !attested || rationale.trim().length < 10} onClick={() => submitDecision('approve')} title={!canApprove ? 'Resolve documentation and source-validation blockers first' : undefined}><Check size={16} />Approve {e.id === CHARGE_ID ? 'charge correction' : 'coding changes'}</Button>
      </> : <Button type="submit" variant="primary" disabled={rationale.trim().length < 10}>{mode === 'query' ? <MessageSquareText size={16} /> : mode === 'route' ? <UserRound size={16} /> : <CircleAlert size={16} />}{mode === 'query' ? 'Request documentation clarification' : mode === 'route' ? 'Route to coder' : 'Escalate review'}</Button>}</div></div>
    </form>
    {mode === 'decision' && !canApprove && <p className="blocked-helper"><LockKeyhole size={13} />{!isDeep ? 'Imported mapping is outside the scoped grouper. Route to a coder; approval is disabled.' : e.id === FALSE_POSITIVE_ID ? 'The agent recommends rejection. Approval is disabled because the diagnosis is unsupported.' : 'Approval is disabled until documentation clarification is complete.'}{needsQuery && !queryOpen && <button className="text-button" onClick={() => setMode('query')}>Request clarification<ArrowRight size={13} /></button>}</p>}
  </section>;
}

function ClinicalRecord({ encounter: e, onEvidence }: { encounter: EncounterData; onEvidence: OpenEvidence }) {
  const [type, setType] = useState('all');
  const notes = notesFor(e).filter(n => type === 'all' || n.kind === type);
  return <div className="clinical-grid"><section className="panel"><SectionHeading title="Clinical timeline" subtitle="Encounter context and source-level traceability" action={<select className="standalone-select" value={type} onChange={ev => setType(ev.target.value)} aria-label="Clinical record filter"><option value="all">All records</option><option value="note">Notes</option><option value="procedure">Procedures</option><option value="lab">Labs / recovery</option><option value="response">Clarifications</option></select>} />
    <div className="clinical-timeline"><div className="timeline-entry admission"><span className="timeline-marker"><Hospital size={15} /></span><div><span className="eyebrow">{shortDate(e.census.admission_date)}, 2026</span><h3>Inpatient admission</h3><p>{e.surgeon.preop_diagnosis_text}</p><small>Source: patients_census + surgeon op note</small></div></div>{notes.map(n => <button key={n.id} className="timeline-entry" onClick={() => onEvidence(undefined, n.id)}><span className="timeline-marker"><FileText size={15} /></span><div><span className="eyebrow">{n.timestamp ? fullDate(n.timestamp) : 'SOURCE TIMESTAMP NOT SUPPLIED'}</span><h3>{n.title}{n.synthetic && <Badge tone="purple">Demo extension</Badge>}</h3><p>{n.text.slice(0, 170)}{n.text.length > 170 ? '…' : ''}</p><small>{n.author}</small></div><ChevronRight size={16} /></button>)}<div className="timeline-entry admission"><span className="timeline-marker"><Check size={15} /></span><div><span className="eyebrow">{shortDate(e.census.discharge_date)}, 2026</span><h3>Discharge recorded</h3><p>Length of stay: {e.census.length_of_stay_days} days. Code year follows discharge date.</p></div></div></div>
  </section><div className="clinical-aside"><section className="panel padded"><h3>Current diagnosis codes</h3>{e.review.claim.diagnoses.map(c => <div className="diagnosis-row" key={c}><code>{c}</code><span>{codeLabel(c)}</span></div>)}</section><section className="panel padded"><h3><Pill size={17} />Orders & medications</h3><p>{e.recovery.nursing_flowsheet_note}</p><p className="small-note">Original medication orders, individual administration timestamps and doses are not supplied beyond this recovery narrative. Do not invent a complete MAR.</p><EvidenceButton onClick={() => onEvidence(undefined, 'silo-3')}>View recovery record</EvidenceButton></section><section className="panel padded"><h3>Procedures & devices</h3><p>{e.surgeon.documented_anatomical_levels_or_sites}</p><p>{e.nurse.actual_or_minutes} documented OR minutes. Duration is context, not proof of an additional billable service.</p><EvidenceButton onClick={() => onEvidence(undefined, 'silo-1')}>View procedure source</EvidenceButton></section></div></div>;
}

export function ChargeLedger({ encounter: e, onEvidence, onReview }: { encounter: EncounterData; onEvidence: OpenEvidence; onReview: () => void }) {
  const lines = ledgerFor(e);
  const missing = lines.filter(l => l.status === 'missing').reduce((n, l) => n + l.units * l.unitPrice, 0);
  return <section className="panel ledger-panel"><SectionHeading title="Charge ledger" subtitle="Separate illustrative ledger; never presented as an original Epic extract." action={<Badge tone="purple">Synthetic ledger fixture</Badge>} /><Notice title="Charges, costs and payments are different">Device acquisition costs come from the supplied barcode log. Gross charges below are explicit demo assumptions. No charge-only correction increases the fixed scenario payment or changes the DRG.</Notice>
    <div className="table-scroll"><table className="ledger-table"><thead><tr><th>Revenue code / service</th><th>Units</th><th>Illustrative unit charge</th><th>Illustrative gross charge</th><th>Status</th><th>Source</th></tr></thead><tbody>{lines.map(l => <tr key={l.id} className={l.status === 'missing' ? 'missing-charge-row' : ''}><td><code>{l.revenueCode}</code><strong>{l.description}</strong></td><td>{l.units}</td><td>{money(l.unitPrice)}</td><td className="amount">{money(l.unitPrice * l.units)}</td><td><Badge tone={l.status === 'missing' ? 'amber' : 'green'}>{l.status === 'missing' ? 'Missing charge' : 'Posted'}</Badge></td><td><EvidenceButton onClick={() => onEvidence(undefined, l.sourceId)}>Evidence</EvidenceButton></td></tr>)}</tbody></table></div>
    <div className="ledger-totals"><div><span>Posted gross charges</span><strong>{money(chargeTotal(e))}</strong></div><div><span>Unposted gross charges</span><strong className="warning-text">{money(missing)}</strong></div><div><span>Payment impact of charge correction</span><strong>{money(0)}</strong></div></div>
    {missing > 0 && <div className="ledger-action"><p><CircleAlert size={16} />Consumption and duplicate checks must be reviewed before adding the missing charge.</p><Button variant="primary" onClick={onReview}>Review charge correction<ArrowRight size={15} /></Button></div>}
  </section>;
}

export function ClaimPreview({ encounter: e, onAction, onReview, onEvidence, onAssumptions, simulateFailure }: {
  encounter: EncounterData; onAction: RunAction; onReview: () => void; onEvidence: OpenEvidence; onAssumptions: () => void; simulateFailure: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [transportError, setTransportError] = useState(false);
  const pending = blockers(e);
  const isSubmitted = e.review.status === 'submitted';
  const lines = ledgerFor(e).filter(l => l.status === 'posted');
  const supportingDocs = documentationLinks(e);
  const claimExport = {
    notice: 'SYNTHETIC DEMO ONLY. Not an 837, payer submission, production claim, or actual payment.',
    encounter: e.id, payer: e.census.payer_name, state: e.review.status,
    approvedClaim: e.review.claim, illustrativeExpectedPayment: expectedPayment(e),
    illustrativeCharges: lines, blockers: pending, simulatedReceipt: e.review.receipt ?? null,
  };
  const submit = () => {
    if (submitting) return;
    setSubmitting(true); setTransportError(false);
    window.setTimeout(() => {
      const ok = onAction(e.id, { type: 'submit', fail: simulateFailure });
      setTransportError(ok && simulateFailure);
      setSubmitting(false);
    }, 650);
  };
  return <div className="claim-layout"><section className="panel claim-document"><div className="claim-document-header"><div className="claim-brand"><span className="claim-cross">+</span><div><strong>ClaimsHero</strong><span>INSTITUTIONAL CLAIM PREVIEW</span></div></div><Badge tone={isSubmitted ? 'green' : ready(e) ? 'blue' : 'amber'}>{isSubmitted ? 'Simulated acceptance' : ready(e) ? 'Ready for simulation' : 'Draft / on hold'}</Badge></div>
    <div className="claim-meta"><div><span>Patient</span><strong>{e.census.patient_name}</strong><small>{e.census.patient_id} · Synthetic</small></div><div><span>Encounter</span><strong className="mono">{e.id}</strong><small>Revision {e.review.claim.revision}</small></div><div><span>Facility</span><strong>{e.census.facility_name}</strong><small>{shortDate(e.census.admission_date)} – {shortDate(e.census.discharge_date)}, 2026</small></div><div><span>Payer / scenario</span><strong>{e.census.payer_name}</strong><small>Illustrative allowance, not a payer quote</small></div></div>
    <FlowLine approved={resolved(e)} submitted={isSubmitted} />
    <div className="claim-section"><h3>Diagnosis codes <span>Select a code to view supporting documentation</span></h3><table className="claim-code-table"><thead><tr><th>Sequence</th><th>ICD-10-CM</th><th>Description</th><th>POA / source</th></tr></thead><tbody>{e.review.claim.diagnoses.map((c, i) => {
      const doc = supportingDocs.find(link => link.code === c || (c === 'N18.32' && link.code === 'E11.22'));
      return <tr key={c}><td>{i === 0 ? 'Principal' : 'Secondary'}</td><td><button className="document-code-link" onClick={() => onEvidence(doc?.checkId, doc?.sourceId ?? 'silo-2', doc?.code ?? c)} aria-label={`View claim documentation for ${c}`}><code>{c}</code></button></td><td>{codeLabel(c)}</td><td><span>{i === 0 ? 'Not supplied in source' : ['D62', 'G97.41'].includes(c) ? 'N · procedure / clarification' : e.review.query?.status === 'answered' ? 'Y · demo clarification' : 'Not supplied / demo fixture'}</span></td></tr>;
    })}</tbody></table><p className="claim-source-note">Original POA and signature metadata are incomplete. This is a scoped demonstration preview, not a production-ready billing record.</p></div>
    <div className="claim-section"><h3>Procedure codes</h3>{e.review.claim.procedures.map(c => <div className="claim-procedure" key={c}><code>{c}</code><span>{codeLabel(c)}</span><EvidenceButton onClick={() => onEvidence(undefined, 'silo-2')}>Source</EvidenceButton></div>)}</div>
    <div className="claim-drg-box"><div><span>Assigned MS-DRG</span><strong>{e.review.claim.drg}</strong><p>{DRG_LABELS[e.review.claim.drg] ?? 'Imported / specialist validation required'}</p></div><div><span>Illustrative expected payment</span><strong>{money(expectedPayment(e))}</strong><button className="text-button" onClick={onAssumptions}>Payer assumptions<ChevronRight size={12} /></button></div></div>
    <div className="claim-section"><h3>Posted charges <span>Illustrative gross charges · not reimbursement</span></h3>{lines.map(l => <div className="claim-charge-line" key={l.id}><span><code>{l.revenueCode}</code>{l.description}</span><strong>{money(l.units * l.unitPrice)}</strong></div>)}<div className="claim-charge-total"><span>Total illustrative gross charges</span><strong>{money(chargeTotal(e))}</strong></div></div>
    <p className="claim-watermark">DEMONSTRATION ONLY · NOT A BILL · NO REAL PATIENT DATA</p>
  </section><div className="claim-aside"><section className="panel submission-panel"><h3><ShieldCheck size={19} />Submission readiness</h3>{pending.length ? pending.map(b => <div className="readiness-line blocked" key={b}><CircleAlert size={16} /><span>{b}</span></div>) : ['Human disposition recorded', 'Source evidence attested', 'Applicable-year grouping checked', 'Documentation blockers resolved', 'No unapproved changes included'].map(b => <div className="readiness-line" key={b}><Check size={16} /><span>{b}</span></div>)}
    {transportError && <Notice tone="error" title="Simulated transport failed">No claim was transmitted. Your approved claim is safe. Turn off the failure scenario in Demo settings, then retry.</Notice>}
    {isSubmitted ? <div className="submission-receipt"><BadgeCheck size={33} /><strong>Accepted by simulator</strong><code>{e.review.receipt}</code><span>No real payer transmission or payment.</span></div> : <Button variant="primary" className="submit-button" onClick={submit} disabled={!ready(e) || submitting}>{submitting ? <span className="spinner" /> : <Send size={16} />}{submitting ? 'Simulating submission...' : transportError ? 'Retry simulated submission' : 'Simulate claim submission'}</Button>}
    {pending.length > 0 && <Button onClick={onReview}>Resolve in review<ArrowRight size={15} /></Button>}
    <p className="fine-print">A local simulated acknowledgement only. No Epic, clearinghouse, EDI or payer connection.</p>
    </section><section className="panel padded"><h3>Claim snapshot</h3><p className="small-note">Download the visible claim, approval state, charges and blockers as a clearly labeled JSON demo record.</p><DownloadButton filename={`claimshero-${e.id}-demo-claim.json`} text={JSON.stringify(claimExport, null, 2)} label="Download preview" mime="application/json" /></section></div></div>;
}

export function AuditTrail({ events, onEncounter }: { events: AuditEvent[]; onEncounter?: (id: string) => void }) {
  return <section className="panel audit-panel"><SectionHeading title="Review audit trail" subtitle="Reviewer actions, rationale, timestamps and before/after claim values." action={<DownloadButton filename="claimshero-audit.json" text={JSON.stringify(events, null, 2)} label="Export audit" mime="application/json" />} />
    {events.length ? <div className="audit-list">{events.map(event => <article className="audit-event" key={event.id}><div className="audit-event-marker"><ClipboardCheck size={16} /></div><div className="audit-event-content"><div className="audit-event-heading"><h3>{event.action}</h3><time>{fullDate(event.timestamp)} ET</time></div><div className="audit-actor"><UserRound size={12} />{event.actor}<span>·</span>{onEncounter && event.encounterId !== 'portfolio' ? <button className="text-button" onClick={() => onEncounter(event.encounterId)}>{event.encounterId}</button> : <span className="mono">{event.encounterId}</span>}</div><p>{event.rationale}</p><details className="audit-diff"><summary>Inspect before / after claim</summary><div><span>Before</span><code>{event.before}</code></div><div><span>After</span><code>{event.after}</code></div></details></div></article>)}</div> : <div className="audit-empty"><BookOpen size={24} /><h3>No human decisions yet</h3><p>Review a recommendation, record a rationale, and the decision will appear here. Opening records does not change a claim.</p></div>}
    <p className="audit-disclaimer">Local demonstration audit, not a production immutable or compliance-certified audit store. Source clinical files remain read-only.</p>
  </section>;
}
