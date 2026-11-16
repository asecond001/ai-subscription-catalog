import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  assembleCatalogDocument,
  loadProviderFiles,
} from "../src/builder.js";
import {
  applyCollectionResultsToProviders,
  collectAllVendors,
} from "../src/collectors/index.js";
import { createDefaultFetcher, type TextFetcher } from "../src/collectors/http.js";
import * as anthropic from "../src/collectors/vendors/anthropic.js";
import * as cursor from "../src/collectors/vendors/cursor.js";
import * as githubCopilot from "../src/collectors/vendors/github-copilot.js";
import * as google from "../src/collectors/vendors/google.js";
import * as kimi from "../src/collectors/vendors/kimi.js";
import * as minimax from "../src/collectors/vendors/minimax.js";
import * as openai from "../src/collectors/vendors/openai.js";
import * as windsurf from "../src/collectors/vendors/windsurf.js";
import { classifyCatalogDiff } from "../src/validator/diff-guard.js";

const ROOT_DIR = process.cwd();
const FIXTURES_DIR = path.join(ROOT_DIR, "tests", "fixtures", "html");
const PROVIDERS_DIR = path.join(ROOT_DIR, "data", "providers");
const SCHEMA_PATH = path.join(
  ROOT_DIR,
  "schemas",
  "subscription-plans.schema.json"
);

async function readFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES_DIR, name), "utf8");
}

test("vendor HTML parsers extract monthly USD prices and ignore annual totals", async () => {
  const anthropicParsed = anthropic.parseHtml(
    await readFixture("anthropic.html")
  );
  assert.equal(
    anthropicParsed.find((p) => p.template_id === "claude_pro")?.monthly_usd,
    20
  );
  assert.equal(
    anthropicParsed.find((p) => p.template_id === "claude_pro")
      ?.annual_monthly_usd,
    17
  );
  assert.equal(
    anthropicParsed.find((p) => p.template_id === "claude_max_20x")
      ?.monthly_usd,
    200
  );

  const anthropicRealHtml = `
    <section>
      <div class="card">
        <h3>Pro</h3>
        <p>$17 Per month with annual subscription discount ($200 billed up front). $20 if billed monthly.</p>
      </div>
      <div class="card">
        <h3>Max 5x</h3>
        <p><span>$100</span><span>Per month</span></p>
      </div>
      <div class="card">
        <h3>Max 20x</h3>
        <p><span>$200</span><span>Per month</span></p>
      </div>
    </section>
  `;
  const anthropicLiveParsed = anthropic.parseHtml(anthropicRealHtml);
  const claudeProLive = anthropicLiveParsed.find(
    (p) => p.template_id === "claude_pro"
  );
  assert.equal(claudeProLive?.monthly_usd, 20);
  assert.equal(claudeProLive?.annual_monthly_usd, 17);
  assert.equal(claudeProLive?.confidence, "high");
  const claudeMax5xLive = anthropicLiveParsed.find(
    (p) => p.template_id === "claude_max_5x"
  );
  assert.equal(claudeMax5xLive?.monthly_usd, 100);
  assert.equal(claudeMax5xLive?.confidence, "high");
  const claudeMax20xLive = anthropicLiveParsed.find(
    (p) => p.template_id === "claude_max_20x"
  );
  assert.equal(claudeMax20xLive?.monthly_usd, 200);
  assert.equal(claudeMax20xLive?.confidence, "high");

  const openaiParsed = openai.parseHtml(await readFixture("openai.html"));
  assert.equal(
    openaiParsed.find((p) => p.template_id === "codex_plus")?.monthly_usd,
    20
  );
  assert.equal(
    openaiParsed.find((p) => p.template_id === "codex_team")?.monthly_usd,
    25
  );
  assert.equal(
    openaiParsed.find((p) => p.template_id === "codex_pro_100")?.monthly_usd,
    100
  );
  assert.equal(
    openaiParsed.find((p) => p.template_id === "codex_pro")?.monthly_usd,
    200
  );
  assert.equal(
    openaiParsed.find((p) => p.template_id === "codex_pro_500")?.monthly_usd,
    500
  );

  const googleParsed = google.parseHtml(await readFixture("google.html"));
  assert.equal(
    googleParsed.find((p) => p.template_id === "google_ai_free")?.monthly_usd,
    0
  );
  assert.equal(
    googleParsed.find((p) => p.template_id === "google_ai_pro")?.monthly_usd,
    19.99
  );
  assert.equal(
    googleParsed.find((p) => p.template_id === "google_ai_ultra")?.monthly_usd,
    199.99
  );

  const kimiParsed = kimi.parseHtml(await readFixture("kimi.html"));
  assert.equal(
    kimiParsed.find((p) => p.template_id === "kimi_code_plus")?.monthly_usd,
    19
  );
  assert.equal(
    kimiParsed.find((p) => p.template_id === "kimi_code_ultra")?.monthly_usd,
    199
  );

  const minimaxParsed = minimax.parseHtml(await readFixture("minimax.html"));
  assert.equal(
    minimaxParsed.find((p) => p.template_id === "minimax_coding_plus")
      ?.monthly_usd,
    7
  );
  assert.equal(
    minimaxParsed.find((p) => p.template_id === "minimax_token_plan")
      ?.monthly_usd,
    49
  );

  // Cursor fixture intentionally lists $80/yr and $6.67/mo billed annually BEFORE $8/mo
  const cursorParsed = cursor.parseHtml(await readFixture("cursor.html"));
  assert.equal(
    cursorParsed.find((p) => p.template_id === "cursor_free")?.monthly_usd,
    0
  );
  assert.equal(
    cursorParsed.find((p) => p.template_id === "cursor_plus")?.monthly_usd,
    8
  );
  assert.equal(
    cursorParsed.find((p) => p.template_id === "cursor_plus")
      ?.annual_monthly_usd,
    6.67
  );
  assert.equal(
    cursorParsed.find((p) => p.template_id === "cursor_ultra")?.monthly_usd,
    200
  );

  const copilotParsed = githubCopilot.parseHtml(
    await readFixture("github-copilot.html")
  );
  assert.equal(
    copilotParsed.find((p) => p.template_id === "copilot_pro")?.monthly_usd,
    10
  );
  assert.equal(
    copilotParsed.find((p) => p.template_id === "copilot_pro_plus")
      ?.monthly_usd,
    39
  );
  assert.equal(
    copilotParsed.find((p) => p.template_id === "copilot_max")?.monthly_usd,
    100
  );

  const windsurfParsed = windsurf.parseHtml(await readFixture("windsurf.html"));
  assert.equal(
    windsurfParsed.find((p) => p.template_id === "windsurf_pro")?.monthly_usd,
    20
  );
  assert.equal(
    windsurfParsed.find((p) => p.template_id === "windsurf_teams")?.monthly_usd,
    40
  );
});

