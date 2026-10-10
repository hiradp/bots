// Bots usage report: subscription quota and API-equivalent spend across Pi, Claude Code, and
// Codex, printed as one table. Run through `bots report`.
//
// Pi's /usage aggregator (pi/extensions/usage) does the counting. Pi sessions go through it
// as-is. Claude Code and Codex transcripts record tokens but not dollars, so their requests are
// priced here and fed through the same aggregator as Pi-shaped assistant entries.
//
// Only the default Claude identity (~/.claude) is counted. Runs a harness starts for another
// agent without persisting a session (Pi subagents and historical `claude` tool runs) are
// counted under the harness that started them.

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  addLocalDays,
  addTotals,
  aggregateUsage,
  compareUsage,
  loadUsageSessions,
  type UsageSession,
} from "../pi/extensions/usage/report.ts";
import type { UsageReport, UsageTotals } from "../pi/extensions/usage/types.ts";
import { formatTokenCount } from "../pi/extensions/usage/view.ts";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const CODEX_DIR = join(HOME, ".codex");
const PI_MODELS = join(HOME, ".pi/agent/models-store.json");

// ------------------------------------------------------------------------------
// Pricing
// ------------------------------------------------------------------------------

/** Dollars per million tokens. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Models Pi's catalog doesn't list yet, from Anthropic's published prices.
const EXTRA_PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

// Anthropic bills 1-hour cache writes at twice the input price; `cacheWrite` is the 5-minute rate.
const ONE_HOUR_WRITE_MULTIPLIER = 2;
const FAST_MODE_MULTIPLIER = 2;

async function loadPrices(): Promise<Map<string, Price>> {
  const prices = new Map<string, Price>();
  try {
    const store = JSON.parse(await readFile(PI_MODELS, "utf8")) as Record<
      string,
      { models?: { id?: string; cost?: Price }[] }
    >;
    // First-party providers win over resellers that list the same model id.
    const providers = Object.keys(store).sort(
      (a, b) => Number(isFirstParty(b)) - Number(isFirstParty(a)),
    );
    for (const provider of providers) {
      for (const model of store[provider]?.models ?? []) {
        if (model.id && model.cost && !prices.has(model.id)) prices.set(model.id, model.cost);
      }
    }
  } catch {
    // Without Pi's catalog, only EXTRA_PRICES are known.
  }
  for (const [id, price] of Object.entries(EXTRA_PRICES)) prices.set(id, price);
  return prices;
}

function isFirstParty(provider: string): boolean {
  return provider === "anthropic" || provider === "openai" || provider === "openai-codex";
}

// ------------------------------------------------------------------------------
// Transcripts
// ------------------------------------------------------------------------------

interface Request {
  key: string;
  timestamp: number;
  model: string;
  /** The directory the request ran in; empty when the transcript does not say. */
  project: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

/** JSONL files under `dir` modified at or after `since`. */
async function transcripts(dir: string, since: number): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    if ((await stat(path)).mtimeMs >= since) files.push(path);
  }
  return files;
}

function* jsonLines(content: string): Generator<Record<string, any>> {
  for (const line of content.split("\n")) {
    if (!line) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // A partially written last line.
    }
  }
}

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const perMillion = (tokens: number, price: number): number => (tokens * price) / 1_000_000;

// Claude Code writes one line per content block, each repeating the message's usage, so requests
// are keyed by message and request id. Output usage can grow across those lines; the largest wins.
async function claudeRequests(since: number, prices: Map<string, Price>): Promise<Request[]> {
  const requests = new Map<string, Request>();
  for (const file of await transcripts(join(CLAUDE_DIR, "projects"), since)) {
    for (const line of jsonLines(await readFile(file, "utf8"))) {
      const message = line.message;
      const usage = message?.usage;
      if (line.type !== "assistant" || !usage || message.model === "<synthetic>") continue;
      const timestamp = Date.parse(line.timestamp);
      if (!(timestamp >= since)) continue;

      const key = `${message.id}:${line.requestId}`;
      const output = count(usage.output_tokens);
      if ((requests.get(key)?.output ?? -1) >= output) continue;

      const writes = usage.cache_creation;
      const write1h = count(writes?.ephemeral_1h_input_tokens);
      const write5m = writes
        ? count(writes.ephemeral_5m_input_tokens)
        : count(usage.cache_creation_input_tokens);
      const request: Request = {
        key,
        timestamp,
        model: message.model,
        project: typeof line.cwd === "string" ? line.cwd : "",
        input: count(usage.input_tokens),
        output,
        cacheRead: count(usage.cache_read_input_tokens),
        cacheWrite: write5m + write1h,
        cost: 0,
      };
      const price = prices.get(message.model);
      if (price) {
        const speed = usage.speed === "fast" ? FAST_MODE_MULTIPLIER : 1;
        request.cost =
          speed *
          (perMillion(request.input, price.input) +
            perMillion(output, price.output) +
            perMillion(request.cacheRead, price.cacheRead) +
            perMillion(write5m, price.cacheWrite) +
            perMillion(write1h, price.input * ONE_HOUR_WRITE_MULTIPLIER));
      }
      requests.set(key, request);
    }
  }
  return [...requests.values()];
}

