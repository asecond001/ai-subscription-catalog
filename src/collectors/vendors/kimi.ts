import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "moonshot";
export const PROVIDER_ID = "kimi_code";
export const SOURCE_URL = "https://www.kimi.com/membership";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "kimi_code_plus",
    headingAliases: ["Moderato", "Kimi Plus", "Plus"],
  },
  {
    template_id: "kimi_code_allegretto",
    headingAliases: ["Allegretto", "Kimi Pro", "Pro"],
  },
  {
    template_id: "kimi_code_max",
    headingAliases: ["Allegro", "Kimi Max", "Max"],
  },
  {
    template_id: "kimi_code_ultra",
    headingAliases: ["Vivace", "Kimi Ultra", "Ultra"],
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
