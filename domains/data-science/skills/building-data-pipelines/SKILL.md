---
name: building-data-pipelines
description: Build batch and streaming data pipelines that are idempotent, observable and safe to re-run — orchestration, incremental loads, backfills and data quality gates. Use when moving data between systems, scheduling a recurring job, or diagnosing a pipeline that produced wrong or duplicated data.
license: MIT
---

# Data pipelines

A pipeline runs unattended, on data you did not see, for years. Design for the day it fails, not
for the day it works.

## The three properties that matter

1. **Idempotent** — running it twice produces the same result as running it once. Without this,
   every retry corrupts the data. This is the non-negotiable one.
2. **Incremental** — processes only what changed, not the whole history each time.
3. **Observable** — you can tell whether it succeeded, and what it did.

## Idempotency

Make the write a **replace of a defined partition**, never an unconditional append:

- **Delete-then-insert** for the affected window, or `MERGE`/upsert on a stable key.
- **Write to a temp location, then atomically swap** — never leave a half-written table visible.
- Key every event on a **deterministic id** (`order_id`, or a hash of the natural key + timestamp)
  so a replayed record overwrites rather than duplicates.
- Never rely on "it will only run once". It will be re-run, by an operator at 3 am.

## Incremental loads

- **High-water mark**: store the last processed timestamp/id, and process from there. Handle the
  boundary with `>=` and an idempotent write, because timestamps tie.
- Prefer an **immutable, monotonically increasing cursor** (a sequence, or a CDC log position) over
  wall-clock time — clocks skew and data arrives late.
- **Late-arriving data** breaks naive watermarks: a record with yesterday's timestamp arriving today
  is skipped forever. Either reprocess a trailing window (e.g. the last 3 days each run) or handle
  it explicitly.
- **Change data capture** is the robust option when the source supports it: no polling, no missed
  deletes (a plain timestamp filter cannot see a `DELETE`).

## Orchestration — pick by what you already run

| Situation | Reach for |
| --- | --- |
| Python-native, DAG as code, modern | **Dagster** or **Prefect** |
| Already on Airflow, or need its ecosystem | **Airflow** |
| Kubernetes-native, ML-heavy | **Kubeflow**, Argo |
| A cron job and three steps | **cron + a script** — do not adopt a framework for this |

A DAG framework bought for a three-step job is pure overhead. Match the tool to the job's real
complexity.

## Scheduling and backfills

- Jobs must be **partitioned by a logical date**, not by "now". A job that reads `now()` cannot be
  backfilled.
- **Backfill** must be a first-class operation: re-run a date range with the same code and get the
  same results.
- Set **retries with backoff** for transient failures, and a **timeout** so a hang cannot block the
  schedule forever.
- Make steps **independently re-runnable** so recovering from a mid-DAG failure does not mean
  redoing the whole run.

## Data quality gates

Check between stages and **fail the pipeline** rather than publishing bad data:

- **Schema** — columns and types match the contract.
- **Volume** — row count within an expected band of the previous run. A 90% drop is a broken source,
  not a quiet day.
- **Freshness** — the newest record is recent enough.
- **Uniqueness** — the key is unique.
- **Ranges** — values within bounds; null rate not spiking.

Use Great Expectations, Soda, dbt tests, or plain assertions. Emit the result as a metric so the
check is visible on a dashboard, not just in a log.

## Observability

- Log **rows in, rows out, duration** per step. Most silent pipeline bugs are visible in those three
  numbers.
- Alert on **staleness and failure**, not only on exceptions — a pipeline that succeeds but writes
  nothing is a failure.
- Record the **run lineage**: which data, which code version, which run produced this table.

## Storage layout

- **Partition** by the column you filter on (usually date). Without partitioning, every query scans
  everything.
- Use **Parquet/Iceberg/Delta**, not CSV, for intermediates: typed, compressed, and far faster.
- Keep a **raw/immutable layer** you never modify, and build the cleaned layers from it. When a
  transformation turns out to be wrong, you can rebuild — you cannot un-corrupt a raw layer you
  overwrote.

## Before it goes to production

- [ ] Re-running the same partition twice produces identical output — tested, not assumed.
- [ ] A backfill of an arbitrary past date range works.
- [ ] Quality gates fail the run loudly on bad data.
- [ ] Rows in / rows out / duration are logged per step.
- [ ] Secrets come from a secret store, never the DAG file.
- [ ] The alert fires when the job does not run at all.
