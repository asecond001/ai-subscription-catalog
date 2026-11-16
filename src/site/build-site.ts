import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SubscriptionCatalogDocument } from "../types.js";

function renderExplorerHtml(catalog: SubscriptionCatalogDocument): string {
  const safeEmbeddedJson = JSON.stringify(catalog).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Subscription Catalog — Machine-Readable Coding Plan &amp; Quota Index</title>
  <style>
    :root {
      --bg: #0b0d10;
      --bg-elev: #11141a;
      --bg-hover: #161b23;
      --border: #1f2530;
      --border-strong: #2d3544;
      --text: #e6ebf2;
      --text-muted: #8b95a7;
      --text-subtle: #647084;
      --accent: #5e8bff;
      --accent-soft: rgba(94, 139, 255, 0.14);
      --green: #3ecf8e;
      --amber: #f5a524;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
    }

    [data-theme="light"] {
      --bg: #ffffff;
      --bg-elev: #f7f8fa;
      --bg-hover: #f0f2f6;
      --border: #e4e7ee;
      --border-strong: #cfd5e0;
      --text: #111622;
      --text-muted: #525d70;
      --text-subtle: #7a8599;
      --accent: #2563eb;
      --accent-soft: rgba(37, 99, 235, 0.1);
      --green: #0f9d58;
      --amber: #b45309;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 13px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }

    .num {
      font-variant-numeric: tabular-nums;
      font-family: var(--mono);
    }

    .topbar {
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 20px;
    }

    .topbar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 52px;
      flex-wrap: wrap;
      padding: 8px 0;
    }

    .brand {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .brand-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .brand-sub {
      color: var(--text-muted);
      font-size: 12px;
    }

    .top-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn, .seg-btn, .input {
      background: var(--bg-elev);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-family: var(--sans);
      font-size: 12px;
      height: 28px;
      padding: 0 10px;
      outline: none;
    }

    .btn, .seg-btn {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }

    .btn:hover, .seg-btn:hover {
      border-color: var(--border-strong);
      background: var(--bg-hover);
    }

    .seg-group {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .seg-group .seg-btn {
      border: 0;
      border-right: 1px solid var(--border);
      border-radius: 0;
      height: 26px;
    }

    .seg-group .seg-btn:last-child {
      border-right: 0;
    }

    .seg-btn.active {
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }

    .rate-wrap {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--text-muted);
      font-size: 12px;
    }

    .rate-input {
      width: 60px;
      text-align: right;
      font-family: var(--mono);
      font-variant-numeric: tabular-nums;
    }

    .strip {
      border-bottom: 1px solid var(--border);
      background: var(--bg-elev);
      padding: 10px 0;
    }

    .endpoints-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .endpoint-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11.5px;
    }

    .endpoint-label {
      color: var(--text-muted);
      font-weight: 500;
    }

    .endpoint-url {
      font-family: var(--mono);
      color: var(--text);
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-mini {
      background: transparent;
      border: 0;
      color: var(--accent);
      cursor: pointer;
      font-size: 11px;
      padding: 0 2px;
      font-family: var(--sans);
    }

    .copy-mini:hover { text-decoration: underline; }

    .meta-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .stats-line {
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--text-muted);
      font-size: 12px;
      flex-wrap: wrap;
    }

    .stats-line strong {
      color: var(--text);
      font-weight: 600;
    }

    .filters-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .provider-pills {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .pill {
      height: 25px;
      padding: 0 9px;
      font-size: 12px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--sans);
    }

    .pill:hover {
      border-color: var(--border-strong);
      color: var(--text);
    }

    .pill.active {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .search-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .search-input {
      width: 240px;
    }

    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    thead th {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      padding: 9px 10px;
      border-bottom: 1px solid var(--border-strong);
      background: var(--bg-elev);
      white-space: nowrap;
    }

    th.right, td.right { text-align: right; }

    tbody tr.plan-row {
      border-bottom: 1px solid var(--border);
      cursor: pointer;
    }

    tbody tr.plan-row:hover {
      background: var(--bg-hover);
    }

    tbody tr.plan-row td {
      padding: 8px 10px;
      vertical-align: middle;
      white-space: nowrap;
    }

    tbody tr.detail-row td {
      padding: 0;
      border-bottom: 1px solid var(--border-strong);
      background: var(--bg-elev);
    }

    .detail-panel {
      padding: 14px 16px;
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 16px;
    }

    @media (max-width: 900px) {
      .detail-panel { grid-template-columns: 1fr; }
    }

    .tag {
      display: inline-block;
      padding: 1px 6px;
      border: 1px solid var(--border-strong);
      border-radius: 3px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--mono);
    }

    .tag.active { color: var(--green); border-color: rgba(62, 207, 142, 0.35); }
    .tag.legacy { color: var(--amber); border-color: rgba(245, 165, 36, 0.35); }
    .tag.tt { color: var(--accent); border-color: rgba(94, 139, 255, 0.35); }

    .plan-name-cell {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .plan-title { font-weight: 600; color: var(--text); }
    .plan-id { font-family: var(--mono); font-size: 11px; color: var(--text-subtle); }

    .sub-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      background: var(--bg);
      margin-top: 6px;
    }

    .sub-table th, .sub-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }

    .sub-table th {
      color: var(--text-muted);
      font-weight: 600;
      background: var(--bg-elev);
    }

    .detail-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .detail-list {
      margin: 6px 0 0 16px;
      padding: 0;
      color: var(--text-muted);
    }

    .footer {
      border-top: 1px solid var(--border);
      padding: 14px 0 28px;
      color: var(--text-subtle);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="container topbar-inner">
      <div class="brand">
        <span class="brand-title">AI Subscription Catalog</span>
        <span class="brand-sub">Open machine-readable index of AI coding subscriptions &amp; quota windows</span>
      </div>
      <div class="top-controls">
        <div class="seg-group" aria-label="Currency">
          <button type="button" class="seg-btn active" data-currency="USD">USD</button>
          <button type="button" class="seg-btn" data-currency="CNY">CNY</button>
        </div>
        <label class="rate-wrap" title="USD to CNY display multiplier">
          <span>USD/CNY</span>
          <input id="cny-rate" class="input rate-input" type="number" step="0.01" min="1" max="20" value="7.20" />
        </label>
        <button type="button" id="theme-toggle" class="btn">Light Theme</button>
        <a class="btn" href="https://github.com/asecond001/ai-subscription-catalog" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </div>
  </header>

  <section class="strip">
    <div class="container endpoints-row" id="endpoints-row"></div>
  </section>

  <main class="container">
    <div class="meta-bar">
      <div class="stats-line" id="stats-line"></div>
      <div class="stats-line">
        <a href="./v1/plans.json" target="_blank" rel="noreferrer">v1/plans.json</a>
        <a href="./v1/tokentracker-templates.json" target="_blank" rel="noreferrer">v1/tokentracker-templates.json</a>
        <a href="./v1/providers.json" target="_blank" rel="noreferrer">v1/providers.json</a>
        <a href="./schemas/subscription-plans.schema.json" target="_blank" rel="noreferrer">Schema</a>
      </div>
    </div>

    <div class="filters-bar">
      <div class="provider-pills" id="provider-pills"></div>
      <div class="search-controls">
        <div class="seg-group" aria-label="Status">
          <button type="button" class="seg-btn active" data-status="active">Active</button>
          <button type="button" class="seg-btn" data-status="all">All</button>
        </div>
        <input id="search-input" class="input search-input" type="search" placeholder="Filter plan, provider, or ID (/)..." />
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Plan / Template ID</th>
            <th>Tier</th>
            <th class="right">Monthly Fee</th>
            <th class="right">Annual/mo</th>
            <th class="right">Scale</th>
            <th class="right">5h / 24h Window</th>
            <th class="right">7d Weekly</th>
            <th class="right">30d Monthly</th>
            <th>Provenance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="plans-tbody"></tbody>
      </table>
    </div>

    <footer class="footer">
      <span>MIT License · Built for TokenTracker &amp; open AI observability tools</span>
      <span id="footer-count" class="num"></span>
    </footer>
  </main>

  <script id="catalog-data" type="application/json">${safeEmbeddedJson}</script>
  <script>
    (function () {
      const dataEl = document.getElementById("catalog-data");
      const catalog = JSON.parse(dataEl.textContent || "{}");

      const endpoints = [
        { label: "GitHub Pages", url: "https://asecond001.github.io/ai-subscription-catalog/v1/plans.json" },
        { label: "jsDelivr CDN", url: "https://cdn.jsdelivr.net/gh/asecond001/ai-subscription-catalog@main/catalog/subscription-plans.json" },
        { label: "GitHub Raw", url: "https://raw.githubusercontent.com/asecond001/ai-subscription-catalog/main/catalog/subscription-plans.json" },
        { label: "TokenTracker Slice", url: "https://raw.githubusercontent.com/asecond001/ai-subscription-catalog/main/catalog/tokentracker-templates.json" }
      ];

      const state = {
        currency: "USD",
        cnyRate: 7.20,
        provider: "all",
        status: "active",
        search: "",
        expandedId: null
      };

      const providerMap = new Map();
      for (const p of catalog.providers || []) {
        providerMap.set(p.provider_id, p);
      }

      function esc(val) {
        return String(val ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatMoneyMicro(microUsd, explicitCny, perSeat) {
        if (microUsd === 0) return "Free";
        if (state.currency === "CNY") {
          const cny = explicitCny != null ? explicitCny : (microUsd / 1_000_000) * state.cnyRate;
          const formatted = Number.isInteger(cny) ? "¥" + cny : "¥" + cny.toFixed(2);
          return perSeat ? formatted + "/seat" : formatted;
        }
        const usd = microUsd / 1_000_000;
        const formatted = Number.isInteger(usd) ? "$" + usd : "$" + usd.toFixed(2);
        return perSeat ? formatted + "/seat" : formatted;
      }

      function formatUsdNumber(usd, perSeat) {
        if (usd === null || usd === undefined) return "—";
        if (state.currency === "CNY") {
          const cny = usd * state.cnyRate;
          return "¥" + cny.toFixed(2) + (perSeat ? "/seat" : "");
        }
        return (Number.isInteger(usd) ? "$" + usd : "$" + usd.toFixed(2)) + (perSeat ? "/seat" : "");
      }

      function formatWindowLimit(win) {
        if (!win) return "—";
        if (win.unit === "tokens") {
          const m = win.limit_value / 1_000_000;
          return (Number.isInteger(m) ? m : m.toFixed(1)) + "M tok";
        }
        if (state.currency === "CNY") {
          const cny = (win.limit_value / 1_000_000) * state.cnyRate;
          return "¥" + Math.round(cny);
        }
        const usd = win.limit_value / 1_000_000;
        return Number.isInteger(usd) ? "$" + usd : "$" + usd.toFixed(2);
      }

      function findWindow(plan, ids) {
        return (plan.windows || []).find((w) => ids.includes(w.window_id)) || null;
      }

      function copyText(text, btnEl) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
          const prev = btnEl.textContent;
          btnEl.textContent = "Copied";
          setTimeout(() => { btnEl.textContent = prev; }, 1200);
        });
      }

      function renderEndpoints() {
        const host = document.getElementById("endpoints-row");
        host.innerHTML = endpoints.map((ep, idx) =>
          '<div class="endpoint-item">' +
            '<span class="endpoint-label">' + esc(ep.label) + '</span>' +
            '<span class="endpoint-url" title="' + esc(ep.url) + '">' + esc(ep.url) + '</span>' +
            '<button type="button" class="copy-mini" data-copy-ep="' + idx + '">Copy</button>' +
          '</div>'
        ).join("");
        host.querySelectorAll("[data-copy-ep]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const ep = endpoints[Number(btn.getAttribute("data-copy-ep"))];
            if (ep) copyText(ep.url, btn);
          });
        });
      }

      function renderMeta() {
        const stats = catalog.stats || {};
        const el = document.getElementById("stats-line");
        el.innerHTML =
          '<span>Providers: <strong class="num">' + esc(stats.provider_count) + '</strong></span>' +
          '<span>Plans: <strong class="num">' + esc(stats.plan_count) + '</strong> (<span class="num">' + esc(stats.active_plan_count) + '</span> active)</span>' +
          '<span>TokenTracker Templates: <strong class="num">' + esc(stats.tokentracker_template_count) + '</strong></span>' +
          '<span>Hash: <strong class="num">' + esc((catalog.content_hash || "").slice(0, 12)) + '</strong></span>' +
          '<span>Updated: <strong class="num">' + esc((catalog.generated_at || "").slice(0, 10)) + '</strong></span>';
      }

      function renderProviderPills() {
        const host = document.getElementById("provider-pills");
        const providers = catalog.providers || [];
        const pills = ['<button type="button" class="pill ' + (state.provider === "all" ? "active" : "") + '" data-prov="all">All (' + (catalog.plans || []).length + ')</button>'];
        for (const p of providers) {
          const count = (catalog.plans || []).filter((pl) => pl.provider_id === p.provider_id).length;
          pills.push(
            '<button type="button" class="pill ' + (state.provider === p.provider_id ? "active" : "") + '" data-prov="' + esc(p.provider_id) + '">' +
            esc(p.display_name) + ' <span class="num">(' + count + ')</span></button>'
          );
        }
        host.innerHTML = pills.join("");
        host.querySelectorAll("[data-prov]").forEach((btn) => {
          btn.addEventListener("click", () => {
            state.provider = btn.getAttribute("data-prov") || "all";
            renderProviderPills();
            renderTable();
          });
        });
      }

      function renderDetailPanel(plan, provider) {
        const ttSlice = {
          template_id: plan.template_id,
          provider_id: plan.provider_id,
          plan_name: plan.plan_name,
          monthly_fee_micro_usd: plan.monthly_fee_micro_usd,
          windows: plan.windows,
          description: plan.description
        };
        const rows = (plan.windows || []).map((w) =>
          '<tr>' +
            '<td class="num">' + esc(w.window_id) + '</td>' +
            '<td>' + esc(w.label) + '</td>' +
            '<td class="num">' + esc(w.duration_hours) + 'h</td>' +
            '<td>' + (w.rolling ? "rolling" : "fixed") + '</td>' +
            '<td class="num">' + esc(w.unit) + '</td>' +
            '<td class="right num">' + esc(formatWindowLimit(w)) + ' <span class="plan-id">(' + esc(w.limit_value) + ')</span></td>' +
            '<td class="num">' + esc(w.warning_percent) + '% / ' + esc(w.critical_percent) + '%</td>' +
          '</tr>'
        ).join("");

        const highlights = (plan.highlights || []).map((h) => '<li>' + esc(h) + '</li>').join("");

        return (
          '<div class="detail-panel">' +
            '<div>' +
              '<div><strong>Quota Windows</strong></div>' +
              '<table class="sub-table">' +
                '<thead><tr><th>ID</th><th>Label</th><th>Span</th><th>Mode</th><th>Unit</th><th class="right">Limit</th><th>Alert</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
              '</table>' +
              '<div class="detail-actions">' +
                '<button type="button" class="btn" data-copy-tt="' + esc(plan.template_id) + '">Copy TokenTracker JSON</button>' +
                '<button type="button" class="btn" data-copy-full="' + esc(plan.template_id) + '">Copy Full Plan JSON</button>' +
                '<a class="btn" href="' + esc(plan.official_pricing_url) + '" target="_blank" rel="noreferrer">Official Pricing ↗</a>' +
                (plan.official_limits_url ? '<a class="btn" href="' + esc(plan.official_limits_url) + '" target="_blank" rel="noreferrer">Quota Docs ↗</a>' : '') +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div><strong>Summary</strong></div>' +
              '<p style="margin:6px 0;color:var(--text);">' + esc(plan.description) + '</p>' +
              '<p style="margin:4px 0;color:var(--text-muted);">' + esc(plan.description_en) + '</p>' +
              '<div style="margin-top:8px;color:var(--text-muted);font-size:12px;">' +
                'Vendor: <strong>' + esc(provider ? provider.vendor_name : plan.vendor_id) + '</strong> · ' +
                'Price source: <span class="num">' + esc(plan.verification.price_source) + '</span> · ' +
                'Quota source: <span class="num">' + esc(plan.verification.quota_source) + '</span> · ' +
                'Verified: <span class="num">' + esc(plan.verification.last_verified_at.slice(0, 10)) + '</span>' +
              '</div>' +
              '<ul class="detail-list">' + highlights + '</ul>' +
            '</div>' +
          '</div>'
        );
      }

      function renderTable() {
        const q = state.search.trim().toLowerCase();
        const plans = (catalog.plans || []).filter((plan) => {
          if (state.status === "active" && plan.status !== "active") return false;
          if (state.provider !== "all" && plan.provider_id !== state.provider) return false;
          if (!q) return true;
          const provider = providerMap.get(plan.provider_id);
          const haystack = [
            plan.template_id,
            plan.plan_name,
            plan.provider_id,
            plan.vendor_id,
            plan.description,
            plan.description_en,
            provider ? provider.display_name : "",
            provider ? provider.vendor_name : ""
          ].join(" ").toLowerCase();
          return haystack.includes(q);
        });

        const tbody = document.getElementById("plans-tbody");
        const planById = new Map(plans.map((p) => [p.template_id, p]));

        tbody.innerHTML = plans.map((plan) => {
          const provider = providerMap.get(plan.provider_id);
          const wShort = findWindow(plan, ["5h", "24h"]);
          const wWeek = findWindow(plan, ["7d"]);
          const wMonth = findWindow(plan, ["30d"]);
          const isExpanded = state.expandedId === plan.template_id;
          const hasTtCompat = (plan.compatibility_tags || []).includes("tokentracker-v0.2.4");

          let rowHtml =
            '<tr class="plan-row" data-plan-row="' + esc(plan.template_id) + '">' +
              '<td>' + esc(provider ? provider.display_name : plan.provider_id) + '</td>' +
              '<td><div class="plan-name-cell"><span class="plan-title">' + esc(plan.plan_name) + '</span><span class="plan-id">' + esc(plan.template_id) + '</span></div></td>' +
              '<td><span class="tag">' + esc(plan.tier) + '</span></td>' +
              '<td class="right num">' + esc(formatMoneyMicro(plan.monthly_fee_micro_usd, plan.billing.monthly_cny, plan.billing.per_seat)) + '</td>' +
              '<td class="right num">' + esc(formatUsdNumber(plan.billing.annual_monthly_usd, plan.billing.per_seat)) + '</td>' +
              '<td class="right num">' + (plan.multiplier_vs_base != null ? esc(plan.multiplier_vs_base + "x") : "—") + '</td>' +
              '<td class="right num">' + esc(formatWindowLimit(wShort)) + (wShort ? ' <span class="plan-id">(' + esc(wShort.window_id) + ')</span>' : "") + '</td>' +
              '<td class="right num">' + esc(formatWindowLimit(wWeek)) + '</td>' +
              '<td class="right num">' + esc(formatWindowLimit(wMonth)) + '</td>' +
              '<td><span class="tag">' + esc(plan.verification.quota_source) + '</span></td>' +
              '<td><span class="tag ' + esc(plan.status) + '">' + esc(plan.status) + '</span>' + (hasTtCompat ? ' <span class="tag tt">v0.2.4</span>' : '') + '</td>' +
            '</tr>';

          if (isExpanded) {
            rowHtml += '<tr class="detail-row"><td colspan="11">' + renderDetailPanel(plan, provider) + '</td></tr>';
          }
          return rowHtml;
        }).join("");

        document.getElementById("footer-count").textContent =
          "Showing " + plans.length + " of " + (catalog.plans || []).length + " plans";

        tbody.querySelectorAll("[data-plan-row]").forEach((tr) => {
          tr.addEventListener("click", () => {
            const id = tr.getAttribute("data-plan-row");
            state.expandedId = state.expandedId === id ? null : id;
            renderTable();
          });
        });

        tbody.querySelectorAll("[data-copy-tt]").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const plan = planById.get(btn.getAttribute("data-copy-tt") || "");
            if (!plan) return;
            const tt = {
              template_id: plan.template_id,
              provider_id: plan.provider_id,
              plan_name: plan.plan_name,
              monthly_fee_micro_usd: plan.monthly_fee_micro_usd,
              windows: plan.windows,
              description: plan.description
            };
            copyText(JSON.stringify(tt, null, 2), btn);
          });
        });

        tbody.querySelectorAll("[data-copy-full]").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const plan = planById.get(btn.getAttribute("data-copy-full") || "");
            if (!plan) return;
            copyText(JSON.stringify(plan, null, 2), btn);
          });
        });
      }

      document.querySelectorAll("[data-currency]").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("[data-currency]").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.currency = btn.getAttribute("data-currency") || "USD";
          renderTable();
        });
      });

      document.querySelectorAll("[data-status]").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("[data-status]").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.status = btn.getAttribute("data-status") || "active";
          renderTable();
        });
      });

      document.getElementById("cny-rate").addEventListener("input", (ev) => {
        const val = Number.parseFloat(ev.target.value);
        if (Number.isFinite(val) && val > 0) {
          state.cnyRate = val;
          if (state.currency === "CNY") renderTable();
        }
      });

      const searchInput = document.getElementById("search-input");
      searchInput.addEventListener("input", (ev) => {
        state.search = ev.target.value || "";
        renderTable();
      });

      window.addEventListener("keydown", (ev) => {
        if (ev.key === "/" && document.activeElement !== searchInput) {
          ev.preventDefault();
          searchInput.focus();
        }
      });

      const themeBtn = document.getElementById("theme-toggle");
      themeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        themeBtn.textContent = next === "dark" ? "Light Theme" : "Dark Theme";
      });

      renderEndpoints();
      renderMeta();
      renderProviderPills();
      renderTable();
    })();
  </script>