interface RateLimitSnapshot {
  timestamp: number;
  limits: Record<string, any>;
}

// Codex records cumulative thread usage in `token_count` events; each event's increase over the
// previous one is a request. Forked threads copy earlier events verbatim, so events are keyed by
// timestamp and cumulative total to count them once.
async function codexRequests(
  since: number,
  prices: Map<string, Price>,
): Promise<{ requests: Request[]; rateLimits: RateLimitSnapshot | null }> {
  const requests = new Map<string, Request>();
  let rateLimits: RateLimitSnapshot | null = null;
  const files = [
    ...(await transcripts(join(CODEX_DIR, "sessions"), since)),
    ...(await transcripts(join(CODEX_DIR, "archived_sessions"), since)),
  ];

  for (const file of files) {
    let model = "unknown";
    let project = "";
    let previous = { input: 0, cached: 0, written: 0, output: 0 };
    for (const line of jsonLines(await readFile(file, "utf8"))) {
      const payload = line.payload;
      if (line.type === "turn_context" && payload?.model) model = payload.model;
      if (
        (line.type === "session_meta" || line.type === "turn_context") &&
        typeof payload?.cwd === "string"
      ) {
        project = payload.cwd;
      }
      if (line.type !== "event_msg" || payload?.type !== "token_count") continue;

      const timestamp = Date.parse(line.timestamp);
      if (payload.rate_limits && (!rateLimits || timestamp > rateLimits.timestamp)) {
        rateLimits = { timestamp, limits: payload.rate_limits };
      }

      const total = payload.info?.total_token_usage;
      if (!total) continue;
      const current = {
        input: count(total.input_tokens),
        cached: count(total.cached_input_tokens),
        written: count(total.cache_write_input_tokens),
        output: count(total.output_tokens),
      };
      const delta = {
        input: current.input - previous.input,
        cached: current.cached - previous.cached,
        written: current.written - previous.written,
        output: current.output - previous.output,
      };
      previous = current;
      if (!(timestamp >= since) || delta.input + delta.output <= 0) continue;

      const key = `${line.timestamp}:${JSON.stringify(total)}`;
      if (requests.has(key)) continue;

      // Cached and written tokens are part of the input count.
      const uncached = Math.max(0, delta.input - delta.cached - delta.written);
      const price = prices.get(model);
      requests.set(key, {
        key,
        timestamp,
        model,
        project,
        input: uncached,
        output: Math.max(0, delta.output),
        cacheRead: Math.max(0, delta.cached),
        cacheWrite: Math.max(0, delta.written),
        cost: price
          ? perMillion(uncached, price.input) +
            perMillion(delta.output, price.output) +
            perMillion(delta.cached, price.cacheRead) +
            perMillion(delta.written, price.cacheWrite)
          : 0,
      });
    }
  }
  return { requests: [...requests.values()], rateLimits };
}

/** Aggregates requests with Pi's /usage aggregator by presenting them as assistant messages. */
function aggregate(provider: string, requests: Request[], now: Date): UsageReport {
  const entries = requests.map((request) => ({
    type: "message",
    timestamp: new Date(request.timestamp).toISOString(),
    message: {
      role: "assistant",
      provider,
      model: request.model,
      responseId: request.key,
      timestamp: request.timestamp,
      usage: {
        input: request.input,
        output: request.output,
        cacheRead: request.cacheRead,
        cacheWrite: request.cacheWrite,
        cost: { total: request.cost },
      },
    },
  }));
  return aggregateUsage([entries] as unknown as Parameters<typeof aggregateUsage>[0], now);
}

/** This week's usage per project directory. */
type ProjectUsage = Map<string, UsageTotals>;

function addProject(projects: ProjectUsage, project: string, report: UsageReport): void {
  const week = report.periods.week.totals;
  if (tokens(week) === 0 && week.cost === 0) return;
  const totals = projects.get(project);
  if (totals) addTotals(totals, week);
  else projects.set(project, { ...week });
}

