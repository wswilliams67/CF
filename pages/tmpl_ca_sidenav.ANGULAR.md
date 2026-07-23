# Angular migration — `tmpl_ca_sidenav.html`

How to turn the CaseFusion Case Administrator sidenav frame into Angular
components without losing the behaviour the static template encodes.

Source: [`casefusion/1.6/pages/tmpl_ca_sidenav.html`](./tmpl_ca_sidenav.html)
Design system: Nimbus v1 portable, `casefusion/1.6/{css,js}`

---

## 0. Read this first — the three things that will bite you

Nimbus v1 was built for server-rendered pages. Three of its assumptions are
false in an Angular SPA, and all three fail *silently* — no console error, the
feature just does nothing.

### 0.1 `DataAPI.init()` runs once, before your components exist

`js/nimbus.js` loads every component script, then calls
`Nimbus.DataAPI.init()`, then fires `cnds.ready` on `document`. That scan
happens during app bootstrap. Any `data-cnds-toggle="…"` attribute in an
Angular template is added to the DOM *afterwards* and is never seen.

`DataAPI` exposes a scoped re-scan for exactly this
(`js/core/data-api.js`):

```ts
window.Nimbus.DataAPI.initAll(rootElement);  // re-scan one subtree
window.Nimbus.DataAPI.init();                // global scan + delegation setup
```

`init()` also installs the click/dismiss/keyboard delegation and guards itself
with an internal `_delegationSetup` flag, so calling it again is safe but
wasteful. **Use `initAll(host)` from `ngAfterViewInit`.**

### 0.2 `app.js` binds the theme toggle with a one-shot singular query

```js
// js/app.js — runs inside init(), triggered by cnds.ready
const themeToggle = document.querySelector('[data-cnds-toggle="theme"]');
if (themeToggle) { themeToggle.addEventListener("click", …); }
```

Singular `querySelector`, executed once, before your header component renders.
In Angular it resolves to `null` and the theme button is inert.
**Do not ship `data-cnds-toggle="theme"` and hope. Port it to a
`ThemeService`** (§4.4) — that also gives you an observable other components
can react to.

### 0.3 Component instances outlive the DOM nodes Angular destroys

Nimbus keeps instances in a `Map` keyed by element and appends generated DOM
(tooltip and popover elements) to `<body>`. When Angular tears a component
down, the host element goes but the instance and its body-level node do not.
Navigate back and forth a few times and you accumulate orphaned tooltips.

**Every component that creates a Nimbus instance must dispose it in
`ngOnDestroy`.** See the `NimbusHost` base class in §3.

---

## 1. What you are porting

| Static | Becomes | Notes |
| --- | --- | --- |
| `#caHeader` / `#UtilityNav` | `CaHeaderComponent` | Shared by every CA screen |
| `#navAlertPopover` + bell | `NotificationsMenuComponent` | Body-parented overlay |
| `#portalSwitcherWrapper` | `PortalSwitcherComponent` | |
| `#userAccountWrapper` | `AccountMenuComponent` | |
| `#themeToggle` | `ThemeToggleComponent` + `ThemeService` | §0.2 |
| `#caSidenav` | `CaSidenavComponent` | Owns slim state |
| `#main-content` / `#caContent` | `CaShellComponent` + `<router-outlet />` | |
| Script §2 overlay registry | `OverlayCoordinatorService` | §4.1 |
| Script §6 active-link logic | **Delete** — use `routerLinkActive` | §5.2 |
| Script §6 submenu accordion | Keep, as `CaSidenavComponent` internals | §5.3 |

Suggested tree:

```
CaShellComponent                     the frame; owns slim state + layout
├── CaHeaderComponent                #caHeader
│   ├── NotificationsMenuComponent
│   ├── ThemeToggleComponent
│   ├── PortalSwitcherComponent
│   └── AccountMenuComponent
├── CaSidenavComponent               #caSidenav
└── <router-outlet />                inside #caContent
```

---

## 2. Global setup

### 2.1 Assets

Copy `casefusion/1.6/{css,js,img,fonts,plugins}` into `src/assets/nimbus/`,
then in `angular.json`:

