import {
  deploymentStateAt,
  isolationStateAt,
  rollbackRevision,
} from "./demo-engine.ts";
import {
  MOCK_AUDIT_EVENTS,
  MOCK_CLUSTERS,
  MOCK_ENVIRONMENTS,
  MOCK_INSTANCES,
  MOCK_PROFILES,
  MOCK_REVISIONS,
  MOCK_SECURITY_INCIDENTS,
} from "./mock-data.ts";
import type {
  AuditEvent,
  CreateEnvironmentInput,
  DemoState,
  Environment,
  Instance,
  Revision,
} from "./types.ts";

const DEMO_SCHEMA_VERSION = 1;
const DEMO_CLOCK_START = Date.UTC(2026, 6, 30, 9, 0, 0);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deterministicTimestamp(ordinal: number): string {
  return new Date(DEMO_CLOCK_START + ordinal * 1_000).toISOString();
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "environment";
}

function uniqueEnvironmentId(
  state: DemoState,
  environmentName: string,
): string {
  const baseId = `env-${slugify(environmentName)}`;
  const usedIds = new Set(
    state.environments.map((environment) => environment.id),
  );

  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function nextRevisionSequence(state: DemoState): number {
  return (
    state.revisions.reduce(
      (highest, revision) => Math.max(highest, revision.sequence),
      0,
    ) + 1
  );
}

function normalizeDesiredInstances(value: number): number {
  const normalized = Number.isNaN(value) ? 1 : Math.trunc(value);
  return Math.min(8, Math.max(1, normalized));
}

function withAuditEvent(
  state: DemoState,
  auditEvent: AuditEvent,
): DemoState {
  if (state.auditEvents.some((event) => event.id === auditEvent.id)) {
    return state;
  }

  return {
    ...state,
    auditEvents: [...state.auditEvents, auditEvent],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
}

function isEnvironment(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.project) &&
    isString(value.owner) &&
    isString(value.status) &&
    new Set([
      "Draft",
      "Deploying",
      "Running",
      "Degraded",
      "Stopped",
      "Isolated",
    ]).has(value.status) &&
    isString(value.endpoint) &&
    isString(value.desiredRevisionId) &&
    isSafeInteger(value.readyInstances) &&
    value.readyInstances >= 0 &&
    isSafeInteger(value.desiredInstances) &&
    value.desiredInstances >= 1 &&
    value.desiredInstances <= 8 &&
    isString(value.runtimePlanId) &&
    isString(value.ingressProfileId) &&
    isString(value.egressProfileId) &&
    (value.containerPort === undefined ||
      (isSafeInteger(value.containerPort) &&
        value.containerPort >= 1 &&
        value.containerPort <= 65_535)) &&
    isOptionalString(value.endpointVisibility) &&
    isOptionalString(value.sessionHeader) &&
    isOptionalString(value.secureTaskProfileId) &&
    isOptionalString(value.identityProfileId) &&
    isOptionalString(value.loggingProfileId) &&
    isOptionalString(value.domainProfileId)
  );
}

function isRevision(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.environmentId) &&
    isSafeInteger(value.sequence) &&
    value.sequence >= 0 &&
    isString(value.image) &&
    isString(value.status) &&
    new Set([
      "Pending",
      "Deploying",
      "Stable",
      "Failed",
      "RolledBack",
    ]).has(value.status) &&
    isString(value.createdAt) &&
    isString(value.createdBy)
  );
}

function isInstance(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.environmentId) &&
    isString(value.revisionId) &&
    isString(value.status) &&
    new Set([
      "Pending",
      "Starting",
      "Ready",
      "Draining",
      "Stopped",
      "Failed",
      "Isolated",
    ]).has(value.status) &&
    isString(value.clusterId) &&
    isString(value.startedAt)
  );
}

