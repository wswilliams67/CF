/* ═══════════════════════════════════════════════════════════════════════
   Add source doors (PRD 01 §7.7–7.9): what the three pickers share.
   Loaded after shell.js and before the door's own script.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, A = M.addSources;
  var q = new URLSearchParams(location.search);
  var caseParam = q.get("case");

  /* The data map URL, carrying the case the door was opened from. */
  function dataMapUrl(extra) {
    var p = [];
    if (extra) p.push(extra);
    if (caseParam) p.push("case=" + encodeURIComponent(caseParam));
    return "case-data-map.html" + (p.length ? "?" + p.join("&") : "");
  }
  /* Hand-back (contract in data/meridian-add-sources.js): added=<tokens>&by=<person id>. */
  function handBackUrl(tokens) {
    return dataMapUrl("added=" + tokens.join(",") + "&by=" + D.viewer().personId);
  }

  /* API seam (as Coverage, Hold Status and My Work): each list comes from one call, and the server can be slow. While
     a call is pending its table shows Nimbus skeletons in the real geometry. In this demo the data is local, so the
     web font loading stands in for the wait. */
  var ready = !(document.fonts && document.fonts.status !== "loaded");
  /* DEMO ONLY: do not build. ?skeleton=1 holds the loading state so the skeletons can be reviewed. */
  var hold = /[?&]skeleton=1\b/.test(location.search);
  function whenReady(fn) {
    if (hold) return;
    if (ready) { fn(); return; }
    document.fonts.ready.then(function () { ready = true; fn(); });
  }
  function sk(w) { return '<span class="skeleton skeleton-text skeleton-w-' + w + '"></span>'; }
  function skRect(w, h) { return '<span class="skeleton skeleton-rect" style="display: inline-block; vertical-align: middle; width: ' + w + "; height: " + h + ';"></span>'; }
  /* n rows of cols cells; the first cell is a checkbox square when box is true. */
  function skeletonRows(n, cols, box) {
    var cells = "";
    for (var i = 0; i < cols; i++) cells += "<td>" + (i === 0 && box ? skRect("18px", "18px") : i === (box ? 1 : 0) ? '<div class="skeleton-group">' + sk(75) + sk(50) + "</div>" : '<div class="skeleton-group">' + sk(66) + "</div>") + "</td>";
    return new Array(n + 1).join('<tr aria-hidden="true">' + cells + "</tr>");
  }

  /* A person's name as this viewer may see it (D.canSee; R1, R3). */
  function personName(id) { var p = M.person(id); return p ? D.nameFor(p) : ""; }

  /* "Adding a source does not preserve it…" sits above every door's primary button (M29, AC13). */
  var NO_PRESERVE = "Adding a source does not preserve it. It joins the case so a preservation or collection request can include it.";

  /* The finished state: what was added, how it reached the case, and the way back with the hand-back. */
  function doneAlert(n, found, tokens, extra) {
    return '<div class="alert alert-success mb-3" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-check-circle"></i></span>' +
      '<div class="alert-message"><p class="mb-2"><b>' + n + " source" + (n === 1 ? " was" : "s were") + " added to this case.</b> Found through: " + D.esc(found) + ". " +
      (extra ? D.esc(extra) + " " : "") + "Nothing is preserved until a request is sent.</p>" +
      '<a class="btn btn-primary btn-sm" href="' + D.esc(handBackUrl(tokens)) + '">VIEW DATA MAP</a> ' +
      '<button type="button" class="btn btn-secondary btn-sm" data-ad="again">ADD MORE SOURCES</button></div></div>';
  }

  window.AddDoors = { q: q, dataMapUrl: dataMapUrl, handBackUrl: handBackUrl, whenReady: whenReady, isReady: function () { return ready && !hold; },
    skeletonRows: skeletonRows, sk: sk, skRect: skRect, personName: personName, NO_PRESERVE: NO_PRESERVE, doneAlert: doneAlert, A: A };
}());
