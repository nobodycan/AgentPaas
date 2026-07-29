import assert from "node:assert/strict";
import test from "node:test";

import {
  deploymentStateAt,
  isolationStateAt,
  rollbackRevision,
  selectInstance,
} from "../lib/demo-engine.ts";
import {
  DEFAULT_WIZARD_INPUT,
  DEPLOYMENT_STAGE_COPY,
  INVESTMENT_OUTCOMES,
  deriveOverviewMetrics,
  environmentFilterOptions,
  filterEnvironments,
  validateWizardStep,
} from "../lib/view-models.ts";
import {
  ACCESS_RESPONSE_TOKENS,
  createAccessRequestSnapshot,
  createAccessResponsePlan,
  createAccessStreamState,
  reduceAccessStream,
  revisionDiff,
} from "../lib/runtime-view-models.ts";
import type { Environment } from "../lib/types.ts";

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

test("access response plan is deterministic and contains non-empty Chinese SSE tokens", () => {
  const access = {
    allowed: true,
    decision: "ALLOW" as const,
    reason: "入口策略模拟判定通过",
    sessionKey: "demo-user-1024",
    environmentId: "env-production",
    instanceId: "ins-a",
    policyId: "ingress-private",
    destination: "/v1/chat",
    auditEventId: "audit-access-test-001",
    requestId: "req-demo-access-001",
    request: createAccessRequestSnapshot({
      method: "POST",
      path: "/v1/chat",
      body: '{"message":"hello"}',
      sessionHeaderName: "X-Agent-Session-ID",
      sessionKey: "demo-user-1024",
    }),
    message: "Access routed to ins-a",
  };

  const first = createAccessResponsePlan(access);
  const second = createAccessResponsePlan(access);

  assert.deepEqual(first, second);
  assert.ok(first.tokens.length > 0);
  assert.deepEqual(first.tokens, ACCESS_RESPONSE_TOKENS);
  assert.ok(first.tokens.every((token) => token.trim().length > 0));
  assert.ok(first.tokens.some((token) => /[\u3400-\u9fff]/u.test(token)));
});

test("access request snapshot records the submitted method, body, path, and session header", () => {
  const submitted = createAccessRequestSnapshot({
    method: "post",
    path: " /v1/chat/completions ",
    body: '{"message":"hello"}',
    sessionHeaderName: " X-Agent-Session-ID ",
    sessionKey: "demo-user-1024",
  });

  assert.deepEqual(submitted, {
    method: "POST",
    path: "/v1/chat/completions",
    body: '{"message":"hello"}',
    sessionHeaderName: "X-Agent-Session-ID",
    sessionKey: "demo-user-1024",
  });
});

test("correlationFromSearch decodes one exact correlation query value", async () => {
  const routes = await import("../lib/routes.ts");
  const correlationFromSearch = Reflect.get(
    routes,
    "correlationFromSearch",
  );
  assert.equal(typeof correlationFromSearch, "function");

  assert.equal(
    correlationFromSearch("?correlation=req-demo-access-001"),
    "req-demo-access-001",
  );
  assert.equal(
    correlationFromSearch(
      "?other=1&correlation=op-demo%20access%20001#ignored",
    ),
    "op-demo access 001",
  );
  assert.equal(correlationFromSearch("?correlation=%20%20"), "");
  assert.equal(correlationFromSearch(""), "");
});

test("auditCorrelationNavigation clears both the draft and active query", async () => {
  const routes = await import("../lib/routes.ts");
  const auditCorrelationNavigation = Reflect.get(
    routes,
    "auditCorrelationNavigation",
  );
  assert.equal(typeof auditCorrelationNavigation, "function");

  assert.deepEqual(auditCorrelationNavigation(""), {
    draftCorrelation: "",
    destination: "/audit",
  });
  assert.deepEqual(auditCorrelationNavigation(" req-demo-001 "), {
    draftCorrelation: "req-demo-001",
    destination: "/audit?correlation=req-demo-001",
  });
});

test("audit correlation matches exact Request, Operation, or Task ID", async () => {
  const runtimeViewModels = await import(
    "../lib/runtime-view-models.ts"
  );
  const filterAuditEventsByCorrelation = Reflect.get(
    runtimeViewModels,
    "filterAuditEventsByCorrelation",
  );
  assert.equal(typeof filterAuditEventsByCorrelation, "function");
  const events = [
    {
      id: "audit-1",
      kind: "ACCESS",
      type: "ACCESS_TEST",
      actor: "demo",
      targetId: "env-1",
      occurredAt: "2026-07-30T00:00:00.000Z",
      summary: "first",
      details: {
        requestId: "req-1",
        operationId: "op-1",
        taskId: "task-1",
      },
    },
    {
      id: "audit-2",
      kind: "RUNTIME",
      type: "INSTANCE_REPLACE",
      actor: "demo",
      targetId: "env-1",
      occurredAt: "2026-07-30T00:00:01.000Z",
      summary: "second",
      details: {
        requestId: "req-10",
        operationId: "op-10",
        taskId: "task-10",
      },
    },
  ];

  assert.deepEqual(
    filterAuditEventsByCorrelation(events, "req-1").map(
      (event: { id: string }) => event.id,
    ),
    ["audit-1"],
  );
  assert.deepEqual(
    filterAuditEventsByCorrelation(events, "op-10").map(
      (event: { id: string }) => event.id,
    ),
    ["audit-2"],
  );
  assert.deepEqual(
    filterAuditEventsByCorrelation(events, "task-1").map(
      (event: { id: string }) => event.id,
    ),
    ["audit-1"],
  );
  assert.deepEqual(filterAuditEventsByCorrelation(events, "req"), []);
});