function isProfile(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.kind) &&
    new Set([
      "RUNTIME",
      "INGRESS",
      "EGRESS",
      "SECURE_TASK",
      "IDENTITY",
      "LOGGING",
      "DOMAIN",
    ]).has(value.kind) &&
    isSafeInteger(value.version) &&
    value.version >= 0 &&
    isString(value.summary) &&
    isStringArray(value.controls)
  );
}

function isCluster(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.tenantId) &&
    value.dedicated === true &&
    isString(value.region) &&
    isString(value.status) &&
    new Set(["Healthy", "Degraded", "Unavailable"]).has(value.status) &&
    isSafeInteger(value.readyCapacity) &&
    value.readyCapacity >= 0 &&
    isSafeInteger(value.totalCapacity) &&
    value.totalCapacity >= 0
  );
}

function isAuditEvent(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.kind) &&
    new Set(["CONTROL_PLANE", "ACCESS", "SECURITY", "RUNTIME"]).has(
      value.kind,
    ) &&
    isString(value.type) &&
    isString(value.actor) &&
    isString(value.targetId) &&
    isString(value.occurredAt) &&
    isString(value.summary) &&
    isStringRecord(value.details)
  );
}

function isSecurityIncident(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.environmentId) &&
    isString(value.title) &&
    isString(value.severity) &&
    new Set(["Low", "Medium", "High", "Critical"]).has(value.severity) &&
    isString(value.status) &&
    new Set(["Open", "Containing", "Contained", "Resolved"]).has(
      value.status,
    ) &&
    isString(value.detectedAt) &&
    isOptionalString(value.resolvedAt) &&
    isStringArray(value.auditEventIds) &&
    (value.context === undefined || isStringRecord(value.context))
  );
}

function isTransitionRecord(value: unknown, maximum: number): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (step) => isSafeInteger(step) && step >= 0 && step <= maximum,
    )
  );
}

function isHydratableState(value: unknown): value is DemoState {
  if (!isRecord(value) || value.schemaVersion !== DEMO_SCHEMA_VERSION) {
    return false;
  }

  return (
    isSafeInteger(value.generation) &&
    value.generation >= 0 &&
    Array.isArray(value.environments) &&
    value.environments.every(isEnvironment) &&
    Array.isArray(value.revisions) &&
    value.revisions.every(isRevision) &&
    Array.isArray(value.instances) &&
    value.instances.every(isInstance) &&
    Array.isArray(value.profiles) &&
    value.profiles.every(isProfile) &&
    Array.isArray(value.clusters) &&
    value.clusters.every(isCluster) &&
    Array.isArray(value.auditEvents) &&
    value.auditEvents.every(isAuditEvent) &&
    Array.isArray(value.securityIncidents) &&
    value.securityIncidents.every(isSecurityIncident) &&
    isTransitionRecord(value.deploymentSteps, 7) &&
    isTransitionRecord(value.isolationSteps, 5)
  );
}

export function createInitialDemoState(): DemoState {
  return clone<DemoState>({
    schemaVersion: DEMO_SCHEMA_VERSION,
    generation: 0,
    environments: [...MOCK_ENVIRONMENTS],
    revisions: [...MOCK_REVISIONS],
    instances: [...MOCK_INSTANCES],
    profiles: [...MOCK_PROFILES],
    clusters: [...MOCK_CLUSTERS],
    auditEvents: [...MOCK_AUDIT_EVENTS],
    securityIncidents: [...MOCK_SECURITY_INCIDENTS],
    deploymentSteps: {
      "env-customer-service-staging": 4,
    },
    isolationSteps: {},
  });
}

