import { buildAndWriteCatalog } from "../builder.js";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const result = await buildAndWriteCatalog({ rootDir });

  console.log(
    `Catalog built: ${result.catalog.stats.provider_count} providers, ${result.catalog.stats.plan_count} plans (${result.catalog.stats.active_plan_count} active), ${result.templates.length} TokenTracker templates.`
  );
  console.log(`Content hash: ${result.catalog.content_hash}`);
  console.log(`Generated at: ${result.catalog.generated_at}`);
  console.log(`Semantic change vs previous: ${result.changed ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error("Failed to build catalog:", err);
  process.exitCode = 1;
});
