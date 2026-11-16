import * as cheerio from "cheerio";
import type { TextFetcher } from "./http.js";

type CheerioSelection = ReturnType<cheerio.CheerioAPI>;

export interface ExtractedPlanPrice {
  template_id: string;
  monthly_usd: number;
  confidence: "high" | "medium";
  evidence: string;
  annual_monthly_usd?: number | null;
}

export interface VendorCollectionResult {
  vendor_id: string;
  provider_id: string;
  url: string;
  status: "ok" | "challenged_or_blocked" | "unreachable" | "no_matches";
  httpStatus: number | null;
  extracted: ExtractedPlanPrice[];
  note: string;
}

export interface PlanCardSpec {
  template_id: string;
  headingAliases: readonly string[];
  allowFree?: boolean;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findPlanContainer(
  $: cheerio.CheerioAPI,
  aliases: readonly string[],
  allKnownHeadings: readonly string[]
): CheerioSelection | null {
  const normalizedAliases = aliases.map((a) => a.toLowerCase());
  const normalizedOthers = allKnownHeadings
    .map((h) => h.toLowerCase())
    .filter((h) => !normalizedAliases.includes(h));

  const headingSelectors = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "[data-plan]",
    "[data-tier]",
    ".plan-title",
    ".tier-name",
    "strong",
  ].join(", ");

  const candidates = $(headingSelectors).toArray();

  for (const el of candidates) {
    const node = $(el);
    const dataPlan = (node.attr("data-plan") ?? node.attr("data-tier") ?? "")
      .trim()
      .toLowerCase();
    const ownText = normalizeWhitespace(node.text()).toLowerCase();

    const matched = normalizedAliases.some(
      (alias) => ownText === alias || dataPlan === alias
    );
    if (!matched) {
      continue;
    }

    let current: CheerioSelection = node;
    for (let depth = 0; depth <= 4; depth += 1) {
      const containerText = normalizeWhitespace(current.text());
      const lowerContainer = containerText.toLowerCase();

      const containsOtherPlanHeading =
        depth > 0 &&
        normalizedOthers.some((other) => {
          return current
            .find(
              "h1, h2, h3, h4, h5, [data-plan], [data-tier], .plan-title, .tier-name"
            )
            .toArray()
            .some((h) => normalizeWhitespace($(h).text()).toLowerCase() === other);
        });

      if (containsOtherPlanHeading) {
        break;
      }

      if (
        (containerText.includes("$") || /\bfree\b/i.test(lowerContainer)) &&
        containerText.length <= 1600
      ) {
        return current;
      }

      const parent = current.parent();
      if (!parent || parent.length === 0) {
        break;
      }
      current = parent;
    }
  }

  return null;
}

interface ParsedPriceCandidate {
  amount: number;
  isAnnualTotal: boolean;
  isAnnualDiscountedMonthly: boolean;
  hasExplicitMonthlyContext: boolean;
  snippet: string;
}

function normalizePriceBoundaries(source: string): string {
  return source
    .replace(/(\d)(?=(?:per|usd|billed|mo|month|yr|year|if|when))/gi, "$1 ")
    .replace(/\bUSD(?=[A-Za-z])/gi, "USD ");
}

function clampSentenceWindow(
  text: string,
  prevEnd: number,
  matchStart: number,
  matchEnd: number,
  nextStart: number
): { start: number; end: number } {
  let start = Math.max(prevEnd, matchStart - 24);
  const before = text.slice(start, matchStart);
  const beforeBreak = before.match(/.*(?:(?<!\d)\.\s|\)\.|[;\n])/s);
  if (beforeBreak && beforeBreak[0]) {
    start += beforeBreak[0].length;
  }

  let end = Math.min(nextStart, matchEnd + 56);
  const after = text.slice(matchEnd, end);
  const afterBreak = after.search(/(?<!\d)\.(?:\s|$)|[;\n]/);
  if (afterBreak !== -1) {
    end = matchEnd + afterBreak + 1;
  }

  return { start, end };
}

function scanPriceText(rawSource: string): ParsedPriceCandidate[] {
  const source = normalizePriceBoundaries(rawSource);
  const found: ParsedPriceCandidate[] = [];
  const priceRegex = /\$\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/g;

  interface RawMatch {
    index: number;
    endIndex: number;
    rawNum: string;
  }

  const rawMatches: RawMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = priceRegex.exec(source)) !== null) {
    if (match[1]) {
      rawMatches.push({
        index: match.index,
        endIndex: match.index + match[0].length,
        rawNum: match[1],
      });
    }
  }

  for (let i = 0; i < rawMatches.length; i += 1) {
    const m = rawMatches[i]!;
    const amount = Number.parseFloat(m.rawNum.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount > 2000) {
      continue;
    }

    const prevEnd = i > 0 ? rawMatches[i - 1]!.endIndex : 0;
    const nextStart =
      i + 1 < rawMatches.length ? rawMatches[i + 1]!.index : source.length;
    const { start, end } = clampSentenceWindow(
      source,
      prevEnd,
      m.index,
      m.endIndex,
      nextStart
    );
    const snippet = source.slice(start, end).trim();
    const windowText = snippet.toLowerCase();

    const isAnnualTotal =
      /\/\s*(?:yr|year)\b|\bper\s+year\b|\byearly\s+total\b|\bbilled\s+up\s*front\b|\bupfront\s+annually\b/i.test(
        windowText
      );
    const isAnnualDiscountedMonthly =
      /\bbilled\s+annually\b|\bwhen\s+billed\s+yearly\b|\bannual\s+(?:plan|subscription|discount|billing)\b|\bwith\s+annual\b/i.test(
        windowText
      );
    const hasExplicitMonthlyContext =
      /\/\s*(?:mo|month)\b|\bper\s+(?:user|seat|member)?\s*\/?\s*month\b|\bmonthly\b|\bbilled\s+monthly\b/i.test(
        windowText
      );

    found.push({
      amount,
      isAnnualTotal,
      isAnnualDiscountedMonthly,
      hasExplicitMonthlyContext,
      snippet,
    });
  }

  return found;
}