export function createEnvironment(
  state: DemoState,
  input: CreateEnvironmentInput,
): DemoState {
  const environmentId = uniqueEnvironmentId(state, input.name);
  const revisionSequence = nextRevisionSequence(state);
  const revisionId = `rev-${revisionSequence}`;
  const desiredInstances = normalizeDesiredInstances(input.desiredInstances);
  const ordinal = state.environments.length + 1;
  const createdAt = deterministicTimestamp(ordinal);
  const environment: Environment = {
    id: environmentId,
    name: input.name.trim() || "Untitled Environment",
    project: input.project.trim() || "demo",
    owner: input.owner.trim() || "demo.operator",
    status: "Draft",
    endpoint: "",
    desiredRevisionId: revisionId,
    readyInstances: 0,
    desiredInstances,
    runtimePlanId: input.runtimePlanId,
    ingressProfileId: input.ingressProfileId,
    egressProfileId: input.egressProfileId,
    containerPort:
      Number.isInteger(input.containerPort) &&
      (input.containerPort ?? 0) >= 1 &&
      (input.containerPort ?? 0) <= 65_535
        ? input.containerPort
        : 8080,
    endpointVisibility:
      input.endpointVisibility?.trim() || "internal",
    sessionHeader:
      input.sessionHeader?.trim() || "X-Agent-Session-ID",
    secureTaskProfileId: input.secureTaskProfileId,
    identityProfileId: input.identityProfileId ?? "identity-workload",
    loggingProfileId: input.loggingProfileId ?? "logging-audit",
    domainProfileId: input.domainProfileId,
  };
  const revision: Revision = {
    id: revisionId,
    environmentId,
    sequence: revisionSequence,
    image:
      input.image?.trim() ||
      `registry.demo.local/${slugify(input.project || input.name)}:draft-${revisionSequence}`,
    status: "Pending",
    createdAt,
    createdBy: environment.owner,
  };
  const instances: Instance[] = Array.from(
    { length: desiredInstances },
    (_, index) => ({
      id: `ins-${environmentId}-${String(index + 1).padStart(2, "0")}`,
      environmentId,
      revisionId,
      status: "Pending",
      clusterId: state.clusters[index % state.clusters.length]?.id ?? "",
      startedAt: createdAt,
    }),
  );
  const auditId = `audit-environment-create-${environmentId}`;
  const correlationSuffix = String(ordinal).padStart(3, "0");
  const auditEvent: AuditEvent = {
    id: auditId,
    kind: "CONTROL_PLANE",
    type: "ENVIRONMENT_CREATED",
    actor: environment.owner,
    targetId: environmentId,
    occurredAt: createdAt,
    summary: `Created draft environment ${environment.name}`,
    details: {
      requestId: `req-demo-create-${correlationSuffix}`,
      operationId: `op-demo-create-${correlationSuffix}`,
      taskId: `task-demo-create-${correlationSuffix}`,
      environmentId,
      revisionId,
    },
  };

  return {
    ...state,
    environments: [...state.environments, environment],
    revisions: [...state.revisions, revision],
    instances: [...state.instances, ...instances],
    auditEvents: [...state.auditEvents, auditEvent],
  };
}