</body>
</html>
`;
}

export async function buildSite(options?: {
  rootDir?: string;
  outDir?: string;
}): Promise<{ outDir: string; planCount: number }> {
  const rootDir = options?.rootDir ?? process.cwd();
  const outDir = options?.outDir ?? path.join(rootDir, "dist");

  const catalogSrc = path.join(rootDir, "catalog", "subscription-plans.json");
  const templatesSrc = path.join(
    rootDir,
    "catalog",
    "tokentracker-templates.json"
  );
  const schemaSrc = path.join(
    rootDir,
    "schemas",
    "subscription-plans.schema.json"
  );

  const catalogRaw = await readFile(catalogSrc, "utf8");
  const catalog = JSON.parse(catalogRaw) as SubscriptionCatalogDocument;

  await mkdir(path.join(outDir, "v1"), { recursive: true });
  await mkdir(path.join(outDir, "schemas"), { recursive: true });

  await copyFile(catalogSrc, path.join(outDir, "subscription-plans.json"));
  await copyFile(catalogSrc, path.join(outDir, "v1", "plans.json"));
  await copyFile(
    templatesSrc,
    path.join(outDir, "v1", "tokentracker-templates.json")
  );
  await copyFile(
    schemaSrc,
    path.join(outDir, "schemas", "subscription-plans.schema.json")
  );

  const providersPayload = {
    schema_version: catalog.schema_version,
    generated_at: catalog.generated_at,
    content_hash: catalog.content_hash,
    provider_count: catalog.providers.length,
    providers: catalog.providers,
  };
  await writeFile(
    path.join(outDir, "v1", "providers.json"),
    `${JSON.stringify(providersPayload, null, 2)}\n`,
    "utf8"
  );

  await writeFile(path.join(outDir, ".nojekyll"), "", "utf8");
  await writeFile(
    path.join(outDir, "index.html"),
    renderExplorerHtml(catalog),
    "utf8"
  );

  return { outDir, planCount: catalog.plans.length };
}

const isDirectEntry =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectEntry) {
  buildSite()
    .then((res) => {
      console.log(
        `Static site & API built in ${res.outDir} (${res.planCount} plans).`
      );
    })
    .catch((err) => {
      console.error("Failed to build static site:", err);
      process.exitCode = 1;
    });
}
