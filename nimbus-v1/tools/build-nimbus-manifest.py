#!/usr/bin/env python3
"""
build-nimbus-manifest.py — regenerate nimbus-manifest.json and report Figma↔CSS drift.

USAGE
    python3 tools/build-nimbus-manifest.py                      # regenerate + report
    python3 tools/build-nimbus-manifest.py --check              # report only, exit 1 on drift (CI)
    python3 tools/build-nimbus-manifest.py --harvest             # + recover mappings from CSS comments
    python3 tools/build-nimbus-manifest.py --product casefusion # resolve with a product class applied

INPUTS
    tools/figma-variables.json    dump from tools/figma-variable-export.js
    css/core/variables.css        base tokens
    css/themes/primitives.css     primitives + product overrides
    css/themes/light.css          light theme
    css/themes/dark.css           dark theme
    for-claude/nimbus-manifest.json   existing manifest — its cssVar mappings are preserved

OUTPUTS
    for-claude/nimbus-manifest.json    regenerated
    for-claude/nimbus-drift-report.md  mapped-and-matching / drifted / unmapped

WHY THE CASCADE ORDER MATTERS
    primitives.css is NOT imported by nimbus.css — every cnds-*.html page links it
    separately, after nimbus.css, so it wins. This script mirrors that page order:

        variables.css  <  primitives.css  <  light.css / dark.css

    If the packaging is ever fixed so nimbus.css imports primitives.css, change
    CASCADE below to match, or this script will keep reporting the demo pages'
    values rather than the application's.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIGMA_DUMP = ROOT / "tools" / "figma-variables.json"
MANIFEST = ROOT / "for-claude" / "nimbus-manifest.json"
REPORT = ROOT / "for-claude" / "nimbus-drift-report.md"

# (path, selectors that contribute to LIGHT, selectors that contribute to DARK)
CASCADE = [
    ("css/core/variables.css", ['[data-cnds-theme="light"]', ":root"], ['[data-cnds-theme="light"]', ":root"]),
    ("css/themes/primitives.css", [":root"], [":root"]),
    ("css/themes/light.css", [":root", '[data-cnds-theme="light"]'], []),
    ("css/themes/dark.css", [], ['[data-cnds-theme="dark"]']),
]

NAMED = {
    "white": "#FFFFFF", "black": "#000000", "transparent": None,
    "inherit": None, "currentcolor": None, "none": None, "unset": None, "initial": None,
}

# Token families that carry ONE value across both themes by design.
#
# SETTLED 2026-08-16 by reading the CSS rather than the mapping. Both alerts and toasts are
# UNTHEMED. `css/components/alerts.css` sets `--cnds-alert-bg` and friends to literal hexes
# per class, and there is no `[data-cnds-theme="dark"] .alert-*` rule anywhere — so an alert
# renders identically in both themes. (`dark.css` does define `.card-alert` overrides, which
# is a different component and was the source of the confusion.)
#
# The earlier note here claimed alerts ARE themed, on the strength of the drift report showing
# dark values for --cnds-{colour}-bg-subtle. That was a WRONG MAPPING, not a themed token:
# alerts never read those variables. Acting on it put a dark column into Figma that made every
# dark-mode alert render as a dark slab. Reverted 2026-08-16, and the bogus cssVar entries were
# removed from the manifest so the comparison cannot be made again.
#
# Lesson worth keeping: before trusting a drift row, confirm the CSS variable is the one the
# component actually consumes. A mapping can resolve cleanly and still be comparing two
# unrelated things.
UNTHEMED_PREFIXES = ("Surface/Toasts/", "Surface/Alert/")

# ...but only the semantic ones. Surface/Toasts/{Background,Border,Text}/{Primary,Secondary,Light,Dark}
# follow the neutral surface ramp and DO theme. A prefix alone is too coarse a rule here.
THEMED_EXCEPTIONS = ("/Primary", "/Secondary", "/Light", "/Dark")

# Mode-scoped source tokens. Text/Light/X and Text/Dark/X are the two halves that a themed
# CSS variable switches between — they are not that variable. The themed Figma token (Text/X)
# is. Harvest must never map these, or one CSS var ends up claimed by three Figma tokens and
# two of them will always look like drift.
MODE_SCOPED_PREFIXES = ("Text/Light/", "Text/Dark/")

# Tokens where Figma and CSS differ on purpose. Each needs a reason, because an exemption with
# no reason is indistinguishable from a bug someone got tired of.
INTENTIONAL = {
    "_retired_Surface/Alert/Text/Caution":
        "Themed in Figma (#FF9933 light / #3D1E00 dark) against CSS's #3D1E00 in both. Kept themed "
        "per Scott 2026-08-15 to preserve the orange for WCAG AA. "
        "OPEN CONCERN: on the alert background (#FFD7AD, unthemed) the orange measures 1.58:1 and "
        "fails AA, while #3D1E00 measures 11.25:1 and passes. The orange only clears AA on a dark "
        "page background (7.19:1) — where Text/Caution already provides it. Revisit.",
}


# ---------------------------------------------------------------- CSS parsing

def parse_declarations(css: str, wanted_selectors):
    """Return {var_name: raw_value} for --cnds-* declared directly inside any wanted selector."""
    out = {}
    i, n = 0, len(css)
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    n = len(css)

    while i < n:
        brace = css.find("{", i)
        if brace == -1:
            break
        selector = css[i:brace].strip().split("\n")[-1].strip()
        # find matching close brace
        depth, j = 1, brace + 1
        while j < n and depth:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        body = css[brace + 1: j - 1]

        if any(sel in selector for sel in wanted_selectors) and selector:
            for m in re.finditer(r"(--cnds-[A-Za-z0-9-]+)\s*:\s*([^;]+);", body):
                out[m.group(1)] = " ".join(m.group(2).split())
        i = j
    return out


def load_css_layer(product=None):
    """Build {light: {var: raw}, dark: {var: raw}} following the page cascade order."""
    light, dark = {}, {}
    for rel, light_sels, dark_sels in CASCADE:
        path = ROOT / rel
        if not path.exists():
            print(f"  ! missing {rel}", file=sys.stderr)
            continue
        css = path.read_text(encoding="utf-8", errors="replace")
        if light_sels:
            light.update(parse_declarations(css, light_sels))
        if dark_sels:
            dark.update(parse_declarations(css, dark_sels))

    if product:
        css = (ROOT / "css/themes/primitives.css").read_text(encoding="utf-8", errors="replace")
        light.update(parse_declarations(css, [f".cnds-product-{product}"]))
        dark.update(parse_declarations(css, [f'[data-cnds-theme="dark"].cnds-product-{product}']))
    return {"light": light, "dark": dark}


COMMENT_RE = re.compile(
    r"(--cnds-[A-Za-z0-9-]+)\s*:\s*[^;]+;\s*/\*\s*Figma:\s*([^*]+?)\s*\*/"
)


def harvest_css_comments(figma_names):
    """Recover Figma↔CSS mappings from the /* Figma: … */ comments already in the CSS.

    These were written by hand as the CSS was built and never collected anywhere. Many name a
    token that no longer exists — the comment was right when written and drifted since — so each
    candidate is validated against the live Figma name list before being accepted.
    """
    found, bad = {}, []
    for rel, _, _ in CASCADE:
        path = ROOT / rel
        if not path.exists():
            continue
        for m in COMMENT_RE.finditer(path.read_text(encoding="utf-8", errors="replace")):
            css_var, raw = m.group(1), m.group(2)
            # a comment may name several tokens, and may carry a parenthetical hex
            for token in re.split(r",\s*", re.sub(r"\(#[0-9a-fA-F]{3,8}\)", "", raw)):
                token = token.strip()
                if not token:
                    continue
                if token.startswith(MODE_SCOPED_PREFIXES):
                    continue        # a per-mode half, not the token itself
                if token in figma_names:
                    found.setdefault(token, css_var)
                else:
                    bad.append({"cssVar": css_var, "named": token, "file": rel})
    return found, bad


VAR_RE = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*(.+?))?\s*\)$")


def resolve_value(varmap, raw, depth=0):
    """Resolve var() chains, honouring fallbacks when the referenced var is undeclared."""
    if raw is None or depth > 24:
        return None
    raw = raw.strip()
    m = VAR_RE.match(raw)
    if not m:
        return raw
    ref, fallback = m.group(1), m.group(2)
    if ref in varmap:
        return resolve_value(varmap, varmap[ref], depth + 1)
    if fallback is not None:
        return resolve_value(varmap, fallback, depth + 1)
    return None


def to_hex(value):
    """Normalise a CSS colour to #RRGGBB uppercase. Returns None if not a flat colour."""
    if value is None:
        return None
    v = value.strip().lower()
    if v in NAMED:
        return NAMED[v]
    m = re.fullmatch(r"#([0-9a-f]{3})", v)
    if m:
        return "#" + "".join(c * 2 for c in m.group(1)).upper()
    m = re.fullmatch(r"#([0-9a-f]{6})", v)
    if m:
        return "#" + m.group(1).upper()
    m = re.fullmatch(r"#([0-9a-f]{8})", v)          # 8-digit: drop alpha
    if m:
        return "#" + m.group(1)[:6].upper()
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*[\d.%]+\s*)?\)", v)
    if m:
        try:
            return "#" + "".join(f"{int(round(float(x))):02X}" for x in m.groups()[:3])
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------- main build

