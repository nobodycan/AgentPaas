"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors preserve standard link behavior; the shell only intercepts eligible same-origin product routes. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CreateEnvironmentWizard,
  EnvironmentListPage,
} from "../features/environments";
import { EnvironmentDetailPanel } from "../features/environment-detail";
import { OverviewPage } from "../features/overview";
import { useDemo } from "../lib/demo-store";
import { filterAuditEventsByCorrelation } from "../lib/runtime-view-models";
import {
  correlationFromSearch,
  isProductPath,
  parseRoute,
} from "../lib/routes";
import type { AppRoute } from "../lib/routes";
import type {
  AuditEvent,
  Cluster,
  Profile,
  SecurityIncident,
} from "../lib/types";
import { AppShell } from "./app-shell";
import {
  DataTable,
  EmptyState,
  StatusBadge,
} from "./ui";
import type {
  DataTableColumn,
  StatusTone,
} from "./ui";

function statusTone(status: string): StatusTone {
  if (
    status === "Running" ||
    status === "Ready" ||
    status === "Healthy" ||
    status === "Stable" ||
    status === "Resolved" ||
    status === "Contained"
  ) {
    return "success";
  }
  if (
    status === "Deploying" ||
    status === "Starting" ||
    status === "Containing"
  ) {
    return "info";
  }
  if (
    status === "Degraded" ||
    status === "Open" ||
    status === "Pending"
  ) {
    return "warning";
  }
  if (
    status === "Failed" ||
    status === "Isolated" ||
    status === "Unavailable"
  ) {
    return "danger";
  }
  return "neutral";
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

const AUDIT_COLUMNS: readonly DataTableColumn<AuditEvent>[] = [
  {
    id: "event",
    header: "事件",
    render: (event) => (
      <div className="table-primary">
        <strong>{event.summary}</strong>
        <small>{event.id}</small>
      </div>
    ),
  },
  {
    id: "kind",
    header: "类型",
    render: (event) => <StatusBadge tone="info">{event.kind}</StatusBadge>,
  },
  {
    id: "actor",
    header: "操作者",
    render: (event) => event.actor,
  },
  {
    id: "correlation",
    header: "关联标识",
    render: (event) => (
      <div className="table-primary">
        <strong>{event.details.requestId ?? "—"}</strong>
        <small>
          Operation: {event.details.operationId ?? "—"}
          <br />
          Task: {event.details.taskId ?? "—"}
        </small>
      </div>
    ),
  },
  {
    id: "time",
    header: "发生时间",
    render: (event) => event.occurredAt.replace("T", " ").slice(0, 19),
  },
];

function AuditPanel({
  search,
  onNavigate,
}: {
  search: string;
  onNavigate(destination: string): void;
}): React.ReactElement {
  const { auditEvents } = useDemo();
  const correlation = correlationFromSearch(search);
  const [draftCorrelation, setDraftCorrelation] = useState(correlation);
  const rows = (
    correlation
      ? filterAuditEventsByCorrelation(auditEvents, correlation)
      : auditEvents.slice(-8)
  )
    .slice()
    .reverse();

  return (
    <section aria-labelledby="audit-title">
      <PageHeader
        eyebrow="治理与证据"
        title="审计中心"
        description="检索控制面、访问、安全与运行时事件的统一证据链。"
      />
      <span id="audit-title" className="sr-only">
        审计中心
      </span>
      <section className="content-card">
        <form
          className="audit-correlation-form"
          onSubmit={(event) => {
            event.preventDefault();
            const nextCorrelation = draftCorrelation.trim();
            onNavigate(
              nextCorrelation
                ? `/audit?correlation=${encodeURIComponent(nextCorrelation)}`
                : "/audit",
            );
          }}
        >
          <label className="form-field">
            <span>Request / Operation / Task ID</span>
            <input
              value={draftCorrelation}
              onChange={(event) =>
                setDraftCorrelation(event.target.value)
              }
              placeholder="输入完整关联标识"
            />
          </label>
          <button type="submit" className="button button--primary">
            精确检索
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={!correlation && !draftCorrelation}
            onClick={() => onNavigate("/audit")}
          >
            清除
          </button>
        </form>
        <p className="filter-result-count" role="status" aria-live="polite">
          {correlation
            ? `关联标识 ${correlation}：${rows.length} 条精确匹配`
            : "显示最近 8 条审计事件"}
        </p>
        <DataTable
          caption={correlation ? "关联审计事件" : "最近审计事件"}
          columns={AUDIT_COLUMNS}
          rows={rows}
          getRowKey={(event) => event.id}
          emptyMessage="没有与该 Request、Operation 或 Task ID 精确匹配的审计事件。"
        />
      </section>
    </section>
  );
}

const SECURITY_COLUMNS: readonly DataTableColumn<SecurityIncident>[] = [
  {
    id: "incident",
    header: "事件",
    render: (incident) => (
      <div className="table-primary">
        <strong>{incident.title}</strong>
        <small>{incident.id}</small>
      </div>
    ),
  },
  {
    id: "severity",
    header: "级别",
    render: (incident) => (
      <StatusBadge
        tone={
          incident.severity === "Critical" ||
          incident.severity === "High"
            ? "danger"
            : "warning"
        }
      >
        {incident.severity}
      </StatusBadge>
    ),
  },
  {
    id: "status",
    header: "状态",
    render: (incident) => (
      <StatusBadge tone={statusTone(incident.status)}>
        {incident.status}
      </StatusBadge>
    ),
  },
  {
    id: "environment",
    header: "运行环境",
    render: (incident) => (
      <a href={`/environments/${incident.environmentId}/security`}>
        {incident.environmentId}
      </a>
    ),
  },
];

function SecurityEventsPanel(): React.ReactElement {
  const { securityIncidents } = useDemo();

  return (
    <section aria-labelledby="security-events-title">
      <PageHeader
        eyebrow="安全运营"
        title="安全事件"
        description="跟踪异常检测、端点隔离、网络阻断与身份撤销。"
      />
      <span id="security-events-title" className="sr-only">
        安全事件
      </span>
      <section className="content-card">
        <DataTable
          caption="安全事件列表"
          columns={SECURITY_COLUMNS}
          rows={securityIncidents}
          getRowKey={(incident) => incident.id}
        />
      </section>
    </section>
  );
}

const CLUSTER_COLUMNS: readonly DataTableColumn<Cluster>[] = [
  {
    id: "name",
    header: "资源池",
    render: (cluster) => (
      <div className="table-primary">
        <strong>{cluster.name}</strong>
        <small>{cluster.region}</small>
      </div>
    ),
  },
  {
    id: "status",
    header: "状态",
    render: (cluster) => (
      <StatusBadge tone={statusTone(cluster.status)}>
        {cluster.status}
      </StatusBadge>
    ),
  },
  {
    id: "capacity",
    header: "可用容量",
    render: (cluster) =>
      `${cluster.readyCapacity}/${cluster.totalCapacity}`,
    align: "end",
  },
  {
    id: "tenant",
    header: "租户",
    render: (cluster) => cluster.tenantId,
  },
];

function ResourcePoolsPanel(): React.ReactElement {
  const { clusters } = useDemo();

  return (
    <section aria-labelledby="resource-pools-title">
      <PageHeader
        eyebrow="基础设施"
        title="资源池"
        description="查看专属集群的健康状态、区域分布与可调度容量。"
      />
      <span id="resource-pools-title" className="sr-only">
        资源池
      </span>
      <section className="content-card">
        <DataTable
          caption="资源池列表"
          columns={CLUSTER_COLUMNS}
          rows={clusters}
          getRowKey={(cluster) => cluster.id}
        />
      </section>
    </section>
  );
}

const PROFILE_COLUMNS: readonly DataTableColumn<Profile>[] = [
  {
    id: "name",
    header: "Profile",
    render: (profile) => (
      <div className="table-primary">
        <strong>{profile.name}</strong>
        <small>{profile.id}</small>
      </div>
    ),
  },
  {
    id: "kind",
    header: "类型",
    render: (profile) => <StatusBadge>{profile.kind}</StatusBadge>,
  },
  {
    id: "version",
    header: "版本",
    render: (profile) => profile.version,
  },
  {
    id: "controls",
    header: "控制项",
    render: (profile) => profile.controls.length,
    align: "end",
  },
];

function ProfilesPanel(): React.ReactElement {
  const { profiles } = useDemo();

  return (
    <section aria-labelledby="profiles-title">
      <PageHeader
        eyebrow="策略即配置"
        title="Profile 管理"
        description="集中管理运行时、网络、身份、日志与领域治理配置。"
      />
      <span id="profiles-title" className="sr-only">
        Profile 管理
      </span>
      <section className="content-card">
        <DataTable
          caption="Profile 列表"
          columns={PROFILE_COLUMNS}
          rows={profiles}
          getRowKey={(profile) => profile.id}
        />
      </section>
    </section>
  );
}

function NotFoundPanel(): React.ReactElement {
  return (
    <EmptyState
      title="页面不存在"
      description="当前地址不属于 Agent PaaS 演示产品路由。"
      action={
        <a href="/overview" className="button button--primary">
          返回概览
        </a>
      }
    />
  );
}

function RoutePanel({
  route,
  search,
  onNavigate,
}: {
  route: AppRoute;
  search: string;
  onNavigate(destination: string): void;
}): React.ReactElement {
  switch (route.view) {
    case "overview":
      return <OverviewPage onNavigate={onNavigate} />;
    case "environment-list":
      return <EnvironmentListPage onNavigate={onNavigate} />;
    case "environment-create":
      return <CreateEnvironmentWizard onNavigate={onNavigate} />;
    case "environment-detail":
      return (
        <EnvironmentDetailPanel
          environmentId={route.environmentId}
          tab={route.tab}
          onNavigate={onNavigate}
        />
      );
    case "audit":
      return (
        <AuditPanel
          key={search}
          search={search}
          onNavigate={onNavigate}
        />
      );
    case "security-events":
      return <SecurityEventsPanel />;
    case "resource-pools":
      return <ResourcePoolsPanel />;
    case "profiles":
      return <ProfilesPanel />;
    case "not-found":
      return <NotFoundPanel />;
  }
}

export function AgentPaaSDemo({
  initialPath,
}: {
  initialPath: string;
}): React.ReactElement {
  const [clientLocation, setClientLocation] = useState(initialPath);
  const parsedLocation = useMemo(
    () => new URL(clientLocation, "https://demo.agentpaas.local"),
    [clientLocation],
  );
  const canonicalPathname =
    parsedLocation.pathname === "/"
      ? "/overview"
      : parsedLocation.pathname;
  const route = useMemo(
    () => parseRoute(canonicalPathname),
    [canonicalPathname],
  );

  useEffect(() => {
    const syncClientLocation = () => {
      setClientLocation(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    };
    syncClientLocation();
    window.addEventListener("popstate", syncClientLocation);
    return () =>
      window.removeEventListener("popstate", syncClientLocation);
  }, []);

  const navigate = useCallback((destination: string) => {
    const url = new URL(destination, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !isProductPath(url.pathname)
    ) {
      return;
    }

    const nextLocation = `${url.pathname}${url.search}${url.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextLocation !== currentLocation) {
      window.history.pushState({}, "", nextLocation);
    }
    setClientLocation(nextLocation);
  }, []);

  const handleLinkClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest("a")
          : null;
      if (
        !target ||
        target.hasAttribute("download") ||
        (target.target && target.target !== "_self")
      ) {
        return;
      }

      const href = target.getAttribute("href");
      if (!href) {
        return;
      }

      const url = new URL(href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        !isProductPath(url.pathname)
      ) {
        return;
      }
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }

      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    },
    [navigate],
  );

  return (
    <div onClick={handleLinkClick}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <AppShell pathname={canonicalPathname} onNavigate={navigate}>
        <RoutePanel
          route={route}
          search={parsedLocation.search}
          onNavigate={navigate}
        />
      </AppShell>
    </div>
  );
}
