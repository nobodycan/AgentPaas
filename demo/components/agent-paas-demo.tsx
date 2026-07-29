"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors preserve standard link behavior; the shell only intercepts eligible same-origin product routes. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useDemo } from "../lib/demo-store";
import {
  ENVIRONMENT_TABS,
  isProductPath,
  parseRoute,
} from "../lib/routes";
import type {
  AppRoute,
  EnvironmentTab,
} from "../lib/routes";
import type {
  AuditEvent,
  Cluster,
  Environment,
  Profile,
  SecurityIncident,
} from "../lib/types";
import { AppShell } from "./app-shell";
import {
  DataTable,
  EmptyState,
  MetricCard,
  StatusBadge,
  Tabs,
} from "./ui";
import type {
  DataTableColumn,
  StatusTone,
} from "./ui";

const DETAIL_TAB_LABELS: Record<EnvironmentTab, string> = {
  overview: "概览",
  access: "访问测试",
  config: "配置",
  instances: "实例",
  revisions: "版本",
  observability: "可观测性",
  security: "安全",
  operations: "操作",
};

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

function OverviewPanel(): React.ReactElement {
  const {
    environments,
    instances,
    auditEvents,
    securityIncidents,
  } = useDemo();
  const runningEnvironments = environments.filter(
    (environment) => environment.status === "Running",
  ).length;
  const readyInstances = instances.filter(
    (instance) => instance.status === "Ready",
  ).length;
  const openIncidents = securityIncidents.filter(
    (incident) =>
      incident.status === "Open" || incident.status === "Containing",
  ).length;

  return (
    <section aria-labelledby="overview-title">
      <PageHeader
        eyebrow="平台概览"
        title="把 Agent 镜像变成受控的生产服务"
        description="统一查看 Agent 运行环境、策略边界、安全事件与审计证据。"
        action={
          <a href="/environments/new" className="button button--primary">
            创建运行环境
          </a>
        }
      />
      <span id="overview-title" className="sr-only">
        平台概览
      </span>
      <div className="metric-grid">
        <MetricCard
          label="运行中环境"
          value={runningEnvironments}
          detail={`共 ${environments.length} 个运行环境`}
        />
        <MetricCard
          label="就绪实例"
          value={readyInstances}
          detail={`共 ${instances.length} 个实例`}
        />
        <MetricCard
          label="待处置事件"
          value={openIncidents}
          detail="覆盖隔离与身份撤销"
        />
        <MetricCard
          label="审计事件"
          value={auditEvents.length}
          detail="控制面与数据面统一留痕"
        />
      </div>
      <section className="content-card" aria-labelledby="overview-focus-title">
        <div className="content-card__header">
          <div>
            <p className="eyebrow">今日关注</p>
            <h2 id="overview-focus-title">控制面状态摘要</h2>
          </div>
          <StatusBadge tone={openIncidents > 0 ? "warning" : "success"}>
            {openIncidents > 0 ? `${openIncidents} 项待处理` : "运行正常"}
          </StatusBadge>
        </div>
        <p className="placeholder-copy">
          此处将汇总容量变化、失败版本、安全告警与需要操作员确认的任务。
          当前壳层先提供稳定导航，后续功能页面会逐步替换摘要内容。
        </p>
      </section>
    </section>
  );
}

const ENVIRONMENT_COLUMNS: readonly DataTableColumn<Environment>[] = [
  {
    id: "name",
    header: "运行环境",
    render: (environment) => (
      <div className="table-primary">
        <a href={`/environments/${encodeURIComponent(environment.id)}/overview`}>
          {environment.name}
        </a>
        <small>{environment.id}</small>
      </div>
    ),
  },
  {
    id: "project",
    header: "项目",
    render: (environment) => environment.project,
  },
  {
    id: "status",
    header: "状态",
    render: (environment) => (
      <StatusBadge tone={statusTone(environment.status)}>
        {environment.status}
      </StatusBadge>
    ),
  },
  {
    id: "capacity",
    header: "实例",
    render: (environment) =>
      `${environment.readyInstances}/${environment.desiredInstances}`,
    align: "end",
  },
  {
    id: "owner",
    header: "负责人",
    render: (environment) => environment.owner,
  },
];

