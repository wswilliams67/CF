/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-identities.js
 * Screen:  Admin › Natural Persons › Identities   (#17475)
 * Figma:   CaseFusion v1.5 — Tenant Manager, section 12457:6785
 *
 * WHAT THIS FILE OWNS
 * ───────────────────
 * The three tabs and everything inside them. Frame chrome (header, sidenav,
 * theme, notifications) is NOT here — it lives in js/pages/frame-ca-sidenav.js
 * and is shared by every 1.6 page.
 *
 * THE SCREEN IS READ-ONLY. Nothing here writes. Merge navigates to #17474,
 * pending-match adjudication is #17515's pair review, and the audit log is
 * immutable by FR-95. There is no decision path in this file and there should
 * never be one.
 *
 * SECTIONS, in the order they appear
 *   §1  Data access + helpers
 *   §2  Person header
 *   §3  Tabs — lazy loading and the count in the label
 *   §4  Skeletons
 *   §5  Identities tab
 *   §6  Pending matches tab
 *   §7  History tab
 *   §8  Identity detail panel
 *   §9  Wiring + init
 *
 * A bare §N means a section OF THIS FILE. References to the stylesheet are
 * written "the stylesheet's §N" — it has its own numbering.
 *
 * HOW THE ASYNC IS HANDLED — the same two rules as the queue screen:
 *   · responses can land out of order, so each tab carries a request token and
 *     only the newest response is allowed to paint;
 *   · a tab is fetched the FIRST time it is opened, not on page load. Three
 *     queries against one person on entry is three times the wait for two
 *     tabs the operator may never open.
 * ==========================================================================*/

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════════
     1 · DATA ACCESS + HELPERS
     ═══════════════════════════════════════════════════════════════════════ */

  var svc = null;

  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Locale-formatted integer, e.g. 1042 → "1,042". */
  function formatCount(n) {
    return typeof n === "number" ? n.toLocaleString("en-US") : String(n || "");
  }

  /**
   * How long a query may take before a skeleton is shown.
   *
   * Under a quarter-second a response reads as instant, and a placeholder that
   * appears and vanishes is worse than no placeholder. Same threshold and same
   * reasoning as the queue screen.
   */
  var SKELETON_DELAY_MS = 250;

  /**
   * Per-tab query state. Each tab owns its own paging, search and sort — they
   * are separate lists that happen to share a person, and carrying one page
   * number across all three would put an operator on page 3 of a list they
   * just opened.
   */
  /* ANGULAR: this whole object becomes component state — one signal or
     BehaviorSubject per tab holding {query, result, loaded}. `loaded` exists so
     a tab fetches once on first reveal rather than on every switch; in Angular
     that is the same guard, not a router resolver, because the tabs are one
     route and a resolver would fetch all three up front. */
  var state = {
    /* Identities open ASCENDING on Source, because "Source" ascending IS the
       payload's own order — the list starts as the backend sent it, and the
       control says so rather than the order being unexplained. The other two
       open descending: newest first is what a queue and a ledger both want. */
    identities: { page: 1, pageSize: 10, search: "", sort: "source", dir: "asc",
                  pageCount: 1, token: 0, loaded: false },
    candidates: { page: 1, pageSize: 10, search: "", show: "all", sort: "strength",
                  dir: "desc", pageCount: 1, token: 0, loaded: false },
    history:    { page: 1, pageSize: 10, search: "", show: "all", sort: "at",
                  dir: "desc", pageCount: 1, token: 0, loaded: false }
  };

  var person = null;

  /* ═══════════════════════════════════════════════════════════════════════
     2 · PERSON HEADER
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Name, then one muted line of context.
   *
   * The counts are the person's UNFILTERED totals and are never recomputed
   * from a tab's rows. They answer "how big is this person" — a number that
   * moved when the operator typed in a search box would stop being a reference
   * and become just another view statistic. Each tab's own filtered count
   * lives in its toolbar, as "Total: N".
   *
   * ANGULAR: a presentational component with @Input() person; it has no
   * dependency on any tab.
   */
  function renderPerson(p) {
    person = p;
    var name = byId("npiPersonName");
    var meta = byId("npiPersonMeta");
    if (name) name.textContent = p.name;
    if (meta) {
      /* Pluralised: a person built from one identity reads "1 identity from
         1 source", not "1 identities from 1 sources". Both counts can be 1,
         and "identity" is irregular, so singular and plural are both given. */
      var plural = function (n, one, many) {
        return formatCount(n) + " " + (n === 1 ? one : many);
      };
      meta.textContent = [
        p.email,
        p.jobTitle,
        plural(p.identityCount, "identity", "identities") + " from " +
          plural(p.sourceCount, "source", "sources")
      ].join("   ·   ");
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     3 · TABS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * The count on the "Pending matches" tab.
   *
   * It is a NIMBUS TAB BADGE — .nav-tab-badge, the component tabs.css builds
   * for exactly this and the one the frame uses (_tabs/_tab, Show Badge =
   * true, Nimbus/Badge Color = secondary). Not "[12]" appended to the label,
   * which was the first pass and is a count dressed up as punctuation.
   *
   * Secondary rather than a product colour, per the component: the number is a
   * quantity, not a state, so it must not compete with the active-tab bar.
   * It is fixed at 20px tall, so the tab stays 47px whether or not it is there
   * and the bar does not shift as the count appears and goes.
   *
   * The value is the UNFILTERED total, so it does not move when the operator
   * filters or searches inside the tab — the label describes the person, not
   * the view.
   *
   * At zero the badge is REMOVED rather than shown as 0: a zero badge reads as
   * a broken counter, where a bare label reads as a healthy empty state. The
   * empty copy in the pane says the same in words.
   */
  /* ANGULAR: an @Input() on the tab strip. The badge count and tab 1's total
     are DIFFERENT numbers from DIFFERENT endpoints — pending matches vs identity
     records — and may legitimately disagree. Do not derive one from the other. */
  function setCandidateCount(n) {
    var tab = byId("npiTabCandidates");
    if (!tab) return;
    var badge = tab.querySelector(".nav-tab-badge");
    if (!n) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-tab-badge";
      tab.appendChild(badge);
    }
    badge.textContent = formatCount(n);
  }

  /**
   * Fetch a tab the first time it is shown, never on page load.
   *
   * Nimbus fires shown.cnds.tab after the pane is visible, which is what we
   * want: measuring or focusing inside a hidden pane gives zero heights.
   */
  /**
   * OPEN THE TAB THE OPERATOR CAME FROM — ?tab=
   *
   * The Pending Match Queue's return link carries the tab as well as the
   * person, because a pending match is only visible on TAB 2. Landing on tab 1
   * puts the operator on the identity list and makes them find their way back
   * to the row they were reading — a smaller version of the same hunt the deep
   * link exists to remove.
   *
   * Runs before the panes load, so the tab that opens is the one that fetches;
   * the other two stay unloaded until they are asked for.
   *
   * An unrecognised or absent value falls through to tab 1, which is the right
   * default for someone arriving from the Natural Persons list.
   */
  /* ANGULAR: read from ActivatedRoute.queryParamMap and set the active tab
     before first render. Keep it a query param, not a route segment — the tab is
     a view of one resource, and a segment would make three routes for one screen
     and break the browser Back that #17515's return link depends on. */
  function openRequestedTab() {
    var m = /[?&]tab=([^&]+)/.exec(window.location.search);
    if (!m) return;
    var want = { identities: "npiTabIdentities",
                 pending:    "npiTabCandidates",
                 candidates: "npiTabCandidates",
                 history:    "npiTabHistory" }[decodeURIComponent(m[1])];
    var el = want && byId(want);
    if (!el || el.classList.contains("active")) return;
    el.click();
  }

  /* ANGULAR: replaced entirely by (selectedIndexChange) on the tab group plus
     the per-tab `loaded` guard above. The double binding here — Nimbus's
     shown.cnds.tab AND a click fallback — exists only because the Nimbus
     component may be absent; Angular has one event and needs one handler. */
  function wireTabs() {
    var map = {
      npiTabIdentities: loadIdentities,
      npiTabCandidates: loadCandidates,
      npiTabHistory: loadHistory
    };
    Object.keys(map).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      var key = id === "npiTabIdentities" ? "identities"
              : id === "npiTabCandidates" ? "candidates" : "history";
      el.addEventListener("shown.cnds.tab", function () {
        if (!state[key].loaded) map[id]();
      });
      /* Nimbus may not emit its event if the component is absent; a click
         fallback keeps the tab usable rather than silently empty. */
      el.addEventListener("click", function () {
        if (!state[key].loaded) setTimeout(map[id], 0);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4 · SKELETONS
     ═══════════════════════════════════════════════════════════════════════ */

  /*
   * Nimbus supplies every class: .skeleton, .skeleton-text, .skeleton-rect,
   * .skeleton-list and the .skeleton-w-* widths. Geometry lives in the
   * stylesheet, not inline.
   *
   * The shape is the point. A skeleton is only worth more than a spinner if it
   * stands in the real row's shape, so the content does not jump when it
   * lands.
   */
  /* ANGULAR: skeletons are Nimbus markup, not logic — a <cf-skeleton> with a
     row count and column shape, shown while the request is in flight. Do not
     re-implement the delay: Nimbus already holds it back so a fast response
     never flashes a skeleton. */
  function skelText(extra) {
    return '<div class="skeleton skeleton-text' + (extra ? " " + extra : "") + '"></div>';
  }

  function skeletonRows(host, count, cols) {
    if (!host) return;
    var row = '<div class="skeleton-row npi-skeleton-record" aria-hidden="true">' +
      new Array(cols + 1).join(
        '<div class="skeleton-group">' + skelText("skeleton-w-75") + skelText("skeleton-w-50") + "</div>"
      ) + "</div>";
    host.innerHTML = '<div class="skeleton-list" aria-hidden="true">' +
      new Array(count + 1).join(row) + "</div>";
  }

  /**
   * Show a skeleton only if the wait is long enough to notice, and never over
   * rows that are still accurate.
   *
   * Returns a cancel function the caller invokes when the response lands.
   */
  function holdSkeleton(host, count, cols) {
    var timer = setTimeout(function () {
      skeletonRows(host, count, cols);
    }, SKELETON_DELAY_MS);
    return function cancel() { clearTimeout(timer); };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     5 · IDENTITIES TAB
     ═══════════════════════════════════════════════════════════════════════ */

  /* The blurry vertical rule between columns — Nimbus/Divider, column
     orientation. Solid between rows, blurry between columns: that pairing is
     what stops a list of four-column rows from reading as a data grid. */
  var COL_RULE = '<span class="vr vr-blurry np-rule" aria-hidden="true"></span>';

  /**
   * The row's one text idiom: a muted bold label, then the value at full
   * contrast. DATA IS NEVER DIMMED — only the label naming it is.
   *
   * THE SIZE IS THE FIGMA TEXT STYLE, carried as a Nimbus class rather than a
   * font-size in the stylesheet:
   *
   *   identity + candidate rows   Typography/Paragraph/Bold + /Default   14px
   *   history rows                Typography/Small/Bold + /Paragraph/Small  12px
   *
   * History is a step smaller on purpose — its rows carry three or four of
   * these lines where the other two carry one or two.
   *
   * @param {boolean} [small]  true for history's 12px pair
   */
  function pair(label, value, small, cls) {
    return '<p class="npi-pair' + (small ? " small" : "") +
             (cls ? " " + cls : "") + '">' +
      '<span class="bold npi-label">' + esc(label) + "</span> " + esc(value) + "</p>";
  }

  /**
   * One identity — a source record attached to this person.
   *
   * Four columns, 300 / 210 / 456 / 91, the same list-row family the queue
   * uses. Each row is a `.list-group-item` inside the flush list group, so the
   * hairline between rows is the list group's own border rather than a
   * separator element.
   *
   * THREE THINGS THE AUDIT DEPENDS ON, none of which may be softened:
   *
   *   · The `Asserted:` label is NOT fixed. It reads "Withdrawn:" or
   *     "Reassigned:" on the two statuses that ended, because the label names
   *     the event the date belongs to. Fixing it to "Asserted:" would date the
   *     wrong event.
   *
   *   · `asserted` may be the literal string "not recorded" rather than a
   *     date. It is rendered as-is. Substituting a date, an em dash or "n/a"
   *     would each claim something the ledger does not say.
   *
   *   · `Matched on:` ALWAYS RENDERS. Where no rule applied, the value says so
   *     in words. An omitted line and an empty one look identical to the
   *     operator and mean different things to the audit, so the design states
   *     the absence instead of dropping the line.
   *
   * A reason flagged `reasonVerbatim` is the SOURCE's own wording and is shown
   * in quotation marks, unaltered, abbreviations included. Unquoted means the
   * sentence was composed for this screen.
   */
  /* ANGULAR: <cf-identity-row [record]="r"> in an @for. The four-column rail
     and the divider rules are CSS and stay in the page stylesheet; only the row
     becomes a component. Keep the DETAILS button emitting an id upward rather
     than opening the panel itself — the panel is a sibling, not a child. */
  function recordHtml(r) {
    var reason = r.reasonVerbatim ? "“" + r.reason + "”" : r.reason;

    return '<article class="np-row np-row-record list-group-item" ' +
             'data-npi-record="' + esc(r.id) + '">' +

             '<div class="npi-col npi-col-id">' +
               '<p class="h6 bold npi-key">' + esc(r.key) + "</p>" +
               '<p class="small npi-meta">' + esc(r.source) +
                 " &nbsp;&middot;&nbsp; Effective " + esc(r.effective) + "</p>" +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-status">' +
               '<p class="bold mb-0 np-status np-status-' + esc(r.tone) + '">' +
                 esc(r.status) + "</p>" +
               pair(r.assertedLabel, r.asserted) +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-why">' +
               pair("Reason:", reason) +
               /* Label and values are separate lines: the values wrap, and a
                  wrapped value that starts under its own label reads as a
                  second value rather than a continuation. */
               '<div class="npi-keys">' +
                 '<p class="bold npi-label">Matched on:</p>' +
                 '<p class="npi-keys-value">' +
                   r.matchedOn.map(esc).join(" &nbsp;&middot;&nbsp; ") + "</p>" +
               "</div>" +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-actions">' +
               '<button type="button" class="btn btn-tertiary btn-sm" ' +
                 'data-npi-action="view-record" data-npi-record="' + esc(r.id) + '" ' +
                 'aria-label="' + esc("Details for identity " + r.key) + '">Details</button>' +
             "</div>" +
           "</article>";
  }

  /**
   * The list — ONE FLAT LIST, never grouped.
   *
   * An earlier pass grouped these rows under source headings. The design does
   * not: it draws a single list and puts the ordering in the Sort control, so
   * the tab keeps one row shape whatever the operator sorts by. Grouping also
   * fought the pager, which pages rows rather than groups.
   */
  function writeIdentities(result) {
    var host = byId("npiIdRows");
    if (!host) return;

    /* The inherited-associations banner (A2). Present only when the response
       carries one — absent, not blanked, on every other state. */
    var notice = byId("npiIdNotice");
    var noticeText = byId("npiIdNoticeText");
    if (notice) {
      notice.hidden = !result.notice;
      if (result.notice && noticeText) noticeText.textContent = result.notice;
    }

    if (!result.total) {
      host.innerHTML = emptyHtml(
        "No identities match this search",
        "Clear the search to see every identity attached to this person.");
    } else {
      host.innerHTML = result.rows.map(recordHtml).join("");
    }

    setTotal("npiIdTotal", result.total);
    renderPager("Id", result, "identities", loadIdentities);
  }

  /* ANGULAR: one service call returning an Observable of the paged result.
     Every list endpoint on this screen takes {page, pageSize, search, sort, dir}
     and returns {rows, total, ...} — `total` is the RESULT SET, not the page, and
     the toolbar total must bind to it and not to rows.length. */
  function loadIdentities() {
    var s = state.identities;
    var token = ++s.token;
    s.loaded = true;
    var host = byId("npiIdRows");
    var cancel = holdSkeleton(host, s.pageSize, 4);

    svc.identities({ page: s.page, pageSize: s.pageSize, search: s.search,
                     sort: s.sort, dir: s.dir })
      .then(function (result) {
        cancel();
        if (token !== s.token) return;   /* a newer request has superseded this */
        writeIdentities(result);
      });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     6 · PENDING MATCHES TAB
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * One CANDIDATE — a person or identity that has been flagged as possibly the
   * same human as this one (Scott, 08-28-2026).
   *
   * The two words are not interchangeable and the distinction is worth
   * keeping: a CANDIDATE is the flagged party — the thing in a row here. A
   * PENDING MATCH is the pair of them awaiting a decision — the thing the tab
   * and the queue are named for. So the tab counts pending matches, and the
   * rows inside it are candidates.
   *
   * Same four-column row as an identity, carrying different facts: who they
   * are and how much of them there is, what the matcher concluded and when,
   * why it thinks so, and the way out to the queue.
   *
   * Column 1's second line is the SIZE of the other person — "2 identities ·
   * AD, HRIS" — not an email address. An operator deciding whether two records
   * are one human needs to know how much evidence sits behind the other one;
   * an address is just one more field to compare, and it is already in the
   * matched keys where it counted.
   *
   * There is deliberately no approve/reject control. Deciding a pair happens
   * in #17515's pair review, and the note above the list says so — which is
   * what makes the absence read as intentional rather than missing.
   */
  function candidateHtml(c) {
    var size = formatCount(c.identityCount) +
      (c.identityCount === 1 ? " identity" : " identities");

    return '<article class="np-row np-row-candidate" data-npi-candidate="' + esc(c.id) + '">' +

             '<div class="npi-col npi-col-id">' +
               '<p class="h6 bold npi-key">' + esc(c.name) + "</p>" +
               '<p class="small npi-meta">' + esc(size) +
                 " &nbsp;&middot;&nbsp; " + c.sources.map(esc).join(", ") + "</p>" +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-status">' +
               '<p class="bold mb-0 np-status np-status-' + esc(c.tone) + '">' +
                 esc(c.tierLabel) + "</p>" +
               pair("Flagged:", c.flagged) +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-why">' +
               pair("Why:", c.why) +
               '<div class="npi-keys">' +
                 '<p class="bold npi-label">Matched on:</p>' +
                 '<p class="npi-keys-value">' +
                   c.matchedOn.map(esc).join(" &nbsp;&middot;&nbsp; ") + "</p>" +
               "</div>" +
             "</div>" + COL_RULE +

             '<div class="npi-col npi-col-actions">' +
               /* A link, not a button: it leaves the screen. Opening the queue
                  filtered to this pair is #17515's entry point. */
               '<button type="button" class="btn btn-tertiary btn-sm" ' +
                 'data-npi-action="review-pair" data-npi-candidate="' + esc(c.id) + '" ' +
                 'aria-label="' + esc("Review the pair with " + c.name) +
                 '">Review</button>' +
             "</div>" +
           "</article>";
  }

  /**
   * The empty state is a RESULT, not a failure.
   *
   * Most people have no pending matches, so the copy says plainly that an
   * empty list is healthy. It offers no action because there is nothing for
   * the operator to do — matches appear on their own as records arrive or
   * rules change.
   *
   * The note, the toolbar and the pager all go with it: there is nothing to
   * read, sort, filter or page.
   */
  function writeCandidates(result) {
    var host = byId("npiCandRows");
    if (!host) return;

    var trulyEmpty = result.unfilteredTotal === 0;
    ["npiCandNote", "npiCandToolbar", "npiCandPager"].forEach(function (id) {
      var el = byId(id);
      if (el) el.hidden = trulyEmpty;
    });

    if (trulyEmpty) {
      host.innerHTML =
        '<div class="np-empty np-empty-page">' +
          '<i class="mdi mdi-account-check-outline np-empty-icon" aria-hidden="true"></i>' +
          '<p class="np-empty-title">No pending matches for this person</p>' +
          '<p class="np-empty-note">Nothing else in the tenant currently resembles this ' +
            'person closely enough to be flagged. Pending matches appear here automatically ' +
            'as new records arrive or as matching rules change.</p>' +
          '<p class="np-empty-note">An empty list is a normal, healthy result &mdash; not a ' +
            'sign that matching has failed.</p>' +
        "</div>";
    } else if (!result.total) {
      host.innerHTML = emptyHtml(
        "No candidates match these filters",
        "Clear the search or set Show back to All.");
    } else {
      host.innerHTML = result.rows.map(candidateHtml)
        .join('<hr class="hr" aria-hidden="true" />');
    }

    setCandidateCount(result.unfilteredTotal);
    setTotal("npiCandTotal", result.total);
    renderPager("Cand", result, "candidates", loadCandidates);
  }

  function loadCandidates() {
    var s = state.candidates;
    var token = ++s.token;
    s.loaded = true;
    var cancel = holdSkeleton(byId("npiCandRows"), s.pageSize, 4);

    svc.candidates({ page: s.page, pageSize: s.pageSize, search: s.search,
                     show: s.show, sort: s.sort, dir: s.dir })
      .then(function (result) {
        cancel();
        if (token !== s.token) return;
        writeCandidates(result);
      });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     7 · HISTORY TAB
     ═══════════════════════════════════════════════════════════════════════ */

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /**
   * The date stamp — an 84 × 52 bordered box at the head of every history row.
   *
   * BOTH ROW TYPES DRAW THE SAME BOX: `Mon / D / YYYY`, a vertical
   * Nimbus/Divider, then the time. Ledger events put `h:mm` over `AM|PM`
   * there; employment facts have no time of day, so they put an **em dash**.
   *
   * Stating the absence is Scott's, 08-28-2026 — the earlier fact variant
   * dropped the divider and the time block entirely and centred the date alone
   * in the box, which read as a half-built card rather than as an absent
   * value. The dash replaced "N/A" the same day: the stamp holds numbers, and
   * a dash says "nothing here" without putting a word among them.
   * Stating the absence is the same rule the identity rows follow for
   * "Matched on:", and it keeps one stamp shape down the whole list.
   *
   * EQUAL WIDTH ON BOTH ROW TYPES IS THE POINT — it is what makes the stamp
   * column read as a spine. Do not let either variant hug, and do not stretch
   * either to the row height: both were tried and both made neighbouring rows
   * look like they meant different things.
   */
  /* ANGULAR: <cf-date-stamp [at]="e.at" [time]="e.time"> — plain text, no
     calendar chip (tried and reverted twice). An event with no recorded time
     renders an em dash, never "n/a": a dash states the fact is absent, "n/a"
     reads as a value. Dates are mm-dd-yyyy throughout; do not switch to a
     locale pipe without checking that. */
  function stampHtml(e) {
    var p = String(e.at).split("-");           /* mm-dd-yyyy */
    var month = MONTHS[Number(p[0]) - 1] || "";
    var day = String(Number(p[1]));            /* "04" → "4", as drawn */
    var year = p[2] || "";
    var hasTime = !!e.time;

    /* The visible N/A is not what assistive tech should hear — "N slash A"
       says nothing about what is missing. The label spells it out instead. */
    var label = e.at + (hasTime ? " at " + e.time + " " + e.meridiem
                                : ", no time recorded");

    return '<div class="npi-stamp" aria-label="' + esc(label) + '">' +
             '<span class="npi-stamp-date" aria-hidden="true">' +
               '<span class="npi-stamp-month">' + esc(month) + "</span>" +
               '<span class="bold npi-stamp-day">' + esc(day) + "</span>" +
               '<span class="npi-stamp-year">' + esc(year) + "</span>" +
             "</span>" +
             '<span class="vr vr-blurry npi-stamp-rule" aria-hidden="true"></span>' +
             '<span class="npi-stamp-time" aria-hidden="true">' +
               (hasTime
                 ? '<span class="npi-stamp-clock">' + esc(e.time) + "</span>" +
                   '<span class="npi-stamp-meridiem">' + esc(e.meridiem) + "</span>"
                 /* An em dash, not "N/A" — the stamp is a date card, and a
                    dash reads as "nothing here" without adding a word to a
                    box that holds numbers. The aria-label carries the meaning
                    in full, so nothing is lost to a screen reader. */
                 : '<span class="npi-stamp-clock">&mdash;</span>') +
             "</span>" +
           "</div>";
  }

  /**
   * One history row. TWO TYPES IN ONE STREAM.
   *
   *   event  a ledger decision somebody or something recorded, carrying
   *          Subject / Detail / Decided by — and, only where the subject has
   *          since moved, a fourth `Subject now:` line.
   *   fact   a value a source delivered, carrying From / To / Recorded. It has
   *          no decider because nobody decided it: `Recorded:` says when the
   *          source told us, where a decision says who ruled.
   *
   * Three columns, 400 / 599 / 91. The FIRST and THIRD are identical across
   * both types and only the middle differs — which is what keeps a mixed list
   * reading as one thing rather than two interleaved ones.
   *
   * DETAILS IS ON EVERY ROW, both types, and is never disabled — including
   * when the subject has moved. The event happened and must stay inspectable;
   * `Subject now:` says where it went. A mixed VIEW/DETAILS column was tried
   * and reads as two different affordances when it is one.
   */
  function historyHtml(e) {
    var isEvent = e.kind === "event";

    var detail = isEvent
      ? pair("Subject:", e.subject, true) +
        pair("Detail:", e.detail, true) +
        pair("Decided by:", e.decidedBy, true) +
        (e.subjectNow ? pair("Subject now:", e.subjectNow, true, "npi-resolution") : "")
      : pair("From:", e.from, true) +
        pair("To:", e.to, true) +
        pair("Recorded:", e.recorded, true);

    return '<article class="np-row np-row-event' + (isEvent ? "" : " np-row-fact") + '" ' +
             'data-npi-event="' + esc(e.id) + '">' +

             '<div class="npi-col npi-col-when">' +
               stampHtml(e) +
               '<div class="npi-event-id">' +
                 '<p class="h6 bold npi-title">' + esc(e.title) + "</p>" +
                 (isEvent ? ""
                   : '<p class="small npi-meta">' + esc(e.source) +
                     " &nbsp;&middot;&nbsp; " + esc(e.record) + "</p>") +
               "</div>" +
             "</div>" + COL_RULE +

             /* NO ACTIONS COLUMN. The DETAILS button and the panel behind it
                were removed on 08-28-2026 (PM): the panel restated the subject,
                the detail and the decider, and all three are already on the row.
                An affordance that opens a copy of what you are looking at costs
                a click and teaches the operator that panels are not worth
                opening.
                The detail column absorbs the freed width — it is flex: 1 1 599
                and simply grows. */
             '<div class="npi-col npi-col-detail">' + detail + "</div>" +
           "</article>";
  }

  /**
   * There is NO "no history" state.
   *
   * Every person has at least a creation event, so an empty audit log cannot
   * occur — the frame for one was deleted from the design and must not come
   * back. The only empty this tab can show is a search or filter that matched
   * nothing, and its copy says so.
   */
  function writeHistory(result) {
    var host = byId("npiHistRows");
    if (!host) return;
    host.innerHTML = result.total
      ? result.rows.map(historyHtml).join('<hr class="hr" aria-hidden="true" />')
      : emptyHtml("No events match these filters",
                  "Clear the search or set Show back to All.");
    setTotal("npiHistTotal", result.total);
    renderPager("Hist", result, "history", loadHistory);
  }

  function loadHistory() {
    var s = state.history;
    var token = ++s.token;
    s.loaded = true;
    var cancel = holdSkeleton(byId("npiHistRows"), s.pageSize, 3);

    svc.history({ page: s.page, pageSize: s.pageSize, search: s.search,
                  show: s.show, sort: s.sort, dir: s.dir })
      .then(function (result) {
        cancel();
        if (token !== s.token) return;
        writeHistory(result);
      });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     8 · IDENTITY DETAIL PANEL
     ═══════════════════════════════════════════════════════════════════════ */

  function detailPair(f) {
    var tone = f.tone === "danger" ? " npi-panel-value-danger"
             : f.tone === "muted"  ? " npi-panel-value-muted" : "";
    return '<div class="npi-panel-pair">' +
      '<p class="bold npi-panel-label">' + esc(f.label) + "</p>" +
      '<p class="npi-panel-value' + tone + '">' + esc(f.value) + "</p></div>";
  }

  function openRecordDetail(recordId) {
    var el = byId("npiRecordPanel");
    if (!el) return;

    var title = byId("npiRecordTitle");
    var body = byId("npiRecordBody");
    if (body) {
      body.innerHTML = '<div class="skeleton-group">' +
        skelText("skeleton-w-50") + skelText() + skelText("skeleton-w-75") + "</div>";
    }
    if (window.Nimbus && window.Nimbus.Offcanvas) {
      window.Nimbus.Offcanvas.getOrCreateInstance(el).show();
    }

    svc.identityDetail(recordId).then(function (r) {
      if (!r) {
        if (body) body.innerHTML = '<p class="np-row-note">That identity is no longer available.</p>';
        return;
      }
      /* The panel is titled with the PERSON, matching the frame — the record
         it belongs to is the first line of the body. */
      if (title) title.textContent = person ? person.name : r.key;

      var context =
        '<div class="npi-panel-context">' +
          /* Typography/H4/Bold — the record identifier is the panel's
             subject, a step above the section headings below it. */
          '<p class="h4 bold npi-panel-record">' + esc(r.source) +
            " &nbsp;&middot;&nbsp; " + esc(r.key) + "</p>" +
          '<p class="small npi-meta">Effective ' + esc(r.effective) + "</p>" +
        "</div>";

      var values = r.original
        ? '<section class="npi-panel-section">' +
            '<div class="npi-panel-heading">' +
              '<h3 class="h6 bold npi-panel-h">Original values</h3>' +
              '<p class="small npi-meta">As recorded in ' + esc(r.source) +
                ", before merging</p>" +
            "</div>" +
            r.original.map(detailPair).join("") +
          "</section>"
        : '<section class="npi-panel-section">' +
            '<div class="npi-panel-heading">' +
              '<h3 class="h6 bold npi-panel-h">Original values</h3>' +
            "</div>" +
            '<p class="small npi-meta">This record\u2019s field values were not ' +
              "captured. The association is real; the values behind it are not held.</p>" +
          "</section>";

      var keys = (r.keys || []).map(function (k) {
        return '<div class="npi-panel-key">' +
          '<p class="npi-panel-keytype">' + esc(k.type) + "</p>" +
          (k.status
            ? '<p class="np-status np-status-' + esc(k.tone || "muted") + '">' +
              esc(k.status) + "</p>"
            : "") +
        "</div>";
      }).join("");

      /* Nimbus/Divider, horizontal + blurry — the same rule the list rows use
         between columns, here separating the record's own values from the
         account of why it was attached. Added to the frame 08-28-2026. */
      var why =
        '<hr class="hr hr-blurry npi-panel-rule" aria-hidden="true" />' +
        '<section class="npi-panel-section npi-panel-section-why">' +
          '<div class="npi-panel-heading">' +
            '<h3 class="h6 bold npi-panel-h">Why it linked</h3>' +
            '<p class="small npi-meta">' + esc(r.assertedLabel.replace(":", "")) +
              " " + esc(r.asserted) + "</p>" +
          "</div>" +
          (r.reason
            ? '<p class="npi-pair"><span class="bold npi-label">Reason:</span> ' +
              (r.reasonVerbatim ? "\u201c" + esc(r.reason) + "\u201d" : esc(r.reason)) +
              "</p>"
            : "") +
          keys +
          /* Not optional copy — it is why the panel shows key TYPES and never
             the values that matched. */
          '<p class="small npi-meta npi-panel-note">Key types only &mdash; matched ' +
            "values are stored as hashes and are never displayed.</p>" +
        "</section>";

      if (body) body.innerHTML = context + values + why;
    });
  }

  /**
   * The PAIR REVIEW panel — what REVIEW opens on the Pending matches tab.
   *
   * The same evidence the queue's pair review shows, for the pair the row is
   * about: the two people, the field-by-field comparison, and the matcher's
   * explanation. 1080px, matching the queue's panel, because it overlays a
   * list the operator keeps referring to.
   *
   * READ-ONLY. No decision bar and no SKIP — the tab's own note says decisions
   * are made in the queue, and a decision surface here would contradict it.
   * The footer link is the way to act on the pair.
   *
   * The verdict vocabulary is the queue's — Match / Differs / Only one side —
   * so the same pair reads identically in both places.
   */
  /* The drawing's words, verbatim: "Matches" / "Differs" / "One Side".
     Not "Match" / "Only one side", which is what an earlier pass used. */
  /**
   * The verdict vocabulary, and its colours, straight off the frame:
   *
   *   Matches   Text/Success    Differs  Text/DANGER  (not caution)
   *   One Side  Text/Muted      Expected Text/Muted
   *
   * "Expected" is the Source row's own verdict — two records from different
   * systems are supposed to differ there, so it must never read as evidence
   * against the pair.
   */
  var AGREE = {
    "Matches":  { cls: "np-agree-match",    icon: "mdi-check" },
    "Differs":  { cls: "np-agree-differs",  icon: "mdi-close" },
    "One Side": { cls: "np-agree-one",      icon: "mdi-minus" },
    "Expected": { cls: "np-agree-expected", icon: "mdi-minus" }
  };

  /**
   * ONE SIDE OF THE PAIR — fr_person-distinct / fr_person-established.
   *
   * Four lines, in the frame's own typography, and each line is a different
   * kind of fact rather than a different size of the same one:
   *
   *   role         Paragraph/Default 14 · Text/Muted   which side this is
   *   name         H6/Bold 16        · Text/Default    who
   *   count        Paragraph/Default 14 · Text/Default how much is attached
   *   provenance   Paragraph/Small 12   · Text/Muted   where the record came from
   *
   * The count line is the IDENTITY COUNT ONLY. An earlier pass appended the
   * source system to it ("1 identity · AD"), which put a provenance fact on
   * the size line and then repeated provenance again underneath.
   *
   * The hold state is a Nimbus/Badge and is ALWAYS rendered: "No holds" is
   * stated rather than left blank, because a missing badge cannot distinguish
   * "checked, none found" from "could not check".
   */
  function pairCard(role, name, count, provenance, hold) {
    return '<div class="npi-pair-person">' +
      '<p class="npi-pair-role">' + esc(role) + "</p>" +
      '<p class="h6 bold npi-pair-name">' + esc(name) + "</p>" +
      '<p class="npi-pair-count">' + esc(count) + "</p>" +
      '<p class="small npi-pair-prov">' + esc(provenance) + "</p>" +
      (hold
        ? '<span class="badge badge-warning npi-pair-hold">' + esc(hold) + "</span>"
        : '<span class="badge badge-secondary npi-pair-hold">No holds</span>') +
    "</div>";
  }

  /**
   * Nimbus/Category at C5 — 16px ExtraBold with the CaseFusion highlight bar —
   * and the caption at Paragraph/Default muted, pushed to the right.
   *
   * C5, not C6. C6 is 14px, which put the section heading BELOW the caption
   * beside it in size and made the caption read as the heading.
   */
  function pairHeading(text, caption) {
    return '<div class="npi-pair-head">' +
      '<h3 class="cf-category cf-cat-5 highlight-casefusion npi-pair-category">' +
        esc(text) + "</h3>" +
      (caption ? '<p class="npi-pair-caption">' + esc(caption) + "</p>" : "") +
    "</div>";
  }

  /** Nimbus/Icon SM + Paragraph/Small muted — `fr_note` on the frame. */
  function footnote(html) {
    return '<p class="np-footnote">' +
      '<i class="mdi mdi-information-outline" aria-hidden="true"></i>' +
      "<span>" + html + "</span></p>";
  }

  /**
   * LEAVE BY THE PANEL, NOT THROUGH IT — the same rule as the queue's return
   * links, applied to the outbound half of the same journey.
   *
   * "Review in the queue" is a real link, so left alone it navigates while the
   * pair review panel is still fully open across three quarters of the screen,
   * and the queue replaces a lit panel with no intermediate state. Sliding the
   * panel shut first gives the eye something to follow out.
   *
   * Modifier and middle clicks are left to the browser; the navigation races a
   * derived timer against `hidden.cnds.offcanvas` so a missing animation can
   * never strand the operator on a link that does nothing. See the twin of
   * this in pge-admin-natprsn-queue.js → wireReturnNavigation().
   */
  /* ANGULAR: (click) with $event.preventDefault(), then router.navigate() in
     the offcanvas's hidden callback. Keep the timer race — a dropped animation
     event must never leave a link that does nothing. */
  function wirePairPanelExit() {
    var link = byId("npiPairToQueue");
    if (!link) return;

    link.addEventListener("click", function (ev) {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var href = link.getAttribute("href");
      if (!href || href === "#") return;

      ev.preventDefault();

      var panel = byId("npiPairPanel");
      var done = false;
      function go() {
        if (done) return;
        done = true;
        window.location.href = href;
      }

      if (!panel || !window.Nimbus || !window.Nimbus.Offcanvas) { go(); return; }
      var inst = window.Nimbus.Offcanvas.getInstance(panel);
      if (!inst) { go(); return; }

      panel.addEventListener("hidden.cnds.offcanvas", go, { once: true });
      var secs = parseFloat(getComputedStyle(panel).transitionDuration) || 0.3;
      window.setTimeout(go, secs * 1000 + 50);
      inst.hide();
    });
  }

  /* ANGULAR: <cf-pair-review-panel [candidateId]="id" [readonly]="true">. The
     SAME component #17515 uses with its decision bar projected off — that is what
     stops the two panels drifting, and check-pair-consistency.js is the gate that
     proves the DATA agrees too.
     The footer CTA's href is built per-pair (see below); in Angular that is a
     routerLink with queryParams, not a string. */
  function openPairReview(candidateId) {
    var el = byId("npiPairPanel");
    if (!el) return;
    var title = byId("npiPairTitle");
    var body = byId("npiPairBody");
    if (body) {
      body.innerHTML = '<div class="skeleton-group">' +
        skelText("skeleton-w-50") + skelText() + skelText("skeleton-w-75") + "</div>";
    }
    if (window.Nimbus && window.Nimbus.Offcanvas) {
      window.Nimbus.Offcanvas.getOrCreateInstance(el).show();
    }

    svc.candidate(candidateId).then(function (c) {
      if (!c) {
        if (body) body.innerHTML = '<p class="np-row-note">That pending match is no longer available.</p>';
        return;
      }
      if (title) title.textContent = c.name + " \u2014 " + person.name;

      /* REVIEW IN THE QUEUE opens THIS PAIR, not the queue's first row.
         Without the hint the operator lands on the default screen and has to
         find again the pair they were already looking at. The queue resolves
         the hint and falls back to its own default only if the pair is gone
         (decided, or withdrawn) \u2014 and says so when it does. */
      var toQueue = byId("npiPairToQueue");
      if (toQueue) {
        var hint = c.pairHint || { est: person.name, cand: c.name };
        /* `from` is the PERSON, not the pair: it is what the queue needs to
           offer a way back here, and it is the only part of the handoff that
           survives the operator skipping on to another pair. */
        toQueue.href = "pge-admin-natprsn-pndmtchque.html" +
          "?pair=" + encodeURIComponent(c.id) +
          "&est=" + encodeURIComponent(hint.est) +
          "&cand=" + encodeURIComponent(hint.cand) +
          "&from=" + encodeURIComponent(person.id) +
          "&fromName=" + encodeURIComponent(person.name);
      }

      var cards = c.cards || { candidate: {}, person: {} };

      /* A hold on either side is the first thing shown \u2014 it changes what a
         decision means, so it cannot sit below the evidence. */
      var holdAlert = cards.person.hold || cards.candidate.hold
        ? '<div class="alert alert-caution npi-pair-holdalert" role="status">' +
            '<span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert-octagon"></i></span>' +
            "<span>One of these people is under legal hold. Deciding does not " +
            "lift the hold.</span></div>"
        : "";

      var persons =
        '<div class="npi-pair-persons">' +
          pairCard("CANDIDATE", c.name,
                   formatCount(c.identityCount) +
                     (c.identityCount === 1 ? " identity" : " identities"),
                   cards.candidate.created || "", cards.candidate.hold) +
          '<div class="np-persons-arrow" aria-hidden="true">' +
            '<i class="mdi mdi-arrow-right-thick"></i></div>' +
          pairCard("ESTABLISHED PERSON", person.name,
                   formatCount(person.identityCount) + " identities",
                   cards.person.created || "", cards.person.hold) +
        "</div>";

      /* THE SAME TABLE THE QUEUE DRAWS. `.np-compare` already carries the
         frame's column rail (64/169/278/278/243 across 1032) and the
         Table/Row/Header and Table/Row/Data typography, so this panel and the
         queue's cannot drift \u2014 there is one implementation, not two. */
      var rows = (c.compare || []).map(function (r) {
        var v = AGREE[r.agree] || AGREE["One Side"];
        return "<tr>" +
          '<td class="np-col-verdict ' + v.cls + '">' +
            '<i class="mdi ' + v.icon + '" aria-hidden="true"></i>' +
            '<span class="visually-hidden">' + esc(r.agree) + "</span></td>" +
          '<td class="np-col-field">' + esc(r.field) + "</td>" +
          '<td class="np-col-value">' + esc(r.candidate || "\u2014") + "</td>" +
          '<td class="np-col-value">' + esc(r.person || "\u2014") + "</td>" +
          '<td class="np-col-agree ' + v.cls + '">' + esc(r.agree) + "</td>" +
        "</tr>";
      }).join("");

      /* No header above the verdict column \u2014 the frame leaves it blank, and
         an icon column headed "Agreement" would duplicate the word that
         already ends the row. The cell still exists so the header row has as
         many cells as the body rows. */
      var comparison =
        '<section class="npi-pair-section">' +
          pairHeading("FIELD COMPARISON", "Values from each source record, pre-merge") +
          '<div class="table-responsive">' +
            '<table class="table np-compare">' +
              "<thead><tr>" +
                '<th scope="col" class="np-col-verdict">' +
                  '<span class="visually-hidden">Agreement</span></th>' +
                '<th scope="col" class="np-col-field">Field</th>' +
                /* Candidate first, matching the card above it. */
                '<th scope="col" class="np-col-value">Candidate</th>' +
                '<th scope="col" class="np-col-value">Established</th>' +
                '<th scope="col" class="np-col-agree">Agreement</th>' +
              "</tr></thead><tbody>" + rows + "</tbody>" +
            "</table>" +
          "</div>" +
        "</section>";

      /* WHY THIS PAIR WAS REFUSED. The reason is quoted at H6/Bold \u2014 it is the
         matcher's own words, not a caption \u2014 and each matching key is a
         Nimbus/List/Unordered bullet with the tier it earned beside it. */
      var keys = (c.matchedOn || []).map(function (k) {
        return '<li class="npi-pair-key">' +
          '<span class="npi-pair-keytype">' + esc(k) + "</span>" +
          '<span class="np-status np-status-' + esc(c.tone) + '">' +
            esc(c.tierLabel) + "</span></li>";
      }).join("");

      var explanation =
        '<section class="npi-pair-section np-why">' +
          pairHeading("WHY THIS PAIR WAS REFUSED", "Refused " + c.flagged) +
          /* The matcher's NAMED REASON, quoted — "2 corroborating keys" — not
             the tier label, which is already stated beside every key below.
             The two say different things: what was found, and what it earned. */
          '<p class="h6 bold npi-pair-reason">&ldquo;' +
            esc(c.reason || c.tierLabel) + "&rdquo;</p>" +
          '<ul class="cf-list highlight-casefusion npi-pair-keys">' + keys + "</ul>" +
          /* `.np-footnote` is the queue's own footnote — the icon is a real
             Nimbus/Icon SM (16px) and the text is wrapped so the flex row can
             align it to the icon's first line. Inline, with no wrapper, the
             glyph inherited the note's 12px and rendered at half size. */
          footnote(esc(c.why) + ". Policy requires more than this to merge " +
                   "automatically, so the identity became a distinct person " +
                   "pending review.") +
          footnote("Key types only &mdash; matched values are hashes and are " +
                   "never displayed.") +
        "</section>";

      /* NO read-only alert. An earlier pass added an "nothing is decided here"
         info banner; the frame has no such block, and the tab's own note above
         the list already says decisions are made in the queue. Saying it twice
         inside one screen makes the panel argue with itself. What the operator
         needs is the way OUT to the queue, which is the footer link. */

      if (body) body.innerHTML = holdAlert + persons + comparison + explanation;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     9 · WIRING + INIT
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * The shared empty-result block — §5's .np-empty, used verbatim.
   *
   * CENTRED IS THE DEFAULT (Scott, 08-28-2026). This screen does not get its
   * own empty-state treatment: the dashed box, the centring and the icon are
   * the same three things the list and the queue show, so an operator who has
   * seen one empty result on this product has seen them all. Only the copy is
   * per caller.
   */
  function emptyHtml(title, note, icon) {
    return '<div class="np-empty">' +
      '<i class="mdi ' + esc(icon || "mdi-magnify-close") + ' np-empty-icon" ' +
        'aria-hidden="true"></i>' +
      '<p class="np-empty-title">' + esc(title) + "</p>" +
      '<p class="np-empty-note">' + esc(note) + "</p></div>";
  }

  /**
   * "Total: 12" — the FILTERED count for this tab, as the toolbar draws it.
   *
   * It is deliberately NOT the person's identity count: that one lives in the
   * person header and must not move when the operator searches. This one is
   * the view's own number and moves with every query.
   */
  function setTotal(id, n) {
    var el = byId(id);
    if (el) el.textContent = "Total: " + formatCount(n);
  }

  /**
   * The pager — Nimbus/Pagination, toolbar variant.
   *
   * The markup is STATIC, in the page; this only updates the range text and
   * the four disabled states. Rebuilding the bar on every render would drop
   * the operator's page-size choice and rebind four listeners per query.
   *
   * IT IS NEVER HIDDEN. The design draws it on a four-row list reading
   * "1-4 of 4" with every arrow disabled — a control that disappears when a
   * filter narrows the list moves the rows under the cursor when it comes back.
   *
   * @param {string} prefix  the id stem: "Id" | "Cand" | "Hist"
   */
  /* ANGULAR: <cf-pagination [total]="r.total" [page]="r.page" [pageSize]="10">
     with (pageChange). Default page size is 10 across the product; a pager
     defaulting to 100 is a regression, not a preference. */
  function renderPager(prefix, result, key, reload) {
    var range = byId("npi" + prefix + "Range");
    if (range) {
      var start = (result.page - 1) * result.pageSize + 1;
      var end = Math.min(result.page * result.pageSize, result.total);
      range.textContent = result.total
        ? formatCount(start) + "-" + formatCount(end) + " of " + formatCount(result.total)
        : "0 of 0";
    }

    var host = byId("npi" + prefix + "Pager");
    if (!host) return;
    var atFirst = result.page <= 1;
    var atLast = result.page >= result.pageCount;
    host.querySelectorAll("[data-npi-page]").forEach(function (b) {
      var dir = b.getAttribute("data-npi-page");
      b.disabled = (dir === "first" || dir === "prev") ? atFirst : atLast;
    });

    /* Remembered so the click handlers, bound once at init, can page without
       closing over a stale result. */
    state[key].pageCount = result.pageCount;
  }

  /** Bound ONCE per tab, against markup that never gets replaced. */
  function wirePager(prefix, key, reload) {
    var host = byId("npi" + prefix + "Pager");
    if (!host) return;
    host.querySelectorAll("[data-npi-page]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = state[key];
        var to = b.getAttribute("data-npi-page");
        var last = s.pageCount || 1;
        s.page = to === "first" ? 1
               : to === "prev" ? Math.max(1, s.page - 1)
               : to === "next" ? Math.min(last, s.page + 1)
               : last;
        reload();
      });
    });

    var size = byId("npi" + prefix + "PageSize");
    if (size) {
      size.addEventListener("change", function () {
        state[key].pageSize = Number(size.value) || 10;
        state[key].page = 1;      /* page 3 of the old size is not page 3 of the new */
        reload();
      });
    }
  }

  /** Debounced so a query does not fire on every keystroke. */
  function onSearch(inputId, key, reload) {
    var el = byId(inputId);
    if (!el) return;
    var timer = null;
    el.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state[key].search = el.value.trim();
        state[key].page = 1;      /* a new query starts at page 1 */
        reload();
      }, 250);
    });
  }

  function onSelect(selectId, key, prop, reload) {
    var el = byId(selectId);
    if (!el) return;
    el.addEventListener("change", function () {
      state[key][prop] = el.value;
      state[key].page = 1;
      reload();
    });
  }

  /**
   * The direction toggle.
   *
   * The control, the visible order, the icon AND the word must all agree —
   * they disagreed in an earlier build of this screen and it read as a bug.
   * The word is why this is not an icon-only button: an arrow alone means a
   * move or a download as readily as it means a sort order.
   *
   * "ASC" / "DSC" — three characters each, deliberately. Equal-width labels
   * keep the button one size across the toggle, so nothing beside it moves
   * under the cursor that is still on it. "DESC" is four and would shift the
   * total; it is not a typo to fix.
   */
  function onDir(btnId, key, reload) {
    var el = byId(btnId);
    if (!el) return;
    el.addEventListener("click", function () {
      var next = el.getAttribute("data-dir") === "desc" ? "asc" : "desc";
      var asc = next === "asc";
      el.setAttribute("data-dir", next);
      el.setAttribute("aria-label",
        "Sort " + (asc ? "ascending" : "descending") + ", click to reverse");
      var icon = el.querySelector("i");
      if (icon) icon.className = "mdi mdi-arrow-" + (asc ? "up" : "down") + "-circle";
      var word = el.querySelector(".npi-sort-dir-label");
      if (word) word.textContent = asc ? "ASC" : "DSC";
      state[key].dir = next;
      state[key].page = 1;
      reload();
    });
  }

  /**
   * One delegated handler for every action on the screen.
   *
   * Delegated rather than bound per row, because the rows are replaced on
   * every query — a per-row listener would be rebound ten times a keystroke.
   *
   * ONLY THREE OF THESE DO ANYTHING TODAY, and that is the design rather than
   * an omission: this screen is read-only, so every other action leaves it.
   *
   *   view-record   opens the identity detail panel (screen B), from tab 1
   *   review-pair   opens the read-only pair review, from tab 2
   *   delete        opens the confirmation, which is itself stubbed pending
   *                 the decision on what deleting a person means
   *
   *   merge         → #17474        split       → #17516
   *   export-csv/pdf → an export job (format list is a PM/DM call)
   *
   * `view-event` is GONE — the History tab's DETAILS button and its panel were
   * removed on 08-28-2026 (PM) as a restatement of the row.
   *
   * Those five are left as no-ops WITH their handlers present, so the wiring
   * is visible to whoever implements them and the menu is testable now.
   */
  function wireRowActions() {
    document.addEventListener("click", function (event) {
      var el = event.target.closest("[data-npi-action]");
      if (!el) return;
      var action = el.getAttribute("data-npi-action");

      if (action === "review-pair") {
        event.preventDefault();
        openPairReview(el.getAttribute("data-npi-candidate"));
        return;
      }

      if (action === "view-record") {
        event.preventDefault();
        openRecordDetail(el.getAttribute("data-npi-record"));
        return;
      }

      if (action === "delete") {
        event.preventDefault();
        openDeleteConfirm();
        return;
      }

      /* The rest navigate away or start a job; none of them writes from here. */
      if (["merge", "split", "export-csv", "export-pdf"]
            .indexOf(action) !== -1) {
        event.preventDefault();
      }
    });
  }

  /**
   * The delete confirmation.
   *
   * Names the person in the body, because a destructive confirm that says
   * "this person" is one the operator can agree to without checking which
   * person they are on.
   *
   * The primary stays DISABLED: what deleting does is undecided, so the dialog
   * cannot state a consequence and must not offer to commit one.
   */
  /* ANGULAR: <cf-confirm-dialog>. BLOCKED — what "Delete person" deletes is an
     open product decision (suppress / unmatch / tombstone), so the copy is
     stubbed and the confirm button is disabled. Do not wire this to a service
     call until that lands; see openQuestions in pages-manifest.json. */
  function openDeleteConfirm() {
    var el = byId("npiDelete");
    if (!el) return;
    /* The name comes from the RENDERED HEADER, not from `person`.
       The header is reachable the moment the page paints, while the person
       query takes ~650ms — so a fast operator (or a test) can open this dialog
       before `person` exists, and an earlier build then showed a destructive
       confirm with a blank subject line. Reading the heading keeps the dialog
       naming exactly what the operator can see behind it, whenever it opens. */
    var subject = byId("npiDeleteSubject");
    if (subject) {
      var nameEl = byId("npiPersonName");
      var name = nameEl ? nameEl.textContent.trim() : "";
      var count = person ? person.identityCount : null;
      subject.textContent = name
        ? (count === null
            ? "Delete " + name + "?"
            : "Delete " + name + " and their " + formatCount(count) +
              (count === 1 ? " identity?" : " identities?"))
        : "Delete this person?";
    }
    if (window.Nimbus && window.Nimbus.Modal) {
      window.Nimbus.Modal.getOrCreateInstance(el).show();
    }
  }

  function init() {
    svc = (window.CaseFusion || {}).NaturalPersonService;
    if (!svc) {
      throw new Error("NaturalPersonService is missing — is " +
        "js/pages/pge-admin-natprsn-identities.data.js loaded before this file?");
    }

    svc.person().then(renderPerson);

    wireTabs();
    openRequestedTab();
    wireRowActions();
    wirePairPanelExit();

    onSearch("npiIdSearch", "identities", loadIdentities);
    onSelect("npiIdSort", "identities", "sort", loadIdentities);
    onDir("npiIdDir", "identities", loadIdentities);
    wirePager("Id", "identities", loadIdentities);

    onSearch("npiCandSearch", "candidates", loadCandidates);
    onSelect("npiCandShow", "candidates", "show", loadCandidates);
    onSelect("npiCandSort", "candidates", "sort", loadCandidates);
    onDir("npiCandDir", "candidates", loadCandidates);
    wirePager("Cand", "candidates", loadCandidates);

    onSearch("npiHistSearch", "history", loadHistory);
    onSelect("npiHistShow", "history", "show", loadHistory);
    onSelect("npiHistSort", "history", "sort", loadHistory);
    onDir("npiHistDir", "history", loadHistory);
    wirePager("Hist", "history", loadHistory);

    /* The first tab is visible on load, so it fetches immediately. The other
       two wait until they are opened. */
    loadIdentities();

    /* The count is in the tab label, so it is needed before that tab is ever
       opened. One cheap query for the number only. */
    svc.candidates({ page: 1, pageSize: 1 }).then(function (r) {
      setCandidateCount(r.unfilteredTotal);
    });
  }

  /**
   * Select, Offcanvas and Tabs are all touched from init(), and Nimbus loads
   * its components asynchronously — so this waits for `cnds.ready` unless the
   * classes are already present.
   */
  if (window.Nimbus && window.Nimbus.Offcanvas) init();
  else document.addEventListener("cnds.ready", init);
})();
