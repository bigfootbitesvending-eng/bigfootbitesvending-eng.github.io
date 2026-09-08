# ADR: sales_transactions.transaction_time stores local time under a UTC label

**Status:** Accepted (workaround) — root cause not yet fixed
**Date:** 2026-09-03
**Renumber to fit the existing `/docs/adr-NNN-*.md` sequence before committing.**

## Context

`sales_transactions.transaction_time` is typed `timestamptz`. Three independent write paths populate it:

- **ADM Sales Transactions Backfill One-Shot** — `Build Sales Transactions Rows1` pushes ADM's raw `Trans Date` field straight through as a string.
- **AV Live Sales Transactions Backfill One-Shot** — `Build AV Live Sales Transactions Rows` does the same with AV Live's raw `Trans Date` field.
- **AV Live Daily Restocking Orchestrator** — the live daily path (`Format Sales Rows` → `Build AV Live Sales Transactions Rows` → `Upsert AV Live Sales Transactions to Neon`) parses AV Live's `MM/DD/YYYY h:mm:ss AM/PM` string into a plain `YYYY-MM-DD HH:MM:SS` string, still with no timezone offset attached.

All three cast that timezone-naive string directly to `::timestamptz[]` in a Postgres `UNNEST` insert. None of them apply an explicit timezone conversion anywhere in the pipeline.

Postgres interprets a timezone-naive string being cast to `timestamptz` using the active session's `TimeZone` setting at the moment of the cast. No workflow in this system ever sets that explicitly, so it falls back to the connection default — UTC, for Neon.

Vendor systems report wall-clock **local** (Central) time, not UTC. This is confirmed two ways:

1. **By format** — AV Live's raw export uses a 12-hour `AM/PM` suffix, a convention nobody uses to report UTC.
2. **Empirically** — the raw, unconverted hourly transaction distribution was pulled for all five locations while building the Time of Day report section. Every location's shape matches real-world local-time expectations exactly, with zero shift: Ashley Green (a pool amenity) peaks 2–5pm; Endeavor (an elementary school) is dead overnight and active late morning through evening; Livano (24/7 residential) peaks 6–9pm. None of these shapes would make sense if the raw digits were true UTC.

Because both the write-time session and any later read-time session default to UTC, no actual timezone conversion has ever occurred anywhere in this pipeline. The net effect: the digits stored in `transaction_time` are correct Central wall-clock digits, carrying an incorrect `+00` (UTC) label.

## Decision

Treat `transaction_time` as containing correct Central local-time digits under an incorrect UTC label, until the write paths are fixed at the source.

Any code reading `transaction_time` for hour-of-day, time-of-day, or local-clock-time purposes must recover the original digits with:

```sql
transaction_time AT TIME ZONE 'UTC'
```

**Not** `transaction_time AT TIME ZONE 'America/Chicago'`. The former undoes the mislabeling and returns exactly what was written. The latter would apply an additional, incorrect 5–6 hour shift on top of data that was never actually in UTC to begin with.

This pattern is implemented today in **Generate Time of Day Section** (workflow ID `2KFk81l0kI9BlSVf`), node `Get Transaction Counts by Hour`.

Do not fix this piecemeal per-consumer. If the write paths are ever corrected to convert to true UTC at insert time, every reader of `transaction_time` must change in lockstep — currently just the one — or reports will go wrong in the opposite direction the moment the source data starts being correct.

## Consequences

**Positive:**
- No incorrect data is currently reaching any report. The workaround is a single, well-understood SQL pattern requiring no backfill or schema migration.
- The scope is narrow: `transaction_time` is the only affected field. `date` is derived independently from the date portion of the raw string at write time and is unaffected by this issue. `sales_history` (used for velocity/F-13) stores date-only granularity and never touches this problem at all.

**Negative:**
- This is a workaround, not a fix. The mislabeling remains live in the table.
- Any future direct read of `transaction_time` by someone unaware of this ADR — a new report, a Python migration, an ad hoc query — risks getting local time and UTC confused in either direction. The correctness of every future consumer depends on this document being found and followed, not on anything self-evident in the schema.

## Open question — not yet resolved

Should this be root-caused (fix all three write paths to properly convert vendor local time to true UTC at insert time), or is the one-line workaround sufficient indefinitely given the narrow current scope?

Recommend root-causing before a second consumer of `transaction_time` is built. The workaround's correctness currently depends entirely on institutional memory of this ADR rather than anything enforced by the schema — every additional consumer is another chance for the mislabeling to get silently misapplied in the wrong direction.

If root-caused, required changes in the same pass:
1. Convert vendor timestamps to true UTC at write time in ADM Sales Transactions Backfill One-Shot, AV Live Sales Transactions Backfill One-Shot, and AV Live Daily Restocking Orchestrator.
2. Update Generate Time of Day Section's query from `AT TIME ZONE 'UTC'` to `AT TIME ZONE 'America/Chicago'` in the same change — these two must move together or the fix silently reintroduces the bug in reverse.
3. Historical rows do not need backfilling for this specific issue — their `date` values are correct and unaffected regardless of what happens to `transaction_time`.
