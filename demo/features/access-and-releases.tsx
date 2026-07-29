"use client";

import React, {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  ConfirmModal,
  StatusBadge,
} from "../components/ui";
import { copyEndpoint } from "../lib/clipboard";
import { useDemo } from "../lib/demo-store";
import {
  createAccessRequestSnapshot,
  createAccessResponsePlan,
  createAccessStreamState,
  reduceAccessStream,
  revisionDiff,
} from "../lib/runtime-view-models";
import type { AccessResult } from "../lib/types";
import { resolveImageDigest } from "../lib/view-models";

type TimerHandle = ReturnType<typeof setTimeout>;

function toneForStatus(
  status: string,
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (
    status === "Stable" ||
    status === "Ready" ||
    status === "Completed"
  ) {
    return "success";
  }
  if (status === "Deploying" || status === "streaming") {
    return "info";
  }
  if (status === "Failed" || status === "cancelled") {
    return "danger";
  }
  if (status === "RolledBack") {
    return "warning";
  }
  return "neutral";
}

export function AccessTestPanel({
  environmentId,
}: {
  environmentId: string;
}): React.ReactElement {
  const {
    auditEvents,
    environments,
    instances,
    revisions,
    runAccessTest,
  } = useDemo();
  const environment = environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState("/v1/chat/completions");
  const [body, setBody] = useState(
    '{\n  "message": "请查询我的订单状态"\n}',
  );
  const [sessionHeader, setSessionHeader] = useState(
    environment?.sessionHeader ?? "X-Agent-Session-ID",
  );
  const [sessionValue, setSessionValue] = useState("demo-user-1024");
  const [stream, dispatch] = useReducer(
    reduceAccessStream,
    undefined,
    createAccessStreamState,
  );
  const [lastResult, setLastResult] = useState<AccessResult | null>(null);
  const [history, setHistory] = useState<AccessResult[]>([]);
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const timersRef = useRef<Set<TimerHandle>>(new Set());
  const streamOrdinalRef = useRef(0);

  const clearTokenTimers = () => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  };

  useEffect(
    () => () => {
      clearTokenTimers();
    },
    [],
  );

  const matchingAudit = lastResult
    ? auditEvents.find((event) => event.id === lastResult.auditEventId)
    : undefined;
  const requestId = matchingAudit?.details.requestId ?? "";
  const selectedInstance = lastResult?.instanceId
    ? instances.find((instance) => instance.id === lastResult.instanceId)
    : undefined;
  const selectedRevision = selectedInstance
    ? revisions.find((revision) => revision.id === selectedInstance.revisionId)
    : undefined;
  const affinitySessionKey = lastResult?.sessionKey ?? sessionValue;
  const latestSameSession = history.filter(
    (result) =>
      result.sessionKey === affinitySessionKey && result.allowed,
  );
  const repeatedAffinity =
    latestSameSession.length >= 2
      ? latestSameSession.at(-1)?.instanceId ===
        latestSameSession.at(-2)?.instanceId
      : undefined;

  const handleCancel = () => {
    clearTokenTimers();
    const currentStreamId = stream.streamId;
    if (currentStreamId) {
      dispatch({ type: "cancel", streamId: currentStreamId });
    }
  };

  const handleSend = () => {
    handleCancel();
    setCopyState("idle");
    const submittedRequest = createAccessRequestSnapshot({
      method,
      path,
      body,
      sessionHeaderName: sessionHeader,
      sessionKey: sessionValue,
    });
    const result = runAccessTest(
      environmentId,
      submittedRequest.sessionKey,
      submittedRequest.path,
      submittedRequest,
    );
    setLastResult(result);
    streamOrdinalRef.current += 1;
    const streamId = `access-stream-${streamOrdinalRef.current}`;
    dispatch({
      type: "start",
      streamId,
      requestId: result.requestId,
    });

    const responsePlan = createAccessResponsePlan(result);
    if (!result.allowed) {
      dispatch({ type: "complete", streamId });
      return;
    }
    setHistory((current) => [...current.slice(-3), result]);
    responsePlan.tokens.forEach((token, index) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        dispatch({ type: "append", streamId, token });
      }, (index + 1) * 150);
      timersRef.current.add(timer);
    });
    const completeTimer = setTimeout(() => {
      timersRef.current.delete(completeTimer);
      dispatch({ type: "complete", streamId });
    }, (responsePlan.tokens.length + 1) * 150);
    timersRef.current.add(completeTimer);
  };

  const handleCopyRequestId = async () => {
    if (!requestId) {
      return;
    }
    const copied = await copyEndpoint(requestId);
    setCopyState(copied ? "copied" : "failed");
  };

  const liveStatus =
    lastResult && !lastResult.allowed
      ? `入口策略模拟判定拒绝：${lastResult.reason}；未启动 SSE`
      : stream.status === "streaming"
      ? "SSE 响应正在逐 Token 返回"
      : stream.status === "cancelled"
        ? "请求已取消；已返回内容和 Request ID 均已保留"
        : stream.status === "completed"
          ? "SSE 响应已完成"
          : "尚未发送测试请求";

  return (
    <div className="runtime-stack">
      <section className="content-card">
        <div className="content-card__header runtime-card-heading">
          <div>
            <p className="eyebrow">入口策略模拟判定</p>
            <h2>访问测试与允许后的 SSE 响应</h2>
            <p>
              本地规则模拟 IngressProfile 判定；仅在 ALLOW 后使用会话头
              对 Ready 实例做尽力亲和。平台不会创建或持久化 Session
              资源。
            </p>
          </div>
          <StatusBadge
            tone={
              lastResult && !lastResult.allowed
                ? "danger"
                : stream.status === "completed"
                ? "success"
                : stream.status === "cancelled"
                  ? "warning"
                  : stream.status === "streaming"
                    ? "info"
                    : "neutral"
            }
          >
            {lastResult && !lastResult.allowed
              ? "DENY"
              : stream.status === "idle"
                ? "Idle"
                : stream.status}
          </StatusBadge>
        </div>

        <div className="access-request-grid">
          <label className="form-field">
            <span>Method</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option>POST</option>
              <option>GET</option>
            </select>
          </label>
          <label className="form-field access-path-field">
            <span>Path</span>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Session Header</span>
            <input
              value={sessionHeader}
              onChange={(event) => setSessionHeader(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Header Value</span>
            <input
              value={sessionValue}
              onChange={(event) => setSessionValue(event.target.value)}
            />
          </label>
          <label className="form-field form-field--wide">
            <span>Request Body</span>
            <textarea
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={method === "GET"}
            />
          </label>
        </div>
        <div className="runtime-actions">
          <span>
            {lastResult
              ? `${lastResult.request.method} ${lastResult.request.path} · ${lastResult.request.sessionHeaderName}: ${lastResult.request.sessionKey}`
              : `${method} ${path} · 尚未提交`}
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={handleCancel}
            disabled={stream.status !== "streaming"}
          >
            取消
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleSend}
          >
            {stream.status === "streaming" ? "取消并重发" : "发送请求"}
          </button>
        </div>
        <p className="runtime-live-status" role="status" aria-live="polite">
          {liveStatus}
        </p>
      </section>

      <section className="content-card access-response-card">
        <div className="runtime-card-heading">
          <div>
            <p className="eyebrow">text/event-stream</p>
            <h2>流式输出</h2>
          </div>
          {lastResult ? (
            <StatusBadge tone={lastResult.allowed ? "success" : "danger"}>
              {lastResult.allowed ? "ALLOW" : "DENY"}
            </StatusBadge>
          ) : null}
        </div>
        <pre
          className="sse-output"
          aria-label="SSE 响应内容"
          aria-live="polite"
        >
          {stream.output ||
            (lastResult && !lastResult.allowed
              ? `未启动 SSE：${lastResult.reason}`
              : "等待响应…")}
        </pre>

        {lastResult ? (
          <dl className="evidence-grid">
            <div>
              <dt>Request ID</dt>
              <dd>{requestId || "正在写入匹配的审计事件…"}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{selectedRevision?.id ?? "未路由"}</dd>
            </div>
            <div>
              <dt>实例</dt>
              <dd>{lastResult.instanceId ?? "无 Ready 实例"}</dd>
            </div>
            <div>
              <dt>入口策略模拟判定</dt>
              <dd>
                {lastResult.decision} · {lastResult.policyId}
                <br />
                {lastResult.reason}
              </dd>
            </div>
            <div>
              <dt>提交的请求</dt>
              <dd>
                {lastResult.request.method} {lastResult.request.path}
              </dd>
            </div>
            <div>
              <dt>提交的会话头</dt>
              <dd>
                {lastResult.request.sessionHeaderName}:{" "}
                {lastResult.request.sessionKey}
              </dd>
            </div>
            <div>
              <dt>提交的 Body</dt>
              <dd>{lastResult.request.body || "无请求体"}</dd>
            </div>
          </dl>
        ) : null}

        {latestSameSession.length >= 2 ? (
          <p className="affinity-evidence">
            同一会话最近两次映射：{latestSameSession.at(-2)?.instanceId} →{" "}
            {latestSameSession.at(-1)?.instanceId}（
            {repeatedAffinity ? "保持相同，尽力亲和生效" : "实例集合已变化"}
            ）
          </p>
        ) : (
          <p className="affinity-evidence">
            使用相同 Header Value 再次发送，可验证同一 Ready 实例的尽力亲和。
          </p>
        )}

        <div className="runtime-actions">
          <span aria-live="polite">
            {copyState === "copied"
              ? "Request ID 已复制"
              : copyState === "failed"
                ? "复制失败，请手动选择"
                : ""}
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => void handleCopyRequestId()}
            disabled={!requestId}
          >
            复制 Request ID
          </button>
          {requestId ? (
            <a
              className="button button--quiet"
              href={`/audit?correlation=${encodeURIComponent(requestId)}`}
            >
              查看关联审计
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function RevisionsPanel({
  environmentId,
}: {
  environmentId: string;
}): React.ReactElement {
  const {
    auditEvents,
    environments,
    revisions,
    rollback,
  } = useDemo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const environment = environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const environmentRevisions = useMemo(
    () =>
      revisions
        .filter((revision) => revision.environmentId === environmentId)
        .sort((left, right) => right.sequence - left.sequence),
    [environmentId, revisions],
  );
  const stable = environmentRevisions.find(
    (revision) => revision.status === "Stable",
  );
  const failed = environmentRevisions.find(
    (revision) =>
      revision.status === "Failed" ||
      revision.status === "RolledBack",
  );
  const diff = stable && failed ? revisionDiff(stable, failed) : null;
  const rollbackAudit = auditEvents.find(
    (event) =>
      event.type === "REVISION_ROLLBACK" &&
      event.details.environmentId === environmentId,
  );
  const rollbackComplete = Boolean(rollbackAudit);
  const rollbackDisabled =
    rollbackComplete || !stable || !failed || failed.status === "RolledBack";

  const handleRollback = () => {
    setSubmitted(true);
    rollback(environmentId);
  };

  return (
    <div className="runtime-stack">
      <section className="content-card">
        <div className="runtime-card-heading">
          <div>
            <p className="eyebrow">发布序列</p>
            <h2>版本与恢复</h2>
            <p>
              当前期望版本：{environment?.desiredRevisionId ?? "未知"}。
              回滚仅恢复到已验证的 Stable 版本。
            </p>
          </div>
          <button
            type="button"
            className="button button--danger"
            disabled={rollbackDisabled || submitted}
            onClick={() => setConfirmOpen(true)}
          >
            {rollbackComplete
              ? "已回滚"
              : submitted
                ? "回滚中…"
                : "回滚到 Stable"}
          </button>
        </div>

        <div className="release-stage-grid" aria-label="发布阶段统计">
          <article>
            <span>配置校验</span>
            <strong>{environmentRevisions.length}</strong>
            <small>版本已生成</small>
          </article>
          <article>
            <span>健康检查</span>
            <strong>
              {
                environmentRevisions.filter(
                  (revision) => revision.status === "Failed",
                ).length
              }
            </strong>
            <small>失败</small>
          </article>
          <article>
            <span>流量切换</span>
            <strong>
              {
                environmentRevisions.filter(
                  (revision) => revision.status === "Stable",
                ).length
              }
            </strong>
            <small>稳定版本</small>
          </article>
          <article>
            <span>恢复任务</span>
            <strong>{rollbackComplete ? 1 : 0}</strong>
            <small>已完成</small>
          </article>
        </div>

        {submitted || rollbackComplete ? (
          <p className="rollback-progress" role="status" aria-live="polite">
            {rollbackComplete
              ? `恢复完成：期望版本已稳定在 ${environment?.desiredRevisionId}，审计 ${rollbackAudit?.id} 已记录。`
              : "回滚任务已提交，正在恢复 Stable 版本并同步负载均衡后端。"}
          </p>
        ) : null}

        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">环境版本列表</caption>
            <thead>
              <tr>
                <th className="data-table__cell--start">序号</th>
                <th className="data-table__cell--start">镜像 / Digest</th>
                <th className="data-table__cell--center">状态</th>
                <th className="data-table__cell--start">创建者</th>
                <th className="data-table__cell--end">时间</th>
              </tr>
            </thead>
            <tbody>
              {environmentRevisions.map((revision) => (
                <tr key={revision.id}>
                  <td>#{revision.sequence}</td>
                  <td>
                    <div className="table-primary">
                      <strong>{revision.image}</strong>
                      <small>
                        {revision.imageDigest ??
                          resolveImageDigest(revision.image)}
                      </small>
                    </div>
                  </td>
                  <td className="data-table__cell--center">
                    <StatusBadge tone={toneForStatus(revision.status)}>
                      {revision.status}
                    </StatusBadge>
                  </td>
                  <td>{revision.createdBy}</td>
                  <td className="data-table__cell--end">
                    {revision.createdAt.replace("T", " ").slice(0, 19)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {diff ? (
        <section className="content-card">
          <div className="runtime-card-heading">
            <div>
              <p className="eyebrow">版本差异</p>
              <h2>
                {diff.fromRevisionId} → {diff.toRevisionId}
              </h2>
            </div>
            <StatusBadge tone="danger">发布失败</StatusBadge>
          </div>
          <p className="failure-reason">
            失败原因：{diff.failureReason ?? "未提供"}
          </p>
          <dl className="revision-diff">
            {diff.changes.map((change) => (
              <div key={change.field}>
                <dt>{change.label}</dt>
                <dd>
                  <span>{change.before}</span>
                  <span aria-hidden="true">→</span>
                  <strong>{change.after}</strong>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <ConfirmModal
        open={confirmOpen}
        title="确认回滚到 Stable 版本？"
        description={
          <p>
            将把环境期望版本从 {failed?.id ?? "失败版本"} 恢复为{" "}
            {stable?.id ?? "Stable 版本"}，并写入一条可关联的控制面审计事件。
          </p>
        }
        confirmLabel="确认回滚"
        cancelLabel="继续观察"
        tone="danger"
        onConfirm={handleRollback}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
