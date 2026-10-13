---
description: Build or run a reproducible data-cleaning pipeline for a dataset.
argument-hint: "[path to the raw data, and the target shape if known]"
---

Clean: **$ARGUMENTS**

Follow the `data-cleaning-pipeline` skill. Order matters — do not skip stages.

1. **Validate the contract** — assert the expected columns, types and ranges exist. Fail loudly on
   drift.
2. **Normalize types** — trim whitespace, parse dates explicitly, cast numbers and **count the
   failures**, unify categorical labels.
3. **Deduplicate** — exact, then near-duplicates on a canonical key; decide the winner deliberately.
4. **Missing values** — determine the mechanism first, then drop / impute / flag per column. Never
   impute the target.
5. **Outliers** — classify each as error, mixed population or genuine rare event, then keep, cap,
   remove or transform.
6. **Write the output to a new path** — never overwrite the raw input.
7. **Report** rows in/out per stage, the columns imputed and with what, and every mapping applied.

Deliver the cleaning as a **function or DAG** (`clean(raw) -> tidy`), not as notebook cells, and
seed any random operation. Finish by running it end to end and showing the row counts, so the result
is reproducible rather than merely observed once.
