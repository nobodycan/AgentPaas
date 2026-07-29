"use client";

import React, {
  useRef,
  useState,
} from "react";

import { useDemo } from "../lib/demo-store";
import {
  DEFAULT_WIZARD_INPUT,
  validateWizardStep,
} from "../lib/view-models";
import type {
  EnvironmentWizardInput,
  WizardStep,
  WizardValidationErrors,
} from "../lib/view-models";

export interface CreateEnvironmentWizardProps {
  onNavigate(destination: string): void;
}

const WIZARD_STEPS: readonly {
  id: WizardStep;
  title: string;
  description: string;
}[] = [
  {
    id: 1,
    title: "服务归属",
    description: "确认环境名称、项目与责任人",
  },
  {
    id: 2,
    title: "镜像与运行时",
    description: "选择镜像、容量和 RuntimePlan",
  },
  {
    id: 3,
    title: "治理策略",
    description: "绑定网络与生产安全基线",
  },
  {
    id: 4,
    title: "Endpoint",
    description: "确认入口、会话亲和与部署摘要",
  },
];

function fieldErrorId(field: keyof EnvironmentWizardInput): string {
  return `environment-wizard-${field}-error`;
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

export function CreateEnvironmentWizard({
  onNavigate,
}: CreateEnvironmentWizardProps): React.ReactElement {
  const {
    createEnvironment,
    advanceDeployment,
  } = useDemo();
  const [step, setStep] = useState<WizardStep>(1);
  const [input, setInput] = useState<EnvironmentWizardInput>({
    ...DEFAULT_WIZARD_INPUT,
  });
  const [errors, setErrors] =
    useState<WizardValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);

  const updateField = <Key extends keyof EnvironmentWizardInput,>(
    field: Key,
    value: EnvironmentWizardInput[Key],
  ) => {
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const describedBy = (
    field: keyof EnvironmentWizardInput,
  ): string | undefined =>
    errors[field] ? fieldErrorId(field) : undefined;

  const validateAndContinue = () => {
    const nextErrors = validateWizardStep(input, step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0 && step < 4) {
      setStep((step + 1) as WizardStep);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const validations = WIZARD_STEPS.map(({ id }) => ({
      step: id,
      errors: validateWizardStep(input, id),
    }));
    const firstInvalid = validations.find(
      ({ errors: stepErrors }) =>
        Object.keys(stepErrors).length > 0,
    );
    if (firstInvalid) {
      setStep(firstInvalid.step);
      setErrors(firstInvalid.errors);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const environmentId = createEnvironment({
        name: input.name,
        project: input.project,
        owner: input.owner,
        image: input.image,
        containerPort: input.containerPort,
        desiredInstances: input.desiredInstances,
        runtimePlanId: input.runtimePlanId,
        ingressProfileId: input.ingressProfileId,
        egressProfileId: input.egressProfileId,
        endpointVisibility: input.endpointVisibility,
        sessionHeader: input.sessionHeader,
        secureTaskProfileId:
          input.secureTaskProfileId || undefined,
      });
      advanceDeployment(environmentId, 0);
      onNavigate(
        `/environments/${encodeURIComponent(
          environmentId,
        )}/overview`,
      );
    } catch {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitError("创建失败，请检查配置后重试。");
    }
  };

  return (
    <section aria-labelledby="environment-create-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">四步部署向导</p>
          <h1 id="environment-create-title">创建运行环境</h1>
          <p>
            把镜像、运行时容量与企业治理 Profile
            组合成可访问、可审计的 Agent 服务。
          </p>
        </div>
      </header>

      <ol className="wizard-stepper" aria-label="创建运行环境进度">
        {WIZARD_STEPS.map((wizardStep) => (
          <li
            key={wizardStep.id}
            className={
              wizardStep.id === step
                ? "wizard-stepper__item wizard-stepper__item--current"
                : wizardStep.id < step
                  ? "wizard-stepper__item wizard-stepper__item--complete"
                  : "wizard-stepper__item"
            }
            aria-current={
              wizardStep.id === step ? "step" : undefined
            }
          >
            <span>{wizardStep.id}</span>
            <div>
              <strong>{wizardStep.title}</strong>
              <small>{wizardStep.description}</small>
            </div>
          </li>
        ))}
      </ol>

      <form className="wizard-layout" onSubmit={handleSubmit}>
        <section className="content-card wizard-card">
          {step === 1 ? (
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
                    aria-describedby={describedBy("name")}
                    onChange={(event) =>
                      updateField("name", event.target.value)
                    }
                  />
                  <FieldError field="name" error={errors.name} />
                </label>
                <label className="form-field">
                  <span>项目 / 环境 *</span>
                  <input
                    value={input.project}
                    aria-invalid={Boolean(errors.project)}
                    aria-describedby={describedBy("project")}
                    onChange={(event) =>
                      updateField("project", event.target.value)
                    }
                  />
                  <FieldError field="project" error={errors.project} />
                </label>
                <label className="form-field">
                  <span>负责人 *</span>
                  <input
                    value={input.owner}
                    aria-invalid={Boolean(errors.owner)}
                    aria-describedby={describedBy("owner")}
                    onChange={(event) =>
                      updateField("owner", event.target.value)
                    }
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
          ) : null}

          {step === 2 ? (
            <>
              <div className="wizard-card__heading">
                <p className="eyebrow">步骤 2 / 4</p>
                <h2>镜像与 RuntimePlan</h2>
                <p>平台将标签解析为不可变 Digest 后再进入部署。</p>
              </div>
              <div className="form-grid">
                <label className="form-field form-field--wide">
                  <span>容器镜像 *</span>
                  <input
                    value={input.image}
                    aria-invalid={Boolean(errors.image)}
                    aria-describedby={describedBy("image")}
                    onChange={(event) =>
                      updateField("image", event.target.value)
                    }
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
                    aria-describedby={describedBy("containerPort")}
                    onChange={(event) =>
                      updateField(
                        "containerPort",
                        Number(event.target.value),
                      )
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
                    aria-describedby={describedBy("desiredInstances")}
                    onChange={(event) =>
                      updateField(
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
                    aria-describedby={describedBy("runtimePlanId")}
                    onChange={(event) =>
                      updateField(
                        "runtimePlanId",
                        event.target.value,
                      )
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
          ) : null}

          {step === 3 ? (
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
                      "ingressProfileId",
                    )}
                    onChange={(event) =>
                      updateField(
                        "ingressProfileId",
                        event.target.value,
                      )
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
                    aria-describedby={describedBy("egressProfileId")}
                    onChange={(event) =>
                      updateField(
                        "egressProfileId",
                        event.target.value,
                      )
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
                      updateField(
                        "secureTaskProfileId",
                        event.target.value,
                      )
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
          ) : null}

          {step === 4 ? (
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
                    aria-invalid={Boolean(
                      errors.endpointVisibility,
                    )}
                    aria-describedby={describedBy(
                      "endpointVisibility",
                    )}
                    onChange={(event) =>
                      updateField(
                        "endpointVisibility",
                        event.target.value,
                      )
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
                    aria-describedby={describedBy("sessionHeader")}
                    onChange={(event) =>
                      updateField(
                        "sessionHeader",
                        event.target.value,
                      )
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
                  <dt>镜像</dt>
                  <dd>{input.image}</dd>
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
            </>
          ) : null}

          {submitError ? (
            <p className="field-error" role="alert">
              {submitError}
            </p>
          ) : null}
          <footer className="wizard-actions">
            <button
              type="button"
              className="button button--quiet"
              disabled={step === 1 || isSubmitting}
              onClick={() => {
                setErrors({});
                setStep((step - 1) as WizardStep);
              }}
            >
              上一步
            </button>
            {step < 4 ? (
              <button
                type="button"
                className="button button--primary"
                disabled={isSubmitting}
                onClick={validateAndContinue}
              >
                下一步
              </button>
            ) : (
              <button
                type="submit"
                className="button button--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "正在创建…" : "创建并部署"}
              </button>
            )}
          </footer>
        </section>

        <aside className="content-card wizard-summary">
          <p className="eyebrow">交付护栏</p>
          <h2>平台替团队承担复杂度</h2>
          <ul>
            <li>镜像标签在部署前固化为 Digest</li>
            <li>生产安全基线不可关闭</li>
            <li>Secret 只保存引用，不在表单展示明文</li>
            <li>Endpoint Ready 后才注册负载均衡后端</li>
          </ul>
        </aside>
      </form>
    </section>
  );
}
