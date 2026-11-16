# GEMINI.md — Antigravity & Windows Collaboration Guide

1. Follow `AGENTS.md` and keep `docs/ARCHITECTURE.md` 100% aligned with the real repository state.
2. On Windows PowerShell (`pwsh`):
   - Run `pnpm install`, `pnpm add`, or `pnpm update` with `BypassSandbox: true`.
   - Run `pnpm run typecheck`, `pnpm test`, `pnpm run validate`, `pnpm run build`, and `pnpm run build:site` inside the standard sandbox (`BypassSandbox: false`).
3. If a commit pushes to GitHub and triggers `.github/workflows/ci.yml` or `.github/workflows/auto-update.yml`, monitor the GitHub Actions run (`gh run list` / `gh run watch`) until completion and fix any failure before concluding.
4. In Markdown documents and replies, avoid placing two unescaped dollar signs in the same prose paragraph (wrap prices in inline code like `` `$20` `` or write `20 USD`).
