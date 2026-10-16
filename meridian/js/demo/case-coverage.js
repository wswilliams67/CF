/* ═══════════════════════════════════════════════════════════════════════
   Coverage controller (PRD 08 §7.1–7.3).

   One copy of the case's custodians in memory. Tiles, banner, grid, panel
   and release dialog are all recomputed from it with MERIDIAN.coverageOf,
   so Fully covered + In progress + Action needed always equals the
   custodian count. Coverage decides what to do; Hold status says what is
   true, so preservation cells link there.

   DATA (data/meridian.js, read once; the API seam replaces these reads)
     M.custodians          the case's custodians: personId, lhn[], surveys[],
                           interview, collection, reported[], added,
                           afterNotice/addedFrom/addedNote, released,
                           notRequired.preservation, notRequiredWf{wf}
     M.coverageOf(c)       per-workflow cell {state, text, detail} + bucket
     M.expectation(c, wf)  is the workflow expected of this custodian (CV14b)
     M.legalHolds          notifications and silent holds (sends push here)
     M.surveys             survey definitions
     M.sources / sourcesOf / dataGaps / usedBy / nonCustodialCollection
                           held sources, gap sources, non-custodial rows
     M.heldElsewhere[pid]  held on another case: release leaves them out
     M.cases[].expects     the case's counting rules; .team interviewers
     M.requests            request ids that exist (reqLink)

   STATE (this page only; nothing persists across a reload)
     custodians    a deep copy of M.custodians; every action edits it
     selected      { personId: true } for the selection toolbar
     tileFilter    the summary card filtering the grid (null = none)
     page/pageSize the grid pager (10, the house default)
     panel*        the custodian coverage drawer: which custodian, which
                   drawers are shut, timelines expanded, nested pager pages

   RENDER CYCLE
     render()          banner, tiles, grid (+ non-custodial), counting rules,
                       and the open panel; after any action
     view(renderGrid)  a view change (filter, card, search, sort, page):
                       the tables crossfade
     renderGrid()      selection changes redraw in place, no fade
     renderPanel()     panel-only changes (drawer pager, SHOW EARLIER)

   SECTIONS
     Data and helpers · Cells · Tiles and banner · Grid and sort ·
     Selection toolbar · Non-custodial table · Crossfade · Render cycle ·
     Actions · Release dialog · Custodian panel (timelines, record tiles,
     sorting, pagers, source tables, drawers, panel, contents bar,
     navigation) · Stacked drawers · Exports · Events · Deep links

   DEMO-ONLY
     · Every action happens at 10:05 on M.DEMO_TODAY (nowTime).
     · Links to screens outside the demo open not-in-demo.html.
     · The ?open= / &drawer= deep links exist for the review guides.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Data and helpers ─────────────────────────────────────────────── */
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var TODAY = M.DEMO_TODAY;
  var short = function (iso) { return M.fmtDate(iso).replace(/ \d{4}$/, ""); };

  var custodians = JSON.parse(JSON.stringify(M.custodians));
  var selected = {};
  var tileFilter = null;
  var page = 1, pageSize = 10;   /* grid pager: the house default, 10 per page (design decision 10) */
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var WORKFLOWS = ["lhn", "survey", "interview", "preservation", "collection"];
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';

  function person(c) { return M.person(c.personId); }
  function cov(c) { return M.coverageOf(c); }
  function visibleName(c) { return D.nameFor(person(c)); }
  function seen(c) { return D.canSee(person(c)); }
  function byPid(pid) { return custodians.filter(function (c) { return c.personId === pid; })[0]; }
  function selectedList() { return custodians.filter(function (c) { return selected[c.personId]; }); }
  function thisCase() { return M.cases.filter(function (x) { return x.id === D.caseId; })[0]; }
  function holdById(id) { return M.legalHolds.filter(function (x) { return x.id === id; })[0]; }
  /* Silent holds (nothing is sent) and notifications are offered separately in every send menu. */
  function holdsOf(silent) { return M.legalHolds.filter(function (h) { return !!h.silent === silent; }); }
  /* Sent at least one real notification (a silent hold sends nothing). */
  function wasNotified(c) { return (c.lhn || []).some(function (n) { return n.status !== "Silent"; }); }
  /* Release applies to a custodian on a legal hold (notified or silent) who is not released yet and not held on
     another accessible case. Everyone else has nothing to release. */
  function releasable(c) { return (c.lhn || []).length > 0 && !c.released && !M.heldElsewhere[c.personId]; }
  /* Added after the first notification went out and never notified: the banner's custodians (PRD 08 §7.1). */
  function afterNoticeUnsent() { return custodians.filter(function (c) { return c.afterNotice && !wasNotified(c); }); }
  function me() { return M.person(D.viewer().personId).name; }
  function nowTime() { return "10:05"; }  /* the demo's clock: every action happens at 10:05 on M.DEMO_TODAY */
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function badgeHtml(text, tone) { return '<span class="badge badge-verbatim badge-' + tone + '">' + esc(text) + "</span>"; }
  /* A select's value, "all" before Nimbus has mounted it. */
  function val(id) { var el = document.getElementById(id); return el ? el.value : "all"; }
  function empty(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }
  /* A request ID is a link to the Requests tab whenever the request exists, so one column never mixes links and text. */
  function reqLink(id) { return !id ? '<span class="text-muted">—</span>' : M.requests.some(function (r) { return r.id === id; }) ? '<a href="case-requests.html">' + esc(id) + "</a>" : esc(id); }
  /* Replace a page-level pager. Nimbus selects are disposed before their markup is replaced, and markup injected
     after boot is not auto-initialised. */
  function setPager(foot, html) {
    var NS = window.Nimbus && Nimbus.Select;
    if (NS) foot.querySelectorAll("select[data-cnds-select-init]").forEach(function (x) { var i = NS.getInstance(x); if (i) i.dispose(); });
    foot.innerHTML = html;
    if (NS) NS.initAll(foot);
  }

  /* ── Cells ────────────────────────────────────────────────────────── */
  /* Nimbus badges, coloured by the coverage-grid semantics in the glossary. */
  /* badge-verbatim: the status words keep their own case ("3 of 3 on hold", not "3 Of 3 On Hold"), as Hold Status's Purview
     words do (Nimbus gap #10; design decision, 14 Oct). */
  var BADGE = { done: "badge badge-verbatim badge-success", progress: "badge badge-verbatim badge-info", todo: "badge badge-verbatim badge-warning", action: "badge badge-verbatim badge-danger", silent: "badge badge-verbatim badge-secondary", na: "badge badge-verbatim badge-light" };
  /* A date never breaks across lines: "latest 08-29-" / "2026" read as two things. */
  function keepDates(html) { return html.replace(/(\d{2}-\d{2}-\d{4})/g, '<span class="text-nowrap">$1</span>'); }
  /* One workflow cell: the badge (a link to Hold status when given), the detail line under it. */
  function cell(x, link) {
    if (x.state === "dash") return '<span class="text-muted" title="Not expected on this case">—</span>';
    var pill = '<span class="' + BADGE[x.state] + '">' + esc(x.text) + "</span>";
    if (link) pill = '<a href="' + link + '" title="Open Hold status">' + pill + "</a>";
    return pill + (x.detail ? '<span class="d-block small text-muted mt-1" title="' + esc(x.detail) + '">' + keepDates(esc(x.detail)) + "</span>" : "");
  }

  /* ── Tiles and banner (PRD 08 §7.1) ───────────────────────────────── */
  /* ACTION NEEDED's subline: why each custodian needs action, counted by the first reason only. */
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
  /* Data gaps follow the in-memory custodians (a source marked not required leaves the count). */
  function gapSources() {
    var exempt = {};
    custodians.forEach(function (c) { if (c.notRequired && c.notRequired.preservation) exempt[c.personId] = true; });
    return M.dataGaps().filter(function (s) { return !(s.owner && exempt[s.owner]); });
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
  /* The added-after-notice banner: shown only while such custodians exist. */
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

  /* ── Grid and sort (Nimbus table) ─────────────────────────────────── */
  /* Search, Filter By, Workflow and the card filter, all applied together. */
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
  /* The grid's order (Sort By, Scott 10-15): Most Urgent by default, as My Work. Most Urgent = needs action first
     (the most workflows needing action first), then in progress, then fully covered, then by name. Names sort by
     what the viewer sees, so a limited profile's real name never decides its place. PREVIOUS / NEXT follow it. */
  function ordered() {
    var by = val("cvSort") || "urgent", B = { action: 0, progress: 1, fully: 2 };
    var nm = function (c) { return visibleName(c).toLowerCase(); };
    var acts = function (v) { return WORKFLOWS.filter(function (k) { return v[k].state === "action"; }).length; };
    return custodians.filter(matches).slice().sort(function (a, b) {
      if (by === "name") return nm(a) < nm(b) ? -1 : nm(a) > nm(b) ? 1 : 0;
      if (by === "added") return a.added < b.added ? 1 : a.added > b.added ? -1 : nm(a) < nm(b) ? -1 : 1;
      var va = cov(a), vb = cov(b);
      return B[va.bucket] - B[vb.bucket] || acts(vb) - acts(va) || (nm(a) < nm(b) ? -1 : nm(a) > nm(b) ? 1 : 0);
    });
  }
  /* The grid's page, its pager, the non-custodial table (DATA GAPS filters both), select-all and the toolbar. */
  function renderGrid() {
    var rows = ordered();
    var pages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > pages) page = pages;
    var shown = rows.slice((page - 1) * pageSize, page * pageSize);
    document.getElementById("cvBody").innerHTML = shown.map(function (c) {
      var v = cov(c), p = person(c), ok = seen(c);
      var sub = ok ? esc(p.title) + (p.departed ? " · Departed " + esc(M.fmtDate(p.departed)) : "") : "Outside your regions";
      return '<tr class="' + (selected[c.personId] ? "table-active" : "") + '">' +
        '<td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-sel="' + c.personId + '"' + (selected[c.personId] ? " checked" : "") + ' aria-label="Select ' + esc(visibleName(c)) + '" /></div></td>' +
        /* The name is the row's identity, not a link: OPEN is the one way into custodian coverage (design decision 15). */
        '<td><span class="d-block fw-bold' + (ok ? "" : " demo-masked") + '">' + (ok ? "" : LOCK) + esc(visibleName(c)) + "</span>" +
          '<span class="d-block small text-muted">' + sub + "</span>" + (c.addedNote ? '<span class="d-block small text-warning-emphasis">' + esc(c.addedNote) + "</span>" : "") + "</td>" +
        "<td>" + cell(v.lhn) + "</td><td>" + cell(v.survey) + "</td><td>" + cell(v.interview) + "</td>" +
        "<td>" + cell(v.preservation, v.preservation.state === "action" || v.preservation.state === "progress" ? "case-hold-status.html" : null) + "</td>" +
        "<td>" + cell(v.collection) + "</td>" +
        /* A blurry divider sets the row action apart from the data, as in every record row (design decision 16). */
        '<td class="cv-row-action"><div class="vr vr-blurry" aria-hidden="true"></div><button type="button" class="btn btn-tertiary btn-sm" data-open="' + c.personId + '">OPEN</button></td></tr>';
    }).join("") || '<tr><td colspan="8">' + empty("No custodians match this filter", "Change the search or the filters to see more custodians.") + "</td></tr>";
    /* Pager under the grid: its range is the grid's count, so the toolbar carries none (design decision 10). */
    setPager(document.getElementById("cvGridFoot"), rows.length ? D.pager("cv", rows.length, page, pageSize, "Custodians per page:") : "");
    renderNonCustodial();
    var all = document.getElementById("cvAll");
    all.checked = rows.length > 0 && rows.every(function (c) { return selected[c.personId]; });
    all.indeterminate = !all.checked && rows.some(function (c) { return selected[c.personId]; });
    renderSelTool();
  }

  /* ── Selection toolbar (btn-toolbar-shared) ───────────────────────── */
  function dropdown(label, items) {
    return '<div class="btn-group dropdown" role="group"><button type="button" class="btn btn-tertiary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false">' + label +
      ' <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion">' + items + "</ul></div>";
  }
  /* A menu item: a link when it leaves the page (href), a button carrying data attributes otherwise; the
     description is Nimbus secondary text under the label. */
  function item(attrs, title, sub, href, grouped) {
    var cls = "dropdown-item" + (grouped ? " dropdown-group-item" : "");
    var inner = esc(title) + (sub ? '<span class="dropdown-item-secondary-text">' + esc(sub) + "</span>" : "");
    return "<li>" + (href ? '<a class="' + cls + '" href="' + href + '">' + inner + "</a>" : '<button type="button" class="' + cls + '" ' + attrs + ">" + inner + "</button>") + "</li>";
  }
  /* A Nimbus product-menu group: its header, then its items indented under it. */
  function groupHead(label) { return '<li><span class="dropdown-group-header">' + esc(label) + "</span></li>"; }
  function groupItem(attrs, title, sub, href) { return item(attrs, title, sub, href, true); }
  /* The selection toolbar zooms in when the first custodian is selected and out when the last is cleared (Scott,
     10-14): Nimbus cnds-scale-in / cnds-scale-out (scale 0.95 ↔ 1 with a fade, from its centre). The two steps run in
     sequence so it reads as a zoom, not a slide: in, the slot opens (0.15s) and then the bar zooms in (0.2s); out, the
     bar zooms out in place (0.2s) and then the empty slot closes (0.15s). No motion under reduced motion. */
  var selShown = false, selTimer = null;
  /* Animate the toolbar slot's height from → to, then clear the inline styles. */
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
    var ids = list.map(function (c) { return c.personId; }).join(",");
    /* Selection toolbar in the default toolbar colour, not the green shared state (design decision 11). The clear (X)
       and the count use the list toolbar's text colour so they read on the default bar in both themes. */
    host.innerHTML = '<div class="pb-2"><div class="btn-toolbar-gray cv-seltool" role="toolbar" aria-label="Actions for selected custodians">' +
      '<div class="toolbar-shared-count"><i class="mdi mdi-close pointer toolbar-list-total" role="button" tabindex="0" aria-label="Clear selection" data-cv="clear"></i><div class="vr vr-blurry" aria-hidden="true"></div><span class="toolbar-list-total">' + n + " selected" + "</span></div><div>" +
      /* Damage order (house rule): the most consequential action leftmost, the least rightmost (Scott, 10-15):
         release, mark not required, the two sends, then the two that only open a page. */
      /* Disabled, never hidden, when no selected custodian is on a legal hold: there is nothing to release. */
      (list.some(releasable) ? '<div class="btn-group" role="group"><button type="button" class="btn btn-tertiary btn-sm" data-cv="release">RELEASE FROM HOLD</button></div>' :
        '<div class="btn-group" role="group" title="None of the selected custodians is on a legal hold."><button type="button" class="btn btn-tertiary btn-sm" disabled>RELEASE FROM HOLD</button></div>') +
      '<div class="btn-group" role="group"><button type="button" class="btn btn-tertiary btn-sm" data-cv="not-required">MARK NOT REQUIRED</button></div>' +
      dropdown("SEND LEGAL HOLD NOTIFICATION",
        item("", "New Legal Hold Notification …", "Opens Create Legal Hold with the " + n + " selected custodians as recipients", createHoldPage(selectedList())) +
        groupHead("Settings From a Notification") +
        holdsOf(false).map(function (h) { return groupItem("", h.id + " · " + h.title.split(" · ")[0], h.settings, createHoldPage(selectedList(), h.id)); }).join("") +
        groupHead("Silent Legal Hold") +
        holdsOf(true).map(function (h) {
          var tracked = custodians.filter(function (c) { return (c.lhn || []).some(function (x) { return x.id === h.id; }); }).length;
          return groupItem('data-send-silent="' + h.id + '"', h.id + " · " + h.title, "Add " + n + " selected · nothing is sent · " + plural(tracked, "custodian") + " tracked");
        }).join("") +
        groupItem("", "New Silent Legal Hold …", "Nothing is sent. The custodians are tracked and their data is held", "not-in-demo.html?what=New+silent+legal+hold&amp;ships=1")) +
      dropdown("SEND SURVEY",
        item("", "New Survey …", "Opens the survey form with the " + n + " selected custodians", "not-in-demo.html?what=New+survey&amp;ships=1") +
        groupHead("Settings From a Survey") +
        M.surveys.map(function (sv) { return groupItem('data-send-survey="' + sv.id + '"', sv.id + " · " + sv.title, sv.questions + " questions"); }).join("")) +
      dropdown("REQUEST FOR GAPS",
        item("", "Preservation Request", "Opens New request with the selected custodians and only their gap sources", "case-new-preservation.html?custodians=" + ids) +
        item("", "Collection Request", "Collection is not part of this demo", "not-in-demo.html?what=Collection+request") +
        item("", "Both", "Collection is not part of this demo", "not-in-demo.html?what=Preservation+and+collection+request")) +
      /* SCHEDULE INTERVIEW opens the existing Schedule Interview page (schedulePage); its Interview With takes one person,
         so it needs one custodian selected (disabled with the reason otherwise). */
      (n === 1 && seen(list[0]) ? '<div class="btn-group" role="group"><a class="btn btn-tertiary btn-sm" href="' + schedulePage(list[0], false) + '">SCHEDULE INTERVIEW</a></div>' :
        '<div class="btn-group" role="group" title="' + (n === 1 ? "Outside your regions: the case team in the custodian's region schedules the interview." : "An interview is with one custodian: select one to schedule it.") + '"><button type="button" class="btn btn-tertiary btn-sm" disabled>SCHEDULE INTERVIEW</button></div>') +
      "</div></div></div>";
    if (entering && !REDUCE) {
      var bar = host.querySelector(".cv-seltool"); bar.classList.remove("cv-zoom-out"); bar.style.opacity = "0";
      slide(host, 0, host.scrollHeight, function () {
        bar.style.opacity = ""; bar.classList.add("cv-zoom-in");
        /* Once zoomed in, drop the animation so no transform lingers on the bar. */
        bar.addEventListener("animationend", function () { bar.classList.remove("cv-zoom-in"); }, { once: true });
      });
    }
  }
  function clearSelection() { selected = {}; renderGrid(); }

  /* ── Non-custodial held sources (Nimbus table) ────────────────────── */
  /* DATA GAPS counts sources, so it filters both tables (design decision 12): the custodian grid to the custodians
     with a gap source, and this table to its own gap sources; a note above the grid adds the two up. */
  function gapsOn() { return tileFilter === "gaps" || val("cvFilter") === "gaps"; }
  /* Preservation reads Hold status's own words (PRD 08 CV19: Coverage reads, it does not relabel): Applied → On hold,
     Attested, Partial, Unknown (decision 20). */
  function renderNonCustodial() {
    var all = M.sources.filter(function (s) { return !s.owner && !s.pending; });
    var gapIds = {}; gapSources().forEach(function (s) { gapIds[s.id] = true; });
    var ncAll = (gapsOn() ? all.filter(function (s) { return gapIds[s.id]; }) : all).slice().sort(function (a, b) { return protectionRank(a) - protectionRank(b); });
    document.getElementById("cvNcSort").innerHTML = ncAll.length > 1 ? '<span class="demo-label d-inline me-1">Sorted By:</span>Least protected first' : "";
    /* The conditional pager (more than 10 rows), as in the custodian panel; a secondary list, so no toolbar. */
    var ncSize = pgSize.cvnc || 10, ncPages = Math.max(1, Math.ceil(ncAll.length / ncSize));
    pgPage.cvnc = Math.min(pgPage.cvnc || 1, ncPages);
    var rows = ncAll.slice((pgPage.cvnc - 1) * ncSize, pgPage.cvnc * ncSize);
    pgTotal.cvnc = ncAll.length;
    setPager(document.getElementById("cvNcFoot"), ncAll.length > 10 ? D.pager("cvnc", ncAll.length, pgPage.cvnc, ncSize, "Sources per page:") : "");
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

  /* ── Crossfade ────────────────────────────────────────────────────── */
  /* View changes crossfade (Scott, 10-14): the old table is copied into a ghost layer over its .cv-xfade host, the new
     rows render underneath at opacity 0, then the ghost fades out as the new rows fade in (0.2s, as the selection
     toolbar's zoom) while the host eases from the old height to the new so the page below does not jump. Selection
     changes are not view changes and redraw in place. A change mid-fade finishes the running one first. */
  var xfTimer = null;
  /* Finish any running crossfade: drop the ghosts and the inline height. */
  function xfEnd() {
    clearTimeout(xfTimer);
    document.querySelectorAll(".cv-xfade").forEach(function (h) {
      h.querySelectorAll(".cv-xfade-ghost").forEach(function (g) { g.remove(); });
      h.classList.remove("cv-xf-start"); h.style.height = ""; h.style.overflow = ""; h.style.transition = "";
    });
  }
  /* Run `update` (a render) as a view change over both tables. */
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

  /* ── Counting rules and the render cycle ──────────────────────────── */
  /* Counting rules name what this case expects (CV14b), from the case setting the cells read. */
  function renderExpects() {
    var e = thisCase().expects;
    document.getElementById("cvExpects").textContent = "On this case: " + [e.survey.rule || e.survey.text, e.interview.rule || e.interview.text, e.collection.rule || e.collection.text].join(" · ") + ".";
  }
  /* Everything, after any change to the custodians (renderGrid also draws the non-custodial table). */
  function render() {
    renderBanner(); renderTiles(); renderGrid(); renderExpects();
    if (panel) renderPanel();
  }

  /* ── Actions ──────────────────────────────────────────────────────── */
  /* The send actions act on the selection, or on `only` (one custodian, from custodian coverage's section menus,
     decision 80g: the same menus for one person as for a selection). Only a toolbar send clears the selection.
     A new notification is not sent from here: the menus open the existing Create Legal Hold page (createHoldPage). */
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
    D.toast("Survey " + sId + " sent to " + plural(n, "custodian") + ".");
    render();
  }
  /* From the toolbar: the selection, workflow chosen in the dialog. From custodian coverage: `only` that custodian,
     with the section's workflow preselected (wf0). */
  /* ── People an action applies to, as Nimbus chips (Scott, 10-15) ──
     Every action dialog names who it reaches with one chip per custodian: their photo and name, or the grey lock
     avatar and "Profile details limited" for someone outside the viewer's regions. No remove (✕): the selection is
     changed on the grid. Replaces the "N selected" sentence and the Custodian label/value pair. */
  function personChip(c) {
    var p = person(c);
    return seen(c) ? '<span class="chip cv-chip-info"><img class="chip-img" src="../img/avatars/' + p.id + '.jpg" alt="" />' + esc(p.name) + "</span>" :
      '<span class="chip cv-chip-info"><span class="chip-img monogram demo-avatar-locked">' + LOCK + "</span>Profile details limited</span>";
  }
  function peopleField(list) {
    return '<div class="mb-3"><span class="cf-input-label d-block mb-1">' + (list.length === 1 ? "Custodian" : "Custodians · " + list.length) + "</span>" +
      '<div class="d-flex flex-wrap gap-1">' + list.map(personChip).join("") + "</div></div>";
  }
  /* Who an effect sentence names: one visible custodian by name, otherwise a count. */
  function whom(list) { return list.length === 1 ? (seen(list[0]) ? visibleName(list[0]) : "this custodian") : "the " + list.length + " selected custodians"; }
  var WF_NAME = { survey: "Survey", interview: "Interview", preservation: "Preservation" };
  /* The effect note follows the Workflow select (tone model: declarative, no instruction). */
  function nrEffect(wf, list) {
    return WF_NAME[wf] + " becomes N/A for " + whom(list) + ". It is no longer counted as a gap, and the case preservation report shows it as N/A with this reason.";
  }
  var nrList = [];
  ["change", "valueChanged.cnds.select"].forEach(function (ty) {
    document.addEventListener(ty, function (e) {
      if (!e.target || e.target.id !== "cvNrWf") return;
      var note = e.target.closest(".modal") && e.target.closest(".modal").querySelector(".note");
      if (note) note.textContent = nrEffect(e.target.value, nrList);
    });
  });
  function markNotRequired(only, wf0) {
    var list = only || selectedList();
    nrList = list;
    D.reasonDialog({
      title: "Mark Not Required",
      extra: peopleField(list) + D.select("cvNrWf", [["survey", "Survey"], ["interview", "Interview"], ["preservation", "Preservation"]], wf0 || "survey", "Workflow", { container: "{{modal}}", cls: "mb-3" }),
      help: "The reason is kept with the case record and appears in the case preservation report.",
      effect: nrEffect(wf0 || "survey", list),
      confirm: "MARK NOT REQUIRED"
    }).then(function (r) {
      if (!r) return;
      var wf = r.dialog.querySelector("#cvNrWf").value;
      list.forEach(function (c) {
        if (wf === "preservation") { c.notRequired = c.notRequired || {}; c.notRequired.preservation = r.reason; }
        else { c.notRequiredWf = c.notRequiredWf || {}; c.notRequiredWf[wf] = r.reason; }
      });
      if (!only) selected = {};
      D.toast(WF_NAME[wf] + " marked not required for " + whom(list) + ".");
      render();
    });
  }
  /* A custodian's notification or survey by its ID (the target of a tile's actions). */
  function instance(c, id) {
    return (c.lhn || []).filter(function (n) { return n.id === id; })[0] || (c.surveys || []).filter(function (s) { return s.id === id; })[0];
  }
  function remind(c, id) {
    var x = instance(c, id), n = (x.events || []).filter(function (e) { return /^Reminder/.test(e[2]); }).length + 1;
    x.events.push([TODAY, nowTime(), "Reminder " + n, me(), "Sent", "sent manually"]);
    D.toast("Reminder " + n + " sent for " + id + ".");
    render();
  }
  function resend(c, id) {
    instance(c, id).events.push([TODAY, nowTime(), "Notification resent", me(), "Sent", "email and Teams"]);
    D.toast("Legal hold notification " + id + " sent again to " + person(c).name + ".");
    render();
  }
  /* MARK COMPLETE (CV42a, new): writes the completion as an event; it is not marking the interview not required (CV42c). */
  function completeInterview(c, on, note) {
    c.interview.status = "Complete"; c.interview.completed = on || TODAY;
    c.interview.events.push([on || TODAY, on && on !== TODAY ? "" : nowTime(), "Marked complete", me(), "Complete", note || ""]);
    D.toast("Interview marked complete.");
    render();
  }

  /* ── Release from legal hold (PRD 08 §7.3) in a Nimbus offcanvas at 70% ── */
  /* A flyout, not a modal (Scott, 10-15): two tables and a form need the room, and the case stays visible beside it. */
  /* What stays preserved after release: the held sources, their kinds and the requests that hold them. */
  function sourcesStill(c) {
    var src = M.sourcesOf(c.personId).filter(function (s) { return s.hold === "Applied" || s.hold === "Attested" || s.hold === "Applying" || s.hold === "Overdue"; });
    var kinds = src.map(function (s) {
      return { "Exchange Online": s.note ? "inactive mailbox" : "mailbox", "OneDrive": "OneDrive", "Copilot interactions": "Copilot", "Laptop": "laptop", "Mobile device": "mobile" }[s.type] || s.type;
    });
    var reqs = {};
    src.forEach(function (s) { if (s.request) reqs[s.request] = true; });
    if (c.notRequired && c.notRequired.preservation) return { n: 1, kinds: ["mailbox (on MBP-0811)"], from: "PRS-0088", items: [{ kind: "Mailbox (on MBP-0811)", from: "PRS-0088" }] };
    return { n: src.length, kinds: kinds, from: Object.keys(reqs).join(", ") || "—",
      items: src.map(function (x, i) { return { kind: kinds[i].charAt(0).toUpperCase() + kinds[i].slice(1), from: x.request || "—" }; }) };
  }
  /* The release dialog, starting from `startIds` (the selection, or the panel's custodian). */
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
    var stacked = !!document.querySelector(".offcanvas.show");  /* opened from the custodian panel: BACK, not CANCEL */
    var m = D.offcanvas({ title: "Release from legal hold", width: "70vw", body: "", footer: " " });
    m.el.classList.add("cv-scope");  /* page type rules (12px .small) reach this flyout (Scott, 10-14) */
    var tbl = function (head, body, cls) { return '<div class="table-responsive mb-3"><table class="table align-middle mb-0' + (cls ? " " + cls : "") + '"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>"; };
    function draw() {
      /* Sorted by the name the viewer sees (a limited profile sorts as shown). */
      var list = candidates().slice().sort(function (x, y) { return D.nameFor(person(x)).localeCompare(D.nameFor(person(y))); });
      var on = list.filter(function (c) { return ticked[c.personId]; });
      var releasableHere = list.filter(releasable).length;
      var notified = on.filter(wasNotified);
      var silentOnly = on.filter(function (c) { return !wasNotified(c) && (c.lhn || []).length; });
      var left = list.filter(function (c) { return M.heldElsewhere[c.personId]; });
      var holds = on.reduce(function (n, c) { return n + (c.lhn || []).length; }, 0);
      m.el.querySelector(".offcanvas-title").textContent = "Release from legal hold · " + plural(on.length, "custodian");
      m.el.querySelector(".offcanvas-body").innerHTML =
        (readOnly ? '<div class="alert alert-warning mb-4" role="alert"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span>' +
          '<span class="alert-message">Read only. Only a Case Administrator can release custodians from a legal hold.</span></div>' : "") +
        '<div class="cf-category cf-cat-6 highlight-casefusion">Custodians</div>' +
        /* Who to show: a Nimbus toggle button group (radio btn-check, single select, as on My Work). Each choice shows that
           set with every releasable custodian ticked; the header checkbox selects all or none (Scott, 10-15). */
        '<div class="btn-group mb-2" role="group" aria-label="Who to show">' +
          [["all", "All on This Case", custodians.length], ["selected", stacked ? "This Custodian" : "Selected on Coverage", startIds.length], ["departed", "Departed", custodians.filter(function (c) { return person(c).departed; }).length]].map(function (x) {
            var id = m.id + "-who-" + x[0];
            return '<input type="radio" class="btn-check" name="cvRelWho" id="' + id + '" value="' + x[0] + '" autocomplete="off"' + (chip === x[0] ? " checked" : "") + ">" +
              '<label class="btn btn-secondary btn-sm" for="' + id + '">' + x[1] + " (" + x[2] + ")</label>"; }).join("") + "</div>" +
        metaRow('<p class="cv-meta text-muted mb-2 cv-meta-line"><span class="demo-label d-inline me-1">Sorted By:</span>Custodian</p>' +
          '<p class="cv-meta text-muted mb-2 cv-meta-line"><span class="demo-label d-inline me-1">Selected:</span>' + on.length + " · " + plural(holds, "legal hold") + (left.length ? " · " + plural(left.length, "custodian") + " held on another case, left out" : "") + "</p>") +
        tbl(['<div class="form-check mb-0"><input type="checkbox" class="form-check-input" id="cvRelAll"' + (releasableHere && !readOnly ? "" : " disabled") +
              (releasableHere && on.length === releasableHere ? " checked" : "") + ' aria-label="Select all custodians who can be released" /></div>', "Custodian", "Legal Holds", "After Release"], list.map(function (c) {
          var p = person(c), held = M.heldElsewhere[c.personId], st = sourcesStill(c);
          /* One hold per line: the reference, its status badge, and the date it was acknowledged (multi-value rows). */
          var holdsCell = (c.lhn || []).map(function (n) {
            return '<div class="cv-rel-hold"><span class="cv-rel-hold-id">' + esc(n.id) + "</span>" + lhnBadge(n.status, "Silent legal hold") +
              (n.status === "Acknowledged" && n.on ? '<span class="text-muted small text-nowrap">' + esc(short(n.on)) + "</span>" : "") + "</div>";
          }).join("") || '<span class="text-muted">—</span>';  /* no hold: the grid's dash, so the rows that matter stand out */
          var warn = function (t) { return '<span class="d-block small text-warning-emphasis">' + t + "</span>"; };
          /* The other case is named only when the viewer can open it; otherwise it is a hold and nothing more (CV64). */
          var after = held ? (D.canOpenCase(held.caseId) ? "Still on hold for " + esc(held.caseName) + warn("Held on another accessible case") : "Still on hold on another case" + warn("Held on another case")) : c.released ? "Already released" :
            !(c.lhn || []).length ? "Not on a legal hold" + '<span class="d-block small text-muted">Nothing to release</span>' :
            st.n + " source" + (st.n === 1 ? " stays" : "s stay") + " preserved" +
 (p.departed && !c.notRequired ? warn("Mailbox stays inactive and preserved while any hold remains") : "") +
            (c.silent && !wasNotified(c) ? warn("Nothing was sent, so no release notice is sent") : "");
          return '<tr><td><div class="form-check mb-0"><input type="checkbox" class="form-check-input" data-tick="' + c.personId + '"' + (ticked[c.personId] ? " checked" : "") + (releasable(c) && !readOnly ? "" : " disabled") +
            ' aria-label="Release ' + esc(D.nameFor(p)) + '" /></div></td><td><span class="fw-bold' + (D.canSee(p) ? "" : " demo-masked") + '">' + esc(D.nameFor(p)) + '</span><span class="d-block small text-muted">' +
            (D.canSee(p) ? esc(p.title) + (p.departed ? " · Departed " + esc(M.fmtDate(p.departed)) : "") : "Outside your regions") + "</span></td><td>" + holdsCell + "</td><td>" + after + "</td></tr>";
        }).join(""), "cv-rel-table") +
        /* 48px (mt-5) between the flyout's sections, the house section step (Scott, 10-15). */
        '<div class="cf-category cf-cat-6 highlight-casefusion mt-5">Release Notice</div>' +
        '<div class="row g-3 mb-3"><div class="col-md-6">' + D.select("cvRelNotice", [["standard", "Standard Release Notice"], ["retention", "Release Notice with Retention Reminder"], ["none", "No Notice"]], notice, "Notice", { container: "#" + m.id }) +
          /* Who gets the notice is a choice, as in the canvas (ReleaseLegalHold.dc.html): checked by default, unchecked and
             disabled under No Notice. A silent-hold custodian is named as receiving nothing. */
          /* The checkbox sits level with the select's field (not the whole component with its label); the silent-hold note is
             the checkbox's Nimbus helper text (.form-text), indented under its label. */
          '</div><div class="col-md-6"><div class="cv-rel-send"><div class="form-check mb-0"><input type="checkbox" class="form-check-input" id="cvRelSend"' + (sendTo && notice !== "none" && notified.length ? " checked" : "") +
            (notice === "none" || !notified.length || readOnly ? " disabled" : "") + ' /><label class="form-check-label" for="cvRelSend">' + (!on.length ? "No one selected" : !notified.length ? "No one selected was notified" :
            "Send to the " + notified.length + " custodian" + (notified.length === 1 ? " who was" : "s who were") + " notified") + "</label>" +
          (silentOnly.length ? '<div class="form-text">' + esc(silentOnly.map(function (c) { return D.nameFor(person(c)); }).join(", ")) + " " + (silentOnly.length === 1 ? "is" : "are") + " on a silent legal hold and receive" + (silentOnly.length === 1 ? "s" : "") + " nothing.</div>" : "") + "</div></div></div></div>" +
        '<div class="cf-category cf-cat-6 highlight-casefusion mt-5">What Stays Preserved</div>' +
        '<p>Releasing a custodian from the legal hold does not release their sources or delete collected data.</p>' +
        /* One source per line with the request that holds it (multi-value rows), for each custodian being released. */
        (on.length ? (on.length > 1 ? '<p class="cv-meta text-muted mb-2 cv-meta-line"><span class="demo-label d-inline me-1">Sorted By:</span>Custodian</p>' : "") +
          tbl(["Custodian", "Sources Still Preserved", "Held By"], on.map(function (c) {
            var st = sourcesStill(c);
            var lines = function (k) { return st.items.map(function (x) { return '<div class="cv-rel-src">' + esc(x[k]) + "</div>"; }).join("") || "—"; };
            return '<tr class="align-top"><td class="fw-bold">' + esc(D.nameFor(person(c))) + "</td><td>" + lines("kind") + "</td><td>" + lines("from") + "</td></tr>";
          }).join("")) : "") +
        '<p>Non-custodial sources they use (Box folder, Webex space, Teams teams) belong to the case and stay. 1 collection request is still open: COL-0142.</p>' +
        /* Entry point to Release readiness (PRD 08 §7.4, CV65; the screen is PRD 13's): every mechanism, in every case. */
        '<p class="mb-0 d-flex flex-wrap align-items-center gap-2">Other cases, retention policies and delay holds can also preserve their data; release readiness lists every one. ' +
          '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Release+readiness+(PRD+13)">RELEASE READINESS</a></p>' +
        /* The reason comes last, after the consequences, next to the commit buttons (design decision 53). */
        '<hr class="hr hr-blurry mt-5 mb-4" aria-hidden="true" />' +
        '<div class="cf-input-field cf-input-field-casefusion mb-0"><label class="cf-input-label" for="cvRelReason">Reason <span class="cf-input-required">*</span></label>' +
          '<div class="cf-input-wrapper"><textarea id="cvRelReason" class="cf-input-control" rows="2"' + (readOnly ? " disabled" : "") + ">" + esc(reason) + "</textarea></div>" +
          '<div class="cf-input-helper"><span class="cf-input-helper-text">The reason is kept with the case record.</span></div></div>' +
        (readOnly ? "" : '<p class="cv-meta text-muted mt-3 mb-0">RELEASE AND CREATE CLEANUP REQUEST opens a cleanup request with these custodians\' sources selected and the reason <em>Custodian released from legal hold</em>.</p>');
      var ok = on.length && reason.trim() && !readOnly;
      /* The footer holds only the actions (Scott, 10-15): the cleanup note sits under Reason, the read-only notice at the top. */
      m.el.querySelector(".offcanvas-footer").innerHTML =
        '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">' + (stacked ? "BACK" : readOnly ? "CLOSE" : "CANCEL") + "</button>" +
        '<button type="button" class="btn btn-secondary" data-rel="release"' + (ok ? "" : " disabled") + ">RELEASE ONLY</button>" +
        '<button type="button" class="btn btn-primary" data-rel="cleanup"' + (ok ? "" : " disabled") + ">RELEASE AND CREATE CLEANUP REQUEST</button>";
      var all = m.el.querySelector("#cvRelAll"); if (all) all.indeterminate = on.length > 0 && on.length < releasableHere;
      if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(m.el);
      if (readOnly) { var ns = m.el.querySelector("#cvRelNotice"); var inst = ns && window.Nimbus && Nimbus.Select && Nimbus.Select.getInstance(ns); if (inst && inst.disable) inst.disable(); else if (ns) ns.disabled = true; }
    }
    /* Typing the reason only toggles the commit buttons, so the field keeps focus (no redraw). */
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
      if (e.target.name === "cvRelWho") { chip = e.target.value; tickDefault(); draw(); }
      if (e.target.id === "cvRelAll") { if (e.target.checked) tickDefault(); else ticked = {}; draw(); }
    }
    m.el.addEventListener("change", onChange);
    m.el.addEventListener("valueChanged.cnds.select", onChange);
    m.el.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      var a = t.getAttribute("data-rel");
      if (a === "release" || a === "cleanup") {
        var on = candidates().filter(function (c) { return ticked[c.personId]; });
        var told = sendTo && notice !== "none" ? on.filter(wasNotified).length : 0;
        on.forEach(function (c) { c.released = TODAY; });
        selected = {};
        m.hide();
        if (a === "cleanup") { window.location.href = "not-in-demo.html?what=Data+cleanup+request"; return; }
        D.toast(plural(on.length, "custodian") + " released from legal hold. Their sources stay preserved." +
          (told ? " Release notice sent to " + told + "." : " No release notice was sent."));
        render();
      }
    });
    draw();
  }

  /* ── Custodian coverage (PRD 08 §7.2, CustodianCoverage.dc.html) in a Nimbus offcanvas at 90% (a list). ──
     Header: photo, name, the standing summary as chips (CV40), VIEW PROFILE and EXPORT AS for this custodian (CV47).
     Summary cards: the grid row restated, one per workflow, each jumping to its drawer. Then the five workflows as
     drawer cards (the house .card-drawer, as My Work), open by default; a drawer the reader shuts stays shut from
     custodian to custodian. Inside: the custodian's notifications, surveys and interview as nested tiles with their
     timelines (CV41), and sources as SOURCE · STATUS · FROM tables with their provenance (CV43); then the section's
     own next steps on a footer row (CV45). A workflow the case does not expect starts shut.
     Follow-on steps (view a notification, record an acknowledgment, mark an interview complete) open as stacked
     drawers over the panel (casefusion stacked-offcanvas pattern: BACK closes only the stacked drawer). */
  var panel = null, panelId = null, secOpen = {};

  /* ── Panel: timelines (CV41) ── */
  /* Timeline outcome words → badge colour (status colour semantics). */
  var TONE = { Sent: "success", Acknowledged: "success", Answered: "success", Tracked: "secondary", Escalated: "danger", "Not answered": "warning",
    Overdue: "warning", Scheduled: "info", Rescheduled: "info", Complete: "success" };
  /* A long timeline shows its last three events; SHOW N EARLIER reveals the rest, and the choice holds while the
     panel is open (CV41: the history stays one click away). */
  var tlOpen = {};
  function hiddenCount(list, key) { return list.length > 3 && !tlOpen[key] ? list.length - 3 : 0; }
  /* The toggle sits in the tile's footer, on the left, opposite the forward actions (Scott, 10-15). */
  function moreBtn(list, key) {
    var hide = hiddenCount(list || [], key);
    return (list || []).length > 3 ? '<button type="button" class="btn btn-tertiary btn-sm me-auto" data-cv-tl="' + key + '" aria-expanded="' + !hide + '">' +
      (hide ? "SHOW " + hide + " EARLIER" : "HIDE EARLIER") + "</button>" : "";
  }
  /* A timeline (CV41): date · event · actor · outcome, one list row each. Solid row dividers, none under the last. */
  function timeline(events, key) {
    var list = events || [], hide = hiddenCount(list, key);
    return '<ul class="list-group list-group-flush cv-tl">' + list.slice(hide).map(function (e) {
      /* The event, with how it happened under it (12px, muted); then BY: and the actor, always a person or CaseFusion. */
      return '<li class="list-group-item"><span class="cv-tl-when">' + esc(M.fmtDateTime(e[0], e[1])) + '</span><span class="cv-tl-what">' + esc(e[2]) +
        (e[5] ? '<span class="d-block small text-muted">' + esc(e[5]) + "</span>" : "") +
        '</span><span class="cv-tl-who"><span class="demo-label d-inline me-1">By:</span>' + esc(e[3]) + "</span>" + badgeHtml(e[4], TONE[e[4]] || "light") + "</li>";
    }).join("") + "</ul>";
  }

  /* ── Panel: record tiles ── */
  /* A nested tile, as the PM canvas lists a custodian's notifications and surveys (Scott, 10-15): one tile per
     instance, stacked 8px apart. Header band: reference link, name, status badge, and the aside at the right
     (recipients, due date); then its timeline (CV41); its actions small tertiary at the bottom right. */
  function recordTile(o) {
    /* The reference opens what the tile's own VIEW action opens, so one object opens one way (o.view). */
    return '<div class="card card-basic cv-tile"><div class="cv-tile-head">' + (o.view ? '<a href="#" class="fw-bold" ' + o.view + ">" + esc(o.id) + "</a>" : '<a href="' + o.href + '" class="fw-bold">' + esc(o.id) + "</a>") +
      '<span class="cv-tile-name">' + esc(o.title) + "</span>" + o.badge + '<span class="cv-meta text-muted ms-auto">' + esc(o.aside || "") + "</span></div>" +
      '<div class="cv-tile-body">' + timeline(o.events, panelId + ":" + o.id) + tileFooter(moreBtn(o.events, panelId + ":" + o.id), o.acts) + "</div></div>";
  }
  /* Tile footer: SHOW EARLIER on the left, the tile's actions on the right, under a blurry rule that sets the actions
     apart from the timeline rows (Scott, 10-15); none when empty. */
  function tileFooter(more, acts) {
    return more || acts ? '<hr class="hr hr-blurry cv-tile-rule" aria-hidden="true" /><div class="card-actions justify-content-end">' + (more || "") + (acts || "") + "</div>" : "";
  }
  function tileStack(list) { return '<div class="cv-tile-stack">' + list.join("") + "</div>"; }
  /* A notification's status badge; a silent hold reads "Silent legal hold" on its tile, "Tracked" in a recipient list. */
  function lhnBadge(status, silentLabel) {
    return status === "Silent" ? badgeHtml(silentLabel, "secondary") : status === "Acknowledged" ? badgeHtml("Acknowledged", "success") :
      status === "Sent" ? badgeHtml("Sent", "info") : badgeHtml("Not acknowledged", "danger");
  }

  /* ── Panel: sorting ── */
  /* Default order, stated where the list is (Scott, 10-15): every nested list has one deliberate order, named in a
     "SORTED BY:" meta line (Hold Status's wording), shown when the list has two or more items. Notifications and
     surveys: needs action first, then newest. Timelines: oldest first (the story of what was done). Sources: least
     protected / least collected first, Hold Status's ranking. */
  var SEVERITY = { "Not applied": 0, "Overdue": 1, "Partial": 2, "Applying": 3, "Removing": 3, "Unknown": 4, "Applied": 5, "Attested": 6 };
  var COLLECTED = { Failed: 0, Retrying: 1, "Not started": 2, "In progress": 3, Collected: 4 };
  function sortLine(text) { return '<p class="cv-meta text-muted mb-2 cv-meta-line"><span class="demo-label d-inline me-1">Sorted By:</span>' + esc(text) + "</p>"; }
  function firstDate(x) { return ((x.events || [])[0] || [""])[0]; }
  function actionThenNewest(isAction) {
    return function (a, b) { return (isAction(a) ? 0 : 1) - (isAction(b) ? 0 : 1) || (firstDate(a) < firstDate(b) ? 1 : firstDate(a) > firstDate(b) ? -1 : 0); };
  }
  /* Least protected first; a source not requested yet sits between Partial and Applying. */
  function protectionRank(s) { return s.pending ? 2.5 : s.hold in SEVERITY ? SEVERITY[s.hold] : 9; }

  /* ── Panel: pagers and source tables ── */
  /* Conditional pager (the nested-list rule): a source table longer than 10 rows gets the standard pager, 10 per page;
     no toolbar. Pages reset when the panel moves to another custodian. Keys: cvp-preservation, cvp-collection, and
     cvnc (the non-custodial table, outside the panel). */
  var pgPage = {}, pgSize = {}, pgTotal = {};
  function paged(key, rows, label) {
    pgTotal[key] = rows.length;
    if (rows.length <= 10 && !pgSize[key]) return { rows: rows, pager: "" };
    var size = pgSize[key] || 10, pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(pgPage[key] || 1, pages);
    pgPage[key] = page;
    return { rows: rows.slice((page - 1) * size, page * size), pager: rows.length > 10 ? D.pager(key, rows.length, page, size, label, panel ? "#" + panel.id : null) : "" };
  }
  /* Sources as the PM canvas lists them (Scott, 10-15): a table with SOURCE · STATUS · FROM, the source over its
     location, the status with its qualifier under it, FROM the provenance (request · mechanism, CV43). The
     drawer's footer carries the next steps, so the rows have no actions. */
  function srcTable(rows) {
    return '<div class="table-responsive"><table class="table align-middle mb-0 cv-src"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  /* Identity: the record's name (14px bold), then a 12px line; `sub` is HTML. */
  function ident(name, sub) { return '<span class="d-block fw-bold">' + esc(name) + "</span>" + (sub ? '<div class="small text-muted">' + sub + "</div>" : ""); }
  /* A status qualifier under the badge (12px), toned when it needs attention. */
  function qual(text, tone) { return '<span class="d-block small mt-1' + (tone ? " text-" + tone + "-emphasis" : "") + '">' + text + "</span>"; }

  /* ── Panel: workflow drawers ── */
  /* A workflow drawer: the house drawer card (Nimbus .card-drawer; demo.css "Drawer card", as My Work and Data map).
     The top row is the category heading, the workflow's one-line state and the chevron; the body is a Nimbus
     .collapse holding the records, then the section's next steps on a footer row (forward right).
     A workflow the case does not expect starts shut (`quiet`), so the panel opens on what matters (Scott, 10-15);
     once the reader opens or shuts a drawer, that choice holds for every custodian. */
  /* The meta lines that lead a drawer (EXPECTED, SORTED BY) share one line, divided by a blurry rule, so they take
     one line of the drawer, not two (Scott, 10-15). They wrap onto two lines only when the panel is too narrow. */
  var META = /^(?:<p class="cv-meta text-muted mb-2 cv-meta-line">[\s\S]*?<\/p>)+/;
  function metaRow(body) {
    var m = META.exec(body);
    if (!m) return body;
    var items = m[0].match(/<p class="cv-meta text-muted mb-2 cv-meta-line">[\s\S]*?<\/p>/g).map(function (x) { return x.replace(/^<p[^>]*>|<\/p>$/g, ""); });
    return '<div class="cv-meta-row">' + items.map(function (i) { return "<span>" + i + "</span>"; }).join('<span class="vr vr-blurry" aria-hidden="true"></span>') + "</div>" + body.slice(m[0].length);
  }
  function drawer(key, title, summary, body, acts, quiet) {
    var open = key in secOpen ? secOpen[key] : !quiet;
    body = metaRow(body);
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
    /* Smart placement (Nimbus 9.0.108, data-cnds-flip): opens down, and up only when the panel has no room below. */
    return '<div class="dropdown"><button type="button" class="btn btn-secondary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" data-cnds-flip="true" aria-expanded="false" aria-haspopup="menu">' + label +
      ' <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end" role="menu">' + items + "</ul></div>";
  }
  /* Why a workflow is or is not expected of this custodian (CV14b), as a meta line with an inline label. A
     not-expected workflow names the case's rule and why this custodian falls outside it. */
  function expectLine(c, wf) {
    var e = M.expectation(c, wf);
    var outside = { survey: "Not on LH-0031, so the case does not expect a survey.", interview: "Not tagged Key Custodian, so the case does not expect an interview.",
      collection: "No collection is marked for this custodian." }[wf];
    var ex = thisCase().expects[wf], rule = ex.rule || ex.text;
    return '<p class="cv-meta text-muted mb-2 cv-meta-line"><span class="demo-label d-inline me-1">' + (e.yes ? "Expected:" : "Not Expected:") + "</span>" +
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
    /* One tile per notification or silent legal hold the custodian is on: needs action first, then newest. */
    var lhn = (c.lhn || []).slice().sort(actionThenNewest(function (n) { return n.status !== "Acknowledged" && n.status !== "Sent" && n.status !== "Silent"; }));
    var rows = lhn.map(function (n) {
      var h = holdById(n.id) || { title: "" };
      var to = custodians.filter(function (x) { return (x.lhn || []).some(function (y) { return y.id === n.id; }); }).length;
      var silent = n.status === "Silent";
      /* Damage order (house rule): VIEW LEGAL HOLD, on every tile, is rightmost; each action to its left changes more,
         so the most consequential is leftmost (Scott, 10-15). */
      var view = btn("VIEW LEGAL HOLD", 'data-cv-view-lh="' + n.id + '"');
      var acts = silent ? link("REMOVE FROM LEGAL HOLD", "not-in-demo.html?what=Remove+from+legal+hold&amp;ships=1") + view :
        n.status === "Acknowledged" ? view :
        btn("RECORD ACKNOWLEDGMENT", 'data-cv-ack="' + n.id + '"') + btn("RESEND NOTIFICATION", 'data-cv-resend="' + n.id + '"') + btn("SEND REMINDER", 'data-cv-remind="' + n.id + '"') + view;
      return recordTile({ id: n.id, view: 'data-cv-view-lh="' + n.id + '"', title: h.title, badge: lhnBadge(n.status, "Silent legal hold"),
        aside: silent ? "Nothing sent to the custodian" : "Sent to " + plural(to, "custodian"), events: n.events, acts: acts });
    });
    var body = rows.length ? (rows.length > 1 ? sortLine("Needs action first, then newest · each timeline oldest first") : "") + tileStack(rows) : empty("No legal hold notification", "No legal hold notification has been sent to this custodian.");
    var menu = item("", "New Legal Hold Notification …", "Opens Create Legal Hold with this custodian as the recipient", createHoldPage([byPid(pid)])) +
      groupHead("Settings From a Notification") +
      holdsOf(false).map(function (h) { return groupItem("", h.id + " · " + h.title.split(" · ")[0], h.settings, createHoldPage([byPid(pid)], h.id)); }).join("") +
      groupHead("Silent Legal Hold") +
      holdsOf(true).map(function (h) {
        var on = (c.lhn || []).some(function (x) { return x.id === h.id; });
        return on ? '<li><span class="dropdown-item dropdown-group-item disabled" aria-disabled="true">' + esc(h.id + " · " + h.title) + '<span class="dropdown-item-secondary-text">Already tracked</span></span></li>' :
          groupItem('data-send-silent="' + h.id + '" data-one="' + pid + '"', h.id + " · " + h.title, "Track this custodian; nothing is sent");
      }).join("");
    var release = releasable(c) ? btn("RELEASE FROM HOLD", 'data-cv="panel-release"', "btn-secondary") :
      off("RELEASE FROM HOLD", c.released ? "Already released." : "Not on a legal hold: nothing to release.", "btn-secondary");
    /* Damage order throughout the panel: the most consequential action leftmost, views rightmost (Scott, 10-15). */
    return drawer("lhn", "Legal Hold Notification", sum, body, release + sendMenu("SEND LEGAL HOLD NOTIFICATION", menu));
  }

  function surveyDrawer(c) {
    var pid = c.personId, sv = c.surveys || [];
    var na = c.notRequiredWf && c.notRequiredWf.survey, exp = M.expectation(c, "survey").yes;
    var answered = sv.filter(function (x) { return x.status === "Answered"; }).length, late = sv.filter(function (x) { return x.status === "Escalated" || x.status === "Not answered"; }).length;
    var sum = na ? "Not required" : !exp ? "Not expected on this case" + (sv.length ? " · " + plural(sv.length, "survey") + " sent" : "") : !sv.length ? "Not sent" :
      [plural(sv.length, "survey"), answered + " answered", late ? late + " overdue" : ""].filter(Boolean).join(" · ");
    /* One tile per survey sent to the custodian. */
    var rows = sv.slice().sort(actionThenNewest(function (x) { return x.status !== "Answered" && x.status !== "Sent"; })).map(function (x) {
      var def = M.surveys.filter(function (d) { return d.id === x.id; })[0];
      var done = x.status === "Answered";
      var reported = (x.events || []).some(function (e) { return /reported/.test(e[2]); });
      var badge = done ? badgeHtml("Answered", "success") : x.status === "Sent" ? badgeHtml("Sent", "info") : badgeHtml("Not answered", "danger");
      var acts = done ? (reported ? link("ADD REPORTED LOCATION", "case-add-sources.html") : "") + link("VIEW ANSWERS", "not-in-demo.html?what=Survey+answers&amp;ships=1") :
        /* No MARK NOT REQUIRED here: not required covers the survey workflow for this custodian (CV14), which is the
           footer's action; a second copy on each survey read as a per-survey choice that doesn't exist. */
        btn("SEND REMINDER", 'data-cv-remind="' + x.id + '"') + link("VIEW SURVEY", "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1");
      return recordTile({ id: x.id, href: "not-in-demo.html?what=Survey+" + x.id + "&amp;ships=1", title: def.title + " · " + def.questions + " questions", badge: badge,
        aside: done ? "Answered " + short(x.on) : "Due " + short(x.due || def.due), events: x.events, acts: acts });
    });
    var body = expectLine(c, "survey") + (na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" : !sv.length ? (exp ? empty("No survey sent", "The case expects a survey from this custodian, and none has been sent.") : "") :
      (rows.length > 1 ? sortLine("Needs action first, then newest · each timeline oldest first") : "") + (exp ? "" : OFF_PLAN) + tileStack(rows) + '<p class="cv-meta text-muted mt-2 mb-0">Locations named in survey answers are added as reported locations for review.</p>');
    var menu = item("", "New Survey …", "Opens the survey form with this custodian", "not-in-demo.html?what=New+survey&amp;ships=1") +
      groupHead("Settings From a Survey") +
      M.surveys.map(function (d) { return groupItem('data-send-survey="' + d.id + '" data-one="' + pid + '"', d.id + " · " + d.title, d.questions + " questions"); }).join("");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : !exp ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="survey"', "btn-secondary");
    return drawer("survey", "Survey", sum, body, nr + sendMenu("SEND SURVEY", menu), !exp && !sv.length && !na);
  }

  /* Interview (CV42–CV42c): states the fact and does not advise. SCHEDULE is open on every custodian (CV42aa);
     a booked interview offers RESCHEDULE and MARK COMPLETE. SCHEDULE and RESCHEDULE open the existing Schedule Interview
     page (schedulePage); MARK COMPLETE is a small form here, the capability being new (CV42a). */
  function interviewDrawer(c) {
    var iv = c.interview, na = c.notRequiredWf && c.notRequiredWf.interview, exp = M.expectation(c, "interview").yes;
    var state = !iv ? "" : iv.status === "Complete" ? "Complete " + short(iv.completed) : "Scheduled " + short(iv.date);
    var sum = na ? "Not required" : !exp ? "Not expected on this case" + (iv ? " · " + state.toLowerCase() : "") : !iv ? "Not scheduled" : state;
    var body = expectLine(c, "interview") + (na ? '<p class="cv-meta mb-0">Not required: ' + esc(na) + "</p>" :
      !iv ? (exp ? '<p class="mb-0">Not scheduled.</p>' : "") : (exp ? "" : OFF_PLAN) +
      tileStack([recordTile({ id: "Interview", href: "not-in-demo.html?what=Interview&amp;ships=1", title: "with " + iv.with + " · " + iv.where,
        badge: iv.status === "Complete" ? badgeHtml("Complete", "success") : badgeHtml("Scheduled", "info"),
        aside: iv.status === "Complete" ? "Completed " + short(iv.completed) : M.fmtDateTime(iv.date, iv.time), events: iv.events,
        acts: iv.status === "Complete" ? "" : btn("MARK COMPLETE", "data-cv-iv-done") + link("RESCHEDULE", schedulePage(c, true)) })]));
    var sched = iv && iv.status !== "Complete" ? off("SCHEDULE", "An interview is already scheduled: use RESCHEDULE.", "btn-secondary") : link("SCHEDULE", schedulePage(c, false), "btn-secondary");
    var nr = na ? off("MARK NOT REQUIRED", "Already not required.", "btn-secondary") : !exp ? off("MARK NOT REQUIRED", EXPECT_WHY, "btn-secondary") :
      iv && iv.status === "Complete" ? off("MARK NOT REQUIRED", "The interview happened: complete is not the same as not required (CV42c).", "btn-secondary") : btn("MARK NOT REQUIRED", 'data-cv-nr="interview"', "btn-secondary");
    return drawer("interview", "Interview", sum, body, nr + sched, !exp && !iv && !na);
  }

  /* Preservation: one row per source. A location reported in a survey but not added yet shows as such, with a dash
     for FROM, and counts in neither number (CV44). */
  function preservationDrawer(c, v) {
    var src = M.sourcesOf(c.personId), rep = c.reported || [];
    var sum = v.preservation.state === "na" ? "Not required" : v.preservation.text.replace(" on hold", " sources on hold") + (rep.length ? " · " + rep.length + " reported, not added" : "");
    var hs = ' · see <a href="case-hold-status.html">Hold status</a>';
    var rows = src.slice().sort(function (a, b) { return protectionRank(a) - protectionRank(b); }).map(function (s) {
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
    var pg = paged("cvp-preservation", rows, "Sources per page:");
    var body = v.preservation.state === "na" ? '<p class="cv-meta mb-0">Not required: ' + esc(c.notRequired.preservation) + "</p>" :
      (rows.length > 1 ? sortLine("Least protected first" + (rep.length ? " · reported locations last" : "")) : "") + srcTable(pg.rows) + pg.pager;
    return drawer("preservation", "Preservation", sum, body,
      link("PRESERVATION REQUEST FOR GAPS", "case-new-preservation.html?custodians=" + c.personId, "btn-secondary") + link("OPEN HOLD STATUS", "case-hold-status.html", "btn-secondary") +
      /* Entry point to Release readiness (PRD 08 §7.4, CV65): every mechanism preserving this person's data, in every case. */
      link("RELEASE READINESS", "not-in-demo.html?what=Release+readiness+(PRD+13)", "btn-secondary"));
  }

  function collectionDrawer(c, v) {
    var col = c.collection, exp = M.expectation(c, "collection").yes;
    var tone = { Collected: "success", Failed: "danger", Retrying: "warning", "Not started": "secondary", "In progress": "info" };
    var items = (col && col.items) || [];
    var failed = items.some(function (x) { return x.status === "Failed"; });
    var body = expectLine(c, "collection") + (!exp ? "" : !items.length ? empty("No collection yet", "The case expects a collection from this custodian, and none has been requested.") : colTable(items.slice().sort(function (a, b) { return COLLECTED[a.status] - COLLECTED[b.status]; }).map(function (x) {
      var s = M.sources.filter(function (y) { return y.id === x.source; })[0];
      /* FROM: the package for what was collected, the request otherwise; each a link to where it lives. */
      var ref = /^PKG-/.test(x.from) ? '<a href="not-in-demo.html?what=Collection+package+' + x.from + '">' + esc(x.from) + "</a>" : reqLink(x.from);
      return [ident(M.typeLabel(s.type), esc(s.name)), badgeHtml(x.status, tone[x.status] || "light"), ref + " · " + esc(x.note)];
    })));
    function colTable(rows) { var pg = paged("cvp-collection", rows, "Sources per page:"); return (rows.length > 1 ? sortLine("Least collected first") : "") + srcTable(pg.rows) + pg.pager; }
    return drawer("collection", "Collection", !exp ? "Not expected on this case" : v.collection.text + (v.collection.state !== "done" && v.collection.detail ? " · " + v.collection.detail : ""), body,
      link("COLLECTION REQUEST FOR GAPS", "not-in-demo.html?what=Collection+request", "btn-secondary") +
      (failed ? link("VIEW FAILURES", "not-in-demo.html?what=Collection+failures", "btn-secondary") : off("VIEW FAILURES", "No collection from this custodian has failed.", "btn-secondary")), !exp);
  }

  /* ── Panel: render ── */
  /* Severity, as Hold Status colours its cards (Scott, 10-15): danger when something is late or failed (action),
     warning when something expected has not started (todo: Not scheduled, Not sent, Not requested). Healthy and
     in-flight workflows stay neutral: colouring good news is noise. */
  function severity(x) { return x.state === "action" ? "danger" : x.state === "todo" ? "warning" : ""; }
  /* Redraw the open panel in place, keeping its scroll position. */
  function renderPanel() {
    var c = byPid(panelId), p = person(c), v = cov(c), ok = seen(c);
    var keep = panel.el.querySelector(".offcanvas-body"), top = keep ? keep.scrollTop : 0;
    /* Summary cards, the Hold Status pattern (Scott, 10-15): one card per workflow, each opening its drawer. A
       workflow's card is toned by severity. A limited profile has no drawers, so its cards are plain, not buttons.
       Values are words (Not acknowledged), so they take 16px, not the 24.5px of a count. These cards jump, they
       don't filter, so they are not toggles (no aria-pressed) and keep Nimbus's full outline border. */
    var strip = '<div class="demo-tiles cv-ptiles" role="group" aria-label="Workflows">' + [["lhn", "Legal Hold Notification", v.lhn], ["survey", "Survey", v.survey], ["interview", "Interview", v.interview], ["preservation", "Preservation", v.preservation], ["collection", "Collection", v.collection]].map(function (x) {
      var tone = severity(x[2]);
      var inner = '<span class="card-subtitle demo-tile-name">' + x[1] + '</span><span class="card-title demo-tile-value">' + esc(x[2].text) + "</span>" +
        '<span class="card-text demo-tile-label">' + esc(x[2].state === "dash" ? "Not expected" : x[2].detail || "") + "</span>";
      var cls = "card " + (tone ? "card-outline card-" + tone : "card-basic") + " demo-tile";
      return ok ? '<button type="button" class="' + cls + '" data-cv-jump="' + x[0] + '"' + (tone ? ' data-tone="' + tone + '"' : "") + ">" + inner + "</button>" :
        '<div class="' + cls + '"' + (tone ? ' data-tone="' + tone + '"' : "") + ">" + inner + "</div>";  /* data-tone keeps the shell's tile observer off its outline */
    }).join("") + "</div>";
    if (!ok) {
      /* The monogram carries the lock (no photo: a photo is a profile detail), sized as the 42px photo avatar, so the name line does not repeat it; normal style, no italics (Scott, 10-14). */
      panel.setBody('<div class="cv-scope"><div class="d-flex align-items-center gap-3 mb-3"><span class="monogram demo-avatar demo-avatar-locked">' + LOCK + '</span><div><div class="h5 mb-0 demo-masked">Profile details limited</div>' +
        '<div class="cv-meta text-muted">This custodian is outside your regions. Their coverage counts on this case; their details are visible to the case team in their region.</div></div></div>' + strip + "</div>");
      return;
    }
    /* The standing summary (CV40): where this person stands, as chips. */
    var notices = (c.lhn || []).filter(function (n) { return n.status !== "Silent"; });
    var unack = notices.filter(function (n) { return n.status !== "Acknowledged"; }).length, silentN = (c.lhn || []).length - notices.length;
    var need = WORKFLOWS.filter(function (k) { return v[k].state === "action"; }).length;
    var PT = { done: "success", progress: "info", action: "danger", na: "light", todo: "warning", silent: "secondary", dash: "light" };
    var chips = [badgeHtml("Custodian", "info"),
      v.preservation.state === "na" ? badgeHtml("Preservation not required", "light") : badgeHtml(v.preservation.text.replace(" on hold", " sources on hold"), PT[v.preservation.state]),
      unack ? badgeHtml(plural(unack, "notification") + " not acknowledged", "danger") : "", silentN ? badgeHtml("In " + plural(silentN, "silent legal hold"), "secondary") : "",
      need ? badgeHtml(plural(need, "workflow") + " need" + (need === 1 ? "s" : "") + " attention", "warning") : "",
      c.released ? badgeHtml("Released " + short(c.released), "success") : ""].filter(Boolean);
    /* Contents bar (Sally, Scott 10-15): pinned to the top of the panel body, shown only once the summary cards have
       scrolled away. The name, then one entry per workflow (its name and state word in its severity colour) that
       jumps to its drawer; the drawer being read is marked (aria-current). Below 1200px the state words drop. */
    var bar = '<div class="cv-bar-pin" aria-hidden="true"><nav class="cv-bar nav-tabs-casefusion" aria-label="Workflows for ' + esc(p.name) + '"><span class="cv-bar-name">' + D.avatar(p, 32) + esc(p.name) + "</span>" +
      [["lhn", "Notification", v.lhn], ["survey", "Survey", v.survey], ["interview", "Interview", v.interview], ["preservation", "Preservation", v.preservation], ["collection", "Collection", v.collection]].map(function (x) {
        var tone = severity(x[2]);
        return '<button type="button" class="cv-bar-item" data-cv-jump="' + x[0] + '"' + (tone ? ' data-tone="' + tone + '"' : "") + ' tabindex="-1"><span class="cv-bar-wf">' + x[1] + '</span><span class="cv-bar-value' + (tone ? " text-" + tone + "-emphasis" : "") + '">' +
          esc(x[2].state === "dash" ? "Not expected" : x[2].text) + "</span></button>";
      }).join("") +
      /* Back to top, at the bar's end behind a blurry divider: the thick MDI arrow in link blue (Scott, 10-15). */
      '<div class="vr vr-blurry" aria-hidden="true"></div><button type="button" class="cv-bar-top" data-cv="panel-top" tabindex="-1" aria-label="Back to top" title="Back to top" data-cnds-tooltip-init data-cnds-placement="left">' +
      '<i class="mdi mdi-arrow-up-bold" aria-hidden="true"></i></button>' + "</nav></div>";
    /* Nimbus tooltips (the back-to-top arrow): dispose the old ones before the body is replaced, so none is left
       showing, and initialise the new ones after (markup injected after boot is not auto-initialised). */
    var NT = window.Nimbus && Nimbus.Tooltip;
    if (NT) panel.el.querySelectorAll("[data-cnds-tooltip-init]").forEach(function (x) { var i = NT.getInstance(x); if (i) i.dispose(); });
    panel.setBody('<div class="cv-scope">' + bar +
      '<div class="d-flex align-items-start gap-3 mb-3">' + D.avatar(p) + '<div class="flex-grow-1"><div class="h5 mb-0">' + esc(p.name) + "</div>" +
        '<div class="cv-meta text-muted">' + esc(p.title + " · " + p.upn + "@" + M.tenant.domain + " · Added to the case " + short(c.added)) + (p.departed ? " · Departed " + esc(M.fmtDate(p.departed)) : "") + "</div>" +
        '<div class="d-flex flex-wrap gap-2 mt-2">' + chips.join("") + "</div></div>" +
        '<div class="d-flex gap-2 flex-shrink-0">' + link("VIEW PROFILE", "not-in-demo.html?what=Persona+Case+Profile&amp;ships=1", "btn-secondary") +
          /* EXPORT COVERAGE from here exports this custodian (CV47), in the CaseFusion Export As pattern. */
          '<div class="dropdown"><button type="button" class="btn btn-secondary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false" aria-haspopup="menu">Export As <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>' +
          '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion dropdown-menu-end demo-menu-hug" role="menu"><li role="none"><button type="button" class="dropdown-item" role="menuitem" data-cv="export-one">CSV</button></li>' +
          '<li role="none"><a class="dropdown-item" role="menuitem" href="not-in-demo.html?what=Custodian+coverage+(PDF)">PDF</a></li></ul></div></div></div>' +
      strip + '<div class="cv-drawers">' + lhnDrawer(c) + surveyDrawer(c) + interviewDrawer(c) + preservationDrawer(c, v) + collectionDrawer(c, v) + "</div></div>");
    if (keep) keep.scrollTop = top;
    if (window.Nimbus && Nimbus.DataAPI) Nimbus.DataAPI.initAll(panel.el.querySelector(".offcanvas-body"));
    syncBar();
  }

  /* ── Panel: contents bar ── */
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
    pin.querySelector(".cv-bar-top").tabIndex = on ? 0 : -1;
    pin.querySelectorAll(".cv-bar-item").forEach(function (b) {
      b.tabIndex = on ? 0 : -1;
      if (b.getAttribute("data-cv-jump") === current) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  }

  /* ── Panel: open, step, jump, toggle ── */
  /* Open (or move) the panel to a custodian, at the top of its body. */
  function openPanel(pid) {
    if (pid !== panelId) pgPage = {};
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
    var list = ordered();
    if (!list.length) return;
    var i = list.map(function (c) { return c.personId; }).indexOf(panelId);
    var next = list[(i + dir + list.length) % list.length].personId, body = panel.el.querySelector(".offcanvas-body");
    if (REDUCE || !body) { openPanel(next); return; }
    body.classList.add("cv-step-out");
    setTimeout(function () { openPanel(next); body.classList.remove("cv-step-out"); }, 150);
  }
  /* "3 of 9 custodians": where this custodian sits in the grid's current filter. */
  function panelPos() {
    var el = document.getElementById("cvPanelPos"), list = ordered(), i = list.map(function (c) { return c.personId; }).indexOf(panelId);
    if (el) el.textContent = i === -1 ? "Not in the current filter" : (i + 1) + " of " + plural(list.length, "custodian");
  }
  /* From the summary cards or the contents bar: open the workflow's drawer (if shut) and bring it to the top. */
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

  /* ── Stacked drawers (forms and read-only detail, 50%) ────────────── */
  /* ── View Hold: CaseFusion's existing View Hold flyout (production Legal Holds, 10-15 screenshot), mirrored, not
        respecified (decision 54): header (time to respond, sent), ENGAGEMENT, RECIPIENT NOTIFICATION (the email as
        sent), RECIPIENTS (with delegates), LEGAL HOLD (the notice). Stacked over the custodian panel, so CLOSE reads
        BACK; production's UPDATE is replaced by OPEN IN LEGAL HOLDS (question 14). The email is shown as this panel's custodian received it. A silent legal hold sends
        nothing: no engagement, email or notice, only who is tracked. ────────────────────────────────────────── */
  function vhSection(key, title, body, extra) {
    var open = key in secOpen ? secOpen[key] : true;
    return '<section class="card card-basic card-drawer demo-drawer cv-drawer" aria-labelledby="cvSecH-' + key + '"><div class="card-body">' +
      '<div class="card-top demo-drawer-top"><h4 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1" id="cvSecH-' + key + '">' + esc(title) + (extra || "") + "</h4>" +
        '<button type="button" class="card-drawer-toggle" data-cv-sec="' + key + '" aria-expanded="' + open + '" aria-controls="cvSec-' + key + '" aria-label="' + (open ? "Collapse " : "Expand ") + esc(title) + '">' +
        '<i class="mdi mdi-chevron-up mdi-24px" aria-hidden="true"></i></button></div>' +
      '<div class="collapse card-drawer-body' + (open ? " show" : "") + '" id="cvSec-' + key + '">' + body + "</div></div></section>";
  }
  /* Engagement, as production: one bar, "Acknowledged: n  Not Acknowledged: n", the percentage at the right. It counts
     every recipient of the notification, not only this panel's custodian. */
  function meter(id, on) {
    var ack = on.filter(function (c) { return c.lhn.some(function (n) { return n.id === id && n.status === "Acknowledged"; }); }).length;
    var pct = on.length ? Math.round(ack / on.length * 100) : 0;
    return '<div class="cv-meter"><div class="cv-meter-main">' +
        '<div class="progress cv-meter-bar" role="progressbar" aria-label="Acknowledged" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="progress-bar bg-success" style="width:' + pct + '%"></div></div>' +
        '<div class="cv-meter-legend mt-2"><span>Acknowledged: ' + ack + "</span><span>Not Acknowledged: " + (on.length - ack) + "</span></div></div>" +
      '<div class="vr vr-blurry" aria-hidden="true"></div><div class="cv-meter-pct">' + pct + "%</div></div>";
  }
  function holdEmail(h, p) {
    return '<div class="cv-doc"><p>Dear ' + esc(D.nameFor(p)) + ",</p>" +
      "<p>This email is an important notification about your obligation to preserve documents and materials in connection with the " + esc(M.caseById("MBP-0926").name) + " matter. As an employee who may hold relevant information or materials, you are required to take immediate action.</p>" +
      "<p>Please open the following link to:</p><ul><li>Review detailed information about this legal hold</li><li>Understand your specific preservation obligations</li><li>Acknowledge your receipt and compliance with these requirements</li></ul>" +
      '<p><a href="not-in-demo.html?what=Legal+hold+acknowledgment+portal">https://' + esc(M.tenant.domain) + "/legal-hold-notifications?legalHoldId=" + esc(h.id) + "</a></p>" +
      "<p>You must complete this acknowledgment by " + esc(M.fmtDate(h.respondBy)) + ".</p>" +
      "<h5>Important Notes:</h5><ul><li>This is a confidential legal matter.</li><li>Do not delete potentially relevant materials until further notice.</li><li>For questions about the legal hold, contact Meridian Biopharma Legal.</li></ul>" +
      "<p>Best regards,<br />Meridian Biopharma Legal Department</p></div>";
  }
  /* The notice, in production's structure (15 Oct screenshot), with Meridian's matter in it. */
  function holdNotice(h) {
    var cs = M.caseById("MBP-0926");
    var li = function (xs) { return "<ul>" + xs.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; };
    return '<div class="cv-doc"><h3>LEGAL HOLD NOTICE</h3><p><strong>MATTER:</strong> ' + esc(cs.name) + "</p><p><strong>Issue Date:</strong> " + esc(M.fmtDate(h.sent)) + "</p>" +
      "<h4>IMPORTANT NOTICE - READ CAREFULLY</h4><p>This Legal Hold Notice requires your immediate attention and compliance. As a custodian of potentially relevant information, you are legally obligated to preserve all materials that may relate to this matter.</p>" +
      "<h4>MATTER DESCRIPTION</h4><p><strong>Subject:</strong> Product liability claims concerning Veltrazine.</p><p><strong>Type of Proceeding:</strong> Litigation</p>" +
        "<p><strong>Relevant Date Range:</strong> " + esc(M.fmtDate(cs.window[0])) + " to " + esc(M.fmtDate(cs.window[1])) + "</p><p><strong>Relevant Parties:</strong> Meridian Biopharma and the plaintiffs</p>" +
      "<h4>PRESERVATION OBLIGATIONS</h4><p>You must preserve ALL relevant materials, including:</p><p>" + esc(h.scope || "") + ".</p>" +
        "<p><strong>Physical Materials:</strong> Paper documents, handwritten notes, printed emails, notebooks and meeting agendas.</p>" +
        "<p><strong>Devices:</strong> Work-issued and personal devices used for work, mobile phones, USB drives and external storage.</p>" +
      "<h4>DO NOT DESTROY OR ALTER</h4><p><strong>You must not:</strong> delete, alter, dispose of, or allow automatic deletion of relevant materials.</p>" +
      "<h4>PRESERVATION INSTRUCTIONS</h4>" + li(["Suspend routine document destruction immediately.", "Preserve all existing materials in their current state.", "Continue preserving new materials during the hold period.",
        "Maintain the organization and structure of materials.", "Consult IT before replacing or disposing of hardware or software.", "If leaving the company, do not take or delete materials and notify the Legal Department."]) +
      "<h4>CONFIDENTIALITY</h4><p>This Legal Hold is <strong>CONFIDENTIAL</strong>. Discuss it only with:</p>" + li(["Legal Department personnel", "Your manager (for time or resource concerns)", "IT personnel assisting with preservation"]) +
      "<h4>ASSISTANCE AND QUESTIONS</h4><p><strong>Legal Department Contact:</strong> Meridian Biopharma Legal</p><p><strong>IT Support Contact:</strong> Meridian IT Service Desk</p>" +
      "<h4>DURATION OF HOLD</h4><p>This hold remains in effect until written notice of release is provided. You will receive periodic reminders.</p>" +
      '<h4>ACKNOWLEDGMENT REQUIRED</h4><p>You must acknowledge receipt and understanding of this notice by clicking the Acknowledge link below.</p><p><a href="not-in-demo.html?what=Legal+hold+acknowledgment+portal">Acknowledge</a></p>' +
      "<p>By clicking “Acknowledge,” you confirm:</p>" + li(["You have read and understand this Legal Hold Notice.", "You will comply with preservation requirements.",
        "You will contact the Legal Department if you have questions.", "You understand your legal obligation to preserve relevant information."]) + "</div>";
  }
  function viewHold(id) {
    var h = holdById(id);
    var on = custodians.filter(function (c) { return (c.lhn || []).some(function (n) { return n.id === id; }); });
    var me = panelId ? person(byPid(panelId)) : person(on[0]);
    var late = !h.silent && h.respondBy && h.respondBy < TODAY;
    var head = '<div class="cv-vh-head cv-meta mb-3">' +
      (h.silent ? '<span>Silent legal hold · nothing is sent to the custodians</span><span>Started: ' + esc(M.fmtDate(h.sent)) + "</span>" :
        '<span class="' + (late ? "text-danger-emphasis" : "") + '">Time to respond: ' + (late ? "Expired" : esc(M.fmtDate(h.respondBy))) + "</span><span>Sent: " + esc(M.fmtDate(h.sent)) + "</span>") + "</div>";
    var recips = '<p class="cv-meta text-muted">' + (h.silent ? "The custodians tracked by this silent legal hold. Nothing is sent to them." :
        "The following is a compilation of custodians and their respective delegates, if any, designated to receive this legal hold. This list is not included in the legal hold notification sent to the recipients and is intended solely for the author\'s review.") + "</p>" +
      '<ul class="list-group list-group-flush cv-vh-list">' + on.map(function (c) {
        var n = c.lhn.filter(function (x) { return x.id === id; })[0], p = person(c);
        return '<li class="list-group-item cv-vh-rec">' + D.avatar(p, 32) + '<span class="flex-grow-1"><span class="d-block ' + (seen(c) ? "" : "demo-masked") + '">' + (seen(c) ? "" : LOCK) + esc(D.nameFor(p)) + "</span>" +
          (c.delegate ? '<span class="d-block small text-muted">Delegate: ' + esc(c.delegate) + "</span>" : "") + '</span><span class="vr vr-blurry" aria-hidden="true"></span>' + lhnBadge(n.status, "Tracked") + "</li>";
      }).join("") + "</ul>";
    var count = '<span class="badge badge-secondary cv-vh-count">' + on.length + "</span>";
    D.offcanvas({ title: id + " · " + h.title, width: "70vw",
      body: '<div class="cv-scope cv-drawers">' + head +
        (h.silent ? "" : vhSection("vh-eng", "Engagement", meter(id, on)) + vhSection("vh-mail", "Recipient Notification", holdEmail(h, me))) +
        vhSection("vh-rec", h.silent ? "Custodians Tracked" : "Recipients", recips, count) +
        (h.silent ? "" : vhSection("vh-notice", "Legal Hold", holdNotice(h))) + "</div>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">BACK</button>' +
        /* No UPDATE here: PRD 08 gives Coverage no way to edit a hold; editing stays on Legal Holds (question 14). */
        '<a class="btn btn-secondary" href="not-in-demo.html?what=' + encodeURIComponent("Legal Holds, with " + id + " open (the existing CaseFusion page)") + '&amp;ships=1">OPEN IN LEGAL HOLDS</a>' });
  }
  /* Form drawers: BACK closes only this drawer (with the Please Confirm guard when something was entered); SAVE
     records it, closes this drawer and redraws the panel underneath with a toast. */
  /* Nimbus/Datepicker and Nimbus/Timepicker, separate as the PM canvas draws them (Scott, 10-15). The datepicker
     writes mm-dd-yyyy; the timepicker is 12-hour in 5-minute steps. Both start in formDrawer below. */
  function dateField(id, label, value) {
    return '<div class="cf-input-field cf-input-field-casefusion mb-3" data-cnds-datepicker-init><label class="cf-input-label" for="' + id + '">' + label + ' <span class="cf-input-required">*</span></label>' +
      '<div class="cf-input-wrapper"><input type="text" id="' + id + '" class="cf-input-control" placeholder="mm-dd-yyyy" value="' + esc(value) + '" /></div></div>';
  }
  function timeField(id, label, hhmm) {
    /* The field carries its starting time in the timepicker's own format ("09:30 AM"), which the picker reads when it
       starts (the drawer starts it before this script could set it). */
    var t = (hhmm || "09:00").split(":"), h = +t[0], text = String(h % 12 || 12).padStart(2, "0") + ":" + t[1] + " " + (h >= 12 ? "PM" : "AM");
    return '<div class="timepicker cf-input-field-casefusion mb-3" data-cnds-timepicker-init><label for="' + id + '" class="cf-input-label">' + label +
      ' <span class="cf-input-required">*</span></label><input type="text" class="form-control" id="' + id + '" value="' + text + '" /></div>';
  }
  function noteField(id) {
    return '<div class="cf-input-field cf-input-field-casefusion mb-3"><label class="cf-input-label" for="' + id + '">Note</label>' +
      '<div class="cf-input-wrapper"><textarea id="' + id + '" class="cf-input-control" rows="2"></textarea></div>' +
      '<div class="cf-input-helper"><span class="cf-input-helper-text">Optional. One line of context, kept on the event.</span></div></div>';
  }
  /* "9:30 AM" (the timepicker's text) → "09:30". */
  function toHhmm(text, fallback) {
    var t = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text || "");
    if (!t) return fallback;
    var h = +t[1] % 12 + (/PM/i.test(t[3] || "") ? 12 : 0);
    return String(t[3] ? h : +t[1]).padStart(2, "0") + ":" + t[2];
  }
  /* "10-22-2026" (the datepicker's text) → "2026-10-22"; `fallback` when the field does not parse. */
  function toIso(text, fallback) {
    var p = text.split("-");
    return p.length === 3 ? p[2] + "-" + p[0] + "-" + p[1] : fallback;
  }
  /* ── Before anything reaches a person or changes their legal standing (Scott, 10-15) ──
     A send that copies an issued notification opens the notification form, pre-filled (PRD 08 §5.13: Coverage does
     not send the form, it opens it; decision 123d, CV21). The rest confirm first: a question that names the act,
     who it reaches (chips), what is recorded, and a commit button that names the act. No "don't ask again". */
  function confirmAct(o) {
    var m = D.modal({ title: o.title, noGuard: true,
      body: peopleField(o.list) + '<p class="mb-0">' + o.body + "</p>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button><button type="button" class="btn btn-primary" data-cv-go>' + o.confirm + "</button>" });
    m.el.querySelector("[data-cv-go]").addEventListener("click", function () { m.hide(); o.go(); });
  }
  /* The existing Create Legal Hold page, opened pre-filled (PRD decision 123d; design-change decision 49): the
     recipients, and with `lhId` the issued notification's settings. Coverage does not respecify that page. */
  function createHoldPage(list, lhId) {
    var to = list.length === 1 ? visibleName(list[0]) : plural(list.length, "custodian");
    return "not-in-demo.html?what=" + encodeURIComponent("Create Legal Hold (the existing CaseFusion page) · Recipients: " + to + (lhId ? " · Settings from " + lhId : "")) + "&amp;ships=1";
  }
  /* MARK COMPLETE (CV42a): the date completed and an optional note, written as an event with who marked it. */
  function completeForm(c) {
    formDrawer("Mark Interview Complete", "With " + esc(person(c).name) + ". Complete records that the interview took place. Not required is a separate action with a reason.",
      dateField("cvIvDone", "Date Completed", M.fmtDate(TODAY)) + noteField("cvIvDoneNote"),
      function (val) { completeInterview(c, toIso(val("cvIvDone")) || TODAY, val("cvIvDoneNote")); }, { save: "MARK COMPLETE" });
  }
  /* A stacked form drawer; SAVE is disabled until every required text field has a value. onSave gets a field reader. */
  /* opts.save: the commit label (default SAVE). The way out is BACK when stacked on the custodian panel, CANCEL when
     opened on its own from the grid (the stacked-drawer pattern). */
  function formDrawer(title, intro, fields, onSave, opts) {
    opts = opts || {};
    var stacked = !!document.querySelector(".offcanvas.show");
    var d = D.offcanvas({ title: title, width: "50vw",
      body: '<div class="cv-scope">' + (intro ? '<p class="mb-3">' + intro + "</p>" : "") + fields + "</div>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">' + (stacked ? "BACK" : "CANCEL") + '</button><button type="button" class="btn btn-primary" data-cv-save>' + (opts.save || "SAVE") + "</button>" });
    /* Start the pickers (markup added after boot is not auto-initialised). A click anywhere on the read-only field
       opens its picker: Nimbus 9.0.106 restored this (inputToggle; D14). */
    if (window.Nimbus && Nimbus.Datepicker) d.el.querySelectorAll("[data-cnds-datepicker-init]").forEach(function (x) { if (!Nimbus.Datepicker.getInstance(x)) new Nimbus.Datepicker(x, { format: "mm-dd-yyyy" }); });
    if (window.Nimbus && Nimbus.Timepicker) d.el.querySelectorAll("[data-cnds-timepicker-init]").forEach(function (x) {
      if (!Nimbus.Timepicker.getInstance(x)) new Nimbus.Timepicker(x, { format12: true, minuteStep: 5 });
    });
    /* Forget the values the pickers wrote, so BACK only asks to discard what the reader typed. */
    d.el.querySelectorAll("[data-demo-changed]").forEach(function (f) { f.removeAttribute("data-demo-changed"); });
    var save = d.el.querySelector("[data-cv-save]");
    var check = function () { save.disabled = [].some.call(d.el.querySelectorAll("input.cf-input-control"), function (f) { return !f.value.trim(); }); };
    d.el.addEventListener("input", check); d.el.addEventListener("change", check); check();
    save.addEventListener("click", function () { var val = function (id) { var f = d.el.querySelector("#" + id); return f ? f.value.trim() : ""; }; d.hide(); onSave(val); });
    return d;
  }
  /* RECORD ACKNOWLEDGMENT: an acknowledgment made outside CaseFusion, recorded as the custodian's, entered by the viewer. */
  function recordAck(c, id) {
    var n = instance(c, id);
    formDrawer("Record acknowledgment · " + id, "For an acknowledgment given outside CaseFusion, by email, phone or in person. When saved, " + esc(id) + " is recorded as acknowledged by " + esc(person(c).name) + " and entered by " + esc(me()) + ".",
      dateField("cvAckDate", "Date", M.fmtDate(TODAY)) + timeField("cvAckTime", "Time", "09:30") +
      D.select("cvAckHow", [["Email reply", "Email reply"], ["Signed form", "Signed form"], ["Verbal, in a meeting", "Verbal, in a meeting"]], "Email reply", "How", { cls: "mb-3" }) + noteField("cvAckNote"),
      function (val) {
        var at = toHhmm(val("cvAckTime"), "09:30"), aIso = toIso(val("cvAckDate"), TODAY);
        n.status = "Acknowledged"; n.on = aIso;
        n.events.push([aIso, at, "Acknowledged", person(c).name, "Acknowledged", (val("cvAckHow") || "Recorded") + " · recorded by " + me()]);
        D.toast("Acknowledgment recorded for " + id + ".");
        render();
      });
  }
  /* SCHEDULE / RESCHEDULE open CaseFusion's existing Schedule Interview page (Case Administrator v1.5, Figma
     1569:136825), pre-filled with Interview With: the custodian, rather than a second, simpler form here (Scott, 10-15;
     the §5.13 pattern: Coverage opens the product's forms, it does not replace them). The page is not in this demo.
     PM question 10 asks whether it opens as the page, in a flyout, or as a simpler form. */
  function schedulePage(c, re) {
    return "not-in-demo.html?what=" + encodeURIComponent((re ? "Reschedule Interview" : "Schedule Interview") + " (the existing CaseFusion page) · Interview With: " + visibleName(c)) + "&amp;ships=1";
  }

  /* ── Exports ──────────────────────────────────────────────────────── */
  /* Rows → a quoted CSV file download. */
  function download(name, rows) {
    var csv = rows.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  /* EXPORT COVERAGE and the report's CSV: limited profiles are counted, not named. */
  function exportCoverage(name) {
    var visible = custodians.filter(seen), hiddenN = custodians.length - visible.length;
    var rows = [["Custodian", "Legal hold notification", "Survey", "Interview", "Preservation", "Collection"]];
    visible.forEach(function (c) {
      var v = cov(c);
      rows.push([person(c).name].concat(WORKFLOWS.map(function (k) { return v[k].text + (v[k].detail ? " · " + v[k].detail : ""); })));
    });
    rows.push([]);
    rows.push(["This export covers the " + visible.length + " custodians you can see. " + hiddenN + " are outside your regions."]);
    download(name, rows);
    /* The toast reports the export succeeding (in production the server API sends it), not the file being saved, so it
       shows whether the reader keeps or cancels the download (Scott, 10-15). */
    D.toast("Exported " + visible.length + " custodians." + (hiddenN ? " " + hiddenN + " outside your regions are counted, not named." : ""));
  }
  /* Custodian coverage's EXPORT AS · CSV (CV47): the five workflows, then every event. */
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

  /* ── Events ───────────────────────────────────────────────────────── */
  /* A filter the reader picks clears any card filter. setFilter() below changes the select from code, and Nimbus
     Select fires its change event then too; `syncing` stops that echo from clearing the card the reader just chose. */
  var syncing = false;
  function onFilter() { if (syncing) return; tileFilter = null; page = 1; renderTiles(); view(renderGrid); }
  function setFilter(v) {
    var el = document.getElementById("cvFilter");
    var inst = window.Nimbus && Nimbus.Select && Nimbus.Select.getInstance(el);
    syncing = true;
    try { if (inst && inst.setValue) inst.setValue(v); else el.value = v; } finally { syncing = false; }
  }
  /* A new order is a view change (crossfade); it keeps the filters and returns to page 1. */
  function onSort() { page = 1; view(renderGrid); if (panel) panelPos(); }
  /* Grid pager: a new page size returns to page 1. */
  function onPageSize(e) { if (e.target.getAttribute("data-pg-size") === "cv") { pageSize = +e.target.value; page = 1; view(renderGrid); } }
  /* Nested pagers' page size (panel source tables, non-custodial sources): back to page 1 of that list. */
  function onNestedPageSize(e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-pg-size");
    if (!k || k === "cv" || +e.target.value === (pgSize[k] || 10)) return;
    pgSize[k] = +e.target.value; pgPage[k] = 1;
    if (k === "cvnc") view(renderNonCustodial); else renderPanel();
  }
  /* Native selects fire change; Nimbus Select fires valueChanged.cnds.select. Listen for both. */
  ["change", "valueChanged.cnds.select"].forEach(function (ty) {
    document.getElementById("cvSort").addEventListener(ty, onSort);
    document.getElementById("cvFilter").addEventListener(ty, onFilter);
    document.getElementById("cvWorkflow").addEventListener(ty, onFilter);
    document.addEventListener(ty, onNestedPageSize);
    document.getElementById("cvGridFoot").addEventListener(ty, onPageSize);
  });
  document.getElementById("cvSearch").addEventListener("input", function () { page = 1; view(renderGrid); });
  /* Row and select-all checkboxes: a selection change redraws in place. */
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.closest && t.closest(".modal")) return;
    if (t.hasAttribute && t.hasAttribute("data-sel")) { selected[t.getAttribute("data-sel")] = t.checked; renderGrid(); return; }
    if (t.id === "cvAll") { custodians.filter(matches).forEach(function (c) { selected[c.personId] = t.checked; }); renderGrid(); }
  });
  /* Every click on the page and the panel (the release dialog handles its own). */
  document.addEventListener("click", function (e) {
    if (e.target.closest(".modal")) return;
    var t = e.target.closest("button, a, [data-cv]");
    if (!t) return;
    /* Pagers: the grid's (cv), or a nested one (panel source tables, non-custodial sources). */
    var pk = t.getAttribute("data-pg-for");
    if (pk && pk !== "cv") {
      pgPage[pk] = D.turnPage(pgPage[pk] || 1, t.getAttribute("data-pg"), pgTotal[pk] || 0, pgSize[pk] || 10);
      if (pk === "cvnc") view(renderNonCustodial); else renderPanel();
      return;
    }
    if (pk === "cv") { page = D.turnPage(page, t.getAttribute("data-pg"), custodians.filter(matches).length, pageSize); view(renderGrid); return; }
    if (t.hasAttribute("data-tile")) {
      var k = t.getAttribute("data-tile");
      tileFilter = tileFilter === k || k === "all" ? null : k; page = 1;
      setFilter("all"); renderTiles(); view(renderGrid); return;
    }
    if (t.hasAttribute("data-open")) { e.preventDefault(); openPanel(t.getAttribute("data-open")); return; }
    /* data-one: a send from custodian coverage, for that custodian only. */
    var one = t.getAttribute("data-one") ? [byPid(t.getAttribute("data-one"))] : null;
    if (t.hasAttribute("data-send-silent")) {
      var sh = t.getAttribute("data-send-silent"), sl = one || selectedList();
      confirmAct({ title: "Add to silent legal hold " + sh + "?", list: sl, confirm: "ADD TO SILENT LEGAL HOLD",
        body: "Nothing is sent. " + (sl.length === 1 ? "The custodian is" : "The custodians are") + " tracked on " + esc(sh) + ", and their data is held.", go: function () { addSilent(sh, one); } });
      return;
    }
    if (t.hasAttribute("data-send-survey")) {
      var sid = t.getAttribute("data-send-survey"), svl = one || selectedList(), sdef = M.surveys.filter(function (x) { return x.id === sid; })[0];
      confirmAct({ title: "Send survey " + sid + "?", list: svl, confirm: "SEND SURVEY",
        body: esc(sdef.title) + " (" + sdef.questions + " questions) is sent by email and Teams, due 10-22-2026. It is recorded on the case.", go: function () { sendSurvey(sid, one); } });
      return;
    }
    /* Custodian coverage: drawers, instance actions and the stacked drawers they open. */
    if (t.hasAttribute("data-cv-sec")) { toggleSection(t); return; }
    if (t.hasAttribute("data-cv-tl")) { var tk = t.getAttribute("data-cv-tl"); tlOpen[tk] = !tlOpen[tk]; renderPanel(); return; }
    if (t.hasAttribute("data-cv-jump")) { jumpTo(t.getAttribute("data-cv-jump")); return; }
    var pc = panelId && byPid(panelId);
    if (pc) {
      if (t.hasAttribute("data-cv-view-lh")) { e.preventDefault(); viewHold(t.getAttribute("data-cv-view-lh")); return; }
      if (t.hasAttribute("data-cv-remind")) {
        var rid = t.getAttribute("data-cv-remind"), rn = (instance(pc, rid).events || []).filter(function (e) { return /^Reminder/.test(e[2]); }).length + 1;
        confirmAct({ title: "Send reminder " + rn + " for " + rid + "?", list: [pc], confirm: "SEND REMINDER",
          body: "The reminder is sent by email and Teams. It is recorded on the case as sent by " + esc(me()) + ".", go: function () { remind(pc, rid); } });
        return;
      }
      if (t.hasAttribute("data-cv-resend")) {
        var sid2 = t.getAttribute("data-cv-resend");
        confirmAct({ title: "Resend " + sid2 + "?", list: [pc], confirm: "RESEND NOTIFICATION",
          body: esc(sid2) + " is sent again by email and Teams. It is recorded on the case as resent by " + esc(me()) + ".", go: function () { resend(pc, sid2); } });
        return;
      }
      if (t.hasAttribute("data-cv-ack")) { recordAck(pc, t.getAttribute("data-cv-ack")); return; }
      if (t.hasAttribute("data-cv-nr")) { markNotRequired([pc], t.getAttribute("data-cv-nr")); return; }
      if (t.hasAttribute("data-cv-iv-done")) { completeForm(pc); return; }
    }
    var a = t.getAttribute("data-cv");
    if (!a) return;
    if (a === "select-after") { page = 1; selected = {}; afterNoticeUnsent().forEach(function (c) { selected[c.personId] = true; }); tileFilter = null; setFilter("after"); render(); }
    if (a === "review-after") { page = 1; tileFilter = null; setFilter("after"); renderTiles(); view(renderGrid); }
    if (a === "clear") clearSelection();
    if (a === "not-required") markNotRequired(null);
    if (a === "release") openRelease(selectedList().map(function (c) { return c.personId; }));
    if (a === "export") exportCoverage("coverage-" + D.caseId + ".csv");
    if (a === "report-csv") exportCoverage("case-preservation-report-" + D.caseId + ".csv");
    if (a === "export-one" && panelId) exportOne(byPid(panelId));
    if (a === "panel-top" && panel) panel.el.querySelector(".offcanvas-body").scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" });
    if (a === "panel-prev") stepPanel(-1);
    if (a === "panel-next") stepPanel(1);
    /* Stacked over the custodian panel, which stays open: BACK returns to it (Scott, 10-15). */
    if (a === "panel-release") { openRelease([panelId]); }
  });
  /* The clear (X) is an icon with role="button": Enter and Space work as a click. */
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute && e.target.getAttribute("data-cv") === "clear") { e.preventDefault(); clearSelection(); }
  });

  render();

  /* ── Deep links ───────────────────────────────────────────────────── */
  /* DEMO ONLY: do not build. Not in PRD 08; it exists so the PM review's edge-case links open the right view.
     Deep links for the review guides: ?open=<person id> opens that custodian's coverage, and &drawer=<lhn|survey|
     interview|preservation|collection> opens that drawer and scrolls to it, so each edge case is one click away. */
  (function () {
    var q = function (k) { var m = new RegExp("[?&]" + k + "=([\\w-]+)").exec(location.search); return m && m[1]; };
    var pid = q("open"), sec = q("drawer");
    if (!pid || !byPid(pid)) return;
    if (sec) secOpen[sec] = true;
    /* Nimbus loads its components after this script (phase 2), so wait for them before opening the panel. */
    var go = function () {
      openPanel(pid);
      /* Scroll the drawer card, which leaves room for the contents bar (scroll-margin-top), not its heading. */
      if (sec) setTimeout(function () { var h = document.getElementById("cvSecH-" + sec); if (h) h.closest("section").scrollIntoView({ block: "start" }); }, 450);
    };
    if (window.Nimbus && Nimbus.Offcanvas) go(); else document.addEventListener("cnds.ready", go, { once: true });
  }());
}());