def build(args):
    prior_for_bootstrap = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

    if FIGMA_DUMP.exists():
        dump = json.loads(FIGMA_DUMP.read_text())
        figma_theme = [v for v in dump["variables"] if v.get("collection") == "Theme" and v.get("type") == "COLOR"]
        print(f"Figma: {len(dump['variables'])} variables, {len(figma_theme)} Theme colours  (from dump)")
        if dump.get("duplicateNames"):
            print(f"  ! {len(dump['duplicateNames'])} duplicate variable name(s) in Figma:")
            for d in dump["duplicateNames"]:
                print(f"      {d['key']}")
    elif prior_for_bootstrap.get("colorTokens"):
        # No fresh dump — fall back to the manifest's own Figma values so the CSS drift
        # check still runs. This cannot detect Figma-side changes, only CSS-side ones.
        figma_theme = [
            {"name": k, "light": v.get("light"), "dark": v.get("dark")}
            for k, v in prior_for_bootstrap["colorTokens"].items()
        ]
        print(f"Figma: {len(figma_theme)} Theme colours  (from existing manifest — no dump present)")
        print(f"  ! Bootstrap mode: CSS drift is checked, Figma-side changes are NOT.")
        print(f"    Run tools/figma-variable-export.js → {FIGMA_DUMP.relative_to(ROOT)} for a full check.")
    else:
        sys.exit(
            f"Need either {FIGMA_DUMP.relative_to(ROOT)} or an existing manifest with colorTokens.\n"
            "Run tools/figma-variable-export.js against the Nimbus library and save the JSON there."
        )

    css = load_css_layer(args.product)
    print(f"CSS:   {len(css['light'])} light declarations, {len(css['dark'])} dark declarations"
          + (f"  (product: {args.product})" if args.product else ""))

    prior = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    prior_tokens = prior.get("colorTokens", {})

    figma_names = {v["name"] for v in figma_theme}
    harvested = harvest_css_comments(figma_names) if args.harvest else ({}, [])
    harvest_map, harvest_bad = harvested if args.harvest else ({}, [])
    if args.harvest:
        print(f"Harvest: {len(harvest_map)} mapping(s) recovered from /* Figma: */ comments, "
              f"{len(harvest_bad)} comment(s) name a token that does not exist")

    tokens, matching, drifted, unmapped, unresolvable, css_unthemed, intentional = {}, [], [], [], [], [], []

    for v in figma_theme:
        name = v["name"]
        entry = {"light": v.get("light"), "dark": v.get("dark")}
        prior_entry = prior_tokens.get(name) or {}
        css_var = prior_entry.get("cssVar") or harvest_map.get(name)
        unthemed = name.startswith(UNTHEMED_PREFIXES) and not name.endswith(THEMED_EXCEPTIONS)
        if unthemed:
            entry["unthemed"] = True

        if css_var:
            entry["cssVar"] = css_var
            # cssVar may be a single name, or {"light": …, "dark": …} where CSS splits the role
            lv = css_var["light"] if isinstance(css_var, dict) else css_var
            dv = css_var["dark"] if isinstance(css_var, dict) else css_var
            got_l = to_hex(resolve_value(css["light"], css["light"].get(lv)))
            got_d = to_hex(resolve_value(css["dark"], css["dark"].get(dv, css["light"].get(dv))))
            row = {
                "token": name, "cssVar": css_var,
                "figma": (v.get("light"), v.get("dark")),
                "css": (got_l, got_d),
            }
            if name in INTENTIONAL:
                entry["intentionalDivergence"] = INTENTIONAL[name]
                intentional.append(row)
            elif got_l is None and got_d is None:
                unresolvable.append(row)
            elif (got_l, got_d) == (v.get("light"), v.get("dark")):
                matching.append(row)
            elif unthemed and got_l == v.get("light") and got_d != got_l:
                # Figma holds one value by design; CSS invented a dark variant. CSS is wrong.
                css_unthemed.append(row)
            else:
                drifted.append(row)
        else:
            unmapped.append(name)
        tokens[name] = entry

    manifest = dict(prior) if prior else {}
    manifest["colorTokens"] = dict(sorted(tokens.items()))
    meta = manifest.setdefault("_meta", {})
    meta["source"] = "Figma Nimbus v1 Variable Exports (tools/build-nimbus-manifest.py)"
    meta.setdefault("usage", {})
    meta["cascadeOrder"] = [c[0] for c in CASCADE]
    meta["coverage"] = {
        "figmaThemeColours": len(figma_theme),
        "mapped": len(matching) + len(drifted) + len(unresolvable),
        "matching": len(matching),
        "drifted": len(drifted),
        "cssInventedDarkVariant": len(css_unthemed),
        "intentionalDivergence": len(intentional),
        "unresolvable": len(unresolvable),
        "unmapped": len(unmapped),
    }

    write_report(matching, drifted, unmapped, unresolvable, css_unthemed, harvest_bad, intentional, len(figma_theme), args)

    if args.check:
        problems = len(drifted) + len(unresolvable)
        print(f"\nmatching {len(matching)} · drifted {len(drifted)} · css-invented-dark {len(css_unthemed)} · unresolvable {len(unresolvable)} · unmapped {len(unmapped)}")
        if problems:
            print(f"FAIL — {problems} mapped token(s) disagree with CSS. See {REPORT.relative_to(ROOT)}")
            return 1
        print("PASS — every mapped token matches CSS.")
        return 0

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {MANIFEST.relative_to(ROOT)}  ({len(tokens)} colour tokens)")
    print(f"Wrote {REPORT.relative_to(ROOT)}")
    print(f"  matching {len(matching)} · drifted {len(drifted)} · css-invented-dark {len(css_unthemed)} · unresolvable {len(unresolvable)} · unmapped {len(unmapped)}")
    return 0


