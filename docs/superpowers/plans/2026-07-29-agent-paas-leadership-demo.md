# Agent PaaS Interactive Leadership Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a clickable five-minute Agent PaaS product prototype that demonstrates deployment, session affinity, release rollback, security isolation, audit evidence, and platform investment value using deterministic frontend-only mock data.

**Architecture:** Create an isolated Sites-compatible React/TypeScript application under `demo/`. A small client-side router renders product views, while a centralized demo store owns all mock entities and deterministic state transitions so navigation, deployment, rollback, SSE, isolation, audit, and reset remain consistent across the prototype.

**Tech Stack:** React 19, TypeScript 5, Vinext/Vite, CSS, Node 24 built-in test runner, OpenAI Sites hosting.

---

## File structure

| Path | Responsibility |
|---|---|
| `demo/app/layout.tsx` | Product metadata, favicon, Open Graph and X metadata |
| `demo/app/page.tsx` | Root route rendering the client application |
| `demo/app/[...path]/page.tsx` | Catch-all entry so product routes survive refresh |
| `demo/app/globals.css` | Complete design system, responsive layout and animations |
| `demo/components/agent-paas-demo.tsx` | Application composition and route-to-view mapping |
| `demo/components/app-shell.tsx` | Sidebar, top bar, client router and demo guide rail |
| `demo/components/ui.tsx` | Reusable cards, badges, tables, tabs, drawers, modal and toast |
| `demo/lib/types.ts` | Mock domain types and stable route identifiers |
| `demo/lib/mock-data.ts` | Deterministic initial environments, revisions, instances, profiles, clusters and events |
| `demo/lib/demo-engine.ts` | Pure session routing, deployment, rollback and isolation transition functions |
| `demo/lib/demo-store.tsx` | React state provider, persistence, timed effects and reset |
| `demo/features/overview.tsx` | Leadership value dashboard and investment summary |
| `demo/features/environments.tsx` | Environment list, filters and four-step creation wizard |
| `demo/features/environment-detail.tsx` | Overview, config, instances and observability tabs |
| `demo/features/access-and-releases.tsx` | SSE test, affinity evidence, revisions, diff and rollback |
| `demo/features/governance.tsx` | Security posture, incidents, isolation, audit, clusters and profiles |
| `demo/tests/demo-engine.test.ts` | Pure transition and session-affinity tests |
| `demo/tests/rendered-html.test.mjs` | Built worker metadata and starter-removal checks |
| `demo/public/og.png` | Site-specific social preview generated after visual direction is stable |
| `demo/.openai/hosting.json` | Sites project identity and deployment configuration |
| `docs/demo/agent-paas-demo-script.md` | Five-minute presenter script and reset instructions |

## Task 1: Initialize the isolated Sites application

**Files:**

- Create: `demo/` from the bundled Vinext starter
- Modify: `demo/package.json`
- Modify: `demo/app/layout.tsx`
- Delete: `demo/app/_sites-preview/SkeletonPreview.tsx`
- Delete: `demo/app/_sites-preview/preview.css`
- Modify: `demo/tests/rendered-html.test.mjs`

- [ ] **Step 1: Run the Sites initializer once**

Create the empty `demo/` directory, run the bundled `scripts/init-site.sh` with the absolute `demo/` path, verify the generated `.openai/hosting.json`, and remove only the initializer-created nested `demo/.git` directory after resolving and checking that its absolute path is exactly `D:\AI4coding\AgentPaas\demo\.git`.

Expected: `demo/package.json`, `demo/app/page.tsx`, `demo/app/layout.tsx`, `demo/app/globals.css`, and `demo/.openai/hosting.json` exist.

- [ ] **Step 2: Replace the starter test with a failing product metadata test**

Use this assertion set in `demo/tests/rendered-html.test.mjs`:

```js
assert.match(html, /<title>Agent PaaS · 生产运行与治理平台<\/title>/i);
assert.match(html, /把 Agent 镜像变成受控的生产服务/);
assert.doesNotMatch(html, /codex-preview/i);
assert.doesNotMatch(html, /Building your site/i);
assert.doesNotMatch(html, /react-loading-skeleton/i);
```

