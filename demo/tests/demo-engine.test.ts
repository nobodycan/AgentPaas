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
