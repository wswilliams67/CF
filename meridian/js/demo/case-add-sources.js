/* ═══════════════════════════════════════════════════════════════════════
   Case › Add sources (PRD 03 §7.7): the source-type lifecycle at work.
   Every decision is computed against the case window. Yammer's coverage
   ends inside the window, so its successor is offered in its place.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var Y = M.yammer;
  var st = { ticked: { exchange: true, sharepoint: true, viva: true, yammer: false, skype: false }, redirect: "open", showSkype: false };
  var rows = [
    { id: "exchange", name: "Exchange mailbox", scope: "Microsoft 365 · " + M.custodians.length + " custodians", cov: "Jan 2012 – present", reason: "Standard source for every custodian on the case.", status: "Active" },
    { id: "sharepoint", name: "SharePoint site", scope: "Microsoft 365 · Regulatory Submissions", cov: "Mar 2016 – present", reason: "Found through permissions and audit activity.", status: "Active" },
    { id: "yammer", name: "Yammer", scope: "Microsoft 365 · " + Y.communities + " communities", cov: Y.covStart + " – " + Y.covEnd, reason: "Found through Sources.", status: "Decommissioned" },
    { id: "viva", name: "Viva Engage", scope: "Microsoft 365 · " + Y.communities + " communities", cov: Y.covStart + " – present", reason: "Carries Yammer content migrated " + M.fmtDate(Y.decommissioned) + ". Its own content starts Mar 2025.", status: "Active", successor: true }
  ];
  var skype = { id: "skype", name: "Skype for Business", scope: "Microsoft 365 · conversation archive", cov: "Apr 2011 – Jul 2021", reason: "Outside the case window. Archived in Exchange; the Exchange mailbox on this case already covers it, so adding it would count the same content twice.", status: "Decommissioned" };

  function render() {
    document.getElementById("asWindow").textContent = M.fmtDate(M.window.start) + " – " + M.fmtDate(M.window.end);
    var list = rows.slice();
    if (st.showSkype) list.push(skype);
    /* Type rule (Scott, 10-14): the scope line under a source name and the recorded-decision line are meta, 12px
       (.as-meta, defined in the page); names, coverage and reasons stay 14px. Coverage does not wrap mid-range. */
    var html = '<thead><tr><th scope="col"></th><th scope="col">Source</th><th scope="col">Content Coverage</th><th scope="col">Reason</th><th scope="col">Status</th><th scope="col"></th></tr></thead><tbody>';
    list.forEach(function (r) {
      var decom = r.status === "Decommissioned";
      html += '<tr><td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + r.id + '"' + (st.ticked[r.id] ? " checked" : "") + (r.id === "yammer" ? " disabled" : "") +
        ' aria-label="Add ' + esc(r.name) + '" /></div></td><td class="as-source"><span class="fw-bold">' + esc(r.name) + "</span>" + (r.successor ? ' <span class="badge badge-pill badge-info">Successor</span>' : "") +
        '<span class="d-block as-meta text-muted">' + esc(r.scope) + '</span></td><td class="text-nowrap">' + esc(r.cov) + "</td><td>" + esc(r.reason) + "</td>" +
        '<td><span class="badge badge-pill badge-' + (decom ? "secondary" : "success") + '">' + esc(r.status) + "</span></td>" +
        '<td class="text-end">' + (r.id === "yammer" ? '<a class="btn btn-tertiary btn-sm text-nowrap" href="admin-source-types.html?edit=Yammer">VIEW SOURCE TYPE</a>' : "") + "</td></tr>";
      if (r.id === "yammer") {
        if (st.redirect === "open") {
          /* GAP #5: alert with actions. */
          html += '<tr><td></td><td colspan="5"><div class="alert alert-warning mb-0" role="note"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span><div class="alert-message">' +
            "<p class=\"mb-2\"><b>Yammer was decommissioned on " + esc(M.fmtDate(Y.decommissioned)) + " and its content was migrated to Viva Engage.</b> Yammer held content until " + esc(Y.covEnd) +
            ", which is inside this case window. Viva Engage carries that content forward. Yammer itself can no longer be preserved or collected.</p>" +
            '<button type="button" class="btn btn-primary btn-sm" data-as="scope-viva">SCOPE VIVA ENGAGE INSTEAD</button> <button type="button" class="btn btn-secondary btn-sm" data-as="leave-out">LEAVE OUT</button></div></div></td></tr>';
        } else {
          html += '<tr><td></td><td colspan="5"><span class="as-meta text-muted"><i class="mdi mdi-check" aria-hidden="true"></i> ' +
            (st.redirect === "viva" ? "Viva Engage scoped instead of Yammer · recorded by " + esc(M.person(D.viewer().personId).name) + " · " + esc(M.fmtDate(M.DEMO_TODAY)) :
              "Yammer's period left out · recorded with this case · Viva Engage not added") + '</span> <button type="button" class="btn btn-tertiary btn-sm" data-as="undo">UNDO</button></td></tr>';
        }
      }
    });
    document.getElementById("asTable").innerHTML = html + "</tbody>";
    document.getElementById("asNote").innerHTML = st.showSkype ? "<b>Skype for Business is shown.</b> It is outside the case window and archived in Exchange, which this case already covers. " +
        '<button type="button" class="btn btn-tertiary btn-sm" data-as="hide-skype">HIDE</button>' :
      "<b>1 standard source type was not added: outside the case window.</b> Skype for Business · Apr 2011 – Jul 2021 · decommissioned, archived in Exchange. The Exchange mailbox on this case already covers it. " +
        '<button type="button" class="btn btn-tertiary btn-sm" data-as="show-skype">SHOW ANYWAY</button>';
    var n = Object.keys(st.ticked).filter(function (k) { return st.ticked[k]; }).length;
    document.getElementById("asCount").textContent = n + " sources selected";
    document.getElementById("asLine").textContent = "4 source types cover this case window · 1 is decommissioned with a successor.";
  }
  document.addEventListener("change", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-tick");
    if (id) { st.ticked[id] = e.target.checked; render(); }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    var a = t.getAttribute("data-as");
    if (a === "scope-viva") { st.redirect = "viva"; st.ticked.viva = true; render(); D.toast("Viva Engage scoped instead of Yammer. The decision is recorded with the case."); }
    if (a === "leave-out") { st.redirect = "left"; st.ticked.viva = false; render(); D.toast("Yammer's period left out. The decision is recorded with the case."); }
    if (a === "undo") { st.redirect = "open"; st.ticked.viva = true; render(); }
    if (a === "show-skype") { st.showSkype = true; render(); }
    if (a === "hide-skype") { st.showSkype = false; st.ticked.skype = false; render(); }
    if (a === "scope") D.toast("Saved as a scope on the data map.");
  });
  render();
}());
