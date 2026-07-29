import { deploymentStateAt } from "./demo-engine.ts";
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

function isHydratableState(value: unknown): value is DemoState {
  if (!isRecord(value) || value.schemaVersion !== DEMO_SCHEMA_VERSION) {
    return false;
  }

  return (
    typeof value.generation === "number" &&
    Array.isArray(value.environments) &&
    Array.isArray(value.revisions) &&
    Array.isArray(value.instances) &&
    Array.isArray(value.profiles) &&
    Array.isArray(value.clusters) &&
    Array.isArray(value.auditEvents) &&
    Array.isArray(value.securityIncidents) &&
    isRecord(value.deploymentSteps) &&
    isRecord(value.isolationSteps)
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
  const desiredInstances = Math.max(1, Math.trunc(input.desiredInstances));
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
    secureTaskProfileId: input.secureTaskProfileId,
    identityProfileId: input.identityProfileId ?? "identity-workload",
    loggingProfileId: input.loggingProfileId ?? "logging-audit",
    domainProfileId: input.domainProfileId,
  };
  const revision: Revision = {
    id: revisionId,
    environmentId,
    sequence: revisionSequence,
    image: `registry.demo.local/${slugify(input.project || input.name)}:draft-${revisionSequence}`,
    status: "Pending",
    createdAt,
    createdBy: environment.owner,
  };
  const instances: Instance[] = Array.from(
    { length: desiredInstances },
    (_, index) => ({
      id: `ins-${slugify(input.name)}-${String(index + 1).padStart(2, "0")}`,
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

export function isCurrentGeneration(
  state: Pick<DemoState, "generation">,
  capturedGeneration: number,
): boolean {
  return state.generation === capturedGeneration;
}
