---
name: data-cleaning-pipeline
description: Build a repeatable, ordered cleaning pipeline — validation, deduplication, type normalization, missing-value handling, outlier treatment. Use when preparing raw data for analysis or modelling, or when cleaning work needs to be reproducible rather than done once by hand.
license: MIT
---

# Data cleaning pipeline

Cleaning done in a notebook cell is lost work. Build it as an **ordered, re-runnable pipeline**
where every transformation is explicit, testable and reversible.

## Order matters

Run the stages in this order. Doing them out of order is the most common source of silent
corruption:

1. **Validate the contract** — the schema is what you expect (columns, types, ranges).
2. **Normalize types** — parse dates, cast numbers, strip whitespace, unify case and categories.
3. **Deduplicate** — remove exact and near-duplicate rows.
4. **Handle missing values** — only after you know the mechanism (see `exploratory-data-analysis`).
5. **Treat outliers** — decide per column, and record the decision.
6. **Normalize scales and encode** — only for modelling, and fit on training data only.
7. **Score the result** — assert the output meets the quality bar.

Normalize types **before** deduplicating and imputing: `" 12 "` and `12` are the same value, and
`"2024-01-05"` as text will not deduplicate against a date.

## 1. Validate the contract

Declare the expected schema and fail loudly when it is violated — a silent schema drift upstream
is how a pipeline produces plausible nonsense. Check column presence, dtype, nullability and
allowed ranges. Use Pandera, Great Expectations, or a plain assertion function; the tool matters
less than the check existing.

## 2. Normalize types

- Trim whitespace and strip it before comparing or joining.
- Parse dates explicitly with a known format; do not let the parser guess, and check how many
  values failed to parse.
- Cast numeric-looking strings, and **count the failures** — `errors="coerce"` silently becomes
  `NaN`, which then looks like missing data.
- Unify categorical labels: `{"US", "USA", "United States"}` → one code. Build the mapping
  explicitly.

## 3. Deduplicate

- Exact duplicates: drop with a rule you can state (`drop_duplicates(subset=[...], keep="last")`).
- **Near-duplicates need a key**: normalize case, whitespace and punctuation, then match on a
  canonical form. Never fuzzy-match on a business identifier automatically.
- Decide the winner deliberately (most recent, most complete) and record it.
- **Never deduplicate a table where duplicates are meaningful** — a transaction log with two
  identical purchases is not a duplicate.

## 4. Missing values

Decide per column, from the mechanism:

- **Drop the column** when it is almost entirely empty and not required.
- **Drop the rows** when the missing rate is low and the mechanism is MCAR.
- **Impute** for MAR: median/mode for simple cases; a model-based or group-wise mean when the
  value clearly depends on other columns.
- **Flag, don't fill**, for MNAR: add an `is_missing` indicator and impute, so the model can see
  that the value was absent.
- Never impute a **target** or a **leakage-prone** column.

Record which columns were imputed and with what — an imputed value that looks real is a trap for
the next person.

## 5. Outliers

Diagnose before deciding (error / mixed population / genuine rare event). Then choose, per column:

- **Keep** when the value is real — rare events are often the signal.
- **Cap (winsorize)** when the extreme value is real but distorting.
- **Remove** only for confirmed errors, and log how many rows went.
- **Transform** (log) when the distribution is skewed but the value is genuine.

## 6. Reproducibility

- Seed every random operation.
- Make the pipeline a **function or DAG**, not a sequence of notebook cells: `clean(raw) -> tidy`.
- Write the **output to a new path**; never overwrite the raw input. Raw data is the only copy you
  cannot regenerate.
- Record row counts at each stage — a stage that drops 40% of rows must be noticed, not discovered
  later.
- Emit a **cleaning report**: stages applied, rows in/out, mappings used, columns imputed.

## 7. Test it

- Assert the schema of the output.
- Assert the row-count change is within expectation.
- Assert no required column is null.
- Test with a tiny hand-written fixture that contains each defect you handle — the fixture is the
  specification.
