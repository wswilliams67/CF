/* ═══════════════════════════════════════════════════════════════════════
   New preservation request controller (PRD 04 §7.2, §7.3, §7.5, §7.6, §7.9).
   Nimbus components only: stepper (display-only), card sections with cf-category
   headings, cf-input-field, Select, datepicker, form-check, pills, tables, alerts,
   gray action bar. One form: general information → custodians and sources → preservation
   settings (a query hold lives in Hold scope) → routing → preview → send.
   Sources already requested are skipped and say so. Earlier work on another
   case is shown from CaseFusion's own record (PM, 10-13), never Expireon.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var q = new URLSearchParams(location.search);
  var fromCoverage = (q.get("custodians") || "").split(",").filter(Boolean);
  var queryMode = q.get("query") === "1";
  var NEW_ID = "PRS-0104";

  var st = {
    name: queryMode ? "Veltrazine · adverse event correspondence" : fromCoverage.length ? "Custodians added after the notice · preservation" : "Veltrazine custodians · preservation",
    ref: "MBP-0926", due: "2026-10-15", priority: "Normal",
    desc: fromCoverage.length ? "Custodians added after the first legal hold notification. None is on hold yet." : "",
    start: queryMode ? "query3" : fromCoverage.length ? "coverage" : "all",
    standard: !queryMode, chip: "all",
    scope: queryMode ? "query" : "all", notice: "LH-0031",
    holdName: "MBP-0926 Veltrazine Product Liability" + (queryMode ? " – adverse event correspondence" : ""),
    query: '(subject:"Veltrazine" OR "adverse event")\nAND participants:lakeshore-cro.example',
    windowLimit: true, validated: false, estimated: true, separatePolicy: true,
    removed: {}, prior: {}, modes: {}, preview: false
  };

  /* ── Rows ───────────────────────────────────────────────────────────── */
  function custodianIds() {
    if (st.start === "coverage") return fromCoverage;
    if (st.start === "scope3") return M.dataMapScope.custodians;
    if (st.start === "scope2") return ["p-vasquez", "p-torres", "p-wong", "p-park"];
    if (st.start === "query3") return ["p-vasquez", "p-wong", "p-webb"];
    if (st.start === "none") return [];
    return M.custodians.map(function (c) { return c.personId; });
  }
  function rowsFor(pid) {
    var c = M.custodians.filter(function (x) { return x.personId === pid; })[0];
    var src = M.sources.filter(function (s) { return s.owner === pid && !s.nonCustodial; }).map(function (s) {
      return { id: s.id, type: s.type, owner: pid, name: s.name, found: s.found, request: s.request, prior: s.priorWork, hold: s.hold };
    });
    if (st.standard && M.standardLaptops[pid] && !src.some(function (s) { return s.type === "Laptop"; })) {
      src.push({ id: "std-" + pid, type: "Laptop", owner: pid, name: M.standardLaptops[pid] + " (Intune)", found: "Standard source", request: null, std: true });
    }
    if (st.scope === "query") src = src.filter(function (s) { return s.type === "Exchange Online"; });
    return src.map(function (s) {
      var r = Object.assign({}, s);
      r.handler = M.handlerFor[s.type].handler;
      if (st.removed[s.id]) r.skip = "Removed from this request";
      else if (c && c.notRequired && c.notRequired.preservation) r.skip = "Preservation not required on this case · reason on record";
      else if (s.request && st.scope !== "query") r.skip = "Preserved in " + s.request + " · skipped";
      else if (s.prior && st.prior[s.id] === "rely") r.skip = "Relies on the " + s.prior.caseId + " hold (" + s.prior.request + ") · skipped";
      if (s.request && st.scope === "query") r.alreadyHeld = s.request;
      return r;
    });
  }
  function sharedRows() {
    if (st.scope === "query" || st.start === "coverage" || st.start === "none" || st.start === "query3") return [];
    return M.sources.filter(function (s) { return !s.owner && !s.pending; }).map(function (s) {
      return { id: s.id, type: s.type, owner: null, name: s.name, found: s.found, request: s.request, handler: M.handlerFor[s.type].handler,
        skip: s.request ? "Preserved in " + s.request + " · skipped" : null };
    });
  }
  function allRows() {
    var out = [];
    custodianIds().forEach(function (pid) { out = out.concat(rowsFor(pid)); });
    return out.concat(sharedRows());
  }
  function sendRows() { return allRows().filter(function (r) { return !r.skip; }); }
  function handlers(rows) {
    var g = {};
    rows.forEach(function (r) {
      var h = M.handlerFor[r.type];
      if (!g[h.handler]) g[h.handler] = { name: h.handler, kind: h.kind, dest: h.dest, rule: h.rule, rows: [] };
      g[h.handler].rows.push(r);
    });
    return Object.keys(g).map(function (k) { return g[k]; });
  }

  /* ── Sections: Nimbus card + cf-category heading; cf-input-field, Select, form-check ── */
  /* A limited profile reads as the lock + "Profile details limited", normal style, never dimmed (Scott, 10-14). Returns HTML. */
  function nameOf(pid) { var p = M.person(pid); return D.canSee(p) ? esc(p.name) : '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>'; }
  /* Section heading + summary on the shared demo-section-head (baseline alignment) (Scott, 10-14). */
  function section(id, title, summary, body) {
    return '<section class="card card-basic mb-2" id="' + id + '"><div class="card-body"><div class="demo-section-head"><h2 class="cf-category cf-cat-6 highlight-casefusion flex-grow-1 mb-0">' + esc(title) +
      '</h2><span class="small text-muted">' + esc(summary) + "</span></div>" + body + "</div></section>";
  }
  /* Shared empty state: 2XL icon, title, muted note (Scott, 10-14). */
  function empty(title, note) {
    return '<div class="demo-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="demo-empty-title">' + esc(title) + '</span><span class="demo-empty-note">' + note + "</span></div>";
  }
  function help(text) { return '<p class="small text-muted mt-1 mb-0">' + text + "</p>"; }
  function input(id, key, label, value, req, helpText, opts) {
    opts = opts || {};
    return '<div class="cf-input-field cf-input-field-casefusion"' + (opts.date ? " data-cnds-datepicker-init" : "") + '><label class="cf-input-label" for="' + id + '">' + esc(label) + (req ? ' <span class="cf-input-required">*</span>' : "") + "</label>" +
      '<div class="cf-input-wrapper">' + (opts.rows ? '<textarea id="' + id + '" class="cf-input-control' + (opts.mono ? " font-monospace" : "") + '" rows="' + opts.rows + '" data-st="' + key + '">' + esc(value) + "</textarea>" :
        '<input type="text" id="' + id + '" class="cf-input-control" data-st="' + key + '" value="' + esc(value) + '" />') + "</div>" +
      (helpText ? '<div class="cf-input-helper"><span class="cf-input-helper-text">' + esc(helpText) + "</span></div>" : "") + "</div>";
  }
  /* demo-label (12px muted caps) above a 14px value (Scott, 10-14). */
  function fact(label, value) { return '<div class="col"><span class="demo-label">' + label + "</span><div>" + value + "</div></div>"; }
  function isoToUs(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? m[2] + "-" + m[3] + "-" + m[1] : d; }
  function usToIso(d) { var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d || ""); return m ? m[3] + "-" + m[1] + "-" + m[2] : d; }
  function general() {
    var startOpts = [];
    if (fromCoverage.length) startOpts.push(["coverage", fromCoverage.length + " custodians selected on Coverage"]);
    if (queryMode) startOpts.push(["query3", "3 custodians chosen for this query hold"]);
    startOpts.push(["all", "All custodians on the case (" + M.custodians.length + ")"]);
    startOpts.push(["scope3", "Saved scope: " + M.dataMapScope.name + " · " + M.dataMapScope.saved]);
    startOpts.push(["scope2", "Saved scope: Regulatory custodians v2 · 08-28-2026"]);
    startOpts.push(["none", "Do not use a saved scope"]);
    var type = function (tag, attrs, pressed, name, text) {
      return "<" + tag + ' class="card card-basic demo-tile" ' + attrs + ' aria-pressed="' + pressed + '"><span class="card-subtitle demo-tile-name">' + name + '</span><span class="card-text demo-tile-label">' + text + "</span></" + tag + ">";
    };
    return '<div class="demo-tiles np-types" role="group" aria-label="Request type">' +
        type("button", 'type="button"', true, "Preservation", "Holds in place." + (st.scope === "query" ? "" : " No date range.")) +
        type("a", 'href="not-in-demo.html?what=Collection+request"', false, "Collection", "Collects within a set date range.") +
        type("a", 'href="not-in-demo.html?what=Preservation+and+collection+request"', false, "Preservation and Collection", "Two linked requests from one form.") + "</div>" +
      '<div class="row g-3">' +
        '<div class="col-md-4">' + input("npName", "name", "Request Name", st.name, true) + "</div>" +
        '<div class="col-md-4">' + input("npRef", "ref", "Reference ID", st.ref, true) + "</div>" +
        '<div class="col-md-4">' + input("npDue", "due", "Due Date", isoToUs(st.due), true, "Applies to work people do. Automatic handlers start on send.", { date: true }) + "</div>" +
        '<div class="col-md-8">' + D.select("npStart", startOpts, st.start, "Start From *", { attrs: 'data-st="start"' }) +
          help("Scopes are saved on the data map. Custodians and sources can be added manually below.") + "</div>" +
        '<div class="col-md-4">' + D.select("npPri", [["Normal", "Normal"], ["Urgent", "Urgent"]], st.priority, "Priority *", { attrs: 'data-st="priority"' }) + "</div>" +
        '<div class="col-12">' + input("npDesc", "desc", "Description", st.desc, false, "", { rows: 2 }) + "</div></div>";
  }
  function custodiansAndSources() {
    var rows = allRows();
    var std = rows.filter(function (r) { return r.found === "Standard source"; }).length;
    var already = rows.filter(function (r) { return r.skip && /skipped$/.test(r.skip); }).length;
    var chipOk = function (r) { return st.chip === "all" || (st.chip === "std" && r.found === "Standard source") || (st.chip === "already" && r.skip && /skipped$/.test(r.skip)); };
    var table = function (list, showCust) {
      return '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>' + (showCust ? '<th scope="col">Custodian</th>' : "") +
        '<th scope="col">Source</th><th scope="col">Location</th><th scope="col">Origin</th><th scope="col">Handler</th><th scope="col"></th></tr></thead><tbody>' +
        list.filter(chipOk).map(function (r) {
          var masked = r.owner && !D.canSee(M.person(r.owner));
          var prior = r.prior && !r.request ? '<div class="small text-info mt-1"><i class="mdi mdi-history" aria-hidden="true"></i> ' + esc(r.prior.what + " on " + r.prior.caseId + " · " + r.prior.request + " · " + r.prior.via + " · " + M.fmtDate(r.prior.on)) + "</div>" +
            '<div class="mt-1 np-prior">' + D.select("npPrior-" + r.id, [["own", "Place this case's own hold (recommended)"], ["rely", "Rely on the " + r.prior.caseId + " hold"]], st.prior[r.id] === "rely" ? "rely" : "own", "",
              { size: "sm", attrs: 'data-prior="' + r.id + '" aria-label="Earlier work"' }) + "</div>" : "";
          return "<tr>" + (showCust ? "<td>" + nameOf(r.owner) + "</td>" : "") +
            '<td><span class="fw-bold">' + esc(M.typeLabel(r.type)) + "</span>" + (r.skip ? '<span class="d-block small text-muted">' + esc(r.skip) + "</span>" : "") +
              (r.alreadyHeld ? '<span class="d-block small text-muted">Already under the all-content Purview hold (' + esc(r.alreadyHeld) + ")</span>" : "") + prior + "</td>" +
            "<td>" + esc(masked ? "Outside your regions" : r.name) + "</td><td>" + esc(r.found) + "</td><td>" + esc(r.handler) + (M.handlerFor[r.type].kind === "Automatic" ? " · automatic" : "") +
            ' <a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Change+handler">CHANGE</a></td>' +
            '<td class="text-center"><button type="button" class="btn btn-tertiary btn-sm" data-remove="' + r.id + '">' + (st.removed[r.id] ? "RESTORE" : "REMOVE") + "</button></td></tr>";
        }).join("") + "</tbody></table></div>";
    };
    var pill = function (k, label, n) { return '<li class="nav-item"><button type="button" class="nav-link' + (st.chip === k ? " active" : "") + '" data-chip="' + k + '" aria-pressed="' + (st.chip === k) + '">' + label + ' <span class="nav-pill-badge">' + n + "</span></button></li>"; };
    var body = '<div class="d-flex align-items-center flex-wrap gap-2 mb-1"><ul class="nav nav-pills nav-pills-nimbus nav-pills-casefusion me-auto" role="group" aria-label="Show sources">' +
        pill("all", "All", rows.length) + pill("std", "Standard", std) + pill("already", "Already Requested", already) + "</ul>" +
      '<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" id="npStd"' + (st.standard ? " checked" : "") + (st.scope === "query" ? " disabled" : "") + " />" +
      '<label class="form-check-label" for="npStd">Add standard sources</label></div>' +
      '<a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Add+custodian&amp;ships=1">+ ADD CUSTODIAN</a><a class="btn btn-tertiary btn-sm" href="not-in-demo.html?what=Add+source">+ ADD SOURCE</a></div>' +
      '<p class="small text-muted mb-3">' + (st.scope === "query" ? "Off for this request. Only the sources listed here are sent, and routing adds nothing else." :
        "Sources come from the starting point plus standard sources. Tenant: Exchange mailbox, OneDrive, Laptop.") + "</p>";
    if (st.scope === "query") body += table(rows, true);
    else {
      custodianIds().forEach(function (pid) {
        var list = rowsFor(pid), p = M.person(pid), c = M.custodians.filter(function (x) { return x.personId === pid; })[0];
        var skipped = list.filter(function (r) { return r.skip; }).length;
        var notes = [];
        if (p.departed) notes.push("Departed " + M.fmtDate(p.departed).replace(/^\d+ /, ""));
        if (c && c.afterNotice) notes.push("Added after the notice · not on hold");
        body += '<div class="mb-3"><div class="d-flex align-items-center flex-wrap gap-2 py-2"><span class="fw-bold">' + nameOf(pid) + '</span><span class="small text-muted">' + esc(D.canSee(p) ? p.title : "Outside your regions") + "</span>" +
          notes.map(function (n) { return '<span class="badge badge-warning">' + esc(n) + "</span>"; }).join("") +
          '<span class="small text-muted ms-auto">' + list.length + " sources" + (skipped ? " · " + skipped + " skipped" : "") + "</span></div>" + (list.length ? table(list, false) : empty("No Sources", "No sources are on record for this custodian. Use + ADD SOURCE to add one.")) + "</div>";
      });
      var shared = sharedRows();
      if (shared.length) body += '<div class="mb-3"><div class="d-flex align-items-center flex-wrap gap-2 py-2"><span class="fw-bold">Shared Sources</span><span class="small text-muted">One work item each, linked to the custodians who use them</span><span class="small text-muted ms-auto">' + shared.length + " sources</span></div>" + table(shared, false) + "</div>";
      if (!custodianIds().length) body += empty("No Custodians", "Use + ADD CUSTODIAN, or choose a starting point above.");
    }
    var send = sendRows().length;
    return section("npCust", "Custodians and Sources", custodianIds().length + " custodians · " + rows.length + " sources · " + (rows.length - send) + " skipped as already requested or relied on", body);
  }
  function queryLines() {
    var lines = st.query.split("\n").filter(function (l) { return l.trim(); }).map(function (l) { return [l, "typed above"]; });
    if (st.windowLimit) lines.push(["AND sent>=" + M.window.start + " AND sent<=" + M.window.end, "added by the case window"]);
    return lines;
  }
  function settings() {
    var mailboxes = sendRows().filter(function (r) { return r.type === "Exchange Online"; });
    var body = '<div class="row g-3 mb-2"><div class="col-md-4">' + input("npHold", "holdName", "Hold Name Shown to Responders", st.holdName, true) + "</div>" +
      '<div class="col-md-4">' + D.select("npScope", [["all", "All content, no date limit"], ["forward", "Content from a date forward"], ["query", "Only content matching a query (KeyQL)"]], st.scope, "Hold Scope *", { attrs: 'data-st="scope"' }) +
        help(st.scope === "query" ? "Purview holds all content first, then clears what does not match on its next pass." : st.scope === "forward" ? "A Purview capability: content created before the date is not held." : "No filter. Everything in each location is held.") + "</div>" +
      '<div class="col-md-4">' + D.select("npNotice", [["LH-0031", "Linked to legal hold notification LH-0031 (sent)"], ["none", "No notification"]], st.notice, "Custodian Notification *", { attrs: 'data-st="notice"' }) + "</div></div>" +
      help("Automatic holds (Purview) are placed on send. Response teams place the rest and record how.");
    if (st.scope === "query") {
      body += '<div class="card card-basic mt-3 mb-0"><div class="card-body">' +
        input("npQuery", "query", "Content Query (KeyQL)", st.query, false, "Mail properties only, because every location on this request is a mailbox.", { rows: 3, mono: true }) +
        '<div class="d-flex align-items-center flex-wrap gap-3 my-2"><button type="button" class="btn btn-secondary btn-sm" data-np="validate">VALIDATE QUERY</button>' +
          (st.validated ? '<span class="badge badge-success">Valid syntax · checked 10-08-2026 at 2:07 PM</span>' : "") +
          '<div class="form-check m-0"><input class="form-check-input" type="checkbox" id="npWin"' + (st.windowLimit ? " checked" : "") + ' /><label class="form-check-label" for="npWin">Limit the hold to the case window</label></div></div>' +
        /* Sub-headings inside this nested card: category type without the bar, which marks page sections (Scott, 10-14). */
        '<div class="demo-card-head mt-3"><div class="cf-category cf-cat-6 flex-grow-1 mb-0" role="heading" aria-level="3">What Purview Receives</div></div>' +
        '<dl class="row demo-kv mb-2">' +  /* 12px bold labels, 14px values; 2/10 columns because this card spans the page (Scott, 10-14) */
          '<dt class="col-sm-2 fw-bold">Hold Policy</dt><dd class="col-sm-10 mb-1">' + esc(st.holdName) + " · new policy in Purview case MBP-0926</dd>" +
          '<dt class="col-sm-2 fw-bold">Locations</dt><dd class="col-sm-10 mb-1">' + mailboxes.length + " Exchange mailboxes · " + esc(mailboxes.map(function (r) { return D.canSee(M.person(r.owner)) ? r.name.split("@")[0] + "@" : "outside your regions"; }).join(", ")) + "</dd>" +
          '<dt class="col-sm-2 fw-bold">Sent As</dt><dd class="col-sm-10 mb-1">The policy\'s contentQuery (Graph) · -ContentMatchQuery on the hold rule (PowerShell)</dd></dl>' +
        '<pre class="np-pre">' + queryLines().map(function (l) { return esc(l[0]) + '    <span class="text-muted">← ' + esc(l[1]) + "</span>"; }).join("\n") + "</pre>" +
        help("This is the whole query, exactly as it is sent. Nothing else is added. Every location here is a mailbox, so sent applies to all of them; a SharePoint or OneDrive row would need its own policy with a document date property.") +
        '<div class="demo-card-head mt-3"><div class="cf-category cf-cat-6 flex-grow-1 mb-0" role="heading" aria-level="3">How a Query Hold Behaves in Purview</div></div>' +
        '<p class="mb-2">Everything in each location is held when the hold is applied, which can take up to 24 hours. Purview then clears content that does not match, 7 to 14 days later — so for the first two weeks the hold is wider than the query.</p>' +
        '<p>Purview ignores the query where a location already carries more than five holds, and it always keeps unindexed items. Those locations stay fully held.</p>' +
        '<span class="demo-label">Estimate</span><div class="d-flex align-items-center flex-wrap gap-2"><span>About 1,240 items in ' + mailboxes.length + " mailboxes · from a Purview search that finished today at 2:09 PM, 38 seconds after it started</span>" +
          '<button type="button" class="btn btn-tertiary btn-sm" data-np="estimate">RUN ESTIMATE AGAIN</button></div>' +
        help("CaseFusion runs a Purview search with this query and these locations, then reads the estimate when the search finishes. Microsoft publishes no service level for search times: seconds for a few mailboxes, about 25 minutes for 100,000. The hold does not wait for it, and the number will not match what the hold keeps — the hold also keeps unindexed items.") + "</div></div>";
    }
    return section("npSettings", "Preservation Settings", st.scope === "query" ? "Content matching a query" : (st.scope === "forward" ? "Content from a date forward" : "All content, no date limit") +
      (st.notice === "LH-0031" ? " · Linked to legal hold notification LH-0031" : " · No notification"), body);
  }
  function routing() {
    var hs = handlers(sendRows());
    var body = '<p class="small text-muted">Each team gets its own assignment and sees only that assignment. Destinations come from the routing rule.</p>' +
      hs.map(function (h) {
        var types = {}; h.rows.forEach(function (r) { types[r.type] = (types[r.type] || 0) + 1; });
        var work = "Preservation: " + h.rows.length + (h.name === "Purview hold" ? " holds" : " work items") + " (" + Object.keys(types).map(M.typeLabel).join(", ") + ")";
        var auto = h.kind === "Automatic";
        var mode = st.modes[h.name] || "queue-suggested";
        /* Nested card head: category type, no bar, badge at the right; never a 20px card title inside a card (Scott, 10-14). */
        return '<div class="card card-basic mb-2"><div class="card-body"><div class="demo-card-head"><div class="cf-category cf-cat-6 flex-grow-1 mb-0" role="heading" aria-level="3">' + esc(h.name) + '</div><span class="badge badge-secondary">' + esc(h.kind) + "</span></div>" +
          '<p class="card-text small text-muted mb-2">Routing rule: ' + esc(h.rule) + "</p>" +
          '<div class="row row-cols-1 row-cols-md-3 g-3">' + fact("Work", esc(work)) + fact("Destination", esc(h.dest)) +
          (auto ? fact("Timing", "Starts on send. Status shows per custodian, and each Purview hold shows as Applied once Purview reports it.") :
            '<div class="col">' + D.select("npMode-" + h.name.replace(/\W+/g, ""), [["queue", "Team queue (unassigned)"], ["queue-suggested", "Team queue with suggested owner"], ["named", "Named assignees only"]], mode, "Assignment Mode",
              { size: "sm", attrs: 'data-mode="' + esc(h.name) + '"' }) +
              help(mode === "named" ? "Owen Fitzgerald, Raj Malhotra · no conflicts found" : mode === "queue-suggested" ? "Suggested owner: Owen Fitzgerald" : "Anyone on the team can take it") + "</div>") + "</div>" +
          (st.scope === "query" && auto ? '<div class="form-check mt-3"><input class="form-check-input" type="checkbox" id="npSep"' + (st.separatePolicy ? " checked" : "") + " />" +
            '<label class="form-check-label" for="npSep">Create a separate hold policy for this query hold (recommended)</label></div>' +
            help(st.separatePolicy ? "New policy in Purview case MBP-0926: " + esc(st.holdName) : "If unchecked, the query is added to the case's main Purview hold policy, which narrows that hold for every location in it. A confirmation is requested before sending.") : "") +
          "</div></div>";
      }).join("") + (hs.length ? "" : empty("Nothing to Route", "Add custodians or sources above."));
    return section("npRouting", "Routing", hs.length + " handler" + (hs.length === 1 ? "" : "s") + " from routing rules", body);
  }

  /* ── Preview (PRD 04 §7.6) ──────────────────────────────────────────── */
  function checks() {
    var rows = allRows(), send = sendRows(), out = [];
    var skipped = rows.filter(function (r) { return r.skip && /^Preserved in/.test(r.skip); });
    if (skipped.length) out.push(["", skipped.length + " source" + (skipped.length === 1 ? "" : "s") + " already in " + Array.from(new Set(skipped.map(function (r) { return r.request; }))).join(" or ") + " " + (skipped.length === 1 ? "is" : "are") + " skipped."]);
    rows.filter(function (r) { return r.prior && !r.request; }).forEach(function (r) {
      var who = D.canSee(M.person(r.owner)) ? M.person(r.owner).name + "'s" : "A custodian's";
      out.push(["", st.prior[r.id] === "rely" ?
        who + " mailbox relies on the " + r.prior.caseId + " hold (" + r.prior.request + "). If that hold is released, this case raises an exception rather than assuming the mailbox is still held." :
        who + " mailbox is already preserved on " + r.prior.caseId + " (" + r.prior.request + "). Holds combine, so this case's own hold adds nothing today but keeps the mailbox held if " + r.prior.caseId + " releases it."]);
    });
    var laptops = send.filter(function (r) { return r.std; }).length;
    if (laptops) out.push(["", laptops + " laptop" + (laptops === 1 ? " has" : "s have") + " no confirmed location. Endpoint & Mobile will confirm " + (laptops === 1 ? "it" : "them") + "."]);
    var unnotified = custodianIds().filter(function (pid) { var c = M.custodians.filter(function (x) { return x.personId === pid; })[0]; return c && c.afterNotice; });
    if (unnotified.length && st.notice === "LH-0031") out.push(["", unnotified.length + " custodian" + (unnotified.length === 1 ? " has" : "s have") + " not been sent LH-0031. The hold and the notice are separate; send the notice from Coverage."]);
    if (st.scope === "query") {
      send.filter(function (r) { return r.alreadyHeld; }).forEach(function (r) {
        out.push(["", (D.canSee(M.person(r.owner)) ? M.person(r.owner).name + "'s" : "A custodian's") + " mailbox is already fully held by the case's main Purview hold (" + r.alreadyHeld + "). Holds combine, so a narrower one never reduces a wider one: this query hold adds nothing for them until that hold is released."]);
      });
      out.push(["info", "Nothing is narrowed for up to 14 days. Everything in the " + send.length + " mailboxes is held first, and the record shows both dates."]);
      out.push(["info", "No standard sources added. Routing sends only the " + send.length + " rows above."]);
      out.push(["info", st.separatePolicy ? "Separate hold policy is checked, so the case's main Purview hold is unchanged." : "The query will be added to the case's main Purview hold policy and narrow it for every location in it."]);
    }
    if (!out.length) out.push(["info", "No warnings."]);
    return out;
  }
  function preview() {
    var send = sendRows(), all = allRows(), hs = handlers(send);
    var cust = {}; send.forEach(function (r) { if (r.owner) cust[r.owner] = 1; });
    var skippedN = all.length - send.length;
    var tile = function (n, v, s) { return '<div class="card card-basic demo-tile"><span class="card-subtitle demo-tile-name">' + n + '</span><span class="card-title demo-tile-value">' + v + '</span><span class="card-text demo-tile-label">' + esc(s) + "</span></div>"; };
    return '<div class="demo-tiles np-strip">' + tile("Custodians", Object.keys(cust).length, "with sources on this request") + tile("Sources", all.length, skippedN + " skipped") +
        tile("Will Be Sent", send.length, send.length === 1 ? "hold" : "holds") + tile("Handlers", hs.length, hs.filter(function (h) { return h.kind === "Automatic"; }).length + " automatic") +
        tile("Hold Scope", st.scope === "query" ? "KeyQL" : "All", st.scope === "query" ? "content matching a query" : "content, no date limit") + "</div>" +
      section("npReqs", "Requests to Be Created", "", '<div class="table-responsive"><table class="table align-middle mb-2"><thead><tr><th scope="col">Request</th><th scope="col">Name</th><th scope="col">Work items</th><th scope="col">Skipped</th></tr></thead><tbody>' +
        '<tr><td class="fw-bold">' + NEW_ID + " · Preservation</td><td>" + esc(st.name) + "</td><td>" + send.length + " holds</td><td>" + (skippedN ? skippedN + " already requested or relied on" : "None") + "</td></tr></tbody></table></div>" +
        help("IDs are allocated at preview, so " + NEW_ID + " can be referred to before the request is sent.")) +
      section("npAsg", "Assignments", "", '<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th scope="col">Handler</th><th scope="col">Work</th><th scope="col">Destination</th><th scope="col">On send</th></tr></thead><tbody>' +
        hs.map(function (h) {
          var mode = st.modes[h.name] || "queue-suggested";
          return '<tr><td><span class="fw-bold">' + esc(h.name) + '</span><span class="d-block small text-muted">' + esc(h.kind) + "</span></td><td>Preserve: " + h.rows.length + (h.name === "Purview hold" ? " holds" : " devices kept") + "</td><td>" + esc(h.dest) + "</td><td>" +
            (h.kind === "Automatic" ? "Holds are placed right away" + (st.scope === "query" && st.separatePolicy ? " · separate hold policy" : "") :
              mode === "named" ? "Owen Fitzgerald and Raj Malhotra notified 1:1" : "Posted to the team's Teams channel" + (mode === "queue-suggested" ? " · suggested owner: Owen Fitzgerald" : "")) + "</td></tr>";
        }).join("") + "</tbody></table></div>") +
      section("npChecks", "Pre-Send Checks", "Checks warn; they do not block", '<div class="np-checks">' + checks().map(function (c) {
        var info = c[0] === "info";
        return '<div class="alert alert-' + (info ? "info" : "warning") + ' mb-2" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-' + (info ? "information" : "alert") + '"></i></span><span>' + esc(c[1]) + "</span></div>";
      }).join("") + "</div>");
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  function disposeWidgets(root) {
    if (!window.Nimbus) return;
    root.querySelectorAll("select[data-cnds-select-init]").forEach(function (el) { var x = Nimbus.Select && Nimbus.Select.getInstance(el); if (x) x.dispose(); });
    root.querySelectorAll("[data-cnds-datepicker-init]").forEach(function (el) { var x = Nimbus.Datepicker && Nimbus.Datepicker.getInstance(el); if (x) x.dispose(); });
  }
  function initWidgets(root) {
    if (!window.Nimbus) return;
    if (Nimbus.Select) Nimbus.Select.initAll(root);
    if (Nimbus.Datepicker) root.querySelectorAll("[data-cnds-datepicker-init]").forEach(function (el) { new Nimbus.Datepicker(el, { format: "mm-dd-yyyy" }); });
  }
  function render() {
    var dueEl = document.getElementById("npDue");
    if (dueEl && dueEl.value) st.due = usToIso(dueEl.value);
    document.getElementById("npTitle").textContent = st.preview ? "Preview · New Preservation Request" : "New Preservation Request";
    /* Stepper (cnds-steppers), display-only: no .stepper-content, states set here. */
    var steps = [["npGeneral", "General Information"], ["npCust", "Custodians and Sources"], ["npSettings", "Preservation Settings"], ["npRouting", "Routing"], ["preview", "Preview"]];
    document.getElementById("npSteps").innerHTML = steps.map(function (s, n) {
      var state = st.preview ? (s[0] === "preview" ? " active" : " completed") : (n === 0 ? " active" : "");
      return '<li class="stepper-step' + state + '" data-step="' + s[0] + '" role="button" tabindex="0"' + (state === " active" ? ' aria-current="step"' : "") + '><div class="stepper-head"><span class="stepper-icon">' + (n + 1) +
        '</span><div class="stepper-label-group"><span class="stepper-label">' + s[1] + "</span></div></div></li>";
    }).join("");
    var form = document.getElementById("npForm"), pv = document.getElementById("npPreview");
    disposeWidgets(form);
    form.hidden = st.preview; pv.hidden = !st.preview;
    if (st.preview) pv.innerHTML = preview();
    else { form.innerHTML = section("npGeneral", "General Information", "", general()) + custodiansAndSources() + settings() + routing(); initWidgets(form); }
    var n = sendRows().length;
    document.getElementById("npFoot").innerHTML = st.preview ?
      '<button type="button" class="btn btn-tertiary btn-tools" data-np="back">BACK</button><span class="small">Response teams and named assignees are notified on send.</span>' +
        '<div class="toolbar-action-end"><button type="button" class="btn btn-primary" data-np="send"' + (n ? "" : " disabled") + ">SEND REQUEST</button></div>" :
      '<span class="small">Draft saved 2 min ago</span><div class="toolbar-action-end"><a class="btn btn-secondary" href="case-requests.html">CANCEL</a><button type="button" class="btn btn-secondary" data-np="draft">SAVE DRAFT</button>' +
        '<button type="button" class="btn btn-primary" data-np="preview"' + (n && st.name.trim() ? "" : " disabled") + ">PREVIEW</button></div>";
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  function onChange(e) {
    var t = e.target;
    var k = t.getAttribute && t.getAttribute("data-st");
    if (k) {
      st[k] = t.value;
      if (k === "scope") { st.standard = st.scope !== "query"; if (st.scope === "query" && st.start !== "query3" && st.start !== "coverage") st.start = "query3"; }
      if (k === "start" || k === "scope") st.removed = {};
      if (k !== "name" && k !== "ref" && k !== "desc" && k !== "holdName" && k !== "due" && k !== "query") render();
      return;
    }
    if (t.id === "npStd") { st.standard = t.checked; render(); }
    if (t.id === "npWin") { st.windowLimit = t.checked; render(); }
    if (t.id === "npSep") { st.separatePolicy = t.checked; render(); }
    if (t.hasAttribute && t.hasAttribute("data-prior")) { st.prior[t.getAttribute("data-prior")] = t.value; render(); }
    if (t.hasAttribute && t.hasAttribute("data-mode")) { st.modes[t.getAttribute("data-mode")] = t.value; render(); }
  }
  document.addEventListener("change", function (e) { if (e.target.tagName !== "SELECT") onChange(e); });
  /* Nimbus Select reports a choice as valueChanged.cnds.select on the native <select>. */
  document.addEventListener("valueChanged.cnds.select", function (e) { setTimeout(function () { onChange(e); }, 0); });
  document.addEventListener("input", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-st");
    if (k === "name" || k === "ref" || k === "desc" || k === "holdName" || k === "due" || k === "query") {
      st[k] = e.target.value;
      if (k === "query") st.validated = false;
      var btn = document.querySelector('[data-np="preview"]');
      if (btn) btn.disabled = !(sendRows().length && st.name.trim());
    }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.hasAttribute && e.target.hasAttribute("data-step")) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener("focusout", function (e) { if (e.target.id === "npQuery" || e.target.id === "npHold") render(); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, [data-step]");
    if (!t) return;
    if (t.hasAttribute("data-chip")) { st.chip = t.getAttribute("data-chip"); render(); return; }
    if (t.hasAttribute("data-remove")) { var id = t.getAttribute("data-remove"); st.removed[id] = !st.removed[id]; render(); return; }
    if (t.hasAttribute("data-step")) {
      var s = t.getAttribute("data-step");
      if (s === "preview") { if (sendRows().length) { st.preview = true; render(); window.scrollTo(0, 0); } return; }
      st.preview = false; render();
      var el = document.getElementById(s); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    var a = t.getAttribute("data-np");
    if (a === "validate") { st.validated = true; render(); D.toast("Valid syntax."); }
    if (a === "estimate") D.toast("Estimate refreshed: about 1,240 items. Uses 1 of the tenant's daily search jobs.");
    if (a === "draft") D.toast("Draft saved.");
    if (a === "preview") { st.preview = true; render(); window.scrollTo(0, 0); }
    if (a === "back") { st.preview = false; render(); }
    if (a === "send") {
      var payload = { id: NEW_ID, title: st.name, due: usToIso(st.due), scope: st.scope === "query" ? "Content matching a KeyQL query" : st.scope === "forward" ? "Content from a date forward" : "All content, no date limit",
        items: sendRows().map(function (r) { return { id: r.id, type: r.type, owner: r.owner, name: r.name, handler: r.handler }; }) };
      location.href = "case-requests.html?sent=" + encodeURIComponent(JSON.stringify(payload));
    }
  });

  render();
  /* The datepicker plugin arrives with Nimbus; re-render once it is ready so the due date gets mm-dd-yyyy. */
  document.addEventListener("cnds.ready", function () { if (!st.preview) render(); });
}());
