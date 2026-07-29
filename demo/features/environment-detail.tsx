"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors are intercepted by the product shell and keep direct-refresh routes truthful. */

import React from "react";

import {
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useDemo } from "../lib/demo-store";
import { ENVIRONMENT_TABS } from "../lib/routes";
import type { EnvironmentTab } from "../lib/routes";
import {
  runtimePanelKey,
  securityProfileEvidence,
} from "../lib/runtime-view-models";
import { resolveImageDigest } from "../lib/view-models";
import type {
  Environment,
  Instance,
} from "../lib/types";
import {
  AccessTestPanel,
  RevisionsPanel,
} from "./access-and-releases";
import { DeploymentStatusPanel } from "./deployment-status";

const DETAIL_TAB_LABELS: Record<EnvironmentTab, string> = {
  overview: "概览",
  access: "访问测试",
  config: "配置",
  instances: "实例",
  revisions: "版本",
  observability: "可观测性",
  security: "安全",
  operations: "操作记录",
};

function toneForStatus(
  status: string,
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (
    status === "Running" ||
    status === "Ready" ||
    status === "Stable"
  ) {
    return "success";
  }
  if (
    status === "Deploying" ||
    status === "Starting" ||
    status === "Pending"
  ) {
    return "info";
  }
  if (status === "Degraded" || status === "Draining") {
    return "warning";
  }
  if (
    status === "Failed" ||
    status === "Stopped" ||
    status === "Isolated"
  ) {
    return "danger";
  }
  return "neutral";
}

function EnvironmentHeader({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">运行环境详情</p>
        <h1>{environment.name}</h1>
        <p>
          {environment.project} · {environment.owner} · {environment.id}
        </p>
      </div>
      <div className="page-header__action">
        <StatusBadge tone={toneForStatus(environment.status)}>
          {environment.status}
        </StatusBadge>
      </div>
    </header>
  );
}