```jsonc
"styles": [
  "src/assets/nimbus/css/nimbus.css",
  "src/assets/nimbus/css/app.css",
  "src/assets/nimbus/css/themes/primitives.css",
  "src/assets/nimbus/css/themes/light.css",
  "src/assets/nimbus/css/themes/dark.css",
  "src/styles.scss"
],
"scripts": [
  "src/assets/nimbus/js/nimbus.js",
  "src/assets/nimbus/js/app.js"
]
```

Order is load-bearing and must match `includes/head-css-core.html`:
**nimbus → app → themes (primitives → light → dark)**.

> **Never add a per-component `<link>` or `<script>`.** `nimbus.css`
> `@import`s every component stylesheet plus the MDI and FontAwesome fonts, and
> `nimbus.js` loads every component script. A duplicate CSS link placed after
> `app.css` inverts the cascade; a duplicate script throws
> `The superclass is not a constructor` because it runs before the core is
> loaded. Both were live bugs in this template before it was cleaned up.

`nimbus.js` resolves its own base path from its `<script src>`, so the
`assets/nimbus/js/` location works with no configuration.

### 2.2 `index.html`

```html
<html lang="en" data-cnds-theme="dark">
  <body class="cnds-product-casefusion">
    <app-root></app-root>
  </body>
</html>
```

Both attributes are required and must stay on those elements:

- `data-cnds-theme` on `<html>` — every theme token in `themes/light.css` and
  `themes/dark.css` is selected off it.
- `cnds-product-casefusion` on `<body>` — `themes/primitives.css` uses it to
  set `--cnds-product-accent` and `--cnds-primary` to the CaseFusion greens.
  Drop it and the whole app falls back to Nimbus red.

### 2.3 A promise for "Nimbus is ready"

```ts
// nimbus-ready.ts
export const NIMBUS_READY = new Promise<void>((resolve) => {
  if ((window as any).Nimbus?.DataAPI) { resolve(); return; }
  document.addEventListener('cnds.ready', () => resolve(), { once: true });
});
```

The guard matters: `cnds.ready` may already have fired before a lazy-loaded
route's component subscribes, and a plain `addEventListener` would wait forever.

### 2.4 Styles: what goes where

| Rule | Location | Why |
| --- | --- | --- |
| `--ca-*` tokens, `.ca-main`, `.ca-main-slim` | `styles.scss` | `:root`-scoped; the frame margin has to see the width tokens |
| `#caSidenav` block (§5 of the template) | `ca-sidenav.component.scss` | Fine under encapsulation — it styles the host |
| Header menu and popover styles (§3) | `styles.scss` | The popover is re-parented to `<body>`, outside every component's scope |
| Anything targeting Nimbus-generated DOM (`.tooltip`, `.select-option`) | `styles.scss` | Angular never emits those nodes, so they carry no scoping attribute |

Prefer a global stylesheet over `::ng-deep` — it is deprecated, and the two
cases above are genuinely global, not leaks.

---

## 3. `NimbusHost` — the base class that prevents §0.3

```ts
import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { NIMBUS_READY } from './nimbus-ready';

declare const Nimbus: any;

@Directive()
export abstract class NimbusHost implements AfterViewInit, OnDestroy {
  protected readonly host = inject(ElementRef<HTMLElement>);

  /** Component classes whose instances this host creates, for teardown. */
  protected abstract readonly nimbusComponents: string[];

  async ngAfterViewInit(): Promise<void> {
    await NIMBUS_READY;
    // Scoped re-scan: picks up this component's data-cnds-* attributes,
    // which the bootstrap-time global scan could not have seen.
    Nimbus.DataAPI.initAll(this.host.nativeElement);
    this.afterNimbusInit?.();
  }

  ngOnDestroy(): void {
    const NimbusNS = (window as any).Nimbus;
    if (!NimbusNS) return;
    for (const name of this.nimbusComponents) {
      const Ctor = NimbusNS[name];
      if (!Ctor?.getInstance) continue;
      this.host.nativeElement
        .querySelectorAll<HTMLElement>('[data-cnds-toggle], [data-cnds-init]')
        .forEach((el) => Ctor.getInstance(el)?.dispose());
    }
  }

  protected afterNimbusInit?(): void;
}
```

