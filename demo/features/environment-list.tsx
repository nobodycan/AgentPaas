"use client";

import React, {
  useMemo,
  useState,
} from "react";

import {
  DataTable,
  EmptyState,
  StatusBadge,
} from "../components/ui";
import type {
  DataTableColumn,
  StatusTone,
} from "../components/ui";
import { useDemo } from "../lib/demo-store";
import type {
  Environment,
  EnvironmentStatus,
} from "../lib/types";
import {
  environmentFilterOptions,
  filterEnvironments,
} from "../lib/view-models";
import type { EnvironmentFilters } from "../lib/view-models";

export interface EnvironmentListPageProps {
  onNavigate(destination: string): void;
}

function statusTone(status: string): StatusTone {
  if (
    status === "Running" ||
    status === "Ready" ||
    status === "Stable"
  ) {
    return "success";
  }
  if (status === "Draft" || status === "Deploying") {
    return "info";
  }
  if (status === "Degraded" || status === "Pending") {
    return "warning";
  }
  if (status === "Failed" || status === "Isolated") {
    return "danger";
  }
  return "neutral";
}

interface EnvironmentListRow {
  environment: Environment;
  cluster: string;
  updatedAt: string;
}

const EMPTY_FILTERS: EnvironmentFilters = {
  query: "",
  status: "",
  project: "",
  runtimePlanId: "",
};

export function EnvironmentListPage({
  onNavigate,
}: EnvironmentListPageProps): React.ReactElement {
  const {
    environments,
    instances,
    clusters,
    revisions,
  } = useDemo();
  const [filters, setFilters] =
    useState<EnvironmentFilters>(EMPTY_FILTERS);
  const options = useMemo(
    () => environmentFilterOptions(environments),
    [environments],
  );
  const filteredEnvironments = useMemo(
    () => filterEnvironments(environments, filters),
    [environments, filters],
  );
  const clusterNames = useMemo(
    () => new Map(clusters.map((cluster) => [cluster.id, cluster.name])),
    [clusters],
  );
  const instancesByEnvironment = useMemo(() => {
    const index = new Map<
      string,
      (typeof instances)[number][]
    >();

    for (const instance of instances) {
      const environmentInstances =
        index.get(instance.environmentId) ?? [];
      environmentInstances.push(instance);
      index.set(instance.environmentId, environmentInstances);
    }

    return index;
  }, [instances]);
  const revisionsById = useMemo(
    () =>
      new Map(
        revisions.map((revision) => [revision.id, revision]),
      ),
    [revisions],
  );
  const rows = useMemo<EnvironmentListRow[]>(
    () =>
      filteredEnvironments.map((environment) => {
        const environmentClusterIds = [
          ...new Set(
            (instancesByEnvironment.get(environment.id) ?? [])
              .map((instance) => instance.clusterId)
              .filter(Boolean),
          ),
        ];
        const revision = revisionsById.get(
          environment.desiredRevisionId,
        );

        return {
          environment,
          cluster:
            environmentClusterIds
              .map(
                (clusterId) =>
                  clusterNames.get(clusterId) ?? clusterId,
              )
              .join(" / ") || "待调度",
          updatedAt: revision?.createdAt ?? "",
        };
      }),
    [
      clusterNames,
      filteredEnvironments,
      instancesByEnvironment,
      revisionsById,
    ],
  );
  const hasFilters = Object.values(filters).some(Boolean);
  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const columns = useMemo<readonly DataTableColumn<EnvironmentListRow>[]>(
    () => [
      {
        id: "name",
        header: "名称",
        render: ({ environment }) => (
          <div className="table-primary">
            <a
              href={`/environments/${encodeURIComponent(
                environment.id,
              )}/overview`}
            >
              {environment.name}
            </a>
            <small>{environment.id}</small>
          </div>
        ),
      },
      {
        id: "project",
        header: "项目",
        render: ({ environment }) => environment.project,
      },
      {
        id: "owner",
        header: "负责人",
        render: ({ environment }) => environment.owner,
      },
      {
        id: "status",
        header: "状态",
        render: ({ environment }) => (
          <StatusBadge tone={statusTone(environment.status)}>
            {environment.status}
          </StatusBadge>
        ),
      },
      {
        id: "endpoint",
        header: "Endpoint",
        render: ({ environment }) =>
          environment.endpoint ? (
            <a href={environment.endpoint} target="_blank" rel="noreferrer">
              {environment.endpoint.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            "—"
          ),
      },
      {
        id: "revision",
        header: "当前 Revision",
        render: ({ environment }) => environment.desiredRevisionId,
      },
      {
        id: "capacity",
        header: "Ready / Desired",
        render: ({ environment }) =>
          `${environment.readyInstances} / ${environment.desiredInstances}`,
        align: "end",
      },
      {
        id: "runtime",
        header: "RuntimePlan",
        render: ({ environment }) => environment.runtimePlanId,
      },
      {
        id: "cluster",
        header: "Cluster",
        render: ({ cluster }) => cluster,
      },
      {
        id: "updated",
        header: "更新时间",
        render: ({ updatedAt }) =>
          updatedAt
            ? updatedAt.replace("T", " ").slice(0, 16)
            : "—",
      },
    ],
    [],
  );

  return (
    <section aria-labelledby="environment-list-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">交付与运行</p>
          <h1 id="environment-list-title">运行环境</h1>
          <p>
            按项目、状态与 RuntimePlan 快速定位 Agent
            服务，并进入部署或治理详情。
          </p>
        </div>
        <div className="page-header__action">
          <button
            type="button"
            className="button button--primary"
            onClick={() => onNavigate("/environments/new")}
          >
            创建运行环境
          </button>
        </div>
      </header>

      <section className="content-card">
        <form
          className="environment-filters"
          aria-label="筛选运行环境"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="filter-search">
            <span>搜索</span>
            <input
              type="search"
              value={filters.query}
              placeholder="名称、项目、负责人、Revision…"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>状态</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as
                    | EnvironmentStatus
                    | "",
                }))
              }
            >
              <option value="">全部状态</option>
              {options.statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>项目</span>
            <select
              value={filters.project}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  project: event.target.value,
                }))
              }
            >
              <option value="">全部项目</option>
              {options.projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>RuntimePlan</span>
            <select
              value={filters.runtimePlanId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  runtimePlanId: event.target.value,
                }))
              }
            >
              <option value="">全部计划</option>
              {options.runtimePlans.map((runtimePlan) => (
                <option key={runtimePlan} value={runtimePlan}>
                  {runtimePlan}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button--quiet"
            disabled={!hasFilters}
            onClick={resetFilters}
          >
            重置筛选
          </button>
        </form>

        {rows.length > 0 ? (
          <>
            <p className="filter-result-count">
              显示 {rows.length} / {environments.length} 个环境
            </p>
            <DataTable
              caption="运行环境列表"
              columns={columns}
              rows={rows}
              getRowKey={({ environment }) => environment.id}
            />
          </>
        ) : (
          <EmptyState
            title="没有匹配的运行环境"
            description="调整搜索词或清除筛选条件后再试。"
            action={
              <button
                type="button"
                className="button button--quiet"
                onClick={resetFilters}
              >
                重置筛选
              </button>
            }
          />
        )}
      </section>
    </section>
  );
}
