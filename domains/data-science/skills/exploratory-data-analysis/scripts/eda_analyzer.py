#!/usr/bin/env python3
"""Mechanical profiling pass for a tabular dataset.

Prints (and optionally writes) a factual profile: grain, missingness, distributions, correlations
and quality flags. It reports facts, not conclusions — the judgement lives in SKILL.md.

Usage:
    python3 eda_analyzer.py DATA [--target COLUMN] [--out report.md] [--max-cat 25]

DATA may be .csv, .tsv, .parquet, .json or .jsonl. Dependencies are imported lazily so the script
degrades gracefully: pandas is required, pyarrow only for parquet.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "?", "-", "unknown"}


def load(path: str):
    import pandas as pd

    lower = path.lower()
    if lower.endswith((".parquet", ".pq")):
        return pd.read_parquet(path)
    if lower.endswith(".tsv"):
        return pd.read_csv(path, sep="\t")
    if lower.endswith(".jsonl"):
        return pd.read_json(path, lines=True)
    if lower.endswith(".json"):
        return pd.read_json(path)
    return pd.read_csv(path, low_memory=False)


def profile(df, target: str | None, max_cat: int) -> str:
    import pandas as pd

    out: list[str] = []
    w = out.append

    w("# Data profile\n")
    w(f"- Rows: **{len(df):,}**  |  Columns: **{df.shape[1]}**")
    w(f"- Generated: {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}\n")

    # 1. schema ---------------------------------------------------------------
    w("## Schema\n")
    w("| column | dtype | non-null | null % | unique | sample |")
    w("| --- | --- | --- | --- | --- | --- |")
    for col in df.columns:
        s = df[col]
        nulls = int(s.isna().sum())
        sample = s.dropna().head(2).tolist()
        sample_txt = ", ".join(str(v)[:24] for v in sample) or "—"
        w(
            f"| `{col}` | {s.dtype} | {len(s) - nulls:,} | {nulls / max(len(s), 1):.1%} "
            f"| {s.nunique(dropna=True):,} | {sample_txt} |"
        )
    w("")

    # 2. missingness ----------------------------------------------------------
    w("## Missingness\n")
    miss = df.isna().mean().sort_values(ascending=False)
    miss = miss[miss > 0]
    if miss.empty:
        w("No missing values.\n")
    else:
        w("| column | null % |")
        w("| --- | --- |")
        for col, rate in miss.items():
            w(f"| `{col}` | {rate:.1%} |")
        w("")
        w(
            "Mechanism is **not** determined here. Compare distributions of other columns for rows "
            "present vs. missing, and check whether missingness tracks time or an upstream system "
            "(MCAR / MAR / MNAR — see SKILL.md).\n"
        )

    # 3. duplicates -----------------------------------------------------------
    w("## Duplicates\n")
    dupes = int(df.duplicated().sum())
    w(f"- Fully duplicated rows: **{dupes:,}** ({dupes / max(len(df), 1):.1%})")
    for col in df.columns:
        if df[col].nunique(dropna=False) == len(df) and len(df) > 0:
            w(f"- `{col}` is unique across all rows (possible primary key)")
            break
    w("")

    # 4. distributions --------------------------------------------------------
    w("## Numeric distributions\n")
    num = df.select_dtypes("number")
    if num.empty:
        w("No numeric columns.\n")
    else:
        w("| column | count | mean | median | std | min | p25 | p75 | max | skew |")
        w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for col in num.columns:
            s = num[col].dropna()
            if s.empty:
                continue
            w(
                f"| `{col}` | {len(s):,} | {s.mean():.4g} | {s.median():.4g} | {s.std():.4g} "
                f"| {s.min():.4g} | {s.quantile(.25):.4g} | {s.quantile(.75):.4g} "
                f"| {s.max():.4g} | {s.skew():.3f} |"
            )
        w("")

    # 5. categorical ----------------------------------------------------------
    cats = df.select_dtypes(exclude="number")
    if not cats.empty:
        w("## Categorical columns\n")
        for col in cats.columns:
            vc = df[col].value_counts(dropna=True)
            if vc.empty:
                continue
            top = ", ".join(f"{k} ({v:,})" for k, v in vc.head(5).items())
            high = " — **high cardinality**" if vc.size > max_cat else ""
            w(f"- `{col}`: {vc.size:,} distinct{high}. Top: {top}")
        w("")

    # 6. correlations ---------------------------------------------------------
    if num.shape[1] >= 2:
        w("## Correlations\n")
        w("Pearson (linear):\n")
        w("```")
        w(num.corr(numeric_only=True).round(2).to_string())
        w("```\n")
        w("Spearman (monotonic, outlier-robust):\n")
        w("```")
        w(num.corr(method="spearman", numeric_only=True).round(2).to_string())
        w("```\n")
        strong = _strong_pairs(num.corr(numeric_only=True))
        if strong:
            w("Suspiciously strong pairs (check for redundancy or leakage):\n")
            for a, b, r in strong:
                w(f"- `{a}` ~ `{b}`: r = {r:.3f}")
            w("")

    # 7. quality flags --------------------------------------------------------
    w("## Quality flags\n")
    flags = _quality_flags(df)
    w("\n".join(f"- {f}" for f in flags) if flags else "- None detected.")
    w("")

    # 8. target sanity --------------------------------------------------------
    if target and target in df.columns:
        w(f"## Target: `{target}`\n")
        if _is_text(df[target]) or df[target].nunique() <= 20:
            vc = df[target].value_counts(dropna=False)
            w("Class balance:\n")
            w("| value | count | % |")
            w("| --- | --- | --- |")
            for k, v in vc.items():
                w(f"| {k} | {v:,} | {v / len(df):.1%} |")
            if vc.size > 1:
                ratio = vc.max() / max(vc.min(), 1)
                if ratio > 4:
                    w(f"\n> **Imbalanced** — majority/minority ratio {ratio:.1f}:1.")
        else:
            s = df[target].dropna()
            w(f"Numeric target: mean {s.mean():.4g}, median {s.median():.4g}, std {s.std():.4g}")
        w("")

    return "\n".join(out)


def _strong_pairs(corr, threshold: float = 0.85):
    pairs = []
    cols = list(corr.columns)
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            r = corr.loc[a, b]
            if r == r and abs(r) >= threshold:  # NaN-safe
                pairs.append((a, b, r))
    return sorted(pairs, key=lambda t: -abs(t[2]))


def _is_text(s) -> bool:
    """True for text columns across pandas versions (object in 2.x, `str` in 3.x)."""
    import pandas as pd

    return s.dtype == object or pd.api.types.is_string_dtype(s)


def _quality_flags(df) -> list[str]:
    import pandas as pd

    flags: list[str] = []
    sentinels = {999, 9999, 99999, -999, -9999, -1}
    for col in df.columns:
        s = df[col]
        if _is_text(s):
            stripped = s.dropna().astype(str).str.strip().str.lower()
            suspicious = stripped.isin(MISSING_TOKENS)
            if suspicious.any():
                flags.append(
                    f"`{col}`: {int(suspicious.sum()):,} value(s) look like missing sentinels "
                    f"({', '.join(sorted(set(stripped[suspicious]))[:4])}) — not counted as null"
                )
        if pd.api.types.is_numeric_dtype(s):
            neg = (s < 0).sum()
            if neg and any(k in col.lower() for k in ("count", "qty", "quantity", "amount", "price")):
                flags.append(f"`{col}`: {neg:,} negative value(s) in a column that reads as a count/amount")
            # Sentinel codes (-1, 999, 9999) sitting far outside the real distribution.
            clean = s.dropna()
            if len(clean) > 10:
                q1, q3 = clean.quantile(.25), clean.quantile(.75)
                fence = q3 + 3 * (q3 - q1)
                hits = clean[clean.isin(sentinels) & (clean > fence)]
                if not hits.empty:
                    flags.append(
                        f"`{col}`: {len(hits):,} value(s) equal to a common sentinel "
                        f"({', '.join(str(v) for v in sorted(set(hits))[:4])}) far above the "
                        f"distribution (p75={q3:.4g}) — likely a placeholder, not a real value"
                    )
        if pd.api.types.is_datetime64_any_dtype(s):
            future = (s > pd.Timestamp.now(tz=s.dt.tz)).sum()
            if future:
                flags.append(f"`{col}`: {future:,} value(s) in the future")
    constant = [c for c in df.columns if df[c].nunique(dropna=False) <= 1]
    if constant:
        flags.append(f"Constant column(s), no information: {', '.join('`%s`' % c for c in constant)}")
    return flags


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Profile a tabular dataset.")
    ap.add_argument("data")
    ap.add_argument("--target", help="column to sanity-check as the modelling target")
    ap.add_argument("--out", help="write the markdown report here instead of stdout")
    ap.add_argument("--max-cat", type=int, default=25, help="distinct-value count flagged as high cardinality")
    args = ap.parse_args(argv)

    try:
        df = load(args.data)
    except ImportError as exc:
        print(f"missing dependency: {exc}. Install pandas (and pyarrow for parquet).", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - surface any read failure plainly
        print(f"could not read {args.data}: {exc}", file=sys.stderr)
        return 1

    report = profile(df, args.target, args.max_cat)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(report)
        print(f"wrote {args.out} ({len(df):,} rows, {df.shape[1]} columns)")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
