/* ═══════════════════════════════════════════════════════════════════════
   My Work controller (PRD 11 §7).
   One queue across every case the viewer can open. It resolves nothing:
   every action opens the screen that owns the condition. Snooze is
   personal, at most 30 days, stays counted in Needs Action, and is refused on
   preservation-at-risk rows.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var v = D.viewer();
  var access = M.viewerCases[v.id];
  var rows = JSON.parse(JSON.stringify(M.myWork.filter(function (r) { return access.cases.indexOf(r.caseId) !== -1; })));
  var chip = "open";
  var actionsFitted = false;
  /* The queue's columns are measured with the web font, so until it has loaded the list shows skeleton rows. */
  /* API seam (Scott, 10-14): these screens will read their data from APIs. Then the skeleton shows while that request is
     pending (render skeletonRows(), await the call, then render rows), and the font-ready trigger below is only the
     demo's stand-in. Keep the data behind its one call so the API can replace it without touching rendering. */
  var fontsReady = !(document.fonts && document.fonts.status !== "loaded");
  var page = 1, pageSize = 25;  /* queue pager: 25 rows by default on My Work (Scott, 10-14; the house default elsewhere is 10) */

  var KIND = { GAP: "Gaps", ANSWER: "Questions", DECIDE: "Decisions", APPROVE: "Approvals", CONFIRM: "Receipts", REVIEW: "Reviews" };
  var SEVERITY = ["GAP", "DECIDE", "ANSWER", "APPROVE", "CONFIRM", "REVIEW"];
  function caseName(id) { var c = M.caseById(id); return c.name + " · " + c.id; }
  function age(r) { return r.age != null ? r.age : M.ageFromToday(r.since); }
  function waiting(r) { if (r.waitingText) return r.waitingText; var d = age(r); return d + (d === 1 ? " day" : " days"); }
  function masked(r) { return r.maskPerson && !D.canSee(M.person(r.maskPerson)); }
  function open() { return rows.filter(function (r) { return !r.snoozedUntil; }); }
  function snoozed() { return rows.filter(function (r) { return r.snoozedUntil; }); }
  function units(list) {
    var u = { removed: 0, notOnHold: 0, attestation: 0, leaver: 0 };
    list.forEach(function (r) { Object.keys(r.units || {}).forEach(function (k) { u[k] += r.units[k]; }); });
    return u;
  }
  function caseIds(list) { var s = {}; list.forEach(function (r) { s[r.caseId] = true; }); return Object.keys(s); }

  /* ── Header, lead line, tiles ───────────────────────────────────────── */
  function renderTop() {
    var did = M.whatCaseFusionDid.filter(function (d) { return access.cases.indexOf(d.caseId) !== -1; })
      .sort(function (a, b) { return (b.on + b.time).localeCompare(a.on + a.time); });  /* newest first */
    var handled = did.reduce(function (n, d) { return n + d.n; }, 0);
    var cases = caseIds(rows).length;
    /* Lead line (PRD 11 MW4), formal tone: a statement of fact, no "you", nothing personified (design decision 18). */
    document.getElementById("mwLead").innerHTML = "<b>" + rows.length + " items need action</b> across " + cases + " of " + access.open +
      " cases. CaseFusion completed " + handled + " tasks automatically since the last sign-off yesterday.";
    var u = units(rows.filter(function (r) { return r.locked; }));
    var uTotal = u.removed + u.notOnHold + u.attestation + u.leaver;
    var uParts = [];
    if (u.removed) uParts.push(u.removed + " hold removed");
    if (u.notOnHold) uParts.push(u.notOnHold + " not on hold");
    if (u.attestation) uParts.push(u.attestation + " attestation overdue");
    if (u.leaver) uParts.push(u.leaver + " leaver");
    var od = M.overdueWithTeams.filter(function (o) { return access.cases.indexOf(o.caseId) !== -1; }).sort(function (a, b) { return b.days - a.days; });
    var wk = M.thisWeek.filter(function (w) { return access.cases.indexOf(w.caseId) !== -1; });
    var req = wk.filter(function (w) { return w.kind === "request"; }).reduce(function (n, w) { return n + w.n; }, 0);
    var ack = wk.filter(function (w) { return w.kind === "ack"; }).reduce(function (n, w) { return n + w.n; }, 0);
    /* Shared summary-card style (demo.css). Names in Title Case (CSS uppercases them); a tile with nothing behind it is
       disabled, never hidden (Scott, 10-14). */
    function tile(key, value, name, sub, pressed, disabled) {
      return '<button type="button" class="card card-basic demo-tile" data-tile="' + key + '" aria-pressed="' + !!pressed + '"' + (disabled ? " disabled" : "") + '><span class="card-subtitle demo-tile-name">' + esc(name) +
        '</span><span class="card-title demo-tile-value">' + value + '</span><span class="card-text demo-tile-label">' + esc(sub) + "</span></button>";
    }
    document.getElementById("mwTiles").innerHTML =
      tile("needs", rows.length, "Needs Action", "Across " + cases + " of " + access.open + " cases", chip === "open", !rows.length) +
      tile("risk", uTotal, "Preservation at Risk", uParts.join(" · ") || "Nothing at risk", chip === "risk", !uTotal) +
      tile("overdue", od.length, "Overdue with Response Teams", od.length ? "Oldest " + od[0].days + " days · " + od[0].team : "None") +
      tile("week", req + ack, "Due This Week", req + " requests · " + ack + " acknowledgment" + (ack === 1 ? "" : "s"), false, !(req + ack));
  }

  /* ── Queue (Nimbus: toggle button group filters, list-group rows, dropdown snooze) ─ */
  var KIND_BADGE = { GAP: "warning", ANSWER: "info", DECIDE: "danger", APPROVE: "caution", CONFIRM: "success", REVIEW: "secondary" };
  function renderChips() {
    var o = open();
    var defs = [["open", "Open", o.length], ["found", "Found by CaseFusion", o.filter(function (r) { return r.found; }).length], ["snoozed", "Snoozed", snoozed().length]];
    ["GAP", "ANSWER", "DECIDE", "APPROVE", "CONFIRM", "REVIEW"].forEach(function (k) { defs.push([k, KIND[k], o.filter(function (r) { return r.chip === k; }).length]); });
    if (chip === "risk") defs.splice(1, 0, ["risk", "Preservation at risk", o.filter(function (r) { return r.locked; }).length]);
    /* Two Nimbus toggle button groups (radio btn-check + button labels, single select, square, default size: Scott 10-14): status
       filters, then kinds, split by a toolbar divider. A filter with nothing in it is disabled, never hidden. */
    var status = defs.filter(function (d) { return !KIND[d[0]]; }), kinds = defs.filter(function (d) { return KIND[d[0]]; });
    var group = function (list, label) {
      return '<div class="btn-group" role="group" aria-label="' + label + '">' + list.map(function (d) {
        var id = "mwF-" + d[0], on = chip === d[0];
        return '<input type="radio" class="btn-check" name="mwFilter" id="' + id + '" value="' + d[0] + '" autocomplete="off"' + (on ? " checked" : "") + (d[2] || on ? "" : " disabled") + ">" +
          '<label class="btn btn-secondary" for="' + id + '">' + esc(d[1]) + " (" + d[2] + ")</label>";
      }).join("") + "</div>";
    };
    /* A blurry divider between the two sets: parts of one control row (house rule). */
    document.getElementById("mwChips").innerHTML = group(status, "Queue status") + '<div class="vr vr-blurry" aria-hidden="true"></div>' + group(kinds, "Kind of work");
  }
  function sortValue() { var el = document.getElementById("mwSort"); return el ? el.value : "urgent"; }
  function filtered() {
    var list;
    if (chip === "snoozed") list = snoozed();
    else if (chip === "risk") list = open().filter(function (r) { return r.locked; });
    else if (chip === "found") list = open().filter(function (r) { return r.found; });
    else if (KIND[chip]) list = open().filter(function (r) { return r.chip === chip; });
    else list = open();
    var sort = sortValue();
    return list.slice().sort(function (a, b) {
      if (sort === "oldest") return age(b) - age(a);
      if (sort === "case") return caseName(a.caseId).localeCompare(caseName(b.caseId));
      var s = SEVERITY.indexOf(a.chip) - SEVERITY.indexOf(b.chip);
      if (s) return s;
      if (a.locked !== b.locked) return a.locked ? -1 : 1;
      return age(b) - age(a);
    });
  }
  /* Row actions are small tertiary buttons, stacked, as in every record row (Hold Status model, Scott 10-14). */
  function actionHtml(a, id) {
    if (!a) return "";
    var cls = "btn btn-tertiary btn-sm";
    if (a.href) return '<a class="' + cls + '" href="' + a.href + '">' + esc(a.label) + "</a>";
    return '<button type="button" class="' + cls + '" data-toast-row="' + id + '">' + esc(a.label) + "</button>";
  }
  /* Snooze is the last action. A preservation-at-risk item cannot be snoozed: the button is disabled, not hidden,
     and says why. A snoozed item offers UNSNOOZE. */
  function snoozeHtml(r) {
    if (r.snoozedUntil) return '<button type="button" class="btn btn-tertiary btn-sm" data-unsnooze="' + r.id + '">UNSNOOZE</button>';
    if (r.locked) return '<button type="button" class="btn btn-tertiary btn-sm" disabled title="An item with preservation at risk cannot be snoozed." aria-label="Snooze is not available: preservation at risk">SNOOZE…</button>';
    return '<div class="dropdown"><button type="button" class="btn btn-tertiary btn-sm" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">SNOOZE…</button>' +
      '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end mw-snooze-menu">' +
      [["1", "Tomorrow"], ["3", "3 days"], ["7", "7 days"], ["30", "30 days (the longest)"]].map(function (o) {
        return '<li><button type="button" class="dropdown-item" data-snooze-days="' + o[0] + '" data-row="' + r.id + '">' + o[1] + "</button></li>"; }).join("") + "</ul></div>";
  }
  /* Queue row in the standard record format (Hold Status source row, Scott 10-14):
       item (no label): what needs doing, bold 14px, its case as a 14px link under it, then Found by CaseFusion
       WHY NOW: kind badge · Preservation at Risk on one line, then the why-now sentence (14px)
       WAITING: days waiting (danger once a gap is 5+ days old), then the snooze date when snoozed
       then a blurry divider and the stacked actions. */
  function rowHtml(r) {
    var m = masked(r);
    var caseHref = r.caseId === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(r.caseId));
    var old = age(r) >= 5 && r.chip === "GAP";
    return '<li class="list-group-item" id="mw-' + r.id + '"><div class="mw-item">' +
      '<div class="mw-item-id"><span class="d-block mw-item-what">' + esc(m && r.whatMasked ? r.whatMasked : r.what) + "</span>" +
        /* The case is read before acting (My Work spans every case), so its link is 14px regular (Sally, Scott 10-14). */
        '<a class="d-block" href="' + caseHref + '">' + esc(caseName(r.caseId)) + "</a>" +
        /* An informational flag, not part of the name/case block: pinned to the foot of the column (Scott, Sally 10-14).
           12px bold in the theme's warning text colour. */
        (r.found ? '<span class="d-block small fw-bold text-warning-emphasis mw-item-flag">Found by CaseFusion</span>' : "") + "</div>" +
      /* WHY NOW (PRD 11's term), not STATUS: the column says why the item is here and how serious it is (Sally, Scott 10-14). */
      '<div><span class="demo-label">Why Now</span><div class="d-flex flex-wrap align-items-center gap-1">' +
          '<span class="badge badge-' + KIND_BADGE[r.chip] + '">' + r.chip + "</span>" +
          /* Danger text beside the kind badge, as Hold Status shows the exception type (PM design, Sally, Scott 10-14). */
          (r.locked ? '<span class="small fw-bold text-danger ms-1">Preservation at Risk</span>' : "") +
