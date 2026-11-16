import { canonicalizeJson } from "../hash.js";
import type {
  CatalogPlanEntry,
  SubscriptionCatalogDocument,
  TokenTrackerPlanTemplate,
} from "../types.js";
import { validateCatalog } from "./schema-validator.js";

export type DiffClassification =
  | "unchanged"
  | "safe_minor_update"
  | "requires_review"
  | "rejected";

export interface PlanDiffEntry {
  kind: "added" | "removed" | "modified";
  template_id: string;
  provider_id: string;
  plan_name: string;
  old_monthly_usd: number | null;
  new_monthly_usd: number | null;
  old_micro_usd: number | null;
  new_micro_usd: number | null;
  relative_change_pct: number | null;
  detail: string;
}

export interface DiffClassificationResult {
  classification: DiffClassification;
  reasons: string[];
  changes: PlanDiffEntry[];
  markdownSummary: string;
}

const MAX_SAFE_MODIFIED_PLANS = 3;
const MAX_SAFE_RELATIVE_PRICE_CHANGE = 0.35;
const MAX_SAFE_ABSOLUTE_PRICE_DELTA_MICRO_USD = 50_000_000;

function formatUsd(microUsd: number | null): string {
  if (microUsd === null) {
    return "-";
  }
  const usd = microUsd / 1_000_000;
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
}

function canonicalPlanBodyWithoutVerifiedAt(plan: CatalogPlanEntry): string {
  const clone = {
    ...plan,
    verification: {
      price_source: plan.verification.price_source,
      quota_source: plan.verification.quota_source,
    },
  };
  return JSON.stringify(canonicalizeJson(clone));
}

export async function classifyCatalogDiff(
  previous: SubscriptionCatalogDocument | null,
  next: SubscriptionCatalogDocument,
  options?: {
    schemaPath?: string;
    templates?: readonly TokenTrackerPlanTemplate[];
    collectorNotes?: readonly string[];
  }
): Promise<DiffClassificationResult> {
  const validation = await validateCatalog(next, {
    ...(options?.schemaPath !== undefined
      ? { schemaPath: options.schemaPath }
      : {}),
    ...(options?.templates !== undefined
      ? { templates: options.templates }
      : {}),
  });

  if (!validation.valid) {
    const summary = buildMarkdownSummary(
      "rejected",
      previous,
      next,
      validation.errors,
      [],
      options?.collectorNotes ?? []
    );
    return {
      classification: "rejected",
      reasons: validation.errors,
      changes: [],
      markdownSummary: summary,
    };
  }

  if (previous !== null && previous.content_hash === next.content_hash) {
    const summary = buildMarkdownSummary(
      "unchanged",
      previous,
      next,
      ["Catalog content hash is identical to baseline."],
      [],
      options?.collectorNotes ?? []
    );
    return {
      classification: "unchanged",
      reasons: ["Catalog content hash is identical to baseline."],
      changes: [],
      markdownSummary: summary,
    };
  }

  if (previous === null) {
    const reasons = ["No previous catalog baseline available; requires review."];
    const summary = buildMarkdownSummary(
      "requires_review",
      null,
      next,
      reasons,
      [],
      options?.collectorNotes ?? []
    );
    return {
      classification: "requires_review",
      reasons,
      changes: [],
      markdownSummary: summary,
    };
  }

  const reasons: string[] = [];
  const changes: PlanDiffEntry[] = [];

  const prevProviders = new Set(previous.providers.map((p) => p.provider_id));
  const nextProviders = new Set(next.providers.map((p) => p.provider_id));
  for (const id of nextProviders) {
    if (!prevProviders.has(id)) {
      reasons.push(`Provider added: ${id}`);
    }
  }
  for (const id of prevProviders) {
    if (!nextProviders.has(id)) {
      reasons.push(`Provider removed: ${id}`);
    }
  }

  const prevPlanMap = new Map(
    previous.plans.map((p) => [p.template_id, p])
  );
  const nextPlanMap = new Map(next.plans.map((p) => [p.template_id, p]));

  for (const [id, plan] of nextPlanMap) {
    if (!prevPlanMap.has(id)) {
      reasons.push(`Plan added: ${id}`);
      changes.push({
        kind: "added",
        template_id: id,
        provider_id: plan.provider_id,
        plan_name: plan.plan_name,
        old_monthly_usd: null,
        new_monthly_usd: plan.billing.monthly_usd,
        old_micro_usd: null,
        new_micro_usd: plan.monthly_fee_micro_usd,
        relative_change_pct: null,
        detail: "New plan added",
      });
    }
  }

  for (const [id, plan] of prevPlanMap) {
    if (!nextPlanMap.has(id)) {
      reasons.push(`Plan removed: ${id}`);
      changes.push({
        kind: "removed",
        template_id: id,
        provider_id: plan.provider_id,
        plan_name: plan.plan_name,
        old_monthly_usd: plan.billing.monthly_usd,
        new_monthly_usd: null,
        old_micro_usd: plan.monthly_fee_micro_usd,
        new_micro_usd: null,
        relative_change_pct: null,
        detail: "Plan removed",
      });
    }
  }

  let modifiedCount = 0;
  for (const [id, nextPlan] of nextPlanMap) {
    const prevPlan = prevPlanMap.get(id);
    if (!prevPlan) {
      continue;
    }
    const prevJson = canonicalPlanBodyWithoutVerifiedAt(prevPlan);
    const nextJson = canonicalPlanBodyWithoutVerifiedAt(nextPlan);
    if (
      prevJson === nextJson &&
      prevPlan.verification.last_verified_at ===
        nextPlan.verification.last_verified_at
    ) {
      continue;
    }

    modifiedCount += 1;
    const oldMicro = prevPlan.monthly_fee_micro_usd;
    const newMicro = nextPlan.monthly_fee_micro_usd;
    const absDelta = Math.abs(newMicro - oldMicro);
    const relChange =
      oldMicro > 0 ? Math.abs(newMicro - oldMicro) / oldMicro : null;
    const relPct =
      relChange !== null ? Number((relChange * 100).toFixed(2)) : null;

    if (oldMicro > 0 && newMicro === 0) {
      reasons.push(
        `Paid plan '${id}' monthly fee dropped to $0 (potential scraping anomaly)`
      );
    } else if (oldMicro === 0 && newMicro > 0) {
      reasons.push(`Free plan '${id}' changed to paid (${formatUsd(newMicro)})`);
    } else {
      if (absDelta > MAX_SAFE_ABSOLUTE_PRICE_DELTA_MICRO_USD) {
        reasons.push(
          `Plan '${id}' fee delta (${formatUsd(absDelta)}) exceeds $50 threshold`
        );
      }
      if (
        relChange !== null &&
        relChange > MAX_SAFE_RELATIVE_PRICE_CHANGE
      ) {
        reasons.push(
          `Plan '${id}' fee changed by ${relPct}% (> 35% threshold)`
        );
      }
    }

    if (
      JSON.stringify(prevPlan.windows) !== JSON.stringify(nextPlan.windows)
    ) {
      reasons.push(`Plan '${id}' window rules modified`);
    }

    changes.push({
      kind: "modified",
      template_id: id,
      provider_id: nextPlan.provider_id,
      plan_name: nextPlan.plan_name,
      old_monthly_usd: prevPlan.billing.monthly_usd,
      new_monthly_usd: nextPlan.billing.monthly_usd,
      old_micro_usd: oldMicro,
      new_micro_usd: newMicro,
      relative_change_pct: relPct,
      detail:
        oldMicro !== newMicro
          ? `Fee updated ${formatUsd(oldMicro)} -> ${formatUsd(newMicro)}`
          : "Metadata / verification updated",
    });
  }

  if (modifiedCount > MAX_SAFE_MODIFIED_PLANS) {
    reasons.push(
      `Modified plan count (${modifiedCount}) exceeds auto-merge threshold (${MAX_SAFE_MODIFIED_PLANS})`
    );
  }

  const classification: DiffClassification =
    reasons.length > 0 ? "requires_review" : "safe_minor_update";

  const finalReasons =
    reasons.length > 0
      ? reasons
      : [
          `Validated ${modifiedCount} minor plan update(s) within safety guardrails.`,
        ];

  const markdownSummary = buildMarkdownSummary(
    classification,
    previous,
    next,
    finalReasons,
    changes,
    options?.collectorNotes ?? []
  );

  return {
    classification,
    reasons: finalReasons,
    changes,
    markdownSummary,
  };
}

