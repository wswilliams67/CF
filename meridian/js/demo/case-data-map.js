/* ═══════════════════════════════════════════════════════════════════════
   Data map controller — built to the v1.5 Case Administrator design
   (Figma 17235:760021 "Data Map | Dark"); PRD 01 was revised to match.
   The case's reading screen: what data exists, who touched it, and the scope
   a request starts from. It never creates a request.
   Every number comes from data/meridian.js; check.js reconciles them.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;
  var DM = M.dataMap;
  var nf = function (n) { return Math.round(n).toLocaleString("en-US"); };

  /* ── Source kinds: the five Microsoft 365 workloads have summary cards (design icons);
        everything else is listed but has no audit-log activity. ─────────────── */
  var KIND = { "SharePoint": "sharepoint", "Microsoft Teams": "teams", "OneDrive": "onedrive", "Exchange Online": "exchange", "Copilot interactions": "copilot",
               "Box": "box", "Webex": "webex", "File share": "fileshare" };
  var KINDS = [["sharepoint", "SharePoint"], ["teams", "Teams"], ["onedrive", "OneDrive"], ["exchange", "Exchange"], ["copilot", "Copilot"],
               ["box", "Box"], ["webex", "Webex"], ["fileshare", "File share"]];
  var CARDS = KINDS.slice(0, 5);
  var MDI = { box: "mdi-package-variant-closed", webex: "mdi-video-outline", fileshare: "mdi-folder-network-outline" };
  function icon(kind) {
    return MDI[kind] ? '<i class="mdi ' + MDI[kind] + ' cnds-icon-ml dm-icon-mdi" aria-hidden="true"></i>' : '<img class="dm-icon" src="../img/sources/' + kind + '.svg" width="22" height="22" alt="" />';
  }
  function kindOf(s) { return KIND[s.type]; }
  function kindName(k) { return KINDS.filter(function (x) { return x[0] === k; })[0][1]; }

  /* ── State ──────────────────────────────────────────────────────────── */
  var all = M.holdStatusSources().filter(function (s) { return !s.addedForCustodian; });
  var custIds = M.custodians.map(function (c) { return c.personId; });
  var st = {
    view: "source", basis: "window", range: null,
    cust: {}, kinds: {}, tags: {},
    exSrc: {}, exLoc: {}, exPerson: {},
    added: {}, card: null, list: "top", page: 1, size: 10,
    edit: false, scope: null, scopes: DM.savedScopes.map(function (x) { return Object.assign({}, x); }),
    ppl: { tools: false, q: "", hold: "all", show: "unreleased", sort: "events", asc: false, page: 1, size: 10 }
  };
  custIds.forEach(function (id) { st.cust[id] = true; });
  KINDS.forEach(function (k) { st.kinds[k[0]] = true; });

  /* ── People ─────────────────────────────────────────────────────────── */
  function isCustodian(pid) { return !!st.added[pid] || custIds.indexOf(pid) !== -1; }
  function personLabel(p) { return D.canSee(p) ? esc(p.name) : '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>'; }
  function alias(p) { var a = p.upn.split("."); return (a[0].charAt(0) + a[a.length - 1]).toLowerCase(); }
  function holdOf(pid) {
    var src = M.sourcesOf(pid);
    if (st.added[pid]) return "No";
    if (src.some(function (s) { return s.hold === "Applied" || s.hold === "Attested"; })) return "Active";
    if (src.some(function (s) { return s.hold === "Applying"; })) return "Pending";
    return "No";
  }

  /* A custodian's activity: every in-scope source they own or have UAL events on, and their own events. */
  function activityOf(pid) {
    var src = 0, ev = 0;
    inScope().forEach(function (s) {
      var a = accessedOf(s).filter(function (x) { return x[0] === pid; })[0];
      if (a || s.owner === pid) { src++; ev += a ? Math.round(a[1] * factor()) : 0; }
    });
    return { sources: src, events: ev };
  }

  /* ── Dates and counts ───────────────────────────────────────────────── */
  var DAY = 86400000;
  var WIN = (Date.parse(M.window.end) - Date.parse(M.window.start)) / DAY + 1;
  function factor() {
    if (st.range) {
      var a = Math.max(Date.parse(st.range.from), Date.parse(M.window.start)), b = Math.min(Date.parse(st.range.to), Date.parse(M.window.end));
      return Math.max(0, (b - a) / DAY + 1) / WIN;
    }
    return st.basis === "all" ? 1.37 : 1;
  }
  function locsOf(s) {
    if (DM.locations[s.id]) return DM.locations[s.id];
    return [[M.locations[s.id] || s.name, M.items[s.id] || 0, null]];
  }
  function itemsRaw(s) {
    var ex = st.exLoc[s.id] || {};
    return locsOf(s).reduce(function (n, l) { return n + (ex[l[0]] ? 0 : l[1]); }, 0);
  }
  function items(s) { return Math.round(itemsRaw(s) * factor()); }
  function accessedOf(s) {
    var ex = st.exPerson[s.id] || {};
    return (DM.accessed[s.id] || []).filter(function (a) { return !ex[a[0]]; });
  }
  function events(s) {
    if (s.events == null) return null;
    var ex = st.exPerson[s.id] || {};
    var cut = (DM.accessed[s.id] || []).reduce(function (n, a) { return n + (ex[a[0]] ? a[1] : 0); }, 0);
    return Math.round((s.events - cut) * factor());
  }
  function dateLabel() {
    if (st.range) return M.fmtDate(st.range.from) + " – " + M.fmtDate(st.range.to) + " · Date range";
    return st.basis === "all" ? "Full tenant history · all time" : M.fmtDate(M.window.start) + " – " + M.fmtDate(M.window.end) + " · Case window";
  }

  /* ── Filters → visible sources ──────────────────────────────────────── */
  function tagsApplied() { return Object.keys(st.tags).filter(function (k) { return st.tags[k]; }); }
  function custInView(pid) {
    if (!st.cust[pid]) return false;
    var tags = tagsApplied();
    return !tags.length || tags.some(function (t) { return DM.tags[t].indexOf(pid) !== -1; });
  }
  function visible() {
    return all.filter(function (s) {
      if (!st.kinds[kindOf(s)]) return false;
      if (s.owner && custIds.indexOf(s.owner) !== -1 && !custInView(s.owner)) return false;
      return true;
    });
  }
  function inScope() { return visible().filter(function (s) { return !st.exSrc[s.id]; }); }

  /* ── Source naming (design: name + location line; owners masked outside region) ── */
  function srcName(s) {
    var k = kindOf(s), p = s.owner ? M.person(s.owner) : null;
    if (p && !D.canSee(p)) return { title: "Profile details limited", loc: "Outside your regions", masked: true };
    if (k === "exchange") return { title: p.name + " mailbox", loc: s.name };
    if (k === "onedrive") return { title: alias(p) + " OneDrive", loc: M.tenant.domain.split(".")[0] + "-my.sharepoint.com/personal/" + alias(p) };
    if (k === "copilot") return { title: "Copilot · " + p.name, loc: "Copilot.M365Copilot · " + alias(p) };
    if (k === "teams") return { title: s.name, loc: "Team · " + (M.locations[s.id] || "") };
    if (k === "sharepoint") return { title: s.name + " site", loc: M.tenant.domain.split(".")[0] + ".sharepoint.com" + (M.locations[s.id] || "") };
    return { title: s.name, loc: (M.locations[s.id] || "").replace(/^[^·]+· /, "") + " · " + kindName(k) };
  }

  /* ── Widgets: Selects are disposed before markup is replaced, then re-initialised ── */
  function swap(el, html) {
    if (window.Nimbus && Nimbus.Select) el.querySelectorAll("select[data-cnds-select-init]").forEach(function (x) { var i = Nimbus.Select.getInstance(x); if (i) i.dispose(); });
    el.innerHTML = html;
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(el);
  }
  function pager(key, total, page, size, label, container) {
    var pages = Math.max(1, Math.ceil(total / size)), a = total ? (page - 1) * size + 1 : 0, b = Math.min(total, page * size);
    var btn = function (act, ic, lbl, dis) { return '<button type="button" class="pagination-toolbar-btn" data-pg="' + act + '" data-pg-for="' + key + '" aria-label="' + lbl + '"' + (dis ? " disabled" : "") + '><i class="mdi ' + ic + '" aria-hidden="true"></i></button>'; };
    return '<div class="pagination-toolbar mt-2"><span class="pagination-toolbar-label">' + (label || "Results per page:") + "</span>" +
      D.select("pg-" + key, [["10", "10"], ["25", "25"], ["50", "50"]], String(size), null, { size: "sm", container: container, attrs: 'data-pg-size="' + key + '" aria-label="Results per page"' }) +
      '<span class="pagination-toolbar-range">' + a + "-" + b + " of " + total + '</span><nav class="pagination-toolbar-nav" aria-label="Page navigation">' +
      btn("first", "mdi-skip-previous", "First page", page <= 1) + btn("prev", "mdi-chevron-left", "Previous page", page <= 1) +
      btn("next", "mdi-chevron-right", "Next page", page >= pages) + btn("last", "mdi-skip-next", "Last page", page >= pages) + "</nav></div>";
  }
  function turn(page, act, total, size) {
    var pages = Math.max(1, Math.ceil(total / size));
    return act === "first" ? 1 : act === "prev" ? Math.max(1, page - 1) : act === "next" ? Math.min(pages, page + 1) : pages;
  }
  function bar(v, max) {
    var pct = max ? Math.max(4, Math.round(v / max * 100)) : 0;
    return '<div class="progress dm-bar" style="height: 6px;"><div class="progress-bar bg-success" role="progressbar" style="width: ' + pct + '%;" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"></div></div>';
  }

  /* ── Filters card ───────────────────────────────────────────────────── */
  function renderChips() {
    var menus = [];
    var nC = custIds.filter(function (id) { return st.cust[id]; }).length, nK = KINDS.filter(function (k) { return st.kinds[k[0]]; }).length, nT = tagsApplied().length;
    var chip = function (key, text, menu) {
      menus.push('<div class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion show dm-filter-menu" data-menu="' + key + '">' + menu + "</div>");
      return '<button type="button" class="chip chip-outline-light dm-chip" data-dm="edit-filters" aria-expanded="' + st.edit + '">' + text + "</button>";
    };
    var head = function (id, label, n, on) {
      return '<label class="dropdown-item dropdown-item-check dm-menu-head" for="' + id + '"><input type="checkbox" class="form-check-input" id="' + id + '"' + (on ? " checked" : "") + ' />' +
        '<span class="flex-grow-1">' + label + '</span><span class="badge badge-pill badge-secondary">' + n + "</span></label>";
    };
    var item = function (group, id, label, sub, on) {
      return '<label class="dropdown-item dropdown-item-check" for="f-' + group + "-" + id + '"><input type="checkbox" class="form-check-input" id="f-' + group + "-" + id + '" data-f="' + group + '" data-v="' + id + '"' + (on ? " checked" : "") + " />" +
        "<span>" + label + (sub ? '<span class="d-block small text-muted">' + sub + "</span>" : "") + "</span></label>";
    };
    var cMenu = '<div class="px-3 pt-2 pb-1"><div class="cf-input-field cf-input-field-casefusion cf-input-field-sm"><div class="cf-input-wrapper"><input type="text" class="cf-input-control" id="dmCustQ" placeholder="Search …" aria-label="Search custodians" /></div></div></div>' +
      head("f-all-cust", "All Custodians", custIds.length, nC === custIds.length) + '<div class="dm-menu-list">' +
      custIds.map(function (id) { var p = M.person(id); return item("cust", id, D.canSee(p) ? esc(p.name) : "Profile details limited", D.canSee(p) ? esc(p.title) : "Outside your regions", st.cust[id]); }).join("") + "</div>";
    var kMenu = head("f-all-kind", "All Source Types", KINDS.length, nK === KINDS.length) + '<div class="dm-menu-list">' +
      KINDS.map(function (k) { return item("kind", k[0], k[1], "", st.kinds[k[0]]); }).join("") + "</div>";
    var tMenu = head("f-all-tag", "All Custodian Tags", Object.keys(DM.tags).length, nT === Object.keys(DM.tags).length) + '<div class="dm-menu-list">' +
      Object.keys(DM.tags).map(function (t) { return item("tag", t, esc(t), DM.tags[t].length + (DM.tags[t].length === 1 ? " custodian" : " custodians"), st.tags[t]); }).join("") + "</div>" +
      '<p class="small text-muted px-3 pt-2 mb-1">Custodian tags are managed from the Custodians tab.</p>';
    var html =
      chip("cust", "Custodians: " + (nC === custIds.length ? "All" : nC + " of " + custIds.length), cMenu) +
      chip("kind", "Source Types: " + (nK === KINDS.length ? "All" : nK + " of " + KINDS.length), kMenu) +
      chip("tag", "Custodian Tags: " + nT + " Applied", tMenu);
    /* Edit Filters opens all three menus together, side by side under the chips (design 17249:815353). */
    document.getElementById("dmChips").innerHTML = html + (st.edit ? '<div class="dm-filter-menus">' + menus.join("") + "</div>" : "");
    var eb = document.querySelector('.btn[data-dm="edit-filters"]');
    eb.setAttribute("aria-expanded", String(st.edit)); eb.classList.toggle("active", st.edit);
  }
  function renderRefined() {
    var chips = [], hasDate = !!st.range, ex = [];
    if (st.range) chips.push('<span class="chip chip-outline-light">Date Range: ' + esc(M.fmtDate(st.range.from) + " – " + M.fmtDate(st.range.to)) +
      ' <i class="close mdi mdi-close-circle" role="button" tabindex="0" aria-label="Remove date range" data-clear="range"></i></span>');
    all.forEach(function (s) {
      var n = srcName(s);
      if (st.exSrc[s.id]) ex.push(['Excluding: ' + esc(n.title) + " (" + nf(M.items[s.id] * factor()) + " items)", "src|" + s.id]);
      Object.keys(st.exLoc[s.id] || {}).forEach(function (l) { if (st.exLoc[s.id][l]) ex.push(["Excluding: " + esc(n.title + " \\" + l + "\\") + " (" + nf(locsOf(s).filter(function (x) { return x[0] === l; })[0][1] * factor()) + " items)", "loc|" + s.id + "|" + l]); });
      Object.keys(st.exPerson[s.id] || {}).forEach(function (pid) {
        if (!st.exPerson[s.id][pid]) return;
        var a = DM.accessed[s.id].filter(function (x) { return x[0] === pid; })[0];
        var who = D.nameFor(M.person(pid));
        ex.push(["Excluding: " + esc(n.title.indexOf(who) === -1 ? n.title + " · " + who : n.title) + " (" + nf(a[1] * factor()) + " sessions)", "per|" + s.id + "|" + pid]);
      });
    });
    ex.forEach(function (e) { chips.push('<span class="chip chip-outline-light">' + e[0] + ' <i class="close mdi mdi-close-circle" role="button" tabindex="0" aria-label="Remove exclusion" data-clear="' + esc(e[1]) + '"></i></span>'); });
    document.getElementById("dmRefined").innerHTML = chips.length ?
      '<div class="card card-basic mt-3 mb-0 dm-refined"><div class="card-body"><div class="d-flex align-items-center gap-3 mb-2"><h3 class="cf-category cf-cat-6 mb-0 me-auto">Refined results - applied to the filters above</h3>' +
        (hasDate ? '<button type="button" class="btn btn-tertiary btn-sm" data-clear="dates">CLEAR ALL DATES</button>' : "") +
        (ex.length ? '<button type="button" class="btn btn-tertiary btn-sm" data-clear="exclusions">CLEAR ALL EXCLUSIONS</button>' : "") +
        '</div><div class="d-flex flex-wrap gap-2">' + chips.join("") + "</div></div></div>" : "";
  }
  function dateMenu(err) {
    var f = function (id, label, val) {
      return '<div class="cf-input-field cf-input-field-casefusion mb-2' + (err && id === "dmTo" ? " is-invalid" : "") + '" data-cnds-datepicker-init><label class="cf-input-label" for="' + id + '">' + label + ' <span class="cf-input-required">*</span></label>' +
        '<div class="cf-input-wrapper"><input type="text" id="' + id + '" class="cf-input-control" placeholder="mm-dd-yyyy" value="' + esc(val) + '" /></div>' +
        (id === "dmTo" ? '<div class="cf-input-helper"><span class="cf-input-error">' + esc(err || "") + "</span></div>" : "") + "</div>";
    };
    var us = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? m[2] + "-" + m[3] + "-" + m[1] : ""; };
    var el = document.getElementById("dmDateMenu");
    el.querySelectorAll("[data-cnds-datepicker-init]").forEach(function (x) { var i = Nimbus.Datepicker && Nimbus.Datepicker.getInstance(x); if (i) i.dispose(); });
    el.innerHTML = '<div class="px-3 py-2"><h3 class="cf-category cf-cat-6">Date range</h3>' + f("dmFrom", "From", us(M.window.start)) + f("dmTo", "To", us(M.window.end)) +
      '<div class="d-flex justify-content-end gap-2 mt-2"><button type="button" class="btn btn-secondary btn-sm" data-dm="date-cancel">CANCEL</button><button type="button" class="btn btn-primary btn-sm" data-dm="date-add">ADD</button></div></div>';
    if (window.Nimbus && Nimbus.Datepicker) el.querySelectorAll("[data-cnds-datepicker-init]").forEach(function (x) { new Nimbus.Datepicker(x, { format: "mm-dd-yyyy" }); });
  }

  /* ── Summary line and cards ─────────────────────────────────────────── */
  function renderSummary() {
    var s = inScope();
    var it = s.reduce(function (n, x) { return n + items(x); }, 0), ev = s.reduce(function (n, x) { return n + (events(x) || 0); }, 0);
    var held = custIds.filter(function (id) { return custInView(id) && holdOf(id) === "Active"; }).length;
    document.getElementById("dmSummary").innerHTML = "<b>" + nf(it) + "</b> items across <b>" + s.length + "</b> sources (" + nf(ev) + " UAL events) · <b>" + held + "</b> custodian" + (held === 1 ? "" : "s") + " on hold · " + esc(dateLabel());
  }
  function renderCards() {
    var el = document.getElementById("dmTiles"), note = document.getElementById("dmTilesNote");
    if (st.view === "people") {
      var c = custIds.filter(custInView);
      var ev = function (id) { return activityOf(id).events; };
      var meaningful = c.filter(function (id) { return ev(id) >= 500; }).length;
      var t = function (n, v) { return '<div class="card dm-card dm-card-static"><div class="card-body"><span class="dm-card-label">' + n + '</span><span class="dm-card-value">' + v + "</span></div></div>"; };
      el.className = "dm-cards dm-cards-4";
      el.innerHTML = t("Custodians in the case", c.length) + t("On hold - this case", c.filter(function (id) { return holdOf(id) === "Active"; }).length) +
        t("Meaningful UAL activity", meaningful) + t("Minimal / no activity", c.length - meaningful);
      note.hidden = false;
      return;
    }
    note.hidden = true;
    el.className = "dm-cards";
    var vis = visible();
    el.innerHTML = CARDS.map(function (k) {
      var list = all.filter(function (s) { return kindOf(s) === k[0] && (!st.kinds[k[0]] || vis.indexOf(s) !== -1) && !st.exSrc[s.id]; });
      var off = !st.kinds[k[0]];
      return '<button type="button" class="card dm-card" data-card="' + k[0] + '" aria-pressed="' + (st.card === k[0]) + '"><div class="card-body">' +
        '<span class="dm-card-name">' + icon(k[0]) + esc(k[1]) + "</span>" +
        '<span class="dm-card-value">' + nf(list.reduce(function (n, s) { return n + items(s); }, 0)) + '</span><span class="dm-card-unit">ITEMS</span>' +
        '<span class="dm-card-sub"><span>' + list.length + " source" + (list.length === 1 ? "" : "s") + '</span><span class="dm-card-div" aria-hidden="true"></span><span>' +
          nf(list.reduce(function (n, s) { return n + (events(s) || 0); }, 0)) + " UAL events</span></span>" +
        (off ? '<span class="badge badge-warning dm-card-badge">NOT IN FILTER</span>' : "") + "</div></button>";
    }).join("");
  }

  /* ── By source: Top sources / All sources ───────────────────────────── */
  function renderSources() {
    var list = visible().filter(function (s) { return !st.card || kindOf(s) === st.card; })
      .sort(function (a, b) { return itemsRaw(b) - itemsRaw(a); });
    var total = list.length;
    if (st.list === "top") list = list.slice(0, 6);
    var shown = st.list === "top" ? list : list.slice((st.page - 1) * st.size, st.page * st.size);
    var max = Math.max.apply(null, list.map(function (s) { return items(s); }).concat([1]));
    var title = (st.list === "top" ? "Top sources" : "All sources") + (st.card ? " &gt; " + esc(kindName(st.card)) : "");
    var rows = shown.map(function (s) {
      var n = srcName(s), ex = !!st.exSrc[s.id], acc = accessedOf(s).length;
      return '<tr class="' + (ex ? "dm-excluded" : "") + '"><td><div class="d-flex align-items-center gap-2">' + icon(kindOf(s)) + "<div>" +
          '<a href="#" class="' + (n.masked ? "demo-masked" : "") + '" data-details="' + s.id + '">' + (n.masked ? '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>' : "") + esc(n.title) + "</a>" +
          '<span class="d-block small">' + esc(n.loc) + "</span></div></div></td>" +
        '<td class="dm-col-bar">' + bar(items(s), max) + '</td><td class="text-end">' + nf(items(s)) + "</td>" +
        "<td>" + (s.events == null ? '<span class="small">No activity data</span>' : acc + (acc === 1 ? " person" : " people")) + "</td>" +
        '<td class="text-end"><button type="button" class="btn btn-tertiary btn-sm' + (ex ? " text-danger" : "") + '" data-exclude="' + s.id + '" aria-pressed="' + ex + '">' + (ex ? "EXCLUDED" : "EXCLUDE") + "</button></td></tr>";
    }).join("");
    swap(document.getElementById("dmList"),
      '<div class="d-flex align-items-center gap-3 mb-2"><h2 class="cf-category cf-cat-6 mb-0">' + title + "</h2>" +
        (st.card ? '<button type="button" class="btn btn-tertiary btn-sm" data-dm="clear-card">CLEAR</button>' : "") +
        '<div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Sources shown">' +
          '<input type="radio" class="btn-check" name="dmList" id="dmListTop" value="top" autocomplete="off"' + (st.list === "top" ? " checked" : "") + '><label class="btn btn-secondary" for="dmListTop">TOP SOURCES</label>' +
          '<input type="radio" class="btn-check" name="dmList" id="dmListAll" value="all" autocomplete="off"' + (st.list === "all" ? " checked" : "") + '><label class="btn btn-secondary" for="dmListAll">ALL SOURCES</label></div></div>' +
      '<div class="table-responsive"><table class="table align-middle mb-0 dm-table"><thead><tr><th scope="col">Source</th><th scope="col" colspan="2">Items</th><th scope="col">People accessed</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5" class="text-center py-4">No sources match the filters above.</td></tr>') + "</tbody></table></div>" +
      (st.list === "top" ? pager("src", shown.length, 1, 10) : pager("src", total, st.page, st.size)));
  }

  /* ── By people: Custodians ──────────────────────────────────────────── */
  function peopleRows() {
    var P = st.ppl;
    var rows = custIds.filter(custInView).map(function (id) {
      var a = activityOf(id);
      return { id: id, p: M.person(id), sources: a.sources, events: a.events, hold: holdOf(id) };
    });
    if (P.q) rows = rows.filter(function (r) { return D.canSee(r.p) && (r.p.name + " " + r.p.title).toLowerCase().indexOf(P.q.toLowerCase()) !== -1; });
    if (P.hold !== "all") rows = rows.filter(function (r) { return P.hold === "held" ? r.hold === "Active" : r.hold !== "Active"; });
    var key = P.sort, dir = P.asc ? 1 : -1;
    rows.sort(function (a, b) { return key === "name" ? dir * D.nameFor(a.p).localeCompare(D.nameFor(b.p)) : dir * (a[key] - b[key]); });
    return rows;
  }
  function renderPeople() {
    var P = st.ppl, rows = peopleRows(), max = Math.max.apply(null, rows.map(function (r) { return r.events; }).concat([1]));
    var shown = rows.slice((P.page - 1) * P.size, P.page * P.size);
    var tools = P.tools ? '<div class="btn-toolbar-gray btn-toolbar-list flex-grow-1" role="toolbar" aria-label="Custodian table tools">' +
        '<div class="toolbar-list-search"><div class="cf-input-field cf-input-field-casefusion"><div class="cf-input-wrapper"><input type="text" id="dmPplQ" class="cf-input-control" placeholder="Search …" aria-label="Search custodians" value="' + esc(P.q) + '" /></div></div></div>' +
        '<span class="toolbar-list-divider" aria-hidden="true"></span><div class="toolbar-list-controls"><span class="toolbar-list-label">Filter By</span>' +
        D.select("dmPplHold", [["all", "All hold states"], ["held", "On hold"], ["not", "Not on hold"]], P.hold, null, { size: "sm", attrs: 'data-ppl="hold"' }) +
        '<span class="toolbar-list-label">Show</span>' + D.select("dmPplShow", [["unreleased", "Unreleased"], ["all", "All"]], P.show, null, { size: "sm", attrs: 'data-ppl="show"' }) +
        '<span class="toolbar-list-label">Sort By</span>' + D.select("dmPplSort", [["events", "Events"], ["sources", "Sources"], ["name", "Name"]], P.sort, null, { size: "sm", attrs: 'data-ppl="sort"' }) +
        '<button type="button" class="btn btn-tertiary btn-sm" data-dm="ppl-dir"><i class="mdi mdi-arrow-' + (P.asc ? "up" : "down") + '-circle mdi-18px me-2" aria-hidden="true"></i>' + (P.asc ? "ASC" : "DSC") + "</button></div></div>" : '<span class="flex-grow-1"></span>';
    swap(document.getElementById("dmList"),
      '<div class="d-flex align-items-center gap-3 mb-2"><h2 class="cf-category cf-cat-6 mb-0">Custodians</h2>' + tools +
        '<button type="button" class="btn btn-secondary btn-sm' + (P.tools ? " active" : "") + '" data-dm="ppl-tools" aria-pressed="' + P.tools + '" aria-label="Table tools" title="Table tools"><i class="mdi mdi-tools mdi-18px" aria-hidden="true"></i></button></div>' +
      '<div class="table-responsive"><table class="table align-middle mb-0 dm-table"><thead><tr><th scope="col">#</th><th scope="col">Custodian</th><th scope="col">Role</th><th scope="col" class="text-end">Sources</th><th scope="col" class="text-end">Events</th><th scope="col">On hold</th><th scope="col" colspan="2">Relevance signal</th></tr></thead><tbody>' +
      shown.map(function (r, i) {
        var rel = r.events >= 3000 ? "High" : r.events >= 1000 ? "Medium" : "Low";
        var tone = r.hold === "Active" ? "text-success" : r.hold === "Pending" ? "text-warning" : "";
        return "<tr><td>" + ((P.page - 1) * P.size + i + 1) + '</td><td><a href="not-in-demo.html?what=' + encodeURIComponent("Persona case profile") + '">' + personLabel(r.p) + "</a></td><td>" + (D.canSee(r.p) ? esc(r.p.title) : "—") +
          '</td><td class="text-end">' + r.sources + '</td><td class="text-end">' + nf(r.events) + '</td><td class="' + tone + '">' + r.hold + '</td><td class="dm-col-bar">' + bar(r.events, max) + '</td><td class="text-end">' + rel + "</td></tr>";
      }).join("") + "</tbody></table></div>" + pager("ppl", rows.length, P.page, P.size));
  }

  /* ── Notable non-custodians ─────────────────────────────────────────── */
  function renderNotable() {
    document.getElementById("dmNc").innerHTML = M.notableNonCustodians.map(function (n) {
      var p = M.person(n.personId), ok = D.canSee(p), s = all.filter(function (x) { return x.id === n.source; })[0];
      var why = n.kind === "Top collaborator" ? "Top collaborator · with " + D.nameFor(M.person(n.with)) + " · " + srcName(s).title + " · " + n.events + " events" :
        n.workload + " overlap · " + srcName(s).title + " · " + n.events + " events" + (n.note ? " · " + n.note : "");
      var act = isCustodian(n.personId) ? '<span class="badge badge-pill badge-success">Custodian</span>' :
        '<button type="button" class="btn btn-tertiary btn-sm" data-add-cust="' + n.personId + '"' + (!ok || n.guest ? " disabled" : "") + (n.guest ? ' title="A guest is not a natural person in CaseFusion"' : !ok ? ' title="Outside your regions"' : "") + ">MARK AS CUSTODIAN</button>";
      return '<li class="list-group-item d-flex align-items-center gap-3"><div class="me-auto"><a href="not-in-demo.html?what=' + encodeURIComponent("Persona profile") + '">' + personLabel(p) + "</a>" +
        (ok ? ' <span class="small fw-bold">— ' + esc(p.title) + "</span>" : "") + (n.guest && ok ? ' <span class="badge badge-pill badge-secondary">Guest</span>' : "") +
        '<span class="d-block small">' + (ok ? esc(why) : "Outside your regions") + "</span></div>" + act + "</li>";
    }).join("");
  }

  /* ── Scope bar and saved scopes ─────────────────────────────────────── */
  function exclusionCount() {
    var n = Object.keys(st.exSrc).filter(function (k) { return st.exSrc[k]; }).length;
    [st.exLoc, st.exPerson].forEach(function (m) { Object.keys(m).forEach(function (s) { n += Object.keys(m[s]).filter(function (k) { return m[s][k]; }).length; }); });
    return n;
  }
  function renderScopeBar() {
    var n = exclusionCount();
    var removed = all.reduce(function (t, s) { return t + (st.exSrc[s.id] ? M.items[s.id] : (M.items[s.id] || 0) - itemsRaw(s)); }, 0);
    document.getElementById("dmScopeText").textContent = (st.scope ? "Loaded: " + st.scope + " · " : "") +
      (n ? n + " exclusion" + (n === 1 ? "" : "s") + " applied — " + nf(removed * factor()) + " items removed from scope" : "No exclusions applied yet — scope matches the filters above");
  }
  function renderScopesMenu() {
    var me = D.viewer().personId;
    var list = st.scopes;
    document.getElementById("dmScopesMenu").innerHTML = '<div class="d-flex align-items-center px-3 pt-2 pb-1"><h3 class="cf-category cf-cat-6 mb-0 me-auto">Saved scopes</h3><span class="badge badge-pill badge-secondary">' + list.length + "</span></div>" +
      (list.length ? '<ul class="list-group list-group-light list-group-flush">' + list.map(function (sc, i) {
        var mine = sc.by === me, who = M.person(sc.by);
        return '<li class="list-group-item d-flex align-items-center gap-2"><div class="me-auto"><span class="fw-bold d-block">' + esc(sc.name) + '</span><span class="small d-block">' + esc(sc.detail) + " · Saved " + esc(M.fmtDate(sc.saved)) + " at " + esc(sc.time) + "</span>" +
          (mine ? "" : '<span class="small text-muted d-block">Shared by ' + esc(D.nameFor(who)) + "</span>") + "</div>" +
          (mine ? '<button type="button" class="btn btn-tertiary btn-sm" data-scope-del="' + i + '">DELETE</button><button type="button" class="btn btn-tertiary btn-sm" data-scope-ren="' + i + '">RENAME</button>' : "") +
          '<button type="button" class="btn btn-tertiary btn-sm" data-scope-load="' + i + '">LOAD</button></li>';
      }).join("") + "</ul>" : '<p class="px-3 py-3 mb-0 text-center">No saved scopes yet. FINALIZE SCOPE AND SAVE creates one.</p>');
  }

  function render() {
    renderChips(); renderRefined(); renderSummary(); renderCards();
    if (st.view === "source") renderSources(); else renderPeople();
    renderNotable(); renderScopeBar(); renderScopesMenu();
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  function markCustodian(pid) {
    st.added[pid] = true;
    D.toast(M.person(pid).name + " marked as a custodian on " + M.caseById(D.caseId).name + ". Coverage lists them as added from the data map, not yet notified or on hold.");
    render();
    if (openPanel) openPanel.draw();
  }
  function loadScope(i) {
    var sc = st.scopes[i];
    custIds.forEach(function (id) { st.cust[id] = sc.custodians.indexOf(id) !== -1; });
    st.exSrc = {}; sc.excluded.forEach(function (id) { st.exSrc[id] = true; });
    st.exLoc = {}; st.exPerson = {}; st.range = null;
    st.basis = sc.basis || "window"; document.getElementById(st.basis === "all" ? "dmBasisA" : "dmBasisW").checked = true;
    st.scope = sc.name; st.page = 1;
    closeMenu("dmLoadBtn"); render();
    D.toast("Scope loaded: " + sc.name + ".");
  }
  function closeMenu(id) { var t = document.getElementById(id), i = window.Nimbus && Nimbus.Dropdown && Nimbus.Dropdown.getInstance(t); if (i) i.hide(); }
  function nameField(id, label, value, placeholder) {
    return '<div class="cf-input-field cf-input-field-casefusion"><label class="cf-input-label" for="' + id + '">' + label + ' <span class="cf-input-required">*</span></label>' +
      '<div class="cf-input-wrapper"><input type="text" id="' + id + '" class="cf-input-control" value="' + esc(value || "") + '" placeholder="' + esc(placeholder || "") + '" /></div></div>';
  }
  function finalize() {
    var s = inScope(), it = s.reduce(function (n, x) { return n + items(x); }, 0);
    var m = D.modal({ title: "Finalize Scope And Save",
      body: '<p>Saved scopes are named, reusable data map definitions — retrievable later from Preserve in Place, Data Collections, and other workflows across the system.</p>' +
        nameField("dmScopeName", "Scope name", "", "e.g. Regulatory Submissions Review — Case Window") +
        '<p class="note note-info mt-3 mb-0">' + nf(it) + " items across " + s.length + " sources will be saved with this scope: " + esc(dateLabel()) + (exclusionCount() ? ", " + exclusionCount() + " exclusion" + (exclusionCount() === 1 ? "" : "s") : "") + ".</p>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button><button type="button" class="btn btn-primary" data-ok disabled>FINALIZE AND SAVE</button>' });
    var inp = m.el.querySelector("#dmScopeName"), ok = m.el.querySelector("[data-ok]");
    inp.addEventListener("input", function () { ok.disabled = !inp.value.trim(); });
    ok.addEventListener("click", function () {
      var name = inp.value.trim();
      st.scopes.unshift({ name: name, detail: (st.range ? "Date range" : st.basis === "all" ? "All time" : "Case window") + " · " + custIds.filter(custInView).length + " custodians · " +
        (exclusionCount() ? exclusionCount() + " exclusion" + (exclusionCount() === 1 ? "" : "s") : "no exclusions"), saved: M.DEMO_TODAY, time: "9:42 AM", by: D.viewer().personId,
        custodians: custIds.filter(custInView), excluded: Object.keys(st.exSrc).filter(function (k) { return st.exSrc[k]; }) });
      st.scope = name; m.hide(); render();
      D.toast("Scope saved: " + name + ". A preservation request can start from it.");
    });
  }
  function renameScope(i) {
    closeMenu("dmLoadBtn");
    var sc = st.scopes[i];
    var m = D.modal({ title: "Rename Saved Scope", body: nameField("dmRename", "Scope name", sc.name),
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button><button type="button" class="btn btn-primary" data-ok disabled>RENAME</button>' });
    var inp = m.el.querySelector("#dmRename"), ok = m.el.querySelector("[data-ok]");
    inp.addEventListener("input", function () { ok.disabled = !inp.value.trim() || inp.value.trim() === sc.name; });
    ok.addEventListener("click", function () {
      var was = sc.name; sc.name = inp.value.trim(); if (st.scope === was) st.scope = sc.name;
      m.hide(); render(); D.toast("Scope renamed to " + sc.name + ".");
    });
  }
  function deleteScope(i) {
    closeMenu("dmLoadBtn");
    var sc = st.scopes[i];
    var m = D.modal({ title: "Please Confirm", body: "<p class=\"mb-0\">Are you sure you want to delete the saved scope " + esc(sc.name) + "? This action cannot be undone.</p>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button><button type="button" class="btn btn-danger" data-ok>DELETE</button>' });
    m.el.querySelector("[data-ok]").addEventListener("click", function () {
      st.scopes.splice(i, 1); if (st.scope === sc.name) st.scope = null;
      m.hide(); render(); D.toast("Saved scope deleted: " + sc.name + ".");
    });
  }
  function exportItems() {
    var s = inScope(), ev = s.reduce(function (n, x) { return n + (events(x) || 0); }, 0);
    var m = D.modal({ title: "Export Items",
      body: "<p>Item-level export for the current filters and refinements.</p><p class=\"note note-info mb-0\">This will export item-level detail for " + nf(ev) + " events across " + s.length +
        " sources, matching the current filters and refinements. Full source paths are included in the CSV; the app view continues to show relative names.</p>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button><button type="button" class="btn btn-primary" data-ok>DOWNLOAD CSV</button>' });
    m.el.querySelector("[data-ok]").addEventListener("click", function () {
      csv("data-map-" + D.caseId + ".csv", [["Source", "Location", "Source type", "Items", "UAL events", "People accessed"]].concat(s.map(function (x) {
        var n = srcName(x); return [n.title, n.loc, kindName(kindOf(x)), items(x), events(x) == null ? "No activity data" : events(x), accessedOf(x).length]; })));
      m.hide();
    });
  }
  function csv(name, rows) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    D.toast("Exported " + (rows.length - 1) + " rows.");
  }

  /* ── Source details (Nimbus offcanvas): Location / Item / Accessed / Participants ── */
  var openPanel = null;
  function details(sid) {
    var s = all.filter(function (x) { return x.id === sid; })[0], k = kindOf(s), n = srcName(s);
    var tabs = k === "sharepoint" || k === "onedrive" ? [["location", "LOCATION VIEW"], ["item", "ITEM VIEW"], ["accessed", "ACCESSED"]] :
      k === "teams" ? [["participants", "PARTICIPANTS"], ["accessed", "ACCESSED"]] : k === "exchange" || k === "copilot" ? [["accessed", "ACCESSED"]] : [["location", "LOCATION VIEW"]];
    var v = { tab: tabs[0][0], q: "", filter: "all", sort: null, asc: true, page: 1, size: 10, loc: locsOf(s)[0][0],
      exLoc: Object.assign({}, st.exLoc[sid] || {}), exPer: Object.assign({}, st.exPerson[sid] || {}) };
    var panel = D.offcanvas({ title: "Source Details", width: "75vw", body: "", footer: " ",
      onHidden: function () { openPanel = null; } });
    var cont = "#" + panel.id;
    var SORTS = { location: [["name", "Location"], ["items", "Items"], ["last", "Last activity"]], item: [["name", "Name"], ["modified", "Modified"], ["type", "Type"]],
      accessed: [["events", "Events"], ["name", "Name"]], participants: [["name", "Name"], ["since", "Member since"]] };
    var FILTERS = { location: [["all", "All locations"], ["in", "Included"], ["out", "Excluded"]], item: [["all", "All types"], ["Document", "Documents"], ["Spreadsheet", "Spreadsheets"], ["PDF", "PDFs"]],
      accessed: [["all", "Everyone"], ["cust", "Custodians"], ["not", "Not custodians"]], participants: [["all", "Everyone"], ["cust", "Custodians"], ["not", "Not custodians"]] };
    function custStatus(pid, ev) {
      var p = M.person(pid);
      if (p.guest) return "Guest · not a natural person";
      if (isCustodian(pid)) return "Custodian";
      if (ev != null && ev < DM.threshold) return "Below Threshold";
      return D.canSee(p) ? '<button type="button" class="btn btn-tertiary btn-sm" data-sd-mark="' + pid + '">MARK AS CUSTODIAN</button>' : "Not a Custodian";
    }
    function toolbar() {
      var t = v.tab, sorts = SORTS[t];
      if (!v.sort) v.sort = sorts[0][0];
      return '<div class="btn-toolbar-gray btn-toolbar-list mb-2" role="toolbar" aria-label="Table tools">' +
        '<div class="toolbar-list-search"><div class="cf-input-field cf-input-field-casefusion"><div class="cf-input-wrapper"><input type="text" class="cf-input-control" id="sdQ" placeholder="Search …" aria-label="Search" value="' + esc(v.q) + '" /></div></div></div>' +
        '<span class="toolbar-list-divider" aria-hidden="true"></span><div class="toolbar-list-controls"><span class="toolbar-list-label">Filter By</span>' +
        D.select("sdFilter", FILTERS[t], v.filter, null, { size: "sm", container: cont, attrs: 'data-sd="filter"' }) +
        '<span class="toolbar-list-label">Sort By</span>' + D.select("sdSort", sorts, v.sort, null, { size: "sm", container: cont, attrs: 'data-sd="sort"' }) +
        '<button type="button" class="btn btn-tertiary btn-sm" data-sd-dir><i class="mdi mdi-arrow-' + (v.asc ? "up" : "down") + '-circle mdi-18px me-2" aria-hidden="true"></i>' + (v.asc ? "ASC" : "DSC") + "</button></div></div>";
    }
    function table(head, rows, empty) {
      return '<div class="table-responsive"><table class="table align-middle mb-0 dm-table"><thead><tr>' + head.map(function (h) { return '<th scope="col"' + (h[1] ? ' class="' + h[1] + '"' : "") + ">" + h[0] + "</th>"; }).join("") +
        "</tr></thead><tbody>" + (rows || '<tr><td colspan="' + head.length + '" class="text-center py-4">' + (empty || "Nothing matches.") + "</td></tr>") + "</tbody></table></div>";
    }
    function page(list) { return list.slice((v.page - 1) * v.size, v.page * v.size); }
    function sortBy(list, get) { var d = v.asc ? 1 : -1; return list.sort(function (a, b) { var x = get(a), y = get(b); return typeof x === "number" ? d * (x - y) : d * String(x).localeCompare(String(y)); }); }
    function q(text) { return !v.q || text.toLowerCase().indexOf(v.q.toLowerCase()) !== -1; }
    function locationPane() {
      var list = locsOf(s).filter(function (l) { return q(l[0]) && (v.filter === "all" || (v.filter === "out") === !!v.exLoc[l[0]]); });
      sortBy(list, function (l) { return v.sort === "items" ? l[1] : v.sort === "last" ? (l[2] || "") : l[0]; });
      var nEx = Object.keys(v.exLoc).filter(function (x) { return v.exLoc[x]; }), exItems = locsOf(s).reduce(function (t, l) { return t + (v.exLoc[l[0]] ? l[1] : 0); }, 0);
      return '<p class="mb-2">' + (DM.locations[sid] ? "Click a location name to see its items." : "This source is not integrated, so CaseFusion reads no audit-log activity for it. It is listed as one location.") + "</p>" +
        (nEx.length ? '<div class="alert alert-warning" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span><span><b>' + nEx.length + "</b> location" + (nEx.length === 1 ? "" : "s") +
          " excluded · <b>" + nf(exItems * factor()) + "</b> items removed from scope</span></div>" : "") +
        toolbar() + table([["Location"], ["Items", "text-end"], ["Last activity"], ['<span class="visually-hidden">Actions</span>']], page(list).map(function (l) {
          var ex = !!v.exLoc[l[0]];
          return '<tr class="' + (ex ? "dm-excluded" : "") + '"><td>' + (DM.locations[sid] ? '<a href="#" data-sd-loc="' + esc(l[0]) + '">\\' + esc(l[0]) + "\\</a>" : esc(l[0])) + '</td><td class="text-end">' + nf(l[1] * factor()) + "</td><td>" +
            (l[2] ? esc(M.fmtDate(l[2])) : "—") + '</td><td class="text-end"><button type="button" class="btn btn-tertiary btn-sm' + (ex ? " text-danger" : "") + '" data-sd-ex="' + esc(l[0]) + '" aria-pressed="' + ex + '">' + (ex ? "EXCLUDED" : "EXCLUDE") + "</button></td></tr>";
        }).join("")) + pager("sd", list.length, v.page, v.size, "Items per page:", cont);
    }
    function itemsOf(loc) {
      var owner = s.owner ? M.person(s.owner) : null;
      return (DM.items[loc] || []).map(function (it) {
        var who = it[3] ? M.person(it[3]) : owner;
        return { name: it[0].replace("{{who}}", owner ? owner.name.split(" ")[1] : ""), type: it[1], modified: it[2], owner: who };
      });
    }
    function itemPane() {
      var locs = locsOf(s);
      var list = itemsOf(v.loc).filter(function (it) { return q(it.name) && (v.filter === "all" || it.type === v.filter); });
      sortBy(list, function (it) { return v.sort === "modified" ? it.modified : v.sort === "type" ? it.type : it.name; });
      var locRow = locs.filter(function (l) { return l[0] === v.loc; })[0];
      return '<p class="mb-2">Item-level detail for forensic review, one location at a time. Full paths shown here are never used in the standard views.</p>' +
        '<ul class="nav nav-pills nav-pills-nimbus nav-pills-casefusion flex-wrap mb-2" role="group" aria-label="Location">' + locs.map(function (l) {
          return '<li class="nav-item"><button type="button" class="nav-link' + (l[0] === v.loc ? " active" : "") + '" data-sd-pill="' + esc(l[0]) + '" aria-pressed="' + (l[0] === v.loc) + '">\\' + esc(l[0]) + "\\</button></li>"; }).join("") + "</ul>" +
        toolbar() + table([["Name"], ["Type"], ["Modified"], ["UAL activity"], ["Owner"]], page(list).map(function (it, i) {
          return '<tr><td><a href="#" data-sd-item="' + i + '">' + esc(it.name) + "</a></td><td>" + esc(it.type) + "</td><td>" + esc(M.fmtDate(it.modified)) + "</td><td>" +
            (it.modified >= M.window.start && it.modified <= M.window.end ? "Accessed in window" : "No activity in window") + "</td><td>" + personLabel(it.owner) + "</td></tr>";
        }).join(""), "No items match.") +
        '<p class="small mt-2 mb-0">Showing a sample of ' + list.length + " of " + nf(locRow[1]) + " items in \\" + esc(v.loc) + "\\.</p>" + pager("sd", list.length, v.page, v.size, "Items per page:", cont);
    }
    function accessedPane() {
      var list = (DM.accessed[sid] || []).map(function (a) { return { pid: a[0], p: M.person(a[0]), events: a[1] }; })
        .filter(function (r) { return q(D.nameFor(r.p)) && (v.filter === "all" || (v.filter === "cust") === isCustodian(r.pid)); });
      if (v.sort === null || v.sort === "events") { v.sort = "events"; }
      sortBy(list, function (r) { return v.sort === "name" ? D.nameFor(r.p) : r.events; });
      var copilot = k === "copilot";
      var nEx = Object.keys(v.exPer).filter(function (x) { return v.exPer[x]; });
      return '<p class="mb-2">Everyone with recorded UAL activity against this source in the case window — this reflects observed access, not granted permissions. Custodian status flagged from the case roster.</p>' +
        (nEx.length ? '<div class="alert alert-warning" role="status"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-alert"></i></span><span><b>' + nEx.length + "</b> " + (nEx.length === 1 ? "person's" : "people's") + " Copilot sessions excluded from scope</span></div>" : "") +
        toolbar() + table([["Name"], ["Role"], ["Events", "text-end"], ["Custodian status", "text-center"]].concat(copilot ? [['<span class="visually-hidden">Actions</span>']] : []), page(list).map(function (r) {
          var ex = !!v.exPer[r.pid];
          return '<tr class="' + (ex ? "dm-excluded" : "") + '"><td>' + personLabel(r.p) + (r.p.guest && D.canSee(r.p) ? ' <span class="badge badge-pill badge-secondary">Guest</span>' : "") + "</td><td>" + (D.canSee(r.p) ? esc(r.p.title) : "—") +
            '</td><td class="text-end">' + nf(r.events * factor()) + '</td><td class="text-center">' + custStatus(r.pid, r.events) + "</td>" +
            (copilot ? '<td class="text-end"><button type="button" class="btn btn-tertiary btn-sm' + (ex ? " text-danger" : "") + '" data-sd-exp="' + r.pid + '" aria-pressed="' + ex + '">' + (ex ? "EXCLUDED" : "EXCLUDE") + "</button></td>" : "") + "</tr>";
        }).join(""), "No recorded activity in this period.") + pager("sd", list.length, v.page, v.size, "Items per page:", cont);
    }
    function participantsPane() {
      var list = (DM.participants[sid] || []).map(function (a) { return { pid: a[0], p: M.person(a[0]), since: a[1] }; })
        .filter(function (r) { return q(D.nameFor(r.p)) && (v.filter === "all" || (v.filter === "cust") === isCustodian(r.pid)); });
      sortBy(list, function (r) { return v.sort === "since" ? r.since : D.nameFor(r.p); });
      return '<p class="mb-2">Channel membership roster — who belongs to this team, independent of who has actually posted or read.</p>' +
        toolbar() + table([["Name"], ["Role"], ["Member since"], ["Custodian status", "text-center"]], page(list).map(function (r) {
          return "<tr><td>" + personLabel(r.p) + (r.p.guest && D.canSee(r.p) ? ' <span class="badge badge-pill badge-secondary">Guest</span>' : "") + "</td><td>" + (D.canSee(r.p) ? esc(r.p.title) : "—") + "</td><td>" + esc(M.fmtDate(r.since)) +
            '</td><td class="text-center">' + (r.p.guest ? "Guest · not a natural person" : isCustodian(r.pid) ? "Custodian" : "Not a Custodian") + "</td></tr>";
        }).join("")) + pager("sd", list.length, v.page, v.size, "Items per page:", cont);
    }
    function dirty() {
      var a = st.exLoc[sid] || {}, b = st.exPerson[sid] || {};
      var same = function (x, y) { return Object.keys(Object.assign({}, x, y)).every(function (key) { return !!x[key] === !!y[key]; }); };
      return !same(a, v.exLoc) || !same(b, v.exPer);
    }
    function draw() {
      var body = '<div class="d-flex align-items-center gap-3 mb-3">' + icon(k).replace('width="22" height="22"', 'width="32" height="32"').replace("dm-icon-mdi", "dm-icon-mdi mdi-36px") +
          '<div><div class="fw-bold fs-5' + (n.masked ? " demo-masked" : "") + '">' + esc(n.title) + '</div><div class="small">' + esc(n.loc) + "</div></div></div>" +
        '<div class="btn-group mb-2" role="group" aria-label="Source view">' + tabs.map(function (t) {
          return '<input type="radio" class="btn-check" name="sdTab" id="sdTab-' + t[0] + '" value="' + t[0] + '" autocomplete="off"' + (v.tab === t[0] ? " checked" : "") + '><label class="btn btn-secondary" for="sdTab-' + t[0] + '">' + t[1] + "</label>"; }).join("") + "</div>" +
        (v.tab === "location" ? locationPane() : v.tab === "item" ? itemPane() : v.tab === "participants" ? participantsPane() : accessedPane());
      swap(panel.el.querySelector(".offcanvas-body"), body);
      var canApply = v.tab === "location" || (k === "copilot" && v.tab === "accessed");
      panel.setFooter(canApply ? '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CANCEL</button><button type="button" class="btn btn-primary" data-sd-apply' + (dirty() ? "" : " disabled") + ">APPLY EXCLUSIONS</button>" :
        '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>');
    }
    function itemDetails(it) {
      var acc = (DM.accessed[sid] || []).slice(0, 4);
      var verbs = [["Viewed", "viewed this file"], ["Downloaded", "downloaded a copy"], ["Modified", "modified this file"], ["Shared", "shared this file"]];
      var evs = [{ who: it.owner, verb: ["Uploaded", "uploaded this file"], date: it.modified, time: "09:12" }];
      acc.forEach(function (a, i) { verbs.slice(0, 1 + (i % 3)).forEach(function (vb, j) { evs.push({ who: M.person(a[0]), verb: vb, date: it.modified, time: (10 + i + j) + ":" + (j ? "48" : "05") }); }); });
      evs.forEach(function (e) { e.time = ("0" + e.time).slice(-5); });
      evs.sort(function (a, b) { return a.time.localeCompare(b.time); });
      var w = { show: "all" };
      var sub = D.offcanvas({ title: "Item Details", width: "65vw", body: "", footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' });
      function drawItem() {
        var list = evs.filter(function (e) { return w.show === "all" || e.verb[0] === w.show; });
        swap(sub.el.querySelector(".offcanvas-body"), '<h3 class="fs-5 fw-bold">' + esc(it.name) + "</h3><p>Owned by " + personLabel(it.owner) + " · last modified " + esc(M.fmtDate(it.modified)) + ". Sample UAL activity for this item during the case window.</p>" +
          '<div class="btn-toolbar-gray btn-toolbar-list mb-2" role="toolbar" aria-label="Event tools"><div class="toolbar-list-controls"><span class="toolbar-list-label">Show</span>' +
          D.select("idShow", [["all", "All"], ["Viewed", "Viewed"], ["Uploaded", "Uploaded"], ["Downloaded", "Downloaded"], ["Modified", "Modified"], ["Shared", "Shared"]], w.show, null, { size: "sm", container: "#" + sub.id, attrs: 'data-id-show' }) + "</div></div>" +
          table([["Event"], ["Date", "text-end"]], list.map(function (e) { return "<tr><td>" + personLabel(e.who) + " " + esc(e.verb[1]) + '</td><td class="text-end">' + esc(M.fmtDateTime(e.date, e.time)) + "</td></tr>"; }).join("")) +
          pager("ev", list.length, 1, 10, "Events per page:", "#" + sub.id));
      }
      sub.el.addEventListener("valueChanged.cnds.select", function (e) { if (e.target.hasAttribute("data-id-show")) { w.show = e.target.value; setTimeout(drawItem, 0); } });
      drawItem();
    }
    panel.el.addEventListener("click", function (e) {
      var t = e.target.closest("button, a, input");
      if (!t) return;
      if (t.name === "sdTab") { v.tab = t.value; v.page = 1; v.q = ""; v.filter = "all"; v.sort = null; v.asc = v.tab !== "accessed" ? true : false; draw(); return; }
      if (t.hasAttribute("data-sd-loc")) { e.preventDefault(); if (tabs.some(function (x) { return x[0] === "item"; })) { v.loc = t.getAttribute("data-sd-loc"); v.tab = "item"; v.page = 1; v.sort = null; v.filter = "all"; draw(); } return; }
      if (t.hasAttribute("data-sd-pill")) { v.loc = t.getAttribute("data-sd-pill"); v.page = 1; draw(); return; }
      if (t.hasAttribute("data-sd-item")) { e.preventDefault(); var list = itemsOf(v.loc); itemDetails(list.filter(function (x) { return x.name === t.textContent; })[0] || list[0]); return; }
      if (t.hasAttribute("data-sd-ex")) { var l = t.getAttribute("data-sd-ex"); v.exLoc[l] = !v.exLoc[l]; draw(); return; }
      if (t.hasAttribute("data-sd-exp")) { var pid = t.getAttribute("data-sd-exp"); v.exPer[pid] = !v.exPer[pid]; draw(); return; }
      if (t.hasAttribute("data-sd-mark")) { markCustodian(t.getAttribute("data-sd-mark")); return; }
      if (t.hasAttribute("data-sd-dir")) { v.asc = !v.asc; draw(); return; }
      if (t.hasAttribute("data-pg") && t.getAttribute("data-pg-for") === "sd") { v.page = turn(v.page, t.getAttribute("data-pg"), 1e9, v.size); draw(); return; }
      if (t.hasAttribute("data-sd-apply")) {
        st.exLoc[sid] = Object.assign({}, v.exLoc); st.exPerson[sid] = Object.assign({}, v.exPer);
        panel.hide(); render(); D.toast("Exclusions applied successfully."); return;
      }
    });
    panel.el.addEventListener("input", function (e) { if (e.target.id === "sdQ") { v.q = e.target.value; v.page = 1; var pos = e.target.selectionStart; draw(); var i = panel.el.querySelector("#sdQ"); i.focus(); i.setSelectionRange(pos, pos); } });
    panel.el.addEventListener("valueChanged.cnds.select", function (e) {
      var a = e.target.getAttribute("data-sd"), sz = e.target.getAttribute("data-pg-size");
      if (a) { v[a] = e.target.value; v.page = 1; setTimeout(draw, 0); }
      if (sz) { v.size = parseInt(e.target.value, 10); v.page = 1; setTimeout(draw, 0); }
    });
    openPanel = { draw: draw };
    draw();
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  function setAll(group, on) {
    if (group === "cust") custIds.forEach(function (id) { st.cust[id] = on; });
    if (group === "kind") KINDS.forEach(function (k) { st.kinds[k[0]] = on; });
    if (group === "tag") Object.keys(DM.tags).forEach(function (t) { st.tags[t] = on; });
  }
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.closest(".offcanvas, .modal")) return;
    if (t.name === "dmView") { st.view = t.value; render(); return; }
    if (t.name === "dmBasis") { st.basis = t.value; st.range = null; render(); return; }
    if (t.name === "dmList") { st.list = t.value; st.page = 1; renderSources(); return; }
    if (t.id === "f-all-cust") { setAll("cust", t.checked); st.scope = null; render(); return; }
    if (t.id === "f-all-kind") { setAll("kind", t.checked); render(); return; }
    if (t.id === "f-all-tag") { setAll("tag", t.checked); render(); return; }
    var g = t.getAttribute && t.getAttribute("data-f");
    if (g) { var map = g === "cust" ? st.cust : g === "kind" ? st.kinds : st.tags; map[t.getAttribute("data-v")] = t.checked; if (g === "cust") st.scope = null; st.page = 1; render(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "dmCustQ") {
      var qv = e.target.value.toLowerCase();
      e.target.closest(".dm-filter-menu").querySelectorAll(".dm-menu-list .dropdown-item").forEach(function (l) { l.hidden = l.textContent.toLowerCase().indexOf(qv) === -1; });
      return;
    }
    if (e.target.id === "dmPplQ") { st.ppl.q = e.target.value; st.ppl.page = 1; var pos = e.target.selectionStart; renderPeople(); var i = document.getElementById("dmPplQ"); i.focus(); i.setSelectionRange(pos, pos); }
  });
  document.addEventListener("valueChanged.cnds.select", function (e) {
    var t = e.target;
    if (t.closest(".offcanvas, .modal")) return;
    var sz = t.getAttribute("data-pg-size"), pp = t.getAttribute("data-ppl");
    setTimeout(function () {
      if (sz === "src") { st.size = parseInt(t.value, 10); st.page = 1; renderSources(); }
      if (sz === "ppl") { st.ppl.size = parseInt(t.value, 10); st.ppl.page = 1; renderPeople(); }
      if (pp) { st.ppl[pp] = t.value; st.ppl.page = 1; renderPeople(); }
    }, 0);
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest(".offcanvas, .modal")) return;
    var t = e.target.closest("button, a, i[data-clear], label.dropdown-item-check");
    if (st.edit && !e.target.closest(".dm-chip, .dm-filter-menus") && !(t && t.getAttribute("data-dm") === "edit-filters")) { st.edit = false; renderChips(); }
    if (!t) return;
    if (t.hasAttribute("data-details")) { e.preventDefault(); details(t.getAttribute("data-details")); return; }
    if (t.hasAttribute("data-card")) { var c = t.getAttribute("data-card"); st.card = st.card === c ? null : c; st.page = 1; if (st.view !== "source") { st.view = "source"; document.getElementById("dmViewS").checked = true; } render(); return; }
    if (t.hasAttribute("data-exclude")) {
      var id = t.getAttribute("data-exclude"); st.exSrc[id] = !st.exSrc[id]; render();
      D.toast(st.exSrc[id] ? "Excluded from scope. FINALIZE SCOPE AND SAVE keeps it." : "Included in scope again."); return;
    }
    if (t.hasAttribute("data-add-cust")) { markCustodian(t.getAttribute("data-add-cust")); return; }
    if (t.hasAttribute("data-clear")) {
      var c2 = t.getAttribute("data-clear"), parts = c2.split("|");
      if (c2 === "range" || c2 === "dates") st.range = null;
      else if (c2 === "exclusions") { st.exSrc = {}; st.exLoc = {}; st.exPerson = {}; }
      else if (parts[0] === "src") st.exSrc[parts[1]] = false;
      else if (parts[0] === "loc") st.exLoc[parts[1]][parts[2]] = false;
      else if (parts[0] === "per") st.exPerson[parts[1]][parts[2]] = false;
      render(); return;
    }
    if (t.hasAttribute("data-pg")) {
      var f = t.getAttribute("data-pg-for"), a = t.getAttribute("data-pg");
      if (f === "src") { st.page = turn(st.page, a, visible().filter(function (s) { return !st.card || kindOf(s) === st.card; }).length, st.size); renderSources(); }
      if (f === "ppl") { st.ppl.page = turn(st.ppl.page, a, peopleRows().length, st.ppl.size); renderPeople(); }
      return;
    }
    if (t.hasAttribute("data-scope-load")) { loadScope(+t.getAttribute("data-scope-load")); return; }
    if (t.hasAttribute("data-scope-ren")) { renameScope(+t.getAttribute("data-scope-ren")); return; }
    if (t.hasAttribute("data-scope-del")) { deleteScope(+t.getAttribute("data-scope-del")); return; }
    if (t.classList.contains("card-drawer-toggle")) {
      var open = t.getAttribute("aria-expanded") !== "true", body = document.getElementById(t.getAttribute("aria-controls"));
      t.setAttribute("aria-expanded", String(open)); body.classList.toggle("collapsed", !open); t.closest(".card-top").classList.toggle("card-top--collapsed", !open);
      t.querySelector(".mdi").className = "mdi mdi-chevron-" + (open ? "up" : "down") + " mdi-24px"; return;
    }
    var act = t.getAttribute("data-dm");
    if (act === "edit-filters") { st.edit = !st.edit; renderChips(); return; }
    if (act === "clear-card") { st.card = null; render(); return; }
    if (act === "ppl-tools") { st.ppl.tools = !st.ppl.tools; renderPeople(); return; }
    if (act === "ppl-dir") { st.ppl.asc = !st.ppl.asc; renderPeople(); return; }
    if (act === "export") { exportItems(); return; }
    if (act === "finalize") { finalize(); return; }
    if (act === "date-cancel") { closeMenu("dmDateBtn"); dateMenu(); return; }
    if (act === "date-add") {
      var iso = function (v) { var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v.trim()); return m ? m[3] + "-" + m[1] + "-" + m[2] : null; };
      var from = iso(document.getElementById("dmFrom").value), to = iso(document.getElementById("dmTo").value);
      if (!from || !to || from > to) { dateMenu(!from || !to ? "Enter both dates as mm-dd-yyyy." : "The end date is before the start date."); return; }
      st.range = { from: from, to: to }; closeMenu("dmDateBtn"); render(); dateMenu();
      D.toast("Date range added successfully."); return;
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && st.edit) { st.edit = false; renderChips(); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("i[data-clear]")) { e.preventDefault(); e.target.click(); }
  });

  render();
  if (window.Nimbus && Nimbus.Datepicker) dateMenu(); else document.addEventListener("cnds.ready", function () { dateMenu(); render(); }, { once: true });
}());
