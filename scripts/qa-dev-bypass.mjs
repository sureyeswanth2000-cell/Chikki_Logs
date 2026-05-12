#!/usr/bin/env node

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const now = new Date();
const iso = now.toISOString();
const compactStamp = iso.replace(/[:.]/g, "-");

const baseUrls = {
  consumer: "http://localhost:3000/consumer?devAuth=consumer",
  owner: "http://localhost:3000/consumer?devAuth=owner",
  operator: "http://localhost:3000/operator?devAuth=operator",
  superadmin: "http://localhost:3000/internal-control?devAuth=superadmin",
};

const args = new Set(process.argv.slice(2));
const shouldOpen = !args.has("--no-open");
const shouldLog = !args.has("--no-log");

function openUrl(url) {
  const platform = process.platform;
  if (platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

function printHeader() {
  console.log("Chikki Dev Bypass QA Runner");
  console.log("Timestamp:", iso);
  console.log("");
  console.log("Role URLs:");
  console.log("- consumer  :", baseUrls.consumer);
  console.log("- owner     :", baseUrls.owner);
  console.log("- operator  :", baseUrls.operator);
  console.log("- superadmin:", baseUrls.superadmin);
  console.log("");
}

function printChecklist() {
  console.log("QA Checklist (repeat every run):");
  console.log("[ ] Open consumer URL and confirm Consumer page loads without OTP.");
  console.log("[ ] Search listings on Consumer page.");
  console.log("[ ] Open booking page and complete review/confirm.");
  console.log("[ ] Create booking (dev mock success expected).");
  console.log("[ ] On Consumer open bookings: Check In.");
  console.log("[ ] On Consumer open bookings: Modify booking.");
  console.log("[ ] On Consumer open bookings: Report bed issue.");
  console.log("[ ] On Consumer open bookings: Checkout.");
  console.log("[ ] Open owner URL and verify owner-role routing.");
  console.log("[ ] Open operator URL and verify operator console routing.");
  console.log("[ ] Open superadmin URL and verify internal-control routing.");
  console.log("");
  console.log("Tips:");
  console.log("- Run app first: npm run dev");
  console.log("- Use --no-open if you only want checklist/log output.");
  console.log("- Use --no-log if you do not want log file updates.");
}

function writeLog() {
  const logDir = join(projectRoot, "qa-logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "dev-bypass-qa-log.md");
  const block = [
    `## Run ${iso}`,
    "",
    "Role URLs:",
    `- consumer: ${baseUrls.consumer}`,
    `- owner: ${baseUrls.owner}`,
    `- operator: ${baseUrls.operator}`,
    `- superadmin: ${baseUrls.superadmin}`,
    "",
    "Checklist:",
    "- [ ] Consumer bypass opened",
    "- [ ] Listing search verified",
    "- [ ] Booking review and confirm verified",
    "- [ ] Create booking mock success verified",
    "- [ ] Check In verified",
    "- [ ] Modify booking verified",
    "- [ ] Report bed issue verified",
    "- [ ] Checkout verified",
    "- [ ] Owner route verified",
    "- [ ] Operator route verified",
    "- [ ] Superadmin route verified",
    "",
  ].join("\n");
  appendFileSync(logPath, block);
  return logPath;
}

function run() {
  printHeader();

  if (shouldOpen) {
    openUrl(baseUrls.consumer);
    openUrl(baseUrls.owner);
    openUrl(baseUrls.operator);
    openUrl(baseUrls.superadmin);
    console.log("Opened role URLs in your default browser.");
    console.log("");
  } else {
    console.log("Skipping browser open (--no-open).");
    console.log("");
  }

  printChecklist();

  if (shouldLog) {
    const logPath = writeLog();
    const relativeLogPath = logPath.replace(projectRoot + "\\", "").replace(/\\/g, "/");
    console.log("");
    console.log("Log updated:", relativeLogPath);
    console.log("Run ID:", compactStamp);
  } else {
    console.log("");
    console.log("Log writing skipped (--no-log).");
  }
}

run();
