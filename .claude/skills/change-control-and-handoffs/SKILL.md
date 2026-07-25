---
name: change-control-and-handoffs
description: Covers the full change-control and collaboration doctrine for PalFish GMV: spec workflow, handoff-doc format, team ownership, solution evaluation criteria, git conventions, task-wave naming, and cross-repo contract with pf-revenue. Use when writing or reviewing a handoff doc, evaluating a proposed solution, naming commits, creating a spec from a prototype, or making schema changes that could affect the shared Supabase database.
---

## Overview

PalFish GMV is a two-repo internal sales-ops app. Work originates from anh Hiếu (business stakeholder / designer), flows through a structured spec step, then into handoff documents that assign concrete tasks to individual engineers. This skill documents every rule that governs that flow.

**Jargon used throughout this doc:**
- **anh Hiếu** — product owner; sends HTML prototypes; his decisions are binding (chốt = locked/final).
- **Minh** — lead engineer / orchestrator; owns FE, QA, deploy, UI/UX; reviews and merges.
- **Đức** — BE: DB audit, RPC, dashboard gamification, exchange rates.
- **Giang** — BE: SePay webhook, CRM sync, Zalo BE, encrypt, sandbox-to-main merges.
- **Đạt** — BE: Auth/RBAC, permission endpoints, installment validation.
- **TOP1 / TOP2 / TOP3** — sprint task waves from the 25/06 and 27/06 feedback meetings.
- **VAC-XX** — post-sprint bug/cleanup tasks (VAC-03..VAC-09); verified via `scripts/verify_vac.sh`.
- **chốt** — a decision by anh Hiếu or Minh that is final and must not be relitigated.

---

## When to use / When NOT to use

**Use this skill when:**
- Writing a new handoff document.
- Reviewing a proposed technical solution for completeness or risk.
- Choosing a commit message format or deciding whether to squash commits.
- Starting from an anh Hiếu prototype and needing to produce a spec.
- Making a schema change to any table shared with the pf-revenue repo (e.g., `bank_transactions`).
- Communicating decisions or status to non-technical stakeholders.
- Naming a new task wave or understanding how TOP1/TOP2/TOP3/VAC-XX numbering works.

**Do NOT use this skill for:**
- Day-to-day code style (see `frontend-conventions` or `backend-conventions` skills).
- Deploy runbook (see `deploying-gmv` skill).
- Database migration procedure (see `database-and-migrations` skill).

---

## Ground truth

### Key files (repo-relative paths, all verified)

| Path | Role |
|------|------|
| `docs/SPEC_TEMPLATE.md` | Canonical spec structure: colors, typography, layout, DB mapping, state transitions, RBAC rules, error states, acceptance criteria |
| `docs/HUONG_DAN_XUAT_SPEC.md` | Two prompts anh Hiếu pastes into Claude Design to generate specs: Prompt A (has prototype HTML) and Prompt B (idea only) |
| `docs/PROJECT.md` | Master architecture, schema, module status, env var reference — single source of truth for new engineers |
| `docs/HANDOFF_TOP2-4_BILL_SOFTLOCK.md` | Representative task handoff: Origin/Decision/Scope/Anti-patterns/Acceptance-criteria/Test-plan structure |
| `docs/HANDOFF_TOP1-1_MERGE_MPOS_PAYOO_TAB.md` | FE-only handoff with "Bối cảnh (ĐÃ verify)" section and exact line refs |
| `docs/HANDOFF_TEAM_01.07-03.07.md` | Team handoff assigning VAC-05/08/09 (Đức), VAC-04 (Giang), VAC-03/06 (Đạt); shows per-engineer format |
| `docs/DEPLOY.md` | Render + Vercel + Supabase deploy runbook |
| `scripts/deploy.sh` | Trigger Render deploy; reads hook URLs from gitignored `scripts/deploy-hooks.local` |
| `scripts/verify_vac.sh` | Verify VAC-XX fixes: `bash scripts/verify_vac.sh [VAC-XX]` |

### Key DB tables (cross-repo contract)

- `bank_transactions` — written by this repo's SePay webhook; read by pf-revenue for Lark sync. Schema changes here can silently break pf-revenue.

### Env var NAMES (never values)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `FRONTEND_URL`, `RENDER_DEPLOY_HOOK_SANDBOX`, `RENDER_DEPLOY_HOOK_PROD`

---

## Procedures

### 1. Spec workflow (prototype → spec → team)

```
Step 1: Anh Hiếu runs a design meeting → produces HTML prototype in Claude Design
Step 2: Anh Hiếu opens docs/HUONG_DAN_XUAT_SPEC.md, picks the right prompt:
        - Prompt A: already have prototype HTML
        - Prompt B: idea / requirement only, no prototype yet
Step 3: Paste prompt into Claude Design → receive spec document
Step 4: Save spec alongside the HTML prototype file
Step 5: Send both files (HTML + spec) to the dev team
```

