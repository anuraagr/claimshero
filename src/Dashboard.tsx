import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowRight, ArrowUpRight, BadgeDollarSign, Brain, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, Clock3, FileCheck2, Filter, Layers3, MessageSquareText, ScanBarcode, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Badge, Button, Confidence, DownloadButton, EmptyState, SectionHeading, StatusBadge } from './components';
import { caseKind, CHARGE_ID, DEEP_IDS, deviceItems, DIABETES_ID, HERO_ID, shortArchetype, SOURCE_TOTALS, titleFor, WALKTHROUGHS, type Encounter } from './portfolio';
import { compactMoney, dueHours, exportCsv, initials, metrics, money, proposedDelta, ready, resolved } from './workflow';
import type { Page } from './model';

export interface WorklistFilter { kind: string; status: string }
export const DEFAULT_FILTER: WorklistFilter = { kind: 'all', status: 'all' };

export function Worklist({ encounters, onOpen, compact = false, filter = DEFAULT_FILTER, onViewAll, title = 'Prioritized worklist' }: {
  encounters: Encounter[]; onOpen: (id: string) => void; compact?: boolean; filter?: WorklistFilter;
  onViewAll?: () => void; title?: string;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(filter.kind);
  const [status, setStatus] = useState(filter.status);
  const [facility, setFacility] = useState('all');
  const [sort, setSort] = useState('priority');
  const [page, setPage] = useState(0);
  const pageSize = compact ? 5 : 10;
  const filtered = useMemo(() => encounters.filter(e => {
    const text = `${e.census.patient_name} ${e.id} ${e.census.patient_id} ${e.census.facility_name} ${e.census.payer_name} ${titleFor(e)} ${e.review.owner}`.toLowerCase();
    const matchKind = kind === 'all' || (kind === 'walkthroughs' ? DEEP_IDS.includes(e.id) : kind === 'coding' ? e.claim.revenue_leakage_occurred === 1 : kind === 'query' ? [HERO_ID, DIABETES_ID].includes(e.id) || e.review.query?.status === 'open' : kind === 'charge' ? e.id === CHARGE_ID : caseKind(e.id) === kind);
    const matchStatus = status === 'all' || (status === 'open' ? !resolved(e) : status === 'ready' ? ready(e) : e.review.status === status);
    return text.includes(search.toLowerCase()) && matchKind && matchStatus && (facility === 'all' || e.census.facility_name === facility);
  }).sort((a, b) => {
    if (sort === 'name') return a.census.patient_name.localeCompare(b.census.patient_name);
    if (sort === 'impact') return b.claim.revenue_left_on_table_usd - a.claim.revenue_left_on_table_usd || dueHours(a) - dueHours(b);
    return Number(resolved(a)) - Number(resolved(b)) || Number(!DEEP_IDS.includes(a.id)) - Number(!DEEP_IDS.includes(b.id)) || dueHours(a) - dueHours(b);
  }), [encounters, search, kind, status, facility, sort]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const facilities = [...new Set(encounters.map(e => e.census.facility_name))].sort();
  const clear = () => { setSearch(''); setKind('all'); setStatus('all'); setFacility('all'); setPage(0); };
  return <section className="panel worklist-panel">
    <SectionHeading title={title} subtitle={compact ? 'Prioritized by review urgency and estimated impact.' : 'Review linked documentation and resolve outstanding coding items.'}
      action={compact ? <button className="text-button" onClick={onViewAll}>View all {encounters.length}<ArrowRight size={15} /></button> : <DownloadButton filename="claimshero-worklist.csv" text={exportCsv(filtered)} label="Export worklist" mime="text/csv" />} />
    <div className="worklist-toolbar">
      <label className="search-field"><Search size={16} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search patients, encounters, or payers..." aria-label="Search encounters" />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
      <div className="filter-field"><Filter size={14} /><select aria-label="Opportunity filter" value={kind} onChange={e => { setKind(e.target.value); setPage(0); }}>
        <option value="all">All opportunities</option><option value="walkthroughs">4 walkthrough cases</option><option value="coding">Coding opportunities</option><option value="query">Documentation queries</option><option value="charge">Missing charges</option><option value="false-positive">False positives</option>
      </select></div>
      {!compact && <select className="standalone-select" aria-label="Status filter" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option><option value="open">Open reviews</option><option value="query-open">Query open</option><option value="routed">With coder</option><option value="escalated">Escalated</option><option value="ready">Ready to submit</option><option value="submitted">Submitted</option></select>}
      {!compact && <select className="standalone-select facility-select" aria-label="Facility filter" value={facility} onChange={e => { setFacility(e.target.value); setPage(0); }}><option value="all">All facilities</option>{facilities.map(f => <option key={f}>{f}</option>)}</select>}
      <div className="filter-field sort-field"><ArrowDownWideNarrow size={15} /><select aria-label="Sort encounters" value={sort} onChange={e => setSort(e.target.value)}><option value="priority">Priority first</option><option value="impact">Imported impact</option><option value="name">Patient A–Z</option></select></div>
    </div>
    {filtered.length ? <div className="table-scroll"><table className="worklist-table">
      <thead><tr><th>Patient / encounter</th><th>Opportunity</th><th>Priority</th><th>Illustrative impact</th><th>Review status</th><th><span className="sr-only">Open encounter</span></th></tr></thead>
      <tbody>{visible.map(e => {
        const deep = DEEP_IDS.includes(e.id);
        const kind = caseKind(e.id);
        const amount = deep ? kind === 'charge' ? 3900 : proposedDelta(e) : e.claim.revenue_left_on_table_usd;
        return <tr key={e.id} onClick={() => onOpen(e.id)} className={e.id === HERO_ID ? 'featured-row' : ''}>
          <td><div className="patient-cell"><span className={`avatar avatar-${Number(e.id.slice(-1)) % 4}`}>{initials(e.census.patient_name)}</span><div><button className="patient-name" onClick={event => { event.stopPropagation(); onOpen(e.id); }}>{e.census.patient_name}{e.id === HERO_ID && <Sparkles size={12} />}</button><span className="table-secondary mono">{e.id}</span></div></div></td>
          <td><strong className="table-title">{titleFor(e)}</strong><span className="table-secondary">{deep ? kind === 'fusion' ? 'Procedure mismatch + clinical query' : kind === 'diabetes' ? 'Clarify before selecting a code' : kind === 'charge' ? 'Charge capture / no DRG uplift' : 'Do not code unsupported acuity' : e.census.facility_name.replace('NYC H+H / ', '')}</span></td>
          <td><Badge tone={dueHours(e) < 12 ? 'red' : dueHours(e) < 36 ? 'amber' : 'neutral'} dot>{dueHours(e) < 12 ? 'High' : dueHours(e) < 36 ? 'Medium' : 'Routine'}</Badge><span className="table-secondary due-label"><Clock3 size={11} />{dueHours(e)}h review SLA</span></td>
          <td><strong className={`amount ${amount > 0 ? 'positive' : ''}`}>{amount > 0 ? '+' : ''}{money(amount)}</strong><span className="table-secondary">{kind === 'charge' ? 'Gross charge only' : deep ? 'Scoped payment scenario' : 'Imported / unvalidated'}</span></td>
          <td><StatusBadge status={e.review.status} /></td>
          <td><ChevronRight size={17} className="row-chevron" /></td>
        </tr>;
      })}</tbody>
    </table></div> : <EmptyState title="No encounters match" text="Try a different patient, facility, opportunity, or status." action={<Button onClick={clear}>Clear filters</Button>} />}
    <div className="table-footer"><span>{filtered.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)} of ${filtered.length} encounters` : '0 encounters'}<span className="subtle"> · Synthetic data</span></span><div className="pagination"><button aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={15} /></button><span>{safePage + 1}</span><button aria-label="Next page" disabled={(safePage + 1) * pageSize >= filtered.length} onClick={() => setPage(safePage + 1)}><ChevronRight size={15} /></button></div></div>
  </section>;
}

export function Dashboard({ encounters, onOpen, onNavigate, onFilter, onGuide }: {
  encounters: Encounter[]; onOpen: (id: string) => void; onNavigate: (page: Page) => void;
  onFilter: (filter: WorklistFilter) => void; onGuide: () => void;
}) {
  const stats = metrics(encounters);
  const hero = encounters.find(e => e.id === HERO_ID);
  const [chartMode, setChartMode] = useState<'exposure' | 'cases' | 'cost'>('exposure');
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; exposure: number; cost: number }>();
    for (const e of encounters) {
      const key = shortArchetype(e), prev = map.get(key) ?? { count: 0, exposure: 0, cost: 0 };
      map.set(key, { count: prev.count + 1, exposure: prev.exposure + e.claim.revenue_left_on_table_usd, cost: prev.cost + deviceItems(e).reduce((sum, d) => sum + d.cost_usd, 0) });
    }
    return [...map.entries()].sort((a, b) => b[1].exposure - a[1].exposure);
  }, [encounters]);
  const maximum = Math.max(...groups.map(([, g]) => chartMode === 'exposure' ? g.exposure : chartMode === 'cost' ? g.cost : g.count), 1);
  return <>
    <div className="metrics-grid">
      <button className="metric-card featured-metric" onClick={() => onFilter({ kind: 'coding', status: 'open' })} data-guide="exposure">
        <div className="metric-label"><span>Potential revenue leakage</span><ArrowUpRight size={18} /></div>
        <div className="metric-value">{compactMoney(stats.exposure)}<span className="metric-pill">Illustrative</span></div>
        <div className="metric-caption"><span className="tiny-square" />Imported exposure · not validated</div>
        <svg className="metric-spark" viewBox="0 0 160 45" aria-hidden="true"><path d="M1 43 L1 35 22 30 39 34 56 24 72 27 89 14 107 19 124 8 143 12 159 3 L159 43Z" fill="#e1ebe4" /><path d="M1 35 22 30 39 34 56 24 72 27 89 14 107 19 124 8 143 12 159 3" fill="none" stroke="#438168" strokeWidth="2" /></svg>
      </button>
      <button className="metric-card" onClick={() => onFilter({ kind: 'all', status: 'open' })}><div className="metric-label"><span>Encounters under review</span><ClipboardList size={17} /></div><div className="metric-value">{stats.open}<span className="metric-context">of {encounters.length}</span></div><div className="metric-caption"><span className="dot blue" />{stats.coding} imported coding opportunities</div></button>
      <button className="metric-card" onClick={() => onNavigate('audit')}><div className="metric-label"><span>Validated recovery</span><BadgeDollarSign size={17} /></div><div className="metric-value">{money(stats.validated)}</div><div className="metric-caption"><ShieldCheck size={13} />Human-approved · illustrative</div></button>
      <button className="metric-card" onClick={() => onNavigate('claims')}><div className="metric-label"><span>Ready for submission</span><FileCheck2 size={17} /></div><div className="metric-value">{stats.ready}<span className="metric-context">claims</span></div><div className="metric-caption"><CheckCheck size={14} />{stats.submitted} submitted to simulator</div></button>
    </div>
    <div className="quick-stats">
      <button onClick={() => onFilter({ kind: 'coding', status: 'open' })}><span className="quick-icon purple"><Sparkles size={14} /></span><b>{stats.coding}</b> coding opportunities<ChevronRight size={14} /></button>
      <span className="quick-divider" />
      <button onClick={() => onFilter({ kind: 'charge', status: 'open' })}><span className="quick-icon blue"><ScanBarcode size={14} /></span><b>{stats.charges}</b> missing charge<span className="subtle">{money(stats.chargeAmount)} gross, not payment</span><ChevronRight size={14} /></button>
      <span className="quick-divider" />
      <button onClick={() => onNavigate('queries')}><span className="quick-icon amber"><MessageSquareText size={14} /></span><b>{stats.queries}</b> documentation queries<ChevronRight size={14} /></button>
      <span className="read-only-label"><ShieldCheck size={13} />3 source silos · untouched</span>
    </div>
    <div className="dashboard-middle">
      <section className="panel exposure-panel">
        <SectionHeading title="Opportunity by procedure" subtitle="Imported estimates and device acquisition costs"
          action={<div className="segmented"><button className={chartMode === 'exposure' ? 'active' : ''} onClick={() => setChartMode('exposure')}>Exposure</button><button className={chartMode === 'cost' ? 'active' : ''} onClick={() => setChartMode('cost')}>Device costs</button><button className={chartMode === 'cases' ? 'active' : ''} onClick={() => setChartMode('cases')}>Cases</button></div>} />
        <div className="bar-chart" aria-label="Portfolio signals by neurosurgical procedure">{groups.map(([name, g], i) => <div className="bar-row" key={name}><span className="bar-label">{name}</span><div className="bar-track"><span style={{ transform: `scaleX(${(chartMode === 'exposure' ? g.exposure : chartMode === 'cost' ? g.cost : g.count) / maximum})` }} className={`bar-fill bar-${i}`} /></div><strong>{chartMode === 'exposure' ? money(g.exposure) : chartMode === 'cost' ? money(g.cost) : g.count}</strong></div>)}</div>
        <div className="chart-caption"><span><span className="dot green" />{chartMode === 'cost' ? 'Illustrative acquisition costs' : chartMode === 'cases' ? 'Imported encounter counts' : 'Imported illustrative exposure'}</span><span>{chartMode === 'cost' ? 'Cost visibility, not claimed savings' : 'Not yet clinically or payer validated'}</span></div>
      </section>
      <section className="spotlight">
        <div className="spotlight-top"><Badge tone="white"><Sparkles size={12} />Featured review</Badge><span className="spotlight-number">01 / 04</span></div>
        <h2>Lumbar fusion<br />coding review</h2>
        <p>L4-L5 and L5-S1 fusion, documented dural repair and postoperative anemia clarification.</p>
        <div className="spotlight-patient"><span className="avatar">DO</span><div><strong>David Okafor</strong><span>Jacobi · Lumbar fusion · FY2026</span></div><div className="spotlight-value">+{money(8000)}<small>Illustrative scenario</small></div></div>
        <div className="spotlight-footer"><span>FY2026 comparison: MS-DRG 451 → 448</span><Button variant="primary" onClick={() => onOpen(hero?.id ?? HERO_ID)}>Review encounter<ArrowRight size={16} /></Button></div>
      </section>
    </div>
    <Worklist encounters={encounters} onOpen={onOpen} compact onViewAll={() => onNavigate('worklist')} />
    <section className="walkthrough-strip" aria-label="Four deep walkthrough cases"><div className="walkthrough-intro"><span className="eyebrow">GUIDED DEMONSTRATION</span><h3>Review scenarios</h3><button className="text-button" onClick={onGuide}>Start guided demo<ArrowRight size={13} /></button></div>{WALKTHROUGHS.map(w => <button className={`walkthrough-card walkthrough-${w.kind}`} key={w.id} onClick={() => onOpen(w.id)}><div className="walkthrough-top"><span className="walkthrough-icon">{w.icon === 'brain' ? <Brain size={18} /> : w.icon === 'message' ? <MessageSquareText size={18} /> : w.icon === 'scan' ? <ScanBarcode size={18} /> : <ShieldCheck size={18} />}</span><span className="mono">{w.number}</span></div><strong>{w.title}</strong><span>{w.subtitle}</span><div className="walkthrough-bottom">{w.tag}<ArrowUpRight size={14} /></div></button>)}</section>
    <div className="portfolio-note"><Layers3 size={13} /><span>Original portfolio: {SOURCE_TOTALS.encounters} synthetic encounters · {money(SOURCE_TOTALS.baseline)} baseline · {money(SOURCE_TOTALS.exposure)} imported exposure. No institutional affiliation or production connection.</span></div>
  </>;
}

export function MiniCheck({ title, score }: { title: string; score: number }) {
  return <div className="mini-check"><CheckCheck size={14} /><span>{title}</span><Confidence score={score} compact /></div>;
}
