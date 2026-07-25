---
name: extract-approach
description: Extracts the reasoning and approach from a non-trivial solved problem into a permanent learnings note in docs/learnings/. Use when a bug fix, architecture decision, or tricky implementation has just been completed and the approach is worth preserving for future sessions.
---

## Overview

After solving a non-trivial problem, the reasoning evaporates when the session ends. This skill captures **how** and **why** the solution works — not the code diff (that's in git), but the judgment calls, dead ends, and mental model that led to the fix. Future sessions read these notes and skip the same discovery process.

Notes live in `docs/learnings/` (version-controlled, readable by any model/engineer/CI) — NOT in the `.claude/` memory system.

---

## When to use

Run this skill **after** completing any of:
- A bug fix that required diagnosis (not a typo fix)
- An architecture or design decision with trade-offs
- A tricky implementation where the obvious approach was wrong
- A production incident investigation
- A performance optimization with non-obvious reasoning
- Integration with an external system where behavior was discovered empirically

## When NOT to use

- Routine CRUD, simple UI tweaks, copy changes
- Problems where the solution is obvious from the error message
- Work that's already documented in a handoff or spec

---

## Procedure

### 1. Identify what's worth keeping

Answer these three questions (mentally — don't write them out):
- **What was the trap?** The obvious-but-wrong approach a future model/engineer would try first.
- **What was the insight?** The non-obvious fact that unlocked the solution.
- **What's the rule?** A checkable heuristic that prevents the trap.

If you can't answer at least the insight question, the problem wasn't non-trivial — skip extraction.

### 2. Write the learnings note

Save to `docs/learnings/{kebab-case-topic}.md`:

```markdown
# {Short title}

**Related files:** `backend/some_file.py`, `frontend/src/components/SomeTab.tsx`

**Problem:** {What went wrong or what needed to be built — one sentence}

**Trap:** {The obvious-but-wrong approach and why it fails}

**Insight:** {The non-obvious fact or constraint that matters}

**Rule:** {Checkable heuristic for next time}

**Verify:** {Command to confirm this note is still valid}
```

Rules for the note:
- **One insight per note.** If the problem yielded two separate insights, write two notes.
- **Name concrete files and functions.** "The auth middleware" is useless in 3 months — `backend/rbac.py:verify_jwt()` survives.
- **State the trap explicitly.** Future models will try the obvious thing first — warn them off it.
- **Related files must exist.** Run `ls` on each path before writing. If a path doesn't exist, the note is already stale at birth.
- **Verify command must be runnable.** A grep, a curl, a test — something that returns pass/fail. "Be careful" is not a verify command.

### 3. Update docs/learnings/README.md index

Add one line under `## Index`:
```
- [{topic}]({filename}.md) — {one-line hook}
```

Do NOT add approach notes to `.claude/.../memory/MEMORY.md` — they have their own index.

### 4. Verify

- File exists at `docs/learnings/{name}.md`
- README.md index entry points to correct filename
- Note contains all five sections: Problem, Trap, Insight, Rule, Verify
- Every path in "Related files" exists (`ls` each one)
- Verify command runs without error

---

## Examples

**Good extraction** (from a real incident in this project):

```markdown
# Route registration silent failure

**Related files:** `backend/activation_routes.py`, `backend/main.py`

**Problem:** 10/14 activation routes returned 404 after a merge, with no errors in logs.

**Trap:** Trusting that code review catches indent issues in Python route registration. The routes *looked* correct in the diff — the indent was off by one level inside `register_activation_routes()`, so they were defined but never registered on the FastAPI app.

**Insight:** FastAPI `include_router` is silent when routes aren't attached. No warning, no error — just 404. Route registration functions that use nested `def` can silently scope routes to a local function if indentation shifts.

**Rule:** After any edit to a `register_*_routes()` function, hit one endpoint from each route group with curl. Count the registered routes: `grep -c "@router\." backend/activation_routes.py` should match the expected total.

**Verify:** `grep -c "@router\." backend/activation_routes.py` — currently expect 17.
```

**Bad extraction** (don't do this):

```
Fixed the bug by changing line 42. The issue was a typo.
```
No trap, no insight, no rule. Not worth a note.

---

## Gotchas

- **Don't duplicate git history.** The note captures reasoning, not the diff. "Changed X to Y" belongs in the commit message. "X fails because of Z, so Y is the only safe option" belongs here.
- **Don't write notes about notes.** If the extraction itself is trivial, the problem was trivial. Skip it.
- **Stale notes mislead.** A note referencing `backend/invoice_routes.py:42` after that file is refactored is worse than no note. The Verify command catches this — run it when reading an old note.

---

## Volatile facts (as of 2026-07-08)

- **Learnings path**: `docs/learnings/` — re-verify: `ls docs/learnings/README.md`
- **Index file**: `docs/learnings/README.md` — no line limit (unlike MEMORY.md's 200-line cap)
- **Related skills**: each module skill (e.g. `sepay-payments-and-qr`, `activation-and-invoicing`) has its own "Gotchas & past incidents" section. If an approach note is tightly scoped to one module, consider adding a cross-reference in that skill's Gotchas section too.

---

## Validation loop

**Tier 1 — after writing the note:**
- File exists at `docs/learnings/{name}.md`
- Body contains all five headers: Problem, Trap, Insight, Rule, Verify
- Every path in "Related files" exists (run `ls` on each)
- README.md index has matching entry

**Tier 2 — quality check (self):**
- Could a model with zero context read just this note and avoid the trap? If not, add more specifics.
- Is the "Rule" actually checkable (a command to run, a condition to verify)? Adjectives ("be careful") are not rules.
- Run the Verify command — does it pass right now?

**Loop budget:** This skill should take under 2 minutes. If you're spending longer, the problem was either too simple (skip) or too complex (split into multiple notes).
