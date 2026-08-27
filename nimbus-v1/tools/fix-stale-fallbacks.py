#!/usr/bin/env python3
"""
fix-stale-fallbacks.py — align `var(--cnds-x, #fallback)` hexes with what the variable resolves to.

    python3 tools/fix-stale-fallbacks.py            # dry run, prints what would change
    python3 tools/fix-stale-fallbacks.py --apply    # rewrite the files

WHY
    CSS is littered with fallbacks like `var(--cnds-body-color, #ebebeb)` whose hex no longer
    matches the variable. They are **dead code** — the fallback only fires if the variable is
    undefined, which it is not — so nothing renders wrong. But they read as documentation, and
    stale documentation is worse than none: the next person greps for a colour and finds a value
    the system stopped using.

SAFETY
    A fallback is only rewritten when the variable IS defined in that context, i.e. when the
    fallback is provably dead. Where the variable is NOT defined the fallback is load-bearing —
    it is what actually renders — so those are reported and left untouched. That distinction is
    the whole point of the script; without it this would be a rendering change, not a tidy-up.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Which resolution context each file's declarations belong to.
FILES = [
    ("css/core/variables.css", "light"),
    ("css/themes/primitives.css", "light"),
    ("css/themes/light.css", "light"),
    ("css/themes/dark.css", "dark"),
    ("css/app.css", "light"),
    ("css/nimbus.css", "light"),
]
COMPONENT_DIR = ROOT / "css" / "components"

VAR_FALLBACK = re.compile(r"var\(\s*(--cnds-[A-Za-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)")


def dark_ranges(css):
    """Character ranges inside a selector that scopes to the dark theme.

    Component CSS mixes light and dark rules in one file, so context has to be decided per
    occurrence, not per file. Resolving a dark fallback against the light map produces a
    confidently wrong answer — which is exactly what the first version of this script did.
    """
    ranges, i, n = [], 0, len(css)
    while i < n:
        brace = css.find("{", i)
        if brace == -1:
            break
        selector = css[max(0, css.rfind("}", 0, brace)) : brace]
        selector = selector.split("{")[-1].strip()
        depth, j = 1, brace + 1
        while j < n and depth:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        if 'data-cnds-theme="dark"' in selector:
            ranges.append((brace, j))
        i = j
    return ranges


def context_at(pos, ranges):
    return "dark" if any(a <= pos < b for a, b in ranges) else "light"


def load_maps():
    """Reuse the manifest builder's CSS parsing so both tools agree on how the cascade resolves."""
    spec = ROOT / "tools" / "build-nimbus-manifest.py"
    src = spec.read_text()
    ns = {"__name__": "_gen", "__file__": str(spec)}
    exec(compile(src, str(spec), "exec"), ns)
    layers = ns["load_css_layer"](None)
    return ns, layers


def norm(hex_str):
    h = hex_str.lower()
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    if len(h) == 9:
        h = h[:7]
    return h.upper()


def main(apply_changes):
    ns, layers = load_maps()
    resolve_value, to_hex = ns["resolve_value"], ns["to_hex"]

    targets = [(rel, ctx) for rel, ctx in FILES if (ROOT / rel).exists()]
    targets += [(str(p.relative_to(ROOT)), "light") for p in sorted(COMPONENT_DIR.glob("*.css"))]

    stale, live, ok = [], [], 0
    edits_by_file = {}

    for rel, ctx in targets:
        path = ROOT / rel
        text = path.read_text(encoding="utf-8", errors="replace")
        ranges = dark_ranges(text)
        new_text = text
        file_edits = 0
        replacements = []

        for m in VAR_FALLBACK.finditer(text):
            name, fallback = m.group(1), m.group(2)
            varmap = layers[context_at(m.start(), ranges) if ctx == "light" else ctx]
            if name not in varmap:
                live.append((rel, name, fallback))          # load-bearing — do not touch
                continue
            actual = to_hex(resolve_value(varmap, varmap[name]))
            if actual is None:
                continue                                     # not a flat colour; leave it
            if norm(fallback) == norm(actual):
                ok += 1
                continue
            stale.append((rel, name, fallback, actual))
            replacements.append((m.start(), m.end(), f"var({name}, {actual.lower()})"))
            file_edits += 1

        for start, end, rep in reversed(replacements):   # right-to-left keeps offsets valid
            new_text = new_text[:start] + rep + new_text[end:]

        if file_edits:
            edits_by_file[rel] = (new_text, file_edits)

    print(f"in sync        {ok}")
    print(f"stale (dead)   {len(stale)}   <- rewritable")
    print(f"live fallback  {len(live)}   <- variable undefined, left alone\n")

    by_var = {}
    for rel, name, fb, actual in stale:
        by_var.setdefault((name, fb, actual), []).append(rel)
    for (name, fb, actual), files in sorted(by_var.items(), key=lambda kv: -len(kv[1])):
        where = f"{len(files)} file(s)" if len(set(files)) > 1 else files[0]
        print(f"  {name:44} {fb} -> {actual.lower()}   ({len(files)}x, {where})")

    if live:
        print(f"\n  live fallbacks (variable never declared) — these DO render, left untouched:")
        seen = set()
        for rel, name, fb in live:
            if name in seen:
                continue
            seen.add(name)
            print(f"    {name:44} {fb}   {rel}")

    if apply_changes and edits_by_file:
        for rel, (new_text, n) in edits_by_file.items():
            (ROOT / rel).write_text(new_text, encoding="utf-8")
            print(f"\nwrote {rel}  ({n} fallback(s))")
    elif not apply_changes:
        print("\n(dry run — re-run with --apply to write)")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write the changes")
    sys.exit(main(ap.parse_args().apply))