`getInstance` / `getOrCreateInstance` / `dispose` are on the
`NimbusComponent` base (`js/core/component.js`), so every component follows
this shape.

---

## 4. Header

### 4.1 `OverlayCoordinatorService` — port of script §2

The bell popover, portal menu and account menu are mutually exclusive. The
static template registers all three in one array to get a single
document-click listener, a single Escape handler and one roving-focus
implementation. Keep that shape; make it a service so sibling components can
close each other without talking directly.

```ts
@Injectable({ providedIn: 'root' })
export class OverlayCoordinatorService {
  private readonly openId = signal<string | null>(null);

  isOpen = (id: string) => computed(() => this.openId() === id);

  open(id: string)   { this.openId.set(id); }   // implicitly closes the others
  close(id: string)  { if (this.openId() === id) this.openId.set(null); }
  toggle(id: string) { this.openId.set(this.openId() === id ? null : id); }
  closeAll()         { this.openId.set(null); }
}
```

A single-valued signal gives you mutual exclusion for free — that is the whole
point of the registry in the static version.

Bind it in each menu component:

```html
<div class="account-menu"
     [class.open]="isOpen()"
     [attr.aria-hidden]="isOpen() ? null : 'true'"
     role="menu">
```

And put outside-click / Escape in one host-level listener on
`CaHeaderComponent`, not one per menu:

```ts
@HostListener('document:click', ['$event'])
onDocClick(e: MouseEvent) {
  if (!this.host.nativeElement.contains(e.target as Node)) this.overlays.closeAll();
}
@HostListener('document:keydown.escape')
onEsc() { this.overlays.closeAll(); }
```

> The notification popover is re-parented to `<body>`, so `host.contains()`
> will not match it. Either exclude it from this handler and give it its own,
> or use Angular CDK `Overlay` for it (§4.3).

### 4.2 Roving focus

The ArrowUp/ArrowDown behaviour over `[role="menuitem"]` is worth keeping
identical, including the wrap and the `indexOf === -1` case (focus on the panel
itself: ArrowDown lands on the first item, ArrowUp on the last). Angular CDK's
`FocusKeyManager` gives you this plus typeahead:

```ts
@ViewChildren(MenuItemDirective) items!: QueryList<MenuItemDirective>;
private keyManager!: FocusKeyManager<MenuItemDirective>;

ngAfterViewInit() {
  this.keyManager = new FocusKeyManager(this.items).withWrap().withVerticalOrientation();
}
onKeydown(e: KeyboardEvent) { this.keyManager.onKeydown(e); }
```

### 4.3 Notifications

Replace `DEMO_NOTIFICATIONS` with a service. Keep the render contract:

```ts
export interface Notification {
  id: string;
  subject: string;
  timestamp: string;   // pre-formatted for display
  message: string;
  unread: boolean;
}
```

Behaviour to preserve:

- Expanding an unread item marks it read (and updates counts + badge).
- Dismiss animates the row to zero height, then removes it.
- Bell glyph is `mdi-bell` with a count badge when unread, `mdi-bell-outline`
  with no badge when clear. Badge caps at `99+`.
- The bell's own Nimbus tooltip is `disable()`d while the popover is open, or
  it renders on top of it.

Angular's `@for` + `[class.unread]` replaces the manual DOM building. **The
static version deliberately builds rows with `createElement` / `textContent`
rather than `innerHTML`, because subjects and messages are user-supplied.**
Angular interpolation escapes by default, so this is free — just never reach
for `[innerHTML]` on these fields.

For the body-parenting, prefer CDK:

```ts
const ref = this.overlay.create({
  positionStrategy: this.overlay.position()
    .flexibleConnectedTo(this.bellRef)
    .withPositions([{ originX: 'center', originY: 'bottom',
                      overlayX: 'start', overlayY: 'top', offsetY: 10 }]),
  scrollStrategy: this.overlay.scrollStrategies.reposition(),
});
```

That replaces `positionPopover()` and its `resize` listener. Keep the
`--arrow-left` custom property: the CSS triangle needs to know where the bell
is relative to the panel's left edge.

### 4.4 Theme