function EnvironmentListPanel(): React.ReactElement {
  const { environments } = useDemo();

  return (
    <section aria-labelledby="environment-list-title">
      <PageHeader
        eyebrow="交付与运行"
        title="运行环境"
        description="管理 Agent 服务从草稿、部署到稳定运行的完整生命周期。"
        action={
          <a href="/environments/new" className="button button--primary">
            创建运行环境
          </a>
        }
      />
      <span id="environment-list-title" className="sr-only">
        运行环境列表
      </span>
      <section className="content-card">
        <DataTable
          caption="运行环境列表"
          columns={ENVIRONMENT_COLUMNS}
          rows={environments}
          getRowKey={(environment) => environment.id}
        />
      </section>
    </section>
  );
}

function EnvironmentCreatePanel(): React.ReactElement {
  return (
    <section aria-labelledby="environment-create-title">
      <PageHeader
        eyebrow="交付与运行"
        title="创建运行环境"
        description="将镜像、容量和治理 Profile 组合成可部署的 Agent 服务。"
      />
      <span id="environment-create-title" className="sr-only">
        创建运行环境
      </span>
      <section className="content-card placeholder-panel">
        <p className="eyebrow">配置向导</p>
        <h2>定义服务与策略边界</h2>
        <p>
          创建表单将在下一阶段接入。这里将覆盖基础信息、镜像版本、实例容量、
          入口与出口策略，以及身份和日志 Profile。
        </p>
        <div className="placeholder-fields" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </section>
  );
}

function EnvironmentDetailPanel({
  environmentId,
  tab,
}: {
  environmentId: string;
  tab: EnvironmentTab;
}): React.ReactElement {
  const { environments } = useDemo();
  const environment = environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const tabs = ENVIRONMENT_TABS.map((tabValue) => ({
    value: tabValue,
    label: DETAIL_TAB_LABELS[tabValue],
    href: `/environments/${encodeURIComponent(environmentId)}/${tabValue}`,
  }));

  return (
    <section aria-labelledby="environment-detail-title">
      <PageHeader
        eyebrow="运行环境详情"
        title={environment?.name ?? environmentId}
        description={
          environment
            ? `${environment.project} · ${environment.owner}`
            : "该演示环境不在当前数据集中，但路由仍可用于查看页面结构。"
        }
        action={
          environment ? (
            <StatusBadge tone={statusTone(environment.status)}>
              {environment.status}
            </StatusBadge>
          ) : undefined
        }
      />
      <span id="environment-detail-title" className="sr-only">
        运行环境详情
      </span>
      <Tabs
        label="运行环境详情"
        items={tabs}
        activeValue={tab}
      />
      <section className="content-card detail-placeholder">
        <p className="eyebrow">详情页签</p>
        <h2>{DETAIL_TAB_LABELS[tab]}</h2>
        <p>
          {DETAIL_TAB_LABELS[tab]}面板将在后续功能任务中接入完整交互。
          当前页面保留真实可点击的八个页签与直接刷新路径。
        </p>
      </section>
    </section>
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
    id: "time",
    header: "发生时间",
    render: (event) => event.occurredAt.replace("T", " ").slice(0, 19),
  },
];

function AuditPanel(): React.ReactElement {
  const { auditEvents } = useDemo();

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
        <DataTable
          caption="最近审计事件"
          columns={AUDIT_COLUMNS}
          rows={auditEvents.slice(-8).reverse()}
          getRowKey={(event) => event.id}
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

function RoutePanel({ route }: { route: AppRoute }): React.ReactElement {
  switch (route.view) {
    case "overview":
      return <OverviewPanel />;
    case "environment-list":
      return <EnvironmentListPanel />;
    case "environment-create":
      return <EnvironmentCreatePanel />;
    case "environment-detail":
      return (
        <EnvironmentDetailPanel
          environmentId={route.environmentId}
          tab={route.tab}
        />
      );
    case "audit":
      return <AuditPanel />;
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
  const [pathname, setPathname] = useState(initialPath);
  const canonicalPathname = pathname === "/" ? "/overview" : pathname;
  const route = useMemo(
    () => parseRoute(canonicalPathname),
    [canonicalPathname],
  );

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
    setPathname(url.pathname);
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
        <RoutePanel route={route} />
      </AppShell>
    </div>
  );
}
