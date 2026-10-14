/* ═══════════════════════════════════════════════════════════════════════
   My Work controller (PRD 11 §7).
   One queue across every case the viewer can open. It resolves nothing:
   every action opens the screen that owns the condition. Snooze is
   personal, at most 30 days, stays counted in Needs you, and is refused on
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
    var me = M.person(v.personId);
    var did = M.whatCaseFusionDid.filter(function (d) { return access.cases.indexOf(d.caseId) !== -1; });
    var handled = did.reduce(function (n, d) { return n + d.n; }, 0);
    var cases = caseIds(rows).length;
    document.getElementById("mwWho").textContent = me.name + " · " + access.open + " open cases";
    document.getElementById("mwLead").innerHTML = "<b>" + rows.length + " things need you</b> across " + cases + " of your " + access.open +
      " cases. CaseFusion handled " + handled + " others since you signed off yesterday.";
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
      tile("needs", rows.length, "Needs You", "Across " + cases + " of " + access.open + " cases", chip === "open", !rows.length) +
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
      '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end">' +
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
      '<li class="list-group-item">' + emptyState(chip === "snoozed" ? "Nothing is snoozed" : "Nothing needs you",
        chip === "snoozed" ? "Snoozed items return to the action queue on their date." : "New items appear here as soon as a case needs action.") + "</li>";
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
  function renderWeek(all) {
    var wk = M.thisWeek.filter(function (w) { return access.cases.indexOf(w.caseId) !== -1; });
    var shown = all ? wk : wk.slice(0, 5);
    /* PRD 11 §7.5: THIS WEEK · {n} dates (the PM's canvas has no "due" count). */
    document.getElementById("mwWeekCount").textContent = wk.length + " date" + (wk.length === 1 ? "" : "s");
    document.getElementById("mwWeek").innerHTML = shown.map(function (w) {
      return '<li class="list-group-item"><div class="mw-row-week"><span class="fw-bold">' + esc(w.day) + "</span><div>" + esc(w.what) + '<div class="small text-muted">' + esc(M.caseById(w.caseId).name) + "</div></div>" +
        (w.warn ? '<i class="mdi mdi-alert-outline text-danger" title="Due today or at risk" aria-hidden="true"></i>' : "<i></i>") + "</div></li>";
    }).join("");
    /* Card footer (Scott, Sally 10-14): the remaining count and SHOW ALL, below the card's blurry footer divider. */
    var more = wk.length - shown.length;
    document.getElementById("mwWeekFoot").innerHTML = more ? '<hr class="hr hr-blurry demo-card-foot-rule"><div class="d-flex justify-content-between align-items-center"><span class="small text-muted">' +
      more + " more date" + (more === 1 ? "" : "s") + ' later this week</span><button type="button" class="btn btn-tertiary btn-sm" data-mw="week-all">SHOW ALL</button></div>' : "";
  }
  function renderDid() {
    var did = M.whatCaseFusionDid.filter(function (d) { return access.cases.indexOf(d.caseId) !== -1; });
    document.getElementById("mwDidSince").textContent = "Since you signed off, " + M.signedOff;
    document.getElementById("mwDid").innerHTML = did.map(function (d) {
      return '<li class="list-group-item"><div class="mw-row-did"><i class="mdi mdi-check text-success" aria-hidden="true"></i><span class="fw-bold">' + d.n + " " + esc(d.what) +
        '</span><span class="text-muted">' + esc(d.context) + '</span><span class="text-muted text-end">' + esc(d.when) + "</span></div></li>";
    }).join("") || '<li class="list-group-item">' + emptyState("Nothing to report", "CaseFusion did not need to do anything since you signed off.") + "</li>";
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
      body: '<p class="text-muted">' + esc(me.name) + " · every case you can open · 10-02-2026 – 10-08-2026. Generated from My Work; snoozed items are included and marked.</p>" +
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
      D.toast("Snoozed until " + M.fmtDate(until) + ". It stays counted in Needs you and returns early if it gets worse.");
      return;
    }
    if (t.hasAttribute("data-unsnooze")) { delete rows.filter(function (x) { return x.id === t.getAttribute("data-unsnooze"); })[0].snoozedUntil; render(); D.toast("Back in your queue."); return; }
    if (t.hasAttribute("data-toast-row")) {
      var row = rows.filter(function (x) { return x.id === t.getAttribute("data-toast-row").replace(/-2$/, ""); })[0];
      D.toast(row.action.toast || "Done."); return;
    }
    var a = t.getAttribute("data-mw");
    if (a === "report") report();
    if (a === "week-all") renderWeek(true);
    if (a === "export") {
      csv("my-work.csv", [["Kind", "What needs you", "Why now", "Case", "Waiting", "Found by CaseFusion", "Preservation at risk"]].concat(filtered().map(function (r) {
        var m = masked(r);
        return [r.chip, m && r.whatMasked ? r.whatMasked : r.what, m && r.whyMasked ? r.whyMasked : r.why, caseName(r.caseId), waiting(r), r.found ? "Yes" : "", r.locked ? "Yes" : ""];
      })));
      D.toast("Exported " + filtered().length + " items.");
    }
  });

  if (!fontsReady) document.fonts.ready.then(function () { fontsReady = true; renderQueue(); });
  render(); renderCases(); renderWeek(false); renderDid();
}());
