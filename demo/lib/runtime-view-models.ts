import { resolveImageDigest } from "./view-models.ts";
import type {
  AccessRequestSnapshot,
  AccessResult,
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
    sessionHeader:
      input.sessionHeader.trim() || "X-Agent-Session-ID",
    sessionValue: input.sessionValue.trim(),
  };
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
    tokens: access.allowed
      ? ACCESS_RESPONSE_TOKENS
      : ["请求被拒绝：当前没有可用的 Ready 实例。"],
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