When AI generates or reviews a spec, validate it against `docs/SPEC_TEMPLATE.md`. Required spec sections: Mục đích, Design Spec (màu sắc / typography / layout), DB mapping, State transitions, RBAC rules, Error states, Acceptance criteria.

### 2. Handoff document format

A handoff document assigns one or more engineers to implement a chốt decision. Use this structure (modeled on `docs/HANDOFF_TOP2-4_BILL_SOFTLOCK.md`):

```markdown
# HANDOFF — [TASK-ID]: [Short title]

**Origin:** [Meeting/date + exact quote from anh Hiếu]

**Quyết định đã chốt ([name] [date]):** [Decision in one paragraph]

**Estimated effort:** [Xh]. [FE/BE/both]. [Migration needed? Yes/No]

---

## Bối cảnh (ĐÃ verify)
[File paths with grep-verified line numbers. Label this section "(ĐÃ verify)" ONLY when
you have actually confirmed every line number against the current source.]

## Scope
### IN scope
[Numbered list]
### OUT of scope (KHÔNG làm)
[Explicit list of tempting-but-wrong moves]

## [Section per file]
[Diffs or code snippets to add/change]

## Acceptance criteria
[Numbered list, last item always: `cd frontend && npx tsc -b` PASS; `npm run test` PASS]

## Test plan
[bash commands + manual sandbox steps]

## Anti-patterns (đừng làm)
[Numbered list starting with most likely wrong moves]
```

### 3. HARD RULE: grep before writing any handoff

Before writing table names, column names, or line numbers in any handoff:

```bash
# Verify a table name exists in the codebase
grep -rn "table_name_here" backend/ --include="*.py" | head -5

# Verify a column name
grep -rn "column_name_here" backend/ --include="*.py" | head -5

# Verify a line range in a specific file
grep -n "function_or_symbol" frontend/src/components/SomeTab.tsx | head -10
```

Never guess column or table names from convention. A handoff written from guesses caused a team incident in 2026-06. The "Bối cảnh (ĐÃ verify)" label is a quality signal — only add it when line numbers have been manually confirmed.

### 4. Evaluating any proposed solution (3 criteria)

Every proposed change must be evaluated against all three criteria before it is accepted:

1. **Triệt để** — addresses the root cause, not just the symptom.
2. **Không lỗi con** — does not introduce secondary bugs (check edge cases, RBAC paths, other callers of the changed function).
3. **Không tăng gánh nặng hạ tầng / không giảm hiệu năng** — no new infra burden or performance regression. (Render Starter has 512MB RAM; watch for heap accumulation in export endpoints and concurrency in CRM backfill.)

If a solution fails any criterion, document why in the handoff's Anti-patterns section and propose an alternative.

### 5. Git conventions

```
feat(scope): description     # new feature
fix(scope): description      # bug fix
docs(scope): description     # documentation
refactor(scope): description # refactor without behavior change
test(scope): description     # tests only
```

Verified from recent commits: `fix(ext): ...`, `feat(zalo): ...`, `feat(dingtalk-fe): ...`

**Squash related commits into one** before merging a feature branch. Multiple micro-commits for one logical change clutter history and make bisect harder. Exception: merge commits (e.g., `Merge sandbox → main: [description]`) are kept as-is.

### 6. Task-wave naming

| Wave | Sprint origin | Coverage |
|------|--------------|----------|
| B1–B4 | Early sprints | Payment Request module tabs (B1=PR, B2=Đối soát, B3=Kích hoạt, B4=Xuất hóa đơn) |
| M5, M6 | Early sprints | M5=Sổ doanh thu + CRM sync; M6=Dashboard Sale |
| TOP1 | Feedback 25/06 + 27/06 | 1.1=Gộp mPOS/Payoo, 1.2=Permissions, 1.3=Match improvements |
| TOP2 | Feedback 25/06 + 27/06 | 2.1=Card installment net, 2.2=Zalo sale+team, 2.3=Installment form, 2.4=Bill softlock, 2.5=CK drawer info |
| TOP3 | Feedback 25/06 + 27/06 | Zalo activation reminder |
| VAC-XX | Audit 2026-06-30 | Post-sprint bugs; verified via `scripts/verify_vac.sh`; see `docs/HANDOFF_TEAM_01.07-03.07.md` |

When creating new tasks: continue the wave prefix in sequence. Never reuse a completed wave number for a new task.

### 7. Cross-repo contract: pf-revenue

The pf-revenue repo is a separate app sharing the same Supabase prod DB (`jozcvbbypwvzaefteoxn`).

- pf-revenue pulls `bank_transactions` and pushes to Lark Base "GD SePay" on a 1–5 minute sliding window.
- **Any schema change to `bank_transactions` in this repo must include a cross-repo impact check** — grep the pf-revenue repo for references to the columns you are changing.
- All Lark Base integration code lives exclusively in pf-revenue. Do not add Lark calls to this repo.

```bash
# Before modifying bank_transactions — verify columns referenced
grep -rn "bank_transactions" backend/ --include="*.py"
# Then check pf-revenue manually (separate repo) for the same column names
```

