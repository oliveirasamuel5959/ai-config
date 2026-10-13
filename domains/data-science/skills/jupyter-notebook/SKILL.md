---
name: jupyter-notebook
description: Work with Jupyter notebooks reproducibly — edit the .ipynb as data, keep execution order clean, and make results re-runnable. Use when creating or editing notebooks, or when asked to run a notebook without hand-editing JSON.
license: MIT
---

# Working in notebooks

A notebook is a **JSON document with a hidden execution order**. Both facts cause problems: editing
it by hand corrupts it, and running it out of order produces results that cannot be reproduced.

## Never hand-edit the JSON

`.ipynb` is JSON with cell ids, outputs and metadata. Editing it directly breaks it easily. Use
`nbformat` (or `jupyter nbconvert`) for any programmatic change:

```python
import nbformat

nb = nbformat.read("analysis.ipynb", as_version=4)
nb.cells.append(nbformat.v4.new_code_cell("df.groupby('segment').size()"))
nbformat.validate(nb)
nbformat.write(nb, "analysis.ipynb")
```

Run `nbformat.validate()` before saving. It catches the malformed structure that makes a notebook
refuse to open.

## Reproducibility

- **Restart and run all** before sharing or committing. If the output changes, the notebook was
  order-dependent — which means the results were never reproducible.
- **No hidden state.** A cell that depends on a variable created three cells up and since deleted
  will fail on a clean run. The full run is the only truth.
- **Number the sections** and keep the flow linear: setup → load → transform → analyze → conclude.
- **Seed randomness** (`numpy`, the model, any sampling) in the setup cell.
- **Pin versions** and record them — `%pip freeze` output, or a lockfile. A notebook with no
  environment record is not reproducible next month.

## Structure that survives review

1. **Title and purpose** — one markdown cell: what question this answers.
2. **Setup** — imports, config, seeds, paths. All of it in one place.
3. **Data** — load with explicit dtypes, state the source and the date it was pulled.
4. **Analysis** — one idea per cell, with a markdown heading above each.
5. **Findings** — a markdown summary at the end: what was found, and what it does not prove.

## Hygiene

- **Clear outputs before committing** unless the outputs *are* the deliverable. Stale outputs in
  version control are the most common source of a wrong number in a report.
- Keep the notebook **idempotent**: re-running must not append rows, duplicate files or re-charge an
  API.
- Write intermediate results to **Parquet/CSV**, not to pickle or a giant in-memory frame, so a later
  stage does not depend on the notebook's memory.
- **Parameterize** with `papermill` when the notebook must run for several inputs, rather than
  copying the notebook per case.
- Move anything long or important into a **`.py` module** the notebook imports. Notebooks are for
  narrative and exploration; logic that matters belongs in tested code.

## Conversion

- `jupyter nbconvert --to script` to extract the logic into reviewable Python.
- `jupyter nbconvert --to html --execute` to produce a shareable report with outputs guaranteed
  fresh.
- `papermill` to run a notebook with parameters and capture the result.

## Debugging a notebook that will not run clean

1. **Restart the kernel and run all** — reproduce the failure cleanly first.
2. **Find the cell that fails**: it is usually a missing import or a variable defined only in an
   out-of-order cell.
3. **Look for the deleted-cell dependency**: a name used but never defined in order.
4. **Check the working directory**: relative paths break when the notebook is run from elsewhere. Use
   paths derived from the notebook's own location, not the process CWD.