export function applyDeploymentStep(
  state: DemoState,
  environmentId: string,
  step: number,
): DemoState {
  const environment = state.environments.find(
    (candidate) => candidate.id === environmentId,
  );
  if (!environment) {
    return state;
  }

  const requestedSnapshot = deploymentStateAt(step);
  const currentStep = state.deploymentSteps[environmentId] ?? -1;
  const nextStep = Math.max(currentStep, requestedSnapshot.step);
  if (nextStep === currentStep) {
    return state;
  }

  const snapshot = deploymentStateAt(nextStep);
  const isCompleted = snapshot.endpointReady;
  const endpoint = isCompleted
    ? `https://${environmentId.replace(/^env-/, "")}.demo.agentpaas.local`
    : "";
  const environments = state.environments.map((candidate) =>
    candidate.id === environmentId
      ? {
          ...candidate,
          status: snapshot.status,
          endpoint,
          readyInstances: isCompleted ? candidate.desiredInstances : 0,
        }
      : candidate,
  );
  const instances = state.instances.map((instance) => {
    if (instance.environmentId !== environmentId) {
      return instance;
    }

    return {
      ...instance,
      status: isCompleted
        ? ("Ready" as const)
        : nextStep >= 4
          ? ("Starting" as const)
          : ("Pending" as const),
    };
  });
  const revisions = state.revisions.map((revision) =>
    revision.id === environment.desiredRevisionId
      ? {
          ...revision,
          status: isCompleted ? ("Stable" as const) : ("Deploying" as const),
        }
      : revision,
  );
  const auditId = `audit-deployment-${environmentId}-${nextStep}`;
  const correlationSuffix = `${slugify(environmentId)}-${nextStep}`;
  const nextState: DemoState = {
    ...state,
    environments,
    instances,
    revisions,
    deploymentSteps: {
      ...state.deploymentSteps,
      [environmentId]: nextStep,
    },
  };

  return withAuditEvent(nextState, {
    id: auditId,
    kind: "CONTROL_PLANE",
    type: isCompleted ? "DEPLOYMENT_COMPLETED" : "DEPLOYMENT_ADVANCED",
    actor: "demo.operator",
    targetId: environmentId,
    occurredAt: deterministicTimestamp(
      state.environments.findIndex(
        (candidate) => candidate.id === environmentId,
      ) *
        10 +
        nextStep,
    ),
    summary: `${environment.name} deployment entered ${snapshot.stage}`,
    details: {
      requestId: `req-demo-deploy-${correlationSuffix}`,
      operationId: `op-demo-deploy-${correlationSuffix}`,
      taskId: `task-demo-deploy-${correlationSuffix}`,
      environmentId,
      stage: snapshot.stage,
    },
  });
}

export interface PendingDeploymentTransition {
  environmentId: string;
  step: number;
}

export interface PendingIsolationTransition {
  incidentId: string;
  step: number;
}

export interface PendingDemoTransitions {
  deployments: PendingDeploymentTransition[];
  isolations: PendingIsolationTransition[];
}

export function enumeratePendingTransitions(
  state: DemoState,
): PendingDemoTransitions {
  const deployments = state.environments.flatMap((environment) => {
    if (
      environment.status !== "Draft" &&
      environment.status !== "Deploying"
    ) {
      return [];
    }

    const currentStep = state.deploymentSteps[environment.id] ?? -1;
    return Array.from(
      { length: Math.max(0, 7 - currentStep) },
      (_, index): PendingDeploymentTransition => ({
        environmentId: environment.id,
        step: currentStep + index + 1,
      }),
    );
  });
  const isolations = state.securityIncidents.flatMap((incident) => {
    if (incident.status !== "Containing") {
      return [];
    }

    const currentStep = state.isolationSteps[incident.id] ?? -1;
    return Array.from(
      { length: Math.max(0, 5 - currentStep) },
      (_, index): PendingIsolationTransition => ({
        incidentId: incident.id,
        step: currentStep + index + 1,
      }),
    );
  });

  return { deployments, isolations };
}