- [ ] **Step 3: Run the test and verify the starter fails**

Run from `demo/`:

```powershell
npm run test
```

Expected: FAIL because starter metadata and skeleton are still present.

- [ ] **Step 4: Remove the disposable starter and set product metadata**

Set metadata in `demo/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: "Agent PaaS · 生产运行与治理平台",
  description: "把 Agent 镜像变成可访问、可运维、可约束、可审计的生产服务。",
};
```

Remove `_sites-preview` imports and files, remove `react-loading-skeleton` from `package.json`, refresh the lockfile, and use cross-platform scripts:

```json
{
  "scripts": {
    "dev": "vinext dev",
    "build": "vinext build",
    "start": "vinext start",
    "test": "npm run build && node --test tests/rendered-html.test.mjs tests/demo-engine.test.ts",
    "lint": "eslint . --ignore-pattern dist --ignore-pattern .next"
  }
}
```

- [ ] **Step 5: Commit the clean application baseline**

```powershell
git add -- demo
git commit -m "chore: initialize Agent PaaS demo app"
```

## Task 2: Define mock domain types and deterministic engine

**Files:**

- Create: `demo/lib/types.ts`
- Create: `demo/lib/demo-engine.ts`
- Create: `demo/tests/demo-engine.test.ts`

- [ ] **Step 1: Write failing tests for the product state invariants**

Cover these exact cases in `demo/tests/demo-engine.test.ts`:

```ts
test("same session key stays on the same ready instance", () => {
  const instances = [
    { id: "ins-a", ready: true },
    { id: "ins-b", ready: true },
  ];
  assert.equal(selectInstance("demo-user-1024", instances).id, "ins-a");
  assert.equal(selectInstance("demo-user-1024", instances).id, "ins-a");
});

test("deployment does not become ready before policies and endpoint", () => {
  const state = deploymentStateAt(5);
  assert.equal(state.environmentStatus, "Deploying");
  assert.equal(state.endpointReady, false);
});

test("rollback restores the stable revision", () => {
  const result = rollbackRevision("rev-43", "rev-42");
  assert.equal(result.desiredRevisionId, "rev-42");
  assert.equal(result.operation.type, "REVISION_ROLLBACK");
});

test("isolation revokes both workload and model identities", () => {
  const result = isolationStateAt(5);
  assert.equal(result.endpointState, "Isolated");
  assert.equal(result.egressBlocked, true);
  assert.equal(result.workloadIdentityRevoked, true);
  assert.equal(result.modelIdentityRevoked, true);
});
```

- [ ] **Step 2: Run the tests and verify missing engine functions fail**

```powershell
node --test tests/demo-engine.test.ts
```

Expected: FAIL because `selectInstance`, `deploymentStateAt`, `rollbackRevision`, and `isolationStateAt` do not exist.

- [ ] **Step 3: Implement the stable domain vocabulary**

Define explicit unions and interfaces in `demo/lib/types.ts`, including:

```ts
export type EnvironmentStatus =
  | "Draft"
  | "Deploying"
  | "Running"
  | "Degraded"
  | "Stopped"
  | "Isolated";

export type AuditKind =
  | "CONTROL_PLANE"
  | "ACCESS"
  | "SECURITY"
  | "RUNTIME";

export interface Environment {
  id: string;
  name: string;
  project: string;
  owner: string;
  status: EnvironmentStatus;
  endpoint: string;
  desiredRevisionId: string;
  readyInstances: number;
  desiredInstances: number;
  runtimePlanId: string;
  ingressProfileId: string;
  egressProfileId: string;
  secureTaskProfileId?: string;
}
```

Add matching interfaces for `Revision`, `Instance`, `Profile`, `Cluster`, `AuditEvent`, `SecurityIncident`, `DeploymentSnapshot`, and `IsolationSnapshot`.

- [ ] **Step 4: Implement pure deterministic transitions**

Implement:

```ts
export function selectInstance(
  sessionKey: string,
  instances: Array<{ id: string; ready: boolean }>,
): { id: string; ready: boolean };

export function deploymentStateAt(step: number): DeploymentSnapshot;

export function rollbackRevision(
  failedRevisionId: string,
  stableRevisionId: string,
): { desiredRevisionId: string; operation: AuditEvent };

export function isolationStateAt(step: number): IsolationSnapshot;
```

`selectInstance` must hash the session key against only ready instances. Deployment step 7 is the first fully Ready state. Isolation step 5 must represent completed traffic drain, egress block, both identity revocations and instance stop.

- [ ] **Step 5: Run unit tests**

```powershell
node --test tests/demo-engine.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Commit the domain engine**

```powershell
git add -- demo/lib/types.ts demo/lib/demo-engine.ts demo/tests/demo-engine.test.ts
git commit -m "feat: add deterministic Agent PaaS demo engine"
```

## Task 3: Add realistic initial data and centralized store

**Files:**

- Create: `demo/lib/mock-data.ts`
- Create: `demo/lib/demo-store.tsx`

- [ ] **Step 1: Add a failing reset and mutation test**

Extend `demo/tests/demo-engine.test.ts` to assert that:

- initial data includes at least 8 environments, 20 instances, 3 clusters and 1 open security incident;
- creating an environment adds one `Draft` environment;
- deployment completion changes it to `Running` with a non-empty Endpoint;
- reset returns the original entity counts and incident status;
- a reset generation token prevents an old deployment or isolation timer from mutating the fresh state;
- hydration preserves `Deploying`, `Draining` and `Isolated` instead of coercing them to `Running`.

- [ ] **Step 2: Run the test and verify it fails**

```powershell
node --test tests/demo-engine.test.ts
```

Expected: FAIL because initial data and store transition helpers are missing.

- [ ] **Step 3: Build deterministic mock data**

Create these named anchor records in `demo/lib/mock-data.ts`:

```ts
export const PRIMARY_ENVIRONMENT_ID = "env-customer-service-prod";
export const OPEN_INCIDENT_ID = "sec-20260729-001";
export const STABLE_REVISION_ID = "rev-42";
export const FAILED_REVISION_ID = "rev-43";
```

The dataset must include:

- 10 environments across Running, Deploying, Degraded and Stopped;
- 24 instances;
- 3 tenant-dedicated clusters;
- 4 RuntimePlans;
- Ingress, Egress, identity and SecureTask profiles;
- stable `rev-42` and failed `rev-43`;
- audit events with Request ID, Operation ID and Task ID correlations;
- one denied unauthorized-egress incident ready for isolation.

- [ ] **Step 4: Implement `DemoProvider` and `useDemo`**

Expose:

```ts
interface DemoActions {
  createEnvironment(input: CreateEnvironmentInput): string;
  advanceDeployment(environmentId: string): void;
  runAccessTest(environmentId: string, sessionKey: string): AccessResult;
  rollback(environmentId: string): void;
  advanceIsolation(incidentId: string): void;
  resetDemo(): void;
}
```

Persist only the demo state version and entities under `agent-paas-demo:v1`. Reject incompatible stored versions and fall back to initial data. Timed transitions must be idempotent and must append exactly one audit event per completed action.

Keep timer handles inside the provider and increment a generation token on reset. Every delayed callback must compare its captured generation with the current token before changing state. Reset must cancel deployment, SSE, rollback and isolation timers, close drawers and modals, clear toasts and return the demo guide to step one.

- [ ] **Step 5: Run unit tests**

```powershell
node --test tests/demo-engine.test.ts
```

Expected: all engine and store-helper tests pass.

- [ ] **Step 6: Commit mock state**

```powershell
git add -- demo/lib/mock-data.ts demo/lib/demo-store.tsx demo/tests/demo-engine.test.ts
git commit -m "feat: add Agent PaaS mock data store"
```

## Task 4: Build the route-aware application shell

**Files:**

- Create: `demo/components/agent-paas-demo.tsx`
- Create: `demo/components/app-shell.tsx`
- Create: `demo/components/ui.tsx`
- Modify: `demo/app/page.tsx`
- Create: `demo/app/[...path]/page.tsx`

- [ ] **Step 1: Add route parsing tests**

Add tests for:

```ts
assert.deepEqual(parseRoute("/overview"), { view: "overview" });
assert.deepEqual(parseRoute("/environments"), { view: "environments" });
assert.deepEqual(parseRoute("/environments/env-1/access"), {
  view: "environment-detail",
  environmentId: "env-1",
  tab: "access",
});
assert.deepEqual(parseRoute("/unknown"), { view: "not-found" });
```

- [ ] **Step 2: Run tests and verify `parseRoute` is missing**

```powershell
node --test tests/demo-engine.test.ts
```

Expected: FAIL because `parseRoute` is not implemented.

- [ ] **Step 3: Implement route parsing and navigation**

Support all specified product routes with History API navigation and `popstate`. Both `app/page.tsx` and `app/[...path]/page.tsx` render:

```tsx
<DemoProvider>
  <AgentPaaSDemo />