test("evaluateAccessRequest allows only the configured inbound Agent endpoint", async () => {
  const runtimeViewModels = await import(
    "../lib/runtime-view-models.ts"
  );
  const evaluateAccessRequest = Reflect.get(
    runtimeViewModels,
    "evaluateAccessRequest",
  );
  assert.equal(typeof evaluateAccessRequest, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const environment = state.environments.find(
    (candidate) => candidate.id === "env-customer-service-prod",
  );
  assert.ok(environment);
  const configuredEnvironment = {
    ...environment,
    sessionHeader: "X-Agent-Session-ID",
  };
  const request = createAccessRequestSnapshot({
    method: "POST",
    path: "/v1/chat/completions",
    body: '{"message":"hello"}',
    sessionHeaderName: "X-Agent-Session-ID",
    sessionKey: "demo-user-1024",
  });

  assert.deepEqual(
    evaluateAccessRequest(configuredEnvironment, request, true),
    {
      allowed: true,
      decision: "ALLOW",
      reason: "入口策略模拟判定通过",
      policyId: configuredEnvironment.ingressProfileId,
    },
  );
});

test("evaluateAccessRequest denies every unsupported or unsafe inbound request", async () => {
  const runtimeViewModels = await import(
    "../lib/runtime-view-models.ts"
  );
  const evaluateAccessRequest = Reflect.get(
    runtimeViewModels,
    "evaluateAccessRequest",
  );
  assert.equal(typeof evaluateAccessRequest, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const environment = state.environments.find(
    (candidate) => candidate.id === "env-customer-service-prod",
  );
  assert.ok(environment);
  const configuredEnvironment = {
    ...environment,
    sessionHeader: "X-Agent-Session-ID",
  };
  const request = createAccessRequestSnapshot({
    method: "POST",
    path: "/v1/chat/completions",
    body: '{"message":"hello"}',
    sessionHeaderName: "X-Agent-Session-ID",
    sessionKey: "demo-user-1024",
  });
  const denials = [
    {
      environment: undefined,
      request,
      hasReady: true,
      reason: /不存在/u,
    },
    {
      environment: { ...configuredEnvironment, status: "Stopped" },
      request,
      hasReady: true,
      reason: /Running/u,
    },
    {
      environment: { ...configuredEnvironment, ingressProfileId: "" },
      request,
      hasReady: true,
      reason: /IngressProfile/u,
    },
    {
      environment: configuredEnvironment,
      request: { ...request, method: "GET" },
      hasReady: true,
      reason: /POST/u,
    },
    {
      environment: configuredEnvironment,
      request: { ...request, path: "/health" },
      hasReady: true,
      reason: /\/v1\/chat\/completions/u,
    },
    {
      environment: configuredEnvironment,
      request: {
        ...request,
        sessionHeaderName: "X-Wrong-Session",
      },
      hasReady: true,
      reason: /Session Header/u,
    },
    {
      environment: configuredEnvironment,
      request: { ...request, body: " " },
      hasReady: true,
      reason: /不能为空/u,
    },
    {
      environment: configuredEnvironment,
      request: { ...request, body: "not-json" },
      hasReady: true,
      reason: /有效 JSON/u,
    },
    {
      environment: configuredEnvironment,
      request,
      hasReady: false,
      reason: /Ready/u,
    },
  ];

  for (const denial of denials) {
    const result = evaluateAccessRequest(
      denial.environment,
      denial.request,
      denial.hasReady,
    );
    assert.equal(result.allowed, false);
    assert.equal(result.decision, "DENY");
    assert.match(result.reason, denial.reason);
  }
});

test("denied access does not expose SSE success tokens", () => {
  const denied = createAccessResponsePlan({
    allowed: false,
    decision: "DENY",
    reason: "入口仅支持 POST",
    sessionKey: "demo-user-1024",
    environmentId: "env-production",
    policyId: "ingress-private",
    destination: "/v1/chat/completions",
    auditEventId: "audit-access-test-001",
    requestId: "req-demo-access-001",
    request: createAccessRequestSnapshot({
      method: "GET",
      path: "/v1/chat/completions",
      body: "",
      sessionHeaderName: "X-Agent-Session-ID",
      sessionKey: "demo-user-1024",
    }),
    message: "Denied",
  });

  assert.deepEqual(denied.tokens, []);
});

test("runtimePanelKey scopes local state by panel, environment, and generation", async () => {
  const runtimeViewModels = await import(
    "../lib/runtime-view-models.ts"
  );
  const runtimePanelKey = Reflect.get(
    runtimeViewModels,
    "runtimePanelKey",
  );
  assert.equal(typeof runtimePanelKey, "function");

  assert.equal(
    runtimePanelKey("access", "env-a", 1),
    "access:env-a:generation-1",
  );
  assert.notEqual(
    runtimePanelKey("access", "env-a", 1),
    runtimePanelKey("access", "env-b", 1),
  );
  assert.notEqual(
    runtimePanelKey("revisions", "env-a", 1),
    runtimePanelKey("revisions", "env-a", 2),
  );
});

test("securityProfileEvidence keeps optional SecureTask unbound without failing active baseline rows", async () => {
  const runtimeViewModels = await import(
    "../lib/runtime-view-models.ts"
  );
  const securityProfileEvidence = Reflect.get(
    runtimeViewModels,
    "securityProfileEvidence",
  );
  assert.equal(typeof securityProfileEvidence, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const environment = state.environments.find(
    (candidate) => candidate.id === "env-knowledge-prod",
  );
  assert.ok(environment);

  const rows = securityProfileEvidence(environment);
  const secureTask = rows.find(
    (row: { kind: string }) => row.kind === "SecureTaskProfile",
  );
  const ingress = rows.find(
    (row: { kind: string }) => row.kind === "IngressProfile",
  );

  assert.deepEqual(secureTask, {
    kind: "SecureTaskProfile",
    profileId: "未绑定",
    status: "可选 · 未绑定",
    active: false,
  });
  assert.equal(ingress?.profileId, environment.ingressProfileId);
  assert.equal(ingress?.status, "已绑定");
  assert.equal(ingress?.active, true);
});

test("access stream cancel keeps emitted text and rejects late or stale tokens", () => {
  const started = reduceAccessStream(createAccessStreamState(), {
    type: "start",
    streamId: "stream-1",
    requestId: "req-1",
  });
  const emitted = reduceAccessStream(started, {
    type: "append",
    streamId: "stream-1",
    token: "你好",
  });
  const cancelled = reduceAccessStream(emitted, {
    type: "cancel",
    streamId: "stream-1",
  });

  assert.equal(cancelled.output, "你好");
  assert.equal(cancelled.requestId, "req-1");
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(
    reduceAccessStream(cancelled, {
      type: "append",
      streamId: "stream-1",
      token: "，这段不应出现",
    }),
    cancelled,
  );
  assert.deepEqual(
    reduceAccessStream(cancelled, {
      type: "append",
      streamId: "stream-0",
      token: "旧回调",
    }),
    cancelled,
  );
});

test("starting a new access stream invalidates callbacks from the previous stream", () => {
  const oldStream = reduceAccessStream(createAccessStreamState(), {
    type: "start",
    streamId: "stream-1",
    requestId: "req-1",
  });
  const newStream = reduceAccessStream(oldStream, {
    type: "start",
    streamId: "stream-2",
    requestId: "req-2",
  });
  const afterStaleAppend = reduceAccessStream(newStream, {
    type: "append",
    streamId: "stream-1",
    token: "旧响应",
  });

  assert.equal(newStream.streamId, "stream-2");
  assert.equal(newStream.requestId, "req-2");
  assert.equal(newStream.output, "");
  assert.deepEqual(afterStaleAppend, newStream);
});

test("revisionDiff exposes image, digest, status, configuration changes, and failure reason", async () => {
  const { FAILED_REVISION_ID, STABLE_REVISION_ID } = await import(
    "../lib/mock-data.ts"
  );
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const stable = state.revisions.find(
    (revision) => revision.id === STABLE_REVISION_ID,
  );
  const failed = state.revisions.find(
    (revision) => revision.id === FAILED_REVISION_ID,
  );
  assert.ok(stable);
  assert.ok(failed);

  const diff = revisionDiff(stable, failed);

  assert.equal(diff.fromRevisionId, STABLE_REVISION_ID);
  assert.equal(diff.toRevisionId, FAILED_REVISION_ID);
  assert.ok(diff.failureReason);
  assert.ok(
    ["image", "digest", "status", "runtimePlan", "ingress", "egress"].every(
      (field) => diff.changes.some((change) => change.field === field),
    ),
  );
  assert.ok(diff.changes.every((change) => change.before !== change.after));
});

test("replaceEnvironmentInstance drains one ready instance and creates one deterministic ready replacement", async () => {
  const stateModule = await import("../lib/demo-state.ts");
  const initial = stateModule.createInitialDemoState();
  const environmentId = "env-customer-service-prod";
  const instanceId = "ins-cs-01";
  const beforeEnvironment = initial.environments.find(
    (environment) => environment.id === environmentId,
  );
  assert.ok(beforeEnvironment);

  const replaced = stateModule.replaceEnvironmentInstance(
    initial,
    environmentId,
    instanceId,
  );
  const oldInstance = replaced.instances.find(
    (instance) => instance.id === instanceId,
  );
  const replacement = replaced.instances.find(
    (instance) =>
      instance.environmentId === environmentId &&
      instance.id !== instanceId &&
      instance.id.startsWith(`${instanceId}-replacement-`),
  );
  const afterEnvironment = replaced.environments.find(
    (environment) => environment.id === environmentId,
  );
  const replacementAudits = replaced.auditEvents.filter(
    (event) =>
      event.type === "INSTANCE_REPLACE" &&
      event.details.instanceId === instanceId,
  );

  assert.equal(oldInstance?.status, "Draining");
  assert.equal(replacement?.status, "Ready");
  assert.equal(replacement?.revisionId, oldInstance?.revisionId);
  assert.equal(replacement?.clusterId, oldInstance?.clusterId);
  assert.equal(
    afterEnvironment?.readyInstances,
    beforeEnvironment.readyInstances,
  );
  assert.equal(replacementAudits.length, 1);

  const repeated = stateModule.replaceEnvironmentInstance(
    replaced,
    environmentId,
    instanceId,
  );
  assert.deepEqual(repeated, replaced);
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

test("isolationStateAt completes all seven containment actions", () => {
  const snapshot = isolationStateAt(7);

  assert.equal(snapshot.endpointState, "Isolated");
  assert.equal(snapshot.lbDrained, true);
  assert.equal(snapshot.egressBlocked, true);
  assert.equal(snapshot.workloadIdentityRevoked, true);
  assert.equal(snapshot.modelIdentityRevoked, true);
  assert.equal(snapshot.anomalousInstanceStopped, true);
  assert.equal(snapshot.replacementRequested, true);
});

test("isolationStateAt clamps steps and records isolation progress", () => {
  assert.deepEqual(isolationStateAt(-1), isolationStateAt(0));
  assert.equal(isolationStateAt(3.8).step, 3);
  assert.deepEqual(isolationStateAt(99), isolationStateAt(7));

  assert.equal(isolationStateAt(0).endpointState, "Active");
  assert.equal(isolationStateAt(1).lbDrained, true);
  assert.equal(isolationStateAt(1).endpointState, "Isolating");
  assert.equal(isolationStateAt(2).endpointState, "Isolated");
  assert.equal(isolationStateAt(2).egressBlocked, false);
  assert.equal(isolationStateAt(3).egressBlocked, true);
  assert.equal(isolationStateAt(4).workloadIdentityRevoked, true);
  assert.equal(isolationStateAt(4).modelIdentityRevoked, false);
  assert.equal(isolationStateAt(5).modelIdentityRevoked, true);
  assert.equal(isolationStateAt(6).anomalousInstanceStopped, true);
  assert.equal(isolationStateAt(7).replacementRequested, true);
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

test("createEnvironment persists the wizard image, port, endpoint visibility, and session header", async () => {
  const { createEnvironment, createInitialDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const created = createEnvironment(createInitialDemoState(), {
    name: "Procurement Assistant",
    project: "supply-chain / production",
    owner: "Wang Min",
    image:
      "registry.internal.example.com/agents/procurement-assistant:1.4.0",
    containerPort: 8080,
    desiredInstances: 2,
    runtimePlanId: "balanced-2c4g",
    ingressProfileId: "internal-sso-sse",
    egressProfileId: "approved-model-and-tools",
    endpointVisibility: "internal",
    sessionHeader: "X-Agent-Session-ID",
  });
  const environment = created.environments.at(-1);
  assert.ok(environment);
  const revision = created.revisions.find(
    (candidate) => candidate.id === environment.desiredRevisionId,
  );

  assert.equal(
    revision?.image,
    "registry.internal.example.com/agents/procurement-assistant:1.4.0",
  );
  assert.equal(environment.containerPort, 8080);
  assert.equal(environment.endpointVisibility, "internal");
  assert.equal(environment.sessionHeader, "X-Agent-Session-ID");
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

test("creating the same environment name twice keeps every instance ID unique", async () => {
  const { createEnvironment, createInitialDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const input = {
    name: "Repeated Demo",
    project: "demo",
    owner: "platform-demo",
    desiredInstances: 2,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  };
  const first = createEnvironment(createInitialDemoState(), input);
  const second = createEnvironment(first, input);
  const instanceIds = second.instances.map((instance) => instance.id);

  assert.equal(new Set(instanceIds).size, instanceIds.length);
});

test("rollbackEnvironment ignores unknown environments and environments without a failed revision", async () => {
  const stateModule = await import("../lib/demo-state.ts");
  const rollbackEnvironment = Reflect.get(
    stateModule,
    "rollbackEnvironment",
  );
  assert.equal(typeof rollbackEnvironment, "function");

  const initial = stateModule.createInitialDemoState();
  const unknownResult = rollbackEnvironment(initial, "env-does-not-exist");
  const noFailedRevisionResult = rollbackEnvironment(
    initial,
    "env-payments-prod",
  );

  assert.deepEqual(unknownResult, initial);
  assert.deepEqual(noFailedRevisionResult, initial);
  assert.equal(unknownResult.auditEvents.length, initial.auditEvents.length);
  assert.equal(
    noFailedRevisionResult.auditEvents.length,
    initial.auditEvents.length,
  );
});

test("hydrateDemoState rejects malformed entities and transition records", async () => {
  const { createInitialDemoState, hydrateDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const initial = createInitialDemoState();
  const malformedStates = [
    { ...initial, environments: [null] },
    { ...initial, revisions: [{}] },
    { ...initial, instances: [null] },
    { ...initial, profiles: [{ ...initial.profiles[0], controls: null }] },
    { ...initial, clusters: [{ ...initial.clusters[0], dedicated: false }] },
    {
      ...initial,
      auditEvents: [{ ...initial.auditEvents[0], details: null }],
    },
    {
      ...initial,
      securityIncidents: [
        { ...initial.securityIncidents[0], auditEventIds: [null] },
      ],
    },
    { ...initial, deploymentSteps: { "env-broken": "three" } },
    { ...initial, isolationSteps: { "sec-broken": null } },
  ];

  for (const malformed of malformedStates) {
    assert.deepEqual(hydrateDemoState(malformed), initial);
  }
});

test("createEnvironment clamps unsafe desired instance counts to 1 through 8", async () => {
  const { createEnvironment, createInitialDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const expectedCounts = [
    { requested: Number.NaN, expected: 1 },
    { requested: Number.POSITIVE_INFINITY, expected: 8 },
    { requested: Number.MAX_SAFE_INTEGER, expected: 8 },
  ];

  for (const { requested, expected } of expectedCounts) {
    const created = createEnvironment(createInitialDemoState(), {
      name: `Capacity ${String(requested)}`,
      project: "demo",
      owner: "platform-demo",
      desiredInstances: requested,
      runtimePlanId: "runtime-balanced",
      ingressProfileId: "ingress-private",
      egressProfileId: "egress-restricted",
    });
    const environment = created.environments.at(-1);
    assert.equal(environment?.desiredInstances, expected);
    assert.equal(
      created.instances.filter(
        (instance) => instance.environmentId === environment?.id,
      ).length,
      expected,
    );
  }
});

test("resolveDemoStateForRender defers persisted state until after mount", async () => {
  const stateModule = await import("../lib/demo-state.ts");
  const resolveDemoStateForRender = Reflect.get(
    stateModule,
    "resolveDemoStateForRender",
  );
  assert.equal(typeof resolveDemoStateForRender, "function");

  const initial = stateModule.createInitialDemoState();
  const persisted = stateModule.createEnvironment(initial, {
    name: "Persisted Environment",
    project: "demo",
    owner: "platform-demo",
    desiredInstances: 1,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  });

  assert.deepEqual(
    resolveDemoStateForRender(JSON.stringify(persisted), false),
    initial,
  );
  assert.deepEqual(
    resolveDemoStateForRender(JSON.stringify(persisted), true),
    stateModule.hydrateDemoState(JSON.stringify(persisted)),
  );
});

test("enumeratePendingTransitions returns only unfinished deployment steps", async () => {
  const stateModule = await import("../lib/demo-state.ts");
  const enumeratePendingTransitions = Reflect.get(
    stateModule,
    "enumeratePendingTransitions",
  );
  assert.equal(typeof enumeratePendingTransitions, "function");

  const created = stateModule.createEnvironment(
    stateModule.createInitialDemoState(),
    {
      name: "Resumable Deploy",
      project: "demo",
      owner: "platform-demo",
      desiredInstances: 2,
      runtimePlanId: "runtime-balanced",
      ingressProfileId: "ingress-private",
      egressProfileId: "egress-restricted",
    },
  );
  const environmentId = created.environments.at(-1)?.id;
  assert.ok(environmentId);
  const inProgress = stateModule.applyDeploymentStep(
    created,
    environmentId,
    3,
  );
  const pending = enumeratePendingTransitions(inProgress);

  assert.deepEqual(
    pending.deployments
      .filter(
        (transition: { environmentId: string }) =>
          transition.environmentId === environmentId,
      )
      .map((transition: { step: number }) => transition.step),
    [4, 5, 6, 7],
  );

  const completed = stateModule.applyDeploymentStep(
    inProgress,
    environmentId,
    7,
  );
  assert.equal(
    enumeratePendingTransitions(completed).deployments.some(
      (transition: { environmentId: string }) =>
        transition.environmentId === environmentId,
    ),
    false,
  );
});

test("enumeratePendingTransitions returns only unfinished isolation steps", async () => {
  const { OPEN_INCIDENT_ID } = await import("../lib/mock-data.ts");
  const stateModule = await import("../lib/demo-state.ts");
  const enumeratePendingTransitions = Reflect.get(
    stateModule,
    "enumeratePendingTransitions",
  );
  const applyIsolationStep = Reflect.get(stateModule, "applyIsolationStep");
  assert.equal(typeof enumeratePendingTransitions, "function");
  assert.equal(typeof applyIsolationStep, "function");

  const containing = stateModule.createInitialDemoState();
  containing.securityIncidents[0].status = "Containing";
  containing.isolationSteps[OPEN_INCIDENT_ID] = 2;
  assert.deepEqual(
    enumeratePendingTransitions(containing).isolations
      .filter(
        (transition: { incidentId: string }) =>
          transition.incidentId === OPEN_INCIDENT_ID,
      )
      .map((transition: { step: number }) => transition.step),
    [3, 4, 5, 6, 7],
  );

  const completed = applyIsolationStep(containing, OPEN_INCIDENT_ID, 7);
  assert.equal(
    enumeratePendingTransitions(completed).isolations.some(
      (transition: { incidentId: string }) =>
        transition.incidentId === OPEN_INCIDENT_ID,
    ),
    false,
  );
});

test("parseRoute recognizes primary list and governance routes", async () => {
  const { parseRoute } = await import("../lib/routes.ts");

  assert.deepEqual(parseRoute("/overview"), { view: "overview" });
  assert.deepEqual(parseRoute("/environments"), {
    view: "environment-list",
  });
  assert.deepEqual(parseRoute("/environments/new"), {
    view: "environment-create",
  });
  assert.deepEqual(parseRoute("/audit"), { view: "audit" });
  assert.deepEqual(parseRoute("/security-events"), {
    view: "security-events",
  });
  assert.deepEqual(parseRoute("/resource-pools"), {
    view: "resource-pools",
  });
  assert.deepEqual(parseRoute("/profiles"), { view: "profiles" });
});

test("parseRoute recognizes every environment detail tab", async () => {
  const { ENVIRONMENT_TABS, parseRoute } = await import("../lib/routes.ts");

  assert.deepEqual(ENVIRONMENT_TABS, [
    "overview",
    "access",
    "config",
    "instances",
    "revisions",
    "observability",
    "security",
    "operations",
  ]);

  for (const tab of ENVIRONMENT_TABS) {
    assert.deepEqual(parseRoute(`/environments/env-1/${tab}`), {
      view: "environment-detail",
      environmentId: "env-1",
      tab,
    });
  }
});

test("parseRoute returns not-found for unknown paths and detail tabs", async () => {
  const { parseRoute } = await import("../lib/routes.ts");

  assert.deepEqual(parseRoute("/unknown"), { view: "not-found" });
  assert.deepEqual(parseRoute("/environments/env-1/unknown"), {
    view: "not-found",
  });
});

test("the seven-step demo guide has stable product destinations", async () => {
  const { DEMO_STEPS } = await import("../lib/routes.ts");

  assert.deepEqual(
    DEMO_STEPS.map((step) => step.destination),
    [
      "/overview",
      "/environments",
      "/environments/new",
      "/environments/env-customer-service-prod/access",
      "/environments/env-customer-service-prod/revisions",
      "/security-events",
      "/audit",
    ],
  );
});

test("getNextDemoStep advances, wraps, and resets unknown progress", async () => {
  const { DEMO_STEPS, getNextDemoStep } = await import("../lib/routes.ts");

  assert.deepEqual(getNextDemoStep(DEMO_STEPS[0].id), DEMO_STEPS[1]);
  assert.deepEqual(
    getNextDemoStep(DEMO_STEPS.at(-1)?.id),
    DEMO_STEPS[0],
  );
  assert.deepEqual(getNextDemoStep(), DEMO_STEPS[0]);
  assert.deepEqual(getNextDemoStep("not-a-step"), DEMO_STEPS[0]);
});

const FILTER_ENVIRONMENTS: Environment[] = [
  {
    id: "env-customer-prod",
    name: "Customer Agent Production",
    project: "customer-service",
    owner: "CX Platform",
    status: "Running",
    endpoint: "https://customer.example.test",
    desiredRevisionId: "rev-3",
    readyInstances: 2,
    desiredInstances: 2,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  },
  {
    id: "env-claims-prod",
    name: "Claims Assistant",
    project: "claims",
    owner: "Claims Platform",
    status: "Degraded",
    endpoint: "https://claims.example.test",
    desiredRevisionId: "rev-2",
    readyInstances: 1,
    desiredInstances: 2,
    runtimePlanId: "runtime-high-memory",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  },
  {
    id: "env-customer-staging",
    name: "Customer Agent Staging",
    project: "customer-service",
    owner: "CX Platform",
    status: "Running",
    endpoint: "",
    desiredRevisionId: "rev-1",
    readyInstances: 1,
    desiredInstances: 1,
    runtimePlanId: "runtime-balanced",
    ingressProfileId: "ingress-private",
    egressProfileId: "egress-restricted",
  },
];

test("filterEnvironments combines a trimmed case-insensitive query with exact filters in stable order", () => {
  const result = filterEnvironments(FILTER_ENVIRONMENTS, {
    query: "  CUSTOMER AGENT  ",
    status: "Running",
    project: "customer-service",
    runtimePlanId: "runtime-balanced",
  });

  assert.deepEqual(
    result.map((environment) => environment.id),
    ["env-customer-prod", "env-customer-staging"],
  );
  assert.equal(result[0], FILTER_ENVIRONMENTS[0]);
  assert.equal(result[1], FILTER_ENVIRONMENTS[2]);
});

test("environmentFilterOptions returns unique sorted exact options", () => {
  assert.deepEqual(environmentFilterOptions(FILTER_ENVIRONMENTS), {
    projects: ["claims", "customer-service"],
    runtimePlans: ["runtime-balanced", "runtime-high-memory"],
    statuses: ["Degraded", "Running"],
  });
});

test("validateWizardStep marks each four-step required field", () => {
  assert.deepEqual(
    Object.keys(
      validateWizardStep(
        {
          ...DEFAULT_WIZARD_INPUT,
          name: " ",
          project: "",
          owner: "",
        },
        1,
      ),
    ),
    ["name", "project", "owner"],
  );
  assert.deepEqual(
    Object.keys(
      validateWizardStep(
        {
          ...DEFAULT_WIZARD_INPUT,
          image: "",
          containerPort: 0,
          runtimePlanId: "",
          desiredInstances: 0,
        },
        2,
      ),
    ),
    ["image", "containerPort", "runtimePlanId", "desiredInstances"],
  );
  assert.deepEqual(
    Object.keys(
      validateWizardStep(
        {
          ...DEFAULT_WIZARD_INPUT,
          ingressProfileId: "",
          egressProfileId: "",
          securityBaseline: false,
        },
        3,
      ),
    ),
    ["ingressProfileId", "egressProfileId", "securityBaseline"],
  );
  assert.deepEqual(
    Object.keys(
      validateWizardStep(
        {
          ...DEFAULT_WIZARD_INPUT,
          endpointVisibility: "",
          sessionHeader: "",
        },
        4,
      ),
    ),
    ["endpointVisibility", "sessionHeader"],
  );
});

test("validateWizardStep accepts the complete provided wizard defaults", () => {
  for (const step of [1, 2, 3, 4] as const) {
    assert.deepEqual(validateWizardStep(DEFAULT_WIZARD_INPUT, step), {});
  }
});

test("deployment progress uses the eight approved business labels in order", () => {
  assert.deepEqual(DEPLOYMENT_STAGE_COPY, [
    "配置已接受",
    "镜像 Digest 已固化",
    "身份与网络策略已生效",
    "SecureTaskProfile 已校验",
    "实例已启动",
    "健康检查通过",
    "LB 后端已注册",
    "HTTPS Endpoint Ready",
  ]);
});

test("resolveImageDigest returns a stable demo sha256-shaped digest for a tagged image", async () => {
  const viewModels = await import("../lib/view-models.ts");
  const resolveImageDigest = Reflect.get(
    viewModels,
    "resolveImageDigest",
  );
  assert.equal(typeof resolveImageDigest, "function");

  const image =
    "registry.internal.example.com/agents/procurement-assistant:1.4.0";
  const digest = resolveImageDigest(image);

  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(resolveImageDigest(image), digest);
  assert.notEqual(
    resolveImageDigest(
      "registry.internal.example.com/agents/procurement-assistant:1.4.1",
    ),
    digest,
  );
});

test("createEnvironment records the stable digest while preserving the original image tag", async () => {
  const { createEnvironment, createInitialDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const image =
    "registry.internal.example.com/agents/procurement-assistant:1.4.0";
  const input = {
    name: "Procurement Digest Evidence",
    project: "supply-chain / production",
    owner: "Wang Min",
    image,
    containerPort: 8080,
    desiredInstances: 2,
    runtimePlanId: "balanced-2c4g",
    ingressProfileId: "internal-sso-sse",
    egressProfileId: "approved-model-and-tools",
    endpointVisibility: "internal",
    sessionHeader: "X-Agent-Session-ID",
  };
  const first = createEnvironment(createInitialDemoState(), input);
  const second = createEnvironment(createInitialDemoState(), input);
  const firstRevision = first.revisions.at(-1);
  const secondRevision = second.revisions.at(-1);

  assert.equal(firstRevision?.image, image);
  assert.match(
    firstRevision?.imageDigest ?? "",
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.equal(firstRevision?.imageDigest, secondRevision?.imageDigest);
});

test("overview metrics derive live counts and investment outcomes are marked as mock", async () => {
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const metrics = deriveOverviewMetrics(state);

  assert.equal(metrics.environmentCount, state.environments.length);
  assert.equal(
    metrics.readyInstanceCount,
    state.instances.filter((instance) => instance.status === "Ready").length,
  );
  assert.equal(
    metrics.recentReleaseCount,
    state.revisions.filter(
      (revision) =>
        revision.status === "Stable" ||
        revision.status === "Deploying",
    ).length,
  );
  assert.equal(metrics.governanceHealth, "需关注");
  assert.deepEqual(
    INVESTMENT_OUTCOMES.map(({ copy, isMock }) => ({ copy, isMock })),
    [
      { copy: "镜像到 Endpoint 3 天 → 18 分钟", isMock: true },
      { copy: "上线协作 6 个团队 → 1 个入口", isMock: true },
      { copy: "人工步骤 23 → 5", isMock: true },
    ],
  );
});

test("copyEndpoint reports Clipboard API success without using the legacy fallback", async () => {
  const { copyEndpoint } = await import("../lib/clipboard.ts");
  const writes: string[] = [];

  const copied = await copyEndpoint("https://agent.example.test", {
    clipboard: {
      async writeText(value: string) {
        writes.push(value);
      },
    },
    document: null,
  });

  assert.equal(copied, true);
  assert.deepEqual(writes, ["https://agent.example.test"]);
});

test("copyEndpoint falls back to a temporary textarea and reports the real execCommand result", async () => {
  const { copyEndpoint } = await import("../lib/clipboard.ts");
  const events: string[] = [];
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute(name: string) {
      events.push(`attribute:${name}`);
    },
    focus() {
      events.push("focus");
    },
    select() {
      events.push("select");
    },
  };
  const document = {
    body: {
      appendChild() {
        events.push("append");
      },
      removeChild() {
        events.push("remove");
      },
    },
    createElement(tagName: string) {
      events.push(`create:${tagName}`);
      return textarea;
    },
    execCommand(command: string) {
      events.push(`command:${command}`);
      return true;
    },
  };

  const copied = await copyEndpoint("https://fallback.example.test", {
    clipboard: {
      async writeText() {
        throw new Error("clipboard denied");
      },
    },
    document,
  });

  assert.equal(copied, true);
  assert.equal(textarea.value, "https://fallback.example.test");
  assert.deepEqual(events, [
    "create:textarea",
    "attribute:readonly",
    "append",
    "focus",
    "select",
    "command:copy",
    "remove",
  ]);

  document.execCommand = () => false;
  assert.equal(
    await copyEndpoint("https://fallback.example.test", {
      clipboard: null,
      document,
    }),
    false,
  );
});

test("copyEndpoint restores the previously focused element after fallback success or failure", async () => {
  const { copyEndpoint } = await import("../lib/clipboard.ts");

  for (const commandResult of [true, false]) {
    const events: string[] = [];
    const previouslyFocused = {
      focus() {
        events.push("restore-focus");
      },
    };
    const textarea = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute() {},
      focus() {
        events.push("textarea-focus");
      },
      select() {},
    };
    const document = {
      activeElement: previouslyFocused,
      body: {
        appendChild() {},
        removeChild() {
          events.push("remove");
        },
      },
      createElement() {
        return textarea;
      },
      execCommand() {
        return commandResult;
      },
    };

    assert.equal(
      await copyEndpoint("https://focus.example.test", {
        clipboard: null,
        document,
      }),
      commandResult,
    );
    assert.deepEqual(events, [
      "textarea-focus",
      "remove",
      "restore-focus",
    ]);
  }
});

async function governanceModule(): Promise<Record<string, unknown>> {
  return import("../lib/governance-view-models.ts").catch(() => ({}));
}

test("access audit metadata never stores raw request content or session identity", async () => {
  const governance = await governanceModule();
  const createAccessAuditMetadata = Reflect.get(
    governance,
    "createAccessAuditMetadata",
  );
  const pseudonymousAccessActor = Reflect.get(
    governance,
    "pseudonymousAccessActor",
  );
  assert.equal(typeof createAccessAuditMetadata, "function");
  assert.equal(typeof pseudonymousAccessActor, "function");

  const request = createAccessRequestSnapshot({
    method: "POST",
    path: "/v1/chat/completions",
    body: '{"prompt":"TOP-SECRET-CUSTOMER-PROMPT"}',
    sessionHeaderName: "X-Agent-Session-ID",
    sessionKey: "private-session-key-1024",
  });
  const metadata = createAccessAuditMetadata(request);
  const serialized = JSON.stringify(metadata);

  assert.deepEqual(Object.keys(metadata).sort(), [
    "bodyBytes",
    "bodyPresent",
    "contentCaptured",
    "method",
    "path",
    "sessionHeaderName",
    "sessionKeyHash",
    "sessionKeyLength",
  ]);
  assert.equal(metadata.bodyBytes, 39);
  assert.equal(metadata.bodyPresent, "true");
  assert.equal(metadata.contentCaptured, "false");
  assert.match(metadata.sessionKeyHash, /^fnv1a64:[0-9a-f]{16}$/u);
  assert.equal(metadata.sessionKeyLength, 24);
  assert.doesNotMatch(serialized, /TOP-SECRET|CUSTOMER-PROMPT/u);
  assert.doesNotMatch(serialized, /private-session-key-1024/u);
  assert.doesNotMatch(
    pseudonymousAccessActor(request.sessionKey),
    /private-session-key-1024/u,
  );
});

test("audit center keeps four evidence classes separate and combines exact filters", async () => {
  const governance = await governanceModule();
  const filterAuditCenterEvents = Reflect.get(
    governance,
    "filterAuditCenterEvents",
  );
  assert.equal(typeof filterAuditCenterEvents, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();

  const accessRows = filterAuditCenterEvents(state.auditEvents, {
    category: "access",
    timeRange: "all",
    actor: "",
    environmentId: "",
    result: "",
    correlation: "req-20260729-003",
  });
  assert.deepEqual(
    accessRows.map((event: { id: string }) => event.id),
    ["audit-access-cs-001"],
  );
  assert.ok(
    accessRows.every((event: { kind: string }) => event.kind === "ACCESS"),
  );

  const deniedSecurity = filterAuditCenterEvents(state.auditEvents, {
    category: "security",
    timeRange: "7d",
    actor: "policy-enforcer",
    environmentId: "env-customer-service-prod",
    result: "DENY",
    correlation: "",
  });
  assert.deepEqual(
    deniedSecurity.map((event: { id: string }) => event.id),
    ["audit-security-egress-001"],
  );

  const runtime = filterAuditCenterEvents(state.auditEvents, {
    category: "runtime",
    timeRange: "all",
    actor: "",
    environmentId: "",
    result: "",
    correlation: "",
  });
  assert.ok(
    runtime.every((event: { kind: string }) => event.kind === "RUNTIME"),
  );
});

test("application logs use their own filters instead of appearing as audit events", async () => {
  const governance = await governanceModule();
  const filterApplicationLogs = Reflect.get(
    governance,
    "filterApplicationLogs",
  );
  assert.equal(typeof filterApplicationLogs, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();

  const rows = filterApplicationLogs(state.applicationLogs, {
    timeRange: "all",
    level: "ERROR",
    environmentId: "env-claims-prod",
    instanceId: "",
    query: "readiness",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].environmentId, "env-claims-prod");
  assert.equal(rows[0].level, "ERROR");
  assert.match(rows[0].message, /readiness/iu);
});

test("security posture states credential, SecureTask, and Guardrail boundaries honestly", async () => {
  const governance = await governanceModule();
  const deriveSecurityPosture = Reflect.get(
    governance,
    "deriveSecurityPosture",
  );
  assert.equal(typeof deriveSecurityPosture, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();
  const environment = state.environments.find(
    (candidate) => candidate.id === "env-customer-service-prod",
  );
  assert.ok(environment);

  const posture = deriveSecurityPosture(state, environment.id);
  assert.equal(posture.modelCredential.status, "模型网关代持");
  assert.match(posture.modelCredential.evidence, /不进入 Agent/u);
  assert.equal(posture.secureTask.status, "已绑定");
  assert.match(posture.secureTask.evidence, /分钟|数小时/u);
  assert.equal(posture.guardrail.status, "未配置");
  assert.match(posture.guardrail.evidence, /受控内容网关/u);
  assert.match(posture.runtimeLimitation, /已获凭据/u);
});

test("resource pool view derives K8s capacity, workload counts, and placement risk", async () => {
  const governance = await governanceModule();
  const deriveResourcePoolRows = Reflect.get(
    governance,
    "deriveResourcePoolRows",
  );
  assert.equal(typeof deriveResourcePoolRows, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();

  const rows = deriveResourcePoolRows(state);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row: { kubernetesVersion: string }) =>
    /^v1\.\d+\.\d+$/u.test(row.kubernetesVersion),
  ));
  assert.ok(rows.every((row: { cpu: { used: number; total: number } }) =>
    row.cpu.used <= row.cpu.total,
  ));
  assert.ok(rows.every((row: { memory: { used: number; total: number } }) =>
    row.memory.used <= row.memory.total,
  ));
  assert.ok(rows.every((row: { environmentCount: number }) =>
    row.environmentCount >= 0,
  ));
  assert.ok(rows.every((row: { instanceCount: number }) =>
    row.instanceCount >= 0,
  ));
  assert.equal(
    rows.find((row: { id: string }) => row.id === "cluster-tenant-central")
      ?.placementRisk,
    "High",
  );
});

test("profile usage reports exact environment bindings and keeps details read-only", async () => {
  const governance = await governanceModule();
  const deriveProfileUsage = Reflect.get(
    governance,
    "deriveProfileUsage",
  );
  assert.equal(typeof deriveProfileUsage, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const state = createInitialDemoState();

  const usage = deriveProfileUsage(state, "secure-task-hardened");
  assert.equal(usage.profile?.kind, "SECURE_TASK");
  assert.ok(usage.environmentIds.includes("env-customer-service-prod"));
  assert.ok(!usage.environmentIds.includes("env-knowledge-prod"));
  assert.equal(usage.readOnly, true);
});

test("incident evidence exposes seven ordered containment actions", async () => {
  const governance = await governanceModule();
  const deriveIncidentEvidence = Reflect.get(
    governance,
    "deriveIncidentEvidence",
  );
  assert.equal(typeof deriveIncidentEvidence, "function");
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const { OPEN_INCIDENT_ID } = await import("../lib/mock-data.ts");
  const initial = createInitialDemoState();
  const completed = (
    await import("../lib/demo-state.ts")
  ).applyIsolationStep(initial, OPEN_INCIDENT_ID, 7);

  const evidence = deriveIncidentEvidence(completed, OPEN_INCIDENT_ID);
  assert.deepEqual(
    evidence.actions.map((action: { key: string }) => action.key),
    [
      "lb-drain",
      "endpoint-block",
      "egress-deny",
      "workload-identity-revoke",
      "model-identity-revoke",
      "anomalous-instance-stop",
      "immutable-replacement-request",
    ],
  );
  assert.ok(
    evidence.actions.every(
      (action: { complete: boolean; auditEventId?: string }) =>
        action.complete && Boolean(action.auditEventId),
    ),
  );
});

test("containment preserves the stable endpoint, stops only the anomalous instance, and is idempotent", async () => {
  const stateModule = await import("../lib/demo-state.ts");
  const { OPEN_INCIDENT_ID, PRIMARY_ENVIRONMENT_ID } = await import(
    "../lib/mock-data.ts"
  );
  const initial = stateModule.createInitialDemoState();
  const beforeEnvironment = initial.environments.find(
    (environment) => environment.id === PRIMARY_ENVIRONMENT_ID,
  );
  assert.ok(beforeEnvironment);

  const completed = stateModule.applyIsolationStep(
    initial,
    OPEN_INCIDENT_ID,
    7,
  );
  const afterEnvironment = completed.environments.find(
    (environment) => environment.id === PRIMARY_ENVIRONMENT_ID,
  );
  const environmentInstances = completed.instances.filter(
    (instance) => instance.environmentId === PRIMARY_ENVIRONMENT_ID,
  );
  const isolationAudits = completed.auditEvents.filter(
    (event) =>
      event.type === "ISOLATION_ACTION" &&
      event.details.incidentId === OPEN_INCIDENT_ID,
  );

  assert.equal(afterEnvironment?.status, "Isolated");
  assert.equal(afterEnvironment?.endpoint, beforeEnvironment.endpoint);
  assert.equal(
    environmentInstances.find((instance) => instance.id === "ins-cs-01")
      ?.status,
    "Stopped",
  );
  assert.ok(
    environmentInstances
      .filter((instance) => instance.id !== "ins-cs-01")
      .every((instance) => instance.status === "Ready"),
  );
  assert.equal(isolationAudits.length, 7);

  const repeated = stateModule.applyIsolationStep(
    completed,
    OPEN_INCIDENT_ID,
    7,
  );
  assert.deepEqual(repeated, completed);
});

test("isolated environments are always denied by inbound policy evaluation", async () => {
  const { evaluateAccessRequest } = await import(
    "../lib/runtime-view-models.ts"
  );
  const { createInitialDemoState } = await import("../lib/demo-state.ts");
  const environment = createInitialDemoState().environments.find(
    (candidate) => candidate.id === "env-customer-service-prod",
  );
  assert.ok(environment);
  const request = createAccessRequestSnapshot({
    method: "POST",
    path: "/v1/chat/completions",
    body: '{"message":"hello"}',
    sessionHeaderName: "X-Agent-Session-ID",
    sessionKey: "demo-user-1024",
  });

  const result = evaluateAccessRequest(
    { ...environment, status: "Isolated" },
    request,
    true,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /隔离|阻断/u);
});

test("hydration removes legacy raw access body and session identity before state can persist again", async () => {
  const { createInitialDemoState, hydrateDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const legacy = createInitialDemoState();
  const accessEvent = legacy.auditEvents.find(
    (event) => event.kind === "ACCESS",
  );
  assert.ok(accessEvent);
  accessEvent.actor = "legacy-private-session";
  accessEvent.details = {
    ...accessEvent.details,
    body: '{"prompt":"LEGACY-SECRET"}',
    sessionKey: "legacy-private-session",
  };

  const hydrated = hydrateDemoState(JSON.stringify(legacy));
  const serialized = JSON.stringify(hydrated.auditEvents);

  assert.doesNotMatch(serialized, /LEGACY-SECRET/u);
  assert.doesNotMatch(serialized, /legacy-private-session/u);
  assert.match(
    hydrated.auditEvents.find((event) => event.id === accessEvent.id)?.actor ??
      "",
    /^session:/u,
  );
});

test("hydration purges legacy CoT and rawSessionKey aliases from access audit details", async () => {
  const { createInitialDemoState, hydrateDemoState } = await import(
    "../lib/demo-state.ts"
  );
  const legacy = createInitialDemoState();
  const accessEvent = legacy.auditEvents.find(
    (event) => event.kind === "ACCESS",
  );
  assert.ok(accessEvent);
  accessEvent.details = {
    ...accessEvent.details,
    CoT: "LEGACY-PRIVATE-REASONING",
    rawSessionKey: "legacy-raw-session-2048",
  };

  const hydrated = hydrateDemoState(JSON.stringify(legacy));
  const hydratedEvent = hydrated.auditEvents.find(
    (event) => event.id === accessEvent.id,
  );
  assert.ok(hydratedEvent);
  const detailKeys = Object.keys(hydratedEvent.details).map((key) =>
    key.toLocaleLowerCase(),
  );
  const persistedAgain = JSON.stringify(hydrated);

  assert.ok(!detailKeys.includes("cot"));
  assert.ok(!detailKeys.includes("rawsessionkey"));
  assert.doesNotMatch(persistedAgain, /LEGACY-PRIVATE-REASONING/u);
  assert.doesNotMatch(persistedAgain, /legacy-raw-session-2048/u);
  assert.doesNotMatch(
    Object.values(hydratedEvent.details).join(" "),
    /LEGACY-PRIVATE-REASONING|legacy-raw-session-2048/u,
  );
  assert.match(hydratedEvent.actor, /^session:/u);
});
