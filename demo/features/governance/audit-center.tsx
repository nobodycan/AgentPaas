"use client";

import React, { useMemo, useState } from "react";

import {
  DataTable,
  Drawer,
  StatusBadge,
} from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import {
  filterApplicationLogs,
  filterAuditCenterEvents,
} from "../../lib/governance-view-models";
import type {
  ApplicationLogFilters,
  AuditCenterCategory,
  AuditCenterFilters,
  GovernanceTimeRange,
} from "../../lib/governance-view-models";
import { useDemo } from "../../lib/demo-store";
import {
  auditCorrelationNavigation,
  correlationFromSearch,
} from "../../lib/routes";
import { filterAuditEventsByCorrelation } from "../../lib/runtime-view-models";
import type { ApplicationLog, AuditEvent } from "../../lib/types";
import {
  formatGovernanceTime,
  GovernancePageHeader,
  governanceStatusTone,
} from "./governance-shared";

type AuditTab = AuditCenterCategory | "application";

const AUDIT_TABS: readonly { value: AuditTab; label: string }[] = [
  { value: "operations", label: "操作审计" },
  { value: "access", label: "访问审计" },
  { value: "security", label: "安全事件" },
  { value: "application", label: "应用运行日志" },
];

const DEFAULT_FILTERS: AuditCenterFilters = {
  category: "operations",
  timeRange: "7d",
  actor: "",
  environmentId: "",
  result: "",
  correlation: "",
};

