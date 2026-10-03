// Shared plumbing for the recorder and editor: env, browser, programmatic login.
// Credentials are read from growth/.env.local and never printed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { mainRoot } from "../ledger.mjs";

export const ROOT = mainRoot();

/** Parse growth/.env.local (KEY=VALUE lines) into process.env without overriding real env vars. */
export function loadEnv() {
  const file = path.join(ROOT, "growth", ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
  const need = ["GROWTH_STAGING_URL", "GROWTH_STAGING_EMAIL", "GROWTH_STAGING_PASSWORD"];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(", ")} (see growth/.env.example)`);
  const url = process.env.GROWTH_STAGING_URL.replace(/\/$/, "");
  if (!/^https:\/\/snap-staging\.webcules\.com$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error(`refusing to record against ${url}: only staging or a local dev server`);
  }
  return { url, email: process.env.GROWTH_STAGING_EMAIL, password: process.env.GROWTH_STAGING_PASSWORD };
}

/** Playwright comes from apps/snap (@playwright/test). */
export function playwright() {
  return createRequire(path.join(ROOT, "apps", "snap", "package.json"))("@playwright/test");
}

/** The pinned @playwright/test may expect a browser build that is not installed; use the newest Chrome for Testing we have. */
export function chromePath() {
  if (process.env.GROWTH_CHROME) return process.env.GROWTH_CHROME;
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (fs.existsSync(cache)) {
    const builds = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const b of builds) {
      for (const arch of ["chrome-mac-arm64", "chrome-mac"]) {
        const p = path.join(cache, b, arch, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined; // fall back to Playwright's own resolution
}

export async function launch({ headless = true } = {}) {
  const { chromium } = playwright();
  return chromium.launch({ headless, executablePath: chromePath(), args: ["--hide-scrollbars", "--disable-infobars", "--force-color-profile=srgb", "--font-render-hinting=none"] });
}

/** Sign in through Better Auth's email endpoint and return cookies ready for context.addCookies. */
export async function apiLogin({ url, email, password }) {
  const res = await fetch(`${url}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const host = new URL(url).hostname;
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookies = raw.map((c) => {
    const [pair, ...attrs] = c.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    const secure = attrs.some((a) => a.toLowerCase() === "secure");
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: host, path: "/", httpOnly: true, secure, sameSite: "Lax" };
  });
  if (!cookies.length) throw new Error("login returned no session cookie");
  return cookies;
}
