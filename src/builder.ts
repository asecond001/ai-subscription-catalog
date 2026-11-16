import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeCatalogContentHash } from "./hash.js";
import {
  CATALOG_ID,
  CATALOG_SCHEMA_URL,
  REQUIRED_TOKENTRACKER_TEMPLATE_IDS,
  SCHEMA_VERSION,
  type CatalogPlanEntry,
  type CatalogProviderEntry,
  type ProviderDataFile,
  type SubscriptionCatalogDocument,
  type TokenTrackerPlanTemplate,
} from "./types.js";

const PROVIDER_ORDER: readonly string[] = [
  "claude_code",
  "codex",
  "antigravity",
  "kimi_code",
  "minimax_code",
  "qcode",
  "workbuddy",
  "cursor",
  "github_copilot",
  "windsurf",
];

function providerSortRank(providerId: string): number {
  const idx = PROVIDER_ORDER.indexOf(providerId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export async function loadProviderFiles(
  providersDir: string
): Promise<ProviderDataFile[]> {
  const entries = await readdir(providersDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const loaded: ProviderDataFile[] = [];
  for (const fileName of jsonFiles) {
    const raw = await readFile(path.join(providersDir, fileName), "utf8");
    const parsed = JSON.parse(raw) as ProviderDataFile;
    loaded.push(parsed);
  }

  loaded.sort((a, b) => {
    const rankDiff =
      providerSortRank(a.provider.provider_id) -
      providerSortRank(b.provider.provider_id);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.provider.provider_id.localeCompare(b.provider.provider_id);
  });

  return loaded;
}

export function buildTokenTrackerTemplates(
  plans: readonly CatalogPlanEntry[]
): TokenTrackerPlanTemplate[] {
  const planById = new Map<string, CatalogPlanEntry>();
  for (const plan of plans) {
    planById.set(plan.template_id, plan);
  }

  const ordered: CatalogPlanEntry[] = [];
  const seen = new Set<string>();

  // Preserve the exact 23 TokenTracker v0.2.4 template sequence first.
  for (const requiredId of REQUIRED_TOKENTRACKER_TEMPLATE_IDS) {
    const match = planById.get(requiredId);
    if (match) {
      ordered.push(match);
      seen.add(requiredId);
    }
  }

  // Append all remaining active plans in deterministic provider/catalog order.
  for (const plan of plans) {
    if (!seen.has(plan.template_id) && plan.status === "active") {
      ordered.push(plan);
      seen.add(plan.template_id);
    }
  }

  return ordered.map((plan) => ({
    template_id: plan.template_id,
    provider_id: plan.provider_id,
    plan_name: plan.plan_name,
    monthly_fee_micro_usd: plan.monthly_fee_micro_usd,
    windows: plan.windows.map((w) => ({
      window_id: w.window_id,
      label: w.label,
      duration_hours: w.duration_hours,
      rolling: w.rolling,
      unit: w.unit,
      limit_value: w.limit_value,
      warning_percent: w.warning_percent,
      critical_percent: w.critical_percent,
    })),
    description: plan.description,
  }));
}

export function assembleCatalogDocument(
  providerFiles: readonly ProviderDataFile[],
  options?: {
    generatedAt?: string;
    previousCatalog?: SubscriptionCatalogDocument | null;
  }
): {
  catalog: SubscriptionCatalogDocument;
  templates: TokenTrackerPlanTemplate[];
} {
  const providers: CatalogProviderEntry[] = providerFiles.map(
    (entry) => entry.provider
  );
  const plans: CatalogPlanEntry[] = providerFiles.flatMap(
    (entry) => entry.plans
  );

  const templates = buildTokenTrackerTemplates(plans);
  const contentHash = computeCatalogContentHash({
    schema_version: SCHEMA_VERSION,
    providers,
    plans,
  });

  const previous = options?.previousCatalog ?? null;
  const generatedAt =
    previous && previous.content_hash === contentHash
      ? previous.generated_at
      : (options?.generatedAt ?? new Date().toISOString());

  const activePlanCount = plans.filter((p) => p.status === "active").length;

  const catalog: SubscriptionCatalogDocument = {
    $schema: CATALOG_SCHEMA_URL,
    schema_version: SCHEMA_VERSION,
    catalog_id: CATALOG_ID,
    generated_at: generatedAt,
    content_hash: contentHash,
    stats: {
      provider_count: providers.length,
      plan_count: plans.length,
      active_plan_count: activePlanCount,
      tokentracker_template_count: templates.length,
    },
    providers,
    plans,
  };

  return { catalog, templates };
}

export async function readCatalogDocument(
  filePath: string
): Promise<SubscriptionCatalogDocument | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as SubscriptionCatalogDocument;
  } catch {
    return null;
  }
}

export async function buildAndWriteCatalog(options: {
  rootDir: string;
  generatedAt?: string;
}): Promise<{
  catalog: SubscriptionCatalogDocument;
  templates: TokenTrackerPlanTemplate[];
  changed: boolean;
}> {
  const providersDir = path.join(options.rootDir, "data", "providers");
  const catalogDir = path.join(options.rootDir, "catalog");
  const catalogPath = path.join(catalogDir, "subscription-plans.json");
  const templatesPath = path.join(catalogDir, "tokentracker-templates.json");

  const providerFiles = await loadProviderFiles(providersDir);
  const previousCatalog = await readCatalogDocument(catalogPath);
  const { catalog, templates } = assembleCatalogDocument(providerFiles, {
    previousCatalog,
    ...(options.generatedAt !== undefined
      ? { generatedAt: options.generatedAt }
      : {}),
  });

  const changed =
    previousCatalog === null ||
    previousCatalog.content_hash !== catalog.content_hash;

  await mkdir(catalogDir, { recursive: true });
  await writeFile(
    catalogPath,
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    templatesPath,
    `${JSON.stringify(templates, null, 2)}\n`,
    "utf8"
  );

  return { catalog, templates, changed };
}
