import { createDefaultFetcher, type TextFetcher } from "./http.js";
import type { VendorCollectionResult } from "./html-utils.js";
import * as anthropic from "./vendors/anthropic.js";
import * as openai from "./vendors/openai.js";
import * as google from "./vendors/google.js";
import * as kimi from "./vendors/kimi.js";
import * as minimax from "./vendors/minimax.js";
import * as cursor from "./vendors/cursor.js";
import * as githubCopilot from "./vendors/github-copilot.js";
import * as windsurf from "./vendors/windsurf.js";
import type { ProviderDataFile } from "../types.js";

interface VendorModule {
  VENDOR_ID: string;
  PROVIDER_ID: string;
  SOURCE_URL: string;
  collectLive: (fetcher: TextFetcher) => Promise<VendorCollectionResult>;
}

const VENDOR_MODULES: readonly VendorModule[] = [
  anthropic,
  openai,
  google,
  kimi,
  minimax,
  cursor,
  githubCopilot,
  windsurf,
];

export async function collectAllVendors(
  fetcher: TextFetcher = createDefaultFetcher()
): Promise<VendorCollectionResult[]> {
  const settled = await Promise.allSettled(
    VENDOR_MODULES.map((mod) => mod.collectLive(fetcher))
  );

  return settled.map((res, index): VendorCollectionResult => {
    const mod = VENDOR_MODULES[index];
    if (res.status === "fulfilled") {
      return res.value;
    }
    const reason =
      res.reason instanceof Error ? res.reason.message : String(res.reason);
    return {
      vendor_id: mod?.VENDOR_ID ?? "unknown",
      provider_id: mod?.PROVIDER_ID ?? "unknown",
      url: mod?.SOURCE_URL ?? "",
      status: "unreachable",
      httpStatus: null,
      extracted: [],
      note: `Unexpected collector error: ${reason}`,
    };
  });
}

export function applyCollectionResultsToProviders(
  providerFiles: readonly ProviderDataFile[],
  results: readonly VendorCollectionResult[],
  nowIso: string
): {
  nextProviderFiles: ProviderDataFile[];
  dirtyProviderIds: string[];
  appliedChanges: string[];
  notes: string[];
} {
  const extractedByProvider = new Map<string, VendorCollectionResult>();
  const notes: string[] = [];

  for (const res of results) {
    extractedByProvider.set(res.provider_id, res);
    const httpLabel = res.httpStatus !== null ? `HTTP ${res.httpStatus}` : "no HTTP status";
    notes.push(
      `[${res.vendor_id}/${res.provider_id}] ${res.status} (${httpLabel}): ${res.note}`
    );
  }

  const dirtyProviderIds: string[] = [];
  const appliedChanges: string[] = [];

  const nextProviderFiles: ProviderDataFile[] = providerFiles.map((file) => {
    const res = extractedByProvider.get(file.provider.provider_id);
    if (!res || res.status !== "ok" || res.extracted.length === 0) {
      return file;
    }

    const extractedByPlan = new Map(
      res.extracted.map((item) => [item.template_id, item])
    );

    let fileChanged = false;
    const updatedPlans = file.plans.map((plan) => {
      const hit = extractedByPlan.get(plan.template_id);
      if (!hit || hit.confidence !== "high") {
        return plan;
      }

      const nextMicro = Math.round(hit.monthly_usd * 1_000_000);
      if (nextMicro === plan.monthly_fee_micro_usd) {
        return plan;
      }

      fileChanged = true;
      appliedChanges.push(
        `${plan.template_id}: $${plan.billing.monthly_usd} -> $${hit.monthly_usd} (${hit.evidence})`
      );

      return {
        ...plan,
        monthly_fee_micro_usd: nextMicro,
        billing: {
          ...plan.billing,
          monthly_usd: hit.monthly_usd,
          ...(hit.annual_monthly_usd !== undefined
            ? { annual_monthly_usd: hit.annual_monthly_usd }
            : {}),
        },
        verification: {
          ...plan.verification,
          price_source: "official_page" as const,
          last_verified_at: nowIso,
        },
      };
    });

    if (!fileChanged) {
      return file;
    }

    dirtyProviderIds.push(file.provider.provider_id);
    return {
      provider: file.provider,
      plans: updatedPlans,
    };
  });

  return {
    nextProviderFiles,
    dirtyProviderIds,
    appliedChanges,
    notes,
  };
}
