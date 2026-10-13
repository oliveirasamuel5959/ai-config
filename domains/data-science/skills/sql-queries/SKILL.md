---
name: sql-queries
description: Write and optimize analytical SQL — window functions, CTEs, cohort and funnel analysis, and dialect differences. Use when querying a warehouse, building a metric, debugging a slow query, or translating a business question into SQL.
license: MIT
---

# Analytical SQL

Write SQL that says what it means, and prove it is fast enough on real data volume.

## Structure

- **CTEs over nested subqueries.** Name each step for what it produces (`daily_active`,
  `first_purchase`), so the query reads top to bottom.
- One CTE, one job. A CTE that joins and aggregates and filters is three steps.
- **Comment the business rule**, not the syntax: `-- a customer is active if they ordered in the last 30 days`.
- Format consistently and keep the select list aligned; a query gets read far more than written.

## Window functions

The tool that separates analytical SQL from row-by-row SQL. All of these keep every row, unlike
`GROUP BY`:

```sql
-- Rank within group
row_number() OVER (PARTITION BY customer_id ORDER BY created_at DESC)  AS recency_rank
rank()       OVER (PARTITION BY segment ORDER BY revenue DESC)          AS revenue_rank
-- Previous value / change over time
lag(amount)  OVER (PARTITION BY customer_id ORDER BY created_at)         AS prev_amount
-- Running total / share of total
sum(amount)  OVER (PARTITION BY customer_id ORDER BY created_at
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)    AS running_total
amount / sum(amount) OVER (PARTITION BY region)                          AS share_of_region
```

- **Always use an explicit frame** for running aggregates. The default frame is
  `RANGE UNBOUNDED PRECEDING AND CURRENT ROW`, which with duplicate ordering values aggregates
  **all tied rows together** — a classic source of wrong running totals.
- `row_number()` is deterministic; `rank()` leaves gaps on ties; `dense_rank()` does not.
- Filter on a window result by wrapping it in a CTE — you cannot use it in `WHERE` of the same
  query level.

## Winning the "first / last per group" problem

The most common analytical query, and the one where a correlated subquery makes it slow:

```sql
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM orders
)
SELECT * FROM ranked WHERE rn = 1;   -- latest order per customer
```

## Cohort retention

Retention is the share of a signup cohort still active in period N. Build it by assigning a cohort,
computing period offsets, then counting distinct actives per (cohort, period):

```sql
WITH cohorts AS (
  SELECT customer_id, date_trunc('month', min(created_at)) AS cohort_month
  FROM orders GROUP BY customer_id
),
activity AS (
  SELECT o.customer_id, c.cohort_month,
         datediff('month', c.cohort_month, date_trunc('month', o.created_at)) AS month_number
  FROM orders o JOIN cohorts c USING (customer_id)
)
SELECT cohort_month, month_number,
       count(DISTINCT customer_id) AS active,
       count(DISTINCT customer_id) * 1.0
         / max(count(DISTINCT customer_id)) OVER (PARTITION BY cohort_month) AS retention
FROM activity
GROUP BY cohort_month, month_number
ORDER BY cohort_month, month_number;
```

Only compare **complete** cohorts — a cohort younger than the retention window will show a
falling curve that is an artifact of missing time, not churn.

## Funnel analysis

Define the steps, the time window and the ordering rule **first** — most funnel disputes are
really disputes about those.

- Count a user at each step only if they completed the previous step **earlier**.
- Report **step conversion** (this step / previous) and **overall conversion** (this step / first) —
  they answer different questions.
- Decide the session window up front (same day, 7 days, unbounded) and state it.

## Performance

- **`EXPLAIN ANALYZE` before optimizing.** Read the plan; find the actual bottleneck rather than
  guessing.
- **Filter early**, before joins and before aggregation.
- **Select only the columns you need** — columnar stores read only the referenced columns.
- **Partition pruning**: filter on the partition key (usually a date) so irrelevant partitions are
  never scanned.
- **Join on the same type.** A string-to-int join silently prevents index use and can drop matches.
- **Beware `SELECT DISTINCT` as a fix for a join fan-out.** It hides the duplicate-key problem and
  produces wrong aggregates. Find the real grain.
- **`NOT IN` with nulls** returns no rows: `NOT IN (SELECT ...)` where the subquery has a null is a
  silent empty result. Use `NOT EXISTS`.
- **Nulls in a join key** never match, including to each other.

## Dialects

| Need | Postgres | BigQuery | Snowflake |
| --- | --- | --- | --- |
| Truncate to month | `date_trunc('month', d)` | `DATE_TRUNC(d, MONTH)` | `date_trunc('month', d)` |
| Date difference | `d2 - d1` (int days) | `DATE_DIFF(d2, d1, DAY)` | `datediff(day, d1, d2)` |
| Safe cast | `CAST(x AS int)` | `SAFE_CAST(x AS INT64)` | `TRY_TO_NUMBER(x)` |
| String concat | `a \|\| b` | `CONCAT(a, b)` | `a \|\| b` |
| Approx distinct | no builtin | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` |

Pin the dialect in the prompt or infer it from the project, and do not mix syntaxes.

## Before you trust a query

- Row count is plausible and **stable across two runs** (a query that returns a different count each
  time has a fan-out or a non-deterministic join).
- No unexpected **nulls in a key** you group by.
- The totals reconcile against a known figure — a ledger, yesterday's dashboard, a hand count.
- `count(*)` equals `count(distinct id)` unless duplicates are expected and explained.
