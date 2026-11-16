import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "minimax";
export const PROVIDER_ID = "minimax_code";
export const SOURCE_URL = "https://platform.minimax.io/docs/coding-plan/intro";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "minimax_coding_plus",
    headingAliases: ["Coding Plus", "MiniMax Coding Plus", "Plus"],
  },
  {
    template_id: "minimax_coding_plan",
    headingAliases: ["Coding Pro", "MiniMax Coding Pro", "Pro"],
  },
  {
    template_id: "minimax_token_plan",
    headingAliases: [
      "Coding Max",
      "Token Plan",
      "MiniMax Coding Max (Token Plan)",
      "Max",
    ],
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
