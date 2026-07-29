"use client";

import React, { useMemo, useState } from "react";

import {
  DataTable,
  Drawer,
  StatusBadge,
} from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { deriveProfileUsage } from "../../lib/governance-view-models";
import { useDemo } from "../../lib/demo-store";
import type { Profile } from "../../lib/types";
import { GovernancePageHeader } from "./governance-shared";

const PROFILE_KIND_LABELS: Readonly<Record<Profile["kind"], string>> = {
  RUNTIME: "运行时套餐",
  INGRESS: "入口流量",
  EGRESS: "出口流量",
  SECURE_TASK: "短任务安全沙箱",
  IDENTITY: "身份",
  LOGGING: "日志与审计",
  DOMAIN: "领域策略",
};

export function ProfileManagementPage(): React.ReactElement {
  const state = useDemo();
  const [selectedProfileId, setSelectedProfileId] = useState<string>();
  const usage = useMemo(
    () =>
      selectedProfileId
        ? deriveProfileUsage(state, selectedProfileId)
        : undefined,
    [selectedProfileId, state],
  );
  const columns: readonly DataTableColumn<Profile>[] = [
    {
      id: "profile",
      header: "Profile",
      render: (profile) => (
        <button
          type="button"
          className="table-link-button"
          onClick={() => setSelectedProfileId(profile.id)}
        >
          <strong>{profile.name}</strong>
          <small>{profile.id}</small>
        </button>
      ),
    },
    {
      id: "kind",
      header: "类型",
      render: (profile) => (
        <StatusBadge>{PROFILE_KIND_LABELS[profile.kind]}</StatusBadge>
      ),
    },
    {
      id: "version",
      header: "版本",
      render: (profile) => `v${profile.version}`,
    },
    {
      id: "summary",
      header: "用途",
      render: (profile) => profile.summary,
    },
    {
      id: "usage",
      header: "环境引用",
      align: "end",
      render: (profile) =>
        deriveProfileUsage(state, profile.id).environmentIds.length,
    },
  ];

  return (
    <section aria-labelledby="profiles-title">
      <GovernancePageHeader
        eyebrow="策略即配置"
        title="Profile 管理"
        description="用可复用配置定义运行、网络、身份、日志与短任务边界；MVP 只提供详情与引用关系，不在演示中做复杂编辑。"
      />
      <h2 id="profiles-title" className="sr-only">
        Profile 管理
      </h2>
      <section className="profile-kind-strip">
        {Object.entries(PROFILE_KIND_LABELS).map(([kind, label]) => (
          <article key={kind}>
            <span>{label}</span>
            <strong>
              {state.profiles.filter((profile) => profile.kind === kind).length}
            </strong>
            <small>Mock Profile</small>
          </article>
        ))}
      </section>
      <section className="content-card">
        <DataTable
          caption="Profile 及环境引用"
          columns={columns}
          rows={state.profiles}
          getRowKey={(profile) => profile.id}
        />
      </section>

      <Drawer
        open={Boolean(usage?.profile)}
        title={usage?.profile?.name ?? "Profile 详情"}
        onClose={() => setSelectedProfileId(undefined)}
      >
        {usage?.profile ? (
          <div className="governance-drawer-stack">
            <div className="drawer-readonly-banner">
              <StatusBadge tone="info">只读演示</StatusBadge>
              <span>复杂编辑与版本发布不在 MVP 演示范围内。</span>
            </div>
            <dl className="drawer-definition-list">
              <div>
                <dt>Profile ID</dt>
                <dd>{usage.profile.id}</dd>
              </div>
              <div>
                <dt>类型 / 版本</dt>
                <dd>
                  {PROFILE_KIND_LABELS[usage.profile.kind]} / v
                  {usage.profile.version}
                </dd>
              </div>
              <div>
                <dt>说明</dt>
                <dd>{usage.profile.summary}</dd>
              </div>
            </dl>
            <section>
              <h3>控制项</h3>
              <ul className="control-list">
                {usage.profile.controls.map((control) => (
                  <li key={control}>{control}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>引用环境 · {usage.environmentIds.length}</h3>
              {usage.environmentIds.length > 0 ? (
                <ul className="profile-usage-list">
                  {usage.environmentIds.map((environmentId) => (
                    <li key={environmentId}>
                      <a href={`/environments/${environmentId}/config`}>
                        {environmentId}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-copy">当前没有运行环境引用。</p>
              )}
            </section>
            {usage.profile.kind === "SECURE_TASK" ? (
              <div className="evidence-callout">
                <strong>SecureTask 边界</strong>
                <p>
                  仅用于委托的分钟或数小时短任务；长期 Agent 仍运行在
                  Kubernetes Runtime，不把 SecureTask 当作常驻部署环境。
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
