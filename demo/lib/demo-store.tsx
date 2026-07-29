"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  applyDeploymentStep,
  applyIsolationStep,
  createEnvironment as createEnvironmentState,
  enumeratePendingTransitions,
  isCurrentGeneration,
  replaceEnvironmentInstance,
  resolveDemoStateForRender,
  resetDemoState,
  rollbackEnvironment,
} from "./demo-state.ts";
import type {
  PendingDeploymentTransition,
  PendingIsolationTransition,
} from "./demo-state.ts";
import { selectInstance } from "./demo-engine.ts";
import {
  createAccessAuditMetadata,
  sanitizeAuditEvents,
  syntheticAccessActor,
} from "./governance-view-models.ts";
import {
  createAccessRequestSnapshot,
  evaluateAccessRequest,
} from "./runtime-view-models.ts";
import {
  OPEN_INCIDENT_ID,
  PRIMARY_ENVIRONMENT_ID,
} from "./mock-data.ts";
import type {
  AccessRequestSnapshot,
  AccessResult,
  AuditEvent,
  CreateEnvironmentInput,
  DemoState,
} from "./types.ts";

export const DEMO_STORAGE_KEY = "agent-paas-demo:v1";

type TimerHandle = ReturnType<typeof setTimeout>;
type TimerSet = Set<TimerHandle>;

export interface DemoActions {
  createEnvironment(input: CreateEnvironmentInput): string;
  advanceDeployment(environmentId: string, step?: number): void;
  runAccessTest(
    environmentId: string,
    sessionKey?: string,
    destination?: string,
    request?: AccessRequestSnapshot,
  ): AccessResult;
  replaceInstance(environmentId: string, instanceId: string): void;
  rollback(environmentId?: string): void;
  advanceIsolation(incidentId?: string, step?: number): void;
  resetDemo(): void;
}

export type DemoContextValue = DemoState &
  DemoActions & {
    state: DemoState;
  };

const DemoContext = createContext<DemoContextValue | undefined>(undefined);
const PROVIDER_CLOCK_START = Date.UTC(2026, 6, 30, 10, 0, 0);

function providerTimestamp(ordinal: number): string {
  return new Date(PROVIDER_CLOCK_START + ordinal * 1_000).toISOString();
}

function clearTimerSet(timerSet: TimerSet): void {
  for (const timer of timerSet) {
    clearTimeout(timer);
  }
  timerSet.clear();
}

