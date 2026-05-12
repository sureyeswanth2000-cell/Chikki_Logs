#!/usr/bin/env node

import { exec } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const appRoot = join(projectRoot, "src", "app");
const siteChromePath = join(projectRoot, "src", "components", "layout", "site-chrome.jsx");

const ALL_ROLES = ["guest", "consumer", "owner", "operator", "superadmin"];
const ROLE_ENTRY_URLS = {
  guest: "http://localhost:3000/",
  consumer: "http://localhost:3000/consumer?devAuth=consumer",
  owner: "http://localhost:3000/consumer?devAuth=owner",
  operator: "http://localhost:3000/operator?devAuth=operator",
  superadmin: "http://localhost:3000/internal-control?devAuth=superadmin",
};

const args = new Set(process.argv.slice(2));
const shouldOpen = !args.has("--no-open");
const shouldLog = !args.has("--no-log");

function walkPageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkPageFiles(full));
      continue;
    }
    if (entry.name === "page.jsx" || entry.name === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

function routeFromPageFile(filePath) {
  const rel = relative(appRoot, filePath).split(sep).join("/");
  const routePart = rel.replace(/\/page\.(jsx|tsx)$/i, "").replace(/^page\.(jsx|tsx)$/i, "");
  if (!routePart) {
    return "/";
  }
  return `/${routePart}`;
}

function cleanText(raw) {
  if (!raw) {
    return "";
  }
  const text = String(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length < 2 || text.length > 120) {
    return "";
  }
  if (/handle[A-Za-z0-9_]*|className=|disabled=|=>/.test(text)) {
    return "";
  }
  if (/^[^a-zA-Z0-9]+$/.test(text)) {
    return "";
  }
  return text;
}

function parseAllowedRoles(content) {
  const match = content.match(/allowedRoles=\{\s*\[([\s\S]*?)\]\s*\}/m);
  if (!match) {
    return [...ALL_ROLES];
  }
  const raw = match[1];
  const roles = [];
  const re = /["'](guest|consumer|owner|operator|superadmin)["']/g;
  let item;
  while ((item = re.exec(raw)) !== null) {
    roles.push(item[1]);
  }
  if (roles.length === 0) {
    return [...ALL_ROLES];
  }
  return Array.from(new Set(roles));
}

function extractButtonActions(content) {
  const actions = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const text = cleanText(inner);
    if (text) {
      actions.push(`Click button: ${text}`);
      continue;
    }
    const onClick = attrs.match(/onClick=\{(?:\(\)\s*=>\s*(?:void\s+)?)?([A-Za-z0-9_$.]+)/);
    if (onClick && onClick[1]) {
      actions.push(`Trigger action: ${onClick[1]}`);
    }
  }
  return actions;
}

function extractLinkActions(content) {
  const actions = [];
  const linkRe = /<Link\b([^>]*)>([\s\S]*?)<\/Link>/g;
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;

  function parseAttrs(attrs) {
    const hrefMatch = attrs.match(/href=\{?["']([^"'}]+)["']\}?/);
    return hrefMatch ? hrefMatch[1] : "";
  }

  let match;
  while ((match = linkRe.exec(content)) !== null) {
    const href = parseAttrs(match[1] || "");
    const text = cleanText(match[2] || "");
    if (text && href) {
      actions.push(`Open link: ${text} (${href})`);
    } else if (href) {
      actions.push(`Open link target: ${href}`);
    }
  }

  while ((match = anchorRe.exec(content)) !== null) {
    const href = parseAttrs(match[1] || "");
    const text = cleanText(match[2] || "");
    if (text && href) {
      actions.push(`Open anchor: ${text} (${href})`);
    } else if (href) {
      actions.push(`Open anchor target: ${href}`);
    }
  }

  return actions;
}

function extractFormActions(content) {
  const actions = [];
  const formRe = /<form\b([^>]*)>/g;
  let match;
  while ((match = formRe.exec(content)) !== null) {
    const attrs = match[1] || "";
    const onSubmit = attrs.match(/onSubmit=\{(?:\(.*?\)\s*=>\s*(?:void\s+)?)?([A-Za-z0-9_$.]+)/);
    if (onSubmit && onSubmit[1]) {
      actions.push(`Submit form: ${onSubmit[1]}`);
    } else {
      actions.push("Submit form");
    }
  }
  return actions;
}

function extractSelectOptions(content) {
  const actions = [];
  const optionRe = /<option\b[^>]*>([\s\S]*?)<\/option>/g;
  let match;
  while ((match = optionRe.exec(content)) !== null) {
    const text = cleanText(match[1] || "");
    if (text) {
      actions.push(`Select option: ${text}`);
    }
  }
  return actions;
}

function extractPageActions(content) {
  const merged = [
    ...extractButtonActions(content),
    ...extractLinkActions(content),
    ...extractFormActions(content),
    ...extractSelectOptions(content),
  ];
  return Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b));
}

function extractGlobalNavOptions() {
  try {
    const content = readFileSync(siteChromePath, "utf8");
    const labels = [];
    const re = /label:\s*["']([^"']+)["']/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      const text = cleanText(match[1]);
      if (text) {
        labels.push(text);
      }
    }
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function openUrl(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

function generateChecklist({ pages, navOptions, generatedAt }) {
  const lines = [];
  lines.push("# Full Role QA Checklist");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("## Entry URLs");
  lines.push("");
  for (const role of ALL_ROLES) {
    lines.push(`- ${role}: ${ROLE_ENTRY_URLS[role]}`);
  }
  lines.push("");

  lines.push("## Global Navigation Options");
  lines.push("");
  if (navOptions.length === 0) {
    lines.push("- [ ] No static nav labels found in layout component");
  } else {
    for (const item of navOptions) {
      lines.push(`- [ ] Verify nav option: ${item}`);
    }
  }
  lines.push("");

  for (const role of ALL_ROLES) {
    lines.push(`## Role: ${role}`);
    lines.push("");

    const visiblePages = pages
      .filter((page) => page.allowedRoles.includes(role))
      .sort((a, b) => a.route.localeCompare(b.route));

    if (visiblePages.length === 0) {
      lines.push("- [ ] No routes discovered for this role");
      lines.push("");
      continue;
    }

    for (const page of visiblePages) {
      lines.push(`- [ ] Visit ${page.route}`);
      lines.push(`- [ ] Route source: ${page.source}`);
      if (page.actions.length === 0) {
        lines.push("- [ ] No static actions detected on this route");
      } else {
        for (const action of page.actions) {
          lines.push(`- [ ] ${page.route}: ${action}`);
        }
      }
    }

    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("- This checklist is generated from source files (routes + static JSX actions).");
  lines.push("- Dynamic UI that depends on runtime API data may show extra actions during testing.");
  lines.push("- Run with localhost dev bypass for fast role-by-role QA.");
  lines.push("");

  return lines.join("\n");
}

function main() {
  const now = new Date();
  const iso = now.toISOString();
  const stamp = iso.replace(/[:.]/g, "-");

  const pageFiles = walkPageFiles(appRoot);
  const pages = pageFiles.map((filePath) => {
    const content = readFileSync(filePath, "utf8");
    const route = routeFromPageFile(filePath);
    const source = relative(projectRoot, filePath).split(sep).join("/");
    return {
      route,
      source,
      allowedRoles: parseAllowedRoles(content),
      actions: extractPageActions(content),
    };
  });

  const navOptions = extractGlobalNavOptions();
  const markdown = generateChecklist({ pages, navOptions, generatedAt: iso });

  const logDir = join(projectRoot, "qa-logs");
  mkdirSync(logDir, { recursive: true });
  const latestPath = join(logDir, "full-role-qa-checklist-latest.md");
  const runPath = join(logDir, `full-role-qa-checklist-${stamp}.md`);

  if (shouldLog) {
    writeFileSync(latestPath, markdown, "utf8");
    writeFileSync(runPath, markdown, "utf8");
  }

  console.log("Chikki Full Role QA Generator");
  console.log("Generated routes:", pages.length);
  console.log("Generated at:", iso);
  if (shouldLog) {
    console.log("Checklist files:");
    console.log("- qa-logs/full-role-qa-checklist-latest.md");
    console.log(`- qa-logs/full-role-qa-checklist-${stamp}.md`);
  } else {
    console.log("Log writing skipped (--no-log).");
  }

  if (shouldOpen) {
    openUrl(ROLE_ENTRY_URLS.guest);
    openUrl(ROLE_ENTRY_URLS.consumer);
    openUrl(ROLE_ENTRY_URLS.owner);
    openUrl(ROLE_ENTRY_URLS.operator);
    openUrl(ROLE_ENTRY_URLS.superadmin);
    console.log("Opened role entry URLs in your browser.");
  } else {
    console.log("Skipping browser open (--no-open).");
  }

  console.log("Tip: run npm run dev before manual QA walkthrough.");
}

main();
