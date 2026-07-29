import type {
  DemoState,
  Environment,
  EnvironmentStatus,
} from "./types.ts";

export interface EnvironmentFilters {
  query: string;
  status: EnvironmentStatus | "";
  project: string;
  runtimePlanId: string;
}

export interface EnvironmentFilterOptions {
  projects: string[];
  runtimePlans: string[];
  statuses: EnvironmentStatus[];
}

export interface EnvironmentWizardInput {
  name: string;
  project: string;
  owner: string;
  image: string;
  containerPort: number;
  runtimePlanId: string;
  desiredInstances: number;
  ingressProfileId: string;
  egressProfileId: string;
  securityBaseline: boolean;
  secureTaskProfileId: string;
  endpointVisibility: string;
  sessionHeader: string;
}

export type WizardStep = 1 | 2 | 3 | 4;
export type WizardValidationErrors = Partial<
  Record<keyof EnvironmentWizardInput, string>
>;

export const DEFAULT_WIZARD_INPUT: Readonly<EnvironmentWizardInput> = {
  name: "智能采购助手",
  project: "供应链智能化 / production",
  owner: "王敏",
  image:
    "registry.internal.example.com/agents/procurement-assistant:1.4.0",
  containerPort: 8080,
  runtimePlanId: "balanced-2c4g",
  desiredInstances: 2,
  ingressProfileId: "internal-sso-sse",
  egressProfileId: "approved-model-and-tools",
  securityBaseline: true,
  secureTaskProfileId: "secure-task-standard",
  endpointVisibility: "internal",
  sessionHeader: "X-Agent-Session-ID",
};

export const DEPLOYMENT_STAGE_COPY = [
  "配置已接受",
  "镜像 Digest 已固化",
  "身份与网络策略已生效",
  "SecureTaskProfile 已校验",
  "实例已启动",
  "健康检查通过",
  "LB 后端已注册",
  "HTTPS Endpoint Ready",
] as const;

export const INVESTMENT_OUTCOMES = [
  {
    copy: "镜像到 Endpoint 3 天 → 18 分钟",
    isMock: true,
  },
  {
    copy: "上线协作 6 个团队 → 1 个入口",
    isMock: true,
  },
  {
    copy: "人工步骤 23 → 5",
    isMock: true,
  },
] as const;

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function filterEnvironments(
  environments: readonly Environment[],
  filters: EnvironmentFilters,
): Environment[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return environments.filter((environment) => {
    if (filters.status && environment.status !== filters.status) {
      return false;
    }
    if (filters.project && environment.project !== filters.project) {
      return false;
    }
    if (
      filters.runtimePlanId &&
      environment.runtimePlanId !== filters.runtimePlanId
    ) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [
      environment.id,
      environment.name,
      environment.project,
      environment.owner,
      environment.endpoint,
      environment.desiredRevisionId,
      environment.runtimePlanId,
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function environmentFilterOptions(
  environments: readonly Environment[],
): EnvironmentFilterOptions {
  return {
    projects: uniqueSorted(
      environments.map((environment) => environment.project),
    ),
    runtimePlans: uniqueSorted(
      environments.map((environment) => environment.runtimePlanId),
    ),
    statuses: uniqueSorted(
      environments.map((environment) => environment.status),
    ),
  };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function validateWizardStep(
  input: EnvironmentWizardInput,
  step: WizardStep,
): WizardValidationErrors {
  const errors: WizardValidationErrors = {};

  if (step === 1) {
    if (isBlank(input.name)) {
      errors.name = "请输入运行环境名称";
    }
    if (isBlank(input.project)) {
      errors.project = "请选择项目与环境";
    }
    if (isBlank(input.owner)) {
      errors.owner = "请输入负责人";
    }
  }

  if (step === 2) {
    if (isBlank(input.image)) {
      errors.image = "请输入镜像地址";
    }
    if (
      !Number.isInteger(input.containerPort) ||
      input.containerPort < 1 ||
      input.containerPort > 65_535
    ) {
      errors.containerPort = "端口必须是 1–65535 的整数";
    }
    if (isBlank(input.runtimePlanId)) {
      errors.runtimePlanId = "请选择 RuntimePlan";
    }
    if (
      !Number.isInteger(input.desiredInstances) ||
      input.desiredInstances < 1 ||
      input.desiredInstances > 8
    ) {
      errors.desiredInstances = "实例数必须是 1–8 的整数";
    }
  }

  if (step === 3) {
    if (isBlank(input.ingressProfileId)) {
      errors.ingressProfileId = "请选择入口策略";
    }
    if (isBlank(input.egressProfileId)) {
      errors.egressProfileId = "请选择出口策略";
    }
    if (!input.securityBaseline) {
      errors.securityBaseline = "生产安全基线必须启用";
    }
  }

  if (step === 4) {
    if (isBlank(input.endpointVisibility)) {
      errors.endpointVisibility = "请选择 Endpoint 可见范围";
    }
    if (isBlank(input.sessionHeader)) {
      errors.sessionHeader = "请输入会话亲和 Header";
    }
  }

  return errors;
}

export interface OverviewMetrics {
  environmentCount: number;
  readyInstanceCount: number;
  recentReleaseCount: number;
  governanceHealth: "健康" | "需关注";
}

export function deriveOverviewMetrics(
  state: Pick<
    DemoState,
    "environments" | "instances" | "revisions" | "securityIncidents"
  >,
): OverviewMetrics {
  const governanceIssueCount = state.securityIncidents.filter(
    (incident) =>
      incident.status === "Open" || incident.status === "Containing",
  ).length;

  return {
    environmentCount: state.environments.length,
    readyInstanceCount: state.instances.filter(
      (instance) => instance.status === "Ready",
    ).length,
    recentReleaseCount: state.revisions.filter(
      (revision) =>
        revision.status === "Stable" ||
        revision.status === "Deploying",
    ).length,
    governanceHealth:
      governanceIssueCount > 0 ? "需关注" : "健康",
  };
}
