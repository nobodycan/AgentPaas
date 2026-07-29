export const ENVIRONMENT_TABS = [
  "overview",
  "access",
  "config",
  "instances",
  "revisions",
  "observability",
  "security",
  "operations",
] as const;

export type EnvironmentTab = (typeof ENVIRONMENT_TABS)[number];

export type AppRoute =
  | { view: "overview" }
  | { view: "environment-list" }
  | { view: "environment-create" }
  | {
      view: "environment-detail";
      environmentId: string;
      tab: EnvironmentTab;
    }
  | { view: "audit" }
  | { view: "security-events" }
  | { view: "resource-pools" }
  | { view: "profiles" }
  | { view: "not-found" };

export interface DemoStep {
  id: string;
  title: string;
  description: string;
  destination: string;
  actionLabel: string;
}

export const DEMO_STEPS = [
  {
    id: "platform-overview",
    title: "查看平台概览",
    description: "了解运行环境、实例与治理事件的整体状态。",
    destination: "/overview",
    actionLabel: "打开概览",
  },
  {
    id: "browse-environments",
    title: "浏览运行环境",
    description: "查看 Agent 服务的环境清单与当前状态。",
    destination: "/environments",
    actionLabel: "查看环境",
  },
  {
    id: "create-environment",
    title: "创建运行环境",
    description: "进入受策略约束的环境创建流程。",
    destination: "/environments/new",
    actionLabel: "创建环境",
  },
  {
    id: "test-access",
    title: "验证访问链路",
    description: "检查入口、会话路由和出站策略的执行结果。",
    destination: "/environments/env-customer-service-prod/access",
    actionLabel: "测试访问",
  },
  {
    id: "review-revisions",
    title: "检查版本记录",
    description: "比较稳定版本与失败版本，并准备回滚。",
    destination: "/environments/env-customer-service-prod/revisions",
    actionLabel: "查看版本",
  },
  {
    id: "contain-incident",
    title: "处置安全事件",
    description: "跟踪隔离、阻断和身份撤销进度。",
    destination: "/security-events",
    actionLabel: "处置事件",
  },
  {
    id: "verify-audit",
    title: "核对审计证据",
    description: "用关联标识串联控制面、访问与安全事件。",
    destination: "/audit",
    actionLabel: "查看审计",
  },
] as const satisfies readonly DemoStep[];

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/u, 1)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;

  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/u, "")
    : withLeadingSlash;
}

function decodePathSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function parseRoute(pathname: string): AppRoute {
  const normalizedPathname = normalizePathname(pathname);

  switch (normalizedPathname) {
    case "/overview":
    case "/":
      return { view: "overview" };
    case "/environments":
      return { view: "environment-list" };
    case "/environments/new":
      return { view: "environment-create" };
    case "/audit":
      return { view: "audit" };
    case "/security-events":
      return { view: "security-events" };
    case "/resource-pools":
      return { view: "resource-pools" };
    case "/profiles":
      return { view: "profiles" };
    default:
      break;
  }

  const detailMatch = normalizedPathname.match(
    /^\/environments\/([^/]+)(?:\/([^/]+))?$/u,
  );
  if (!detailMatch) {
    return { view: "not-found" };
  }

  const environmentId = decodePathSegment(detailMatch[1]);
  const tab = detailMatch[2] ?? "overview";
  if (
    !environmentId ||
    !ENVIRONMENT_TABS.includes(tab as EnvironmentTab)
  ) {
    return { view: "not-found" };
  }

  return {
    view: "environment-detail",
    environmentId,
    tab: tab as EnvironmentTab,
  };
}

export function isProductPath(pathname: string): boolean {
  return parseRoute(pathname).view !== "not-found";
}

export function getNextDemoStep(
  currentStepId?: string,
): (typeof DEMO_STEPS)[number] {
  const currentIndex = DEMO_STEPS.findIndex(
    (step) => step.id === currentStepId,
  );

  return DEMO_STEPS[(currentIndex + 1) % DEMO_STEPS.length];
}

export function getDemoStepForPath(
  pathname: string,
): (typeof DEMO_STEPS)[number] | undefined {
  const normalizedPathname = normalizePathname(pathname);
  return DEMO_STEPS.find(
    (step) => step.destination === normalizedPathname,
  );
}
