---
name: csv-data-wrangler
description: Pick the right tool for tabular data and use it well — pandas, Polars, DuckDB or Spark by size and shape. Use when loading, joining, aggregating or converting CSV/Parquet/JSON data, or when a pandas operation is too slow or runs out of memory.
license: MIT
---

# Tabular data wrangling

Choose the engine by **size and shape** before writing code. The wrong engine is the usual reason a
"simple" job runs for an hour or dies with an out-of-memory error.

## Choosing the engine

| Situation | Use | Why |
| --- | --- | --- |
| < ~1 GB, interactive, rich ecosystem | **pandas** | Best library support and documentation |
| ~1–50 GB, single machine | **Polars** or **DuckDB** | Multi-threaded, lazy, low memory |
| SQL-shaped work (joins, group-bys, window functions) over files | **DuckDB** | Speaks SQL directly over CSV/Parquet, no load step |
| Files too big for one machine, or a cluster exists | **Spark** | Distributed; heavy operational cost |
| Repeated large scans of the same data | **Parquet**, not CSV | Columnar + compressed: 5–20× faster scans |

Rule of thumb: **if it fits in memory, do not reach for Spark.** A distributed job that takes
minutes to schedule for seconds of work is a downgrade.

## Reading files correctly

- **Always specify dtypes** on read. Letting the reader guess produces a column of strings where
  you expected numbers, silently, and is the single most common bug.
  - pandas: `pd.read_csv(path, dtype={...}, parse_dates=[...])`
  - Polars: `pl.scan_csv(path, schema_overrides={...})` — `scan_` is lazy, `read_` is eager.
- **Use `usecols`** to load only what you need. It is often the largest single speedup.
- **Watch encodings.** `utf-8` failing means try `utf-8-sig` (a BOM), then `latin-1`. Test on the
  real file, not a sample.
- **Delimiters and quoting**: check for `;` or tab separators, embedded delimiters inside quotes,
  and a preamble row before the header.
- **Preserve leading zeros**: zip codes, account numbers and ids must be read as strings, not ints.

## Working with big data on one machine

- **Go lazy.** Polars `scan_*` and DuckDB build a plan and stream, so only the needed columns and
  rows are materialized.
- **Filter and project early.** Push `where` and column selection to the scan, before joins.
- **Join on the smaller side** and keep the join keys typed identically on both sides — a string to
  int join silently produces no matches.
- **Chunk** as a fallback: read in batches, process, append to Parquet. Write partial results so a
  failure does not lose the whole run.
- **Prefer Parquet** for intermediates: it keeps dtypes, so nothing is re-parsed or re-guessed.

## DuckDB for SQL-shaped work

DuckDB queries files directly, which removes the load-then-analyze step entirely:

```sql
SELECT segment, count(*) AS n, avg(revenue) AS avg_revenue
FROM read_parquet('sales/*.parquet')
WHERE signup >= DATE '2024-01-01'
GROUP BY segment ORDER BY n DESC;
```

Use it for joins across several files, window functions, and anything you would otherwise express
as five chained pandas calls.

## Correctness pitfalls

- **Group-by then join** introduces fan-out when the join key is not unique — check uniqueness
  first or you will inflate totals.
- **`inplace=True`** in pandas is unreliable and slated for removal; assign the result instead.
- **Chained assignment** (`df[df.a > 1]['b'] = 0`) writes to a copy and silently does nothing. Use
  `.loc`.
- **Mixed types in a group key** produce separate groups for `1`, `1.0` and `"1"`.
- **Timezone-naive timestamps** compared across sources are wrong; parse with a timezone. DST
  transitions create duplicate or missing local times.
- **Floating-point equality** on money is unreliable; use cents as integers or `Decimal`.

## Converting

- CSV → Parquet once, then query the Parquet: repeated scans become far cheaper.
- When writing Parquet, keep the schema stable across files in a dataset — a type that flips
  between files breaks the reader.

## Verify the result

After any wrangling step, check the **row count** and a **checksum of a key measure** before and
after. Most silent data bugs are a row count that quietly changed.
