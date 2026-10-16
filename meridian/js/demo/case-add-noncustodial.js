/* ═══════════════════════════════════════════════════════════════════════
   Case › Add sources from Sources (PRD 01 §7.8, M20a, M21–M23, M29, AC10,
   AC13, V5). The tenant catalog of PRD 03: Box folders, Slack channels,
   applications, file shares and records systems that belong to the
   organization rather than to a person. A source added here belongs to the
   case, reports Found through: Sources, and its work goes to the response
   team for its source type. Microsoft 365 is the other door (the intro
   points at it, as §7.7's footnote points here). Reported locations are
   not a door (M22): the bridge names them and opens their review queue.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc, X = window.AddDoors, A = X.A, C = A.catalog;
  var st = { chip: "all", search: "", ticked: {}, added: {}, done: null };
  function onCase(r) { return r.onCase || !!st.added[r.id]; }
  var caseQ = X.q.get("case") ? "&case=" + encodeURIComponent(X.q.get("case")) : "";

  /* API seam: one call returns the catalog rows matching the type and search. */
  var api = {
    search: function (s) {
      var term = s.search.trim().toLowerCase();
      return C.rows.filter(function (r) {
        return (s.chip === "all" || r.chip === s.chip) && (!term || (r.name + " " + r.system + " " + r.where + " " + r.type).toLowerCase().indexOf(term) !== -1);
      });
    }
  };

  var reported = C.reportedNotInSources;
  var root = document.getElementById("adRoot");
  var pill = function (c) { return '<li class="nav-item" role="presentation"><button type="button" class="nav-link" data-chip="' + c[0] + '" aria-pressed="false">' + esc(c[1]) + "</button></li>"; };
  root.innerHTML =
    '<div id="adDone"></div>' +
    '<p class="ad-body ad-intro mb-3">Tenant sources: Box folders, Slack channels, applications, file shares and records systems that belong to the organization rather than to a person. ' +
      'Microsoft 365 teams, sites, shared mailboxes and communities come from the permissions sync instead — <a href="case-add-sources.html?door=m365' + esc(caseQ) + '">add those from Microsoft 365</a>.</p>' +
    '<div class="btn-toolbar-gray btn-toolbar-list ad-tools mb-2" role="toolbar" aria-label="Search Sources">' +
      '<div class="toolbar-list-search"><div class="cf-input-field cf-input-field-sm cf-input-field-casefusion"><div class="cf-input-wrapper">' +
        '<input type="text" id="adSearch" class="cf-input-control" placeholder="Search sources …" aria-label="Search sources" data-demo-noguard />' +
        '<i class="mdi mdi-magnify cf-input-icon" aria-hidden="true"></i></div></div></div>' +
    "</div>" +
    '<ul class="nav nav-pills nav-pills-nimbus nav-pills-casefusion mb-3" aria-label="Source type">' + C.chips.map(pill).join("") + "</ul>" +
    '<div class="demo-section-head mb-2"><h2 class="cf-category cf-cat-6 mb-0">In Sources</h2><span class="ad-meta text-muted" id="adCount"></span></div>' +
    '<div class="table-responsive"><table class="table align-middle mb-0 ad-table ad-body">' +
      '<thead><tr><th scope="col"><span class="visually-hidden">Select</span></th><th scope="col">Source</th><th scope="col">Source Type</th><th scope="col">Business Owner</th>' +
      '<th scope="col">Scale</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody id="adRows"></tbody></table></div>' +
    /* Reported-locations bridge (M22): named, counted, and opened in their own review step. */
    '<div class="alert alert-warning my-3 ad-body" role="note"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span>' +
      '<div class="alert-message">Custodians named <b>' + reported.length + " places that are not in Sources</b> — " + esc(reported.map(function (r) { return r.label; }).join(" and ")) +
      ". They are reviewed as reported locations, where one can be added to Sources.</div>" +
      '<a class="btn btn-secondary btn-sm" href="not-in-demo.html?what=Reported+locations&amp;ships=1">OPEN REPORTED LOCATIONS</a></div>' +
    '<p class="note note-info note-sm mb-3 ad-body"><i class="mdi mdi-information-outline me-1" aria-hidden="true"></i>A source added here belongs to the case, not to a custodian. ' +
      "It appears on the data map under <b>Non-custodial</b>, and the work goes to the response team for its source type.</p>" +
    '<div class="btn-toolbar-gray btn-toolbar-action ad-foot mb-4" role="toolbar" aria-label="Add sources actions">' +
      '<span class="ad-foot-text">' + esc(X.NO_PRESERVE) + "</span>" +
      '<div class="toolbar-action-end"><span class="ad-meta text-muted me-2" id="adWhy" aria-live="polite"></span>' +
        '<a class="btn btn-secondary" href="' + esc(X.dataMapUrl()) + '">CANCEL</a>' +
        /* CREATE SOURCE opens the PRD 03 source editor, for something not in the catalog yet (not in this demo). */
        '<a class="btn btn-secondary" href="not-in-demo.html?what=Source+editor">CREATE SOURCE</a>' +
        '<button type="button" class="btn btn-primary" id="adAdd" data-ad="add" aria-describedby="adWhy">ADD SOURCES</button></div>' +
    "</div>";

  function rowHtml(r) {
    var here = onCase(r), why = here ? r.name + " is already on this case." : "";
    var owner = M.person(r.owner);
    return "<tr><td>" + '<div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + r.id + '"' + (st.ticked[r.id] ? " checked" : "") + (here ? " disabled" : "") +
        ' aria-label="Add ' + esc(r.name) + '"' + (why ? ' title="' + esc(why) + '"' : "") + " /></div></td>" +
      '<td class="ad-name"><span class="fw-bold">' + esc(r.name) + "</span>" + (st.added[r.id] ? ' <span class="badge badge-success">Added</span>' : "") +
        '<span class="d-block ad-meta text-muted">' + esc(r.system + " · " + r.where) + "</span></td>" +
      '<td class="ad-wrap-narrow">' + esc(r.type) + '<span class="d-block ad-meta text-muted">' + esc(r.team) + "</span></td>" +
      "<td>" + (D.canSee(owner) ? esc(owner.name) : '<span class="demo-masked"><i class="mdi mdi-lock" aria-hidden="true"></i>Profile details limited</span>') + "</td>" +
      '<td class="ad-wrap-narrow">' + esc(r.scale) + "</td>" +
      '<td class="text-end text-nowrap">' + (here ? '<span class="ad-meta">' + (st.added[r.id] ? "Added to this case" : "Already on this case") + "</span>" :
        '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=' + encodeURIComponent("Source details · " + r.name) + '">DETAILS</a>') + "</td></tr>";
  }
  function render() {
    [].forEach.call(root.querySelectorAll("[data-chip]"), function (b) { var on = b.getAttribute("data-chip") === st.chip; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
    var body = document.getElementById("adRows");
    if (!X.isReady()) { body.innerHTML = X.skeletonRows(4, 6, true); document.getElementById("adCount").textContent = ""; renderFoot(); return; }
    var rows = api.search(st);
    document.getElementById("adCount").textContent = C.total + " sources · " + rows.length + " shown";
    body.innerHTML = rows.length ? rows.map(rowHtml).join("") :
      '<tr><td colspan="6"><div class="demo-empty py-4"><i class="mdi mdi-magnify mdi-36px" aria-hidden="true"></i><div class="demo-empty-title">No Matching Sources</div>' +
      '<div class="demo-empty-note">Nothing in Sources matches this search and type. CREATE SOURCE adds one to the catalog.</div></div></td></tr>';
    renderFoot();
  }
  function renderFoot() {
    var n = Object.keys(st.ticked).filter(function (k) { return st.ticked[k]; }).length, b = document.getElementById("adAdd");
    b.textContent = n ? "ADD " + n + " SOURCE" + (n === 1 ? "" : "S") : "ADD SOURCES";
    b.disabled = !n;
    document.getElementById("adWhy").textContent = n ? "" : "Choose at least one source to add.";
  }

  root.addEventListener("change", function (e) { var id = e.target.getAttribute && e.target.getAttribute("data-tick"); if (id) { st.ticked[id] = e.target.checked; renderFoot(); } });
  root.addEventListener("input", function (e) { if (e.target.id === "adSearch") { st.search = e.target.value; render(); } });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-chip")) { st.chip = b.getAttribute("data-chip"); render(); return; }
    var a = b.getAttribute("data-ad");
    if (a === "again") document.getElementById("adDone").innerHTML = "";
    if (a !== "add") return;
    var ids = Object.keys(st.ticked).filter(function (k) { return st.ticked[k] && !onCase(A.catalogRow(k)); });
    if (!ids.length) return;
    ids.forEach(function (id) { st.added[id] = true; st.done = (st.done || []).concat(["cat:" + id]); });
    st.ticked = {};
    [].forEach.call(root.querySelectorAll("input[type=checkbox]"), function (f) { f.removeAttribute("data-demo-changed"); });
    document.getElementById("adDone").innerHTML = X.doneAlert(st.done.length, "Sources", st.done, "They are on the data map under Non-custodial, and each goes to the response team for its source type when a request includes it.");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    D.toast(ids.length + " source" + (ids.length === 1 ? "" : "s") + " added to this case.");
  });

  render();
  X.whenReady(render);
}());