```ts
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<'light' | 'dark'>(
    (localStorage.getItem('cnds-theme') as 'light' | 'dark') ?? 'dark'
  );
  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    effect(() => {
      const t = this._theme();
      document.documentElement.setAttribute('data-cnds-theme', t);
      localStorage.setItem('cnds-theme', t);
    });
  }

  toggle() { this._theme.update((t) => (t === 'dark' ? 'light' : 'dark')); }
}
```

`cnds-theme` is the same localStorage key `app.js` uses, so a user's choice
survives the migration. The template's `MutationObserver` on
`data-cnds-theme` disappears — the signal is now the source of truth:

```html
<button type="button" class="nav-icon-btn"
        (click)="theme.toggle()"
        [attr.aria-label]="'Toggle theme'"
        [title]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'">
  <span class="mdi" [class.mdi-weather-sunny]="theme.isDark()"
                    [class.mdi-weather-night]="!theme.isDark()" aria-hidden="true"></span>
</button>
```

---

## 5. Side nav

### 5.1 Nav model

Replace the hand-written `<li>` rows with data. The `navlink_` /
`tog_submenu_` id prefixes exist only so the static script can find rows by
`querySelectorAll` — **once Angular owns the tree they are dead weight, drop
them.**

```ts
export interface NavItem {
  label: string;
  icon: string;                // e.g. 'mdi-folder-open'
  route?: string;              // leaf
  children?: NavItem[];        // category
}
```

```html
@for (item of items(); track item.label) {
  <li class="sidenav-item" [title]="item.label">
    @if (item.children) {
      <a class="sidenav-link" role="button"
         [attr.aria-expanded]="isExpanded(item)"
         (click)="toggleCategory(item)">
        <i class="mdi {{ item.icon }} mdi-18px me-2" aria-hidden="true"></i>
        <span>{{ item.label }}</span>
        <span class="mdi mdi-chevron-down sidenav-chevron" aria-hidden="true"></span>
      </a>
      <ul class="sidenav-collapse" [class.show]="isExpanded(item)"> … </ul>
    } @else {
      <a class="sidenav-link" [routerLink]="item.route"
         routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }"
         ariaCurrentWhenActive="page">
        <i class="mdi {{ item.icon }} mdi-18px me-2" aria-hidden="true"></i>
        <span>{{ item.label }}</span>
      </a>
    }
  </li>
}
```

Keep `class="sidenav-link"`, `sidenav-item`, `sidenav-collapse`,
`sidenav-chevron` and the `active` class name — the whole §5 stylesheet and
`components/sidenav.css` key off them.

The `<span>` label is not optional: it is what the slim-mode tooltip reads.

### 5.2 Active state — delete the handler

Script §6's leaf-click handler (clear all `.active`, set it on the clicked
link, walk up to the parent category) is entirely replaced by
`routerLinkActive="active"` plus `ariaCurrentWhenActive="page"`.

The one piece with no directive equivalent is **highlighting a parent category
whose child is active**. Derive it:

```ts
isCategoryActive(item: NavItem): boolean {
  return !!item.children?.some((c) => c.route && this.router.isActive(c.route, {
    paths: 'subset', queryParams: 'subset', fragment: 'ignored', matrixParams: 'ignored',
  }));
}
```

`data-ca-tab` — the optional hook that clicks a Nimbus tab button instead of
routing — has no place in a routed app. Drop it.

### 5.3 Slim mode

State belongs on `CaShellComponent`, because two elements need it: the nav
gets `.sidenav-slim`, the content gets `.ca-main-slim`.

```ts
readonly slim = signal(false);
```

```html
<nav id="caSidenav" class="sidenav show" [class.sidenav-slim]="slim()"> … </nav>
<main id="main-content" class="ca-main" [class.ca-main-slim]="slim()"> … </main>
```

Keep these invariants — they are not incidental:

- **`show` stays in the markup.** `.sidenav` is `translateX(-100%)` by default;
  `.sidenav.show` is the component's open state. This frame's nav is
  permanently open. Do not reintroduce a `transform: none !important` override.
- **`.sidenav-slim` is the component's own class**, checked by the Nimbus
  `Sidenav` class in `_isSlim()` / `_expandFromSlim()`. A private class name
  would desync from the component. This is why slim state is read off the
  element in the static version rather than kept in a JS boolean.
