# ADR: Shared UPC Normalization Skill

**Status:** Accepted
**Date:** 2026-08-25
**Supersedes:** ad hoc per-node UPC padding logic in ADM Daily Restock Orchestrator, AV Live Daily Restocking Orchestrator, and HAHA Inventory Levels

## Context

UPC normalization — deciding whether a raw UPC needs zero-padding, and to what length — was independently reimplemented in at least four places across the system, and the implementations had quietly diverged:

- **ADM Daily Restock Orchestrator**, in `Prepare Pick List Rows`, padded any UPC under 12 digits straight to 12 with leading zeros. This is correct for a UPC-A that lost leading zeros (the original T-5 case), but wrong for a genuine 8-digit UPC-E code — naive zero-padding is not the same as real UPC-E-to-UPC-A conversion (that's what F-7's `upc.js` actually does). This produced a live data bug: four products (Dr. Pepper, Hershey's Milk Chocolate Bar, Kit Kat, Reese's Peanut Butter Cup) had `pick_list.upc` values that never matched `basement_inventory.upc`, causing four silent decrement failures on a real Livano finalize run — picks succeeded, shopping list sent, but basement stock was never debited.
- **HAHA Inventory Levels** had its own `padUpc()` function, pasted independently into four separate nodes in the same workflow (`Normalize Par UPCs`, `Normalize Pick Category UPCs`, `Normalize Product Mapping UPCs`, and inline in `Flatten and Enrich`). This version had a narrower contract than the others — no handling for 10-digit codes, no signal for unrecognized lengths — but was incidentally protected from D-1's specific failure mode by an existing catalog-validation check.
- **AV Live Daily Restocking Orchestrator** had no normalization step at all — it trusted whatever was already stored in `basement_inventory` verbatim. This happened not to produce a live bug (both sides of its own join read the same untouched value), but offered no protection against a malformed UPC entering the catalog by some other path.

No single implementation was the canonical source of truth, and each had made its own independent judgment call about edge cases.

## Decision

Extract UPC normalization into one shared n8n sub-workflow, **Normalize UPC**, and call it from every write boundary that produces or consumes a UPC destined for `pick_list` or a cross-table join. It is batch-shaped (accepts an array of raw UPCs, returns normalized values plus an explicit `unrecognized` list) to preserve the fixed-cost-per-run resistance principle already standard elsewhere in this system, rather than reintroducing per-item network calls.

The normalization contract:

| Input length | Action |
|---|---|
| 7 | pad to 8 |
| 8 | unchanged (valid UPC-E) |
| 10, 11 | pad to 12 |
| 12 | unchanged (valid UPC-A) |
| 13 | unchanged (EAN-13) |
| anything else | passed through unchanged, flagged as `unrecognized` |

A second sub-workflow, **Send Unrecognized UPC Alert**, is a deliberately separate component rather than folded into the normalization logic. This preserves the skill-layer boundary already established in this system: a skill calculates, it does not decide when to notify a human. Normalize UPC returns data; the alert sub-workflow is a distinct, reusable piece that any caller can wire in independently.

Both were wired into the three scheduled vendor orchestrators — ADM Daily Restock Orchestrator, AV Live Daily Restocking Orchestrator, and HAHA Inventory Levels (all four of its duplicate call sites) — replacing their independent implementations entirely. Interactive endpoints (`Get Product`, `Add Alias`) were deliberately left calling neither Normalize UPC's alerting path nor any new alert logic: a human operator is on the other end of both, and a visibly wrong lookup result is sufficient signal without adding email noise on every interactive call.

## Consequences

**Positive:**
- One normalization contract, one place to fix it, system-wide.
- Unrecognized-length UPCs now produce an actual signal (email alert) for the first time, on all three scheduled orchestrators. Previously this failure mode was silent everywhere.
- HAHA Inventory Levels' four duplicate implementations collapsed to one; confirmed via full-file search that zero references to the old `padUpc()` function remain.
- Rewiring exposed a second, unrelated bug class in two of the three orchestrators: nodes downstream of the newly-inserted sub-workflow calls were using positional references (`$json`, `$input`) that silently broke once a node with more than one logical predecessor sat between them and their real data source. Both instances (ADM Daily Restock Orchestrator, caught after initial publish; AV Live Daily Restocking Orchestrator, caught before publish) were fixed by switching to name-based references, consistent with the project's existing documented principle on this exact failure mode.

**Trade-offs / accepted gaps:**
- Adds two additional sub-workflow calls per orchestrator run. Still fixed-cost per run, not per item, so this does not reintroduce the resistance problem the in-memory-join pattern was built to avoid.
- Interactive endpoints (`Get Product`, `Add Alias`) do not alert on unrecognized-length UPCs; they pass through unchanged. This is a deliberate, not accidental, scope decision — confirmed low-risk by a full audit of `basement_inventory` (781 rows, Aug 2026), where zero rows fell outside the six recognized lengths.

**Related discovery, not part of this decision but surfaced by it:**
`upc_aliases.canonical_upc` carries a foreign key constraint against `basement_inventory`, already present in the schema before this session. It is functioning correctly — confirmed during UPC Aliases CRUD testing, where an attempt to create an alias pointing at a nonexistent canonical UPC was correctly rejected at the database level. This is the "validate vendor-supplied UPCs against Basement Inventory before treating them as canonical" principle already documented elsewhere in this system, enforced automatically rather than by convention.

## Migration trigger

None pending. This is the terminal state for UPC normalization in n8n. If normalization logic is ever migrated to the Python skill layer (per the standing n8n-owns-orchestration/Python-owns-logic split), Normalize UPC is the single, already-consolidated candidate to move — not a fresh extraction from three divergent sources.