function buildMarkdownSummary(
  classification: DiffClassification,
  previous: SubscriptionCatalogDocument | null,
  next: SubscriptionCatalogDocument,
  reasons: readonly string[],
  changes: readonly PlanDiffEntry[],
  collectorNotes: readonly string[]
): string {
  const lines: string[] = [];
  lines.push(`## Catalog Sync Report (\`${classification}\`)`);
  lines.push("");
  lines.push(
    `- **Previous hash**: \`${previous?.content_hash.slice(0, 12) ?? "none"}\``
  );
  lines.push(`- **Next hash**: \`${next.content_hash.slice(0, 12)}\``);
  lines.push(
    `- **Catalog stats**: ${next.stats.provider_count} providers, ${next.stats.plan_count} plans (${next.stats.active_plan_count} active)`
  );
  lines.push("");

  if (reasons.length > 0) {
    lines.push("### Gate Evaluation");
    for (const reason of reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  if (changes.length > 0) {
    lines.push("### Plan Changes");
    lines.push("");
    lines.push("| Kind | Template ID | Provider | Plan | Previous | Next | Detail |");
    lines.push("| :--- | :--- | :--- | :--- | ---: | ---: | :--- |");
    for (const c of changes) {
      lines.push(
        `| \`${c.kind}\` | \`${c.template_id}\` | \`${c.provider_id}\` | ${c.plan_name} | \`${formatUsd(c.old_micro_usd)}\` | \`${formatUsd(c.new_micro_usd)}\` | ${c.detail} |`
      );
    }
    lines.push("");
  }

  if (collectorNotes.length > 0) {
    lines.push("### Collector Notes");
    for (const note of collectorNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
