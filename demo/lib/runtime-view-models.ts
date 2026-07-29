import { resolveImageDigest } from "./view-models.ts";
import type {
  AccessRequestSnapshot,
  AccessResult,
  AuditEvent,
  Environment,
  Revision,
} from "./types.ts";

export const ACCESS_RESPONSE_TOKENS = [
  "您好，",
  "我是客户服务 Agent。",
  "当前请求已通过入口策略，",
  "并由同一会话尽力亲和到 Ready 实例。",
] as const;

export function createAccessRequestSnapshot(
  input: AccessRequestSnapshot,
): AccessRequestSnapshot {
  const method = input.method.trim().toUpperCase() || "POST";
  return {
    method,
    path: input.path.trim() || "/",
    body: method === "GET" ? "" : input.body,
    sessionHeaderName:
      input.sessionHeaderName.trim() || "X-Agent-Session-ID",
    sessionKey: input.sessionKey.trim(),
  };
}

export interface AccessPolicyDecision {
  allowed: boolean;
  decision: "ALLOW" | "DENY";
  reason: string;
  policyId: string;
}

function deniedAccess(
  reason: string,
  policyId: string,
): AccessPolicyDecision {
  return {
    allowed: false,
    decision: "DENY",
    reason,
    policyId,
  };
}

export function evaluateAccessRequest(
  environment: Environment | undefined,
  request: AccessRequestSnapshot,
  hasReadyInstance: boolean,
): AccessPolicyDecision {
  if (!environment) {
    return deniedAccess("运行环境不存在", "unconfigured-ingress");
  }

  const policyId =
    environment.ingressProfileId.trim() || "unconfigured-ingress";
  if (environment.status === "Isolated") {
    return deniedAccess("环境已隔离，稳定 Endpoint 当前处于阻断状态", policyId);
  }
  if (environment.status !== "Running") {
    return deniedAccess("环境状态不是 Running", policyId);
  }
  if (!environment.ingressProfileId.trim()) {
    return deniedAccess("未绑定 IngressProfile", policyId);
  }
  if (request.method !== "POST") {
    return deniedAccess("入口仅支持 POST", policyId);
  }
  if (request.path !== "/v1/chat/completions") {
    return deniedAccess(
      "路径必须为 /v1/chat/completions",
      policyId,
    );
  }
  if (
    !environment.sessionHeader ||
    request.sessionHeaderName !== environment.sessionHeader
  ) {
    return deniedAccess(
      `Session Header 必须为 ${
        environment.sessionHeader ?? "环境已配置的名称"
      }`,
      policyId,
    );
  }
  if (!request.body.trim()) {
    return deniedAccess("请求 Body 不能为空", policyId);
  }
  try {
    JSON.parse(request.body);
  } catch {
    return deniedAccess("请求 Body 必须是有效 JSON", policyId);
  }
  if (!hasReadyInstance) {
    return deniedAccess("当前没有 Ready 实例", policyId);
  }

  return {
    allowed: true,
    decision: "ALLOW",
    reason: "入口策略模拟判定通过",
    policyId,
  };
}

export function filterAuditEventsByCorrelation(
  events: readonly AuditEvent[],
  correlation: string,
): AuditEvent[] {
  const expected = correlation.trim();
  if (!expected) {
    return [];
  }

  return events.filter((event) =>
    [
      event.details.requestId,
      event.details.operationId,
      event.details.taskId,
    ].some((value) => value === expected),
  );
}

export function runtimePanelKey(
  panel: "access" | "revisions",
  environmentId: string,
  generation: number,
): string {
  return `${panel}:${environmentId}:generation-${generation}`;
}

export interface SecurityProfileEvidence {
  kind: string;
  profileId: string;
  status: string;
  active: boolean;
}

function requiredProfileEvidence(
  kind: string,
  profileId: string | undefined,
): SecurityProfileEvidence {
  const active = Boolean(profileId);
  return {
    kind,
    profileId: profileId ?? "未绑定",
    status: active ? "已绑定" : "未绑定",
    active,
  };
}

function optionalProfileEvidence(
  kind: string,
  profileId: string | undefined,
): SecurityProfileEvidence {
  const active = Boolean(profileId);
  return {
    kind,
    profileId: profileId ?? "未绑定",
    status: active ? "可选 · 已绑定" : "可选 · 未绑定",
    active,
  };
}