function requestProjects(provider: string, requests: Request[], now: Date): ProjectUsage {
  const byProject = new Map<string, Request[]>();
  for (const request of requests) {
    const group = byProject.get(request.project);
    if (group) group.push(request);
    else byProject.set(request.project, [request]);
  }
  const projects: ProjectUsage = new Map();
  for (const [project, group] of byProject) {
    addProject(projects, project, aggregate(provider, group, now));
  }
  return projects;
}

// A session forked into another directory is counted in both, so Pi's projects can add up to
// more than Pi's total.
function sessionProjects(sessions: UsageSession[], now: Date): ProjectUsage {
  const byProject = new Map<string, UsageSession["entries"][]>();
  for (const session of sessions) {
    const group = byProject.get(session.cwd);
    if (group) group.push(session.entries);
    else byProject.set(session.cwd, [session.entries]);
  }
  const projects: ProjectUsage = new Map();
  for (const [project, group] of byProject) {
    addProject(projects, project, aggregateUsage(group, now));
  }
  return projects;
}

// ------------------------------------------------------------------------------
// Quota
// ------------------------------------------------------------------------------

interface QuotaWindow {
  label: string;
  usedPercent: number;
  resetsAt?: number;
  /** Length of the window, for showing how much of it has elapsed. */
  seconds?: number;
}

interface Quota {
  account: string;
  windows: QuotaWindow[];
  note?: string;
}

