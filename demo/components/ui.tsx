"use client";

import React, {
  useEffect,
  useId,
  useRef,
} from "react";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}): React.ReactElement {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {children}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}): React.ReactElement {
  return (
    <article className="metric-card">
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">{value}</p>
      {detail ? <p className="metric-card__detail">{detail}</p> : null}
    </article>
  );
}

export interface DataTableColumn<T> {
  id: string;
  header: string;
  render(row: T): React.ReactNode;
  align?: "start" | "center" | "end";
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyMessage = "暂无数据",
}: {
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey(row: T): React.Key;
  emptyMessage?: string;
}): React.ReactElement {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={`data-table__cell--${column.align ?? "start"}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    data-label={column.header}
                    className={`data-table__cell--${column.align ?? "start"}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  href: string;
}

export function Tabs<T extends string>({
  label,
  items,
  activeValue,
}: {
  label: string;
  items: readonly TabItem<T>[];
  activeValue: T;
}): React.ReactElement {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.value}
          href={item.href}
          className="tabs__link"
          aria-current={item.value === activeValue ? "page" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function useDismissibleLayer(
  open: boolean,
  onClose: () => void,
  layerRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const animationFrame = window.requestAnimationFrame(() => {
      layerRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [layerRef, onClose, open]);
}

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}): React.ReactElement | null {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  useDismissibleLayer(open, onClose, drawerRef);

  if (!open) {
    return null;
  }

  return (
    <div
      className="layer-backdrop layer-backdrop--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="layer-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">关闭</span>
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onClose: () => void;
}): React.ReactElement | null {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useDismissibleLayer(open, onClose, modalRef);

  if (!open) {
    return null;
  }

  return (
    <div
      className="layer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="confirm-modal__description">
          {description}
        </div>
        <div className="button-row">
          <button type="button" className="button button--quiet" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button button--${tone}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: StatusTone;
}

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastMessage[];
  onDismiss?: (id: string) => void;
}): React.ReactElement {
  return (
    <section
      className="toast-region"
      aria-label="通知"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`toast toast--${toast.tone ?? "neutral"}`}
        >
          <div>
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
          </div>
          {onDismiss ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => onDismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">关闭通知</span>
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  status: "complete" | "current" | "upcoming";
}

export function ProgressTimeline({
  items,
  label = "进度",
}: {
  items: readonly TimelineItem[];
  label?: string;
}): React.ReactElement {
  return (
    <ol className="progress-timeline" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.id}
          className={`progress-timeline__item progress-timeline__item--${item.status}`}
          aria-current={item.status === "current" ? "step" : undefined}
        >
          <span className="progress-timeline__marker" aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">
        ◇
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}

export function MockDataLabel(): React.ReactElement {
  return (
    <span className="mock-data-label">
      <span className="mock-data-label__dot" aria-hidden="true" />
      演示数据
    </span>
  );
}
