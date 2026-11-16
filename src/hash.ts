import { createHash } from "node:crypto";
import type { CatalogPlanEntry, CatalogProviderEntry } from "./types.js";

/**
 * Recursively canonicalize JSON values by sorting object keys deterministically
 * while preserving array order.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child !== undefined) {
        sorted[key] = canonicalizeJson(child);
      }
    }
    return sorted;
  }
  return value;
}

/**
 * Compute deterministic SHA-256 hash over semantic catalog contents,
 * explicitly excluding `generated_at` so clean rebuilds stay byte-identical.
 */
export function computeCatalogContentHash(input: {
  schema_version: string;
  providers: CatalogProviderEntry[];
  plans: CatalogPlanEntry[];
}): string {
  const canonical = canonicalizeJson({
    schema_version: input.schema_version,
    providers: input.providers,
    plans: input.plans,
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