function OverviewPanel({
  environment,
  onNavigate,
}: {
  environment: Environment;
  onNavigate(destination: string): void;
}): React.ReactElement {
  const {
    auditEvents,
    revisions,
  } = useDemo();
  const activeRevision = revisions.find(
    (revision) => revision.id === environment.desiredRevisionId,
  );
  const latestRelease = revisions
    .filter((revision) => revision.environmentId === environment.id)
    .sort((left, right) => right.sequence - left.sequence)[0];
  const available =
    environment.status === "Running" && environment.readyInstances > 0;

  return (
    <div className="runtime-stack">
      {environment.status === "Deploying" ? (
        <DeploymentStatusPanel
          environmentId={environment.id}
          onNavigate={onNavigate}
        />
      ) : null}
      <section className="environment-hero-grid" aria-label="环境运行摘要">
        <article className="content-card environment-availability-card">
          <div>
            <p className="eyebrow">现在可用吗？</p>
            <h2>{available ? "可用" : "暂不可用"}</h2>
            <p>
              {available
                ? `${environment.readyInstances} 个 Ready 实例正在接收流量。`
                : "请先检查实例健康与发布进度。"}
            </p>
          </div>
          <StatusBadge tone={available ? "success" : "danger"}>
            {available ? "AVAILABLE" : "UNAVAILABLE"}
          </StatusBadge>
        </article>
        <article className="content-card environment-endpoint-card">
          <p className="eyebrow">HTTPS Endpoint</p>
          <h2>{environment.endpoint || "尚未分配"}</h2>
          <p>入口策略：{environment.ingressProfileId}</p>
        </article>
      </section>

      <section className="content-card">
        <div className="runtime-card-heading">
          <div>
            <p className="eyebrow">当前运行证据</p>
            <h2>版本、容量与最近发布</h2>
          </div>
          <StatusBadge tone={toneForStatus(activeRevision?.status ?? "")}>
            {activeRevision?.status ?? "Unknown"}
          </StatusBadge>
        </div>
        <dl className="evidence-grid evidence-grid--overview">
          <div>
            <dt>Active Revision</dt>
            <dd>{activeRevision?.id ?? environment.desiredRevisionId}</dd>
          </div>
          <div>
            <dt>镜像</dt>
            <dd>{activeRevision?.image ?? "未记录"}</dd>
          </div>
          <div>
            <dt>Digest</dt>
            <dd>
              {activeRevision
                ? activeRevision.imageDigest ??
                  resolveImageDigest(activeRevision.image)
                : "未记录"}
            </dd>
          </div>
          <div>
            <dt>Ready / Desired</dt>
            <dd>
              {environment.readyInstances} / {environment.desiredInstances}
            </dd>
          </div>
          <div>
            <dt>最近发布</dt>
            <dd>
              {latestRelease
                ? `${latestRelease.id} · ${latestRelease.status} · ${latestRelease.createdAt.slice(0, 16).replace("T", " ")}`
                : "暂无"}
            </dd>
          </div>
          <div>
            <dt>可关联审计</dt>
            <dd>
              {
                auditEvents.filter(
                  (event) =>
                    event.details.environmentId === environment.id,
                ).length
              }{" "}
              条
            </dd>
          </div>
        </dl>
      </section>

      <section className="environment-control-grid">
        <article className="content-card">
          <p className="eyebrow">入口 / 出口</p>
          <h2>网络策略已绑定</h2>
          <dl className="compact-definition-list">
            <div>
              <dt>Ingress</dt>
              <dd>{environment.ingressProfileId}</dd>
            </div>
            <div>
              <dt>Egress</dt>
              <dd>{environment.egressProfileId}</dd>
            </div>
            <div>
              <dt>Visibility</dt>
              <dd>{environment.endpointVisibility ?? "internal"}</dd>
            </div>
          </dl>
        </article>
        <article className="content-card">
          <p className="eyebrow">安全基线</p>
          <h2>身份、审计与 Secure Task</h2>
          <p className="runtime-card-copy">
            {environment.identityProfileId ?? "identity-workload"} ·{" "}
            {environment.loggingProfileId ?? "logging-audit"} ·{" "}
            {environment.secureTaskProfileId ?? "未启用"}
          </p>
        </article>
        <article className="content-card">
          <p className="eyebrow">下一步诊断</p>
          <h2>
            {available ? "验证会话亲和与 SSE" : "检查未就绪实例"}
          </h2>
          <a
            className="button button--quiet"
            href={`/environments/${encodeURIComponent(environment.id)}/${
              available ? "access" : "instances"
            }`}
          >
            打开诊断面板
          </a>
        </article>
      </section>
    </div>
  );
}

