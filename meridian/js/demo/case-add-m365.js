/* ═══════════════════════════════════════════════════════════════════════
   Case › Add sources from Microsoft 365 (PRD 01 §7.7, M20b, M21, M23–M25,
   M29, AC10, AC10a, AC11, AC13, V5, W4). Opened with ?door=m365 from the
   data map's + ADD SOURCE menu (§7.6).

   Searches the permissions sync across the tenant, not the case. A source
   added here still reports Found through: Permissions (M20b). What a team
   covers, and what it does not, is stated before it is added (M24, AC11):
   ticking a team opens its content locations under its row (M71b).
   A decommissioned Yammer community redirects to its Viva Engage successor
   in the row's place (PRD 03 §7.7), with LEAVE OUT recorded.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc, X = window.AddDoors, A = X.A, R = A.m365;
  if (X.q.get("door") !== "m365") return;

  var nCust = M.custodians.length, caseIds = M.custodians.map(function (c) { return c.personId; });
  var st = { chip: "all", show: "all", search: "", ticked: {}, open: {}, added: {}, redirect: "open", page: 1, size: 10, done: null };
  var typeOf = {}; R.types.forEach(function (t) { typeOf[t.key] = t; });
  function row(id) { return A.m365Row(id); }
  function onCase(r) { return r.onCase || !!st.added[r.id]; }

  /* API seam: one call per search. The server returns the page and the total it searched; an unfiltered search counts
     the whole tenant (R.tenantTotal), so the footer says the list is the tenant, not the case. */
  var api = {
    search: function (s) {
      var term = s.search.trim().toLowerCase();
      /* Sources not yet on the case first: the door is for what the automatic routes did not bring (M20a). */
      var rows = R.rows.filter(function (r) { return !r.onCase; }).concat(R.rows.filter(function (r) { return r.onCase; })).filter(function (r) {
        if (s.chip !== "all" && r.type !== s.chip) return false;
        if (s.show === "members" && !r.custodians.length) return false;
        if (s.show === "oncase" && !onCase(r)) return false;
        return !term || (r.name + " " + r.what).toLowerCase().indexOf(term) !== -1;
      });
      var unfiltered = s.chip === "all" && s.show === "all" && !term;
      return { rows: rows, total: unfiltered ? R.tenantTotal : rows.length };
    }
  };

  /* ── Page skeleton ─────────────────────────────────────────────────── */
  document.getElementById("asLifecycle").hidden = true;
  document.getElementById("asTitle").textContent = "Add Sources from Microsoft 365";
  document.title = "Add Sources from Microsoft 365 · Meridian Biopharma · CaseFusion";
  var root = document.getElementById("asM365");
  root.hidden = false;
  var pill = function (k, label) { return '<li class="nav-item" role="presentation"><button type="button" class="nav-link" data-chip="' + k + '" aria-pressed="false">' + esc(label) + "</button></li>"; };
  root.innerHTML =
    '<div id="adDone"></div>' +
    '<div class="btn-toolbar-gray btn-toolbar-list ad-tools mb-2" role="toolbar" aria-label="Search Microsoft 365">' +
      '<div class="toolbar-list-search"><div class="cf-input-field cf-input-field-sm cf-input-field-casefusion"><div class="cf-input-wrapper">' +
        '<input type="text" id="adSearch" class="cf-input-control" placeholder="Search teams, sites, shared mailboxes and communities …" aria-label="Search teams, sites, shared mailboxes and communities" data-demo-noguard />' +
        '<i class="mdi mdi-magnify cf-input-icon" aria-hidden="true"></i></div></div></div>' +
      '<span class="toolbar-list-divider" aria-hidden="true"></span>' +
      '<div class="toolbar-list-controls"><span class="toolbar-list-label">Show</span>' +
        '<span data-demo-noguard class="ad-show">' + D.select("adShow", [["all", "All sources in the tenant"], ["members", "Where a custodian is a member or has access"], ["oncase", "Already on this case"]], "all", null, { size: "sm", attrs: 'aria-label="Show"' }) + "</span>" +
        '<span class="toolbar-list-divider" aria-hidden="true"></span><span class="toolbar-list-total ad-meta" id="adSync"></span>' +
      "</div>" +
    "</div>" +
    '<ul class="nav nav-pills nav-pills-nimbus nav-pills-casefusion mb-2" aria-label="Source type">' + pill("all", "All Types") +
      R.types.map(function (t) { return pill(t.key, t.chip); }).join("") + "</ul>" +
    '<div class="table-responsive"><table class="table align-middle mb-0 ad-table ad-body" id="adTable">' +
      '<thead><tr><th scope="col"><span class="visually-hidden">Select</span></th><th scope="col">Source</th><th scope="col">Type</th><th scope="col">People</th>' +
      '<th scope="col">Custodians on This Case</th><th scope="col">Content Locations</th></tr></thead><tbody id="adRows"></tbody></table></div>' +
    '<div id="adPager"></div>' +
    '<p class="note note-info note-sm my-3 ad-body"><i class="mdi mdi-information-outline me-1" aria-hidden="true"></i>These come from the Microsoft 365 permissions sync — not from Sources, and not from what custodians touched. ' +
      'Members outside your region scope are counted, not named. Box folders, Slack channels and other tenant sources are added <a href="' + esc(fromSourcesUrl()) + '">from Sources</a>.</p>' +
    '<div class="btn-toolbar-gray btn-toolbar-action ad-foot mb-4" role="toolbar" aria-label="Add sources actions">' +
      '<span class="ad-foot-text">' + esc(X.NO_PRESERVE) + "</span>" +
      '<div class="toolbar-action-end"><span class="ad-meta text-muted me-2" id="adWhy" aria-live="polite"></span>' +
        '<a class="btn btn-secondary" href="' + esc(X.dataMapUrl()) + '">CANCEL</a>' +
        '<button type="button" class="btn btn-primary" id="adAdd" data-ad="add" aria-describedby="adWhy">ADD SOURCES</button></div>' +
    "</div>";
  function fromSourcesUrl() { var c = X.q.get("case"); return "case-add-noncustodial-source.html" + (c ? "?case=" + encodeURIComponent(c) : ""); }

  /* ── Rows ──────────────────────────────────────────────────────────── */
  function namesLine(ids) {
    var seen = ids.filter(function (id) { return D.canSee(M.person(id)); }), hidden = ids.length - seen.length;
    return seen.map(function (id) { return esc(M.person(id).name); }).join(", ") +
      (hidden ? (seen.length ? " · " : "") + hidden + " outside your region scope, counted and not named" : "") || "None";
  }
  function expansion(r) {
    var t = typeOf[r.type], team = r.type === "team";
    var locs = '<ul class="list-group list-group-flush list-group-small mb-2">' + r.locations.map(function (l) {
      return '<li class="list-group-item"><b>' + esc(l[0]) + "</b> — " + esc(l[1]) + "</li>"; }).join("") + "</ul>";
    var caveat = "";
    if (team) {
      caveat = '<div class="alert alert-warning alert-align-top mb-2" role="note"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span><div class="alert-message">' +
        (r.privateChannel ? "Private channel messages are not in the group mailbox. Since Microsoft's 2025 change they go to the private channel mailbox; older ones can still be in the " +
          r.privateChannel.members + " channel members' mailboxes, so preserve both. " : "") +
        "<b>Holding the team does not hold its members' mailboxes or OneDrives.</b></div></div>";
    }
    return '<tr class="ad-expand"><td></td><td colspan="5"><div class="ad-expand-body" id="adLoc-' + r.id + '">' +
      '<p class="mb-2"><b>' + esc(r.name) + " · " + r.locationCount + " content location" + (r.locationCount === 1 ? "" : "s") + "</b></p>" + locs + caveat +
      '<p class="ad-meta text-muted mb-0">Custodians on this case who are ' + (t.key === "site" || t.key === "mailbox" ? "people with access" : "members") + ": " + namesLine(r.custodians) + "</p>" +
      "</div></td></tr>";
  }
  function redirectRow(r) {
    var succ = row(r.successorId), Y = M.yammer;
    if (st.redirect === "open") {
      return '<tr><td></td><td colspan="5"><div class="alert alert-warning mb-0" role="note"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span><div class="alert-message">' +
        "<p class=\"mb-2\"><b>Yammer was decommissioned on " + esc(M.fmtDate(Y.decommissioned)) + " and its content was migrated to Viva Engage.</b> Yammer held content until " + esc(Y.covEnd) +
        ", which is inside this case window. Viva Engage carries that content forward. Yammer itself can no longer be preserved or collected.</p>" +
        '<button type="button" class="btn btn-primary btn-sm" data-ad="scope-viva">SCOPE VIVA ENGAGE INSTEAD</button> <button type="button" class="btn btn-secondary btn-sm" data-ad="leave-out">LEAVE OUT</button></div></div></td></tr>';
    }
    return '<tr><td></td><td colspan="5"><span class="ad-meta text-muted"><i class="mdi mdi-check" aria-hidden="true"></i> ' +
      (st.redirect === "viva" ? esc(succ.name) + " in Viva Engage scoped instead of Yammer · recorded by " + esc(M.person(D.viewer().personId).name) + " · " + esc(M.fmtDate(M.DEMO_TODAY)) :
        "Yammer's period left out · recorded with this case · Viva Engage not added") + '</span> <button type="button" class="btn btn-tertiary btn-sm" data-ad="undo">UNDO</button></td></tr>';
  }
  function rowHtml(r) {
    var t = typeOf[r.type], here = onCase(r), off = here || r.decommissioned;
    var why = here ? r.name + " is already on this case." : r.decommissioned ? "Yammer is decommissioned. Its successor in Viva Engage is offered in its place." : "";
    var badge = here ? (st.added[r.id] ? '<span class="badge badge-success">Added</span>' : '<span class="badge badge-secondary">Already on This Case</span>') :
      r.decommissioned ? '<span class="badge badge-secondary">Decommissioned</span>' : r.successorOf ? '<span class="badge badge-info">Successor</span>' : "";
    var open = !!st.open[r.id];
    var html = "<tr><td>" + '<div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + r.id + '"' + (st.ticked[r.id] ? " checked" : "") + (off ? " disabled" : "") +
        ' aria-label="Add ' + esc(r.name) + '"' + (why ? ' title="' + esc(why) + '"' : "") + " /></div></td>" +
      '<td class="ad-name"><span class="fw-bold">' + esc(r.name) + "</span> " + badge +
        '<span class="d-block ad-meta text-muted">' + esc(r.what) + " · created " + esc(r.created) + "</span>" +
        (why ? '<span class="d-block ad-meta">' + esc(why) + "</span>" : "") + "</td>" +
      '<td class="ad-wrap-narrow">' + esc(r.typeLabel || t.label) + "</td>" +
      '<td class="ad-wrap-narrow">' + r.people.toLocaleString("en-US") + " " + esc(t.people) + "</td>" +
      "<td>" + r.custodians.length + " of " + nCust + "</td>" +
      '<td class="ad-loc-cell"><button type="button" class="btn btn-tertiary btn-sm" data-ad="loc" data-id="' + r.id + '" aria-expanded="' + open + '" aria-controls="adLoc-' + r.id + '">' +
        r.locationCount + " Location" + (r.locationCount === 1 ? "" : "s") + ' <i class="mdi mdi-chevron-' + (open ? "up" : "down") + '" aria-hidden="true"></i></button>' +
        (r.type === "team" ? '<span class="d-block ad-meta text-warning-emphasis"><i class="mdi mdi-alert me-1" aria-hidden="true"></i>' + (r.privateChannel ? "Private channel caveat" : "Members not included") + "</span>" : "") + "</td></tr>";
    if (open) html += expansion(r);
    if (r.decommissioned) html += redirectRow(r);
    return html;
  }

  function render() {
    var body = document.getElementById("adRows"), pagerEl = document.getElementById("adPager");
    [].forEach.call(root.querySelectorAll("[data-chip]"), function (b) { var on = b.getAttribute("data-chip") === st.chip; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
    document.getElementById("adSync").textContent = "Permissions synced " + M.fmtWhen(R.synced.on, R.synced.at).replace(/^Today/, "today");
    if (!X.isReady()) { body.innerHTML = X.skeletonRows(5, 6, true); pagerEl.innerHTML = ""; renderFoot(); return; }
    var res = api.search(st), from = (st.page - 1) * st.size, rows = res.rows.slice(from, from + st.size);
    if (!res.rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="demo-empty py-4"><i class="mdi mdi-magnify mdi-36px" aria-hidden="true"></i><div class="demo-empty-title">No Matching Sources</div>' +
        '<div class="demo-empty-note">Nothing in the permissions sync matches this search and filter.</div></div></td></tr>';
    } else if (!rows.length) {
      /* DEMO ONLY: do not build. The fixture holds the first page of the tenant's 412; the API returns the rest. */
      body.innerHTML = '<tr><td colspan="6"><div class="demo-empty py-4"><div class="demo-empty-title">Not in This Demo</div><div class="demo-empty-note">The demo holds the first ' + res.rows.length + " of " + res.total + " results.</div></div></td></tr>";
    } else body.innerHTML = rows.map(rowHtml).join("");
    pagerEl.innerHTML = res.rows.length ? D.pager("ad", res.total, st.page, st.size) : "";
    var range = pagerEl.querySelector(".pagination-toolbar-range");
    if (range && res.total === R.tenantTotal) range.textContent += " · searched across the tenant";
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(pagerEl);
    renderFoot();
  }
  function renderFoot() {
    var n = Object.keys(st.ticked).filter(function (k) { return st.ticked[k]; }).length;
    var b = document.getElementById("adAdd");
    b.textContent = n ? "ADD " + n + " SOURCE" + (n === 1 ? "" : "S") : "ADD SOURCES";
    b.disabled = !n;
    document.getElementById("adWhy").textContent = n ? "" : "Choose at least one source to add.";
  }

  /* ── Events ────────────────────────────────────────────────────────── */
  root.addEventListener("change", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-tick");
    if (!id) return;
    st.ticked[id] = e.target.checked;
    /* A team states what it covers before it is added (M24, AC11): ticking it opens its content locations. */
    if (e.target.checked && row(id).type === "team") st.open[id] = true;
    render();
  });
  function onShow(e) { if (e.target.id !== "adShow") return; st.show = e.target.value; st.page = 1; render(); }
  root.addEventListener("change", onShow);
  root.addEventListener("valueChanged.cnds.select", onShow);
  document.addEventListener("valueChanged.cnds.select", function (e) {
    if (e.target.getAttribute && e.target.getAttribute("data-pg-size") === "ad") { st.size = parseInt(e.target.value, 10); st.page = 1; render(); }
  });
  root.addEventListener("input", function (e) { if (e.target.id === "adSearch") { st.search = e.target.value; st.page = 1; render(); } });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-chip")) { st.chip = b.getAttribute("data-chip"); st.page = 1; render(); return; }
    if (b.getAttribute("data-pg-for") === "ad") { st.page = D.turnPage(st.page, b.getAttribute("data-pg"), api.search(st).total, st.size); render(); return; }
    var a = b.getAttribute("data-ad"), r;
    if (a === "loc") { var id = b.getAttribute("data-id"); st.open[id] = !st.open[id]; render(); return; }
    if (a === "scope-viva") { r = R.rows.filter(function (x) { return x.decommissioned; })[0]; st.redirect = "viva"; if (!onCase(row(r.successorId))) st.ticked[r.successorId] = true; render(); D.toast("Viva Engage scoped instead of Yammer. The decision is recorded with the case."); }
    if (a === "leave-out") { r = R.rows.filter(function (x) { return x.decommissioned; })[0]; st.redirect = "left"; st.ticked[r.successorId] = false; render(); D.toast("Yammer's period left out. The decision is recorded with the case."); }
    if (a === "undo") { st.redirect = "open"; render(); }
    if (a === "add") add();
    if (a === "again") { document.getElementById("adDone").innerHTML = ""; }
  });
  function add() {
    var ids = Object.keys(st.ticked).filter(function (k) { return st.ticked[k] && !onCase(row(k)); });
    if (!ids.length) return;
    ids.forEach(function (id) { st.added[id] = true; st.done = (st.done || []).concat(["m365:" + id]); });
    st.ticked = {};
    /* The page's fields are saved, so CANCEL afterwards has nothing to discard (shell guard). */
    [].forEach.call(root.querySelectorAll("input[type=checkbox]"), function (f) { f.removeAttribute("data-demo-changed"); });
    document.getElementById("adDone").innerHTML = X.doneAlert(st.done.length, "Permissions", st.done, "They are on the data map with the custodians' sources.");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    D.toast(ids.length + " source" + (ids.length === 1 ? "" : "s") + " added to this case.");
  }

  render();
  X.whenReady(render);
}());
