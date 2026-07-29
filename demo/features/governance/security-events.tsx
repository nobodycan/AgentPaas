"use client";

import React, { useMemo, useState } from "react";

import {
  DataTable,
  Drawer,
  ProgressTimeline,
  StatusBadge,
} from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import {
  deriveIncidentEvidence,
  deriveSecurityPosture,
} from "../../lib/governance-view-models";
import { useDemo } from "../../lib/demo-store";
import { PRIMARY_ENVIRONMENT_ID } from "../../lib/mock-data";
import type { SecurityIncident } from "../../lib/types";
import {
  formatGovernanceTime,
  GovernancePageHeader,
  governanceStatusTone,
} from "./governance-shared";

export function SecurityEventsPage(): React.ReactElement {
  const {
    state,
    securityIncidents,
    advanceIsolation,
  } = useDemo();
  const openIncident = securityIncidents.find(
    (incident) => incident.status === "Open",
  );
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>();
  const selectedIncident = securityIncidents.find(
    (incident) => incident.id === selectedIncidentId,
  );
  const incidentEvidence = selectedIncident
    ? deriveIncidentEvidence(state, selectedIncident.id)
    : undefined;
  const posture = useMemo(
    () => deriveSecurityPosture(state, PRIMARY_ENVIRONMENT_ID),
    [state],
  );

  const columns: readonly DataTableColumn<SecurityIncident>[] = [
    {
      id: "incident",
      header: "安全事件",
      render: (incident) => (
        <button
          type="button"
          className="table-link-button"
          onClick={() => setSelectedIncidentId(incident.id)}
        >
          <strong>{incident.title}</strong>
          <small>{incident.id}</small>
        </button>
      ),
    },
    {
      id: "severity",
      header: "级别",
      render: (incident) => (
        <StatusBadge tone={governanceStatusTone(incident.severity)}>
          {incident.severity}
        </StatusBadge>
      ),
    },
    {
      id: "status",
      header: "处置状态",
      render: (incident) => (
        <StatusBadge tone={governanceStatusTone(incident.status)}>
          {incident.status}
        </StatusBadge>
      ),
    },
    {
      id: "environment",
      header: "环境 / 异常实例",
      render: (incident) => (
        <span className="correlation-stack">
          <a href={`/environments/${incident.environmentId}/security`}>
            {incident.environmentId}
          </a>
          <small>{incident.context?.instanceId ?? "未识别"}</small>
        </span>
      ),
    },
    {
      id: "time",
      header: "发现时间",
      align: "end",
      render: (incident) => formatGovernanceTime(incident.detectedAt),
    },
  ];

  return (
    <section aria-labelledby="security-events-title">
      <GovernancePageHeader
        eyebrow="安全运营"
        title="安全事件与隔离"
        description="从异常出口证据进入一键隔离，保留稳定 Endpoint 标识，并把影响限制在异常实例。"
        action={
          openIncident ? (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                setSelectedIncidentId(openIncident.id);
                advanceIsolation(openIncident.id);
              }}
            >
              打开事件并一键隔离
            </button>
          ) : null
        }
      />
      <h2 id="security-events-title" className="sr-only">
        安全事件与隔离
      </h2>

      <section className="security-posture-grid" aria-label="安全态势摘要">
        {[
          ["Ingress", posture.ingress],
          ["Egress", posture.egress],
          ["工作负载身份", posture.workloadIdentity],
          ["审计", posture.audit],
          ["模型凭据", posture.modelCredential],
          ["SecureTask", posture.secureTask],
          ["Guardrail", posture.guardrail],
        ].map(([label, item]) => (
          <article className="security-posture-card" key={label as string}>
            <span>{label as string}</span>
            <strong>{(item as typeof posture.ingress).status}</strong>
            <p>{(item as typeof posture.ingress).evidence}</p>
          </article>
        ))}
      </section>
      <p className="security-limitation">{posture.runtimeLimitation}</p>

      <section className="content-card">
        <div className="runtime-card-heading">
          <div>
            <p className="eyebrow">事件队列</p>
            <h2>{securityIncidents.length} 个 Mock 安全事件</h2>
            <p>点击事件查看隔离动作、目标实例与可关联审计证据。</p>
          </div>
        </div>
        <DataTable
          caption="安全事件列表"
          columns={columns}
          rows={securityIncidents}
          getRowKey={(incident) => incident.id}
        />
      </section>

      <Drawer
        open={Boolean(selectedIncident)}
        title={selectedIncident?.title ?? "安全事件详情"}
        onClose={() => setSelectedIncidentId(undefined)}
      >
        {selectedIncident && incidentEvidence ? (
          <div className="governance-drawer-stack">
            <div className="incident-summary-grid">
              <div>
                <span>事件状态</span>
                <StatusBadge
                  tone={governanceStatusTone(selectedIncident.status)}
                >
                  {selectedIncident.status}
                </StatusBadge>
              </div>
              <div>
                <span>异常实例</span>
                <strong>{incidentEvidence.anomalousInstanceId}</strong>
              </div>
              <div>
                <span>Endpoint 状态</span>
                <strong>{incidentEvidence.endpointState}</strong>
              </div>
            </div>
            <div className="evidence-callout">
              <strong>稳定 Endpoint 标识保留</strong>
              <p>
                {incidentEvidence.stableEndpoint || "尚未分配 Endpoint"}
              </p>
              <small>
                阻断后地址字符串不删除；入口策略模拟判定将拒绝访问。
              </small>
            </div>
            <ProgressTimeline
              label="一键隔离七项动作"
              items={incidentEvidence.actions.map((action, index) => ({
                id: action.key,
                title: action.label,
                description: action.auditEventId
                  ? `证据 ${action.auditEventId} · ${action.correlationId}`
                  : index === 0 && selectedIncident.status === "Open"
                    ? "等待启动"
                    : "等待前置动作",
                status: action.complete
                  ? "complete"
                  : index ===
                      incidentEvidence.actions.findIndex(
                        (candidate) => !candidate.complete,
                      )
                    ? "current"
                    : "upcoming",
              }))}
            />
            {incidentEvidence.actions.some(
              (action) => action.correlationId,
            ) ? (
              <ul className="incident-audit-links">
                {incidentEvidence.actions
                  .filter((action) => action.correlationId)
                  .map((action) => (
                    <li key={action.key}>
                      <span>{action.label}</span>
                      <a
                        href={`/audit?correlation=${encodeURIComponent(
                          action.correlationId ?? "",
                        )}`}
                      >
                        {action.correlationId}
                      </a>
                    </li>
                  ))}
              </ul>
            ) : null}
            <div className="incident-boundary-note">
              <strong>影响边界</strong>
              <p>
                仅异常实例进入摘流与停止；同环境其他 Ready 实例不被批量停止。不可变替换只提交请求，不原地修补实例。
              </p>
            </div>
            {selectedIncident.status === "Open" ? (
              <button
                type="button"
                className="button button--danger"
                onClick={() => advanceIsolation(selectedIncident.id)}
              >
                执行一键隔离
              </button>
            ) : (
              <StatusBadge
                tone={
                  selectedIncident.status === "Contained"
                    ? "success"
                    : "info"
                }
              >
                {selectedIncident.status === "Contained"
                  ? "七项处置已完成"
                  : "隔离编排进行中"}
              </StatusBadge>
            )}
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
