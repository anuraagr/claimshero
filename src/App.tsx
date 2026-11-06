import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, ClipboardList, Command, Database, Download, ExternalLink, FileCheck2, History, Hospital, LayoutDashboard, LockKeyhole, Menu, MessageSquareText, Play, RotateCcw, Search, Settings2, ShieldCheck, X } from 'lucide-react';
import { Button, DataFootnote, IconButton, Modal, Notice, SectionHeading } from './components';
import { DEFAULT_FILTER, Worklist, type WorklistFilter } from './Dashboard';
import { AuditTrail, EncounterView, ResolutionPanel, type RunAction } from './Encounter';
import { ClaimsHome, NotificationFeed } from './ClaimsHome';
import { createDemoState, DEMO_CONFIG } from './demoScenarios';
import { markNotificationRead, rememberReviewed, simulateNotification } from './notifications';
import { AssumptionsModal, EvidenceDrawer } from './Evidence';
import { CURRENT_USER, getEncounters, HERO_ID, DIABETES_ID, INPUT_FILES, REFERENCES, SOURCE_TOTALS, STORAGE_KEY, type Encounter } from './portfolio';
import { errorMessage, initials, metrics, money, parseSavedState, ready, transition } from './workflow';
import type { DemoNotification, EncounterTab, Page, WorkbenchState } from './model';

type AppModal =
  | { kind: 'evidence'; id: string; checkId?: string; sourceId?: string; code?: string }
  | { kind: 'assumptions'; id?: string }
  | { kind: 'modify'; id: string }
  | { kind: 'search' }
  | { kind: 'notifications' }
  | { kind: 'settings' }
  | { kind: 'reset' };
type Route = { page: Page; id?: string; tab: EncounterTab };
const PAGES: Page[] = ['overview', 'worklist', 'queries', 'claims', 'audit', 'methodology'];
const TABS: EncounterTab[] = ['review', 'sources', 'clinical', 'charges', 'comparison', 'claim', 'history'];
const pageNames: Record<Page, string> = { overview: 'Home', worklist: 'All claims', queries: 'Documentation queries', claims: 'Claims & submission', audit: 'Audit trail', methodology: 'Methodology & sources' };
function readRoute(): Route {
  const [first, id, tab] = window.location.hash.slice(1).split('/');
  if (first === 'encounter' && id) return { page: 'worklist', id, tab: TABS.find(t => t === tab) ?? 'review' };
  return { page: PAGES.find(p => p === first) ?? 'overview', tab: 'review' };
}
function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { state: saved ? parseSavedState(saved) : createDemoState(), error: '' };
  } catch (error) {
    return { state: createDemoState(), error: `${errorMessage(error)} Changes are blocked until you reset this demo.` };
  }
}