- **Collapse any open submenu before shrinking.** Two height animations on the
  same box fight. The static version collapses, waits `DUR.SUBMENU`, then
  shrinks; on expand it restores the active category after `DUR.SIDENAV_WIDTH`.
- **Slim tooltips are created on entering slim and disposed on leaving.** In
  Angular, an `effect()` on `slim()` is the natural home — and `ngOnDestroy`
  must dispose them too, or you leak (§0.3).

### 5.4 Submenu accordion

`components/sidenav.css` ships `.sidenav-collapse` as a `display:none` /
`.show` `display:block` pair with **no height transition**, which is why the
static template animates it by hand. Options, best first:

1. Angular Animations on the `ul`, `height: 0 ↔ *`. Cleanest; delete
   `animateSubmenu` entirely.
2. CSS grid-rows trick (`grid-template-rows: 0fr ↔ 1fr`) — no JS measurement.
3. Port `animateSubmenu` as-is if you need byte-identical motion.

Whichever you pick, honour `prefers-reduced-motion`. The static version checks
it per animation via a live `matchMedia`, not a cached boolean, so a mid-session
OS change is respected.

---

## 6. Layout constraints that survive the port

These are properties of the frame, not of the static implementation.

### 6.1 The sidenav's top offset needs JS

`#caSidenav` is `position: fixed`, so it cannot read the sticky header's height
from normal flow. The static version pins it:

```
sidenav.style.top = header.offsetHeight + var(--ca-sidenav-gap)
```

on load and on resize (rAF-coalesced, because `offsetHeight` forces layout).
**This does not go away in Angular.** Port it to a `ResizeObserver` on the
header inside `CaShellComponent` — strictly better than `resize`, since it also
catches the header reflowing when a portal name wraps:

```ts
ngAfterViewInit() {
  const ro = new ResizeObserver(() => this.updateLayout());
  ro.observe(this.headerRef.nativeElement);
  this.destroyRef.onDestroy(() => ro.disconnect());
}
```

### 6.2 Content offset is CSS, not JS

`.ca-main` clears the panel with
`margin-left: calc(inset + width + gap)`, swapping `width` for the slim width
via `.ca-main-slim`. Keep it in CSS — do not compute it in TypeScript.
`--ca-sidenav-*` must therefore stay on `:root` in `styles.scss`, not inside a
component's encapsulated styles.

### 6.3 z-index

The sidenav sits *below* the header on purpose:
`calc(var(--cnds-zindex-sticky) - 5)` = 1015, against `.sticky-top`'s 1030 in
`app.css`. Menus and popovers use `--cnds-zindex-dropdown` / `-popover`. Keep
using the tokens; if you move overlays to the CDK, align its
`cdk-overlay-container` z-index with `--cnds-zindex-popover` (1060) so Nimbus
tooltips and CDK panels stack predictably.

### 6.4 DOM order

Current order is **sidenav → header → main**, which is also the tab order.
Visual order is header-then-sidenav because of fixed/sticky positioning. When
you componentize, decide this deliberately rather than inheriting it: putting
`CaHeaderComponent` first matches the visual order and is usually the better
default. The skip link (`.visually-hidden-focusable` → `#main-content`) must
stay the first focusable element either way (WCAG 2.4.1).

---

## 7. Tokens — do not regress this

The template was cleaned up specifically to stop squatting the design system's
namespace. Carry the rule into the Angular code:

- **Never declare a `--cnds-*` custom property** except to configure a
  component on its own host. The only legitimate declarations in this template
  are `--cnds-sidenav-width` and `--cnds-sidenav-bg` on `#caSidenav`, which are
  the `.sidenav` component's documented knobs. Declaring
  `--cnds-tooltip-bg` or `--cnds-list-*` at `:root` silently retunes every
  Nimbus component on the page.
- **Page-specific values go under `--ca-*`**, and should resolve through a
  system primitive so the two cannot drift:
  `--ca-border-strong: var(--cnds-surface-light-500, #cccccc)`.
