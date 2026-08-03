#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'docs-site');
const primaryOutDir = path.join(root, 'dist-docs');
const bundledOutDir = path.join(root, 'dist', 'docs');

const pages = [
  { file: 'index.md', slug: 'index', href: '/docs/', label: 'Overview' },
  { file: 'usage.md', slug: 'usage', href: '/docs/usage', label: 'Usage' },
  { file: 'api.md', slug: 'api', href: '/docs/api', label: 'API' },
  { file: 'mcp.md', slug: 'mcp', href: '/docs/mcp', label: 'MCP' },
  { file: 'self-hosting.md', slug: 'self-hosting', href: '/docs/self-hosting', label: 'Self-hosting' },
];

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleFromMarkdown(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function layout({ title, body, slug }) {
  const nav = pages.map((page) => {
    const active = page.slug === slug ? ' aria-current="page" class="active"' : '';
    return `<a href="${page.href}"${active}>${escapeHtml(page.label)}</a>`;
  }).join('\n        ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Mob Docs</title>
  <link rel="icon" type="image/svg+xml" href="/app/icons/icon.svg">
  <link rel="stylesheet" href="/docs/docs.css">
</head>
<body>
  <div class="docs-shell">
    <aside class="docs-sidebar">
      <a class="brand" href="/docs/" aria-label="Mob documentation home">
        <img src="/app/icons/icon.svg" alt="" width="30" height="30">
        <span><strong>Mob</strong><small>Documentation</small></span>
      </a>
      <nav aria-label="Documentation">
        ${nav}
      </nav>
      <div class="sidebar-footer">
        <a href="/">Home</a>
        <a href="/app/">Open app</a>
        <a href="/api/v1/docs">REST reference</a>
      </div>
    </aside>
    <main class="docs-content">
      ${body}
    </main>
  </div>
</body>
</html>`;
}

const css = `:root {
  color-scheme: light dark;
  --bg: #f5f9ff;
  --surface: #ffffff;
  --surface-2: #f8fbff;
  --ink: #0b1a2e;
  --muted: #5c7290;
  --line: #dce6f5;
  --primary: #2563eb;
  --primary-2: #06b6d4;
  --accent: #0891b2;
  --code-bg: #0c1726;
  --code-ink: #e8eef7;
  --shadow: 0 20px 50px rgba(11, 26, 46, .10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #07111f;
    --surface: #0d1b2d;
    --surface-2: #12233a;
    --ink: #eef6ff;
    --muted: #9fb3cc;
    --line: #243955;
    --primary: #60a5fa;
    --primary-2: #22d3ee;
    --accent: #67e8f9;
    --code-bg: #030712;
    --code-ink: #e5edf8;
    --shadow: 0 20px 50px rgba(0, 0, 0, .35);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 18%, transparent), transparent 32rem), var(--bg);
  color: var(--ink);
  line-height: 1.65;
}
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.docs-shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
.docs-sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  padding: 1.25rem;
  border-right: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.brand { display: flex; align-items: center; gap: .75rem; color: var(--ink); }
.brand span { display: grid; line-height: 1.2; }
.brand small { color: var(--muted); font-size: .8rem; font-weight: 600; }
.docs-sidebar nav { display: grid; gap: .35rem; }
.docs-sidebar nav a, .sidebar-footer a {
  border-radius: .75rem;
  padding: .65rem .8rem;
  color: var(--muted);
  font-weight: 700;
}
.docs-sidebar nav a.active, .docs-sidebar nav a:hover {
  color: #fff;
  text-decoration: none;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
}
.sidebar-footer { margin-top: auto; display: grid; gap: .25rem; font-size: .9rem; }
.sidebar-footer .header-button {
  text-align: center;
  border: 1px solid var(--line);
  color: var(--ink);
}
.sidebar-footer .header-button:hover { text-decoration: none; }
.sidebar-footer .header-button--secondary {
  background: var(--surface-2);
}
.sidebar-footer .header-button--primary {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 24%, transparent);
}
.docs-content {
  width: min(100%, 1060px);
  padding: 3rem clamp(1.25rem, 5vw, 4rem) 5rem;
}
.docs-content > h1:first-child {
  font-size: clamp(2.25rem, 5vw, 4.25rem);
  line-height: 1.05;
  letter-spacing: -.04em;
  margin-top: 0;
  max-width: 14ch;
}
h1, h2, h3 { line-height: 1.2; letter-spacing: -.02em; }
h2 { margin-top: 2.8rem; border-top: 1px solid var(--line); padding-top: 1.8rem; }
h3 { margin-top: 2rem; }
p, li { color: color-mix(in srgb, var(--ink) 88%, var(--muted)); }
blockquote {
  margin: 1.5rem 0;
  padding: 1rem 1.25rem;
  border-left: 4px solid var(--accent);
  background: var(--surface);
  border-radius: 0 .9rem .9rem 0;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  border: 1px solid var(--line);
  border-radius: .4rem;
  padding: .1rem .35rem;
  font-size: .88em;
}
pre {
  overflow-x: auto;
  padding: 1rem;
  border-radius: 1rem;
  background: var(--code-bg);
  color: var(--code-ink);
  box-shadow: var(--shadow);
}
pre code { background: transparent; border: 0; padding: 0; color: inherit; }
table {
  width: 100%;
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
  margin: 1.25rem 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 1rem;
}
th, td { padding: .75rem .9rem; border-bottom: 1px solid var(--line); vertical-align: top; min-width: 9rem; }
th { text-align: left; background: var(--surface-2); color: var(--ink); }
tr:last-child td { border-bottom: 0; }
hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
.docs-content img { max-width: 100%; }
.docs-content .lead { font-size: 1.2rem; color: var(--muted); max-width: 62ch; }
.docs-content .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.docs-content .card { background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; padding: 1rem; box-shadow: var(--shadow); }
@media (max-width: 850px) {
  .docs-shell { grid-template-columns: 1fr; }
  .docs-sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .docs-sidebar nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sidebar-footer { grid-template-columns: repeat(4, max-content); margin-top: 0; align-items: center; }
}
`;

async function buildInto(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'docs.css'), css, 'utf8');

  const available = new Set(await readdir(sourceDir));
  for (const page of pages) {
    if (!available.has(page.file)) throw new Error(`Missing docs page: ${page.file}`);
    const markdown = await readFile(path.join(sourceDir, page.file), 'utf8');
    const body = marked.parse(markdown, { async: false });
    const html = layout({ title: titleFromMarkdown(markdown, page.label), body, slug: page.slug });
    await writeFile(path.join(outDir, `${page.slug}.html`), html, 'utf8');
  }
}

await buildInto(primaryOutDir);
if (existsSync(path.join(root, 'dist'))) {
  await buildInto(bundledOutDir);
}
console.log(`Built documentation site: ${path.relative(root, primaryOutDir)}`);
if (existsSync(bundledOutDir)) console.log(`Built bundled documentation site: ${path.relative(root, bundledOutDir)}`);
