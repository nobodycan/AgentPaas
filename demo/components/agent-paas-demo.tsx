"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors preserve standard link behavior; the shell intercepts eligible same-origin product routes. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CreateEnvironmentWizard,
  EnvironmentListPage,
} from "../features/environments";
import { EnvironmentDetailPanel } from "../features/environment-detail";
import {
  AuditCenterPage,
  ProfileManagementPage,
  ResourcePoolsPage,
  SecurityEventsPage,
} from "../features/governance";
import { OverviewPage } from "../features/overview";
import {
  isProductPath,
  parseRoute,
} from "../lib/routes";
import type { AppRoute } from "../lib/routes";
import { AppShell } from "./app-shell";
import { EmptyState } from "./ui";

function NotFoundPanel(): React.ReactElement {
  return (
    <EmptyState
      title="页面不存在"
      description="当前地址不属于 Agent PaaS 演示产品路由。"
      action={
        <a href="/overview" className="button button--primary">
          返回概览
        </a>
      }
    />
  );
}

function RoutePanel({
  route,
  search,
  onNavigate,
}: {
  route: AppRoute;
  search: string;
  onNavigate(destination: string): void;
}): React.ReactElement {
  switch (route.view) {
    case "overview":
      return <OverviewPage onNavigate={onNavigate} />;
    case "environment-list":
      return <EnvironmentListPage onNavigate={onNavigate} />;
    case "environment-create":
      return <CreateEnvironmentWizard onNavigate={onNavigate} />;
    case "environment-detail":
      return (
        <EnvironmentDetailPanel
          environmentId={route.environmentId}
          tab={route.tab}
          onNavigate={onNavigate}
        />
      );
    case "audit":
      return (
        <AuditCenterPage
          key={search}
          search={search}
          onNavigate={onNavigate}
        />
      );
    case "security-events":
      return <SecurityEventsPage />;
    case "resource-pools":
      return <ResourcePoolsPage />;
    case "profiles":
      return <ProfileManagementPage />;
    case "not-found":
      return <NotFoundPanel />;
  }
}

export function AgentPaaSDemo({
  initialPath,
}: {
  initialPath: string;
}): React.ReactElement {
  const [clientLocation, setClientLocation] = useState(initialPath);
  const parsedLocation = useMemo(
    () => new URL(clientLocation, "https://demo.agentpaas.local"),
    [clientLocation],
  );
  const canonicalPathname =
    parsedLocation.pathname === "/"
      ? "/overview"
      : parsedLocation.pathname;
  const route = useMemo(
    () => parseRoute(canonicalPathname),
    [canonicalPathname],
  );

  useEffect(() => {
    const syncClientLocation = () => {
      setClientLocation(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    };
    syncClientLocation();
    window.addEventListener("popstate", syncClientLocation);
    return () =>
      window.removeEventListener("popstate", syncClientLocation);
  }, []);

  const navigate = useCallback((destination: string) => {
    const url = new URL(destination, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !isProductPath(url.pathname)
    ) {
      return;
    }

    const nextLocation = `${url.pathname}${url.search}${url.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextLocation !== currentLocation) {
      window.history.pushState({}, "", nextLocation);
    }
    setClientLocation(nextLocation);
  }, []);

  const handleLinkClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest("a")
          : null;
      if (
        !target ||
        target.hasAttribute("download") ||
        (target.target && target.target !== "_self")
      ) {
        return;
      }

      const href = target.getAttribute("href");
      if (!href) {
        return;
      }

      const url = new URL(href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        !isProductPath(url.pathname)
      ) {
        return;
      }
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }

      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    },
    [navigate],
  );

  return (
    <div onClick={handleLinkClick}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <AppShell pathname={canonicalPathname} onNavigate={navigate}>
        <RoutePanel
          route={route}
          search={parsedLocation.search}
          onNavigate={navigate}
        />
      </AppShell>
    </div>
  );
}
