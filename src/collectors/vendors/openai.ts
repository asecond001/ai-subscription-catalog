import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "openai";
export const PROVIDER_ID = "codex";
export const SOURCE_URL = "https://openai.com/chatgpt/pricing/";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "codex_plus",
    headingAliases: ["Plus", "ChatGPT Plus"],
  },
  {
    template_id: "codex_team",
    headingAliases: ["Team", "Business", "ChatGPT Team", "ChatGPT Business"],
  },
  {
    template_id: "codex_pro_100",
    headingAliases: ["Pro 100", "ChatGPT Pro 100"],
  },
  {
    template_id: "codex_pro",
    headingAliases: ["Pro", "Pro 200", "ChatGPT Pro"],
  },
  {
    template_id: "codex_pro_500",
    headingAliases: ["Pro 500", "ChatGPT Pro 500"],
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
