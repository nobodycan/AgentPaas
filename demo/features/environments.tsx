"use client";

import React, {
  useMemo,
  useState,
} from "react";

import { EmptyState, StatusBadge } from "../components/ui";
import type {
  DataTableColumn,
  StatusTone,
} from "../components/ui";
import { DataTable } from "../components/ui";
import { useDemo } from "../lib/demo-store";
import type {
  Environment,
  EnvironmentStatus,
} from "../lib/types";
import {
  DEFAULT_WIZARD_INPUT,
  DEPLOYMENT_STAGE_COPY,
  environmentFilterOptions,
  filterEnvironments,
  validateWizardStep,
} from "../lib/view-models";
import type {
  EnvironmentFilters,
  EnvironmentWizardInput,
  WizardStep,
  WizardValidationErrors,
} from "../lib/view-models";

export interface NavigationProps {
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
}: NavigationProps): React.ReactElement {
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
  const rows = useMemo<EnvironmentListRow[]>(
    () =>
      filteredEnvironments.map((environment) => {
        const environmentClusterIds = [
          ...new Set(
            instances
              .filter(
                (instance) =>
                  instance.environmentId === environment.id,
              )
              .map((instance) => instance.clusterId)
              .filter(Boolean),
          ),
        ];
        const revision = revisions.find(
          (candidate) =>
            candidate.id === environment.desiredRevisionId,
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
      instances,
      revisions,
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

function FieldError({
  error,
}: {
  error?: string;
}): React.ReactElement | null {
  return error ? (
    <span className="field-error" role="alert">
      {error}
    </span>
  ) : null;
}

export function CreateEnvironmentWizard({
  onNavigate,
}: NavigationProps): React.ReactElement {
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

  const validateAndContinue = () => {
    const nextErrors = validateWizardStep(input, step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0 && step < 4) {
      setStep((step + 1) as WizardStep);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

    const environmentId = createEnvironment({
      name: input.name,
      project: input.project,
      owner: input.owner,
      desiredInstances: input.desiredInstances,
      runtimePlanId: input.runtimePlanId,
      ingressProfileId: input.ingressProfileId,
      egressProfileId: input.egressProfileId,
      secureTaskProfileId:
        input.secureTaskProfileId || undefined,
    });
    advanceDeployment(environmentId, 0);
    onNavigate(
      `/environments/${encodeURIComponent(environmentId)}/overview`,
    );
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
                    onChange={(event) =>
                      updateField("name", event.target.value)
                    }
                  />
                  <FieldError error={errors.name} />
                </label>
                <label className="form-field">
                  <span>项目 / 环境 *</span>
                  <input
                    value={input.project}
                    aria-invalid={Boolean(errors.project)}
                    onChange={(event) =>
                      updateField("project", event.target.value)
                    }
                  />
                  <FieldError error={errors.project} />
                </label>
                <label className="form-field">
                  <span>负责人 *</span>
                  <input
                    value={input.owner}
                    aria-invalid={Boolean(errors.owner)}
                    onChange={(event) =>
                      updateField("owner", event.target.value)
                    }
                  />
                  <FieldError error={errors.owner} />
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
                    onChange={(event) =>
                      updateField("image", event.target.value)
                    }
                  />
                  <FieldError error={errors.image} />
                </label>
                <label className="form-field">
                  <span>容器端口 *</span>
                  <input
                    type="number"
                    min={1}
                    max={65_535}
                    value={input.containerPort}
                    aria-invalid={Boolean(errors.containerPort)}
                    onChange={(event) =>
                      updateField(
                        "containerPort",
                        Number(event.target.value),
                      )
                    }
                  />
                  <FieldError error={errors.containerPort} />
                </label>
                <label className="form-field">
                  <span>期望实例数 *</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={input.desiredInstances}
                    aria-invalid={Boolean(errors.desiredInstances)}
                    onChange={(event) =>
                      updateField(
                        "desiredInstances",
                        Number(event.target.value),
                      )
                    }
                  />
                  <FieldError error={errors.desiredInstances} />
                </label>
                <label className="form-field form-field--wide">
                  <span>RuntimePlan *</span>
                  <select
                    value={input.runtimePlanId}
                    aria-invalid={Boolean(errors.runtimePlanId)}
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
                  <FieldError error={errors.runtimePlanId} />
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
                  <FieldError error={errors.ingressProfileId} />
                </label>
                <label className="form-field">
                  <span>EgressProfile *</span>
                  <select
                    value={input.egressProfileId}
                    aria-invalid={Boolean(errors.egressProfileId)}
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
                  <FieldError error={errors.egressProfileId} />
                </label>
                <label className="security-baseline form-field--wide">
                  <input
                    type="checkbox"
                    checked={input.securityBaseline}
                    disabled
                  />
                  <span>
                    <strong>生产安全基线（必选，无法关闭）</strong>
                    <small>
                      非特权运行、Workload Identity、网络最小权限与全链路审计
                    </small>
                  </span>
                </label>
                <FieldError error={errors.securityBaseline} />
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
                    aria-invalid={Boolean(errors.endpointVisibility)}
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
                  <FieldError error={errors.endpointVisibility} />
                </label>
                <label className="form-field">
                  <span>会话亲和 Header *</span>
                  <input
                    value={input.sessionHeader}
                    aria-invalid={Boolean(errors.sessionHeader)}
                    onChange={(event) =>
                      updateField(
                        "sessionHeader",
                        event.target.value,
                      )
                    }
                  />
                  <FieldError error={errors.sessionHeader} />
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

          <footer className="wizard-actions">
            <button
              type="button"
              className="button button--quiet"
              disabled={step === 1}
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
                onClick={validateAndContinue}
              >
                下一步
              </button>
            ) : (
              <button
                type="submit"
                className="button button--primary"
              >
                创建并部署
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

export function DeploymentStatusPanel({
  environmentId,
  onNavigate,
}: {
  environmentId: string;
  onNavigate(destination: string): void;
}): React.ReactElement | null {
  const {
    environments,
    deploymentSteps,
    advanceDeployment,
  } = useDemo();
  const [copied, setCopied] = useState(false);
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

  const copyEndpoint = () => {
    if (!environment.endpoint) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopied(true);
      return;
    }
    void navigator.clipboard
      .writeText(environment.endpoint)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
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
          </div>
          <button
            type="button"
            className="button button--quiet"
            onClick={copyEndpoint}
          >
            {copied ? "已复制" : "复制 Endpoint"}
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
