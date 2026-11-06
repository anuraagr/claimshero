import { useState } from 'react';
import { ArrowRight, Bell, Check, Clock3, FileCheck2, Inbox, MessageSquareText, Search, ShieldCheck, Sparkles, UserRoundCheck, Zap } from 'lucide-react';
import { Badge, Button, EmptyState } from './components';
import { DEMO_CONFIG } from './demoScenarios';
import { CHARGE_ID, DEEP_IDS, SOURCE_TOTALS, type Encounter } from './portfolio';
import { agentChecks, initials, money, proposedDelta, ready, resolved } from './workflow';
import { CHARGE_ASSUMPTIONS } from './paymentAssumptions';
import type { DemoNotification, WorkbenchState } from './model';

export function queueStatus(e: Encounter) {
  if (e.review.status === 'submitted') return { label: 'Submitted', tone: 'green' };
  if (ready(e)) return { label: 'Ready to submit', tone: 'green' };
  if (!e.review.analysisReady) return { label: 'Analysis pending', tone: 'blue' };
  if (e.review.query?.status === 'open') return { label: 'Awaiting response', tone: 'amber' };
  if (e.review.coderDecision && !resolved(e)) return { label: 'Coder reviewed', tone: 'purple' };
  if (e.review.status === 'routed') return { label: 'With coder', tone: 'purple' };
  if (e.review.status === 'escalated') return { label: 'Escalated', tone: 'amber' };
  return { label: 'Decision needed', tone: 'blue' };
}

export interface NotificationProps {
  state: WorkbenchState;
  onSimulate: () => void;
  onOpenNotification: (notification: DemoNotification) => void;
  onMarkAllRead: () => void;
  onAutomaticChange: (enabled: boolean) => void;
}

