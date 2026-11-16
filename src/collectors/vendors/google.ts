import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "google";
export const PROVIDER_ID = "antigravity";
export const SOURCE_URL = "https://one.google.com/about/google-ai-plans/";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "google_ai_free",
    headingAliases: ["Free", "Google AI Free"],
    allowFree: true,
  },
  {
    template_id: "google_ai_plus",
    headingAliases: ["Google AI Plus", "AI Plus"],
  },
  {
    template_id: "google_ai_pro",
    headingAliases: ["Google AI Pro", "AI Pro"],
  },
  {
    template_id: "google_ai_ultra_5x",
    headingAliases: ["Google AI Ultra 5x", "AI Ultra 5x"],
  },
  {
    template_id: "google_ai_ultra",
    headingAliases: ["Google AI Ultra", "Google AI Ultra 20x", "AI Ultra"],
  },
];

export function parseHtml(html: string): ExtractedPlanPrice[] {
  return extractPlansFromHtmlCards(html, SPECS);
}

export async function collectLive(
  fetcher: TextFetcher
): Promise<VendorCollectionResult> {
  return runVendorHtmlCollector({
    vendor_id: VENDOR_ID,
    provider_id: PROVIDER_ID,
    url: SOURCE_URL,
    fetcher,
    parseHtml,
  });
}