"</div>" +
        '<div class="mt-1">' + esc(m && r.whyMasked ? r.whyMasked : r.why) + "</div></div>" +
      '<div><span class="demo-label">Waiting</span><div class="' + (old ? "text-danger fw-bold" : "") + '">' + esc(waiting(r)) + "</div>" +
        (r.snoozedUntil ? '<span class="d-block small text-muted">Snoozed until ' + esc(M.fmtDate(r.snoozedUntil)) + "</span>" : "") + "</div>" +
      '<div class="vr vr-blurry" aria-hidden="true"></div>' +
      '<div class="mw-item-actions">' + actionHtml(r.action, r.id) + actionHtml(r.second, r.id + "-2") + snoozeHtml(r) + "</div></div></li>";
  }
  function renderQueue() {
    var list = filtered(), o = open();
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > pages) page = pages;
    var shown = list.slice((page - 1) * pageSize, page * pageSize);
    /* The queue's one count line, in the toolbar, following the filter (Scott, Sally 10-14): how many of the open queue
       are shown, how many of those CaseFusion found, and how many are snoozed. On Snoozed it counts the snoozed list. */
    document.getElementById("mwShowing").textContent = chip === "snoozed"
      ? "Showing " + list.length + " of " + snoozed().length + " snoozed"
      : "Showing " + list.length + " of " + o.length + " · " + list.filter(function (r) { return r.found; }).length + " found by CaseFusion · " + snoozed().length + " snoozed";
    var q = document.getElementById("mwQueue");
    if (!fontsReady) {
      /* Nimbus skeleton (loading.css) in the real row geometry, one per row about to appear; aria-busy on the list,
         the placeholders hidden from assistive tech (Scott, 10-14). */
      q.setAttribute("aria-busy", "true");
      q.innerHTML = skeletonRows(Math.max(1, shown.length));
      return;
    }
    q.removeAttribute("aria-busy");
    q.innerHTML = shown.map(rowHtml).join("") ||
      '<li class="list-group-item">' + emptyState(chip === "snoozed" ? "Nothing is snoozed" : "No items need action",
        chip === "snoozed" ? "Snoozed items return to the action queue on their date." : "New items appear here when an action is required.") + "</li>";
    /* Column widths never shift between filters (Scott, 10-14): the action column is measured once, across every item in
       the queue (open and snoozed), so the longest button anywhere sets the width for every filter. */
    if (!actionsFitted) {
      var q = document.getElementById("mwQueue"), html = q.innerHTML;
      q.innerHTML = rows.map(rowHtml).join("");
      D.fitActions(q, ".mw-item-actions");
      q.innerHTML = html;
      actionsFitted = true;
    }
    /* Pager under the list (PM, Scott 10-14): the shared Nimbus pagination toolbar; hidden when the list is empty. */
    var foot = document.getElementById("mwQueueFoot");
    if (window.Nimbus && Nimbus.Select) foot.querySelectorAll("select[data-cnds-select-init]").forEach(function (x) { var i = Nimbus.Select.getInstance(x); if (i) i.dispose(); });
    foot.innerHTML = list.length ? D.pager("mw", list.length, page, pageSize, "Items per page:") : "";
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(foot);
  }


  function skeletonRows(n) {
    var line = function (w, cls) { return '<span class="skeleton skeleton-text skeleton-w-' + w + (cls ? " " + cls : "") + '"></span>'; };
    var row = '<li class="list-group-item" aria-hidden="true"><div class="mw-item">' +
      '<div class="skeleton-group">' + line(75) + line(50) + "</div>" +
      '<div class="skeleton-group">' + line(25) + line(33) + line(100) + line(66) + "</div>" +
      '<div class="skeleton-group">' + line(50) + line(33) + "</div>" +
      '<div class="vr vr-blurry" aria-hidden="true"></div>' +
      '<div class="mw-item-actions"><span class="skeleton skeleton-rect" style="width: 140px; height: 28px;"></span><span class="skeleton skeleton-rect" style="width: 90px; height: 28px;"></span></div>' +
      "</div></li>";
    return new Array(n + 1).join(row);
  }

  /* Shared empty state (demo.css .demo-empty): icon, bold title, muted note, centred (Scott, 10-14). */
  function emptyState(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }

  /* ── Lower sections (table, list groups) ────────────────────────────── */
  /* Cases Needing Attention (Scott, Sally 10-14): standard record rows under a list toolbar.
       case (no label): name · ID as a 14px bold link, then "STAGE: Preservation" as the 12px line under it
       NEEDS ATTENTION: the worst problem as a verbatim badge coloured by severity, then the snooze note when snoozed
       ON HOLD:  "3 of 9 custodians" (the old Custodians column folded in)
       OPEN REQUESTS: the count */
  function severity(worst, stage) {
    if (/hold removed|not on hold/i.test(worst)) return "danger";
    if (stage === "Closed" || /not acknowledged/i.test(worst)) return "warning";
    return "info";  /* questions, locations to review */
  }
  function caseRow(id) {
    var a = M.caseAttention[id];
    var mine = rows.filter(function (r) { return r.caseId === id; });
    var onlySnoozed = mine.every(function (r) { return r.snoozedUntil; });
    if (id === "MBP-0926") {
      var fully = M.custodians.filter(function (x) { var st = M.coverageOf(x).preservation.state; return st === "done" || st === "na"; }).length;
      a = { stage: "Preservation", custodians: M.custodians.length, onHold: fully + " of " + M.custodians.length,
        openRequests: M.requests.filter(function (q) { return q.caseId === id && q.status !== "Complete"; }).length, worst: "1 hold removed · 3 not on hold" };
    }
    var href = id === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(id));
    return { id: id, a: a, html: '<li class="list-group-item"><div class="mw-case">' +
      '<div><a class="d-block fw-bold" href="' + href + '">' + esc(caseName(id)) + '</a><span class="d-block small text-muted"><span class="demo-label d-inline me-1">Stage:</span>' + esc(a.stage) + "</span></div>" +
      '<div><span class="demo-label">Needs Attention</span><span class="badge badge-pill badge-verbatim badge-' + severity(a.worst, a.stage) + '">' + esc(a.worst.charAt(0).toUpperCase() + a.worst.slice(1)) + "</span>" +
        (onlySnoozed ? '<span class="d-block small text-muted mt-1">Snoozed in the queue until ' + esc(M.fmtDate(mine[0].snoozedUntil)) + "</span>" : "") + "</div>" +
      '<div><span class="demo-label">On Hold</span>' + esc(a.onHold) + " custodians</div>" +
      '<div><span class="demo-label">Open Requests</span>' + a.openRequests + "</div>" +
      "</div></li>" };
  }
  function renderCases() {
    var list = caseIds(rows).map(caseRow), sort = (document.getElementById("mwCasesSort") || {}).value || "attention";
    if (sort === "name") list.sort(function (x, y) { return caseName(x.id).localeCompare(caseName(y.id)); });
    if (sort === "requests") list.sort(function (x, y) { return y.a.openRequests - x.a.openRequests; });
    document.getElementById("mwCases").innerHTML = list.map(function (x) { return x.html; }).join("");
    /* One statement of the count (Sally, Scott 10-14): this list is complete, so it is not "Showing n of m"; the way to the
       rest says how many there are. */
    document.getElementById("mwCasesShowing").textContent = list.length + " of " + access.open + " open cases need attention";
    document.getElementById("mwAllCases").textContent = "SHOW ALL " + access.open + " CASES";
  }
  ["change", "valueChanged.cnds.select"].forEach(function (t) { document.getElementById("mwCasesSort").addEventListener(t, renderCases); });
  /* This Week (PRD 11 §7.5, MW73). Beside Cases Needing Attention, the card shows as many dates as fit within that card's
     height, then states the remainder with SHOW ALL; stacked, or with Cases shut, there is no height to match, so every
     date shows. SHOW ALL lists them all (Scott, 10-14). */
  var weekAll = false;
  function weekDates() { return M.thisWeek.filter(function (w) { return access.cases.indexOf(w.caseId) !== -1; }); }
  function caseHref(id) { return id === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(id)); }
  /* footer: "more" (n left out, SHOW ALL), "fewer" (all shown after SHOW ALL, SHOW FEWER) or none. */
  function drawWeek(n, footer) {
    var wk = weekDates(), shown = wk.slice(0, n);
    var cnt = document.getElementById("mwWeekCount");
    cnt.textContent = wk.length + " date" + (wk.length === 1 ? "" : "s");  /* THIS WEEK · {n} dates (PRD 11 §7.5); Nimbus badge capitalisation shows "6 Dates" */
    document.getElementById("mwWeek").innerHTML = shown.map(function (w) {
      /* Day · what is due, then the case as a 12px link (as every case name on the page), then the urgency flag in words. */
      return '<li class="list-group-item"><div class="mw-row-week"><span class="fw-bold">' + esc(w.day) + "</span><div>" + esc(w.what) +
        '<a class="d-block small" href="' + caseHref(w.caseId) + '">' + esc(M.caseById(w.caseId).name) + "</a>" +
        (w.flag ? '<div class="small fw-bold text-danger">' + esc(w.flag) + "</div>" : "") + "</div></div></li>";
    }).join("");
    /* Card footer below a blurry divider (MW73): the remainder with SHOW ALL, or SHOW FEWER once expanded. */
    var more = wk.length - shown.length, foot = "";
    if (footer === "more") foot = '<span class="small text-muted">' + more + " more date" + (more === 1 ? "" : "s") + ' later this week</span><button type="button" class="btn btn-tertiary btn-sm" data-mw="week-all">SHOW ALL</button>';
    if (footer === "fewer") foot = '<span></span><button type="button" class="btn btn-tertiary btn-sm" data-mw="week-fewer">SHOW FEWER</button>';
    document.getElementById("mwWeekFoot").innerHTML = foot ? '<hr class="hr hr-blurry demo-card-foot-rule"><div class="d-flex justify-content-between align-items-center">' + foot + "</div>" : "";
  }
  /* How many dates fit beside the Cases card (null when there is no height to match: stacked, or either card shut). */
  function weekFit() {
    var wk = weekDates(), two = document.querySelector(".mw-two"), cases = document.querySelector('[aria-labelledby="mwCasesH"]'), week = document.querySelector('[aria-labelledby="mwWeekH"]');
    var sideBySide = getComputedStyle(two).gridTemplateColumns.split(" ").length > 1;
    if (!sideBySide || !document.getElementById("mwCasesBody").classList.contains("show") || !document.getElementById("mwWeekBody").classList.contains("show")) return null;
    /* Measure at natural heights (the row normally stretches both cards to the taller one). */
    two.classList.add("mw-measuring");
    var limit = cases.getBoundingClientRect().height, n = wk.length;
    drawWeek(n, null);
    if (week.getBoundingClientRect().height > limit) { do { n--; drawWeek(n, "more"); } while (n > 1 && week.getBoundingClientRect().height > limit); }
    two.classList.remove("mw-measuring");
    return n;
  }
  function renderWeek(all) {
    if (all === true) weekAll = true;
    if (all === "fewer") weekAll = false;
    var total = weekDates().length, fit = weekFit();
    if (fit === null || fit >= total) { weekAll = false; drawWeek(total, null); return; }  /* everything fits: no footer */
    if (weekAll) drawWeek(total, "fewer"); else drawWeek(fit, "more");
  }
  /* Smooth height changes in the two-up row (Scott, 10-14): record each card's height, let the change happen, then animate
     from the old height to the new one (0.35s, the Nimbus collapse timing). Skipped when the user prefers reduced motion. */
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function twoUpCards() { return [].slice.call(document.querySelectorAll(".mw-two > .demo-drawer")); }
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
  function smoothly(change) {
    var cards = twoUpCards(), before = cards.map(function (c) { return c.getBoundingClientRect().height; });
    change(); animateFrom(cards, before);
  }

  /* Refit when the space changes: a resize, or either card opening or closing. */
  var refit; window.addEventListener("resize", function () { clearTimeout(refit); refit = setTimeout(function () { renderWeek(false); }, 150); });
  ["mwCasesBody", "mwWeekBody"].forEach(function (id) {
    var body = document.getElementById(id), partner = function () { return twoUpCards().filter(function (c) { return !c.contains(body); }); }, before;
    /* Closing: the partner stops stretching as the slide starts; ease it down from where it was. */
    body.addEventListener("hide.cnds.collapse", function (e) { if (e.target !== body) return; var p = partner(); before = p.map(function (c) { return c.getBoundingClientRect().height; }); queueMicrotask(function () { animateFrom(p, before); }); });  /* runs once Nimbus has applied the collapse classes, before paint */
    /* Opening: the partner starts stretching when the slide ends; ease it up from its own height. */
    body.addEventListener("show.cnds.collapse", function (e) { if (e.target === body) before = partner().map(function (c) { return c.getBoundingClientRect().height; }); });
    body.addEventListener("shown.cnds.collapse", function (e) { if (e.target !== body) return; renderWeek(false); animateFrom(partner(), before); });
    body.addEventListener("hidden.cnds.collapse", function (e) { if (e.target === body) renderWeek(false); });
  });
  function renderDid() {
    var did = M.whatCaseFusionDid.filter(function (d) { return access.cases.indexOf(d.caseId) !== -1; })
      .sort(function (a, b) { return (b.on + b.time).localeCompare(a.on + a.time); });  /* newest first */
    document.getElementById("mwDidSince").textContent = "Since the last sign-off, " + M.signedOff;  /* formal tone, no "you" (design decision 19) */
    document.getElementById("mwDid").innerHTML = did.map(function (d) {
      /* MDI check in success green; the time reads "Today at 6:12 AM" (M.fmtWhen). */
      return '<li class="list-group-item"><div class="mw-row-did"><i class="mdi mdi-check text-success" aria-hidden="true"></i><span class="fw-bold">' + d.n + " " + esc(d.what) +
        '</span><span class="text-muted">' + esc(d.context) + '</span><span class="text-muted text-end">' + esc(M.fmtWhen(d.on, d.time)) + "</span></div></li>";
    }).join("") || '<li class="list-group-item">' + emptyState("Nothing to report", "No automatic tasks ran since the last sign-off.") + "</li>";
  }
  function render() { renderTop(); renderChips(); renderQueue(); }

  /* ── Weekly status report (MW80–84) in a Nimbus modal; snoozed included, marked. ── */
  function csv(name, lines) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.map(function (l) { return l.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function report() {
    var me = M.person(v.personId);
    var did = M.whatCaseFusionDid.filter(function (x) { return access.cases.indexOf(x.caseId) !== -1; });
    var tbl = function (head, body) { return '<div class="table-responsive mb-3"><table class="table table-sm align-middle mb-0"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>"; };
    var m = D.modal({ title: "Weekly Status Report", size: "lg",
      body: '<p class="text-muted">' + esc(me.name) + " · all cases · 10-02-2026 – 10-08-2026. Generated from My Work; snoozed items are included and marked.</p>" +
        '<div class="cf-category cf-cat-4">Outstanding</div>' + tbl(["Kind", "What", "Case", "Waiting"], rows.map(function (r) {
          return "<tr><td>" + esc(r.chip) + "</td><td>" + esc(masked(r) && r.whatMasked ? r.whatMasked : r.what) + "</td><td>" + esc(M.caseById(r.caseId).name) + "</td><td>" + esc(waiting(r)) +
            (r.snoozedUntil ? ' <span class="badge badge-pill badge-warning">Snoozed until ' + esc(M.fmtDate(r.snoozedUntil)) + "</span>" : "") + "</td></tr>"; }).join("")) +
        '<div class="cf-category cf-cat-4">What CaseFusion Did</div>' + tbl(["Count", "Context"], did.map(function (x) { return "<tr><td>" + x.n + " " + esc(x.what) + "</td><td>" + esc(x.context) + "</td></tr>"; }).join("")) +
        '<div class="cf-category cf-cat-4">Due Next</div>' + tbl(["Day", "What", "Case"], M.thisWeek.filter(function (w) { return access.cases.indexOf(w.caseId) !== -1; }).map(function (w) {
          return "<tr><td>" + esc(w.day) + "</td><td>" + esc(w.what) + "</td><td>" + esc(M.caseById(w.caseId).name) + "</td></tr>"; }).join("")),
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CLOSE</button><button type="button" class="btn btn-primary" data-report-dl>DOWNLOAD</button>' });
    m.el.querySelector("[data-report-dl]").addEventListener("click", function () {
      csv("weekly-status-report.csv", [["Kind", "What", "Case", "Waiting", "Snoozed until"]].concat(rows.map(function (r) {
        return [r.chip, masked(r) && r.whatMasked ? r.whatMasked : r.what, M.caseById(r.caseId).name, waiting(r), r.snoozedUntil ? M.fmtDate(r.snoozedUntil) : ""]; })));
      D.toast("Weekly status report downloaded.");
    });
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  function onSort() { page = 1; renderQueue(); }
  document.getElementById("mwSort").addEventListener("change", onSort);
  document.getElementById("mwSort").addEventListener("valueChanged.cnds.select", onSort);
  /* Queue filters are radios: one change event per selection. */
  document.getElementById("mwChips").addEventListener("change", function (e) { if (e.target.name === "mwFilter") { chip = e.target.value; page = 1; render(); } });
  /* Pager: arrows turn the page; the size select resets to page 1. */
  function onPageSize(e) { if (e.target.getAttribute("data-pg-size") === "mw") { pageSize = +e.target.value; page = 1; renderQueue(); } }
  document.getElementById("mwQueueFoot").addEventListener("change", onPageSize);
  document.getElementById("mwQueueFoot").addEventListener("valueChanged.cnds.select", onPageSize);
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    if (t.getAttribute("data-pg-for") === "mw") { page = D.turnPage(page, t.getAttribute("data-pg"), filtered().length, pageSize); renderQueue(); document.getElementById("mwQueueH").scrollIntoView({ block: "start" }); return; }
    if (t.hasAttribute("data-tile")) {
      var k = t.getAttribute("data-tile");
      if (k === "week") { renderWeek(true); document.getElementById("mwWeekH").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if (k === "overdue") { window.location.href = "case-requests.html"; return; }
      chip = k === "risk" ? "risk" : "open";
      render(); document.getElementById("mwQueueH").scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    if (t.hasAttribute("data-snooze-days")) {
      var r = rows.filter(function (x) { return x.id === t.getAttribute("data-row"); })[0];
      var until = new Date(Date.parse(M.DEMO_TODAY) + parseInt(t.getAttribute("data-snooze-days"), 10) * 86400000).toISOString().slice(0, 10);
      r.snoozedUntil = until;
      render();
      D.toast("Snoozed until " + M.fmtDate(until) + ". The item stays counted in Needs Action and returns early if its condition worsens.");
      return;
    }
    if (t.hasAttribute("data-unsnooze")) { delete rows.filter(function (x) { return x.id === t.getAttribute("data-unsnooze"); })[0].snoozedUntil; render(); D.toast("The item is back in the action queue."); return; }
    if (t.hasAttribute("data-toast-row")) {
      var row = rows.filter(function (x) { return x.id === t.getAttribute("data-toast-row").replace(/-2$/, ""); })[0];
      D.toast(row.action.toast || "Done."); return;
    }
    var a = t.getAttribute("data-mw");
    if (a === "report") report();
    if (a === "week-all") smoothly(function () { renderWeek(true); });
    if (a === "week-fewer") smoothly(function () { renderWeek("fewer"); });
    if (a === "export") {
      csv("my-work.csv", [["Kind", "Item", "Why now", "Case", "Waiting", "Found by CaseFusion", "Preservation at risk"]].concat(filtered().map(function (r) {
        var m = masked(r);
        return [r.chip, m && r.whatMasked ? r.whatMasked : r.what, m && r.whyMasked ? r.whyMasked : r.why, caseName(r.caseId), waiting(r), r.found ? "Yes" : "", r.locked ? "Yes" : ""];
      })));
      D.toast("Exported " + filtered().length + " items.");
    }
  });

  if (!fontsReady) document.fonts.ready.then(function () { fontsReady = true; renderQueue(); renderWeek(false); });
  render(); renderCases(); renderWeek(false); renderDid();
}());