</DemoProvider>
```

Unknown paths render a product-styled not-found panel with a link to `/overview`.

The catch-all route is the production refresh fallback: direct requests for `/audit`, `/security-events`, `/resource-pools`, `/profiles` and every environment detail path must server-render the same application entry rather than return 404.

- [ ] **Step 4: Implement reusable UI primitives**

`demo/components/ui.tsx` must provide typed `StatusBadge`, `MetricCard`, `DataTable`, `Tabs`, `Drawer`, `ConfirmModal`, `ToastRegion`, `ProgressTimeline`, `EmptyState`, and `MockDataLabel` components. Modal and drawer must trap or restore focus, and status labels must include visible text rather than color alone.

- [ ] **Step 5: Implement navigation and demo guide**

The shell must include:

- six primary navigation entries;
- tenant and project context;
- global “演示数据” label;
- “下一步演示” control with seven deterministic destinations;
- “重置演示数据” action;
- collapsible sidebar for narrower desktop widths.

- [ ] **Step 6: Run build**

```powershell
npm run build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 7: Commit the application shell**

```powershell
git add -- demo/app demo/components
git commit -m "feat: add Agent PaaS demo navigation shell"
```

## Task 5: Build the leadership overview and environment journey

**Files:**

- Create: `demo/features/overview.tsx`
- Create: `demo/features/environments.tsx`
- Modify: `demo/components/agent-paas-demo.tsx`

- [ ] **Step 1: Implement the overview**

Render:

- platform health and asset cards;
- “3 天 → 18 分钟” and “23 → 5” investment-value strip;
- recent releases and alerts;
- governance coverage;
- clickable cards that navigate to pre-filtered environment or security views;
- fixed “演示数据 · 待试点验证” treatment on all claimed outcomes.

- [ ] **Step 2: Implement environment search and filters**

The environment list must support text search plus status, project and RuntimePlan filters. It must show status, Endpoint, Revision, ready/desired instances, plan, target cluster and update time.

- [ ] **Step 3: Implement the four-step creation wizard**

Use these steps and defaults:

1. `智能采购助手` in `供应链智能化 / production`;
2. OCI image `registry.internal.example.com/agents/procurement-assistant:1.4.0`, port `8080`, plan `balanced-2c4g`, replicas `2`;
3. `internal-sso-sse`, `approved-model-and-tools`, mandatory security baseline and optional `secure-task-standard`;
4. internal Endpoint, `X-Agent-Session-ID`, automatic platform certificate and a complete summary.

Validation must prevent advancing when required fields are empty. Submitting creates the environment and navigates to its deployment view.

- [ ] **Step 4: Implement deterministic deployment progress**

Advance through the eight approved stages every 450–650 ms, update state through the store, and expose a “跳过动画” action. The final state displays the HTTPS Endpoint, copies it, and offers “测试调用”.

- [ ] **Step 5: Run build and unit tests**

```powershell
npm run test
```

Expected: build succeeds and all tests pass.

- [ ] **Step 6: Commit the deployment journey**

```powershell
git add -- demo/features/overview.tsx demo/features/environments.tsx demo/components/agent-paas-demo.tsx
git commit -m "feat: add Agent environment deployment journey"
```

## Task 6: Build environment details, access testing and releases

**Files:**

