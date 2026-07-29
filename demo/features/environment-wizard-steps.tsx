"use client";

import React from "react";

import {
  resolveImageDigest,
} from "../lib/view-models";
import type {
  EnvironmentWizardInput,
  WizardValidationErrors,
} from "../lib/view-models";

export interface WizardStepBodyProps {
  input: EnvironmentWizardInput;
  errors: WizardValidationErrors;
  onChange<Key extends keyof EnvironmentWizardInput>(
    field: Key,
    value: EnvironmentWizardInput[Key],
  ): void;
}

function fieldErrorId(field: keyof EnvironmentWizardInput): string {
  return `environment-wizard-${field}-error`;
}

function describedBy(
  errors: WizardValidationErrors,
  field: keyof EnvironmentWizardInput,
): string | undefined {
  return errors[field] ? fieldErrorId(field) : undefined;
}

function FieldError({
  field,
  error,
}: {
  field: keyof EnvironmentWizardInput;
  error?: string;
}): React.ReactElement | null {
  return error ? (
    <span
      id={fieldErrorId(field)}
      className="field-error"
      role="alert"
    >
      {error}
    </span>
  ) : null;
}

export function ServiceOwnershipStep({
  input,
  errors,
  onChange,
}: WizardStepBodyProps): React.ReactElement {
  return (
    <>
      <div className="wizard-card__heading">
        <p className="eyebrow">步骤 1 / 4</p>
        <h2>服务归属</h2>
        <p>让业务负责人和平台团队看到同一套生产责任边界。</p>
      </div>
      <div className="form-grid">
        <label className="form-field form-field--wide">
          <span>运行环境名称 *</span>
          <input
            value={input.name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy(errors, "name")}
            onChange={(event) => onChange("name", event.target.value)}
          />
          <FieldError field="name" error={errors.name} />
        </label>
        <label className="form-field">
          <span>项目 / 环境 *</span>
          <input
            value={input.project}
            aria-invalid={Boolean(errors.project)}
            aria-describedby={describedBy(errors, "project")}
            onChange={(event) =>
              onChange("project", event.target.value)
            }
          />
          <FieldError field="project" error={errors.project} />
        </label>
        <label className="form-field">
          <span>负责人 *</span>
          <input
            value={input.owner}
            aria-invalid={Boolean(errors.owner)}
            aria-describedby={describedBy(errors, "owner")}
            onChange={(event) => onChange("owner", event.target.value)}
          />
          <FieldError field="owner" error={errors.owner} />
        </label>
      </div>
      <details className="advanced-section">
        <summary>命名与责任边界说明</summary>
        <p>
          名称用于控制台和 Endpoint 标识；项目与负责人会写入控制面审计事件。
        </p>
      </details>
    </>
  );
}

export function ImageRuntimeStep({
  input,
  errors,
  onChange,
}: WizardStepBodyProps): React.ReactElement {
  return (
    <>
      <div className="wizard-card__heading">
        <p className="eyebrow">步骤 2 / 4</p>
        <h2>镜像与 RuntimePlan</h2>
        <p>
          演示会在部署阶段以确定性规则生成并固定 Digest，不查询真实镜像仓库。
        </p>
      </div>
      <div className="form-grid">
        <label className="form-field form-field--wide">
          <span>容器镜像 *</span>
          <input
            value={input.image}
            aria-invalid={Boolean(errors.image)}
            aria-describedby={describedBy(errors, "image")}
            onChange={(event) => onChange("image", event.target.value)}
          />
          <FieldError field="image" error={errors.image} />
        </label>
        <label className="form-field">
          <span>容器端口 *</span>
          <input
            type="number"
            min={1}
            max={65_535}
            value={input.containerPort}
            aria-invalid={Boolean(errors.containerPort)}
            aria-describedby={describedBy(errors, "containerPort")}
            onChange={(event) =>
              onChange("containerPort", Number(event.target.value))
            }
          />
          <FieldError
            field="containerPort"
            error={errors.containerPort}
          />
        </label>
        <label className="form-field">
          <span>期望实例数 *</span>
          <input
            type="number"
            min={1}
            max={8}
            value={input.desiredInstances}
            aria-invalid={Boolean(errors.desiredInstances)}
            aria-describedby={describedBy(
              errors,
              "desiredInstances",
            )}
            onChange={(event) =>
              onChange(
                "desiredInstances",
                Number(event.target.value),
              )
            }
          />
          <FieldError
            field="desiredInstances"
            error={errors.desiredInstances}
          />
        </label>
        <label className="form-field form-field--wide">
          <span>RuntimePlan *</span>
          <select
            value={input.runtimePlanId}
            aria-invalid={Boolean(errors.runtimePlanId)}
            aria-describedby={describedBy(errors, "runtimePlanId")}
            onChange={(event) =>
              onChange("runtimePlanId", event.target.value)
            }
          >
            <option value="balanced-2c4g">
              balanced-2c4g · 2 vCPU / 4 GiB
            </option>
            <option value="burst-1c2g">
              burst-1c2g · 弹性工作负载
            </option>
            <option value="memory-4c16g">
              memory-4c16g · 长上下文
            </option>
          </select>
          <FieldError
            field="runtimePlanId"
            error={errors.runtimePlanId}
          />
        </label>
      </div>
      <details className="advanced-section">
        <summary>高级运行时约束</summary>
        <p>
          演示环境固定使用非特权容器、只读根文件系统和受控临时存储。
        </p>
      </details>
    </>
  );
}

