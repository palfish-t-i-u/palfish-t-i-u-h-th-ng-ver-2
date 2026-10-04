# Payoo funded_date auto-fill: multi-txn lump limitation + BC04 dedup

**Related files:** `backend/sepay_routes.py`, `backend/report_routes.py`, `backend/activation_routes.py`

**Problem:** Payoo gateway_transactions had funded_date=NULL (no portal source — see `2026-09-15-payoo-no-funded-date-source.md`), hiding card orders from B3 "tiền về" filter and BC04 double-counting bank settlement rows alongside per-order gateway rows.

**Trap:** Auto-filling funded_date by matching bank_amount to gateway net_amount seems complete but only handles 1-to-1 cases. Payoo settlements can be multi-txn lumps — one bank row (e.g. 26,330,700) covers 2–5 gateway_transactions whose net_amounts sum to the bank amount. Matching by amount alone either misses these (no single gateway matches) or, worse, assigns the wrong settlement to an unrelated txn that happens to share the amount. Backfill revealed 5/17 txns required lump analysis with date-proximity to disambiguate. The auto-fill webhook handler (`_try_fill_payoo_funded_date`) intentionally skips ambiguous matches (>1 gateway row with same net_amount) — it does NOT attempt lump matching.

**Insight:** Two mechanisms needed together: (1) `_try_fill_payoo_funded_date` in `sepay_routes.py` fills funded_date + sets `settlement_code=PAYOO-{sepay_id}` for 1-to-1 matches only; (2) `_load_bc04_bank_rows` in `report_routes.py` skips Payoo bank settlement rows when `PAYOO-{sepay_id}` exists in known_settlement_codes — this prevents double-counting in BC04 (Payoo has no "PC" like mPOS, so the existing PC-based dedup doesn't apply). Unfilled lumps still appear in BC04 as bank rows (correct — they represent real unreconciled money).

**Rule:** When a new payment gateway batches settlements, check: does 1 bank row always = 1 gateway txn? If not, auto-fill only safe for unique-amount 1-to-1. Log lumps for manual backfill. And: gateway dedup in BC04 needs a settlement_code convention (`{GATEWAY}-{sepay_id}`) since each gateway's bank content has different identifiers.

**Verify:** `grep -c "PAYOO-" backend/sepay_routes.py backend/report_routes.py` — expect ≥1 hit in each file.