- Create: `demo/features/environment-detail.tsx`
- Create: `demo/features/access-and-releases.tsx`
- Modify: `demo/components/agent-paas-demo.tsx`

- [ ] **Step 1: Implement environment detail tabs**

Provide eight tabs: 总览、访问与测试、配置、实例、Revision / 发布记录、日志与指标、安全与治理、操作记录. The first viewport must answer availability, URL, active Revision, instance readiness, last release and governance state.

- [ ] **Step 2: Implement instances and observability**

Instance rows show status, health, Revision, node, IP, uptime, restarts, CPU and memory. “摘流并替换” changes the instance state and appends an operation audit event. Observability shows requests, success rate, P95 latency, active SSE, CPU, memory and LB sync with deterministic chart-shaped CSS bars.

- [ ] **Step 3: Implement SSE and affinity evidence**

The access view must:

- stream a fixed Chinese response token by token;
- allow cancel and resend;
- cancel the previous stream before a new request starts;
- generate visible Request IDs;
- show the selected Revision and instance;
- route the same session key to the same ready instance;
- show a link to the associated access audit record;
- state that affinity is best effort and remapping after instance change is expected.

Cancel must keep the Request ID and already emitted text. Each new stream owns a monotonically increasing stream token so a callback from an older stream cannot append into the current response.

- [ ] **Step 4: Implement revision diff and rollback**

Show `rev-42` as stable and `rev-43` as failed. Diff image Digest, environment variables, timeout and replicas. The rollback confirmation changes desired Revision, advances a short recovery timeline and appends a `REVISION_ROLLBACK` audit event.

- [ ] **Step 5: Run build and unit tests**

```powershell
npm run test
```

Expected: build succeeds and all tests pass.

- [ ] **Step 6: Commit the runtime operations**

```powershell
git add -- demo/features/environment-detail.tsx demo/features/access-and-releases.tsx demo/components/agent-paas-demo.tsx
git commit -m "feat: add access affinity and release operations"
```

## Task 7: Build governance, incident response, audit and resources

**Files:**

- Create: `demo/features/governance.tsx`
- Modify: `demo/components/agent-paas-demo.tsx`

- [ ] **Step 1: Implement the security posture**

Show actual status for Ingress, Egress, workload baseline, model identity and SecureTaskProfile. Include these exact boundaries:

- provider model keys are held by the model gateway and do not enter Agent instances;
- SecureTaskProfile protects only delegated short-lived tasks lasting up to a few hours;
- prompt/content Guardrail is shown as unconfigured when no controlled gateway is present;
- no claim is made that runtime isolation protects credentials already granted to a process.

- [ ] **Step 2: Implement incident detail and one-click isolation**

The open incident must show actor, environment, revision, instance, denied destination, policy version and correlation IDs. Isolation advances through:

1. LB drain;
2. Endpoint blocked;
3. egress denied;
4. workload identity revoked;
5. model identity revoked;
6. abnormal instance stopped;
7. immutable replacement requested.

Each stage updates status and appends or reveals evidence. Repeated clicks must not duplicate events.

- [ ] **Step 3: Implement the audit center**

Provide separate 操作审计、访问审计、安全事件 and 应用运行日志 tabs. Filters include time, identity, environment, result and correlation ID. Audit detail answers who, where, what, why allowed or denied, result and related IDs. Prompt, response body and chain-of-thought are explicitly absent.

Correlation search must match Request ID, Operation ID and Task ID. IDs shown in access tests, release rollback and isolation timelines must either navigate to the matching filtered audit view or copy a value that immediately produces the same match.

- [ ] **Step 4: Implement resource pools and profiles**

Resource pools show three tenant-dedicated clusters with health, Kubernetes version, CPU, memory, environment count, instance count and placement risk. Profile management shows Ingress, Egress, SecureTask, identity, logging and domain/certificate references with detail drawers but no complex editor.

- [ ] **Step 5: Run build and unit tests**

```powershell
npm run test
```

Expected: build succeeds and all tests pass.

- [ ] **Step 6: Commit governance views**

```powershell
git add -- demo/features/governance.tsx demo/components/agent-paas-demo.tsx
git commit -m "feat: add Agent governance and incident response"
```

