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

  /* ── Queue (Nimbus: nav-pills filters, list-group rows, dropdown snooze) ─ */
  var KIND_BADGE = { GAP: "warning", ANSWER: "info", DECIDE: "danger", APPROVE: "caution", CONFIRM: "success", REVIEW: "secondary" };
  function renderChips() {
    var o = open();
    var defs = [["open", "Open", o.length], ["found", "Found by CaseFusion", o.filter(function (r) { return r.found; }).length], ["snoozed", "Snoozed", snoozed().length]];
    ["GAP", "ANSWER", "DECIDE", "APPROVE", "CONFIRM", "REVIEW"].forEach(function (k) { defs.push([k, KIND[k], o.filter(function (r) { return r.chip === k; }).length]); });
    if (chip === "risk") defs.splice(1, 0, ["risk", "Preservation at risk", o.filter(function (r) { return r.locked; }).length]);
    document.getElementById("mwChips").innerHTML = defs.map(function (d) {
      return '<li class="nav-item"><button type="button" class="nav-link' + (chip === d[0] ? " active" : "") + '" data-chip="' + d[0] + '" aria-pressed="' + (chip === d[0]) + '">' +
        esc(d[1]) + ' <span class="nav-pill-badge">' + d[2] + "</span></button></li>";
    }).join("");
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
  function actionHtml(a, id, primary) {
    if (!a) return "";
    var cls = primary ? "btn btn-secondary btn-sm" : "btn btn-tertiary btn-sm";
    if (a.href) return '<a class="' + cls + '" href="' + a.href + '">' + esc(a.label) + "</a>";
    return '<button type="button" class="' + cls + '" data-toast-row="' + id + '">' + esc(a.label) + "</button>";
  }
  function snoozeHtml(r) {
    if (r.snoozedUntil) return '<div class="small text-muted">Snoozed until ' + esc(M.fmtDate(r.snoozedUntil)) + '</div><button type="button" class="btn btn-tertiary btn-sm" data-unsnooze="' + r.id + '">UNSNOOZE</button>';
    if (r.locked) return '<span class="demo-label">Cannot Snooze</span><span class="badge badge-pill badge-danger">Preservation at risk</span>';
    return '<div class="dropdown d-inline-block"><button type="button" class="btn btn-tertiary btn-sm" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">SNOOZE…</button>' +
      '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end">' +
      [["1", "Tomorrow"], ["3", "3 days"], ["7", "7 days"], ["30", "30 days (the longest)"]].map(function (o) {
        return '<li><button type="button" class="dropdown-item" data-snooze-days="' + o[0] + '" data-row="' + r.id + '">' + o[1] + "</button></li>"; }).join("") + "</ul></div>";
  }
  function rowHtml(r) {
    var m = masked(r);
    var caseHref = r.caseId === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(r.caseId));
    var old = age(r) >= 5 && r.chip === "GAP";
    return '<li class="list-group-item" id="mw-' + r.id + '"><div class="mw-item">' +
      '<div><span class="badge badge-' + KIND_BADGE[r.chip] + '">' + r.chip + "</span></div>" +
      '<div><div class="mw-item-what">' + esc(m && r.whatMasked ? r.whatMasked : r.what) + '</div><div class="text-muted">' + esc(m && r.whyMasked ? r.whyMasked : r.why) + "</div>" +
        /* Why-now is read before acting: 14px. The found flag is a scanned label: demo-label, 12px muted (Scott, 10-14). */
        /* Label type, warning colour: CaseFusion found it, so it is flagged, not muted (PM, Scott 10-14). Nimbus .text-warning-emphasis, as on Provisional. */
        (r.found ? '<span class="demo-label text-warning-emphasis mt-1 mb-0">Found by CaseFusion</span>' : "") + "</div>" +
      '<div><a href="' + caseHref + '">' + esc(caseName(r.caseId)) + "</a></div>" +
      '<div class="' + (old ? "text-danger fw-bold" : "") + '">' + esc(waiting(r)) + "</div>" +
      '<div class="mw-item-actions">' + actionHtml(r.action, r.id, true) + actionHtml(r.second, r.id + "-2", false) + "</div>" +
      '<div class="mw-item-snooze">' + snoozeHtml(r) + "</div></div></li>";
  }
  function renderQueue() {
    var list = filtered(), o = open();
    document.getElementById("mwQueueSummary").textContent = o.length + " items · " + o.filter(function (r) { return r.found; }).length + " found by CaseFusion · " + snoozed().length + " snoozed";
    document.getElementById("mwQueue").innerHTML = list.map(rowHtml).join("") ||
      '<li class="list-group-item">' + emptyState(chip === "snoozed" ? "Nothing is snoozed" : "Nothing needs you",
        chip === "snoozed" ? "Snoozed items return to the action queue on their date." : "New items appear here as soon as a case needs action.") + "</li>";
    document.getElementById("mwQueueFoot").innerHTML = "<span>1–" + list.length + " of " + list.length + " · " + snoozed().length + " snoozed</span><span>Results per page: 25</span>";
  }

  /* Shared empty state (demo.css .demo-empty): icon, bold title, muted note, centred (Scott, 10-14). */
  function emptyState(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }

  /* ── Lower sections (table, list groups) ────────────────────────────── */
  function renderCases() {
    var ids = caseIds(rows);
    document.getElementById("mwCases").innerHTML = ids.map(function (id) {
      var a = M.caseAttention[id];
      var mine = rows.filter(function (r) { return r.caseId === id; });
      var onlySnoozed = mine.every(function (r) { return r.snoozedUntil; });
      if (id === "MBP-0926") {
        var fully = M.custodians.filter(function (x) { var st = M.coverageOf(x).preservation.state; return st === "done" || st === "na"; }).length;
        a = { stage: "Preservation", custodians: M.custodians.length, onHold: fully + " of " + M.custodians.length,
          openRequests: M.requests.filter(function (q) { return q.caseId === id && q.status !== "Complete"; }).length, worst: "1 hold removed · 3 not on hold" };
      }
      return '<tr><td><a class="fw-bold" href="' + (id === "MBP-0926" ? "case-coverage.html" : "not-in-demo.html?what=" + encodeURIComponent(caseName(id))) + '">' + esc(caseName(id)) + "</a></td>" +
        "<td>" + esc(a.stage) + "</td><td>" + a.custodians + "</td><td>" + esc(a.onHold) + "</td><td>" + a.openRequests + "</td>" +
        '<td><span class="badge badge-pill ' + (a.stage === "Closed" ? "badge-warning" : "badge-danger") + '">' + esc(a.worst) + "</span>" +
        (onlySnoozed ? '<div class="small text-muted">Snoozed in your queue until ' + esc(M.fmtDate(mine[0].snoozedUntil)) + "</div>" : "") + "</td></tr>";
    }).join("");
    document.getElementById("mwCasesCount").textContent = ids.length + " of " + access.open;
    document.getElementById("mwMoreCases").textContent = (access.open - ids.length) + " more cases · nothing needs you";
  }
  function renderWeek(all) {
    var wk = M.thisWeek.filter(function (w) { return access.cases.indexOf(w.caseId) !== -1; });
    var total = wk.reduce(function (n, w) { return n + w.n; }, 0);
    var shown = all ? wk : wk.slice(0, 5);
    document.getElementById("mwWeekCount").textContent = wk.length + " dates · " + total + " due";
    document.getElementById("mwWeek").innerHTML = shown.map(function (w) {
      return '<li class="list-group-item"><div class="mw-row-week"><span class="fw-bold">' + esc(w.day) + "</span><div>" + esc(w.what) + '<div class="small text-muted">' + esc(M.caseById(w.caseId).name) + "</div></div>" +
        (w.warn ? '<i class="mdi mdi-alert-outline text-danger" title="Due today or at risk" aria-hidden="true"></i>' : "<i></i>") + "</div></li>";
    }).join("") + (wk.length > shown.length ? '<li class="list-group-item small text-muted">' + (wk.length - shown.length) + " more date" + (wk.length - shown.length === 1 ? "" : "s") +
      ' later this week · <button type="button" class="btn btn-tertiary btn-sm" data-mw="week-all">SHOW ALL</button></li>' : "");
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
  function onSort() { renderQueue(); }
  document.getElementById("mwSort").addEventListener("change", onSort);
  document.getElementById("mwSort").addEventListener("valueChanged.cnds.select", onSort);
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    if (t.hasAttribute("data-chip")) { e.preventDefault(); chip = t.getAttribute("data-chip"); render(); return; }
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

  render(); renderCases(); renderWeek(false); renderDid();
}());
