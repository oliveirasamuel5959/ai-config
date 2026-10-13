---
description: Create or clean up a reproducible Jupyter notebook for a given task.
argument-hint: "[the analysis the notebook should perform]"
---

Notebook task: **$ARGUMENTS**

Follow the `jupyter-notebook` skill.

1. **Do not hand-edit the `.ipynb` JSON.** Use `nbformat` to read, modify and write, and run
   `nbformat.validate()` before saving.
2. Structure the notebook in this order:
   - a title cell stating the question it answers;
   - **setup** — imports, config, seeds, paths, all in one place;
   - **data** — load with explicit dtypes, noting the source and as-of date;
   - **analysis** — one idea per cell, each under a markdown heading;
   - **findings** — a closing markdown summary of what was found and what it does not prove.
3. Make it reproducible: seed all randomness, keep the flow linear, and ensure "restart and run all"
   produces the same result.
4. Keep it idempotent — re-running must not append rows or duplicate files.
5. Move any logic that matters into a `.py` module the notebook imports; notebooks are for narrative
   and exploration.
6. Clear stored outputs before committing unless the outputs are the deliverable.

Finish by executing the notebook end to end and reporting that it ran clean, with the command used.
