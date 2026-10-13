---
name: data-analyst-reporting
description: Turn an analysis into a decision-ready readout — frame the question as a testable hypothesis, quantify the finding, and structure the report as What / So What / Now What. Use when writing up an analysis for stakeholders, sizing an opportunity, or explaining what a metric means.
license: MIT
---

# Analytical reporting

An analysis that does not change a decision was a hobby. The deliverable is a **recommendation with
its evidence**, not a table of numbers.

## 1. Start from the decision

Before any query, write:

- **The decision** this analysis informs, and who makes it.
- **The question**, stated so it can be answered with data — not "how are sales?" but "did the
  March promotion increase 30-day repeat purchase rate?"
- **The action** that follows from each possible answer. If no answer changes anything, stop.

## 2. Hypothesis, not fishing

Turn the question into a testable hypothesis: a **metric**, a **population**, a **comparison** and a
**threshold**.

> "Customers exposed to the promotion have a repeat-purchase rate at least 5 points higher than
> unexposed customers, within 30 days."

State the test and the sample size **before** looking at the result. P-hacking is the failure mode
where you keep slicing until something is significant — and it produces findings that do not
replicate.

## 3. Get the comparison right

- **A number alone means nothing.** A metric without a comparison is a fact; a decision needs the
  difference from a baseline (last period, control group, target).
- **Isolate the change.** Was there a control group? If not, did something else move at the same
  time — seasonality, a pricing change, a marketing push? Name the confounders you cannot rule out.
- **Segment control and treatment comparably.** A promotion shown to your best customers did not
  cause their loyalty.
- **Distinguish correlation from causation explicitly** in the write-up. "Customers who use feature
  X retain 3× better" is not "feature X retains customers" — engaged users use features.

## 4. Quantify honestly

- **Give an interval, not just a point.** "8% lift, 95% CI [2%, 14%]" is a finding; "8% lift" is a
  guess with a decimal point.
- **State n** and the time window for every figure.
- **Round to the precision the decision needs.** `$4.2M` not `$4,237,891.22` in a summary; keep the
  precise value in an appendix.
- **Sizing an opportunity**: estimate the population, the effect size and the take-up rate — then
  give a **range**, and name the assumption that drives the most variance. A single-point forecast
  presented as fact is the most common way analytics loses trust.

## 5. The report: What / So What / Now What

- **What** — the finding, in one sentence, with the number and its interval. No methodology yet.
- **So What** — the magnitude in business terms: revenue, customers, risk. Why it matters now.
- **Now What** — the recommendation, and the decision it requires. Concrete options with their
  trade-offs, and what you would need to know to choose.

Lead with the answer. Stakeholders read the first paragraph and the chart; put the methodology after,
for the people who will check it.

## 6. Make it auditable

- **Every number traces to a query.** Keep the SQL or the notebook alongside the report, with the
  data's as-of date.
- **State the definitions.** "Active", "churn", "conversion" mean different things to different
  teams — define the one you used.
- **List the assumptions and the limitations** explicitly, including what the data cannot tell you.
- **Note what would change the conclusion** — the sample that would refute it, the segment where it
  does not hold.

## 7. The presentation

- One chart per claim; the chart shows the claim, not everything you computed.
- Title the chart with the **finding**, not the variable names ("Repeat purchase rose 8 points with
  the promotion", not "repeat_rate by exposed").
- Put the sample size and the error bars on it (see `scientific-visualization`).
- An appendix holds the detail; it does not hold the conclusion.

## Checklist

- [ ] The decision and the decision-maker are named.
- [ ] The question is testable, with a metric, population, comparison and threshold.
- [ ] A baseline or control is present in the comparison.
- [ ] Confounders and limitations are stated, not implied away.
- [ ] Uncertainty is reported as an interval.
- [ ] The recommendation is concrete and actionable.
- [ ] Every figure is reproducible from the stored query or notebook.