function EventDetails({
  event,
}: {
  event: AuditEvent;
}): React.ReactElement {
  return (
    <div className="governance-drawer-stack">
      <div className="evidence-callout">
        <strong>采集边界</strong>
        <p>
          {event.kind === "ACCESS"
            ? "访问正文、模型响应、会话原值与思维链默认未采集；这里只展示路由与策略元数据。"
            : "仅记录外部可观察、业务或安全影响操作，不记录 Agent 思维链。"}
        </p>
      </div>
      <dl className="drawer-definition-list">
        <div>
          <dt>事件 ID</dt>
          <dd>{event.id}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{event.type}</dd>
        </div>
        <div>
          <dt>身份</dt>
          <dd>{event.actor}</dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>{event.targetId}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{formatGovernanceTime(event.occurredAt)}</dd>
        </div>
      </dl>
      <section>
        <h3>结构化证据</h3>
        <dl className="drawer-definition-list drawer-definition-list--compact">
          {Object.entries(event.details).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function ApplicationLogDetails({
  log,
}: {
  log: ApplicationLog;
}): React.ReactElement {
  return (
    <div className="governance-drawer-stack">
      <div className="evidence-callout">
        <strong>日志边界</strong>
        <p>
          演示日志只包含应用输出与 Trace 元数据；提示词、模型响应和思维链默认未采集。
        </p>
      </div>
      <dl className="drawer-definition-list">
        <div>
          <dt>级别</dt>
          <dd>{log.level}</dd>
        </div>
        <div>
          <dt>环境 / 实例</dt>
          <dd>
            {log.environmentId} / {log.instanceId}
          </dd>
        </div>
        <div>
          <dt>Trace ID</dt>
          <dd>{log.traceId}</dd>
        </div>
        <div>
          <dt>输出</dt>
          <dd>{log.message}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AuditCenterPage({
  search,
  onNavigate,
}: {
  search: string;
  onNavigate(destination: string): void;
}): React.ReactElement {
  const { applicationLogs, auditEvents, environments } = useDemo();
  const urlCorrelation = correlationFromSearch(search);
  const correlatedEvent = urlCorrelation
    ? filterAuditEventsByCorrelation(auditEvents, urlCorrelation)[0]
    : undefined;
  const initialTab: AuditTab =
    correlatedEvent?.kind === "ACCESS"
      ? "access"
      : correlatedEvent?.kind === "SECURITY"
        ? "security"
        : "operations";
  const [activeTab, setActiveTab] = useState<AuditTab>(
    initialTab,
  );
  const [filters, setFilters] = useState<AuditCenterFilters>({
    ...DEFAULT_FILTERS,
    correlation: urlCorrelation,
  });
  const [draftCorrelation, setDraftCorrelation] = useState(urlCorrelation);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent>();
  const [selectedLog, setSelectedLog] = useState<ApplicationLog>();
  const [logFilters, setLogFilters] = useState<ApplicationLogFilters>({
    timeRange: "7d",
    level: "",
    environmentId: "",
    instanceId: "",
    query: "",
  });

  const eventRows = useMemo(
    () =>
      activeTab === "application"
        ? []
        : filterAuditCenterEvents(auditEvents, {
            ...filters,
            category: activeTab,
            correlation: urlCorrelation || filters.correlation,
          }),
    [activeTab, auditEvents, filters, urlCorrelation],
  );
  const logRows = useMemo(
    () => filterApplicationLogs(applicationLogs, logFilters),
    [applicationLogs, logFilters],
  );
  const identities = useMemo(
    () => [...new Set(auditEvents.map((event) => event.actor))].sort(),
    [auditEvents],
  );

  const eventColumns: readonly DataTableColumn<AuditEvent>[] = [
    {
      id: "event",
      header: "事件",
      render: (event) => (
        <button
          type="button"
          className="table-link-button"
          onClick={() => setSelectedEvent(event)}
        >
          <strong>{event.summary}</strong>
          <small>{event.id}</small>
        </button>
      ),
    },
    {
      id: "identity",
      header: "身份",
      render: (event) => event.actor,
    },
    {
      id: "result",
      header: "结果",
      render: (event) => {
        const result =
          event.details.decision ??
          (event.type.includes("FAILED") ? "FAILED" : "SUCCESS");
        return (
          <StatusBadge tone={governanceStatusTone(result)}>
            {result}
          </StatusBadge>
        );
      },
    },
    {
      id: "correlation",
      header: "Request / Operation / Task",
      render: (event) => (
        <span className="correlation-stack">
          <code>{event.details.requestId ?? "—"}</code>
          <small>{event.details.operationId ?? "—"}</small>
          <small>{event.details.taskId ?? "—"}</small>
        </span>
      ),
    },
    {
      id: "time",
      header: "时间",
      align: "end",
      render: (event) => formatGovernanceTime(event.occurredAt),
    },
  ];
  const logColumns: readonly DataTableColumn<ApplicationLog>[] = [
    {
      id: "message",
      header: "应用输出",
      render: (log) => (
        <button
          type="button"
          className="table-link-button"
          onClick={() => setSelectedLog(log)}
        >
          <strong>{log.message}</strong>
          <small>{log.traceId}</small>
        </button>
      ),
    },
    {
      id: "level",
      header: "级别",
      render: (log) => (
        <StatusBadge tone={governanceStatusTone(log.level)}>
          {log.level}
        </StatusBadge>
      ),
    },
    {
      id: "target",
      header: "环境 / 实例",
      render: (log) => (
        <span className="correlation-stack">
          <span>{log.environmentId}</span>
          <small>{log.instanceId}</small>
        </span>
      ),
    },
    {
      id: "time",
      header: "时间",
      align: "end",
      render: (log) => formatGovernanceTime(log.occurredAt),
    },
  ];

  return (
    <section aria-labelledby="audit-center-title">
      <GovernancePageHeader
        eyebrow="治理证据"
        title="审计中心"
        description="四类证据各自保留语义边界，同时通过精确关联标识串联操作、访问与安全处置。"
      />
      <h2 id="audit-center-title" className="sr-only">
        审计中心
      </h2>

      <nav className="governance-tabs" aria-label="审计证据类型">
        {AUDIT_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={activeTab === tab.value ? "is-active" : ""}
            aria-pressed={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="content-card governance-filter-card">
        {activeTab === "application" ? (
          <div className="governance-filter-grid">
            <label className="form-field">
              <span>时间范围</span>
              <select
                value={logFilters.timeRange}
                onChange={(event) =>
                  setLogFilters((current) => ({
                    ...current,
                    timeRange: event.target.value as GovernanceTimeRange,
                  }))
                }
              >
                <option value="24h">最近 24 小时</option>
                <option value="7d">最近 7 天</option>
                <option value="all">全部</option>
              </select>
            </label>
            <label className="form-field">
              <span>级别</span>
              <select
                value={logFilters.level}
                onChange={(event) =>
                  setLogFilters((current) => ({
                    ...current,
                    level: event.target.value as ApplicationLogFilters["level"],
                  }))
                }
              >
                <option value="">全部</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
            </label>
            <label className="form-field">
              <span>环境</span>
              <select
                value={logFilters.environmentId}
                onChange={(event) =>
                  setLogFilters((current) => ({
                    ...current,
                    environmentId: event.target.value,
                  }))
                }
              >
                <option value="">全部</option>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field governance-filter-grid__wide">
              <span>实例 / Trace / 关键词</span>
              <input
                value={logFilters.query}
                placeholder="输入完整或部分关键词"
                onChange={(event) =>
                  setLogFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        ) : (
          <>
            <div className="governance-filter-grid">
              <label className="form-field">
                <span>时间范围</span>
                <select
                  value={filters.timeRange}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      timeRange: event.target.value as GovernanceTimeRange,
                    }))
                  }
                >
                  <option value="24h">最近 24 小时</option>
                  <option value="7d">最近 7 天</option>
                  <option value="all">全部</option>
                </select>
              </label>
              <label className="form-field">
                <span>身份</span>
                <select
                  value={filters.actor}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      actor: event.target.value,
                    }))
                  }
                >
                  <option value="">全部</option>
                  {identities.map((identity) => (
                    <option key={identity} value={identity}>
                      {identity}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>环境</span>
                <select
                  value={filters.environmentId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      environmentId: event.target.value,
                    }))
                  }
                >
                  <option value="">全部</option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>结果</span>
                <select
                  value={filters.result}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      result: event.target.value,
                    }))
                  }
                >
                  <option value="">全部</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </label>
            </div>
            <form
              className="audit-correlation-form"
              onSubmit={(event) => {
                event.preventDefault();
                const navigation =
                  auditCorrelationNavigation(draftCorrelation);
                const matched = filterAuditEventsByCorrelation(
                  auditEvents,
                  navigation.draftCorrelation,
                )[0];
                setActiveTab(
                  matched?.kind === "ACCESS"
                    ? "access"
                    : matched?.kind === "SECURITY"
                      ? "security"
                      : "operations",
                );
                setFilters((current) => ({
                  ...current,
                  correlation: navigation.draftCorrelation,
                }));
                onNavigate(navigation.destination);
              }}
            >
              <label className="form-field">
                <span>精确 Request / Operation / Task ID</span>
                <input
                  value={draftCorrelation}
                  onChange={(event) => setDraftCorrelation(event.target.value)}
                  placeholder="例如 req-20260729-004"
                />
              </label>
              <button type="submit" className="button button--primary">
                精确检索
              </button>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  setDraftCorrelation("");
                  setFilters((current) => ({
                    ...current,
                    correlation: "",
                  }));
                  onNavigate("/audit");
                }}
              >
                清除
              </button>
            </form>
          </>
        )}
        <p className="governance-privacy-note">
          正文默认未采集：不持久化原始 body、prompt、response、chain-of-thought 或
          sessionKey。
        </p>
      </section>

      <section className="content-card">
        <p className="filter-result-count" role="status" aria-live="polite">
          {activeTab === "application"
            ? `${logRows.length} 条应用运行日志`
            : `${eventRows.length} 条${AUDIT_TABS.find((tab) => tab.value === activeTab)?.label ?? "审计"}证据`}
        </p>
        {activeTab === "application" ? (
          <DataTable
            caption="应用运行日志"
            columns={logColumns}
            rows={logRows}
            getRowKey={(log) => log.id}
            emptyMessage="当前筛选条件下没有应用运行日志。"
          />
        ) : (
          <DataTable
            caption="审计事件"
            columns={eventColumns}
            rows={eventRows}
            getRowKey={(event) => event.id}
            emptyMessage="当前筛选条件下没有匹配证据。"
          />
        )}
      </section>

      <Drawer
        open={Boolean(selectedEvent)}
        title={selectedEvent?.summary ?? "审计详情"}
        onClose={() => setSelectedEvent(undefined)}
      >
        {selectedEvent ? <EventDetails event={selectedEvent} /> : null}
      </Drawer>
      <Drawer
        open={Boolean(selectedLog)}
        title="应用运行日志详情"
        onClose={() => setSelectedLog(undefined)}
      >
        {selectedLog ? <ApplicationLogDetails log={selectedLog} /> : null}
      </Drawer>
    </section>
  );
}