export default function App() {
  const [initial] = useState(readSaved);
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const [route, setRoute] = useState(readRoute);
  const [modal, setModal] = useState<AppModal | null>(null);
  const [filter, setFilter] = useState<WorklistFilter>(DEFAULT_FILTER);
  const [year, setYear] = useState('all');
  const [mobileNav, setMobileNav] = useState(false);
  const [failure, setFailure] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const stateRef = useRef(state);
  const notificationRef = useRef<() => void>(() => {});
  stateRef.current = state;
  const encounters = useMemo(() => getEncounters(state), [state]);
  const selected = encounters.find(e => e.id === route.id);
  const scope = encounters.filter(e => year === 'all' || (year === 'fy26' ? e.census.discharge_date < '2026-10-01' : e.census.discharge_date >= '2026-10-01'));
  const stats = metrics(encounters);
  const unreadCount = state.demo.notifications.filter(n => !n.read).length;
  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); };
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setModal({ kind: 'search' }); } };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (storageError || !state.demo.automaticNotifications || state.demo.notificationIndex >= DEMO_CONFIG.totalNotifications) return;
    const timer = window.setTimeout(() => notificationRef.current(), DEMO_CONFIG.notificationIntervalMs);
    return () => window.clearTimeout(timer);
  }, [state.demo.automaticNotifications, state.demo.notificationIndex, storageError]);
  const commit = (next: WorkbenchState) => {
    if (storageError) throw new Error(storageError);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    stateRef.current = next;
    setState(next);
  };
  const navigate = (page: Page) => {
    setMobileNav(false); setRoute({ page, tab: 'review' });
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const openEncounter = (id: string, tab: EncounterTab = 'review') => {
    try { commit(rememberReviewed(stateRef.current, id)); } catch (error) { setToast({ text: errorMessage(error), error: true }); }
    setModal(null); setMobileNav(false); setRoute({ page: 'worklist', id, tab });
    window.location.hash = `encounter/${id}/${tab}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const applyAction: RunAction = (id, action) => {
    try {
      if (storageError) throw new Error(storageError);
      const next = transition(stateRef.current, id, action);
      commit(next);
      const failed = action.type === 'submit' && action.fail;
      setToast({ text: failed ? 'Simulated transport failed. The approved claim remains ready for retry.' : next.audit[0].action + '. Saved locally.', error: failed });
      if (['approve', 'reject'].includes(action.type) && modal?.kind === 'modify') setModal(null);
      if (id === HERO_ID && guide !== null && ['approve', 'reject'].includes(action.type) && ready(getEncounters(next).find(e => e.id === id)!)) setGuide(4);
      if (id === HERO_ID && guide !== null && action.type === 'submit' && !action.fail) setGuide(7);
      return true;
    } catch (error) {
      setToast({ text: errorMessage(error), error: true });
      return false;
    }
  };
  const emitNotification = () => {
    try {
      const next = simulateNotification(stateRef.current);
      commit(next);
      const event = next.demo.notifications[0];
      setToast({ text: `${event.title}. Open it from Notifications to review the claim.` });
    } catch (error) { setToast({ text: errorMessage(error), error: true }); }
  };
  notificationRef.current = emitNotification;
  const openNotification = (notification: DemoNotification) => {
    try { commit(markNotificationRead(stateRef.current, notification.id)); } catch (error) { setToast({ text: errorMessage(error), error: true }); }
    openEncounter(notification.encounterId);
    if (guide === 1 && notification.encounterId === HERO_ID) setGuide(2);
  };
  const markAllRead = () => {
    try { commit({ ...stateRef.current, demo: { ...stateRef.current.demo, notifications: stateRef.current.demo.notifications.map(n => ({ ...n, read: true })) } }); }
    catch (error) { setToast({ text: errorMessage(error), error: true }); }
  };
  const setAutomatic = (enabled: boolean) => {
    try { commit({ ...stateRef.current, demo: { ...stateRef.current.demo, automaticNotifications: enabled } }); }
    catch (error) { setToast({ text: errorMessage(error), error: true }); }
  };
  const reset = () => {
    try {
      const fresh = createDemoState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      stateRef.current = fresh; setState(fresh); setStorageError('');
      setGuide(null); setModal(null); setFailure(false); setFilter(DEFAULT_FILTER); setYear('all'); navigate('overview');
      setToast({ text: 'Demo reset. Original 80 encounters restored; source files unchanged.' });
    } catch (error) { setToast({ text: `Could not persist the reset: ${errorMessage(error)}`, error: true }); }
  };
  const startGuide = () => {
    setYear('all'); setFilter(DEFAULT_FILTER);
    const hero = encounters.find(e => e.id === HERO_ID)!;
    if (hero.review.status === 'submitted') { setGuide(7); openEncounter(HERO_ID, 'claim'); }
    else if (ready(hero)) { setGuide(4); openEncounter(HERO_ID); }
    else { setGuide(state.demo.notificationIndex ? 1 : 0); navigate('overview'); }
  };
  const advanceGuide = () => {
    if (guide === null) return;
    const hero = encounters.find(e => e.id === HERO_ID)!;
    if (guide === 0) { if (!state.demo.notificationIndex) emitNotification(); setGuide(1); }
    else if (guide === 1) { const event = state.demo.notifications.find(n => n.type === 'analysis'); if (event) openNotification(event); else openEncounter(HERO_ID); setGuide(2); }
    else if (guide === 2) { setModal({ kind: 'evidence', id: HERO_ID, checkId: 'dura', code: 'G97.41' }); setGuide(3); }
    else if (guide === 3) { setModal({ kind: 'modify', id: HERO_ID }); }
    else if (guide === 4) { openEncounter(HERO_ID, 'comparison'); setGuide(5); }
    else if (guide === 5) { openEncounter(HERO_ID, 'claim'); setGuide(6); }
    else if (guide === 6) {
      if (ready(hero)) applyAction(HERO_ID, { type: 'submit', fail: failure });
      else if (hero.review.status === 'submitted') setGuide(7);
      else setToast({ text: 'Resolve all blockers and complete human review before submission.', error: true });
    } else if (guide === 7) { setGuide(null); navigate('overview'); setToast({ text: 'Walkthrough complete. The home queue reflects the submitted claim.' }); }
  };
  const guideSteps = [
    { title: 'Trigger a notification', text: 'Simulate a completed claim analysis. The unread count and patient row update together.', cta: 'Trigger notification' },
    { title: 'Open the patient claim', text: 'Open the new analysis notification for David Okafor. It will be marked read and added to Last reviewed.', cta: 'Open patient from notification' },
    { title: 'Review the code and documentation', text: 'Compare G97.41 with G97.48 and inspect the source note. Confidence is a review indicator, not proof.', cta: 'Inspect supporting documentation' },
    { title: 'Record a review decision', text: 'Close the document panel, select Modify, enter a reason and confirm source review. Accept, reject or route the recommendation.', cta: 'Modify claim' },
    { title: 'Compare the approved grouping', text: 'Review 451 → 448 and the illustrative payment calculation. The change follows the approved fusion-site correction, not an MCC assumption.', cta: 'Compare DRG & payment' },
    { title: 'Preview the corrected claim', text: 'Confirm the approved diagnoses, procedures, charges and resolved blockers.', cta: 'Preview corrected claim' },
    { title: 'Simulate submission', text: 'Submit the human-reviewed claim to the local simulator. No real payer transmission occurs.', cta: 'Simulate reviewed submission' },
    { title: 'Return to the updated queue', text: 'The submitted claim, unread notifications and last-reviewed list remain synchronized.', cta: 'Return to updated home' },
  ];
  const modalEncounter = modal && 'id' in modal ? encounters.find(e => e.id === modal.id) : undefined;
  const notificationProps = { state, onSimulate: emitNotification, onOpenNotification: openNotification, onMarkAllRead: markAllRead, onAutomaticChange: setAutomatic };
  return <div className={`app-shell claimshero-shell ${selected ? 'claim-open' : ''} ${mobileNav ? 'nav-open' : ''}`}>
    {mobileNav && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className="sidebar">
      <button className="brand claimshero-brand" onClick={() => navigate('overview')} aria-label="ClaimsHero home"><span className="claimshero-mark"><ShieldCheck size={23} /></span><span>Claims<span className="hero-brand-word">Hero</span></span></button>
      <div className="workspace-switch"><span className="workspace-icon"><Hospital size={18} /></span><div><strong>NYC Health + Hospitals</strong><span>Neurosurgery portfolio</span></div></div>
      <span className="sidebar-eyebrow">MARGIN INTEGRITY</span>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={route.page === 'overview' && !selected ? 'active' : ''} onClick={() => navigate('overview')}><LayoutDashboard size={18} /><span>Home</span></button>
        <button className={route.page === 'worklist' ? 'active' : ''} onClick={() => { setFilter(DEFAULT_FILTER); navigate('worklist'); }}><ClipboardList size={18} /><span>All claims</span><em>{encounters.length}</em></button>
        <button className={route.page === 'queries' ? 'active' : ''} onClick={() => navigate('queries')}><MessageSquareText size={18} /><span>Documentation queries</span>{stats.queries > 0 && <em className="nav-amber">{stats.queries}</em>}</button>
        <button className={route.page === 'claims' ? 'active' : ''} onClick={() => navigate('claims')}><FileCheck2 size={18} /><span>Claims & submission</span>{stats.ready > 0 && <em>{stats.ready}</em>}</button>
        <button className={route.page === 'audit' ? 'active' : ''} onClick={() => navigate('audit')}><History size={18} /><span>Audit trail</span></button>
      </nav>
      <section className="last-reviewed"><h2><History size={13} />Last reviewed</h2>{state.demo.lastReviewed.length ? state.demo.lastReviewed.map(item => {
        const patient = encounters.find(e => e.id === item.encounterId);
        return patient ? <button key={item.encounterId} onClick={() => openEncounter(item.encounterId)}><span className="avatar">{initials(patient.census.patient_name)}</span><div><strong>{patient.census.patient_name}</strong><span>{item.encounterId}</span></div><ChevronRight size={12} /></button> : null;
      }) : <p>Claims you open will appear here.</p>}</section>
      <span className="sidebar-eyebrow second">TRUST & TRANSPARENCY</span>
      <nav className="primary-nav"><button className={route.page === 'methodology' ? 'active' : ''} onClick={() => navigate('methodology')}><BookOpen size={18} /><span>Methodology & sources</span></button><button onClick={() => setModal({ kind: 'assumptions' })}><ShieldCheck size={18} /><span>Payment assumptions</span></button></nav>
      <div className="sidebar-bottom">
        <div className="sidebar-portfolio"><span>PORTFOLIO SCOPE</span><div><strong>80</strong><small>encounters</small><strong>{new Set(encounters.map(e => e.census.facility_name)).size}</strong><small>facilities</small></div><p>3 original Epic source silos<br />4 guided review scenarios</p></div>
        <div className="sandbox-label"><span className="sandbox-dot" />Synthetic demonstration<LockKeyhole size={12} /></div>
        <button className="sidebar-settings" onClick={() => setModal({ kind: 'settings' })}><Settings2 size={17} />Demo settings<ChevronRight size={14} /></button>
      </div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="topbar-left"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></IconButton><span className="topbar-workspace">ClaimsHero</span><ChevronRight size={14} /><strong>{selected ? 'Patient claim review' : pageNames[route.page]}</strong></div><div className="topbar-right"><button className="global-search" onClick={() => setModal({ kind: 'search' })}><Search size={16} /><span>Search claims...</span><kbd><Command size={10} />K</kbd></button><span className="topbar-divider" /><IconButton label={`Notifications (${unreadCount} unread)`} onClick={() => setModal({ kind: 'notifications' })}><Bell size={18} />{unreadCount > 0 && <span className="notification-counter" aria-live="polite">{unreadCount}</span>}</IconButton><button className="user-button" aria-label="User and demo settings" onClick={() => setModal({ kind: 'settings' })}>ML</button></div></header>
      <main className="main-content" id="main-content">
        {storageError && <Notice tone="error" title="Saved demo could not be loaded">{storageError}<Button onClick={() => setModal({ kind: 'reset' })}>Reset demo</Button></Notice>}
        {!selected && <>
          <div className="page-heading"><div><div className="eyebrow">{route.page === 'overview' ? 'CLAIMS ADMINISTRATION / NYC HEALTH + HOSPITALS' : 'NYC HEALTH + HOSPITALS / SYNTHETIC PORTFOLIO'}</div><h1>{route.page === 'overview' ? 'Welcome back, Morgan' : pageNames[route.page]}</h1><p>{route.page === 'overview' ? 'Review patient claims, resolve documentation requests and track decisions.' : route.page === 'queries' ? 'Track outstanding documentation requests and provider responses.' : route.page === 'claims' ? 'Review approved claim revisions, submission blockers and simulated acknowledgements.' : route.page === 'audit' ? 'Review decisions, supporting documentation and claim revision history.' : route.page === 'methodology' ? 'Coding references, payment assumptions and source-file provenance.' : 'Prioritize encounters by review urgency, coding status and estimated financial impact.'}</p></div><div className="heading-actions">{route.page === 'worklist' && <div className="date-filter"><select value={year} onChange={event => setYear(event.target.value)} aria-label="Discharge coding year"><option value="all">Jul – Oct 2026</option><option value="fy26">FY2026 discharges</option><option value="fy27">FY2027 discharges</option></select><ChevronDown size={14} /></div>}<Button onClick={() => setModal({ kind: 'reset' })}><RotateCcw size={14} />Reset demo</Button><Button variant="primary" onClick={startGuide}><Play size={14} fill="currentColor" />Guided demo</Button></div></div>
          {route.id && !selected && <Notice tone="error" title="Encounter not found">Choose a patient from the worklist; this encounter is not in the supplied portfolio.</Notice>}
        </>}
        {selected ? <EncounterView key={selected.id} encounter={selected} tab={route.tab} onTab={tab => openEncounter(selected.id, tab)} onBack={() => navigate('overview')}
          onEvidence={(checkId, sourceId, code) => setModal({ kind: 'evidence', id: selected.id, checkId, sourceId, code })} onAssumptions={() => setModal({ kind: 'assumptions', id: selected.id })}
          onAction={applyAction} audit={state.audit} simulateFailure={failure} onModify={() => setModal({ kind: 'modify', id: selected.id })} onAnalyze={emitNotification} onHome={() => navigate('overview')} /> :
          route.page === 'overview' ? <ClaimsHome encounters={encounters} onOpen={id => openEncounter(id, ready(encounters.find(e => e.id === id)!) || encounters.find(e => e.id === id)!.review.status === 'submitted' ? 'claim' : 'review')} onWorklist={() => navigate('worklist')} {...notificationProps} /> :
            route.page === 'worklist' ? <Worklist key={`${filter.kind}-${filter.status}`} encounters={scope} onOpen={openEncounter} filter={filter} /> :
              route.page === 'queries' ? <><div className="query-page-intro"><div><MessageSquareText size={26} /><div><strong>{stats.queries} documentation reviews</strong><p>Queries and responses are simulated. Source notes are never rewritten.</p></div></div><Button onClick={() => openEncounter(DIABETES_ID)}>Open diabetes walkthrough<ArrowRight size={15} /></Button></div><Worklist key="queries" encounters={encounters} onOpen={openEncounter} filter={{ kind: 'query', status: 'open' }} title="Documentation review queue" /></> :
                route.page === 'claims' ? <><div className="claim-queue-metrics"><div><FileCheck2 size={23} /><span><b>{stats.ready}</b> ready for simulation</span></div><div><Check size={23} /><span><b>{stats.submitted}</b> simulated submissions</span></div><div><LockKeyhole size={23} /><span><b>{encounters.filter(e => !ready(e) && e.review.status !== 'submitted').length}</b> held for review</span></div></div><Worklist key="claims" encounters={encounters} onOpen={id => openEncounter(id, 'claim')} filter={{ kind: 'all', status: 'ready' }} title="Claim submission queue" />{!stats.ready && !stats.submitted && <div className="claim-queue-help"><p>Complete a review to move a claim into this queue.</p><Button onClick={() => openEncounter(HERO_ID)}>Review the featured encounter<ArrowRight size={15} /></Button></div>}</> :
                  route.page === 'audit' ? <AuditTrail events={state.audit} onEncounter={id => openEncounter(id, 'history')} /> : <Methodology />}
        <DataFootnote />
      </main>
    </div>
    {guide !== null && <div className="guide-card" role="region" aria-label="Guided presentation"><div className="guide-card-top"><span><Play size={12} fill="currentColor" />GUIDED WALKTHROUGH</span><span>{guide + 1} / {guideSteps.length}</span><IconButton label="Close guided walkthrough" onClick={() => setGuide(null)}><X size={15} /></IconButton></div><div className="guide-progress">{guideSteps.map((_, i) => <span className={i <= guide ? 'done' : ''} key={i} />)}</div><h3>{guideSteps[guide].title}</h3><p>{guideSteps[guide].text}</p><Button variant="primary" onClick={advanceGuide}>{guideSteps[guide].cta}<ArrowRight size={14} /></Button></div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleAlert size={18} /> : <Check size={18} />}<span>{toast.text}</span><IconButton label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></IconButton></div>}
    {modal?.kind === 'evidence' && modalEncounter && <EvidenceDrawer key={`${modal.id}-${modal.checkId}-${modal.sourceId}-${modal.code}`} encounter={modalEncounter} checkId={modal.checkId} sourceId={modal.sourceId} code={modal.code} onClose={() => setModal(null)} />}
    {modal?.kind === 'assumptions' && <AssumptionsModal encounter={modalEncounter} onClose={() => setModal(null)} />}
    {modal?.kind === 'modify' && modalEncounter && <Modal title="Modify claim" subtitle={`${modalEncounter.census.patient_name} · ${modalEncounter.id} · Changes require a recorded reason`} onClose={() => setModal(null)} wide><ResolutionPanel encounter={modalEncounter} onAction={applyAction} onClaim={() => openEncounter(modalEncounter.id, 'claim')} /></Modal>}
    {modal?.kind === 'search' && <SearchModal encounters={encounters} onClose={() => setModal(null)} onOpen={openEncounter} />}
    {modal?.kind === 'notifications' && <Modal title="Notifications" subtitle="Simulated claim updates. Click an event to open the corresponding claim." onClose={() => setModal(null)}><NotificationFeed {...notificationProps} /></Modal>}
    {modal?.kind === 'settings' && <Modal title="Demo settings" subtitle="Everything runs locally with synthetic patient data." onClose={() => setModal(null)}><div className="settings-person"><span className="avatar">{initials(CURRENT_USER)}</span><div><strong>{CURRENT_USER}</strong><p>Hospital claims administrator · synthetic persona</p></div></div><label className="setting-toggle"><span><strong>Simulate submission transport failure</strong><p>Exercise a failed submission and safe retry. Approved claims remain intact.</p></span><input type="checkbox" checked={failure} onChange={event => setFailure(event.target.checked)} /></label><div className="settings-info"><Database size={18} /><p>Review state and audit events persist in this browser’s local storage. All 80 imported records and three Epic silos remain unchanged. No backend, account, API key, or network connection is required after loading the app.</p></div><div className="settings-reset"><h3>Start the presentation again</h3><p>Clear only this demo’s local decisions, queries, audit extensions and simulated submissions. Original source files are never deleted.</p><Button onClick={() => setModal({ kind: 'reset' })}><RotateCcw size={15} />Reset demo</Button></div></Modal>}
    {modal?.kind === 'reset' && <Modal title="Reset this demonstration?" onClose={() => setModal(null)}><p className="reset-description">This restores ClaimsHero’s starting queue, documentation context and notification sequence. Your demo decisions and simulated receipts will be cleared. The nine supplied files and three raw clinical silos will not change.</p><div className="modal-actions"><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="danger" onClick={reset}><RotateCcw size={15} />Reset demo</Button></div></Modal>}
  </div>;
}

function SearchModal({ encounters, onClose, onOpen }: { encounters: Encounter[]; onClose: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const items = encounters.filter(e => `${e.census.patient_name} ${e.id} ${e.census.facility_name} ${e.claim.clinical_archetype}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <Modal title="Find an encounter" subtitle="Search 80 synthetic patients by name, encounter, facility or procedure." onClose={onClose}><label className="search-field command-search"><Search size={18} /><input autoFocus data-autofocus placeholder="Patient, encounter, facility, procedure..." value={query} onChange={e => setQuery(e.target.value)} aria-label="Global encounter search" /></label><div className="command-results">{items.length ? items.map(e => <button key={e.id} onClick={() => onOpen(e.id)}><span className="avatar">{initials(e.census.patient_name)}</span><div><strong>{e.census.patient_name}</strong><span>{e.id} · {e.census.facility_name}</span></div><ChevronRight size={16} /></button>) : <p className="no-results">No matching encounters. Try a name, facility, or encounter ID.</p>}</div></Modal>;
}

function Methodology() {
  return <div className="methodology-page"><section className="mission-panel"><span className="eyebrow">ABOUT CLAIMSHERO</span><h2>Health system margin management</h2><p>We help health systems find and recover margin across revenue and cost, strengthening the financial capacity needed to keep investing in care and serving their communities.</p><div><ShieldCheck size={16} />This workbench covers mid-cycle coding, charge reconciliation and documentation review.</div></section>
    <div className="methodology-grid"><section className="panel padded"><h3><Database size={20} />80 encounters. Original inputs intact.</h3><p>The five 80-row CSV tables reconcile with the read-only SQLite database. All nine supplied files are copied byte-for-byte, with SHA-256 provenance. Imported source records are separate from synthetic extensions and local claim decisions.</p><dl className="methodology-totals"><div><dt>Imported baseline, illustrative</dt><dd>{money(SOURCE_TOTALS.baseline)}</dd></div><div><dt>Imported proposed, illustrative</dt><dd>{money(SOURCE_TOTALS.proposed)}</dd></div><div><dt>Unvalidated exposure</dt><dd>{money(SOURCE_TOTALS.exposure)}</dd></div></dl><p className="small-note">This is a fictional NYC H+H portfolio for demonstration, not an institutional endorsement or production connection. Race, ethnicity and neighborhood income fields are not used in prioritization or coding decisions.</p></section><section className="panel padded"><h3><ShieldCheck size={20} />Corrections to the supplied reference</h3><div className="methodology-rule"><Check size={15} /><p>D62 and G97.41 are <b>CCs, not MCCs</b>. The source’s 460 → 459 proposal is not applied.</p></div><div className="methodology-rule"><Check size={15} /><p>459/460 were retired before 2026. The featured July discharge uses the FY2026 <b>451 → 448</b> procedure-extent path.</p></div><div className="methodology-rule"><Check size={15} /><p>L5-S1 is lumbosacral: <b>0SG30AJ</b>, not the source’s multi-lumbar 0SG10AJ shortcut.</p></div><div className="methodology-rule"><Check size={15} /><p>October records need <b>FY2027 validation</b>. NY Medicaid APR-DRG is not mapped from MS-DRG by a multiplier.</p></div></section></div>
    <section className="panel padded"><SectionHeading title="Boundaries that make the demo honest" /><div className="boundaries-grid"><div><h4>Three untouched source silos</h4><p>Nurse OpTime / synthetic FDA-UDI-format barcodes; surgeon op note; recovery nursing labs / MAR. No invented source timestamps, signatures or LOINC IDs.</p></div><div><h4>Separate, visible extensions</h4><p>Diabetes example, item-consumption confirmation, illustrative charge ledger, signed response simulator and per-check scores. None are represented as facts from the imported files.</p></div><div><h4>Revenue is not cost</h4><p>Imported device costs are acquisition costs. Gross charges are not reimbursement. OR variance is a review signal—not an asserted saving, staffing recommendation, or avoidable clinical expense.</p></div><div><h4>Human review is the gate</h4><p>Queries, rejections, escalation and routing create audit entries but do not modify codes. Only approval changes the claim. Submission is a local simulation with a safe failure/retry path.</p></div></div></section>
    <section className="panel padded"><SectionHeading title="Verified coding references" subtitle="Public sources used to validate the scoped clinical demonstration." /><div className="references-grid">{REFERENCES.map(r => <a key={r.id} href={r.url} className="reference-card" target="_blank" rel="noreferrer"><div><span>{r.source}</span><strong>{r.title}</strong><p>{r.finding}</p></div><ExternalLink size={15} /></a>)}</div></section>
    <section className="panel padded"><SectionHeading title="Input files & provenance" subtitle="Download the unchanged originals; inspect the hashes to verify preservation." /><div className="input-file-list">{INPUT_FILES.map(file => <div className="input-file" key={file.name}><FileCheck2 size={18} /><div><strong>{file.name}</strong><span>{(file.bytes / 1024).toFixed(1)} KB · original bytes preserved</span><details><summary>SHA-256</summary><code>{file.sha256}</code></details></div><a href={`/inputs/${file.name}`} download className="icon-button" aria-label={`Download original ${file.name}`}><Download size={17} /></a></div>)}</div><p className="fine-print">The supplied Python scripts are preserved as inputs and design context; they are not executed. The application does not copy their unvalidated coding assertions into approved claims.</p></section>
  </div>;
}