export function GovernanceSecurityStep({
  input,
  errors,
  onChange,
}: WizardStepBodyProps): React.ReactElement {
  return (
    <>
      <div className="wizard-card__heading">
        <p className="eyebrow">步骤 3 / 4</p>
        <h2>治理与安全策略</h2>
        <p>
          Profile 只暴露可审批的业务选项，平台负责生成底层控制配置。
        </p>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>IngressProfile *</span>
          <select
            value={input.ingressProfileId}
            aria-invalid={Boolean(errors.ingressProfileId)}
            aria-describedby={describedBy(
              errors,
              "ingressProfileId",
            )}
            onChange={(event) =>
              onChange("ingressProfileId", event.target.value)
            }
          >
            <option value="internal-sso-sse">
              internal-sso-sse
            </option>
            <option value="internal-service-token">
              internal-service-token
            </option>
          </select>
          <FieldError
            field="ingressProfileId"
            error={errors.ingressProfileId}
          />
        </label>
        <label className="form-field">
          <span>EgressProfile *</span>
          <select
            value={input.egressProfileId}
            aria-invalid={Boolean(errors.egressProfileId)}
            aria-describedby={describedBy(errors, "egressProfileId")}
            onChange={(event) =>
              onChange("egressProfileId", event.target.value)
            }
          >
            <option value="approved-model-and-tools">
              approved-model-and-tools
            </option>
            <option value="approved-model-only">
              approved-model-only
            </option>
          </select>
          <FieldError
            field="egressProfileId"
            error={errors.egressProfileId}
          />
        </label>
        <label className="security-baseline form-field--wide">
          <input
            type="checkbox"
            checked={input.securityBaseline}
            disabled
            aria-invalid={Boolean(errors.securityBaseline)}
            aria-describedby={describedBy(
              errors,
              "securityBaseline",
            )}
          />
          <span>
            <strong>生产安全基线（必选，无法关闭）</strong>
            <small>
              非特权运行、Workload Identity、网络最小权限与全链路审计
            </small>
          </span>
        </label>
        <FieldError
          field="securityBaseline"
          error={errors.securityBaseline}
        />
      </div>
      <details className="advanced-section" open>
        <summary>高级：SecureTaskProfile（可选）</summary>
        <label className="form-field">
          <span>SecureTaskProfile</span>
          <select
            value={input.secureTaskProfileId}
            onChange={(event) =>
              onChange("secureTaskProfileId", event.target.value)
            }
          >
            <option value="">不启用</option>
            <option value="secure-task-standard">
              secure-task-standard
            </option>
          </select>
        </label>
        <p>
          SecureTask 仅用于委托的短时任务，最长以小时计；它不是常驻作业或通用远程执行入口。
        </p>
      </details>
      <aside className="wizard-note">
        无需 YAML、私钥证书或云厂商 Provider Key；敏感值只通过 Secret
        引用接入。
      </aside>
    </>
  );
}

export function EndpointReviewStep({
  input,
  errors,
  onChange,
}: WizardStepBodyProps): React.ReactElement {
  const imageDigest = resolveImageDigest(input.image);

  return (
    <>
      <div className="wizard-card__heading">
        <p className="eyebrow">步骤 4 / 4</p>
        <h2>Endpoint 与部署确认</h2>
        <p>确认入口范围和会话亲和约定，然后启动受控部署。</p>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Endpoint 可见范围 *</span>
          <select
            value={input.endpointVisibility}
            aria-invalid={Boolean(errors.endpointVisibility)}
            aria-describedby={describedBy(
              errors,
              "endpointVisibility",
            )}
            onChange={(event) =>
              onChange("endpointVisibility", event.target.value)
            }
          >
            <option value="internal">internal · 企业内网</option>
            <option value="private-service">
              private-service · 服务间访问
            </option>
          </select>
          <FieldError
            field="endpointVisibility"
            error={errors.endpointVisibility}
          />
        </label>
        <label className="form-field">
          <span>会话亲和 Header *</span>
          <input
            value={input.sessionHeader}
            aria-invalid={Boolean(errors.sessionHeader)}
            aria-describedby={describedBy(errors, "sessionHeader")}
            onChange={(event) =>
              onChange("sessionHeader", event.target.value)
            }
          />
          <FieldError
            field="sessionHeader"
            error={errors.sessionHeader}
          />
        </label>
      </div>
      <details className="advanced-section">
        <summary>会话模型说明</summary>
        <p>
          平台按 {input.sessionHeader} 进行稳定路由，但不创建 Session
          资源；会话状态由 Agent 或业务数据层自行管理。
        </p>
      </details>
      <dl className="wizard-review">
        <div>
          <dt>服务</dt>
          <dd>{input.name}</dd>
        </div>
        <div>
          <dt>项目</dt>
          <dd>{input.project}</dd>
        </div>
        <div>
          <dt>镜像标签</dt>
          <dd>{input.image}</dd>
        </div>
        <div>
          <dt>演示固定 Digest</dt>
          <dd>{imageDigest}</dd>
        </div>
        <div>
          <dt>运行时</dt>
          <dd>
            {input.runtimePlanId} · {input.desiredInstances} 实例
          </dd>
        </div>
        <div>
          <dt>网络边界</dt>
          <dd>
            {input.ingressProfileId} / {input.egressProfileId}
          </dd>
        </div>
        <div>
          <dt>Endpoint</dt>
          <dd>{input.endpointVisibility}</dd>
        </div>
      </dl>
      <p className="wizard-note">
        这是演示环境按镜像字符串确定性生成的部署证据，不会查询真实镜像仓库。
      </p>
    </>
  );
}
