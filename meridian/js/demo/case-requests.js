/* ═══════════════════════════════════════════════════════════════════════
   Requests tab controller (PRD 04 §7.1).
   Preservation requests are built from the same source ledger as Hold
   status, so a card's "Requires action" names the same problems. Collection
   requests show list and status only; anything deeper is not in this demo.
   A request sent from the new-request form arrives as ?sent=<json>.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var TODAY = M.DEMO_TODAY;
  var sub = "all", tile = null, expanded = {}, openAssign = {};

  var requests = M.requests.filter(function (r) { return r.caseId === D.caseId; }).map(function (r) { return Object.assign({}, r); });
  var sent = null;
  try { sent = JSON.parse(new URLSearchParams(location.search).get("sent") || "null"); } catch (e) { sent = null; }
  if (sent) requests.unshift(Object.assign({ caseId: D.caseId, kind: "Preservation", status: "Sent", sent: TODAY, by: D.viewer().personId, isNew: true, updated: "just now" }, sent));

  function sourcesOf(r) {
    if (r.isNew) return r.items.map(function (x) { return { id: x.id, type: x.type, owner: x.owner, name: x.name, hold: "Applying", isNewItem: true, handler: x.handler }; });
    return M.sources.filter(function (s) { return s.request === r.id; });
  }
  function workItem(s) { return s.isNewItem ? { status: s.handler === "Purview hold" ? "In progress" : "Not started", note: s.handler === "Purview hold" ? "Placed on send · Purview reports Applied within 24 hours" : "On the team's queue" } : M.workItemOf(s); }
  function requiresAction(r) {
    if (r.kind !== "Preservation") return { text: r.requires || "", n: r.requires ? (r.failed || 0) + 1 : 0, failed: r.failed || 0 };
    if (r.isNew) return { text: "", n: 0, failed: 0 };
    var src = sourcesOf(r), parts = [], n = 0, failed = 0;
    var c = function (f) { return src.filter(f).length; };
    var removed = c(function (s) { return s.hold === "Not applied"; });
    var partial = c(function (s) { return s.hold === "Partial"; });
    var stalled = c(function (s) { return s.hold === "Applying" && s.exception; });
    var overdue = c(function (s) { return s.hold === "Overdue"; });
    var returned = c(function (s) { return M.workItemOf(s).status === "Returned"; });
    if (removed) parts.push(removed + " hold removed outside CaseFusion");
    if (partial) parts.push(partial + " hold partially applied");
    if (stalled) parts.push(stalled + " hold stalled");
    if (overdue) parts.push(overdue + " attestation overdue");
    if (returned) parts.push(returned + " work item returned");
    n = removed + partial + stalled + overdue + returned; failed = returned;
    return { text: parts.join(" · "), n: n, failed: failed };
  }
  function progress(r) {
    if (r.kind !== "Preservation") return r.progress || [0, 0];
    var src = sourcesOf(r);
    return [src.filter(function (s) { return workItem(s).status === "Complete"; }).length, src.length];
  }
  function assignments(r) {
    var groups = {};
    sourcesOf(r).forEach(function (s) {
      var h = M.handlerFor[s.type];
      var key = s.handler || h.handler;
      if (!groups[key]) groups[key] = { handler: key, kind: h.kind, dest: h.dest, rule: h.rule, items: [] };
      groups[key].items.push(s);
    });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }
  function isOpen(r) { return !/^Complete|Closed|Canceled/.test(r.status); }
  function dueSoon(r) { var d = M.daysBetween(TODAY, r.due || "2099-01-01"); return isOpen(r) && d >= 0 && d <= 7; }

  /* ── Tiles ──────────────────────────────────────────────────────────── */
  function inSub(r) { return sub === "all" || r.kind === sub; }
  function renderTiles() {
    var list = requests.filter(inSub);
    var ra = list.map(requiresAction);
    var reqWith = ra.filter(function (x) { return x.n; }).length;
    var failedReqs = ra.filter(function (x) { return x.failed; }).length;
    var defs = [
      ["open", "Open", list.filter(isOpen).length, "requests"],
      ["action", "Requires Action", ra.reduce(function (n, x) { return n + x.n; }, 0), "work items in " + reqWith + " requests"],
      ["failed", "Failed or Returned", ra.reduce(function (n, x) { return n + x.failed; }, 0), "work items in " + failedReqs + " requests"],
      ["due", "Due in 7 Days", list.filter(dueSoon).length, "requests"],
      ["ready", "Ready to Close", list.filter(function (r) { return r.readyToClose; }).length, "request"],
      ["closed", "Closed or Canceled", list.filter(function (r) { return /Closed|Canceled/.test(r.status); }).length, "requests"]
    ];
    /* Names are Title Case in the source (demo.css uppercases them); a filter with nothing in it is disabled,
       never hidden (Scott, 10-14). */
    document.getElementById("rqTiles").innerHTML = defs.map(function (d) {
      return '<button type="button" class="card card-basic demo-tile" data-tile="' + d[0] + '" aria-pressed="' + (tile === d[0]) + '"' + (d[2] ? "" : " disabled") + '><span class="card-subtitle demo-tile-name">' + esc(d[1]) +
        '</span><span class="card-title demo-tile-value">' + d[2] + '</span><span class="card-text demo-tile-label">' + esc(d[3]) + "</span></button>";
    }).join("");
  }

  /* ── Cards ──────────────────────────────────────────────────────────── */
  function statusPill(r) {
    var cls = /^Complete/.test(r.status) ? "ok" : r.status === "Sent" ? "info" : "warn";
    return '<span class="badge badge-pill badge-' + window.MeridianDemo.badgeColor[cls] + '">' + esc(r.status) + "</span>";
  }
  function custodianCount(r) {
    var o = {}; sourcesOf(r).forEach(function (s) { if (s.owner) o[s.owner] = 1; }); return Object.keys(o).length;
  }
  function subjectFor(s) {
    if (!s.owner) return "—";
    var p = M.person(s.owner);
    return D.canSee(p) ? esc(p.name) : '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>';
  }
  function cardHtml(r) {
    var ra = requiresAction(r), pr = progress(r), by = M.person(r.by);
    var collection = r.kind === "Collection";
    var asg = collection ? null : assignments(r);
    var head = '<div class="d-flex align-items-center flex-wrap gap-2 mb-1"><h3 class="card-title mb-0 me-1">' + esc(r.id + " · " + r.title) + '</h3><span class="badge badge-pill badge-secondary">' + esc(r.kind) + "</span>" +
      (r.linked ? '<span class="badge badge-pill badge-secondary">Linked to ' + esc(r.linked) + "</span>" : "") + statusPill(r) +
      (r.isNew ? '<span class="badge badge-pill badge-success">New</span>' : "") + "</div>" +
      '<p class="card-text small text-muted mb-2">Created by ' + esc(D.canSee(by) ? by.name : "a case administrator") + " on " + esc(M.fmtDate(r.sent)) + " · Updated " + esc(r.updated || "") +
      (r.backup ? " · Backup: " + esc(M.person(D.viewer().personId).name) : "") + "</p>";
    var alert = function (kind, icon, text) { return '<div class="alert alert-' + kind + ' mb-2" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-' + icon + '"></i></span><span>' + text + "</span></div>"; };
    var req = ra.text ? alert("warning", "alert", "<b>Requires action:</b> " + esc(ra.text)) :
      r.readyToClose ? alert("success", "check-circle", "All " + pr[1] + " work item" + (pr[1] === 1 ? " is" : "s are") + " complete. Ready to close.") :
      r.isNew ? alert("success", "check-circle", "Sent just now. Purview holds are placed right away; response teams were notified.") : "";
    /* Each value carries a demo-label (12px muted capitals) above a 14px value (Scott, 10-14). */
    var fact = function (label, value) { return '<div class="col"><span class="demo-label">' + label + "</span><div>" + value + "</div></div>"; };
    var pct = pr[1] ? Math.round(pr[0] / pr[1] * 100) : 0;
    var facts = '<div class="row row-cols-2 row-cols-xl-5 g-2 mb-2 rq-facts">' +
      fact("Custodians", collection ? "—" : custodianCount(r)) +
      fact(collection ? "Dates" : "Hold Scope", esc(collection ? r.dates : (r.scope || "All content, no date limit"))) +
      fact("Assignments", esc(collection ? r.handlers : asg.length + " handler" + (asg.length === 1 ? "" : "s") + " (" + asg.filter(function (a) { return a.kind === "Automatic"; }).length + " automatic)")) +
      fact("Due", esc(r.due ? M.fmtDate(r.due) : "—")) +
      fact("Progress", pr[0] + " of " + pr[1] + ' work items<div class="progress mt-1" style="height: 6px;"><div class="progress-bar bg-success" role="progressbar" style="width: ' + pct + '%;" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + pr[0] + " of " + pr[1] + ' work items complete"></div></div>') + "</div>";
    var actions = '<div class="card-actions">' +
      (collection ? '<span class="me-auto"></span>' : '<button type="button" class="btn btn-tertiary btn-sm me-auto" data-expand="' + r.id + '" aria-expanded="' + !!expanded[r.id] + '">' + (expanded[r.id] ? "HIDE ASSIGNMENTS" : "SHOW ASSIGNMENTS (" + asg.length + ")") + "</button>") +
      '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=' + encodeURIComponent((collection ? "Collection request " : "Request detail ") + r.id) + '">VIEW</a>' +
      '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Export+' + r.id + '&amp;ships=1">EXPORT</a>' +
      (isOpen(r) ? '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Modify+' + r.id + '">MODIFY</a>' : "") + "</div>";
    var asgHtml = "";
    if (!collection && expanded[r.id]) {
      /* Assignment rows follow the Hold Status record rows (Scott, 10-14): a .demo-rows list (14px rows, 16px
         padding, open-row fill from shell.js), each value labelled in the row (no header row), a VIEW / HIDE
         button, and the work items in a Nimbus .collapse that is a direct child of the li. */
      asgHtml = '<ul class="list-group list-group-light list-group-flush mt-2 rq-assign demo-rows">' +
        asg.map(function (a, i) {
          var key = r.id + "|" + a.handler, open = !!openAssign[key], cid = "rqw-" + r.id + "-" + i;
          var done = a.items.filter(function (s) { return workItem(s).status === "Complete"; }).length;
          var attn = a.items.map(function (s) { return workItem(s); }).filter(function (w) { return w.status !== "Complete" || /removed|overdue/.test(w.note); });
          var types = {}; a.items.forEach(function (s) { types[s.type] = (types[s.type] || 0) + 1; });
          var covers = Object.keys(types).map(function (t) { return types[t] + " " + M.typeLabel(t); }).join(", ");
          var st = done === a.items.length ? "Complete" : a.items.some(function (s) { return workItem(s).status === "Returned"; }) ? "Returned" : "In progress";
          var row = '<li class="list-group-item' + (open ? " demo-open" : "") + '"><div class="rq-arow">' +
            '<div><span class="demo-label">Handler</span><span class="fw-bold me-1">' + esc(a.handler) + '</span><span class="badge badge-pill badge-secondary">' + esc(a.kind) + "</span></div>" +
            '<div><span class="demo-label">Covers</span>' + esc(covers) + "</div>" +
            '<div><span class="demo-label">Progress</span>' + done + " of " + a.items.length + " complete</div>" +
            '<div><span class="demo-label">Status</span>' + esc(st) + "</div>" +
            '<div><span class="demo-label">Attention</span>' + (attn.length ? '<span class="badge badge-pill badge-warning">' + attn.length + " need" + (attn.length === 1 ? "s" : "") + " attention</span>" : "—") + "</div>" +
            '<div class="vr vr-blurry" aria-hidden="true"></div>' +
            '<div class="rq-arow-actions"><button type="button" class="btn btn-tertiary btn-sm" data-assign="' + esc(key) + '" aria-expanded="' + open + '" aria-controls="' + cid +
              '" aria-label="' + (open ? "Hide" : "View") + " work items for " + esc(a.handler) + '">' + (open ? "HIDE" : "VIEW") + "</button></div></div>";
          var items = '<div class="collapse' + (open ? " show" : "") + '" id="' + cid + '"><div class="rq-witems"><span class="demo-label">Destination</span><p class="mb-2">' + esc(a.dest) + " · " + esc(a.rule) + "</p>" +
            '<table class="table table-sm align-middle mb-0"><thead><tr><th scope="col">Source</th><th scope="col">Custodian</th><th scope="col">Location</th><th scope="col">Status</th></tr></thead><tbody>' +
            a.items.map(function (s) {
              var w = workItem(s);
              var loc = s.owner && !D.canSee(M.person(s.owner)) ? "Outside your regions" : s.name;
              return "<tr><td>" + esc(M.typeLabel(s.type)) + "</td><td>" + subjectFor(s) + "</td><td>" + esc(loc) + "</td><td>" + esc(w.status) + (w.note ? '<span class="d-block small text-muted">' + (/Hold status/.test(w.note) ? esc(w.note.replace(" · see Hold status", "")) + ' · see <a href="case-hold-status.html">Hold Status</a>' : esc(w.note)) + "</span>" : "") + "</td></tr>";
            }).join("") + "</tbody></table></div></div>";
          return row + items + "</li>";
        }).join("") + "</ul>";
    }
    return '<article class="card ' + (r.isNew ? "card-outline card-brand-green" : "card-basic") + ' mb-2" aria-label="' + esc(r.id) + '"><div class="card-body">' + head + req + facts + actions + asgHtml + "</div></article>";
  }
  function filtered() {
    var q = document.getElementById("rqSearch").value.trim().toLowerCase();
    var sort = document.getElementById("rqSort").value;
    return requests.filter(inSub).filter(function (r) {
      if (q && (r.id + " " + r.title).toLowerCase().indexOf(q) === -1) return false;
      if (tile === "open") return isOpen(r);
      if (tile === "action") return requiresAction(r).n > 0;
      if (tile === "failed") return requiresAction(r).failed > 0;
      if (tile === "due") return dueSoon(r);
      if (tile === "ready") return !!r.readyToClose;
      if (tile === "closed") return /Closed|Canceled/.test(r.status);
      return true;
    }).sort(function (a, b) {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
      if (sort === "created") return b.sent.localeCompare(a.sent);
      if (sort === "status") return a.status.localeCompare(b.status);
      return (a.due || "9").localeCompare(b.due || "9");
    });
  }
  function render() {
    renderTiles();
    var list = filtered();
    document.getElementById("rqShowing").textContent = "Showing " + list.length + " of " + requests.filter(inSub).length;
    /* Shared empty state (demo.css .demo-empty, Scott, 10-14). */
    document.getElementById("rqCards").innerHTML = list.map(cardHtml).join("") ||
      '<div class="card card-basic"><div class="card-body"><div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' +
      (sub === "Cleanup" ? "No cleanup requests on this case" : "No requests match") + '</span><span class="demo-empty-note">' +
      (sub === "Cleanup" ? "A data cleanup request releases holds, deletes copies or destroys media. It starts from + NEW REQUEST." : "Clear the filter to see every request.") + "</span></div></div></div>";
    document.getElementById("rqMenuNote").textContent = "Every request starts from all custodians on the case. Narrow it in the form, or start from a scope saved on the data map — latest: " +
      M.dataMapScope.name + ", " + M.dataMapScope.saved + ".";
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  document.getElementById("rqSearch").addEventListener("input", render);
  document.getElementById("rqSort").addEventListener("change", render);
  document.getElementById("rqSort").addEventListener("valueChanged.cnds.select", render);
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a, [data-assign]");
    if (!t) return;
    if (t.hasAttribute("data-sub")) {
      sub = t.getAttribute("data-sub"); tile = null;
      document.querySelectorAll("[data-sub]").forEach(function (b) { b.classList.toggle("active", b === t); b.setAttribute("aria-pressed", String(b === t)); });
      render(); return;
    }
    if (t.hasAttribute("data-tile")) { var k = t.getAttribute("data-tile"); tile = tile === k ? null : k; render(); return; }
    if (t.hasAttribute("data-expand")) { var id = t.getAttribute("data-expand"); expanded[id] = !expanded[id]; render(); return; }
    if (t.hasAttribute("data-assign")) {
      /* Slide with the Nimbus collapse instead of re-rendering, so shell.js fades the open-row fill (Scott, 10-14). */
      var el = document.getElementById(t.getAttribute("aria-controls"));
      if (el && window.Nimbus && Nimbus.Collapse) Nimbus.Collapse.getOrCreateInstance(el, { toggle: false }).toggle();
      else { var a = t.getAttribute("data-assign"); openAssign[a] = !openAssign[a]; render(); }
    }
  });
  /* When the slide ends: remember the state, and flip VIEW / HIDE and its aria. */
  function syncAssign(e, open) {
    var id = e.target.id || "";
    if (id.indexOf("rqw-") !== 0) return;
    var b = document.querySelector('[aria-controls="' + id + '"]');
    if (!b) return;
    openAssign[b.getAttribute("data-assign")] = open;
    b.textContent = open ? "HIDE" : "VIEW";
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(View|Hide)/, open ? "Hide" : "View"));
  }
  document.addEventListener("shown.cnds.collapse", function (e) { syncAssign(e, true); });
  document.addEventListener("hidden.cnds.collapse", function (e) { syncAssign(e, false); });

  if (sent) { expanded[sent.id] = true; setTimeout(function () { D.toast(sent.id + " sent. " + sent.items.length + " holds requested; Purview holds are placed right away."); }, 300); }
  render();
}());