const run = promisify(execFile);

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Uses the access token Claude Code keeps in the login keychain. An expired token is reported
// rather than refreshed: refreshing rotates the refresh token out from under Claude Code.
async function claudeQuota(): Promise<Quota> {
  const quota: Quota = { account: "CLAUDE", windows: [] };
  try {
    const { stdout } = await run("security", [
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w",
    ]);
    const oauth = JSON.parse(stdout).claudeAiOauth;
    if (!oauth?.accessToken) throw new Error("not logged in");
    if (typeof oauth.expiresAt === "number" && oauth.expiresAt < Date.now()) {
      quota.note = "token expired; start claude to refresh";
      return quota;
    }

    const data = await fetchJson("https://api.anthropic.com/api/oauth/usage", {
      authorization: `Bearer ${oauth.accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
    });
    const windows: Record<string, { label: string; seconds: number }> = {
      five_hour: { label: "5h", seconds: 5 * HOUR },
      seven_day: { label: "wk", seconds: 7 * DAY },
      seven_day_opus: { label: "wk opus", seconds: 7 * DAY },
      seven_day_sonnet: { label: "wk sonnet", seconds: 7 * DAY },
    };
    for (const [key, { label, seconds }] of Object.entries(windows)) {
      const window = data?.[key];
      if (typeof window?.utilization !== "number") continue;
      const resetsAt = Date.parse(window.resets_at);
      quota.windows.push({
        label,
        usedPercent: window.utilization,
        seconds,
        ...(Number.isFinite(resetsAt) ? { resetsAt } : {}),
      });
    }
  } catch (error) {
    quota.note = `unavailable: ${errorMessage(error)}`;
  }
  return quota;
}

function windowLabel(seconds: number): string {
  if (seconds <= 6 * HOUR) return "5h";
  if (seconds <= 36 * HOUR) return "day";
  if (seconds <= 8 * DAY) return "wk";
  return `${Math.round(seconds / DAY)}d`;
}

// Uses the ChatGPT token in ~/.codex/auth.json. When the live request fails, falls back to the
// rate limits Codex recorded with its most recent request.
async function codexQuota(snapshot: RateLimitSnapshot | null): Promise<Quota> {
  const quota: Quota = { account: "CODEX", windows: [] };
  try {
    const tokens = JSON.parse(await readFile(join(CODEX_DIR, "auth.json"), "utf8")).tokens;
    if (!tokens?.access_token || !tokens?.account_id) throw new Error("not logged in");
    const data = await fetchJson("https://chatgpt.com/backend-api/wham/usage", {
      authorization: `Bearer ${tokens.access_token}`,
      "chatgpt-account-id": tokens.account_id,
    });
    for (const key of ["primary_window", "secondary_window"]) {
      const window = data?.rate_limit?.[key];
      const seconds = window?.limit_window_seconds;
      if (typeof window?.used_percent !== "number" || !(seconds > 0)) continue;
      quota.windows.push({
        label: windowLabel(seconds),
        usedPercent: window.used_percent,
        seconds,
        ...(typeof window.reset_at === "number" ? { resetsAt: window.reset_at * 1000 } : {}),
      });
    }
    return quota;
  } catch (error) {
    if (!snapshot) {
      quota.note = `unavailable: ${errorMessage(error)}`;
      return quota;
    }
    for (const key of ["primary", "secondary"]) {
      const window = snapshot.limits[key];
      if (typeof window?.used_percent !== "number" || !(window.window_minutes > 0)) continue;
      quota.windows.push({
        label: windowLabel(window.window_minutes * 60),
        usedPercent: window.used_percent,
        seconds: window.window_minutes * 60,
        ...(typeof window.resets_at === "number" ? { resetsAt: window.resets_at * 1000 } : {}),
      });
    }
    quota.note = `as of ${formatWhen(snapshot.timestamp)} (live: ${errorMessage(error)})`;
    return quota;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ------------------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------------------

const NAME_WIDTH = 13;
const DATA_WIDTH = 50;
const LABEL_WIDTH = 28;
const WIDTH = NAME_WIDTH + DATA_WIDTH + 7;

function pad(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

/** Keeps the end of a path, which tells projects apart better than its start. */
function padPath(path: string, width: number): string {
  const short = path.startsWith(HOME) ? `~${path.slice(HOME.length)}` : path;
  return short.length > width ? `…${short.slice(short.length - width + 1)}` : short.padEnd(width);
}

function row(name: string, data = ""): string {
  return `│ ${pad(name, NAME_WIDTH)} │ ${pad(data, DATA_WIDTH)} │`;
}

function centered(text: string): string {
  const inner = WIDTH - 2;
  const left = Math.floor((inner - text.length) / 2);
  return `│${" ".repeat(left)}${text}${" ".repeat(inner - text.length - left)}│`;
}

function divider(left: string, middle: string, right: string): string {
  return `${left}${"─".repeat(NAME_WIDTH + 2)}${middle}${"─".repeat(DATA_WIDTH + 2)}${right}`;
}

function bar(fraction: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function dollars(cost: number): string {
  return `$${cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const tokens = (totals: UsageTotals): number =>
  totals.input + totals.output + totals.cacheRead + totals.cacheWrite;

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day.replace(",", "")} ${time}`;
}

/** How far through its window a quota is, as a percentage. */
function elapsedPercent(window: QuotaWindow, now: Date): number | null {
  if (!window.resetsAt || !window.seconds) return null;
  const remaining = (window.resetsAt - now.getTime()) / (window.seconds * 1000);
  return Math.max(0, Math.min(1, 1 - remaining)) * 100;
}

function usageRow(name: string, label: string, usage: { cost: number; tokens: number }): string {
  return row(
    name,
    `${label}${dollars(usage.cost).padStart(13)}${formatTokenCount(usage.tokens).padStart(9)}`,
  );
}

function render(
  reports: [string, UsageReport][],
  projects: ProjectUsage,
  quotas: Quota[],
  unpriced: Set<string>,
  now: Date,
): string {
  const lines: string[] = [];
  const top = "┌" + "┬".repeat(WIDTH - 2) + "┐";
  const under = "├" + "┴".repeat(WIDTH - 2) + "┤";
  lines.push(top, under);
  lines.push(centered("BOTS USAGE REPORT"));
  const date = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  lines.push(centered(`${date.replace(",", "")} ${time}`.toUpperCase()));
  lines.push(divider("├", "┬", "┤"));
  const quotaBar = 18;
  lines.push(row("QUOTA", `${" ".repeat(quotaBar)} USED  ELAPSED  RESETS`));
  for (const quota of quotas) {
    if (quota.windows.length === 0) {
      lines.push(row(quota.account, quota.note ?? "no quota reported"));
      continue;
    }
    for (const window of quota.windows) {
      const percent = `${Math.round(window.usedPercent)}%`.padStart(4);
      const elapsed = elapsedPercent(window, now);
      const pace = (elapsed === null ? "" : `${Math.round(elapsed)}%`).padStart(8);
      const reset = window.resetsAt ? formatWhen(window.resetsAt) : "";
      lines.push(
        row(
          `${quota.account} ${window.label}`,
          `${bar(window.usedPercent / 100, quotaBar)} ${percent} ${pace}  ${reset}`,
        ),
      );
    }
    if (quota.note) lines.push(row("", quota.note));
  }

  const columns = (values: string[]) => values.map((value) => value.padStart(12)).join("  ");
  lines.push(divider("├", "┼", "┤"));
  lines.push(row("SPEND", columns(["TODAY", "WEEK", "MONTH"])));
  const total = { day: 0, week: 0, month: 0 };
  for (const [name, report] of reports) {
    const { day, week, month } = report.periods;
    total.day += day.totals.cost;
    total.week += week.totals.cost;
    total.month += month.totals.cost;
    lines.push(
      row(name, columns([day.totals.cost, week.totals.cost, month.totals.cost].map(dollars))),
    );
  }
  lines.push(row("TOTAL", columns([total.day, total.week, total.month].map(dollars))));

  const tokenTotals = { day: 0, week: 0, month: 0 };
  for (const [, report] of reports) {
    tokenTotals.day += tokens(report.periods.day.totals);
    tokenTotals.week += tokens(report.periods.week.totals);
    tokenTotals.month += tokens(report.periods.month.totals);
  }
  lines.push(
    row(
      "TOKENS",
      columns([tokenTotals.day, tokenTotals.week, tokenTotals.month].map(formatTokenCount)),
    ),
  );

  // Models across harnesses, this week.
  const models = new Map<string, { cost: number; tokens: number }>();
  for (const [, report] of reports) {
    for (const model of report.periods.week.models) {
      if (!model.model) continue;
      const entry = models.get(model.model) ?? { cost: 0, tokens: 0 };
      entry.cost += model.cost;
      entry.tokens += tokens(model);
      models.set(model.model, entry);
    }
  }
  const topModels = [...models.entries()]
    .sort(([, a], [, b]) => b.cost - a.cost || b.tokens - a.tokens)
    .slice(0, 5);
  if (topModels.length > 0) {
    lines.push(divider("├", "┼", "┤"));
    topModels.forEach(([model, usage], index) => {
      lines.push(usageRow(index === 0 ? "MODELS (WK)" : "", pad(model, LABEL_WIDTH), usage));
    });
  }

  const topProjects = [...projects.entries()]
    .sort(([, a], [, b]) => compareUsage(a, b))
    .slice(0, 5);
  if (topProjects.length > 0) {
    lines.push(divider("├", "┼", "┤"));
    topProjects.forEach(([project, totals], index) => {
      lines.push(
        usageRow(index === 0 ? "PROJECTS (WK)" : "", padPath(project || "unknown", LABEL_WIDTH), {
          cost: totals.cost,
          tokens: tokens(totals),
        }),
      );
    });
  }

  // Daily spend for the last seven days, all harnesses together.
  const days = reports[0]?.[1].trends.daily7 ?? [];
  const daily = days.map((bucket, index) => ({
    start: bucket.start,
    cost: reports.reduce(
      (sum, [, report]) => sum + (report.trends.daily7[index]?.totals.cost ?? 0),
      0,
    ),
  }));
  const peak = Math.max(...daily.map((day) => day.cost), 0);
  if (daily.length > 0) {
    lines.push(divider("├", "┼", "┤"));
    for (const day of daily) {
      const label = new Date(day.start)
        .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" })
        .toUpperCase();
      lines.push(
        row(label, `${bar(peak > 0 ? day.cost / peak : 0, 36)} ${dollars(day.cost).padStart(13)}`),
      );
    }
  }
  lines.push(divider("└", "┴", "┘"));

  lines.push("Spend is API-equivalent; Claude and Codex are priced from token counts.");
  if (unpriced.size > 0) lines.push(`No price for: ${[...unpriced].sort().join(", ")}`);
  return lines.join("\n");
}

// ------------------------------------------------------------------------------
// Main
// ------------------------------------------------------------------------------

const now = new Date();
const today = new Date(now);
today.setHours(0, 0, 0, 0);
const monthStart = new Date(today);
monthStart.setDate(1);
// The earliest bucket the aggregator reports: the month, or the 30-day weekly trend.
const since = Math.min(monthStart.getTime(), addLocalDays(today.getTime(), -29));

const prices = await loadPrices();
const [pi, claude, codex] = await Promise.all([
  loadUsageSessions(),
  claudeRequests(since, prices),
  codexRequests(since, prices),
]);
const quotas = await Promise.all([claudeQuota(), codexQuota(codex.rateLimits)]);

const unpriced = new Set(
  [...claude, ...codex.requests]
    .filter((request) => !prices.has(request.model))
    .map((r) => r.model),
);

const projects: ProjectUsage = new Map();
for (const harness of [
  sessionProjects(pi.sessions, now),
  requestProjects("claude", claude, now),
  requestProjects("codex", codex.requests, now),
]) {
  for (const [project, totals] of harness) {
    const existing = projects.get(project);
    if (existing) addTotals(existing, totals);
    else projects.set(project, totals);
  }
}

console.log(
  render(
    [
      [
        "PI",
        aggregateUsage(
          pi.sessions.map((session) => session.entries),
          now,
        ),
      ],
      ["CLAUDE", aggregate("claude", claude, now)],
      ["CODEX", aggregate("codex", codex.requests, now)],
    ],
    projects,
    quotas,
    unpriced,
    now,
  ),
);
