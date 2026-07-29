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
  OPEN_INCIDENT_ID,
  PRIMARY_ENVIRONMENT_ID,
} from "./mock-data.ts";
import type {
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
  ): AccessResult;
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
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
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
    ): AccessResult => {
      const current = stateRef.current;
      const environment = current.environments.find(
        (candidate) => candidate.id === environmentId,
      );
      const environmentInstances = current.instances.filter(
        (instance) => instance.environmentId === environmentId,
      );
      let instanceId: string | undefined;
      let allowed = false;

      try {
        instanceId = selectInstance(sessionKey, environmentInstances).id;
        allowed = Boolean(environment);
      } catch {
        allowed = false;
      }

      const accessOrdinal =
        current.auditEvents.filter((event) => event.type === "ACCESS_TEST")
          .length + 1;
      const auditEventId = `audit-access-test-${String(accessOrdinal).padStart(
        3,
        "0",
      )}`;
      const result: AccessResult = {
        allowed,
        sessionKey,
        environmentId,
        instanceId,
        policyId: environment?.egressProfileId ?? "egress-restricted",
        destination,
        auditEventId,
        message: allowed
          ? `Access routed to ${instanceId}`
          : "Access denied because no ready instance is available",
      };
      const auditEvent: AuditEvent = {
        id: auditEventId,
        kind: "ACCESS",
        type: "ACCESS_TEST",
        actor: sessionKey,
        targetId: instanceId ?? environmentId,
        occurredAt: providerTimestamp(current.auditEvents.length),
        summary: result.message,
        details: {
          requestId: `req-demo-access-${String(accessOrdinal).padStart(
            3,
            "0",
          )}`,
          operationId: `op-demo-access-${String(accessOrdinal).padStart(
            3,
            "0",
          )}`,
          taskId: `task-demo-access-${String(accessOrdinal).padStart(3, "0")}`,
          environmentId,
          instanceId: instanceId ?? "none",
          policyId: result.policyId,
          destination,
          decision: allowed ? "ALLOW" : "DENY",
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

      const capturedGeneration = current.generation;
      const timer = setTimeout(() => {
        sseTimersRef.current.delete(timer);
        if (!isCurrentGeneration(stateRef.current, capturedGeneration)) {
          return;
        }
      }, 120);
      sseTimersRef.current.add(timer);

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

  const advanceIsolation = useCallback(
    (incidentId = OPEN_INCIDENT_ID, step?: number) => {
      const current = stateRef.current;
      const nextStep =
        step ?? (current.isolationSteps[incidentId] ?? -1) + 1;
      scheduleIsolationTransitions(
        [{ incidentId, step: nextStep }],
        current.generation,
      );
    },
    [scheduleIsolationTransitions],
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
      rollback,
      advanceIsolation,
      resetDemo,
    }),
    [
      advanceDeployment,
      advanceIsolation,
      createEnvironment,
      resetDemo,
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
