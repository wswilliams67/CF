/* ═══════════════════════════════════════════════════════════════════════
   DATA MAP (PRD 01) — Meridian Biopharma demo
   Page:    pages/case-data-map.html  ·  CSS: css/demo/data-map.css
   Base:    the PRODUCTION CaseFusion 1.6 data map,
            casefusion/1.6/pages/pge_case_datamap.html (Scott, 10-16: "use it
            as the base for PRD 01"). Its markup, .dm-* CSS and behaviour
            script are ported here; its developer guide follows below, updated
            for the demo. Production issues found while porting (copy, pattern
            and accessibility quirks kept as they are) are listed with
            production line numbers in tools/datamap-production-issues.md.

   WHAT THE DEMO CHANGES, AND WHY
   · Shell: production's sidenav, utility header, case title, search and
     tabs are not copied. js/demo/shell.js renders them from the body's
     data-demo-* attributes, as on every demo page.
   · Data: production's inline sample arrays (DM_CASE_DATES, DM_SOURCE_DETAILS,
     DM_ITEM_EVENTS, DM_ALL_SOURCES, DM_SAVED_SCOPES, DM_PEOPLE,
     DM_CUSTODIAN_META, DM_EDIT_FILTERS, DM_TOTALS) are replaced by an
     ADAPTER (dmBuild, below) that builds the same shapes from data/meridian.js
     (M.sources, M.items, M.dataMap, M.custodians, M.people). The behaviour
     code reads those shapes as before. No generator: All Sources lists the
     case's 21 real sources, and every source drills in.
   · Reconciliation (production's numbers did not agree): the five cards sum
     to the summary line's first clause; the sources not integrated with
     CaseFusion (Box, Webex, file share: PRD 01 "No activity data", no card)
     have their own clause; Top Sources is the first six of All Sources;
     drawer locations sum to the row's items and Accessed sums to its events;
     a person's events in By People are the sum of their Accessed rows; one
     person has one role everywhere (M.people). Case Window / All Time and Add
     Date Range recount ALL of these, including the sources table (production
     left it unchanged and the date range only added a chip).
   · Keys: rows and exclusions are keyed by source id, people by person id
     (production keyed by display name). A name can be masked, so it is never
     an identity.
   · Regional access (demo rule): a person outside the viewer's regions reads
     as a lock + "Profile details limited" (D.canSee), never dimmed; their
     role, profile link and reasons are withheld, and MARK AS CUSTODIAN stays
     visible but disabled with the reason. Guests carry a "Guest" badge and
     the same disabled action. Check ?viewer=v-us and ?viewer=v-row.
   · Loading: every list shows Nimbus skeletons (css/components/loading.css)
     in its real geometry until DM_API.loadDataMap() resolves. ?skeleton=1
     holds that state for review (DEMO ONLY: do not build).
   · Finalize / Export notes count what is in scope now (filters minus
     exclusions); loading a saved scope restores its window AND its excluded
     sources (production restored the window only).
   ═══════════════════════════════════════════════════════════════════════ */