def write_report(matching, drifted, unmapped, unresolvable, css_unthemed, harvest_bad, intentional, total, args):
    pct = (len(matching) + len(drifted) + len(unresolvable)) / total * 100 if total else 0
    L = [
        "# Nimbus token drift — Figma vs CSS",
        "",
        f"Generated by `tools/build-nimbus-manifest.py`"
        + (f" with product `{args.product}`" if args.product else "") + ".",
        "",
        f"**{len(matching) + len(drifted) + len(unresolvable)} of {total}** Figma Theme colours "
        f"({pct:.0f}%) have a `cssVar` mapping.",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Mapped and matching | **{len(matching)}** |",
        f"| Mapped but drifted | **{len(drifted)}** |",
        f"| CSS invented a dark variant for an unthemed token | **{len(css_unthemed)}** |",
        f"| Intentional divergence (documented) | **{len(intentional)}** |",
        f"| Mapped but unresolvable in CSS | **{len(unresolvable)}** |",
        f"| Unmapped | **{len(unmapped)}** |",
        "",
    ]

    if drifted:
        dark_only = [r for r in drifted if r["figma"][0] == r["css"][0] and r["figma"][1] != r["css"][1]]
        both = [r for r in drifted if r not in dark_only]
        L += ["## Drifted — Figma and CSS disagree", "",
              "**Two different problems are mixed together here, and they need different fixes:**", "",
              "- *A wrong value* — the mapping is right, one side is stale. Fix the value.",
              "- *A wrong mapping* — the two tokens were never the same thing. Fix the `cssVar`, not the colour. "
              "`Surface/50 → --cnds-body-bg` is the giveaway pattern: a ramp position mapped to a semantic role. "
              "A ramp step keeps its lightness across themes; a semantic role inverts. They will never agree.", ""]
        if dark_only:
            L += [f"### Dark mode only ({len(dark_only)})", "",
                  "Light matches, dark does not. Usually means **the Figma token is not themed** — it carries the "
                  "same value in both modes while CSS defines a real dark variant.", "",
                  "| Token | cssVar | Figma light / dark | CSS light / dark |", "|---|---|---|---|"]
            for r in sorted(dark_only, key=lambda x: x["token"]):
                L.append(f"| `{r['token']}` | `{r['cssVar']}` | {r['figma'][0]} / {r['figma'][1]} | {r['css'][0]} / {r['css'][1]} |")
            L.append("")
        if both:
            L += [f"### Both modes ({len(both)})", "",
                  "| Token | cssVar | Figma light / dark | CSS light / dark |", "|---|---|---|---|"]
            for r in sorted(both, key=lambda x: x["token"]):
                L.append(f"| `{r['token']}` | `{r['cssVar']}` | {r['figma'][0]} / {r['figma'][1]} | {r['css'][0]} / {r['css'][1]} |")
            L.append("")

    if intentional:
        L += ["## Intentional divergence", "",
              "Figma and CSS differ on purpose. Each carries its reason — an exemption without one "
              "is indistinguishable from a bug someone got tired of.", ""]
        for r in sorted(intentional, key=lambda x: x["token"]):
            L += [f"**`{r['token']}`** — Figma {r['figma'][0]} / {r['figma'][1]} · CSS {r['css'][0]} / {r['css'][1]}", "",
                  f"> {INTENTIONAL[r['token']]}", ""]

    if css_unthemed:
        L += ["## CSS invented a dark variant — **the CSS is the side to fix**", "",
              "These Figma tokens hold **one value across both themes by design** (confirmed 2026-08-15: "
              "alerts and toasts must read identically in light and dark, and their text and border colours "
              "are chosen against a fixed background).", "",
              "CSS defines a separate dark value for each. Light matches in every case, which is what tells "
              "us the intent was shared and the dark override was added later.", "",
              "**Do not change Figma to match.** Remove the dark override in `css/themes/dark.css`.", "",
              "| Token | cssVar | Value (both themes) | CSS dark override to remove |", "|---|---|---|---|"]
        for r in sorted(css_unthemed, key=lambda x: x["token"]):
            cv = r["cssVar"] if isinstance(r["cssVar"], str) else f"{r['cssVar'].get('light')} / {r['cssVar'].get('dark')}"
            L.append(f"| `{r['token']}` | `{cv}` | {r['figma'][0]} | {r['css'][1]} |")
        L.append("")

    if harvest_bad:
        L += ["## Stale `/* Figma: */` comments in the CSS", "",
              "Each names a Figma token that does not exist. The comment was probably right when written "
              "and drifted since — a rename, or a token that was removed.", "",
              "| cssVar | Names | File |", "|---|---|---|"]
        seen = set()
        for r in harvest_bad:
            k = (r["cssVar"], r["named"])
            if k in seen:
                continue
            seen.add(k)
            L.append(f"| `{r['cssVar']}` | `{r['named']}` | `{r['file']}` |")
        L.append("")

    if unresolvable:
        L += ["## Unresolvable — mapped to a CSS variable that does not resolve", "",
              "Either the variable is never declared, or it resolves to something that is not a flat colour "
              "(a gradient, a multi-part value, or a `var()` chain ending in an undeclared name).", "",
              "| Token | cssVar |", "|---|---|"]
        for r in sorted(unresolvable, key=lambda x: x["token"]):
            L.append(f"| `{r['token']}` | `{r['cssVar']}` |")
        L.append("")

    if unmapped:
        L += ["## Unmapped — no `cssVar` recorded", "",
              "Each is either a Figma token with no CSS counterpart (a real gap), or a mapping nobody "
              "has recorded yet. Grouped by family to make the pattern visible.", ""]
        fam = {}
        for name in sorted(unmapped):
            fam.setdefault("/".join(name.split("/")[:2]), []).append(name)
        L += ["| Family | Count | Tokens |", "|---|---|---|"]
        for k, v in sorted(fam.items(), key=lambda kv: -len(kv[1])):
            shown = ", ".join(f"`{t.split('/')[-1]}`" for t in v[:6])
            if len(v) > 6:
                shown += f", …+{len(v) - 6}"
            L.append(f"| `{k}/…` | {len(v)} | {shown} |")
        L.append("")

    L += ["## How to add a mapping", "",
          "Add `\"cssVar\": \"--cnds-…\"` to the token's entry in `nimbus-manifest.json`, then re-run this "
          "script. It is preserved across regenerations, so the mapping only has to be made once.", ""]

    REPORT.write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="report only; exit 1 if any mapped token drifts (for CI)")
    p.add_argument("--harvest", action="store_true",
                   help="recover mappings from /* Figma: */ comments already in the CSS")
    p.add_argument("--product", choices=["casefusion", "hyperlize", "expireon"],
                   help="apply a product class when resolving CSS values")
    sys.exit(build(p.parse_args()))
