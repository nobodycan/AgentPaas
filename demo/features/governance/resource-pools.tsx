"use client";

import React, { useMemo } from "react";

import { DataTable, StatusBadge } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import {
  deriveResourcePoolRows,
} from "../../lib/governance-view-models";
import type { ResourcePoolRow } from "../../lib/governance-view-models";
import { useDemo } from "../../lib/demo-store";
import {
  GovernancePageHeader,
  governanceStatusTone,
} from "./governance-shared";

function CapacityMeter({
  used,
  total,
  unit,
}: {
  used: number;
  total: number;
  unit: string;
}): React.ReactElement {
  const percentage = total === 0 ? 100 : Math.round((used / total) * 100);
  return (
    <div className="pool-capacity">
      <span>
        {used}/{total} {unit}
      </span>
      <div
        className="pool-capacity__track"
        role="meter"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  );
}

export function ResourcePoolsPage(): React.ReactElement {
  const state = useDemo();
  const rows = useMemo(() => deriveResourcePoolRows(state), [state]);
  const columns: readonly DataTableColumn<ResourcePoolRow>[] = [
    {
      id: "pool",
      header: "资源池",
      render: (row) => (
        <div className="table-primary">
          <strong>{row.name}</strong>
          <small>
            {row.region} · {row.id}
          </small>
        </div>
      ),
    },
    {
      id: "health",
      header: "健康 / K8s",
      render: (row) => (
        <span className="correlation-stack">
          <StatusBadge tone={governanceStatusTone(row.status)}>
            {row.status}
          </StatusBadge>
          <small>{row.kubernetesVersion}</small>
        </span>
      ),
    },
    {
      id: "cpu",
      header: "CPU",
      render: (row) => (
        <CapacityMeter used={row.cpu.used} total={row.cpu.total} unit="core" />
      ),
    },
    {
      id: "memory",
      header: "内存",
      render: (row) => (
        <CapacityMeter
          used={row.memory.used}
          total={row.memory.total}
          unit="GiB"
        />
      ),
    },
    {
      id: "workloads",
      header: "环境 / 实例",
      align: "end",
      render: (row) => `${row.environmentCount} / ${row.instanceCount}`,
    },
    {
      id: "risk",
      header: "放置风险",
      render: (row) => (
        <span className="correlation-stack">
          <StatusBadge tone={governanceStatusTone(row.placementRisk)}>
            {row.placementRisk}
          </StatusBadge>
          <small>{row.riskReason}</small>
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="resource-pools-title">
      <GovernancePageHeader
        eyebrow="底层资源调度"
        title="资源池"
        description="聚合三套租户专属 Kubernetes 资源池的健康、容量与放置风险，为后续弹性与调度投资提供可见性。"
      />
      <h2 id="resource-pools-title" className="sr-only">
        资源池
      </h2>
      <section className="resource-pool-summary">
        <article>
          <span>资源池</span>
          <strong>{rows.length}</strong>
          <small>Mock 专属集群</small>
        </article>
        <article>
          <span>健康池</span>
          <strong>{rows.filter((row) => row.status === "Healthy").length}</strong>
          <small>待接入真实 K8s 探针</small>
        </article>
        <article>
          <span>高放置风险</span>
          <strong>
            {rows.filter((row) => row.placementRisk === "High").length}
          </strong>
          <small>阈值待试点校准</small>
        </article>
      </section>
      <section className="content-card">
        <DataTable
          caption="资源池容量与放置风险"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
        />
      </section>
    </section>
  );
}
