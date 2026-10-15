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
  var BADGE = { done: "badge badge-verbatim badge-success", progress: "badge badge-verbatim badge-info", todo: "badge badge-verbatim badge-warning", action: "badge badge-verbatim badge-danger", silent: "badge badge-verbatim badge-secondary", na: "badge badge-verbatim badge-light" };
  /* A date never breaks across lines: "latest 08-29-" / "2026" read as two things. */
  function keepDates(html) { return html.replace(/(\d{2}-\d{2}-\d{4})/g, '<span class="text-nowrap">$1</span>'); }
  function cell(x, link) {
    if (x.state === "dash") return '<span class="text-muted" title="Not expected on this case">—</span>';
    var pill = '<span class="' + BADGE[x.state] + '">' + esc(x.text) + "</span>";
    if (link) pill = '<a href="' + link + '" title="Open Hold status">' + pill + "</a>";
    return pill + (x.detail ? '<span class="d-block small text-muted mt-1">' + keepDates(esc(x.detail)) + "</span>" : "");
  }

  /* ── Tiles ──────────────────────────────────────────────────────────── */
  function actionSubline(list) {
    var notify = 0, unack = 0, escal = 0, pres = 0;
    list.forEach(function (c) {
      var v = cov(c);
      if (v.lhn.why === "notify") notify++;
      else if (v.lhn.state === "action") unack++;
      else if (v.survey.state === "action") escal++;
      else if (v.preservation.state === "action") pres++;
    });
    var parts = [];
    if (notify) parts.push(notify + " never notified");
    if (unack) parts.push(unack + " not acknowledged");
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
      return '<span class="badge badge-verbatim badge-' + m[1] + '">' + m[0] + "</span>";
    };
    document.getElementById("cvNcBody").innerHTML = rows.map(function (s) {
      var col = M.nonCustodialCollection[s.id];
      return "<tr><td>" + esc(M.typeLabel(s.type) + " · " + s.name) + '</td><td class="text-nowrap">' + (M.usedBy[s.id] || 0) + " custodians</td><td>" + pres(s) + "</td>" +
        "<td>" + (col ? '<span class="badge badge-verbatim badge-info">' + esc(col.text) + "</span>" : '<span class="text-muted">—</span>') + "</td>" +
        '<td class="text-nowrap">' + reqLink(col ? col.request : s.request) + "</td></tr>";
    }).join("");
  }
  /* Counting rules name what this case expects (CV14b), from the case setting the cells read. */
  function renderExpects() {
    var e = M.cases.filter(function (x) { return x.id === D.caseId; })[0].expects;
    document.getElementById("cvExpects").textContent = "On this case: " + [e.survey.rule || e.survey.text, e.interview.rule || e.interview.text, e.collection.rule || e.collection.text].join(" · ") + ".";
  }
  function render() {
    renderBanner(); renderTiles(); renderGrid(); renderNonCustodial(); renderExpects();
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
    var chip = "selected", ticked = {}, reason = "", notice = "standard", sendTo = true;
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
            (c.silent && !(c.lhn || []).some(function (n) { return n.status !== "Silent"; }) ? warn("Nothing was sent, so no release notice is sent") : "");
          return '<tr><td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + c.personId + '"' + (ticked[c.personId] ? " checked" : "") + (releasable(c) && !readOnly ? "" : " disabled") +
            ' aria-label="Release ' + esc(D.nameFor(p)) + '" /></div></td><td><span class="fw-bold' + (D.canSee(p) ? "" : " demo-masked") + '">' + esc(D.nameFor(p)) + '</span><span class="d-block small text-muted">' +
            (D.canSee(p) ? esc(p.title) + (p.departed ? " · departed" : "") : "Outside your regions") + "</span></td><td>" + esc(holdsText) + "</td><td>" + after + "</td></tr>";
        }).join("")) +
        '<p class="small text-muted">' + on.length + " selected · " + holds + " legal hold" + (holds === 1 ? "" : "s") + (left.length ? " · " + left.length + " custodian" + (left.length === 1 ? " is" : "s are") + " held on another case and " + (left.length === 1 ? "is" : "are") + " left out." : ".") + "</p>" +
        '<div class="cf-category cf-cat-6 highlight-casefusion">Release Notice</div>' +
        '<div class="row g-3 mb-3"><div class="col-md-6">' + D.select("cvRelNotice", [["standard", "Standard Release Notice"], ["retention", "Release Notice with Retention Reminder"], ["none", "No Notice"]], notice, "Notice", { container: "#" + m.id }) +
          /* Who gets the notice is a choice, as in the canvas (ReleaseLegalHold.dc.html): checked by default, unchecked and
             disabled under No Notice. A silent-hold custodian is named as receiving nothing. */
          '</div><div class="col-md-6"><div class="form-check mt-md-4"><input type="checkbox" class="form-check-input" id="cvRelSend"' + (sendTo && notice !== "none" ? " checked" : "") +
            (notice === "none" || !notified.length || readOnly ? " disabled" : "") + ' /><label class="form-check-label" for="cvRelSend">Send to the ' + notified.length + " custodian" + (notified.length === 1 ? " who was" : "s who were") + " notified</label>" +
          (silentOnly.length ? '<span class="d-block small text-muted">' + esc(silentOnly.map(function (c) { return D.nameFor(person(c)); }).join(", ")) + " " + (silentOnly.length === 1 ? "is" : "are") + " on a silent legal hold and receive" + (silentOnly.length === 1 ? "s" : "") + " nothing.</span>" : "") + "</div></div></div>" +
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
      if (e.target.id === "cvRelNotice" && notice !== e.target.value) { notice = e.target.value; draw(); }
      if (e.target.id === "cvRelSend") sendTo = e.target.checked;
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
        var told = sendTo && notice !== "none" ? on.filter(function (c) { return (c.lhn || []).some(function (n) { return n.status !== "Silent"; }); }).length : 0;
        on.forEach(function (c) { c.released = TODAY; });
        selected = {};
        m.hide();
        if (a === "cleanup") { window.location.href = "not-in-demo.html?what=Data+cleanup+request"; return; }
        D.toast(on.length + " custodian" + (on.length === 1 ? "" : "s") + " released from legal hold. Their sources stay preserved." +
          (told ? " Release notice sent to " + told + "." : " No release notice was sent."));
        render();
      }
    });
    draw();
  }

  /* ── Custodian coverage (PRD 08 §7.2, CustodianCoverage.dc.html) in a Nimbus offcanvas at 90% (a list). ──
     Header: photo, name, the standing summary as chips (CV40), VIEW PROFILE and EXPORT AS for this custodian (CV47).
     Summary strip: the grid row restated, the sections' contents page. Then the five workflows as drawer cards (the
     house .card-drawer, as My Work), open by default; a drawer the reader shuts
     stays shut from custodian to custodian. Inside: the custodian's notifications, surveys and
     interview as nested tiles with their timelines (CV41), and sources as SOURCE · STATUS · FROM tables with
     their provenance (CV43); then the section's own next steps on a footer row (CV45). A workflow the case does not expect starts shut.
     Follow-on steps (view a notification, record an acknowledgment, schedule an interview) open as stacked
     drawers over the panel (casefusion stacked-offcanvas pattern: BACK closes only the stacked drawer). */
  var panel = null, panelId = null, secOpen = {};
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';
  function empty(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }
  function badgeHtml(text, tone) { return '<span class="badge badge-verbatim badge-' + tone + '">' + esc(text) + "</span>"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  /* Timeline outcome words → badge colour (status colour semantics). */
  var TONE = { Sent: "success", Acknowledged: "success", Answered: "success", Tracked: "secondary", Escalated: "danger", "Not answered": "warning",
    Overdue: "warning", Scheduled: "info", Rescheduled: "info", Complete: "success" };
  /* A timeline (CV41): date · event · actor · outcome, one list row each. Solid row dividers, none under the last. */
  /* A long timeline shows its last three events; SHOW N EARLIER reveals the rest, and the choice holds while the
     panel is open (CV41: the history stays one click away). */
  var tlOpen = {};
  function timeline(events, key) {
    var list = events || [], hide = list.length > 3 && !tlOpen[key] ? list.length - 3 : 0;
    var more = list.length > 3 ? '<li class="list-group-item cv-tl-more"><button type="button" class="btn btn-tertiary btn-sm" data-cv-tl="' + key + '" aria-expanded="' + !hide + '">' +
      (hide ? "SHOW " + hide + " EARLIER" : "HIDE EARLIER") + "</button></li>" : "";
    return '<ul class="list-group list-group-flush cv-tl">' + more + list.slice(hide).map(function (e) {
      return '<li class="list-group-item"><span class="cv-tl-when">' + esc(M.fmtDateTime(e[0], e[1])) + '</span><span class="cv-tl-what">' + esc(e[2]) +
        '</span><span class="cv-tl-who text-muted">' + esc(e[3]) + "</span>" + badgeHtml(e[4], TONE[e[4]] || "light") + "</li>";
    }).join("") + "</ul>";
  }
  /* Sources as the PM canvas lists them (Scott, 10-15): a table with SOURCE · STATUS · FROM, the source over its
     location, the status with its qualifier under it, FROM the provenance (request · mechanism, CV43). The
     drawer's footer carries the next steps, so the rows have no actions. */
  function srcTable(rows) {
    return '<div class="table-responsive"><table class="table align-middle mb-0 cv-src"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  /* A nested tile, as the PM canvas lists a custodian's notifications and surveys (Scott, 10-15): one tile per
     instance, stacked 8px apart. Header band: reference link, name, status badge, and the aside at the right
     (recipients, due date); then its timeline (CV41); its actions small tertiary at the bottom right. */
  function tile(o) {
    /* The reference opens what the tile's own VIEW action opens, so one object opens one way (o.view). */
    return '<div class="card card-basic cv-tile"><div class="cv-tile-head">' + (o.view ? '<a href="#" class="fw-bold" ' + o.view + ">" + esc(o.id) + "</a>" : '<a href="' + o.href + '" class="fw-bold">' + esc(o.id) + "</a>") +
      '<span class="cv-tile-name">' + esc(o.title) + "</span>" + o.badge + '<span class="cv-meta text-muted ms-auto">' + esc(o.aside || "") + "</span></div>" +
      /* A blurry rule sets the tile's actions apart from its timeline rows (Scott, 10-15). */
      '<div class="cv-tile-body">' + timeline(o.events, panelId + ":" + o.id) + (o.acts ? '<hr class="hr hr-blurry cv-tile-rule" aria-hidden="true" /><div class="card-actions justify-content-end">' + o.acts + "</div>" : "") + "</div></div>";
  }
  function tiles(list) { return '<div class="cv-tile-stack">' + list.join("") + "</div>"; }
  /* Identity: the record's name (14px bold), then a 12px line; `sub` is HTML (a reference link, inline so only its
     text is clickable). */
  function ident(name, sub) { return '<span class="d-block fw-bold">' + esc(name) + "</span>" + (sub ? '<div class="small text-muted">' + sub + "</div>" : ""); }
  function refLink(id, href) { return '<a href="' + href + '">' + esc(id) + "</a>"; }
  function qual(text, tone) { return '<span class="d-block small mt-1' + (tone ? " text-" + tone + "-emphasis" : "") + '">' + text + "</span>"; }
  /* A workflow drawer: the house drawer card (Nimbus .card-drawer; demo.css "Drawer card", as My Work and Data map).
     The top row is the category heading, the workflow's one-line state and the chevron; the body is a Nimbus
     .collapse holding the records, then the section's next steps on a footer row (forward right).
     A workflow the case does not expect starts shut (`quiet`), so the panel opens on what matters (Scott, 10-15);
     once the reader opens or shuts a drawer, that choice holds for every custodian. */
  function drawer(key, title, summary, body, acts, quiet) {
    var open = key in secOpen ? secOpen[key] : !quiet;
    return '<section class="card card-basic card-drawer demo-drawer cv-drawer" aria-labelledby="cvSecH-' + key + '"><div class="card-body">' +
      '<div class="card-top demo-drawer-top"><h4 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1" id="cvSecH-' + key + '">' + esc(title) + "</h4>" +
        '<span class="cv-meta text-muted cv-sec-sum">' + esc(summary) + "</span>" +
        '<button type="button" class="card-drawer-toggle" data-cv-sec="' + key + '" aria-expanded="' + open + '" aria-controls="cvSec-' + key + '" aria-label="' + (open ? "Collapse " : "Expand ") + esc(title) + '">' +
        '<i class="mdi mdi-chevron-up mdi-24px" aria-hidden="true"></i></button></div>' +
      '<div class="collapse card-drawer-body' + (open ? " show" : "") + '" id="cvSec-' + key + '">' + body +
        (acts ? '<hr class="hr hr-blurry cv-sec-rule" aria-hidden="true" /><div class="cv-sec-actions">' + acts + "</div>" : "") + "</div></div></section>";
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
  /* Why a workflow is or is not expected of this custodian (CV14b), as a meta line with an inline label. A
     not-expected workflow names the case's rule and why this custodian falls outside it. */
  function expectLine(c, wf) {
    var e = M.expectation(c, wf);
    var outside = { survey: "Not on LH-0031, so the case does not expect a survey.", interview: "Not tagged Key Custodian, so the case does not expect an interview.",
      collection: "No collection is marked for this custodian." }[wf];
    var ex = M.cases.filter(function (x) { return x.id === D.caseId; })[0].expects[wf], rule = ex.rule || ex.text;
    return '<p class="cv-meta text-muted mb-2"><span class="demo-label d-inline me-1">' + (e.yes ? "Expected:" : "Not Expected:") + "</span>" +
      esc(e.yes ? e.why : rule + ". " + outside) + "</p>";
  }
  /* Work done for a custodian it is not expected of (a survey sent or an interview booked off-plan) is shown, but does
     not count toward coverage (CV14a, CV42aa). */
  var OFF_PLAN = '<p class="cv-meta text-warning-emphasis mb-2">Not expected on this case, so this does not count toward coverage.</p>';
  var EXPECT_WHY = "Not expected on this case, so there is nothing to mark not required.";

  function lhnDrawer(c) {
    var pid = c.personId, notices = (c.lhn || []).filter(function (n) { return n.status !== "Silent"; });
    var unack = notices.filter(function (n) { return n.status !== "Acknowledged"; }).length;
    var esc8 = null;
    notices.forEach(function (n) { (n.events || []).forEach(function (e) { if (e[4] === "Escalated") esc8 = e[0]; }); });
    var silentN = (c.lhn || []).length - notices.length;
    var sum = (c.lhn || []).length ? [notices.length ? plural(notices.length, "notification") : "", unack ? unack + " not acknowledged" : "", esc8 ? "escalated " + short(esc8) : "",
      silentN ? "In " + plural(silentN, "silent legal hold") : ""].filter(Boolean).join(" · ") : "None sent";
    /* One tile per notification or silent legal hold the custodian is on, in the order they started. */
    var rows = (c.lhn || []).map(function (n) {
      var h = M.legalHolds.filter(function (x) { return x.id === n.id; })[0] || { title: "" };
      var to = custodians.filter(function (x) { return (x.lhn || []).some(function (y) { return y.id === n.id; }); }).length;
      var silent = n.status === "Silent";
      var badge = silent ? badgeHtml("Silent legal hold", "secondary") : n.status === "Acknowledged" ? badgeHtml("Acknowledged", "success") :
        n.status === "Sent" ? badgeHtml("Sent", "info") : badgeHtml("Not acknowledged", "danger");
      var acts = silent ? btn("VIEW LEGAL HOLD", 'data-cv-view-lh="' + n.id + '"') + link("REMOVE FROM LEGAL HOLD", "not-in-demo.html?what=Remove+from+legal+hold&amp;ships=1") :
        n.status === "Acknowledged" ? btn("VIEW NOTIFICATION", 'data-cv-view-lh="' + n.id + '"') :
        btn("SEND REMINDER", 'data-cv-remind="' + n.id + '"') + btn("RESEND NOTIFICATION", 'data-cv-resend="' + n.id + '"') + btn("RECORD ACKNOWLEDGMENT", 'data-cv-ack="' + n.id + '"');
      return tile({ id: n.id, view: 'data-cv-view-lh="' + n.id + '"', title: h.title, badge: badge,
        aside: silent ? "Nothing sent to the custodian" : "Sent to " + plural(to, "custodian"), events: n.events, acts: acts });
    });
    var body = rows.length ? tiles(rows) : empty("No legal hold notification", "No legal hold notification has been sent to this custodian.");
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
    return drawer("lhn", "Legal Hold Notification", sum, body, sendMenu("SEND LEGAL HOLD NOTIFICATION", menu) + release);
  }

  function surveyDrawer(c, v) {
    var pid = c.personId, sv = c.surveys || [];
    var na = c.notRequiredWf && c.notRequiredWf.survey, dash = v.survey.state === "dash", exp = M.expectation(c, "survey").yes;
    var answered = sv.filter(function (x) { return x.status === "Answered"; }).length, late = sv.filter(function (x) { return x.status === "Escalated" || x.status === "Not answered"; }).length;
    var sum = na ? "Not required" : !exp ? "Not expected on this case" + (sv.length ? " · " + plural(sv.length, "survey") + " sent" : "") : !sv.length ? "Not sent" :
      [plural(sv.length, "survey"), answered + " answered", late ? late + " overdue" : ""].filter(Boolean).join(" · ");
    /* One tile per survey sent to the custodian. */
    var rows = sv.map(function (x) {
      var def = M.surveys.filter(function (d) { return d.id === x.id; })[0];
      var done = x.status === "Answered";
      var reported = (x.events || []).some(function (e) { return /reported/.test(e[2]); });
      var badge = done ? badgeHtml("Answered", "success") : x.status === "Sent" ? badgeHtml("Sent", "info") : badgeHtml("Not answered", "danger");
      var acts = done ? link("VIEW ANSWERS", "not-in-demo.html?what=Survey+answers&amp;ships=1") + (reported ? link("ADD REPORTED LOCATION", "case-add-sources.html") : "") :
        /* No MARK NOT REQUIRED here: not required covers the survey workflow for this custodian (CV14), which is the
           footer's action; a second copy on each survey read as a per-survey choice that doesn't exist. */
        btn("SEND REMINDER", 'data-cv-remind="' + x.id + '"') + link("VIEW SURVEY", "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1");
      return tile({ id: x.id, href: "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1", title: def.title + " · " + def.questions + " questions", badge: badge,
        aside: done ? "Answered " + short(x.on) : "Due " + short(x.due || def.due), events: x.events, acts: acts });
    });
    var body = expectLine(c, "survey") + (na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" : !sv.length ? (exp ? empty("No survey sent", "The case expects a survey from this custodian, and none has been sent.") : "") :
      (exp ? "" : OFF_PLAN) + tiles(rows) + '<p class="cv-meta text-muted mt-2 mb-0">Locations named in survey answers are added as reported locations for review.</p>');
    var menu = item("", "New Survey…", "Opens the survey form with this custodian", "not-in-demo.html?what=New+survey&amp;ships=1") +
      '<li><h6 class="dropdown-header">Questions and reminders from a survey in this case</h6></li>' +
      M.surveys.map(function (d) { return item('data-send-survey="' + d.id + '" data-one="' + pid + '"', d.id + " · " + d.title, d.questions + " questions"); }).join("");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : !exp ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="survey"', "btn-secondary");
    return drawer("survey", "Survey", sum, body, sendMenu("SEND SURVEY", menu) + nr, !exp && !sv.length && !na);
  }

  /* Interview (CV42–CV42c): states the fact and does not advise. SCHEDULE is open on every custodian (CV42aa);
     a booked interview offers RESCHEDULE and MARK COMPLETE, and both dates stay in its history (CV42b). */
  function interviewDrawer(c, v) {
    var iv = c.interview, na = c.notRequiredWf && c.notRequiredWf.interview, exp = M.expectation(c, "interview").yes;
    var state = !iv ? "" : iv.status === "Complete" ? "Complete " + short(iv.completed) : "Scheduled " + short(iv.date);
    var sum = na ? "Not required" : !exp ? "Not expected on this case" + (iv ? " · " + state.toLowerCase() : "") : !iv ? "Not scheduled" : state;
    var body = expectLine(c, "interview") + (na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" :
      !iv ? (exp ? '<p class="mb-0">Not scheduled.</p>' : "") : (exp ? "" : OFF_PLAN) +
      tiles([tile({ id: "Interview", href: "not-in-demo.html?what=Interview&amp;ships=1", title: "with " + iv.with + " · " + iv.where,
        badge: iv.status === "Complete" ? badgeHtml("Complete", "success") : badgeHtml("Scheduled", "info"),
        aside: iv.status === "Complete" ? "Completed " + short(iv.completed) : M.fmtDateTime(iv.date, iv.time), events: iv.events,
        acts: iv.status === "Complete" ? "" : btn("RESCHEDULE", "data-cv-schedule") + btn("MARK COMPLETE", "data-cv-iv-done") })]));
    var sched = iv && iv.status !== "Complete" ? off("SCHEDULE", "An interview is already scheduled: use RESCHEDULE.", "btn-secondary") : btn("SCHEDULE", "data-cv-schedule", "btn-secondary");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : !exp ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") :
      iv && iv.status === "Complete" ? off("MARK NOT REQUIRED", "The interview happened: complete is not the same as not required (CV42c).", "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="interview"', "btn-secondary");
    return drawer("interview", "Interview", sum, body, sched + nr, !exp && !iv && !na);
  }

  /* Preservation: one row per source. A location reported in a survey but not added yet shows as such, with a dash
     for FROM, and counts in neither number (CV44). */
  function preservationDrawer(c, v) {
    var src = M.sourcesOf(c.personId), rep = c.reported || [];
    var sum = v.preservation.state === "na" ? "Not required" : v.preservation.text.replace(" on hold", " sources on hold") + (rep.length ? " · " + rep.length + " reported, not added" : "");
    var hs = ' · see <a href="case-hold-status.html">Hold status</a>';
    var rows = src.map(function (s) {
      var status = s.pending ? badgeHtml("Not requested", "warning") + (s.priorWork ? qual(esc(s.priorWork.what + " on " + s.priorWork.caseId + " · " + s.priorWork.request), "info") : "") :
        badgeHtml(s.hold, s.hold === "Applied" ? "success" : s.hold === "Attested" ? "info" : s.hold === "Applying" ? "warning" : "danger") +
        (s.hold === "Not applied" ? qual("Removed from the Purview hold " + esc(short(s.exception.since)) + hs, "warning") : "") +
        (s.hold === "Overdue" ? qual("Attestation overdue" + hs, "warning") : "") +
        (s.hold === "Applying" ? qual("Applying since " + esc(short(s.exception.since)) + hs, "warning") : "");
      var from = s.pending ? '<span class="text-muted">—</span>' : reqLink(s.request) + " · " + (s.evidence === "attested" ? "attested" : "Purview");
      return [ident(M.typeLabel(s.type), esc(s.name)), status, from];
    }).concat(rep.map(function (r) {
      return [ident(r.what, "Reported in " + esc(r.from) + " · not yet added"), badgeHtml("Not held", "warning") + qual(esc(r.kind + " · " + r.status), "warning"), '<span class="text-muted">—</span>'];
    }));
    var body = v.preservation.state === "na" ? '<p class="cv-meta mb-0">Not required: ' + esc(c.notRequired.preservation) + "</p>" : srcTable(rows);
    return drawer("preservation", "Preservation", sum, body,
      link("ADD TO PRESERVATION REQUEST", "case-new-preservation.html?custodians=" + c.personId, "btn-secondary") + link("OPEN HOLD STATUS", "case-hold-status.html", "btn-secondary"));
  }

  function collectionDrawer(c, v) {
    var col = c.collection, exp = M.expectation(c, "collection").yes;
    var tone = { Collected: "success", Failed: "danger", Retrying: "warning", "Not started": "secondary", "In progress": "info" };
    var items = (col && col.items) || [];
    var failed = items.some(function (x) { return x.status === "Failed"; });
    var body = expectLine(c, "collection") + (!exp ? "" : !items.length ? empty("No collection yet", "The case expects a collection from this custodian, and none has been requested.") : srcTable(items.map(function (x) {
      var s = M.sources.filter(function (y) { return y.id === x.source; })[0];
      /* FROM: the package for what was collected, the request otherwise; each a link to where it lives. */
      var ref = /^PKG-/.test(x.from) ? '<a href="not-in-demo.html?what=Collection+package+' + x.from + '">' + esc(x.from) + "</a>" : reqLink(x.from);
      return [ident(M.typeLabel(s.type), esc(s.name)), badgeHtml(x.status, tone[x.status] || "light"), ref + " · " + esc(x.note)];
    })));
    return drawer("collection", "Collection", !exp ? "Not expected on this case" : v.collection.text + (v.collection.state !== "done" && v.collection.detail ? " · " + v.collection.detail : ""), body,
      link("ADD TO COLLECTION REQUEST", "not-in-demo.html?what=Collection+request", "btn-secondary") +
      (failed ? link("VIEW FAILURES", "not-in-demo.html?what=Collection+failures", "btn-secondary") : off("VIEW FAILURES", "No collection from this custodian has failed.", "btn-secondary")), !exp);
  }

  function renderPanel() {
    var c = byPid(panelId), p = person(c), v = cov(c), ok = seen(c);
    var keep = panel.el.querySelector(".offcanvas-body"), top = keep ? keep.scrollTop : 0;
    /* Summary strip: one card, the five workflows divided by blurry rules, each a label over its state. */
    /* Summary cards, the Hold Status pattern (Scott, 10-15): one card per workflow, each opening its drawer. A
       workflow's card is toned by severity (below). A limited profile has no drawers, so its cards are
       plain, not buttons. Values are words (Not acknowledged), so they take 16px, not the 24.5px of a count. */
    var strip = '<div class="demo-tiles cv-ptiles" role="group" aria-label="Workflows">' + [["lhn", "Legal Hold Notification", v.lhn], ["survey", "Survey", v.survey], ["interview", "Interview", v.interview], ["preservation", "Preservation", v.preservation], ["collection", "Collection", v.collection]].map(function (x) {
      /* Severity, as Hold Status colours its cards (Scott, 10-15): danger when something is late or failed (action),
         warning when something expected has not started (todo: Not scheduled, Not sent, Not requested). Healthy and
         in-flight workflows stay neutral: colouring good news is noise. These cards jump, they don't filter,
         so they are not toggles (no aria-pressed) and keep Nimbus's full outline border. */
      var tone = x[2].state === "action" ? "danger" : x[2].state === "todo" ? "warning" : "";
      var inner = '<span class="card-subtitle demo-tile-name">' + x[1] + '</span><span class="card-title demo-tile-value">' + esc(x[2].text) + "</span>" +
        '<span class="card-text demo-tile-label">' + esc(x[2].state === "dash" ? "Not expected" : x[2].detail || "") + "</span>";
      var cls = "card " + (tone ? "card-outline card-" + tone : "card-basic") + " demo-tile";
      return ok ? '<button type="button" class="' + cls + '" data-cv-jump="' + x[0] + '"' + (tone ? ' data-tone="' + tone + '"' : "") + ">" + inner + "</button>" :
        '<div class="' + cls + '">' + inner + "</div>";
    }).join("") + "</div>";
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
    var chips = [badgeHtml("Custodian", "info"),
      v.preservation.state === "na" ? badgeHtml("Preservation not required", "light") : badgeHtml(v.preservation.text.replace(" on hold", " sources on hold"), PT[v.preservation.state]),
      unack ? badgeHtml(plural(unack, "notification") + " not acknowledged", "danger") : "", silentN ? badgeHtml("In " + plural(silentN, "silent legal hold"), "secondary") : "",
      need ? badgeHtml(plural(need, "workflow") + " need" + (need === 1 ? "s" : "") + " attention", "warning") : "",
      c.released ? badgeHtml("Released " + short(c.released), "success") : ""].filter(Boolean);
    /* Contents bar (Sally, Scott 10-15): pinned to the top of the panel body, shown only once the summary cards have
       scrolled away. The name, then one entry per workflow (its name and state word in its severity colour) that
       jumps to its drawer; the drawer being read is marked (aria-current). Below 1200px the state words drop. */
    var bar = '<div class="cv-bar-pin" aria-hidden="true"><nav class="cv-bar" aria-label="Workflows for ' + esc(p.name) + '"><span class="cv-bar-name">' + D.avatar(p, 32) + esc(p.name) + "</span>" +
      [["lhn", "Notification", v.lhn], ["survey", "Survey", v.survey], ["interview", "Interview", v.interview], ["preservation", "Preservation", v.preservation], ["collection", "Collection", v.collection]].map(function (x) {
        var tone = x[2].state === "action" ? " text-danger-emphasis" : x[2].state === "todo" ? " text-warning-emphasis" : "";
        return '<button type="button" class="cv-bar-item" data-cv-jump="' + x[0] + '"' + (tone ? ' data-tone="' + (x[2].state === "action" ? "danger" : "warning") + '"' : "") + ' tabindex="-1"><span class="cv-bar-wf">' + x[1] + '</span><span class="cv-bar-value' + tone + '">' +
          esc(x[2].state === "dash" ? "Not expected" : x[2].text) + "</span></button>";
      }).join("") + "</nav></div>";
    panel.setBody('<div class="cv-scope">' + bar +
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
    syncBar();
  }
  /* Show the contents bar once the summary cards are out of view, and mark the drawer whose heading has passed
     under it. The bar is out of the tab order and hidden from assistive tech while it is not shown. */
  function syncBar() {
    if (!panel) return;
    var body = panel.el.querySelector(".offcanvas-body"), pin = panel.el.querySelector(".cv-bar-pin"), cards = panel.el.querySelector(".cv-ptiles");
    if (!body || !pin || !cards) return;
    var top = body.getBoundingClientRect().top, on = cards.getBoundingClientRect().bottom < top;
    pin.classList.toggle("cv-bar-on", on);
    pin.setAttribute("aria-hidden", String(!on));
    var current = null;
    var secs = panel.el.querySelectorAll(".cv-drawer");
    /* "Passed under the bar": a drawer whose top is within the bar's height (58px) plus a little reading room. */
    secs.forEach(function (sec) { if (sec.getBoundingClientRect().top - top < 96) current = sec.querySelector("[data-cv-sec]").getAttribute("data-cv-sec"); });
    /* At the bottom the last drawer can't reach the top, so it is the current one (the usual scrollspy rule). */
    if (secs.length && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) current = secs[secs.length - 1].querySelector("[data-cv-sec]").getAttribute("data-cv-sec");
    pin.querySelectorAll(".cv-bar-item").forEach(function (b) {
      b.tabIndex = on ? 0 : -1;
      if (b.getAttribute("data-cv-jump") === current) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  }
  function openPanel(pid) {
    panelId = pid;
    if (!panel) {
      panel = D.offcanvas({ title: "Custodian coverage", width: "90vw", body: "",
        /* Previous and next are equal actions, so both are secondary: no primary in this footer (Scott, 10-14). */
        footer: '<span class="cv-meta text-muted me-auto" id="cvPanelPos" aria-live="polite"></span><button type="button" class="btn btn-secondary" data-cv="panel-prev">PREVIOUS CUSTODIAN</button><button type="button" class="btn btn-secondary" data-cv="panel-next">NEXT CUSTODIAN</button>',
        onHidden: function () { panel = null; panelId = null; } });
      panel.el.querySelector(".offcanvas-body").addEventListener("scroll", syncBar, { passive: true });
    }
    renderPanel(); panelPos();
    var b = panel.el.querySelector(".offcanvas-body"); if (b) b.scrollTop = 0;
  }
  /* PREVIOUS / NEXT walk the grid's current filter. The panel crossfades between custodians, as the grid does
     between views (0.15s out, then in); no motion under reduced motion. */
  function stepPanel(dir) {
    var list = custodians.filter(matches);
    if (!list.length) return;
    var i = list.map(function (c) { return c.personId; }).indexOf(panelId);
    var next = list[(i + dir + list.length) % list.length].personId, body = panel.el.querySelector(".offcanvas-body");
    if (REDUCE || !body) { openPanel(next); return; }
    body.classList.add("cv-step-out");
    setTimeout(function () { openPanel(next); body.classList.remove("cv-step-out"); }, 150);
  }
  /* "3 of 9 custodians": where this custodian sits in the grid's current filter. */
  function panelPos() {
    var el = document.getElementById("cvPanelPos"), list = custodians.filter(matches), i = list.map(function (c) { return c.personId; }).indexOf(panelId);
    if (el) el.textContent = i === -1 ? "Not in the current filter" : (i + 1) + " of " + list.length + " custodian" + (list.length === 1 ? "" : "s");
  }
  /* From the summary strip: open the workflow's drawer (if shut) and bring it to the top of the panel. */
  function jumpTo(k) {
    var btnEl = panel.el.querySelector('[data-cv-sec="' + k + '"]');
    if (btnEl && btnEl.getAttribute("aria-expanded") !== "true") toggleSection(btnEl);
    var h = document.getElementById("cvSecH-" + k);
    if (h) h.closest("section").scrollIntoView({ block: "start", behavior: REDUCE ? "auto" : "smooth" });
  }
  /* A drawer opens or shuts with Nimbus Collapse (the shell keeps the chevron's label in step); the choice holds for
     the next custodian. */
  function toggleSection(btnEl) {
    var k = btnEl.getAttribute("data-cv-sec"), el = document.getElementById("cvSec-" + k);
    secOpen[k] = btnEl.getAttribute("aria-expanded") !== "true";
    btnEl.setAttribute("aria-expanded", String(secOpen[k]));
    if (window.Nimbus && Nimbus.Collapse) Nimbus.Collapse.getOrCreateInstance(el, { toggle: false })[secOpen[k] ? "show" : "hide"]();
    else el.classList.toggle("show", secOpen[k]);
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
          var st = n.status === "Silent" ? badgeHtml("Tracked", "secondary") : n.status === "Acknowledged" ? badgeHtml("Acknowledged", "success") : n.status === "Sent" ? badgeHtml("Sent", "info") : badgeHtml("Not acknowledged", "danger");
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
    if (t.hasAttribute("data-cv-tl")) { var tk = t.getAttribute("data-cv-tl"); tlOpen[tk] = !tlOpen[tk]; renderPanel(); return; }
    if (t.hasAttribute("data-cv-jump")) { jumpTo(t.getAttribute("data-cv-jump")); return; }
    var pc = panelId && byPid(panelId);
    if (pc) {
      if (t.hasAttribute("data-cv-view-lh")) { e.preventDefault(); viewHold(t.getAttribute("data-cv-view-lh")); return; }
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

  /* Deep links for the review guides: ?open=<person id> opens that custodian's coverage, and &drawer=<lhn|survey|
     interview|preservation|collection> opens that drawer and scrolls to it, so each edge case is one click away. */
  (function () {
    var q = function (k) { var m = new RegExp("[?&]" + k + "=([\\w-]+)").exec(location.search); return m && m[1]; };
    var pid = q("open"), sec = q("drawer");
    if (!pid || !byPid(pid)) return;
    if (sec) secOpen[sec] = true;
    /* Nimbus loads its components after this script (phase 2), so wait for them before opening the panel. */
    var go = function () {
      openPanel(pid);
      if (sec) setTimeout(function () { var h = document.getElementById("cvSecH-" + sec); if (h) h.scrollIntoView({ block: "start" }); }, 450);
    };
    if (window.Nimbus && Nimbus.Offcanvas) go(); else document.addEventListener("cnds.ready", go, { once: true });
  }());
}());
