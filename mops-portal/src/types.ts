export interface Me {
  sub: string;
  username: string;
  email: string;
  name: string;
  agency: string | null;
  roles: string[];
  isOriginator: boolean;
  isMoPSStaff: boolean;
  canProvision: boolean;
  canApproveAsPS: boolean;
  actingAsDelegate: { role: string; delegatedBy: string; expiresAt: string } | null;
}

export interface EmploymentRequest {
  id: string;
  reference: string;
  position_title: string;
  origin_agency: string;
  handling_agency: string;
  status: string;
  created_by_email: string | null;
  assigned_to_sub: string | null;
  assigned_to_email: string | null;
  created_at: string;
}

export interface Transition {
  from_status: string | null;
  to_status: string;
  action: string;
  actor_email: string | null;
  effective_role: string;
  delegated_by_sub: string | null;
  note: string | null;
  created_at: string;
}

export interface RequestDetail extends EmploymentRequest {
  details: Record<string, unknown>;
  transitions: Transition[];
  minute: { document: Record<string, unknown> } | null;
}

export interface Delegation {
  id: string;
  delegator_email: string | null;
  delegate_email: string | null;
  delegated_role: string;
  scope: string;
  ministry: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: string;
  effectiveStatus: string;
}

export interface DirUser {
  sub: string;
  email: string;
  name: string;
}

export interface AgencyRef {
  code: string;
  name: string;
  canOriginate: boolean;
}

export interface AuditEvent {
  id: string;
  actor_email: string | null;
  actor_agency: string | null;
  action: string;
  resource_type: string;
  resource_ref: string | null;
  effective_role: string | null;
  delegated: boolean;
  delegated_by_sub: string | null;
  result: string;
  created_at: string;
}
