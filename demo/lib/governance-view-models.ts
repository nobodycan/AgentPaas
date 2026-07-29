import { isolationStateAt } from "./demo-engine.ts";
import { filterAuditEventsByCorrelation } from "./runtime-view-models.ts";
import type {
  AccessRequestSnapshot,
  ApplicationLog,
  AuditEvent,
  AuditKind,
  DemoState,
  Profile,
} from "./types.ts";

export interface AccessAuditMetadata {
  method: string;
  path: string;
  bodyBytes: number;
  bodyPresent: "true" | "false";
  contentCaptured: "false";
  sessionHeaderName: string;
  sessionTokenId: string;
}

export const PRODUCTION_SESSION_TOKENIZATION_NOTE =
  "演示令牌仅按 Request ID 合成；生产应由审计服务端使用 HMAC 或令牌化服务生成不可枚举标识。";

export interface AccessAuditContext {
  requestId: string;
}

function normalizedRequestId(requestId: string): string {
  return encodeURIComponent(requestId.trim() || "unavailable");
}

export function createSyntheticSessionToken(requestId: string): string {
  return `demo-session:${normalizedRequestId(requestId)}`;
}

export function createAccessAuditMetadata(
  request: Omit<AccessRequestSnapshot, "sessionKey">,
  context: AccessAuditContext,
): AccessAuditMetadata {
  return {
    method: request.method,
    path: request.path,
    bodyBytes: new TextEncoder().encode(request.body).byteLength,
    bodyPresent: request.body.length > 0 ? "true" : "false",
    contentCaptured: "false",
    sessionHeaderName: request.sessionHeaderName,
    sessionTokenId: createSyntheticSessionToken(context.requestId),
  };
}

export function syntheticAccessActor(requestId: string): string {
  return `access-client:${normalizedRequestId(requestId)}`;
}

const COMMON_AUDIT_FIELDS = [
  "requestId",
  "operationId",
  "taskId",
  "environmentId",
  "status",
  "result",
] as const;

const AUDIT_DETAIL_ALLOWLIST: Readonly<
  Record<AuditKind, ReadonlySet<string>>
> = {
  CONTROL_PLANE: new Set([
    ...COMMON_AUDIT_FIELDS,
    "revisionId",
    "failedRevisionId",
    "stableRevisionId",
    "stage",
    "reason",
  ]),
  ACCESS: new Set([
    ...COMMON_AUDIT_FIELDS,
    "instanceId",
    "policyId",
    "destination",
    "reason",
    "method",
    "path",
    "decision",
    "bodyBytes",
    "bodyPresent",
    "contentCaptured",
    "sessionHeaderName",
    "sessionTokenId",
  ]),
  SECURITY: new Set([
    ...COMMON_AUDIT_FIELDS,
    "incidentId",
    "instanceId",
    "policyId",
    "destination",
    "decision",
    "reason",
    "stage",
  ]),
  RUNTIME: new Set([
    ...COMMON_AUDIT_FIELDS,
    "instanceId",
    "replacementInstanceId",
    "revisionId",
    "stage",
    "reason",
  ]),
};

export function sanitizeAuditDetails(
  kind: AuditKind,
  details: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const allowed = AUDIT_DETAIL_ALLOWLIST[kind];
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => allowed.has(key)),
  );
}

export function auditDetailsForDisplay(
  event: Pick<AuditEvent, "kind" | "details">,
): Readonly<Record<string, string>> {
  return sanitizeAuditDetails(event.kind, event.details);
}

export function sanitizeAuditEvent(event: AuditEvent): AuditEvent {
  const details = sanitizeAuditDetails(event.kind, event.details);
  if (event.kind !== "ACCESS") {
    return {
      ...event,
      details,
    };
  }

  const requestId = details.requestId ?? event.id;
  return {
    ...event,
    actor: syntheticAccessActor(requestId),
    details: {
      ...details,
      bodyBytes: details.bodyBytes ?? "unknown",
      bodyPresent: details.bodyPresent ?? "unknown",
      contentCaptured: "false",
      sessionTokenId:
        details.sessionTokenId ?? createSyntheticSessionToken(requestId),
    },
  };
}

export function sanitizeAuditEvents(
  events: readonly AuditEvent[],
): AuditEvent[] {
  return events.map(sanitizeAuditEvent);
}

export type AuditCenterCategory =
  | "operations"
  | "access"
  | "security"
  | "runtime";

export type GovernanceTimeRange = "24h" | "7d" | "all";

export interface AuditCenterFilters {
  category: AuditCenterCategory;
  timeRange: GovernanceTimeRange;
  actor: string;
  environmentId: string;
  result: string;
  correlation: string;
}

const CATEGORY_KIND: Readonly<Record<AuditCenterCategory, AuditKind>> = {
  operations: "CONTROL_PLANE",
  access: "ACCESS",
  security: "SECURITY",
  runtime: "RUNTIME",
};

