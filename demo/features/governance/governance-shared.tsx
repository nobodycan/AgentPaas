"use client";

import React from "react";

import { MockDataLabel } from "../../components/ui";
import type { StatusTone } from "../../components/ui";

export function governanceStatusTone(status: string): StatusTone {
  if (
    ["Healthy", "Contained", "Resolved", "Low", "ALLOW", "SUCCESS"].includes(
      status,
    )
  ) {
    return "success";
  }
  if (["Containing", "Medium", "Running"].includes(status)) {
    return "info";
  }
  if (["Open", "Degraded", "WARN"].includes(status)) {
    return "warning";
  }
  if (
    ["Critical", "Unavailable", "Isolated", "DENY", "ERROR", "High"].includes(
      status,
    )
  ) {
    return "danger";
  }
  return "neutral";
}

export function GovernancePageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="page-header governance-page-header">
      <div>
        <div className="governance-page-header__eyebrow">
          <p className="eyebrow">{eyebrow}</p>
          <MockDataLabel />
          <span className="pilot-label">指标待试点验证</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

export function formatGovernanceTime(value: string): string {
  return value.replace("T", " ").slice(0, 19);
}
