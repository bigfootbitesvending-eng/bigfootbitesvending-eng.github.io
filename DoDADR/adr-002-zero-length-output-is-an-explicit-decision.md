# ADR: Zero-length output is an explicit per-node design decision

**Status:** Accepted
**Date:** 2026-09-08
**Renumber to fit the existing `/docs/adr-NNN-*.md` sequence before committing.**

## Context

On 2026-09-07 the HAHA sales API returned `total: 0` for Endeavor Elementary. That is the correct answer. Endeavor is a school, 2026-09-07 was a Monday, and no sales occurred. Zero was a business event, not a failure.

The system had no handling for it. `Group by Date` emitted zero items, `Loop Over Dates` never iterated, and a downstream named reference threw. A legitimately empty day took out the ingestion run.

This is not isolated. The system currently holds at least three different conventions for zero, none of them stated as a choice:

- **Hard error.** Generate Best Sellers Section treats a zero-sales period as a hard error. This is deliberate and defensible for a report section, where an empty best-sellers list means the report is wrong.
- **Silent drop.** Postgres nodes without `alwaysOutputData` drop zero-row results entirely rather than routing through downstream IF guards. Already documented as a known pitfall.
- **Empty-object item.** `alwaysOutputData` returns one empty-object item on a no-rows result, not zero items. Consumers must filter with `Object.keys(row).length > 0` rather than assuming an empty array means nothing found. Also already documented.

Three conventions, each individually correct, with no rule for choosing between them and no requirement that the choice be visible.

Zero is also the least-exercised input in the system. Every vendor flow is built and tested against days with sales. The empty case arrives months later, on a holiday, unattended, at 5:45 AM.

### Why this recurs

The system has a well-developed concept of an **inactive location**, built for Ashley Green's pool season and Endeavor's summer wind-down. It has no concept of an **active location with a zero-activity day**.

Those are different states and only one of them is modelled. Predictable generators of the unmodelled state include school holidays and breaks at Endeavor, and the event-driven nature of Spry Funeral Home, which can go quiet for days by design.

## Decision

Any node that emits a variable-length array has its zero-length case walked at build time, and the intended behavior is stated explicitly as one of three:

- **Skip.** Zero is normal. Emit an explicit zero-state object and continue. Record Daily Sales (F-12) already does this via a skipped flag.
- **Empty-render.** Zero is normal and must be visible. Generate Time of Day Section already does this by always rendering zero-count bins.
- **Hard error.** Zero indicates something upstream is broken and the run must stop. Generate Best Sellers Section does this.

The choice is recorded, not inferred. "It has never happened" is not a choice.

Nodes that emit variable-length output include every Code node returning a mapped or filtered array, every Split In Batches input, every Postgres read, and every vendor API response parser.

## Consequences

**Positive:**

- Converts the most common untested input into a design question asked at build time.
- The three named behaviors already exist in production, so this documents and routes existing practice rather than inventing a new pattern.
- Makes the distinction between an inactive location and a zero-activity day explicit. These have always been different and have been conflated by omission.

**Negative:**

- Adds a build-time question to a large number of nodes, most of which will resolve to skip.
- Zero-state objects are themselves rarely exercised. A wrong zero-state is quieter than a crash and can propagate a plausible-looking empty result into a report.
- Does not by itself fix the existing nodes. This is a forward-looking rule plus a backlog of audit work on the vendor ingestion flows.

## Open question

Should the zero-activity day be modelled as data rather than handled per node? A calendar of expected-closed days for Endeavor would let the system distinguish "zero sales, school closed, expected" from "zero sales, school open, investigate." The latter is a real signal currently indistinguishable from the former.

Not scoped here. Worth deciding before the next school break generates several consecutive empty days.