- **Use the theme-aware tokens** rather than a hex per theme:
  `--cnds-frame-bg`, `--cnds-body-bg`, `--cnds-body-color`,
  `--cnds-product-accent`, `--cnds-primary`, `--cnds-zindex-*`. Most
  light/dark rule pairs collapse into one rule once you do.
- An `rgba()` tint of a token colour is fine and is not a hard-coded colour —
  say so in a comment, as `--ca-sidenav-active-tint` does.

---

## 8. Accessibility contract

Preserve all of it; it is easy to lose in a rewrite.

| Concern | Requirement |
| --- | --- |
| Skip link | First focusable element, targets `#main-content` |
| Landmarks | `nav[aria-label]` on both navs; one `main` |
| Menus | `aria-haspopup="menu"`, `aria-expanded` on the trigger, `role="menu"` / `role="menuitem"`, ArrowUp/Down with wrap, Escape closes **and returns focus to the trigger** |
| Bell popover | `role="dialog"` + `aria-label`. **No `aria-modal`** — focus is not trapped and outside-click dismisses, so claiming modality would wrongly hide the rest of the page from assistive tech |
| Badge | `aria-live="polite"` `aria-atomic="true"` |
| Sidenav toggle | `aria-expanded` and `aria-label` flip together ("Collapse navigation" ↔ "Expand navigation") |
| Slim mode | Labels are visually hidden, so each icon needs a tooltip — a name is still required |
| Current page | `aria-current="page"` on exactly one link (`ariaCurrentWhenActive`) |
| Focus ring | `outline: 2px solid var(--cnds-link-color)` `outline-offset: 2px`, matching `app.css` |
| Motion | Every animation checks `prefers-reduced-motion` at run time |
| Icons | Decorative `.mdi` glyphs are `aria-hidden="true"` |

---

## 9. Checklist

**Setup**

- [ ] Assets copied; `angular.json` styles in the order of §2.1
- [ ] `data-cnds-theme` on `<html>`, `cnds-product-casefusion` on `<body>`
- [ ] No per-component `<link>`/`<script>` anywhere
- [ ] `NIMBUS_READY` promise in place, with the already-fired guard

**Per component**

- [ ] `DataAPI.initAll(host)` in `ngAfterViewInit`, after `NIMBUS_READY`
- [ ] Every Nimbus instance disposed in `ngOnDestroy`
- [ ] No component-scoped styles targeting body-parented Nimbus DOM

**Behaviour**

- [ ] Theme toggle works and persists (`cnds-theme` key) — §0.2
- [ ] Opening any one header menu closes the other two
- [ ] Escape closes the open menu and returns focus to its trigger
- [ ] Outside click closes menus, including the body-parented popover
- [ ] Bell tooltip suppressed while the popover is open
- [ ] Expanding an unread notification decrements the badge and both counts
- [ ] Slim toggle: nav 220px ↔ 70px, content margin follows, icon and
      `aria-label` flip, tooltips appear in slim and disappear on expand
- [ ] Sidenav top offset tracks the header on resize and on header reflow
- [ ] `routerLinkActive` drives exactly one `.active` link and one
      `aria-current="page"`
- [ ] Parent category highlights when a child route is active

**Regression**

- [ ] Light and dark both render; no hard-coded hex outside the `--ca-*` block
- [ ] Zero console errors on load (a duplicate component script shows up here
      as `The superclass is not a constructor`)
- [ ] Navigating away and back does not accumulate `.tooltip` nodes on `<body>`
- [ ] Verified in WebKit, not only Chromium

---

## 10. Reference

| | |
| --- | --- |
| Component demos | `nimbus-v1/cnds-*.html` — `cnds-sidenav.html` "Category Items" is this nav's source pattern |
| Component manifest | `casefusion/1.6/manifest.json` |
| Core CSS/JS include blocks | `casefusion/1.6/includes/` |
| Sidenav component | `css/components/sidenav.css`, `js/components/sidenav.js` |
| Theme tokens | `css/themes/{primitives,light,dark}.css` |
| Product tokens | `css/themes/primitives.css` → `.cnds-product-casefusion` |
| DataAPI | `js/core/data-api.js` |
| Component base (`getInstance`/`dispose`) | `js/core/component.js` |
