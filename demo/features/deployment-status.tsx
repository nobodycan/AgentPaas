"use client";

import React, {
  useState,
} from "react";

import { StatusBadge } from "../components/ui";
import { copyEndpoint } from "../lib/clipboard";
import { useDemo } from "../lib/demo-store";
import { DEPLOYMENT_STAGE_COPY } from "../lib/view-models";

export interface DeploymentStatusPanelProps {
  environmentId: string;
  onNavigate(destination: string): void;
}

type CopyState = "idle" | "copied" | "failed";

export function DeploymentStatusPanel({
  environmentId,
  onNavigate,
}: DeploymentStatusPanelProps): React.ReactElement | null {
  const {
    environments,
    deploymentSteps,
    advanceDeployment,
  } = useDemo();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const environment = environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const recordedStep = deploymentSteps[environmentId];

  if (!environment || recordedStep === undefined) {
    return null;
  }

  const currentStep = Math.max(
    0,
    Math.min(DEPLOYMENT_STAGE_COPY.length - 1, recordedStep),
  );
  const ready =
    currentStep === DEPLOYMENT_STAGE_COPY.length - 1 &&
    environment.status === "Running" &&
    Boolean(environment.endpoint);
  const progress = Math.round(
    ((currentStep + 1) / DEPLOYMENT_STAGE_COPY.length) * 100,
  );

  const handleCopyEndpoint = async () => {
    const copied = await copyEndpoint(environment.endpoint);
    setCopyState(copied ? "copied" : "failed");
  };

  return (
    <section
      className="content-card deployment-panel"
      aria-labelledby="deployment-status-title"
      aria-live="polite"
    >
      <div className="content-card__header">
        <div>
          <p className="eyebrow">
            {ready ? "部署完成" : "确定性部署进行中"}
          </p>
          <h2 id="deployment-status-title">
            {ready
              ? "HTTPS Endpoint Ready"
              : DEPLOYMENT_STAGE_COPY[currentStep]}
          </h2>
          <p>
            {ready
              ? "实例、健康检查和负载均衡注册均已通过。"
              : `控制面正在执行第 ${currentStep + 1} / ${
                  DEPLOYMENT_STAGE_COPY.length
                } 个阶段。`}
          </p>
        </div>
        <StatusBadge tone={ready ? "success" : "info"}>
          {ready ? "Ready" : `${progress}%`}
        </StatusBadge>
      </div>

      <div
        className="deployment-progress"
        role="progressbar"
        aria-label="部署进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <ol className="deployment-stages">
        {DEPLOYMENT_STAGE_COPY.map((label, index) => {
          const isComplete = ready || index < currentStep;
          const isCurrent = !ready && index === currentStep;
          return (
            <li
              key={label}
              className={
                isComplete
                  ? "deployment-stages__item deployment-stages__item--complete"
                  : isCurrent
                    ? "deployment-stages__item deployment-stages__item--current"
                    : "deployment-stages__item"
              }
              aria-current={isCurrent ? "step" : undefined}
            >
              <span aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      {ready ? (
        <div className="endpoint-ready">
          <div>
            <span>HTTPS Endpoint</span>
            <a
              href={environment.endpoint}
              target="_blank"
              rel="noreferrer"
            >
              {environment.endpoint}
            </a>
            {copyState === "failed" ? (
              <small role="status">请手动复制上方 Endpoint</small>
            ) : null}
          </div>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => void handleCopyEndpoint()}
          >
            {copyState === "copied"
              ? "已复制"
              : copyState === "failed"
                ? "复制失败"
                : "复制 Endpoint"}
          </button>
          <a
            className="button button--primary"
            href={`/environments/${encodeURIComponent(
              environmentId,
            )}/access`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(
                `/environments/${encodeURIComponent(
                  environmentId,
                )}/access`,
              );
            }}
          >
            测试调用
          </a>
        </div>
      ) : (
        <div className="deployment-panel__actions">
          <span>演示进度会按固定节奏自动推进。</span>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => advanceDeployment(environmentId, 7)}
          >
            跳过动画
          </button>
        </div>
      )}
    </section>
  );
}
