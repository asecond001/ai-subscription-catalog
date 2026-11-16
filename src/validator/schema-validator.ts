import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Ajv2020 as Ajv2020Class, ErrorObject, Options } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { computeCatalogContentHash } from "../hash.js";
import {
  REQUIRED_TOKENTRACKER_TEMPLATE_IDS,
  SCHEMA_VERSION,
  type SubscriptionCatalogDocument,
  type TokenTrackerPlanTemplate,
} from "../types.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as new (opts?: Options) => Ajv2020Class;
const addFormats = require("ajv-formats") as FormatsPlugin;

const MAX_MONTHLY_FEE_MICRO_USD = 2_000_000_000;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }
  return errors.map((err) => {
    const loc = err.instancePath || "/";
    return `Schema error at ${loc}: ${err.message ?? "invalid value"}`;
  });
}

export async function loadSchemaObject(
  schemaPath: string
): Promise<Record<string, unknown>> {
  const raw = await readFile(schemaPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function validateCatalog(
  catalog: SubscriptionCatalogDocument,
  options?: {
    schemaPath?: string;
    templates?: readonly TokenTrackerPlanTemplate[];
  }
): Promise<ValidationResult> {
  const errors: string[] = [];
  const schemaPath =
    options?.schemaPath ??
    path.resolve(process.cwd(), "schemas", "subscription-plans.schema.json");

  const schemaObj = await loadSchemaObject(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const validateFn = ajv.compile(schemaObj);
  const schemaOk = validateFn(catalog);
  if (!schemaOk) {
    errors.push(...formatAjvErrors(validateFn.errors));
  }

  // Unique provider_id check
  const providerMap = new Map<string, string>();
  for (const provider of catalog.providers ?? []) {
    if (providerMap.has(provider.provider_id)) {
      errors.push(`Duplicate provider_id: ${provider.provider_id}`);
    } else {
      providerMap.set(provider.provider_id, provider.vendor_id);
    }
  }

  // Plan invariants
  const planIds = new Set<string>();
  for (const plan of catalog.plans ?? []) {
    if (planIds.has(plan.template_id)) {
      errors.push(`Duplicate template_id: ${plan.template_id}`);
    } else {
      planIds.add(plan.template_id);
    }

    const expectedVendor = providerMap.get(plan.provider_id);
    if (expectedVendor === undefined) {
      errors.push(
        `Plan '${plan.template_id}' references unknown provider_id '${plan.provider_id}'`
      );
    } else if (expectedVendor !== plan.vendor_id) {
      errors.push(
        `Plan '${plan.template_id}' vendor_id '${plan.vendor_id}' does not match provider vendor_id '${expectedVendor}'`
      );
    }

    const roundedMicroUsd = Math.round(plan.billing.monthly_usd * 1_000_000);
    if (roundedMicroUsd !== plan.monthly_fee_micro_usd) {
      errors.push(
        `Plan '${plan.template_id}' billing.monthly_usd (${plan.billing.monthly_usd}) does not match monthly_fee_micro_usd (${plan.monthly_fee_micro_usd})`
      );
    }

    if (
      plan.monthly_fee_micro_usd < 0 ||
      plan.monthly_fee_micro_usd > MAX_MONTHLY_FEE_MICRO_USD
    ) {
      errors.push(
        `Plan '${plan.template_id}' monthly_fee_micro_usd (${plan.monthly_fee_micro_usd}) out of bounds [0, ${MAX_MONTHLY_FEE_MICRO_USD}]`
      );
    }

    if (!plan.windows || plan.windows.length === 0) {
      errors.push(`Plan '${plan.template_id}' must define at least 1 window`);
    } else {
      const windowIds = new Set<string>();
      for (const win of plan.windows) {
        if (windowIds.has(win.window_id)) {
          errors.push(
            `Plan '${plan.template_id}' has duplicate window_id '${win.window_id}'`
          );
        } else {
          windowIds.add(win.window_id);
        }
        if (win.limit_value <= 0) {
          errors.push(
            `Plan '${plan.template_id}' window '${win.window_id}' limit_value must be > 0`
          );
        }
        if (
          !(
            win.warning_percent > 0 &&
            win.warning_percent < win.critical_percent &&
            win.critical_percent <= 100
          )
        ) {
          errors.push(
            `Plan '${plan.template_id}' window '${win.window_id}' alert thresholds invalid (${win.warning_percent} / ${win.critical_percent})`
          );
        }
      }

      if (plan.provider_id === "kimi_code" && !windowIds.has("30d")) {
        errors.push(
          `Kimi plan '${plan.template_id}' must include a '30d' monthly limit window`
        );
      }
    }
  }

  // Required 23 TokenTracker v0.2.4 template lock
  for (const requiredId of REQUIRED_TOKENTRACKER_TEMPLATE_IDS) {
    if (!planIds.has(requiredId)) {
      errors.push(
        `Missing required TokenTracker v0.2.4 template_id: '${requiredId}'`
      );
    }
  }

  // Stats consistency
  const activeCount = (catalog.plans ?? []).filter(
    (p) => p.status === "active"
  ).length;
  if (catalog.stats) {
    if (catalog.stats.provider_count !== (catalog.providers?.length ?? 0)) {
      errors.push(
        `stats.provider_count (${catalog.stats.provider_count}) != providers.length (${catalog.providers?.length ?? 0})`
      );
    }
    if (catalog.stats.plan_count !== (catalog.plans?.length ?? 0)) {
      errors.push(
        `stats.plan_count (${catalog.stats.plan_count}) != plans.length (${catalog.plans?.length ?? 0})`
      );
    }
    if (catalog.stats.active_plan_count !== activeCount) {
      errors.push(
        `stats.active_plan_count (${catalog.stats.active_plan_count}) != actual active plans (${activeCount})`
      );
    }
    if (
      options?.templates &&
      catalog.stats.tokentracker_template_count !== options.templates.length
    ) {
      errors.push(
        `stats.tokentracker_template_count (${catalog.stats.tokentracker_template_count}) != tokentracker-templates.json length (${options.templates.length})`
      );
    }
  }

  // Content hash consistency
  if (
    Array.isArray(catalog.providers) &&
    Array.isArray(catalog.plans) &&
    typeof catalog.schema_version === "string"
  ) {
    const expectedHash = computeCatalogContentHash({
      schema_version: catalog.schema_version || SCHEMA_VERSION,
      providers: catalog.providers,
      plans: catalog.plans,
    });
    if (catalog.content_hash !== expectedHash) {
      errors.push(
        `content_hash mismatch: expected ${expectedHash}, got ${catalog.content_hash}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
