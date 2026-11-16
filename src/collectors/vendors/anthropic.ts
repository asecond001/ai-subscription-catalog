import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "anthropic";
export const PROVIDER_ID = "claude_code";
export const SOURCE_URL = "https://claude.com/pricing";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "claude_pro",
    headingAliases: ["Pro", "Claude Pro"],
  },
  {
    template_id: "claude_team",
    headingAliases: ["Team", "Claude Team"],
  },
  {
    template_id: "claude_max_5x",
    headingAliases: ["Max", "Max 5x", "Claude Max 5x"],
  },
  {
    template_id: "claude_max_20x",
    headingAliases: ["Ultra", "Max 20x", "Claude Max 20x"],
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
