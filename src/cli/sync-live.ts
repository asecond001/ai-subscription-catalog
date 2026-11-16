import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleCatalogDocument,
  buildAndWriteCatalog,
  loadProviderFiles,
  readCatalogDocument,
} from "../builder.js";
import {
  applyCollectionResultsToProviders,
  collectAllVendors,
} from "../collectors/index.js";
import type { VendorCollectionResult } from "../collectors/html-utils.js";
import { classifyCatalogDiff } from "../validator/diff-guard.js";

interface CliOptions {
  dryRun: boolean;
  reportPath: string;
  summaryPath: string;
}

function parseCliArgs(argv: readonly string[], rootDir: string): CliOptions {
  let dryRun = false;
  let reportPath = path.join(rootDir, "artifacts", "sync-report.json");
  let summaryPath = path.join(rootDir, "artifacts", "sync-summary.md");

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--report" && argv[i + 1]) {
      reportPath = path.resolve(rootDir, argv[i + 1]!);
      i += 1;
    } else if (arg === "--summary" && argv[i + 1]) {
      summaryPath = path.resolve(rootDir, argv[i + 1]!);
      i += 1;
    }
  }

  return { dryRun, reportPath, summaryPath };
}

function buildVendorStatusMarkdown(
  results: readonly VendorCollectionResult[]
): string {
  const lines: string[] = [
    "### Vendor Fetch Status",
    "",
    "| Vendor | Provider | Status | HTTP | Matches | Note |",
    "| :--- | :--- | :--- | ---: | ---: | :--- |",
  ];
  for (const r of results) {
    const httpText = r.httpStatus !== null ? String(r.httpStatus) : "-";
    lines.push(
      `| \`${r.vendor_id}\` | \`${r.provider_id}\` | \`${r.status}\` | ${httpText} | ${r.extracted.length} | ${r.note.replace(/\|/g, "\\|")} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function writeGithubOutput(
  entries: Record<string, string>
): Promise<void> {
  const outputPath = process.env["GITHUB_OUTPUT"];
  if (!outputPath) {
    return;
  }
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function writeGithubStepSummary(markdown: string): Promise<void> {
  const summaryEnvPath = process.env["GITHUB_STEP_SUMMARY"];
  if (!summaryEnvPath) {
    return;
  }
  await appendFile(summaryEnvPath, `${markdown}\n`, "utf8");
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const opts = parseCliArgs(process.argv.slice(2), rootDir);
  const providersDir = path.join(rootDir, "data", "providers");
  const catalogPath = path.join(rootDir, "catalog", "subscription-plans.json");
  const schemaPath = path.join(
    rootDir,
    "schemas",
    "subscription-plans.schema.json"
  );

  const nowIso = new Date().toISOString();
  const previousCatalog = await readCatalogDocument(catalogPath);
  const originalProviderFiles = await loadProviderFiles(providersDir);

  const vendorResults = await collectAllVendors();
  const { nextProviderFiles, dirtyProviderIds, appliedChanges, notes } =
    applyCollectionResultsToProviders(
      originalProviderFiles,
      vendorResults,
      nowIso
    );

  const { catalog: candidateCatalog, templates: candidateTemplates } =
    assembleCatalogDocument(nextProviderFiles, {
      previousCatalog,
      generatedAt: nowIso,
    });

  const diffResult = await classifyCatalogDiff(
    previousCatalog,
    candidateCatalog,
    {
      schemaPath,
      templates: candidateTemplates,
      collectorNotes: notes,
    }
  );

  const fullMarkdown = [
    diffResult.markdownSummary,
    buildVendorStatusMarkdown(vendorResults),
    opts.dryRun
      ? "> **Dry-run mode enabled**: No repository files were modified.\n"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mutatedFiles =
    !opts.dryRun &&
    dirtyProviderIds.length > 0 &&
    (diffResult.classification === "safe_minor_update" ||
      diffResult.classification === "requires_review");

  if (mutatedFiles) {
    for (const file of nextProviderFiles) {
      if (dirtyProviderIds.includes(file.provider.provider_id)) {
        const targetPath = path.join(
          providersDir,
          `${file.provider.provider_id}.json`
        );
        await writeFile(
          targetPath,
          `${JSON.stringify(file, null, 2)}\n`,
          "utf8"
        );
      }
    }
    await buildAndWriteCatalog({ rootDir, generatedAt: nowIso });
  }

  const reportPayload = {
    synced_at: nowIso,
    dry_run: opts.dryRun,
    classification: diffResult.classification,
    files_mutated: mutatedFiles,
    dirty_providers: dirtyProviderIds,
    applied_changes: appliedChanges,
    reasons: diffResult.reasons,
    changes: diffResult.changes,
    vendor_results: vendorResults,
  };

  await mkdir(path.dirname(opts.reportPath), { recursive: true });
  await writeFile(
    opts.reportPath,
    `${JSON.stringify(reportPayload, null, 2)}\n`,
    "utf8"
  );
  await mkdir(path.dirname(opts.summaryPath), { recursive: true });
  await writeFile(opts.summaryPath, `${fullMarkdown}\n`, "utf8");

  await writeGithubStepSummary(fullMarkdown);
  await writeGithubOutput({
    classification: diffResult.classification,
    changed: mutatedFiles ? "true" : "false",
    report_path: opts.reportPath,
    summary_path: opts.summaryPath,
  });

  console.log(fullMarkdown);

  if (diffResult.classification === "rejected") {
    console.error("Sync rejected by Gate 1 validation.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Live sync failed unexpectedly:", err);
  process.exitCode = 1;
});
