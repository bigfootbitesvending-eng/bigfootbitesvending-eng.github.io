# ADR: A resilience fix in one vendor flow is a defect report against the others

**Status:** Accepted
**Date:** 2026-09-08
**Renumber to fit the existing `/docs/adr-NNN-*.md` sequence before committing.**

## Context

On 2026-08-29, **AV Live Daily Restocking Orchestrator** received per-machine error containment on its `Upsert Pick List to Neon` node, with a failure alert, specifically so that one location's failure could not abort the loop over the remaining machines.

On 2026-09-08, **HAHA Sales Ingestion Orchestrator** failed in exactly the way that fix was built to prevent.

The orchestrator loops over two locations. `Call HAHA Sales Ingestion` runs in `each` mode with no error output wired. It failed on item 0 (Endeavor) and never advanced to item 1. Spry's sales ingestion for 2026-09-07 was never attempted, for reasons that had nothing to do with Spry.

Ten days between the fix and the identical outage in the sibling flow.

The three vendor flows are structural siblings by design. ADM, AV Live, and HAHA all loop over locations, all normalize into one schema, and all call the same shared sub-workflows (Normalize UPC, Record Daily Sales, Calculate Velocity for Machine). A loop-shape defect in one is almost always present in the other two.

The backlog already tracks instances of this. H-14 and H-13 are both phrased as matching the AV Live pattern. Tracking them individually, as discovered, is what allows the gap to persist between discovery and propagation. Each is filed as its own low-priority item rather than as evidence of a systemic asymmetry.

## Decision

A resilience or containment fix applied to one vendor flow is treated as a defect report against the other two until each has been checked and the result recorded.

Checked and recorded, not necessarily fixed. A deliberate decision that the sibling does not need it is a valid outcome and closes the item. Silence does not.

"Resilience or containment fix" means specifically: error output wiring, continue-on-fail settings, loop isolation, retry behavior, `alwaysOutputData`, timeout handling, and per-item error routing. It does not mean feature work, which is legitimately vendor-specific.

The check is cheap. The three orchestrators can be read in a small number of MCP calls, and the relevant node settings are visible in `get_workflow_details` output.

## Consequences

**Positive:**

- Converts a recurring ten-day gap into a same-session check.
- Directly implements the Circuit Model's parallel-versus-series principle at the workflow level rather than within a single flow. A per-location loop with no error containment is a series circuit across locations.
- Produces a written record of deliberate divergence, which is more useful than an undifferentiated backlog of "match the AV Live pattern" items.

**Negative:**

- Adds a step to every fix in a vendor flow, including fixes where the siblings are genuinely unaffected.
- Risks a false sense of coverage. Confirming that a setting matches is not the same as confirming the sibling's failure modes are equivalent, since the vendor APIs differ substantially in shape and failure behavior.
- The three flows are siblings but not identical. HAHA paginates, AV Live parses email attachments, ADM parses XLS. Some containment patterns will not transfer.

## Immediate application

The specific fix this ADR was written from is not yet applied. `Call HAHA Sales Ingestion` in HAHA Sales Ingestion Orchestrator needs error output handling so that one location's failure does not block its sibling. ADM Daily Restock Orchestrator needs the same check.
