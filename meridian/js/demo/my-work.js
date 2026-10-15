/* ═══════════════════════════════════════════════════════════════════════
   My Work controller (PRD 11 §7; design decisions 1–20, 14 Oct).

   One queue across every case the viewer can open. It resolves nothing:
   every action opens the screen that owns the condition. Snooze is
   personal, at most 30 days, stays counted in Needs Action, and is refused
   on preservation-at-risk rows (MW40).

   DATA (data/meridian.js, read once; the API seam replaces these reads)
     M.myWork             queue items: id, caseId, chip (GAP|ANSWER|DECIDE|
                          APPROVE|CONFIRM|REVIEW), what/why (+ *Masked forms
                          when maskPerson is outside the viewer's regions),
                          since|age|waitingText, found, locked, units,
                          action/second ({label, href|toast}), snoozedUntil
     M.viewerCases[id]    { cases: [ids the viewer can open], open: n }
     M.caseAttention[id]  stage, onHold, openRequests, worst (MBP-0926 is
                          computed live from M.custodians instead)
     M.thisWeek           dated obligations: day, kind (request|ack), n, what, flag
     M.whatCaseFusionDid  automatic tasks: n, what, context, on + time
     M.overdueWithTeams   overdue response-team work: days, team

   STATE (this page only; nothing persists across a reload)
     rows     a deep copy of the viewer's items, so snoozing edits the copy
     chip     the selected queue filter ("open", "found", "snoozed", "risk"
              or a chip kind)
     page / pageSize       queue pager (25 by default on My Work)
     weekAll  This Week expanded past what fits beside the Cases card

   RENDER CYCLE
     render()      tiles + lead line, filters, queue  (first paint)
     refresh()     the same after a click, the queue fading out and in
     renderCases() Cases Needing Attention            (on load and on sort)
     renderWeek()  This Week, fitted to the Cases card (on load, resize,
                   collapse, SHOW ALL / SHOW FEWER)
     renderDid()   What CaseFusion Did                (on load)

   DEMO-ONLY
     · Only MBP-0926 (Veltrazine) links to real screens; other cases open
       not-in-demo.html.
     · Skeleton rows wait on the web font, standing in for the API call.
     · Snooze, unsnooze and toast actions change the in-memory copy only.
     · The weekly report has no resolved-items data (PM question 6).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var v = D.viewer();
  var access = M.viewerCases[v.id];
  function mine(list) { return list.filter(function (x) { return access.cases.indexOf(x.caseId) !== -1; }); }

  var rows = JSON.parse(JSON.stringify(mine(M.myWork)));
  var chip = "open";
  var page = 1, pageSize = 25;  /* 25 rows by default on My Work (Scott, 10-14; the house default elsewhere is 10) */
  var weekAll = false;
  var actionsFitted = false;
  /* The queue's columns are measured with the web font, so until it has loaded the list shows skeleton rows.
     API seam (Scott, 10-14): these screens will read their data from APIs. Then the skeleton shows while that request
     is pending (render skeletonRows(), await the call, then render rows), and the font-ready trigger at the foot of
     this file is only the demo's stand-in. Keep the data behind its one read so the API can replace it. */
  var fontsReady = !(document.fonts && document.fonts.status !== "loaded");

  /* ── Shared helpers ───────────────────────────────────────────────── */
  /* Chip kinds in filter order, with their filter names and badge colours. */
  var KIND = { GAP: "Gaps", ANSWER: "Questions", DECIDE: "Decisions", APPROVE: "Approvals", CONFIRM: "Receipts", REVIEW: "Reviews" };
  var KIND_BADGE = { GAP: "warning", ANSWER: "info", DECIDE: "danger", APPROVE: "caution", CONFIRM: "success", REVIEW: "secondary" };
  var SEVERITY = ["GAP", "DECIDE", "ANSWER", "APPROVE", "CONFIRM", "REVIEW"];  /* Most Urgent sort order */

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function sum(list) { return list.reduce(function (n, x) { return n + x.n; }, 0); }
  function caseName(id) { var c = M.caseById(id); return c.name + " · " + c.id; }
  function caseHref(id) { return id === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(id)); }
  function caseIds(list) { var s = {}; list.forEach(function (r) { s[r.caseId] = true; }); return Object.keys(s); }
  function rowById(id) { return rows.filter(function (r) { return r.id === id; })[0]; }

  /* Item fields as this viewer may read them: a person outside their regions is replaced by the masked wording. */
  function masked(r) { return r.maskPerson && !D.canSee(M.person(r.maskPerson)); }
  function whatOf(r) { return masked(r) && r.whatMasked ? r.whatMasked : r.what; }
  function whyOf(r) { return masked(r) && r.whyMasked ? r.whyMasked : r.why; }
  function age(r) { return r.age != null ? r.age : M.ageFromToday(r.since); }
  function waiting(r) { return r.waitingText || plural(age(r), "day"); }

  function open() { return rows.filter(function (r) { return !r.snoozedUntil; }); }
  function snoozed() { return rows.filter(function (r) { return r.snoozedUntil; }); }
  function didList() { return mine(M.whatCaseFusionDid).sort(function (a, b) { return (b.on + b.time).localeCompare(a.on + a.time); }); }  /* newest first */
  function weekDates() { return mine(M.thisWeek); }
  /* Preservation at risk counts units, not rows (MW32): holds, custodians, attestations and leavers on the locked
     rows, named term by term. One row can hold several (3 custodians not on hold is one row, three units). */
  function riskUnits() {
    var u = { removed: 0, notOnHold: 0, attestation: 0, leaver: 0 };
    rows.filter(function (r) { return r.locked; }).forEach(function (r) { Object.keys(r.units || {}).forEach(function (k) { u[k] += r.units[k]; }); });
    var parts = [[u.removed, "hold removed"], [u.notOnHold, "not on hold"], [u.attestation, "attestation overdue"], [u.leaver, "leaver"]]
      .filter(function (p) { return p[0]; }).map(function (p) { return p[0] + " " + p[1]; });
    return { total: u.removed + u.notOnHold + u.attestation + u.leaver, parts: parts };
  }

  /* Shared empty state (demo.css .demo-empty): icon, bold title, muted note, centred. */
  function emptyState(title, note, cls) {
    return '<div class="demo-empty' + (cls ? " " + cls : "") + '"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }
  /* Listen for a Nimbus select's value: the native change event and Nimbus's own. */
  function onSelect(el, fn) { ["change", "valueChanged.cnds.select"].forEach(function (t) { el.addEventListener(t, fn); }); }
  function csv(name, lines) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.map(function (l) { return l.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ── Lead line and summary tiles (PRD 11 §7.1–7.2) ────────────────── */
  function renderTop() {
    var cases = caseIds(rows).length;
    /* Lead line (MW4) in the formal tone: a statement of fact, no "you", nothing personified (design decision 18). */
    document.getElementById("mwLead").innerHTML = "<b>" + rows.length + " items need action</b> across " + cases + " of " + access.open +
      " cases. CaseFusion completed " + sum(didList()) + " tasks automatically since the last sign-off yesterday.";
    var risk = riskUnits();
    var od = mine(M.overdueWithTeams).sort(function (a, b) { return b.days - a.days; });
    var wk = weekDates();
    var req = sum(wk.filter(function (w) { return w.kind === "request"; })), ack = sum(wk.filter(function (w) { return w.kind === "ack"; }));
    /* Shared summary-card style (demo.css). Names in Title Case (CSS uppercases them); a tile with nothing behind it
       is disabled, never hidden. */
    function tile(key, value, name, sub, pressed, disabled) {
      return '<button type="button" class="card card-basic demo-tile" data-tile="' + key + '" aria-pressed="' + !!pressed + '"' + (disabled ? " disabled" : "") + '><span class="card-subtitle demo-tile-name">' + esc(name) +
        '</span><span class="card-title demo-tile-value">' + value + '</span><span class="card-text demo-tile-label">' + esc(sub) + "</span></button>";
    }
    document.getElementById("mwTiles").innerHTML =
      tile("needs", rows.length, "Needs Action", "Across " + cases + " of " + access.open + " cases", chip === "open", !rows.length) +
      tile("risk", risk.total, "Preservation at Risk", risk.parts.join(" · ") || "Nothing at risk", chip === "risk", !risk.total) +
      tile("overdue", od.length, "Overdue with Response Teams", od.length ? "Oldest " + od[0].days + " days · " + od[0].team : "None") +
      tile("week", req + ack, "Due This Week", plural(req, "request") + " · " + plural(ack, "acknowledgment"), false, !(req + ack));
  }

  /* ── Action Queue (PRD 11 §7.3) ───────────────────────────────────── */
  /* Two Nimbus toggle button groups (radio btn-check + button labels, single select): status filters, then kinds,
     split by a blurry divider (parts of one control row). A filter with nothing in it is disabled, never hidden.
     Preservation at Risk is always present: it is where the tile of the same name lands (design decision 21). */
  function renderChips() {
    var o = open();
    var status = [["open", "Open", o.length], ["risk", "Preservation at Risk", o.filter(function (r) { return r.locked; }).length],
      ["found", "Found by CaseFusion", o.filter(function (r) { return r.found; }).length], ["snoozed", "Snoozed", snoozed().length]];
    var kinds = Object.keys(KIND).map(function (k) { return [k, KIND[k], o.filter(function (r) { return r.chip === k; }).length]; });
    function group(list, label) {
      return '<div class="btn-group" role="group" aria-label="' + label + '">' + list.map(function (d) {
        var id = "mwF-" + d[0], on = chip === d[0];
        return '<input type="radio" class="btn-check" name="mwFilter" id="' + id + '" value="' + d[0] + '" autocomplete="off"' + (on ? " checked" : "") + (d[2] || on ? "" : " disabled") + ">" +
          '<label class="btn btn-secondary btn-sm" for="' + id + '">' + esc(d[1]) + " (" + d[2] + ")</label>";
      }).join("") + "</div>";
    }
    document.getElementById("mwChips").innerHTML = group(status, "Queue status") + '<div class="vr vr-blurry" aria-hidden="true"></div>' + group(kinds, "Kind of work");
    wrapFilters();
  }
  /* When the two groups wrap onto two lines (below about 1600px), the line break separates them, so the divider would
     only dangle at the end of the first line: it is dropped (.mw-filters-wrapped in my-work.css). */
  function wrapFilters() {
    var el = document.getElementById("mwChips"), g = el.querySelectorAll(".btn-group");
    el.classList.remove("mw-filters-wrapped");
    if (g.length === 2 && g[1].offsetTop > g[0].offsetTop) el.classList.add("mw-filters-wrapped");
  }

  /* The selected filter's rows in the selected order. Most Urgent: kind severity, then locked first, then oldest. */
  function filtered() {
    var list = chip === "snoozed" ? snoozed() : open().filter(function (r) {
      return chip === "risk" ? r.locked : chip === "found" ? r.found : KIND[chip] ? r.chip === chip : true;
    });
    var sort = document.getElementById("mwSort").value;
    return list.sort(function (a, b) {
      if (sort === "oldest") return age(b) - age(a);
      if (sort === "case") return caseName(a.caseId).localeCompare(caseName(b.caseId));
      return SEVERITY.indexOf(a.chip) - SEVERITY.indexOf(b.chip) || (a.locked !== b.locked ? (a.locked ? -1 : 1) : age(b) - age(a));
    });
  }

  /* Row actions are small tertiary buttons, stacked, as in every record row. A link opens the owning screen; a button
     without one shows the item's toast (demo stand-in). */
  function actionHtml(a, id) {
    if (!a) return "";
    var cls = "btn btn-tertiary btn-sm";
    if (a.href) return '<a class="' + cls + '" href="' + a.href + '">' + esc(a.label) + "</a>";
    return '<button type="button" class="' + cls + '" data-toast-row="' + id + '">' + esc(a.label) + "</button>";
  }
  /* Snooze is the last action. A locked (preservation-at-risk) item shows SNOOZE… disabled, with its reason in a Nimbus
     tooltip (design decision 5); the component wraps the disabled button so hover and keyboard focus reach it (a native
     title never shows on a disabled control: PM, 10-15). A snoozed item offers UNSNOOZE. */
  function snoozeHtml(r) {
    if (r.snoozedUntil) return '<button type="button" class="btn btn-tertiary btn-sm" data-unsnooze="' + r.id + '">UNSNOOZE</button>';
    if (r.locked) return '<button type="button" class="btn btn-tertiary btn-sm" disabled data-cnds-tooltip-init data-cnds-placement="top" title="An item with preservation at risk cannot be snoozed." aria-label="Snooze is not available: preservation at risk">SNOOZE…</button>';
    return '<div class="dropdown"><button type="button" class="btn btn-tertiary btn-sm" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">SNOOZE…</button>' +
      '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end mw-snooze-menu">' +
      [["1", "Tomorrow"], ["3", "3 days"], ["7", "7 days"], ["30", "30 days (the longest)"]].map(function (o) {
        return '<li><button type="button" class="dropdown-item" data-snooze-days="' + o[0] + '" data-row="' + r.id + '">' + o[1] + "</button></li>"; }).join("") + "</ul></div>";
  }
  /* Queue row in the standard record format (design decision 4):
       item (no label)  what needs doing, bold; its case as a 14px link; Found by CaseFusion pinned to the foot
       WHY NOW          kind badge · Preservation at Risk (danger text), then the why-now sentence
       WAITING          days waiting (danger once a gap is 5+ days old), then the snooze date when snoozed
     then a blurry divider and the stacked actions. */
  function rowHtml(r) {
    var old = age(r) >= 5 && r.chip === "GAP";
    return '<li class="list-group-item" id="mw-' + r.id + '"><div class="mw-item">' +
      '<div class="mw-item-id"><span class="d-block mw-item-what">' + esc(whatOf(r)) + "</span>" +
        /* Case links sit on their own line, but only the text is clickable: the link stays inline inside a block (Scott, 10-14). */
        '<div><a href="' + caseHref(r.caseId) + '">' + esc(caseName(r.caseId)) + "</a></div>" +
        (r.found ? '<span class="d-block small fw-bold text-warning-emphasis mw-item-flag">Found by CaseFusion</span>' : "") + "</div>" +
      '<div><span class="demo-label">Why Now</span><div class="d-flex flex-wrap align-items-center gap-1">' +
          '<span class="badge badge-' + KIND_BADGE[r.chip] + '">' + r.chip + "</span>" +
          (r.locked ? '<span class="small fw-bold text-danger ms-1">Preservation at Risk</span>' : "") + "</div>" +
        '<div class="mt-1">' + esc(whyOf(r)) + "</div></div>" +
      '<div><span class="demo-label">Waiting</span><div class="' + (old ? "text-danger fw-bold" : "") + '">' + esc(waiting(r)) + "</div>" +
        (r.snoozedUntil ? '<span class="d-block small text-muted">Snoozed until ' + esc(M.fmtDate(r.snoozedUntil)) + "</span>" : "") + "</div>" +
      '<div class="vr vr-blurry" aria-hidden="true"></div>' +
      '<div class="mw-item-actions">' + actionHtml(r.action, r.id) + actionHtml(r.second, r.id + "-2") + snoozeHtml(r) + "</div></div></li>";
  }
  /* Nimbus skeleton (loading.css) in the real row geometry, one per row about to appear. */
  function skeletonRows(n) {
    var line = function (w) { return '<span class="skeleton skeleton-text skeleton-w-' + w + '"></span>'; };
    var row = '<li class="list-group-item" aria-hidden="true"><div class="mw-item">' +
      '<div class="skeleton-group">' + line(75) + line(50) + "</div>" +
      '<div class="skeleton-group">' + line(25) + line(33) + line(100) + line(66) + "</div>" +
      '<div class="skeleton-group">' + line(50) + line(33) + "</div>" +
      '<div class="vr vr-blurry" aria-hidden="true"></div>' +
      '<div class="mw-item-actions"><span class="skeleton skeleton-rect" style="width: 140px; height: 28px;"></span><span class="skeleton skeleton-rect" style="width: 90px; height: 28px;"></span></div>' +
      "</div></li>";
    return new Array(n + 1).join(row);
  }
  function renderQueue() {
    var list = filtered(), q = document.getElementById("mwQueue");
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > pages) page = pages;
    var shown = list.slice((page - 1) * pageSize, page * pageSize);
    /* The queue's one count line, in the toolbar, following the filter (design decision 3). On Preservation at Risk it
       reconciles the button's row count with the tile's unit count (design decision 22). */
    var risk = riskUnits();
    document.getElementById("mwShowing").textContent = chip === "snoozed"
      ? "Showing " + list.length + " of " + snoozed().length + " snoozed"
      : chip === "risk" ? "Showing " + list.length + " of " + open().length + " · " + risk.total + " at risk: " + risk.parts.join(" · ")
      : "Showing " + list.length + " of " + open().length + " · " + list.filter(function (r) { return r.found; }).length + " found by CaseFusion · " + snoozed().length + " snoozed";
    if (!fontsReady) {
      q.setAttribute("aria-busy", "true");
      q.innerHTML = skeletonRows(Math.max(1, shown.length));
      return;
    }
    q.removeAttribute("aria-busy");
    /* Column widths never shift between filters (design decision 6): the action column is measured once, across every
       item in the queue (open and snoozed), so the longest button anywhere sets the width for every filter. */
    if (!actionsFitted) {
      q.innerHTML = rows.map(rowHtml).join("");
      D.fitActions(q, ".mw-item-actions");
      actionsFitted = true;
    }
    /* Tooltips on the rows being replaced are disposed first, so none is left showing; the new rows' are initialised
       after (markup injected after boot is not auto-initialised). */
    var NT = window.Nimbus && Nimbus.Tooltip;
    if (NT) q.querySelectorAll("[data-cnds-tooltip-init]").forEach(function (x) { var i = NT.getInstance(x); if (i) i.dispose(); });
    q.innerHTML = shown.map(rowHtml).join("") || '<li class="list-group-item">' + (chip === "snoozed"
      ? emptyState("Nothing is snoozed", "Snoozed items return to the action queue on their date.")
      : emptyState("No items need action", "New items appear here when an action is required.")) + "</li>";
    if (window.Nimbus && Nimbus.DataAPI) Nimbus.DataAPI.initAll(q);
    /* Pager under the list (design decision 7): the shared Nimbus pagination toolbar; empty when the list is. Nimbus
       selects are disposed before their markup is replaced. */
    var foot = document.getElementById("mwQueueFoot"), NS = window.Nimbus && Nimbus.Select;
    if (NS) foot.querySelectorAll("select[data-cnds-select-init]").forEach(function (x) { var i = NS.getInstance(x); if (i) i.dispose(); });
    foot.innerHTML = list.length ? D.pager("mw", list.length, page, pageSize, "Items per page:") : "";
    if (NS) NS.initAll(foot);
  }
  function render() { renderTop(); renderChips(); renderQueue(); }
  /* After a click: tiles and filter buttons update at once; the count line, rows and pager fade out and back in
     (Nimbus .fade, 0.15s linear: Scott, 10-14). A click during the fade restarts it with the newest choice. No fade
     under reduced motion, or while the skeleton shows. `after` runs once the new rows are in place. */
  var fadeTimer;
  function refresh(after) {
    renderTop(); renderChips();
    var parts = ["mwShowing", "mwQueue", "mwQueueFoot"].map(function (id) { return document.getElementById(id); });
    if (reduceMotion || !fontsReady) { renderQueue(); if (after) after(); return; }
    clearTimeout(fadeTimer);
    parts.forEach(function (p) { p.classList.remove("show"); });
    fadeTimer = setTimeout(function () { renderQueue(); parts.forEach(function (p) { p.classList.add("show"); }); if (after) after(); }, 150);
  }
  /* A page turn or a page-size change brings the list toolbar to the top of the window, so the new page's first row is
     in view (PM, 10-15). It runs after the rows swap: scrolling before a long page shrinks to a short one lets the
     browser move the view off the list. */
  function toQueueTop() { document.getElementById("mwQueueTools").scrollIntoView({ block: "start" }); }

  /* ── Cases Needing Attention (PRD 11 §7.4; design decisions 9–10) ── */
  /* Badge colour by the worst problem: danger for holds removed or not on hold, warning for not acknowledged or
     closed with holds, info for questions and locations to review. */
  function severity(worst, stage) {
    if (/hold removed|not on hold/i.test(worst)) return "danger";
    if (stage === "Closed" || /not acknowledged/i.test(worst)) return "warning";
    return "info";
  }
  /* One case: identity (name · ID link, STAGE under it), NEEDS ATTENTION (badge, then the snooze note when every item
     on the case is snoozed: the case stays listed, MW36), ON HOLD, OPEN REQUESTS (centred). */
  function caseRow(id) {
    var a = M.caseAttention[id];
    var items = rows.filter(function (r) { return r.caseId === id; });
    var onlySnoozed = items.every(function (r) { return r.snoozedUntil; });
    if (id === "MBP-0926") {  /* the demo's live case: computed from its custodians and requests */
      var fully = M.custodians.filter(function (x) { var st = M.coverageOf(x).preservation.state; return st === "done" || st === "na"; }).length;
      a = { stage: "Preservation", onHold: fully + " of " + M.custodians.length, worst: "1 hold removed · 3 not on hold",
        openRequests: M.requests.filter(function (q) { return q.caseId === id && q.status !== "Complete"; }).length };
    }
    return { id: id, a: a, html: '<li class="list-group-item"><div class="mw-case">' +
      '<div><div><a class="fw-bold" href="' + caseHref(id) + '">' + esc(caseName(id)) + '</a></div><span class="d-block small text-muted"><span class="demo-label d-inline me-1">Stage:</span>' + esc(a.stage) + "</span></div>" +
      '<div><span class="demo-label">Needs Attention</span><span class="badge badge-pill badge-verbatim badge-' + severity(a.worst, a.stage) + '">' + esc(a.worst.charAt(0).toUpperCase() + a.worst.slice(1)) + "</span>" +
        (onlySnoozed ? '<span class="d-block small text-muted mt-1">Snoozed in the queue until ' + esc(M.fmtDate(items[0].snoozedUntil)) + "</span>" : "") + "</div>" +
      '<div><span class="demo-label">On Hold</span>' + esc(a.onHold) + " custodians</div>" +
      '<div><span class="demo-label">Open Requests</span>' + a.openRequests + "</div>" +
      "</div></li>" };
  }
  function renderCases() {
    var list = caseIds(rows).map(caseRow), sort = document.getElementById("mwCasesSort").value;
    if (sort === "name") list.sort(function (x, y) { return caseName(x.id).localeCompare(caseName(y.id)); });
    if (sort === "requests") list.sort(function (x, y) { return y.a.openRequests - x.a.openRequests; });
    document.getElementById("mwCases").innerHTML = list.map(function (x) { return x.html; }).join("");
    /* One statement of the count (MW62): the list is complete, so not "Showing n of m"; the footer button names the rest. */
    document.getElementById("mwCasesShowing").textContent = list.length + " of " + access.open + " open cases need attention";
    document.getElementById("mwAllCases").textContent = "SHOW ALL " + access.open + " CASES";
  }

  /* ── This Week (PRD 11 §7.5; design decisions 11–12, MW73) ───────── */
  /* Beside Cases Needing Attention, the card shows as many dates as fit within that card's height, then states the
     remainder with SHOW ALL; stacked, or with either card shut, every date shows. */
  /* footer: "more" (some left out: remainder + SHOW ALL), "fewer" (all shown after SHOW ALL: SHOW FEWER) or none. */
  function drawWeek(n, footer) {
    var wk = weekDates(), shown = wk.slice(0, n), more = wk.length - shown.length, foot = "";
    document.getElementById("mwWeekCount").textContent = sum(wk) + " due";  /* obligations, as the Due This Week tile counts them; each row states its own n (design decision 23). Nimbus badge capitalisation shows "9 Due" */
    /* Day · what is due, the case as a 12px link, then the urgency flag in words (danger text). */
    document.getElementById("mwWeek").innerHTML = shown.map(function (w) {
      return '<li class="list-group-item"><div class="mw-row-week"><span class="fw-bold">' + esc(w.day) + "</span><div>" + esc(w.what) +
        '<div class="small"><a href="' + caseHref(w.caseId) + '">' + esc(M.caseById(w.caseId).name) + "</a></div>" +
        (w.flag ? '<div class="small fw-bold text-danger">' + esc(w.flag) + "</div>" : "") + "</div></div></li>";
    }).join("") || '<li class="list-group-item">' + emptyState("Nothing is due this week", "Request due dates and acknowledgment deadlines appear here.") + "</li>";
    if (footer === "more") foot = '<span class="small text-muted">' + plural(more, "more date") + ' later this week</span><button type="button" class="btn btn-tertiary btn-sm" data-mw="week-all">SHOW ALL</button>';
    if (footer === "fewer") foot = '<span></span><button type="button" class="btn btn-tertiary btn-sm" data-mw="week-fewer">SHOW FEWER</button>';
    /* Card footer below a blurry divider (design decision 14). */
    document.getElementById("mwWeekFoot").innerHTML = foot ? '<hr class="hr hr-blurry demo-card-foot-rule"><div class="d-flex justify-content-between align-items-center">' + foot + "</div>" : "";
  }
  /* How many dates fit beside the Cases card; null when there is no height to match (stacked, or either card shut).
     Both cards are measured at their natural heights (.mw-measuring stops the row stretching them), removing a date
     at a time, with its remainder footer, until the card is no taller than the Cases card. */
  function weekFit() {
    var two = document.querySelector(".mw-two"), cases = document.querySelector('[aria-labelledby="mwCasesH"]'), week = document.querySelector('[aria-labelledby="mwWeekH"]');
    var sideBySide = getComputedStyle(two).gridTemplateColumns.split(" ").length > 1;
    if (!sideBySide || !document.getElementById("mwCasesBody").classList.contains("show") || !document.getElementById("mwWeekBody").classList.contains("show")) return null;
    two.classList.add("mw-measuring");
    var limit = cases.getBoundingClientRect().height, n = weekDates().length;
    drawWeek(n, null);
    while (n > 1 && week.getBoundingClientRect().height > limit) { n--; drawWeek(n, "more"); }
    two.classList.remove("mw-measuring");
    return n;
  }
  /* all: true (SHOW ALL), "fewer" (SHOW FEWER) or false (refit, keeping the current choice). */
  function renderWeek(all) {
    if (all === true) weekAll = true;
    if (all === "fewer") weekAll = false;
    var total = weekDates().length, fit = weekFit();
    if (fit === null || fit >= total) { weekAll = false; drawWeek(total, null); return; }  /* everything fits: no footer */
    if (weekAll) drawWeek(total, "fewer"); else drawWeek(fit, "more");
  }

  /* Smooth height changes in the two-up row (design decision 12): record each card's height, let the change happen,
     then animate from the old height to the new (0.35s, the Nimbus collapse timing). Skipped for reduced motion. */
  function twoUpCards() { return [].slice.call(document.querySelectorAll(".mw-two > .demo-drawer")); }
  function heights(cards) { return cards.map(function (c) { return c.getBoundingClientRect().height; }); }
  function animateFrom(cards, before) {
    if (reduceMotion) return;
    cards.forEach(function (c, i) {
      var to = c.getBoundingClientRect().height, from = before[i];
      if (Math.abs(to - from) < 1) return;
      c.style.transition = "none"; c.style.height = from + "px"; c.style.overflow = "hidden";
      void c.offsetHeight;  /* commit the start height */
      c.style.transition = "height .35s ease"; c.style.height = to + "px";
      var done = function (e) { if (e && e.target !== c) return; c.removeEventListener("transitionend", done); c.style.height = ""; c.style.transition = ""; c.style.overflow = ""; };
      c.addEventListener("transitionend", done); setTimeout(done, 450);
    });
  }
  function smoothly(change) { var cards = twoUpCards(), before = heights(cards); change(); animateFrom(cards, before); }

  /* Refit when the space changes: a resize, or either card opening or closing. The card that collapses animates
     itself (Nimbus Collapse); these handlers ease its partner. */
  var refit;
  window.addEventListener("resize", function () { clearTimeout(refit); refit = setTimeout(function () { renderWeek(false); wrapFilters(); }, 150); });
  ["mwCasesBody", "mwWeekBody"].forEach(function (id) {
    var body = document.getElementById(id), before;
    function partner() { return twoUpCards().filter(function (c) { return !c.contains(body); }); }
    /* Closing: the partner stops stretching as the slide starts; ease it down from where it was. The microtask runs once
       Nimbus has applied the collapse classes, before paint. */
    body.addEventListener("hide.cnds.collapse", function (e) { if (e.target !== body) return; var p = partner(), b = heights(p); queueMicrotask(function () { animateFrom(p, b); }); });
    /* Opening: the partner starts stretching when the slide ends; ease it up from its own height. */
    body.addEventListener("show.cnds.collapse", function (e) { if (e.target === body) before = heights(partner()); });
    body.addEventListener("shown.cnds.collapse", function (e) { if (e.target !== body) return; renderWeek(false); animateFrom(partner(), before); });
    body.addEventListener("hidden.cnds.collapse", function (e) { if (e.target === body) renderWeek(false); });
  });

  /* ── What CaseFusion Did (PRD 11 §7.6; design decision 13) ────────── */
  function renderDid() {
    document.getElementById("mwDidSince").textContent = "Since the last sign-off, " + M.signedOff;  /* no "you" (design decision 19) */
    /* MDI check in success green; the time reads "Today at 6:12 AM" (M.fmtWhen). */
    document.getElementById("mwDid").innerHTML = didList().map(function (d) {
      return '<li class="list-group-item"><div class="mw-row-did"><i class="mdi mdi-check text-success" aria-hidden="true"></i><span class="fw-bold">' + d.n + " " + esc(d.what) +
        '</span><span class="text-muted">' + esc(d.context) + '</span><span class="text-muted text-end">' + esc(M.fmtWhen(d.on, d.time)) + "</span></div></li>";
    }).join("") || '<li class="list-group-item">' + emptyState("Nothing to report", "No automatic tasks ran since the last sign-off.") + "</li>";
  }

  /* ── Weekly status report (PRD 11 §7.7, MW80–84; design decision 20) ── */
  /* A read-only side panel at 50%, so My Work stays in view behind it. It renders the screen's own data (MW82);
     snoozed items are included and marked (MW84). The demo has no resolved-items data (PM question 6), so Resolved
     shows its empty state. EXPORT AS (the CaseFusion export pattern) offers CSV, which downloads the outstanding items,
     and PDF, which the final build needs (PM, 10-15) and the demo does not produce. It opens upward from the footer. */
  function report() {
    var me = M.person(v.personId), did = didList(), due = weekDates();
    function section(title, count, inner) {
      return '<section class="card card-basic mw-report-card"><div class="card-body"><div class="demo-section-head mw-report-head">' +
        '<h3 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1">' + title + '</h3><span class="badge badge-secondary">' + count + "</span></div>" + inner + "</div></section>";
    }
    function list(items) { return '<ul class="list-group list-group-light demo-rows mw-report-list">' + items.join("") + "</ul>"; }
    /* Every row: the item (bold) and its case on the left, kind / time / day on the right. */
    function row(left, right) { return '<li class="list-group-item"><div class="mw-report-row"><div>' + left + "</div>" + right + "</div></li>"; }
    var body =
      '<p class="small text-muted mb-1">' + esc(me.name) + " · All Cases · 10-02-2026 – 10-08-2026</p>" +
      '<p class="small text-muted mb-3">Generated from My Work. Snoozed items are included and marked.</p>' +
      section("Outstanding", rows.length, list(rows.map(function (r) {
        return row('<span class="d-block fw-bold">' + esc(whatOf(r)) + '</span><span class="d-block small text-muted">' + esc(caseName(r.caseId)) + "</span>" +
            (r.snoozedUntil ? '<span class="d-block small fw-bold text-warning-emphasis">Snoozed until ' + esc(M.fmtDate(r.snoozedUntil)) + "</span>" : ""),
          '<div class="text-end"><span class="badge badge-' + KIND_BADGE[r.chip] + '">' + r.chip + '</span><span class="d-block small mt-1">' + esc(waiting(r)) + "</span></div>");
      }))) +
      section("Resolved", 0, emptyState("No items were resolved this period", "Items closed in the last seven days appear here.", "pb-2")) +
      section("What CaseFusion Did", sum(did), list(did.map(function (x) {
        return row('<span class="d-block fw-bold">' + x.n + " " + esc(x.what) + '</span><span class="d-block small text-muted">' + esc(x.context) + "</span>",
          '<div class="text-end small text-nowrap">' + esc(M.fmtWhen(x.on, x.time)) + "</div>");
      }))) +
      section("Due Next", sum(due),  /* obligations, as the tile and This Week badge (design decision 23) */
         list(due.map(function (w) {
        return row('<span class="d-block fw-bold">' + esc(w.what) + '</span><span class="d-block small text-muted">' + esc(M.caseById(w.caseId).name) + "</span>" +
            (w.flag ? '<span class="d-block small fw-bold text-danger">' + esc(w.flag) + "</span>" : ""),
          '<div class="text-end small fw-bold">' + esc(w.day) + "</div>");
      })));
    var panel = D.offcanvas({ title: "Weekly Status Report", width: "50vw", body: body,
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' +
        '<div class="dropup"><button type="button" class="btn btn-secondary dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">Export As <i class="mdi mdi-chevron-up" aria-hidden="true"></i></button>' +
        '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end demo-menu-hug" role="menu">' +
        '<li role="none"><button type="button" class="dropdown-item" role="menuitem" data-report-dl>CSV</button></li>' +
        '<li role="none"><a class="dropdown-item" role="menuitem" href="not-in-demo.html?what=Weekly+status+report+(PDF)">PDF</a></li></ul></div>' });
    panel.el.querySelector("[data-report-dl]").addEventListener("click", function () {
      csv("weekly-status-report.csv", [["Kind", "Item", "Case", "Waiting", "Snoozed until"]].concat(rows.map(function (r) {
        return [r.chip, whatOf(r), M.caseById(r.caseId).name, waiting(r), r.snoozedUntil ? M.fmtDate(r.snoozedUntil) : ""]; })));
      D.toast("Weekly status report downloaded.");
    });
  }

  /* ── Events ───────────────────────────────────────────────────────── */
  onSelect(document.getElementById("mwSort"), function () { page = 1; refresh(); });
  onSelect(document.getElementById("mwCasesSort"), renderCases);
  /* Pager size select (rendered into the queue footer): back to page 1. */
  onSelect(document.getElementById("mwQueueFoot"), function (e) { if (e.target.getAttribute("data-pg-size") === "mw") { pageSize = +e.target.value; page = 1; refresh(toQueueTop); } });
  /* Queue filters are radios: one change event per selection. */
  document.getElementById("mwChips").addEventListener("change", function (e) { if (e.target.name === "mwFilter") { chip = e.target.value; page = 1; refresh(); } });

  /* Every click on the page, by the data attribute it carries. */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    /* Pager arrows. */
    if (t.getAttribute("data-pg-for") === "mw") { page = D.turnPage(page, t.getAttribute("data-pg"), filtered().length, pageSize); refresh(toQueueTop); return; }
    /* Tiles: Needs Action / Preservation at Risk filter the queue; Due This Week expands This Week; Overdue opens Requests. */
    if (t.hasAttribute("data-tile")) {
      var k = t.getAttribute("data-tile");
      if (k === "week") { renderWeek(true); document.getElementById("mwWeekH").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if (k === "overdue") { window.location.href = "case-requests.html"; return; }
      chip = k === "risk" ? "risk" : "open"; page = 1;
      refresh(); document.getElementById("mwQueueH").scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    /* Snooze from the row menu: the item leaves Open but stays counted in Needs Action. */
    if (t.hasAttribute("data-snooze-days")) {
      var until = new Date(Date.parse(M.DEMO_TODAY) + parseInt(t.getAttribute("data-snooze-days"), 10) * 86400000).toISOString().slice(0, 10);
      rowById(t.getAttribute("data-row")).snoozedUntil = until;
      refresh();
      D.toast("Snoozed until " + M.fmtDate(until) + ". The item stays counted in Needs Action and returns early if its condition worsens.");
      return;
    }
    if (t.hasAttribute("data-unsnooze")) { delete rowById(t.getAttribute("data-unsnooze")).snoozedUntil; refresh(); D.toast("The item is back in the action queue."); return; }
    if (t.hasAttribute("data-toast-row")) { D.toast(rowById(t.getAttribute("data-toast-row").replace(/-2$/, "")).action.toast || "Done."); return; }
    switch (t.getAttribute("data-mw")) {
      case "report": report(); break;
      case "week-all": smoothly(function () { renderWeek(true); }); break;
      case "week-fewer": smoothly(function () { renderWeek("fewer"); }); break;
      case "export":
        var list = filtered();
        csv("my-work.csv", [["Kind", "Item", "Why now", "Case", "Waiting", "Found by CaseFusion", "Preservation at risk"]].concat(list.map(function (r) {
          return [r.chip, whatOf(r), whyOf(r), caseName(r.caseId), waiting(r), r.found ? "Yes" : "", r.locked ? "Yes" : ""];
        })));
        D.toast("Exported " + list.length + " items.");
    }
  });

  /* ── First render ─────────────────────────────────────────────────── */
  if (!fontsReady) document.fonts.ready.then(function () { fontsReady = true; renderQueue(); renderWeek(false); wrapFilters(); });
  render(); renderCases(); renderWeek(false); renderDid();
}());
