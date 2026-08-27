/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-queue.js
 * Screen:  Admin › Natural Persons › Pending Match Queue
 * Page:    pages/pge-admin-natprsn-pndmtchque.html
 * Figma:   CaseFusion v1.5 — Tenant Manager, section 12466:6785 (#17515)
 *
 * WHAT THIS FILE OWNS
 * ───────────────────
 * The queue screen, complete. Built in eight tasks:
 *
 *   ✔ 1 · Shell            stat tiles, unmerged alert, back to the list
 *   ✔ 2 · Grouped view     signature groups, evidence column, actions
 *   ✔ 3 · All pairs view   flat list + view toggle + paging
 *   ✔ 4 · Search + filters  four filters, Clear filters, Measurement trigger
 *   ✔ 5 · Pair Review      offcanvas, comparison table, decision bar, and the
 *                            SKIP walk — the panel advances between records
 *                            rather than closing
 *   ✔ 6 · Group Dispatch   modal, typed confirmation, remainder note, toasts
 *   ✔ 7 · Measurement      read-only offcanvas, rollups, stacked chart
 *   ✔ 8 · Edge states      the seven documented states
 *
 * TASK 8 IS NOT A SECTION. Six of the seven edge states are properties of
 * other code rather than a block of their own — the empty state lives in
 * §6's writeList, the closed-without-a-decision states are a data-layer
 * vocabulary the rows simply render, the group progress line is part of §3,
 * and the hold-unknown badge is part of §9's person card. Only their
 * behaviour is documented per site; there is nothing to find under an
 * "edge states" heading.
 *
 * SECTIONS, IN THE ORDER THEY APPEAR — the numbers were assigned by task,
 * so they do not run in sequence down the file. Read this, not the numbers:
 *
 *   §1  Data access          §5  View state        §7   View toggle
 *   §2  Shell                §8  Search + filters  §9   Pair Review panel
 *   §3  Signature groups     §6  Render + paging   §10  Group Dispatch
 *   §4  Pending match rows                         §11  Measurement panel
 *
 * A bare §N in this file means a section OF this file. References to the
 * stylesheet are written "the stylesheet's §N" — it has its own numbering.
 *
 * Frame chrome (header, sidenav, theme, notifications) is NOT here — it lives
 * in js/pages/frame-ca-sidenav.js and is shared by every 1.6 page.
 *
 * WHERE THE DATA IS
 * ─────────────────
 * NOT HERE. Every record comes from PendingMatchService in
 * js/pages/pge-admin-natprsn-queue.data.js, which is the file to re-point at
 * the real API — nothing in THIS file knows an endpoint, holds a record, or
 * filters, sorts or slices one. It states a query, receives a page, and
 * paints it.
 *
 * That means the render path is asynchronous throughout. Two things follow,
 * and both are load-bearing rather than defensive:
 *
 *   · responses can land out of order, so render() carries a request token
 *     and only the newest response is allowed to paint (§6);
 *   · a control can be clicked while a write is in flight, so the panel
 *     disables its decision controls for the round trip (§9).
 *
 * LOAD ORDER
 *     js/nimbus.js
 *       → js/app.js
 *       → js/pages/frame-ca-sidenav.js
 *       → js/pages/pge-admin-natprsn-queue.data.js   ← MUST precede this file
 *       → THIS FILE
 *
 * Plain ES5 in an IIFE, no build step. (Promise is used — a runtime API, not
 * syntax, and present everywhere CaseFusion runs.) Nimbus components load
 * ASYNCHRONOUSLY, so anything touching a component class runs inside
 * `cnds.ready`.
 *
 * ANGULAR MIGRATION
 *   This IIFE       → PendingMatchQueueComponent
 *   the .data.js    → PendingMatchService, Promise → Observable throughout
 *   §5 state        → a signal, serialised to queryParams
 *   §6 render()     → switchMap() over the query signal; delete the token
 *   §2 back link    → routerLink="/admin/natural-persons" (see the note there)
 * ========================================================================= */

(function () {
  "use strict";

  var byId = document.getElementById.bind(document);

  /** Locale-formatted integer, e.g. 5313 → "5,313". */
  function formatCount(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1 · DATA ACCESS

     Every record on this screen comes through one service. The controller
     holds NO data and does NO filtering, sorting or slicing — it asks for a
     page and paints what comes back. See
     js/pages/pge-admin-natprsn-queue.data.js for the contract and for why the
     seam is drawn there.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Resolved in init(), not at parse time: script order is a fact about the
     page, and a controller that captured `undefined` here would fail with a
     null dereference somewhere far from the cause. */
  var svc = null;

  /**
   * Queue counts, held so the tiles and the unmerged alert always agree.
   * Refreshed from the service after any write — never adjusted locally.
   */
  var stats = { pending: 0, samePerson: 0, notTheSame: 0 };

  /* ═══════════════════════════════════════════════════════════════════════
     2 · SHELL

     Stat tiles + the unmerged-decisions alert. Both derive from §1.
     ═══════════════════════════════════════════════════════════════════════ */

  /* The most recent stats payload, kept so the empty state can quote the same
     re-ingestion stamp the tiles were counted from. Re-read on every refresh,
     never held longer than that: a stamp that outlives its counts is exactly
     the staleness the empty state exists to rule out. */
  var lastStats = null;

  function renderStats(stats) {
    lastStats = stats;
    setCount("npqStatPending", stats.pending);
    setCount("npqStatSame", stats.samePerson);
    setCount("npqStatNotSame", stats.notTheSame);

    /* stats() and query() are fetched in PARALLEL on load, so on an empty
       queue the empty state can be written before the stamp exists. Repaint it
       once the counts land rather than making the list wait for the tiles —
       otherwise the stamp is missing exactly when it matters most and nothing
       ever re-renders the list to add it. */
    var host = byId("npqList");
    if (host && host.querySelector(".np-empty")) host.innerHTML = emptyStateHtml();
  }

  function setCount(id, value) {
    var el = byId(id);
    if (el) el.textContent = formatCount(value);
  }

  /**
   * The unmerged-decisions alert.
   *
   * PERSISTENT AND NOT DISMISSIBLE. N decisions are recorded that have not
   * been executed — merge execution ships in #17474 — and an operator who
   * believes they merged N people, when the merges are queued behind an
   * unshipped capability, will be badly surprised. It carries no close
   * control, and the only thing that hides it is the count reaching 0.
   *
   * (Figma annotation: Pending Match Queue > Unmerged decisions alert.)
   *
   * ANGULAR: <cf-alert *ngIf="(stats$ | async)?.samePerson as n"> — the
   * *ngIf is the hiding rule; there is no dismiss output to wire.
   */
  function renderUnmergedAlert(stats) {
    var alert = byId("npqUnmergedAlert");
    if (!alert) return;

    var n = stats.samePerson;
    if (!n) {
      alert.hidden = true;
      return;
    }

    alert.hidden = false;
    var countEl = byId("npqUnmergedCount");
    if (countEl) countEl.textContent = formatCount(n);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3 · SIGNATURE GROUPS  (grouped view)

     A group is one match signature: the same policy observation repeated
     across many pairs. The backend ticket cites 1,359 pairs on one shared
     address and 3,764 cohort-only matches — a flat list of those is not a work
     queue, it is a wall. Grouping puts the ~124 pairs that deserve human
     attention above the ~5,123 that are one observation each.

     Rows arrive from PendingMatchService.query({view:"grouped", …}), already
     ordered largest-first. The renderer does not sort — see the note in the
     service's matchingRows().
     ═══════════════════════════════════════════════════════════════════════ */

  /** Escape for innerHTML — group names and reasons are matcher-authored. */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** A `Label: value` evidence line. */
  function evidenceLine(label, value) {
    return "<p><span class=\"np-label\">" + label + ":</span> " +
           "<span class=\"np-value\">" + value + "</span></p>";
  }

  /**
   * One group row.
   *
   * Two rules here are easy to lose and both come straight from the design
   * annotations:
   *
   *  · When the assertion was NOT RECORDED, `Matched on` and `Reason` are
   *    omitted ENTIRELY — never rendered as an em dash. An absent explanation
   *    and an empty one read identically to a user but mean different things
   *    to an audit, and this must never be conflated with "no keys matched",
   *    which is a different and much weaker claim. The note carries the
   *    distinction instead.
   *
   *  · REVIEW is always labelled "Review", never "Review 124 pairs". The count
   *    already sits in the first column, and a label that changes per row is
   *    harder to scan and harder to localise.
   */
  /**
   * Edge state 6 — a group part-way through.
   *
   * Shown only where it says something. A group at 0% has not been started and
   * a group at 100% has nothing left to review — its REVIEW is already
   * disabled and its status already reads as finished, so a "100% decided"
   * line would repeat what two other things on the row say. The partial case
   * is the one an operator cannot infer, because "3,764 pairs" alone does not
   * reveal that a quarter of them are already answered.
   *
   * The counts come from the service, never from arithmetic here: `pairs` is a
   * DISPLAY total that freezes when a group is decided, so deriving a
   * percentage from it would drift the moment a decision landed.
   *
   * ANGULAR: *ngIf="group.percentDecided > 0 && group.percentDecided < 100".
   * Bind decidedCount and total straight from the row — resist computing
   * either in the template, for the reason above.
   */
  function groupProgressHtml(g) {
    if (!g.percentDecided || g.percentDecided >= 100) return "";
    /* States the BASE, where the design draws a bare "32% decided" chip.
       This build's row count is the pending remainder, not the group total — a
       deliberate, signed-off deviation so the group rows sum to the Pending
       tile — so a bare percentage sitting under "34 pairs" reads as 90% of 34.
       Naming both numbers removes the reading the design never has to worry
       about. */
    return '<p class="np-group-progress">' +
             formatCount(g.decidedCount) + " of " + formatCount(g.total) +
             " decided</p>";
  }

  function groupHtml(g) {
    var rule = '<span class="vr vr-blurry np-rule" aria-hidden="true"></span>';

    var evidence = '<p class="np-status np-status-' + g.tone + '">' + esc(g.status) + "</p>";
    /* Absent, not blank — see the note above. */
    if (g.matchedOn && g.matchedOn.length) {
      evidence += evidenceLine("Matched on", g.matchedOn.map(esc).join(" &nbsp;·&nbsp; "));
    }
    if (g.reason) {
      evidence += evidenceLine("Reason", "&ldquo;" + esc(g.reason) + "&rdquo;");
    }
    evidence += '<p class="np-row-note' +
                (g.noteIsWarning ? " np-row-note-caution" : "") + '">' +
                esc(g.note) + "</p>";

    /* Disabled when there is nothing left to review — a decided group, or one
       whose pairs have all been handled individually. Offering REVIEW on an
       empty group and then telling the operator it was empty wastes the click
       and, worse, makes the row look actionable when it is finished. */
    var open = g.reviewable !== undefined ? g.reviewable : g.pairs;
    /* Groups have ONE reason rather than a per-state set: whatever the pairs
       inside were, the group has nothing left to open. Routed through the same
       helper so both row types get the tooltip treatment identically. */
    var actions = reviewButton(
      'data-npq-action="review" data-npq-group="' + esc(g.id) + '" ',
      "Review — " + g.name,
      open ? null : "Nothing left to review in this group");

    /* Hidden on groups that are genuine suspicion. Group dispatch is the only
       sanctioned bulk path and it does not apply to real suspicion. */
    if (g.canDispatch) {
      actions +=
        '<button type="button" class="btn btn-tertiary btn-sm" ' +
          'data-npq-action="dispatch" data-npq-group="' + esc(g.id) + '" ' +
          'aria-label="' + esc("Decide whole group — " + g.name) + '">Decide whole group</button>';
    }

    return '<article class="np-row np-row-group" data-npq-group="' + esc(g.id) + '">' +
             '<div class="np-row-title">' +
               '<h2 class="np-group-name">' + esc(g.name) + "</h2>" +
               '<p class="np-group-count">' + formatCount(g.pairs) + " pairs</p>" +
               groupProgressHtml(g) +
             "</div>" +
             rule +
             '<div class="np-row-evidence">' + evidence + "</div>" +
             rule +
             '<div class="np-row-actions">' + actions + "</div>" +
           "</article>";
  }

  /**
   * Row actions, delegated — rows are re-rendered whenever the view or the
   * page changes, so per-button listeners would need re-binding each time.
   * One handler serves both views; the row carries which kind it is.
   *
   * Both destinations land in later tasks; they are stubbed rather than left
   * dead so the rows are testable and the dev has the hook in one place.
   */
  function wireRowActions() {
    var host = byId("npqList");
    if (!host) return;

    host.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-npq-action]");
      if (!btn || !host.contains(btn)) return;

      var groupId = btn.getAttribute("data-npq-group");
      var pairId = btn.getAttribute("data-npq-pair");

      switch (btn.getAttribute("data-npq-action")) {
        case "review":
          /* Either way the list is untouched underneath — filters, page and
             scroll all survive, so an operator can work several pairs in
             sequence and still be where they left off. */
          openReviewFor(groupId, pairId);
          break;
        case "dispatch":
          openGroupDispatch(groupId);
          break;
      }
    });
  }

  /**
   * REVIEW pressed on a row → open Pair Review on the right record.
   *
   * From a PAIR row that pair opens. From a GROUP row the FIRST STILL-PENDING
   * pair IN THAT GROUP opens — the group the operator clicked, not whichever
   * pair happened to be pending first across the queue.
   *
   * Both paths build the same worklist, which is what makes SKIP able to walk
   * on from wherever the panel opened. See openPairReview().
   */
  function openReviewFor(groupId, pairId) {
    svc.worklist(currentQuery(), groupId || null).then(function (ids) {
      var startId = pairId || ids[0];
      if (!startId) {
        /* A group whose pairs are all decided. Said plainly rather than
           opening an empty panel. */
        toast("Nothing left to review in this group.", { color: "info" });
        return;
      }
      openPairReview(startId, ids, groupId || null);
    });
  }

  /**
   * Nimbus/Toast, built on demand and removed once hidden.
   *
   * @param {string} message
   * @param {Object} [opts]
   * @param {"success"|"warning"|"danger"|"info"} [opts.color="info"]
   * @param {boolean} [opts.persist=false]  stay until dismissed
   *
   * ── WHAT THE COLOUR MEANS HERE ────────────────────────────────────────
   * The colour describes the WRITE, never the verdict.
   *
   * A verdict is not a good/bad axis. "Not the same" is the majority outcome
   * in this queue — 891 against 142 — and painting it danger would render the
   * bulk of an operator's correct work as a stream of failures, while making a
   * recorded decision indistinguishable at a glance from one that failed to
   * record. Danger stays reserved for actual failure.
   *
   *   NOT THE SAME  → success   recorded and complete; nothing outstanding
   *   SAME PERSON   → caution   recorded, but the merge is NOT executed
   *   failure       → danger    nothing was written
   *
   * The one asymmetry is not about which verdict is better. It is about
   * whether anything is STILL OUTSTANDING — which is exactly what caution
   * means in this system, as against warning ("something is wrong") and
   * danger ("it failed"). The list already paints "Same person — awaiting
   * merge" with the caution tone, so the toast, the row and the persistent
   * unmerged-decisions alert all say the same thing in the same colour.
   *
   * `caution` was added to Nimbus/Toast for this (v1 + both CaseFusion copies
   * + styleguide, 2026-08-26). It is NOT warning — separate families, and
   * routinely swapped; see the note in css/components/toasts.css.
   *
   * ── DISMISSAL ─────────────────────────────────────────────────────────
   * EVERY TOAST CARRIES A CLOSE BUTTON, transient ones included.
   *
   * A house rule said transient toasts should not have one — it leaves on its
   * own, so the control looks like it offers nothing. WCAG wins over that, and
   * the reason is in Nimbus's own implementation: the toast PAUSES its
   * auto-hide timer on `mouseenter` and `focusin` (see js/components/toast.js).
   *
   * So a keyboard user who tabs into a toast has stopped the only thing that
   * was going to remove it. Without a close button they are holding focus
   * inside content with no exit — the timer will not resume until they leave,
   * and leaving is the one thing the message may have been asking them not to
   * do. The same pause makes the "it disappears mid-reach" objection moot: by
   * the time a pointer is on it, the countdown has already stopped.
   *
   * Delay is 5000ms, Nimbus's documented floor for WCAG 2.2.1 (Timing
   * Adjustable). Do not shorten it, and do not remove the close button.
   *
   * ANGULAR: a ToastService with the same signature; the colour decision above
   * belongs in the calling component, not the service.
   */
  var TOAST_ICON = {
    success: "mdi-check-circle",
    caution: "mdi-alert-octagon",
    warning: "mdi-alert",
    danger:  "mdi-alert-circle",
    info:    "mdi-information"
  };

  function toast(message, opts) {
    if (!(window.Nimbus && window.Nimbus.Toast)) return;
    opts = opts || {};
    var color = opts.color || "info";
    var persist = !!opts.persist;

    var host = document.createElement("div");
    host.className = "toast fade";

    /* A failure interrupts; an acknowledgement does not. Nimbus's own toast
       examples make the same split. */
    var urgent = color === "danger";
    host.setAttribute("role", urgent ? "alert" : "status");
    host.setAttribute("aria-live", urgent ? "assertive" : "polite");
    host.setAttribute("aria-atomic", "true");

    host.setAttribute("data-cnds-toast-init", "");
    host.setAttribute("data-cnds-color", color);
    host.setAttribute("data-cnds-position", "bottom-right");
    host.setAttribute("data-cnds-stacking", "true");
    host.setAttribute("data-cnds-append-to-body", "true");
    /* Figma: fr_toasts is 300 wide, 24px off the right and bottom. */
    host.setAttribute("data-cnds-width", "300px");
    host.setAttribute("data-cnds-autohide", persist ? "false" : "true");
    if (!persist) host.setAttribute("data-cnds-delay", "5000");

    host.innerHTML =
      '<div class="toast-header">' +
        /* cnds-icon-xl = 24px = Nimbus/Icon/xl, the size the Figma Toast draws.
           NOT mdi-18px, despite the Figma glyph measuring 18: MDI sizes the em
           box and the glyph draws inside it with padding, so mdi-18px yields
           14x14 of ink where the design wants 18x18. Match the icon FRAME
           (24), not the vector. lh-1 keeps the line box 24 to match it. */
        '<i class="mdi ' + (TOAST_ICON[color] || TOAST_ICON.info) +
          ' cnds-icon-xl lh-1 me-2" aria-hidden="true"></i>' +
        '<strong class="me-auto">Pending Match Queue</strong>' +
        /* Always present, transient or not — see DISMISSAL above. */
        '<button type="button" class="btn-close" data-cnds-dismiss="toast" aria-label="Close"></button>' +
      "</div><div class=\"toast-body\"></div>";
    host.querySelector(".toast-body").textContent = message;

    document.body.appendChild(host);
    host.addEventListener("hidden.cnds.toast", function () { host.remove(); });
    window.Nimbus.Toast.getOrCreateInstance(host).show();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4 · PENDING MATCHES  (all-pairs view)

     Rows arrive from PendingMatchService.query({view:"pairs", …}). The record
     shape is @typedef PendingMatch in the data file; the two rules the
     renderer depends on are repeated at pairHtml().
     ═══════════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════════
     5 · VIEW STATE

     ANGULAR: a component signal; the view becomes a queryParam so a shared
     link opens the same shape of list.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Mirrors ADJUDICABLE_STATES in the data file. Kept here too because the
     row renderer must decide without a round trip; if the service's list
     changes, this changes with it. */
  var ADJUDICABLE = ["Pending", "Reopened"];

  /*
   * Why REVIEW is unavailable, per state.
   *
   * "Already decided" is true of the outcome states and FALSE of the two that
   * close without a decision — nobody adjudicated a stale or elsewhere-resolved
   * pair, and telling an operator otherwise invents an audit trail. The default
   * covers the outcome states; the two entries are the states that would
   * otherwise be described wrongly.
   *
   * ANGULAR: a pure pipe (`{{ pair.status | noReviewReason }}`) or a lookup on
   * the component. Keep it a MAP rather than an *ngIf ladder in the template —
   * a new state then fails loudly at the map instead of silently inheriting
   * "already decided", which is the bug this replaced.
   */
  var NO_REVIEW_REASON = {
    "Stale — cannot be decided":
      "One side of this pair no longer exists, so no decision can be recorded",
    "Resolved elsewhere":
      "These persons were merged by another path — there is nothing left to decide"
  };
  var NO_REVIEW_DEFAULT = "This pair has already been decided";

  /**
   * A REVIEW button that explains itself when it is unavailable.
   *
   * The attribute and the title go straight on the disabled button. Nimbus's
   * Tooltip does the rest — it wraps the control in an interactive span, gives
   * that span the tab stop and the help cursor, and stops the button
   * swallowing the pointer. A disabled control dispatches no pointer events,
   * so without that the title would never fire at all.
   *
   * Takes the reason rather than deriving it, because the two row types answer
   * a different question: a pair says why THIS pair cannot be decided, a group
   * says only that it has nothing left to open.
   *
   * @param {string} attrs   markup attributes carrying the row's identity
   * @param {string} label   accessible label
   * @param {?string} reason null when the button is live; otherwise why it is not
   *
   * ANGULAR: one <cf-review-button [reason]="…"> component. Put
   * data-cnds-tooltip-init and [attr.title]="reason" on the BUTTON and let
   * Nimbus/Tooltip build its own wrapper — do not hand-write a <span> in the
   * template, and do not bind [style.pointer-events]. Call the instance's
   * sync() if `reason` can flip after first render, since the wrapper is added
   * and removed with the disabled state.
   */
  function reviewButton(attrs, label, reason) {
    return '<button type="button" class="btn btn-tertiary btn-sm" ' + attrs +
             (reason
               ? 'disabled data-cnds-tooltip-init data-cnds-placement="left" ' +
                 'title="' + esc(reason) + '" '
               : "") +
             'aria-label="' + esc(label) + '">Review</button>';
  }

  function noReviewReason(status) {
    return NO_REVIEW_REASON[status] || NO_REVIEW_DEFAULT;
  }

  var VIEW_GROUPED = "grouped";
  var VIEW_PAIRS = "pairs";

  /**
   * The whole query, in one object — and the ONLY thing the controller knows
   * about what the list contains.
   *
   * This is passed to PendingMatchService.query() verbatim, so it is already
   * the request the API receives. Anything that changes the list changes a
   * field here and calls render(); there is no second place where a view,
   * a page or a filter is remembered.
   *
   * ANGULAR: a component signal, serialised to queryParams so a shared link
   * reopens the same list. `filters` maps to repeated HttpParams keys — see
   * the ListQuery note in the data file.
   */
  var state = {
    /* Defaults to grouped: the backend cites 1,359 pairs on one shared address
       and 3,764 cohort-only matches, and grouping puts the ~124 pairs that
       deserve human attention above the ~5,123 that are one policy observation
       each. */
    view: VIEW_GROUPED,
    page: 1,
    pageSize: 10,
    search: "",
    /* Empty array === no constraint on that field. */
    filters: { keyType: [], reason: [], state: [], source: [] }
  };

  /** A snapshot, so an in-flight request cannot be mutated under the service. */
  function currentQuery() {
    return {
      view: state.view,
      page: state.page,
      pageSize: state.pageSize,
      search: state.search,
      filters: {
        keyType: state.filters.keyType.slice(),
        reason: state.filters.reason.slice(),
        state: state.filters.state.slice(),
        source: state.filters.source.slice()
      }
    };
  }


  /** One pending-match row — same frame as a group row, different title column. */
  function pairHtml(p) {
    var rule = '<span class="vr vr-blurry np-rule" aria-hidden="true"></span>';

    var evidence = '<p class="np-status np-status-' + p.tone + '">' + esc(p.status) + "</p>";
    if (p.matchedOn && p.matchedOn.length) {
      evidence += evidenceLine("Matched on", p.matchedOn.map(esc).join(" &nbsp;·&nbsp; "));
    }
    if (p.reason) {
      evidence += evidenceLine("Reason", "&ldquo;" + esc(p.reason) + "&rdquo;");
    }
    evidence += '<p class="np-row-note">' + esc(p.note) + "</p>";

    return '<article class="np-row np-row-pair" data-npq-pair="' + esc(p.id) + '">' +
             '<div class="np-row-title">' +
               '<p class="np-pair-names">' + esc(p.established) +
                 '<span class="np-pair-sep" aria-hidden="true">·</span>' +
                 esc(p.candidate) +
               "</p>" +
               '<p class="np-pair-sources">' + p.sources.map(esc).join(" &nbsp;·&nbsp; ") + "</p>" +
             "</div>" +
             rule +
             '<div class="np-row-evidence">' + evidence + "</div>" +
             rule +
             '<div class="np-row-actions">' +
               /* A pair that cannot be reviewed says why on hover and on
                  focus, not just by being dim. Its status already carries the
                  state; the tooltip carries the reason. */
               reviewButton(
                 'data-npq-action="review" data-npq-pair="' + esc(p.id) + '" ',
                 "Review — " + p.established + " and " + p.candidate,
                 ADJUDICABLE.indexOf(p.status) !== -1
                   ? null : noReviewReason(p.status)) +
             "</div>" +
           "</article>";
  }


  /* ═══════════════════════════════════════════════════════════════════════
     8 · SEARCH + FILTERS

     Four filters, each MULTI-select, each labelled `Field: value` — always.
     The field name never appears alone and `All` is stated when unset, so the
     label's shape stays constant as the control is used and only the value
     after the colon changes.

     THE FILL CARRIES THE ON/OFF SIGNAL, not the label and not the button type:
     an engaged filter stays secondary and takes .btn-secondary's own
     active-state background. With four filters an operator needs to see WHICH
     are engaged without reading each one; the value after the colon gives the
     detail on inspection.

     ANGULAR: a FilterBarComponent with one @Output() per filter, or a single
     (filtersChange) emitting the whole selection object.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Option lists, verbatim from the design's parked-open menus.
   * `All` is always the first option and is the reset for that filter.
   */
  /**
   * The four filters, in toolbar order.
   *
   * `options` is EMPTY until facets() answers — the values a tenant can filter
   * by are a property of that tenant's data, not of this page, so they are
   * fetched rather than declared. renderFilterMenus() runs once they arrive.
   */
  var FILTERS = [
    /* Key type must still return pairs whose assertion was not recorded —
       those have a key type, only the explanation is missing. The facet list
       carries "Not recorded" as a selectable value for exactly that. */
    { key: "keyType", label: "Key type", btnId: "npqFilterKeyType", options: [] },
    /* The MATCHER's reason, not the decision reason captured in Pair Review. */
    { key: "reason",  label: "Reason",   btnId: "npqFilterReason",  options: [] },
    /* The two same-person states stay SEPARATELY selectable: conflating them
       hides an unshipped merge backlog. */
    { key: "state",   label: "State",    btnId: "npqFilterState",   options: [] },
    /* Every pair spans two sources by definition, so a source matches a row if
       EITHER side came from it — the rule lives in the service's WHERE clause. */
    { key: "source",  label: "Source",   btnId: "npqFilterSource",  options: [] }
  ];

  /* Selected values live on state.filters — the same object sent to the
     service — so the control and the request can never disagree. */

  function anyFilterEngaged() {
    var f = state.filters;
    for (var k in f) if (f[k].length) return true;
    return false;
  }

  /**
   * The three label states, straight from the design annotation:
   *   unset       →  "Key type: All"                     secondary
   *   one value   →  "Key type: Full name + email …"     primary
   *   several     →  "Key type: 3 selected"              primary
   */
  function filterLabel(f) {
    var sel = state.filters[f.key];
    if (!sel.length) return f.label + ": All";
    if (sel.length === 1) return f.label + ": " + sel[0];
    return f.label + ": " + sel.length + " selected";
  }

  function renderFilterButtons() {
    FILTERS.forEach(function (f) {
      var btn = byId(f.btnId);
      if (!btn) return;

      var engaged = state.filters[f.key].length > 0;
      var labelEl = btn.querySelector(".np-filter-label");
      if (labelEl) labelEl.textContent = filterLabel(f);

      /* Engaged filters stay SECONDARY and take a background fill — they do
         not promote to primary. Primary is reserved for the one action a
         screen asks for, and four filters all turning primary would put four
         primaries on a toolbar that has none. The fill uses .btn-secondary's
         own active-state tokens (see the stylesheet's §13). */
      btn.classList.toggle("np-filter-engaged", engaged);

      /* The checkboxes have to agree with the query that drives them. "All" is
         checked exactly when nothing else is — it represents the unfiltered
         state rather than being a value of its own. */
      var menu = document.querySelector('[data-npq-menu="' + f.key + '"]');
      if (menu) {
        menu.querySelectorAll(".form-check-input").forEach(function (box) {
          var value = box.getAttribute("data-npq-value");
          var on = value === "" ? !engaged : state.filters[f.key].indexOf(value) !== -1;
          box.checked = on;
          /* .active is the component's selected state — one vocabulary, so the
             row's paint and the box can never disagree. */
          box.closest(".dropdown-item-check").classList.toggle("active", on);
        });
      }
    });

    /* Always present, disabled when there is nothing to clear — see the
       stylesheet's §13. */
    var clear = byId("npqClearFilters");
    if (clear) clear.disabled = !anyFilterEngaged();
  }

  /** Build each menu's options once. */
  function renderFilterMenus() {
    FILTERS.forEach(function (f) {
      var menu = document.querySelector('[data-npq-menu="' + f.key + '"]');
      if (!menu) return;
      /* "All" first in every menu, and it is that filter's reset. */
      var items = [{ value: "", text: "All" }].concat(f.options.map(function (o) {
        return { value: o, text: o };
      }));
      /* Nimbus multi-select menu rows: .dropdown-item-check supplies the
         layout, the gap and the non-interactive input. A <label> row makes the
         whole width the hit target, and the native checkbox carries the
         checked state for assistive tech — so nothing here hand-rolls
         aria-checked. Selected rows also take .active, the component's own
         "this one is chosen" class. */
      menu.innerHTML = items.map(function (o, i) {
        var id = f.key + "-opt-" + i;
        return '<li><label class="dropdown-item dropdown-item-check" for="' + id + '">' +
                 '<input type="checkbox" class="form-check-input" id="' + id + '" ' +
                   'data-npq-value="' + esc(o.value) + '" />' +
                 '<span class="form-check-label">' + esc(o.text) + "</span>" +
               "</label></li>";
      }).join("");
    });
  }

  /* Filtering and searching are NOT done here. They are the service's WHERE
     clause — see matchesFilters()/matchesSearch() in the data file, and the
     header note on why the seam is drawn there rather than in this file. */

  function wireFilters() {
    FILTERS.forEach(function (f) {
      var menu = document.querySelector('[data-npq-menu="' + f.key + '"]');
      if (!menu) return;

      menu.addEventListener("click", function (event) {
        var item = event.target.closest(".dropdown-item");
        if (!item) return;

        /* Multi-select: the menu stays open so several values can be picked in
           one visit. Without this the Nimbus dropdown closes on the first
           click and "3 selected" would take three trips.

           preventDefault also stops the label toggling its checkbox natively —
           renderFilterButtons() sets every box from state.filters instead, so
           the control can never show a state the filter does not have. */
        event.preventDefault();
        event.stopPropagation();

        var box = item.querySelector(".form-check-input");
        var value = box ? box.getAttribute("data-npq-value") : null;
        if (value === null) return;
        if (value === "") {
          state.filters[f.key] = [];            /* "All" resets this filter */
        } else {
          var at = state.filters[f.key].indexOf(value);
          if (at === -1) state.filters[f.key].push(value);
          else state.filters[f.key].splice(at, 1);
        }

        state.page = 1;                        /* a new filter starts at page 1 */
        renderFilterButtons();
        render();
      });
    });

    var clear = byId("npqClearFilters");
    if (clear) {
      clear.addEventListener("click", function () {
        /* Resets all four filters and returns the list to its default
           grouping. Deliberately does NOT touch the view toggle. */
        FILTERS.forEach(function (f) { state.filters[f.key] = []; });
        state.page = 1;
        renderFilterButtons();
        render();
      });
    }

    /* Clearing is Nimbus's: data-cnds-input-clear-init on the input handles
       show/hide, emptying and refocus, and dispatches a native `input` event —
       so the debounce below serves typing and clearing alike, with no second
       listener. See js/components/input-clear.js. */
    var search = byId("npqSearch");
    if (search) {
      var timer = null;
      search.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.search = search.value.trim();
          state.page = 1;
          render();
        }, 200);
      });
    }

    var measure = byId("npqMeasure");
    if (measure) {
      measure.addEventListener("click", openMeasurement);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6 · RENDER + PAGING

     render() is ASYNCHRONOUS, because the list comes from the network.

     Two consequences the mock's 120ms delay is there to keep honest:

       · Responses can land OUT OF ORDER. Typing "smi" fires three queries and
         the browser makes no promise about which answers first, so painting
         whatever arrives can leave the list showing results for "sm" under a
         box reading "smi". Every request therefore carries a token and only
         the newest one is allowed to paint. ANGULAR: this is precisely what
         switchMap() does — use it rather than mergeMap, and delete the token.

       · The list is EMPTY for a moment. That moment gets a stated loading
         state, not a blank panel and not a spinner over stale rows: a queue
         that shows yesterday's rows while fetching today's is worse than one
         that says it is loading.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Incremented per request; a response whose token is not the current one is
     discarded rather than painted. */
  var requestToken = 0;

  /*
   * How long a query may take before the skeleton is shown.
   *
   * Not zero. Painting a placeholder for a response that lands in 120ms is a
   * flicker, and a flicker on every keystroke of a search is worse than no
   * loading state at all — the list appears to strobe. Below roughly a
   * quarter-second a response reads as instant, so the skeleton is held back
   * until the wait is one the operator would otherwise notice.
   *
   * This is Nimbus's `delay` convention (see the Delay section of
   * cnds-loadingmanagement.html), applied to a skeleton rather than an overlay.
   */
  var SKELETON_DELAY_MS = 250;

  /**
   * One placeholder row, in the shape of the row it stands in for.
   *
   * The shape is the point. A skeleton is only worth more than a spinner if it
   * holds the layout the content will take — same title column, same evidence
   * block, same trailing action — so nothing jumps when the rows land. The
   * widths come from the same custom properties the real row uses, so the two
   * cannot drift apart. Geometry lives in the stylesheet (.np-skeleton-*),
   * not inline.
   *
   * Nimbus supplies every class here: .skeleton-list, .skeleton-row,
   * .skeleton-group, .skeleton-text and the .skeleton-w-* widths.
   */
  function skeletonRow() {
    return '<div class="skeleton-row">' +
             '<div class="skeleton-group np-skeleton-title">' +
               '<div class="skeleton skeleton-text skeleton-w-75"></div>' +
               '<div class="skeleton skeleton-text skeleton-w-50"></div>' +
             "</div>" +
             /* Four lines, matching the evidence column's status, matched-on,
                reason and note — see pairHtml()/groupHtml(). */
             '<div class="skeleton-group">' +
               '<div class="skeleton skeleton-text skeleton-w-33"></div>' +
               '<div class="skeleton skeleton-text skeleton-w-66"></div>' +
               '<div class="skeleton skeleton-text skeleton-w-50"></div>' +
               '<div class="skeleton skeleton-text"></div>' +
             "</div>" +
             '<div class="skeleton skeleton-rect skeleton-action np-skeleton-action"></div>' +
           "</div>";
  }

  /**
   * Fill the list with placeholders.
   *
   * A FULL PAGE of them — pageSize rows, not three. The count is information:
   * it says how much is coming, and a three-row placeholder followed by ten
   * real rows moves everything below it down the moment the data lands.
   */
  function paintSkeleton(host) {
    if (!host) return;
    var rows = [];
    for (var i = 0; i < state.pageSize; i++) rows.push(skeletonRow());
    /* aria-hidden on the placeholder, aria-busy on the container: assistive
       tech is told "busy" once rather than read a page of empty blocks.

       Joined with the SAME <hr class="hr"> the real list uses, not
       .skeleton-list's own border. An <hr> carries margins and a border does
       not, so the two spaced differently — 46px over a full page, which is a
       visible jump at the moment the rows land and precisely what the
       skeleton exists to prevent. Same divider, same spacing, by
       construction. */
    host.innerHTML = '<div class="skeleton-list" aria-hidden="true">' +
                     rows.join('<hr class="hr" />') + "</div>";
  }

  function render() {
    var token = ++requestToken;
    var host = byId("npqList");

    if (host) host.setAttribute("aria-busy", "true");

    /* Held back — see SKELETON_DELAY_MS. Cancelled if the response wins. */
    /*
     * Only when there is nothing to show.
     *
     * A skeleton over a list that already has rows would replace them before
     * the incoming page can be diffed against them, and the removal animation
     * would never run — the rows it was meant to animate out are already gone.
     * Where rows ARE present they stay until the new page lands, and
     * paintList() animates the difference. That is not the stale-content
     * problem the skeleton guards against: these rows are still accurate, and
     * the ones that stop being accurate are shown leaving.
     */
    var pending = setTimeout(function () {
      if (token === requestToken && host && !host.querySelector(".np-row")) {
        paintSkeleton(host);
      }
    }, SKELETON_DELAY_MS);

    return svc.query(currentQuery()).then(function (result) {
      clearTimeout(pending);
      /* A newer request has already been issued — this answer is stale. Its
         skeleton timer is cancelled above, so a superseded response cannot
         leave placeholders behind either. */
      if (token !== requestToken) return;
      paintList(result);
    });
  }

  /**
   * Paint one page of results.
   *
   * Takes the PageResult whole: `total` is the server's count of everything
   * behind the query, NOT rows.length, and the pager reads it. Deriving the
   * range from the rows in hand would read "1-10 of 10" on a 5,281-row queue.
   */
  /**
   * Rows that are in the list now but not in the incoming page.
   *
   * Identified by the id the row carries, not by index: a row that merely
   * MOVED must not be animated out, or paging would dissolve the whole list.
   */
  function leavingRows(host, result) {
    var incoming = {};
    (result.rows || []).forEach(function (r) { incoming[r.id] = true; });
    /* .np-row-scoped: the action BUTTONS carry data-npq-group too, and counting
       them made `leaving` outnumber the rows, which silently disabled the
       animation. */
    return [].slice.call(host.querySelectorAll(".np-row[data-npq-group], .np-row[data-npq-pair]"))
      .filter(function (el) {
        var id = el.getAttribute("data-npq-group") || el.getAttribute("data-npq-pair");
        return id && !incoming[id];
      });
  }

  /**
   * Fade the leaving rows out, collapse the space they held, then paint.
   *
   * Both halves are Nimbus: `.animate-fadeOut` with `.animation-faster` for the
   * fade, then `.collapsing` (css/core/transitions.css) for the height, whose
   * 0.35s is the same step. The stylesheet adds only the padding and margin,
   * which .collapsing does not transition.
   *
   * Height is pinned in px first — a transition cannot run from `auto` — then
   * the inline value is cleared so the class's `height: 0` takes over and the
   * element animates down to it.
   *
   * The divider that followed each row goes with it; otherwise a list that
   * loses its last row keeps a rule hanging under nothing.
   */
  function animateOut(rows, done) {
    if (!rows.length) { done(); return; }

    var parts = [];
    rows.forEach(function (el) {
      parts.push(el);
      var rule = el.nextElementSibling;
      if (rule && rule.tagName === "HR") parts.push(rule);
      el.classList.add("animate-fadeOut", "animation-faster");
    });

    var wait = fadeMs(rows[0]);
    setTimeout(function () {
      parts.forEach(function (el) {
        el.style.height = el.getBoundingClientRect().height + "px";
      });
      /* One forced layout for the whole set, so the pinned heights are
         committed before the class that transitions away from them. */
      void rows[0].offsetHeight;
      parts.forEach(function (el) {
        el.classList.add("collapsing");
        el.style.height = "";
      });
      setTimeout(done, 350);
    }, wait);
  }

  function paintList(result) {
    var total = result.total;
    var pageCount = result.pageCount;

    /* Paging persists across a view switch, per the design annotation — the
       operator does not get thrown back to page 1 for changing the shape of
       the list. Where it CANNOT persist, it clamps: the grouped view is one
       page, so arriving from page 2 of All Pairs lands on page 1 and stays
       there on the way back. Page 2 of a one-page list is not a state worth
       preserving. Deliberate, and confirmed by Scott 2026-08-26 — do not
       "fix" this into a remembered page per view.

       The service clamps too and returns the page it actually served, so the
       pager and the list can never disagree about which page this is. */
    state.page = result.page;

    var start = (result.page - 1) * result.pageSize;
    var slice = result.rows;

    var host = byId("npqList");

    /* A row that is going animates out BEFORE the swap, so the operator sees
       it leave rather than finding it gone. Only when rows are actually
       leaving — the first paint, paging and filtering all replace wholesale. */
    if (host && host.querySelector(".np-row")) {
      var leaving = leavingRows(host, result);
      if (leaving.length && leaving.length < host.querySelectorAll(".np-row").length) {
        animateOut(leaving, function () { writeList(result); });
        return;
      }
    }
    writeList(result);
  }

  /**
   * Edge state 1 — nothing to show.
   *
   * TWO different situations that look identical on screen and are not the
   * same news:
   *
   *   · a filter or search matched nothing  →  the queue still has work; the
   *     way out is to clear the filters, so the copy points at them
   *   · the queue is genuinely empty        →  there is no work; the way out
   *     is nothing, so pointing at filters would send the operator hunting for
   *     a filter they never set
   *
   * The empty queue also states the last re-ingestion, because silence must be
   * distinguishable from staleness. "No pending matches" and "the matcher has
   * not run since Tuesday" render the same otherwise, and only one of them
   * means the operator is finished.
   *
   * ANGULAR: two <ng-template>s selected by *ngIf, not one template with
   * interpolated copy — the branches say different things for different
   * reasons, and merging them invites someone to "simplify" the distinction
   * away. Guard on `hasQuery = filtersActive || !!search`, and take the stamp
   * from the same stats$ the tiles subscribe to so the two can never disagree.
   */
  function emptyStateHtml() {
    if (anyFilterEngaged() || state.search) {
      return '<div class="np-empty">' +
               '<i class="mdi mdi-filter-remove-outline np-empty-icon" aria-hidden="true"></i>' +
               '<p class="np-empty-title">No pending matches match these filters</p>' +
               '<p class="np-empty-note">Clear the filters to see the whole queue.</p>' +
             "</div>";
    }

    /* Rendered from the stats the tiles already read, so the stamp can never
       disagree with them. `lastIngestion` absent (an older API) degrades to the
       headline alone rather than printing "undefined". */
    var ing = lastStats && lastStats.lastIngestion;
    var stamp = ing
      ? '<p class="np-empty-note">Last re-ingestion completed ' + esc(ing.completedAt) +
          ' &nbsp;·&nbsp; ' + formatCount(ing.newPending) + ' new pending matches</p>'
      : "";

    return '<div class="np-empty">' +
             '<i class="mdi mdi-check-circle-outline np-empty-icon" aria-hidden="true"></i>' +
             '<p class="np-empty-title">No pending matches awaiting review.</p>' +
             stamp +
           "</div>";
  }

  function writeList(result) {
    var total = result.total;
    var pageCount = result.pageCount;
    var start = (result.page - 1) * result.pageSize;
    var slice = result.rows;
    var host = byId("npqList");
    if (host) {
      /* State is stated in words. Rows are never dimmed to convey a state, and
         an empty result is not an error. */
      host.innerHTML = total === 0
        ? emptyStateHtml()
        /* Joined with a real Nimbus/Divider between rows rather than a border
           on the row itself — a sibling rule is how the design draws it, and
           it means no row has to special-case being last. */
        : slice.map(state.view === VIEW_PAIRS ? pairHtml : groupHtml)
               .join('<hr class="hr" aria-hidden="true" />');
      host.setAttribute("aria-label", state.view === VIEW_PAIRS
        ? "Pending matches, one row per pair"
        : "Pending matches grouped by match signature");
      host.removeAttribute("aria-busy");

      /* Rows are rebuilt on every view, page and filter change, so the
         [data-cnds-tooltip-init] wrappers inside them are new elements that
         the boot-time scan never saw. initAll() is scoped to the list and
         skips anything already initialised, so re-running it per render costs
         nothing and is the only thing that makes the disabled-REVIEW reason
         reachable at all. */
      if (window.Nimbus && window.Nimbus.DataAPI) {
        window.Nimbus.DataAPI.initAll(host);
      }
    }

    renderPager(total, pageCount, start);
    syncToggle();
  }

  /* Last page count the SERVER reported. The arrow buttons clamp against it
     so they cannot ask for a page that does not exist; the service clamps
     again, because a client-side bound is a convenience, not a guarantee. */
  var lastPageCount = 1;

  function renderPager(total, pageCount, start) {
    lastPageCount = pageCount;
    var range = byId("npqPagerRange");
    if (range) {
      range.textContent = total
        ? formatCount(start + 1) + "-" + formatCount(Math.min(total, start + state.pageSize)) +
          " of " + formatCount(total)
        : "0 of 0";
    }
    var atFirst = state.page <= 1, atLast = state.page >= pageCount;
    setDisabled("npqPageFirst", atFirst);
    setDisabled("npqPagePrev", atFirst);
    setDisabled("npqPageNext", atLast);
    setDisabled("npqPageLast", atLast);
  }

  function setDisabled(id, disabled) {
    var el = byId(id);
    if (el) el.disabled = disabled;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7 · VIEW TOGGLE

     Switches the list between signature groups and a flat pair list.
     Pagination persists across the switch — deliberately, per the annotation —
     so an operator who is three pages into one shape does not lose their place
     by looking at the other. Any expanded group does not persist.

     aria-pressed carries the state; the stylesheet paints from that attribute,
     so the visual and the accessible state cannot drift apart.
     ═══════════════════════════════════════════════════════════════════════ */

  function syncToggle() {
    setPressed("npqViewGrouped", state.view === VIEW_GROUPED);
    setPressed("npqViewPairs", state.view === VIEW_PAIRS);
  }

  function setPressed(id, on) {
    var el = byId(id);
    if (el) el.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function wireViewToggle() {
    bindView("npqViewGrouped", VIEW_GROUPED);
    bindView("npqViewPairs", VIEW_PAIRS);
  }

  function bindView(id, view) {
    var btn = byId(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (state.view === view) return;
      state.view = view;
      render();
    });
  }

  function wirePager() {
    onSelectChange(byId("npqPageSize"), function () {
      state.pageSize = parseInt(byId("npqPageSize").value, 10) || 10;
      state.page = 1;
      render();
    });
    bindPage("npqPageFirst", function () { return 1; });
    bindPage("npqPagePrev", function () { return state.page - 1; });
    bindPage("npqPageNext", function () { return state.page + 1; });
    bindPage("npqPageLast", function (pageCount) { return pageCount; });
  }

  function bindPage(id, pick) {
    var btn = byId(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = Math.min(Math.max(1, pick(lastPageCount)), lastPageCount);
      if (next === state.page) return;
      state.page = next;
      render();
      /* A page change replaces every row; keeping the scroll offset would drop
         the operator into the middle of a list they have not seen. */
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  /**
   * Listen for a value change on a Nimbus-enhanced <select>.
   * Nimbus/Select emits `valueChanged.cnds.select` and does NOT re-emit a
   * native `change`; both are bound so keyboard use of the native control
   * works before Nimbus has upgraded it.
   */
  function onSelectChange(el, handler) {
    if (!el) return;
    el.addEventListener("change", handler);
    el.addEventListener("valueChanged.cnds.select", handler);
  }

  /**
   * Pin the tools band directly beneath the title band.
   *
   * The offset is the utility header plus whatever the title band actually
   * measures — not a constant, because the title wraps on a narrow window.
   * Measured here and written to --np-tools-top, which the stylesheet's §11 reads.
   */
  function syncToolsOffset() {
    var header = byId("npqHeader");
    var page = document.querySelector(".np-page");
    if (!header || !page) return;

    var headerH = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--app-utility-height")) || 50;
    page.style.setProperty("--np-tools-top",
      (headerH + header.getBoundingClientRect().height) + "px");
  }


  /* ═══════════════════════════════════════════════════════════════════════
     9 · PAIR REVIEW PANEL

     Opened by REVIEW on any row, and it is a STATION, not a detail page: an
     operator works a queue of thousands, so the panel stays open and the
     RECORD changes underneath them. SKIP and both decisions all advance to the
     next record to be adjudicated; only the last record in the walk closes it.

     The list underneath is NOT reloaded while the panel is open — filters,
     page and scroll survive, so closing the panel returns the operator to
     exactly where they were.

     The order advanced through is the WORKLIST, fetched when the panel opens:
     the ids of every still-adjudicable pair under the same filters, unpaged.
     See PendingMatchService.worklist() for why it is not the current page.

     ANGULAR: PairReviewPanelComponent with @Input() pair and @Output()
     decided / skipped / closed. The enablement matrix below is component
     logic and ports as-is.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Reason options, grouped by the outcome each one asserts.
   *
   * The GROUP is the whole mechanism: a reason under "Not the same person"
   * enables only NOT THE SAME, one under "Same person" enables only SAME
   * PERSON. The option states the outcome, so offering the opposite decision
   * would let the record contradict its own justification.
   *
   * "Other — add a note" is the escape hatch and enables BOTH, since the note
   * has not told us which way it goes.
   *
   * Fetched, not declared: adjudications are reported on by reason, so the
   * vocabulary is governed and versioned server-side. Filled by reasons().
   */
  var REASON_GROUPS = [];

  var OTHER_REASON = "Other — add a note";

  /** Which outcome does a chosen reason assert? Null until reasons() lands. */
  function outcomeOf(reason) {
    for (var i = 0; i < REASON_GROUPS.length; i++) {
      if (REASON_GROUPS[i].options.indexOf(reason) !== -1) return REASON_GROUPS[i].outcome;
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────
     THE WALK

     `walk.ids` is the order SKIP and the decisions advance through; `walk.at`
     is where the operator is in it. Both are set when the panel opens and are
     not touched by anything happening in the list underneath — the list is
     frozen while the panel is open, so a worklist that re-ordered mid-walk
     would move the operator without them doing anything.

     A decided pair is left IN the array rather than spliced out. Its index is
     how "the one after this" is defined, and removing entries under a cursor
     silently skips the neighbour of whatever was removed.
     ───────────────────────────────────────────────────────────────────────── */
  var walk = { ids: [], at: -1, groupId: null };

  /* The pair currently open in the panel. */
  var openPair = null;

  /**
   * The walker step — "Pair 7 of 124" — in the panel title space.
   *
   * Figma draws it prepended to the title, separated by a Nimbus/Divider.
   * It is the only thing on screen that says where the operator is: SKIP and
   * both decisions advance the record IN PLACE, so without a count the walk
   * has no visible length and no visible end.
   *
   * THE TOTAL IS THE WALK, not the group's pair count.
   * The design reads "of 124", which is the signature group's total — and in
   * production those agree, because a group's pairs are overwhelmingly still
   * pending. They diverge only where some are already decided, and there the
   * walk length is the honest number: a decided pair is not a stop on the
   * walk, so counting it would promise the operator records they will never
   * be shown.
   *
   * Hidden, with its rule, when there is no walk — an empty step would leave
   * a divider floating against the title.
   */
  function renderStep() {
    var step = byId("npqPairStep");
    var rule = document.querySelector("#npqPairReview .np-panel-rule");
    if (!step) return;

    var show = walk.at >= 0 && walk.ids.length > 0;
    step.textContent = show
      ? "Pair " + formatCount(walk.at + 1) + " of " + formatCount(walk.ids.length)
      : "";
    step.hidden = !show;
    if (rule) rule.hidden = !show;
  }

  /** The next record still to be adjudicated, or null at the end of the walk. */
  function nextInWalk() {
    return walk.at >= 0 && walk.at + 1 < walk.ids.length
      ? walk.ids[walk.at + 1] : null;
  }

  /* Nimbus semantic text classes, not bespoke ones. These resolve to exactly
     the colours the design draws — #72b23e / #ff97aa / #d1d1d1 in dark — and
     they carry their own light-theme values, so the table themes for free. */
  var VERDICT = {
    match:   { icon: "mdi-check",  cls: "text-success-emphasis", label: "Matches" },
    differ:  { icon: "mdi-close",  cls: "text-danger-emphasis",  label: "Differs" },
    missing: { icon: "mdi-minus",  cls: "text-muted",            label: "\u2014" }
  };

  /**
   * Paint the panel for one pair.
   *
   * @param {Object} pair        the record, from PendingMatchService.pair()
   * @param {Array}  comparison  field comparison, from .comparison()
   *
   * Both are passed in rather than fetched here: the crossfade has to know
   * everything has arrived BEFORE it starts, or the panel fades in onto a
   * half-painted record. See showRecord().
   */
  function renderPanel(pair, comparison) {
    openPair = pair;

    var title = byId("npqPairReviewTitle");
    if (title) {
      title.textContent = pair.established + " \u00b7 " + pair.candidate +
                          (pair.reason ? " \u2014 \u201c" + pair.reason + "\u201d" : "");
    }
    renderStep();

    /* Legal hold. Shown only when a side is actually on hold, and it says
       plainly that deciding does not lift it. Absence of hold DATA is not the
       same as "no holds", so nothing is claimed when it is unknown. */
    var holdAlert = byId("npqHoldAlert"), holdText = byId("npqHoldText");
    if (holdAlert) {
      if (pair.legalHold) {
        holdAlert.hidden = false;
        if (holdText) holdText.textContent =
          "One of these people is under legal hold \u2014 " + pair.legalHold +
          ". Deciding does not lift the hold.";
      } else {
        holdAlert.hidden = true;
      }
    }

    /* The two person cards. */
    var persons = byId("npqPersons");
    if (persons) {
      persons.innerHTML =
        personCard("Established person", pair.established, pair.establishedMeta, pair.legalHold, pair.holdKnown) +
        '<div class="np-persons-arrow" aria-hidden="true"><i class="mdi mdi-arrow-right-thick"></i></div>' +
        personCard("Candidate", pair.candidate, pair.candidateMeta, null, pair.holdKnown);
    }

    /* Field comparison. */
    var body = byId("npqCompare");
    if (body) {
      body.innerHTML = comparison.map(function (r) {
        var v = VERDICT[r.verdict];
        return "<tr>" +
          '<td class="np-col-verdict ' + v.cls + '">' +
            '<i class="mdi ' + v.icon + '" aria-hidden="true"></i>' +
            '<span class="visually-hidden">' + esc(r.agree || v.label) + "</span></td>" +
          '<td class="np-col-field">' + esc(r.field) + "</td>" +
          '<td class="np-col-value">' + esc(r.established || "\u2014") + "</td>" +
          '<td class="np-col-value">' + esc(r.distinct || "\u2014") + "</td>" +
          '<td class="np-col-agree ' + v.cls + '">' + esc(r.agree || v.label) + "</td>" +
        "</tr>";
      }).join("");
    }

    /* Why it was refused. */
    var on = byId("npqRefusedOn");
    if (on) on.textContent = pair.refusedOn ? "Refused " + pair.refusedOn : "";
    var why = byId("npqRefusedReason");
    if (why) why.textContent = pair.reason ? "\u201c" + pair.reason + "\u201d" : "Not recorded";

    var keys = byId("npqRefusedKeys");
    if (keys) {
      var list = (pair.matchedOn && pair.matchedOn.length) ? pair.matchedOn : [];
      keys.innerHTML = list.map(function (k) {
        return '<li><span class="np-key-row"><span>' + esc(k) + "</span>" +
               '<span class="np-key-status text-caution-emphasis">Needs corroboration</span></span></li>';
      }).join("");
      keys.hidden = !list.length;
    }
    var note = byId("npqRefusedNote");
    if (note) {
      /* Un-hidden here, because paintPanelSkeleton() hides it: the footnote
         explains the refusal and has nothing to say until there is one. Any
         element the skeleton hides has to be restored on this path or it
         stays gone for the rest of the session. */
      note.hidden = false;
      note.querySelector("span").textContent = pair.note;
    }

    resetDecision();
  }

  function personCard(role, name, meta, hold, holdKnown) {
    var badge;
    if (hold) {
      /* Figma: Nimbus/Badge — legal-hold is Color=WARNING (#f3bc00). The alert
         above it is caution — different severities, deliberately. */
      badge = '<span class="badge badge-warning">' + esc(hold) + "</span>";
    } else if (holdKnown === false) {
      /* Hold data could not be retrieved. The banner is omitted rather than
         reassuring: "No holds" is never rendered from missing data, because
         absence of data is not absence of a hold. */
      badge = '<span class="badge badge-secondary">Hold state unavailable</span>';
    } else {
      badge = '<span class="badge badge-secondary">No holds</span>';
    }
    return '<div class="np-person">' +
             '<p class="np-person-role">' + esc(role) + "</p>" +
             '<p class="np-person-name">' + esc(name) + "</p>" +
             '<p class="np-person-meta">' + esc(meta || "") + "</p>" +
             badge +
           "</div>";
  }

  /**
   * Populate the reason select, grouped so the outcome is visible in the list.
   *
   * REBUILDS THE NIMBUS INSTANCE AFTERWARDS. Nimbus/Select constructs its
   * custom dropdown from the native <option>s at init, and the DataAPI has
   * already run by the time `cnds.ready` fires — so options written into the
   * native element after that never reach the visible control. The native
   * select ends up correct while the dropdown the operator actually sees is
   * empty, with nothing to indicate anything is wrong.
   *
   * Disposing and re-creating the instance is what makes the options appear;
   * dispose() moves the native element back out of the wrapper, so the second
   * getOrCreateInstance builds cleanly from the populated list.
   *
   * @param {string} [selectId="npqReason"]  Pair Review by default; the Group
   *        Dispatch modal passes its own id so both offer the same governed
   *        vocabulary from one service call.
   *
   * ANGULAR: none of this survives — the options are an @Input() and the
   * component re-renders when they change.
   */
  function renderReasonOptions(selectId) {
    var sel = byId(selectId || "npqReason");
    if (!sel) return;

    sel.innerHTML = '<option value="" selected>Select a reason \u2026</option>' +
      REASON_GROUPS.map(function (g) {
        return '<optgroup label="' + esc(g.label) + '">' +
          g.options.map(function (o) {
            return '<option value="' + esc(o) + '">' + esc(o) + "</option>";
          }).join("") + "</optgroup>";
      }).join("");

    if (window.Nimbus && window.Nimbus.Select) {
      var existing = window.Nimbus.Select.getInstance(sel);
      if (existing) existing.dispose();
      window.Nimbus.Select.getOrCreateInstance(sel);
    }
  }

  /**
   * Re-evaluate the decision buttons.
   *
   * "Valid" means an option is selected, and for Other that the free-text note
   * is non-empty. SKIP is never gated — skipping needs no reason.
   */
  function syncDecision() {
    var sel = byId("npqReason");
    var same = byId("npqSamePerson");
    var notSame = byId("npqNotTheSame");
    var noteWrap = byId("npqOtherNote");
    var noteText = byId("npqOtherText");
    if (!sel || !same || !notSame) return;

    var reason = sel.value;
    var outcome = outcomeOf(reason);
    var isOther = reason === OTHER_REASON;

    if (noteWrap) noteWrap.hidden = !isOther;

    var valid = !!outcome && (!isOther || (noteText && noteText.value.trim().length > 0));

    same.disabled = !(valid && (outcome === "same" || outcome === "either"));
    notSame.disabled = !(valid && (outcome === "not-same" || outcome === "either"));
  }

  function resetDecision() {
    var sel = byId("npqReason");
    if (sel) setSelectValue(sel, "");
    var noteText = byId("npqOtherText");
    if (noteText) noteText.value = "";
    syncDecision();
  }

  /** Nimbus/Select keeps the native element but emits its own change event. */
  function setSelectValue(el, value) {
    var inst = window.Nimbus && window.Nimbus.Select && window.Nimbus.Select.getInstance(el);
    if (inst) inst.setValue(String(value));
    else el.value = String(value);
  }

  /* ─────────────────────────────────────────────────────────────────────
     CROSSFADE

     Advancing to the next record swaps the panel's whole body, and swapping
     it instantly reads as a glitch rather than a transition — the operator
     cannot tell "the next record loaded" from "the screen redrew". The fade
     is what says a DIFFERENT record is now in front of them.

     Nimbus supplies the animation: `.animate-fadeOut` / `.animate-fadeIn` off
     data-cnds-animate, both already covered by the library's
     prefers-reduced-motion guard — at that setting they collapse to 1ms and
     the swap is instant, which is correct, not degraded.

     Out then in rather than two layered copies. A true simultaneous crossfade
     needs the outgoing record absolutely positioned over the incoming one, and
     this body scrolls and contains a focusable form; overlaying two copies of
     it would put duplicate labels and two tab stops in the accessibility tree
     for the duration. The dissolve reads the same and stays one DOM.

     Duration is 175ms each way — 350ms total, matching the panel's own
     slide-in, so the record change is paced like the panel that houses it.
     ───────────────────────────────────────────────────────────────────────── */

  /* Fallback only. The real value is READ OFF THE ELEMENT — see fadeMs(). */
  var FADE_MS = 175;

  /**
   * How long one half of the swap actually takes, in ms.
   *
   * Read from the computed style rather than hard-coded, because the number
   * lives in CSS: the stylesheet derives it from Nimbus's
   * --cnds-animation-duration-faster, and the library's reduced-motion guard
   * overrides it to 1ms. A constant here would be a second copy of a value CSS
   * owns — it would silently drift on a retune, and under reduced motion the
   * script would still sit through a 175ms wait for an animation that had
   * already finished.
   */
  function fadeMs(el) {
    /* Comma-separated when several animations are declared; the fade is first. */
    var d = getComputedStyle(el).animationDuration.split(",")[0].trim();
    var n = parseFloat(d);
    if (isNaN(n)) return FADE_MS;
    var ms = /ms$/.test(d) ? n : n * 1000;
    return ms > 0 ? ms : FADE_MS;
  }

  /**
   * Swap the panel body's content behind a fade.
   *
   * @param {Promise<Function>} ready  resolves to the function that paints the
   *                                   new record
   * @returns {Promise}
   *
   * THE FADE STARTS IMMEDIATELY, and the paint waits for BOTH the fade-out and
   * the data. It does not wait for the data and then fade.
   *
   * That ordering is the whole point. The operator clicks Skip; the record has
   * to be fetched, and until it arrives the panel is still showing the pair
   * they just dismissed. Fading only once the response lands leaves the old
   * record sitting there, fully lit, for the length of a round trip — which
   * against a real API is not the 120ms the mock uses. The click would feel
   * dropped, and the fade would then look like a late apology for it.
   *
   * Starting the fade on the click makes the response immediate and puts the
   * waiting where it does no harm: at zero opacity, with nothing on screen to
   * misread. If the fetch is slower than the fade the panel simply holds there
   * a moment longer.
   *
   * `paint` therefore runs with everything already in hand — see showRecord(),
   * which is why it resolves its two requests before handing the function on.
   */
  function crossfade(ready, isCurrent) {
    var body = document.querySelector("#npqPairReview .offcanvas-body");
    if (!body) return ready.then(function (paint) { if (isCurrent()) paint(); });

    /* The panel is mid-swap: it must not accept a decision about a record that
       is fading out, nor one that has not finished arriving. */
    body.setAttribute("aria-busy", "true");
    body.classList.remove("animate-fadeIn");
    body.classList.add("animate-fadeOut");

    /* Measured AFTER the class is applied, so it reflects the rule actually
       in effect — including the reduced-motion override. */
    var faded = new Promise(function (done) { setTimeout(done, fadeMs(body)); });

    return Promise.all([ready, faded]).then(function (both) {
      /* Superseded — the operator skipped again while this one was loading.
         Leave the body faded out; the swap that overtook this one owns the
         fade back in, and painting here would flash a record already passed. */
      if (!isCurrent()) return;

      both[0]();

      /* Back to the top: the new record's legal-hold alert is the first thing
         it has to say, and inheriting the previous record's scroll offset
         would open on the middle of it. */
      body.scrollTop = 0;

      body.classList.remove("animate-fadeOut");
      body.classList.add("animate-fadeIn");
      body.removeAttribute("aria-busy");

      /* Assistive tech gets no fade, so it is told outright. */
      announceRecord("Now reviewing");
    });
  }

  /**
   * Say something to a screen reader without showing it.
   *
   * The panel title changes on every advance, but a title rewritten in place
   * is not announced — nothing was focused and nothing was navigated to. The
   * live region is what makes SKIP audible.
   */
  /** "Pair 7 of 124. Now reviewing …" — the step is spoken too, since a
      sighted operator gets it from the title space and a screen-reader user
      would otherwise have no sense of position in the walk. */
  function announceRecord(lead) {
    if (!openPair) return;
    var step = walk.at >= 0 && walk.ids.length
      ? "Pair " + (walk.at + 1) + " of " + walk.ids.length + ". " : "";
    announce(step + lead + " " + openPair.established + " and " + openPair.candidate);
  }

  function announce(message) {
    var region = byId("npqPanelStatus");
    if (!region || !message) return;
    /* Cleared first: an identical string written twice is not re-announced. */
    region.textContent = "";
    setTimeout(function () { region.textContent = message; }, 50);
  }

  /* ─────────────────────────────────────────────────────────────────────
     PANEL SKELETON

     Stands in for the RECORD while it is fetched — the two person cards, the
     comparison table and the refusal account. Same rule as the list: hold the
     shape the content will take so nothing moves when it lands.

     Three things are deliberately NOT stood in for:

       · the DECISION BAR, whose controls are real and merely disabled. A
         reason selector replaced by a grey bar would have to be rebuilt as a
         Nimbus/Select per record, and it would say the control is arriving
         when it is already there.

       · the WALKER STEP, because the position is known before the record is.
         "Pair 3 of 124" is true the moment SKIP is pressed.

       · the LEGAL HOLD alert, which stays hidden. Absence of hold data is not
         absence of a hold, and a placeholder where the alert will go would
         imply one is coming — on most records it is not.
     ───────────────────────────────────────────────────────────────────── */

  /** Nimbus's shimmer; the np-skeleton-* classes carry only geometry. */
  function skelText(extra) {
    return '<div class="skeleton skeleton-text' + (extra ? " " + extra : "") + '"></div>';
  }

  function paintPanelSkeleton() {
    var title = byId("npqPairReviewTitle");
    if (title) {
      title.innerHTML = skelText("np-skeleton-panel-title");
    }

    /* Hold is unknown until the record lands — say nothing rather than
       reserve space for a claim that may not be made. */
    var holdAlert = byId("npqHoldAlert");
    if (holdAlert) holdAlert.hidden = true;

    /* Two cards with the real arrow between them: the arrow is chrome, not
       record data, and it is the same on every pair. */
    var persons = byId("npqPersons");
    if (persons) {
      var card = '<div class="np-skeleton-person" aria-hidden="true">' +
                   skelText() +
                   skelText("np-skeleton-person-name") +
                   skelText() +
                 "</div>";
      persons.innerHTML = card +
        '<div class="np-persons-arrow" aria-hidden="true">' +
          '<i class="mdi mdi-arrow-right-thick"></i></div>' +
        card;
    }

    /* Five rows — what comparisonFor() returns for every pair, so the table
       is the height it will be. */
    var body = byId("npqCompare");
    if (body) {
      var row = "<tr aria-hidden=\"true\">" +
        '<td class="np-col-verdict">' + skelText("np-skeleton-cell") + "</td>" +
        '<td class="np-col-field">' + skelText("np-skeleton-cell") + "</td>" +
        '<td class="np-col-value">' + skelText("np-skeleton-cell") + "</td>" +
        '<td class="np-col-value">' + skelText("np-skeleton-cell") + "</td>" +
        '<td class="np-col-agree">' + skelText("np-skeleton-cell") + "</td>" +
      "</tr>";
      body.innerHTML = new Array(6).join(row);   /* 5 rows */
    }

    var on = byId("npqRefusedOn");
    if (on) on.innerHTML = skelText("skeleton-w-25");
    var reason = byId("npqRefusedReason");
    if (reason) reason.innerHTML = skelText("skeleton-w-66");
    var keys = byId("npqRefusedKeys");
    if (keys) keys.innerHTML = "<li>" + skelText("skeleton-w-50") + "</li>" +
                               "<li>" + skelText("skeleton-w-33") + "</li>";
    var note = byId("npqRefusedNote");
    if (note) note.hidden = true;
  }

  /* ─────────────────────────────────────────────────────────────────────
     LOADING A RECORD
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Load a pair and put it in the panel.
   *
   * @param {string}  pairId
   * @param {boolean} animate  true when replacing a record already on screen;
   *                           false on first open, where the panel's own
   *                           slide-in is the transition and a fade on top of
   *                           it would read as a stutter
   *
   * The pair and its comparison are fetched TOGETHER and the panel is not
   * touched until both land. Painting on the first response and again on the
   * second would show the operator a record whose evidence table belongs to
   * the previous one for as long as the second request takes.
   */
  /* Incremented per record load. Only the newest is allowed to paint — an
     operator holding Skip down starts several loads, and without this the one
     that answers last wins rather than the one they asked for last. */
  var recordToken = 0;

  function showRecord(pairId, animate) {
    var token = ++recordToken;
    var isCurrent = function () { return token === recordToken; };
    var settled = false;

    /* Decisions off for the round trip; SKIP deliberately stays live — see
       syncSkip(). The cursor has already moved, so it reports the right
       enablement for the record now being loaded. */
    setDecisionControls(false);
    syncSkip();
    /* The position is known before the record is. */
    renderStep();

    /*
     * Placeholder if the wait is long enough to notice — the same 250ms
     * threshold and the same reasoning as the list.
     *
     * Without it the panel holds the OUTGOING record's title and cards while
     * the next one is fetched, which is the stale-content problem: the
     * operator cannot tell whether they are looking at the pair they just
     * skipped or the one they skipped to. On an advance the body is mid-fade
     * when this fires, so the skeleton is what the fade lands on rather than
     * a blank panel.
     */
    var pending = setTimeout(function () {
      if (isCurrent() && !settled) paintPanelSkeleton();
    }, SKELETON_DELAY_MS);

    /* Both requests, in parallel, and the panel is not touched until BOTH
       land. Painting on the first response and again on the second would show
       the operator a record whose evidence table still belongs to the previous
       one for as long as the second request takes. */
    var ready = Promise.all([svc.pair(pairId), svc.comparison(pairId)])
      .then(function (both) {
        settled = true;
        clearTimeout(pending);
        var pair = both[0];
        if (!pair) return null;
        return function () {
          /* Straight swap, no second fade. The skeleton already holds this
             record's shape, so nothing moves — a fade would smooth a change
             that does not displace anything, and stacking it on top of the
             crossfade makes every advance feel slower than it is. */
          renderPanel(pair, both[1]);
          resetDecision();
          setDecisionControls(true);
          syncSkip();
        };
      });

    if (!animate) {
      return ready.then(function (paint) {
        if (!isCurrent()) return;
        if (!paint) return missingRecord();
        paint();
        announceRecord("Reviewing");
      });
    }

    /* A null paint means the record vanished between the worklist and this
       fetch. The fade has already started, so it is given something to fade
       back in to rather than being left holding at zero. */
    var gone = false;
    return crossfade(ready.then(function (paint) {
      if (paint) return paint;
      gone = true;
      return function () {};
    }), isCurrent).then(function () {
      if (gone && isCurrent()) return missingRecord();
    });
  }

  /**
   * The record is no longer there — decided in another tab, or withdrawn by a
   * re-ingestion between the worklist being built and this fetch.
   *
   * Said plainly and the walk continues. Stranding the operator on a blank
   * panel, or closing on them, both punish them for someone else's write.
   */
  function missingRecord() {
    toast("That pair is no longer in the queue.", { color: "info" });
    return advance();
  }

  /**
   * SKIP's enablement, which has exactly ONE cause: is there a next record?
   *
   * It is deliberately NOT disabled while a record is loading. An operator
   * clearing a queue holds Skip down, and a control that goes dead for every
   * round trip drops those presses on the floor — they get a button that
   * ignores them intermittently, which is worse than a slow one. Each press
   * advances the cursor; the load that overtakes its predecessor is the only
   * one allowed to paint (see the record token in showRecord).
   *
   * The decision buttons are the opposite case and DO gate on the round trip:
   * a stray click there records a verdict, and against the wrong pair. Skipping
   * records nothing about the pair, so an extra one costs a position in a
   * queue the operator is already discarding.
   */
  function syncSkip() {
    var skip = byId("npqSkip");
    if (!skip) return;
    var hasNext = !!nextInWalk();
    skip.disabled = !hasNext;
    skip.title = hasNext ? "" : "This is the last record in this queue";
  }

  /**
   * The two decision buttons, held off for the duration of a write or a swap.
   *
   * Off means off: a click landing mid-swap would record a verdict against
   * whichever pair `openPair` still points at, which is the previous one.
   * Back on, it defers to the reason matrix rather than enabling both.
   */
  function setDecisionControls(enabled) {
    if (enabled) {
      syncDecision();
    } else {
      setDisabled("npqSamePerson", true);
      setDisabled("npqNotTheSame", true);
    }
  }

  /**
   * Move to the next record in the walk.
   *
   * @returns {Promise}
   *
   * The panel closes ONLY when the walk is exhausted. That is the whole
   * behaviour: an operator adjudicating a queue of thousands should not have
   * to reopen the panel between records, and closing after each one turns a
   * queue into a series of round trips through the list.
   */
  function advance() {
    var nextId = nextInWalk();
    if (!nextId) {
      toast("That was the last record in this queue.", { color: "info" });
      closePairReview();
      return Promise.resolve();
    }
    walk.at += 1;
    return showRecord(nextId, true);
  }

  /**
   * Open the panel on a record and start the walk.
   *
   * @param {string}   startId  the pair to open on
   * @param {string[]} ids      the worklist, in order
   * @param {string}   groupId  set when opened from a group row
   */
  function openPairReview(startId, ids, groupId) {
    if (!startId) return;

    walk.ids = ids && ids.length ? ids.slice() : [startId];
    walk.at = walk.ids.indexOf(startId);
    if (walk.at === -1) { walk.ids.unshift(startId); walk.at = 0; }
    walk.groupId = groupId || null;

    var el = byId("npqPairReview");
    /* Shown first, then filled: the panel's slide-in and the fetch run
       together rather than end to end, so the operator does not wait on a
       round trip before anything moves. */
    if (el && window.Nimbus && window.Nimbus.Offcanvas) {
      window.Nimbus.Offcanvas.getOrCreateInstance(el).show();
    }
    showRecord(startId, false);
  }

  function closePairReview() {
    walk = { ids: [], at: -1, groupId: null };
    openPair = null;
    var el = byId("npqPairReview");
    if (el && window.Nimbus && window.Nimbus.Offcanvas) {
      var inst = window.Nimbus.Offcanvas.getInstance(el);
      if (inst) inst.hide();
    }
    /* The list was frozen while the panel was open, so anything decided during
       the walk is not reflected in it yet. Refreshed on the way out rather
       than per decision: re-rendering under an open panel would move the rows
       the operator is about to come back to. */
    refreshStats();
    render();
  }

  function wirePairReview() {
    onSelectChange(byId("npqReason"), syncDecision);
    var noteText = byId("npqOtherText");
    if (noteText) noteText.addEventListener("input", syncDecision);

    bindDecision("npqSamePerson", "SAME_PERSON", "Same person");
    bindDecision("npqNotTheSame", "NOT_THE_SAME", "Not the same");

    /**
     * SKIP — loads the next record to be adjudicated. It does NOT close the
     * panel.
     *
     * Skipping is not a decision: the pair stays Pending, the Pending count
     * does not move, and no reason is required — which is why SKIP is the one
     * control in the decision bar that is never gated on the reason selector.
     *
     * It is still recorded. Without the write, a pair everyone skips is
     * indistinguishable from one nobody has reached.
     *
     * Disabled on the last record of the walk, where there is nothing to skip
     * to. It is disabled rather than hidden: a control that vanishes from the
     * decision bar shifts the two buttons beside it at the moment the operator
     * is aiming at them.
     */
    var skip = byId("npqSkip");
    if (skip) {
      skip.addEventListener("click", function () {
        if (skip.disabled || !openPair) return;
        var pairId = openPair.id;

        /* The advance does NOT wait on the skip write, unlike a decision.
           Skipping changes nothing about the pair — it stays Pending either
           way — so there is no state the next record could contradict, and
           making the operator wait on a write whose only purpose is telemetry
           would put a round trip in front of every pass.

           A decision is the opposite case and does wait: see bindDecision(). */
        advance();

        svc.skip(pairId)["catch"](function () {
          /* Not silent. The pair is unaffected, but "nobody has reached this"
             and "everyone passes on this" are different facts about the queue,
             and the second one is now not recorded. Transient: nothing about
             the operator's work is wrong, so it does not need dismissing. */
          toast("The skip could not be recorded. The pair is unchanged.",
                { color: "caution" });
        });
      });
    }

    /* Closing by any route — the header X, the footer button, Escape, the
       backdrop — has to end the walk and refresh the list, so it is caught on
       the component's own event rather than on each control. */
    var el = byId("npqPairReview");
    if (el) {
      el.addEventListener("hidden.cnds.offcanvas", function () {
        walk = { ids: [], at: -1, groupId: null };
        openPair = null;
      });
    }
  }

  /**
   * Wire one decision button.
   *
   * @param {string} id       element id
   * @param {string} verdict  the API value — SAME_PERSON | NOT_THE_SAME
   * @param {string} label    what to call it in the acknowledgement
   *
   * Recording a decision ADVANCES, exactly as SKIP does. The operator is
   * working a queue; having decided one pair, the next thing they want is the
   * next pair, not the list they were on two clicks ago.
   *
   * NOTHING MERGES HERE. "Same person" writes an adjudication record only —
   * merge execution ships in #17474. That sequencing must never reach the
   * screen as copy, but the acknowledgement does have to be truthful about
   * what happened, which is why it says nothing has been merged.
   */
  function bindDecision(id, verdict, label) {
    var btn = byId(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (btn.disabled || !openPair) return;

      var sel = byId("npqReason");
      var reason = sel ? sel.value : "";
      if (reason === OTHER_REASON) {
        var t = byId("npqOtherText");
        reason = t ? t.value.trim() : reason;
      }

      var pairId = openPair.id;
      /* Held off for the round trip: without this, a double click records the
         decision twice, and the second lands after the panel has advanced —
         against the NEXT pair. SKIP is not held off; see syncSkip(). */
      setDecisionControls(false);

      /* WAITS on the write, unlike SKIP. Advancing before the server has the
         decision would show the operator the next record as confirmation that
         the last one was recorded — and if it was not, they have no way of
         knowing which pair to go back to. */
      svc.recordDecision(pairId, verdict, reason).then(function () {
        /* SAME PERSON is CAUTION, not success: the record is written but the
           merge is not executed, and caution is this system's colour for
           "something is still outstanding". It matches the row tone the list
           gives that same state. NOT THE SAME is complete, so it is success.
           Neither is danger — see toast(). */
        if (verdict === "SAME_PERSON") {
          toast(label + " recorded \u2014 " + reason +
                ". Nothing has been merged yet.", { color: "caution" });
        } else {
          toast(label + " recorded \u2014 " + reason + ".", { color: "success" });
        }
        return advance();
      })["catch"](function () {
        /* PERSISTS: the operator has to know the decision did not land, and an
           error that removes itself after five seconds can be missed entirely
           — they would carry on believing the pair was adjudicated. */
        toast("The decision could not be recorded. Nothing has changed.",
              { color: "danger", persist: true });
        setDecisionControls(true);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     10 · GROUP DISPATCH

     Records NOT_THE_SAME for every STILL-PENDING pair in one signature group.
     Figma: Nimbus/Modal — group-dispatch (12807:11156).

     Two rules the whole design turns on, and both are easy to lose:

       · THE COUNT IS THE REMAINDER, never the group total. On a partially
         decided group the confirm field, the submit label and the write all
         use the pairs that are still pending. A group row reading "124 pairs"
         whose modal asks for 124 when only 96 remain would take a number the
         operator can read off the row and make it wrong.

       · SAME PERSON IS DISABLED, NOT ABSENT. A same-person decision creates a
         merge backlog that cannot be undone, because merge execution — and so
         un-merge — does not exist (#17474). The disabled option carries the
         explanation; hiding it would lose it.

     ANGULAR: GroupDispatchModalComponent, @Input() group, @Output() dispatched.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Above this many pairs, a group is more likely a matching-rule problem than
     N separate judgements, and the modal says so. */
  var DISPATCH_HINT_THRESHOLD = 500;

  /* The group currently in the modal, plus the remainder it is deciding. */
  var dispatchGroup = null;
  var dispatchCount = 0;

  function openGroupDispatch(groupId) {
    var el = byId("npqDispatch");
    if (!el || !groupId) return;

    /* The worklist IS the remainder — it returns only adjudicable pairs, and
       only those under the current filters. Same source the walk uses, so the
       modal cannot disagree with what REVIEW would open. */
    Promise.all([
      svc.query(currentQuery()),
      svc.worklist(currentQuery(), groupId)
    ]).then(function (both) {
      var rows = both[0].rows || [];
      var group = null;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === groupId) group = rows[i];
      if (!group) return;

      dispatchGroup = group;
      dispatchCount = both[1].length;

      if (!dispatchCount) {
        toast("Nothing left to decide in this group.", { color: "info" });
        return;
      }

      renderDispatch();
      if (window.Nimbus && window.Nimbus.Modal) {
        window.Nimbus.Modal.getOrCreateInstance(el).show();
      }
    });
  }

  function renderDispatch() {
    var g = dispatchGroup, n = dispatchCount;
    setText("npqDispatchGroup", g.name);

    /* Count · key types · reason — the evidence line from the row, so the
       modal and the row describe the group the same way. */
    var bits = [formatCount(n) + " pairs"];
    if (g.matchedOn && g.matchedOn.length) bits.push(g.matchedOn.join(" \u00b7 "));
    if (g.reason) bits.push(g.reason);
    setText("npqDispatchMeta", bits.join("  \u00b7  "));

    /* Edge state 6. The row says the group total, this modal acts on the
       pending remainder, and where those differ the difference is stated
       rather than left to be noticed. Already-decided pairs are named as
       untouched because the fear this modal has to answer is "am I about to
       overwrite the decisions I already made?" */
    var remainder = byId("npqDispatchRemainder");
    if (remainder) {
      var already = g.decidedCount || 0;
      remainder.hidden = !already;
      if (already) {
        remainder.textContent =
          "This group holds " + formatCount(g.total) + " pairs and " +
          formatCount(already) + " are already decided. Recording " +
          formatCount(n) + " decisions here affects the pending remainder only — " +
          "already-decided pairs are untouched.";
      }
    }

    setText("npqOutcomeNotSameDesc",
      "Records NOT_SAME for all " + formatCount(n) + " pairs and permanently " +
      "suppresses them from re-matching. Fully applied immediately.");

    var hint = byId("npqDispatchHint");
    if (hint) {
      var over = n >= DISPATCH_HINT_THRESHOLD;
      hint.hidden = !over;
      if (over) setText("npqDispatchHintText",
        "A group this size usually indicates a matching-rule issue rather than " +
        formatCount(n) + " separate judgements. Consider raising the key policy " +
        "before deciding.");
    }

    /* Helper says the exact string to type — the count without separators,
       because that is what has to be matched. */
    setText("npqDispatchConfirmHelp", "Enter " + n);
    var confirm = byId("npqDispatchConfirm");
    if (confirm) confirm.value = "";

    var sel = byId("npqDispatchReason");
    if (sel) setSelectValue(sel, "");

    /* Cleared and re-hidden on every open. A note left over from the last
       group would be attached to this one's decisions the moment "Other" was
       chosen again. */
    var noteText = byId("npqDispatchOtherText");
    if (noteText) noteText.value = "";
    /* Shut WITHOUT animating — the modal is not on screen yet, so there is
       nothing to slide, and leaving .show on would open the next group's modal
       with a stale note already visible. */
    var noteWrap = byId("npqDispatchOtherNote");
    if (noteWrap) noteWrap.classList.remove("show", "collapsing");

    /* The third appearance of the count. */
    setText("npqDispatchSubmit", "Record " + formatCount(n) + " decisions");
    syncDispatch();
  }

  /**
   * Submit is enabled only when a reason is chosen AND the typed value equals
   * the remainder EXACTLY.
   *
   * Exactly means exactly: no separators, no whitespace tolerance beyond
   * trimming, no "close enough". The typing is the friction, and a forgiving
   * comparison removes the friction while keeping the ceremony.
   */
  /**
   * Put focus on a Nimbus Select.
   *
   * The <select> itself is not what the operator sees or tabs to — Select
   * replaces it with an `input.select-input` trigger and leaves the native
   * element in the DOM as the value holder. Focusing the native element would
   * move focus to something invisible, so the trigger is the target.
   *
   * Falls back to the element itself if the component is not mounted, which is
   * the pre-Nimbus.ready case rather than an error.
   */
  /**
   * Slide the note open or shut.
   *
   * Nimbus/Collapse rather than a height transition of our own — the 0.35s
   * step in css/core/transitions.css is the same one the row removal uses, so
   * everything on this screen that changes height changes it at one pace.
   *
   * Degrades to an instant show/hide if the component has not loaded: a note
   * that cannot animate is a smaller problem than a required field that never
   * appears.
   *
   * ANGULAR: either keep Nimbus/Collapse via a directive, or use the
   * @angular/animations equivalent — a height 0 <-> * trigger at 350ms so it
   * matches the row-removal step. Whichever you pick, the collapsed state must
   * be display:none (or the element removed), or the parent field's 4px column
   * gap lingers under the select while the note is closed.
   */
  function toggleNote(wrap, open) {
    var C = window.Nimbus && window.Nimbus.Collapse;
    if (!C) {
      wrap.classList.toggle("show", open);
      return;
    }
    var inst = C.getOrCreateInstance(wrap, { toggle: false });
    if (open) inst.show();
    else inst.hide();
  }

  /**
   * Focus the note once the Select has finished closing.
   *
   * Not optional deferral: Select returns focus to its own trigger AFTER it
   * dispatches `change`, so focusing the note synchronously from the change
   * handler is undone a moment later and the caret ends up back on the select.
   * A task boundary lets the component settle first.
   *
   * Guarded, because by the time it runs the operator may have moved on — a
   * fast tab, or a click straight into the confirmation field. What it protects
   * against is yanking the caret out of a control someone is already typing in;
   * it is NOT a check for a particular resting place. Choosing an option
   * legitimately leaves focus on the select's trigger, on the modal container,
   * or nowhere, depending on whether the option was clicked or typed — so the
   * test is "is focus in some OTHER form control", not "is focus where I
   * expect".
   *
   * ANGULAR: the deferral is still required — Select returns focus to its own
   * trigger after the change event, so focusing from (ngModelChange) is undone.
   * Use the collapse animation's done event (or afterNextRender) rather than a
   * setTimeout, and keep the "is focus in some other form control" guard.
   */
  function focusNoteSoon(noteText, sel, wrap) {
    var land = function () {
      if (!noteText) return;
      var scope = sel && (sel.closest(".select-wrapper") || sel.parentNode);
      var trigger = scope ? scope.querySelector(".select-input") : null;
      var active = document.activeElement;
      var inAnotherField = active && active !== trigger &&
                           /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(active.tagName);
      if (inAnotherField) return;
      noteText.focus();
    };

    /* On the slide finishing, not during it: focusing a growing element makes
       the browser scroll it into view against a height that is still changing.
       `once` because syncDispatch reveals the note again on any later switch
       back to Other, and a listener left behind would fire for that one too. */
    if (wrap) {
      wrap.addEventListener("shown.cnds.collapse", function () {
        setTimeout(land, 0);
      }, { once: true });
      /* Fallback for the no-Collapse path, where no event ever arrives. */
      if (!(window.Nimbus && window.Nimbus.Collapse)) setTimeout(land, 0);
      return;
    }
    setTimeout(land, 0);
  }

  function focusSelect(sel) {
    if (!sel) return;
    var scope = sel.closest(".select-wrapper") || sel.parentNode;
    var trigger = scope ? scope.querySelector(".select-input") : null;
    (trigger || sel).focus();
  }

  function syncDispatch() {
    var sel = byId("npqDispatchReason");
    var confirm = byId("npqDispatchConfirm");
    var submit = byId("npqDispatchSubmit");
    if (!submit) return;

    /* "Other" reveals a note and REQUIRES it, the same rule the panel applies
       to a single decision — see setDecisionControls(). A bulk decision is the
       one that least deserves a weaker justification than a single one: this
       records N adjudications at once, and "Other" with nothing after it is not
       a reason anybody can audit later. */
    var reason = sel ? sel.value : "";
    var isOther = reason === OTHER_REASON;
    var noteWrap = byId("npqDispatchOtherNote");
    var noteText = byId("npqDispatchOtherText");
    if (noteWrap) {
      /* Nimbus/Collapse, so the note slides in and out rather than appearing.
         State is read off .show rather than a flag of our own: the component
         owns it, and syncDispatch runs on every keystroke in the confirmation
         field — asking it to re-open an already-open note would restart the
         animation on each one. */
      var wasOpen = noteWrap.classList.contains("show");
      if (isOther !== wasOpen) toggleNote(noteWrap, isOther);

      /* Focus follows the field that is now the operator's next move.
         Opening: the note is the only thing left to fill in, and "Other" chosen
         without typing is not a reason — so land the caret in it rather than
         making them find a field that slid in under the cursor.
         Closing: focus was inside a control that has just gone away. Left
         alone it falls to <body> and the keyboard loses its place entirely;
         it belongs on the select that caused the change. */
      if (isOther && !wasOpen && noteText) focusNoteSoon(noteText, sel, noteWrap);
      else if (!isOther && wasOpen) focusSelect(sel);
    }

    var hasReason = !!reason &&
                    (!isOther || (noteText && noteText.value.trim().length > 0));
    var typed = confirm ? confirm.value.trim() : "";
    submit.disabled = !(hasReason && typed === String(dispatchCount));
  }

  /**
   * What actually gets recorded as the reason.
   *
   * For "Other" the stored value is the operator's note, not the literal
   * "Other — add a note" — that string is a menu label, and filing N decisions
   * under it would leave the queue's own Reason facet full of a word that
   * explains nothing.
   *
   * ANGULAR: map it at SUBMIT, not in the form model — the select's value
   * stays the label so the control still reflects what was chosen. A getter on
   * the component (`get reasonToSend()`) keeps the mapping in one place and out
   * of the template.
   */
  function dispatchReasonValue() {
    var sel = byId("npqDispatchReason");
    var reason = sel ? sel.value : "";
    if (reason !== OTHER_REASON) return reason;
    var noteText = byId("npqDispatchOtherText");
    return noteText ? noteText.value.trim() : "";
  }

  function wireGroupDispatch() {
    var el = byId("npqDispatch");
    if (!el) return;

    onSelectChange(byId("npqDispatchReason"), syncDispatch);
    var confirm = byId("npqDispatchConfirm");
    if (confirm) confirm.addEventListener("input", syncDispatch);
    /* Typing in the note has to re-gate Submit — without this the button stays
       disabled while the operator looks at a filled-in field. */
    var note = byId("npqDispatchOtherText");
    if (note) note.addEventListener("input", syncDispatch);

    var submit = byId("npqDispatchSubmit");
    if (submit) {
      submit.addEventListener("click", function () {
        if (submit.disabled || !dispatchGroup) return;
        var reason = dispatchReasonValue();
        var groupId = dispatchGroup.id, n = dispatchCount;

        submit.disabled = true;
        svc.dispatchGroup(groupId, reason, n).then(function () {
          hideDispatch();
          /* Auto-dismisses. The decided row and the updated counts are the
             durable record; the toast is only the acknowledgement. */
          toast("Group decided \u2014 " + formatCount(n) +
                " pairs recorded as not the same person.", { color: "success" });
          refreshStats();
          render();
        })["catch"](function (err) {
          hideDispatch();
          /* PERSISTS. An error must not disappear on a timer, and on a partial
             failure the counts reflect only what committed — so the operator
             has to be able to read this at their own pace. */
          toast("An error has occurred. " +
                ((err && err.message) || "The group was not decided."),
                { color: "danger", persist: true });
          refreshStats();
          render();
        });
      });
    }

    el.addEventListener("hidden.cnds.modal", function () {
      dispatchGroup = null;
      dispatchCount = 0;
    });
  }

  function hideDispatch() {
    var el = byId("npqDispatch");
    if (el && window.Nimbus && window.Nimbus.Modal) {
      var inst = window.Nimbus.Modal.getInstance(el);
      if (inst) inst.hide();
    }
  }

  /** Small helper — set an element's text if it exists. */
  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     11 · MEASUREMENT PANEL

     Read-only, tenant-wide. Figma: Nimbus/Offcanvas — measurement, 1080 wide.

     THE QUEUE'S FILTERS DO NOT REACH IT — measurement() takes no query, so
     there is nothing to pass and nothing to forget to strip. That is the
     safest form of the rule: it cannot be got wrong later by someone adding a
     parameter "for consistency".

     ANGULAR: MeasurementPanelComponent + MeasurementService; a pure read.
     ═══════════════════════════════════════════════════════════════════════ */

  var measureChart = null;
  /* Supersedes an in-flight measurement() when the panel is reopened. */
  var measureToken = 0;

  /*
 * Chart colours come from the library, not from this page.
 *
 * Nimbus.Chart reads --cnds-chart-color-1..10 off the .chart element, and
 * <body class="cnds-product-casefusion"> supplies CaseFusion's default
 * charting palette. The page used to declare a seven-step purple ramp and
 * reverse it for dark mode; both jobs now belong to charts.css, where slot 1
 * is the step furthest from the page ground in either theme.
 */


  /**
   * Placeholder for the measurement panel.
   *
   * The panel slides in before its numbers exist, and it can be reopened after
   * decisions have moved them. Without a placeholder the operator reads the
   * PREVIOUS session's rollups for as long as the request takes — the stale
   * content problem the panel's own rebuild-don't-update rule guards against
   * further down. Every count is emptied, not left at its last value.
   *
   * Nimbus supplies every class: .skeleton, .skeleton-text, .skeleton-rect and
   * the .skeleton-w-* widths. Geometry lives in the stylesheet.
   *
   * ANGULAR: an *ngIf on `loading$` swapping a <cf-measurement-skeleton> for
   * the content. Keep the 250ms hold — bind it off an observable that only
   * emits `true` after a delay (race the request against timer(250)) so a fast
   * response never flashes a placeholder. Keep the chart's reserved height too,
   * or the signal note and the table below jump 320px when it paints.
   */
  function paintMeasureSkeleton() {
    ["npqMeasurePending", "npqMeasureSame", "npqMeasureNotSame",
     "npqMeasureTotal"].forEach(function (id) {
      var el = byId(id);
      if (el) el.innerHTML = skelText("np-skeleton-stat");
    });

    /* Seven rows — measurement() reports one per key type and MOCK_FACETS
       .keyType is a fixed set of seven, so the table is the height it will be
       when it lands. A live facet list would make this a query, not a guess. */
    var body = byId("npqMeasureRows");
    if (body) {
      var row = "<tr aria-hidden=\"true\">" +
        "<td>" + skelText("np-skeleton-cell") + "</td>" +
        new Array(5).join('<td class="np-num">' + skelText("np-skeleton-cell") + "</td>") +
      "</tr>";
      body.innerHTML = new Array(8).join(row);   /* 7 rows */
    }

    /* A block the height the chart will be. Reserving it stops the signal note
       and the table below from jumping down 320px when the chart paints. */
    var host = byId("npqMeasureChart");
    if (host) {
      if (measureChart && measureChart.dispose) measureChart.dispose();
      measureChart = null;
      host.innerHTML =
        '<div class="skeleton skeleton-rect np-skeleton-chart" aria-hidden="true"></div>';
    }

    /* Hidden, not skeletoned: whether there IS a signal is the finding. A
       placeholder here would promise a conclusion before one has been drawn. */
    var sig = byId("npqMeasureSignal");
    if (sig) sig.hidden = true;
  }

  function openMeasurement() {
    var el = byId("npqMeasurePanel");
    if (!el) return;

    if (window.Nimbus && window.Nimbus.Offcanvas) {
      window.Nimbus.Offcanvas.getOrCreateInstance(el).show();
    }

    /* Held back by the same 250ms as the list and the pair panel — under a
       quarter-second the response reads as instant and a placeholder that
       appears and vanishes is worse than no placeholder at all. */
    var token = ++measureToken;
    var settled = false;
    var pending = setTimeout(function () {
      if (token === measureToken && !settled) paintMeasureSkeleton();
    }, SKELETON_DELAY_MS);

    svc.measurement().then(function (m) {
      settled = true;
      clearTimeout(pending);
      /* A reopen while the first request is in flight supersedes it; painting
         both would render the older response second. */
      if (token !== measureToken) return;
      renderMeasurement(m);
    });
  }

  function renderMeasurement(m) {
    setCount("npqMeasurePending", m.rollups.pending);
    setCount("npqMeasureSame", m.rollups.samePerson);
    setCount("npqMeasureNotSame", m.rollups.notTheSame);
    setCount("npqMeasureTotal", m.rollups.total);

    /* Zero rows are KEPT and are not dimmed — a key that never fires is a
       finding, and greying it would say "ignore this" about evidence. */
    var body = byId("npqMeasureRows");
    if (body) {
      body.innerHTML = m.byKeyType.map(function (r) {
        return "<tr>" +
          "<td>" + esc(r.keyType) + "</td>" +
          '<td class="np-num">' + formatCount(r.pending) + "</td>" +
          '<td class="np-num">' + formatCount(r.samePerson) + "</td>" +
          '<td class="np-num">' + formatCount(r.notTheSame) + "</td>" +
          '<td class="np-num">' + formatCount(r.total) + "</td>" +
        "</tr>";
      }).join("");
    }

    var host = byId("npqMeasureChart");
    if (host && window.Nimbus && window.Nimbus.Chart) {
      /* Rebuilt rather than updated: the panel can reopen after decisions have
         changed the numbers, and a stale chart beside fresh rollups is exactly
         the disagreement the rollup rule exists to prevent. */
      if (measureChart && measureChart.dispose) measureChart.dispose();
      host.innerHTML = "";
      measureChart = new window.Nimbus.Chart(host, {
        type: "bar",
        stacked: true,          /* parts of a whole — the total is the point */
        labels: m.trend.labels,
        datasets: m.trend.datasets,
        height: 320,
        showLegend: true
        /* No `colors`: the chart inherits CaseFusion's default charting palette
           from .cnds-product-casefusion on <body>, read by Nimbus.Chart off the
           .chart element. Slot 1 is the step furthest from the page ground in
           BOTH themes, so a seven-series stack takes seven visible steps
           without the page reversing anything. */
      });
    }

    /* The panel's conclusion. Hidden when there is no signal to make, rather
       than shown empty — an empty argument reads as "we checked and found
       nothing", which is a different claim from "we could not check". */
    var sig = byId("npqMeasureSignal");
    if (sig) {
      if (m.signal) {
        sig.hidden = false;
        sig.innerHTML = "<strong>Policy signal.</strong> A key type producing high volume " +
          "and near-zero same-person outcomes is a policy signal, not a workload. " +
          esc(m.signal.keyType) + ": " + formatCount(m.signal.produced) + " produced, " +
          formatCount(m.signal.confirmedSame) + " confirmed same person.";
      } else {
        sig.hidden = true;
      }
    }
  }

  /**
   * Elevation, handed between the two sticky bands.
   *
   * The shadow belongs to whichever band is currently the LOWEST stuck one,
   * because that is the edge the content is passing under:
   *
   *   scrollY 0            no band is stuck          → no shadow
   *   scrolling, tools not yet pinned                → shadow on the TITLE
   *   tools pinned flush beneath the title           → shadow on the TOOLS
   *
   * Never both. A shadow under the title while the tools sit flush beneath it
   * would fall between two touching bars — the same defect that took the
   * shadow off the frame's utility header.
   *
   * The handoff is smooth rather than a snap because both bands carry the same
   * box-shadow transition: the title's fades out over the same 0.15s the
   * tools' fades in, so the shadow reads as sliding down from one to the other.
   *
   * "Stuck" is read from geometry, not from a scroll threshold: a sticky
   * element's top equals its own offset exactly once it pins. That way the
   * handoff stays correct whatever the stats and alert above it measure, and
   * it needs no constant to keep in step with the layout.
   *
   * ANGULAR: @HostListener('window:scroll') on the page component, driving
   * [class.np-header-elevated] on each band.
   */
  function wireHeaderElevation() {
    var title = byId("npqHeader");
    var tools = byId("npqTools");
    if (!title || !tools) return;

    /* Remember the last state so the handler does no classList work on the
       vast majority of scroll events. */
    var current = "";

    function lowestStuckBand() {
      if (!window.scrollY) return "";
      var offset = parseFloat(getComputedStyle(tools).top) || 0;
      /* Half a pixel of tolerance: sub-pixel layout can leave the stuck top a
         hair off its offset, and an exact comparison flickers. */
      return tools.getBoundingClientRect().top <= offset + 0.5 ? "tools" : "title";
    }

    function sync() {
      var next = lowestStuckBand();
      if (next === current) return;
      current = next;
      title.classList.toggle("np-header-elevated", next === "title");
      tools.classList.toggle("np-header-elevated", next === "tools");
    }

    window.addEventListener("scroll", sync, { passive: true });
    /* Layout changes move the handoff point, and a reload can restore a scroll
       position part-way down. */
    window.addEventListener("resize", sync, { passive: true });
    sync();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════════════ */

  /** Pull the counts and repaint the tiles and the alert from one object. */
  function refreshStats() {
    return svc.stats().then(function (s) {
      stats = s;
      renderStats(stats);
      renderUnmergedAlert(stats);
    });
  }

  function init() {
    /* The service is a hard dependency — without it the screen has nothing to
       show, and failing loudly here is better than four empty panels. */
    svc = (window.CaseFusion || {}).PendingMatchService;
    if (!svc) {
      throw new Error("PendingMatchService is missing — is " +
                      "js/pages/pge-admin-natprsn-queue.data.js loaded before this file?");
    }

    /* Everything the screen needs on load, fetched in PARALLEL. These are four
       independent endpoints; chaining them would make the screen wait for the
       sum rather than the slowest.

       Wiring happens FIRST, so a control clicked while the data is still in
       flight is already bound rather than inert. */
    wireViewToggle();
    wireFilters();
    wirePager();
    wireRowActions();
    wirePairReview();
    wireGroupDispatch();

    refreshStats();

    /* Filter menus are built from the tenant's own facet values. Until they
       land every filter reads "…: All", which is true — nothing is selected. */
    svc.facets().then(function (facets) {
      FILTERS.forEach(function (f) { f.options = facets[f.key] || []; });
      renderFilterMenus();
      renderFilterButtons();
    });

    /* The decision vocabulary is governed server-side, so the selector is
       populated from it rather than declared in the page. */
    svc.reasons().then(function (groups) {
      REASON_GROUPS = groups;
      renderReasonOptions();
      /* The dispatch modal offers the same governed vocabulary as Pair Review —
         one list, so a group decision and a pair decision are reported on the
         same terms. */
      renderReasonOptions("npqDispatchReason");
    });

    render();

    syncToolsOffset();
    window.addEventListener("resize", syncToolsOffset, { passive: true });

    wireHeaderElevation();
  }

  /**
   * Select, Offcanvas and Toast are all touched from init(), and Nimbus loads
   * its components asynchronously — so this waits for `cnds.ready` unless the
   * classes are already present.
   */
  if (window.Nimbus && window.Nimbus.Select) init();
  else document.addEventListener("cnds.ready", init, { once: true });
}());
