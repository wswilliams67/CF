# nimbus-v1/tools

Keeps the Figma Nimbus library and this CSS honest about each other.

## The problem these solve

`nimbus-manifest.json` claims to bridge Figma variable names to `--cnds-*` CSS variables. It was hand-generated, so it went stale the moment either side changed, and nothing detected that. Of the Figma Theme colours, only 27 had ever been mapped — and 19 of those 27 disagreed with the CSS.

**Current state (2026-08-16 dump):** 452 Theme colours, 27 mapped, **12 matching / 15 drifted**, 425 unmapped. All 15 drifts are Figma-side gaps, not CSS errors — see *Alerts are themed; toasts are not* below.

## Files

| File | What it does |
|---|---|
| `figma-variable-export.js` | Dumps every Figma variable with aliases resolved, in both Theme modes |
| `build-nimbus-manifest.py` | Regenerates the manifest and writes a drift report |

## Usage

**Full check** — needs a fresh Figma dump:

1. Run `figma-variable-export.js` against the Nimbus library (file key `jThQfXbV5iVOpE6cGmASCj`), via the Figma MCP `use_figma` tool or a plugin console.
2. Save the returned JSON to `tools/figma-variables.json`.
3. `python3 tools/build-nimbus-manifest.py`

> **The full dump does not fit in one `use_figma` response.** The tool truncates at 20KB and the complete export is several times that, which silently costs you the tail of the alphabet. Two ways round it, both used successfully: slice the output (`rows.slice(0, 230)` / `.slice(230)`) across parallel calls, or emit only what the builder actually reads — `name`, `collection`, `type`, `light`, `dark` for `Theme` COLOR variables — which is what `tools/figma-variables.json` currently holds. Non-Theme collections are filtered out by the builder anyway.

**CSS-only check** — no Figma access needed. Falls back to the manifest's own Figma values, so it catches CSS-side drift but not Figma-side:

```
python3 tools/build-nimbus-manifest.py
```

**CI gate** — exits 1 if any mapped token disagrees:

```
python3 tools/build-nimbus-manifest.py --check
```

**With a product theme applied** — `--cnds-primary` differs per product:

```
python3 tools/build-nimbus-manifest.py --product casefusion
```

## Outputs

- `for-claude/nimbus-manifest.json` — regenerated. **Existing `cssVar` mappings are preserved**, so a mapping only ever has to be made once.
- `for-claude/nimbus-drift-report.md` — matching / drifted / unresolvable / unmapped.

## Two things that will bite you

**1. The cascade order is not what it looks like.** `primitives.css` is *not* imported by `nimbus.css`. Every `cnds-*.html` page links it separately, after `nimbus.css`, so it wins:

```
variables.css  <  primitives.css  <  light.css / dark.css
```

The script mirrors the page order, which means it reports **what the demo pages render**, not what an app importing only `nimbus.css` renders — those differ. If the packaging is ever fixed, update `CASCADE` in the script or it will keep reporting the old behaviour.

**2. Figma aliases cross collections, and naive resolvers return null.** `Theme` has Dark/Light modes; `Primitives` has a single `Mode 1`. Following an alias into another collection with the *source* collection's mode id silently yields `undefined`. Both scripts switch to the target collection's own default mode when crossing — see `resolve()` in either file.

## Alerts and toasts are both unthemed

Settled 2026-08-16 by reading the CSS instead of the mapping. Both families carry one value across both modes, and both are in `UNTHEMED_PREFIXES`:

```css
/* css/components/alerts.css — literal hexes, per class */
.alert-caution { --cnds-alert-bg: #ffd7ad; --cnds-alert-color: #3d1e00; }
```

There is **no `[data-cnds-theme="dark"] .alert-*` rule anywhere**, so an alert renders identically in light and dark. `dark.css` does define `.card-alert` overrides — a different component, and the source of a lot of confusion.

### The wrong-mapping trap, in full

