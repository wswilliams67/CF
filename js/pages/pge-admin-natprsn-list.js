/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-list.js
 * Screen:  Admin › Natural Persons (list)
 * Page:    pages/pge-admin-natprsn-list.html
 * Figma:   CaseFusion v1.5 — Tenant Manager, node 11204:14901
 *
 * WHAT THIS FILE OWNS
 * ───────────────────
 * The list behaviour only: search, sort, paging, card rendering, and the two
 * navigations this build is actually about —
 *
 *   • PENDING MATCH QUEUE (toolbar)  → the tenant-wide candidate queue
 *   • IDENTITIES (per person card)   → that person's identity assembly
 *
 * Frame chrome (header, sidenav, theme, notifications) is NOT here — it lives
 * in js/pages/frame-ca-sidenav.js and is shared by every 1.6 page.
 *
 * LOAD ORDER
 *     js/nimbus.js → js/app.js → js/pages/frame-ca-sidenav.js
 *     → pge-admin-natprsn-list.data.js (the API seam) → THIS FILE
 *
 * Plain ES5 in an IIFE, no build step. Nimbus components load ASYNCHRONOUSLY,
 * so anything touching a component class (Nimbus.Select, Nimbus.Toast, …) runs
 * inside the `cnds.ready` listener or an event handler — never at parse time.
 *
 * SECTIONS
 *   0 · Constants & helpers
 *   1 · Demo data              MOCK — replace with the API response
 *   2 · View state             + restore/persist for "back returns here"
 *   3 · (moved)                filter/sort/page now live behind the service
 *   4 · Rendering              cards, skeleton, toolbar counts, pager
 *   5 · Navigation             candidate queue + identities  ← the focus
 *   6 · Wiring                 toolbar, pager, card action delegation
 *
 * ANGULAR MIGRATION — top-level map (per-section notes inline)
 * ───────────────────────────────────────────────────────────
 *   This IIFE              → NaturalPersonListComponent
 *   §1 (moved)             → pge-admin-natprsn-list.data.js — the rows and the
 *                            query engine now sit behind a promise, the same
 *                            seam every other 1.6 screen uses
 *   §2 view state          → a component-level signal/BehaviorSubject; the
 *                            sessionStorage restore becomes route queryParams
 *                            so the state is shareable and survives a reload
 *   §3 (moved)             → server-side; the client sends {q, sort, dir, page, size}
 *   §4 renderCards()       → *ngFor over persons with PersonCardComponent
 *   §5 navigation          → routerLink / Router.navigate
 *   §6 delegated listeners → (click) bindings + @Output() on PersonCardComponent
 * ========================================================================= */

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════════
     0 · CONSTANTS & HELPERS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Sibling screens in the Natural Persons family. Relative filenames because
   * the portable design system is served from a plain directory — no router,
   * no base href.
   *
   * ANGULAR: these become route paths on the admin feature module, e.g.
   *   { path: 'natural-persons',                 component: NaturalPersonListComponent }
   *   { path: 'natural-persons/pending-match-queue', component: PendingMatchQueueComponent }
   *   { path: 'natural-persons/:id/identities',  component: IdentitiesComponent }
   */
  var ROUTES = {
    /* Work item #17515 — tenant-wide candidate queue. */
    CANDIDATE_QUEUE: "pge-admin-natprsn-pndmtchque.html",
    /* Work item #17475 — one person's assembled identity. */
    IDENTITIES: "pge-admin-natprsn-identities.html"
  };

  /**
   * sessionStorage key for the list's view state.
   *
   * The IDENTITIES annotation requires that returning from a child screen puts
   * this list back exactly as it was — page, sort AND scroll. sessionStorage
   * (not localStorage) because that is per-tab and dies with the session: a
   * fresh tab should open a fresh list, not resurrect last week's filter.
   *
   * ANGULAR: replace with queryParams on the list route. The child screen's
   * back control then navigates with the same params and nothing is stored.
   */
  var STATE_KEY = "cf16.natprsn.list.state";

  /** Debounce for the search box, in ms. */
  var SEARCH_DEBOUNCE = 200;

  var byId = document.getElementById.bind(document);

  /** Locale-formatted integer, e.g. 5313 → "5,313". */
  function formatCount(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /** Initials for the monogram avatar: first letter of the first two words. */
  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    var a = parts[0] ? parts[0].charAt(0) : "";
    var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }

  /**
   * Escape a value for interpolation into innerHTML.
   *
   * Person records are user-authored and arrive from an API, so every one of
   * them is untrusted: a display name containing "<img onerror=…>" must render
   * as text. Anything interpolated below goes through here.
   */
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Format an ISO date (yyyy-mm-dd) as mm-dd-yyyy.
   * CaseFusion never shows a user an ISO date — house rule, applies to every
   * user-facing date on every screen.
   */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? m[2] + "-" + m[3] + "-" + m[1] : "";
  }

  /**
   * Gender as displayed. When the record says OTHER, the free-text value the
   * user typed in SPECIFY GENDER wins; with nothing typed, fall back to the
   * literal "Other". (Figma annotation on node ...;11203:16885.)
   */
  function displayGender(person) {
    if (String(person.gender).toUpperCase() !== "OTHER") return person.gender;
    return person.genderSpecify ? person.genderSpecify : "Other";
  }

  /**
   * Listen for a value change on a Nimbus-enhanced <select>.
   *
   * Nimbus/Select hides the native element and drives its own dropdown UI; it
   * emits `valueChanged.cnds.select` and does NOT re-emit a native `change`.
   * Both are bound so the handler works whether or not Nimbus has upgraded the
   * element yet (keyboard use of the native control still fires `change`).
   *
   * ANGULAR: one (valueChange) binding on NimbusSelectComponent.
   */
  function onSelectChange(el, handler) {
    if (!el) return;
    el.addEventListener("change", handler);
    el.addEventListener("valueChanged.cnds.select", handler);
  }

  /**
   * Set a <select>'s value programmatically.
   *
   * Assigning .value alone updates the hidden native element but leaves the
   * Nimbus trigger showing the old label, so go through the component instance
   * when one exists.
   */
  function setSelectValue(el, value) {
    if (!el) return;
    var inst = window.Nimbus && window.Nimbus.Select &&
               window.Nimbus.Select.getInstance(el);
    if (inst) inst.setValue(String(value));
    else el.value = String(value);
  }

  /**
   * Nimbus/Toast, built on demand and removed once hidden — the same helper
   * shape pge_case_datamap.html uses, so the two pages behave identically.
   *
   * Used ONLY to acknowledge the actions this build deliberately leaves
   * unwired (see §6). Nothing on the happy path depends on it, so it is a
   * silent no-op if Nimbus has not finished loading.
   *
   * ANGULAR: NotificationService.info(message).
   */
  function toast(message) {
    if (!(window.Nimbus && window.Nimbus.Toast)) return;

    var host = document.createElement("div");
    host.className = "toast fade";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    host.setAttribute("data-cnds-toast-init", "");
    host.setAttribute("data-cnds-color", "info");
    host.setAttribute("data-cnds-position", "bottom-right");
    host.setAttribute("data-cnds-append-to-body", "true");
    host.setAttribute("data-cnds-stacking", "true");
    host.setAttribute("data-cnds-width", "360px");
    host.setAttribute("data-cnds-autohide", "true");
    host.setAttribute("data-cnds-delay", "3500");
    host.innerHTML =
      '<div class="toast-header">' +
        '<i class="mdi mdi-information me-2" aria-hidden="true"></i>' +
        '<strong class="me-auto">Natural Persons</strong>' +
        '<button type="button" class="btn-close" data-cnds-dismiss="toast" aria-label="Close"></button>' +
      "</div>" +
      '<div class="toast-body"></div>';

    /* textContent, not innerHTML — the message is authored here today, but a
       stub that ever grows a record value into it must not become an injection. */
    host.querySelector(".toast-body").textContent = message;

    document.body.appendChild(host);
    host.addEventListener("hidden.cnds.toast", function () { host.remove(); });
    window.Nimbus.Toast.getOrCreateInstance(host).show();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2 · VIEW STATE
     ═══════════════════════════════════════════════════════════════════════ */

  var state = {
    query: "",
    sort: "name",     /* name | employeeId | dateOfBirth | location */
    dir: "asc",       /* asc | desc */
    page: 1,          /* 1-based */
    pageSize: 10,     /* CaseFusion pagers default to 10, never 100 */
    scrollY: 0
  };

  /**
   * Restore the state a child screen left behind, then clear it so a later
   * fresh visit to this page starts clean. Scroll is restored after the first
   * render, in init().
   */
  function restoreState() {
    var raw;
    try { raw = window.sessionStorage.getItem(STATE_KEY); } catch (e) { return; }
    if (!raw) return;
    try { window.sessionStorage.removeItem(STATE_KEY); } catch (e) { /* private mode */ }

    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return; }
    if (!saved || typeof saved !== "object") return;

    /* Whitelist, don't merge — sessionStorage is writable by anything running
       on this origin, and an unknown key would silently join the state. */
    if (typeof saved.query === "string") state.query = saved.query;
    if (typeof saved.sort === "string") state.sort = saved.sort;
    if (saved.dir === "asc" || saved.dir === "desc") state.dir = saved.dir;
    if (typeof saved.page === "number" && saved.page > 0) state.page = saved.page;
    if (typeof saved.pageSize === "number" && saved.pageSize > 0) state.pageSize = saved.pageSize;
    if (typeof saved.scrollY === "number") state.scrollY = saved.scrollY;
  }

  /**
   * Persist the state before leaving for a child screen, so its Back control
   * returns this list to exactly where the user left it.
   */
  function persistState() {
    state.scrollY = window.scrollY || 0;
    try {
      window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      /* Storage disabled or full. The navigation still has to happen; the user
         loses the restored scroll position, nothing more. */
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4 · RENDERING

     ANGULAR: cardHtml() becomes PersonCardComponent's template — the whole
     string-building layer disappears, and with it the need for esc().
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * One "Label: value" line in the metadata column.
   * @param {string} label  static, authored here
   * @param {string} value  from the record — escaped
   */
  function metaLine(label, value) {
    return '<p class="np-meta-line">' +
             '<span class="np-label">' + label + ':</span> ' +
             '<span class="np-value">' + esc(value) + "</span>" +
           "</p>";
  }

  /**
   * One email or phone line. A primary entry gets the star from the design
   * PLUS a visually-hidden "(primary)" — the star alone is colour-and-shape
   * only, which is not an accessible name.
   */
  function contactLine(entry) {
    if (!entry.primary) {
      return '<p class="np-contact-item np-value">' + esc(entry.value) + "</p>";
    }
    return '<p class="np-contact-item np-value">' +
             esc(entry.value) +
             '<i class="mdi mdi-star np-primary-star" aria-hidden="true"></i>' +
             '<span class="visually-hidden">(primary)</span>' +
           "</p>";
  }

  /**
   * A card action.
   *
   * data-np-action is what §6's delegated listener reads; data-np-id names the
   * record it applies to. Every card in the list shows the same four labels, so
   * each control also gets an aria-label naming the person — otherwise a
   * screen-reader user hears "Edit" forty times with nothing to tell them apart.
   *
   * @param {string} action  identifier read by the delegated click handler
   * @param {string} label   visible text — authored here, never from a record
   * @param {NaturalPerson} person
   * @param {string} [href]  present ⇒ render an <a>, because the control is a
   *                         navigation and must offer open-in-new-tab
   */
  function actionButton(action, label, person, href) {
    var attrs =
      'class="btn btn-tertiary btn-sm" ' +
      'data-np-action="' + action + '" ' +
      'data-np-id="' + esc(person.id) + '" ' +
      'aria-label="' + esc(label + " — " + person.displayName) + '"';

    return href
      ? "<a " + attrs + ' href="' + esc(href) + '">' + label + "</a>"
      : "<button type=\"button\" " + attrs + ">" + label + "</button>";
  }

  /** Destination for one person's Identities screen. */
  function identitiesHref(person) {
    return ROUTES.IDENTITIES + "?personId=" + encodeURIComponent(person.id);
  }

  /** @param {NaturalPerson} person */
  function cardHtml(person) {
    var rule = '<span class="vr vr-blurry np-rule" aria-hidden="true"></span>';

    return '<article class="card np-card" data-np-id="' + esc(person.id) + '">' +
      '<div class="np-card-body">' +

        /* ── Column 1 · identity ─────────────────────────────────────────── */
        '<div class="np-col-identity">' +
          '<span class="np-avatar" aria-hidden="true">' + esc(initials(person.displayName)) + "</span>" +
          '<div class="np-identity-text">' +
            /* h2: the card is an <article>, so its name is a heading, and the
               page title above it is the h1. */
            '<h2 class="np-name">' + esc(person.displayName) + "</h2>" +
            '<p class="np-legal-name">' +
              esc([person.firstName, person.middleName, person.lastName]
                    .filter(Boolean).join(" ")) +
            "</p>" +
          "</div>" +
        "</div>" +

        rule +

        /* ── Column 2 · metadata ─────────────────────────────────────────── */
        '<div class="np-col-meta">' +
          metaLine("Employee ID", person.employeeId) +
          metaLine("Date of Birth", formatDate(person.dateOfBirth)) +
          metaLine("Gender", displayGender(person)) +
          metaLine("Location", person.location) +
        "</div>" +

        rule +

        /* ── Column 3 · contact ──────────────────────────────────────────── */
        '<div class="np-col-contact">' +
          '<div class="np-contact-group">' +
            '<p class="np-label">Email Addresses:</p>' +
            person.emails.map(contactLine).join("") +
          "</div>" +
          '<div class="np-contact-group">' +
            '<p class="np-label">Phone Numbers:</p>' +
            person.phones.map(contactLine).join("") +
          "</div>" +
        "</div>" +

        rule +

        /* ── Column 4 · actions ──────────────────────────────────────────────
           Ordered by impact on the record: read-only first, destructive last.
           VIEW PROFILE and IDENTITIES are deliberately separate destinations —
           the profile shows the authored person (the values summarised on this
           card), Identities shows how that person was assembled. Different
           question, different screen. (Figma annotation, node ...;12956:14308.) */
        '<div class="np-col-actions">' +
          actionButton("view-profile", "View Profile", person) +
          actionButton("identities", "Identities", person, identitiesHref(person)) +
          actionButton("edit", "Edit", person) +
          actionButton("delete", "Delete", person) +
        "</div>" +

      "</div>" +
    "</article>";
  }

  var elList  = byId("npList");
  var elTotal = byId("npTotal");
  var elRange = byId("npPagerRange");

  function renderCards(view) {
    if (!elList) return;

    if (!view.rows.length) {
      /* State is stated in words. Records are never dimmed to convey state. */
      elList.innerHTML =
        '<div class="np-empty">' +
          '<i class="mdi mdi-account-search-outline np-empty-icon" aria-hidden="true"></i>' +
          '<p class="np-empty-title">No natural persons match this search</p>' +
          '<p class="np-empty-note">Clear the search to see every natural person in this tenant.</p>' +
        "</div>";
      return;
    }

    elList.innerHTML = view.rows.map(cardHtml).join("");
  }

  function renderCounts(view) {
    if (elTotal) elTotal.textContent = "Total Persons: " + formatCount(view.total);

    if (elRange) {
      if (!view.total) {
        elRange.textContent = "0 of 0";
      } else {
        var start = (state.page - 1) * state.pageSize + 1;
        var end = Math.min(view.total, start + state.pageSize - 1);
        elRange.textContent = formatCount(start) + "-" + formatCount(end) +
                              " of " + formatCount(view.total);
      }
    }
  }

  function renderPager(view) {
    var atFirst = state.page <= 1;
    var atLast  = state.page >= view.pageCount;

    setDisabled("npPageFirst", atFirst);
    setDisabled("npPagePrev", atFirst);
    setDisabled("npPageNext", atLast);
    setDisabled("npPageLast", atLast);
  }

  function setDisabled(id, disabled) {
    var node = byId(id);
    if (node) node.disabled = disabled;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SKELETON

     Nimbus owns every class here — .skeleton, .skeleton-text, .skeleton-rect,
     .skeleton-list and the .skeleton-w-* widths (css/components/loading.css).
     Only the CARD GEOMETRY is ours, and it lives in the page stylesheet.

     The shape is the point. A skeleton beats a spinner only by holding the
     shape of what is coming: a full page of cards, in the real card's three
     columns, so nothing moves when the rows land.

     ANGULAR: this is markup, not logic. A <cf-skeleton-card> repeated
     pageSize times behind an @if (loading()), with the same 250ms delay.
     ═══════════════════════════════════════════════════════════════════════ */

  /** How long a query may run before it is worth saying so. */
  var SKELETON_DELAY_MS = 250;

  function skelText(extra) {
    return '<div class="skeleton skeleton-text' + (extra ? " " + extra : "") + '"></div>';
  }

  /**
   * One placeholder card per row the page is about to hold. The count is
   * information — a short placeholder moves everything below it on arrival.
   */
  function skeletonCards(host, count) {
    var rule = '<span class="vr vr-blurry np-rule" aria-hidden="true"></span>';
    var card =
      '<article class="card np-card np-skeleton-card" aria-hidden="true">' +
        '<div class="np-card-body">' +
          '<div class="np-col-identity">' +
            '<div class="skeleton skeleton-circle np-skeleton-avatar"></div>' +
            '<div class="skeleton-group np-skeleton-identity">' +
              skelText("skeleton-w-75") + skelText("skeleton-w-50") +
            "</div>" +
          "</div>" + rule +
          '<div class="skeleton-group np-col-meta">' +
            skelText("skeleton-w-66") + skelText("skeleton-w-50") +
            skelText("skeleton-w-33") + skelText("skeleton-w-75") +
          "</div>" + rule +
          '<div class="skeleton-group np-col-contact">' +
            skelText("skeleton-w-50") + skelText("skeleton-w-100") +
            skelText("skeleton-w-50") + skelText("skeleton-w-75") +
          "</div>" + rule +
          /* The fourth column is what actually sets the card's height: FOUR
             36px tertiary buttons, stacked with no gap — 4 × 36 = the 144px
             content box every other column is then stretched to. Omitting it
             cost 40px a card, 400px over a page, which is precisely the jump
             a skeleton exists to prevent. Measured, not assumed. */
          '<div class="np-col-actions np-skeleton-actions">' +
            '<div class="skeleton skeleton-rect np-skeleton-btn"></div>' +
            '<div class="skeleton skeleton-rect np-skeleton-btn"></div>' +
            '<div class="skeleton skeleton-rect np-skeleton-btn"></div>' +
            '<div class="skeleton skeleton-rect np-skeleton-btn"></div>' +
          "</div>" +
        "</div>" +
      "</article>";

    host.innerHTML = new Array(Math.max(1, count) + 1).join(card);
  }

  /**
   * Show the skeleton only if the wait is long enough to notice, and never
   * over rows that are still accurate — a 120ms response would just strobe,
   * and on a debounced search it would strobe on every keystroke.
   *
   * Returns the cancel the caller runs when the response lands.
   */
  function holdSkeleton(host, count) {
    var timer = setTimeout(function () {
      host.setAttribute("aria-busy", "true");
      skeletonCards(host, count);
    }, SKELETON_DELAY_MS);
    return function cancel() { clearTimeout(timer); };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     THE ONE RENDER ENTRY POINT. Every state change ends here.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * The last page the service returned. Paging controls need pageCount before
   * they can pick a target, and asking the service twice for one click would
   * double the latency — so the clamp reads the page already on screen.
   */
  var lastView = { rows: [], total: 0, pageCount: 1, page: 1 };

  /**
   * Guards against out-of-order responses. Typing in the search box fires a
   * request per debounce window; without this, a slow early response can land
   * after a fast later one and repaint the list with stale rows.
   */
  var renderSeq = 0;

  function render() {
    var seq = ++renderSeq;
    var release = elList ? holdSkeleton(elList, state.pageSize) : function () {};

    return window.CaseFusion.NaturalPersonService.list({
      query: state.query, sort: state.sort, dir: state.dir,
      page: state.page, pageSize: state.pageSize
    }).then(function (view) {
      release();
      if (seq !== renderSeq) return lastView;   /* a newer request won */

      /* The service clamps the page — a filter can strand the user past the
         last one — so the state follows the response, not the other way. */
      state.page = view.page;
      lastView = view;

      if (elList) elList.removeAttribute("aria-busy");
      renderCards(view);
      renderCounts(view);
      renderPager(view);
      return view;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5 · NAVIGATION  —  the two controls this build is about

     Both leave the list, and both are expected to come back to it unchanged,
     so both persist the view state on the way out.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * PENDING MATCH QUEUE — toolbar.
   *
   * Opens the tenant-wide candidate queue: the backlog of candidate pairs the
   * matcher refused to merge automatically, across ALL natural persons. It is
   * NOT scoped to any person on this list and NOT filtered by the search box —
   * whatever is typed above, the queue opens whole.
   *
   * LABEL NOTE FOR DEVS: the Figma label reads "Pending match queue" while the
   * annotation and the work item call the destination the Candidate Queue.
   * The drawn label is used here verbatim; see pages-manifest.json — this is
   * one of the strings held for the product manager's glossary.
   *
   * ANGULAR: <a routerLink="/admin/natural-persons/pending-match-queue">.
   *
   * The handler does NOT preventDefault: the markup already carries the real
   * href, so letting the browser navigate keeps ctrl/cmd-click, middle-click
   * and "open in new tab" working. All this adds is the state snapshot, and a
   * click handler runs to completion before the navigation starts.
   */
  function goToCandidateQueue() {
    persistState();
  }

  /**
   * IDENTITIES — per person card.
   *
   * Opens this person's assembled identity: which source records were joined,
   * on what evidence, and which fields disagree between them. Separate from
   * VIEW PROFILE, which shows the authored person.
   *
   * ANGULAR: <a [routerLink]="['/admin/natural-persons', person.id, 'identities']">.
   *
   * Like the queue link above, the <a> carries the real href and this only
   * takes the snapshot — the browser does the navigating.
   */
  function goToIdentities() {
    persistState();
  }

  /**
   * Badge for the pending count. Zero pending pairs means no outstanding work,
   * so the badge is hidden rather than rendered as "0".
   */
  function renderPendingBadge(count) {
    var badge = byId("npQueueCount");
    if (!badge) return;

    if (!count) {
      badge.classList.add("np-badge-empty");
      badge.textContent = "";
      badge.removeAttribute("aria-label");
      return;
    }

    badge.classList.remove("np-badge-empty");
    badge.textContent = formatCount(count);
    badge.setAttribute("aria-label", formatCount(count) + " pending matches");
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6 · WIRING
     ═══════════════════════════════════════════════════════════════════════ */

  function wireToolbar() {
    var search = byId("npSearch");
    if (search) {
      var timer = null;
      search.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.query = search.value;
          state.page = 1;          /* a new filter always starts at page 1 */
          render();
        }, SEARCH_DEBOUNCE);
      });
    }

    var sort = byId("npSort");
    onSelectChange(sort, function () {
      state.sort = sort.value;
      state.page = 1;          /* a new sort always starts at page 1 */
      render();
    });

    var dirBtn = byId("npSortDir");
    if (dirBtn) {
      dirBtn.addEventListener("click", function () {
        state.dir = state.dir === "asc" ? "desc" : "asc";
        state.page = 1;          /* reversing a sort is a new sort — same rule
                                    as the field select above. Page 2 of ASC
                                    and page 2 of DSC share no rows, so staying
                                    put lands the user somewhere they never
                                    asked for and cannot navigate back to. */
        syncSortDirButton(dirBtn);
        render();
      });
    }

    var queueBtn = byId("npCandidateQueue");
    if (queueBtn) queueBtn.addEventListener("click", goToCandidateQueue);

    var newBtn = byId("npNewPerson");
    if (newBtn) {
      newBtn.addEventListener("click", function (event) {
        event.preventDefault();
        /* TODO(#natprsn-new): open the New Natural Person modal. Out of scope
           for this page — the create flow is its own build. */
        toast("New Natural Person — not wired in this build.");
      });
    }
  }

  /**
   * Elevation on the sticky content header.
   *
   * The shadow appears once the page has actually scrolled and is removed
   * again at scrollY 0: at the top there is nothing passing beneath the bar to
   * lift away from, so the shadow would be decoration rather than a signal.
   *
   * .np-header-elevated carries --cnds-shadow-sm's offset, blur and colour —
   * the setting the frame's utility header used to carry — trimmed to the
   * bottom edge only. That behaviour has been removed from the utility header
   * (frame-ca-sidenav.js §1): the elevation belongs to whichever bar is the
   * last one above the scrolling content, which on this screen is this one.
   *
   * A passive listener guarded on a state change, so the handler does no
   * classList work on the vast majority of scroll events. The CSS only adds
   * the transition.
   *
   * ANGULAR: @HostListener('window:scroll') on the header component (or a CDK
   * ScrollDispatcher subscription), bound as [class.np-header-elevated]="scrolled".
   */
  function wireHeaderElevation() {
    var header = byId("npHeader");
    if (!header) return;

    var scrolled = false;
    function sync() {
      var now = window.scrollY > 0;
      if (now === scrolled) return;
      scrolled = now;
      header.classList.toggle("np-header-elevated", now);
    }

    window.addEventListener("scroll", sync, { passive: true });
    /* Run once: a reload, or the scroll restore in init(), can land the page
       part-way down before any scroll event fires. */
    sync();
  }

  /** Keep the sort-direction button's glyph, label and a11y name in step. */
  function syncSortDirButton(btn) {
    var ascending = state.dir === "asc";
    btn.querySelector(".mdi").className =
      "mdi " + (ascending ? "mdi-arrow-up-circle" : "mdi-arrow-down-circle");
    btn.querySelector(".np-sort-dir-label").textContent = ascending ? "Asc" : "Dsc";
    btn.setAttribute("aria-label",
      "Sort direction, " + (ascending ? "ascending" : "descending"));
  }

  function wirePager() {
    var sizeSelect = byId("npPageSize");
    onSelectChange(sizeSelect, function () {
      state.pageSize = parseInt(sizeSelect.value, 10) || 10;
      state.page = 1;
      render();
    });

    bindPage("npPageFirst", function () { return 1; });
    bindPage("npPagePrev",  function () { return state.page - 1; });
    bindPage("npPageNext",  function () { return state.page + 1; });
    bindPage("npPageLast",  function (view) { return view.pageCount; });
  }

  /**
   * Paging needs pageCount. It comes from the LAST RESPONSE rather than a
   * fresh query: the numbers are already on screen in the pager, and asking
   * the service again would put a second round-trip in front of one click.
   */
  function bindPage(id, pick) {
    var btn = byId(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var view = lastView;
      var next = Math.min(Math.max(1, pick(view)), view.pageCount);
      if (next === state.page) return;
      state.page = next;
      render();
      /* A page change replaces every card; keeping the old scroll offset would
         drop the user into the middle of a list they have not seen. */
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  /**
   * Card actions are delegated: the cards are re-rendered on every state
   * change, so per-button listeners would have to be re-bound each time.
   *
   * ANGULAR: PersonCardComponent gets an @Output() per action and the parent
   * binds them directly — delegation is a vanilla-DOM concern only.
   */
  function wireCardActions() {
    if (!elList) return;

    elList.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-np-action]");
      if (!btn || !elList.contains(btn)) return;

      var action = btn.getAttribute("data-np-action");

      switch (action) {
        /* An <a> with a real href — the browser navigates; this only snapshots
           the list so the child screen's Back lands where the user left. */
        case "identities":
          goToIdentities();
          break;

        /* The three below are existing behaviour, out of scope for this build.
           They are stubbed rather than removed so the card matches the design
           and the dev has the hook and the destination in one place. */
        case "view-profile":
          /* TODO(#natprsn-profile): open the person's GLOBAL profile, where
             CaseFusion-specific information is entered. */
          toast("View Profile — existing screen, not wired in this build.");
          break;
        case "edit":
          /* TODO(#natprsn-edit): open the natural person form in a modal with
             the existing data pre-filled. */
          toast("Edit — existing modal, not wired in this build.");
          break;
        case "delete":
          /* TODO(#natprsn-delete): open a confirmation dialogue before any
             delete call. Never delete straight from this button. */
          toast("Delete — opens a confirmation dialogue; not wired in this build.");
          break;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════════════ */

  function init() {
    restoreState();

    /* Push the restored state into the controls before the first render, so
       the toolbar and the list agree on load. */
    var search = byId("npSearch");
    if (search) search.value = state.query;

    setSelectValue(byId("npSort"), state.sort);
    setSelectValue(byId("npPageSize"), state.pageSize);

    var dirBtn = byId("npSortDir");
    if (dirBtn) syncSortDirButton(dirBtn);

    /* Its own call because it is its own endpoint in production, and it must
       agree with the queue's stats tile — see the note in the data file. */
    window.CaseFusion.NaturalPersonService.pendingCount().then(renderPendingBadge);
    render();

    wireToolbar();
    wirePager();
    wireCardActions();
    wireHeaderElevation();

    /* Restore scroll after the cards exist, or there is nothing to scroll to. */
    if (state.scrollY) {
      var y = state.scrollY;
      requestAnimationFrame(function () { window.scrollTo(0, y); });
    }
  }

  /**
   * js/nimbus.js loads its components ASYNCHRONOUSLY and fires `cnds.ready`
   * when they are all in place. init() reads Nimbus.Select, so it must not run
   * before then. The guard covers the case where this file is loaded late and
   * the event has already gone by — Nimbus.Select existing is the same signal.
   */
  if (window.Nimbus && window.Nimbus.Select) init();
  else document.addEventListener("cnds.ready", init, { once: true });
}());
