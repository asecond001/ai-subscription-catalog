import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleCatalogDocument,
  loadProviderFiles,
  readCatalogDocument,
} from "../builder.js";
import type { TokenTrackerPlanTemplate } from "../types.js";
import { validateCatalog } from "../validator/schema-validator.js";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const providersDir = path.join(rootDir, "data", "providers");
  const catalogPath = path.join(rootDir, "catalog", "subscription-plans.json");
  const templatesPath = path.join(
    rootDir,
    "catalog",
    "tokentracker-templates.json"
  );
  const schemaPath = path.join(
    rootDir,
    "schemas",
    "subscription-plans.schema.json"
  );

  const catalog = await readCatalogDocument(catalogPath);
  if (!catalog) {
    console.error(`Missing or invalid JSON in ${catalogPath}`);
    process.exitCode = 1;
    return;
  }

  let templates: TokenTrackerPlanTemplate[];
  try {
    const rawTemplates = await readFile(templatesPath, "utf8");
    templates = JSON.parse(rawTemplates) as TokenTrackerPlanTemplate[];
  } catch (err) {
    console.error(`Missing or invalid JSON in ${templatesPath}:`, err);
    process.exitCode = 1;
    return;
  }

  const validation = await validateCatalog(catalog, { schemaPath, templates });
  if (!validation.valid) {
    console.error("Catalog validation failed:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  // Verify committed catalog matches deterministic rebuild from data/providers/*.json
  const providerFiles = await loadProviderFiles(providersDir);
  const rebuilt = assembleCatalogDocument(providerFiles, {
    previousCatalog: catalog,
  });

  if (rebuilt.catalog.content_hash !== catalog.content_hash) {
    console.error(
      `Committed catalog content_hash (${catalog.content_hash}) does not match data/providers rebuild (${rebuilt.catalog.content_hash}). Run 'pnpm run build:catalog'.`
    );
    process.exitCode = 1;
    return;
  }

  if (JSON.stringify(rebuilt.templates) !== JSON.stringify(templates)) {
    console.error(
      "Committed catalog/tokentracker-templates.json is out of sync with data/providers. Run 'pnpm run build:catalog'."
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Validation passed: ${catalog.stats.provider_count} providers, ${catalog.stats.plan_count} plans, ${templates.length} TokenTracker templates (hash ${catalog.content_hash.slice(0, 12)}).`
  );
}

main().catch((err) => {
  console.error("Unexpected validation error:", err);
  process.exitCode = 1;
});
