import { ArrowRight, Check, CircleAlert, FileText, Info, LoaderCircle, MessageSquareText, Pencil, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Badge, Button, Confidence } from './components';
import { caseKind, DIABETES_ID, HERO_ID, type Encounter } from './portfolio';
import { agentChecks, codeLabel, proposal, resolved } from './workflow';
import type { OpenEvidence } from './Evidence';

export function AgentOverview({ encounter: e, onEvidence, onAnalyze, onModify }: { encounter: Encounter; onEvidence: OpenEvidence; onAnalyze: () => void; onModify: () => void }) {
  const kind = caseKind(e.id);
  const response = e.review.query?.status === 'answered' && e.review.query.response !== 'undetermined';
  const primary = agentChecks(e).find(c => c.id === 'dura') ?? agentChecks(e)[0];
  if (!e.review.analysisReady) return <section className="panel agent-pending" role="status"><span className="analysis-loading"><LoaderCircle size={23} /></span><div><h2>Claim analysis pending</h2><p>The synthetic claim is queued for documentation and coding checks. Source records are available below.</p></div><Button onClick={onAnalyze}><Zap size={15} />Simulate analysis notification</Button></section>;
  const current = e.claim.baseline_icd10_cm.split(' ')[0];
  const choices = kind === 'fusion' ? [
    { label: 'Current claim', code: current, detail: 'Principal diagnosis only. No dural complication captured.', state: 'Current', tone: 'neutral', source: 'silo-2', check: 'principal' },
    { label: 'Recommended secondary code', code: 'G97.41', detail: 'Accidental puncture or laceration of dura during a procedure.', state: 'Supported · CC', tone: 'green', source: 'silo-2', check: 'dura' },
    { label: 'Alternative considered', code: 'G97.48', detail: 'Injury to another nervous-system structure. No such injury is documented.', state: 'Not supported', tone: 'neutral', source: 'silo-2', check: 'dura' },
  ] : kind === 'diabetes' ? [
    { label: 'Current claim', code: 'E11.9', detail: codeLabel('E11.9'), state: 'Current demo code', tone: 'neutral', source: 'demo-diabetes', check: 'diabetes' },
    { label: response ? 'Provider-supported codes' : 'Recommendation', code: response ? proposal(e).diagnoses.slice(1).join(' + ') : 'Request clarification', detail: response ? 'Review the signed provider response before approving the code change.' : 'Glucose and a single eGFR do not establish diabetic hyperglycemia or CKD.', state: response ? 'Response received' : 'Documentation missing', tone: response ? 'green' : 'amber', source: response ? e.review.notes.at(-1)?.id ?? 'demo-diabetes' : 'demo-diabetes', check: 'diabetes' },
    { label: 'Other condition considered', code: 'E11.22 + N18.-', detail: 'Diabetic CKD requires a provider diagnosis and documented stage. Hyperglycemia and CKD can coexist.', state: 'Requires documentation', tone: 'neutral', source: 'demo-diabetes', check: 'diabetes' },
  ] : kind === 'false-positive' ? [
    { label: 'Current claim', code: current, detail: 'Uncomplicated craniotomy with no documented respiratory failure.', state: 'Current', tone: 'neutral', source: 'silo-2', check: 'false-positive' },
    { label: 'Recommended disposition', code: 'Retain current codes', detail: 'Reject the unsupported respiratory-failure alert.', state: 'No code addition', tone: 'green', source: 'silo-3', check: 'false-positive' },
    { label: 'Flagged code considered', code: 'J95.821', detail: 'Routine postoperative ventilation is not a provider diagnosis of acute postprocedural respiratory failure.', state: 'Not supported', tone: 'neutral', source: 'silo-3', check: 'false-positive' },
  ] : kind === 'charge' ? [
    { label: 'Current ledger', code: 'Charge missing', detail: 'No posted charge for the consumed cranial mesh event.', state: 'Discrepancy', tone: 'amber', source: 'demo-charge', check: 'charge' },
    { label: 'Recommended correction', code: 'Revenue 0278', detail: 'Post the verified consumption event using the separate illustrative charge ledger.', state: 'Consumption confirmed', tone: 'green', source: 'demo-charge', check: 'charge' },
    { label: 'Exclusions reviewed', code: 'Duplicate / unused item', detail: 'The demo record confirms this item was implanted, not returned or wasted, and not previously charged.', state: 'Not a duplicate', tone: 'neutral', source: 'demo-charge', check: 'charge' },
  ] : [];
  return <section className="panel agent-overview">
    <header><div><span className="analysis-icon"><Sparkles size={20} /></span><div><h2>Agent analysis</h2><p>{kind === 'fusion' ? 'The operative report documents a dural complication omitted from the claim.' : kind === 'diabetes' ? response ? 'Provider clarification is available for diabetes code review.' : 'Additional documentation is required before selecting a diabetes complication code.' : kind === 'charge' ? 'A consumed implant is missing from the charge ledger.' : kind === 'false-positive' ? 'The respiratory-failure alert is not supported by the supplied record.' : 'The imported coding proposal requires specialist validation.'}</p></div></div><Confidence score={primary.confidence} /></header>
    {choices.length > 0 && <div className="code-selection-grid">{choices.map((choice, i) => <div className={`code-option ${i === 1 ? 'recommended-option' : ''}`} key={choice.label}><span className="code-option-label">{choice.label}</span><strong>{choice.code}</strong><p>{choice.detail}</p><Badge tone={choice.tone}>{choice.state}</Badge><button className="text-button" onClick={() => onEvidence(choice.check, choice.source, ['M48.062', 'G97.41', 'G97.48', 'E11.9', 'E11.65', 'E11.22', 'J95.821'].includes(choice.code) ? choice.code : undefined)}><FileText size={13} />{i === 2 ? 'Review source' : 'Supporting document'}<ArrowRight size={13} /></button></div>)}</div>}
    <span className="agent-confidence-disclosure">Illustrative check confidence · provider documentation and reviewer verification required.</span>
    <div className="analysis-context"><Info size={14} /><p>{e.id === HERO_ID ? 'G97.41 refers specifically to dura; G97.48 refers to another nervous-system structure. Both are CCs. The separate fusion-site correction—not this diagnosis alone—supports the DRG comparison.' : 'Illustrative confidence describes this review check; it is not proof of a diagnosis or authorization to change the claim.'}</p>{e.id === DIABETES_ID && !response && <Button onClick={onModify}><MessageSquareText size={14} />Request clarification</Button>}</div>
    {e.review.coderDecision && <div className="coder-result"><ShieldCheck size={17} /><div><strong>Coder decision: reject the alert</strong><p>{e.review.coderDecision.reason}</p><span>{e.review.coderDecision.author} · Administrator disposition pending unless already recorded</span></div></div>}
  </section>;
}