test("HTTP fetcher stops immediately on 403 and Cloudflare Turnstile challenge pages", async () => {
  const challengeHtml = await readFixture("cloudflare-challenge.html");

  const fetcher403 = createDefaultFetcher(
    async () => new Response("Forbidden", { status: 403 })
  );
  const res403 = await fetcher403("https://example.com/pricing");
  assert.equal(res403.ok, false);
  assert.equal(res403.status, "challenged_or_blocked");
  assert.equal(res403.httpStatus, 403);

  const fetcherChallenge = createDefaultFetcher(
    async () => new Response(challengeHtml, { status: 200 })
  );
  const resChal = await fetcherChallenge("https://example.com/pricing");
  assert.equal(resChal.ok, false);
  assert.equal(resChal.status, "challenged_or_blocked");
});

test("mixed live collection handles blocked vendors gracefully and gates broken $0 scrapes to requires_review", async () => {
  const brokenZeroHtml = await readFixture("broken-zero.html");
  const cursorHtml = await readFixture("cursor.html");

  const mockFetcher: TextFetcher = async (url: string) => {
    if (url.includes("claude.com")) {
      return {
        ok: true,
        status: "ok",
        url,
        httpStatus: 200,
        body: brokenZeroHtml,
        reason: null,
      };
    }
    if (url.includes("cursor.com")) {
      return {
        ok: true,
        status: "ok",
        url,
        httpStatus: 200,
        body: cursorHtml,
        reason: null,
      };
    }
    return {
      ok: false,
      status: "challenged_or_blocked",
      url,
      httpStatus: 403,
      body: null,
      reason: "HTTP 403 blocked or rate-limited",
    };
  };

  const results = await collectAllVendors(mockFetcher);
  assert.equal(results.length, 8);
  assert.equal(
    results.filter((r) => r.status === "challenged_or_blocked").length,
    6
  );

  const originalFiles = await loadProviderFiles(PROVIDERS_DIR);
  const prev = assembleCatalogDocument(originalFiles, {
    generatedAt: "2026-11-16T00:00:00.000Z",
  });

  const { nextProviderFiles } = applyCollectionResultsToProviders(
    originalFiles,
    results,
    "2026-11-16T12:00:00.000Z"
  );
  const next = assembleCatalogDocument(nextProviderFiles, {
    previousCatalog: prev.catalog,
    generatedAt: "2026-11-16T12:00:00.000Z",
  });

  const diff = await classifyCatalogDiff(prev.catalog, next.catalog, {
    schemaPath: SCHEMA_PATH,
    templates: next.templates,
  });
  assert.equal(diff.classification, "requires_review");
  assert.ok(diff.reasons.some((r) => r.includes("dropped to $0")));
});
