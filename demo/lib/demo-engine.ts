import type {
  AuditEvent,
  DeploymentSnapshot,
  DeploymentStage,
  Instance,
  IsolationSnapshot,
  IsolationStage,
} from "./types.ts";

const DEPLOYMENT_STAGES: readonly DeploymentStage[] = [
  "Queued",
  "RevisionValidated",
  "PoliciesApplied",
  "CapacityAllocated",
  "InstancesStarting",
  "HealthChecksRunning",
  "TrafficWarming",
  "Completed",
];

const ISOLATION_STAGES: readonly IsolationStage[] = [
  "IncidentDetected",
  "LoadBalancerDrained",
  "EndpointBlocked",
  "EgressDenied",
  "WorkloadIdentityRevoked",
  "ModelIdentityRevoked",
  "AnomalousInstanceStopped",
  "ImmutableReplacementRequested",
];

const ROLLBACK_OPERATION_ID = "audit-revision-rollback-001";
const ROLLBACK_OCCURRED_AT = "2026-01-15T10:30:00.000Z";

function clampStep(step: number, maximum: number): number {
  if (Number.isNaN(step)) {
    return 0;
  }

  return Math.min(maximum, Math.max(0, Math.trunc(step)));
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function selectInstance(
  sessionKey: string,
  instances: readonly Instance[],
): Instance {
  const readyInstances = instances
    .filter((instance) => instance.status === "Ready")
    .sort((left, right) => {
      if (left.id === right.id) {
        return 0;
      }

      return left.id < right.id ? -1 : 1;
    });

  if (readyInstances.length === 0) {
    throw new Error("Cannot select an instance: no ready instances are available.");
  }

  return readyInstances[stableHash(sessionKey) % readyInstances.length];
}

export function deploymentStateAt(step: number): DeploymentSnapshot {
  const normalizedStep = clampStep(step, DEPLOYMENT_STAGES.length - 1);
  const endpointReady = normalizedStep === DEPLOYMENT_STAGES.length - 1;

  return {
    step: normalizedStep,
    stage: DEPLOYMENT_STAGES[normalizedStep],
    status: endpointReady ? "Running" : "Deploying",
    endpointReady,
    progressPercent: Math.round(
      (normalizedStep / (DEPLOYMENT_STAGES.length - 1)) * 100,
    ),
  };
}

export interface RevisionRollback {
  failedRevisionId: string;
  desiredRevisionId: string;
  operation: AuditEvent;
}

export function rollbackRevision(
  failedRevisionId: string,
  stableRevisionId: string,
): RevisionRollback {
  return {
    failedRevisionId,
    desiredRevisionId: stableRevisionId,
    operation: {
      id: ROLLBACK_OPERATION_ID,
      kind: "CONTROL_PLANE",
      type: "REVISION_ROLLBACK",
      actor: "demo.operator",
      targetId: failedRevisionId,
      occurredAt: ROLLBACK_OCCURRED_AT,
      summary: `Rolled back ${failedRevisionId} to ${stableRevisionId}`,
      details: {
        failedRevisionId,
        stableRevisionId,
      },
    },
  };
}

export function isolationStateAt(step: number): IsolationSnapshot {
  const normalizedStep = clampStep(step, ISOLATION_STAGES.length - 1);

  return {
    step: normalizedStep,
    stage: ISOLATION_STAGES[normalizedStep],
    endpointState:
      normalizedStep === 0
        ? "Active"
        : normalizedStep === 1
          ? "Isolating"
          : "Isolated",
    lbDrained: normalizedStep >= 1,
    egressBlocked: normalizedStep >= 3,
    workloadIdentityRevoked: normalizedStep >= 4,
    modelIdentityRevoked: normalizedStep >= 5,
    anomalousInstanceStopped: normalizedStep >= 6,
    replacementRequested: normalizedStep >= 7,
  };
}
