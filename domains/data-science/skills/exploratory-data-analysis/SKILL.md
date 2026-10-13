---
name: exploratory-data-analysis
description: Profile an unfamiliar dataset before modelling it — schema, missingness mechanism, distributions, correlations and data-quality risks. Use when starting with a new table or file, asked to "look at" or "understand" data, or when checking whether data is fit for a planned analysis.
license: MIT
---

# Exploratory data analysis

The goal is not a gallery of charts. It is to answer, before you model anything: **what is in this
data, what is wrong with it, and what will it not let me claim?**

Run `scripts/eda_analyzer.py` for the mechanical pass, then read its output critically. The script
finds facts; the judgement below is yours.

```bash
python3 scripts/eda_analyzer.py <path-to-data> [--target column] [--out report.md]
```

## 1. Schema and structure

- Confirm the **grain**: what does one row represent? If you cannot say in one sentence, stop —
  every later step is built on this.
- Check the primary key is unique. A duplicated key turns a join into a fan-out and inflates
  every aggregate downstream.
- Classify each column: identifier, dimension, measure, timestamp, or free text. The type in the
  file (`object`, `int64`) is not the semantic type.
- Watch for **type lies**: numbers stored as strings, dates as integers, booleans as `0/1/"Y"/"N"`,
  leading zeros lost to a numeric cast.

## 2. Missingness — and its mechanism

Report the **rate per column**, but the mechanism is what matters:

- **MCAR** (missing completely at random) — the missingness is unrelated to any value. Dropping
  rows is defensible, at the cost of sample size.
- **MAR** (missing at random) — missingness depends on *other observed* columns. Example: income
  missing more often for younger respondents. Imputation can be principled here.
- **MNAR** (missing not at random) — missingness depends on the *unobserved value itself*. Example:
  people with the highest income decline to state it. **No imputation fixes this**; you can only
  bound the effect or acknowledge the bias.

Diagnose the mechanism: compare the distribution of other columns for rows missing vs. present, and
check whether missingness correlates with time or with a system (a column missing only after a
certain date is a pipeline break, not a data property). Do not impute until you know which of the
three you have.

## 3. Distributions and outliers

- For each measure: min, max, quartiles, mean, median, standard deviation. A large gap between
  mean and median signals skew; report the median and say so.
- **Outliers are usually one of three things**: a data-entry error, a different population mixed
  in, or a genuine rare event. Investigate before removing — deleting real signal is worse than
  keeping noise.
- Use IQR (`< Q1 − 1.5·IQR` or `> Q3 + 1.5·IQR`) or a z-score, but inspect the flagged rows.
- Check for impossible values: negative counts and ages, dates in the future, percentages over
  100, coordinates outside the valid range.

## 4. Correlations — chosen to match the data

| Pair of variables | Use | Note |
| --- | --- | --- |
| Two continuous, linear, no heavy outliers | **Pearson** | Sensitive to outliers and curvature |
| Continuous, monotonic, or with outliers/ranks | **Spearman** | Captures any monotonic relation |
| Two categorical | **Cramér's V** | Not signed; 0 = independent |
| Categorical vs. continuous | **Point-biserial** (binary) or compare group distributions | |

Correlation is not causation, and a correlation computed over a mixed population can be an artifact
of a third variable — check per group before believing it. **Perfect correlation between two columns
is usually redundancy or leakage**: one column derived from the other.

## 5. Data-quality scorecard

| Dimension | Question | Typical failure |
| --- | --- | --- |
| Completeness | Are required fields present? | A key column 30% missing |
| Uniqueness | Is the key unique? | Duplicate rows inflating revenue |
| Validity | Do values fall in the legal range? | Age 999, date 1900-01-01 |
| Consistency | Do related columns agree? | `end_date` before `start_date` |
| Timeliness | Is the data current? | Stale as of months ago |
| Accuracy | Does it match an external truth? | Totals disagree with the ledger |

## 6. Leakage — check before you model

Look for a column that **could not be known at prediction time**: an outcome recorded later, a
derived total, an id that encodes the label. A feature that correlates suspiciously well with the
target is usually leakage, not a discovery.

## Reporting

State, in order: grain and row count; the quality scorecard with the columns that fail; the three
to five findings that affect the analysis; and the **limits** — what this dataset cannot support.
Write the chart only when a picture carries the finding better than the number does.
