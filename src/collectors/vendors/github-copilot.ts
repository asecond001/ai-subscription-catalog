import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "github";
export const PROVIDER_ID = "github_copilot";
export const SOURCE_URL = "https://github.com/features/copilot/plans";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "copilot_free",
    headingAliases: ["Copilot Free", "Free"],
    allowFree: true,
  },
  {
    template_id: "copilot_pro",
    headingAliases: ["Copilot Pro", "Pro"],
  },
  {
    template_id: "copilot_business",
    headingAliases: ["Copilot Business", "Business"],
  },
  {
    template_id: "copilot_pro_plus",
    headingAliases: ["Copilot Pro+", "Pro+"],
  },
  {
    template_id: "copilot_enterprise",
    headingAliases: ["Copilot Enterprise", "Enterprise"],
  },
  {
    template_id: "copilot_max",
    headingAliases: ["Copilot Max", "Max"],
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