function filterByTime<T extends { occurredAt: string }>(
  rows: readonly T[],
  timeRange: GovernanceTimeRange,
): T[] {
  if (timeRange === "all" || rows.length === 0) {
    return [...rows];
  }

  const latest = Math.max(
    ...rows.map((row) => Date.parse(row.occurredAt)).filter(Number.isFinite),
  );
  if (!Number.isFinite(latest)) {
    return [...rows];
  }

  const duration =
    timeRange === "24h" ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
  return rows.filter((row) => Date.parse(row.occurredAt) >= latest - duration);
}

export function filterAuditCenterEvents(
  events: readonly AuditEvent[],
  filters: AuditCenterFilters,
): AuditEvent[] {
  const correlation = filters.correlation.trim();
  const timeRows = filterByTime(events, filters.timeRange);
  const correlationRows = correlation
    ? filterAuditEventsByCorrelation(timeRows, correlation)
    : timeRows;
  const actor = filters.actor.trim();
  const environmentId = filters.environmentId.trim();
  const result = filters.result.trim();

  return correlationRows
    .filter((event) =>
      filters.category === "operations"
        ? event.kind === "CONTROL_PLANE" || event.kind === "RUNTIME"
        : event.kind === CATEGORY_KIND[filters.category],
    )
    .filter((event) => !actor || event.actor === actor)
    .filter(
      (event) =>
        !environmentId ||
        event.details.environmentId === environmentId ||
        event.targetId === environmentId,
    )
    .filter(
      (event) =>
        !result ||
        event.details.decision === result ||
        (result === "FAILED" && event.type.includes("FAILED")) ||
        (result === "SUCCESS" &&
          !event.type.includes("FAILED") &&
          !event.type.includes("DENIED") &&
          !["DENY", "FAILED"].includes(event.details.decision ?? "")),
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export interface ApplicationLogFilters {
  timeRange: GovernanceTimeRange;
  level: ApplicationLog["level"] | "";
  environmentId: string;
  instanceId: string;
  query: string;
}

export function filterApplicationLogs(
  logs: readonly ApplicationLog[],
  filters: ApplicationLogFilters,
): ApplicationLog[] {
  const query = filters.query.trim().toLocaleLowerCase("zh-CN");
  return filterByTime(logs, filters.timeRange)
    .filter((log) => !filters.level || log.level === filters.level)
    .filter(
      (log) =>
        !filters.environmentId ||
        log.environmentId === filters.environmentId,
    )
    .filter(
      (log) => !filters.instanceId || log.instanceId === filters.instanceId,
    )
    .filter(
      (log) =>
        !query ||
        [log.message, log.traceId].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(query),
        ),
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export interface SecurityPostureItem {
  status: string;
  evidence: string;
}

export interface SecurityPosture {
  ingress: SecurityPostureItem;
  egress: SecurityPostureItem;
  workloadIdentity: SecurityPostureItem;
  audit: SecurityPostureItem;
  modelCredential: SecurityPostureItem;
  secureTask: SecurityPostureItem;
  guardrail: SecurityPostureItem;
  runtimeLimitation: string;
}

export function deriveSecurityPosture(
  state: DemoState,
  environmentId: string,
): SecurityPosture {
  const environment = state.environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const bound = (profileId: string | undefined): SecurityPostureItem => ({
    status: profileId ? "已绑定" : "未绑定",
    evidence: profileId ?? "未配置 Profile",
  });

  return {
    ingress: bound(environment?.ingressProfileId),
    egress: bound(environment?.egressProfileId),
    workloadIdentity: bound(environment?.identityProfileId),
    audit: bound(environment?.loggingProfileId),
    modelCredential: {
      status: "模型网关代持",
      evidence: "模型供应商 API Key 由模型网关持有，不进入 Agent 运行实例。",
    },
    secureTask: environment?.secureTaskProfileId
      ? {
          status: "已绑定",
          evidence: `${environment.secureTaskProfileId} · 仅用于委托的分钟/数小时短任务`,
        }
      : {
          status: "未绑定",
          evidence: "可选能力；仅用于委托的分钟/数小时短任务。",
        },
    guardrail: {
      status: "未配置",
      evidence: "当前未接入受控内容网关，不宣称已具备提示词攻击防护。",
    },
    runtimeLimitation:
      "运行时隔离可缩小横向影响面，但不承诺保护进程已获凭据；应优先避免凭据进入 Agent。",
  };
}

export type PlacementRisk = "Low" | "Medium" | "High";

export interface ResourcePoolRow {
  id: string;
  name: string;
  region: string;
  status: string;
  kubernetesVersion: string;
  cpu: { used: number; total: number };
  memory: { used: number; total: number };
  environmentCount: number;
  instanceCount: number;
  placementRisk: PlacementRisk;
  riskReason: string;
}

export function deriveResourcePoolRows(
  state: DemoState,
): ResourcePoolRow[] {
  return state.clusters.map((cluster) => {
    const instances = state.instances.filter(
      (instance) => instance.clusterId === cluster.id,
    );
    const environmentCount = new Set(
      instances.map((instance) => instance.environmentId),
    ).size;
    const memoryUtilization =
      cluster.memoryTotalGiB === 0
        ? 1
        : cluster.memoryUsedGiB / cluster.memoryTotalGiB;
    const cpuUtilization =
      cluster.cpuTotal === 0 ? 1 : cluster.cpuUsed / cluster.cpuTotal;
    const placementRisk: PlacementRisk =
      cluster.status !== "Healthy" ||
      memoryUtilization >= 0.9 ||
      cpuUtilization >= 0.9
        ? "High"
        : memoryUtilization >= 0.75 ||
            cpuUtilization >= 0.75 ||
            cluster.readyCapacity / cluster.totalCapacity < 0.8
          ? "Medium"
          : "Low";
    const riskReason =
      cluster.status !== "Healthy"
        ? "集群健康异常，暂停新增高风险工作负载"
        : placementRisk === "High"
          ? "容量接近阈值，建议跨池调度"
          : placementRisk === "Medium"
            ? "容量进入关注区间"
            : "容量与健康状态正常";

    return {
      id: cluster.id,
      name: cluster.name,
      region: cluster.region,
      status: cluster.status,
      kubernetesVersion: cluster.kubernetesVersion,
      cpu: { used: cluster.cpuUsed, total: cluster.cpuTotal },
      memory: {
        used: cluster.memoryUsedGiB,
        total: cluster.memoryTotalGiB,
      },
      environmentCount,
      instanceCount: instances.length,
      placementRisk,
      riskReason,
    };
  });
}

export interface ProfileUsage {
  profile?: Profile;
  environmentIds: string[];
  readOnly: true;
}

const PROFILE_FIELDS = [
  "runtimePlanId",
  "ingressProfileId",
  "egressProfileId",
  "secureTaskProfileId",
  "identityProfileId",
  "loggingProfileId",
  "domainProfileId",
] as const;

export function deriveProfileUsage(
  state: DemoState,
  profileId: string,
): ProfileUsage {
  return {
    profile: state.profiles.find((profile) => profile.id === profileId),
    environmentIds: state.environments
      .filter((environment) =>
        PROFILE_FIELDS.some((field) => environment[field] === profileId),
      )
      .map((environment) => environment.id)
      .sort(),
    readOnly: true,
  };
}

const INCIDENT_ACTIONS = [
  {
    key: "lb-drain",
    stage: "LoadBalancerDrained",
    label: "LB 摘流",
  },
  {
    key: "endpoint-block",
    stage: "EndpointBlocked",
    label: "Endpoint 阻断",
  },
  {
    key: "egress-deny",
    stage: "EgressDenied",
    label: "Egress 拒绝",
  },
  {
    key: "workload-identity-revoke",
    stage: "WorkloadIdentityRevoked",
    label: "工作负载身份撤销",
  },
  {
    key: "model-identity-revoke",
    stage: "ModelIdentityRevoked",
    label: "模型身份撤销",
  },
  {
    key: "anomalous-instance-stop",
    stage: "AnomalousInstanceStopped",
    label: "异常实例停止",
  },
  {
    key: "immutable-replacement-request",
    stage: "ImmutableReplacementRequested",
    label: "不可变替换请求",
  },
] as const;

export interface IncidentActionEvidence {
  key: (typeof INCIDENT_ACTIONS)[number]["key"];
  label: string;
  complete: boolean;
  auditEventId?: string;
  correlationId?: string;
}

export interface IncidentEvidence {
  incidentId: string;
  environmentId: string;
  anomalousInstanceId: string;
  stableEndpoint: string;
  endpointState: string;
  actions: IncidentActionEvidence[];
}

export function deriveIncidentEvidence(
  state: DemoState,
  incidentId: string,
): IncidentEvidence {
  const incident = state.securityIncidents.find(
    (candidate) => candidate.id === incidentId,
  );
  const environment = state.environments.find(
    (candidate) => candidate.id === incident?.environmentId,
  );
  const step = state.isolationSteps[incidentId] ?? 0;
  const snapshot = isolationStateAt(step);

  return {
    incidentId,
    environmentId: incident?.environmentId ?? "",
    anomalousInstanceId: incident?.context?.instanceId ?? "未识别",
    stableEndpoint: environment?.endpoint ?? "",
    endpointState: snapshot.endpointState,
    actions: INCIDENT_ACTIONS.map((action, index) => {
      const auditEvent = state.auditEvents.find(
        (event) =>
          event.type === "ISOLATION_ACTION" &&
          event.details.incidentId === incidentId &&
          event.details.stage === action.stage,
      );
      return {
        key: action.key,
        label: action.label,
        complete: step >= index + 1,
        auditEventId: auditEvent?.id,
        correlationId: auditEvent?.details.requestId,
      };
    }),
  };
}
