"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors preserve standard link behavior; the client router progressively enhances eligible product routes. */

import React, { useMemo, useState } from "react";

import { useDemo } from "../lib/demo-store";
import {
  DEMO_STEPS,
  getDemoStepForPath,
  getNextDemoStep,
} from "../lib/routes";
import { MockDataLabel } from "./ui";

const PRIMARY_NAVIGATION = [
  { label: "概览", href: "/overview", mark: "概" },
  { label: "运行环境", href: "/environments", mark: "环" },
  { label: "审计中心", href: "/audit", mark: "审" },
  { label: "安全事件", href: "/security-events", mark: "安" },
  { label: "资源池", href: "/resource-pools", mark: "资" },
  { label: "Profile 管理", href: "/profiles", mark: "P" },
] as const;

function isNavigationItemActive(pathname: string, href: string): boolean {
  return href === "/environments"
    ? pathname === href || pathname.startsWith(`${href}/`)
    : pathname === href;
}

export function AppShell({
  pathname,
  onNavigate,
  children,
}: {
  pathname: string;
  onNavigate: (destination: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { resetDemo } = useDemo();
  const activeDemoStep = useMemo(
    () => getDemoStepForPath(pathname),
    [pathname],
  );
  const nextDemoStep = getNextDemoStep(activeDemoStep?.id);

  return (
    <div
      className={`app-shell ${
        sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""
      }`}
    >
      <header className="topbar">
        <div className="topbar__brand">
          <a href="/overview" className="brand-link" aria-label="Agent PaaS 概览">
            <span className="brand-mark" aria-hidden="true">
              AP
            </span>
            <span>
              <strong>Agent PaaS</strong>
              <small>生产运行与治理平台</small>
            </span>
          </a>
        </div>
        <div className="topbar__context" aria-label="当前工作区">
          <span>
            租户 <strong>星海科技</strong>
          </span>
          <span className="context-divider" aria-hidden="true">
            /
          </span>
          <span>
            项目 <strong>customer-service</strong>
          </span>
        </div>
        <div className="topbar__meta">
          <MockDataLabel />
          <span className="user-avatar" aria-label="当前用户：演示管理员">
            演
          </span>
        </div>
      </header>

      <aside className="sidebar" aria-label="产品导航">
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <span aria-hidden="true">{sidebarCollapsed ? "»" : "«"}</span>
          <span className="sidebar-toggle__label">
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </span>
        </button>

        <nav className="primary-navigation" aria-label="主导航">
          {PRIMARY_NAVIGATION.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="primary-navigation__link"
              aria-current={
                isNavigationItemActive(pathname, item.href)
                  ? "page"
                  : undefined
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="primary-navigation__mark" aria-hidden="true">
                {item.mark}
              </span>
              <span className="primary-navigation__label">{item.label}</span>
            </a>
          ))}
        </nav>

        <section className="demo-guide" aria-labelledby="demo-guide-title">
          <div className="demo-guide__heading">
            <div>
              <p className="eyebrow">演示导览</p>
              <h2 id="demo-guide-title">七步了解平台</h2>
            </div>
            <span>
              {activeDemoStep
                ? `${DEMO_STEPS.indexOf(activeDemoStep) + 1}/7`
                : "—/7"}
            </span>
          </div>
          <ol className="demo-guide__steps">
            {DEMO_STEPS.map((step, index) => {
              const active = step.id === activeDemoStep?.id;
              return (
                <li key={step.id}>
                  <a
                    href={step.destination}
                    aria-current={active ? "step" : undefined}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    <span>{step.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <div className="demo-guide__next">
            <span>下一步</span>
            <strong>{nextDemoStep.title}</strong>
            <p>{nextDemoStep.description}</p>
            <a href={nextDemoStep.destination} className="button button--primary">
              {nextDemoStep.actionLabel}
            </a>
          </div>
          <button
            type="button"
            className="demo-guide__reset"
            onClick={() => {
              resetDemo();
              onNavigate("/overview");
            }}
          >
            重置演示
          </button>
        </section>
      </aside>

      <main className="app-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