/*
 * ══════════════════════════════════════════════════════════════════════════
 * DEVELOPER GUIDE
 * ══════════════════════════════════════════════════════════════════════════
 * This page is a behavioural spec for PRD 01 on Meridian demo data. Every
 * interaction in the production flows can be clicked through; all data is
 * local and every server call is stubbed. Read this before porting.
 *
 * HOW THE FILE IS ORGANISED
 * ─────────────────────────
 *   css/demo/data-map.css   page-local CSS. Anything prefixed .dm-* is
 *                  datamap-specific; everything else comes from Nimbus. Do not
 *                  restyle Nimbus components here — set their documented custom
 *                  properties instead (see CSS RULES).
 *   this file, top ADAPTER + LOAD SEAM. Builds the DATA ARRAYS from
 *                  data/meridian.js (production had them inline at parse time;
 *                  replace dmBuild with API responses).
 *   markup         Static structure. Anything rendered from a data array is
 *                  marked with a comment saying so.
 *   this file, dmStart  BEHAVIOUR (production's script). Shared helpers first,
 *                  then one IIFE per flow, each labelled with its Figma node id.
 *
 * DATA ARRAYS  (all on window, all shaped like the eventual API payload)
 * ─────────────────────────────────────────────────────────────────────
 *   DM_CASE_DATES     { start, end }              Add Date Range defaults (case window)
 *   DM_EDIT_FILTERS   { custodians[], sourceTypes[], custodianTags[] }
 *   DM_TOTALS         { [window]: { scopeLabel, sources[5] } }  the 5 source cards
 *                     (summary line: dmSummaryText; export / finalize counts:
 *                     dmScopeCounts — both follow filters and exclusions)
 *   DM_ALL_SOURCES    { total, rows[] }           every source, items high → low:
 *                     { id, type, name, path, masked, items, itemsText, max, bar,
 *                       events (null = no activity data), people }
 *   DM_PEOPLE         { [window]: { totals[4], custodians[] } }
 *                     custodian: { rank, pid, name, role, masked, sources, events,
 *                                  hold, signal, level }
 *   DM_CUSTODIAN_META { [personId]: {id, tags[]} } case-scoped custodian attributes
 *   DM_SAVED_SCOPES   []                          saved scopes (Finalize appends);
 *                     + excluded[] (source ids) and custodians[] from Meridian
 *   DM_SOURCE_DETAILS { [sourceId]: detail }      built on first open (dmSourceDetail)
 *   DM_NOTABLE        []                          Notable Non-Custodians rows
 *   DM_EXCLUSIONS     { [sourceId]: entry[] }      applied exclusions (committed)
 *                     Each entry carries its display `name`, and `sid`.
 *   Only the active window is built (dmBuild(window, range)); switching the
 *   window or adding a date range rebuilds every array above.
 *
 * SOURCE DETAIL SHAPE — what the drawer renders
 * ─────────────────────────────────────────────
 *   { type, path, tabs[], exclude?, locations?[], items?{}, participants?[],
 *     accessed?[], sessions?[] }
 *
 *   `tabs` drives everything: the pill row, the column set, the sort options and
 *   the footer. Tab keys and their row shapes:
 *     location      { path, items, lastActivity }        SharePoint · OneDrive
 *     item          { name, type, modified, ual, owner }  keyed by location in items{}
 *     participants  { name, role, since, status }         Teams
 *     accessed      { name, role, events, status }        all types
 *     sessions      { name, role, sessions }              Copilot
 *
 *   `exclude` names the unit this source refines scope by. Omit it and the
 *   location default applies (SharePoint/OneDrive/Teams); Copilot overrides it
 *   because it has no folder tree and excludes PEOPLE instead:
 *     { tab, key, metricKey, unit, units, metric }
 *   Everything downstream — banner copy, chip text, the scope footer — reads
 *   these nouns, which is why a mixed set of exclusions can say
 *   "2 exclusions · 5 items · 11 sessions removed" without special-casing.
 *
 * NO GENERATED SOURCE DETAIL (demo)
 * ─────────────────────────────────
 *   Production built 600 rows and their drawers from a seeded generator. The
 *   demo lists the case's real sources only, and dmSourceDetail(id) derives each
 *   drawer from M.dataMap: locations (summing to the source's items), sample
 *   items per location, Accessed (summing to its events), Teams participants,
 *   and Copilot sessions. Sources CaseFusion does not integrate with (Box, Webex,
 *   file share) open on Location View with their one location and `note`, which
 *   replaces the hint. dmItemEvents(sourceId, item) builds Item Details from the
 *   people on that source's Accessed list. In production: GET /sources/:id/detail.
 *
 * EXCLUSIONS  (two surfaces, one store)
 * ────────────────────────────────────
 *   Scope is refined by excluding sources or their children. Two entry points
 *   write to the SAME DM_EXCLUSIONS store:
 *
 *   1) SOURCES TABLE — the trailing Exclude column (Top + All Sources). Commits
 *      ON CLICK: one click excludes the whole source, a second restores it. No
 *      staging. Entry: { whole:true, name, path:'— entire source', items, unit,
 *      units, metric }.
 *   2) VIEW SOURCE DRAWER — per-child (location / session) exclusions. STAGES,
 *      then commits on APPLY EXCLUSIONS; CANCEL discards. Entry per child:
 *      { path, items, name, unit, units, metric }.
 *
 *   KEYING (demo) — the demo keys by source id, the API's identity, as the
 *   Angular notes below recommend; dmExKey(id) returns it. Production's text:
 *   KEYING — DM_EXCLUSIONS is keyed by dmExKey(name, path, occurrence), NOT by
 *   name. All Sources could hold byte-identical rows, so name alone would make
 *   excluding one exclude them all. Occurrence disambiguates; unique sources get
 *   occurrence 0, so the SAME source shares one key across Top and All Sources.
 *   Each entry stores `name` because the key itself is not human-readable (the
 *   chips read entry.name). Rows carry the key in data-dm-xid; the drawer inherits
 *   it from the clicked row (S.exKey). dmHasWhole(entries) is the one predicate
 *   that answers "is this source wholly excluded?".
 *
 *   SUPERSEDE — committing a whole-source exclusion REPLACES that source's child
 *   entries (same key), so the two can never double-count.
 *
 *   READ-OUT — a whole-source exclusion shows as: red row + EXCLUDED button in the
 *   table; and in the drawer, an "Entire source excluded" alert with every child
 *   button disabled (children keep their default look, not red). A PARTIAL
 *   exclusion (children only) shows the amber "Exclusions Applied" badge instead.
 *   dmSyncExclusions() re-derives the chips, badges and scope footer from the store.
 *
 * API CONTRACT
 * ────────────
 *   window.DM_API — one entry per round-trip: exportCsv, saveScope, loadScope,
 *   renameScope, deleteScope, applyExclusions, markCustodian. Each returns a
 *   Promise. Resolve on success; reject with an Error whose .message is shown in
 *   the error toast. applyExclusions(name, entries) with an empty array = restore. Every call goes through dmRun(), which owns the
 *   success/error toasts so behaviour stays consistent. This is the ONLY place
 *   the page talks to a server.
 *
 * CROSS-FLOW SEAMS  (globals one flow exposes for another — keep them explicit)
 * ────────────────────────────────────────────────────────────────────────────
 *   dmWindow            'caseWindow' | 'allTime' — active time window
 *   dmRange             { from, to } ISO dates | null — Add Date Range (demo)
 *   dmTypeFilter        applied Source Types | null (demo: the summary follows it)
 *   dmTable             { setSourceFilter(arr|null), setScope('top'|'all'), icon(type),
 *                         rebuild(animate) }
 *   dmClearSourceFilter clear the summary-card breadcrumb filter
 *   dmFilterPeople      { custodians, tags } — filters the custodians table
 *   dmRenderPeople      re-render By People for a window
 *   dmRenderTotals      rebuild the data and re-render cards, summary, both tables (demo)
 *   dmSetRange(range)   apply / clear the date range and recount (demo)
 *   dmRenderScopes      re-render the Saved Scopes menu
 *   dmClearDateRange    drop the date chip, reset fields to the case window
 *   dmSyncRefinedClear  re-evaluate which refined-results clear buttons apply
 *   dmClearAllFilters   reset every filter + the date range
 *   dmOpenSource(id)    open the View Source drawer for a source id
 *   dmSourceDetail(id)  build/serve a source's detail (adapter)
 *   dmItemEvents(id, item)       build/serve an item's UAL activity (adapter)
 *   dmSyncExclusions    re-render chips + scope footer from DM_EXCLUSIONS
 *   dmRefreshExclusionCounts     re-derive entry counts for a new window (demo)
 *   dmSyncRefined       show/hide the Refined Results card for its chip count
 *   dmMarkCustodian(personId, btn)  promote a person (API owns the real change)
 *   dmAddNotableNonCustodian(p)  push a new person into the insight card
 *   dmToast(variant,title,msg)   the only way this page raises a toast
 *   dmNum(v)            the one numeric parser ("1,204" → 1204)
 *   dmEsc(s)            the one HTML escaper — use it on every interpolated value
 *   dmExKey(id)         exclusion identity key (demo: the source id)
 *   dmHasWhole(entries) is a source wholly excluded?
 *   In Angular these all collapse into one store — see below.
 *
 * MOTION  (three primitives; everything on the page uses one of them)
 * ──────────────────────────────────────────────────────────────────
 *   dmCrossfade(el, mutate)      content swap inside a stable frame. Clones the
 *                                current pixels into a fixed ghost, runs mutate()
 *                                underneath, fades ghost out / element in, and
 *                                animates the height old→new.
 *   dmFadeCard(card, show)       a whole card entering or leaving the column.
 *   dmSwapViews(stack, out, in)  two mutually-exclusive sibling views.
 *
 *   Durations are CSS custom properties on .dm-main:
 *     --dm-swap 220ms   content changing inside a stable frame
 *     --dm-card 350ms   a card entering or leaving the page
 *
 *   Rules learned the hard way — keep them when porting:
 *   • dmCrossfade has a RE-ENTRANCY GUARD. Swaps cascade (scope change →
 *     re-filter → re-page); only the outermost call animates, so ghosts never
 *     stack. Nested calls just mutate.
 *   • Collapsing a card needs padding AND border animated, not just height:
 *     with box-sizing:border-box the box cannot go below padding+border, so
 *     height alone stalls and then snaps.
 *   • A flex item needs min-height:0 or it refuses to shrink below content size.
 *   • Write the "from" frame with transitions suppressed (.dm-no-anim), force a
 *     reflow, then enable them. Setting the start state while the transition is
 *     live turns the start value into an animation the next frame reverses.
 *   • Never transition to '' — it is not an animatable value. Use explicit px.
 *   • Finish on transitionend with a timeout fallback, not a bare timer.
 *   • Typing must NOT crossfade. refresh(animate) is opt-in: filters/sorts pass
 *     true, keystrokes don't — a ghost per keystroke reads as flicker.
 *
 * INVARIANTS  (break these and the page lies to the user)
 * ──────────────────────────────────────────────────────
 *   • Filtering and pagination COMPOSE: filters produce a matching[] set, the
 *     pager slices it, and filtering always returns to page 1.
 *   • The Case Window / All Time toggle cascades to the summary line, the
 *     totals cards AND both table views from a single place.
 *   • Source Types filters the sources table only — never the people table.
 *     Custodians + Custodian Tags filter the people table only.
 *   • Shared saved scopes (author set) expose LOAD only — never rename/delete.
 *   • Committing actions mutate local state only on resolve, so a rejected API
 *     call leaves the UI unchanged.
 *   • Only the tab named by exclCfg().tab can exclude; every other tab's footer
 *     collapses to CLOSE.
 *
 * KNOWN ACCESSIBILITY DEBT  (audited 2026-07-23, axe-core + manual keyboard)
 * ─────────────────────────────────────────────────────────────────────────
 *   Section 508 does NOT currently pass. Fix before shipping:
 *   • buttons.css uses --cnds-btn-active-shadow in 3 rules but never defines it.
 *     An unresolvable var() invalidates the whole declaration, so EVERY selected
 *     button loses its focus ring (WCAG 2.4.7). One-line fix in the design system.
 *   • Notable Non-Custodians link + MARK AS CUSTODIAN: #6790ca on #fff3cc = 2.95,
 *     needs 4.5 (WCAG 1.4.3). These are page-local literals — see CSS RULES.
 *   • Nimbus/Select filter inputs have no accessible name (WCAG 4.1.2).
 *   • #dmScopesMenu is role="menu" with no role="menuitem" children (WCAG 1.3.1).
 *   • Dialogs trap focus and close on Esc correctly, but focus does NOT return
 *     to the opener on close. Store the trigger and restore it.
 *
 * ANGULAR CONVERSION
 * ══════════════════════════════════════════════════════════════════════════
 * COMPONENT TREE
 *   DataMapPageComponent                     (route: /case/:id/datamap)
 *   ├─ FiltersToolbarComponent               chips · window toggle · actions
 *   │   ├─ DateRangeMenuComponent            two datepickers + validation
 *   │   └─ EditFiltersPanelComponent         3 multi-selects + apply/clear
 *   ├─ RefinedResultsComponent               removable refinement chips
 *   ├─ ViewToolsComponent                    By Source/By People · Export CSV
 *   ├─ BySourceViewComponent
 *   │   ├─ SourceTotalsComponent             5 clickable summary cards
 *   │   └─ SourcesTableComponent             Top/All scope · pager
 *   │       └─ SourceExcludeCell             commit-on-click whole-source exclude
 *   ├─ ByPeopleViewComponent
 *   │   ├─ PeopleTotalsComponent             4 static totals cards
 *   │   └─ CustodiansTableComponent          + TableToolsComponent
 *   ├─ NotableNonCustodiansComponent         collapsible warning alert
 *   ├─ ScopeFooterComponent                  Load Saved Scope · Finalize
 *   ├─ SourceDetailDrawerComponent           View Source offcanvas
 *   │   ├─ SourceTabsComponent               pills driven by detail.tabs
 *   │   ├─ SourceTableComponent              columns/sort chosen per tab
 *   │   ├─ ExclusionBannerComponent          staged-exclusion summary
 *   │   └─ ItemActivityDrawerComponent       stacked offcanvas (UAL events)
 *   └─ modals: ExportCsv · FinalizeScope · RenameScope · DeleteScopeConfirm
 *
 * STATE → one DataMapStore (signals, or BehaviorSubject on older Angular)
 *   interface DataMapState {
 *     window: 'caseWindow' | 'allTime';
 *     view: 'source' | 'people';
 *     sourceScope: 'top' | 'all';
 *     filters: { custodians: string[]|null; sourceTypes: string[]|null; tags: string[]|null };
 *     cardFilter: string | null;              // summary-card breadcrumb
 *     dateRange: { from: Date; to: Date } | null;
 *     tableTools: { q: string; show: string; sortBy: string; dir: 'asc'|'desc' };
 *     page: { index: number; size: number };
 *     drawer: { source: string|null; tab: TabKey; location: string|null;
 *               staged: string[] } | null;      // staged = not yet applied
 *     exclusions: Record<string, ExclusionEntry[]>;   // keyed by source ID
 *   }
 *   interface ExclusionEntry { path: string; items: string; name: string;
 *                              whole?: boolean;   // true = entire source
 *                              unit: string; units: string; metric: string; }
 *   Derive visible rows with computed()/selectors — filter, then sort, then
 *   slice. That is exactly what recompute() + dmCreatePager() do here, and it
 *   preserves the compose-invariant for free.
 *
 * SERVICES
 *   DataMapApiService  ← window.DM_API, one method per key, returning
 *                        Observable<void> (or the created/updated entity).
 *                        Keep the error contract: err.message reaches the toast.
 *   ToastService       ← dmToast(), same three variants (success/error/info).
 *   SourceDetailService← dmSourceDetail()/dmItemEvents(). In production this is
 *                        NOT a factory: call getSourceDetail(sourceId) and render
 *                        the response. The generator here exists only so the
 *                        prototype has plausible data for 600 rows — delete it.
 *                        DM_EXCLUSIONS is keyed by dmExKey(name,path,occurrence),
 *                        a synthetic stand-in for the real source ID — use the
 *                        API's ID directly and drop dmExKey. Excluding commits via
 *                        applyExclusions(id, entries); empty array = restore.
 *
 * NIMBUS COMPONENTS IN ANGULAR — read before wiring
 *   • nimbus.js is an ASYNC LOADER. Component classes (Nimbus.Select, .Modal,
 *     .Datepicker …) do NOT exist synchronously. Here everything waits for the
 *     `cnds.ready` event; in Angular initialise in ngAfterViewInit and still
 *     guard, or wrap each component in a directive that waits.
 *   • Prefer the CSS-only variants where they exist (pagination toolbar, alerts,
 *     notes, chips, toolbars) — no JS needed and they port cleanly.
 *   • Nimbus/Select ABSORBS an associated <label for> into its own floating
 *     label. Use a plain <span> + aria-label when the label must stay outside.
 *   • Nimbus/Select renders its dropdown to <body>: an overflow:hidden ancestor
 *     won't clip it, but it also escapes Angular's view encapsulation — keep
 *     those styles global rather than reaching for ::ng-deep everywhere.
 *   • The datepicker is single-date only; the range UI here is two instances
 *     with cross-validation. Its format is numeric (mm/dd/yyyy) — the friendly
 *     "Jan 15 – Jun 30, 2026" chip label is formatted separately.
 *
 * ANGULAR TRANSITIONS — porting the motion layer
 * ──────────────────────────────────────────────
 *   The three JS primitives exist because plain HTML has no animation runtime.
 *   Angular does, so DO NOT port dmCrossfade/dmFadeCard/dmSwapViews as-is —
 *   replace each with the idiomatic equivalent below. Import
 *   BrowserAnimationsModule (or provideAnimations()) once at the app root.
 *
 *   Shared timings — declare once and reuse, mirroring the CSS custom properties:
 *     const SWAP = '220ms cubic-bezier(0.4, 0, 0.2, 1)';   // --dm-swap
 *     const CARD = '350ms cubic-bezier(0.4, 0, 0.2, 1)';   // --dm-card
 *
 *   1) dmCrossfade → @trigger on the repeated rows, NOT a manual ghost.
 *      Angular keeps the leaving nodes in the DOM for the duration of :leave,
 *      so you get a real crossfade for free — the ghost clone was only ever a
 *      workaround for that. Key the *ngFor so Angular can tell rows apart.
 *
 *        trigger('rowSwap', [
 *          transition('* => *', [
 *            query(':enter', [style({opacity: 0}), animate(SWAP, style({opacity: 1}))],
 *                  {optional: true}),
 *            query(':leave', [animate(SWAP, style({opacity: 0}))], {optional: true}),
 *          ]),
 *        ])
 *
 *      Bind it to the value that changes — [@rowSwap]="page.index" on <tbody>,
 *      or on the table when the whole tab changes. Do NOT bind it to a keystroke
 *      stream: search input must not animate (see MOTION, last bullet). Debounce
 *      the query into a signal and animate only filter/sort/page changes.
 *
 *   2) dmFadeCard → :enter/:leave with height, padding and border animated.
 *      Keep all three. The stall-then-snap bug is a box-sizing consequence, not
 *      a JS one, so it reproduces identically in Angular if you animate height
 *      alone. min-height:0 still belongs in the component's CSS.
 *
 *        trigger('cardFade', [
 *          transition(':enter', [
 *            style({opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0,
 *                   borderTopWidth: 0, borderBottomWidth: 0, overflow: 'hidden'}),
 *            animate(CARD, style({opacity: 1, height: '*', paddingTop: '*',
 *                   paddingBottom: '*', borderTopWidth: '*', borderBottomWidth: '*'})),
 *          ]),
 *          transition(':leave', [
 *            style({overflow: 'hidden'}),
 *            animate(CARD, style({opacity: 0, height: 0, paddingTop: 0,
 *                   paddingBottom: 0, borderTopWidth: 0, borderBottomWidth: 0})),
 *          ]),
 *        ])
 *
 *      `height: '*'` is Angular measuring the natural height for you — it is the
 *      direct replacement for the measure-then-pin dance in dmFadeCard, and it
 *      removes the "never transition to ''" hazard entirely.
 *      Use with *ngIf, not [hidden], so :leave actually fires.
 *
 *   3) dmSwapViews → group() the two views so they overlap, and let the host
 *      animate its own height. The absolute-positioning trick is still needed:
 *      without it both views are in flow at once and the page jumps.
 *
 *        trigger('viewSwap', [
 *          transition('* <=> *', [
 *            style({position: 'relative'}),
 *            query(':enter, :leave',
 *                  [style({position: 'absolute', top: 0, left: 0, right: 0})],
 *                  {optional: true}),
 *            group([
 *              query(':leave', [animate(SWAP, style({opacity: 0}))], {optional: true}),
 *              query(':enter', [style({opacity: 0}), animate(SWAP, style({opacity: 1}))],
 *                    {optional: true}),
 *            ]),
 *          ]),
 *        ])
 *
 *   4) The exclusion banner and the insight-row retirement are both
 *      :enter/:leave on *ngIf — no bespoke code. The 700ms "hold" before a
 *      promoted row leaves is deliberate UX (it confirms which row was acted
 *      on); keep it as animate('700ms', style({})) at the head of :leave, or as
 *      a timer in the store. Do not delete it.
 *
 *   REDUCED MOTION is not automatic in Angular. Either gate the triggers
 *     @HostBinding('@.disabled') reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
 *   or keep the CSS media query. The prototype disables every transition; match
 *   that — it is an accessibility requirement, not a preference.
 *
 *   WHAT NOT TO CARRY OVER
 *   • The ghost-clone technique (dmCrossfade internals) — Angular's :leave
 *     replaces it. Cloning nodes in Angular fights change detection.
 *   • The re-entrancy guard — Angular serialises animations per trigger.
 *   • The transitionend + setTimeout cleanup pair — Angular's done callbacks
 *     already handle this.
 *   • Manual .hidden toggling — use *ngIf so :enter/:leave fire at all.
 *
 * CSS RULES WHEN PORTING
 *   • Restyle Nimbus components through their custom properties, never by
 *     overriding declarations (--cnds-progress-bar-bg, not .progress-bar
 *     { background }). Several fixes in this file depend on that.
 *   • typography.css sets a global `p { color: var(--cnds-body-color) }`. Any
 *     panel with its own text colour must re-assert it on paragraphs
 *     (see .dm-insight p { color: inherit }).
 *   • Never put overflow clipping on an ancestor of an absolutely-positioned
 *     menu — WebKit coerces the other axis and clips it (see #UtilityNav).
 *   • The warning alert panel stays light in BOTH themes; its colours are
 *     intentionally literal, not theme tokens. Two of those literals FAIL AA
 *     contrast (2.95:1) — see KNOWN ACCESSIBILITY DEBT. Darken the link/button
 *     ink rather than reintroducing theme tokens, or the panel breaks in dark.
 *   • When a control appears and disappears next to static text, hide it with
 *     `visibility` and give the row a min-height, so the text never shifts.
 *     .dm-refined-head + .dm-refined-actions .btn are the reference implementation.
 *   • Icon buttons should carry fill="currentColor" and NO colour rule of their
 *     own — .btn.active already applies --cnds-btn-active-color, so the glyph
 *     tracks the button's state for free. A page-level override silently wins
 *     on equal specificity via source order and desynchronises the two.
 */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo;
  var DM = M.dataMap;
  var esc = D.esc;   /* escapes quotes too: used for attributes built in the adapter */

  /* ══════════════════════════════════════════════════════════════════════
     NIMBUS READY
     nimbus.js loads its components asynchronously and fires cnds.ready once.
     The behaviour flows below start when the data load seam resolves, which
     can be before or after that event, so they wait through dmWhenNimbus.
     ══════════════════════════════════════════════════════════════════════ */
  var dmNimbusReady = false;
  document.addEventListener("cnds.ready", function () { dmNimbusReady = true; }, { once: true });
  function dmWhenNimbus(fn) {
    if (dmNimbusReady) fn();
    else document.addEventListener("cnds.ready", function () { dmNimbusReady = true; fn(); }, { once: true });
  }

  /* ══════════════════════════════════════════════════════════════════════
     ADAPTER — Meridian data → production's data-array shapes
     Stands in for the API. Each function below names the production array it
     replaces; the behaviour code reads the arrays exactly as production did,
     except where a "Demo:" comment says otherwise.
     ══════════════════════════════════════════════════════════════════════ */

  /* Source kinds. The five Microsoft 365 workloads have summary cards and
     glyphs (harvested from the cards' inline SVG); the rest are sources
     CaseFusion does not integrate with: listed, "No activity data", no card. */
  var DM_KIND = { "SharePoint": "sharepoint", "Microsoft Teams": "teams", "OneDrive": "onedrive", "Exchange Online": "exchange",
                  "Copilot interactions": "copilot", "Box": "box", "Webex": "webex", "File share": "fileshare" };
  var DM_TYPE_LABEL = { sharepoint: "SharePoint", teams: "Teams", onedrive: "OneDrive", exchange: "Exchange", copilot: "Copilot",
                        box: "Box", webex: "Webex", fileshare: "File share" };
  var DM_TYPES = ["sharepoint", "teams", "onedrive", "exchange", "copilot", "box", "webex", "fileshare"];
  var DM_CARD_TYPES = DM_TYPES.slice(0, 5);   /* order matches the cards in #dmStatGrid */
  var DM_MDI_ICONS = { box: "mdi-package-variant-closed", webex: "mdi-video-outline", fileshare: "mdi-folder-network-outline" };

  /* Regional access and guests (demo rules, see the header). */
  var DM_PROFILE_HREF = "not-in-demo.html?what=" + encodeURIComponent("Persona profile");
  var DM_REASON_MASKED = "Outside your regions: the case team in this person's region can mark them as a custodian.";
  var DM_REASON_GUEST = "A guest is not a natural person in CaseFusion, so cannot be a custodian.";

  /* The case's data map sources: every requested source except devices added
     for a custodian (21: check.js asserts the count and the 18,770 events). */
  var SOURCES = M.holdStatusSources().filter(function (s) { return !s.addedForCustodian; });
  var CUSTODIANS = M.custodians.map(function (c) { return c.personId; });
  var dmAdded = {};   /* person id → true once marked as a custodian on this page */

  var nf = function (n) { return Math.round(n).toLocaleString("en-US"); };
  function dmById(id) { for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i]; return null; }
  function dmIsCustodian(pid) { return !!dmAdded[pid] || CUSTODIANS.indexOf(pid) !== -1; }
  function dmPersonText(pid) { return D.nameFor(M.person(pid)); }
  function dmMaskedHtml() { return '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>'; }
  function dmGuestBadge() { return ' <span class="badge badge-secondary dm-guest-badge">Guest</span>'; }
  /* MARK AS CUSTODIAN that cannot apply here: disabled, never hidden, with the
     reason on hover (title on the wrapper, since a disabled button gets no
     pointer events) and for screen readers (visually hidden text). */
  function dmBlockedMark(reason, cls) {
    return '<span class="dm-mark-blocked" title="' + esc(reason) + '"><button type="button" class="btn btn-tertiary btn-sm ' + cls + '" disabled>Mark as Custodian</button>' +
      '<span class="visually-hidden">' + esc(reason) + "</span></span>";
  }
  function dmAlias(p) { var a = p.upn.split("."); return (a[0].charAt(0) + a[a.length - 1]).toLowerCase(); }

  /* ── Dates ──────────────────────────────────────────────────────────── */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dmParseIso(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dmIso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  /* Production's chip format ("Jan 15 – Jun 30, 2026"), reused for the summary line. */
  function dmFmtRange(a, b) {
    var sameYear = a.getFullYear() === b.getFullYear();
    return MONTHS[a.getMonth()] + " " + a.getDate() + (sameYear ? "" : ", " + a.getFullYear()) + " – " +
      MONTHS[b.getMonth()] + " " + b.getDate() + ", " + b.getFullYear();
  }
  function dmUsDate(iso) { var p = iso.split("-"); return p[1] + "/" + p[2] + "/" + p[0]; }   /* the datepickers' mm/dd/yyyy */
  /* Saved-scope stamp: the house date (mm-dd-yyyy) and a 12-hour time. */
  function dmSavedAt(iso, time) {
    if (time instanceof Date) { var h = time.getHours(); time = ((h % 12) || 12) + ":" + ("0" + time.getMinutes()).slice(-2) + " " + (h < 12 ? "AM" : "PM"); }
    return M.fmtDate(iso) + " · " + time;
  }

  /* ── Time model ─────────────────────────────────────────────────────────
     Items and events in M are the case window's. DEMO ONLY: All Time adds
     tenant history before the window (ALL_START onwards) at 37% of the
     window's volume, spread evenly; a date range takes the share of each
     period it overlaps. One factor scales every count, and dmScale splits it
     so the parts still sum to the whole. ─────────────────────────────── */
  var ALL_START = "2021-01-01";
  var PRIOR_SHARE = 0.37;
  function dmDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1; }
  function dmOverlap(a, b, c, d) { var s = a > c ? a : c, e = b < d ? b : d; return s > e ? 0 : dmDays(s, e); }
  function dmFactor(win, range) {
    var ws = M.window.start, we = M.window.end;
    var pe = dmIso(new Date(dmParseIso(ws).getTime() - 864e5));
    var from = range ? range.from : (win === "allTime" ? ALL_START : ws), to = range ? range.to : we;
    var f = dmOverlap(from, to, ws, we) / dmDays(ws, we);
    if (win === "allTime") f += PRIOR_SHARE * dmOverlap(from, to, ALL_START, pe) / dmDays(ALL_START, pe);
    return f;
  }
  /** Scale parts by f with largest-remainder rounding: the parts sum to round(total × f). */
  function dmScale(vals, f) {
    var raw = vals.map(function (v) { return v * f; });
    var out = raw.map(Math.floor);
    var target = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) * f);
    var rest = target - out.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (v, i) { return [v - Math.floor(v), i]; })
      .sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })
      .slice(0, rest).forEach(function (x) { out[x[1]]++; });
    return out;
  }

  /* ── Source naming (production style: name + a muted location line) ──── */
  function dmSourceName(s) {
    var k = DM_KIND[s.type], p = s.owner ? M.person(s.owner) : null;
    if (p && !D.canSee(p)) return { title: "Profile details limited", loc: "Outside your regions", masked: true };
    if (k === "exchange") return { title: p.name + " mailbox", loc: s.name };
    if (k === "onedrive") return { title: dmAlias(p) + " OneDrive", loc: M.tenant.oneDriveHost + "/personal/" + dmAlias(p) };
    if (k === "copilot") return { title: "Copilot · " + p.name, loc: "Copilot.M365Copilot · " + dmAlias(p) };
    if (k === "teams") return { title: s.name, loc: "Teams team · " + (M.locations[s.id] || "") };
    if (k === "sharepoint") return { title: s.name + " site", loc: M.tenant.sharePointHost + (M.locations[s.id] || "") };
    return { title: s.name, loc: dmPlainLocation(s) + " · " + DM_TYPE_LABEL[k] };
  }
  /* The one location of a source CaseFusion does not integrate with. */
  function dmPlainLocation(s) { return (M.locations[s.id] || s.name).replace(/^[^·]+· /, ""); }

  /* ── Hold, per custodian (case-scoped: does not vary by window) ──────── */
  function dmHoldOf(pid) {
    var c = M.custodians.filter(function (x) { return x.personId === pid; })[0];
    if (c && c.released) return "Released";
    if (dmAdded[pid]) return "No";   /* just added: not notified, nothing requested */
    var src = M.sourcesOf(pid);
    if (src.some(function (s) { return s.hold === "Applied" || s.hold === "Attested"; })) return "Active";
    if (src.some(function (s) { return s.hold === "Applying"; })) return "Pending";
    return "No";
  }

  /* Accessed events per source for the active factor: { sourceId: [[pid, events]] }. */
  var dmAccessed = {};
  function dmBuildAccessed(f) {
    dmAccessed = {};
    Object.keys(DM.accessed).forEach(function (id) {
      var list = DM.accessed[id], scaled = dmScale(list.map(function (a) { return a[1]; }), f);
      dmAccessed[id] = list.map(function (a, i) { return [a[0], scaled[i], a[1]]; });   /* [pid, events now, events in the case window] */
    });
  }

  /** Builds every DATA ARRAY for a window and optional date range { from, to } (ISO). */
  function dmBuild(win, range) {
    var f = dmFactor(win, range);
    window.dmFactor = f;
    dmBuildAccessed(f);
    window.DM_SOURCE_DETAILS = {};   /* built per source on first open */
    dmItemCache = {};

    /* DM_ALL_SOURCES — every source, items high → low. */
    var rows = SOURCES.map(function (s) {
      var n = dmSourceName(s), items = Math.round((M.items[s.id] || 0) * f);
      var events = s.events == null ? null : Math.round(s.events * f), acc = (DM.accessed[s.id] || []).length;
      return { id: s.id, type: DM_KIND[s.type], name: n.title, path: n.loc, masked: !!n.masked, items: items, itemsText: nf(items), events: events,
               people: events == null ? "No activity data" : acc + (acc === 1 ? " person" : " people") };
    }).sort(function (a, b) { return b.items - a.items || a.name.localeCompare(b.name); });
    var max = rows.length ? rows[0].items : 0;
    rows.forEach(function (r) { r.max = max; r.bar = max ? Math.max(2, Math.round(r.items / max * 100)) : 0; });
    window.DM_ALL_SOURCES = { total: rows.length, rows: rows };

    /* DM_TOTALS — the five cards for this window (each card: its own type's sources). */
    window.DM_TOTALS = {};
    window.DM_TOTALS[win] = {
      scopeLabel: win === "allTime" ? "All time scope" : "Case window scope",
      sources: DM_CARD_TYPES.map(function (t) {
        var list = rows.filter(function (r) { return r.type === t; });
        return { items: nf(list.reduce(function (n, r) { return n + r.items; }, 0)),
                 sources: list.length + (list.length === 1 ? " source" : " sources"),
                 ual: nf(list.reduce(function (n, r) { return n + (r.events || 0); }, 0)) + " UAL events" };
      })
    };

    /* DM_PEOPLE — By People for this window. */
    window.DM_PEOPLE = {};
    window.DM_PEOPLE[win] = dmBuildPeople();

    /* DM_CUSTODIAN_META — id + tags per custodian (tags managed on the Custodians tab). */
    window.DM_CUSTODIAN_META = {};
    CUSTODIANS.concat(Object.keys(dmAdded)).forEach(function (pid) {
      window.DM_CUSTODIAN_META[pid] = { id: pid, tags: Object.keys(DM.tags).filter(function (t) { return DM.tags[t].indexOf(pid) !== -1; }) };
    });
  }

  /* DM_PEOPLE[window] — custodians ranked by events. A custodian's sources are
     the in-case sources they own or have activity on; their events are the sum
     of their Accessed rows. Relevance: High 2,000+, Medium 500+, Low below;
     "meaningful UAL activity" = Medium or High, so the cards and bars agree. */
  function dmBuildPeople() {
    var ids = CUSTODIANS.concat(Object.keys(dmAdded).filter(function (id) { return CUSTODIANS.indexOf(id) === -1; }));
    var list = ids.map(function (pid) {
      var src = 0, ev = 0;
      SOURCES.forEach(function (s) {
        var a = (dmAccessed[s.id] || []).filter(function (x) { return x[0] === pid; })[0];
        if (a || s.owner === pid) { src++; ev += a ? a[1] : 0; }
      });
      var p = M.person(pid);
      return { pid: pid, p: p, sourcesN: src, eventsN: ev, hold: dmHoldOf(pid) };
    }).sort(function (a, b) { return b.eventsN - a.eventsN || a.p.name.localeCompare(b.p.name); });
    var max = list.length ? Math.max(1, list[0].eventsN) : 1;
    var custodians = list.map(function (r, i) {
      var level = r.eventsN >= 2000 ? "High" : r.eventsN >= 500 ? "Medium" : "Low";
      var ok = D.canSee(r.p);
      return { rank: i + 1, pid: r.pid, name: ok ? r.p.name : "Profile details limited", role: ok ? r.p.title : "—", masked: !ok,
               sources: String(r.sourcesN), events: nf(r.eventsN), hold: r.hold,
               signal: Math.max(2, Math.round(r.eventsN / max * 100)), level: level };
    });
    var meaningful = custodians.filter(function (c) { return c.level !== "Low"; }).length;
    return {
      totals: [
        { label: "CUSTODIANS IN THE CASE",  value: String(custodians.length) },
        { label: "ON HOLD - THIS CASE",     value: String(custodians.filter(function (c) { return c.hold === "Active"; }).length) },
        { label: "MEANINGFUL UAL ACTIVITY", value: String(meaningful) },
        { label: "MINIMAL / NO ACTIVITY",   value: String(custodians.length - meaningful) }
      ],
      custodians: custodians
    };
  }

  /* After MARK AS CUSTODIAN: the new custodian joins By People (hold "No") and its totals. */
  function dmRebuildPeople() {
    window.DM_PEOPLE[window.dmWindow] = dmBuildPeople();
    Object.keys(dmAdded).forEach(function (pid) {
      window.DM_CUSTODIAN_META[pid] = { id: pid, tags: Object.keys(DM.tags).filter(function (t) { return DM.tags[t].indexOf(pid) !== -1; }) };
    });
  }

  /* Person row for the drawer's person tabs (production: { name, role, … status }).
     "_" keys are internal: never shown, never searched. */
  function dmPersonRow(pid) {
    var p = M.person(pid), ok = D.canSee(p);
    return { name: ok ? p.name : "Profile details limited", role: ok ? p.title : "—", _pid: pid, _masked: !ok, _guest: !!p.guest };
  }

  /** DM_SOURCE_DETAILS[id] — the View Source drawer's data for one source. */
  function dmSourceDetail(id) {
    var cache = window.DM_SOURCE_DETAILS;
    if (cache[id]) return cache[id];
    var s = dmById(id); if (!s) return null;
    var k = DM_KIND[s.type], n = dmSourceName(s), f = window.dmFactor;
    var owner = s.owner ? M.person(s.owner) : null, ownerOk = !owner || D.canSee(owner);
    var d = { type: k, name: n.title, path: n.loc, masked: !!n.masked };

    if (k === "sharepoint" || k === "onedrive") d.tabs = ["location", "item", "accessed"];
    else if (k === "teams") d.tabs = ["participants", "accessed"];
    else if (k === "exchange") d.tabs = ["accessed"];
    else if (k === "copilot") {
      /* Copilot excludes PEOPLE (production's `exclude`); keyed by person id. */
      d.tabs = ["sessions"];
      d.exclude = { tab: "sessions", key: "_pid", metricKey: "sessions", unit: "person", units: "people", metric: "sessions" };
    } else {
      d.tabs = ["location"];
      d.note = "This source is not integrated with CaseFusion, so there is no audit-log activity for it. It is listed as one location.";
    }

    /* Locations: M.dataMap.locations, or the source as its one location. */
    var tree = k === "sharepoint" || k === "onedrive";
    var locs = DM.locations[id] || [[dmPlainLocation(s), M.items[id] || 0, null]];
    var counts = dmScale(locs.map(function (l) { return l[1]; }), f);
    d.locations = locs.map(function (l, i) {
      return { path: tree ? "\\" + l[0] + "\\" : l[0], items: nf(counts[i]), lastActivity: l[2] ? M.fmtDate(l[2]) : "—", _lastActivity: l[2] || "", _loc: l[0] };
    });

    /* Item View: sample items per location (M.dataMap.items). */
    if (tree) {
      d.items = {};
      d.locations.forEach(function (l) {
        d.items[l.path] = (DM.items[l._loc] || []).map(function (it) {
          var who = it[3] ? M.person(it[3]) : owner, whoOk = !who || D.canSee(who);
          /* A file named after a masked owner would reveal them: drop the name. */
          var name = it[0].replace(ownerOk ? "{{who}}" : "_{{who}}", ownerOk && owner ? owner.name.split(" ").slice(-1)[0] : "");
          var inWin = it[2] >= M.window.start && it[2] <= M.window.end;
          return { name: name, type: it[1], modified: M.fmtDate(it[2]), _modified: it[2], ual: inWin ? "Accessed in window" : "No activity in window",
                   owner: who ? (whoOk ? who.name : "Profile details limited") : "—", _ownerMasked: !whoOk, _ownerPid: who ? who.id : null };
        });
      });
    }

    /* Accessed (and Copilot sessions): who used the source, in this window. */
    var acc = dmAccessed[id] || [];
    if (k === "copilot") {
      d.sessions = acc.map(function (a) { var r = dmPersonRow(a[0]); r.sessions = nf(a[1]); return r; });
    } else if (d.tabs.indexOf("accessed") !== -1) {
      d.accessed = acc.map(function (a) {
        var r = dmPersonRow(a[0]);
        r.events = nf(a[1]);
        /* The threshold reads the case window (the rule names it), whatever window is shown. */
        r.status = dmIsCustodian(a[0]) ? "Custodian" : a[2] < DM.threshold ? "Below Threshold" : "Mark as Custodian";
        return r;
      });
    }
    /* Participants: the Teams roster (who belongs, not who posted). */
    if (k === "teams") {
      d.participants = (DM.participants[id] || []).map(function (a) {
        var r = dmPersonRow(a[0]);
        r.since = M.fmtDate(a[1]); r._since = a[1];
        r.status = dmIsCustodian(a[0]) ? "Custodian" : "Not a Custodian";
        return r;
      });
    }
    cache[id] = d;
    return d;
  }
  window.dmSourceDetail = dmSourceDetail;

  /** Item Details: sample UAL activity for one item, from the people who used its source. */
  var dmItemCache = {};
  function dmItemEvents(id, item) {
    var key = id + "\u0001" + item.name;
    if (dmItemCache[key]) return dmItemCache[key];
    var who = function (pid) { return pid ? dmPersonText(pid) : "Someone"; };
    var day = item._modified || M.window.end;
    var evs = [{ event: who(item._ownerPid) + " uploaded this file", kind: "Uploaded", t: "09:12" }];
    var verbs = [["viewed this file", "Viewed"], ["downloaded a copy", "Downloaded"], ["modified this file", "Other"], ["shared this file", "Other"]];
    (DM.accessed[id] || []).slice(0, 4).forEach(function (a, i) {
      verbs.slice(0, 1 + (i % 3)).forEach(function (v, j) {
        evs.push({ event: who(a[0]) + " " + v[0], kind: v[1], t: ("0" + (10 + i + j)).slice(-2) + ":" + (j ? "48" : "05") });
      });
    });
    evs.sort(function (a, b) { return b.t.localeCompare(a.t); });   /* latest first */
    dmItemCache[key] = evs.map(function (e) { return { event: e.event, when: M.fmtDateTime(day, e.t), kind: e.kind }; });
    return dmItemCache[key];
  }
  window.dmItemEvents = dmItemEvents;

  /* DM_NOTABLE — people not on the custodian list with 20+ UAL events on an
     in-case source in the case window, or a top collaborator with a custodian
     (M.notableNonCustodians; check.js traces each reason to M.dataMap.accessed). */
  function dmNotable() {
    return M.notableNonCustodians.filter(function (n) { return !dmIsCustodian(n.personId); }).map(function (n) {
      var p = M.person(n.personId), ok = D.canSee(p), src = dmSourceName(dmById(n.source)).title;
      var detail = !ok ? "Outside your regions" : n.kind === "Top collaborator"
        ? "Top collaborator · with " + dmPersonText(n.with) + " · " + src + " · " + n.events + " events"
        : n.workload + " overlap · " + src + " · " + n.events + " events" + (n.note ? " · " + n.note : "");
      return { pid: n.personId, name: ok ? p.name : "Profile details limited", role: ok ? p.title : "", masked: !ok, guest: !!n.guest, detail: detail };
    });
  }
  /* Production's insight row, plus masking, the Guest badge and the disabled reason. */
  function dmNotableRowHtml(p) {
    return '<div><div class="dm-insight-name">' +
        (p.masked ? dmMaskedHtml() : '<a href="' + DM_PROFILE_HREF + '">' + esc(p.name) + "</a> <span>— " + esc(p.role) + "</span>") +
        (p.guest && !p.masked ? dmGuestBadge() : "") + "</div>" +
        '<div class="dm-insight-sub">' + esc(p.detail) + "</div></div>" +
      (p.masked || p.guest ? dmBlockedMark(p.masked ? DM_REASON_MASKED : DM_REASON_GUEST, "btn-mark")
        : '<button type="button" class="btn btn-tertiary btn-sm btn-mark">Mark as Custodian</button>');
  }
  function dmRenderNotable() {
    var card = document.getElementById("dmNonCustodianCard"), list = card.querySelector(".dm-insight-list");
    window.DM_NOTABLE = dmNotable();
    list.removeAttribute("aria-busy");
    list.innerHTML = window.DM_NOTABLE.map(function (p) {
      return '<div class="dm-insight-row" data-dm-pid="' + esc(p.pid) + '">' + dmNotableRowHtml(p) + "</div>";
    }).join("");
    card.hidden = !window.DM_NOTABLE.length;   /* nothing notable, no card (production fades it out the same way) */
  }

  /* ── Summary line and scope counts ─────────────────────────────────── */
  function dmTypeAllowed(t) { return !window.dmTypeFilter || window.dmTypeFilter.indexOf(t) !== -1; }
  /* Production: "8,930 items across 106 sources (18,420 UAL events) · 24 custodians on hold ·
     Jan 15 – Jun 30, 2026 · Case Window". The first clause is what the five cards add up to;
     the sources CaseFusion does not integrate with get their own clause, so both reconcile. */
  function dmSummaryText() {
    var win = window.dmWindow || "caseWindow";
    var rows = (window.DM_ALL_SOURCES || { rows: [] }).rows.filter(function (r) { return dmTypeAllowed(r.type); });
    var act = rows.filter(function (r) { return r.events != null; }), quiet = rows.filter(function (r) { return r.events == null; });
    var sum = function (l, k) { return l.reduce(function (n, r) { return n + (r[k] || 0); }, 0); };
    var people = ((window.DM_PEOPLE || {})[win] || { custodians: [] }).custodians;
    var held = people.filter(function (c) { return c.hold === "Active"; }).length;
    var dates = window.dmRange ? dmFmtRange(dmParseIso(window.dmRange.from), dmParseIso(window.dmRange.to))
      : win === "allTime" ? "Full tenant history" : dmFmtRange(dmParseIso(M.window.start), dmParseIso(M.window.end));
    return nf(sum(act, "items")) + " items across " + act.length + " source" + (act.length === 1 ? "" : "s") + " (" + nf(sum(act, "events")) + " UAL events)" +
      (quiet.length ? " · " + quiet.length + " source" + (quiet.length === 1 ? "" : "s") + " with no activity data (" + nf(sum(quiet, "items")) + " items)" : "") +
      " · " + held + " custodian" + (held === 1 ? "" : "s") + " on hold · " + dates + " · " + (win === "allTime" ? "All Time" : "Case Window");
  }
  /** What is in scope now: the filtered sources minus exclusions (Finalize / Export notes). */
  function dmScopeCounts() {
    var ex = window.DM_EXCLUSIONS || {}, out = { items: 0, events: 0, sources: 0 };
    (window.DM_ALL_SOURCES || { rows: [] }).rows.forEach(function (r) {
      if (!dmTypeAllowed(r.type) || dmHasWhole(ex[r.id])) return;
      var gone = { items: 0, sessions: 0 };
      (ex[r.id] || []).forEach(function (e) { gone[e.metric === "sessions" ? "sessions" : "items"] += dmNum(e.items); });
      out.sources++; out.items += r.items - gone.items; out.events += (r.events || 0) - gone.sessions;
    });
    return out;
  }
  /** A whole-source exclusion entry for a source id (saved scopes). */
  function dmWholeEntryFor(id) {
    var r = (window.DM_ALL_SOURCES.rows.filter(function (x) { return x.id === id; }))[0];
    return r ? { path: "— entire source", whole: true, items: r.itemsText, sid: id, name: r.name, unit: "source", units: "sources", metric: "items" } : null;
  }
  function dmWholeExcludedIds() { var ex = window.DM_EXCLUSIONS || {}; return Object.keys(ex).filter(function (k) { return dmHasWhole(ex[k]); }); }
  /* Exclusion entries hold display counts; a new window or date range re-derives them. */
  window.dmRefreshExclusionCounts = function () {
    var ex = window.DM_EXCLUSIONS || {};
    Object.keys(ex).forEach(function (id) {
      ex[id].forEach(function (e) {
        if (e.whole) { var w = dmWholeEntryFor(id); if (w) e.items = w.items; return; }
        var d = dmSourceDetail(id), cfg = d.exclude || { tab: "location", key: "path", metricKey: "items" };
        var list = cfg.tab === "location" ? d.locations : d[cfg.tab] || [];
        var row = list.filter(function (x) { return x[cfg.key] === (e.key || e.path); })[0];
        if (row) e.items = row[cfg.metricKey];
      });
    });
    if (window.dmSyncExclusions) window.dmSyncExclusions();
  };

  /* Production helpers that lived in its data script. */
  window.dmNum = function (v) { return parseFloat(String(v).replace(/,/g, "")) || 0; };
  var dmNum = window.dmNum;
  /* Exclusion identity: the source id (production's name ␁ path ␁ occurrence stood in for it). */
  window.dmExKey = function (id) { return String(id); };
  window.dmHasWhole = function (entries) { return !!(entries && entries.some(function (e) { return e.whole; })); };
  var dmHasWhole = window.dmHasWhole;

  /* Static arrays: Add Date Range defaults, Edit Filters options, saved scopes. */
  window.DM_CASE_DATES = { start: dmUsDate(M.window.start), end: dmUsDate(M.window.end) };
  window.DM_EDIT_FILTERS = {
    custodians: CUSTODIANS.map(function (pid) {
      var p = M.person(pid), ok = D.canSee(p);
      return { value: pid, label: ok ? p.name : "Profile details limited", secondary: ok ? p.title : "Outside your regions" };
    }),
    sourceTypes: DM_TYPES.map(function (t) { return { value: t, label: DM_TYPE_LABEL[t] }; }),
    custodianTags: Object.keys(DM.tags).map(function (t) { return { value: t, label: t }; })
  };
  /* Shared by someone else (author set) → LOAD only, as production. */
  window.DM_SAVED_SCOPES = DM.savedScopes.map(function (sc) {
    var mine = sc.by === D.viewer().personId;
    return { name: sc.name, window: sc.basis === "all" ? "allTime" : "caseWindow", scopeLabel: sc.basis === "all" ? "All time scope" : "Case window scope",
             savedAt: dmSavedAt(sc.saved, sc.time), author: mine ? null : D.nameFor(M.person(sc.by)), excluded: sc.excluded.slice(), custodians: sc.custodians.slice() };
  });
  window.DM_EXCLUSIONS = {};
  window.dmWindow = "caseWindow";
  window.dmRange = null;
  window.dmTypeFilter = null;

  /* Edit Filters options, filled at parse time as production did (before
     Nimbus Select initialises; nimbus.js loads asynchronously after this). */
  (function () {
    function fill(id, rows) {
      var sel = document.getElementById(id); if (!sel) return;
      rows.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.value; opt.textContent = o.label;
        if (o.secondary) opt.setAttribute("data-cnds-secondary-text", o.secondary);
        sel.appendChild(opt);
      });
    }
    fill("dmCustodians",    window.DM_EDIT_FILTERS.custodians);
    fill("dmSourceTypes",   window.DM_EDIT_FILTERS.sourceTypes);
    fill("dmCustodianTags", window.DM_EDIT_FILTERS.custodianTags);
  })();

  /* ══════════════════════════════════════════════════════════════════════
     SERVER HAND-OFF (production's, plus the load seam)
     Every server round-trip this page makes is declared here in one place.
     Each entry is a function returning a Promise; the defaults just resolve
     so the prototype is fully clickable offline.

     DEVS: replace these with real calls (fetch / HttpClient). Resolve on
     success, reject with an Error whose .message is shown in the error
     toast. Nothing else in the page needs to change.

     Angular: this object becomes a DataMapApiService — one method per key,
     each returning Observable<void> (or the created/updated entity).
     ══════════════════════════════════════════════════════════════════════ */
  window.DM_API = window.DM_API || {
    /* Demo: the page's data. While it is pending, every list shows skeletons in
       its real geometry (house rule). In production it returns the data arrays
       for the case and window; here the data is local, so the web font loading
       (the tables are measured in it) stands in for the wait. */
    loadDataMap: function (caseId) {
      console.info("[datamap] load", caseId);
      return new Promise(function (resolve) {
        if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(function () { resolve(M); });
        else setTimeout(function () { resolve(M); }, 0);
      });
    },
    exportCsv:   function (payload) { console.info("[datamap] export CSV", payload);        return Promise.resolve(); },
    saveScope:   function (scope)   { console.info("[datamap] save scope", scope);          return Promise.resolve(); },
    loadScope:   function (scope)   { console.info("[datamap] load scope", scope);          return Promise.resolve(); },
    renameScope: function (s, name) { console.info("[datamap] rename scope", s, name);      return Promise.resolve(); },
    deleteScope: function (scope)   { console.info("[datamap] delete scope", scope);        return Promise.resolve(); },
    applyExclusions: function (src, locs) { console.info("[datamap] apply exclusions", src, locs); return Promise.resolve(); },
    markCustodian:   function (pid)  { console.info("[datamap] mark as custodian", pid);   return Promise.resolve(); }
  };

  /* ══════════════════════════════════════════════════════════════════════
     SKELETONS — Nimbus loading.css, in each list's real geometry, while
     loadDataMap is pending. The container carries aria-busy; the skeletons
     are aria-hidden decoration. The flows replace them on first render.
     ══════════════════════════════════════════════════════════════════════ */
  function sk(w) { return '<span class="skeleton skeleton-text skeleton-w-' + w + '"></span>'; }
  function skRect(w, h) { return '<span class="skeleton skeleton-rect dm-sk-inline" style="width: ' + w + "; height: " + h + ';"></span>'; }
  function dmRenderSkeletons() {
    var busy = function (el) { if (el) el.setAttribute("aria-busy", "true"); return el; };
    busy(document.getElementById("dmSummary")).innerHTML = '<span class="dm-sk-line" aria-hidden="true">' + skRect("62%", "14px") + "</span>";
    var grid = busy(document.getElementById("dmStatGrid"));
    grid.querySelectorAll(".dm-stat").forEach(function (c) {
      c.querySelector(".dm-stat-count b").innerHTML = skRect("96px", "31px");
      var m = c.querySelectorAll(".dm-stat-meta > span:not(.dm-meta-divider)");
      m[0].innerHTML = skRect("56px", "12px"); m[1].innerHTML = skRect("88px", "12px");
    });
    /* Sources: six rows (Top Sources), icon + name over path, bar + count, people, Exclude. */
    var srcRow = '<tr aria-hidden="true"><td><div class="dm-source">' + skRect("22px", "22px") + '<span class="dm-source-body dm-sk-body">' + skRect("180px", "14px") + skRect("260px", "12px") + "</span></div></td>" +
      '<td class="dm-col-items"><div class="dm-items">' + skRect("100%", "5px") + skRect("40px", "14px") + "</div></td>" +
      '<td class="dm-col-people">' + skRect("64px", "14px") + '</td><td class="dm-col-act">' + skRect("72px", "28px") + "</td></tr>";
    busy(document.querySelector("#dmViewBySource .dm-table tbody")).innerHTML = new Array(7).join(srcRow);
    /* By People: four total cards and ten custodian rows. */
    busy(document.getElementById("dmPeopleGrid")).innerHTML = new Array(5).join('<div class="dm-people-stat" aria-hidden="true">' + skRect("70%", "14px") + skRect("40px", "26px") + "</div>");
    var pRow = '<tr aria-hidden="true"><td class="dm-col-rank">' + skRect("14px", "14px") + "</td><td>" + skRect("120px", "14px") + "</td><td>" + skRect("160px", "14px") +
      '</td><td class="dm-col-num">' + skRect("24px", "14px") + '</td><td class="dm-col-num">' + skRect("44px", "14px") + '</td><td class="dm-col-hold">' + skRect("44px", "14px") +
      '</td><td class="dm-col-signal"><div class="dm-signal">' + skRect("100%", "5px") + skRect("48px", "14px") + "</div></td></tr>";
    busy(document.getElementById("dmCustodianRows")).innerHTML = new Array(11).join(pRow);
    /* Notable non-custodians: three rows, name over reason, action. */
    busy(document.querySelector("#dmNonCustodianCard .dm-insight-list")).innerHTML = new Array(4).join(
      '<div class="dm-insight-row" aria-hidden="true"><div class="dm-sk-body">' + skRect("220px", "14px") + skRect("320px", "12px") + "</div>" + skRect("132px", "28px") + "</div>");
    ["dmPagerRange", "dmPeoplePagerRange"].forEach(function (id) { document.getElementById(id).textContent = ""; });
    busy(document.querySelector(".dm-main"));
  }
  dmRenderSkeletons();

  /* ══════════════════════════════════════════════════════════════════════
     BEHAVIOUR — production's data map script, started once the data has
     loaded. Ported as is; every change is marked "Demo:".
     ══════════════════════════════════════════════════════════════════════ */
  function dmStart() {
    /* ══════════════════════════════════════════════════════════════════════
       SHARED HELPERS
       Small utilities used across the flows below. Kept at the top so the
       per-flow IIFEs stay focused on behaviour.
       ══════════════════════════════════════════════════════════════════════ */

    /** Escape text before injecting into innerHTML. */
    function dmEsc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    window.dmEsc = dmEsc;

    /** Hide a Nimbus modal by element, tolerating the component not being ready. */
    function dmHideModal(el) {
      if (!el) return;
      var inst = (window.Nimbus && Nimbus.Modal) ? Nimbus.Modal.getInstance(el) : null;
      if (inst) inst.hide(); else el.classList.remove('show');
    }
    window.dmHideModal = dmHideModal;

    /* ── SERVER HAND-OFF: window.DM_API is declared above, before the load seam
       that runs ahead of these flows (it holds loadDataMap as well). ── */

    /**
     * Run a DM_API call and surface the standard success / error toasts.
     * @param {string}   name     key in window.DM_API
     * @param {Array}    args     arguments for the call
     * @param {string}   okMsg    success toast body (title is always "Success")
     * @param {string}   failMsg  fallback error body when the rejection has no .message
     * @param {Function} [onOk]   run only on success, before the toast (commit local state here)
     * @returns {Promise}
     */
    function dmRun(name, args, okMsg, failMsg, onOk) {
      // `name` is normally a DM_API key. A function is also accepted so a caller
      // that fans out over several API calls still surfaces ONE toast.
      var fn = typeof name === 'function'
        ? name
        : ((window.DM_API && window.DM_API[name]) || function () { return Promise.resolve(); });
      return Promise.resolve(fn.apply(null, args || []))
        .then(function () {
          if (onOk) onOk();
          if (window.dmToast) dmToast('success', 'Success', okMsg);
        })
        .catch(function (err) {
          if (window.dmToast) dmToast('error', 'An Error Has Occurred', (err && err.message) || failMsg);
        });
    }
    window.dmRun = dmRun;

    /* ══ MOTION HELPERS ══════════════════════════════════════════════════════
       Three primitives cover every transition on this page. All are no-ops under
       prefers-reduced-motion, and all are safe to call re-entrantly (a second call
       mid-flight cleans up the first rather than stacking ghosts).

       Angular: dmCrossfade → an :enter/:leave @trigger on the repeated rows;
       dmFadeCard → [@cardFade] on the host; dmSwapViews → a routed animation.
       ═══════════════════════════════════════════════════════════════════════ */
    function dmNoMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /**
     * Crossfade a content swap: clone the element's current pixels into a fixed
     * ghost, run `mutate()`, then fade the ghost out while the live element fades
     * in. The element's height animates old→new so the page never jumps.
     * @param {HTMLElement} el      element whose contents change (e.g. a <tbody>)
     * @param {Function}    mutate  performs the swap synchronously
     */
    var dmFading = false;
    function dmCrossfade(el, mutate) {
      // A swap can cascade (scope change → re-filter → re-page). Only the outermost
      // call animates; inner ones just mutate, so ghosts never stack.
      if (!el || dmFading || dmNoMotion()) { if (mutate) mutate(); return; }
      var sizer = el;
      var rect  = el.getBoundingClientRect();
      // Nothing painted yet (hidden tab, zero rows) — no pixels worth fading.
      if (!rect.height || !rect.width) { mutate(); return; }

      if (el.__dmGhost) { el.__dmGhost.remove(); el.__dmGhost = null; }
      var ghost = el.cloneNode(true);
      ghost.removeAttribute('id');
      // Ghosts of table sections must keep their table context to render at all.
      var tag = el.tagName.toLowerCase();
      if (tag === 'tbody' || tag === 'thead' || tag === 'tr') {
        var host = document.createElement('table');
        var src  = el.closest('table');
        host.className = (src && src.className) || '';
        host.style.tableLayout = 'fixed';
        host.appendChild(ghost);
        ghost = host;
      }
      ghost.classList.add('dm-ghost');
      ghost.style.top = rect.top + 'px';
      ghost.style.left = rect.left + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.opacity = '1';
      document.body.appendChild(ghost);
      el.__dmGhost = ghost;

      var startH = sizer.getBoundingClientRect().height;
      dmFading = true;
      try { mutate(); } finally { dmFading = false; }
      var endH = sizer.getBoundingClientRect().height;

      el.classList.remove('dm-fade-in');
      void el.offsetWidth;                 // restart the animation on repeat swaps
      el.classList.add('dm-fade-in');

      if (Math.abs(endH - startH) > 1) {
        sizer.style.overflow = 'hidden';
        sizer.style.height = startH + 'px';
        sizer.style.transition = 'height var(--dm-swap, 220ms) ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { sizer.style.height = endH + 'px'; });
        });
      }
      window.setTimeout(function () {
        if (el.__dmGhost === ghost) { ghost.style.opacity = '0'; }
      }, 0);
      window.setTimeout(function () {
        if (el.__dmGhost === ghost) { ghost.remove(); el.__dmGhost = null; }
        el.classList.remove('dm-fade-in');
        sizer.style.height = ''; sizer.style.transition = ''; sizer.style.overflow = '';
      }, 260);
    }
    window.dmCrossfade = dmCrossfade;

    /**
     * Fade a whole card in or out, collapsing its height so the column closes up.
     * @param {HTMLElement} card
     * @param {boolean}     show
     */
    function dmFadeCard(card, show) {
      if (!card) return;
      if (dmNoMotion()) { card.hidden = !show; return; }
      // Settle anything in flight first, so a reversal starts from a clean state.
      if (card.__dmEnd) card.__dmEnd();
      var gap = 16;                                    // .dm-main column gap
      if (show === !card.hidden) return;               // already in the target state

      card.hidden = false;
      card.classList.add('dm-card-fade', 'dm-no-anim');

      // Natural height, measured with the collapse styles off.
      card.classList.remove('is-out');
      card.style.height = 'auto';
      var full = card.getBoundingClientRect().height;

      // Write the start frame while transitions are suppressed.
      card.style.height = (show ? 0 : full) + 'px';
      card.style.marginBottom = (show ? -gap : 0) + 'px';
      if (show) card.classList.add('is-out');
      void card.offsetWidth;                           // flush the start frame
      card.classList.remove('dm-no-anim');             // now transitions are live

      requestAnimationFrame(function () {
        card.style.height = (show ? full : 0) + 'px';
        card.style.marginBottom = (show ? 0 : -gap) + 'px';
        if (show) card.classList.remove('is-out'); else card.classList.add('is-out');
      });

      var done = false;
      function finish() {
        if (done) return;
        done = true;
        card.removeEventListener('transitionend', onEnd);
        clearTimeout(card.__dmT);
        card.__dmEnd = null;
        card.classList.remove('dm-card-fade', 'is-out', 'dm-no-anim');
        card.style.height = ''; card.style.marginBottom = '';
        card.hidden = !show;
      }
      function onEnd(e) { if (e.target === card && e.propertyName === 'height') finish(); }
      card.addEventListener('transitionend', onEnd);
      card.__dmT = setTimeout(finish, 420);            // fallback if height never changes
      card.__dmEnd = finish;
    }
    window.dmFadeCard = dmFadeCard;

    /**
     * Crossfade two mutually-exclusive sibling views inside a positioned stack.
     * @param {HTMLElement} stack  the positioned parent
     * @param {HTMLElement} outEl  view leaving
     * @param {HTMLElement} inEl   view arriving
     */
    function dmSwapViews(stack, outEl, inEl) {
      if (!stack || !outEl || !inEl) return;
      if (dmNoMotion()) { outEl.hidden = true; inEl.hidden = false; return; }
      if (stack.__dmT) { clearTimeout(stack.__dmT); stack.__dmT = null; }
      var startH = stack.getBoundingClientRect().height;

      inEl.hidden = false;
      inEl.classList.add('dm-view-in');
      inEl.style.opacity = '0';
      outEl.classList.add('dm-view-out');
      stack.classList.add('is-swapping');
      // Outgoing is absolute now, so the stack sizes to the incoming view.
      var endH = stack.getBoundingClientRect().height;
      stack.style.height = startH + 'px';
      stack.classList.add('is-sizing');

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          inEl.style.opacity = '1';
          stack.style.height = endH + 'px';
        });
      });
      stack.__dmT = setTimeout(function () {
        outEl.hidden = true;
        outEl.classList.remove('dm-view-out');
        inEl.classList.remove('dm-view-in');
        inEl.style.opacity = '';
        stack.classList.remove('is-swapping', 'is-sizing');
        stack.style.height = '';
      }, 240);
    }
    window.dmSwapViews = dmSwapViews;

    /* ──────────────────────────────────────────────────────────────────────
       MARK AS CUSTODIAN
       The real API owns the promotion; the UI only reflects it. On success we
       flip the person's status wherever it is held so the change survives a
       re-render (sort, search, paging, tab switch):
         - DM_SOURCE_DETAILS[*].participants/accessed — drawer table data
         - the clicked button itself — instant feedback, incl. the static
           Notable Non-Custodians rows, which have no backing array.
       Angular: replace with DataMapApiService.markCustodian(name) and let the
       store emit; the DOM writes below disappear with the store.
       Demo: keyed by person id, not name (a name can be masked as "Profile
       details limited" for a viewer outside the person's region). The person
       joins dmAdded, so rebuilt data (window, date range) keeps them a
       custodian, and By People lists them with hold "No" (not yet notified).
       Coverage's static data already shows one custodian added this way
       (Marcus Webb, "Added from the data map"); nothing is persisted across
       pages, as before this rebuild.
       ────────────────────────────────────────────────────────────────────── */
    function dmMarkCustodian(pid, btn) {
      if (!pid || (btn && btn.disabled)) return;
      var name = dmPersonText(pid);
      if (btn) btn.disabled = true;                      // no double-submit
      dmRun('markCustodian', [pid],
        name + ' is now a custodian.',
        'Could not mark ' + name + ' as a custodian.',
        function () {
          dmAdded[pid] = true;
          // Commit to the drawer data so re-renders keep the new status.
          var SD = window.DM_SOURCE_DETAILS || {};
          Object.keys(SD).forEach(function (k) {
            ['participants', 'accessed'].forEach(function (t) {
              (SD[k][t] || []).forEach(function (r) {
                if (r._pid === pid) r.status = 'Custodian';
              });
            });
          });
          // By People gains the new custodian (and its totals card the count).
          dmRebuildPeople();
          if (window.dmRenderPeople) window.dmRenderPeople(window.dmWindow);
          if (window.dmRenderSummary) window.dmRenderSummary();
          // Promoted from the drawer: the person leaves Notable Non-Custodians too.
          Array.prototype.forEach.call(document.querySelectorAll('.dm-insight-row[data-dm-pid="' + pid + '"]'), function (r) {
            if (!btn || !r.contains(btn)) dmRetireInsightRow(r);
          });
          // Swap the button for plain text in place.
          if (btn) {
            var done = document.createElement('span');
            done.className = 'dm-status-done';
            done.textContent = 'Custodian';
            btn.replaceWith(done);
            // The linked name only exists because this button did — drop the link
            // with it, so the row matches what personCells() would now render.
            // Scoped to <tr> so the Notable Non-Custodians panel keeps its links.
            var tr = done.closest('tr');
            var link = tr && tr.querySelector('[data-dm-person]');
            if (link) link.replaceWith(document.createTextNode(link.textContent));
            // Notable Non-Custodians lists only people who are NOT custodians, so a
            // promoted row no longer belongs. Hold the confirmation briefly, then
            // collapse it out; the card itself fades once the last row goes.
            var row = done.closest('.dm-insight-row');
            if (row) dmRetireInsightRow(row);
          }
        }
      ).then(function () {
        if (btn && btn.isConnected) btn.disabled = false;  // re-enable if it failed
      });
    }
    window.dmMarkCustodian = dmMarkCustodian;

    /** Fade the whole card out once its last row leaves; no rows, nothing notable. */
    function dmHideInsightCard() {
      var card = document.getElementById('dmNonCustodianCard');
      if (!card || card.hidden) return;
      if (dmNoMotion()) { card.hidden = true; return; }
      card.classList.add('is-hiding');
      setTimeout(function () { card.hidden = true; card.classList.remove('is-hiding'); }, 350);
    }

    /**
     * Add a notable non-custodian and fade the card back in if it was empty.
     * This is the seam the backend pushes to — e.g. a re-scan surfacing new
     * overlap. Angular: an *ngIf on the card + *ngFor over the store's list.
     * @param {{name:string, role:string, detail:string}} p
     */
    function dmAddNotableNonCustodian(p) {
      var card = document.getElementById('dmNonCustodianCard');
      var list = card && card.querySelector('.dm-insight-list');
      if (!list || !p || !p.pid) return;
      var row = document.createElement('div');
      row.className = 'dm-insight-row';
      row.setAttribute('data-dm-pid', p.pid);
      // Demo: the row is built by dmNotableRowHtml (masking, Guest badge, disabled
      // reason); production's own row markup is kept inside it.
      row.innerHTML = dmNotableRowHtml(p);
      list.appendChild(row);
      if (!card.hidden) return;
      card.classList.add('is-hiding');            // start transparent, then fade up
      card.hidden = false;
      if (dmNoMotion()) { card.classList.remove('is-hiding'); return; }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { card.classList.remove('is-hiding'); });
      });
    }
    window.dmAddNotableNonCustodian = dmAddNotableNonCustodian;

    /** Collapse a Notable Non-Custodians row out of the list, then drop it. */
    function dmRetireInsightRow(row) {
      var list = row.parentNode;
      var reduce = dmNoMotion();
      function drop() {
        row.remove();
        if (!list.querySelector('.dm-insight-row')) dmHideInsightCard();
      }
      if (reduce) { setTimeout(drop, 700); return; }
      setTimeout(function () {
        row.style.height = row.getBoundingClientRect().height + 'px';   // pin before animating
        row.classList.add('is-leaving');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { row.classList.add('is-gone'); });
        });
        row.addEventListener('transitionend', function h(e) {
          if (e.propertyName !== 'height') return;
          row.removeEventListener('transitionend', h);
          drop();
        });
        setTimeout(drop, 600);            // belt-and-braces if transitionend never fires
      }, 700);
    }

    // Notable Non-Custodians panel — same action. Rows are rendered from
    // DM_NOTABLE (dmRenderNotable) and carry the person id.
    document.addEventListener('click', function (e) {
      var b = e.target.closest('.btn-mark'); if (!b) return;
      var row = b.closest('.dm-insight-row');
      dmMarkCustodian(row && row.getAttribute('data-dm-pid'), b);
    });

    // Edit Filters — slide the filter-fields panel up/down (300ms, default collapsed)
    (function () {
      var t = document.getElementById('dmEditFiltersToggle');
      var panel = document.getElementById('dmEditFilters');
      if (t && panel) {
        t.addEventListener('click', function () {
          var open = t.getAttribute('aria-expanded') === 'true';
          t.setAttribute('aria-expanded', String(!open));
          t.classList.toggle('active', !open);
          panel.classList.toggle('open', !open);
          if (window.dmSyncRefinedClear) window.dmSyncRefinedClear();
        });
      }
    })();

    // ── Shared table paginator (drives a Nimbus/Pagination toolbar).
    //    Owns page + page-size state, wires the four nav buttons and the page-size
    //    select, keeps the range text and disabled states in sync, and hands the
    //    current slice back to the caller's render().
    //    cfg = { toolbar, getTotal(), render(start, end) }  — end is exclusive.
    //    Angular: replace with a MatPaginator / server-side page request. ──
    function dmCreatePager(cfg) {
      var toolbar = cfg.toolbar;
      if (!toolbar) return null;
      var rangeEl = toolbar.querySelector('.pagination-toolbar-range');
      var btns    = toolbar.querySelectorAll('.pagination-toolbar-btn'); // first, prev, next, last
      var sizeSel = toolbar.querySelector('select');
      var page = 0;
      var size = parseInt((sizeSel && sizeSel.value) || '10', 10) || 10;

      function pageCount(total) { return Math.max(1, Math.ceil(total / size)); }

      function apply(animate) {
        var total = cfg.getTotal();
        var pages = pageCount(total);
        if (page > pages - 1) page = pages - 1;
        if (page < 0) page = 0;
        var start = page * size;
        var end   = Math.min(start + size, total);
        // Paging/resizing crossfades; first paint and filter-driven rebuilds don't
        // (the caller already animates those, and double-fading looks muddy).
        if (animate && window.dmCrossfade && cfg.rowsEl) {
          dmCrossfade(cfg.rowsEl, function () { cfg.render(start, end); });
        } else {
          cfg.render(start, end);
        }
        if (rangeEl) rangeEl.textContent = total ? ((start + 1) + '–' + end + ' of ' + total) : '0 of 0';
        var atFirst = page === 0, atLast = page >= pages - 1;
        if (btns[0]) btns[0].disabled = atFirst;
        if (btns[1]) btns[1].disabled = atFirst;
        if (btns[2]) btns[2].disabled = atLast;
        if (btns[3]) btns[3].disabled = atLast;
      }
      function go(p) { page = p; apply(true); }

      if (btns[0]) btns[0].addEventListener('click', function () { go(0); });
      if (btns[1]) btns[1].addEventListener('click', function () { go(page - 1); });
      if (btns[2]) btns[2].addEventListener('click', function () { go(page + 1); });
      if (btns[3]) btns[3].addEventListener('click', function () { go(pageCount(cfg.getTotal()) - 1); });

      // Page size — Nimbus/Select emits valueChanged; native change covers no-JS.
      function onSize() {
        var v = parseInt(sizeSel.value, 10);
        if (!v || v === size) return;
        size = v; page = 0; apply(true);
      }
      if (sizeSel) {
        sizeSel.addEventListener('change', onSize);
        sizeSel.addEventListener('valueChanged.cnds.select', onSize);
      }

      return { apply: apply, reset: function (animate) { page = 0; apply(animate); } };
    }

    // ── By People view — render totals + custodians from DM_PEOPLE, and swap
    //    between the By Source / By People views via the toolbar toggle. ──
    (function () {
      // Demo: DM_PEOPLE is rebuilt whenever the window or date range changes
      // (dmBuild), so it is read through this getter rather than captured once.
      var P = function () { return window.DM_PEOPLE || {}; };
      var grid = document.getElementById('dmPeopleGrid');
      var rows = document.getElementById('dmCustodianRows');
      if (!(grid && rows)) return;

      var esc = dmEsc;

      var HOLD_CLASS = { Active: 'dm-hold-active', Pending: 'dm-hold-pending' };
      var current = 'caseWindow';

      function rowHtml(c) {
        var holdCls = HOLD_CLASS[c.hold] || '';
        return '<tr>' +
          '<td class="dm-col-rank">' + c.rank + '</td>' +
          // Demo: a custodian outside the viewer's regions reads as a lock + "Profile
          // details limited" (never dimmed) with no role and no profile link.
          '<td>' + (c.masked ? dmMaskedHtml() : '<a href="' + DM_PROFILE_HREF + '" class="dm-custodian-name">' + esc(c.name) + '</a>') + '</td>' +
          '<td>' + esc(c.masked ? '—' : c.role) + '</td>' +
          '<td class="dm-col-num">' + esc(c.sources) + '</td>' +
          '<td class="dm-col-num">' + esc(c.events) + '</td>' +
          '<td class="dm-col-hold ' + holdCls + '">' + esc(c.hold) + '</td>' +
          '<td class="dm-col-signal"><div class="dm-signal">' +
            '<div class="progress" style="height:5px;">' +
              '<div class="progress-bar" role="progressbar" style="width:' + c.signal + '%;"' +
              ' aria-valuenow="' + c.signal + '" aria-valuemin="0" aria-valuemax="100"' +
              ' aria-label="Relevance ' + esc(c.level) + '"></div>' +
            '</div>' +
            '<span class="dm-signal-label">' + esc(c.level) + '</span>' +
          '</div></td>' +
        '</tr>';
      }

      // Edit Filters state for this table. null = no restriction.
      // Source Types is deliberately NOT applied here — it narrows sources, not people.
      var CMETA  = function () { return window.DM_CUSTODIAN_META || {}; };   // rebuilt with the data
      var filter = { custodians: null, tags: null };
      // Table-tools state. Default sort reproduces the Figma row order (events, high→low).
      var tools  = { q: '', show: '', sortBy: 'events', dir: 'desc' };
      var matching = [];

      var num = window.dmNum;   // shared parser — see dmNum

      function compare(a, b) {
        var r;
        if (tools.sortBy === 'name')        r = a.name.localeCompare(b.name);
        else if (tools.sortBy === 'signal') r = a.signal - b.signal;
        else                                r = num(a[tools.sortBy]) - num(b[tools.sortBy]);
        if (r === 0) r = a.rank - b.rank; // stable tiebreak on relevance rank
        return tools.dir === 'asc' ? r : -r;
      }

      function recompute() {
        matching = (P()[current] || { custodians: [] }).custodians.filter(function (c) {
          var m = CMETA()[c.pid] || {};   // demo: keyed by person id (names can be masked)
          // Edit Filters
          if (filter.custodians && filter.custodians.indexOf(m.id) === -1) return false;
          if (filter.tags) {
            var t = m.tags || [];
            if (!filter.tags.some(function (x) { return t.indexOf(x) !== -1; })) return false;
          }
          // Table tools — Show. 'all' = no restriction; 'Unreleased' is a derived
          // filter meaning "anything whose status is not Released" (not a status
          // value in its own right); everything else is an exact status match.
          if (tools.show && tools.show !== 'all') {
            if (tools.show === 'Unreleased') { if (c.hold === 'Released') return false; }
            else if (c.hold !== tools.show) return false;
          }
          if (tools.q) {
            var hay = (c.name + ' ' + c.role).toLowerCase();
            if (hay.indexOf(tools.q) === -1) return false;
          }
          return true;
        }).sort(compare);
      }

      // Paginate the filtered custodian list for the active time window.
      var pager = dmCreatePager({
        toolbar: document.querySelector('#dmViewByPeople .pagination-toolbar'),
        rowsEl: document.querySelector('#dmViewByPeople .dm-table tbody'),
        getTotal: function () { return matching.length; },
        render: function (start, end) {
          rows.innerHTML = matching.length
            ? matching.slice(start, end).map(rowHtml).join('')
            : '<tr class="dm-people-empty"><td colspan="7">No custodians match the current filters.</td></tr>';
        }
      });

      // `animate` is opt-in: filter / sort / window changes crossfade; typing in
      // the search box must not (a ghost per keystroke reads as flicker).
      function refresh(animate) { recompute(); if (pager) pager.reset(animate); }

      // Applied by the Edit Filters flow. arrays or null (= all).
      window.dmFilterPeople = function (f) {
        filter.custodians = (f && f.custodians && f.custodians.length) ? f.custodians.slice() : null;
        filter.tags       = (f && f.tags && f.tags.length)             ? f.tags.slice()       : null;
        refresh();
      };

      // ── Table tools bar: toggle + search + Show + Sort By + Asc/Desc ──
      (function () {
        var slot   = document.getElementById('dmPeopleToolsSlot');
        var toggle = document.getElementById('dmPeopleToolsToggle');
        var search = document.getElementById('dmPeopleSearch');
        var showEl = document.getElementById('dmPeopleShow');
        var sortEl = document.getElementById('dmPeopleSort');
        var dirBtn = document.getElementById('dmPeopleSortDir');

        if (slot && toggle) {
          toggle.addEventListener('click', function () {
            var open = slot.classList.toggle('open');
            toggle.classList.toggle('active', open);
            toggle.setAttribute('aria-pressed', String(open));
            if (open && search) setTimeout(function () { search.focus(); }, 300);
          });
        }
        if (search) search.addEventListener('input', function () {
          tools.q = search.value.trim().toLowerCase(); refresh();
        });
        // Nimbus/Select emits valueChanged; native change covers no-JS.
        function bindSelect(el, key) {
          if (!el) return;
          function onChange() { tools[key] = el.value; refresh(true); }
          el.addEventListener('change', onChange);
          el.addEventListener('valueChanged.cnds.select', onChange);
        }
        bindSelect(showEl, 'show');
        bindSelect(sortEl, 'sortBy');

        if (dirBtn) dirBtn.addEventListener('click', function () {
          tools.dir = tools.dir === 'asc' ? 'desc' : 'asc';
          dirBtn.setAttribute('data-dir', tools.dir);
          dirBtn.setAttribute('aria-label', 'Sort direction, ' + (tools.dir === 'asc' ? 'ascending' : 'descending'));
          var lbl = dirBtn.querySelector('.dm-sort-dir-label');
          if (lbl) lbl.textContent = tools.dir === 'asc' ? 'Asc' : 'Dsc';
          refresh(true);
        });
      })();

      // Render totals + custodians for a time window ('caseWindow' | 'allTime').
      // Driven by the Case Window / All Time toggle, same as the By Source view.
      function renderPeople(key) {
        if (!P()[key]) return;
        current = key;
        var setTotals = function () {
          grid.innerHTML = P()[key].totals.map(function (t) {
            return '<div class="dm-people-stat">' +
                     '<span class="dm-people-stat-label">' + esc(t.label) + '</span>' +
                     '<span class="dm-people-stat-value">' + esc(t.value) + '</span>' +
                   '</div>';
          }).join('');
        };
        if (window.dmCrossfade) dmCrossfade(grid, setTotals); else setTotals();
        refresh(true); // re-filter for the new window, back to page 1
      }
      window.dmRenderPeople = renderPeople; // called by the Case Window / All Time toggle
      renderPeople(window.dmWindow || 'caseWindow');

      // View toggle — the Filters card, summary line, insights and footer are
      // shared; only the totals + table swap.
      var bySource = document.getElementById('dmViewBySource');
      var byPeople = document.getElementById('dmViewByPeople');
      var toggle   = document.getElementById('dmViewToggle');
      if (!(bySource && byPeople && toggle)) return;
      toggle.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dm-view]');
        if (!btn) return;
        var people = btn.getAttribute('data-dm-view') === 'people';
        Array.prototype.forEach.call(toggle.querySelectorAll('[data-dm-view]'), function (b) {
          var on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        var stack = document.getElementById('dmViewStack');
        if (window.dmSwapViews && stack) {
          dmSwapViews(stack, people ? bySource : byPeople, people ? byPeople : bySource);
        } else {
          bySource.hidden = people; byPeople.hidden = !people;
        }
      });
    })();

    // ── Load Saved Scope — render the menu from DM_SAVED_SCOPES and apply one ──
    //    Loading restores the scope's time window, which cascades to the summary
    //    line, totals cards and both table views. DELETE / RENAME are rendered per
    //    the design but belong to the Delete Scope / Rename Saved Scope flows. ──
    (function () {
      var listEl  = document.getElementById('dmScopesList');
      var countEl = document.getElementById('dmScopesCount');
      var menuEl  = document.getElementById('dmScopesMenu');
      var toggle  = document.getElementById('dmLoadScopeToggle');
      if (!(listEl && countEl && menuEl)) return;

      var esc = dmEsc;

      function render() {
        var scopes = window.DM_SAVED_SCOPES || [];
        countEl.textContent = scopes.length;
        if (!scopes.length) {
          listEl.innerHTML = '<div class="dm-scope-empty">No saved scopes.</div>';
          return;
        }
        listEl.innerHTML = scopes.map(function (s, i) {
          var details = (s.scopeLabel || '') + (s.savedAt ? ' · Saved ' + s.savedAt : '');
          var shared  = s.author
            ? '<span class="dm-scope-shared">Shared by ' + esc(s.author) + '</span>' : '';
          // Own scopes get the full action set; shared ones are load-only.
          var actions = (s.author ? '' :
              '<button type="button" class="btn btn-tertiary" data-dm-scope-action="delete" data-dm-scope="' + i + '">Delete</button>' +
              '<button type="button" class="btn btn-tertiary" data-dm-scope-action="rename" data-dm-scope="' + i + '">Rename</button>') +
              '<button type="button" class="btn btn-tertiary" data-dm-scope-action="load" data-dm-scope="' + i + '">Load</button>';
          return '<div class="dm-scope-item">' +
                   '<span class="dm-scope-titles">' +
                     '<span class="dm-scope-name" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
                     '<span class="dm-scope-details">' + esc(details) + '</span>' + shared +
                   '</span>' +
                   '<span class="dm-scope-actions">' + actions + '</span>' +
                 '</div>';
        }).join('');
      }
      window.dmRenderScopes = render; // re-rendered after Finalize and Save
      render();

      function closeMenu() {
        var inst = window.Nimbus && Nimbus.Dropdown ? Nimbus.Dropdown.getInstance(toggle) : null;
        if (inst && inst.hide) inst.hide();
        else menuEl.classList.remove('show');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }

      // ── Delete: confirm first (Figma: Delete Saved Scope — Confirm) ──
      var delModal = document.getElementById('dmDeleteScopeModal');
      var delYes   = document.getElementById('dmDeleteScopeYes');
      // Hold the scope object, not its index — the array can be re-rendered
      // between opening the dialog and confirming.
      var pendingDelete = null;

      if (delYes && delModal) {
        delYes.addEventListener('click', function () {
          var scope = pendingDelete;
          pendingDelete = null;
          dmHideModal(delModal);
          if (!scope) return;
          delYes.disabled = true;
          // On failure the scope is left in place (onOk only runs when resolved).
          dmRun('deleteScope', [scope], 'Scope deleted successfully.', 'The scope could not be deleted.', function () {
            var arr = window.DM_SAVED_SCOPES || [];
            var i = arr.indexOf(scope);
            if (i !== -1) arr.splice(i, 1);
            render();
          }).then(function () { delYes.disabled = false; });
        });
        // Cancel / dismiss leaves everything unchanged.
        delModal.addEventListener('hidden.cnds.modal', function () { pendingDelete = null; });
      }

      // ── Rename: prefill the current name, require a new one ──
      var renModal   = document.getElementById('dmRenameScopeModal');
      var renCurrent = document.getElementById('dmRenameCurrent');
      var renInput   = document.getElementById('dmRenameInput');
      var renSave    = document.getElementById('dmRenameSave');
      var pendingRename = null; // scope object, not index

      if (renModal && renInput && renSave) {
        // SAVE is disabled until a new, different name is entered.
        function syncRename() {
          var v = renInput.value.trim();
          renSave.disabled = (v === '' || (pendingRename && v === pendingRename.name));
        }
        renInput.addEventListener('input', syncRename);
        renModal.addEventListener('shown.cnds.modal', function () { renInput.focus(); });
        renModal.addEventListener('hidden.cnds.modal', function () {
          pendingRename = null; renInput.value = ''; renSave.disabled = true;
        });

        renSave.addEventListener('click', function () {
          var scope = pendingRename, newName = renInput.value.trim();
          if (!scope || !newName) return;
          dmHideModal(renModal);
          renSave.disabled = true;
          // On failure the name is left unchanged (onOk only runs when resolved).
          dmRun('renameScope', [scope, newName], 'Scope renamed successfully.', 'The scope could not be renamed.', function () {
            scope.name = newName;
            render();
          });
        });
      }

      listEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dm-scope-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-dm-scope-action');
        var scope  = (window.DM_SAVED_SCOPES || [])[+btn.getAttribute('data-dm-scope')];
        if (!scope) return;

        if (action === 'rename') {
          pendingRename = scope;
          if (renCurrent) renCurrent.textContent = scope.name;
          if (renInput) renInput.value = '';
          if (renSave) renSave.disabled = true;
          closeMenu();
          if (window.Nimbus && Nimbus.Modal && renModal) Nimbus.Modal.getOrCreateInstance(renModal).show();
          return;
        }
        if (action === 'delete') {
          pendingDelete = scope;
          closeMenu();
          if (window.Nimbus && Nimbus.Modal && delModal) Nimbus.Modal.getOrCreateInstance(delModal).show();
          return;
        }
        if (action !== 'load') return;
        closeMenu();
        dmRun('loadScope', [scope], 'Scope loaded successfully.', 'The scope could not be loaded.', function () {
          // Demo: a Meridian scope also records the sources it excluded, so loading
          // one restores those whole-source exclusions (production restores the
          // window only). Written before the window toggle so its cascade re-syncs
          // the chips, row states and footer once.
          if (scope.excluded) {
            var ex = window.DM_EXCLUSIONS;
            Object.keys(ex).forEach(function (k) { delete ex[k]; });
            scope.excluded.forEach(function (id) { var e = dmWholeEntryFor(id); if (e) ex[id] = [e]; });
            if (window.dmSyncExclusions) window.dmSyncExclusions();
          }
          // Applying the scope = restoring its time window; the toggle cascades
          // to the summary line, totals cards and both table views.
          var wBtn = document.querySelector('#dmWindowToggle [data-dm-window="' + scope.window + '"]');
          if (wBtn) wBtn.click();
        });
      });
    })();

    // ── Finalize and Save — name the scope, then hand off to the API ──
    //    Saved scopes accumulate in window.DM_SAVED_SCOPES so the Saved Scopes
    //    flow (load / rename / delete) has real data to work with. ──
    window.DM_SAVED_SCOPES = window.DM_SAVED_SCOPES || [];
    (function () {
      var modalEl = document.getElementById('dmFinalizeModal');
      var nameEl  = document.getElementById('dmScopeName');
      var noteEl  = document.getElementById('dmFinalizeSummary');
      var saveBtn = document.getElementById('dmFinalizeSave');
      if (!(modalEl && nameEl && noteEl && saveBtn)) return;

      function scope() {
        var key = window.dmWindow || 'caseWindow';
        var t   = (window.DM_TOTALS || {})[key] || {};
        // Demo: the counts are what is IN scope now (filters + exclusions), from
        // dmScopeCounts(), so the note agrees with the summary line minus the
        // footer's "removed" figure.
        var c = dmScopeCounts();
        return {
          name: nameEl.value.trim(),
          window: key,
          scopeLabel: t.scopeLabel || '',
          items: c.items.toLocaleString('en-US'),
          sources: String(c.sources),
          excluded: dmWholeExcludedIds()
        };
      }
      function syncNote() {
        var s = scope();
        noteEl.textContent = s.items + ' items across ' + s.sources +
          ' sources will be saved with this scope: ' + s.scopeLabel + '.';
      }
      // Primary stays disabled until the scope is named (Figma: Modal vs Valid).
      function syncValid() { saveBtn.disabled = nameEl.value.trim() === ''; }

      nameEl.addEventListener('input', syncValid);
      modalEl.addEventListener('show.cnds.modal', function () { syncNote(); syncValid(); });
      modalEl.addEventListener('shown.cnds.modal', function () { nameEl.focus(); });
      // Start clean each time so a previous name doesn't linger.
      modalEl.addEventListener('hidden.cnds.modal', function () { nameEl.value = ''; syncValid(); });
      syncNote(); syncValid();

      saveBtn.addEventListener('click', function () {
        var s = scope();
        if (!s.name) { syncValid(); return; } // defensive: button should be disabled
        dmHideModal(modalEl);
        saveBtn.disabled = true;
        dmRun('saveScope', [s], 'Data Map saved successfully.', 'The scope could not be saved.', function () {
          // Demo: the demo clock (M.DEMO_TODAY) in the house date format, like the
          // seeded scopes; production writes new Date() in the browser's locale.
          s.savedAt = dmSavedAt(M.DEMO_TODAY, new Date());
          s.author = null; // your own scope → gets DELETE / RENAME / LOAD
          window.DM_SAVED_SCOPES.push(s);
          if (window.dmRenderScopes) window.dmRenderScopes();
        }).then(syncValid);
      });
    })();

    /* ══════════════════════════════════════════════════════════════════════
       VIEW SOURCE — Source Details + Item Details drawers
       Figma: View Source (17261:1412952). Clicking a source name in either
       sources table opens the drawer. Tabs, hint copy, columns and sort
       options are declared in TABS below; the data comes from
       DM_SOURCE_DETAILS. Exclusions stage locally and only reach the page on
       APPLY EXCLUSIONS, which is also what raises the Excluding chip, the
       "Exclusions Applied" row badge and the footer count.
       ══════════════════════════════════════════════════════════════════════ */
    window.DM_EXCLUSIONS = window.DM_EXCLUSIONS || {};   // { sourceId: [{path, items, name, sid, …}] }
    (function () {
      var drawerEl = document.getElementById('dmSourceDrawer');
      var itemEl   = document.getElementById('dmItemDrawer');
      if (!(drawerEl && itemEl)) return;

      // ── per-tab configuration: label, hint copy, columns, sort options ──
      var TABS = {
        location: {
          label: 'Location View',
          hint: 'Click a location name to see its items.',
          cols: [['Location', ''], ['Items', 'dm-col-num'], ['Last Activity', 'dm-col-when'], ['', 'dm-col-act']],
          sort: [['path', 'Location'], ['items', 'Items'], ['lastActivity', 'Last Activity']]
        },
        item: {
          label: 'Item View',
          hint: 'Item-level detail for forensic review, one location at a time. Full paths shown here are never used in the standard views.',
          cols: [['Name', ''], ['Type', ''], ['Modified', 'dm-col-when'], ['UAL Activity', ''], ['Owner', '']],
          sort: [['name', 'Name'], ['type', 'Type'], ['modified', 'Modified'], ['owner', 'Owner']]
        },
        participants: {
          label: 'Participants',
          hint: 'Channel membership roster — who belongs to this channel, independent of who has actually posted or read.',
          cols: [['Name', ''], ['Role', ''], ['Member Since', 'dm-col-when'], ['Custodian Status', 'dm-col-status']],
          sort: [['name', 'Name'], ['role', 'Role'], ['since', 'Member Since']]
        },
        // Copilot's roster: same shape as Accessed but the last column excludes
        // the person instead of reporting custodian status.
        sessions: {
          label: 'Accessed',
          hint: 'Everyone with recorded UAL activity against this source in the case window — this reflects observed access, not granted permissions. Custodian status flagged from the case roster.',
          cols: [['Name', ''], ['Role', ''], ['Sessions', 'dm-col-num'], ['', 'dm-col-act']],
          sort: [['sessions', 'Sessions'], ['name', 'Name'], ['role', 'Role']],
          dir: 'desc'
        },
        accessed: {
          label: 'Accessed',
          hint: 'Everyone with recorded UAL activity against this source in the case window — this reflects observed access, not granted permissions. Custodian status flagged from the case roster.',
          cols: [['Name', ''], ['Role', ''], ['Events', 'dm-col-num'], ['Custodian Status', 'dm-col-status']],
          // Figma opens Accessed on Events, most-active first.
          sort: [['events', 'Events'], ['name', 'Name'], ['role', 'Role']],
          dir: 'desc'
        }
      };

      var el = {
        icon: document.getElementById('dmDrawerIcon'), name: document.getElementById('dmDrawerName'),
        path: document.getElementById('dmDrawerPath'), tabs: document.getElementById('dmDrawerTabs'),
        hint: document.getElementById('dmDrawerHint'), banner: document.getElementById('dmExclBanner'), slot: document.getElementById('dmExclSlot'),
        locs: document.getElementById('dmDrawerLocs'), head: document.getElementById('dmDrawerHead'),
        rows: document.getElementById('dmDrawerRows'), search: document.getElementById('dmDrawerSearch'),
        sort: document.getElementById('dmDrawerSort'), dir: document.getElementById('dmDrawerSortDir'),
        apply: document.getElementById('dmDrawerApply'), cancel: document.getElementById('dmDrawerCancel')
      };

      // Current drawer state. `staged` holds exclusions not yet applied.
      var S = { source: null, data: null, tab: 'location', loc: null,
                q: '', sortBy: 'path', dir: 'asc', staged: [] };
      var matching = [];

      var num = window.dmNum;   // shared parser — see dmNum
      function rowsForTab() {
        if (!S.data) return [];
        if (S.tab === 'location') return S.data.locations || [];
        if (S.tab === 'accessed') return S.data.accessed || [];
        if (S.tab === 'participants') return S.data.participants || [];
        if (S.tab === 'sessions') return S.data.sessions || [];
        return (S.data.items && S.data.items[S.loc]) || [];
      }
      function isExcluded(path) { return S.staged.indexOf(path) !== -1; }
      /* True when the whole source is excluded (committed from the sources table).
         In that state the drawer is read-only: each child exclude button is
         DISABLED (child rows keep their default look), and an "Entire source
         excluded" alert stands in for the staged-count banner. Un-excluding is
         done from the sources table. */
      function isSourceWhole() {
        return window.dmHasWhole((window.DM_EXCLUSIONS || {})[S.exKey]);
      }
      /* What this source excludes. Location-tree sources (SharePoint/OneDrive/Teams)
         get the historical default; Copilot overrides it via `data.exclude`. */
      var EXCL_DEFAULT = { tab: 'location', key: 'path', metricKey: 'items', unit: 'location', units: 'locations', metric: 'items' };
      function exclCfg() { return (S.data && S.data.exclude) || EXCL_DEFAULT; }
      /** The rows the exclusion action operates on, whichever tab that is. */
      function exclRows() {
        var c = exclCfg();
        return (c.tab === 'location' ? (S.data.locations || []) : (S.data[c.tab] || []));
      }

      function recompute() {
        var list = rowsForTab().filter(function (r) {
          if (!S.q) return true;
          // Demo: keys starting "_" are internal (person id, masking flags, ISO sort
          // keys) and must not match a search, or a masked person's id would
          // reveal who they are.
          return Object.keys(r).some(function (k) {
            return k.charAt(0) !== '_' && String(r[k]).toLowerCase().indexOf(S.q) !== -1;
          });
        });
        var key = S.sortBy;
        list = list.slice().sort(function (a, b) {
          // Demo: dates display as mm-dd-yyyy, which does not sort as text across
          // years; a row may carry an ISO "_<key>" to sort by instead.
          var av = a['_' + key] !== undefined ? a['_' + key] : a[key];
          var bv = b['_' + key] !== undefined ? b['_' + key] : b[key], r;
          if (av === undefined) return 0;
          r = (/^[\d,]+$/.test(String(av))) ? num(av) - num(bv) : String(av).localeCompare(String(bv));
          return S.dir === 'asc' ? r : -r;
        });
        matching = list;
      }

      var pager = dmCreatePager({
        toolbar: drawerEl.querySelector('.pagination-toolbar'),
        rowsEl: el.rows,
        getTotal: function () { return matching.length; },
        render: function (start, end) { el.rows.innerHTML = matching.slice(start, end).map(rowHtml).join(''); }
      });

      /**
       * Name + status cells for the person tabs (Participants / Accessed).
       * Both are derived from the SAME condition, in one place: a person who can
       * still be promoted gets MARK AS CUSTODIAN *and* a linked name; once they
       * are a custodian, both revert to plain text. Deriving them together is
       * what guarantees a linked name always has a button beside it — the two
       * cannot drift apart as rows re-render on sort, search or paging.
       * The Copilot `sessions` tab has no custodian status, so no links there.
       * Angular: one <ng-container> computing `pending` once, feeding both cells.
       */
      function personCells(r) {
        var pending = r.status === 'Mark as Custodian';
        // Demo: masked people (outside the viewer's regions) and guests can be seen
        // here but not promoted. Their names are not links, and MARK AS CUSTODIAN
        // stays visible but disabled, with the reason (disable, never hide).
        var blocked = r._masked || r._guest;
        return {
          name: (r._masked ? dmMaskedHtml()
            : pending && !blocked
              ? '<a href="' + DM_PROFILE_HREF + '" class="dm-custodian-name" data-dm-person="' + dmEsc(r._pid) + '">' + dmEsc(r.name) + '</a>'
              : dmEsc(r.name)) + (r._guest ? dmGuestBadge() : ''),
          status: pending
            ? (blocked ? dmBlockedMark(r._masked ? DM_REASON_MASKED : DM_REASON_GUEST, 'dm-status-mark')
                       : '<button type="button" class="btn btn-tertiary btn-sm dm-status-mark" data-dm-mark="' + dmEsc(r._pid) + '">Mark as Custodian</button>')
            : dmEsc(r.status)
        };
      }

      function rowHtml(r) {
        // When the whole source is excluded the drawer is read-only: the exclude
        // buttons are DISABLED, but the child rows keep their default (un-red)
        // state — the "Entire source excluded" alert carries the message instead.
        var whole = isSourceWhole();
        if (S.tab === 'location') {
          var ex = isExcluded(r.path);
          return '<tr' + (ex ? ' class="dm-row-excluded"' : '') + '>' +
            // Demo: a source with no Item View (not integrated: Box, Webex, file
          // share) lists its one location as plain text, not a link.
          '<td>' + ((S.data.tabs || []).indexOf('item') !== -1
            ? '<button type="button" class="dm-loc-name" data-dm-loc="' + dmEsc(r.path) + '">' + dmEsc(r.path) + '</button>'
            : dmEsc(r.path)) + '</td>' +
            '<td class="dm-col-num">' + dmEsc(r.items) + '</td>' +
            '<td class="dm-col-when">' + dmEsc(r.lastActivity) + '</td>' +
            '<td class="dm-col-act"><button type="button" class="btn btn-tertiary btn-sm dm-excl-btn" data-dm-excl="' + dmEsc(r.path) + '"' + (whole ? ' disabled' : '') + '>' +
              (ex ? 'Excluded' : 'Exclude') + '</button></td></tr>';
        }
        if (S.tab === 'sessions') {
          var sx = isExcluded(r[exclCfg().key]);   // demo: keyed by person id (names can be masked)
          return '<tr' + (sx ? ' class="dm-row-excluded"' : '') + '><td>' + (r._masked ? dmMaskedHtml() : dmEsc(r.name)) + '</td>' +
            '<td>' + dmEsc(r.role) + '</td><td class="dm-col-num">' + dmEsc(r.sessions) + '</td>' +
            '<td class="dm-col-act"><button type="button" class="btn btn-tertiary btn-sm dm-excl-btn" data-dm-excl="' + dmEsc(r[exclCfg().key]) + '"' + (whole ? ' disabled' : '') + '>' +
              (sx ? 'Excluded' : 'Exclude') + '</button></td></tr>';
        }
        if (S.tab === 'participants') {
          var pc = personCells(r);
          return '<tr><td>' + pc.name + '</td><td>' + dmEsc(r.role) + '</td>' +
            '<td class="dm-col-when">' + dmEsc(r.since) + '</td><td class="dm-col-status">' + pc.status + '</td></tr>';
        }
        if (S.tab === 'accessed') {
          var ac = personCells(r);
          return '<tr><td>' + ac.name + '</td><td>' + dmEsc(r.role) + '</td>' +
            '<td class="dm-col-num">' + dmEsc(r.events) + '</td><td class="dm-col-status">' + ac.status + '</td></tr>';
        }
        return '<tr><td><button type="button" class="dm-item-link" data-dm-item="' + dmEsc(r.name) + '">' + dmEsc(r.name) + '</button></td>' +
          '<td>' + dmEsc(r.type) + '</td><td class="dm-col-when">' + dmEsc(r.modified) + '</td>' +
          '<td>' + dmEsc(r.ual) + '</td><td>' + (r._ownerMasked ? dmMaskedHtml() : dmEsc(r.owner)) + '</td></tr>';
      }

      function renderHead() {
        var cfg = TABS[S.tab];
        el.head.innerHTML = '<tr>' + cfg.cols.map(function (c) {
          return '<th scope="col"' + (c[1] ? ' class="' + c[1] + '"' : '') + '>' + c[0] + '</th>';
        }).join('') + '</tr>';
      }
      function renderSortOptions() {
        var cfg = TABS[S.tab];
        el.sort.innerHTML = cfg.sort.map(function (o, i) {
          return '<option value="' + o[0] + '"' + (i === 0 ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('');
        S.sortBy = cfg.sort[0][0];
        if (window.Nimbus && Nimbus.Select) {
          try { Nimbus.Select.getOrCreateInstance(el.sort)._renderOptions(); } catch (e) {}
          try { Nimbus.Select.getOrCreateInstance(el.sort).setValue([S.sortBy]); } catch (e) {}
        }
      }
      function renderBanner() {
        // Whole-source exclusion overrides the staged-count message.
        if (isSourceWhole()) {
          el.banner.innerHTML = 'Entire source excluded';
          el.slot.classList.add('show');
          el.slot.setAttribute('aria-hidden', 'false');
          return;
        }
        var n = S.staged.length;
        // Keep the copy while fading out — only rewrite it when there's something
        // to show, so the banner doesn't blank mid-transition.
        if (n) {
          var c = exclCfg();
          var items = S.staged.reduce(function (sum, p) {
            var row = exclRows().filter(function (l) { return l[c.key] === p; })[0];
            return sum + (row ? num(row[c.metricKey]) : 0);
          }, 0);
          el.banner.innerHTML = '<b>' + n + '</b> ' + (n === 1 ? c.unit : c.units) +
            ' excluded · <b>' + items.toLocaleString() + '</b> ' + c.metric + ' removed from scope';
        }
        el.slot.classList.toggle('show', n > 0);
        el.slot.setAttribute('aria-hidden', String(n === 0));
      }
      function renderTabs() {
        el.tabs.innerHTML = (S.data.tabs || []).map(function (t) {
          return '<button type="button" class="btn btn-secondary btn-sm' + (t === S.tab ? ' active' : '') +
                 '" aria-pressed="' + (t === S.tab) + '" data-dm-tab="' + t + '">' + TABS[t].label + '</button>';
        }).join('');
      }
      function renderLocs() {
        var show = S.tab === 'item' && S.data.locations;
        el.locs.hidden = !show;
        if (!show) return;
        el.locs.innerHTML = S.data.locations.map(function (l) {
          return '<li class="nav-item"><button type="button" class="nav-link' + (l.path === S.loc ? ' active' : '') +
                 '" data-dm-loc-chip="' + dmEsc(l.path) + '">' + dmEsc(l.path) + '</button></li>';
        }).join('');
      }
      function renderFooter() {
        // Only the source's designated exclusion tab can exclude; others just
        // close. A whole-excluded source is read-only, so no Apply anywhere.
        var canExclude = S.tab === exclCfg().tab && !isSourceWhole();
        el.apply.hidden = !canExclude;
        el.cancel.textContent = canExclude ? 'Cancel' : 'Close';
        el.apply.disabled = !S.staged.length;
      }
      function refresh(animate) { recompute(); if (pager) pager.reset(animate); renderFooter(); }
      function renderAll() {
        renderTabs(); renderLocs(); renderHead(); renderSortOptions(); renderBanner();
        // Demo (PRD 01): a source CaseFusion does not integrate with (Box, Webex,
        // file share) opens on Location View with one location and says why there
        // is no activity, in place of the "click a location" hint.
        el.hint.textContent = (S.data.note && S.tab === 'location') ? S.data.note : TABS[S.tab].hint;
        el.search.value = ''; S.q = '';
        S.dir = TABS[S.tab].dir || 'asc';
        el.dir.setAttribute('data-dir', S.dir);
        el.dir.setAttribute('aria-label', 'Sort direction, ' + (S.dir === 'asc' ? 'ascending' : 'descending'));
        el.dir.querySelector('.dm-sort-dir-label').textContent = S.dir === 'asc' ? 'Asc' : 'Dsc';
        refresh();
      }

      /** Open the drawer for a source name shown in a sources table. */
      /** Open the drawer for a source id (demo: production keys by display name). */
      function openSource(id) {
        // Demo: every Meridian source has detail, built by the adapter from
        // M.dataMap (dmSourceDetail) for the active window — the stand-in for
        // GET /sources/:id/detail. There is no generator and no authored subset.
        var data = window.dmSourceDetail ? window.dmSourceDetail(id) : null;
        if (!data) return false;          // nothing to show → leave the link inert
        var name = data.name;
        S.source = name; S.id = id; S.data = data; S.tab = (data.tabs || ['location'])[0];
        // Exclusion key: the source id (production's dmExKey stood in for it).
        S.exKey = window.dmExKey(id);
        // Item View always opens on the first folder in the location list.
        S.loc = (data.locations && data.locations[0]) ? data.locations[0].path : null;
        // Whole-source exclusions come from the sources table and have no location
        // to stage — filter them out or the banner would count a phantom row.
        S.staged = (window.DM_EXCLUSIONS[S.exKey] || [])
          .filter(function (e) { return !e.whole; })
          .map(function (e) { return e.key || e.path; });
        // Demo: a source owned by someone outside the viewer's regions is masked.
        if (data.masked) el.name.innerHTML = dmMaskedHtml(); else el.name.textContent = name;
        el.path.textContent = data.path || '';
        el.icon.innerHTML = (window.dmTable && dmTable.icon) ? dmTable.icon(data.type) : '';
        renderAll();
        if (window.Nimbus && Nimbus.Offcanvas) Nimbus.Offcanvas.getOrCreateInstance(drawerEl).show();
        return true;
      }
      window.dmOpenSource = openSource;

      // Source-name clicks in either sources table (delegated — rows re-render).
      document.addEventListener('click', function (e) {
        var a = e.target.closest('#dmViewBySource .dm-source-name');
        if (!a) return;
        e.preventDefault();               // demo: never follow href="#"
        var tr = a.closest('tr');
        // Demo: rows carry the source id (data-dm-xid), so no descriptor is scraped
        // from the markup to feed a generator.
        if (tr) openSource(tr.getAttribute('data-dm-xid'));
      });

      // Tabs / location chips / row actions inside the drawer
      el.tabs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-tab]'); if (!b) return;
        // Columns, hint and rows all change together — fade the table as one block.
        var table = el.rows.closest('table') || el.rows;
        var run = function () { S.tab = b.getAttribute('data-dm-tab'); renderAll(); };
        if (window.dmCrossfade) dmCrossfade(table, run); else run();
      });
      el.locs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-loc-chip]'); if (!b) return;
        var run = function () { S.loc = b.getAttribute('data-dm-loc-chip'); renderLocs(); refresh(); };
        if (window.dmCrossfade) dmCrossfade(el.rows, run); else run();
      });
      el.rows.addEventListener('click', function (e) {
        var loc = e.target.closest('[data-dm-loc]');
        var ex  = e.target.closest('[data-dm-excl]');
        var it  = e.target.closest('[data-dm-item]');
        var mk  = e.target.closest('[data-dm-mark]');
        if (mk) { dmMarkCustodian(mk.getAttribute('data-dm-mark'), mk); return; }
        if (loc) {                       // location name → Item View for that location
          S.loc = loc.getAttribute('data-dm-loc'); S.tab = 'item'; renderAll(); return;
        }
        if (ex) {                        // stage / unstage an exclusion
          var p = ex.getAttribute('data-dm-excl');
          var i = S.staged.indexOf(p);
          if (i === -1) S.staged.push(p); else S.staged.splice(i, 1);
          renderBanner(); refresh(); return;
        }
        if (it) openItem(it.getAttribute('data-dm-item'));
      });

      // Toolbar
      el.search.addEventListener('input', function () { S.q = el.search.value.trim().toLowerCase(); refresh(); });
      function onSort() { S.sortBy = el.sort.value; refresh(true); }
      el.sort.addEventListener('change', onSort);
      el.sort.addEventListener('valueChanged.cnds.select', onSort);
      el.dir.addEventListener('click', function () {
        S.dir = S.dir === 'asc' ? 'desc' : 'asc';
        el.dir.setAttribute('data-dir', S.dir);
        el.dir.setAttribute('aria-label', 'Sort direction, ' + (S.dir === 'asc' ? 'ascending' : 'descending'));
        el.dir.querySelector('.dm-sort-dir-label').textContent = S.dir === 'asc' ? 'Asc' : 'Dsc';
        refresh(true);
      });

      // ── Apply exclusions: commit to the page ──
      el.apply.addEventListener('click', function () {
        var srcName = S.source;
        var c = exclCfg();
        // Entries stay {path, items} so every consumer keeps working; `name` labels
        // the chip, and `unit`/`metric` name what was removed. Keyed by S.exKey.
        var picked = S.staged.map(function (p) {
          var l = exclRows().filter(function (x) { return x[c.key] === p; })[0];
          // Demo: `key` is what was staged (a location path, or a person id for
          // Copilot); `path` is what the chip shows (the person's name, masked if
          // outside the viewer's regions); `sid` lets the counts be re-derived when
          // the window or date range changes (dmRefreshExclusionCounts).
          var shown = c.key === '_pid' ? (l && l._masked ? 'Profile details limited' : (l ? l.name : p)) : p;
          return { path: shown, key: p, sid: S.id, items: l ? l[c.metricKey] : '0', name: srcName,
                   unit: c.unit, units: c.units, metric: c.metric };
        });
        el.apply.disabled = true;
        dmRun('applyExclusions', [srcName, picked], 'Exclusions applied successfully.',
              'The exclusions could not be applied.', function () {
          if (picked.length) window.DM_EXCLUSIONS[S.exKey] = picked;
          else delete window.DM_EXCLUSIONS[S.exKey];
          if (window.dmSyncExclusions) window.dmSyncExclusions();
          if (window.Nimbus && Nimbus.Offcanvas) Nimbus.Offcanvas.getOrCreateInstance(drawerEl).hide();
        }).then(function () { el.apply.disabled = !S.staged.length; });
      });

      /* ── Item Details (stacked drawer) ── */
      var iEl = {
        name: document.getElementById('dmItemName'), sub: document.getElementById('dmItemSub'),
        rows: document.getElementById('dmItemRows'), search: document.getElementById('dmItemSearch'),
        show: document.getElementById('dmItemShow')
      };
      var I = { events: [], q: '', show: 'all' };
      var iMatching = [];
      var iPager = dmCreatePager({
        toolbar: itemEl.querySelector('.pagination-toolbar'),
        rowsEl: iEl.rows,
        getTotal: function () { return iMatching.length; },
        render: function (s, e2) {
          iEl.rows.innerHTML = iMatching.slice(s, e2).map(function (ev) {
            return '<tr><td>' + dmEsc(ev.event) + '</td><td class="dm-col-when">' + dmEsc(ev.when) + '</td></tr>';
          }).join('');
        }
      });
      function iRefresh() {
        iMatching = I.events.filter(function (ev) {
          if (I.show !== 'all' && ev.kind !== I.show) return false;
          return !I.q || ev.event.toLowerCase().indexOf(I.q) !== -1;
        });
        if (iPager) iPager.reset();
      }
      function openItem(fileName) {
        var row = (rowsForTab() || []).filter(function (r) { return r.name === fileName; })[0] || {};
        // Demo: events are built from the source's Accessed list (dmItemEvents),
        // so the people in an item's activity are people who used that source.
        I.events = window.dmItemEvents
          ? window.dmItemEvents(S.id, row)
          : ((window.DM_ITEM_EVENTS || {})[fileName] || []);
        I.q = ''; I.show = 'all';
        iEl.search.value = '';
        iEl.name.textContent = fileName;
        iEl.sub.textContent = 'Owned by ' + (row.owner || '—') + ' · last modified ' + (row.modified || '—') +
                              '. Sample UAL activity for this item during the case window.';
        iRefresh();
        if (window.Nimbus && Nimbus.Offcanvas) Nimbus.Offcanvas.getOrCreateInstance(itemEl).show();
      }
      // Each offcanvas appends its own backdrop at the shared z-index, which would
      // leave the item drawer's backdrop *behind* the source drawer. Tag the newest
      // backdrop so it sits directly behind the item drawer instead.
      itemEl.addEventListener('show.cnds.offcanvas', function () {
        setTimeout(function () {
          var backs = document.querySelectorAll('.offcanvas-backdrop');
          if (backs.length) backs[backs.length - 1].classList.add('dm-backdrop-item');
        }, 0);
      });
      iEl.search.addEventListener('input', function () { I.q = iEl.search.value.trim().toLowerCase(); iRefresh(); });
      function onShow() { I.show = iEl.show.value; iRefresh(); }
      iEl.show.addEventListener('change', onShow);
      iEl.show.addEventListener('valueChanged.cnds.select', onShow);
    })();

    // ── Exclusions → main page: refinement chip, row badge, footer count ──
    (function () {
      var footer = document.querySelector('.dm-footer-left');
      function sync() {
        var ex = window.DM_EXCLUSIONS || {};
        var names = Object.keys(ex);
        var locs = names.reduce(function (n, k) { return n + ex[k].length; }, 0);
        var items = names.reduce(function (n, k) {
          return n + ex[k].reduce(function (m, e) { return m + dmNum(e.items); }, 0);
        }, 0);

        // Refinement chip (one per excluded source)
        var chipSet = document.getElementById('dmRefinedChips');
        if (chipSet) {
          Array.prototype.forEach.call(chipSet.querySelectorAll('[data-dm-excl-src]'), function (c) { c.remove(); });
          names.forEach(function (k) {
            var label = (ex[k][0] && ex[k][0].name) || k;   // display name, not the key
            var paths = ex[k].map(function (e) { return e.path; }).join(', ');
            var count = ex[k].reduce(function (m, e) { return m + dmNum(e.items); }, 0);
            var chip = document.createElement('span');
            chip.className = 'chip';
            chip.setAttribute('data-dm-excl-src', k);
            chip.innerHTML = 'Excluding: ' + dmEsc(label) + ' ' + dmEsc(paths) + ' (' + count.toLocaleString() +
              ' ' + dmEsc(ex[k][0].metric || 'items') + ')' +
              '<i class="close mdi mdi-close-circle" role="button" tabindex="0" aria-label="Remove exclusion"></i>';
            chipSet.appendChild(chip);
          });
        }
        if (window.dmTable && dmTable.refreshBadges) dmTable.refreshBadges();
        if (window.dmTable && dmTable.refreshExclCells) dmTable.refreshExclCells();
        if (window.dmSyncRefined) window.dmSyncRefined();
        if (footer) {
          /* Exclusions can now mix units (SharePoint folders + Copilot people), so
             name them only when they agree; otherwise fall back to "exclusions".
             Metric totals are summed per metric so items and sessions never merge. */
          var all = names.reduce(function (a2, k) { return a2.concat(ex[k]); }, []);
          var units = all.map(function (e) { return e.units || 'locations'; })
                         .filter(function (u, i, a2) { return a2.indexOf(u) === i; });
          // Agreeing units read naturally ("3 locations excluded from scope");
          // mixed ones drop the verb, since nothing single-word covers both.
          var agreed = units.length === 1;
          var noun = agreed
            ? (locs === 1 ? (all[0].unit || 'location') : units[0]) + ' excluded from scope'
            : 'exclusion' + (locs === 1 ? '' : 's');
          var byMetric = {};
          all.forEach(function (e) {
            var m = e.metric || 'items';
            byMetric[m] = (byMetric[m] || 0) + dmNum(e.items);
          });
          var removed = Object.keys(byMetric).map(function (m) {
            return byMetric[m].toLocaleString() + ' ' + m;
          }).join(' · ');
          footer.textContent = locs
            ? locs + ' ' + noun + ' · ' + removed + ' removed · Ready to finalize'
            : 'No exclusions applied yet — scope matches the filters above';
        }
      }
      window.dmSyncExclusions = sync;
      // Removing an Excluding chip clears that source's exclusions.
      document.addEventListener('click', function (e) {
        var chip = e.target.closest('[data-dm-excl-src]');
        if (!chip || !e.target.closest('.close')) return;
        delete window.DM_EXCLUSIONS[chip.getAttribute('data-dm-excl-src')];
        sync();
      });
      sync();
    })();

    // ── Export CSV — modal copy + download handoff ──
    //    UI/UX only: the CSV itself is built server-side from a template, so
    //    DOWNLOAD CSV delegates to DM_API.exportCsv(payload). The default
    //    stub just resolves; devs swap in the real endpoint. Resolve → success
    //    toast, reject → error toast (Figma: Export CSV — End). ──
    (function () {
      var modalEl  = document.getElementById('dmExportModal');
      var noteEl   = document.getElementById('dmExportSummary');
      var download = document.getElementById('dmExportDownload');
      if (!(modalEl && noteEl && download)) return;

      // Describes exactly what the export will contain, for the active window.
      function payload() {
        var key = window.dmWindow || 'caseWindow';
        // Demo: counted from what is in scope now (filters + exclusions), as the
        // Finalize note is, instead of a fixed per-window total.
        var c = dmScopeCounts();
        return {
          window: key,
          view: document.querySelector('#dmViewByPeople:not([hidden])') ? 'people' : 'source',
          events: c.events.toLocaleString('en-US'),
          sources: String(c.sources)
        };
      }
      function syncNote() {
        var p = payload();
        noteEl.textContent =
          'This will export item-level detail for ' + p.events + ' events across ' + p.sources +
          ' sources, matching the current filters and refinements. Full source paths are ' +
          'included in the CSV; the app view continues to show relative names.';
      }
      // Counts can change (window toggle) between opens, so rebuild each time.
      modalEl.addEventListener('show.cnds.modal', syncNote);
      syncNote();

      download.addEventListener('click', function () {
        dmHideModal(modalEl);
        download.disabled = true;
        dmRun('exportCsv', [payload()], 'Download successful.', 'The export could not be completed.')
          .then(function () { download.disabled = false; });
      });
    })();

    // Refined results — hidden until a refinement chip exists (date range or exclusions).
    // Angular: bind [hidden]="!(dateRange || exclusions.length)".
    (function () {
      var refined = document.getElementById('dmRefined');
      if (!refined) return;
      var chipSet = document.getElementById('dmRefinedChips');
      function syncRefined() {
        var has = refined.querySelectorAll('.dm-chip-set .chip').length > 0;
        if (window.dmFadeCard) dmFadeCard(refined, has); else refined.hidden = !has;
        syncRefinedActions();   // each clear shows only while it has work to do
      }
      window.dmSyncRefined = syncRefined;
      // Re-hide once the last refinement chip is dismissed.
      refined.addEventListener('click', function (e) {
        if (e.target.closest('.close')) {
          var chip = e.target.closest('.chip');
          if (chip && chip.id === 'dmRefinedDateChip' && window.dmClearDateRange) window.dmClearDateRange();
          else if (chip) chip.remove();
          setTimeout(syncRefined, 0);
        }
      });

      /* ── Refined-results actions ─────────────────────────────────────────
         Two narrowly-scoped clears, each showing ONLY when it has something to
         clear. They are deliberately NOT "Clear All Filters": the filters
         themselves are cleared from the Edit Filters panel, which owns that
         button. Refinements are what has been applied on top of the filters.

           Clear Date Ranges     → drops the date chip + resets the pickers to
                                   the case window. Touches no filter.
           Clear All Exclusions  → empties DM_EXCLUSIONS and re-syncs, which
                                   removes every "Excluding: …" chip, refreshes
                                   the source-table badges and the scope footer.

         Angular: two buttons with *ngIf="hasDateRange" / *ngIf="hasExclusions",
         dispatching clearDateRange() / clearExclusions() on the store. ── */
      var clearDates = document.getElementById('dmRefinedClearDates');
      var clearExcl  = document.getElementById('dmRefinedClearExclusions');

      if (clearDates) clearDates.addEventListener('click', function () {
        if (window.dmClearDateRange) window.dmClearDateRange();
      });
      if (clearExcl) clearExcl.addEventListener('click', function () {
        var ex = window.DM_EXCLUSIONS || {};
        Object.keys(ex).forEach(function (k) { delete ex[k]; });
        if (window.dmSyncExclusions) window.dmSyncExclusions();   // chips + badges + footer
        syncRefined();                                            // fade the card out if now empty
      });

      /**
       * Show each action only when its own refinement type is present.
       * Called from syncRefined(), so it re-evaluates on every chip change.
       */
      function syncRefinedActions() {
        var hasDates = !!document.getElementById('dmRefinedDateChip');
        var hasExcl  = !!refined.querySelector('[data-dm-excl-src]');
        [[clearDates, hasDates], [clearExcl, hasExcl]].forEach(function (pair) {
          var btn = pair[0], show = pair[1];
          if (!btn) return;
          btn.classList.toggle('is-gone', !show);
          btn.setAttribute('aria-hidden', String(!show));
          btn.tabIndex = show ? 0 : -1;
        });
      }
      // Kept for callers that still ping it when the Edit Filters panel toggles.
      window.dmSyncRefinedClear = syncRefinedActions;
      syncRefinedActions();

      // ── Add Date Range — popover with two Nimbus DatePickers (From / To) ──
      // Nimbus components load asynchronously (nimbus.js dynamic loader), so this
      // must wait until the datepicker plugin is available (cnds.ready).
      function initDateRange() {
        var wrap   = document.getElementById('dmDateRangeWrap');
        var toggle = document.getElementById('dmAddDateRange');
        var menu   = document.getElementById('dmDateRangeMenu');
        var fromField = document.getElementById('dmDateFromField');
        var toField   = document.getElementById('dmDateToField');
        if (!(wrap && toggle && menu && fromField && toField && window.Nimbus && Nimbus.Datepicker)) return;

        var fromDp = Nimbus.Datepicker.getOrCreateInstance(fromField);
        var toDp   = Nimbus.Datepicker.getOrCreateInstance(toField);
        var addBtn = document.getElementById('dmDateAdd');
        var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        // Case start/end dates — defaults for both fields (future API: window.DM_CASE_DATES).
        var CASE_DATES = window.DM_CASE_DATES || {};
        // Tracks a field whose typed text failed to parse — the field's datepicker
        // may still hold a stale valid date, so this must gate validity independently.
        var badFormat = {}; badFormat[fromField.id] = false; badFormat[toField.id] = false;

        function fmtChip(a, b) {
          var sameYear = a.getFullYear() === b.getFullYear();
          var left = MONTHS[a.getMonth()] + ' ' + a.getDate() + (sameYear ? '' : ', ' + a.getFullYear());
          var right = MONTHS[b.getMonth()] + ' ' + b.getDate() + ', ' + b.getFullYear();
          return left + ' – ' + right;
        }
        function setInvalid(field, on, msg) {
          field.classList.toggle('is-invalid', !!on);
          if (msg) { var e = field.querySelector('.cf-input-error'); if (e) e.textContent = msg; }
        }
        // Live validity: ADD is disabled unless both dates are set and From <= To.
        // Ordering error (From must not be after To, and vice versa) shows inline.
        function refreshValidity() {
          var a = fromDp.getDate(), b = toDp.getDate();
          var fromBad = badFormat[fromField.id], toBad = badFormat[toField.id];
          // Unparseable typed text takes priority over the picker's stale date.
          setInvalid(fromField, fromBad, fromBad ? 'Enter a valid date (mm/dd/yyyy).' : '');
          setInvalid(toField,   toBad,   toBad   ? 'Enter a valid date (mm/dd/yyyy).' : '');
          var outOfOrder = !fromBad && !toBad && !!(a && b && a > b);
          if (outOfOrder) {
            setInvalid(fromField, true, 'Start date must be on or before the end date.');
            setInvalid(toField,   true, 'End date must be on or after the start date.');
          }
          addBtn.disabled = fromBad || toBad || !(a && b) || outOfOrder;
        }
        // Reset both fields back to the case window defaults.
        function resetToCaseWindow() {
          badFormat[fromField.id] = false; badFormat[toField.id] = false;
          if (CASE_DATES.start) fromDp.setDate(CASE_DATES.start); else fromDp.clear();
          if (CASE_DATES.end)   toDp.setDate(CASE_DATES.end);   else toDp.clear();
          refreshValidity();
        }
        // The ONLY accepted manual format is mm/dd/yyyy — exactly two-digit month
        // and day (zero-padded) and four-digit year. Also rejects out-of-range days
        // like 02/30 (the datepicker's own parse would roll these over).
        function parseMDY(s) {
          var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
          if (!m) return null;
          var mo = +m[1], da = +m[2], yr = +m[3];
          if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
          var d = new Date(yr, mo - 1, da);
          return (d.getMonth() === mo - 1 && d.getDate() === da) ? d : null;
        }
        // Input mask — keep only digits, cap at mmddyyyy, and re-insert the slashes
        // so the field can never hold anything but the mm/dd/yyyy shape.
        function maskDate(input) {
          var digits = input.value.replace(/\D/g, '').slice(0, 8);
          var out = digits;
          if (digits.length > 4)      out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
          else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
          input.value = out;
        }
        // Commit a manually-typed value (on blur / Enter). Empty clears; a valid
        // date normalizes via setDate (which re-renders + fires change); anything
        // else flags the field invalid and leaves the text for the user to fix.
        function commitTyped(field, dp) {
          var input = field.querySelector('input');
          var raw = input.value.trim();
          if (!raw) { badFormat[field.id] = false; dp.clear(); refreshValidity(); return; }
          var d = parseMDY(raw);
          if (d) { badFormat[field.id] = false; dp.setDate(d); refreshValidity(); }
          else   { badFormat[field.id] = true; refreshValidity(); }
        }
        function openMenu() {
          menu.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          toggle.classList.add('active');
          document.addEventListener('click', onOutside, true);
        }
        function closeMenu() {
          menu.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.classList.remove('active');
          document.removeEventListener('click', onOutside, true);
        }
        function onOutside(e) {
          if (!wrap.contains(e.target)) closeMenu();
        }

        toggle.addEventListener('click', function (e) {
          e.stopPropagation();
          if (menu.hidden) openMenu(); else closeMenu();
        });

        // Re-evaluate on every date change (picking, clearing, today button). A
        // datepicker change means a valid date (or a clear) — so the field's text
        // is no longer in a bad-format state.
        fromField.addEventListener('change.cnds.datepicker', function () { badFormat[fromField.id] = false; refreshValidity(); });
        toField.addEventListener('change.cnds.datepicker',   function () { badFormat[toField.id]   = false; refreshValidity(); });

        // Manual entry: parse the typed value on blur, and on Enter (which the
        // datepicker would otherwise consume to open the calendar — intercept it
        // in the capture phase so Enter commits the typed date instead).
        [[fromField, fromDp], [toField, toDp]].forEach(function (pair) {
          var field = pair[0], dp = pair[1];
          var input = field.querySelector('input');
          input.addEventListener('input', function () { maskDate(input); });
          input.addEventListener('change', function () { commitTyped(field, dp); });
          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitTyped(field, dp); }
          }, true);
        });

        resetToCaseWindow(); // prefill from the case window + seed the enabled/disabled state

        document.getElementById('dmDateCancel').addEventListener('click', function () { closeMenu(); });
        document.getElementById('dmDateReset').addEventListener('click', function () { resetToCaseWindow(); });

        addBtn.addEventListener('click', function () {
          var a = fromDp.getDate(), b = toDp.getDate();
          if (!a || !b || a > b) { refreshValidity(); return; } // defensive: button should be disabled

          // Commit / update the Date Range refinement chip.
          var chip = document.getElementById('dmRefinedDateChip');
          if (!chip) {
            chip = document.createElement('span');
            chip.className = 'chip';
            chip.id = 'dmRefinedDateChip';
            chipSet.insertBefore(chip, chipSet.firstChild);
          }
          chip.innerHTML = 'Date Range: ' + fmtChip(a, b) +
            '<i class="close mdi mdi-close-circle" role="button" tabindex="0" aria-label="Remove date range filter"></i>';
          // Demo: the range refines the numbers too (production only adds the chip):
          // the summary, cards, both tables and the drawers recount for it.
          if (window.dmSetRange) window.dmSetRange({ from: a, to: b });
          syncRefined();
          closeMenu();
          if (window.dmToast) dmToast('success', 'Date range added', 'Date range added to the refined results.');
        });

        // Clearing the date-range refinement drops the chip and reverts the fields
        // to the case window default (they represent a refinement over that window,
        // so "no refinement" means show the case window — not blank fields).
        window.dmClearDateRange = function () {
          var chip = document.getElementById('dmRefinedDateChip');
          if (chip) chip.remove();
          resetToCaseWindow();
          if (window.dmSetRange) window.dmSetRange(null);   // demo: counts return to the window
          syncRefined();
        };
      }
      dmWhenNimbus(initDateRange);   // demo: see dmWhenNimbus (the flow may start after cnds.ready)
    })();

    // ── Shared toast helper (Nimbus Toast) — reused across datamap interactions ──
    function dmToast(variant, title, message) {
      if (!(window.Nimbus && Nimbus.Toast)) return null;
      var color = { success: 'success', error: 'danger', info: 'info' }[variant] || 'primary';
      var icon  = { success: 'mdi-check-circle', error: 'mdi-alert-circle', info: 'mdi-information' }[variant] || 'mdi-bell';
      var el = document.createElement('div');
      el.className = 'toast fade dm-toast';
      el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
      el.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.setAttribute('data-cnds-toast-init', '');
      el.setAttribute('data-cnds-color', color);
      el.setAttribute('data-cnds-position', 'bottom-right');
      el.setAttribute('data-cnds-append-to-body', 'true');
      el.setAttribute('data-cnds-stacking', 'true');
      el.setAttribute('data-cnds-width', '360px');
      el.setAttribute('data-cnds-autohide', 'true');
      el.setAttribute('data-cnds-delay', '3500');
      el.innerHTML =
        '<div class="toast-header">' +
          '<i class="mdi ' + icon + ' me-2" aria-hidden="true"></i>' +
          '<strong class="me-auto">' + title + '</strong>' +
          '<button type="button" class="btn-close" data-cnds-dismiss="toast" aria-label="Close"></button>' +
        '</div>' +
        (message ? '<div class="toast-body">' + message + '</div>' : '');
      document.body.appendChild(el);
      var t = Nimbus.Toast.getOrCreateInstance(el);
      el.addEventListener('hidden.cnds.toast', function () { el.remove(); });
      t.show();
      return t;
    }
    window.dmToast = dmToast;

    // ── Top Sources table controller. Row visibility combines two filters:
    //    (1) the Edit Filters source-type filter (multi, via dmTable.setSourceFilter)
    //    and (2) a summary-card single-source filter (breadcrumb). Exposed on
    //    window.dmTable so both flows drive the same render. ──
    (function () {
      var cards = Array.prototype.slice.call(document.querySelectorAll('#dmStatGrid .dm-stat'));
      // Scoped to this view — the By People table also uses .dm-table.
      var tbody = document.querySelector('#dmViewBySource .dm-table tbody');
      var rows  = [];
      var crumb = document.querySelector('.dm-topsrc-crumb');
      var crumbLabel = document.querySelector('.dm-topsrc-crumb-label');
      var clearBtn = document.querySelector('.dm-topsrc-clear');
      var scopeLabel = document.querySelector('.dm-topsrc-label');
      var state = { sources: null, card: null, scope: 'top' }; // sources: array | null(=all); card: source | null
      var matching = [];                         // rows passing the filters, pre-pagination

      // ── Scope: Top Sources vs All Sources.
      //    Demo: production kept the six Top Sources as authored markup and built
      //    600 generated rows for All Sources. Here both scopes render from the
      //    case's real sources (DM_ALL_SOURCES, items high → low): All Sources
      //    lists every one, Top Sources the first TOP_N of those that pass the
      //    filters. Rows carry the source id as data-dm-xid (the exclusion key). ──
      var TOP_N = 6;
      // Brand glyphs are inline in the summary cards — harvest one per source
      // type rather than duplicating the SVG markup in JS. Sources with no card
      // (not integrated: Box, Webex, file share) use an MDI glyph at the same size.
      var ICONS = {};
      cards.forEach(function (c) {
        var k = c.getAttribute('data-dm-source'), svg = c.querySelector('.dm-src-svg');
        if (k && svg && !ICONS[k]) ICONS[k] = svg.outerHTML.replace('class="dm-src-svg"', 'class="dm-src-svg dm-tbl-svg"');
      });
      Object.keys(DM_MDI_ICONS).forEach(function (k) {
        ICONS[k] = '<i class="mdi ' + DM_MDI_ICONS[k] + ' dm-src-svg dm-tbl-svg dm-src-mdi" role="img" aria-label="' + dmEsc(DM_TYPE_LABEL[k]) + '"></i>';
      });
      var esc = dmEsc;
      function rowHtml(r) {
        return '<tr data-dm-source="' + esc(r.type) + '" data-dm-xid="' + esc(r.id) + '">' +
          '<td><div class="dm-source">' + (ICONS[r.type] || '') +
            '<span class="dm-source-body">' +
              // Demo: masked owner → lock + "Profile details limited"; the link
              // still opens Source Details (the source is in the case).
              '<a href="#" class="dm-source-name">' + (r.masked ? dmMaskedHtml() : esc(r.name)) + '</a>' +
              '<span class="dm-source-path">' + esc(r.path) + '</span>' +
            '</span></div></td>' +
          '<td class="dm-col-items"><div class="dm-items">' +
            '<div class="progress" style="height:5px;"><div class="progress-bar" role="progressbar" style="width:' + r.bar + '%;" aria-valuenow="' + r.items + '" aria-valuemin="0" aria-valuemax="' + r.max + '" aria-label="' + esc(r.itemsText) + ' items"></div></div>' +
            '<b>' + esc(r.itemsText) + '</b>' +
          '</div></td>' +
          // Demo (PRD 01): a source with no audit-log activity says so here.
          '<td class="dm-col-people">' + esc(r.people) + '</td>' +
          '<td class="dm-col-act"><button type="button" class="btn btn-tertiary btn-sm dm-src-excl-btn">Exclude</button></td>' +
        '</tr>';
      }
      /** Demo: (re)build every row from DM_ALL_SOURCES — first paint, and after
          the window or date range changes the counts. */
      function rebuild(animate) {
        var swap = function () {
          tbody.innerHTML = (window.DM_ALL_SOURCES || { rows: [] }).rows.map(rowHtml).join('');
          tbody.removeAttribute('aria-busy');
          rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
          render(false);
        };
        if (window.dmCrossfade && animate !== false) dmCrossfade(tbody, swap); else swap();
      }
      function setScope(scope) {
        state.scope = scope;
        if (scopeLabel) scopeLabel.textContent = (scope === 'all') ? 'All Sources' : 'Top Sources';
        // A selected summary card filters by source TYPE, so the selection
        // survives the swap and is simply re-applied to the new row set. The cards
        // themselves are not re-rendered here, so their selected state and the
        // breadcrumb persist.
        var swap = function () { render(false); };
        if (window.dmCrossfade) dmCrossfade(tbody, swap); else swap();
      }

      // Pagination runs over the filtered set, so paging and filtering compose.
      var pager = dmCreatePager({
        toolbar: document.querySelector('#dmViewBySource .pagination-toolbar'),
        rowsEl: tbody,
        getTotal: function () { return matching.length; },
        render: function (start, end) {
          rows.forEach(function (r) { r.hidden = true; });
          matching.slice(start, end).forEach(function (r) { r.hidden = false; });
        }
      });

      function render(animate) {
        matching = rows.filter(function (r) {
          var src = r.getAttribute('data-dm-source');
          return (!state.sources || state.sources.indexOf(src) !== -1) &&
                 (!state.card || src === state.card);
        });
        if (state.scope === 'top') matching = matching.slice(0, TOP_N);   // demo: rows are already items high → low
        if (pager) pager.reset(animate !== false);  // filtering returns to page 1
        else rows.forEach(function (r) { r.hidden = matching.indexOf(r) === -1; });
        syncExclCells();               // rows may have just been rebuilt
        if (window.dmTable && dmTable.refreshBadges) dmTable.refreshBadges();
      }
      function crumbFor(card) {
        if (card) {
          if (crumbLabel) crumbLabel.textContent = card.getAttribute('data-dm-label') || card.getAttribute('data-dm-source');
          if (crumb) crumb.hidden = false;
          if (clearBtn) clearBtn.hidden = false;
        } else {
          if (crumb) crumb.hidden = true;
          if (clearBtn) clearBtn.hidden = true;
        }
      }
      function clearCard() {
        cards.forEach(function (c) { c.classList.remove('dm-selected'); c.setAttribute('aria-pressed', 'false'); });
        state.card = null; crumbFor(null); render();
      }
      function selectCard(card) {
        cards.forEach(function (c) { var on = c === card; c.classList.toggle('dm-selected', on); c.setAttribute('aria-pressed', String(on)); });
        state.card = card.getAttribute('data-dm-source'); crumbFor(card); render();
      }

      /* ══ WHOLE-SOURCE EXCLUSIONS (sources tables) ═════════════════════════
         The trailing Exclude column commits ON CLICK — no staging step. One
         click excludes the whole source (fires DM_API.applyExclusions, adds an
         Excluding chip, reddens the row, updates badges + scope footer, toasts);
         clicking an already-excluded row restores it. The drawer keeps its own
         stage-then-Apply model; only the table is immediate.

         A whole-source entry SUPERSEDES any per-location entries that source
         already had — committing replaces DM_EXCLUSIONS[name], so the two can
         never double-count. `whole: true` marks it, and the drawer filters those
         out when seeding its own staged list.

         Angular: the row action dispatches toggleSourceExclusion(name) on the
         same ExclusionStore the drawer writes to.
         ══════════════════════════════════════════════════════════════════════ */
      function srcNameOf(row) {
        var a = row.querySelector('.dm-source-name');
        return a ? a.textContent.trim() : null;
      }
      function xidOf(row) { return row.getAttribute('data-dm-xid'); }
      function itemsOf(row) {
        var b = row.querySelector('.dm-col-items b');
        return b ? b.textContent.trim() : '0';
      }
      /** A committed whole-source exclusion, in DM_EXCLUSIONS' entry shape.
          `name` is stored so the chip can label it — the key is the opaque xid. */
      function wholeEntry(row) {
        return { path: '— entire source', whole: true, items: itemsOf(row), sid: xidOf(row),
                 name: srcNameOf(row), unit: 'source', units: 'sources', metric: 'items' };
      }
      function isWholeExcluded(xid) {
        return window.dmHasWhole((window.DM_EXCLUSIONS || {})[xid]);
      }

      /** Paint every row's Exclude cell + red state from committed state. */
      function syncExclCells() {
        rows.forEach(function (r) {
          var btn = r.querySelector('.dm-src-excl-btn');
          if (!btn) return;
          var on = isWholeExcluded(xidOf(r));
          btn.textContent = on ? 'Excluded' : 'Exclude';
          r.classList.toggle('dm-row-excluded', on);
        });
      }

      // Delegated: rows are rebuilt on every scope switch and filter change.
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('.dm-src-excl-btn');
        if (!btn) return;
        var row = btn.closest('tr');
        var name = srcNameOf(row);
        var xid = xidOf(row);
        if (!name || !xid) return;
        // Toggle: exclude an in-scope source, or restore an excluded one. Both go
        // through applyExclusions (empty array = restore), matching the drawer.
        // Keyed by xid so byte-identical rows exclude independently.
        var entry = isWholeExcluded(xid) ? [] : [wholeEntry(row)];
        btn.disabled = true;
        dmRun('applyExclusions', [name, entry],
              entry.length ? 'Exclusions applied successfully.' : 'Source restored to scope.',
              'The exclusions could not be applied.', function () {
          if (entry.length) window.DM_EXCLUSIONS[xid] = entry;   // supersedes locations
          else delete window.DM_EXCLUSIONS[xid];
          if (window.dmSyncExclusions) window.dmSyncExclusions();
          syncExclCells();
        }).then(function () { btn.disabled = false; });
      });

      // Public API used by the Edit Filters flow.
      window.dmTable = {
        setSourceFilter: function (arr) {
          state.sources = (arr && arr.length) ? arr.slice() : null;
          // Demo: the summary line counts only the source types in the filter.
          window.dmTypeFilter = state.sources;
          if (window.dmRenderSummary) window.dmRenderSummary();
          render();
        },
        setScope: setScope,
        /** Demo: rebuild the rows from DM_ALL_SOURCES (window / date range change). */
        rebuild: rebuild,
        /** Brand glyph markup for a source type — reused by the View Source drawer. */
        icon: function (type) { return ICONS[type] || ''; },
        /** Re-paint the trailing Exclude cells from committed exclusion state. */
        refreshExclCells: function () { syncExclCells(); },
        /** Re-apply the "Exclusions Applied" badge after rows are re-rendered. */
        refreshBadges: function () {
          var ex = window.DM_EXCLUSIONS || {};
          rows.forEach(function (r) {
            var nameEl = r.querySelector('.dm-source-name');
            if (!nameEl) return;
            var flag = r.querySelector('.dm-source-flag');
            // "Exclusions Applied" flags PARTIAL exclusion — some children are out
            // but the source as a whole is still in scope. A whole-source exclusion
            // is shown by the red row + EXCLUDED button, not this badge. Keyed by
            // xid so duplicate-named rows are flagged independently.
            var entries = ex[r.getAttribute('data-dm-xid')] || [];
            var on = entries.length > 0 && !window.dmHasWhole(entries);
            if (on && !flag) {
              flag = document.createElement('span');
              flag.className = 'dm-source-flag';
              flag.innerHTML = '<span class="badge badge-warning">Exclusions Applied</span>';
              nameEl.closest('.dm-source').appendChild(flag);
            } else if (!on && flag) { flag.remove(); }
          });
        }
      };

      // Top Sources / All Sources toggle
      var scopeGroup = document.getElementById('dmSourceScope');
      if (scopeGroup) scopeGroup.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dm-scope]');
        if (!btn) return;
        Array.prototype.forEach.call(scopeGroup.querySelectorAll('[data-dm-scope]'), function (b) {
          var on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        setScope(btn.getAttribute('data-dm-scope'));
      });
      window.dmClearSourceFilter = clearCard; // Edit Filters clears the card filter if a card is disabled

      cards.forEach(function (card) {
        function toggle() {
          if (card.classList.contains('dm-not-in-filter')) return; // disabled → no effect on the table
          if (card.classList.contains('dm-selected')) clearCard();
          else selectCard(card);
        }
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      });
      if (clearBtn) clearBtn.addEventListener('click', clearCard);
      rebuild(false); // demo: first paint replaces the skeleton rows, and seeds the pager
    })();

    // Totals — one card set; values swap with the Case Window / All Time toggle.
    // DM_TOTALS models the eventual API payload: one entry per window, each with a
    // summary line and an array of source rows (order matches the cards in #dmStatGrid).
    // Demo: DM_TOTALS is built by the adapter (dmBuild) from M.dataMap, for the
    // active window and date range, instead of the inline literal. The summary line
    // is composed by dmSummaryText() so it can follow the Source Types filter and
    // the custodian count; the cards always show their own type's totals.
    (function () {
      var group = document.getElementById('dmWindowToggle');
      var summaryEl = document.getElementById('dmSummary');
      var cards = document.querySelectorAll('#dmStatGrid .dm-stat');
      if (!group || !summaryEl || !cards.length) return;

      var statGrid = document.getElementById('dmStatGrid');
      function render(key, animate) {
        window.dmWindow = key;
        // Demo: rebuild every derived array for the new window (and any date
        // range), so the sources table, people table and drawers recount too —
        // production's toggle left the sources table unchanged.
        dmBuild(key, window.dmRange);
        var data = window.DM_TOTALS[key];
        if (!data) return;
        // Summary line and totals cards both restate the window, so both crossfade.
        // They are separate calls (not one wrapping mutate) because a nested
        // dmCrossfade is suppressed by the re-entrancy guard — see dmCrossfade.
        var setSummary = function () { summaryEl.textContent = dmSummaryText(); summaryEl.removeAttribute('aria-busy'); };
        var setCards = function () {
          cards.forEach(function (card, i) {
            var row = data.sources[i]; if (!row) return;
            var count = card.querySelector('.dm-stat-count b');
            var meta = card.querySelectorAll('.dm-stat-meta > span:not(.dm-meta-divider)');
            if (count) count.textContent = row.items;
            if (meta[0]) meta[0].textContent = row.sources;
            if (meta[1]) meta[1].textContent = row.ual;
          });
          statGrid.removeAttribute('aria-busy');
        };
        if (window.dmCrossfade && animate !== false) {
          dmCrossfade(summaryEl, setSummary);
          dmCrossfade(statGrid, setCards);   // no-op fade while By People is showing
        } else { setSummary(); setCards(); }
        // Demo: the sources table recounts for the window (rows, bars, paging).
        if (window.dmTable && dmTable.rebuild) dmTable.rebuild(animate);
        // Exclusion entries hold counts; re-derive them for the new window.
        if (window.dmRefreshExclusionCounts) window.dmRefreshExclusionCounts();
        // The By People view has its own totals + table for the same window.
        if (window.dmRenderPeople) window.dmRenderPeople(key);
      }
      window.dmRenderTotals = function () { render(window.dmWindow || 'caseWindow'); };
      window.dmRenderSummary = function () { summaryEl.textContent = dmSummaryText(); };
      /** Demo: Add Date Range / its chip's remove call this; null = no range. */
      window.dmSetRange = function (range) {
        window.dmRange = range ? { from: dmIso(range.from), to: dmIso(range.to) } : null;
        render(window.dmWindow || 'caseWindow');
      };

      var btns = group.querySelectorAll('button');
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          btns.forEach(function (o) {
            var on = o === b;
            o.classList.toggle('active', on);
            o.setAttribute('aria-pressed', String(on));
          });
          render(b.getAttribute('data-dm-window'));
        });
      });
      // Demo: first paint of the summary and cards (production shipped them as
      // static markup). No crossfade: the skeletons are swapped in place.
      render(window.dmWindow || 'caseWindow', false);
    })();

    // ── Edit Filters — the summary chips + NOT IN FILTER commit on APPLY FILTERS
    //    (not live). The select's OWN trigger display updates live as you check
    //    ("{n} of {total} {verb}"), since the panel collapses on Apply. Clear resets
    //    each select to its all-option and clears the chips + NOT IN FILTER. ──
    (function () {
      var F = window.DM_EDIT_FILTERS || {};
      var statCards = Array.prototype.slice.call(document.querySelectorAll('#dmStatGrid .dm-stat'));
      var META = {
        dmCustodians:    { chip: document.getElementById('dmChipCustodians'),  prefix: 'Custodians: ',     verb: 'selected', total: (F.custodians || []).length },
        dmSourceTypes:   { chip: document.getElementById('dmChipSourceTypes'), prefix: 'Source Types: ',   verb: 'selected', total: (F.sourceTypes || []).length },
        dmCustodianTags: { chip: document.getElementById('dmChipTags'),        prefix: 'Custodian Tags: ', verb: 'applied',  total: (F.custodianTags || []).length }
      };
      function picked(id) {
        var el = document.getElementById(id);
        var sel = el ? Array.prototype.filter.call(el.options, function (o) { return o.selected && o.value !== '' && !o.disabled; }) : [];
        return { n: sel.length, vals: sel.map(function (o) { return o.value; }) };
      }
      // LIVE — only the select's own trigger input reformats as options are checked.
      function updateTrigger(id) {
        var m = META[id]; var el = document.getElementById(id); if (!el) return;
        var n = picked(id).n;
        var field = el.closest('.dm-field');
        var trigger = field ? field.querySelector('.select-input') : null;
        if (trigger && n > 0) trigger.value = n + ' of ' + m.total + ' ' + m.verb;
      }
      Object.keys(META).forEach(function (id) {
        var el = document.getElementById(id); if (!el) return;
        el.addEventListener('valueChanged.cnds.select', function () { updateTrigger(id); });
      });
      // Commit a select's summary chip.
      function setChip(id) {
        var m = META[id]; if (!m.chip) return;
        var n = picked(id).n;
        m.chip.textContent = (m.verb === 'applied')
          ? m.prefix + n + ' applied'
          : m.prefix + (n === 0 ? 'All' : n + ' selected');
      }
      // Commit NOT IN FILTER from the Source Types selection.
      function applyNotInFilter() {
        var p = picked('dmSourceTypes'); var total = META.dmSourceTypes.total;
        var noFilter = (p.n === 0 || p.n === total);
        var disabledSelected = false;
        statCards.forEach(function (card) {
          var excluded = !noFilter && p.vals.indexOf(card.getAttribute('data-dm-source')) === -1;
          card.classList.toggle('dm-not-in-filter', excluded);
          card.setAttribute('aria-disabled', String(excluded));
          card.tabIndex = excluded ? -1 : 0;
          if (excluded && card.classList.contains('dm-selected')) disabledSelected = true;
        });
        // A disabled card must not drive the Top Sources table filter.
        if (disabledSelected && window.dmClearSourceFilter) window.dmClearSourceFilter();
      }

      var applyBtn = document.getElementById('dmApplyFilters');
      var panel = document.getElementById('dmEditFilters');
      var toggle = document.getElementById('dmEditFiltersToggle');
      if (applyBtn) applyBtn.addEventListener('click', function () {
        Object.keys(META).forEach(setChip);
        applyNotInFilter();
        // Filter the Top Sources table by the selected source types.
        var st = picked('dmSourceTypes');
        var isAll = (st.n === 0 || st.n === META.dmSourceTypes.total);
        if (window.dmTable) dmTable.setSourceFilter(isAll ? null : st.vals);
        // Filter the By People custodians table by custodian + tag (not source type).
        var cu = picked('dmCustodians'), tg = picked('dmCustodianTags');
        if (window.dmFilterPeople) dmFilterPeople({
          custodians: (cu.n === 0 || cu.n === META.dmCustodians.total) ? null : cu.vals,
          tags:       (tg.n === 0 || tg.n === META.dmCustodianTags.total) ? null : tg.vals
        });
        if (panel) panel.classList.remove('open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.classList.remove('active'); }
        if (window.dmSyncRefinedClear) window.dmSyncRefinedClear();
        if (window.dmToast) dmToast('success', 'Filters applied', 'Filters applied successfully.');
      });
      // Reset the Edit Filters selects, NOT-IN-FILTER card states, and the
      // source-type table filter back to "all".
      function clearFilterSelects() {
        Object.keys(META).forEach(function (id) {
          var el = document.getElementById(id);
          if (el && window.Nimbus && Nimbus.Select) { try { Nimbus.Select.getOrCreateInstance(el).setValue(['']); } catch (e) {} }
          setChip(id);
        });
        statCards.forEach(function (card) { card.classList.remove('dm-not-in-filter'); card.setAttribute('aria-disabled', 'false'); card.tabIndex = 0; });
        if (window.dmTable) dmTable.setSourceFilter(null);
        if (window.dmFilterPeople) dmFilterPeople({ custodians: null, tags: null });
      }
      var clearBtn = document.getElementById('dmClearFilters');
      if (clearBtn) clearBtn.addEventListener('click', clearFilterSelects);

      // Comprehensive reset — every filter plus the date range. Used by the
      // refined-results "Clear All Filters".
      window.dmClearAllFilters = function () {
        clearFilterSelects();
        if (window.dmClearSourceFilter) window.dmClearSourceFilter(); // summary-card breadcrumb filter
        if (window.dmClearDateRange)   window.dmClearDateRange();     // date pickers + date chip + refined sync
      };
    })();

    // ── Multi-select "All" option behaviour (Nimbus marks it but doesn't enforce it).
    //    Picking "All" clears the individual items; picking any item clears "All";
    //    deselecting the last item re-selects "All". (Same as the CA template.) ──
    (function () {
      function setup(id) {
        var el = document.getElementById(id);
        if (!el || el.__dmAllReady || !(window.Nimbus && Nimbus.Select)) return;
        var inst = Nimbus.Select.getOrCreateInstance(el);
        if (!inst || !inst._isMultiple || !inst._optList) return;
        el.__dmAllReady = true;
        var allOpt = Array.prototype.find.call(el.options, function (o) { return o.hasAttribute('data-cnds-all-option'); });
        inst._optList.addEventListener('click', function (e) {
          var li = e.target.closest('.select-option');
          if (!li || li.classList.contains('disabled')) return;
          var opt = li._selectOpt; if (!opt) return;
          e.stopPropagation(); e.stopImmediatePropagation();
          if (opt.hasAttribute('data-cnds-all-option')) {
            Array.prototype.forEach.call(el.options, function (o) { o.selected = false; });
            opt.selected = true; inst._syncOptionUI(); inst._dispatch('optionSelected.cnds.select'); inst.close();
          } else {
            if (allOpt) allOpt.selected = false;
            opt.selected = !opt.selected;
            li.classList.toggle('selected', opt.selected);
            li.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
            var cb = li.querySelector('.form-check-input'); if (cb) cb.checked = opt.selected;
            var any = Array.prototype.some.call(el.options, function (o) { return o.selected && !o.hasAttribute('data-cnds-all-option'); });
            if (!any && allOpt) allOpt.selected = true;
            inst._syncOptionUI();
            inst._dispatch(opt.selected ? 'optionSelected.cnds.select' : 'optionDeselected.cnds.select');
          }
          inst._updateDisplay(); inst._dispatch('valueChanged.cnds.select');
        }, true);
        el.addEventListener('valueChanged.cnds.select', function () {
          if (!allOpt) return;
          var any = Array.prototype.some.call(el.options, function (o) { return o.selected && !o.hasAttribute('data-cnds-all-option'); });
          if (!any && !allOpt.selected) { allOpt.selected = true; inst._syncOptionUI(); inst._updateDisplay(); }
        });
      }
      // Demo: this flow can start after cnds.ready has already fired (the data
      // load seam resolves first), so wait only when Nimbus is not ready yet.
      dmWhenNimbus(function () {
        ['dmCustodians', 'dmSourceTypes', 'dmCustodianTags'].forEach(setup);
      });
    })();

    document.querySelectorAll('.dm-drawer-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var body = document.getElementById(btn.getAttribute('aria-controls'));
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        if (body) body.classList.toggle('collapsed', open);
      });
    });
    document.querySelectorAll('.chip .close').forEach(function (x) {
      var remove = function () { x.closest('.chip').remove(); };
      x.addEventListener('click', remove);
      x.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(); }
      });
    });
  }   /* end dmStart */

  /* ══════════════════════════════════════════════════════════════════════
     BOOT — skeletons are up; load the data, then start every flow.
     ══════════════════════════════════════════════════════════════════════ */
  /* DEMO ONLY: do not build. ?skeleton=1 holds the loading state so the skeletons can be reviewed (PM review link). */
  var holdSkeleton = /[?&]skeleton=1\b/.test(location.search);
  if (holdSkeleton) {
    /* DEMO ONLY: do not build. While the loading state is held, By Source / By People still switch, so both
       views' skeletons can be reviewed (the real toggle is wired by dmStart, which never runs here). */
    document.getElementById("dmViewToggle").addEventListener("click", function (e) {
      var b = e.target.closest("[data-dm-view]"); if (!b) return;
      var people = b.getAttribute("data-dm-view") === "people";
      Array.prototype.forEach.call(this.querySelectorAll("[data-dm-view]"), function (x) { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      document.getElementById("dmViewBySource").hidden = people; document.getElementById("dmViewByPeople").hidden = !people;
    });
  } else {
    window.DM_API.loadDataMap(D.caseId).then(function () {
      dmBuild(window.dmWindow, window.dmRange);
      dmRenderNotable();
      dmStart();
      Array.prototype.forEach.call(document.querySelectorAll(".dm-main, .dm-main [aria-busy]"), function (el) { el.removeAttribute("aria-busy"); });
    });
  }
}());