export function applyIsolationStep(
  state: DemoState,
  incidentId: string,
  step: number,
): DemoState {
  const incident = state.securityIncidents.find(
    (candidate) => candidate.id === incidentId,
  );
  if (!incident) {
    return state;
  }

  const snapshot = isolationStateAt(step);
  const currentStep = state.isolationSteps[incidentId] ?? -1;
  if (snapshot.step <= currentStep) {
    return state;
  }

  const auditId = `audit-isolation-${incidentId}-${snapshot.step}`;
  const auditExists = state.auditEvents.some(
    (event) => event.id === auditId,
  );
  return {
    ...state,
    isolationSteps: {
      ...state.isolationSteps,
      [incidentId]: snapshot.step,
    },
    environments: state.environments.map((environment) =>
      environment.id === incident.environmentId &&
      snapshot.endpointState === "Isolated"
        ? { ...environment, status: "Isolated" as const, endpoint: "" }
        : environment,
    ),
    instances: state.instances.map((instance) =>
      instance.environmentId === incident.environmentId &&
      snapshot.endpointState === "Isolated"
        ? { ...instance, status: "Isolated" as const }
        : instance,
    ),
    securityIncidents: state.securityIncidents.map((candidate) =>
      candidate.id === incidentId
        ? {
            ...candidate,
            status: snapshot.modelIdentityRevoked
              ? ("Contained" as const)
              : ("Containing" as const),
          }
        : candidate,
    ),
    auditEvents: auditExists
      ? state.auditEvents
      : [
          ...state.auditEvents,
          {
            id: auditId,
            kind: "SECURITY",
            type: "ISOLATION_ADVANCED",
            actor: "security-controller",
            targetId: incident.environmentId,
            occurredAt: deterministicTimestamp(
              state.auditEvents.length + 300,
            ),
            summary: `Incident ${incidentId} entered ${snapshot.stage}`,
            details: {
              requestId: `req-demo-isolation-${incidentId}-${snapshot.step}`,
              operationId: `op-demo-isolation-${incidentId}-${snapshot.step}`,
              taskId: `task-demo-isolation-${incidentId}-${snapshot.step}`,
              incidentId,
              environmentId: incident.environmentId,
              stage: snapshot.stage,
            },
          },
        ],
  };
}

export function rollbackEnvironment(
  state: DemoState,
  environmentId: string,
): DemoState {
  const environment = state.environments.find(
    (candidate) => candidate.id === environmentId,
  );
  const failedRevision = state.revisions.find(
    (revision) =>
      revision.environmentId === environmentId &&
      revision.status === "Failed",
  );
  const stableRevision = state.revisions.find(
    (revision) =>
      revision.environmentId === environmentId &&
      revision.status === "Stable",
  );
  if (!environment || !failedRevision || !stableRevision) {
    return state;
  }

  const auditId = `audit-rollback-${environmentId}-${failedRevision.id}`;
  if (state.auditEvents.some((event) => event.id === auditId)) {
    return state;
  }

  const rollback = rollbackRevision(failedRevision.id, stableRevision.id);
  return {
    ...state,
    environments: state.environments.map((candidate) =>
      candidate.id === environmentId
        ? {
            ...candidate,
            desiredRevisionId: rollback.desiredRevisionId,
            status: "Running" as const,
          }
        : candidate,
    ),
    revisions: state.revisions.map((revision) =>
      revision.id === failedRevision.id
        ? { ...revision, status: "RolledBack" as const }
        : revision.id === stableRevision.id
          ? { ...revision, status: "Stable" as const }
          : revision,
    ),
    auditEvents: [
      ...state.auditEvents,
      {
        ...rollback.operation,
        id: auditId,
        occurredAt: deterministicTimestamp(state.auditEvents.length + 200),
        details: {
          ...rollback.operation.details,
          requestId: `req-demo-rollback-${environmentId}`,
          operationId: `op-demo-rollback-${environmentId}`,
          taskId: `task-demo-rollback-${environmentId}`,
          environmentId,
        },
      },
    ],
  };
}

export function resetDemoState(currentState?: DemoState): DemoState {
  const reset = createInitialDemoState();
  reset.generation = currentState ? currentState.generation + 1 : 0;
  return reset;
}

export function hydrateDemoState(value: unknown): DemoState {
  let candidate = value;

  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      return createInitialDemoState();
    }
  }

  return isHydratableState(candidate)
    ? clone(candidate)
    : createInitialDemoState();
}

export function resolveDemoStateForRender(
  persistedState: unknown,
  hasMounted: boolean,
): DemoState {
  return hasMounted
    ? hydrateDemoState(persistedState)
    : createInitialDemoState();
}

export function isCurrentGeneration(
  state: Pick<DemoState, "generation">,
  capturedGeneration: number,
): boolean {
  return state.generation === capturedGeneration;
}