export function ClaimDiscrepancy({ encounter: e, onCompare }: { encounter: Encounter; onCompare: () => void }) {
  const kind = caseKind(e.id);
  const complete = resolved(e);
  return <section className={`panel discrepancy-panel ${complete ? 'resolved' : ''}`}>
    <div className="discrepancy-icon">{complete ? <Check size={20} /> : <CircleAlert size={20} />}</div><div><div className="discrepancy-heading"><h2>{complete ? 'Review disposition recorded' : 'Claim discrepancy'}</h2><Badge tone={complete ? 'green' : 'amber'}>{complete ? 'Resolved in demo' : 'Human decision required'}</Badge></div><p>{complete ? 'The recorded decision is reflected in the current claim. Original clinical documents remain unchanged.' : kind === 'fusion' ? 'The claim omits the documented dural complication and the L5-S1 fusion site. G97.41 is supported by the operative report; the separately signed demo clarification supports D62. Add only the reviewed, reportable conditions and correct procedure anatomy.' : kind === 'diabetes' ? 'The initial diabetes documentation does not establish hyperglycemia or CKD. Use the provider response to determine the appropriate code set; E11.22 also needs the documented CKD stage.' : kind === 'charge' ? 'The separately confirmed implant-consumption event has no posted charge. This is a charge-only correction with no DRG or fixed-payment increase.' : kind === 'false-positive' ? 'The rule flagged routine ventilation as respiratory failure. No provider diagnosis supports J95.821; rejecting the alert retains the current claim.' : 'The imported proposal has not passed the applicable-year grouper and documentation review.'}</p></div>{kind === 'fusion' && <Button onClick={onCompare}>DRG comparison<ArrowRight size={14} /></Button>}
  </section>;
}

export function PersistentClaimActions({ encounter: e, canSubmit, preview, onModify, onSubmit, onHome }: {
  encounter: Encounter; canSubmit: boolean; preview: boolean; onModify: () => void; onSubmit: () => void; onHome: () => void;
}) {
  const submitted = e.review.status === 'submitted';
  return <div className="persistent-claim-actions"><div className="action-status">{submitted ? <ShieldCheck size={19} /> : canSubmit ? <Check size={19} /> : <CircleAlert size={19} />}<div><strong>{submitted ? 'Simulated submission accepted' : canSubmit ? 'Human review complete' : 'Review required before submission'}</strong><span>{submitted ? e.review.receipt : canSubmit ? 'Approved claim is ready for preview and simulation.' : 'Unapproved coding changes are not included in the claim.'}</span></div></div><div className="persistent-buttons"><button className="text-button return-home" onClick={onHome}>Return home</button><Button onClick={onModify} disabled={submitted || !e.review.analysisReady}><Pencil size={15} />Modify</Button><Button variant="primary" onClick={onSubmit} disabled={submitted || (preview && !canSubmit)}>{submitted ? <Check size={15} /> : <ArrowRight size={15} />}Submit</Button></div></div>;
}
