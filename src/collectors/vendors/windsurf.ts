import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "windsurf";
export const PROVIDER_ID = "windsurf";
export const SOURCE_URL = "https://windsurf.com/pricing";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "windsurf_free",
    headingAliases: ["Free", "Windsurf Free"],
    allowFree: true,
  },
  {
    template_id: "windsurf_pro",
    headingAliases: ["Pro", "Windsurf Pro"],
  },
  {
    template_id: "windsurf_teams",
    headingAliases: ["Teams", "Team", "Windsurf Teams"],
  },
  {
    template_id: "windsurf_max",
    headingAliases: ["Max", "Windsurf Max"],
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
