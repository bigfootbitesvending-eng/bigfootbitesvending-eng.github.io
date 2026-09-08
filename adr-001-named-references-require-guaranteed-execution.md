# ADR: Named node references require guaranteed execution, not just guaranteed ordering

**Status:** Accepted
**Date:** 2026-09-08
**Renumber to fit the existing `/docs/adr-NNN-*.md` sequence before committing.**

## Context

An existing principle in this system states that reference-by-name still requires guaranteed execution order, and is not a substitute for wiring. That principle was written against a specific failure: parallel branches with no ordering guarantee, where `$('Node Name')` resolves to a node that has not finished yet.

It does not cover the case that took down HAHA sales ingestion on 2026-09-08.

**HAHA Sales Ingestion** (workflow ID `Sn7IK9uJhiLAw4R6`), node `Return Sales Ingestion Result`, contained:

```javascript
return [{ json: $('Aggregate Run Summary').first().json }];
```

`Aggregate Run Summary` sits downstream of `Loop Over Dates`, a Split In Batches node fed by `Group by Date`. On 2026-09-07 the HAHA sales API returned `total: 0` for Endeavor. `Group by Date` emitted zero items, the loop never iterated, and `Aggregate Run Summary` never executed at all. The reference threw `Node 'Aggregate Run Summary' hasn't been executed`.

The node did not run late. It did not run.

### How the defect was introduced

This matters more than the specific bug.

On 2026-08-29 the same class of problem was diagnosed in **ADM Sales Data Ingestion**: multiple unconverged terminal branches producing a non-deterministic return value. The fix was a Merge node used as a synchronization gate plus a Code node pulling the summary node by name rather than from the merge's blended output. That fix was correct.

The same pattern was then applied to **HAHA Sales Ingestion** in the same session. The node name was swapped from `Build Sales Ingestion Result` to `Aggregate Run Summary`, because that is what the equivalent node is called here.

The name was swapped. The precondition was not re-derived.

In ADM, the referenced node sits on the main path and executes on every run. In HAHA, the referenced node sits behind a loop whose iteration count depends on the data. The pattern's hidden requirement, that the referenced node always executes, was true at the source and false at the destination. Nobody checked, because the pattern had already been validated once.

## Decision

Two rules, one specific and one general.

**Specific.** A named reference requires its target to be guaranteed to execute on every path, not merely guaranteed to execute first. Any node downstream of a loop, an IF branch, a Filter, or a Switch fails this test by construction. Where the target is not guaranteed, the reference must be guarded:

```javascript
const hasSummary = $("Aggregate Run Summary").isExecuted;
```

and an explicit zero-state object supplied on the false path. Confirm `isExecuted` behaves as expected in Code node context before relying on it; the syntax appears in n8n's own error text in expression context.

**General.** A transplanted pattern carries its shape but not its preconditions. When a pattern proven in one workflow is applied to another, the preconditions must be re-derived at the destination and stated. Renaming the nodes is not adaptation.

The precondition set for the merge-and-named-reference pattern specifically:

1. Every branch feeding the Merge executes on every run, or the branches are a mutually exclusive pair sharing one input index.
2. The node named in the downstream Code reference executes on every run.
3. The Merge node's mode is set deliberately. Default append mode does not wait for all inputs.

## Consequences

**Positive:**

- The failure mode is now named and checkable before delivery rather than discovered in production.
- The general rule applies well beyond n8n. It is the reason the same fix can be correct in one workflow and defective in its sibling.
- Guarding the reference converts a zero-data day from a crash into an explicit, named path, which is consistent with how Record Daily Sales (F-12) already handles zero-sales days via a skipped flag.

**Negative:**

- Every named reference now carries a verification obligation. This is real overhead on a system that uses name-based references heavily and by policy.
- The guard adds a branch that will almost never fire, which means it is itself rarely exercised. A zero-state object that is wrong is harder to detect than a crash.

## Related

- Supersedes nothing. Sharpens the existing "reference-by-name still requires guaranteed execution order" principle by distinguishing ordering from existence.
- See the companion ADR on zero-length output as an explicit design decision, which covers why `Group by Date` emitting zero items is a legitimate business event rather than an error.
- See the companion ADR on cross-flow fix propagation, which covers why this failure took out a second location that had nothing to do with it.