### 8. Stakeholder communication rule

When explaining a change, a problem, or a decision to anh Hiếu or kế toán (accountants): use business/operational language. Never use code terms (no "null pointer", "HTTP 400", "column", "migration"). Examples:

- Wrong: "The BE returns a 400 because the `bill_images` column is null."
- Right: "Kế toán không thể xác nhận vì sale chưa upload ảnh bill cho lần quẹt thẻ này."

---

## Gotchas & past incidents

- **(2026-06) Handoff convention-guess incident** — A handoff was written with table/column names guessed from naming conventions rather than grepped from the codebase. The names were wrong, causing wasted implementation work. Fix: always grep actual names before writing. Rule enshrined in the "Bối cảnh (ĐÃ verify)" section label.

- **(2026-06-19) activation_routes.py indent bug** — A mis-indent caused 10 of 14 activation routes (at that point in time) to not be registered; silent 404s on routes that appeared to exist in code. Fixed in commit `462557e`. Current total is 17 routes (see `backend-conventions` skill for authoritative count). Lesson: after any large edit to a routes file, smoke-test a representative endpoint from each group.

- **(2026-06-23) Sandbox missing TOP1-02 migration** — When the sandbox DB was reset, the full migration history was not replayed and a migration was missed. Lesson: when resetting sandbox, replay the full migration sequence in order, not just the most recent ones.

- **(2026-06-30 OOM x6) Export StreamingResponse OOM** — Three export endpoints built full payloads in `io.BytesIO()` then wrapped in `StreamingResponse`. Python heap held the full payload before the first byte was sent. Combined with concurrent requests, this caused 6 OOM crashes on Render Starter 512MB. Fix (VAC-09): use `tempfile.NamedTemporaryFile` + `FileResponse` + `BackgroundTask` cleanup instead.

- **(2026-06-30 OOM x6) CRM backfill concurrency** — `BACKFILL_CONCURRENCY_MAX = 8` caused peak 40 DataFrames in RAM simultaneously. Fix (VAC-08): reduced to 3.

- **(Line number drift)** — Handoff docs reference exact line numbers. These drift as code changes. Always re-grep the file before following a handoff if significant time has passed since it was written.

---

## Volatile facts (as of 2026-07-04)

- **Team ownership** (`docs/PROJECT.md` line ~30): "Minh — Frontend, QA, Deploy, UI/UX. Giang — SePay, CRM sync, Zalo BE. Đức — DB audit, RPC, dashboard. Đạt — Auth/RBAC." Re-verify: `grep -n "Phân công" docs/PROJECT.md`

- **Open VAC tasks**: VAC-05 (exchange rate fallback 3700) was open as of 2026-07-04. Re-verify: `grep -rn "3700" backend/revenue_routes.py backend/dashboard_routes.py`

- **Sandbox URL**: https://palfish-gmv-manager-sandbox.vercel.app/ (test.user@dev = Sale; test.admin@dev = admin). Re-verify by checking Vercel dashboard or `.claude/settings.json`.

- **Supabase prod project ID**: `jozcvbbypwvzaefteoxn`. Re-verify: `grep -rn "jozcvbbypwvzaefteoxn" docs/PROJECT.md`

- **Task wave list** grows each sprint. Always check `docs/HANDOFF_TEAM_*.md` and `docs/HANDOFF_TOP*.md` for the latest task IDs before naming new work.

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (before writing any handoff or proposing any solution):**
```bash
# Schema grep: verify table/column names are real before writing them
grep -rn "table_name_here" backend/ --include="*.py" | head -5
grep -rn "column_name_here" backend/ --include="*.py" | head -5

# Line-number verification: confirm exact location before citing in handoff
grep -n "function_or_symbol" frontend/src/components/SomeTab.tsx | head -10
```
Label the handoff section "(ĐÃ verify)" ONLY after running these checks and confirming results.

**Tier 2 — when a proposed solution touches code (not doc-only):**
```bash
# 3-criteria self-check before finalising the approach:
# 1. Triệt để — does it fix the root cause?
# 2. Không lỗi con — run the relevant targeted test to confirm no secondary breakage
python -m pytest backend/tests/test_relevant_file.py -v   # from repo root
# 3. Không tăng gánh nặng — confirm no new heap/concurrency risk (re-read Gotchas OOM items)

# For cross-repo changes touching bank_transactions:
grep -rn "bank_transactions" backend/ --include="*.py"
```

**Tier 3 — before finalising a handoff for team distribution:**
```bash
bash scripts/verify_vac.sh           # verify any VAC-XX items referenced
cd frontend && npx tsc -b            # confirm Acceptance criteria tsc gate is feasible
```
The last acceptance criterion in every handoff must be: `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

**Loop budget:** if the same schema grep or verify step returns nothing (or the wrong result) twice in a row, STOP. Report the raw grep output to the user and wait for confirmation before proceeding with the handoff.

**Output hygiene:** show only the relevant `grep` hits (use `| head -5`), not the full file listing.
