/* ═══════════════════════════════════════════════════════════════════════
   Coverage controller (PRD 08 §7.1–7.3).
   One copy of the case's custodians in memory. Tiles, banner, grid, panel
   and release dialog are all recomputed from it with MERIDIAN.coverageOf,
   so Fully covered + In progress + Action needed always equals the
   custodian count. Coverage decides what to do; Hold status says what is
   true, so preservation cells link there.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var TODAY = M.DEMO_TODAY;
  var short = function (iso) { return M.fmtDate(iso).replace(/ \d{4}$/, ""); };

  var custodians = JSON.parse(JSON.stringify(M.custodians));
  var selected = {};
  var flash = {};
  var tileFilter = null;
  var page = 1, pageSize = 10;   /* grid pager: the house default, 10 per page (design decision 10) */

  function person(c) { return M.person(c.personId); }
  function cov(c) { return M.coverageOf(c); }
  function visibleName(c) { return D.nameFor(person(c)); }
  function seen(c) { return D.canSee(person(c)); }
  function byPid(pid) { return custodians.filter(function (c) { return c.personId === pid; })[0]; }
  function selectedList() { return custodians.filter(function (c) { return selected[c.personId]; }); }
  /* Release applies to a custodian on a legal hold (notified or silent) who is not released yet and not held on
     another accessible case. Everyone else has nothing to release. */
  function releasable(c) { return (c.lhn || []).length > 0 && !c.released && !M.heldElsewhere[c.personId]; }
  function afterNoticeUnsent() {
    return custodians.filter(function (c) { return c.afterNotice && !(c.lhn || []).some(function (n) { return n.status !== "Silent"; }); });
  }
  function me() { return M.person(D.viewer().personId).name; }

  /* ── Cells ──────────────────────────────────────────────────────────── */
  /* Nimbus badges, coloured by the coverage-grid semantics in the glossary. */
  /* badge-verbatim: the status words keep their own case ("3 of 3 on hold", not "3 Of 3 On Hold"), as Hold Status's Purview
     words do (Nimbus gap #10; design decision, 14 Oct). */
  var PILL = { done: "badge badge-pill badge-verbatim badge-success", progress: "badge badge-pill badge-verbatim badge-info", todo: "badge badge-pill badge-verbatim badge-warning", action: "badge badge-pill badge-verbatim badge-danger", silent: "badge badge-pill badge-verbatim badge-secondary", na: "badge badge-pill badge-verbatim badge-light" };
  /* A date never breaks across lines: "latest 08-29-" / "2026" read as two things. */
  function keepDates(html) { return html.replace(/(\d{2}-\d{2}-\d{4})/g, '<span class="text-nowrap">$1</span>'); }
  function cell(x, link) {
    if (x.state === "dash") return '<span class="text-muted" title="Not expected on this case">—</span>';
    var pill = '<span class="' + PILL[x.state] + '">' + esc(x.text) + "</span>";
    if (link) pill = '<a href="' + link + '" title="Open Hold status">' + pill + "</a>";
    return pill + (x.detail ? '<span class="d-block small text-muted mt-1">' + keepDates(esc(x.detail)) + "</span>" : "");
  }

  /* ── Tiles ──────────────────────────────────────────────────────────── */
  function actionSubline(list) {
    var notify = 0, escal = 0, pres = 0;
    list.forEach(function (c) {
      var v = cov(c);
      if (v.lhn.state === "action") notify++;
      else if (v.survey.state === "action") escal++;
      else if (v.preservation.state === "action") pres++;
    });
    var parts = [];
    if (notify) parts.push(notify + " never notified");
    if (pres) parts.push(pres + " with preservation gaps");
    if (escal) parts.push(escal + " escalated after reminders");
    return parts.join(" · ") || "None";
  }
  function renderTiles() {
    var b = { fully: [], progress: [], action: [] };
    custodians.forEach(function (c) { b[cov(c).bucket].push(c); });
    var gaps = gapSources().length;
    /* A filter tile with nothing in it is disabled, never hidden; names are Title Case, the CSS uppercases them (Scott, 10-14). */
    function tile(key, value, label, sub, unit) {
      var pressed = tileFilter === key || (key === "all" && !tileFilter && val("cvFilter") === "all");
      return '<button type="button" class="card card-basic demo-tile" data-tile="' + key + '" aria-pressed="' + pressed + '"' + (value ? "" : " disabled") + ">" +
        '<span class="card-subtitle demo-tile-name">' + esc(label) + (unit ? " · " + unit : "") + '</span><span class="card-title demo-tile-value">' + value + '</span><span class="card-text demo-tile-label">' + esc(sub) + "</span></button>";
    }
    document.getElementById("cvTiles").innerHTML =
      /* "Custodians" over "All custodians on the case": the PRD's longer name wrapped and pushed its count below the others' (design decision, 14 Oct). */
      tile("all", custodians.length, "Custodians", "All custodians on the case") +
      tile("fully", b.fully.length, "Fully Covered", "Every workflow complete") +
      tile("progress", b.progress.length, "In Progress", "Something outstanding, nothing late") +
      tile("action", b.action.length, "Action Needed", actionSubline(b.action)) +
      /* DATA GAPS counts sources, not custodians: a Nimbus blurry divider sets it apart (PRD 08 §7.1; design decision 18). */
      '<div class="vr vr-blurry cv-gap-sep" aria-hidden="true"></div>' +
      tile("gaps", gaps, "Data Gaps", "Sources not preserved or collected", "Sources");
  }
  /* Data gaps follow the in-memory custodians (a source marked not required leaves the count). */
  function gapSources() {
    var exempt = {};
    custodians.forEach(function (c) { if (c.notRequired && c.notRequired.preservation) exempt[c.personId] = true; });
    return M.dataGaps().filter(function (s) { return !(s.owner && exempt[s.owner]); });
  }

  /* ── Banner ─────────────────────────────────────────────────────────── */
  function renderBanner() {
    var list = afterNoticeUnsent();
    var el = document.getElementById("cvBanner");
    el.hidden = list.length === 0;
    if (!list.length) return;
    /* Verbatim order from PRD 08 §7.1: data map, org chart, interview. */
    var ORDER = ["Data map", "Org chart", "Interview"];
    var PHRASE = { "Data map": "came from the data map", "Org chart": "from the org chart", "Interview": "was named in an interview answer" };
    var froms = list.slice().sort(function (a, b) { return ORDER.indexOf(a.addedFrom) - ORDER.indexOf(b.addedFrom); })
      .map(function (c, i) { return (i === 0 ? "One " : "one ") + (i === 0 && c.addedFrom === "Org chart" ? "came from the org chart" : PHRASE[c.addedFrom]); });
    var tail = froms.length > 1 ? froms.slice(0, -1).join(", ") + ", and " + froms[froms.length - 1] : froms[0];
    document.getElementById("cvBannerText").innerHTML = "<b>" + list.length + " custodian" + (list.length === 1 ? " was" : "s were") + " added after the first legal hold notification went out on " +
      esc(short(M.firstNotice)) + ".</b> None has been sent a legal hold notification, and none is on hold. " + esc(tail) + ".";
    el.querySelector('[data-cv="select-after"]').textContent = "SELECT " + list.length + " CUSTODIANS";
  }

  /* ── Grid (Nimbus table) and selection toolbar (btn-toolbar-shared) ──── */
  function val(id) { var el = document.getElementById(id); return el ? el.value : "all"; }
  function matches(c) {
    var v = cov(c), p = person(c);
    var q = (document.getElementById("cvSearch").value || "").trim().toLowerCase();
    if (q && !(seen(c) && p.name.toLowerCase().indexOf(q) !== -1)) return false;
    var f = val("cvFilter"), tf = tileFilter;
    if (tf === "fully" || f === "fully") { if (v.bucket !== "fully") return false; }
    if (tf === "progress" && v.bucket !== "progress") return false;
    if ((tf === "action" || f === "action") && v.bucket !== "action") return false;
    if ((tf === "gaps" || f === "gaps") && !gapSources().some(function (s) { return s.owner === c.personId; })) return false;
    if (f === "notack" && !(c.lhn || []).some(function (n) { return n.status === "Not acknowledged"; })) return false;
    if (f === "notanswered" && !(c.surveys || []).some(function (s) { return s.status === "Not answered" || s.status === "Escalated"; })) return false;
    if (f === "escalated" && !(c.surveys || []).some(function (s) { return s.status === "Escalated"; })) return false;
    if (f === "after" && !c.afterNotice) return false;
    if (f === "silent" && v.lhn.state !== "silent") return false;
    if (f === "departed" && !p.departed) return false;
    var w = val("cvWorkflow");
    if (w !== "all" && (v[w].state === "done" || v[w].state === "dash" || v[w].state === "na" || v[w].state === "silent")) return false;
    return true;
  }
  function renderGrid() {
    var rows = custodians.filter(matches);
    var pages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > pages) page = pages;
    var shown = rows.slice((page - 1) * pageSize, page * pageSize);
    document.getElementById("cvBody").innerHTML = shown.map(function (c) {
      var v = cov(c), p = person(c), ok = seen(c);
      var sub = ok ? esc(p.title) + (p.departed ? " · departed " + esc(M.fmtDate(p.departed).replace(/^\d+ /, "")) : "") : "Outside your regions";
      return '<tr class="' + (selected[c.personId] ? "table-active" : "") + '">' +
        '<td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-sel="' + c.personId + '"' + (selected[c.personId] ? " checked" : "") + ' aria-label="Select ' + esc(visibleName(c)) + '" /></div></td>' +
        /* The name is the row's identity, not a link: OPEN is the one way into custodian coverage (design decision 15). */
        '<td><span class="d-block fw-bold' + (ok ? "" : " demo-masked") + '">' + (ok ? "" : '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>') + esc(visibleName(c)) + "</span>" +
          '<span class="d-block small text-muted">' + sub + "</span>" + (c.addedNote ? '<span class="d-block small text-warning-emphasis">' + esc(c.addedNote) + "</span>" : "") + "</td>" +
        "<td>" + cell(v.lhn) + "</td><td>" + cell(v.survey) + "</td><td>" + cell(v.interview) + "</td>" +
        "<td>" + cell(v.preservation, v.preservation.state === "action" || v.preservation.state === "progress" ? "case-hold-status.html" : null) + "</td>" +
        "<td>" + cell(v.collection) + "</td>" +
        /* A blurry divider sets the row action apart from the data, as in every record row (design decision 16). */
        '<td class="cv-row-action"><div class="vr vr-blurry" aria-hidden="true"></div><button type="button" class="btn btn-tertiary btn-sm" data-open="' + c.personId + '">OPEN</button></td></tr>';
    }).join("") || '<tr><td colspan="8">' + empty("No custodians match this filter", "Change the search or the filters to see more custodians.") + "</td></tr>";
    /* Pager under the grid: its range is the grid's count, so the toolbar carries none (design decision 10). Nimbus
       selects are disposed before their markup is replaced. */
    var foot = document.getElementById("cvGridFoot"), NS = window.Nimbus && Nimbus.Select;
    if (NS) foot.querySelectorAll("select[data-cnds-select-init]").forEach(function (x) { var i = NS.getInstance(x); if (i) i.dispose(); });
    foot.innerHTML = rows.length ? D.pager("cv", rows.length, page, pageSize, "Custodians per page:") : "";
    if (NS) NS.initAll(foot);
    renderNonCustodial();
    var all = document.getElementById("cvAll");
    all.checked = rows.length > 0 && rows.every(function (c) { return selected[c.personId]; });
    all.indeterminate = !all.checked && rows.some(function (c) { return selected[c.personId]; });
    renderSelTool();
  }
  function dropdown(label, items) {
    return '<div class="btn-group dropdown" role="group"><button type="button" class="btn btn-tertiary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false">' + label +
      ' <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion">' + items + "</ul></div>";
  }
  function item(attrs, title, sub, href) {
    var inner = esc(title) + (sub ? '<span class="d-block small text-muted">' + esc(sub) + "</span>" : "");
    return "<li>" + (href ? '<a class="dropdown-item" href="' + href + '">' + inner + "</a>" : '<button type="button" class="dropdown-item" ' + attrs + ">" + inner + "</button>") + "</li>";
  }
  /* The selection toolbar zooms in when the first custodian is selected and out when the last is cleared (Scott,
     10-14): Nimbus cnds-scale-in / cnds-scale-out (scale 0.95 ↔ 1 with a fade, from its centre). The two steps run in
     sequence so it reads as a zoom, not a slide: in, the slot opens (0.15s) and then the bar zooms in (0.2s); out, the
     bar zooms out in place (0.2s) and then the empty slot closes (0.15s). No motion under reduced motion. */
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var selShown = false, selTimer = null;
  function slide(host, from, to, done) {
    clearTimeout(selTimer);
    host.style.overflow = "hidden"; host.style.height = from + "px";
    void host.offsetHeight;
    host.style.transition = "height .15s ease"; host.style.height = to + "px";
    selTimer = setTimeout(function () { host.style.transition = ""; host.style.height = ""; host.style.overflow = ""; if (done) done(); }, 170);
  }
  function renderSelTool() {
    var list = selectedList(), n = list.length, host = document.getElementById("cvSelTool");
    if (!n) {
      if (!selShown) { host.innerHTML = ""; return; }
      selShown = false;
      var bar = host.querySelector(".cv-seltool");
      if (REDUCE || !bar) { host.innerHTML = ""; return; }
      bar.classList.remove("cv-zoom-in"); bar.classList.add("cv-zoom-out");
      var h = host.offsetHeight; host.style.height = h + "px";
      clearTimeout(selTimer);
      selTimer = setTimeout(function () { if (selShown) return; slide(host, h, 0, function () { if (!selShown) host.innerHTML = ""; }); }, 200);
      return;
    }
    var entering = !selShown; selShown = true;
    var regular = M.legalHolds.filter(function (h) { return !h.silent; }), silent = M.legalHolds.filter(function (h) { return h.silent; });
    var ids = list.map(function (c) { return c.personId; }).join(",");
    /* Selection toolbar in the default toolbar colour, not the green shared state (design decision 11). The clear (X)
       and the count use the list toolbar's text colour so they read on the default bar in both themes. */
    host.innerHTML = '<div class="pb-2"><div class="btn-toolbar-gray cv-seltool" role="toolbar" aria-label="Actions for selected custodians">' +
      '<div class="toolbar-shared-count"><i class="mdi mdi-close pointer toolbar-list-total" role="button" tabindex="0" aria-label="Clear selection" data-cv="clear"></i><div class="vr vr-blurry" aria-hidden="true"></div><span class="toolbar-list-total">' + n + " selected" + "</span></div><div>" +
      dropdown("SEND LEGAL HOLD NOTIFICATION",
        item("", "New Legal Hold Notification…", "Opens the notification form with the " + n + " selected custodians as recipients", "not-in-demo.html?what=New+legal+hold+notification&amp;ships=1") +
        '<li><h6 class="dropdown-header">Settings from a notification in this case</h6></li>' +
        regular.map(function (h) { return item('data-send-lhn="' + h.id + '"', h.id + " · " + h.title.split(" · ")[0], h.settings); }).join("") +
        '<li><h6 class="dropdown-header">Silent legal hold · nothing is sent</h6></li>' +
        silent.map(function (h) {
          var tracked = custodians.filter(function (c) { return (c.lhn || []).some(function (x) { return x.id === h.id; }); }).length;
          return item('data-send-silent="' + h.id + '"', h.id + " · " + h.title, "Add " + n + " selected · " + tracked + " custodian" + (tracked === 1 ? "" : "s") + " tracked");
        }).join("") +
        item("", "New Silent Legal Hold…", "Nothing is sent. The custodians are tracked and their data is held", "not-in-demo.html?what=New+silent+legal+hold&amp;ships=1")) +
      dropdown("SEND SURVEY",
        item("", "New Survey…", "Opens the survey form with the " + n + " selected custodians", "not-in-demo.html?what=New+survey&amp;ships=1") +
        '<li><h6 class="dropdown-header">Questions and reminders from a survey in this case</h6></li>' +
        M.surveys.map(function (sv) { return item('data-send-survey="' + sv.id + '"', sv.id + " · " + sv.title, sv.questions + " questions"); }).join("")) +
      '<div class="btn-group" role="group"><a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Schedule+interview&amp;ships=1">SCHEDULE INTERVIEW</a></div>' +
      dropdown("REQUEST FOR GAPS",
        item("", "Preservation Request", "Opens New request with the selected custodians and only their gap sources", "case-new-preservation.html?custodians=" + ids) +
        item("", "Collection Request", "Collection is not part of this demo", "not-in-demo.html?what=Collection+request") +
        item("", "Both", "Collection is not part of this demo", "not-in-demo.html?what=Preservation+and+collection+request")) +
      '<div class="btn-group" role="group"><button type="button" class="btn btn-tertiary btn-sm" data-cv="not-required">MARK NOT REQUIRED</button></div>' +
      /* Disabled, never hidden, when no selected custodian is on a legal hold: there is nothing to release. */
      (list.some(releasable) ? '<div class="btn-group" role="group"><button type="button" class="btn btn-tertiary btn-sm" data-cv="release">RELEASE FROM HOLD</button></div>' :
        '<div class="btn-group" role="group" title="None of the selected custodians is on a legal hold."><button type="button" class="btn btn-tertiary btn-sm" disabled>RELEASE FROM HOLD</button></div>') +
      "</div></div></div>";
    if (entering && !REDUCE) {
      var bar = host.querySelector(".cv-seltool"); bar.classList.remove("cv-zoom-out"); bar.style.opacity = "0";
      slide(host, 0, host.scrollHeight, function () { bar.style.opacity = ""; bar.classList.add("cv-zoom-in"); });
    }
  }

  /* ── Non-custodial held sources (Nimbus table) ──────────────────────── */
  /* A request ID is a link to the Requests tab whenever the request exists, so one column never mixes links and text. */
  function reqLink(id) { return !id ? '<span class="text-muted">—</span>' : M.requests.some(function (r) { return r.id === id; }) ? '<a href="case-requests.html">' + esc(id) + "</a>" : esc(id); }
  /* DATA GAPS counts sources, so it filters both tables (design decision 12): the custodian grid to the custodians
     with a gap source, and this table to its own gap sources; a note above the grid adds the two up. */
  /* View changes crossfade (Scott, 10-14): the old table is copied into a ghost layer over its .cv-xfade host, the new
     rows render underneath at opacity 0, then the ghost fades out as the new rows fade in (0.2s, as the selection
     toolbar's zoom) while the host eases from the old height to the new so the page below does not jump. Selection
     changes are not view changes and redraw in place. A change mid-fade finishes the running one first. */
  var xfTimer = null;
  function xfEnd() {
    clearTimeout(xfTimer);
    document.querySelectorAll(".cv-xfade").forEach(function (h) {
      h.querySelectorAll(".cv-xfade-ghost").forEach(function (g) { g.remove(); });
      h.classList.remove("cv-xf-start"); h.style.height = ""; h.style.overflow = ""; h.style.transition = "";
    });
  }
  function view(update) {
    xfEnd();
    var hosts = ["cvGridView", "cvNcView"].map(function (id) { return document.getElementById(id); });
    if (REDUCE) { update(); return; }
    var snap = hosts.map(function (h) {
      var g = document.createElement("div");
      g.className = "cv-xfade-ghost"; g.setAttribute("aria-hidden", "true"); g.inert = true;
      g.innerHTML = h.innerHTML;
      g.querySelectorAll("[id]").forEach(function (x) { x.removeAttribute("id"); });
      return { h: h, g: g, from: h.offsetHeight, html: h.querySelector(".table-responsive").innerHTML };
    });
    update();
    snap.forEach(function (s) {
      /* The non-custodial table often does not change: no fade where nothing changed. */
      if (s.h.querySelector(".table-responsive").innerHTML === s.html) return;
      var to = s.h.offsetHeight;
      s.h.classList.add("cv-xf-start"); s.h.appendChild(s.g);
      s.h.style.overflow = "hidden"; s.h.style.height = s.from + "px";
      void s.h.offsetHeight;
      s.h.classList.remove("cv-xf-start"); s.g.classList.add("cv-xf-out");
      s.h.style.transition = "height .2s ease"; s.h.style.height = to + "px";
    });
    xfTimer = setTimeout(xfEnd, 220);
  }
  function gapsOn() { return tileFilter === "gaps" || val("cvFilter") === "gaps"; }
  /* Preservation reads Hold status's own words (PRD 08 CV19: Coverage reads, it does not relabel): Applied → On hold,
     Attested, Partial, Unknown (decision 20). */
  function renderNonCustodial() {
    var all = M.sources.filter(function (s) { return !s.owner && !s.pending; });
    var gapIds = {}; gapSources().forEach(function (s) { gapIds[s.id] = true; });
    var rows = gapsOn() ? all.filter(function (s) { return gapIds[s.id]; }) : all;
    document.getElementById("cvNcNote").textContent = gapsOn() ? rows.length + " of " + all.length + " sources are data gaps." : "No single custodian, so they are counted once for the case.";
    var note = document.getElementById("cvGapNote");
    note.hidden = !gapsOn();
    if (gapsOn()) {
      var g = gapSources(), onC = g.filter(function (s) { return s.owner; }), owners = {};
      onC.forEach(function (s) { owners[s.owner] = true; });
      note.textContent = g.length + " gap sources: " + onC.length + " on the " + Object.keys(owners).length + " custodians below · " + (g.length - onC.length) + " non-custodial, in Non-Custodial Held Sources.";
    }
    var pres = function (s) {
      var m = { "Applied": ["On hold", "success"], "Attested": ["Attested", "info"], "Partial": ["Partial", "warning"], "Unknown": ["Unknown", "danger"] }[s.hold] || [s.hold, "light"];
      return '<span class="badge badge-pill badge-verbatim badge-' + m[1] + '">' + m[0] + "</span>";
    };
    document.getElementById("cvNcBody").innerHTML = rows.map(function (s) {
      var col = M.nonCustodialCollection[s.id];
      return "<tr><td>" + esc(M.typeLabel(s.type) + " · " + s.name) + '</td><td class="text-nowrap">' + (M.usedBy[s.id] || 0) + " custodians</td><td>" + pres(s) + "</td>" +
        "<td>" + (col ? '<span class="badge badge-pill badge-verbatim badge-info">' + esc(col.text) + "</span>" : '<span class="text-muted">—</span>') + "</td>" +
        '<td class="text-nowrap">' + reqLink(col ? col.request : s.request) + "</td></tr>";
    }).join("");
  }
  function render() {
    renderBanner(); renderTiles(); renderGrid(); renderNonCustodial();
    if (panel) renderPanel();
    flash = {};
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  /* Sending from Coverage always creates a NEW notification (PRD 08 CV21): a published notification cannot take new
     recipients, so "settings from LH-0031" copies LH-0031's body, attachments, reminders, escalation and survey into a
     new notification sent to every selected custodian. Nobody is skipped for already being on LH-0031. */
  function nextHoldId() {
    var n = M.legalHolds.reduce(function (m, x) { return Math.max(m, parseInt(x.id.replace(/\D/g, ""), 10)); }, 0) + 1;
    return "LH-" + String(n).padStart(4, "0");
  }
  /* The send actions act on the selection, or on `only` (one custodian, from custodian coverage's section menus,
     decision 80g: the same menus for one person as for a selection). Only a toolbar send clears the selection. */
  function sendNotice(lhId, only) {
    var h = M.legalHolds.filter(function (x) { return x.id === lhId; })[0];
    var newId = nextHoldId();
    M.legalHolds.push({ id: newId, title: "Legal hold notification · settings from " + lhId, sent: TODAY, time: "10:05", settings: h.settings, survey: h.survey });
    var sent = 0;
    (only || selectedList()).forEach(function (c) {
      c.lhn = c.lhn || [];
      c.lhn.push({ id: newId, status: "Sent", sentOn: TODAY, events: [[TODAY, "10:05", "Notification (settings from " + lhId + ")", "CaseFusion · email and Teams", "Sent"]] });
      if (h.survey && !(c.surveys || []).some(function (sv) { return sv.id === h.survey; })) {
        c.surveys.push({ id: h.survey, status: "Sent", due: "2026-10-22", events: [[TODAY, "10:05", "Survey (attached to " + lhId + ")", me(), "Sent"]] });
      }
      sent++;
    });
    if (!only) selected = {};
    D.toast("New legal hold notification " + newId + " sent to " + sent + " custodian" + (sent === 1 ? "" : "s") + " with " + lhId + "'s settings.");
    render();
  }
  function addSilent(lhId, only) {
    var n = 0;
    (only || selectedList()).forEach(function (c) {
      if ((c.lhn || []).some(function (x) { return x.id === lhId; })) return;
      c.lhn.push({ id: lhId, status: "Silent", events: [[TODAY, "10:05", "Added to the silent legal hold", me(), "Tracked"]] });
      n++;
    });
    if (!only) selected = {};
    D.toast(n + " added to silent legal hold " + lhId + ". Nothing was sent.");
    render();
  }
  function sendSurvey(sId, only) {
    var n = 0;
    (only || selectedList()).forEach(function (c) {
      if ((c.surveys || []).some(function (sv) { return sv.id === sId && sv.status !== "Answered"; })) return;
      c.surveys.push({ id: sId, status: "Sent", due: "2026-10-22", events: [[TODAY, "10:05", "Survey", me(), "Sent"]] });
      n++;
    });
    if (!only) selected = {};
    D.toast("Survey " + sId + " sent to " + n + " custodian" + (n === 1 ? "" : "s") + ".");
    render();
  }
  /* From the toolbar: the selection, workflow chosen in the dialog. From custodian coverage: `only` that custodian,
     with the section's workflow preselected (wf). */
  function markNotRequired(only, wf0) {
    var list = only || selectedList();
    D.reasonDialog({
      title: "Mark Not Required",
      intro: list.length + " custodian" + (list.length === 1 ? "" : "s") + " selected.",
      /* One custodian: name the record the dialog acts on (demo-kv; Scott, 10-14). Several: the count above says it. */
      extra: (list.length === 1 ? '<dl class="row demo-kv mb-3"><dt class="col-4 fw-bold">Custodian</dt><dd class="col-8 mb-0' + (seen(list[0]) ? "" : " demo-masked") + '">' +
        (seen(list[0]) ? "" : '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>') + esc(visibleName(list[0])) + "</dd></dl>" : "") + D.select("cvNrWf", [["survey", "Survey"], ["interview", "Interview"], ["preservation", "Preservation"]], wf0 || "survey", "Workflow", { container: "{{modal}}", cls: "mb-3" }),
      effect: "The workflow reads N/A, leaves the gap count, and shows in the coverage report with this reason.",
      confirm: "MARK NOT REQUIRED"
    }).then(function (r) {
      if (!r) return;
      var wf = r.dialog.querySelector("#cvNrWf").value;
      list.forEach(function (c) {
        if (wf === "preservation") { c.notRequired = c.notRequired || {}; c.notRequired.preservation = r.reason; }
        else { c.notRequiredWf = c.notRequiredWf || {}; c.notRequiredWf[wf] = r.reason; }
      });
      if (!only) selected = {};
      D.toast(wf.charAt(0).toUpperCase() + wf.slice(1) + " marked not required for " + list.length + ".");
      render();
    });
  }

  /* ── Release from legal hold (PRD 08 §7.3) in a Nimbus modal ───────── */
  function sourcesStill(c) {
    var src = M.sourcesOf(c.personId).filter(function (s) { return s.hold === "Applied" || s.hold === "Attested" || s.hold === "Applying" || s.hold === "Overdue"; });
    var kinds = src.map(function (s) {
      return { "Exchange Online": s.note ? "inactive mailbox" : "mailbox", "OneDrive": "OneDrive", "Copilot interactions": "Copilot", "Laptop": "laptop", "Mobile device": "mobile" }[s.type] || s.type;
    });
    var reqs = {};
    src.forEach(function (s) { if (s.request) reqs[s.request] = true; });
    if (c.notRequired && c.notRequired.preservation) return { n: 1, kinds: ["mailbox (on MBP-0811)"], from: "PRS-0088" };
    return { n: src.length, kinds: kinds, from: Object.keys(reqs).join(", ") || "—" };
  }
  function openRelease(startIds) {
    var chip = "selected", ticked = {}, reason = "", notice = "standard";
    var candidates = function () {
      if (chip === "all") return custodians;
      if (chip === "departed") return custodians.filter(function (c) { return person(c).departed; });
      return custodians.filter(function (c) { return startIds.indexOf(c.personId) !== -1; });
    };
    var tickDefault = function () { ticked = {}; candidates().forEach(function (c) { if (releasable(c)) ticked[c.personId] = true; }); };
    tickDefault();
    /* Only a Case Administrator may release (PRD 08 CV72). A Case User sees the same dialog read-only: the selection,
       the holds, what stays preserved and the exclusions, with every control disabled and the reason stated. */
    var readOnly = !D.hasRole("Case Administrator");
    var m = D.modal({ title: "Release from legal hold", size: "xl", body: "", footer: " " });
    m.el.classList.add("cv-scope");  /* page type rules (12px .small) reach this modal (Scott, 10-14) */
    var tbl = function (head, body) { return '<div class="table-responsive mb-3"><table class="table align-middle mb-0"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>"; };
    function draw() {
      var list = candidates();
      var on = list.filter(function (c) { return ticked[c.personId]; });
      var notified = on.filter(function (c) { return (c.lhn || []).some(function (n) { return n.status !== "Silent"; }); });
      var silentOnly = on.filter(function (c) { return !(c.lhn || []).some(function (n) { return n.status !== "Silent"; }) && (c.lhn || []).length; });
      var left = list.filter(function (c) { return M.heldElsewhere[c.personId]; });
      var holds = on.reduce(function (n, c) { return n + (c.lhn || []).length; }, 0);
      m.el.querySelector(".modal-title").textContent = "Release from legal hold · " + on.length + " custodian" + (on.length === 1 ? "" : "s");
      m.el.querySelector(".modal-body").innerHTML =
        '<div class="d-flex align-items-center flex-wrap gap-2 mb-2"><ul class="nav nav-pills nav-pills-nimbus nav-pills-casefusion" role="group" aria-label="Who to show">' +
          [["all", "All on This Case", custodians.length], ["selected", "Selected on Coverage", startIds.length], ["departed", "Departed", custodians.filter(function (c) { return person(c).departed; }).length]].map(function (x) {
            return '<li class="nav-item"><button type="button" class="nav-link' + (chip === x[0] ? " active" : "") + '" data-chip="' + x[0] + '" aria-pressed="' + (chip === x[0]) + '">' + x[1] + ' <span class="nav-pill-badge">' + x[2] + "</span></button></li>"; }).join("") +
          '</ul><span class="ms-auto"><button type="button" class="btn btn-tertiary btn-sm" data-rel="all"' + (readOnly ? " disabled" : "") + '>SELECT ALL</button><button type="button" class="btn btn-tertiary btn-sm" data-rel="none"' + (readOnly ? " disabled" : "") + ">CLEAR</button></span></div>" +
        tbl(["", "Custodian", "Legal Holds", "After Release"], list.map(function (c) {
          var p = person(c), held = M.heldElsewhere[c.personId], st = sourcesStill(c);
          var holdsText = (c.lhn || []).map(function (n) { return n.id + (n.status === "Silent" ? " · silent legal hold" : n.status === "Acknowledged" ? " · acknowledged " + short(n.on) : " · " + n.status.toLowerCase()); }).join(", ") || "None sent";
          var warn = function (t) { return '<span class="d-block small text-warning-emphasis">' + t + "</span>"; };
          /* The other case is named only when the viewer can open it; otherwise it is a hold and nothing more (CV64). */
          var after = held ? (D.canOpenCase(held.caseId) ? "Still on hold for " + esc(held.caseName) + warn("Held on another accessible case") : "Still on hold on another case" + warn("Held on another case")) : c.released ? "Already released" :
            !(c.lhn || []).length ? "Not on a legal hold" + '<span class="d-block small text-muted">Nothing to release</span>' :
            st.n + " source" + (st.n === 1 ? " stays" : "s stay") + " preserved" + (p.departed && !c.notRequired ? warn("Mailbox stays inactive and preserved while any hold remains") : "") +
            (c.silent ? warn("Nothing was sent, so no release notice is sent") : "");
          return '<tr><td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + c.personId + '"' + (ticked[c.personId] ? " checked" : "") + (releasable(c) && !readOnly ? "" : " disabled") +
            ' aria-label="Release ' + esc(D.nameFor(p)) + '" /></div></td><td><span class="fw-bold' + (D.canSee(p) ? "" : " demo-masked") + '">' + esc(D.nameFor(p)) + '</span><span class="d-block small text-muted">' +
            (D.canSee(p) ? esc(p.title) + (p.departed ? " · departed" : "") : "Outside your regions") + "</span></td><td>" + esc(holdsText) + "</td><td>" + after + "</td></tr>";
        }).join("")) +
        '<p class="small text-muted">' + on.length + " selected · " + holds + " legal hold" + (holds === 1 ? "" : "s") + (left.length ? " · " + left.length + " custodian" + (left.length === 1 ? " is" : "s are") + " held on another case and " + (left.length === 1 ? "is" : "are") + " left out." : ".") + "</p>" +
        '<div class="cf-category cf-cat-6 highlight-casefusion">Release Notice</div>' +
        '<div class="row g-3 mb-3"><div class="col-md-6">' + D.select("cvRelNotice", [["standard", "Standard Release Notice"], ["retention", "Release Notice with Retention Reminder"], ["none", "No Notice"]], notice, "Notice", { container: "#" + m.id }) +
          '</div><div class="col-md-6 small text-muted">Send to the ' + notified.length + " custodian" + (notified.length === 1 ? " who was" : "s who were") + " notified." +
          (silentOnly.length ? "<br>" + esc(silentOnly.map(function (c) { return D.nameFor(person(c)); }).join(", ")) + " " + (silentOnly.length === 1 ? "is" : "are") + " on a silent legal hold and receive" + (silentOnly.length === 1 ? "s" : "") + " nothing." : "") + "</div></div>" +
        '<div class="cf-input-field cf-input-field-casefusion mb-3"><label class="cf-input-label" for="cvRelReason">Reason <span class="cf-input-required">*</span></label>' +
          '<div class="cf-input-wrapper"><input type="text" id="cvRelReason" class="cf-input-control" value="' + esc(reason) + '"' + (readOnly ? " disabled" : "") + " /></div>" +
          '<div class="cf-input-helper"><span class="cf-input-helper-text">Say why. The reason is kept with the case.</span></div></div>' +
        '<div class="cf-category cf-cat-6 highlight-casefusion">What Stays Preserved</div>' +
        '<p>Releasing a custodian from the legal hold does not release their sources or delete collected data.</p>' +
        tbl(["Custodian", "Sources Still Preserved", "From"], on.map(function (c) { var st = sourcesStill(c); return "<tr><td>" + esc(D.nameFor(person(c))) + "</td><td>" + st.n + " · " + esc(st.kinds.join(", ")) + "</td><td>" + esc(st.from) + "</td></tr>"; }).join("")) +
        '<p class="mb-0">Non-custodial sources they use (Box folder, Webex space, Teams teams) belong to the case and stay. 1 collection request is still open: COL-0142.</p>';
      var ok = on.length && reason.trim() && !readOnly;
      m.el.querySelector(".modal-footer").innerHTML = (readOnly ?
          '<span class="small cv-meta cv-footer-note text-warning-emphasis fw-bold">Read only: only a Case Administrator can release custodians from a legal hold.</span>' :
          '<span class="small text-muted cv-meta cv-footer-note">The cleanup request opens with these custodians\' sources selected and the reason Custodian released from legal hold.</span>') +
        '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">' + (readOnly ? "CLOSE" : "CANCEL") + "</button>" +
        '<button type="button" class="btn btn-secondary" data-rel="release"' + (ok ? "" : " disabled") + ">RELEASE ONLY</button>" +
        '<button type="button" class="btn btn-primary" data-rel="cleanup"' + (ok ? "" : " disabled") + ">RELEASE AND CREATE CLEANUP REQUEST</button>";
      if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(m.el);
      if (readOnly) { var ns = m.el.querySelector("#cvRelNotice"); var inst = ns && window.Nimbus && Nimbus.Select && Nimbus.Select.getInstance(ns); if (inst && inst.disable) inst.disable(); else if (ns) ns.disabled = true; }
    }
    m.el.addEventListener("input", function (e) {
      if (e.target.id !== "cvRelReason") return;
      reason = e.target.value;
      var ok = reason.trim() && candidates().some(function (c) { return ticked[c.personId]; });
      m.el.querySelectorAll('[data-rel="release"], [data-rel="cleanup"]').forEach(function (b) { b.disabled = !ok; });
    });
    function onChange(e) {
      var pid = e.target.getAttribute && e.target.getAttribute("data-tick");
      if (pid) { ticked[pid] = e.target.checked; draw(); }
      if (e.target.id === "cvRelNotice") notice = e.target.value;
    }
    m.el.addEventListener("change", onChange);
    m.el.addEventListener("valueChanged.cnds.select", onChange);
    m.el.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      if (t.hasAttribute("data-chip")) { chip = t.getAttribute("data-chip"); tickDefault(); draw(); return; }
      var a = t.getAttribute("data-rel");
      if (a === "all") { tickDefault(); draw(); }
      if (a === "none") { ticked = {}; draw(); }
      if (a === "release" || a === "cleanup") {
        var on = candidates().filter(function (c) { return ticked[c.personId]; });
        on.forEach(function (c) { c.released = TODAY; });
        selected = {};
        m.hide();
        if (a === "cleanup") { window.location.href = "not-in-demo.html?what=Data+cleanup+request"; return; }
        D.toast(on.length + " custodian" + (on.length === 1 ? "" : "s") + " released from legal hold. Their sources stay preserved.");
        render();
      }
    });
    draw();
  }

  /* ── Custodian coverage (PRD 08 §7.2, CustodianCoverage.dc.html) in a Nimbus offcanvas at 90% (a list). ──
     Header: photo, name, the standing summary as chips (CV40), VIEW PROFILE and EXPORT AS for this custodian (CV47).
     Summary strip: the grid row restated, the sections' contents page. Then the five workflows as drawer cards (the
     house .card-drawer, as My Work), open by default; a drawer the reader shuts
     stays shut from custodian to custodian. Inside: the workflow's instances as cards with their timeline (CV41),
     or a per-source table with its provenance (CV43), then the section's own next steps on a footer row (CV45).
     Follow-on steps (view a notification, record an acknowledgment, schedule an interview) open as stacked
     drawers over the panel (casefusion stacked-offcanvas pattern: BACK closes only the stacked drawer). */
  var panel = null, panelId = null, secShut = {};
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';
  function empty(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }
  function pill(text, tone) { return '<span class="badge badge-pill badge-verbatim badge-' + tone + '">' + esc(text) + "</span>"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  /* Timeline outcome words → badge colour (status colour semantics). */
  var TONE = { Sent: "success", Acknowledged: "success", Answered: "success", Tracked: "secondary", Escalated: "danger", "Not answered": "warning",
    Overdue: "warning", Scheduled: "info", Rescheduled: "info", Complete: "success" };
  /* A timeline (CV41): date · event · actor · outcome, one list row each. Solid row dividers, none under the last. */
  function timeline(events) {
    return '<ul class="list-group list-group-flush cv-tl">' + (events || []).map(function (e) {
      return '<li class="list-group-item"><span class="cv-tl-when">' + esc(M.fmtDateTime(e[0], e[1])) + '</span><span class="cv-tl-what">' + esc(e[2]) +
        '</span><span class="cv-tl-who text-muted">' + esc(e[3]) + "</span>" + pill(e[4], TONE[e[4]] || "light") + "</li>";
    }).join("") + "</ul>";
  }
  /* One workflow instance (a notification, a survey, the interview): reference link, title, status badge and an aside
     at the right (recipients, due date), then its timeline and its own actions, small tertiary, bottom right. */
  function icard(o) {
    return '<div class="card card-basic cv-icard"><div class="card-body">' +
      '<div class="cv-icard-head">' + (o.href ? '<a href="' + o.href + '" class="fw-bold">' + esc(o.id) + "</a>" : '<span class="fw-bold">' + esc(o.id) + "</span>") +
        '<span class="cv-icard-title">' + esc(o.title) + "</span>" + o.badge + '<span class="cv-meta text-muted ms-auto">' + esc(o.aside || "") + "</span></div>" +
      (o.body || "") + (o.acts ? '<div class="card-actions justify-content-end">' + o.acts + "</div>" : "") + "</div></div>";
  }
  /* A workflow drawer: the house drawer card (Nimbus .card-drawer; demo.css "Drawer card", as My Work and Data map).
     The top row is the category heading, the workflow's one-line state and the chevron; the body is a Nimbus
     .collapse holding the instances, then the section's next steps on a footer row (forward right). */
  function drawer(key, title, summary, body, acts) {
    var open = !secShut[key];
    return '<section class="card card-basic card-drawer demo-drawer cv-drawer" aria-labelledby="cvSecH-' + key + '"><div class="card-body">' +
      '<div class="card-top demo-drawer-top"><h3 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1" id="cvSecH-' + key + '">' + esc(title) + "</h3>" +
        '<span class="cv-meta text-muted cv-sec-sum">' + esc(summary) + "</span>" +
        '<button type="button" class="card-drawer-toggle" data-cv-sec="' + key + '" aria-expanded="' + open + '" aria-controls="cvSec-' + key + '" aria-label="' + (open ? "Collapse " : "Expand ") + esc(title) + '">' +
        '<i class="mdi mdi-chevron-up mdi-24px" aria-hidden="true"></i></button></div>' +
      '<div class="collapse card-drawer-body' + (open ? " show" : "") + '" id="cvSec-' + key + '">' + body +
        (acts ? '<div class="cv-sec-actions">' + acts + "</div>" : "") + "</div></div></section>";
  }
  function btn(label, attrs, cls) { return '<button type="button" class="btn ' + (cls || "btn-tertiary") + ' btn-sm" ' + attrs + ">" + label + "</button>"; }
  function link(label, href, cls) { return '<a class="btn ' + (cls || "btn-tertiary") + ' btn-sm" href="' + href + '">' + label + "</a>"; }
  /* Disabled, never hidden, with the reason on hover (house rule). */
  function off(label, why, cls) { return '<span title="' + esc(why) + '">' + btn(label, "disabled", cls) + "</span>"; }
  /* A section's send menu: the same items as the selection toolbar's (decision 80g), aimed at this one custodian. */
  function sendMenu(label, items) {
    return '<div class="dropdown dropup"><button type="button" class="btn btn-secondary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">' + label +
      ' <i class="mdi mdi-chevron-up" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end" role="menu">' + items + "</ul></div>";
  }
  function notExpected(what) { return '<p class="cv-meta text-muted mb-0">' + what + " are expected only where the case says so.</p>"; }
  var EXPECT_WHY = "Not expected on this case, so there is nothing to mark not required.";

  function lhnDrawer(c) {
    var pid = c.personId, notices = (c.lhn || []).filter(function (n) { return n.status !== "Silent"; });
    var unack = notices.filter(function (n) { return n.status !== "Acknowledged"; }).length;
    var esc8 = null;
    notices.forEach(function (n) { (n.events || []).forEach(function (e) { if (e[4] === "Escalated") esc8 = e[0]; }); });
    var silentN = (c.lhn || []).length - notices.length;
    var sum = (c.lhn || []).length ? [notices.length ? plural(notices.length, "notification") : "", unack ? unack + " not acknowledged" : "", esc8 ? "escalated " + short(esc8) : "",
      silentN ? "In " + plural(silentN, "silent legal hold") : ""].filter(Boolean).join(" · ") : "None sent";
    var cards = (c.lhn || []).map(function (n) {
      var h = M.legalHolds.filter(function (x) { return x.id === n.id; })[0] || { title: "" };
      var to = custodians.filter(function (x) { return (x.lhn || []).some(function (y) { return y.id === n.id; }); }).length;
      var silent = n.status === "Silent";
      var badge = silent ? pill("Silent legal hold", "secondary") : n.status === "Acknowledged" ? pill("Acknowledged", "success") :
        n.status === "Sent" ? pill("Sent", "info") : pill("Not acknowledged", "danger");
      var acts = silent ? btn("VIEW LEGAL HOLD", 'data-cv-view-lh="' + n.id + '"') + link("REMOVE FROM LEGAL HOLD", "not-in-demo.html?what=Remove+from+legal+hold&amp;ships=1") :
        n.status === "Acknowledged" ? btn("VIEW NOTIFICATION", 'data-cv-view-lh="' + n.id + '"') :
        btn("SEND REMINDER", 'data-cv-remind="' + n.id + '"') + btn("RESEND NOTIFICATION", 'data-cv-resend="' + n.id + '"') + btn("RECORD ACKNOWLEDGMENT", 'data-cv-ack="' + n.id + '"');
      return icard({ id: n.id, href: "not-in-demo.html?what=Legal+hold+" + n.id + "&amp;ships=1", title: h.title, badge: badge,
        aside: silent ? "Nothing sent to the custodian" : "Sent to " + plural(to, "custodian"), body: timeline(n.events), acts: acts });
    }).join("") || empty("No legal hold notification", "No legal hold notification has been sent to this custodian.");
    var regular = M.legalHolds.filter(function (h) { return !h.silent; }), silentHolds = M.legalHolds.filter(function (h) { return h.silent; });
    var menu = item("", "New Legal Hold Notification…", "Opens the notification form with this custodian as the recipient", "not-in-demo.html?what=New+legal+hold+notification&amp;ships=1") +
      '<li><h6 class="dropdown-header">Settings from a notification in this case</h6></li>' +
      regular.map(function (h) { return item('data-send-lhn="' + h.id + '" data-one="' + pid + '"', h.id + " · " + h.title.split(" · ")[0], h.settings); }).join("") +
      '<li><h6 class="dropdown-header">Silent legal hold · nothing is sent</h6></li>' +
      silentHolds.map(function (h) {
        var on = (c.lhn || []).some(function (x) { return x.id === h.id; });
        return on ? '<li><span class="dropdown-item disabled" aria-disabled="true">' + esc(h.id + " · " + h.title) + '<span class="d-block small text-muted">Already tracked</span></span></li>' :
          item('data-send-silent="' + h.id + '" data-one="' + pid + '"', h.id + " · " + h.title, "Track this custodian; nothing is sent");
      }).join("");
    var release = releasable(c) ? btn("RELEASE FROM LEGAL HOLD", 'data-cv="panel-release"', "btn-secondary") :
      off("RELEASE FROM LEGAL HOLD", c.released ? "Already released." : "Not on a legal hold: nothing to release.", "btn-secondary");
    return drawer("lhn", "Legal Hold Notification", sum, cards, sendMenu("SEND LEGAL HOLD NOTIFICATION", menu) + release);
  }

  function surveyDrawer(c, v) {
    var pid = c.personId, sv = c.surveys || [];
    var na = c.notRequiredWf && c.notRequiredWf.survey, dash = v.survey.state === "dash";
    var answered = sv.filter(function (x) { return x.status === "Answered"; }).length, late = sv.filter(function (x) { return x.status === "Escalated" || x.status === "Not answered"; }).length;
    var sum = na ? "Not required" : !sv.length ? (dash ? "Not expected on this case" : "None sent") :
      [plural(sv.length, "survey"), answered + " answered", late ? late + " overdue" : ""].filter(Boolean).join(" · ");
    var cards = sv.map(function (x) {
      var def = M.surveys.filter(function (d) { return d.id === x.id; })[0];
      var done = x.status === "Answered";
      var reported = (x.events || []).some(function (e) { return /reported/.test(e[2]); });
      var badge = done ? pill("Answered", "success") : x.status === "Sent" ? pill("Sent", "info") : pill(x.status === "Escalated" ? "Not answered" : x.status, "danger");
      var acts = done ? link("VIEW ANSWERS", "not-in-demo.html?what=Survey+answers&amp;ships=1") + (reported ? link("ADD REPORTED LOCATION", "case-add-sources.html") : "") :
        btn("SEND REMINDER", 'data-cv-remind="' + x.id + '"') + link("VIEW SURVEY", "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1") + btn("MARK NOT REQUIRED", 'data-cv-nr="survey"');
      return icard({ id: x.id, href: "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1", title: def.title + " · " + def.questions + " questions", badge: badge,
        aside: done ? "Answered " + short(x.on) : "Due " + short(x.due || def.due), body: timeline(x.events), acts: acts });
    }).join("");
    var body = na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" : !sv.length ? (dash ? notExpected("Surveys") : empty("No survey sent", "No survey has been sent to this custodian.")) :
      cards + '<p class="cv-meta text-muted mt-2 mb-0">Locations named in survey answers are added as reported locations for review.</p>';
    var menu = item("", "New Survey…", "Opens the survey form with this custodian", "not-in-demo.html?what=New+survey&amp;ships=1") +
      '<li><h6 class="dropdown-header">Questions and reminders from a survey in this case</h6></li>' +
      M.surveys.map(function (d) { return item('data-send-survey="' + d.id + '" data-one="' + pid + '"', d.id + " · " + d.title, d.questions + " questions"); }).join("");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : dash && !sv.length ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="survey"', "btn-secondary");
    return drawer("survey", "Survey", sum, body, sendMenu("SEND SURVEY", menu) + nr);
  }

  /* Interview (CV42–CV42c): states the fact and does not advise. SCHEDULE is open on every custodian (CV42aa);
     a booked interview offers MARK COMPLETE and RESCHEDULE, and both dates stay in its history (CV42b). */
  function interviewDrawer(c, v) {
    var iv = c.interview, na = c.notRequiredWf && c.notRequiredWf.interview;
    var sum = na ? "Not required" : !iv ? "Not expected on this case" : iv.status === "Complete" ? "Complete " + short(iv.completed) : "Scheduled " + short(iv.date);
    var body = na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" : !iv ? notExpected("Interviews") :
      icard({ id: "Interview", title: "with " + iv.with + " · " + iv.where, badge: iv.status === "Complete" ? pill("Complete", "success") : pill("Scheduled", "info"),
        aside: iv.status === "Complete" ? "Completed " + short(iv.completed) : M.fmtDateTime(iv.date, iv.time), body: timeline(iv.events),
        acts: iv.status === "Complete" ? "" : btn("RESCHEDULE", "data-cv-schedule") + btn("MARK COMPLETE", "data-cv-iv-done") });
    var sched = iv && iv.status !== "Complete" ? off("SCHEDULE", "An interview is already scheduled: use RESCHEDULE.", "btn-secondary") : btn("SCHEDULE", "data-cv-schedule", "btn-secondary");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : !iv ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="interview"', "btn-secondary");
    return drawer("interview", "Interview", sum, body, sched + nr);
  }

  /* Preservation: one row per source, STATUS with its qualifier, FROM the provenance (request · mechanism, CV43).
     A location reported in a survey but not added yet shows as such and counts in neither number (CV44). */
  function preservationDrawer(c, v) {
    var src = M.sourcesOf(c.personId), rep = c.reported || [];
    var sum = v.preservation.state === "na" ? "Not required" : v.preservation.text.replace(" on hold", " sources on hold") + (rep.length ? " · " + rep.length + " reported, not added" : "");
    var hs = ' · see <a href="case-hold-status.html">Hold status</a>';
    var rows = src.map(function (s) {
      var status = s.pending ? pill("Not requested", "warning") + (s.priorWork ? '<span class="d-block small text-info-emphasis">' + esc(s.priorWork.what + " on " + s.priorWork.caseId + " · " + s.priorWork.request) + "</span>" : "") :
        pill(s.hold, s.hold === "Applied" ? "success" : s.hold === "Attested" ? "info" : s.hold === "Applying" ? "warning" : "danger") +
        (s.hold === "Not applied" ? '<span class="d-block small text-warning-emphasis">Removed from the Purview hold ' + esc(short(s.exception.since)) + hs + "</span>" : "") +
        (s.hold === "Overdue" ? '<span class="d-block small text-warning-emphasis">Attestation overdue' + hs + "</span>" : "") +
        (s.hold === "Applying" ? '<span class="d-block small text-warning-emphasis">Applying since ' + esc(short(s.exception.since)) + hs + "</span>" : "");
      return '<tr><td><span class="fw-bold">' + esc(M.typeLabel(s.type)) + '</span><span class="d-block small text-muted">' + esc(s.name) + "</span></td><td>" + status + "</td><td>" +
        (s.pending ? '<span class="text-muted">—</span>' : reqLink(s.request) + " · " + (s.evidence === "attested" ? "attested" : "Purview")) + "</td></tr>";
    }).concat(rep.map(function (r) {
      return '<tr><td><span class="fw-bold">' + esc(r.what) + '</span><span class="d-block small text-muted">Reported in ' + esc(r.from) + " · not yet added</span></td><td>" +
        pill("Not held", "warning") + '<span class="d-block small text-warning-emphasis">' + esc(r.kind + " · " + r.status) + '</span></td><td><span class="text-muted">—</span></td></tr>';
    })).join("");
    var body = v.preservation.state === "na" ? '<p class="cv-meta mb-0">Not required: ' + esc(c.notRequired.preservation) + "</p>" :
      '<div class="table-responsive"><table class="table align-middle mb-0 cv-src"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    return drawer("preservation", "Preservation", sum, body,
      link("ADD TO PRESERVATION REQUEST", "case-new-preservation.html?custodians=" + c.personId, "btn-secondary") + link("OPEN HOLD STATUS", "case-hold-status.html", "btn-secondary"));
  }

  function collectionDrawer(c, v) {
    var col = c.collection, dash = v.collection.state === "dash";
    var tone = { Collected: "success", Failed: "danger", Retrying: "warning", "Not started": "secondary", "In progress": "info" };
    var items = (col && col.items) || [];
    var failed = items.some(function (x) { return x.status === "Failed"; });
    var body = dash ? notExpected("Collections") :
      '<div class="table-responsive"><table class="table align-middle mb-0 cv-src"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' +
      items.map(function (x) {
        var s = M.sources.filter(function (y) { return y.id === x.source; })[0];
        return '<tr><td><span class="fw-bold">' + esc(M.typeLabel(s.type)) + '</span><span class="d-block small text-muted">' + esc(s.name) + "</span></td><td>" + pill(x.status, tone[x.status] || "light") +
          "</td><td>" + esc(x.from) + " · " + esc(x.note) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return drawer("collection", "Collection", dash ? "Not expected on this case" : v.collection.text, body,
      link("ADD TO COLLECTION REQUEST", "not-in-demo.html?what=Collection+request", "btn-secondary") +
      (failed ? link("VIEW FAILURES", "not-in-demo.html?what=Collection+failures", "btn-secondary") : off("VIEW FAILURES", "No collection from this custodian has failed.", "btn-secondary")));
  }

  function renderPanel() {
    var c = byPid(panelId), p = person(c), v = cov(c), ok = seen(c);
    var keep = panel.el.querySelector(".offcanvas-body"), top = keep ? keep.scrollTop : 0;
    /* Summary strip: one card, the five workflows divided by blurry rules, each a label over its state. */
    var strip = '<div class="card card-basic cv-strip mb-3"><div class="card-body">' + [["Legal Hold Notification", v.lhn], ["Survey", v.survey], ["Interview", v.interview], ["Preservation", v.preservation], ["Collection", v.collection]].map(function (x) {
      return '<div class="cv-strip-item"><span class="demo-label mb-0">' + x[0] + '</span><span class="cv-value">' + esc(x[1].text) + "</span>" +
        '<span class="cv-meta text-muted">' + esc(x[1].state === "dash" ? "Not expected" : x[1].detail || "") + "</span></div>";
    }).join('<div class="vr vr-blurry" aria-hidden="true"></div>') + "</div></div>";
    if (!ok) {
      /* The monogram carries the lock (no photo: a photo is a profile detail), sized as the 42px photo avatar, so the name line does not repeat it; normal style, no italics (Scott, 10-14). */
      panel.setBody('<div class="cv-scope"><div class="d-flex align-items-center gap-3 mb-3"><span class="monogram demo-avatar">' + LOCK + '</span><div><div class="h5 mb-0 demo-masked">Profile details limited</div>' +
        '<div class="cv-meta text-muted">This custodian is outside your regions. Their coverage counts on this case; their details are visible to the case team in their region.</div></div></div>' + strip + "</div>");
      return;
    }
    /* The standing summary (CV40): where this person stands, as chips. */
    var notices = (c.lhn || []).filter(function (n) { return n.status !== "Silent"; });
    var unack = notices.filter(function (n) { return n.status !== "Acknowledged"; }).length, silentN = (c.lhn || []).length - notices.length;
    var need = ["lhn", "survey", "interview", "preservation", "collection"].filter(function (k) { return v[k].state === "action"; }).length;
    var PT = { done: "success", progress: "info", action: "danger", na: "light", todo: "warning", silent: "secondary", dash: "light" };
    var chips = [pill("Custodian", "info"),
      v.preservation.state === "na" ? pill("Preservation not required", "light") : pill(v.preservation.text.replace(" on hold", " sources on hold"), PT[v.preservation.state]),
      unack ? pill(plural(unack, "notification") + " not acknowledged", "danger") : "", silentN ? pill("In " + plural(silentN, "silent legal hold"), "secondary") : "",
      need ? pill(plural(need, "workflow") + " need" + (need === 1 ? "s" : "") + " attention", "warning") : "",
      c.released ? pill("Released " + short(c.released), "success") : ""].filter(Boolean);
    panel.setBody('<div class="cv-scope">' +
      '<div class="d-flex align-items-start gap-3 mb-3">' + D.avatar(p) + '<div class="flex-grow-1"><div class="h5 mb-0">' + esc(p.name) + "</div>" +
        '<div class="cv-meta text-muted">' + esc(p.title + " · " + p.upn + "@" + M.tenant.domain + " · added to the case " + short(c.added)) + (p.departed ? " · departed " + esc(M.fmtDate(p.departed)) : "") + "</div>" +
        '<div class="d-flex flex-wrap gap-2 mt-2">' + chips.join("") + "</div></div>" +
        '<div class="d-flex gap-2 flex-shrink-0">' + link("VIEW PROFILE", "not-in-demo.html?what=Persona+Case+Profile&amp;ships=1", "btn-secondary") +
          /* EXPORT COVERAGE from here exports this custodian (CV47), in the CaseFusion Export As pattern. */
          '<div class="dropdown"><button type="button" class="btn btn-secondary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">Export As <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>' +
          '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end demo-menu-hug" role="menu"><li role="none"><button type="button" class="dropdown-item" role="menuitem" data-cv="export-one">CSV</button></li>' +
          '<li role="none"><a class="dropdown-item" role="menuitem" href="not-in-demo.html?what=Custodian+coverage+(PDF)">PDF</a></li></ul></div></div></div>' +
      strip + '<div class="cv-drawers">' + lhnDrawer(c) + surveyDrawer(c, v) + interviewDrawer(c, v) + preservationDrawer(c, v) + collectionDrawer(c, v) + "</div></div>");
    if (keep) keep.scrollTop = top;
  }
  function openPanel(pid) {
    panelId = pid;
    if (!panel) {
      panel = D.offcanvas({ title: "Custodian coverage", width: "90vw", body: "",
        /* Previous and next are equal actions, so both are secondary: no primary in this footer (Scott, 10-14). */
        footer: '<button type="button" class="btn btn-secondary" data-cv="panel-prev">PREVIOUS CUSTODIAN</button><button type="button" class="btn btn-secondary" data-cv="panel-next">NEXT CUSTODIAN</button>',
        onHidden: function () { panel = null; panelId = null; } });
    }
    renderPanel();
    var b = panel.el.querySelector(".offcanvas-body"); if (b) b.scrollTop = 0;
  }
  function stepPanel(dir) {
    var list = custodians.filter(matches);
    if (!list.length) return;
    var i = list.map(function (c) { return c.personId; }).indexOf(panelId);
    openPanel(list[(i + dir + list.length) % list.length].personId);
  }
  /* A drawer opens or shuts with Nimbus Collapse (the shell keeps the chevron's label in step); the choice holds for
     the next custodian. */
  function toggleSection(btnEl) {
    var k = btnEl.getAttribute("data-cv-sec"), el = document.getElementById("cvSec-" + k);
    secShut[k] = !secShut[k];
    btnEl.setAttribute("aria-expanded", String(!secShut[k]));
    if (window.Nimbus && Nimbus.Collapse) Nimbus.Collapse.getOrCreateInstance(el, { toggle: false })[secShut[k] ? "hide" : "show"]();
    else el.classList.toggle("show", !secShut[k]);
  }

  /* ── Panel actions ──────────────────────────────────────────────────── */
  function nowTime() { return "10:05"; }  /* the demo's clock: every action happens at 10:05 on M.DEMO_TODAY */
  function instance(c, id) {
    return (c.lhn || []).filter(function (n) { return n.id === id; })[0] || (c.surveys || []).filter(function (s) { return s.id === id; })[0];
  }
  function remind(c, id) {
    var x = instance(c, id), n = (x.events || []).filter(function (e) { return /^Reminder/.test(e[2]); }).length + 1;
    x.events.push([TODAY, nowTime(), "Reminder " + n, me(), "Sent"]);
    D.toast("Reminder " + n + " sent for " + id + ".");
    render();
  }
  function resend(c, id) {
    instance(c, id).events.push([TODAY, nowTime(), "Notification resent", me(), "Sent"]);
    D.toast("Legal hold notification " + id + " sent again to " + person(c).name + ".");
    render();
  }
  /* Stacked drawer: the notification or legal hold, read-only. 50%: a detail with a recipient list. */
  function viewHold(id) {
    var h = M.legalHolds.filter(function (x) { return x.id === id; })[0];
    var on = custodians.filter(function (c) { return (c.lhn || []).some(function (n) { return n.id === id; }); });
    var kv = function (k, val) { return '<dt class="col-4 fw-bold">' + k + '</dt><dd class="col-8">' + val + "</dd>"; };
    D.offcanvas({ title: id + " · " + h.title, width: "50vw",
      body: '<div class="cv-scope"><dl class="row demo-kv mb-3">' +
        kv("Type", h.silent ? "Silent legal hold · nothing is sent" : "Legal hold notification") + kv(h.silent ? "Started" : "Sent", esc(M.fmtDateTime(h.sent, h.time))) +
        (h.settings ? kv("Settings", esc(h.settings)) : "") + (h.survey ? kv("Survey", esc(h.survey)) : "") + kv(h.silent ? "Tracked" : "Recipients", plural(on.length, "custodian")) + "</dl>" +
        '<div class="cf-category cf-cat-6 highlight-casefusion">' + (h.silent ? "Custodians Tracked" : "Recipients") + "</div>" +
        '<ul class="list-group list-group-flush cv-tl">' + on.map(function (c) {
          var n = c.lhn.filter(function (x) { return x.id === id; })[0], p = person(c);
          var st = n.status === "Silent" ? pill("Tracked", "secondary") : n.status === "Acknowledged" ? pill("Acknowledged", "success") : n.status === "Sent" ? pill("Sent", "info") : pill("Not acknowledged", "danger");
          return '<li class="list-group-item cv-tl-2"><span class="' + (seen(c) ? "fw-bold" : "fw-bold demo-masked") + '">' + (seen(c) ? "" : LOCK) + esc(D.nameFor(p)) + "</span>" + st + "</li>";
        }).join("") + "</ul></div>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">BACK</button>' });
  }
  /* Stacked form drawers (50%): BACK closes only this drawer (with the Please Confirm guard when something was
     entered); SAVE records it, closes this drawer and redraws the panel underneath with a toast. */
  function field(id, label, value, help) {
    return '<div class="cf-input-field cf-input-field-casefusion mb-3"><label class="cf-input-label" for="' + id + '">' + label + ' <span class="cf-input-required">*</span></label>' +
      '<div class="cf-input-wrapper"><input type="text" id="' + id + '" class="cf-input-control" value="' + esc(value) + '" /></div>' +
      (help ? '<div class="cf-input-helper"><span class="cf-input-helper-text">' + help + "</span></div>" : "") + "</div>";
  }
  function noteField(id) {
    return '<div class="cf-input-field cf-input-field-casefusion mb-3"><label class="cf-input-label" for="' + id + '">Note</label>' +
      '<div class="cf-input-wrapper"><textarea id="' + id + '" class="cf-input-control" rows="2"></textarea></div>' +
      '<div class="cf-input-helper"><span class="cf-input-helper-text">Optional. One line of context, kept on the event.</span></div></div>';
  }
  function formDrawer(title, intro, fields, onSave) {
    var d = D.offcanvas({ title: title, width: "50vw",
      body: '<div class="cv-scope">' + (intro ? '<p class="mb-3">' + intro + "</p>" : "") + fields + "</div>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">BACK</button><button type="button" class="btn btn-primary" data-cv-save>SAVE</button>' });
    var save = d.el.querySelector("[data-cv-save]");
    var check = function () { save.disabled = [].some.call(d.el.querySelectorAll("input.cf-input-control"), function (f) { return !f.value.trim(); }); };
    d.el.addEventListener("input", check); check();
    save.addEventListener("click", function () { var val = function (id) { var f = d.el.querySelector("#" + id); return f ? f.value.trim() : ""; }; d.hide(); onSave(val); });
    return d;
  }
  function recordAck(c, id) {
    var n = instance(c, id);
    formDrawer("Record acknowledgment · " + id, "For " + esc(person(c).name) + ", who acknowledged outside CaseFusion. It is recorded as acknowledged by them, entered by you.",
      field("cvAckDate", "Date", M.fmtDate(TODAY), "mm-dd-yyyy") + field("cvAckTime", "Time", "9:30 AM") +
      D.select("cvAckHow", [["Email reply", "Email reply"], ["Signed form", "Signed form"], ["Verbal, in a meeting", "Verbal, in a meeting"]], "Email reply", "How", { cls: "mb-3" }) + noteField("cvAckNote"),
      function (val) {
        n.status = "Acknowledged"; n.on = TODAY;
        n.events.push([TODAY, "09:30", "Acknowledged · " + (val("cvAckHow") || "recorded") + " (recorded by " + me() + ")", person(c).name, "Acknowledged"]);
        D.toast("Acknowledgment recorded for " + id + ".");
        render();
      });
  }
  function scheduleInterview(c) {
    var iv = c.interview, re = iv && iv.status !== "Complete";
    var team = M.cases.filter(function (x) { return x.id === D.caseId; })[0].team.map(function (id) { var p = M.person(id); return [p.name, p.name]; });
    formDrawer(re ? "Reschedule interview" : "Schedule interview", "With " + esc(person(c).name) + ". Scheduling does not make the interview expected on this case; the case setting does.",
      field("cvIvDate", "Date", re ? M.fmtDate(iv.date) : "10-22-2026", "mm-dd-yyyy") + field("cvIvTime", "Time", re ? M.fmtTime(iv.time) : "10:00 AM") +
      D.select("cvIvWith", team, re ? iv.with : team[0][0], "Interviewer", { cls: "mb-3" }) +
      D.select("cvIvWhere", [["Teams meeting", "Teams meeting"], ["In person", "In person"], ["Phone", "Phone"]], re ? iv.where : "Teams meeting", "Where", { cls: "mb-3" }) + noteField("cvIvNote"),
      function (val) {
        var p = val("cvIvDate").split("-"), iso = p.length === 3 ? p[2] + "-" + p[0] + "-" + p[1] : "2026-10-22";
        var t = /(\d+):(\d+)\s*(AM|PM)?/i.exec(val("cvIvTime")) || [0, 10, "00", "AM"], hh = (+t[1] % 12) + (/PM/i.test(t[3] || "") ? 12 : 0);
        var hhmm = String(hh).padStart(2, "0") + ":" + t[2];
        if (re) iv.events.push([TODAY, nowTime(), "Rescheduled from " + M.fmtDateTime(iv.date, iv.time) + " to " + M.fmtDateTime(iso, hhmm), me(), "Rescheduled"]);
        else c.interview = iv = { status: "Scheduled", events: [[TODAY, nowTime(), "Scheduled for " + M.fmtDateTime(iso, hhmm), me(), "Scheduled"]] };
        iv.date = iso; iv.time = hhmm; iv.with = val("cvIvWith"); iv.where = val("cvIvWhere");
        D.toast("Interview " + (re ? "rescheduled" : "scheduled") + " for " + M.fmtDateTime(iso, hhmm) + ".");
        render();
      });
  }
  /* MARK COMPLETE (CV42a, new): writes the completion as an event; it is not marking the interview not required (CV42c). */
  function completeInterview(c) {
    c.interview.status = "Complete"; c.interview.completed = TODAY;
    c.interview.events.push([TODAY, nowTime(), "Marked complete", me(), "Complete"]);
    D.toast("Interview marked complete.");
    render();
  }
  function exportOne(c) {
    var v = cov(c), p = person(c);
    var rows = [["Custodian", p.name], ["Title", p.title], []];
    rows.push(["Workflow", "State", "Detail"]);
    [["Legal hold notification", "lhn"], ["Survey", "survey"], ["Interview", "interview"], ["Preservation", "preservation"], ["Collection", "collection"]].forEach(function (x) {
      rows.push([x[0], v[x[1]].text, v[x[1]].detail || (v[x[1]].state === "dash" ? "Not expected on this case" : "")]);
    });
    rows.push([], ["Event", "Date", "Actor", "Outcome"]);
    (c.lhn || []).concat(c.surveys || [], c.interview ? [c.interview] : []).forEach(function (n) {
      (n.events || []).forEach(function (e) { rows.push([(n.id ? n.id + " · " : "Interview · ") + e[2], M.fmtDateTime(e[0], e[1]), e[3], e[4]]); });
    });
    download("coverage-" + D.caseId + "-" + p.upn.replace(/\W+/g, "-") + ".csv", rows);
    D.toast("Exported coverage for " + p.name + ".");
  }

  /* ── Exports ────────────────────────────────────────────────────────── */
  function download(name, rows) {
    var csv = rows.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function exportCoverage(name) {
    var visible = custodians.filter(seen), hiddenN = custodians.length - visible.length;
    var rows = [["Custodian", "Legal hold notification", "Survey", "Interview", "Preservation", "Collection"]];
    visible.forEach(function (c) {
      var v = cov(c);
      rows.push([person(c).name].concat(["lhn", "survey", "interview", "preservation", "collection"].map(function (k) { return v[k].text + (v[k].detail ? " · " + v[k].detail : ""); })));
    });
    rows.push([]);
    rows.push(["This export covers the " + visible.length + " custodians you can see. " + hiddenN + " are outside your regions."]);
    download(name, rows);
    D.toast("Exported " + visible.length + " custodians." + (hiddenN ? " " + hiddenN + " outside your regions are counted, not named." : ""));
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  /* A filter the reader picks clears any card filter. setFilter() below changes the select from code, and Nimbus
     Select fires its change event then too; `syncing` stops that echo from clearing the card the reader just chose. */
  var syncing = false;
  function onFilter() { if (syncing) return; tileFilter = null; page = 1; renderTiles(); view(renderGrid); }
  ["cvFilter", "cvWorkflow"].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener("change", onFilter);
    el.addEventListener("valueChanged.cnds.select", onFilter);
  });
  document.getElementById("cvSearch").addEventListener("input", function () { page = 1; view(renderGrid); });
  /* Pager: arrows turn the page; a new page size returns to page 1. */
  function onPageSize(e) { if (e.target.getAttribute("data-pg-size") === "cv") { pageSize = +e.target.value; page = 1; view(renderGrid); } }
  ["change", "valueChanged.cnds.select"].forEach(function (t) { document.getElementById("cvGridFoot").addEventListener(t, onPageSize); });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.closest && t.closest(".modal")) return;
    if (t.hasAttribute && t.hasAttribute("data-sel")) { selected[t.getAttribute("data-sel")] = t.checked; renderGrid(); return; }
    if (t.id === "cvAll") { custodians.filter(matches).forEach(function (c) { selected[c.personId] = t.checked; }); renderGrid(); }
  });
  function setFilter(v) {
    var el = document.getElementById("cvFilter");
    var inst = window.Nimbus && Nimbus.Select && Nimbus.Select.getInstance(el);
    syncing = true;
    try { if (inst && inst.setValue) inst.setValue(v); else el.value = v; } finally { syncing = false; }
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest(".modal")) return;
    var t = e.target.closest("button, a, [data-cv]");
    if (!t) return;
    if (t.getAttribute("data-pg-for") === "cv") { page = D.turnPage(page, t.getAttribute("data-pg"), custodians.filter(matches).length, pageSize); view(renderGrid); return; }
    if (t.hasAttribute("data-tile")) {
      var k = t.getAttribute("data-tile");
      tileFilter = tileFilter === k || k === "all" ? null : k; page = 1;
      setFilter("all"); renderTiles(); view(renderGrid); return;
    }
    if (t.hasAttribute("data-open")) { e.preventDefault(); openPanel(t.getAttribute("data-open")); return; }
    /* data-one: a send from custodian coverage, for that custodian only. */
    var one = t.getAttribute("data-one") ? [byPid(t.getAttribute("data-one"))] : null;
    if (t.hasAttribute("data-send-lhn")) { sendNotice(t.getAttribute("data-send-lhn"), one); return; }
    if (t.hasAttribute("data-send-silent")) { addSilent(t.getAttribute("data-send-silent"), one); return; }
    if (t.hasAttribute("data-send-survey")) { sendSurvey(t.getAttribute("data-send-survey"), one); return; }
    /* Custodian coverage: drawers, instance actions and the stacked drawers they open. */
    if (t.hasAttribute("data-cv-sec")) { toggleSection(t); return; }
    var pc = panelId && byPid(panelId);
    if (pc) {
      if (t.hasAttribute("data-cv-view-lh")) { viewHold(t.getAttribute("data-cv-view-lh")); return; }
      if (t.hasAttribute("data-cv-remind")) { remind(pc, t.getAttribute("data-cv-remind")); return; }
      if (t.hasAttribute("data-cv-resend")) { resend(pc, t.getAttribute("data-cv-resend")); return; }
      if (t.hasAttribute("data-cv-ack")) { recordAck(pc, t.getAttribute("data-cv-ack")); return; }
      if (t.hasAttribute("data-cv-nr")) { markNotRequired([pc], t.getAttribute("data-cv-nr")); return; }
      if (t.hasAttribute("data-cv-schedule")) { scheduleInterview(pc); return; }
      if (t.hasAttribute("data-cv-iv-done")) { completeInterview(pc); return; }
    }
    if (t.hasAttribute("data-cv-toast")) { D.toast(t.getAttribute("data-cv-toast")); return; }
    var a = t.getAttribute("data-cv");
    if (!a) return;
    if (a === "select-after") { page = 1; selected = {}; afterNoticeUnsent().forEach(function (c) { selected[c.personId] = true; }); tileFilter = null; setFilter("after"); render(); }
    if (a === "review-after") { page = 1; tileFilter = null; setFilter("after"); renderTiles(); view(renderGrid); }
    if (a === "clear") { selected = {}; renderGrid(); }
    if (a === "not-required") markNotRequired(null);
    if (a === "release") openRelease(selectedList().map(function (c) { return c.personId; }));
    if (a === "export") exportCoverage("coverage-" + D.caseId + ".csv");
    if (a === "report-csv") exportCoverage("case-preservation-report-" + D.caseId + ".csv");
    if (a === "export-one" && panelId) exportOne(byPid(panelId));
    if (a === "panel-prev") stepPanel(-1);
    if (a === "panel-next") stepPanel(1);
    if (a === "panel-release") { var pid = panelId; panel.hide(); openRelease([pid]); }
  });

  /* The clear (X) is an icon with role="button": Enter and Space work as a click. */
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute && e.target.getAttribute("data-cv") === "clear") { e.preventDefault(); selected = {}; renderGrid(); }
  });

  render();
}());
