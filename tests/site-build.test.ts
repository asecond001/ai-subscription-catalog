import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/site/build-site.js";
import type {
  SubscriptionCatalogDocument,
  TokenTrackerPlanTemplate,
} from "../src/types.js";

const ROOT_DIR = process.cwd();

test("buildSite emits flat web explorer, v1 static API endpoints, schema, and .nojekyll", async () => {
  const tempOut = await mkdtemp(path.join(os.tmpdir(), "ai-sub-catalog-site-"));
  try {
    const result = await buildSite({ rootDir: ROOT_DIR, outDir: tempOut });
    assert.equal(result.planCount, 41);

    const expectedFiles = [
      "index.html",
      "subscription-plans.json",
      "v1/plans.json",
      "v1/tokentracker-templates.json",
      "v1/providers.json",
      "schemas/subscription-plans.schema.json",
      ".nojekyll",
    ];

    for (const rel of expectedFiles) {
      const s = await stat(path.join(tempOut, rel));
      assert.ok(s.isFile(), `Expected file ${rel}`);
    }

    const html = await readFile(path.join(tempOut, "index.html"), "utf8");
    assert.ok(html.includes("AI Subscription Catalog"));
    assert.ok(html.includes("v1/plans.json"));
    assert.ok(html.includes('id="catalog-data"'));

    const plansJson = JSON.parse(
      await readFile(path.join(tempOut, "v1", "plans.json"), "utf8")
    ) as SubscriptionCatalogDocument;
    assert.equal(plansJson.stats.provider_count, 10);
    assert.equal(plansJson.stats.plan_count, 41);

    const ttJson = JSON.parse(
      await readFile(
        path.join(tempOut, "v1", "tokentracker-templates.json"),
        "utf8"
      )
    ) as TokenTrackerPlanTemplate[];
    assert.equal(ttJson.length, plansJson.stats.tokentracker_template_count);
  } finally {
    await rm(tempOut, { recursive: true, force: true });
  }
});
