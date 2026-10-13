---
name: database-migrations
description: Write schema changes that apply safely on live data, with a rollback path. Use when altering tables or indexes, adding or dropping columns, backfilling data, or reviewing a migration before it ships.
license: MIT
---

# Database migrations

A migration runs against a database somebody depends on. Treat every one as production surgery:
prepared, reversible where possible, and deployable without downtime.

## The expand/contract pattern

Never combine a breaking schema change with the code change that depends on it in one deploy.
Split it across releases:

1. **Expand** — add the new column/table/index, nullable or with a default. Old code still works.
2. **Migrate** — backfill existing rows, in batches, while both versions of the code run.
3. **Switch** — deploy code that writes both / reads the new. Verify.
4. **Contract** — drop the old column, remove the double-write, in a later release.

## Adding a column

- **Nullable, or with a non-volatile default.** A `NOT NULL` with no default fails on a populated
  table, and a volatile default rewrites every row.
- On large tables, adding a column with a default may still rewrite the table depending on engine
  and version — check before running it on millions of rows.
- Add the constraint **after** the backfill (`NOT NULL`, foreign keys), validated against real data.

## Backfilling

- **Batch it.** `UPDATE ... LIMIT 10000` in a loop with a short pause, not one statement over
  millions of rows, which locks and bloats.
- **Idempotent.** A backfill that is re-run must not corrupt data. Key it on a predicate that
  becomes false once done.
- **Throttle** and watch replication lag; a backfill that saturates the primary is an outage.
- **Resumable.** If it dies halfway, restarting must continue rather than start over.

## Indexes

- Build **concurrently** where the engine supports it (`CREATE INDEX CONCURRENTLY`) so writes are
  not blocked.
- A failed concurrent index build leaves an **invalid index** behind — detect and drop it before
  retrying.
- Add indexes for real queries, evidenced by an `EXPLAIN` plan, not preemptively.

## Destructive changes

- **Dropping a column or table is irreversible.** Take a backup or a logical snapshot first, and
  only after the contract phase proves nothing reads it.
- **Renaming is a breaking change** — treat it as add + backfill + drop, never an in-place rename
  while old code is live.
- **Changing a type** requires a rewrite; on a large table that is a maintenance window or a
  shadow-column migration.

## Rollback

- Write the **down migration**, and test it — on a copy, before you need it.
- Know which migrations are **not** reversible (a dropped column's data). Say so explicitly in the
  migration and in the PR.
- Prefer **roll forward** with a new migration over rolling back when the change is already
  applied and the data has moved on.

## Before you ship — checklist

- [ ] Tested against a **production-sized** dataset, not an empty dev database.
- [ ] Locks and their duration understood; no long `ACCESS EXCLUSIVE` on a hot table.
- [ ] Idempotent and resumable if it also moves data.
- [ ] Backfill batched and throttled.
- [ ] Down migration written and tested, or its absence is stated.
- [ ] Deploy order relative to the code change is explicit in the PR.