function ConfigurationPanel({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  const { profiles } = useDemo();
  const profileIds = [
    environment.runtimePlanId,
    environment.ingressProfileId,
    environment.egressProfileId,
    environment.secureTaskProfileId,
    environment.identityProfileId,
    environment.loggingProfileId,
    environment.domainProfileId,
  ].filter((profileId): profileId is string => Boolean(profileId));

  return (
    <div className="runtime-stack">
      <section className="content-card">
        <div className="runtime-card-heading">
          <div>
            <p className="eyebrow">业务配置</p>
            <h2>可审阅的运行参数</h2>
            <p>
              此页只展示非敏感引用与业务参数，不展示任何 Secret
              名称对应的值。
            </p>
          </div>
          <StatusBadge tone="success">无 Secret 明文</StatusBadge>
        </div>
        <dl className="evidence-grid">
          <div>
            <dt>容器端口</dt>
            <dd>{environment.containerPort ?? 8080}</dd>
          </div>
          <div>
            <dt>Endpoint 可见性</dt>
            <dd>{environment.endpointVisibility ?? "internal"}</dd>
          </div>
          <div>
            <dt>会话头</dt>
            <dd>{environment.sessionHeader ?? "X-Agent-Session-ID"}</dd>
          </div>
          <div>
            <dt>期望实例</dt>
            <dd>{environment.desiredInstances}</dd>
          </div>
        </dl>
      </section>
      <section className="content-card">
        <p className="eyebrow">Profile References</p>
        <h2>配置版本引用</h2>
        <ul className="profile-reference-list">
          {profileIds.map((profileId) => {
            const profile = profiles.find(
              (candidate) => candidate.id === profileId,
            );
            return (
              <li key={profileId}>
                <div>
                  <strong>{profileId}</strong>
                  <span>{profile?.summary ?? "外部配置引用"}</span>
                </div>
                <StatusBadge tone="info">
                  {profile ? `${profile.kind} · v${profile.version}` : "REF"}
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function stableNumber(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function instanceFacts(instance: Instance): {
  health: string;
  node: string;
  ip: string;
  uptime: string;
  restarts: number;
  cpu: number;
  memory: number;
} {
  const seed = stableNumber(instance.id);
  const fixedReference = Date.parse("2026-07-30T12:00:00.000Z");
  const uptimeHours = Math.max(
    0,
    Math.floor((fixedReference - Date.parse(instance.startedAt)) / 3_600_000),
  );
  return {
    health:
      instance.status === "Ready"
        ? "Readiness 通过"
        : instance.status === "Failed"
          ? "探针失败"
          : "不接收流量",
    node: `node-${instance.clusterId.replace("cluster-tenant-", "")}-${(seed % 9) + 1}`,
    ip: `10.24.${(seed % 180) + 10}.${((seed >>> 8) % 230) + 10}`,
    uptime: `${Math.floor(uptimeHours / 24)}d ${uptimeHours % 24}h`,
    restarts: instance.status === "Failed" ? 3 : seed % 2,
    cpu: 18 + (seed % 47),
    memory: 32 + (seed % 51),
  };
}

function InstancesPanel({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  const {
    instances,
    replaceInstance,
  } = useDemo();
  const environmentInstances = instances.filter(
    (instance) => instance.environmentId === environment.id,
  );

  return (
    <section className="content-card">
      <div className="runtime-card-heading">
        <div>
          <p className="eyebrow">Runtime Instances</p>
          <h2>
            {environment.readyInstances} Ready /{" "}
            {environment.desiredInstances} Desired
          </h2>
          <p>每行均提供日志与指标定位提示；替换操作不会降低 Ready 数。</p>
        </div>
        <StatusBadge
          tone={
            environment.readyInstances === environment.desiredInstances
              ? "success"
              : "warning"
          }
        >
          {environment.readyInstances === environment.desiredInstances
            ? "容量满足"
            : "容量不足"}
        </StatusBadge>
      </div>
      <div className="data-table-wrap">
        <table className="data-table instance-table">
          <caption className="sr-only">环境实例与资源指标</caption>
          <thead>
            <tr>
              <th className="data-table__cell--start">实例 / 状态</th>
              <th className="data-table__cell--start">健康 / Revision</th>
              <th className="data-table__cell--start">Node / IP</th>
              <th className="data-table__cell--center">Uptime / 重启</th>
              <th className="data-table__cell--center">CPU / 内存</th>
              <th className="data-table__cell--end">诊断与操作</th>
            </tr>
          </thead>
          <tbody>
            {environmentInstances.map((instance) => {
              const facts = instanceFacts(instance);
              const isReplacement = instance.id.includes("-replacement-");
              return (
                <tr key={instance.id}>
                  <td>
                    <div className="table-primary">
                      <strong>{instance.id}</strong>
                      <StatusBadge tone={toneForStatus(instance.status)}>
                        {instance.status}
                      </StatusBadge>
                    </div>
                  </td>
                  <td>
                    <div className="table-primary">
                      <strong>{facts.health}</strong>
                      <small>{instance.revisionId}</small>
                    </div>
                  </td>
                  <td>
                    <div className="table-primary">
                      <strong>{facts.node}</strong>
                      <small>{facts.ip}</small>
                    </div>
                  </td>
                  <td className="data-table__cell--center">
                    {facts.uptime} / {facts.restarts}
                  </td>
                  <td className="data-table__cell--center">
                    {facts.cpu}% / {facts.memory}%
                  </td>
                  <td className="data-table__cell--end">
                    <div className="instance-actions">
                      <span>日志 · 指标</span>
                      <button
                        type="button"
                        className="button button--quiet"
                        disabled={
                          instance.status !== "Ready" || isReplacement
                        }
                        onClick={() =>
                          replaceInstance(environment.id, instance.id)
                        }
                      >
                        {isReplacement ? "替换实例" : "摘流并替换"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricBar({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}): React.ReactElement {
  return (
    <article className="observable-metric">
      <div>
        <span>{label}</span>
        <strong>{detail}</strong>
      </div>
      <div
        className="observable-bar"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </article>
  );
}

function ObservabilityPanel({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  const seed = stableNumber(environment.id);
  const successRate = environment.status === "Degraded" ? 92.4 : 99.7;
  const errorRate = Number((100 - successRate).toFixed(1));
  const cpu = 32 + (seed % 28);
  const memory = 46 + (seed % 31);
  const requestVolume = 9200 + (seed % 2400);
  const p95 = 280 + (seed % 190);
  const activeSse = 8 + (seed % 37);
  const readiness =
    (environment.readyInstances / environment.desiredInstances) * 100;

  return (
    <section className="content-card">
      <div className="runtime-card-heading">
        <div>
          <p className="eyebrow">近 15 分钟 · 演示指标</p>
          <h2>请求、资源与负载均衡同步</h2>
          <p>条形图均提供可访问的 meter 语义，不依赖 Canvas。</p>
        </div>
        <StatusBadge tone={successRate > 99 ? "success" : "warning"}>
          {successRate}% 成功率
        </StatusBadge>
      </div>
      <div className="observability-grid">
        <MetricBar
          label="请求量"
          value={Math.min(100, requestVolume / 120)}
          detail={`${requestVolume.toLocaleString("zh-CN")} req`}
        />
        <MetricBar
          label="成功率"
          value={successRate}
          detail={`${successRate}%`}
        />
        <MetricBar
          label="错误率"
          value={Math.min(100, errorRate * 12)}
          detail={`${errorRate}%`}
        />
        <MetricBar
          label="P95 延迟"
          value={Math.min(100, p95 / 8)}
          detail={`${p95} ms`}
        />
        <MetricBar
          label="活跃 SSE"
          value={Math.min(100, activeSse * 2)}
          detail={`${activeSse} streams`}
        />
        <MetricBar label="CPU" value={cpu} detail={`${cpu}%`} />
        <MetricBar label="内存" value={memory} detail={`${memory}%`} />
        <MetricBar
          label="Readiness"
          value={readiness}
          detail={`${environment.readyInstances}/${environment.desiredInstances}`}
        />
        <MetricBar
          label="LB 后端同步"
          value={readiness}
          detail={readiness === 100 ? "已同步" : "同步中"}
        />
      </div>
    </section>
  );
}

function SecurityPanel({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  const profileRows = securityProfileEvidence(environment);

  return (
    <section className="content-card">
      <div className="runtime-card-heading">
        <div>
          <p className="eyebrow">安全基线摘要</p>
          <h2>默认拒绝、工作负载身份与审计</h2>
          <p>
            每项状态均由当前 Profile 引用独立派生；SecureTask 与
            Domain 为可选绑定，未绑定不会改变其他基线项的状态。
          </p>
        </div>
        <StatusBadge tone="info">逐项证据</StatusBadge>
      </div>
      <dl className="security-profile-grid">
        {profileRows.map((row) => (
          <div key={row.kind}>
            <dt>{row.kind}</dt>
            <dd className="security-profile-value">
              <span>{row.profileId}</span>
              <StatusBadge
                tone={
                  row.active
                    ? "success"
                    : row.status.startsWith("可选")
                      ? "neutral"
                      : "warning"
                }
              >
                {row.status}
              </StatusBadge>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OperationsPanel({
  environment,
}: {
  environment: Environment;
}): React.ReactElement {
  const {
    auditEvents,
    instances,
  } = useDemo();
  const instanceIds = new Set(
    instances
      .filter((instance) => instance.environmentId === environment.id)
      .map((instance) => instance.id),
  );
  const rows = auditEvents
    .filter(
      (event) =>
        event.details.environmentId === environment.id ||
        event.targetId === environment.id ||
        instanceIds.has(event.targetId),
    )
    .slice()
    .reverse();

  return (
    <section className="content-card">
      <div className="runtime-card-heading">
        <div>
          <p className="eyebrow">环境操作证据</p>
          <h2>{rows.length} 条关联审计事件</h2>
          <p>仅展示与当前环境、版本或实例直接关联的操作。</p>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <caption className="sr-only">当前环境操作审计</caption>
          <thead>
            <tr>
              <th className="data-table__cell--start">事件</th>
              <th className="data-table__cell--center">类型</th>
              <th className="data-table__cell--start">操作者</th>
              <th className="data-table__cell--start">Request ID</th>
              <th className="data-table__cell--end">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => (
              <tr key={event.id}>
                <td>
                  <div className="table-primary">
                    <strong>{event.summary}</strong>
                    <small>{event.type}</small>
                  </div>
                </td>
                <td className="data-table__cell--center">
                  <StatusBadge tone="info">{event.kind}</StatusBadge>
                </td>
                <td>{event.actor}</td>
                <td>
                  {event.details.requestId ? (
                    <a
                      href={`/audit?correlation=${encodeURIComponent(
                        event.details.requestId,
                      )}`}
                    >
                      {event.details.requestId}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="data-table__cell--end">
                  {event.occurredAt.replace("T", " ").slice(0, 19)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EnvironmentDetailPanel({
  environmentId,
  tab,
  onNavigate,
}: {
  environmentId: string;
  tab: EnvironmentTab;
  onNavigate(destination: string): void;
}): React.ReactElement {
  const {
    environments,
    generation,
  } = useDemo();
  const environment = environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const tabs = ENVIRONMENT_TABS.map((tabValue) => ({
    value: tabValue,
    label: DETAIL_TAB_LABELS[tabValue],
    href: `/environments/${encodeURIComponent(environmentId)}/${tabValue}`,
  }));

  if (!environment) {
    return (
      <section className="content-card empty-state">
        <span className="empty-state__mark" aria-hidden="true">
          ?
        </span>
        <h1>未找到运行环境</h1>
        <p>{environmentId} 不在当前演示数据集中。</p>
        <a className="button button--primary" href="/environments">
          返回环境列表
        </a>
      </section>
    );
  }

  return (
    <section aria-labelledby="environment-detail-title">
      <EnvironmentHeader environment={environment} />
      <span id="environment-detail-title" className="sr-only">
        运行环境详情
      </span>
      <Tabs
        label="运行环境详情"
        items={tabs}
        activeValue={tab}
      />
      {tab === "overview" ? (
        <OverviewPanel
          environment={environment}
          onNavigate={onNavigate}
        />
      ) : null}
      {tab === "access" ? (
        <AccessTestPanel
          key={runtimePanelKey(
            "access",
            environment.id,
            generation,
          )}
          environmentId={environment.id}
        />
      ) : null}
      {tab === "config" ? (
        <ConfigurationPanel environment={environment} />
      ) : null}
      {tab === "instances" ? (
        <InstancesPanel environment={environment} />
      ) : null}
      {tab === "revisions" ? (
        <RevisionsPanel
          key={runtimePanelKey(
            "revisions",
            environment.id,
            generation,
          )}
          environmentId={environment.id}
        />
      ) : null}
      {tab === "observability" ? (
        <ObservabilityPanel environment={environment} />
      ) : null}
      {tab === "security" ? (
        <SecurityPanel environment={environment} />
      ) : null}
      {tab === "operations" ? (
        <OperationsPanel environment={environment} />
      ) : null}
    </section>
  );
}
