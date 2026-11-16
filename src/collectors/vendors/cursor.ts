import {
  extractPlansFromHtmlCards,
  runVendorHtmlCollector,
  type ExtractedPlanPrice,
  type PlanCardSpec,
  type VendorCollectionResult,
} from "../html-utils.js";
import type { TextFetcher } from "../http.js";

export const VENDOR_ID = "cursor";
export const PROVIDER_ID = "cursor";
export const SOURCE_URL = "https://cursor.com/pricing";

const SPECS: readonly PlanCardSpec[] = [
  {
    template_id: "cursor_free",
    headingAliases: ["Free", "Hobby", "Cursor Free"],
    allowFree: true,
  },
  {
    template_id: "cursor_plus",
    headingAliases: ["Plus", "Cursor Plus"],
  },
  {
    template_id: "cursor_premium",
    headingAliases: ["Premium", "Cursor Premium"],
  },
  {
    template_id: "cursor_super",
    headingAliases: ["Super", "Cursor Super"],
  },
  {
    template_id: "cursor_ultra",
    headingAliases: ["Ultra", "Cursor Ultra"],
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