function readPersistedState(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function DemoProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<DemoState>(() =>
    resolveDemoStateForRender(undefined, false),
  );
  const stateRef = useRef(state);
  const deploymentTimersRef = useRef<TimerSet>(new Set());
  const sseTimersRef = useRef<TimerSet>(new Set());
  const rollbackTimersRef = useRef<TimerSet>(new Set());
  const isolationTimersRef = useRef<TimerSet>(new Set());
  const hydrationPendingRef = useRef(true);

  const commit = useCallback(
    (update: (current: DemoState) => DemoState): DemoState => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  const clearAllTimers = useCallback(() => {
    clearTimerSet(deploymentTimersRef.current);
    clearTimerSet(sseTimersRef.current);
    clearTimerSet(rollbackTimersRef.current);
    clearTimerSet(isolationTimersRef.current);
  }, []);

  const scheduleDeploymentTransitions = useCallback(
    (
      transitions: readonly PendingDeploymentTransition[],
      capturedGeneration: number,
    ) => {
      transitions.forEach((transition, index) => {
        const timer = setTimeout(
          () => {
            deploymentTimersRef.current.delete(timer);
            if (
              !isCurrentGeneration(
                stateRef.current,
                capturedGeneration,
              )
            ) {
              return;
            }
            commit((current) =>
              applyDeploymentStep(
                current,
                transition.environmentId,
                transition.step,
              ),
            );
          },
          (index + 1) * 180,
        );
        deploymentTimersRef.current.add(timer);
      });
    },
    [commit],
  );

  const scheduleIsolationTransitions = useCallback(
    (
      transitions: readonly PendingIsolationTransition[],
      capturedGeneration: number,
    ) => {
      transitions.forEach((transition, index) => {
        const timer = setTimeout(
          () => {
            isolationTimersRef.current.delete(timer);
            if (
              !isCurrentGeneration(
                stateRef.current,
                capturedGeneration,
              )
            ) {
              return;
            }
            commit((current) =>
              applyIsolationStep(
                current,
                transition.incidentId,
                transition.step,
              ),
            );
          },
          (index + 1) * 180,
        );
        isolationTimersRef.current.add(timer);
      });
    },
    [commit],
  );

  useEffect(() => {
    const persistedState = readPersistedState();
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const hydrated = resolveDemoStateForRender(persistedState, true);
      hydrationPendingRef.current = false;
      stateRef.current = hydrated;
      setState(hydrated);

      const pending = enumeratePendingTransitions(hydrated);
      scheduleDeploymentTransitions(
        pending.deployments,
        hydrated.generation,
      );
      scheduleIsolationTransitions(
        pending.isolations,
        hydrated.generation,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [scheduleDeploymentTransitions, scheduleIsolationTransitions]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      hydrationPendingRef.current ||
      state !== stateRef.current
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify({
          ...state,
          auditEvents: sanitizeAuditEvents(state.auditEvents),
        }),
      );
    } catch {
      // The in-memory demo remains usable when storage is disabled or full.
    }
  }, [state]);

  useEffect(
    () => () => {
      clearAllTimers();
    },
    [clearAllTimers],
  );

  const advanceDeployment = useCallback(
    (environmentId: string, step?: number) => {
      commit((current) => {
        const nextStep =
          step ?? (current.deploymentSteps[environmentId] ?? -1) + 1;
        return applyDeploymentStep(current, environmentId, nextStep);
      });
    },
    [commit],
  );

  const createEnvironment = useCallback(
    (input: CreateEnvironmentInput): string => {
      const previousIds = new Set(
        stateRef.current.environments.map((environment) => environment.id),
      );
      const created = commit((current) =>
        createEnvironmentState(current, input),
      );
      const environmentId =
        created.environments.find(
          (environment) => !previousIds.has(environment.id),
        )?.id ?? created.environments.at(-1)?.id;

      if (!environmentId) {
        throw new Error("The demo environment could not be created.");
      }

      const pendingDeployments =
        enumeratePendingTransitions(created).deployments.filter(
          (transition) => transition.environmentId === environmentId,
        );
      scheduleDeploymentTransitions(
        pendingDeployments,
        created.generation,
      );

      return environmentId;
    },
    [commit, scheduleDeploymentTransitions],
  );

  const runAccessTest = useCallback(
    (
      environmentId: string,
      sessionKey = "demo-user-1024",
      destination = "https://approved.example.invalid/health",
      request?: AccessRequestSnapshot,
    ): AccessResult => {
      const current = stateRef.current;
      const environment = current.environments.find(
        (candidate) => candidate.id === environmentId,
      );
      const environmentInstances = current.instances.filter(
        (instance) => instance.environmentId === environmentId,
      );
      const submittedRequest =
        request ??
        createAccessRequestSnapshot({
          method: "POST",
          path: destination,
          body: "",
          sessionHeaderName:
            environment?.sessionHeader ?? "X-Agent-Session-ID",
          sessionKey,
        });
      const policyDecision = evaluateAccessRequest(
        environment,
        submittedRequest,
        environmentInstances.some(
          (instance) => instance.status === "Ready",
        ),
      );
      let instanceId: string | undefined;
      if (policyDecision.allowed) {
        instanceId = selectInstance(
          submittedRequest.sessionKey,
          environmentInstances,
        ).id;
      }

      const accessOrdinal =
        current.auditEvents.filter((event) => event.type === "ACCESS_TEST")
          .length + 1;
      const auditEventId = `audit-access-test-${String(accessOrdinal).padStart(
        3,
        "0",
      )}`;
      const requestId = `req-demo-access-${String(accessOrdinal).padStart(
        3,
        "0",
      )}`;
      const result: AccessResult = {
        allowed: policyDecision.allowed,
        decision: policyDecision.decision,
        reason: policyDecision.reason,
        sessionKey: submittedRequest.sessionKey,
        environmentId,
        instanceId,
        policyId: policyDecision.policyId,
        destination: submittedRequest.path,
        auditEventId,
        requestId,
        request: submittedRequest,
        message: policyDecision.allowed
          ? `Access routed to ${instanceId}`
          : `Access denied: ${policyDecision.reason}`,
      };
      const auditEvent: AuditEvent = {
        id: auditEventId,
        kind: "ACCESS",
        type: "ACCESS_TEST",
        actor: syntheticAccessActor(requestId),
        targetId: instanceId ?? environmentId,
        occurredAt: providerTimestamp(current.auditEvents.length),
        summary: result.message,
        details: {
          requestId,
          operationId: `op-demo-access-${String(accessOrdinal).padStart(
            3,
            "0",
          )}`,
          taskId: `task-demo-access-${String(accessOrdinal).padStart(3, "0")}`,
          environmentId,
          instanceId: instanceId ?? "none",
          policyId: result.policyId,
          destination: submittedRequest.path,
          ...Object.fromEntries(
            Object.entries(
              createAccessAuditMetadata(submittedRequest, { requestId }),
            ).map(([key, value]) => [key, String(value)]),
          ),
          decision: policyDecision.decision,
          reason: policyDecision.reason,
        },
      };

      commit((latest) =>
        latest.auditEvents.some((event) => event.id === auditEvent.id)
          ? latest
          : {
              ...latest,
              auditEvents: [...latest.auditEvents, auditEvent],
            },
      );

      if (policyDecision.allowed) {
        const capturedGeneration = current.generation;
        const timer = setTimeout(() => {
          sseTimersRef.current.delete(timer);
          if (
            !isCurrentGeneration(stateRef.current, capturedGeneration)
          ) {
            return;
          }
        }, 120);
        sseTimersRef.current.add(timer);
      }

      return result;
    },
    [commit],
  );

  const rollback = useCallback(
    (environmentId = PRIMARY_ENVIRONMENT_ID) => {
      const capturedGeneration = stateRef.current.generation;
      const timer = setTimeout(() => {
        rollbackTimersRef.current.delete(timer);
        if (!isCurrentGeneration(stateRef.current, capturedGeneration)) {
          return;
        }

        commit((current) => rollbackEnvironment(current, environmentId));
      }, 240);
      rollbackTimersRef.current.add(timer);
    },
    [commit],
  );

  const replaceInstance = useCallback(
    (environmentId: string, instanceId: string) => {
      commit((current) =>
        replaceEnvironmentInstance(current, environmentId, instanceId),
      );
    },
    [commit],
  );

  const advanceIsolation = useCallback(
    (incidentId = OPEN_INCIDENT_ID, step?: number) => {
      const current = commit((latest) => ({
        ...latest,
        securityIncidents: latest.securityIncidents.map((incident) =>
          incident.id === incidentId &&
          incident.status !== "Contained" &&
          incident.status !== "Resolved"
            ? { ...incident, status: "Containing" as const }
            : incident,
        ),
      }));
      const currentStep = current.isolationSteps[incidentId] ?? 0;
      const transitions =
        step === undefined
          ? Array.from(
              { length: Math.max(0, 7 - currentStep) },
              (_, index) => ({
                incidentId,
                step: currentStep + index + 1,
              }),
            )
          : [{ incidentId, step }];
      scheduleIsolationTransitions(
        transitions,
        current.generation,
      );
    },
    [commit, scheduleIsolationTransitions],
  );

  const resetDemo = useCallback(() => {
    clearAllTimers();
    const reset = resetDemoState(stateRef.current);
    stateRef.current = reset;
    setState(reset);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(DEMO_STORAGE_KEY);
      } catch {
        // Resetting in-memory state is sufficient when storage is unavailable.
      }
    }
  }, [clearAllTimers]);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      state,
      createEnvironment,
      advanceDeployment,
      runAccessTest,
      replaceInstance,
      rollback,
      advanceIsolation,
      resetDemo,
    }),
    [
      advanceDeployment,
      advanceIsolation,
      createEnvironment,
      resetDemo,
      replaceInstance,
      rollback,
      runAccessTest,
      state,
    ],
  );

  return React.createElement(DemoContext.Provider, { value }, children);
}

export function useDemo(): DemoContextValue {
  const context = React.useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within a DemoProvider.");
  }
  return context;
}
