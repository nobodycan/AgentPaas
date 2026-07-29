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
  | "SECURE_TASK"
  | "IDENTITY"
  | "LOGGING"
  | "DOMAIN";

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
  containerPort?: number;
  endpointVisibility?: string;
  sessionHeader?: string;
  secureTaskProfileId?: string;
  identityProfileId?: string;
  loggingProfileId?: string;
  domainProfileId?: string;
}

export interface Revision {
  id: string;
  environmentId: string;
  sequence: number;
  image: string;
  imageDigest?: string;
  runtimePlanId?: string;
  ingressProfileId?: string;
  egressProfileId?: string;
  failureReason?: string;
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
  tenantId: string;
  dedicated: true;
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
  context?: Readonly<Record<string, string>>;
}

export interface DemoState {
  schemaVersion: 1;
  generation: number;
  environments: Environment[];
  revisions: Revision[];
  instances: Instance[];
  profiles: Profile[];
  clusters: Cluster[];
  auditEvents: AuditEvent[];
  securityIncidents: SecurityIncident[];
  deploymentSteps: Record<string, number>;
  isolationSteps: Record<string, number>;
}

export interface CreateEnvironmentInput {
  name: string;
  project: string;
  owner: string;
  image?: string;
  containerPort?: number;
  desiredInstances: number;
  runtimePlanId: string;
  ingressProfileId: string;
  egressProfileId: string;
  endpointVisibility?: string;
  sessionHeader?: string;
  secureTaskProfileId?: string;
  identityProfileId?: string;
  loggingProfileId?: string;
  domainProfileId?: string;
}

export interface AccessRequestSnapshot {
  method: string;
  path: string;
  body: string;
  sessionHeader: string;
  sessionValue: string;
}

export interface AccessResult {
  allowed: boolean;
  sessionKey: string;
  environmentId: string;
  instanceId?: string;
  policyId: string;
  destination: string;
  auditEventId: string;
  requestId: string;
  request: AccessRequestSnapshot;
  message: string;
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
