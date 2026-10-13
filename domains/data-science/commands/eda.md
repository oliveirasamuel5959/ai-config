---
description: Run a full exploratory data analysis on a dataset and produce the profile report.
argument-hint: "[path to the data file, plus optional --target column]"
---

Run the `exploratory-data-analysis` skill on: **$ARGUMENTS**

Steps:

1. Resolve the data path and confirm it exists. If no path was given, ask for one rather than
   guessing.
2. Run the mechanical pass:

   ```bash
   python3 <this skill's dir>/scripts/eda_analyzer.py <path> [--target <column>] --out eda-report.md
   ```

   The script lives in the `exploratory-data-analysis` skill's `scripts/` directory.

3. **Read the report critically** — the script reports facts, not conclusions. Determine the
   missingness mechanism (MCAR/MAR/MNAR) by comparing subpopulations, and investigate every quality
   flag it raised.
4. Report, in order:
   - grain, row count and whether the key is unique;
   - the quality scorecard, naming the columns that fail;
   - the three to five findings that affect any downstream analysis;
   - the **limits** — what this dataset cannot support.

Do not start modelling. This command ends at "the data is understood and its problems are known".
