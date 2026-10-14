import type { ReactNode } from 'react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="feedback" role="status"><span className="spinner" aria-hidden="true" />{label}</p>;
}

export function ErrorNotice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <div className="notice notice-error" role="alert"><span>{children}</span>{onRetry && <button className="button button-quiet button-small" onClick={onRetry}>Try again</button>}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">↗</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  return children ? <span className="field-error" id={id} role="alert">{children}</span> : null;
}
