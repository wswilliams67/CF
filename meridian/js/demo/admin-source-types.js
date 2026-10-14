/* ═══════════════════════════════════════════════════════════════════════
   Source Types controller (PRD 03 §7.4). Nimbus only: breadcrumb, table, cards,
   list group of switches, offcanvas editor with Select and cf-input-field. and the decommissioned source type
   editor (§7.6), shown for Yammer. CaseFusion records a data outcome rather
   than refusing it: Not retained or Unknown raises an exception on open
   cases instead of blocking the save (S40, S41).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var types = JSON.parse(JSON.stringify(M.sourceTypes));
  var PT = ["Employee", "Contractor", "Vendor"];
  var TERMS = { KeyQL: "From Purview", KWD: "Keyword list", NOQ: "No" };

  function ordered() {
    var top = types.filter(function (t) { return !t.under; }), out = [];
    top.forEach(function (t) {
      out.push(t);
      types.filter(function (c) { return c.under === t.name; }).forEach(function (c) { out.push(c); });
    });
    return out;
  }
  function statusCell(t) {
    var pill = t.status === "Active" ? '<span class="badge badge-pill badge-success">Active</span>' : '<span class="badge badge-pill badge-secondary">' + esc(t.status) + "</span>";
    return pill + (t.note ? '<span class="d-block small text-muted">' + esc(t.note) + "</span>" : "") + '<span class="d-block small text-muted">' + esc(t.cov) + "</span>";
  }
  function renderTable() {
    document.getElementById("stTotal").textContent = "Total: " + types.length;
    var head = '<thead><tr><th rowspan="2" scope="col">Source Type</th><th rowspan="2" scope="col">Kind</th><th rowspan="2" scope="col">Status And Coverage</th><th rowspan="2" scope="col">Discovery Method</th><th rowspan="2" scope="col">Location Format</th>' +
      '<th rowspan="2">Date Range Filter</th><th rowspan="2">Search Terms</th><th rowspan="2">Collection Unit</th><th rowspan="2">Sources</th>' +
      PT.map(function (p) { return '<th class="st-pt" colspan="2">' + p + "</th>"; }).join("") + '<th rowspan="2"></th></tr><tr>' +
      PT.map(function () { return '<th class="st-pt">Active</th><th>Departed</th>'; }).join("") + "</tr></thead>";
    var body = "<tbody>" + ordered().map(function (t) {
      return '<tr class="' + (t.under ? "st-child" : "") + '"><td>' + (t.under ? '<i class="mdi mdi-subdirectory-arrow-right text-muted me-1" aria-hidden="true"></i>' : "") + '<span class="fw-bold st-name">' + esc(t.name) + "</span>" + (t.added ? '<span class="d-block small text-muted">Added by the tenant</span>' : "") +
        '<span class="d-block small text-muted">' + esc(t.integ) + "</span></td><td>" + esc(t.kind) + "</td><td>" + statusCell(t) + "</td><td>" + esc(t.disc) + "</td><td>" + esc(t.loc) + "</td>" +
        "<td>" + esc(t.date) + '</td><td><span class="badge badge-pill badge-secondary">' + esc(t.terms) + '</span><span class="d-block small text-muted">' + esc(TERMS[t.terms]) + "</span></td><td>" + esc(t.unit) + "</td>" +
        "<td>" + t.sources.toLocaleString("en-US") + "</td>" +
        t.std.map(function (v, i) { return '<td class="st-mark' + (i % 2 === 0 ? " st-first" : "") + '">' + (v ? '<i class="mdi mdi-check" aria-label="Standard source"></i>' : '<span class="text-muted" aria-label="Not standard">—</span>') + "</td>"; }).join("") +
        "<td>" + (t.name === "Yammer" ? '<button type="button" class="btn btn-tertiary btn-sm" data-edit="Yammer">EDIT</button>' :
          '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=' + encodeURIComponent("Source type editor · " + t.name) + '">EDIT</a>') + "</td></tr>";
    }).join("") + "</tbody>";
    document.getElementById("stTable").innerHTML = head + body;
  }

  /* ── Yammer, decommissioned (PRD 03 §7.6) ───────────────────────────── */
  var Y = M.yammer;
  var ed = null;
  function effects() {
    return Y.effects.map(function (e) {
      var c = M.caseById(e.caseId), closed = c.status === "Closed";
      if (ed.outcome === "migrated") return { c: c, pill: e.effect, cls: e.effect === "Report only" ? "muted" : e.effect === "Newly covered" ? "info" : "ok", text: e.text };
      if (ed.outcome === "archived") return { c: c, pill: closed ? "Report only" : "Archived", cls: closed ? "muted" : "warn",
        text: closed ? "The preservation report keeps the Yammer name with its data outcome." : "The content is kept in " + (ed.archivedIn || "the archive named above") + ". Holds and requests go there." };
      return { c: c, pill: closed ? "Report only" : "Content not retained", cls: closed ? "muted" : "bad",
        text: closed ? "The preservation report records that the content was not retained." : "Raises an exception on this case: the Yammer content it held " + (ed.outcome === "unknown" ? "may be" : "is") + " gone." };
    });
  }
  /* Editor on the Nimbus offcanvas (50vw: a form). Sections are cards with cf-category headings.
     The bar stays (Scott, 10-14, rule 5): each card is a top-level section of the panel, a peer of the page's own
     Standard Source Rules card, not a card nested in a record. The summary beside the heading is a 12px note,
     baseline-aligned in demo-section-head (rule 7). */
  var panel = null;
  function sec(title, summary, body) {
    return '<section class="card card-basic mb-2"><div class="card-body"><div class="demo-section-head st-sec-head"><h4 class="cf-category cf-cat-6 highlight-casefusion flex-grow-1 mb-0">' + title +
      '</h4><span class="st-sec-note text-muted">' + summary + "</span></div>" + body + "</div></section>";
  }
  function field(id, label, value, req, helpText, attrs) {
    return '<div class="cf-input-field cf-input-field-casefusion cf-input-field-sm"><label class="cf-input-label" for="' + id + '">' + label + (req ? ' <span class="cf-input-required">*</span>' : "") + "</label>" +
      '<div class="cf-input-wrapper"><input type="text" id="' + id + '" class="cf-input-control" value="' + esc(value) + '"' + (attrs || "") + " /></div>" +
      (helpText ? '<div class="cf-input-helper"><span class="cf-input-helper-text">' + helpText + "</span></div>" : "") + "</div>";
  }
  function hint(t) { return '<p class="small text-muted mt-1 mb-0">' + t + "</p>"; }
  function drawerBody() {
    var mig = ed.outcome === "migrated", arch = ed.outcome === "archived", adverse = ed.outcome === "notretained" || ed.outcome === "unknown";
    var successors = types.filter(function (t) { return t.status === "Active"; }).map(function (t) { return t.name; });
    var eff = effects();
    var cont = { size: "sm", container: "#" + panel.id };
    var yt = types.filter(function (x) { return x.name === "Yammer"; })[0];
    return sec("Lifecycle", ed.status === "Decommissioned" ? "Decommissioned" + (mig ? " · succeeded by " + esc(ed.successor) : "") : "Active",
        '<div class="row g-3">' +
        '<div class="col-6">' + D.select("stStatus", [["Decommissioned", "Decommissioned"], ["Active", "Active"]], ed.status, "Status *", Object.assign({ attrs: 'data-ed="status"' }, cont)) + "</div>" +
        '<div class="col-6">' + field("stOn", "Decommissioned On", M.fmtDate(Y.decommissioned), true) + "</div>" +
        '<div class="col-6"><div class="form-check form-switch mt-4"><input class="form-check-input" type="checkbox" role="switch" id="stTrack" checked disabled /><label class="form-check-label" for="stTrack">Track content coverage</label>' +
          '<div class="form-text">Required once a type is decommissioned: the overlap rule reads it.</div></div></div>' +
        '<div class="col-6">' + field("stCs", "Content Coverage Starts", Y.covStart, true, "When this type first held content.") + "</div>" +
        '<div class="col-6">' + field("stCe", "Content Coverage Ends", Y.covEnd, true) + "</div>" +
        '<div class="col-6">' + D.select("stOut", [["migrated", "Migrated to another source"], ["archived", "Archived"], ["notretained", "Not retained"], ["unknown", "Unknown"]], ed.outcome, "Data Outcome *", Object.assign({ attrs: 'data-ed="outcome"' }, cont)) + "</div>" +
        (mig ? '<div class="col-6">' + D.select("stSucc", successors.map(function (n) { return [n, n]; }), ed.successor, "Succeeded By *", Object.assign({ attrs: 'data-ed="successor"' }, cont)) + "</div>" +
          '<div class="col-12">' + field("stCarry", "Content It Carries Forward", Y.covStart + " – " + Y.covEnd, false, "Added to " + esc(ed.successor) + "'s own coverage, which starts Mar 2025.") + "</div>" : "") +
        (arch ? '<div class="col-12">' + field("stArch", "Archived In", ed.archivedIn || "", true, "A pointer lets the double-count check run by itself.", ' data-ed-input="archivedIn" placeholder="A source, a source type, or a place outside the catalog"') + "</div>" : "") +
        "</div>" +
        (adverse ? '<div class="alert alert-danger mt-3 mb-0" role="alert"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert-octagon"></i></span><span><b>' + (ed.outcome === "unknown" ? "No one can say where the content went." : "The content is gone.") +
          "</b> Saving raises an exception on every open case that held Yammer sources. CaseFusion records the outcome; it does not refuse it.</span></div>" : "")) +
      sec("Standard Source For", "Decommissioned" + (mig ? " · moving to " + esc(ed.successor) : ""),
        '<div class="row g-3"><div class="col-12">' + hint("Not added to new cases. A case whose window reaches before Mar 2025 still gets it, read-only.") +
        '<table class="table table-sm table-bordered text-center mt-2 mb-0 st-matrix" aria-label="Standard source matrix (read-only)"><thead><tr><th scope="col"></th><th scope="col">Active</th><th scope="col">Departed</th></tr></thead><tbody>' +
          PT.map(function (p, i) { return '<tr><th scope="row">' + p + "</th><td>" + (yt.std[i * 2] ? '<i class="mdi mdi-check" aria-label="Yes"></i>' : "—") + "</td><td>" + (yt.std[i * 2 + 1] ? '<i class="mdi mdi-check" aria-label="Yes"></i>' : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (mig ? '<div class="col-12"><div class="card card-basic mb-0"><div class="card-body"><div class="form-check"><input class="form-check-input" type="checkbox" id="stProp"' + (ed.propose ? " checked" : "") + " />" +
          '<label class="form-check-label fw-bold" for="stProp">Make ' + esc(ed.successor) + " a standard source for the same people</label></div>" +
          hint("Employee · active and departed. " + Y.people.toLocaleString("en-US") + " people on new cases.") +
          (ed.successor === "Viva Engage" ? '<p class="small text-success mt-2 mb-0"><i class="mdi mdi-check-circle" aria-hidden="true"></i> Viva Engage is not a standard source today, so no custodian gets a second source.</p>' :
            '<p class="small text-warning-emphasis mt-2 mb-0">' + esc(ed.successor) + " is already a standard source for these people. Inheriting would give every custodian a second source for the same content.</p>") + "</div></div></div>" : "") +
        "</div>") +
      sec("Effect Of Decommissioning", eff.length + " cases hold or held Yammer sources",
        '<div class="table-responsive"><table class="table table-sm align-middle mb-0 st-effects"><tbody>' +
        eff.map(function (e) {
          return '<tr><td><span class="fw-bold">' + esc(e.c.name + " · " + e.c.id) + '</span><span class="d-block small text-muted">' + esc(e.c.status) + "</span></td><td>" + esc(e.text) +
            '</td><td class="text-end"><span class="badge badge-pill badge-' + window.MeridianDemo.badgeColor[e.cls] + '">' + esc(e.pill) + "</span></td></tr>";
        }).join("") + "</tbody></table></div>") +
      sec("Routing", "Read-only while decommissioned",
        /* Shared name/value pairs (Scott, 10-14, rule 2): 12px bold labels, 14px values. */
        '<dl class="row demo-kv mb-0"><dt class="col-4 fw-bold">Preserve</dt><dd class="col-8 mb-1">No longer available' + (mig ? ". Requests go to " + esc(ed.successor) + "." : "") + "</dd>" +
        '<dt class="col-4 fw-bold">Collect</dt><dd class="col-8 mb-0">No longer available' + (mig ? ". Requests go to " + esc(ed.successor) + "." : "") + "</dd></dl>");
  }
  function drawer() {
    panel.el.querySelectorAll("select[data-cnds-select-init]").forEach(function (el) { var x = Nimbus.Select.getInstance(el); if (x) x.dispose(); });
    panel.setBody(drawerBody());
  }
  function openEditor() {
    ed = { status: "Decommissioned", outcome: "migrated", successor: Y.successor, propose: true, archivedIn: "" };
    panel = D.offcanvas({ title: "Source Type · Yammer", width: "50vw", body: "",
      footer: '<span class="st-foot-note text-muted me-auto">' + Y.sources + " sources use this type across " + Y.effects.length + " cases. They stay on the data map.</span>" +
        '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CANCEL</button><button type="button" class="btn btn-primary text-nowrap" data-st="save">SAVE SOURCE TYPE</button>',
      onHidden: function () { if (panel) panel.el.querySelectorAll("select[data-cnds-select-init]").forEach(function (el) { var x = Nimbus.Select.getInstance(el); if (x) x.dispose(); }); ed = null; panel = null; } });
    drawer();
  }
  function closeEditor() { if (panel) panel.hide(); }
  function save() {
    var y = types.filter(function (t) { return t.name === "Yammer"; })[0];
    var viva = types.filter(function (t) { return t.name === ed.successor; })[0];
    var msg;
    if (ed.status === "Active") { y.status = "Active"; y.note = ""; delete y.under; y.cov = "Jun 2010 – present"; msg = "Yammer is active again. New cases can add it."; }
    else if (ed.outcome === "migrated") {
      y.status = "Decommissioned"; y.note = "Succeeded by " + ed.successor; y.under = ed.successor;
      if (ed.propose && viva) viva.std = [1, 1, viva.std[2], viva.std[3], viva.std[4], viva.std[5]];
      msg = "Yammer saved. Requests go to " + ed.successor + (ed.propose ? ", and " + ed.successor + " is now a standard source for employees." : ".");
    } else if (ed.outcome === "archived") { y.status = "Decommissioned"; y.note = "Archived in " + (ed.archivedIn || "an archive"); delete y.under; msg = "Yammer saved as archived."; }
    else {
      y.status = "Decommissioned"; y.note = ed.outcome === "unknown" ? "Data outcome unknown" : "Not retained"; delete y.under;
      msg = "Yammer saved. An exception was raised on 2 open cases: the content " + (ed.outcome === "unknown" ? "may be" : "is") + " gone.";
    }
    closeEditor(); renderTable(); D.toast(msg);
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  /* Nimbus Select reports a choice as valueChanged.cnds.select on the native <select>. */
  document.addEventListener("valueChanged.cnds.select", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-ed");
    if (k && ed) { ed[k] = e.target.value; setTimeout(drawer, 0); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "stProp" && ed) { ed.propose = e.target.checked; return; }
    if (/^stR\d$/.test(e.target.id)) document.querySelector('[data-st="save-rules"]').disabled = false;
  });
  document.addEventListener("input", function (e) { if (e.target.id === "stArch" && ed) ed.archivedIn = e.target.value; });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-edit")) { openEditor(); return; }
    var a = t.getAttribute("data-st");
    if (a === "save") save();
    if (a === "save-rules") { t.disabled = true; D.toast("Standard source rules saved."); }
    if (a === "cancel-rules") { ["stR1", "stR2", "stR3"].forEach(function (id) { document.getElementById(id).checked = true; }); document.querySelector('[data-st="save-rules"]').disabled = true; }
  });

  renderTable();
  if (new URLSearchParams(location.search).get("edit") === "Yammer") {
    if (window.Nimbus && Nimbus.Offcanvas) openEditor();
    else document.addEventListener("cnds.ready", openEditor, { once: true });
  }
}());
