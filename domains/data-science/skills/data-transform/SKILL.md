---
name: data-transform
description: Reshape and transform tabular data — pivoting, encoding, scaling, binning and feature construction — for analysis or modelling. Use when converting between wide and long form, preparing features, or aggregating data into a different shape.
license: MIT
---

# Data transformation

Reshaping and feature preparation. The recurring failure is not a wrong function call — it is a
transformation fitted on the wrong data, or a shape change that silently drops rows.

## Wide vs. long — pick by intent

| Shape | One row is | Best for |
| --- | --- | --- |
| **Wide** | an entity, one column per measure | reports, one row per customer |
| **Long / tidy** | one observation | plotting, grouping, modelling |

Convert deliberately:

- `melt` (pandas) / `unpivot` (Polars, SQL): wide → long.
- `pivot` / `pivot_table` (pandas) / `pivot` (Polars): long → wide.

**Audit the round trip.** `melt` then `pivot` should give back what you started with; if it does
not, you lost rows — usually to duplicate keys or nulls in the pivot index. Assert the shape.

## Aggregation

- Decide the grain **before** aggregating and assert the row count afterwards.
- An aggregate that drops nulls silently changes the denominator. `mean()` skips nulls; if you want
  nulls counted, say so.
- Use `count(*)` vs `count(col)` knowingly — the first counts rows, the second counts non-null.
- For a share-of-total, compute the total once and divide, rather than recomputing per group.

## Encoding categoricals

| Situation | Use | Caveat |
| --- | --- | --- |
| Ordinal (small < medium < large) | **Ordinal** encoding | The order must be real |
| Nominal, few categories | **One-hot** | Never for high cardinality |
| Nominal, high cardinality | **Target** or **frequency** encoding | Target encoding leaks — fit inside CV folds only |
| Tree models | **Label** or ordinal is often fine | Trees split on order, so it works when the code is arbitrary |

- **One-hot on a high-cardinality column** produces thousands of sparse columns and overfits. Use
  frequency or target encoding, or group rare levels into `other`.
- **Target encoding must be fit on training data only**, inside the cross-validation fold. Computing
  it on the whole dataset leaks the target into the features and produces a model that scores far
  worse in production than in validation.
- Handle unseen categories in production: keep an `unknown` bucket so a new level does not crash
  the pipeline.

## Scaling

- **Standardize** (z-score) for linear models, PCA and anything distance-based.
- **Min-max** when a bounded range is required.
- **Robust** (median/IQR) when outliers are present.
- **Do not scale tree-based models** — it changes nothing for them and adds a step to get wrong.
- **Fit the scaler on the training set only**, then apply the same parameters to validation, test
  and production. Fitting on the full dataset leaks and inflates validation scores.

## Binning and discretization

- Use **quantile** bins for even populations, **fixed-width** for meaningful ranges.
- Beware bin edges that split a cluster, and always report the counts per bin — an empty bin often
  means a wrong edge.

## Feature construction

- Prefer **ratios, differences and rates** over raw magnitudes where the question is comparative.
- Encode **domain knowledge** explicitly: a flag for "first purchase", days since last event.
- Time features: hour, day-of-week, is-holiday — and beware that a timestamp itself is usually
  useless as a raw feature.
- **Every derived feature is a leakage risk.** Ask: could this value be known at prediction time?

## The rule that prevents most bugs

**Fit on train, transform everything.** Any transformation that learns parameters — scaler, encoder,
imputer, target-mean — must be fitted on the training split and then applied unchanged to the
others. Put them in a pipeline object so it happens automatically rather than by discipline.

## Verify

- Row count preserved (or changed for a documented reason).
- No nulls introduced by the transformation where there were none — a join or cast can create them.
- For scaling and encoding, compare a transformed value against a hand-computed one on a tiny
  fixture.