## Task 8: Apply the visual system and accessibility behavior

**Files:**

- Modify: `demo/app/globals.css`
- Modify: `demo/components/ui.tsx`
- Modify: all feature files only where accessible labels are required

- [ ] **Step 1: Implement design tokens and layout**

Use CSS custom properties for navy navigation, warm-white content surfaces, teal success, blue information, amber risk and red danger. Implement sidebar, top bar, cards, tables, forms, stepper, charts, timeline, drawers, modal, toast and demo rail without external image or font dependencies.

- [ ] **Step 2: Add purposeful motion**

Animate only deployment steps, SSE cursor, drawer/modal entrance, isolation progress and toast. Respect `prefers-reduced-motion: reduce` by removing nonessential transitions.

- [ ] **Step 3: Add keyboard and focus behavior**

Ensure every interactive element is a native button, link, input or select; add visible `:focus-visible`; restore focus after drawers and modals; give icon-only controls accessible labels; announce async status in `aria-live` regions.

- [ ] **Step 4: Validate build and lint**

```powershell
npm run build
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit visual polish**

```powershell
git add -- demo
git commit -m "style: polish Agent PaaS leadership demo"
```

## Task 9: Add social preview and presenter script

**Files:**

- Create: `demo/public/og.png`
- Modify: `demo/app/layout.tsx`
- Create: `docs/demo/agent-paas-demo-script.md`

- [ ] **Step 1: Generate one site-specific social card**

Create a 1200×630 landscape card using the final navy, warm-white and teal visual language. Include only:

- `Agent PaaS`
- `把 Agent 镜像变成受控的生产服务`
- `可访问 · 可运维 · 可约束 · 可审计`

Inspect the generated text. Retry once only if the card is unusable.

- [ ] **Step 2: Wire Open Graph and X metadata**

Use request-host-derived absolute metadata and `/og.png`. Do not ship a generic starter image.

- [ ] **Step 3: Write the five-minute presenter script**

Document:

- the seven timed steps;
- exact buttons to click;
- one sentence of talk track per step;
- fallback navigation if a step is skipped;
- how to reset the demo;
- a final disclaimer that all metrics are mock and require pilot validation.

- [ ] **Step 4: Run final test suite**

```powershell
npm run test
npm run lint
```

Expected: build and all tests pass; lint exits 0.

- [ ] **Step 5: Commit presentation assets**

```powershell
git add -- demo/public/og.png demo/app/layout.tsx docs/demo/agent-paas-demo-script.md
git commit -m "docs: add Agent PaaS demo presentation assets"
```

## Task 10: Final verification, versioning and hosting

**Files:**

- Modify only if verification finds a concrete defect

- [ ] **Step 1: Verify repository scope**

```powershell
git status --short
git diff --check
```

Expected: only the user-owned untracked `arch.md` remains; it is never staged.

- [ ] **Step 2: Verify the production artifact**

```powershell
npm run test
npm run lint
```

Expected: all tests pass, lint exits 0 and `demo/dist` is produced.

- [ ] **Step 3: Verify requirement markers**

Check source and built output for:

- no `codex-preview` metadata;
- no starter title or loading skeleton;
- at least six primary navigation labels;
- eight environment detail tabs;
- Mock data disclosure;
- Session is not a resource;
- SecureTaskProfile short-task boundary;
- model gateway key-custody statement.

Also verify that no external font, CDN or business API URL is required for the five-minute journey, and that no mock environment variable contains a provider model API key.

- [ ] **Step 4: Push the exact source state**

Push the current commit to `origin/main`, then capture the exact commit SHA. Do not stage or push `arch.md`.

- [ ] **Step 5: Save and deploy through Sites**

Read `demo/.openai/hosting.json`, reuse its opaque `project_id`, save a version using the pushed commit SHA and exact source archive, then deploy that saved version. If deployment is non-terminal, inspect until it succeeds or returns an actionable failure.

- [ ] **Step 6: Verify the deployed URL responds**

Open the production URL once and confirm the product title and root response. Return the production URL as the primary deliverable together with the local presenter script.
