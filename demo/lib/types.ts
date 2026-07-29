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

export type RevisionStatus =
  | "Pending"
  | "Deploying"
  | "Stable"
  | "Failed"
  | "RolledBack";

export type InstanceStatus =
  | "Pending"
  | "Starting"
  | "Ready"
  | "Draining"
  | "Stopped"
  | "Failed"
  | "Isolated";

export type ProfileKind =
  | "RUNTIME"
  | "INGRESS"
  | "EGRESS"
  | "SECURE_TASK";

export type ClusterStatus = "Healthy" | "Degraded" | "Unavailable";

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

export interface Revision {
  id: string;
  environmentId: string;
  sequence: number;
  image: string;
  status: RevisionStatus;
  createdAt: string;
  createdBy: string;
}

export interface Instance {
  id: string;
  environmentId: string;
  revisionId: string;
  status: InstanceStatus;
  clusterId: string;
  startedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  kind: ProfileKind;
  version: number;
  summary: string;
  controls: readonly string[];
}

export interface Cluster {
  id: string;
  name: string;
  region: string;
  status: ClusterStatus;
  readyCapacity: number;
  totalCapacity: number;
}

export interface AuditEvent {
  id: string;
  kind: AuditKind;
  type: string;
  actor: string;
  targetId: string;
  occurredAt: string;
  summary: string;
  details: Readonly<Record<string, string>>;
}

export interface SecurityIncident {
  id: string;
  environmentId: string;
  title: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "Containing" | "Contained" | "Resolved";
  detectedAt: string;
  resolvedAt?: string;
  auditEventIds: readonly string[];
}

export type DeploymentStage =
  | "Queued"
  | "RevisionValidated"
  | "PoliciesApplied"
  | "CapacityAllocated"
  | "InstancesStarting"
  | "HealthChecksRunning"
  | "TrafficWarming"
  | "Completed";

export interface DeploymentSnapshot {
  step: number;
  stage: DeploymentStage;
  status: Extract<EnvironmentStatus, "Deploying" | "Running">;
  endpointReady: boolean;
  progressPercent: number;
}

export type IsolationStage =
  | "IncidentDetected"
  | "EndpointIsolationRequested"
  | "EndpointIsolated"
  | "EgressBlocked"
  | "WorkloadIdentityRevoked"
  | "ModelIdentityRevoked";

export type EndpointState = "Active" | "Isolating" | "Isolated";

export interface IsolationSnapshot {
  step: number;
  stage: IsolationStage;
  endpointState: EndpointState;
  egressBlocked: boolean;
  workloadIdentityRevoked: boolean;
  modelIdentityRevoked: boolean;
}
