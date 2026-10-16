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
   · PRD 01 v2.0 (10-16): one population for every filter; the sixth card;
     Found through; Has access; the without-audit-logs form; saved scopes
     that hold everything; dismissal; guest identity; the Add Source doors and
     their hand-back (build notes: scan/prd-01-build-notes.md in the RFI output).
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
 *   • PRD 01 M5: every filter (Custodians, Source Types, Custodian Tags) narrows
 *     ONE population — cards, summary, sources table, By People, notables
 *     (production split them: Source Types → sources, the other two → people).
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
     glyphs (harvested from the cards' inline SVG); the rest are sources the
     unified audit log does not report: listed, "No activity data", counted on
     the sixth card (PRD 01 F10, held). */
  var DMS = window.DMS;
  var DM_KIND = { "SharePoint": "sharepoint", "Microsoft Teams": "teams", "OneDrive": "onedrive", "Exchange Online": "exchange",
                  "Copilot interactions": "copilot", "Box": "box", "Webex": "webex", "File share": "fileshare", "Yammer": "yammer", "Viva Engage": "vivaengage" };
  var DM_TYPE_LABEL = { sharepoint: "SharePoint", teams: "Teams", onedrive: "OneDrive", exchange: "Exchange", copilot: "Copilot",
                        box: "Box", webex: "Webex", fileshare: "File share", yammer: "Yammer", vivaengage: "Viva Engage" };
  var DM_TYPES = ["sharepoint", "teams", "onedrive", "exchange", "copilot", "box", "webex", "fileshare", "yammer", "vivaengage"];
  var DM_CARD_TYPES = DM_TYPES.slice(0, 5);   /* order matches the cards in #dmStatGrid */
  var DM_MDI_ICONS = { box: "mdi-package-variant-closed", webex: "mdi-video-outline", fileshare: "mdi-folder-network-outline",
                       yammer: "mdi-account-group-outline", vivaengage: "mdi-forum-outline", noactivity: "mdi-database-off-outline" };
  /* PRD 01 F11 (held): the six Found through values, in the PRD's order (M31). */
  var DM_FOUND = ["Standard source", "Audit logs", "Permissions", "Sources", "Survey answers", "Added for a custodian"];

  /* Regional access and guests (demo rules, see the header). PRD 01 M18 / M70a: a name opens the Persona Case Profile. */
  var DM_PROFILE_HREF = window.DMS.PROFILE_HREF;
  var DM_REASON_MASKED = "Outside your regions: the case team in this person's region can mark them as a custodian.";
  /* PRD 01 V1, verbatim shape. */
  function dmReasonGuest(name) { return name + " is a guest account, not a natural person. Only a natural person can be a custodian."; }

  /* The case's data map sources: every requested source except devices added
     for a custodian (21: check.js asserts the count and the 18,770 events),
     plus the read-only row whose type is decommissioned (PRD 01 M87; Yammer)
     and any successor a person confirms on scope load (M88). */
  var CASE_SOURCES = M.holdStatusSources().filter(function (s) { return !s.addedForCustodian; });
  var dmExtraSources = [];   /* successors added on this page (M88) */
  /* PRD 01 7.6–7.9 (held, F20): sources added through the three Add Source doors come back on the URL
     (?added=<tokens>&by=<person>); data/meridian-add-sources.js (the doors' file) turns them into case-source records
     with Found through set, pending: true. They join the map as newly added sources: no activity read yet, so the
     sixth card counts them and the counts still reconcile. Sources added for a custodian are on the map here because
     a person added them through a door (the seeded devices stay off it, as before). */
  var dmDoorSources = (M.addSources && M.addSources.fromQuery) ? M.addSources.fromQuery(location.search) : [];
  var DOOR_LABEL = { m365: "From Microsoft 365", catalog: "From Sources", custodians: "For Custodians" };
  var DOOR_ICONS = { "Slack channel": "mdi-pound", "CRM records": "mdi-card-account-details-outline", "Physical media": "mdi-archive-outline",
                     "Mobile device": "mdi-cellphone", "Laptop": "mdi-laptop", "Personal cloud storage": "mdi-cloud-outline", "Removable media": "mdi-usb-flash-drive-outline" };
  dmDoorSources.forEach(function (s) {
    s.door = s.door || "m365";
    if (DM_KIND[s.type]) return;
    var k = s.type.toLowerCase().replace(/[^a-z]+/g, "");
    DM_KIND[s.type] = k; DM_TYPE_LABEL[k] = s.type; if (DM_TYPES.indexOf(k) === -1) DM_TYPES.push(k);
    DM_MDI_ICONS[k] = DOOR_ICONS[s.type] || "mdi-database-outline";
  });
  var SOURCES = [];
  function dmCollectSources() {
    SOURCES = CASE_SOURCES.concat(DM.readOnlySources.map(function (s) {
      var o = {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); o.readOnly = true; return o;
    }), dmDoorSources, dmExtraSources);
  }
  dmCollectSources();
  var CUSTODIANS = M.custodians.map(function (c) { return c.personId; });
  var dmAdded = {};     /* person id → true once marked as a custodian on this page */
  var dmNatural = {};   /* guest person id → true once a natural person is created (PRD 01 M16, held F16) */
  var dmCaseTeam = M.caseById(D.caseId).team || [];
  /* PRD 01 M14, M14a: dismissed findings, hidden never discarded. Seeded from the data (Tom Whitaker). */
  var dmDismissed = {};
  M.notableNonCustodians.forEach(function (n) { if (n.dismissed) dmDismissed[n.personId] = n.dismissed; });

  var nf = function (n) { return Math.round(n).toLocaleString("en-US"); };
  function dmById(id) { for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i]; return null; }
  function dmItemsOf(s) { return M.items[s.id] != null ? M.items[s.id] : (s.items || 0); }
  function dmIsCustodian(pid) { return !!dmAdded[pid] || CUSTODIANS.indexOf(pid) !== -1; }
  function dmAllCustodians() { return CUSTODIANS.concat(Object.keys(dmAdded).filter(function (id) { return CUSTODIANS.indexOf(id) === -1; })); }
  function dmIsGuest(pid) { var p = M.person(pid); return !!(p && p.guest) && !dmNatural[pid]; }
  function dmPersonText(pid) { return D.nameFor(M.person(pid)); }
  /* Nimbus: extra classes (e.g. fw-bold for a bold source name) go on the span, not in page CSS. */
  function dmMaskedHtml(cls) { return '<span class="demo-masked' + (cls ? " " + cls : "") + '"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>'; }
  function dmGuestBadge() { return ' <span class="badge badge-secondary dm-guest-badge">Guest</span>'; }
  /* MARK AS CUSTODIAN that cannot apply here: disabled, never hidden, with the
     reason on hover (title on the wrapper, since a disabled button gets no
     pointer events) and for screen readers (visually hidden text). */
  function dmBlockedMark(reason, cls) {
    return '<span class="dm-mark-blocked" title="' + esc(reason) + '"><button type="button" class="btn btn-tertiary btn-sm ' + cls + '" disabled>Mark as Custodian</button>' +
      '<span class="visually-hidden">' + esc(reason) + "</span></span>";
  }
  /* PRD 01 M16, AC9 (held F16): a guest is never offered MARK AS CUSTODIAN. A Tenant Administrator gets CREATE NATURAL
     PERSON (opens the Guest Identity drawer); everyone else reads "Guest · not a natural person". */
  function dmGuestAction(pid, cls) {
    var p = M.person(pid);
    if (D.hasRole("Tenant Administrator")) return '<button type="button" class="btn btn-tertiary btn-sm ' + cls + '" data-dm-guest="' + esc(pid) + '">Create Natural Person</button>';
    return '<small class="fw-bold text-nowrap" title="' + esc(dmReasonGuest(p.name)) + '">Guest · not a natural person</small>';   /* Nimbus: was .dm-guest-note */
  }
  function dmAlias(p) { var a = p.upn.split("."); return (a[0].charAt(0) + a[a.length - 1]).toLowerCase(); }

  /* ── Dates ──────────────────────────────────────────────────────────── */
  function dmParseIso(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dmIso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  /* PRD 01 7.1 writes "Jan 1, 2024 – Jun 30, 2026"; the house date is mm-dd-yyyy (casefusion-date-format), which wins. */
  function dmFmtRange(a, b) { return M.fmtDate(dmIso(a)) + " – " + M.fmtDate(dmIso(b)); }
  function dmUsDate(iso) { var p = iso.split("-"); return p[1] + "/" + p[2] + "/" + p[0]; }   /* the datepickers' mm/dd/yyyy */
  /* Saved-scope stamp: the house date (mm-dd-yyyy) and a 12-hour time, joined by "at". */
  function dmClock(time) {
    if (time instanceof Date) { var h = time.getHours(); return ((h % 12) || 12) + ":" + ("0" + time.getMinutes()).slice(-2) + " " + (h < 12 ? "AM" : "PM"); }
    return time;
  }
  function dmSavedAt(iso, time) { return M.fmtDate(iso) + " at " + dmClock(time); }
  /** Who and when, for an exclusion (PRD 01 M80, AC4) or a dismissal: [person id, [iso, time]]. */
  function dmStamp() { return { by: D.viewer().personId, at: [M.DEMO_TODAY, dmClock(new Date())] }; }

  /* ── Time model ─────────────────────────────────────────────────────────
     Items and events in M are the case window's. DEMO ONLY: All Time adds
     tenant history before the window (ALL_START onwards) at 37% of the
     window's volume, spread evenly; a date range takes the share of each
     period it overlaps. Demo (PRD 01 7.2): events exist only from the day
     CaseFusion began indexing the unified audit log (M.tenant.auditLog), so
     events and items take separate factors. dmScale splits a factor so the
     parts still sum to the whole. ─────────────────────────────────────── */
  var ALL_START = "2021-01-01";
  var PRIOR_SHARE = 0.37;
  var UAL_FROM = M.tenant.auditLog.indexedFrom;
  function dmDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1; }
  function dmOverlap(a, b, c, d) { var s = a > c ? a : c, e = b < d ? b : d; return s > e ? 0 : dmDays(s, e); }
  function dmFactors(win, range) {
    var ws = M.window.start, we = M.window.end;
    var pe = dmIso(new Date(dmParseIso(ws).getTime() - 864e5));
    var from = range ? range.from : (win === "allTime" ? ALL_START : ws), to = range ? range.to : we;
    var f = dmOverlap(from, to, ws, we) / dmDays(ws, we), e = f;
    if (win === "allTime") {
      var density = PRIOR_SHARE / dmDays(ALL_START, pe);
      f += density * dmOverlap(from, to, ALL_START, pe);
      e += density * dmOverlap(from, to, UAL_FROM, pe);   /* no events before indexing began */
    }
    return { items: f, events: e };
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
  /** PRD 01 7.2 (held F20): the period has no audit-log coverage at all — a date range ending before indexing began. */
  function dmNoAuditFor(range) { return !!(range && range.to < UAL_FROM); }

  /* ── Source naming (production style: name + a muted location line) ──── */
  function dmSourceName(s) {
    var k = DM_KIND[s.type], p = s.owner ? M.person(s.owner) : null;
    if (p && !D.canSee(p)) return { title: "Profile details limited", loc: "Outside your regions", masked: true };
    /* A source added through a door: its name, and who added it, when and through which door. */
    if (s.pending && s.added) return { title: s.name, loc: (M.typeLabel(s.type)) + (p ? " · " + p.name : "") + " · added " + M.fmtDate(s.added) +
      (s.addedBy ? " by " + D.nameFor(M.person(s.addedBy)) : "") + " · " + DOOR_LABEL[s.door] };
    if (k === "exchange") return { title: p.name + " mailbox", loc: s.name };
    if (k === "onedrive") return { title: dmAlias(p) + " OneDrive", loc: M.tenant.oneDriveHost + "/personal/" + dmAlias(p) };
    if (k === "copilot") return { title: "Copilot · " + p.name, loc: "Copilot.M365Copilot · " + dmAlias(p) };
    if (k === "teams") return { title: s.name, loc: "Teams team · " + (M.locations[s.id] || "") };
    if (k === "sharepoint") return { title: s.name + " site", loc: M.tenant.sharePointHost + (M.locations[s.id] || "") };
    if (k === "yammer" || k === "vivaengage") return { title: s.name, loc: s.location };
    return { title: s.name, loc: dmPlainLocation(s) + " · " + DM_TYPE_LABEL[k] };
  }
  /* The one location of a source the audit log does not report. */
  function dmPlainLocation(s) { return (M.locations[s.id] || s.location || s.name).replace(/^[^·]+· /, ""); }

  /* ── Hold, per custodian (case-scoped: does not vary by window) ──────────
     PRD 01 M3a, AC37: ON HOLD takes exactly Active, Pending or No. Production
     adds Released; a released custodian is not on hold here, so reads "No"
     (logged). Pending: a request covers the custodian and Purview has not
     reported any of their holds applied yet (F17 is open; nothing branches on
     it, and no Meridian custodian is in that state today). */
  function dmHoldOf(pid) {
    if (dmAdded[pid]) return "No";   /* just added: not notified, nothing requested */
    var src = M.sourcesOf(pid);
    if (src.some(function (s) { return s.hold === "Applied" || s.hold === "Attested"; })) return "Active";
    if (src.some(function (s) { return s.hold === "Applying"; })) return "Pending";
    return "No";
  }
  /** 1.9's Show option "Not requested": no preservation request on this case covers any of the custodian's sources. */
  function dmNotRequested(pid) { return !M.sourcesOf(pid).some(function (s) { return !!s.request; }); }

  /* Accessed events per source for the active factor: { sourceId: [[pid, events]] }. */
  var dmAccessed = {};
  function dmBuildAccessed(f) {
    dmAccessed = {};
    Object.keys(DM.accessed).forEach(function (id) {
      var list = DM.accessed[id], scaled = dmScale(list.map(function (a) { return a[1]; }), f);
      dmAccessed[id] = list.map(function (a, i) { return [a[0], scaled[i], a[1]]; });   /* [pid, events now, events in the case window] */
    });
  }
  function dmEventsOf(sid, pid) { var a = (dmAccessed[sid] || []).filter(function (x) { return x[0] === pid; })[0]; return a ? a[1] : 0; }

  /* ══ ONE POPULATION (PRD 01 M5, AC3) ═════════════════════════════════════
     Production: Custodians and Tags narrowed only the By people table and
     Source Types only the sources table. PRD 01 M5: both views draw one
     population under one set of filters, one saved scope and one set of
     exclusions. So every filter narrows the cards, the summary, the sources
     table, By people and the notable non-custodians:
     · Source Types keeps the sources of the chosen types;
     · Custodians and Custodian Tags keep the custodians chosen (a tag picks
       every custodian carrying it) and the sources tied to them: owned,
       accessed, or a membership roster. A source tied to no custodian at all
       (a CRO Box folder, a non-custodial mailbox) belongs to the case, not a
       person, so it stays whatever custodians are chosen (logged).
     Exclusions then take items and events out of the scope counts; the rows
     stay on the map, marked (M81). ═════════════════════════════════════════ */
  window.dmFilters = { custodians: null, types: null, tags: null };
  function dmTagsOf(pid) { return Object.keys(DM.tags).filter(function (t) { return DM.tags[t].indexOf(pid) !== -1; }); }
  /** The custodians the map is drawn for, or null for all of them. */
  function dmSelectedCustodians() {
    var f = window.dmFilters;
    if (!f.custodians && !f.tags) return null;
    return dmAllCustodians().filter(function (pid) {
      if (f.custodians && f.custodians.indexOf(pid) === -1) return false;
      if (f.tags && !f.tags.some(function (t) { return dmTagsOf(pid).indexOf(t) !== -1; })) return false;
      return true;
    });
  }
  /** Custodians a source is tied to: owner, people with activity on it, or its membership roster. */
  function dmTiedCustodians(s) {
    var out = {};
    if (s.owner && dmIsCustodian(s.owner)) out[s.owner] = true;
    (DM.accessed[s.id] || []).concat(DM.participants[s.id] || [], s.members || []).forEach(function (a) { if (dmIsCustodian(a[0])) out[a[0]] = true; });
    return Object.keys(out);
  }
  function dmTypeAllowed(t) { return !window.dmFilters.types || window.dmFilters.types.indexOf(t) !== -1; }
  function dmInPopulation(s) {
    if (!dmTypeAllowed(DM_KIND[s.type])) return false;
    var sel = dmSelectedCustodians();
    if (!sel) return true;
    var tied = dmTiedCustodians(s);
    return !tied.length || tied.some(function (pid) { return sel.indexOf(pid) !== -1; });
  }
  /** Items and events of a row still in scope after exclusions (whole source, locations, Copilot people). */
  function dmInScope(r) {
    var ex = (window.DM_EXCLUSIONS || {})[r.id] || [];
    if (dmHasWhole(ex)) return { items: 0, events: 0, whole: true };
    var items = r.items, events = r.events || 0;
    ex.forEach(function (e) { if (e.metric === "events") events -= dmNum(e.items); else items -= dmNum(e.items); });
    return { items: Math.max(0, items), events: Math.max(0, events), whole: false };
  }
  /* PRD 01 7.2 (held, F20): without audit logs, sources that the audit log found are reached through the
     permissions sync (the Teams teams are the custodians' memberships), and sources open to everyone are left out
     before they reach the map (M65, W3) unless SHOW THEM is on. */
  function dmFoundFor(s) { return window.dmNoAudit && s.found === "Audit logs" ? "Permissions" : s.found; }
  function dmTenantWide(s) { return (DM.grants[s.id] || []).some(function (g) { return g.who === "tenant"; }); }
  window.dmShowOpen = false;

  /** Builds every DATA ARRAY for a window and optional date range { from, to } (ISO). */
  function dmBuild(win, range) {
    var fx = dmFactors(win, range), f = fx.items;
    window.dmFactor = f; window.dmEventFactor = fx.events;
    window.dmNoAudit = dmNoAuditFor(range);
    dmBuildAccessed(fx.events);
    window.DM_SOURCE_DETAILS = {};   /* built per source on first open */
    dmItemCache = {};

    /* DM_ALL_SOURCES — every source on the case, items high → low; `pop` marks the ones in the population. */
    var rows = SOURCES.map(function (s) {
      var n = dmSourceName(s), items = Math.round(dmItemsOf(s) * f);
      var events = s.events == null ? null : Math.round(s.events * fx.events), acc = (DM.accessed[s.id] || []).length;
      var open = window.dmNoAudit && dmTenantWide(s);
      return { id: s.id, type: DM_KIND[s.type], name: n.title, path: n.loc, masked: !!n.masked, items: items, itemsText: nf(items), events: events,
               found: dmFoundFor(s), readOnly: !!s.readOnly, added: !!(s.pending && s.added), tied: dmTiedCustodians(s).length, openToEveryone: open,
               pop: dmInPopulation(s) && (!open || window.dmShowOpen),
               people: events == null ? (dmTiedCustodians(s).length ? "No activity data" : "Not tied to a custodian") : acc + (acc === 1 ? " person" : " people") };
    }).sort(function (a, b) { return b.items - a.items || a.name.localeCompare(b.name); });
    var max = rows.length ? rows[0].items : 0;
    rows.forEach(function (r) { r.max = max; r.bar = max ? Math.max(2, Math.round(r.items / max * 100)) : 0; });
    window.DM_ALL_SOURCES = { total: rows.length, rows: rows };

    /* DM_TOTALS — the five workload cards, then the sixth (No activity data, PRD 01 F10, held), for this window:
       the population's sources in scope (filters minus exclusions). The six cards' sources sum to the summary
       line's sources, and their items and events to its items and events (decision 190). */
    window.DM_TOTALS = {};
    window.DM_TOTALS[win] = { scopeLabel: win === "allTime" ? "All time scope" : "Case window scope" };
    dmRecountTotals();

    /* DM_PEOPLE — By People for this window. */
    window.DM_PEOPLE = {};
    window.DM_PEOPLE[win] = dmBuildPeople();

    /* DM_CUSTODIAN_META — id + tags per custodian (tags managed on the Custodians tab). */
    window.DM_CUSTODIAN_META = {};
    dmAllCustodians().forEach(function (pid) { window.DM_CUSTODIAN_META[pid] = { id: pid, tags: dmTagsOf(pid) }; });
  }
  /** The cards' totals from the population and exclusions (also called when only exclusions change). */
  function dmRecountTotals() {
    var t = window.DM_TOTALS[window.dmWindow || "caseWindow"]; if (!t) return;
    var rows = window.DM_ALL_SOURCES.rows.filter(function (r) { return r.pop; });
    var card = function (list) {
      var sc = list.map(dmInScope).filter(function (x) { return !x.whole; });
      return { n: sc.length, items: sc.reduce(function (n, x) { return n + x.items; }, 0), events: sc.reduce(function (n, x) { return n + x.events; }, 0) };
    };
    t.sources = DM_CARD_TYPES.map(function (k) {
      var c = card(rows.filter(function (r) { return r.type === k; }));
      return { items: nf(c.items), sources: c.n + (c.n === 1 ? " source" : " sources"), ual: nf(c.events) + " UAL events", n: c.n };
    });
    var q = card(rows.filter(function (r) { return r.events == null; }));
    t.noActivity = { n: q.n, items: nf(q.items) + " items", sources: String(q.n) };
  }

  /* DM_PEOPLE[window] — custodians ranked by events. A custodian's sources are
     the population's sources they own or have activity on, less excluded ones;
     their events are the sum of their Accessed rows on those sources, less a
     Copilot exclusion of that person (PRD 01 M5, A25). Relevance: High 2,000+,
     Medium 500+, Low below; "meaningful UAL activity" = Medium or High, so the
     cards and bars agree. */
  function dmBuildPeople() {
    var all = dmAllCustodians(), sel = dmSelectedCustodians(), ids = sel || all;
    var rows = window.DM_ALL_SOURCES.rows.filter(function (r) { return r.pop; });
    var ex = window.DM_EXCLUSIONS || {};
    var noAudit = window.dmNoAudit, asOf = window.dmAsOf || DMS.snapshots.latest;
    var list = ids.map(function (pid) {
      var src = 0, ev = 0, std = 0, perm = 0, p = M.person(pid);
      rows.forEach(function (r) {
        var s = dmById(r.id), e = ex[r.id] || [];
        if (dmHasWhole(e)) return;
        if (noAudit) {
          if (s.owner === pid && s.found === "Standard source") { std++; return; }
          if (s.owner !== pid && DMS.hasAccessView(s) && DMS.accessFor(s, asOf).rows.some(function (x) { return x.pid === pid; })) perm++;
          return;
        }
        var a = (dmAccessed[r.id] || []).filter(function (x) { return x[0] === pid; })[0];
        if (a || s.owner === pid) {
          src++;
          var gone = e.filter(function (x) { return x.metric === "events" && x.key === pid; }).reduce(function (n, x) { return n + dmNum(x.items); }, 0);
          ev += a ? Math.max(0, a[1] - gone) : 0;
        }
      });
      /* PRD 01 W2: an account disabled before the earliest permission snapshot has no permission sources, and says so. */
      var disabled = p.departed && p.departed < DMS.snapshots.earliest;
      if (noAudit) src = std + perm;
      return { pid: pid, p: p, sourcesN: src, eventsN: ev, std: std, perm: perm, disabled: !!disabled, hold: dmHoldOf(pid) };
    }).sort(function (a, b) { return b.eventsN - a.eventsN || b.sourcesN - a.sourcesN || a.p.name.localeCompare(b.p.name); });
    var max = list.length ? Math.max(1, list[0].eventsN) : 1;
    var custodians = list.map(function (r, i) {
      var level = r.eventsN >= 2000 ? "High" : r.eventsN >= 500 ? "Medium" : "Low";
      var ok = D.canSee(r.p);
      return { rank: i + 1, pid: r.pid, name: ok ? r.p.name : "Profile details limited", email: ok ? DMS.emailOf(r.p) : "", role: ok ? r.p.title : "—", masked: !ok,
               sources: String(r.sourcesN), events: nf(r.eventsN), hold: r.hold, notRequested: dmNotRequested(r.pid),
               std: String(r.std), perm: String(r.perm), disabled: r.disabled, asset: "0",
               signal: Math.max(2, Math.round(r.eventsN / max * 100)), level: level };
    });
    var meaningful = custodians.filter(function (c) { return c.level !== "Low"; }).length;
    var onHold = custodians.filter(function (c) { return c.hold === "Active"; }).length;
    /* PRD 01 7.1: the first tile reads "5 of 9" once the filters narrow the custodians (1.9's form, kept). */
    var inCase = sel ? custodians.length + " of " + all.length : String(all.length);
    var totals = noAudit ? [
        { label: "CUSTODIANS IN THE CASE", value: inCase },
        { label: "ON HOLD - THIS CASE", value: String(onHold) },
        { label: "STANDARD SOURCES", value: String(list.reduce(function (n, r) { return n + r.std; }, 0)), sub: "Mailbox, OneDrive, Copilot" },
        { label: "FROM PERMISSIONS", value: String(dmNoAuditOrigins().perm), sub: "Sites and teams · tenant-wide access left out" },
        { label: "FROM ASSET IMPORT", value: "0", sub: "No asset import on this case" }
      ] : [
        { label: "CUSTODIANS IN THE CASE",  value: inCase },
        { label: "ON HOLD - THIS CASE",     value: String(onHold) },
        { label: "MEANINGFUL UAL ACTIVITY", value: String(meaningful) },
        { label: "MINIMAL / NO ACTIVITY",   value: String(custodians.length - meaningful) }
      ];
    return { totals: totals, custodians: custodians };
  }
  /** Without audit logs, sources by origin (PRD 01 7.2 tiles; M62): counts of in-scope population sources. */
  function dmNoAuditOrigins() {
    var out = { std: 0, perm: 0, asset: 0, sources: 0, survey: 0 }, ex = window.DM_EXCLUSIONS || {};
    (window.DM_ALL_SOURCES || { rows: [] }).rows.forEach(function (r) {
      if (!r.pop || dmHasWhole(ex[r.id])) return;
      var k = { "Standard source": "std", "Permissions": "perm", "Added for a custodian": "asset", "Sources": "sources", "Survey answers": "survey" }[r.found];
      if (k) out[k]++;
    });
    return out;
  }

  /* After MARK AS CUSTODIAN: the new custodian joins By People (hold "No") and its totals. */
  function dmRebuildPeople() {
    window.DM_PEOPLE[window.dmWindow] = dmBuildPeople();
    Object.keys(dmAdded).forEach(function (pid) { window.DM_CUSTODIAN_META[pid] = { id: pid, tags: dmTagsOf(pid) }; });
  }

  /* Person row for the drawer's person tabs (production: { name, role, … status }).
     "_" keys are internal: never shown, never searched. */
  function dmPersonRow(pid) {
    var p = M.person(pid), ok = D.canSee(p);
    return { name: ok ? p.name : "Profile details limited", role: ok ? p.title : "—", _pid: pid, _masked: !ok, _guest: dmIsGuest(pid) };
  }
  /* PRD 01 M42c, 7.3: CUSTODIAN STATUS in Accessed. A guest is never offered MARK AS CUSTODIAN (M16). */
  function dmAccessedStatus(pid, windowEvents) {
    if (dmIsCustodian(pid)) return "Custodian";
    if (dmIsGuest(pid)) return "Guest";
    /* The threshold reads the case window (the rule names it), whatever window is shown. */
    return windowEvents < DM.threshold ? "Below Threshold" : "Mark as Custodian";
  }
  /* PRD 01 M33b (PRD 02 L55–L59): a location's confidence tier and what earned it. Data where the response team
     recorded it (M.sourceDetails[...].tiers); otherwise from the source's own evidence. */
  function dmTierOf(s, loc) {
    var sd = M.sourceDetails[s.id];
    if (sd && sd.tiers && sd.tiers[loc]) return sd.tiers[loc];
    if (s.readOnly) return ["Observed", "Held before decommissioning (content migrated " + M.fmtDate(s.decommissioned.on) + ")"];
    if (s.hold === "Applied" || s.hold === "Partial") return ["Observed", "Hold placed " + M.fmtDate((M.requests.filter(function (r) { return r.id === s.request; })[0] || {}).sent || M.firstNotice) + " (" + s.request + ")"];
    if (s.hold === "Attested") return ["Confirmed", "Attested by " + s.attestation.by + " " + M.fmtDate(s.attestation.on)];
    if (s.found === "Survey answers") return ["Reported", "Named by a custodian in SUR-0012"];
    if (s.found === "Sources") return ["Confirmed", "In Sources, owned by its response team"];
    return ["Reported", "Not yet corroborated"];
  }

  /** DM_SOURCE_DETAILS[id] — the View Source drawer's data for one source. */
  function dmSourceDetail(id) {
    var cache = window.DM_SOURCE_DETAILS;
    if (cache[id]) return cache[id];
    var s = dmById(id); if (!s) return null;
    var k = DM_KIND[s.type], n = dmSourceName(s), f = window.dmFactor, noAudit = window.dmNoAudit;
    var owner = s.owner ? M.person(s.owner) : null, ownerOk = !owner || D.canSee(owner);
    var d = { type: k, name: n.title, path: n.loc, masked: !!n.masked, source: s, readOnly: !!s.readOnly };

    if (s.pending && s.added) {
      d.tabs = ["location"];
      d.note = "Added " + M.fmtDate(s.added) + (s.addedBy ? " by " + dmPersonText(s.addedBy) : "") + " through the " + DOOR_LABEL[s.door] + " door" + (s.identification ? " (" + s.identification + ")" : "") +
        ". CaseFusion reads its locations and activity on the next sync. Adding a source does not preserve it: a request does.";
    } else if (k === "sharepoint" || k === "onedrive") d.tabs = ["location", "item", "accessed"];
    else if (k === "teams") d.tabs = ["participants", "accessed"];
    else if (k === "exchange") d.tabs = ["accessed"];
    else if (k === "copilot") {
      /* Copilot excludes PEOPLE (production's `exclude`); keyed by person id. PRD 01 M42c: Copilot's Accessed has
         EVENTS and CUSTODIAN STATUS like every other Accessed, plus the per-person exclude. */
      d.tabs = ["accessed"];
      d.exclude = { tab: "accessed", key: "_pid", metricKey: "events", unit: "person", units: "people", metric: "events" };
    } else {
      d.tabs = ["location"];
      d.note = s.readOnly
        ? "This source is read-only: " + M.typeLabel(s.type) + " was decommissioned on " + M.fmtDate(s.decommissioned.on) + ", so it can no longer be requested. Its content went to " + s.decommissioned.successor.type + "."
        : "The unified audit log does not report this source, so there is no activity data for it. It is listed as one location.";
    }
    /* PRD 01 7.4 (held, F9): Has access is a fourth view on the Microsoft 365 ACL types. 7.5 (held, F20): without
       audit logs it leads, and Item view and Accessed are dropped (M66). Copilot interactions live in the owner's
       mailbox, so without audit logs Copilot shows that owner rather than opening to nothing (logged). */
    if (DMS.hasAccessView(s) && !(s.pending && s.added)) d.tabs.push("has");
    if (noAudit) {
      d.tabs = d.tabs.filter(function (t) { return t !== "item" && t !== "accessed"; });
      if (k === "copilot" || k === "exchange") d.tabs = ["has"];
      else if (d.tabs.indexOf("has") !== -1) d.tabs = ["has"].concat(d.tabs.filter(function (t) { return t !== "has"; }));
    }

    /* Locations: M.dataMap.locations, or the source as its one location. */
    var tree = k === "sharepoint" || k === "onedrive";
    var locs = DM.locations[id] || [[dmPlainLocation(s), dmItemsOf(s), null]];
    var counts = dmScale(locs.map(function (l) { return l[1]; }), f);
    d.locations = locs.map(function (l, i) {
      var tier = dmTierOf(s, l[0]);
      return { path: tree ? "\\" + l[0] + "\\" : l[0], items: nf(counts[i]), lastActivity: l[2] ? M.fmtDate(l[2]) : "—", confidence: tier[0],
               _lastActivity: l[2] || "", _loc: l[0], _tierWhy: tier[1] };
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

    /* Accessed: who used the source, in this window. */
    var acc = dmAccessed[id] || [];
    if (d.tabs.indexOf("accessed") !== -1 || k === "copilot") {
      d.accessed = acc.map(function (a) {
        var r = dmPersonRow(a[0]);
        r.events = nf(a[1]);
        r.status = dmAccessedStatus(a[0], a[2]);
        return r;
      });
    }
    /* Participants: the Teams roster (who belongs, not who posted). */
    if (k === "teams") {
      d.participants = (DM.participants[id] || []).map(function (a) {
        var r = dmPersonRow(a[0]);
        r.since = M.fmtDate(a[1]); r._since = a[1];
        r.status = dmIsCustodian(a[0]) ? "Custodian" : dmIsGuest(a[0]) ? "Guest" : "Not a Custodian";
        return r;
      });
    }
    cache[id] = d;
    return d;
  }
  window.dmSourceDetail = dmSourceDetail;

  /** Has access rows for a source as of a date (PRD 01 7.4): person rows in the drawer's row shape. */
  function dmAccessRows(id, asOf) {
    var s = dmById(id), a = DMS.accessFor(s, asOf);
    var rows = a.rows.map(function (r) {
      var row = dmPersonRow(r.pid), v = DMS.viaSummary(r), p = M.person(r.pid);
      row.email = D.canSee(p) ? DMS.emailOf(p) : "";
      row.role = r.role; row._title = D.canSee(p) ? p.title : "";
      row.via = v.via; row._viaSub = v.sub;
      row.events = nf(dmEventsOf(id, r.pid)); row._events = dmEventsOf(id, r.pid);
      row.firstSeen = M.fmtDate(r.since < DMS.snapshots.earliest ? DMS.snapshots.earliest : r.since) + (r.since < DMS.snapshots.earliest ? " · earliest" : "");
      row._firstSeen = r.since;
      row.status = dmIsGuest(r.pid) ? "Not a natural person in CaseFusion" : dmIsCustodian(r.pid) ? "Custodian · " + (dmHoldOf(r.pid) === "Active" ? "On hold" : "Not on hold") : "Not a custodian";
      row._rank = DMS.rank(r.role); row._paths = r.paths;
      return row;
    });
    return { snap: a.snap, gap: a.gap, rows: rows, tenantWide: a.tenantWide };
  }
  window.dmAccessRows = dmAccessRows;

  /** Item Details: sample UAL activity for one item, from the people who used its source. */
  var dmItemCache = {};
  function dmItemEvents(id, item) {
    var key = id + "\u0001" + item.name;
    if (dmItemCache[key]) return dmItemCache[key];
    var who = function (pid) { return pid ? dmPersonText(pid) : "Someone"; };
    var day = item._modified || M.window.end;
    var evs = [{ event: who(item._ownerPid) + " uploaded this file", kind: "Uploaded", t: "09:12" }];
    var verbs = [["viewed this file", "Viewed"], ["downloaded a copy", "Downloaded"], ["modified this file", "Modified"], ["shared this file", "Shared"]];
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

  /* ══ NOTABLE NON-CUSTODIANS (PRD 01 5.5, M10–M17) ════════════════════════
     DM_NOTABLE — people not on the custodian list with 20+ UAL events on an
     in-scope source in the case window, or a top collaborator with a
     custodian (M.notableNonCustodians; check.js traces each reason to
     M.dataMap.accessed). In scope: the source is in the population, and a top
     collaborator's custodian is among the custodians drawn (M5). Each row also
     carries the held 1.9 evidence (F20): custodians in common, overlap events,
     the collaboration broken out and the sources seen (M12), and the list can
     be ranked by each (M11). Dismissed findings are hidden (M14, M14a). ════ */
  window.dmRankBy = "overlap";
  function dmNotableEvidence(pid) {
    var pop = {}; (window.DM_ALL_SOURCES || { rows: [] }).rows.forEach(function (r) { if (r.pop) pop[r.id] = true; });
    var seen = [], common = {}, overlap = 0;
    Object.keys(dmAccessed).forEach(function (sid) {
      if (!pop[sid]) return;
      var mine = dmAccessed[sid].filter(function (a) { return a[0] === pid; })[0];
      if (!mine) return;
      seen.push(sid);
      var cust = dmAccessed[sid].filter(function (a) { return dmIsCustodian(a[0]); });
      if (cust.length) { overlap += mine[1]; cust.forEach(function (c) { common[c[0]] = true; }); }
    });
    return { seen: seen, common: Object.keys(common), overlap: overlap };
  }
  function dmNotable(all) {
    var sel = dmSelectedCustodians();
    return M.notableNonCustodians.filter(function (n) {
      if (dmIsCustodian(n.personId)) return false;
      if (!all && dmDismissed[n.personId]) return false;
      var s = dmById(n.source); if (!s) return false;
      var row = window.DM_ALL_SOURCES.rows.filter(function (r) { return r.id === n.source; })[0];
      if (!row || !row.pop) return false;
      if (n.with && sel && sel.indexOf(n.with) === -1) return false;
      return true;
    }).map(function (n) {
      var p = M.person(n.personId), ok = D.canSee(p), src = dmSourceName(dmById(n.source)).title;
      var detail = !ok ? "Outside your regions" : n.kind === "Top collaborator"
        ? "Top collaborator · with " + dmPersonText(n.with) + " · " + src + " · " + n.events + " events"
        : n.workload + " overlap · " + src + " · " + n.events + " events" + (n.note ? " · " + n.note : "");
      var ev = dmNotableEvidence(n.personId), c = n.collab || [0, 0, 0];
      return { pid: n.personId, name: ok ? p.name : "Profile details limited", role: ok ? p.title : "", masked: !ok, guest: dmIsGuest(n.personId), detail: detail,
               common: ev.common, overlap: ev.overlap, collab: c, collabN: c[0] + c[1] + c[2], seen: ev.seen, dismissed: dmDismissed[n.personId] || null };
    }).sort(dmRankCompare);
  }
  /* PRD 01 M11: ranked, never scored — the reader picks the order. Ties keep the data's order. */
  function dmRankCompare(a, b) {
    var k = window.dmRankBy;
    if (k === "collab") return b.collabN - a.collabN;
    if (k === "common") return b.common.length - a.common.length || b.overlap - a.overlap;
    return b.overlap - a.overlap;
  }
  /* PRD 01 7.2 (held, F20): without audit logs, non-custodians are found by access, not activity (M63): anyone who is
     not a custodian (nor on the case team) with access to a population source a custodian can also reach. */
  function dmNotableByAccess() {
    var asOf = window.dmAsOf || DMS.snapshots.latest, people = {};
    window.DM_ALL_SOURCES.rows.forEach(function (r) {
      if (!r.pop) return;
      var s = dmById(r.id); if (!DMS.hasAccessView(s)) return;
      var a = DMS.accessFor(s, asOf).rows, cust = a.filter(function (x) { return dmIsCustodian(x.pid); });
      if (!cust.length) return;
      a.forEach(function (x) {
        if (dmIsCustodian(x.pid) || dmCaseTeam.indexOf(x.pid) !== -1 || dmDismissed[x.pid]) return;
        var e = people[x.pid] || (people[x.pid] = { pid: x.pid, shared: [], role: x.role, common: {} });
        e.shared.push(r.name);
        if (DMS.rank(x.role) > DMS.rank(e.role)) e.role = x.role;
        cust.forEach(function (c) { e.common[c.pid] = true; });
      });
    });
    return Object.keys(people).map(function (k) {
      var e = people[k], p = M.person(k), ok = D.canSee(p);
      return { pid: k, name: ok ? p.name : "Profile details limited", role: ok ? p.title : "", masked: !ok, guest: dmIsGuest(k), shared: e.shared, highest: e.role, common: Object.keys(e.common) };
    }).sort(function (a, b) {
      var k = window.dmRankBy;
      if (k === "role") return DMS.rank(b.highest) - DMS.rank(a.highest) || b.shared.length - a.shared.length;
      if (k === "common") return b.common.length - a.common.length || b.shared.length - a.shared.length;
      return b.shared.length - a.shared.length || DMS.rank(b.highest) - DMS.rank(a.highest);
    });
  }
  function dmNamesShort(pids) {
    var shown = pids.map(function (c) { var p = M.person(c); return D.canSee(p) ? p.name.split(" ").slice(-1)[0] : null; }).filter(Boolean);
    var hidden = pids.length - shown.length;
    return shown.join(", ") + (hidden ? (shown.length ? ", " : "") + hidden + " outside your regions" : "");
  }
  /* The Notable Non-Custodians table (Scott, 10-16: the card matches the rest of the page). Columns follow the variant:
     activity (M10–M12) or, without audit logs, access (M63). The person cell keeps production's name, role and reason line,
     plus masking, the Guest badge and, on a hidden row, who dismissed it. Actions stack: the forward action, then DISMISS. */
  var DM_NOTABLE_COLS = 6;
  function dmNotableHeadHtml() {
    var cols = window.dmNoAudit
      ? [["Person", ""], ["Shared Sources", "dm-col-count"], ["Highest Role", "dm-np-role"], ["Custodians In Common", "dm-np-common"], ["Access To", "dm-np-wide"], ['<span class="visually-hidden">Actions</span>', "dm-np-act"]]
      : [["Person", ""], ["Custodians In Common", "dm-np-common"], ["Overlap Events", "dm-col-count"], ["Collaboration", "dm-np-wide"], ["Sources Seen", "dm-col-count"], ['<span class="visually-hidden">Actions</span>', "dm-np-act"]];
    return "<tr>" + cols.map(function (c) { return '<th scope="col" class="' + c[1] + '">' + c[0] + "</th>"; }).join("") + "</tr>";
  }
  function dmNotableRowHtml(p) {
    var name = p.masked ? dmMaskedHtml() : (p.guest
      /* PRD 01 M17, AC23: a guest's name opens the Guest Identity drawer, not a profile. */
      ? '<a href="#" role="button" data-dm-guest="' + esc(p.pid) + '">' + esc(p.name) + "</a>"   /* Nimbus: a plain link (was the hand-built .dm-link-btn) */
      : '<a href="' + DM_PROFILE_HREF + '">' + esc(p.name) + "</a>");
    var total = dmAllCustodians().length, dash = '<span class="dm-muted">—</span>';
    var common = '<div>' + p.common.length + " of " + total + "</div>" + (p.common.length ? '<small class="d-block text-muted">' + esc(dmNamesShort(p.common)) + "</small>" : "");
    var cells = p.masked
      ? [dash, dash, dash, dash]
      : window.dmNoAudit
        ? [String(p.shared.length), esc(p.highest), common, '<small class="text-muted">' + esc(p.shared.join(", ")) + "</small>"]
        : [common, nf(p.overlap), '<small class="text-muted">' + p.collab[0] + " shared files · " + p.collab[1] + " chats · " + p.collab[2] + " meetings</small>", String(p.seen.length)];
    var cls = window.dmNoAudit ? ["dm-col-count", "dm-np-role", "dm-np-common", "dm-np-wide"] : ["dm-np-common", "dm-col-count", "dm-np-wide", "dm-col-count"];
    var action = p.masked ? dmBlockedMark(DM_REASON_MASKED, "btn-mark") : p.guest ? dmGuestAction(p.pid, "btn-guest-np")
      : '<button type="button" class="btn btn-tertiary btn-sm btn-mark">Mark as Custodian</button>';
    var dismissed = p.dismissed;
    var second = dismissed
      ? '<button type="button" class="btn btn-tertiary btn-sm btn-restore" data-dm-restore="' + esc(p.pid) + '">Restore</button>'
      : '<button type="button" class="btn btn-tertiary btn-sm btn-dismiss" data-dm-dismiss="' + esc(p.pid) + '">Dismiss</button>';
    /* Nimbus: .fw-bold name, <small> meta lines (were .dm-np-name / -sub / -why). */
    var person = '<div class="fw-bold">' + name + (p.guest && !p.masked ? dmGuestBadge() : "") + "</div>" +
      (p.masked ? '<small class="d-block text-muted">Outside your regions</small>' : '<small class="d-block text-muted">' + esc(p.role) + "</small>") +
      (window.dmNoAudit || p.masked ? "" : '<small class="d-block mt-1">' + esc(p.detail) + "</small>") +
      (dismissed ? '<small class="d-block mt-1">Dismissed ' + esc(M.fmtDateTime(dismissed.on, dismissed.time)) + " by " + esc(dmPersonText(dismissed.by)) +
        (p.masked ? "" : " · " + esc(dismissed.reason)) + "</small>" : "");
    return '<td class="dm-np-person">' + person + "</td>" +
      cells.map(function (c, i) { return '<td class="' + cls[i] + '">' + c + "</td>"; }).join("") +
      '<td class="dm-np-act"><div class="vr vr-blurry" aria-hidden="true"></div><div class="dm-np-actions">' + action + second + "</div></td>";
  }
  function dmNotableRowTr(p) { return '<tr class="dm-insight-row" data-dm-pid="' + esc(p.pid) + '">' + dmNotableRowHtml(p) + "</tr>"; }
  function dmRenderNotable() {
    var card = document.getElementById("dmNonCustodianCard"), list = card.querySelector(".dm-insight-list");
    var hiddenWrap = document.getElementById("dmHiddenList"), toggle = document.getElementById("dmShowHidden");
    window.DM_NOTABLE = window.dmNoAudit ? dmNotableByAccess() : dmNotable(false);
    list.removeAttribute("aria-busy");
    Array.prototype.forEach.call(card.querySelectorAll(".dm-notable-thead"), function (h) { h.innerHTML = dmNotableHeadHtml(); });
    document.getElementById("dmNotableCount").textContent = String(window.DM_NOTABLE.length);
    list.innerHTML = window.DM_NOTABLE.length ? window.DM_NOTABLE.map(dmNotableRowTr).join("")
      : '<tr><td colspan="' + DM_NOTABLE_COLS + '" class="text-center text-muted py-3">No one outside the custodian list meets the threshold for the current filters.</td></tr>';
    /* PRD 01 M14a, AC24: hidden, never discarded — Show hidden non-custodians brings them back. */
    var hidden = window.dmNoAudit ? [] : dmNotable(true).filter(function (p) { return !!p.dismissed; });
    toggle.textContent = (hiddenWrap.hidden ? "Show" : "Hide") + " Hidden Non-Custodians (" + hidden.length + ")";
    toggle.disabled = !hidden.length;
    toggle.title = hidden.length ? "" : "No finding has been dismissed.";
    if (!hidden.length) hiddenWrap.hidden = true;
    document.getElementById("dmHiddenRows").innerHTML = hidden.map(dmNotableRowTr).join("");
    /* Rank by follows the variant (M11 vs M63). */
    var rank = document.getElementById("dmRankBy");
    if (rank && rank.getAttribute("data-dm-variant") !== String(!!window.dmNoAudit)) {
      rank.setAttribute("data-dm-variant", String(!!window.dmNoAudit));
      rank.innerHTML = (window.dmNoAudit ? [["shared", "Shared Sources"], ["role", "Highest Role"], ["common", "Custodians In Common"]]
                                         : [["overlap", "Overlap Events"], ["collab", "Collaboration"], ["common", "Custodians In Common"]])
        .map(function (o, i) { return '<option value="' + o[0] + '"' + (i ? "" : " selected") + ">" + o[1] + "</option>"; }).join("");
      window.dmRankBy = rank.options[0].value;
      if (window.Nimbus && Nimbus.Select) { try { var si = Nimbus.Select.getOrCreateInstance(rank); si._renderOptions(); si.setValue([window.dmRankBy]); } catch (e) {} }
    }
    document.getElementById("dmInsightSubline").textContent = window.dmNoAudit
      ? "People who aren't custodians but have access to the custodians' shared sources."
      : "People who aren't custodians but overlap with the case custodians in shared events or direct collaboration.";
    document.getElementById("dmInsightRule").hidden = !!window.dmNoAudit;
  }
  window.dmRenderNotable = dmRenderNotable;

  /* ── Summary line and scope counts ─────────────────────────────────── */
  /* PRD 01 M7, 7.1: six facts in one line, in order — items, sources, UAL events, holds, the window, the basis.
     Production's demo added a seventh clause for the sources with no activity data; the sixth card (F10, held) now
     carries them, so the line keeps the PRD's six facts and still reconciles: its sources and items are the six
     cards' sum (decision 190). Counts are what is in scope: the population less exclusions. */
  function dmSummaryParts() {
    var win = window.dmWindow || "caseWindow";
    var rows = (window.DM_ALL_SOURCES || { rows: [] }).rows.filter(function (r) { return r.pop; });
    var sc = rows.map(dmInScope).filter(function (x) { return !x.whole; });
    var people = ((window.DM_PEOPLE || {})[win] || { custodians: [] }).custodians;
    var held = people.filter(function (c) { return c.hold === "Active"; }).length;
    var dates = window.dmRange ? dmFmtRange(dmParseIso(window.dmRange.from), dmParseIso(window.dmRange.to))
      : win === "allTime" ? "Full tenant history" : dmFmtRange(dmParseIso(M.window.start), dmParseIso(M.window.end));
    return { items: sc.reduce(function (n, x) { return n + x.items; }, 0), sources: sc.length, events: sc.reduce(function (n, x) { return n + x.events; }, 0),
             held: held, custodians: people.length, dates: dates, basis: win === "allTime" ? "All Time" : "Case Window" };
  }
  function dmSummaryHtml() {
    var s = dmSummaryParts(), pl = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
    if (window.dmNoAudit) {
      /* PRD 01 7.2 (held): "23 sources for 5 custodians · 5 custodians on hold · access as of …" with the no-activity tag. */
      return "<b>" + pl(s.sources, "source") + "</b> for <b>" + pl(s.custodians, "custodian") + "</b> · <b>" + s.held + "</b> custodian" + (s.held === 1 ? "" : "s") +
        " on hold · access as of " + esc(M.fmtDate(DMS.snapshotFor(window.dmAsOf || DMS.snapshots.latest) || DMS.snapshots.earliest)) +
        ' <span class="badge badge-secondary dm-noaudit-tag">No activity data · audit log indexing starts ' + esc(M.fmtDate(UAL_FROM)) + "</span>";
    }
    return "<b>" + nf(s.items) + "</b> items across <b>" + s.sources + "</b> source" + (s.sources === 1 ? "" : "s") + " (<b>" + nf(s.events) + "</b> UAL events) · <b>" +
      s.held + "</b> custodian" + (s.held === 1 ? "" : "s") + " on hold · " + esc(s.dates) + " · " + s.basis;
  }
  function dmSummaryText() { var d = document.createElement("div"); d.innerHTML = dmSummaryHtml(); return d.textContent; }
  /** What is in scope now: the population less exclusions (Finalize / Export notes). */
  function dmScopeCounts() { var s = dmSummaryParts(); return { items: s.items, events: s.events, sources: s.sources }; }
  /** A whole-source exclusion entry for a source id (saved scopes). */
  function dmWholeEntryFor(id) {
    var r = (window.DM_ALL_SOURCES.rows.filter(function (x) { return x.id === id; }))[0];
    return r ? { path: "— entire source", whole: true, items: r.itemsText, sid: id, name: r.name, unit: "source", units: "sources", metric: "items" } : null;
  }
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

  /* ══ SAVED SCOPES (PRD 01 8.2, M84, M84a–d, AC5, AC25, AC34) ═══════════════
     A scope is a saved state of the map: window, date range, the three
     filters, the sources in it and every exclusion (whole source, location,
     Copilot person) with who and when. Production stored the window only.
     Exclusion specs are { sid, key, by, at }; dmEntryFromSpec turns one into a
     live DM_EXCLUSIONS entry with today's counts. ══════════════════════════ */
  /** Name and version (M84): "Regulatory custodians v3" → { base: "Regulatory custodians", version: 3 }. */
  function dmVersionOf(name) { var m = /^(.*?)\s+v(\d+)$/i.exec(name.trim()); return m ? { base: m[1], version: +m[2] } : { base: name.trim(), version: 1 }; }
  function dmScopeFromData(sc) {
    var mine = sc.by === D.viewer().personId;
    var custs = sc.custodians.length === CUSTODIANS.length ? null : sc.custodians.slice();
    var filters = { custodians: sc.tags ? null : custs, types: sc.types || null, tags: sc.tags || null };
    return { name: sc.name, version: dmVersionOf(sc.name).version, window: sc.basis === "all" ? "allTime" : "caseWindow",
             scopeLabel: sc.basis === "all" ? "All time scope" : "Case window scope", range: sc.range || null,
             savedAt: dmSavedAt(sc.saved, sc.time), byPid: sc.by, author: mine ? null : sc.by,
             filters: filters, custodians: sc.custodians.slice(),
             exclusions: (sc.exclusions || []).map(function (x) { return { sid: x.sid, key: x.key || null, by: x.by, at: x.at }; }),
             gone: (sc.gone || []).slice(), sources: null /* filled once the map is built (dmSeedScopeSources) */ };
  }
  window.DM_SAVED_SCOPES = DM.savedScopes.map(dmScopeFromData);
  /** A seeded scope's sources: its filters applied to the map as it stood (no successor added since), plus `gone`. */
  function dmSeedScopeSources() {
    var keep = window.dmFilters;
    window.DM_SAVED_SCOPES.forEach(function (sc) {
      if (sc.sources) return;
      window.dmFilters = sc.filters;
      sc.sources = SOURCES.filter(function (s) { return dmExtraSources.indexOf(s) === -1 && dmInPopulation(s); }).map(function (s) { return s.id; }).concat(sc.gone);
    });
    window.dmFilters = keep;
  }
  window.DM_EXCLUSIONS = {};
  window.dmWindow = "caseWindow";
  window.dmRange = null;
  window.dmTypeFilter = null;
  window.dmAsOf = null;
  window.dmLoaded = null;   /* { name, scope } once a saved scope is loaded (M83, M86) */

  /* Production helpers that lived in its data script. */
  window.dmNum = function (v) { return parseFloat(String(v).replace(/,/g, "")) || 0; };
  var dmNum = window.dmNum;
  /* Exclusion identity: the source id (production's name ␁ path ␁ occurrence stood in for it). */
  window.dmExKey = function (id) { return String(id); };
  window.dmHasWhole = function (entries) { return !!(entries && entries.some(function (e) { return e.whole; })); };
  var dmHasWhole = window.dmHasWhole;

  /* Static arrays: Add Date Range defaults, Edit Filters options. */
  window.DM_CASE_DATES = { start: dmUsDate(M.window.start), end: dmUsDate(M.window.end) };
  window.DM_EDIT_FILTERS = {
    custodians: CUSTODIANS.map(function (pid) {
      var p = M.person(pid), ok = D.canSee(p);
      return { value: pid, label: ok ? p.name : "Profile details limited", secondary: ok ? p.title : "Outside your regions", masked: !ok };
    }),
    sourceTypes: [],   /* filled by dmFilterTypes(): the types on the map now (a successor can add one, M88) */
    custodianTags: Object.keys(DM.tags).map(function (t) { return { value: t, label: t }; })
  };
  function dmFilterTypes() {
    window.DM_EDIT_FILTERS.sourceTypes = DM_TYPES.filter(function (t) { return SOURCES.some(function (s) { return DM_KIND[s.type] === t; }); })
      .map(function (t) { return { value: t, label: DM_TYPE_LABEL[t] }; });
  }
  dmFilterTypes();

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
    markCustodian:   function (pid)  { console.info("[datamap] mark as custodian", pid);   return Promise.resolve(); },
    /* PRD 01 additions (each a stub the devs replace; resolve = success). */
    dismissFinding:  function (pid, why)  { console.info("[datamap] dismiss finding", pid, why); return Promise.resolve(); },   /* M14 */
    restoreFinding:  function (pid)       { console.info("[datamap] restore finding", pid);      return Promise.resolve(); },   /* M14a */
    createNaturalPerson: function (form)  { console.info("[datamap] create natural person", form); return Promise.resolve(); }, /* M16, V2 (held F16) */
    addSource:       function (src)       { console.info("[datamap] add successor source", src); return Promise.resolve(); },   /* M88 */
    requestConfirmation: function (sid)   { console.info("[datamap] request owner confirmation", sid); return Promise.resolve(); },
    exportAccess:    function (sid, asOf) { console.info("[datamap] export has access CSV", sid, asOf); return Promise.resolve(); } /* 7.4 held */
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
      m[0].innerHTML = skRect("56px", "12px");
      if (c.getAttribute("data-dm-source") !== "noactivity") m[1].innerHTML = skRect("88px", "12px");
    });
    /* Sources: six rows (Top Sources), icon + name over path, bar + count, people, Exclude. */
    var srcRow = '<tr aria-hidden="true"><td><div class="dm-source">' + skRect("22px", "22px") + '<span class="dm-source-body dm-sk-body">' + skRect("180px", "14px") + skRect("260px", "12px") + "</span></div></td>" +
      '<td class="dm-col-found">' + skRect("96px", "14px") + "</td>" +
      '<td class="dm-col-items"><div class="dm-items">' + skRect("100%", "5px") + skRect("40px", "14px") + "</div></td>" +
      '<td class="dm-col-people">' + skRect("64px", "14px") + '</td><td class="dm-col-act"><div class="vr vr-blurry" aria-hidden="true"></div>' + skRect("72px", "28px") + "</td></tr>";
    busy(document.querySelector("#dmViewBySource .dm-table tbody")).innerHTML = new Array(7).join(srcRow);
    /* By People: four total cards and ten custodian rows. */
    busy(document.getElementById("dmPeopleGrid")).innerHTML = new Array(5).join('<div class="dm-people-stat" aria-hidden="true">' + skRect("70%", "14px") + skRect("40px", "26px") + "</div>");
    var pRow = '<tr aria-hidden="true"><td class="dm-col-rank">' + skRect("14px", "14px") + "</td><td>" + skRect("120px", "14px") + "</td><td>" + skRect("160px", "14px") +
      '</td><td class="dm-col-num">' + skRect("24px", "14px") + '</td><td class="dm-col-num">' + skRect("44px", "14px") + '</td><td class="dm-col-hold">' + skRect("44px", "14px") +
      '</td><td class="dm-col-signal"><div class="dm-signal">' + skRect("100%", "5px") + skRect("48px", "14px") + "</div></td></tr>";
    busy(document.getElementById("dmCustodianRows")).innerHTML = new Array(11).join(pRow);
    /* Notable non-custodians: three rows, name over reason, action. */
    document.querySelector("#dmNonCustodianCard .dm-notable-thead").innerHTML = dmNotableHeadHtml();
    busy(document.querySelector("#dmNonCustodianCard .dm-insight-list")).innerHTML = new Array(5).join(
      '<tr aria-hidden="true"><td><div class="dm-sk-body">' + skRect("160px", "14px") + skRect("120px", "12px") + skRect("260px", "12px") + "</div></td>" +
      '<td>' + skRect("60px", "14px") + '</td><td class="dm-col-count">' + skRect("40px", "14px") + "</td><td>" + skRect("160px", "12px") +
      '</td><td class="dm-col-count">' + skRect("20px", "14px") + '</td><td class="dm-np-act"><div class="vr vr-blurry" aria-hidden="true"></div><div class="dm-np-actions">' + skRect("130px", "28px") + skRect("80px", "28px") + "</div></td></tr>");
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
      if (dmIsGuest(pid)) return;                        // PRD 01 M16, V1: never on a guest (the control is not offered)
      var name = dmPersonText(pid);
      if (btn) btn.disabled = true;                      // no double-submit
      // PRD 01 M13, AC8: adding a person adds scope, not sources, and the screen says so.
      dmRun('markCustodian', [pid],
        name + ' is now a custodian. Their sources were already on the map, so the scope changed and no source was added.',
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
          // By People gains the new custodian (and its totals card the count). Demo (PRD 01 M5): a source tied to
          // no custodian until now (their own mailbox) is now tied to one, so the whole population recounts.
          delete dmDismissed[pid];
          if (window.dmRenderTotals) window.dmRenderTotals(); else { dmRebuildPeople(); if (window.dmRenderPeople) window.dmRenderPeople(window.dmWindow); }
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
      var row = document.createElement('tr');   // Demo: the card is a table now (Scott, 10-16)
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
        // Demo: the list may have been re-rendered meanwhile (the population recounts), leaving this row detached.
        if (list && !list.querySelector('.dm-insight-row')) dmHideInsightCard();
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

    /* ── PRD 01 M14, M14a, AC24: DISMISS a finding (who, when, why), SHOW HIDDEN NON-CUSTODIANS, RESTORE. ── */
    document.addEventListener('click', function (e) {
      var d = e.target.closest('[data-dm-dismiss]'), r = e.target.closest('[data-dm-restore]'), sh = e.target.closest('#dmShowHidden');
      if (sh) {
        var wrap = document.getElementById('dmHiddenList'), open = wrap.hidden;
        wrap.hidden = !open; sh.setAttribute('aria-expanded', String(open));
        dmRenderNotable();
        return;
      }
      if (d) {
        var pid = d.getAttribute('data-dm-dismiss'), p = M.person(pid), nm = D.canSee(p) ? p.name : 'This Person';
        D.reasonDialog({ title: 'Dismiss ' + nm + '?', confirm: 'DISMISS',
          intro: (D.canSee(p) ? p.name : 'This person') + ' leaves the Notable Non-Custodians list. Show Hidden Non-Custodians brings them back, with this reason.',
          help: 'The reason is kept with the finding, with your name and the date.' }).then(function (res) {
          if (!res) return;
          var st = dmStamp(), now = new Date();
          dmRun('dismissFinding', [pid, res.reason], nm + ' is dismissed from the Notable Non-Custodians list.', 'The finding could not be dismissed.', function () {
            dmDismissed[pid] = { by: st.by, on: M.DEMO_TODAY, time: ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2), reason: res.reason };
            dmRenderNotable();
          });
        });
        return;
      }
      if (r) {
        var rp = r.getAttribute('data-dm-restore'), rn = dmPersonText(rp);
        dmRun('restoreFinding', [rp], rn + ' is back on the Notable Non-Custodians list.', 'The finding could not be restored.', function () {
          delete dmDismissed[rp]; dmRenderNotable();
        });
      }
    });
    (function () {
      var rank = document.getElementById('dmRankBy');
      function onRank() { window.dmRankBy = rank.value; dmRenderNotable(); }
      rank.addEventListener('change', onRank);
      rank.addEventListener('valueChanged.cnds.select', onRank);
    })();

    /* ── PRD 01 M17, AC23: a guest's name opens the Guest Identity drawer; a Tenant Administrator creates a natural
       person from it (M16 second half, V2, AC9; held F16). ── */
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-dm-guest]'); if (!g) return;
      e.preventDefault();
      dmOpenGuest(g.getAttribute('data-dm-guest'));
    });
    function dmOpenGuest(pid) {
      var p = M.person(pid), isTA = D.hasRole('Tenant Administrator');
      var ctx = { sources: function () { return SOURCES.filter(DMS.hasAccessView); }, eventsOf: dmEventsOf, isCustodian: dmIsCustodian, isNatural: function (x) { return !!dmNatural[x]; },
                  custodiansOn: function (sid) { return (dmAccessed[sid] || []).map(function (a) { return a[0]; }).concat((DM.participants[sid] || []).map(function (a) { return a[0]; })).filter(dmIsCustodian).filter(function (v, i, a) { return a.indexOf(v) === i; }); },
                  sourceTitle: function (s) { return dmSourceName(s).title; } };
      var panel = D.offcanvas({ title: 'Guest Identity', width: '50vw', body: DMS.guestDrawerHtml(pid, ctx),
        footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">' + (isTA ? 'Cancel' : 'Close') + '</button>' +
          (isTA ? '<button type="button" class="btn btn-primary" data-dm-np-create disabled>Create Natural Person</button>'
                : '<span title="Creating a natural person is a Tenant Administrator action."><button type="button" class="btn btn-primary" disabled>Create Natural Person</button></span>') });
      panel.el.classList.add('dm-guest-panel');
      if (!isTA) return;
      var b = panel.el.querySelector('[data-dm-np-create]');
      var req = ['dmNpName', 'dmNpType', 'dmNpEmail', 'dmNpReason'];
      function valid() { return req.every(function (id) { var el = panel.el.querySelector('#' + id); return el && el.value.trim() !== ''; }); }
      function sync() { b.disabled = !valid(); }
      panel.el.addEventListener('input', sync);
      panel.el.addEventListener('change', sync);
      panel.el.addEventListener('valueChanged.cnds.select', sync, true);
      b.addEventListener('click', function () {
        if (!valid()) return;
        var add = panel.el.querySelector('#dmNpAdd').checked, nm = panel.el.querySelector('#dmNpName').value.trim();
        b.disabled = true;
        dmRun('createNaturalPerson', [{ identity: pid, name: nm, addAsCustodian: add }],
          nm + ' is now a natural person in CaseFusion' + (add ? ' and a custodian on this case. Their sources were already on the map, so the scope changed and no source was added.' : '.'),
          'The natural person could not be created.', function () {
            dmNatural[pid] = true;
            panel.hide();
            if (add) { dmAdded[pid] = true; delete dmDismissed[pid]; }
            if (window.dmRenderTotals) window.dmRenderTotals();
          });
      });
    }
    window.dmOpenGuest = dmOpenGuest;

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
      // Demo: DM_PEOPLE is rebuilt whenever the window, date range, filters or exclusions change
      // (dmBuild), so it is read through this getter rather than captured once.
      var P = function () { return window.DM_PEOPLE || {}; };
      var grid = document.getElementById('dmPeopleGrid');
      var rows = document.getElementById('dmCustodianRows');
      var head = document.getElementById('dmPeopleHead');
      if (!(grid && rows)) return;

      var esc = dmEsc;

      var HOLD_CLASS = { Active: 'dm-hold-active', Pending: 'dm-hold-pending' };
      var current = 'caseWindow';

      /* PRD 01 7.1: CUSTODIAN is the name over the email. 7.2 (held): without audit logs, Events and Relevance give
         way to Standard · Permissions · Asset import, and an account disabled before the earliest snapshot shows its
         zero with the reason on the row (M64, W2). */
      function nameCell(c) {
        return c.masked ? dmMaskedHtml() : '<a href="' + DM_PROFILE_HREF + '" class="dm-custodian-name">' + esc(c.name) + '</a>' +
          '<small class="d-block text-muted">' + esc(c.email) + '</small>';
      }
      function rowHtml(c) {
        var holdCls = HOLD_CLASS[c.hold] || '';
        if (window.dmNoAudit) {
          return '<tr>' +
            '<td class="dm-col-rank">' + c.rank + '</td><td>' + nameCell(c) + '</td><td>' + esc(c.masked ? '—' : c.role) + '</td>' +
            '<td class="dm-col-num">' + esc(c.sources) + '</td><td class="dm-col-num">' + esc(c.std) + '</td>' +
            '<td class="dm-col-num">' + esc(c.perm) + (c.disabled ? '<small class="d-block text-muted dm-zero-why">Account disabled before the earliest snapshot</small>' : '') + '</td>' +
            '<td class="dm-col-num">' + esc(c.asset) + '</td>' +
            '<td class="dm-col-hold ' + holdCls + '">' + esc(c.hold) + '</td></tr>';
        }
        return '<tr>' +
          '<td class="dm-col-rank">' + c.rank + '</td>' +
          // Demo: a custodian outside the viewer's regions reads as a lock + "Profile
          // details limited" (never dimmed) with no role and no profile link.
          '<td>' + nameCell(c) + '</td>' +
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
      function renderHead() {
        var cols = window.dmNoAudit
          ? [['#', 'dm-col-rank'], ['Custodian', ''], ['Role', ''], ['Sources', 'dm-col-num'], ['Standard', 'dm-col-num'], ['Permissions', 'dm-col-num'], ['Asset Import', 'dm-col-num'], ['On Hold', 'dm-col-hold']]
          : [['#', 'dm-col-rank'], ['Custodian', ''], ['Role', ''], ['Sources', 'dm-col-num'], ['Events', 'dm-col-num'], ['On Hold', 'dm-col-hold'], ['Relevance Signal', 'dm-col-signal']];
        head.innerHTML = '<tr>' + cols.map(function (c) { return '<th scope="col"' + (c[1] ? ' class="' + c[1] + '"' : '') + '>' + c[0] + '</th>'; }).join('') + '</tr>';
        // PRD 01 7.2: Sort by Sources · Name · On hold without audit logs (Events · Sources · Name with them).
        var sortEl = document.getElementById('dmPeopleSort');
        var want = window.dmNoAudit ? [['sources', 'Sources'], ['name', 'Name'], ['hold', 'On Hold']] : [['events', 'Events'], ['sources', 'Sources'], ['name', 'Name']];
        if (sortEl.getAttribute('data-dm-variant') !== String(!!window.dmNoAudit)) {
          sortEl.setAttribute('data-dm-variant', String(!!window.dmNoAudit));
          sortEl.innerHTML = want.map(function (o, i) { return '<option value="' + o[0] + '"' + (i ? '' : ' selected') + '>' + o[1] + '</option>'; }).join('');
          tools.sortBy = want[0][0]; tools.dir = 'desc';
          if (window.Nimbus && Nimbus.Select) { try { var si = Nimbus.Select.getOrCreateInstance(sortEl); si._renderOptions(); si.setValue([tools.sortBy]); } catch (e) {} }
          // The relevance filter has nothing to read without audit logs: disabled, with the reason.
          var fl = document.getElementById('dmPeopleFilter');
          fl.disabled = !!window.dmNoAudit;
          var fw = fl.closest('.select-wrapper') || fl.parentNode;
          if (fw) fw.title = window.dmNoAudit ? 'Relevance is read from audit-log activity, which this period does not have.' : '';
          if (window.Nimbus && Nimbus.Select) { try { Nimbus.Select.getOrCreateInstance(fl)[window.dmNoAudit ? 'disable' : 'enable'](); } catch (e) {} }
          if (window.dmNoAudit) tools.level = 'all';
        }
      }

      // Table-tools state. Default sort reproduces the Figma row order (events, high→low).
      var tools  = { q: '', show: 'all', level: 'all', sortBy: 'events', dir: 'desc' };
      var matching = [];
      var num = window.dmNum;   // shared parser — see dmNum
      var HOLD_ORDER = { Active: 2, Pending: 1, No: 0 };

      function compare(a, b) {
        var r;
        if (tools.sortBy === 'name')        r = a.name.localeCompare(b.name);
        else if (tools.sortBy === 'hold')   r = HOLD_ORDER[a.hold] - HOLD_ORDER[b.hold];
        else                                r = num(a[tools.sortBy]) - num(b[tools.sortBy]);
        if (r === 0) r = b.rank - a.rank; // stable tiebreak on relevance rank
        return tools.dir === 'asc' ? r : -r;
      }

      function recompute() {
        // Demo (PRD 01 M5): the Custodians and Custodian Tags filters are applied once, to the whole population
        // (dmBuildPeople lists only the custodians drawn), so this table no longer filters on its own.
        matching = (P()[current] || { custodians: [] }).custodians.filter(function (c) {
          // PRD 01 7.1: Show — All · On hold · Not requested (1.9's options, kept).
          if (tools.show === 'onhold' && c.hold !== 'Active') return false;
          if (tools.show === 'notrequested' && !c.notRequested) return false;
          if (tools.level !== 'all' && c.level !== tools.level) return false;
          if (tools.q) {
            var hay = (c.name + ' ' + c.role + ' ' + c.email).toLowerCase();
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
            : '<tr class="dm-people-empty"><td colspan="8">No custodians match the current filters.</td></tr>';
        }
      });

      // `animate` is opt-in: filter / sort / window changes crossfade; typing in
      // the search box must not (a ghost per keystroke reads as flicker).
      function refresh(animate) { recompute(); if (pager) pager.reset(animate); }

      // Kept for callers of production's seam; the population now carries the custodian and tag filters.
      window.dmFilterPeople = function () { refresh(); };

      // ── Table tools bar: toggle + search + Filter By + Show + Sort By + Asc/Desc ──
      (function () {
        var slot   = document.getElementById('dmPeopleToolsSlot');
        var toggle = document.getElementById('dmPeopleToolsToggle');
        var search = document.getElementById('dmPeopleSearch');
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
        function bindSelect(id, key) {
          var el = document.getElementById(id); if (!el) return;
          function onChange() { tools[key] = el.value; refresh(true); }
          el.addEventListener('change', onChange);
          el.addEventListener('valueChanged.cnds.select', onChange);
        }
        bindSelect('dmPeopleShow', 'show');
        bindSelect('dmPeopleSort', 'sortBy');
        bindSelect('dmPeopleFilter', 'level');

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
        renderHead();
        var setTotals = function () {
          grid.classList.toggle('dm-people-grid-5', P()[key].totals.length === 5);
          grid.innerHTML = P()[key].totals.map(function (t) {
            return '<div class="dm-people-stat">' +
                     '<span class="dm-people-stat-label">' + esc(t.label) + '</span>' +
                     '<span class="dm-people-stat-value">' + esc(t.value) + '</span>' +
                     (t.sub ? '<small class="text-muted">' + esc(t.sub) + '</small>' : '') +
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

    /* ══ SAVED SCOPES (PRD 01 M84, M84a–d, M86, M88, AC5, AC25, AC26, AC29–AC31, AC34, V4, W7) ══════════
       Production saved and restored the time window only. A scope now holds and restores the window, the
       date range, the three filters, the sources and every exclusion (whole source, location, Copilot person)
       with who and when; it is named and versioned, and a duplicate name is refused (V4). Loading one names it
       in the scope bar with its exclusion count (M83, M86), says which of its sources can no longer be
       requested and offers the successor for confirmation (M88, AC26), and which have left the case (W7). ══ */
    /** Exclusion specs for a scope: { sid, key (location path or person id; null = whole), by, at }. */
    function dmExclusionSpecs() {
      var ex = window.DM_EXCLUSIONS || {}, out = [];
      Object.keys(ex).forEach(function (sid) {
        ex[sid].forEach(function (e) { out.push({ sid: sid, key: e.whole ? null : (e.key || e.path), by: e.by, at: e.at }); });
      });
      return out;
    }
    /** A live DM_EXCLUSIONS entry from a spec, with today's counts. */
    function dmEntryFromSpec(x) {
      var src = dmById(x.sid); if (!src) return null;
      var e;
      if (!x.key) e = dmWholeEntryFor(x.sid);
      else {
        var d = dmSourceDetail(x.sid), cfg = d.exclude || { tab: 'location', key: 'path', metricKey: 'items', unit: 'location', units: 'locations', metric: 'items' };
        var list = cfg.tab === 'location' ? d.locations : (d[cfg.tab] || []);
        var row = list.filter(function (l) { return l[cfg.key] === x.key || l._loc === x.key; })[0];
        if (!row) return null;
        var shown = cfg.key === '_pid' ? (row._masked ? 'Profile details limited' : row.name) : row.path;
        e = { path: shown, key: row[cfg.key], sid: x.sid, items: row[cfg.metricKey], name: d.name, unit: cfg.unit, units: cfg.units, metric: cfg.metric };
      }
      if (e) { e.by = x.by; e.at = x.at; }
      return e;
    }
    window.dmEntryFromSpec = dmEntryFromSpec;

    // ── Load Saved Scope — render the menu from DM_SAVED_SCOPES and apply one ──
    (function () {
      var listEl  = document.getElementById('dmScopesList');
      var countEl = document.getElementById('dmScopesCount');
      var menuEl  = document.getElementById('dmScopesMenu');
      var toggle  = document.getElementById('dmLoadScopeToggle');
      if (!(listEl && countEl && menuEl)) return;

      var esc = dmEsc;
      var NOT_AUTHOR = 'Only the author of a saved scope can rename or delete it.';

      function render() {
        var scopes = window.DM_SAVED_SCOPES || [];
        countEl.textContent = scopes.length;
        if (!scopes.length) {
          listEl.innerHTML = '<div class="dm-scope-empty">No saved scopes on this case yet. Finalize Scope And Save names the map as it stands.</div>';
          return;
        }
        listEl.innerHTML = scopes.map(function (s, i) {
          var n = (s.exclusions || []).length;
          var details = (s.window === 'allTime' ? 'All Time' : 'Case Window') + (s.range ? ' · ' + dmFmtRange(dmParseIso(s.range.from), dmParseIso(s.range.to)) : '') +
            ' · ' + n + (n === 1 ? ' exclusion' : ' exclusions') + (s.savedAt ? ' · Saved ' + s.savedAt : '');
          // PRD 01 M84b: "Shared by {{author_name}}". A masked author reads as the house lock pattern, not a sentence
          // about "Profile details limited".
          var a = s.author ? M.person(s.author) : null;
          var shared  = a ? '<span class="dm-scope-shared">Shared by ' + (D.canSee(a) ? esc(a.name) : dmMaskedHtml()) + '</span>' : '';
          // PRD 01 M84c: the author's own scopes carry DELETE · RENAME · LOAD; a shared scope can only be loaded.
          // Production hid DELETE and RENAME; disabled with the reason (house rule: disable, never hide).
          var own = !s.author;
          var off = own ? '' : ' disabled';
          var wrap = function (html) { return own ? html : '<span class="dm-mark-blocked" title="' + NOT_AUTHOR + '">' + html + '</span>'; };
          var actions = wrap('<button type="button" class="btn btn-tertiary" data-dm-scope-action="delete" data-dm-scope="' + i + '"' + off + '>Delete</button>') +
            wrap('<button type="button" class="btn btn-tertiary" data-dm-scope-action="rename" data-dm-scope="' + i + '"' + off + '>Rename</button>') +
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

      // ── Delete: confirm first (Figma: Delete Saved Scope — Confirm; house destructive pattern, F15) ──
      var delModal = document.getElementById('dmDeleteScopeModal');
      var delYes   = document.getElementById('dmDeleteScopeYes');
      var delText  = document.getElementById('dmDeleteScopeText');
      var pendingDelete = null;

      if (delYes && delModal) {
        delYes.addEventListener('click', function () {
          var scope = pendingDelete;
          pendingDelete = null;
          dmHideModal(delModal);
          if (!scope) return;
          delYes.disabled = true;
          dmRun('deleteScope', [scope], 'Scope deleted successfully.', 'The scope could not be deleted.', function () {
            var arr = window.DM_SAVED_SCOPES || [];
            var i = arr.indexOf(scope);
            if (i !== -1) arr.splice(i, 1);
            if (window.dmLoaded && window.dmLoaded.scope === scope) { window.dmLoaded = null; if (window.dmSyncExclusions) window.dmSyncExclusions(); }
            render();
          }).then(function () { delYes.disabled = false; });
        });
        delModal.addEventListener('hidden.cnds.modal', function () { pendingDelete = null; });
      }

      // ── Rename: prefill the current name, require a new one that the case does not already use (V4) ──
      var renModal   = document.getElementById('dmRenameScopeModal');
      var renCurrent = document.getElementById('dmRenameCurrent');
      var renInput   = document.getElementById('dmRenameInput');
      var renSave    = document.getElementById('dmRenameSave');
      var pendingRename = null;

      if (renModal && renInput && renSave) {
        var renField = renInput.closest('.cf-input-field');
        var renErr = document.createElement('div');
        renErr.className = 'cf-input-helper'; renErr.innerHTML = '<span class="cf-input-error"></span>';
        renField.appendChild(renErr);
        function syncRename() {
          var v = renInput.value.trim(), dup = v && window.dmScopeNameTaken(v, pendingRename);
          renField.classList.toggle('is-invalid', !!dup);
          renErr.firstChild.textContent = dup ? 'This case already has a scope called ' + v + '. Save a new version, or choose another name.' : '';
          renSave.disabled = (v === '' || (pendingRename && v === pendingRename.name) || !!dup);
        }
        renInput.addEventListener('input', syncRename);
        renModal.addEventListener('shown.cnds.modal', function () { renInput.focus(); });
        renModal.addEventListener('hidden.cnds.modal', function () {
          pendingRename = null; renInput.value = ''; renSave.disabled = true; renField.classList.remove('is-invalid');
        });
        renSave.addEventListener('click', function () {
          var scope = pendingRename, newName = renInput.value.trim();
          if (!scope || !newName) return;
          dmHideModal(renModal);
          renSave.disabled = true;
          dmRun('renameScope', [scope, newName], 'Scope renamed successfully.', 'The scope could not be renamed.', function () {
            // PRD 01 8.2: earlier names are kept so a scope cited by an old name can still be found.
            (scope.previousNames = scope.previousNames || []).push(scope.name);
            scope.name = newName; scope.version = dmVersionOf(newName).version;
            if (window.dmLoaded && window.dmLoaded.scope === scope) { window.dmLoaded.name = newName; if (window.dmSyncExclusions) window.dmSyncExclusions(); }
            render();
          });
        });
      }

      listEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dm-scope-action]');
        if (!btn || btn.disabled) return;
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
          if (delText) delText.innerHTML = 'The saved scope <b>' + esc(scope.name) + '</b> will be deleted.';
          closeMenu();
          if (window.Nimbus && Nimbus.Modal && delModal) Nimbus.Modal.getOrCreateInstance(delModal).show();
          return;
        }
        if (action !== 'load') return;
        closeMenu();
        dmRun('loadScope', [scope], 'Scope loaded successfully.', 'The scope could not be loaded.', function () { dmApplyScope(scope); });
      });

      /** Restore everything a scope holds (AC5), then say what changed since it was saved (M88, W7). */
      function dmApplyScope(scope) {
        // Filters (M5a): the checkbox menus and chips follow.
        window.dmFilters = { custodians: scope.filters.custodians ? scope.filters.custodians.slice() : null,
                             types: scope.filters.types ? scope.filters.types.slice() : null, tags: scope.filters.tags ? scope.filters.tags.slice() : null };
        if (window.dmSyncFilterUI) window.dmSyncFilterUI();
        // Window and date range.
        window.dmWindow = scope.window;
        Array.prototype.forEach.call(document.querySelectorAll('#dmWindowToggle [data-dm-window]'), function (b) {
          var on = b.getAttribute('data-dm-window') === scope.window; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
        });
        window.dmRange = scope.range ? { from: scope.range.from, to: scope.range.to } : null;
        if (window.dmShowDateChip) window.dmShowDateChip(window.dmRange);
        // Exclusions are a state in time, held by the scope (M82a): replace, never merge.
        var ex = window.DM_EXCLUSIONS;
        Object.keys(ex).forEach(function (k) { delete ex[k]; });
        window.dmLoaded = { name: scope.name, scope: scope };
        if (window.dmRenderTotals) window.dmRenderTotals();
        (scope.exclusions || []).forEach(function (x) {
          var en = dmEntryFromSpec(x); if (!en) return;
          if (en.whole) ex[x.sid] = [en]; else (ex[x.sid] = ex[x.sid] || []).push(en);
        });
        if (window.dmSyncExclusions) window.dmSyncExclusions();
        if (window.dmRecount) window.dmRecount();
        dmScopeNotice(scope);
      }
      window.dmApplyScope = dmApplyScope;

      /* M88, AC26: never rewrite the scope or insert the successor; state it and offer the successor for confirmation.
         W7: sources the scope held that are no longer on the case. */
      function dmScopeNotice(scope) {
        var box = document.getElementById('dmScopeNotice');
        var ro = (scope.sources || []).map(dmById).filter(function (s) { return s && s.readOnly; });
        var gone = (scope.sources || []).filter(function (id) { return !dmById(id); }).map(function (id) { return DM.removedSources[id]; }).filter(Boolean);
        var parts = [];
        ro.forEach(function (s) {
          var dc = s.decommissioned, have = dmById(dc.successor.id);
          parts.push('<div class="alert alert-warning dm-alert-sm" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span>' +
            '<span class="alert-message"><b>1 source on this scope can no longer be requested:</b> ' + esc(dmSourceName(s).title) + '. ' + esc(M.typeLabel(s.type)) +
            ' was decommissioned on ' + esc(M.fmtDate(dc.on)) + ' and its content went to ' + esc(dc.successor.type) + '. The saved scope is unchanged.' +
            (have ? ' ' + esc(dc.successor.type) + ' · ' + esc(dc.successor.name) + ' is on the map.' : '') + '</span>' +
            (have ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-dm-successor="' + esc(s.id) + '">Add ' + esc(dc.successor.type) + ' Community</button>') + '</div>');
        });
        if (gone.length) {
          parts.push('<div class="alert alert-info dm-alert-sm" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-information"></i></span>' +
            '<span class="alert-message"><b>' + gone.length + (gone.length === 1 ? ' source on this scope is' : ' sources on this scope are') + ' no longer on the case:</b> ' +
            gone.map(function (g) { return esc(D.canSee(M.person(g.owner)) ? g.name : 'a source of a custodian outside your regions') + ' (removed ' + esc(M.fmtDate(g.removed)) + ': ' + esc(g.reason) + ')'; }).join('; ') +
            '. The map shows the case as it is now.</span></div>');
        }
        box.innerHTML = parts.join('');
        box.hidden = !parts.length;
      }
      window.dmScopeNotice = dmScopeNotice;
      // Offer the successor (M88): applied only on confirmation; it joins the case as a case source (M82), and the saved
      // scope is not changed.
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-successor]'); if (!b) return;
        var s = dmById(b.getAttribute('data-dm-successor')), sc = s.decommissioned.successor;
        var m = D.modal({ title: 'Add ' + sc.type + ' · ' + sc.name + ' To The Case?', noGuard: true,
          body: '<p class="mb-3">' + esc(sc.type) + ' · ' + esc(sc.name) + ' joins this case as a source, found through Sources, so a request can include it. Nothing is preserved until a request is sent.</p>' +
                '<p class="note note-info note-sm mb-0">The saved scope ' + esc(window.dmLoaded ? window.dmLoaded.name : '') + ' is not changed. Finalize a new scope to include the successor.</p>',
          footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" data-dm-add-successor>Add Source</button>' });
        m.el.querySelector('[data-dm-add-successor]').addEventListener('click', function () {
          m.hide();
          dmRun('addSource', [sc], sc.type + ' · ' + sc.name + ' is on this case. Adding a source does not preserve it.', 'The source could not be added.', function () {
            dmExtraSources.push({ id: sc.id, owner: null, type: sc.type, name: sc.name, found: 'Sources', items: sc.items, events: null, location: sc.location, members: s.members });
            dmCollectSources(); dmFilterTypes();
            if (window.dmRenderFilterLists) window.dmRenderFilterLists();
            if (window.dmRenderTotals) window.dmRenderTotals();
            if (window.dmLoaded) dmScopeNotice(window.dmLoaded.scope);
          });
        });
      });
    })();

    // ── Finalize and Save — name the scope, then hand off to the API ──
    //    Saved scopes accumulate in window.DM_SAVED_SCOPES so the Saved Scopes
    //    flow (load / rename / delete) has real data to work with. ──
    window.DM_SAVED_SCOPES = window.DM_SAVED_SCOPES || [];
    /** PRD 01 V4: is a name already used by a scope on this case (case-insensitive), other than `except`? */
    window.dmScopeNameTaken = function (name, except) {
      var n = name.trim().toLowerCase();
      return (window.DM_SAVED_SCOPES || []).some(function (s) { return s !== except && s.name.trim().toLowerCase() === n; });
    };
    (function () {
      var modalEl = document.getElementById('dmFinalizeModal');
      var nameEl  = document.getElementById('dmScopeName');
      var noteEl  = document.getElementById('dmFinalizeSummary');
      var saveBtn = document.getElementById('dmFinalizeSave');
      var field   = document.getElementById('dmScopeNameField');
      var errEl   = document.getElementById('dmScopeNameError');
      var verWrap = document.getElementById('dmScopeVersionWrap');
      var verBtn  = document.getElementById('dmScopeVersion');
      if (!(modalEl && nameEl && noteEl && saveBtn)) return;

      function scope() {
        var key = window.dmWindow || 'caseWindow';
        var t   = (window.DM_TOTALS || {})[key] || {};
        // Demo: the counts are what is IN scope now (filters + exclusions), from dmScopeCounts().
        var c = dmScopeCounts(), f = window.dmFilters, sel = dmSelectedCustodians();
        var name = nameEl.value.trim();
        return {
          name: name, version: dmVersionOf(name).version,
          window: key,
          scopeLabel: t.scopeLabel || '',
          range: window.dmRange ? { from: window.dmRange.from, to: window.dmRange.to } : null,
          filters: { custodians: f.custodians ? f.custodians.slice() : null, types: f.types ? f.types.slice() : null, tags: f.tags ? f.tags.slice() : null },
          custodians: (sel || dmAllCustodians()).slice(),
          sources: window.DM_ALL_SOURCES.rows.filter(function (r) { return r.pop; }).map(function (r) { return r.id; }),
          exclusions: dmExclusionSpecs(),
          items: c.items.toLocaleString('en-US'),
          sourcesN: String(c.sources)
        };
      }
      function syncNote() {
        var s = scope(), n = s.exclusions.length;
        // PRD 01 M84a: "54 items across 21 sources will be saved with this scope: Case window scope." — and what else it holds (AC5).
        noteEl.textContent = s.items + ' items across ' + s.sourcesN + ' sources will be saved with this scope: ' + s.scopeLabel + '.' +
          ' It keeps the filters' + (s.range ? ', the date range' : '') + ' and ' + n + (n === 1 ? ' exclusion' : ' exclusions') + '.';
      }
      /** The next free version of a name's base: "Regulatory custodians v3" → "Regulatory custodians v4". */
      function nextVersion(name) {
        var base = dmVersionOf(name).base, max = 0;
        (window.DM_SAVED_SCOPES || []).forEach(function (s) { var v = dmVersionOf(s.name); if (v.base.toLowerCase() === base.toLowerCase()) max = Math.max(max, v.version); });
        return base + ' v' + (max + 1);
      }
      // Primary stays disabled until the scope is named (V3), and while the name is taken (V4).
      function syncValid() {
        var v = nameEl.value.trim(), dup = v && window.dmScopeNameTaken(v);
        field.classList.toggle('is-invalid', !!dup);
        errEl.textContent = dup ? 'This case already has a scope called ' + v + '. Save a new version, or choose another name.' : '';
        verWrap.hidden = !dup;
        if (dup) verBtn.textContent = 'Save As ' + nextVersion(v);
        saveBtn.disabled = v === '' || !!dup;
      }
      verBtn.addEventListener('click', function () { nameEl.value = nextVersion(nameEl.value); syncValid(); nameEl.focus(); });

      nameEl.addEventListener('input', syncValid);
      modalEl.addEventListener('show.cnds.modal', function () { syncNote(); syncValid(); });
      modalEl.addEventListener('shown.cnds.modal', function () { nameEl.focus(); });
      // Start clean each time so a previous name doesn't linger.
      modalEl.addEventListener('hidden.cnds.modal', function () { nameEl.value = ''; syncValid(); });
      syncNote(); syncValid();

      saveBtn.addEventListener('click', function () {
        var s = scope();
        if (!s.name || window.dmScopeNameTaken(s.name)) { syncValid(); return; } // defensive: button should be disabled
        dmHideModal(modalEl);
        saveBtn.disabled = true;
        dmRun('saveScope', [s], 'Data Map saved successfully.', 'The scope could not be saved.', function () {
          // Demo: the demo clock (M.DEMO_TODAY) in the house date format, like the
          // seeded scopes; production writes new Date() in the browser's locale.
          s.savedAt = dmSavedAt(M.DEMO_TODAY, new Date());
          s.byPid = D.viewer().personId;
          s.author = null; // your own scope → gets DELETE / RENAME / LOAD
          window.DM_SAVED_SCOPES.push(s);
          // The map now shows this scope (M86).
          window.dmLoaded = { name: s.name, scope: s };
          if (window.dmSyncExclusions) window.dmSyncExclusions();
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
       PRD 01 additions, each marked where it happens: the filter select on
       every view (M42d), Copilot's Accessed with CUSTODIAN STATUS (M42c), the
       location confidence tier (M33b), names that open the profile (M18) or
       the guest drawer (M17), Has access (7.4, held F9), the header facts,
       badges and EDIT DETAILS and the two drawers (7.3, held F20), the
       read-only decommissioned source (M87) and the without-audit-logs form
       (7.5, held F20; js/demo/case-data-map-source.js builds the parts).
       ══════════════════════════════════════════════════════════════════════ */
    window.DM_EXCLUSIONS = window.DM_EXCLUSIONS || {};   // { sourceId: [{path, items, name, sid, by, at, …}] }
    (function () {
      var drawerEl = document.getElementById('dmSourceDrawer');
      var itemEl   = document.getElementById('dmItemDrawer');
      if (!(drawerEl && itemEl)) return;

      var ACCESSED_HINT = 'Everyone with recorded UAL activity against this source in the case window — this reflects observed access, not granted permissions. Custodian status flagged from the case roster.';
      // ── per-tab configuration: label, hint copy, columns, sort options, filter options ──
      var TABS = {
        location: {
          label: 'Location View',
          hint: 'Click a location name to see its items.',
          // PRD 01 M33b: each location's confidence tier (PRD 02 L55–L59).
          cols: [['Location', ''], ['Items', 'dm-col-num'], ['Last Activity', 'dm-col-when'], ['Confidence', 'dm-col-tier'], ['', 'dm-col-act']],
          sort: [['path', 'Location'], ['items', 'Items'], ['lastActivity', 'Last Activity'], ['confidence', 'Confidence']],
          filter: [['all', 'All'], ['Observed', 'Observed'], ['Confirmed', 'Confirmed'], ['Reported', 'Reported'], ['excluded', 'Excluded']]
        },
        item: {
          label: 'Item View',
          hint: 'Item-level detail for forensic review, one location at a time. Full paths shown here are never used in the standard views.',
          cols: [['Name', ''], ['Type', ''], ['Modified', 'dm-col-when'], ['UAL Activity', ''], ['Owner', '']],
          sort: [['name', 'Name'], ['type', 'Type'], ['modified', 'Modified'], ['owner', 'Owner']],
          filter: [['all', 'All'], ['Accessed in window', 'Accessed In Window'], ['No activity in window', 'No Activity In Window']]
        },
        participants: {
          label: 'Participants',
          hint: 'Channel membership roster — who belongs to this channel, independent of who has actually posted or read.',
          cols: [['Name', ''], ['Role', ''], ['Member Since', 'dm-col-when'], ['Custodian Status', 'dm-col-status']],
          sort: [['name', 'Name'], ['role', 'Role'], ['since', 'Member Since']],
          filter: [['all', 'All'], ['Custodian', 'Custodians'], ['Not a Custodian', 'Not A Custodian'], ['Guest', 'Guests']]
        },
        accessed: {
          label: 'Accessed',
          hint: ACCESSED_HINT,
          cols: [['Name', ''], ['Role', ''], ['Events', 'dm-col-num'], ['Custodian Status', 'dm-col-status']],
          // Figma opens Accessed on Events, most-active first.
          sort: [['events', 'Events'], ['name', 'Name'], ['role', 'Role']],
          filter: [['all', 'All'], ['Custodian', 'Custodians'], ['Mark as Custodian', 'Meets The Threshold'], ['Below Threshold', 'Below Threshold'], ['Guest', 'Guests']],
          dir: 'desc'
        },
        /* PRD 01 7.4 (held, F9): granted access, as of a snapshot. */
        has: {
          label: 'Has Access',
          hint: 'Everyone granted access to this source on the selected date, from Microsoft 365 permission snapshots. This is granted access, not observed activity. Custodian status comes from the case\'s custodian list.',
          cols: [['', 'dm-col-exp'], ['Name', ''], ['Role', 'dm-col-role'], ['Access Via', ''], ['Events', 'dm-col-num'], ['Custodian Status', 'dm-col-status']],
          sort: [['role', 'Role'], ['name', 'Name'], ['events', 'Events']],
          filter: [['all', 'All'], ['custodians', 'Custodians'], ['noactivity', 'Access But No Activity'], ['guests', 'Guests'], ['edit', 'Edit Or Higher']],
          dir: 'desc'
        }
      };
      /* 7.5: without audit logs Has access loses EVENTS and the no-activity chip, and gains FIRST SEEN. */
      function hasCfg() {
        if (!window.dmNoAudit) return TABS.has;
        return { label: 'Has Access', hint: 'Everyone granted access to this source on the selected date, from Microsoft 365 permission snapshots. With no activity data, this shows who could open the source, not who did. Custodian status comes from the case\'s custodian list.',
          cols: [['', 'dm-col-exp'], ['Name', ''], ['Role', 'dm-col-role'], ['Access Via', ''], ['First Seen', 'dm-col-when'], ['Custodian Status', 'dm-col-status']],
          sort: [['role', 'Role'], ['name', 'Name'], ['firstSeen', 'First Seen']],
          filter: [['all', 'All'], ['custodians', 'Custodians'], ['guests', 'Guests'], ['edit', 'Edit Or Higher']], dir: 'desc' };
      }
      function cfgOf(tab) {
        if (tab === 'has') return hasCfg();
        if (tab === 'accessed' && exclCfg().tab === 'accessed') {
          // PRD 01 M42c: on Copilot each person can be excluded, beside CUSTODIAN STATUS.
          var c = {}; Object.keys(TABS.accessed).forEach(function (k) { c[k] = TABS.accessed[k]; });
          c.cols = TABS.accessed.cols.concat([['', 'dm-col-act']]);
          return c;
        }
        return TABS[tab];
      }

      var el = {
        icon: document.getElementById('dmDrawerIcon'), name: document.getElementById('dmDrawerName'),
        path: document.getElementById('dmDrawerPath'), tabs: document.getElementById('dmDrawerTabs'),
        hint: document.getElementById('dmDrawerHint'), banner: document.getElementById('dmExclBanner'), slot: document.getElementById('dmExclSlot'),
        locs: document.getElementById('dmDrawerLocs'), head: document.getElementById('dmDrawerHead'),
        rows: document.getElementById('dmDrawerRows'), search: document.getElementById('dmDrawerSearch'),
        sort: document.getElementById('dmDrawerSort'), dir: document.getElementById('dmDrawerSortDir'), filter: document.getElementById('dmDrawerFilter'),
        apply: document.getElementById('dmDrawerApply'), cancel: document.getElementById('dmDrawerCancel'), exportBtn: document.getElementById('dmDrawerExport'),
        facts: document.getElementById('dmDrawerFacts'), drawers: document.getElementById('dmSdDrawers'),
        accessBar: document.getElementById('dmAccessBar'), asOf: document.getElementById('dmAccessAsOf'), fidelity: document.getElementById('dmAccessFidelity'),
        gap: document.getElementById('dmAccessGap'), chips: document.getElementById('dmAccessChips'), extra: document.getElementById('dmAccessExtra')
      };

      // Current drawer state. `staged` holds exclusions not yet applied.
      var S = { source: null, data: null, tab: 'location', loc: null, filter: 'all',
                q: '', sortBy: 'path', dir: 'asc', staged: [], asOf: null, access: null, open: {}, sdOpen: { own: false, hist: false } };
      var matching = [];

      var num = window.dmNum;   // shared parser — see dmNum
      function rowsForTab() {
        if (!S.data) return [];
        if (S.tab === 'location') return S.data.locations || [];
        if (S.tab === 'accessed') return S.data.accessed || [];
        if (S.tab === 'participants') return S.data.participants || [];
        if (S.tab === 'has') return S.access ? S.access.rows : [];
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
      /* PRD 01 M87: a source whose type is decommissioned is read-only — nothing to exclude or stage. */
      var READ_ONLY_WHY = 'This source is read-only: its type is decommissioned, so it can no longer be requested.';

      /* The filter select (M42d) and the Has access chips (7.4) share one state. */
      function passesFilter(r) {
        var f = S.filter;
        if (f === 'all') return true;
        if (S.tab === 'location') return f === 'excluded' ? isExcluded(r.path) : r.confidence === f;
        if (S.tab === 'item') return r.ual === f;
        if (S.tab === 'has') {
          if (r._tenant) return false;
          if (f === 'custodians') return /^Custodian/.test(r.status);
          if (f === 'noactivity') return r._events === 0;
          if (f === 'guests') return r._guest;
          if (f === 'edit') return r._rank >= DMS.EDIT_OR_HIGHER;
          return true;
        }
        return r.status === f;
      }
      function recompute() {
        var list = rowsForTab().filter(function (r) {
          if (!passesFilter(r)) return false;
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
        // 7.4, M55: the tenant-wide claim is one row, never expanded, and always last.
        if (S.tab === 'has' && S.access && S.access.tenantWide && (S.filter === 'all') && !S.q) list.push({ _tenant: true });
        matching = list;
      }

      var pager = dmCreatePager({
        toolbar: drawerEl.querySelector('.offcanvas-body > .pagination-toolbar'),
        rowsEl: el.rows,
        getTotal: function () { return matching.length; },
        render: function (start, end) {
          el.rows.innerHTML = matching.length ? matching.slice(start, end).map(rowHtml).join('')
            : '<tr class="dm-people-empty"><td colspan="' + cfgOf(S.tab).cols.length + '">' + (S.tab === 'has' && S.access && S.access.gap ? 'No permission snapshot covers this date.' : 'Nothing matches the current filter.') + '</td></tr>';
        }
      });

      /**
       * Name + status cells for the person tabs (Participants / Accessed / Has access).
       * Demo (PRD 01 M18, AC23): every internal name opens the person's profile
       * (production linked only the people it offered MARK AS CUSTODIAN); a
       * guest's name opens the Guest Identity drawer (M17). Masked people (outside
       * the viewer's regions) are seen but not named or promoted: MARK AS
       * CUSTODIAN stays visible but disabled, with the reason (disable, never hide).
       */
      function personCells(r) {
        var pending = r.status === 'Mark as Custodian' || r.status === 'Not a custodian';
        var name = r._masked ? dmMaskedHtml()
          : r._guest ? '<a href="#" role="button" data-dm-guest="' + dmEsc(r._pid) + '">' + dmEsc(r.name) + '</a>' + dmGuestBadge()   /* Nimbus: a plain link */
          : '<a href="' + DM_PROFILE_HREF + '" class="dm-custodian-name" data-dm-person="' + dmEsc(r._pid) + '">' + dmEsc(r.name) + '</a>';
        var status;
        if (r._guest) status = S.tab === 'has' ? '<small class="fw-bold text-nowrap">' + dmEsc(r.status) + '</small>' : dmGuestAction(r._pid, 'dm-status-mark');
        else if (pending) {
          var mark = r._masked ? dmBlockedMark(DM_REASON_MASKED, 'dm-status-mark')
            : '<button type="button" class="btn btn-tertiary btn-sm dm-status-mark" data-dm-mark="' + dmEsc(r._pid) + '">Mark as Custodian</button>';
          status = r.status === 'Not a custodian' ? '<span class="d-block">Not a custodian</span>' + mark : mark;
        } else status = dmEsc(r.status);
        return { name: name, status: status };
      }

      function exclCell(key) {
        var ro = S.data.readOnly, whole = isSourceWhole(), ex = isExcluded(key);
        var btn = '<button type="button" class="btn btn-tertiary btn-sm dm-excl-btn" data-dm-excl="' + dmEsc(key) + '"' + (whole || ro ? ' disabled' : '') + '>' + (ex ? 'Excluded' : 'Exclude') + '</button>';
        return '<td class="dm-col-act"><div class="vr vr-blurry" aria-hidden="true"></div>' + (ro ? '<span class="dm-mark-blocked" title="' + READ_ONLY_WHY + '">' + btn + '</span>' : btn) + '</td>';
      }
      function rowHtml(r) {
        if (S.tab === 'location') {
          var ex = isExcluded(r.path);
          return '<tr' + (ex ? ' class="dm-row-excluded"' : '') + '>' +
            // Demo: a source with no Item View (not in the audit log: Box, Webex, file share) lists its one location as plain text.
            '<td>' + ((S.data.tabs || []).indexOf('item') !== -1
              ? '<button type="button" class="dm-loc-name" data-dm-loc="' + dmEsc(r.path) + '">' + dmEsc(r.path) + '</button>'
              : dmEsc(r.path)) + '</td>' +
            '<td class="dm-col-num">' + dmEsc(r.items) + '</td>' +
            '<td class="dm-col-when">' + dmEsc(r.lastActivity) + '</td>' +
            '<td class="dm-col-tier"><span class="d-block">' + dmEsc(r.confidence) + '</span><small class="text-muted">' + dmEsc(r._tierWhy) + '</small></td>' +
            exclCell(r.path) + '</tr>';
        }
        if (S.tab === 'participants') {
          var pc = personCells(r);
          return '<tr><td>' + pc.name + '</td><td>' + dmEsc(r.role) + '</td>' +
            '<td class="dm-col-when">' + dmEsc(r.since) + '</td><td class="dm-col-status">' + pc.status + '</td></tr>';
        }
        if (S.tab === 'accessed') {
          var ac = personCells(r), copilot = exclCfg().tab === 'accessed';
          return '<tr' + (copilot && isExcluded(r._pid) ? ' class="dm-row-excluded"' : '') + '><td>' + ac.name + '</td><td>' + dmEsc(r.role) + '</td>' +
            '<td class="dm-col-num">' + dmEsc(r.events) + '</td><td class="dm-col-status"><div class="vr vr-blurry" aria-hidden="true"></div>' + ac.status + '</td>' + (copilot ? exclCell(r._pid) : '') + '</tr>';
        }
        if (S.tab === 'has') {
          if (r._tenant) {
            var tw = S.access.tenantWide;
            return '<tr class="dm-tenant-row"><td class="dm-col-exp"></td><td><b>Everyone except external users</b><small class="d-block text-muted">All internal users · not listed individually</small></td>' +
              '<td class="dm-col-role">' + dmEsc(tw.role) + '</td><td>Tenant-wide claim</td><td class="dm-col-num">—</td><td class="dm-col-status"><div class="vr vr-blurry" aria-hidden="true"></div>—</td></tr>';
          }
          var hc = personCells(r), open = !!S.open[r._pid], strong = r._rank >= DMS.EDIT_OR_HIGHER;
          var main = '<tr class="dm-access-row' + (open ? ' is-open' : '') + '"><td class="dm-col-exp"><button type="button" class="btn btn-tertiary btn-sm btn-floating dm-exp-btn" data-dm-exp="' + dmEsc(r._pid) + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' how this person has access">' +
              '<i class="mdi mdi-chevron-down" aria-hidden="true"></i></button></td>' +
            '<td>' + hc.name + (r.email ? '<small class="d-block text-muted">' + dmEsc(r.email) + '</small>' : '') + '</td>' +
            '<td class="dm-col-role">' + (strong ? '<b>' + dmEsc(r.role) + '</b>' : dmEsc(r.role)) + '</td>' +
            '<td><span class="d-block">' + dmEsc(r.via) + '</span><small class="text-muted">' + dmEsc(r._viaSub) + '</small></td>' +
            (window.dmNoAudit ? '<td class="dm-col-when">' + dmEsc(r.firstSeen) + '</td>' : '<td class="dm-col-num">' + dmEsc(r.events) + '</td>') +
            '<td class="dm-col-status"><div class="vr vr-blurry" aria-hidden="true"></div>' + hc.status + '</td></tr>';
          if (!open) return main;
          var noun = DMS.nounFor(S.data.source);
          return main + '<tr class="dm-access-paths"><td></td><td colspan="5">' + r._paths.map(function (p) { return DMS.pathHtml(r._pid, p, noun); }).join('') + '</td></tr>';
        }
        return '<tr><td><button type="button" class="dm-item-link" data-dm-item="' + dmEsc(r.name) + '">' + dmEsc(r.name) + '</button></td>' +
          '<td>' + dmEsc(r.type) + '</td><td class="dm-col-when">' + dmEsc(r.modified) + '</td>' +
          '<td>' + dmEsc(r.ual) + '</td><td>' + (r._ownerMasked ? dmMaskedHtml() : dmEsc(r.owner)) + '</td></tr>';
      }

      function renderHead() {
        var cfg = cfgOf(S.tab);
        el.head.innerHTML = '<tr>' + cfg.cols.map(function (c) {
          return '<th scope="col"' + (c[1] ? ' class="' + c[1] + '"' : '') + '>' + (c[0] || (c[1] === 'dm-col-act' ? '<span class="visually-hidden">Exclude</span>' : '<span class="visually-hidden">Expand</span>')) + '</th>';
        }).join('') + '</tr>';
      }
      function fillSelect(sel, opts, value) {
        sel.innerHTML = opts.map(function (o) { return '<option value="' + dmEsc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + dmEsc(o[1]) + '</option>'; }).join('');
        if (window.Nimbus && Nimbus.Select) {
          try { Nimbus.Select.getOrCreateInstance(sel)._renderOptions(); } catch (e) {}
          try { Nimbus.Select.getOrCreateInstance(sel).setValue([value]); } catch (e) {}
        }
      }
      function renderSortOptions() {
        var cfg = cfgOf(S.tab);
        S.sortBy = cfg.sort[0][0];
        fillSelect(el.sort, cfg.sort, S.sortBy);
        S.filter = 'all';
        fillSelect(el.filter, cfg.filter, 'all');
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
          var label = cfgOf(t).label + (t === 'has' && S.access ? ' · ' + (S.access.rows.length + (S.access.tenantWide ? 1 : 0)) : '');
          return '<button type="button" class="btn btn-secondary btn-sm' + (t === S.tab ? ' active' : '') +
                 '" aria-pressed="' + (t === S.tab) + '" data-dm-tab="' + t + '">' + label + '</button>';
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
        // close. A whole-excluded or read-only source has no Apply anywhere.
        var canExclude = S.tab === exclCfg().tab && !isSourceWhole() && !S.data.readOnly;
        el.apply.hidden = !canExclude;
        el.exportBtn.hidden = S.tab !== 'has';
        el.cancel.textContent = canExclude ? 'Cancel' : 'Close';
        el.apply.disabled = !S.staged.length;
      }

      /* ── Has access (7.4, held F9) ── */
      function loadAccess() {
        if (!S.data || (S.data.tabs || []).indexOf('has') === -1) { S.access = null; return; }
        S.access = window.dmAccessRows(S.id, S.asOf);
        S.access.rows.forEach(function (r) { r._role = String(r._rank); });
      }
      function renderAccess() {
        var on = S.tab === 'has' && S.access;
        el.accessBar.hidden = !on; el.chips.hidden = !on; el.extra.hidden = !on;
        var gapOn = false;
        if (on) {
          var snaps = DMS.snapshots;
          el.fidelity.innerHTML = S.access.snap
            ? '<span class="badge badge-success">Full fidelity</span> <small class="text-muted">Snapshot ' + dmEsc(M.fmtDate(S.access.snap)) + '</small>' : '';
          // M60, M64, W1: an evidence gap is a line of its own, never an empty table that reads as "no access".
          if (S.access.gap) {
            gapOn = true;
            el.gap.innerHTML = '<span class="badge badge-secondary dm-gap-tag">Evidence Gap</span> Access on ' + dmEsc(M.fmtDate(S.asOf)) + ' can\'t be seen: the earliest permission snapshot is ' + dmEsc(M.fmtDate(snaps.earliest)) + '.';
          } else if (window.dmNoAudit) {
            gapOn = true;
            el.gap.innerHTML = '<span class="badge badge-secondary dm-gap-tag">Evidence Gap</span> The case window starts ' + dmEsc(M.fmtDate(M.window.start)) + '. The earliest permission snapshot is ' + dmEsc(M.fmtDate(snaps.earliest)) + ', so access before then can\'t be seen.';
          }
          // Chips (7.4): All · Custodians · Access but no activity · Guests · Edit or higher, with counts.
          var rows = S.access.rows, c = function (f) { return rows.filter(f).length; };
          var chips = [['all', 'All', rows.length + (S.access.tenantWide ? 1 : 0)], ['custodians', 'Custodians', c(function (r) { return /^Custodian/.test(r.status); })]];
          if (!window.dmNoAudit) chips.push(['noactivity', 'Access But No Activity', c(function (r) { return r._events === 0; })]);
          chips.push(['guests', 'Guests', c(function (r) { return r._guest; })], ['edit', 'Edit Or Higher', c(function (r) { return r._rank >= DMS.EDIT_OR_HIGHER; })]);
          el.chips.innerHTML = chips.map(function (x) {
            return '<li class="nav-item"><button type="button" class="nav-link' + (S.filter === x[0] ? ' active' : '') + '" data-dm-chip="' + x[0] + '" aria-pressed="' + (S.filter === x[0]) + '">' +
              dmEsc(x[1]) + ' <span class="nav-pill-badge">' + x[2] + '</span></button></li>';
          }).join('');
          // M56: locations with their own permissions (SharePoint), M57 / W6: what the snapshot does not capture.
          var lp = DMS.locationPerms(S.data.source), html = '';
          if (lp && lp.total) {
            html += '<section class="dm-ownperms"><div class="dm-ownperms-head"><h4 class="cf-category cf-cat-6 highlight-casefusion mb-0">Locations With Their Own Permissions</h4>' +
              '<small class="text-muted">Inherits to ' + lp.inherits + ' of ' + lp.total + ' locations</small></div><ul class="list-group list-group-light list-group-small dm-ownperms-list">' +
              lp.list.map(function (l) {
                return '<li class="list-group-item"><span>' + dmEsc(l.name) + '</span>' + (l.unique
                  ? '<span class="dm-ownperms-state"><span class="text-warning-emphasis fw-bold">Unique permissions</span> · broken ' + dmEsc(l.broken) +
                    ' <button type="button" class="btn btn-tertiary btn-sm" data-dm-uperm="' + dmEsc(l.name) + '">View</button></span>'
                  : '<small class="dm-ownperms-state text-muted">Inherits from site</small>') + '</li>';
              }).join('') + '</ul></section>';
          }
          var sl = DM.sharingLinks[S.id] || [];
          html += '<p class="small text-muted mb-0">Sharing links and file- and item-level permissions are not in the snapshot, so they are not included.' +
            (sl.length && !window.dmNoAudit ? ' ' + sl.length + (sl.length === 1 ? ' person' : ' people') + ' in Accessed reached this source through a sharing link and ' + (sl.length === 1 ? 'is' : 'are') + ' not listed here.' : '') + '</p>';
          el.extra.innerHTML = html;
        }
        el.gap.hidden = !gapOn;
      }
      function renderSdExtras() {
        var s = S.data.source;
        var scope = window.dmLoaded;
        el.facts.innerHTML = DMS.headerFactsHtml(s, { items: nf(dmItemsOf(s) * window.dmFactor), noAudit: window.dmNoAudit,
          custodiansOn: function (sid) { return dmTiedCustodians(dmById(sid)); },
          loadedScope: scope ? scope.name : null,
          inScope: function (sid) { return scope && (scope.scope.sources || []).indexOf(sid) !== -1 && !isSourceWhole(); } });
        el.drawers.innerHTML = DMS.drawersHtml(s, { noAudit: window.dmNoAudit, open: S.sdOpen });
      }

      function refresh(animate) { recompute(); if (pager) pager.reset(animate); renderFooter(); }
      function renderAll() {
        renderTabs(); renderLocs(); renderHead(); renderSortOptions(); renderBanner(); renderAccess();
        // Demo (PRD 01): a source the audit log does not report (Box, Webex, file share), a read-only source and a source just
        // added through a door open on Location View with one location and say why, in place of the "click a location" hint.
        el.hint.textContent = (S.data.note && S.tab === 'location') ? S.data.note : cfgOf(S.tab).hint;
        el.search.value = ''; S.q = '';
        S.dir = cfgOf(S.tab).dir || 'asc';
        el.dir.setAttribute('data-dir', S.dir);
        el.dir.setAttribute('aria-label', 'Sort direction, ' + (S.dir === 'asc' ? 'ascending' : 'descending'));
        el.dir.querySelector('.dm-sort-dir-label').textContent = S.dir === 'asc' ? 'Asc' : 'Dsc';
        refresh();
      }

      /** Open the drawer for a source id (demo: production keys by display name). */
      function openSource(id, tab) {
        // Demo: every Meridian source has detail, built by the adapter from
        // M.dataMap (dmSourceDetail) for the active window — the stand-in for
        // GET /sources/:id/detail. There is no generator and no authored subset.
        var data = window.dmSourceDetail ? window.dmSourceDetail(id) : null;
        if (!data) return false;          // nothing to show → leave the link inert
        var name = data.name;
        S.source = name; S.id = id; S.data = data; S.tab = tab && data.tabs.indexOf(tab) !== -1 ? tab : (data.tabs || ['location'])[0];
        S.asOf = window.dmNoAudit ? (window.dmAsOf || DMS.snapshots.latest) : DMS.snapshots.latest; S.open = {};
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
        fillSelect(el.asOf, DMS.asOfOptions(), S.asOf);
        loadAccess();
        renderSdExtras();
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
        var xp  = e.target.closest('[data-dm-exp]');
        if (mk) { dmMarkCustodian(mk.getAttribute('data-dm-mark'), mk); return; }
        if (xp) { var pid = xp.getAttribute('data-dm-exp'); S.open[pid] = !S.open[pid]; recompute(); if (pager) pager.apply(false); return; }
        if (loc) {                       // location name → Item View for that location
          S.loc = loc.getAttribute('data-dm-loc'); S.tab = 'item'; renderAll(); return;
        }
        if (ex) {                        // stage / unstage an exclusion
          var p = ex.getAttribute('data-dm-excl');
          var i = S.staged.indexOf(p);
          if (i === -1) S.staged.push(p); else S.staged.splice(i, 1);
          renderBanner(); recompute(); if (pager) pager.apply(false); renderFooter(); return;
        }
        if (it) openItem(it.getAttribute('data-dm-item'));
      });
      // Has access chips mirror the filter select.
      el.chips.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-chip]'); if (!b) return;
        S.filter = b.getAttribute('data-dm-chip');
        fillSelect(el.filter, cfgOf('has').filter, S.filter);
        renderAccess(); refresh(true);
      });
      // Access as of (M51): a snapshot date, or a custom date.
      function onAsOf() {
        var v = el.asOf.value;
        if (v === 'custom') { customAsOf(); return; }
        if (v === S.asOf) return;
        S.asOf = v; S.open = {}; loadAccess(); renderTabs(); renderAccess(); refresh(true);
      }
      el.asOf.addEventListener('change', onAsOf);
      el.asOf.addEventListener('valueChanged.cnds.select', onAsOf);
      function customAsOf() {
        var m = D.modal({ title: 'Access As Of A Custom Date', size: 'sm', noGuard: true,
          body: '<div class="cf-input-field cf-input-field-casefusion" id="dmCustomAsOfField"><label class="cf-input-label" for="dmCustomAsOf">Date <span class="cf-input-required">*</span></label>' +
                '<input id="dmCustomAsOf" type="text" class="cf-input-control" placeholder="mm-dd-yyyy" inputmode="numeric" autocomplete="off" />' +
                '<div class="cf-input-helper"><span class="cf-input-error">Enter a valid date (mm-dd-yyyy).</span><span class="cf-input-helper-text">Access is read from the latest snapshot on or before this date.</span></div></div>',
          footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" data-dm-asof-ok disabled>Apply</button>',
          onHidden: function () { fillSelect(el.asOf, DMS.asOfOptions().concat(S.asOfCustom ? [[S.asOf, 'Custom · ' + M.fmtDate(S.asOf)]] : []), S.asOf); } });
        var inp = m.el.querySelector('#dmCustomAsOf'), ok = m.el.querySelector('[data-dm-asof-ok]'), fld = m.el.querySelector('#dmCustomAsOfField');
        function parse() { var x = /^(\d{2})-(\d{2})-(\d{4})$/.exec(inp.value.trim()); if (!x) return null; var d = new Date(+x[3], +x[1] - 1, +x[2]); return d.getMonth() === +x[1] - 1 ? dmIso(d) : null; }
        inp.addEventListener('input', function () { var v = parse(); ok.disabled = !v; fld.classList.toggle('is-invalid', inp.value.length >= 10 && !v); });
        ok.addEventListener('click', function () { var v = parse(); if (!v) return; S.asOf = v; S.asOfCustom = true; S.open = {}; loadAccess(); renderTabs(); renderAccess(); refresh(true); m.hide(); });
      }
      // PERMISSION HISTORY (7.4): the snapshot series behind the selector, with how many could open the source each time.
      document.getElementById('dmPermHistory').addEventListener('click', function () {
        var s = S.data.source, rows = DMS.snapshots.dates.slice().reverse().map(function (d) {
          var a = DMS.accessFor(s, d), n = a.rows.length + (a.tenantWide ? 1 : 0), cu = a.rows.filter(function (r) { return dmIsCustodian(r.pid); }).length;
          return '<tr><td>' + M.fmtDate(d) + (d === DMS.snapshots.latest ? ' · latest' : d === DMS.snapshots.earliest ? ' · earliest' : '') + '</td><td class="dm-col-num">' + n + '</td><td class="dm-col-num">' + cu + '</td><td>Full fidelity</td></tr>';
        }).join('');
        D.modal({ title: 'Permission History', size: 'lg', noGuard: true,
          body: '<p class="mb-3">' + dmEsc(S.source) + ': one row per permission snapshot from the Microsoft 365 permissions sync. Access before ' + M.fmtDate(DMS.snapshots.earliest) + ' can\'t be seen.</p>' +
            '<div class="table-responsive"><table class="dm-table dm-table-compact"><thead><tr><th scope="col">Snapshot</th><th scope="col" class="dm-col-num">With Access</th><th scope="col" class="dm-col-num">Custodians</th><th scope="col">Fidelity</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
          footer: '<button type="button" class="btn btn-primary" data-cnds-dismiss="modal">Close</button>' });
      });
      // VIEW on a location with its own permissions (M56).
      el.extra.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-uperm]'); if (!b) return;
        var loc = b.getAttribute('data-dm-uperm'), list = DMS.uniquePerms[loc] || [];
        D.modal({ title: loc + ' · Unique Permissions', noGuard: true,
          body: '<p class="mb-3">This location stopped inheriting the site\'s permissions. Only these grants reach it.</p><div class="table-responsive"><table class="dm-table dm-table-compact"><thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Custodian Status</th></tr></thead><tbody>' +
            list.map(function (x) { var p = M.person(x[0]); return '<tr><td>' + (D.canSee(p) ? dmEsc(p.name) : dmMaskedHtml()) + '</td><td>' + dmEsc(x[1]) + '</td><td>' + (dmIsCustodian(x[0]) ? 'Custodian' : 'Not a custodian') + '</td></tr>'; }).join('') +
            '</tbody></table></div>',
          footer: '<button type="button" class="btn btn-primary" data-cnds-dismiss="modal">Close</button>' });
      });
      // Group chips open the Group Members drawer (M53), stacked over Source Details.
      document.addEventListener('click', function (e) {
        var g = e.target.closest('[data-dm-group]'); if (!g) return;
        var gid = g.getAttribute('data-dm-group');
        D.offcanvas({ title: 'Group Members', width: '50vw',
          body: DMS.groupMembersHtml(gid, { isCustodian: dmIsCustodian, isNatural: function (x) { return !!dmNatural[x]; } }),
          footer: '<button type="button" class="btn btn-primary" data-cnds-dismiss="offcanvas">Close</button>' });
      });
      // Ownership / history drawers (7.3 held): open or shut, and the choice holds for the next source.
      el.drawers.addEventListener('click', function (e) {
        var t = e.target.closest('[data-dm-sd-drawer]'), rc = e.target.closest('[data-dm-request-confirm]');
        if (t) {
          var k = t.getAttribute('data-dm-sd-drawer'), body = document.getElementById('dmSd-' + k), open = t.getAttribute('aria-expanded') !== 'true';
          S.sdOpen[k] = open; t.setAttribute('aria-expanded', String(open)); body.classList.toggle('collapsed', !open);
          t.setAttribute('aria-label', t.getAttribute('aria-label').replace(/^(Collapse|Expand)/, open ? 'Collapse' : 'Expand'));
          return;
        }
        if (rc && !rc.disabled) {
          var sd = M.sourceDetails[S.id] || {}, owner = sd.businessOwner || S.data.source.owner;
          rc.disabled = true;
          dmRun('requestConfirmation', [S.id], 'Confirmation requested from ' + dmPersonText(owner) + '.', 'The confirmation request could not be sent.');
        }
      });
      el.exportBtn.addEventListener('click', function () {
        el.exportBtn.disabled = true;
        dmRun('exportAccess', [S.id, S.asOf], 'Download successful.', 'The export could not be completed.').then(function () { el.exportBtn.disabled = false; });
      });

      // Toolbar
      el.search.addEventListener('input', function () { S.q = el.search.value.trim().toLowerCase(); refresh(); });
      function onSort() { S.sortBy = el.sort.value; refresh(true); }
      el.sort.addEventListener('change', onSort);
      el.sort.addEventListener('valueChanged.cnds.select', onSort);
      function onFilter() { if (el.filter.value === S.filter) return; S.filter = el.filter.value; if (S.tab === 'has') renderAccess(); refresh(true); }
      el.filter.addEventListener('change', onFilter);
      el.filter.addEventListener('valueChanged.cnds.select', onFilter);
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
        var st = dmStamp();   // PRD 01 M80, AC4: who excluded it, and when
        // Entries stay {path, items} so every consumer keeps working; `name` labels
        // the chip, and `unit`/`metric` name what was removed. Keyed by S.exKey.
        var keep = (window.DM_EXCLUSIONS[S.exKey] || []).filter(function (e) { return !e.whole; });
        var picked = S.staged.map(function (p) {
          var l = exclRows().filter(function (x) { return x[c.key] === p; })[0];
          var prior = keep.filter(function (e) { return (e.key || e.path) === p; })[0];
          // Demo: `key` is what was staged (a location path, or a person id for
          // Copilot); `path` is what the chip shows (the person's name, masked if
          // outside the viewer's regions); `sid` lets the counts be re-derived when
          // the window or date range changes (dmRefreshExclusionCounts).
          var shown = c.key === '_pid' ? (l && l._masked ? 'Profile details limited' : (l ? l.name : p)) : p;
          return { path: shown, key: p, sid: S.id, items: l ? l[c.metricKey] : '0', name: srcName,
                   unit: c.unit, units: c.units, metric: c.metric, by: prior ? prior.by : st.by, at: prior ? prior.at : st.at };
        });
        el.apply.disabled = true;
        dmRun('applyExclusions', [srcName, picked], 'Exclusions applied successfully.',
              'The exclusions could not be applied.', function () {
          if (picked.length) window.DM_EXCLUSIONS[S.exKey] = picked;
          else delete window.DM_EXCLUSIONS[S.exKey];
          if (window.dmSyncExclusions) window.dmSyncExclusions();
          if (window.dmRecount) window.dmRecount();
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
            // PRD 01 7.3: a Copilot person exclusion reads "Excluding: Copilot <name> (n …)" — production doubled the
            // name ("Copilot · Michael Torres Michael Torres").
            if (ex[k][0].metric === 'events') label = 'Copilot';
            var chip = document.createElement('span');
            chip.className = 'chip';
            chip.setAttribute('data-dm-excl-src', k);
            // PRD 01 M80, AC4: who excluded it and when, on the chip's tooltip.
            var who = ex[k].filter(function (e) { return e.by; }).map(function (e) { return (e.whole ? 'Source' : e.path) + ': excluded ' + M.fmtDate(e.at[0]) + ' at ' + e.at[1] + ' by ' + dmPersonText(e.by); });
            if (who.length) chip.title = who.join('\n');
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
          // PRD 01 M83, M86: once a scope is loaded the bar names it with its exclusion count, and nothing else.
          if (window.dmLoaded) footer.innerHTML = 'Loaded: <b>' + dmEsc(window.dmLoaded.name) + '</b> · ' + locs + (locs === 1 ? ' exclusion' : ' exclusions') + ' applied';
          else footer.textContent = locs
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
        if (window.dmRecount) window.dmRecount();
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
        if (window.dmRecount) window.dmRecount();                 // demo (PRD 01 M5): the counts return
        syncRefined();                                            // fade the card out if now empty
      });

      /**
       * Show each action only when its own refinement type is present.
       * Called from syncRefined(), so it re-evaluates on every chip change.
       */
      function syncRefinedActions() {
        var hasDates = !!document.getElementById('dmRefinedDateChip');
        var hasExcl  = !!refined.querySelector('[data-dm-excl-src]');
        // PRD 01 M5b + house rule: each clear is disabled (not hidden) when it has nothing to clear, with the reason.
        [[clearDates, hasDates, 'No date range is applied.'], [clearExcl, hasExcl, 'No exclusion is applied.']].forEach(function (pair) {
          var btn = pair[0], on = pair[1];
          if (!btn) return;
          btn.disabled = !on;
          btn.parentNode.title = on ? '' : pair[2];
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

        // Demo: the house date (mm-dd-yyyy) on the chip; production wrote "Jan 15 – Jun 30, 2026".
        function fmtChip(a, b) { return dmFmtRange(a, b); }
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
          // PRD 01 7.1, 17: "Date range added successfully."
          if (window.dmToast) dmToast('success', 'Success', 'Date range added successfully.');
        });

        // Clearing the date-range refinement drops the chip and reverts the fields
        // to the case window default (they represent a refinement over that window,
        // so "no refinement" means show the case window — not blank fields).
        /** Saved-scope load (AC5): show a scope's date range (ISO { from, to }) or none, without recounting twice. */
        window.dmShowDateChip = function (range) {
          var chip = document.getElementById('dmRefinedDateChip');
          if (!range) { if (chip) chip.remove(); resetToCaseWindow(); syncRefined(); return; }
          var a = dmParseIso(range.from), b = dmParseIso(range.to);
          if (!chip) { chip = document.createElement('span'); chip.className = 'chip'; chip.id = 'dmRefinedDateChip'; chipSet.insertBefore(chip, chipSet.firstChild); }
          chip.innerHTML = 'Date Range: ' + fmtChip(a, b) + '<i class="close mdi mdi-close-circle" role="button" tabindex="0" aria-label="Remove date range filter"></i>';
          fromDp.setDate(dmUsDate(range.from)); toDp.setDate(dmUsDate(range.to)); refreshValidity();
          syncRefined();
        };
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

    // ── Top Sources table controller. Row visibility combines the population (every filter, PRD 01 M5: rows are built
    //    only for sources in it), a summary-card filter (breadcrumb) and the Found through filter (M34, held F11).
    //    Exposed on window.dmTable so every flow drives the same render. ──
    (function () {
      var cards = Array.prototype.slice.call(document.querySelectorAll('#dmStatGrid .dm-stat'));
      // Scoped to this view — the By People table also uses .dm-table.
      var tbody = document.querySelector('#dmViewBySource .dm-table tbody');
      var thead = document.getElementById('dmSrcHead');
      var rows  = [];
      var crumb = document.querySelector('.dm-topsrc-crumb');
      var crumbLabel = document.querySelector('.dm-topsrc-crumb-label');
      var clearBtn = document.querySelector('.dm-topsrc-clear');
      var scopeLabel = document.querySelector('.dm-topsrc-label');
      var state = { card: null, scope: 'top', found: 'all' }; // card: workload | 'noactivity' | null
      var matching = [];                         // rows passing the filters, pre-pagination

      // ── Scope: Top Sources vs All Sources.
      //    Demo: production kept the six Top Sources as authored markup and built
      //    600 generated rows for All Sources. Here both scopes render from the
      //    case's real sources (DM_ALL_SOURCES, items high → low): All Sources
      //    lists every one in the population, Top Sources the first TOP_N of those
      //    that pass the filters. Rows carry the source id as data-dm-xid. ──
      var TOP_N = 6;
      // Brand glyphs are inline in the summary cards — harvest one per source
      // type rather than duplicating the SVG markup in JS. Sources with no card
      // (not in the audit log: Box, Webex, file share, Yammer, door-added types) use an MDI glyph.
      var ICONS = {};
      cards.forEach(function (c) {
        var k = c.getAttribute('data-dm-source'), svg = c.querySelector('svg.dm-src-svg');
        if (k && svg && !ICONS[k]) ICONS[k] = svg.outerHTML.replace('class="dm-src-svg"', 'class="dm-src-svg dm-tbl-svg"');
      });
      Object.keys(DM_MDI_ICONS).forEach(function (k) {
        ICONS[k] = '<i class="mdi ' + DM_MDI_ICONS[k] + ' dm-src-svg dm-tbl-svg dm-src-mdi cnds-icon-ml" role="img" aria-label="' + dmEsc(DM_TYPE_LABEL[k] || 'No activity data') + '"></i>';
      });
      var esc = dmEsc;
      var READ_ONLY_WHY = 'This source is read-only: its type is decommissioned, so it can no longer be requested.';
      /* PRD 01 7.2 (held): without audit logs the per-source column is Custodians with access, and no items appear (M67, AC18). */
      function custodiansWithAccess(r) {
        var s = dmById(r.id);
        if (DMS.hasAccessView(s)) {
          var n = DMS.accessFor(s, window.dmAsOf || DMS.snapshots.latest).rows.filter(function (x) { return dmIsCustodian(x.pid); }).length;
          return n + (n === 1 ? ' custodian' : ' custodians');
        }
        return r.tied ? r.tied + (r.tied === 1 ? ' custodian' : ' custodians') : 'Not tied to a custodian';
      }
      function rowHtml(r) {
        var badges = (r.readOnly ? ' <span class="badge badge-secondary dm-row-badge" title="' + READ_ONLY_WHY + '"><i class="mdi mdi-lock-outline" aria-hidden="true"></i> Read-Only</span>' : '') +
          (r.added ? ' <span class="badge badge-info dm-row-badge">Added · Pending</span>' : '') +
          (r.openToEveryone ? ' <span class="badge badge-secondary dm-row-badge">Open To Everyone</span>' : '');
        var btn = '<button type="button" class="btn btn-tertiary btn-sm dm-src-excl-btn"' + (r.readOnly ? ' disabled' : '') + '>Exclude</button>';
        return '<tr data-dm-source="' + esc(r.type) + '" data-dm-xid="' + esc(r.id) + '" data-dm-quiet="' + (r.events == null) + '" data-dm-found="' + esc(r.found) + '">' +
          '<td><div class="dm-source">' + (ICONS[r.type] || '') +
            '<span class="dm-source-body">' +
              // Demo: masked owner → lock + "Profile details limited"; the link
              // still opens Source Details (the source is in the case).
              '<span><a href="#" class="dm-source-name">' + (r.masked ? dmMaskedHtml('fw-bold') : esc(r.name)) + '</a>' + badges + '</span>' +
              '<span class="dm-source-path">' + esc(r.path) + '</span>' +
            '</span></div></td>' +
          // PRD 01 F11 (held): Found through, the route by which the source reached this case (M30–M32).
          '<td class="dm-col-found">' + esc(r.found) + '</td>' +
          (window.dmNoAudit ? '<td class="dm-col-people">' + esc(custodiansWithAccess(r)) + '</td>' :
          '<td class="dm-col-items"><div class="dm-items">' +
            '<div class="progress" style="height:5px;"><div class="progress-bar" role="progressbar" style="width:' + r.bar + '%;" aria-valuenow="' + r.items + '" aria-valuemin="0" aria-valuemax="' + r.max + '" aria-label="' + esc(r.itemsText) + ' items"></div></div>' +
            '<b>' + esc(r.itemsText) + '</b>' +
          '</div></td>' +
          // Demo (PRD 01): a source with no audit-log activity says so here.
          '<td class="dm-col-people">' + esc(r.people) + '</td>') +
          '<td class="dm-col-act"><div class="vr vr-blurry" aria-hidden="true"></div>' + (r.readOnly ? '<span class="dm-mark-blocked" title="' + READ_ONLY_WHY + '">' + btn + '</span>' : btn) + '</td>' +
        '</tr>';
      }
      function renderHead() {
        thead.innerHTML = '<tr><th scope="col">Source</th><th scope="col" class="dm-col-found">Found Through</th>' +
          (window.dmNoAudit ? '<th scope="col" class="dm-col-people">Custodians With Access</th>' : '<th scope="col" class="dm-col-items">Items</th><th scope="col" class="dm-col-people">People Accessed</th>') +
          '<th scope="col" class="dm-col-act"><span class="visually-hidden">Exclude from scope</span></th></tr>';
      }
      /** Demo: (re)build every row from DM_ALL_SOURCES — first paint, and after
          the window, date range, filters or the variant change the counts. */
      function rebuild(animate) {
        var swap = function () {
          renderHead();
          tbody.innerHTML = (window.DM_ALL_SOURCES || { rows: [] }).rows.filter(function (r) { return r.pop; }).map(rowHtml).join('');
          tbody.removeAttribute('aria-busy');
          rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
          render(false);
          syncOpenNote();
        };
        if (window.dmCrossfade && animate !== false) dmCrossfade(tbody, swap); else swap();
      }
      /* PRD 01 M65, W3: sources open to everyone are left out (without audit logs), with a count and SHOW THEM. */
      function syncOpenNote() {
        var note = document.getElementById('dmOpenNote');
        var open = window.dmNoAudit ? window.DM_ALL_SOURCES.rows.filter(function (r) { return r.openToEveryone && dmInPopulation(dmById(r.id)); }) : [];
        note.hidden = !open.length;
        if (!open.length) return;
        note.innerHTML = window.dmShowOpen
          ? esc(open.length + (open.length === 1 ? ' source open to everyone is shown' : ' sources open to everyone are shown')) + ' (marked Open To Everyone). <button type="button" class="btn btn-tertiary btn-sm" data-dm-show-open="0">Leave Them Out</button>'
          : esc(open.length + (open.length === 1 ? ' source open to everyone was left out.' : ' sources open to everyone were left out.')) + ' <button type="button" class="btn btn-tertiary btn-sm" data-dm-show-open="1">Show Them</button>';
      }
      document.getElementById('dmOpenNote').addEventListener('click', function (e) {
        var b = e.target.closest('[data-dm-show-open]'); if (!b) return;
        window.dmShowOpen = b.getAttribute('data-dm-show-open') === '1';
        if (window.dmRenderTotals) window.dmRenderTotals();
      });
      function setScope(scope) {
        state.scope = scope;
        if (scopeLabel) scopeLabel.textContent = (scope === 'all') ? 'All Sources' : 'Top Sources';
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
          if (state.card === 'noactivity') { if (r.getAttribute('data-dm-quiet') !== 'true') return false; }
          else if (state.card && (src !== state.card || r.getAttribute('data-dm-quiet') === 'true')) return false;
          return state.found === 'all' || r.getAttribute('data-dm-found') === state.found;
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
         clicking an already-excluded row restores it. A whole-source entry
         SUPERSEDES any per-location entries that source already had. Demo
         (PRD 01 M80, AC4): the entry records who and when; (M5, A25) the
         counts everywhere drop it. ══════════════════════════════════════════ */
      function srcNameOf(row) {
        var a = row.querySelector('.dm-source-name');
        return a ? a.textContent.trim() : null;
      }
      function xidOf(row) { return row.getAttribute('data-dm-xid'); }
      function itemsOf(row) {
        var r = window.DM_ALL_SOURCES.rows.filter(function (x) { return x.id === xidOf(row); })[0];
        return r ? r.itemsText : '0';
      }
      function wholeEntry(row) {
        var st = dmStamp();
        var r = window.DM_ALL_SOURCES.rows.filter(function (x) { return x.id === xidOf(row); })[0];
        return { path: '— entire source', whole: true, items: itemsOf(row), sid: xidOf(row),
                 name: r ? r.name : srcNameOf(row), unit: 'source', units: 'sources', metric: 'items', by: st.by, at: st.at };
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
        if (!btn || btn.disabled) return;
        var row = btn.closest('tr');
        var name = srcNameOf(row);
        var xid = xidOf(row);
        if (!name || !xid) return;
        var entry = isWholeExcluded(xid) ? [] : [wholeEntry(row)];
        btn.disabled = true;
        dmRun('applyExclusions', [name, entry],
              entry.length ? 'Exclusions applied successfully.' : 'Source restored to scope.',
              'The exclusions could not be applied.', function () {
          if (entry.length) window.DM_EXCLUSIONS[xid] = entry;   // supersedes locations
          else delete window.DM_EXCLUSIONS[xid];
          if (window.dmSyncExclusions) window.dmSyncExclusions();
          if (window.dmRecount) window.dmRecount();
          syncExclCells();
        }).then(function () { btn.disabled = false; });
      });

      // Public API used by the Edit Filters and Totals flows.
      window.dmTable = {
        /** Kept for production callers: Source Types is now one of the population's filters (M5). */
        setSourceFilter: function (arr) {
          window.dmFilters.types = (arr && arr.length) ? arr.slice() : null;
          window.dmTypeFilter = window.dmFilters.types;
          if (window.dmRenderTotals) window.dmRenderTotals();
        },
        setScope: setScope,
        /** Demo: rebuild the rows from DM_ALL_SOURCES (window / date range / filter change). */
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
      window.dmClearSourceFilter = clearCard; // a card leaving the filter clears the card filter

      // PRD 01 M34 (held, F11): the Found through filter — All and the six values (M31).
      var foundSel = document.getElementById('dmFoundFilter');
      foundSel.innerHTML = [['all', 'All']].concat(DM_FOUND.map(function (f) { return [f, f]; }))
        .map(function (o, i) { return '<option value="' + esc(o[0]) + '"' + (i ? '' : ' selected') + '>' + esc(o[1]) + '</option>'; }).join('');
      function onFound() { state.found = foundSel.value; render(); }
      foundSel.addEventListener('change', onFound);
      foundSel.addEventListener('valueChanged.cnds.select', onFound);
      dmWhenNimbus(function () { if (window.Nimbus && Nimbus.Select) { try { var si = Nimbus.Select.getOrCreateInstance(foundSel); si._renderOptions(); si.setValue(['all']); } catch (e) {} } });

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
    // DM_TOTALS models the eventual API payload: one entry per window. Demo: built by the adapter (dmBuild) from
    // M.dataMap for the active window, date range, filters and exclusions (PRD 01 M5), with the sixth card (F10, held).
    // This flow also switches the page between the data map and its without-audit-logs form (7.2, held F20).
    (function () {
      var group = document.getElementById('dmWindowToggle');
      var summaryEl = document.getElementById('dmSummary');
      var cards = document.querySelectorAll('#dmStatGrid .dm-stat');
      if (!group || !summaryEl || !cards.length) return;

      var statGrid = document.getElementById('dmStatGrid');
      var originGrid = document.getElementById('dmOriginGrid');
      var caption = document.getElementById('dmCardCaption');
      var asOfWrap = document.getElementById('dmAsOfWrap'), asOfSel = document.getElementById('dmAsOf');
      var gapEl = document.getElementById('dmEvidenceGap');
      var reported = document.getElementById('dmReported');
      // PRD 01 W5 (held): the banner reads the PRD 02 queue's count.
      document.getElementById('dmReportedText').innerHTML = '<b>' + M.reportedLocationsAwaiting + ' locations reported by custodians are awaiting review.</b> Review these locations to add them to the data map.';
      reported.hidden = !M.reportedLocationsAwaiting;

      function setCards() {
        var data = window.DM_TOTALS[window.dmWindow];
        var types = window.dmFilters.types;
        cards.forEach(function (card, i) {
          var k = card.getAttribute('data-dm-source'), count = card.querySelector('.dm-stat-count b');
          var meta = card.querySelectorAll('.dm-stat-meta > span:not(.dm-meta-divider)');
          if (k === 'noactivity') {
            count.textContent = data.noActivity.sources;
            meta[0].textContent = data.noActivity.items;
          } else {
            var row = data.sources[i]; if (!row) return;
            count.textContent = row.items; meta[0].textContent = row.sources; meta[1].textContent = row.ual;
          }
          // PRD 01 M5c: a card whose type Source Types excludes carries NOT IN FILTER. The sixth card covers every
          // type the audit log does not report, so it is out only when none of those types is in the filter.
          var out = !!types && (k === 'noactivity' ? !types.some(function (t) { return DM_CARD_TYPES.indexOf(t) === -1; }) : types.indexOf(k) === -1);
          card.classList.toggle('dm-not-in-filter', out);
          card.setAttribute('aria-disabled', String(out));
          card.tabIndex = out ? -1 : 0;
          if (out && card.classList.contains('dm-selected') && window.dmClearSourceFilter) window.dmClearSourceFilter();
        });
        statGrid.removeAttribute('aria-busy');
      }
      /* 7.2 (held): without audit logs the cards count sources by origin (M62). */
      function setOrigins() {
        var o = dmNoAuditOrigins();
        var tiles = [['Standard Sources', o.std, 'Mailbox, OneDrive, Copilot'], ['From Permissions', o.perm, 'Sites and teams · tenant-wide access left out'],
                     ['From Asset Import', o.asset, 'No asset import on this case'], ['From Sources', o.sources, 'Chosen from the tenant catalog'], ['From Survey Answers', o.survey, 'Named by custodians']];
        originGrid.innerHTML = tiles.map(function (t) {
          return '<div class="dm-people-stat"><span class="dm-people-stat-label">' + dmEsc(t[0].toUpperCase()) + '</span><span class="dm-people-stat-value">' + t[1] +
            '</span><small class="text-muted">' + dmEsc(t[2]) + '</small></div>';
        }).join('');
      }
      function setVariant() {
        var na = !!window.dmNoAudit;
        group.hidden = na; asOfWrap.hidden = !na;
        statGrid.hidden = na; caption.hidden = na; originGrid.hidden = !na;
        // M60, M64, W1: the evidence gap, rendered the evidence-gap way (a neutral tag), not as a coverage gap.
        gapEl.hidden = !na;
        if (na) gapEl.innerHTML = '<span class="badge badge-secondary dm-gap-tag">Evidence Gap</span> The case window starts ' + dmEsc(M.fmtDate(M.window.start)) +
          '. The earliest permission snapshot is ' + dmEsc(M.fmtDate(DMS.snapshots.earliest)) + ', so access before then can\'t be seen.' +
          (window.dmRange ? ' This date range ends before ' + dmEsc(M.fmtDate(M.tenant.auditLog.indexedFrom)) + ', when CaseFusion began indexing the unified audit log, so there is no activity data for it.' : '');
        if (na && !asOfSel.options.length) {
          // 7.2: Latest snapshot · Earliest snapshot · Case window end · Case created · Custom date…
          var opts = DMS.asOfOptions().filter(function (o) { return o[0] !== M.window.start && o[0] !== 'custom'; });
          asOfSel.innerHTML = opts.map(function (o, i) { return '<option value="' + o[0] + '"' + (i ? '' : ' selected') + '>' + dmEsc(o[1]) + '</option>'; }).join('');
          window.dmAsOf = opts[0][0];
          if (window.Nimbus && Nimbus.Select) { try { var si = Nimbus.Select.getOrCreateInstance(asOfSel); si._renderOptions(); si.setValue([window.dmAsOf]); } catch (e) {} }
        }
      }
      function onAsOf() { if (asOfSel.value && asOfSel.value !== window.dmAsOf) { window.dmAsOf = asOfSel.value; render(window.dmWindow); } }
      asOfSel.addEventListener('change', onAsOf);
      asOfSel.addEventListener('valueChanged.cnds.select', onAsOf);

      function render(key, animate) {
        window.dmWindow = key;
        // Demo: rebuild every derived array for the new window (and any date
        // range, filter or variant), so the sources table, people table and drawers recount too —
        // production's toggle left the sources table unchanged.
        dmBuild(key, window.dmRange);
        if (window.dmRefreshExclusionCounts) window.dmRefreshExclusionCounts();
        dmRecountTotals();
        setVariant();
        var setSummary = function () { summaryEl.innerHTML = dmSummaryHtml(); summaryEl.removeAttribute('aria-busy'); };
        var setAll = function () { setCards(); if (window.dmNoAudit) setOrigins(); };
        if (window.dmCrossfade && animate !== false) {
          dmCrossfade(summaryEl, setSummary);
          dmCrossfade(statGrid, setAll);   // no-op fade while By People is showing
        } else { setSummary(); setAll(); }
        if (window.dmTable && dmTable.rebuild) dmTable.rebuild(animate);
        if (window.dmRenderPeople) window.dmRenderPeople(key);
        dmRenderNotable();
      }
      /** Counts only (an exclusion changed): cards, summary, By People, notables — no table rebuild (PRD 01 M5, A25). */
      window.dmRecount = function () {
        dmRecountTotals();
        window.DM_PEOPLE[window.dmWindow] = dmBuildPeople();
        setCards(); if (window.dmNoAudit) setOrigins();
        summaryEl.innerHTML = dmSummaryHtml();
        if (window.dmRenderPeople) window.dmRenderPeople(window.dmWindow);
        dmRenderNotable();
      };
      window.dmRenderTotals = function () { render(window.dmWindow || 'caseWindow'); };
      window.dmRenderSummary = function () { summaryEl.innerHTML = dmSummaryHtml(); };
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

    /* ══ EDIT FILTERS (PRD 01 M5, M5a, AC3) ═══════════════════════════════════
       Three checkbox menus open at once, side by side: Custodians (with search),
       Source Types and Custodian Tags, each headed by an All row with a count.
       A tick applies at once and narrows the whole map (one population); the
       chips restate the filters. Production had three closed multi-selects and
       APPLY FILTERS, and Custodians / Tags narrowed only the By people table. ══ */
    (function () {
      var F = window.DM_EDIT_FILTERS;
      var LISTS = {
        custodians: { el: document.getElementById('dmFltCust'), all: 'All Custodians', opts: function () { return F.custodians; } },
        types:      { el: document.getElementById('dmFltType'), all: 'All Source Types', opts: function () { return F.sourceTypes; } },
        tags:       { el: document.getElementById('dmFltTag'),  all: 'All Custodian Tags', opts: function () { return F.custodianTags; } }
      };
      var chips = { custodians: document.getElementById('dmChipCustodians'), types: document.getElementById('dmChipSourceTypes'), tags: document.getElementById('dmChipTags') };
      var search = document.getElementById('dmFltCustSearch');
      var q = '';

      function renderList(key) {
        var L = LISTS[key], sel = window.dmFilters[key], opts = L.opts();
        var shown = key === 'custodians' && q ? opts.filter(function (o) { return (o.label + ' ' + o.secondary).toLowerCase().indexOf(q) !== -1; }) : opts;
        var id = function (v) { return 'dmFlt-' + key + '-' + String(v).replace(/[^\w-]/g, ''); };
        /* Nimbus: list-group items holding the Nimbus checkbox (.form-check), its secondary line the checkbox's own
           helper text (.form-text), the count .fw-normal.text-muted (were .dm-check-all/-count/-sub/-none). */
        L.el.innerHTML = '<li class="list-group-item px-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="' + id('all') + '" data-dm-all="' + key + '"' + (sel ? '' : ' checked') + ' />' +
            '<label class="form-check-label" for="' + id('all') + '">' + L.all + ' <span class="fw-normal text-muted">(' + opts.length + ')</span></label></div></li>' +
          shown.map(function (o) {
            return '<li class="list-group-item px-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="' + id(o.value) + '" data-dm-opt="' + key + '" value="' + dmEsc(o.value) + '"' +
              (sel && sel.indexOf(o.value) !== -1 ? ' checked' : '') + ' />' +
              '<label class="form-check-label" for="' + id(o.value) + '">' + (o.masked ? dmMaskedHtml() : dmEsc(o.label)) + '</label>' +
              (o.secondary ? '<div class="form-text mt-0">' + dmEsc(o.secondary) + '</div>' : '') + '</div></li>';
          }).join('') +
          (shown.length ? '' : '<li class="list-group-item px-2 text-muted">No custodian matches the search.</li>');
      }
      function setChips() {
        var f = window.dmFilters;
        chips.custodians.textContent = 'Custodians: ' + (f.custodians ? f.custodians.length + ' selected' : 'All');
        chips.types.textContent = 'Source Types: ' + (f.types ? f.types.length + ' selected' : 'All');
        // PRD 01 6.1, 7.1: "Custodian Tags: 0 Applied" / "1 Applied".
        chips.tags.textContent = 'Custodian Tags: ' + (f.tags ? f.tags.length : 0) + ' Applied';
        var any = !!(f.custodians || f.types || f.tags);
        var clr = document.getElementById('dmClearFilters');
        clr.disabled = !any;
        document.getElementById('dmClearFiltersWrap').title = any ? '' : 'No filter is applied.';
      }
      function renderAll() { Object.keys(LISTS).forEach(renderList); setChips(); }
      window.dmRenderFilterLists = renderAll;
      window.dmSyncFilterUI = renderAll;
      renderAll();

      function apply() { setChips(); window.dmTypeFilter = window.dmFilters.types; if (window.dmRenderTotals) window.dmRenderTotals(); }
      document.getElementById('dmEditFilters').addEventListener('change', function (e) {
        var t = e.target;
        if (t.hasAttribute('data-dm-all')) {
          window.dmFilters[t.getAttribute('data-dm-all')] = null;
          renderList(t.getAttribute('data-dm-all'));
        } else if (t.hasAttribute('data-dm-opt')) {
          var key = t.getAttribute('data-dm-opt'), cur = (window.dmFilters[key] || []).slice(), i = cur.indexOf(t.value);
          if (t.checked && i === -1) cur.push(t.value); else if (!t.checked && i !== -1) cur.splice(i, 1);
          // Ticking every option is the same as All.
          window.dmFilters[key] = cur.length && cur.length < LISTS[key].opts().length ? cur : null;
          renderList(key);
          var again = document.getElementById(t.id); if (again) again.focus();
        } else return;
        apply();
      });
      search.addEventListener('input', function () { q = search.value.trim().toLowerCase(); renderList('custodians'); });
      document.getElementById('dmClearFilters').addEventListener('click', function () {
        window.dmFilters = { custodians: null, types: null, tags: null };
        search.value = ''; q = '';
        renderAll(); apply();
      });
      window.dmClearAllFilters = function () {
        document.getElementById('dmClearFilters').click();
        if (window.dmClearSourceFilter) window.dmClearSourceFilter();
        if (window.dmClearDateRange) window.dmClearDateRange();
      };

      /* PRD 01 7.6: the three doors carry the case (and nothing else the PRD names). */
      var cq = /[?&]case=([\w-]+)/.exec(location.search), cs = cq ? cq[1] : null;
      if (cs) {
        /* Both ADD SOURCE menus (Top Sources and Custodians card heads) carry the case. */
        var doors = { m365: 'case-add-sources.html?door=m365&case=', sources: 'case-add-noncustodial-source.html?case=', custodians: 'case-add-custodian-source.html?case=' };
        Array.prototype.forEach.call(document.querySelectorAll('[data-dm-door]'), function (a) { a.href = doors[a.getAttribute('data-dm-door')] + encodeURIComponent(cs); });
      }
      /* Sources just added through a door (the doors' hand-back): say so once. */
      var fresh = (window.DM_ALL_SOURCES.rows || []).filter(function (r) { return r.added; });
      if (fresh.length && dmDoorSources[0]) {
        var by = dmDoorSources[0].addedBy;
        setTimeout(function () {
          dmToast('success', 'Success', fresh.length + (fresh.length === 1 ? ' source was' : ' sources were') + ' added to this case' + (by ? ' by ' + dmEsc(dmPersonText(by)) : '') +
            '. They show as Added · Pending until CaseFusion reads them; nothing is preserved until a request includes them.');
        }, 400);
      }
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
      dmSeedScopeSources();
      dmRenderNotable();
      dmStart();
      Array.prototype.forEach.call(document.querySelectorAll(".dm-main, .dm-main [aria-busy]"), function (el) { el.removeAttribute("aria-busy"); });
    });
  }
}());
