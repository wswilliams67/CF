# QA · Typography conformance

Every text size/weight/tracking rendered by a screen must exist in the Figma
section that specifies it. This catches the whole class of "it looks close but
the label is 12px where the design says 14" *before* it ships, instead of one
prompt at a time.

## The two halves

**1 · The design spec.** Sweep the section's frames with `use_figma` and tally
`(fontSize, fontWeight, letterSpacing)`:

```js
for (const f of frames) {                       // NOT frames.forEach
  const texts = f.findAll(n => n.type === "TEXT" && n.visible);
  for (const t of texts) {
    const style = await sName(t.textStyleId);   // ← the await is LOAD-BEARING
    ...
  }
}
```

> **`findAll` under-reports on a lazily loaded page.** A synchronous
> `forEach` sweep of these 29 frames returned **34** text nodes; the same sweep
> with an `await` inside the loop returned **3,262**. The awaits let Figma
> stream the rest of the tree in. A sweep that reports a suspiciously small,
> tidy set of styles has not read the design — it has read the first screenful.
> Always print the node count and sanity-check it against the frame count.

Convert Figma's `letterSpacing` to pixels first — it may be `PERCENT`
(`fontSize * value / 100`) or `PIXELS`.

**2 · The rendered result.** Load each page in headless Chrome, inject
`type-scan.probe.js`, drive the tabs and panels open, and tally the same triple
from `getComputedStyle` for every element with a direct text child. Then report
any triple with no counterpart in the design set.

## Reading the result

A mismatch is one of three things, and they are not fixed the same way:

| where the rule lives | action |
|---|---|
| the page stylesheet | fix it — the design is the spec |
| a Nimbus component | **ask first.** The shipped library may be right; see [[nimbus-table-typography-datatable-wins]] |
| the design itself | raise it — a frame can be stale |

## Known open items (2026-08-28)

Three mismatches remain, all Nimbus components, all awaiting a ruling:

| code | design | element |
|---|---|---|
| `14/700/0.12` | `Tab/Label` 12/600/0.12 | `.nav-tabs-nimbus .nav-link` |
| `13/800/0` | `Forms/Label/Default/Bold` 14/800/-0.2 | `.cf-input-label` |
| `13/600/0` | `Forms/Label/Default/Default` 14/600/-0.2 | `.cf-input-required` |
