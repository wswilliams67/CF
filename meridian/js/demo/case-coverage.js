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
      '<span class="cv-gap-sep" aria-hidden="true"></span>' +
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
        '<td><a href="#" class="fw-bold' + (ok ? "" : " demo-masked") + '" data-open="' + c.personId + '">' + (ok ? "" : '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>') + esc(visibleName(c)) + "</a>" +
          '<span class="d-block small text-muted">' + sub + "</span>" + (c.addedNote ? '<span class="d-block small text-warning-emphasis">' + esc(c.addedNote) + "</span>" : "") + "</td>" +
        "<td>" + cell(v.lhn) + "</td><td>" + cell(v.survey) + "</td><td>" + cell(v.interview) + "</td>" +
        "<td>" + cell(v.preservation, v.preservation.state === "action" || v.preservation.state === "progress" ? "case-hold-status.html" : null) + "</td>" +
        "<td>" + cell(v.collection) + "</td>" +
        '<td><button type="button" class="btn btn-tertiary btn-sm" data-open="' + c.personId + '">OPEN</button></td></tr>';
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
    return '<div class="btn-group dropdown" role="group"><button type="button" class="btn btn-tools btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false">' + label +
      ' <i class="mdi mdi-chevron-down" aria-hidden="true"></i></button><ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion">' + items + "</ul></div>";
  }
  function item(attrs, title, sub, href) {
    var inner = esc(title) + (sub ? '<span class="d-block small text-muted">' + esc(sub) + "</span>" : "");
    return "<li>" + (href ? '<a class="dropdown-item" href="' + href + '">' + inner + "</a>" : '<button type="button" class="dropdown-item" ' + attrs + ">" + inner + "</button>") + "</li>";
  }
  function renderSelTool() {
    var list = selectedList(), n = list.length, host = document.getElementById("cvSelTool");
    if (!n) { host.innerHTML = ""; return; }
    var regular = M.legalHolds.filter(function (h) { return !h.silent; }), silent = M.legalHolds.filter(function (h) { return h.silent; });
    var ids = list.map(function (c) { return c.personId; }).join(",");
    /* Selection toolbar in the default toolbar colour, not the green shared state, and with no clear (X): the grid's
       checkboxes select and clear (Scott, 10-14; design decision 11). The count uses the list toolbar's text style. */
    host.innerHTML = '<div class="btn-toolbar-gray cv-seltool mb-2" role="toolbar" aria-label="Actions for selected custodians">' +
      '<div class="toolbar-shared-count"><span class="toolbar-list-total">' + n + " selected" + "</span></div><div>" +
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
      '<div class="btn-group" role="group"><a class="btn btn-tools btn-sm" href="not-in-demo.html?what=Schedule+interview&amp;ships=1">SCHEDULE INTERVIEW</a></div>' +
      dropdown("REQUEST FOR GAPS",
        item("", "Preservation Request", "Opens New request with the selected custodians and only their gap sources", "case-new-preservation.html?custodians=" + ids) +
        item("", "Collection Request", "Collection is not part of this demo", "not-in-demo.html?what=Collection+request") +
        item("", "Both", "Collection is not part of this demo", "not-in-demo.html?what=Preservation+and+collection+request")) +
      '<div class="btn-group" role="group"><button type="button" class="btn btn-tools btn-sm" data-cv="not-required">MARK NOT REQUIRED</button></div>' +
      /* Disabled, never hidden, when no selected custodian is on a legal hold: there is nothing to release. */
      (list.some(releasable) ? '<div class="btn-group" role="group"><button type="button" class="btn btn-tools btn-sm" data-cv="release">RELEASE FROM HOLD</button></div>' :
        '<div class="btn-group" role="group" title="None of the selected custodians is on a legal hold."><button type="button" class="btn btn-tools btn-sm" disabled>RELEASE FROM HOLD</button></div>') +
      "</div></div>";
  }

  /* ── Non-custodial held sources (Nimbus table) ──────────────────────── */
  /* A request ID is a link to the Requests tab whenever the request exists, so one column never mixes links and text. */
  function reqLink(id) { return !id ? '<span class="text-muted">—</span>' : M.requests.some(function (r) { return r.id === id; }) ? '<a href="case-requests.html">' + esc(id) + "</a>" : esc(id); }
  /* DATA GAPS counts sources, so it filters both tables (design decision 12): the custodian grid to the custodians
     with a gap source, and this table to its own gap sources; a note above the grid adds the two up. */
  function gapsOn() { return tileFilter === "gaps" || val("cvFilter") === "gaps"; }
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
      var m = { "Applied": ["On hold", "success"], "Attested": ["Attested", "info"], "Partial": ["Partial", "warning"], "Unknown": ["Not confirmed", "danger"] }[s.hold] || [s.hold, "light"];
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
  function sendNotice(lhId) {
    var h = M.legalHolds.filter(function (x) { return x.id === lhId; })[0];
    var newId = nextHoldId();
    M.legalHolds.push({ id: newId, title: "Legal hold notification · settings from " + lhId, sent: TODAY, time: "10:05", settings: h.settings, survey: h.survey });
    var sent = 0;
    selectedList().forEach(function (c) {
      c.lhn = c.lhn || [];
      c.lhn.push({ id: newId, status: "Sent", sentOn: TODAY, events: [[TODAY, "10:05", "Notification (settings from " + lhId + ")", "CaseFusion · email and Teams", "Sent"]] });
      if (h.survey && !(c.surveys || []).some(function (sv) { return sv.id === h.survey; })) {
        c.surveys.push({ id: h.survey, status: "Sent", due: "2026-10-22", events: [[TODAY, "10:05", "Survey (attached to " + lhId + ")", me(), "Sent"]] });
      }
      sent++;
    });
    selected = {};
    D.toast("New legal hold notification " + newId + " sent to " + sent + " custodian" + (sent === 1 ? "" : "s") + " with " + lhId + "'s settings.");
    render();
  }
  function addSilent(lhId) {
    var n = 0;
    selectedList().forEach(function (c) {
      if ((c.lhn || []).some(function (x) { return x.id === lhId; })) return;
      c.lhn.push({ id: lhId, status: "Silent", events: [[TODAY, "10:05", "Added to the silent legal hold", me(), "Tracked"]] });
      n++;
    });
    selected = {};
    D.toast(n + " added to silent legal hold " + lhId + ". Nothing was sent.");
    render();
  }
  function sendSurvey(sId) {
    var n = 0;
    selectedList().forEach(function (c) {
      if ((c.surveys || []).some(function (sv) { return sv.id === sId && sv.status !== "Answered"; })) return;
      c.surveys.push({ id: sId, status: "Sent", due: "2026-10-22", events: [[TODAY, "10:05", "Survey", me(), "Sent"]] });
      n++;
    });
    selected = {};
    D.toast("Survey " + sId + " sent to " + n + " custodian" + (n === 1 ? "" : "s") + ".");
    render();
  }
  function markNotRequired() {
    var list = selectedList();
    D.reasonDialog({
      title: "Mark Not Required",
      intro: list.length + " custodian" + (list.length === 1 ? "" : "s") + " selected.",
      /* One custodian: name the record the dialog acts on (demo-kv; Scott, 10-14). Several: the count above says it. */
      extra: (list.length === 1 ? '<dl class="row demo-kv mb-3"><dt class="col-4 fw-bold">Custodian</dt><dd class="col-8 mb-0' + (seen(list[0]) ? "" : " demo-masked") + '">' +
        (seen(list[0]) ? "" : '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>') + esc(visibleName(list[0])) + "</dd></dl>" : "") + D.select("cvNrWf", [["survey", "Survey"], ["interview", "Interview"], ["preservation", "Preservation"]], "survey", "Workflow", { container: "{{modal}}", cls: "mb-3" }),
      effect: "The workflow reads N/A, leaves the gap count, and shows in the coverage report with this reason.",
      confirm: "MARK NOT REQUIRED"
    }).then(function (r) {
      if (!r) return;
      var wf = r.dialog.querySelector("#cvNrWf").value;
      list.forEach(function (c) {
        if (wf === "preservation") { c.notRequired = c.notRequired || {}; c.notRequired.preservation = r.reason; }
        else { c.notRequiredWf = c.notRequiredWf || {}; c.notRequiredWf[wf] = r.reason; }
      });
      selected = {};
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

  /* ── Custodian coverage (PRD 08 §7.2) in a Nimbus offcanvas at 90% (a list). ── */
  var panel = null, panelId = null;
  /* ── Shared pieces, in the Hold Status grammar (demo.css SHARED SCREEN PATTERNS; Scott, 10-14) ── */
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';
  var BLUR = '<li class="cv-ev-divider" aria-hidden="true"><hr class="hr hr-blurry"></li>';
  function empty(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) +
      '</span><span class="demo-empty-note">' + esc(note) + "</span></div>";
  }
  /* Card nested in the panel: bar-less category title with its status badge across from it, a 12px meta line,
     then the body; buttons small tertiary, right-aligned on the bottom edge. */
  function dcard(title, badge, meta, body, acts) {
    return '<div class="card card-basic mb-2"><div class="card-body d-flex flex-column">' +
      '<div class="demo-card-head"><div class="cf-category cf-cat-6 flex-grow-1 mb-0" role="heading" aria-level="4">' + esc(title) + "</div>" + badge + "</div>" +
      (meta ? '<div class="cv-meta text-muted mb-2">' + meta + "</div>" : "") + body +
      (acts ? '<div class="card-actions mt-auto justify-content-end">' + acts + "</div>" : "") + "</div></div>";
  }
  /* Events as in Hold Status: what happened (14px bold) with its status at the right, then "date at time · by"
     (12px). Blurry dividers between rows. Dates mm-dd-yyyy, 12-hour times joined by "at" (Scott, 10-14). */
  function evList(events) {
    var tone = { Sent: "success", Acknowledged: "success", Answered: "success", Tracked: "secondary", Escalated: "danger", "Not answered": "warning" };
    return '<ul class="list-group list-group-flush cv-events mb-2">' + (events || []).map(function (e) {
      return '<li class="list-group-item"><div class="cv-ev-head"><span class="cv-ev-what">' + esc(e[2]) + '</span><span class="badge badge-pill badge-verbatim badge-' + (tone[e[4]] || "light") + '">' + esc(e[4]) + "</span></div>" +
        '<div class="cv-meta text-muted">' + esc(M.fmtDateTime(e[0], e[1]) + " · " + e[3]) + "</div></li>";
    }).join(BLUR) + "</ul>";
  }
  /* Section heading with its count at the right, on the baseline (demo-section-head). */
  function section(title, summary, body) {
    return '<section class="mb-4"><div class="demo-section-head"><h3 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1">' + esc(title) + '</h3><span class="cv-meta text-muted">' + esc(summary) + "</span></div>" + body + "</section>";
  }
  function renderPanel() {
    var c = byPid(panelId), p = person(c), v = cov(c), ok = seen(c);
    /* Workflow strip: each card is a label naming a value (demo-label above a 14px value), not a stat tile. */
    var strip = '<div class="row g-2 mb-4">' + [["Legal Hold Notification", v.lhn], ["Survey", v.survey], ["Interview", v.interview], ["Preservation", v.preservation], ["Collection", v.collection]].map(function (x) {
      return '<div class="col"><div class="card card-basic demo-tile h-100"><span class="demo-label mb-0">' + x[0] + '</span><span class="cv-value">' + esc(x[1].text) + "</span></div></div>"; }).join("") + "</div>";
    if (!ok) {
      /* The monogram carries the lock, so the name line does not repeat it; normal style, no italics (Scott, 10-14). */
      panel.setBody('<div class="cv-scope"><div class="d-flex align-items-center gap-3 mb-3"><span class="monogram">' + LOCK + '</span><div><div class="h5 mb-0 demo-masked">Profile details limited</div>' +
        '<div class="cv-meta text-muted">This custodian is outside your regions. Their coverage counts on this case; their details are visible to the case team in their region.</div></div></div>' + strip + "</div>");
      return;
    }
    var src = M.sourcesOf(c.personId);
    var lhnBlocks = (c.lhn || []).map(function (n) {
      var h = M.legalHolds.filter(function (x) { return x.id === n.id; })[0];
      var badge = n.status === "Silent" ? '<span class="badge badge-pill badge-verbatim badge-secondary">Silent legal hold</span>' : '<span class="' + PILL[n.status === "Acknowledged" ? "done" : n.status === "Sent" ? "progress" : "action"] + '">' + esc(n.status) + "</span>";
      var acts = n.status === "Silent" ? '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Legal+hold+' + n.id + '&amp;ships=1">VIEW LEGAL HOLD</a><a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Remove+from+legal+hold&amp;ships=1">REMOVE FROM LEGAL HOLD</a>' :
        n.status === "Acknowledged" ? '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Legal+hold+notification+' + n.id + '&amp;ships=1">VIEW NOTIFICATION</a>' :
        '<button type="button" class="btn btn-tertiary btn-sm" data-cv-toast="Reminder sent for ' + n.id + '.">SEND REMINDER</button><a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Record+acknowledgment&amp;ships=1">RECORD ACKNOWLEDGMENT</a>';
      return dcard(n.id + " · " + (h ? h.title : ""), badge, n.status === "Silent" ? "Nothing sent to the custodian" : "", evList(n.events), acts);
    }).join("") || empty("No legal hold notification", "No legal hold notification has been sent to this custodian.");
    var surveyBlocks = (c.surveys || []).map(function (sv) {
      var def = M.surveys.filter(function (x) { return x.id === sv.id; })[0];
      var st = sv.status === "Answered" ? "done" : sv.status === "Sent" ? "progress" : "action";
      return dcard(sv.id + " · " + def.title, '<span class="' + PILL[st] + '">' + esc(sv.status) + "</span>",
        esc(def.questions + " questions · " + (sv.status === "Answered" ? "Answered " + short(sv.on) : "Due " + short(sv.due || def.due))),
        evList(sv.events), sv.status === "Answered" ? '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Survey+answers&amp;ships=1">VIEW ANSWERS</a>' :
          '<button type="button" class="btn btn-tertiary btn-sm" data-cv-toast="Reminder sent for ' + sv.id + '.">SEND REMINDER</button>');
    }).join("") || (v.survey.state === "dash" ? notExpected("Surveys") : empty("No survey sent", "No survey has been sent to this custodian."));
    var presRows = c.notRequired && c.notRequired.preservation ? '<dl class="row demo-kv mb-2"><dt class="col-4 col-md-2 fw-bold">Not Required</dt><dd class="col-8 col-md-10 mb-0">' + esc(c.notRequired.preservation) + "</dd></dl>" :
      '<div class="table-responsive mb-2"><table class="table align-middle mb-0"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' + src.map(function (s) {
        var status = s.pending ? '<span class="badge badge-pill badge-verbatim badge-warning">Not requested</span>' + (s.priorWork ? '<span class="d-block small text-info">' + esc(s.priorWork.what + " on " + s.priorWork.caseId + " · " + s.priorWork.request) + "</span>" : "") :
          '<span class="badge badge-pill badge-verbatim badge-' + (s.hold === "Applied" ? "success" : s.hold === "Attested" ? "info" : s.hold === "Applying" ? "warning" : "danger") + '">' + esc(s.hold) + "</span>" +
          (s.hold === "Not applied" ? '<span class="d-block small text-warning-emphasis">Removed from the Purview hold ' + esc(short(s.exception.since)) + ' · see <a href="case-hold-status.html">Hold status</a></span>' : "") +
          (s.hold === "Overdue" ? '<span class="d-block small text-warning-emphasis">Attestation overdue · see <a href="case-hold-status.html">Hold status</a></span>' : "") +
          (s.hold === "Applying" ? '<span class="d-block small text-warning-emphasis">Applying since ' + esc(short(s.exception.since)) + ' · see <a href="case-hold-status.html">Hold status</a></span>' : "");
        return '<tr><td><span class="fw-bold">' + esc(M.typeLabel(s.type)) + '</span><span class="d-block small text-muted">' + esc(s.name) + "</span></td><td>" + status + "</td><td>" +
          (s.pending ? "—" : esc(s.request || "—") + " · " + (s.evidence === "attested" ? "attested" : "Purview")) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    var chips = ['<span class="badge badge-pill badge-verbatim badge-info">Custodian</span>', '<span class="' + PILL[v.preservation.state] + '">' + esc(v.preservation.text) + "</span>"];
    if (c.silent) chips.push('<span class="badge badge-pill badge-verbatim badge-secondary">In 1 silent legal hold</span>');
    if (c.released) chips.push('<span class="badge badge-pill badge-verbatim badge-success">Released ' + esc(short(c.released)) + "</span>");
    /* A workflow the case does not expect is a fact, not a gap: one muted line, not a full empty state (design decision, 14 Oct). */
    function notExpected(what) { return '<p class="cv-meta text-muted mb-2">' + what + " are expected only where the case says so.</p>"; }
    panel.setBody('<div class="cv-scope">' +
      '<div class="d-flex align-items-start gap-3 mb-3"><span class="monogram">' + esc(D.initials(p.name)) + '</span><div class="flex-grow-1"><div class="h5 mb-0">' + esc(p.name) + "</div>" +
        '<div class="cv-meta text-muted">' + esc(p.title + " · " + p.upn + "@" + M.tenant.domain + " · added to the case " + short(c.added)) + (p.departed ? " · departed " + esc(M.fmtDate(p.departed)) : "") + "</div>" +
        '<div class="d-flex flex-wrap gap-2 mt-2">' + chips.join("") + '</div></div><a class="btn btn-secondary btn-sm" href="not-in-demo.html?what=Persona+Case+Profile&amp;ships=1">VIEW PROFILE</a></div>' + strip +
      section("Legal Hold Notification", (c.lhn || []).length + " notification" + ((c.lhn || []).length === 1 ? "" : "s"), lhnBlocks +
        (releasable(c) ? '<button type="button" class="btn btn-secondary btn-sm" data-cv="panel-release">RELEASE FROM HOLD</button>' :
          '<span title="' + (c.released ? "Already released." : "Not on a legal hold: nothing to release.") + '"><button type="button" class="btn btn-secondary btn-sm" disabled>RELEASE FROM HOLD</button></span>')) +
      section("Survey", v.survey.state === "dash" && !(c.surveys || []).length ? "Not expected on this case" : (c.surveys || []).length + " survey" + ((c.surveys || []).length === 1 ? "" : "s"), surveyBlocks) +
      section("Interview", "Not expected on this case", notExpected("Interviews") + '<a class="btn btn-secondary btn-sm" href="not-in-demo.html?what=Schedule+interview&amp;ships=1">SCHEDULE</a>') +
      section("Preservation", v.preservation.text, presRows + '<a class="btn btn-secondary btn-sm" href="case-new-preservation.html?custodians=' + c.personId + '">ADD TO PRESERVATION REQUEST</a> <a class="btn btn-tertiary btn-sm" href="case-hold-status.html">OPEN HOLD STATUS</a>') +
      section("Collection", v.collection.state === "dash" ? "Not expected on this case" : v.collection.text, v.collection.state === "dash" ? notExpected("Collections") :
        '<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">From</th></tr></thead><tbody>' +
        '<tr><td class="fw-bold">Exchange mailbox</td><td><span class="badge badge-pill badge-verbatim badge-success">Collected</span></td><td>' + esc(c.collection.request) + " · to Mar 2026</td></tr>" +
        '<tr><td class="fw-bold">OneDrive</td><td><span class="badge badge-pill badge-verbatim badge-success">Collected</span></td><td>' + esc(c.collection.request) + " · to Mar 2026</td></tr></tbody></table></div>") +
      "</div>");
  }
  function openPanel(pid) {
    panelId = pid;
    if (!panel) {
      panel = D.offcanvas({ title: "Custodian coverage", width: "90vw", body: "",
        footer: '<button type="button" class="btn btn-secondary" data-cv="panel-prev">PREVIOUS CUSTODIAN</button><button type="button" class="btn btn-primary" data-cv="panel-next">NEXT CUSTODIAN</button>',
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
  function onFilter() { if (syncing) return; tileFilter = null; page = 1; renderTiles(); renderGrid(); }
  ["cvFilter", "cvWorkflow"].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener("change", onFilter);
    el.addEventListener("valueChanged.cnds.select", onFilter);
  });
  document.getElementById("cvSearch").addEventListener("input", function () { page = 1; renderGrid(); });
  /* Pager: arrows turn the page; a new page size returns to page 1. */
  function onPageSize(e) { if (e.target.getAttribute("data-pg-size") === "cv") { pageSize = +e.target.value; page = 1; renderGrid(); } }
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
    if (t.getAttribute("data-pg-for") === "cv") { page = D.turnPage(page, t.getAttribute("data-pg"), custodians.filter(matches).length, pageSize); renderGrid(); return; }
    if (t.hasAttribute("data-tile")) {
      var k = t.getAttribute("data-tile");
      tileFilter = tileFilter === k || k === "all" ? null : k; page = 1;
      setFilter("all"); renderTiles(); renderGrid(); return;
    }
    if (t.hasAttribute("data-open")) { e.preventDefault(); openPanel(t.getAttribute("data-open")); return; }
    if (t.hasAttribute("data-send-lhn")) { sendNotice(t.getAttribute("data-send-lhn")); return; }
    if (t.hasAttribute("data-send-silent")) { addSilent(t.getAttribute("data-send-silent")); return; }
    if (t.hasAttribute("data-send-survey")) { sendSurvey(t.getAttribute("data-send-survey")); return; }
    if (t.hasAttribute("data-cv-toast")) { D.toast(t.getAttribute("data-cv-toast")); return; }
    var a = t.getAttribute("data-cv");
    if (!a) return;
    if (a === "select-after") { page = 1; selected = {}; afterNoticeUnsent().forEach(function (c) { selected[c.personId] = true; }); tileFilter = null; setFilter("after"); render(); }
    if (a === "review-after") { page = 1; tileFilter = null; setFilter("after"); renderTiles(); renderGrid(); }
    if (a === "not-required") markNotRequired();
    if (a === "release") openRelease(selectedList().map(function (c) { return c.personId; }));
    if (a === "export") exportCoverage("coverage-" + D.caseId + ".csv");
    if (a === "report-xlsx") exportCoverage("case-preservation-report-" + D.caseId + ".csv");
    if (a === "panel-prev") stepPanel(-1);
    if (a === "panel-next") stepPanel(1);
    if (a === "panel-release") { var pid = panelId; panel.hide(); openRelease([pid]); }
  });

  render();
}());
