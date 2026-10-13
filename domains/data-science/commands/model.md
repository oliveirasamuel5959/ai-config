---
description: Train and evaluate a classical ML model with a baseline, proper validation and slice analysis.
argument-hint: "[path to the prepared data, and the target column]"
---

Model: **$ARGUMENTS**

Follow the `scikit-learn-ml` skill. Do not skip the framing steps.

1. **Frame it** — state the prediction unit, the moment of prediction, the label definition and its
   delay, and the baseline to beat.
2. **Baseline first** — fit a dummy/naive model and report its score before any real model.
3. **Split to match production** — temporal split for forecasting, group split when entities repeat.
   Keep the test set untouched. Put all preprocessing in a `Pipeline` so it is fitted inside the
   fold.
4. **Check for leakage** — a feature derived from the target, recorded after the prediction moment,
   or an id correlated with the label. Re-score with it removed.
5. **Cross-validate** with the right scheme (stratified / time-series / group) and report the
   **mean and standard deviation** across folds.
6. **Choose the metric from the cost of errors**, state the decision threshold, and report the
   **confusion matrix**, not just the score.
7. **Slice analysis** — performance by subgroup, over time, and by confidence band. Report the
   **worst** slice, not only the average.
8. **Report** the baseline vs. model comparison, the metric with its threshold, the worst slice, and
   the known limitations.

Do not tune against the test set, and do not report a score without the baseline next to it.
