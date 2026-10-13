---
name: scientific-visualization
description: Produce publication-quality, accessible figures — multi-panel layouts, error bars, significance markers, colorblind-safe palettes and vector export. Use when a chart must be correct and legible in a paper, report or slide deck.
license: MIT
---

# Scientific visualization

A figure is an argument. Every element should help the reader reach the conclusion you did — and
nothing in it may mislead.

## The form comes first

Decide the form from the **comparison**, not from habit. A bar chart of a single value is a stat
tile; a pie chart with nine slices is a table.

| The reader must see | Use |
| --- | --- |
| Distribution | histogram, violin, box, ECDF |
| Comparison across categories | dot plot, bar (few), lollipop |
| Relationship between two variables | scatter, with a trend only if it is real |
| Change over time | line; avoid stacking more than ~3 series |
| Uncertainty | error bars, confidence band, or the raw points |
| Composition | stacked bar (few parts); never a pie beyond 3–4 slices |

## Uncertainty — always show it

Never plot a mean without its spread. Choose and **state in the caption** what the error bar is:

- **Standard deviation (SD)** — the spread of the observations.
- **Standard error (SEM)** — uncertainty of the mean; shrinks with n.
- **95% CI** — the interval; the right choice for inference.
- **IQR** for a non-normal distribution.

Mixing SEM and SD across panels is how a figure becomes misleading without being wrong. Use one and
label it.

## Significance and statistics on figures

- Mark pairwise comparisons with **stars whose meaning is defined in the caption**
  (`* p<0.05, ** p<0.01, *** p<0.001`).
- Correct for **multiple comparisons** when you draw many brackets; do not compare everything to
  everything.
- Show **n** per group, on the axis or in the caption.
- Do not use a significance marker to imply a difference that failed to reach threshold — a
  "trend" star is not a thing.

## Color

- **Colorblind-safe by default**: viridis, cividis, magma, or Okabe–Ito for categoricals. Around 8%
  of men cannot reliably separate red from green — the classic default is the wrong default.
- Match the palette to the data type:
  - **Categorical** — distinct hues, max ~7 before it stops being readable.
  - **Sequential** — one hue, light to dark (viridis).
  - **Diverging** — two hues around a meaningful midpoint (RdBu, coolwarm); the midpoint must be
    meaningful (zero, a baseline), or it is a lie.
- **Redundant encoding**: vary marker **shape** as well as color for series that must be
  distinguished, so the figure survives grayscale printing.
- Never use **rainbow/jet** for a continuous scale — it invents structure that is not in the data.
- Do not encode a **continuous** variable with a categorical palette, or vice versa.

## Layout and typography

- **Multi-panel**: label each panel **A, B, C** in bold, top-left, and reference the letters in the
  caption. Share axes when the panels are comparable, so shapes can be compared by eye.
- **Axis labels carry the unit**: `Time (s)`, `Concentration (µmol L⁻¹)`.
- **Do not truncate a bar chart's y-axis.** Bars encode magnitude by length, so starting at a
  non-zero baseline misstates the ratio. Line charts may crop — movement is the message there.
- Font size large enough to survive being shrunk into a two-column figure: ~7–9 pt final. A figure
  designed at 20 pt and scaled to 40% is unreadable.
- Remove chartjunk: no 3-D, no gradient backgrounds, no decorative gridlines. Keep a light grid if
  it helps the reader read a value.
- One panel, one message. If a panel needs two sentences to explain, split it.

## Exporting

- **Vector for anything with text or thin lines**: PDF or SVG. It stays sharp at any zoom and the
  text remains selectable.
- **Raster only when required** (some journals, or an image-heavy panel): 300 dpi minimum for
  photographs, 600 dpi for line art. Never screenshot a figure.
- Embed fonts (or use the journal's specified set) so the text does not reflow in the PDF.
- Set the figure size in the **final physical units** and save with a tight bounding box.

## Journal presets

- **Nature** — single column 89 mm, double 183 mm; ~7 pt sans-serif; minimal lines.
- **Science** — single column 55 mm, double 120 mm; ~6–8 pt.
- **Cell** — single column 85 mm, double 180 mm.

Build these as saved rc settings or a style module, so every figure in a paper matches.

## Checklist before it ships

- [ ] The form matches the comparison.
- [ ] Uncertainty is shown, and the caption says which measure it is.
- [ ] n is stated.
- [ ] Colorblind-safe; the palette matches the data type.
- [ ] Axis labels include units; no truncated bar baseline.
- [ ] Legible at final printed size.
- [ ] Caption is self-contained: what, how, n, error bars, significance.
