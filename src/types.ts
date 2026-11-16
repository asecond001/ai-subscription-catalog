export const SCHEMA_VERSION = "1.0.0" as const;
export const CATALOG_ID = "ai-subscription-catalog" as const;
export const CATALOG_SCHEMA_URL =
  "https://asecond001.github.io/ai-subscription-catalog/schemas/subscription-plans.schema.json" as const;

/**
 * Exact 23 built-in template IDs shipped in TokenTracker v0.2.4, in canonical order.
 */
export const REQUIRED_TOKENTRACKER_TEMPLATE_IDS = [
  "claude_pro",
  "claude_team",
  "claude_max_5x",
  "claude_max_20x",
  "codex_plus",
  "codex_team",
  "codex_pro",
  "google_ai_free",
  "google_ai_plus",
  "google_ai_pro",
  "google_ai_ultra_5x",
  "google_ai_ultra",
  "gemini_enterprise",
  "kimi_code_plus",
  "kimi_code_allegretto",
  "kimi_code_max",
  "kimi_code_ultra",
  "minimax_coding_plus",
  "minimax_coding_plan",
  "minimax_token_plan",
  "qcode_daily_plan",
  "qcode_pro_plan",
  "workbuddy_pro",
] as const;

export type QuotaUnit = "micro_usd" | "tokens";

export type QuotaProvenance =
  | "official_doc"
  | "official_credits"
  | "reference_estimate";

export type PriceSource = "official_page" | "curated_baseline";

export type ProviderCategory =
  | "cli_agent"
  | "ide_agent"
  | "cli_and_ide_agent"
  | "coding_plan";

export type QuotaObservationMode =
  | "official_api"
  | "local_log"
  | "otlp"
  | "local_estimation";

export type PlanTier =
  | "free"
  | "entry"
  | "plus"
  | "pro"
  | "team"
  | "max"
  | "ultra"
  | "enterprise";

export type PlanStatus = "active" | "legacy";

export interface SubscriptionWindowRule {
  window_id: string;
  label: string;
  duration_hours: number;
  rolling: boolean;
  unit: QuotaUnit;
  limit_value: number;
  warning_percent: number;
  critical_percent: number;
}

export interface TokenTrackerPlanTemplate {
  template_id: string;
  provider_id: string;
  plan_name: string;
  monthly_fee_micro_usd: number;
  windows: SubscriptionWindowRule[];
  description: string;
}

export interface PlanBillingInfo {
  monthly_usd: number;
  annual_monthly_usd: number | null;
  monthly_cny: number | null;
  per_seat: boolean;
}

export interface PlanVerificationInfo {
  price_source: PriceSource;
  quota_source: QuotaProvenance;
  last_verified_at: string;
}

export interface CatalogPlanEntry extends TokenTrackerPlanTemplate {
  description_en: string;
  vendor_id: string;
  tier: PlanTier;
  status: PlanStatus;
  compatibility_tags: string[];
  billing: PlanBillingInfo;
  multiplier_vs_base: number | null;
  highlights: string[];
  official_pricing_url: string;
  official_limits_url: string | null;
  verification: PlanVerificationInfo;
}

export interface CatalogProviderEntry {
  provider_id: string;
  vendor_id: string;
  display_name: string;
  vendor_name: string;
  category: ProviderCategory;
  official_pricing_url: string;
  official_docs_url: string;
  quota_observation_modes: QuotaObservationMode[];
}

export interface ProviderDataFile {
  provider: CatalogProviderEntry;
  plans: CatalogPlanEntry[];
}

export interface CatalogStats {
  provider_count: number;
  plan_count: number;
  active_plan_count: number;
  tokentracker_template_count: number;
}

export interface SubscriptionCatalogDocument {
  $schema: string;
  schema_version: string;
  catalog_id: string;
  generated_at: string;
  content_hash: string;
  stats: CatalogStats;
  providers: CatalogProviderEntry[];
  plans: CatalogPlanEntry[];
}