This one cost real rework, so it is worth the space. The manifest used to map `Surface/Alert/Background/Caution → --cnds-caution-bg-subtle`. That variable *does* have a dark value in `dark.css`, so the drift report showed a clean, confident "Figma is missing its dark column" row for all 14 alert tokens.

It was wrong. **Alerts never read `--cnds-*-bg-subtle`.** Acting on that row put a dark column into Figma and made every dark-mode alert render as a dark slab, which is exactly what the styleguide does not do. Those 15 `cssVar` entries have been removed, so the comparison cannot be made again.

**Before trusting any drift row, confirm the CSS variable is the one the component actually consumes.** A mapping can resolve cleanly, report confidently, and still be comparing two unrelated things. That failure mode is invisible in the report — the numbers look fine — and it is the most expensive kind of error this tool can produce.

Where CSS defines a dark override for an unthemed family, CSS is the side that is wrong; those are reported separately rather than counted as Figma drift. Add to the tuple if another family turns out to be unthemed.

## The `/* Figma: … */` comments are a fossil record

`--harvest` recovers mappings from comments already in the CSS. Most name tokens that no longer exist — `Surface/Text/Success`, `Surface/Background/Danger` — which is an older Figma naming scheme the CSS was written against and never caught up with. Those appear under *Stale `/* Figma: */` comments* in the report.

Two consequences worth knowing:

- The stale names are a **map of how Figma was restructured**. If you are doing Phase 1's mapping work, they tell you what the old name was, which is often enough to find the new one.
- **Renaming a Figma variable silently invalidates these comments.** Phase 0's rename of `Surface/Progress/Bar/working` → `/Working` broke one immediately. Grep the CSS for the old name whenever you rename a token.

## Reading the drift report

Drift is two different problems wearing the same coat:

- **A wrong value** — the mapping is right, one side is stale. Fix the colour.
- **A wrong mapping** — the two tokens were never the same thing. Fix the `cssVar`. The pattern to watch for is a *ramp position* mapped to a *semantic role*, e.g. `Surface/50 → --cnds-body-bg`. A ramp step keeps its lightness across themes; a semantic role inverts. Those two can never agree, and "fixing" the value would be wrong.

A large **dark-mode-only** drift block usually means the Figma token is not themed at all — it carries one value in both modes while CSS defines a real dark variant.

## Component-declared tokens are outside the parsed cascade

`CASCADE` reads only the four global files — `variables.css`, `primitives.css`, `light.css`, `dark.css`. Some components declare their own theme tokens at `:root` inside their own stylesheet. `css/components/dividers.css` is the clearest case:

```css
:root {
  --cnds-divider-color: #808080;
  --cnds-divider-blurry-color: #808080;
}
```

The tool cannot see these, so `Surface/Divider/Default` cannot be given a `cssVar` yet — mapping it today would just report *unresolvable*. Extending `CASCADE` to include component files (in `nimbus.css` import order, which puts them **after** `variables.css` and **before** `light.css`/`dark.css`) is a prerequisite for finishing Phase 1. It is not a large change, but it will move existing numbers, so do it deliberately and re-baseline.

**Dividers are intentionally unthemed** — one flat `#808080` for both themes and both styles, declared once under a bare `:root` (Scott, 2026-08-16). There is no `[data-cnds-theme="dark"]` block and that is not an omission. A gradient that fades to transparent at both ends only ever shows its midpoint, so one mid grey serves both grounds; `#808080` sits almost equidistant from the two page backgrounds (3.78:1 light, 3.88:1 dark). Do not "fix" it by adding a dark variant.

It is also **off the Surface ramp** on purpose — nearest steps are 600 `#A3A3A3` and 700 `#7A7A7A`. A raw hex in a token is normally a smell; here it buys the balance. `Surface/Light/700` is the on-ramp alternative at 4.11:1 / 3.57:1.

## Adding a mapping

Add `"cssVar": "--cnds-…"` to the token's entry in `nimbus-manifest.json` and re-run. It survives regeneration.

Closing the 360 unmapped tokens is Phase 1 of the audit — see
`_bmad-output/planning-artifacts/ux-designs/nimbus-figma-vs-css-audit.md`.