export function NotificationFeed({ state, onSimulate, onOpenNotification, onMarkAllRead, onAutomaticChange }: NotificationProps) {
  const { notifications, notificationIndex, automaticNotifications } = state.demo;
  const unread = notifications.filter(n => !n.read).length;
  return <section className="notification-feed panel" aria-label="Live demo notifications">
    <header><div><Bell size={17} /><h2>Notifications</h2><span className="unread-count" aria-live="polite">{unread}</span></div><button className="text-button" disabled={!unread} onClick={onMarkAllRead}>Mark read</button></header>
    <div className="notification-controls"><label><input type="checkbox" checked={automaticNotifications} onChange={event => onAutomaticChange(event.target.checked)} aria-label="Automatic demo notifications" /><span className={automaticNotifications ? 'live-dot active' : 'live-dot'} />Auto simulation {automaticNotifications ? 'on' : 'off'}</label><span>Every 45s · max 3</span></div>
    <div className="notification-feed-list" aria-live="polite" aria-relevant="additions">{notifications.length ? notifications.map(notification => <button key={notification.id} className={`feed-event ${notification.read ? 'read' : 'unread'}`} onClick={() => onOpenNotification(notification)} aria-label={`Open notification: ${notification.title}`}>
      <span className={`feed-event-icon ${notification.type}`}>{notification.type === 'analysis' ? <Sparkles size={16} /> : notification.type === 'query-response' ? <MessageSquareText size={16} /> : <UserRoundCheck size={16} />}</span>
      <div><strong>{notification.title}</strong><p>{notification.message}</p><small>{new Date(notification.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Simulated</small></div>{!notification.read && <i className="unread-dot" />}
    </button>) : <div className="notification-empty"><Bell size={24} /><strong>No new notifications</strong><p>Claim analysis, query responses and coder decisions will appear here.</p></div>}</div>
    <footer><Button onClick={onSimulate} disabled={notificationIndex >= DEMO_CONFIG.totalNotifications}><Zap size={15} />Simulate notification</Button><p>{notificationIndex < 3 ? `Next: ${['newly analyzed claim', 'documentation response', 'coder decision'][notificationIndex]}` : 'All three events delivered. Reset demo to replay.'}</p></footer>
  </section>;
}

export function ClaimsHome({ encounters, onOpen, onWorklist, ...notificationProps }: NotificationProps & {
  encounters: Encounter[]; onOpen: (id: string) => void; onWorklist: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const cases = DEMO_CONFIG.queue.map(config => ({ config, encounter: encounters.find(e => e.id === config.id)! }));
  const newClaims = cases.filter(({ encounter: e }) => e.review.isNew && !resolved(e)).length;
  const decisions = cases.filter(({ encounter: e }) => e.review.analysisReady && e.review.status === 'review' && e.review.query?.status !== 'open').length;
  const queries = cases.filter(({ encounter: e }) => e.review.query?.status === 'open').length;
  const risk = cases.filter(({ encounter: e }) => e.review.analysisReady && !resolved(e)).reduce((sum, { encounter: e }) => sum + proposedDelta(e), 0);
  const reviewed = cases.filter(({ encounter: e }) => resolved(e)).length;
  const visible = cases.filter(({ encounter: e, config }) => {
    const matchesText = `${e.census.patient_name} ${e.id} ${config.issue}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'new' ? e.review.isNew && !resolved(e) : filter === 'decision' ? e.review.analysisReady && e.review.status === 'review' && e.review.query?.status !== 'open' : filter === 'query' ? e.review.query?.status === 'open' : resolved(e));
    return matchesText && matchesFilter;
  });
  return <div className="home-layout">
    <div className="home-center">
      <div className="home-metrics" aria-label="Review queue summary">
        <button onClick={() => setFilter('new')}><span><Inbox size={14} />New claims</span><strong>{newClaims}</strong></button>
        <button onClick={() => setFilter('decision')}><span><FileCheck2 size={14} />Need a decision</span><strong>{decisions}</strong></button>
        <button onClick={() => setFilter('query')}><span><MessageSquareText size={14} />Queries awaiting response</span><strong>{queries}</strong></button>
        <div><span>Illustrative reimbursement at risk</span><strong>{money(risk)}</strong><small>4-case demo scope · excludes gross charges</small></div>
      </div>
      <section className="panel home-queue">
        <div className="home-queue-heading"><div><h2>Your review queue <span>{cases.length}</span></h2><p>Prioritized claims requiring coding or documentation review.</p></div><Badge tone="green"><ShieldCheck size={12} />Human approval required</Badge></div>
        <div className="home-queue-controls"><div className="queue-tabs" role="group" aria-label="Queue filter">{[['all', 'All claims', 4], ['new', 'New', newClaims], ['decision', 'Needs decision', decisions], ['query', 'Queries', queries], ['reviewed', 'Reviewed', reviewed]].map(([key, title, count]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(String(key))}>{title}<span>{count}</span></button>)}</div><label className="queue-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search home queue" placeholder="Find a patient or encounter" /></label></div>
        <div className="queue-column-head"><span>Patient & encounter</span><span>Review item</span><span>Potential impact</span><span>Action</span></div>
        <div className="queue-list">{visible.length ? visible.map(({ encounter: e, config }) => {
          const status = queueStatus(e);
          const impact = e.id === CHARGE_ID ? CHARGE_ASSUMPTIONS.missingMeshCharge : proposedDelta(e);
          const score = agentChecks(e).find(c => c.id === 'dura')?.confidence ?? agentChecks(e)[0].confidence;
          return <article className={`home-claim ${e.review.isNew ? 'new-claim' : ''}`} key={e.id}>
            <div className="home-claim-patient"><span className={`avatar avatar-${Number(e.id.slice(-1)) % 4}`}>{initials(e.census.patient_name)}</span><div><button onClick={() => onOpen(e.id)}>{e.census.patient_name}{e.review.isNew && <Badge tone="blue">New</Badge>}</button><span className="mono">{e.id}</span><small>{e.census.facility_name.replace('NYC H+H / ', '')}</small></div></div>
            <div className="home-claim-issue"><strong>{config.issue}</strong><div><Badge tone={status.tone} dot>{status.label}</Badge>{e.review.analysisReady && <span className="queue-confidence" title="Illustrative check confidence. Not proof of a correct diagnosis."><Sparkles size={11} />Check confidence {score}%</span>}</div><small>{config.detail}</small></div>
            <div className="home-claim-impact"><strong>{!e.review.analysisReady ? 'Pending' : `${impact > 0 ? '+' : ''}${money(impact)}`}</strong><span>{e.id === CHARGE_ID ? 'Gross charge only' : !e.review.analysisReady ? 'Analysis in progress' : impact ? 'Illustrative payment' : 'No payment increase'}</span></div>
            <Button className="review-queue-button" onClick={() => onOpen(e.id)}>{resolved(e) ? 'View claim' : 'Review'}<ArrowRight size={14} /></Button>
          </article>;
        }) : <EmptyState title={filter === 'reviewed' ? 'No completed reviews yet' : 'No claims match this view'} text="Choose another queue filter or review a claim to update its status." action={<Button onClick={() => { setFilter('all'); setSearch(''); }}>Show all claims</Button>} />}</div>
        <footer className="home-queue-footer"><span><Check size={13} />Original EHR records remain unchanged</span><button className="text-button" onClick={onWorklist}>View all {encounters.length} encounters<ArrowRight size={14} /></button></footer>
      </section>
      <div className="home-scope-note"><span><ShieldCheck size={16} /><strong>Demonstration workspace</strong></span><p>{DEEP_IDS.length} interactive review scenarios drawn from {SOURCE_TOTALS.encounters} synthetic encounters. The imported {money(SOURCE_TOTALS.exposure)} portfolio opportunity is unvalidated and separate from the scoped payment estimates above.</p></div>
    </div>
    <aside className="home-right"><NotificationFeed {...notificationProps} /><div className="home-review-guide"><Clock3 size={17} /><h3>Presentation sequence</h3><ol><li>Trigger a notification</li><li>Review the patient and supporting documents</li><li>Modify with a recorded decision</li><li>Compare, preview and submit</li></ol><span>Use Reset demo to replay all scenarios.</span></div></aside>
  </div>;
}
