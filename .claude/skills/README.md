# PalFish GMV — Skill Library

Knowledge-transfer library: everything a mid-level engineer or a Sonnet-class model with **zero project context** needs to maintain and extend this app. Built 2026-07-04 via a discovery → author → 3-lens review (accuracy / consistency / usability) → fix → verify pipeline; every command and path was verified against the repo at build time.

Claude Code auto-loads a skill when its `description` triggers match the task. Humans: read the skill for your area before touching it.

## Inventory

| Skill | Covers |
|---|---|
| [deploying-gmv](deploying-gmv/SKILL.md) | Deploy BE (Render, manual hook) + FE (Vercel, branch push), `tsc -b` gate, sandbox→prod promotion checklist |
| [environments-and-secrets](environments-and-secrets/SKILL.md) | Prod/sandbox tiers, 2 Supabase + 2 Vercel + 2 Render, full env-var catalog, render.yaml coverage gap, key rotation |
| [database-and-migrations](database-and-migrations/SKILL.md) | Migration locations + authoritative order, sandbox-first + full-replay rule, table inventory, seed scripts, backup convention |
| [backend-conventions](backend-conventions/SKILL.md) | FastAPI startup, `register_*_routes` pattern + route-count verification (2026-06-19 incident), Supabase client, workers |
| [rbac-and-auth-accounts](rbac-and-auth-accounts/SKILL.md) | 4-level RBAC, sub-team scoping, `is_activated` gate, admin activation runbook, permissions matrix |
| [sepay-payments-and-qr](sepay-payments-and-qr/SKILL.md) | SePay webhook, VietQR self-gen (40-char limit), transfer-content matching, no-match diagnostic, pf-revenue cross-repo warning |
| [mpos-payoo-reconciliation](mpos-payoo-reconciliation/SKILL.md) | Chrome extension crawl (sequential, cookie-auth), mPOS export, matching flow, Payoo coverage limits |
| [zalo-oa-notifications](zalo-oa-notifications/SKILL.md) | Token lifecycle (mint revokes ALL — one OA shared prod+sandbox), outbox + 🧪 [TEST] rule, archive cron |
| [dingtalk-notifications](dingtalk-notifications/SKILL.md) | Per-team robot credentials, HMAC-signed webhooks, outbox CHECK constraint, differences vs Zalo |
| [so-doanh-thu-revenue](so-doanh-thu-revenue/SKILL.md) | Sổ doanh thu imports, dedup safety (101-row incident), DingTalk locale bug, exchange-rate hard-codes, 50k analytics cap, NON_VN_TEAMS filter |
| [crm-sync](crm-sync/SKILL.md) | Hybrid/autonomous sync, Fernet token encryption, team_hierarchy.json (static Metabase export, baked into Docker image) |
| [dashboards-and-reports](dashboards-and-reports/SKILL.md) | Gamification/BXH, Module 6, BC01–BC03, sub-team scope enforcement, lead-ranking rule |
| [activation-and-invoicing](activation-and-invoicing/SKILL.md) | B3/B4 lifecycle, address-required rule (FE-only), notifications-table trap, legacy M3/M4 boundary |
| [frontend-conventions](frontend-conventions/SKILL.md) | ViewId/tab wiring, api.ts idiom, design tokens, terminology rule (PR — never "phiếu thu"), orphaned components |
| [testing-gmv](testing-gmv/SKILL.md) | Vitest + MSW, Playwright E2E (auto-create `.env.e2e`), coverage vs non-coverage map, backend pytest |
| [change-control-and-handoffs](change-control-and-handoffs/SKILL.md) | Spec workflow (anh Hiếu → SPEC_TEMPLATE), handoff rules (grep schema first), 3 solution criteria, git conventions, pf-revenue contract |
| [extract-approach](extract-approach/SKILL.md) | Auto-extract reasoning from solved problems into permanent learnings notes (Problem/Trap/Insight/Rule format) |

## Maintenance rules

- Every skill has a **Volatile facts** section: each fact is date-stamped and carries a re-verification command. If a re-check fails, update the skill in the same PR as the change that broke it.
- New incident or unwritten rule → add to the matching skill's **Gotchas & past incidents** with a date. New subsystem → new skill directory, then add a row here.
- Frontmatter contract: `name` equals the directory name; `description` is one line, third person, and contains "Use when …".
- Never put secret values in a skill — env var names only.
- Every skill ends with a **Validation loop** section: tiered gates (cheap-first), a 2-fail stop budget, and output hygiene rules. Follow it after any change in that skill's domain.
