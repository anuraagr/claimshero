import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, Check, ChevronRight, CircleAlert, Clock3, FileText, LockKeyhole, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { ReviewStatus } from './model';

export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return <span className={`badge ${tone}`}>{dot && <i />}{children}</span>;
}
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const labels = {
    review: 'Needs review', 'query-open': 'Query open', escalated: 'Escalated',
    routed: 'With coder', approved: 'Approved', rejected: 'Alert rejected', submitted: 'Submitted',
  };
  const tone = status === 'approved' || status === 'submitted' ? 'green' : status === 'rejected' ? 'neutral' : status === 'query-open' || status === 'escalated' ? 'amber' : status === 'routed' ? 'purple' : 'blue';
  return <Badge tone={tone} dot>{labels[status]}</Badge>;
}
export function Button({ children, onClick, variant = 'secondary', className = '', disabled, type = 'button', title }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  return <button type={type} className={`button ${variant} ${className}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}
export function IconButton({ label, onClick, children, className = '' }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}
export function SectionHeading({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="section-heading"><div><h2>{icon}{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={25} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function Notice({ children, tone = 'info', title }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' | 'error'; title?: string }) {
  return <div className={`notice ${tone}`}>{tone === 'success' ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}<div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}
export function Confidence({ score, compact = false }: { score: number; compact?: boolean }) {
  return <div className={`confidence ${compact ? 'compact' : ''}`} title="Illustrative check confidence, not a calibrated clinical probability"><span>{score}%</span><div className="confidence-track"><i style={{ width: `${score}%` }} /></div>{!compact && <small>check confidence</small>}</div>;
}
export function EvidenceButton({ onClick, children = 'Supporting document' }: { onClick: () => void; children?: ReactNode }) {
  return <button className="text-button evidence-button" onClick={onClick}><FileText size={14} />{children}<ChevronRight size={14} /></button>;
}
export function FlowLine({ approved = false, submitted = false }: { approved?: boolean; submitted?: boolean }) {
  const nodes = [
    { title: 'Source evidence', icon: <FileText size={15} />, done: true },
    { title: 'Agent checks', icon: <Sparkles size={15} />, done: true },
    { title: 'Human approval', icon: approved ? <Check size={15} /> : <LockKeyhole size={15} />, done: approved },
    { title: 'Corrected claim', icon: submitted ? <Check size={15} /> : <ArrowDownLeft size={15} />, done: submitted },
  ];
  return <div className="flow-line">{nodes.map((node, i) => <div className={`flow-step ${node.done ? 'done' : ''}`} key={node.title}><span>{node.icon}</span><b>{node.title}</b>{i < nodes.length - 1 && <ArrowRight className="flow-arrow" size={16} />}</div>)}</div>;
}
export function Modal({ title, children, onClose, wide = false, drawer = false, subtitle }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean; drawer?: boolean; subtitle?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]');
      target?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []);
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
  return <div className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={20} /></IconButton></header>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}
export function DataFootnote() {
  return <div className="data-footnote"><ShieldCheck size={14} /><span>Synthetic patients. Illustrative amounts. Human-reviewed changes only.</span><span className="footnote-end"><Clock3 size={13} />Local demonstration · no Epic writeback</span></div>;
}
export function DownloadButton({ filename, text, label, mime = 'text/plain' }: { filename: string; text: string; label: string; mime?: string }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Button onClick={download}><ArrowDownLeft size={16} />{label}</Button>;
}
