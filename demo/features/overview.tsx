"use client";

import React, {
  useMemo,
} from "react";

import { useDemo } from "../lib/demo-store";
import {
  INVESTMENT_OUTCOMES,
  deriveOverviewMetrics,
} from "../lib/view-models";
import { StatusBadge } from "../components/ui";

export interface OverviewPageProps {
  onNavigate(destination: string): void;
}

function formatTimestamp(timestamp: string): string {
  return timestamp.replace("T", " ").slice(0, 16);
}

export function OverviewPage({
  onNavigate,
}: OverviewPageProps): React.ReactElement {
  const state = useDemo();
  const metrics = deriveOverviewMetrics(state);
  const recentReleases = useMemo(
    () =>
      [...state.revisions]
        .sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        )
        .slice(0, 4),
    [state.revisions],
  );
  const activeAlerts = useMemo(
    () =>
      state.securityIncidents.filter(
        (incident) =>
          incident.status === "Open" ||
          incident.status === "Containing",
      ),
    [state.securityIncidents],
  );
  const latestRelease = recentReleases[0];

  return (
    <section aria-labelledby="leadership-overview-title">
      <header className="page-header leadership-header">
        <div>
          <p className="eyebrow">领导视角 · 交付与治理</p>
          <h1 id="leadership-overview-title">
            把 Agent 镜像变成受控的生产服务
          </h1>
          <p>
            一眼确认生产供给、发布节奏与治理风险；需要介入时直接进入对应工作流。
          </p>
        </div>
        <div className="page-header__action">
          <button
            type="button"
            className="button button--primary"
            onClick={() => onNavigate("/environments/new")}
          >
            部署新的 Agent 环境
          </button>
        </div>
      </header>

      <div className="metric-grid" aria-label="当前平台态势">
        <article className="metric-card">
          <p className="metric-card__label">当前运行环境</p>
          <p className="metric-card__value">{metrics.environmentCount}</p>
          <p className="metric-card__detail">覆盖生产、预发与受控沙箱</p>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Ready 实例</p>
          <p className="metric-card__value">{metrics.readyInstanceCount}</p>
          <p className="metric-card__detail">可立即承接受控流量</p>
        </article>
        <button
          type="button"
          className="metric-card leadership-metric-action"
          onClick={() =>
            onNavigate(
              latestRelease
                ? `/environments/${encodeURIComponent(
                    latestRelease.environmentId,
                  )}/revisions`
                : "/environments",
            )
          }
        >
          <span className="metric-card__label">近期发布</span>
          <strong className="metric-card__value">
            {metrics.recentReleaseCount}
          </strong>
          <span className="metric-card__detail">查看版本结果与回滚证据 →</span>
        </button>
        <button
          type="button"
          className="metric-card leadership-metric-action"
          onClick={() => onNavigate("/security-events")}
        >
          <span className="metric-card__label">治理健康</span>
          <strong className="metric-card__value">
            {metrics.governanceHealth}
          </strong>
          <span className="metric-card__detail">
            {activeAlerts.length > 0
              ? `${activeAlerts.length} 项需要关注 →`
              : "当前无待处置事件 →"}
          </span>
        </button>
      </div>

      <section
        className="investment-strip"
        aria-labelledby="investment-outcomes-title"
      >
        <div>
          <p className="eyebrow">投资结果假设</p>
          <h2 id="investment-outcomes-title">把跨团队交付压缩成一个受控入口</h2>
        </div>
        <div className="investment-strip__outcomes">
          {INVESTMENT_OUTCOMES.map((outcome) => (
            <article key={outcome.copy}>
              <strong>{outcome.copy}</strong>
              <span>演示数据 · 待试点验证</span>
            </article>
          ))}
        </div>
      </section>

      <div className="leadership-columns">
        <section
          className="content-card"
          aria-labelledby="recent-releases-title"
        >
          <div className="content-card__header">
            <div>
              <p className="eyebrow">交付确定性</p>
              <h2 id="recent-releases-title">最近发布</h2>
            </div>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => onNavigate("/environments")}
            >
              查看全部环境
            </button>
          </div>
          <ul className="leadership-list">
            {recentReleases.map((revision) => {
              const environment = state.environments.find(
                (candidate) => candidate.id === revision.environmentId,
              );
              return (
                <li key={revision.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(
                        `/environments/${encodeURIComponent(
                          revision.environmentId,
                        )}/revisions`,
                      )
                    }
                  >
                    <span>
                      <strong>{environment?.name ?? revision.environmentId}</strong>
                      <small>
                        {revision.id} · {formatTimestamp(revision.createdAt)}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        revision.status === "Stable"
                          ? "success"
                          : revision.status === "Failed"
                            ? "danger"
                            : "info"
                      }
                    >
                      {revision.status}
                    </StatusBadge>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          className="content-card"
          aria-labelledby="governance-alerts-title"
        >
          <div className="content-card__header">
            <div>
              <p className="eyebrow">治理介入</p>
              <h2 id="governance-alerts-title">需要关注</h2>
            </div>
            <StatusBadge tone={activeAlerts.length ? "warning" : "success"}>
              {activeAlerts.length ? `${activeAlerts.length} 项` : "健康"}
            </StatusBadge>
          </div>
          {activeAlerts.length > 0 ? (
            <ul className="leadership-list">
              {activeAlerts.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate("/security-events")}
                  >
                    <span>
                      <strong>{incident.title}</strong>
                      <small>
                        {incident.environmentId} ·{" "}
                        {formatTimestamp(incident.detectedAt)}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        incident.severity === "High" ||
                        incident.severity === "Critical"
                          ? "danger"
                          : "warning"
                      }
                    >
                      {incident.severity}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="leadership-empty">
              当前没有待处置治理事件，身份、网络与审计策略均在预期边界内。
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