function parsePriceCandidatesFromCard(
  $: cheerio.CheerioAPI,
  card: CheerioSelection
): ParsedPriceCandidate[] {
  const priceElements = card
    .find("[data-price], .price, .pricing, .amount, span, p, div, strong")
    .toArray();

  const seenSnippets = new Set<string>();
  const candidates: ParsedPriceCandidate[] = [];

  for (const el of priceElements) {
    const text = normalizeWhitespace($(el).text());
    if (text.includes("$") && text.length <= 160 && !seenSnippets.has(text)) {
      seenSnippets.add(text);
      candidates.push(...scanPriceText(text));
    }
  }

  if (candidates.every((c) => !c.hasExplicitMonthlyContext)) {
    const fullCardText = normalizeWhitespace(card.text());
    if (fullCardText.includes("$") && fullCardText.length <= 1600) {
      candidates.push(...scanPriceText(fullCardText));
    }
  }

  return candidates;
}

export function extractPlansFromHtmlCards(
  html: string,
  specs: readonly PlanCardSpec[]
): ExtractedPlanPrice[] {
  const $ = cheerio.load(html);
  const allKnownHeadings = specs.flatMap((spec) => spec.headingAliases);
  const results: ExtractedPlanPrice[] = [];

  for (const spec of specs) {
    const card = findPlanContainer($, spec.headingAliases, allKnownHeadings);
    if (!card) {
      continue;
    }

    const candidates = parsePriceCandidatesFromCard($, card);
    const nonAnnualTotals = candidates.filter((c) => !c.isAnnualTotal);

    const standardMonthly = nonAnnualTotals.find(
      (c) => c.hasExplicitMonthlyContext && !c.isAnnualDiscountedMonthly
    );
    const annualPerMonth = nonAnnualTotals.find(
      (c) => c.isAnnualDiscountedMonthly
    );

    if (standardMonthly) {
      results.push({
        template_id: spec.template_id,
        monthly_usd: standardMonthly.amount,
        confidence: "high",
        evidence: standardMonthly.snippet,
        ...(annualPerMonth
          ? { annual_monthly_usd: annualPerMonth.amount }
          : {}),
      });
      continue;
    }

    const zeroCandidate = nonAnnualTotals.find((c) => c.amount === 0);
    if (spec.allowFree && (zeroCandidate || /\bfree\b/i.test(card.text()))) {
      results.push({
        template_id: spec.template_id,
        monthly_usd: 0,
        confidence: "high",
        evidence: zeroCandidate?.snippet ?? "Free tier heading matched",
      });
      continue;
    }

    const fallbackMonthly = nonAnnualTotals.find(
      (c) => !c.isAnnualDiscountedMonthly
    );
    if (fallbackMonthly) {
      results.push({
        template_id: spec.template_id,
        monthly_usd: fallbackMonthly.amount,
        confidence: "medium",
        evidence: fallbackMonthly.snippet,
        ...(annualPerMonth
          ? { annual_monthly_usd: annualPerMonth.amount }
          : {}),
      });
    }
  }

  return results;
}

export async function runVendorHtmlCollector(params: {
  vendor_id: string;
  provider_id: string;
  url: string;
  fetcher: TextFetcher;
  parseHtml: (html: string) => ExtractedPlanPrice[];
}): Promise<VendorCollectionResult> {
  const outcome = await params.fetcher(params.url);

  if (!outcome.ok || outcome.body === null) {
    return {
      vendor_id: params.vendor_id,
      provider_id: params.provider_id,
      url: params.url,
      status:
        outcome.status === "challenged_or_blocked"
          ? "challenged_or_blocked"
          : "unreachable",
      httpStatus: outcome.httpStatus,
      extracted: [],
      note: outcome.reason ?? "Fetch failed",
    };
  }

  const extracted = params.parseHtml(outcome.body);
  if (extracted.length === 0) {
    return {
      vendor_id: params.vendor_id,
      provider_id: params.provider_id,
      url: params.url,
      status: "no_matches",
      httpStatus: outcome.httpStatus,
      extracted: [],
      note: "Page fetched successfully, no structured plan pricing selectors matched",
    };
  }

  return {
    vendor_id: params.vendor_id,
    provider_id: params.provider_id,
    url: params.url,
    status: "ok",
    httpStatus: outcome.httpStatus,
    extracted,
    note: `Extracted ${extracted.length} plan price(s)`,
  };
}
