import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Agent PaaS baseline", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Agent PaaS · 生产运行与治理平台<\/title>/i,
  );
  assert.match(html, /把 Agent 镜像变成受控的生产服务/);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /Building your site/i);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
});

test("publishes Chinese product metadata and the local social preview", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /<meta name="description" content="把 Agent 镜像变成可访问、可运维、可约束、可审计的生产服务。"\s*\/?>/i,
  );
  assert.match(
    html,
    /<meta property="og:title" content="Agent PaaS · 生产运行与治理平台"\s*\/?>/i,
  );
  assert.match(
    html,
    /<meta property="og:description" content="把 Agent 镜像变成可访问、可运维、可约束、可审计的生产服务。"\s*\/?>/i,
  );
  assert.match(
    html,
    /<meta property="og:image" content="(?:https?:\/\/[^"]+)?\/og\.png"\s*\/?>/i,
  );
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\s*\/?>/i);
  assert.match(
    html,
    /<meta name="twitter:image" content="(?:https?:\/\/[^"]+)?\/og\.png"\s*\/?>/i,
  );
});

test("does not load remote fonts, CDNs, or business APIs", async () => {
  const [response, layout, styles] = await Promise.all([
    render(),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.doesNotMatch(layout, /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/i);
  assert.doesNotMatch(styles, /@import\s+url\(|fonts\.googleapis\.com|fonts\.gstatic\.com/i);
  assert.doesNotMatch(
    html,
    /<(?:script|link)\b[^>]+(?:src|href)="https?:\/\/[^"]+"/i,
  );
});

test("keeps narrow-screen primary navigation targets at least 44px tall", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    styles,
    /@media \(max-width: 860px\) \{[\s\S]*?\.primary-navigation__link,\s*\.app-shell--sidebar-collapsed \.primary-navigation__link \{[^}]*min-height:\s*2\.75rem;/,
  );
});

test("removes the disposable starter preview", async () => {
  const [page, packageJson, packageLock] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(packageLock, /react-loading-skeleton/);
  await assert.rejects(
    access(new URL("../app/_sites-preview/", import.meta.url)),
  );
});