export function securityProfileEvidence(
  environment: Environment,
): SecurityProfileEvidence[] {
  return [
    requiredProfileEvidence(
      "RuntimeBaseline",
      environment.runtimePlanId,
    ),
    requiredProfileEvidence(
      "IngressProfile",
      environment.ingressProfileId,
    ),
    requiredProfileEvidence(
      "EgressProfile",
      environment.egressProfileId,
    ),
    optionalProfileEvidence(
      "SecureTaskProfile",
      environment.secureTaskProfileId,
    ),
    requiredProfileEvidence(
      "IdentityProfile",
      environment.identityProfileId,
    ),
    requiredProfileEvidence(
      "LoggingProfile",
      environment.loggingProfileId,
    ),
    optionalProfileEvidence(
      "DomainProfile",
      environment.domainProfileId,
    ),
  ];
}

export interface AccessResponsePlan {
  contentType: "text/event-stream";
  tokens: readonly string[];
}

export function createAccessResponsePlan(
  access: AccessResult,
): AccessResponsePlan {
  return {
    contentType: "text/event-stream",
    tokens: access.allowed ? ACCESS_RESPONSE_TOKENS : [],
  };
}

export type AccessStreamStatus =
  | "idle"
  | "streaming"
  | "cancelled"
  | "completed";

export interface AccessStreamState {
  streamId: string | null;
  requestId: string;
  output: string;
  status: AccessStreamStatus;
}

export type AccessStreamAction =
  | {
      type: "start";
      streamId: string;
      requestId: string;
    }
  | {
      type: "append";
      streamId: string;
      token: string;
    }
  | {
      type: "cancel";
      streamId: string;
    }
  | {
      type: "complete";
      streamId: string;
    };

export function createAccessStreamState(): AccessStreamState {
  return {
    streamId: null,
    requestId: "",
    output: "",
    status: "idle",
  };
}

export function reduceAccessStream(
  state: AccessStreamState,
  action: AccessStreamAction,
): AccessStreamState {
  if (action.type === "start") {
    return {
      streamId: action.streamId,
      requestId: action.requestId,
      output: "",
      status: "streaming",
    };
  }

  if (
    action.streamId !== state.streamId ||
    state.status !== "streaming"
  ) {
    return state;
  }

  if (action.type === "append") {
    return {
      ...state,
      output: `${state.output}${action.token}`,
    };
  }

  return {
    ...state,
    status: action.type === "cancel" ? "cancelled" : "completed",
  };
}

export type RevisionDiffField =
  | "image"
  | "digest"
  | "status"
  | "runtimePlan"
  | "ingress"
  | "egress";

export interface RevisionChange {
  field: RevisionDiffField;
  label: string;
  before: string;
  after: string;
}

export interface RevisionDiff {
  fromRevisionId: string;
  toRevisionId: string;
  failureReason?: string;
  changes: RevisionChange[];
}

function revisionValue(
  revision: Revision,
  field: RevisionDiffField,
): string {
  switch (field) {
    case "image":
      return revision.image;
    case "digest":
      return revision.imageDigest ?? resolveImageDigest(revision.image);
    case "status":
      return revision.status;
    case "runtimePlan":
      return revision.runtimePlanId ?? "未记录";
    case "ingress":
      return revision.ingressProfileId ?? "未记录";
    case "egress":
      return revision.egressProfileId ?? "未记录";
  }
}

const REVISION_CHANGE_LABELS: Readonly<
  Record<RevisionDiffField, string>
> = {
  image: "镜像标签",
  digest: "镜像 Digest",
  status: "发布状态",
  runtimePlan: "运行规格",
  ingress: "入口策略",
  egress: "出口策略",
};

export function revisionDiff(
  from: Revision,
  to: Revision,
): RevisionDiff {
  const fields: readonly RevisionDiffField[] = [
    "image",
    "digest",
    "status",
    "runtimePlan",
    "ingress",
    "egress",
  ];

  return {
    fromRevisionId: from.id,
    toRevisionId: to.id,
    failureReason:
      to.failureReason ??
      (to.status === "Failed"
        ? "就绪探针未在发布窗口内通过。"
        : undefined),
    changes: fields.flatMap((field) => {
      const before = revisionValue(from, field);
      const after = revisionValue(to, field);
      return before === after
        ? []
        : [
            {
              field,
              label: REVISION_CHANGE_LABELS[field],
              before,
              after,
            },
          ];
    }),
  };
}
