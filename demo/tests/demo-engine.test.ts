import assert from "node:assert/strict";
import test from "node:test";

import {
  deploymentStateAt,
  isolationStateAt,
  rollbackRevision,
  selectInstance,
} from "../lib/demo-engine.ts";

test("selectInstance keeps demo-user-1024 on ins-a across repeated calls", () => {
  const instances = [
    {
      id: "ins-a",
      environmentId: "env-production",
      revisionId: "rev-42",
      status: "Ready" as const,
      clusterId: "cluster-east",
      startedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "ins-b",
      environmentId: "env-production",
      revisionId: "rev-42",
      status: "Ready" as const,
      clusterId: "cluster-east",
      startedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "ins-starting",
      environmentId: "env-production",
      revisionId: "rev-43",
      status: "Starting" as const,
      clusterId: "cluster-east",
      startedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  assert.equal(selectInstance("demo-user-1024", instances).id, "ins-a");
  assert.equal(selectInstance("demo-user-1024", instances).id, "ins-a");
});

test("selectInstance rejects routing when no instance is ready", () => {
  assert.throws(
    () =>
      selectInstance("demo-user-1024", [
        {
          id: "ins-starting",
          environmentId: "env-production",
          revisionId: "rev-43",
          status: "Starting",
          clusterId: "cluster-east",
          startedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    /no ready instances/i,
  );
});

test("deploymentStateAt keeps the endpoint unavailable while deploying", () => {
  const snapshot = deploymentStateAt(5);

  assert.equal(snapshot.status, "Deploying");
  assert.equal(snapshot.endpointReady, false);
});

test("deploymentStateAt clamps steps and exposes the endpoint only at completion", () => {
  assert.equal(deploymentStateAt(-4).step, 0);
  assert.equal(deploymentStateAt(2.9).step, 2);
  assert.equal(deploymentStateAt(99).step, 7);
  assert.equal(deploymentStateAt(6).endpointReady, false);
  assert.equal(deploymentStateAt(7).status, "Running");
  assert.equal(deploymentStateAt(7).endpointReady, true);
});

test("rollbackRevision restores the stable desired revision and records an audit operation", () => {
  const result = rollbackRevision("rev-43", "rev-42");

  assert.equal(result.desiredRevisionId, "rev-42");
  assert.equal(result.operation.type, "REVISION_ROLLBACK");
  assert.deepEqual(result, rollbackRevision("rev-43", "rev-42"));
});

test("isolationStateAt completes endpoint isolation and identity revocation", () => {
  const snapshot = isolationStateAt(5);

  assert.equal(snapshot.endpointState, "Isolated");
  assert.equal(snapshot.egressBlocked, true);
  assert.equal(snapshot.workloadIdentityRevoked, true);
  assert.equal(snapshot.modelIdentityRevoked, true);
});

test("isolationStateAt clamps steps and records isolation progress", () => {
  assert.deepEqual(isolationStateAt(-1), isolationStateAt(0));
  assert.equal(isolationStateAt(3.8).step, 3);
  assert.deepEqual(isolationStateAt(99), isolationStateAt(5));

  assert.equal(isolationStateAt(0).endpointState, "Active");
  assert.equal(isolationStateAt(1).endpointState, "Isolating");
  assert.equal(isolationStateAt(2).endpointState, "Isolated");
  assert.equal(isolationStateAt(2).egressBlocked, false);
  assert.equal(isolationStateAt(3).egressBlocked, true);
  assert.equal(isolationStateAt(4).workloadIdentityRevoked, true);
  assert.equal(isolationStateAt(4).modelIdentityRevoked, false);
});

test("initial demo state exposes the complete deterministic control-plane dataset", async () => {
  const {
    FAILED_REVISION_ID,
    OPEN_INCIDENT_ID,
    PRIMARY_ENVIRONMENT_ID,
    STABLE_REVISION_ID,
  } = await import("../lib/mock-data.ts");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");

  const state = createInitialDemoState();

  assert.ok(state.environments.length >= 8);
  assert.ok(state.instances.length >= 20);
  assert.equal(state.clusters.length, 3);
  assert.ok(
    state.securityIncidents.some((incident) => incident.status === "Open"),
  );
  assert.ok(
    state.environments.some(
      (environment) => environment.id === PRIMARY_ENVIRONMENT_ID,
    ),
  );
  assert.ok(
    state.securityIncidents.some(
      (incident) => incident.id === OPEN_INCIDENT_ID,
    ),
  );
  assert.ok(
    state.revisions.some(
      (revision) =>
        revision.id === STABLE_REVISION_ID && revision.status === "Stable",
    ),
  );
  assert.ok(
    state.revisions.some(
      (revision) =>
        revision.id === FAILED_REVISION_ID && revision.status === "Failed",
    ),
  );
});

test("createInitialDemoState returns independent copies", async () => {
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const first = createInitialDemoState();
  const second = createInitialDemoState();

  first.environments[0].name = "mutated";
  Object.assign(first.auditEvents[0].details, { requestId: "mutated" });

  assert.notEqual(second.environments[0].name, "mutated");
  assert.notEqual(second.auditEvents[0].details.requestId, "mutated");
});

test("createEnvironment adds one Draft environment and one control-plane audit event", async () => {
  const { createEnvironment, createInitialDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const initial = createInitialDemoState();
  const created = createEnvironment(initial, {
    name: "Claims Preview",
    project: "claims",
    owner: "platform-demo",
    desiredInstances: 3,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  });

  assert.equal(created.environments.length, initial.environments.length + 1);
  const added = created.environments.filter(
    (environment) =>
      !initial.environments.some((current) => current.id === environment.id),
  );
  assert.equal(added.length, 1);
  assert.equal(added[0].status, "Draft");
  assert.equal(created.auditEvents.length, initial.auditEvents.length + 1);
  const audit = created.auditEvents.at(-1);
  assert.equal(audit?.kind, "CONTROL_PLANE");
  assert.equal(audit?.type, "ENVIRONMENT_CREATED");
  assert.ok(audit?.details.requestId);
  assert.ok(audit?.details.operationId);
  assert.ok(audit?.details.taskId);
  assert.equal(initial.environments.length, 10);
});

test("applyDeploymentStep exposes an endpoint and readies desired instances only at completion", async () => {
  const {
    applyDeploymentStep,
    createEnvironment,
    createInitialDemoState,
  } = await import("../lib/demo-state.ts");
  const created = createEnvironment(createInitialDemoState(), {
    name: "Invoice Assistant",
    project: "billing",
    owner: "platform-demo",
    desiredInstances: 3,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  });
  const environment = created.environments.at(-1);
  assert.ok(environment);

  const deploying = applyDeploymentStep(created, environment.id, 6);
  const beforeCompletion = deploying.environments.find(
    (candidate) => candidate.id === environment.id,
  );
  assert.equal(beforeCompletion?.status, "Deploying");
  assert.equal(beforeCompletion?.endpoint, "");

  const completed = applyDeploymentStep(deploying, environment.id, 7);
  const running = completed.environments.find(
    (candidate) => candidate.id === environment.id,
  );
  const desiredInstances = completed.instances.filter(
    (instance) => instance.environmentId === environment.id,
  );

  assert.equal(running?.status, "Running");
  assert.match(running?.endpoint ?? "", /^https:\/\//);
  assert.equal(desiredInstances.length, running?.desiredInstances);
  assert.ok(
    desiredInstances.every((instance) => instance.status === "Ready"),
  );
});

test("resetDemoState restores original counts and the open incident", async () => {
  const { OPEN_INCIDENT_ID } = await import("../lib/mock-data.ts");
  const {
    createEnvironment,
    createInitialDemoState,
    resetDemoState,
  } = await import("../lib/demo-state.ts");
  const initial = createInitialDemoState();
  const changed = createEnvironment(initial, {
    name: "Temporary",
    project: "demo",
    owner: "platform-demo",
    desiredInstances: 1,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  });

  const reset = resetDemoState(changed);

  assert.equal(reset.environments.length, initial.environments.length);
  assert.equal(reset.instances.length, initial.instances.length);
  assert.equal(reset.auditEvents.length, initial.auditEvents.length);
  assert.equal(
    reset.securityIncidents.find(
      (incident) => incident.id === OPEN_INCIDENT_ID,
    )?.status,
    "Open",
  );
});

test("hydrateDemoState preserves transient deployment and containment states", async () => {
  const { createInitialDemoState, hydrateDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const source = createInitialDemoState();
  source.environments[0].status = "Deploying";
  source.environments[1].status = "Isolated";
  source.securityIncidents[0].status = "Containing";

  const hydrated = hydrateDemoState(JSON.stringify(source));

  assert.equal(hydrated.environments[0].status, "Deploying");
  assert.equal(hydrated.environments[1].status, "Isolated");
  assert.equal(hydrated.securityIncidents[0].status, "Containing");

  const invalid = hydrateDemoState({ ...source, schemaVersion: 2 });
  assert.equal(invalid.schemaVersion, 1);
  assert.equal(invalid.environments.length, 10);
  assert.ok(
    invalid.securityIncidents.some((incident) => incident.status === "Open"),
  );
});

test("generation guard rejects callbacks captured before reset", async () => {
  const {
    createInitialDemoState,
    isCurrentGeneration,
    resetDemoState,
  } = await import("../lib/demo-state.ts");
  const initial = createInitialDemoState();
  const capturedGeneration = initial.generation;
  const reset = resetDemoState(initial);

  assert.equal(isCurrentGeneration(initial, capturedGeneration), true);
  assert.equal(isCurrentGeneration(reset, capturedGeneration), false);
  assert.equal(isCurrentGeneration(reset, reset.generation), true);
});

test("repeating a completed deployment transition does not duplicate audit events", async () => {
  const {
    applyDeploymentStep,
    createEnvironment,
    createInitialDemoState,
  } = await import("../lib/demo-state.ts");
  const created = createEnvironment(createInitialDemoState(), {
    name: "Idempotent Deploy",
    project: "demo",
    owner: "platform-demo",
    desiredInstances: 2,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  });
  const environmentId = created.environments.at(-1)?.id;
  assert.ok(environmentId);
  const completed = applyDeploymentStep(created, environmentId, 7);
  const auditCount = completed.auditEvents.length;

  const repeated = applyDeploymentStep(completed, environmentId, 7);

  assert.equal(repeated.auditEvents.length, auditCount);
  assert.deepEqual(repeated, completed);
});
