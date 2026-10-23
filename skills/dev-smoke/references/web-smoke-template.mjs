// Disposable web smoke script template. Run it from a sandbox dir, never from the repo:
//   mkdir -p "$SANDBOX" && cd "$SANDBOX" && npm init -y >/dev/null && npm i playwright
//   cp <this file> web-smoke.mjs && APP_DIR=<project> node web-smoke.mjs
// Uses installed Chrome by default (SMOKE_BROWSER=chrome); set SMOKE_BROWSER=chromium after
// `npx playwright install chromium` to use the bundled browser instead.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const APP_DIR = resolve(process.env.APP_DIR ?? process.cwd());
const PORT = process.env.SMOKE_PORT ?? "4173";
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// Pass the port explicitly so the smoke server never collides with the user's own dev server.
const START_CMD = process.env.SMOKE_START_CMD ?? `npm run dev -- --port ${PORT}`;
const READY_PATH = process.env.SMOKE_READY_PATH ?? "/";
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? 120_000);
const BROWSER = process.env.SMOKE_BROWSER ?? "chrome";
const SHOTS_DIR = resolve(process.env.SMOKE_SHOTS_DIR ?? "screenshots");

const results = [];
let server;
let browser;

async function startServer() {
  if (process.env.SMOKE_BASE_URL) return; // An already running sandbox server was provided.
  server = spawn(START_CMD, {
    cwd: APP_DIR,
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT, BROWSER: "none", CI: "1" },
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early:\n${log.slice(-2000)}`);
    try {
      const res = await fetch(new URL(READY_PATH, BASE_URL));
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not ready at ${BASE_URL} after ${READY_TIMEOUT_MS}ms:\n${log.slice(-2000)}`);
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM"); // Kill the whole process group, not just the shell.
  } catch {}
}

// Each check gets a fresh browser context: no saved logins, cookies, or storage.
async function check(name, fn) {
  console.log(`\n## ${name}`);
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()));
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const shot = join(SHOTS_DIR, `${results.length + 1}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
  try {
    await fn(page);
    if (consoleErrors.length) throw new Error(`console errors:\n${consoleErrors.join("\n")}`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`PASS screenshot=${shot}`);
    results.push(`PASS|${name}`);
  } catch (err) {
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.log(`FAIL ${err.message}\nscreenshot=${shot}`);
    results.push(`FAIL|${name}`);
  } finally {
    await context.close();
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await startServer();
  browser = await chromium.launch(BROWSER === "chromium" ? {} : { channel: BROWSER });

  // Scenarios: one check per setup / action / expected result.
  // await check("changed flow: <name>", async (page) => {
  //   const res = await page.goto(new URL("/<route>", BASE_URL).href);
  //   expect(res?.ok(), `status ${res?.status()}`);
  //   await page.getByRole("button", { name: "<label>" }).filter({ visible: true }).click();
  //   await page.getByText("<expected text>").filter({ visible: true }).first().waitFor();
  //   expect(page.url().endsWith("/<next-route>"), `unexpected url ${page.url()}`);
  // });
  // await check("adjacent flow: <name>", async (page) => { ... });
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.log(`\nSETUP FAIL ${err.message}`);
  exitCode = 1;
} finally {
  await browser?.close();
  stopServer();
}

const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n## SUMMARY\nbase=${BASE_URL}\nscreenshots=${SHOTS_DIR}`);
console.log(`pass=${results.length - failed}\nfail=${failed}`);
results.forEach((r) => console.log(r));
process.exit(exitCode || (failed ? 1 : 0));
