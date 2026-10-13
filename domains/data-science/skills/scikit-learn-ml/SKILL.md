---
name: scikit-learn-ml
description: Build classical machine-learning models that generalize — problem framing, baselines, leakage detection, cross-validation, evaluation by slice and drift. Use when training a classifier or regressor, choosing metrics, tuning, or diagnosing a model that scores well offline and poorly in production.
license: MIT
---

# Classical machine learning with scikit-learn

The hard part is not the algorithm. It is framing the problem, avoiding leakage, and choosing an
evaluation that reflects what happens in production.

## 1. Frame before you fit

Write down, before any code:

- **The unit of prediction** — one row is one what? (customer, order, day)
- **The moment of prediction** — what is known at that time? Every feature must be knowable then.
- **The label's definition and its delay** — how long until the outcome is observed? A label that
  arrives in 90 days means your newest data has no label.
- **The baseline to beat** — predict the majority class, or yesterday's value. A model that loses to
  the baseline is not a model.

## 2. Baseline first

Always fit a **dummy/naive baseline** first (`DummyClassifier`, `DummyRegressor`, or last-known
value). Report it next to the real model. Most "the model is 92% accurate" results are a
majority-class baseline on imbalanced data.

## 3. Split to match production

- Split **by time** when the real use is forecasting: train on the past, test on the future. A
  random split on time-ordered data leaks the future and inflates every score.
- Split **by entity** when the same customer/patient appears in many rows: random splitting puts the
  same entity in train and test, and the model memorizes it.
- **Never** fit a scaler, encoder, imputer or feature selector on the full dataset before
  splitting. Put them in a `Pipeline` so they are fitted **inside** the fold.
- Keep a **held-out test set** untouched until the very end. Tuning against it converts it into a
  training set.

## 4. Leakage — the silent killer

Suspect leakage whenever a score looks too good. Check for:

- A feature derived from the **target** or recorded **after** the prediction moment.
- An **id** or index correlated with the target (often ordered by when the outcome occurred).
- **Target encoding** or any aggregate of the target computed over the whole dataset.
- **Duplicate rows** across train and test — the same record in both.
- Preprocessing fitted on all data.

Confirm by removing the suspicious feature and re-scoring. A model whose performance collapses was
reading the answer, not the data.

## 5. Cross-validation

- `KFold` for i.i.d. data; **`StratifiedKFold`** for classification (preserves class balance);
  **`TimeSeriesSplit`** for temporal data; **`GroupKFold`** when entities repeat.
- Report the **mean and standard deviation** across folds. A mean with a huge spread is not a
  result — it is noise, and often means too little data.
- Use `cross_val_score` / `cross_validate` with the full pipeline, not a pre-transformed matrix.

## 6. Metrics that match the decision

| Task | Metric | Avoid |
| --- | --- | --- |
| Balanced classification | accuracy, F1 | — |
| Imbalanced classification | precision/recall, **PR-AUC**, recall at a fixed precision | accuracy, ROC-AUC alone |
| Ranking / threshold tuning | ROC-AUC | — |
| Regression | RMSE (penalizes large errors), MAE (robust, interpretable) | R² alone on non-linear data |
| Probabilities | **log loss, Brier score, calibration curve** | accuracy on the predicted class |

**Pick the metric from the cost of being wrong.** A missed fraud costs more than a false alarm →
optimize recall at an acceptable precision. State the threshold and the trade-off; a model is a
score, and the business chooses the cut.

**Always report the confusion matrix**, not just the score. It shows *which* errors the model makes.

## 7. Tuning

- Search a **small, sensible grid** before a wide one. Randomized search beats a huge grid search on
  the same budget.
- Tune inside cross-validation, never against the test set.
- Regularize before adding complexity: try a simpler model (logistic regression, shallow tree)
  before a large ensemble. Often it is close and far easier to explain and maintain.

## 8. Diagnose fit

- **Underfitting**: both train and validation scores are poor → more capacity or better features.
- **Overfitting**: train high, validation low, large gap → regularize, reduce features, more data.
- **Learning curve**: plot score vs. training-set size. Still rising → more data helps. Flat →
  the model has hit its limit and needs better features, not more rows.

## 9. Slice analysis — where models actually fail

An aggregate score hides the failures that matter. Break performance down and check:

- **Subgroups** — by segment, region, device. A model that is excellent overall and poor for a
  minority group is a fairness and a business problem.
- **Time** — score per month. A declining curve signals drift.
- **Prediction confidence** — error rate by predicted-probability band. Unreliable high-confidence
  predictions are worse than unreliable guesses.
- **Rare classes** — per-class recall, not just the macro average.

Report the worst slice, not only the average.

## 10. Before shipping

- [ ] Pipeline fitted inside CV; no leakage.
- [ ] Time/entity-aware split where applicable.
- [ ] Baseline reported alongside.
- [ ] Metric chosen from the cost of errors, with the threshold stated.
- [ ] Slice analysis done, worst slice reported.
- [ ] Calibration checked if probabilities are used.
- [ ] The training data's date range recorded, with a drift-monitoring plan.
