/* ═══════════════════════════════════════════════════════════════════════
   DATA MAP · SOURCE DETAILS ADDITIONS (PRD 01 §7.3–7.5, held items F9, F16, F20)
   Loaded before js/demo/case-data-map.js, which calls these builders. Every
   builder reads data/meridian.js (M.dataMap, M.sourceDetails, M.sources) and
   returns data or markup; the page script owns state, events and Nimbus.

   What lives here
   · Has access (PRD 01 7.4, M50–M57; held, F9): granted access as of a
     permission snapshot. Grants come from M.dataMap.grants (SharePoint sites)
     or are derived (Teams rosters, OneDrive and mailbox owners, mailbox
     delegates). Group grants are expanded through M.dataMap.groups, nested
     groups included, so a person reached several ways is one row at the
     highest role with every path (M52).
   · Group Members drawer (M53), Guest Identity drawer (M17, R5) with
     CREATE NATURAL PERSON (M16 second half, V2; held, F16).
   · Header facts line and badges, EDIT DETAILS (7.3 held, F20).
   · Ownership and CaseFusion details, Preservation and collection history
     drawers (7.3 held, F20; M33, M33a, M45, AC2).
   In production each builder is an API read: GET /sources/:id/access?asOf=,
   GET /groups/:id/members, GET /identities/:id, GET /sources/:id/history.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, DM = M.dataMap;
  var esc = D.esc;

  /* PRD 01 M18 / M70a / M73 disagree on where a name goes; the demo follows M70a (decision 189): the Persona Case
     Profile, scoped to this case. Logged in scan/prd-01-build-notes.md. */
  var PROFILE_HREF = "not-in-demo.html?what=" + encodeURIComponent("Persona Case Profile");
  var ROLE_ORDER = ["Read", "Member", "Contribute", "Edit", "Full Access", "Owner", "Full Control"];
  var EDIT_OR_HIGHER = ROLE_ORDER.indexOf("Edit");
  function rank(r) { return ROLE_ORDER.indexOf(r); }
  function person(pid) { return M.person(pid); }
  function fmt(iso) { return iso ? M.fmtDate(iso) : "—"; }
  function emailOf(p) { return p.guest ? p.upn + "@" + p.guest : p.upn + "@" + M.tenant.domain; }
  function masked() { return '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>'; }

  /* ── Snapshots (M51, M64) ─────────────────────────────────────────── */
  var SNAP = DM.snapshots;
  /** The snapshot that answers "as of <iso>": the latest one on or before it, or null before the earliest. */
  function snapshotFor(iso) {
    var d = SNAP.dates.filter(function (x) { return x <= iso; });
    return d.length ? d[d.length - 1] : null;
  }
  /** Access as of options (7.4): [value, label]. value is an ISO date, or "custom". */
  function asOfOptions() {
    var c = M.caseById(D.caseId);
    return [
      [SNAP.latest, "Latest snapshot · " + fmt(SNAP.latest)],
      [SNAP.earliest, "Earliest snapshot · " + fmt(SNAP.earliest)],
      [M.window.start, "Case window start · " + fmt(M.window.start)],
      [M.window.end, "Case window end · " + fmt(M.window.end)],
      [c.opened, "Case created · " + fmt(c.opened)],
      ["custom", "Custom date…"]
    ];
  }

  /* ── Grants → people (M52) ────────────────────────────────────────── */
  var KIND = { "SharePoint": "sharepoint", "Microsoft Teams": "teams", "OneDrive": "onedrive", "Exchange Online": "exchange",
               "Copilot interactions": "copilot", "Yammer": "yammer", "Viva Engage": "vivaengage" };
  /** Sources that have a Has access view: the Microsoft 365 ACL types (the PM decides which, PRD 01 7.4; the demo
      gives it to every type with a permission snapshot). */
  function hasAccessView(s) { return ["sharepoint", "teams", "onedrive", "exchange"].indexOf(KIND[s.type]) !== -1; }
  /* Virtual groups for derived grants (a Teams team's Microsoft 365 group), registered beside M.dataMap.groups. */
  var GROUPS = {};
  Object.keys(DM.groups).forEach(function (g) { GROUPS[g] = DM.groups[g]; });
  function grantsFor(s) {
    if (DM.grants[s.id]) return DM.grants[s.id];
    var k = KIND[s.type], out = [];
    if (k === "teams") {
      var roster = DM.participants[s.id] || [];
      var gid = "team:" + s.id;
      GROUPS[gid] = { name: s.name + " Members", kind: "Microsoft 365 group", members: roster.slice() };
      if (roster[0]) out.push({ who: roster[0][0], role: "Owner", note: "Team owner", since: roster[0][1] });
      out.push({ who: gid, role: "Member", since: roster.reduce(function (m, r) { return r[1] < m ? r[1] : m; }, "9999") });
    } else if (k === "onedrive" && s.owner) {
      out.push({ who: s.owner, role: "Full Control", note: "OneDrive owner", since: "2023-01-09" });
    } else if (k === "exchange" && s.owner) {
      out.push({ who: s.owner, role: "Owner", note: "Mailbox owner", since: "2023-01-09" });
      (DM.delegates[s.id] || []).forEach(function (d) { out.push({ who: d[0], role: "Full Access", note: "Mailbox delegate", since: d[1] }); });
    }
    return out;
  }
  function group(gid) { return GROUPS[gid] || null; }
  /** Every member of a group as [pid, since, chain] — chain is the group ids from the member outwards. */
  function expand(gid, seen) {
    var g = group(gid); if (!g) return [];
    seen = seen || {}; if (seen[gid]) return []; seen[gid] = true;
    var out = (g.members || []).map(function (m) { return [m[0], m[1], [gid]]; });
    (g.nested || []).forEach(function (n) {
      expand(n, seen).forEach(function (m) { out.push([m[0], m[1], m[2].concat(gid)]); });
    });
    return out;
  }
  /** Is this person's account in snapshots taken on `snap`? An account disabled before the earliest snapshot never is (W2). */
  function inSnapshot(p, snap) { return !(p.departed && p.departed < SNAP.earliest && p.departed <= snap); }

  /**
   * Who could open a source as of a snapshot date.
   * @returns { snap, rows[], tenantWide, gap } — gap: the requested date is before the earliest snapshot (evidence gap).
   *   row: { pid, role, paths[{ role, via, note, groups[], since }], since }
   */
  function accessFor(s, asOf) {
    var snap = snapshotFor(asOf);
    if (!snap) return { snap: null, rows: [], tenantWide: null, gap: true };
    var byPid = {}, tenantWide = null;
    grantsFor(s).forEach(function (g) {
      if (g.since > snap) return;
      if (g.who === "tenant") { tenantWide = { role: g.role, since: g.since }; return; }
      var add = function (pid, path) {
        var p = person(pid); if (!p || !inSnapshot(p, snap) || path.since > snap) return;
        var r = byPid[pid] || (byPid[pid] = { pid: pid, role: path.role, paths: [] });
        r.paths.push(path);
        if (rank(path.role) > rank(r.role)) r.role = path.role;
      };
      if (g.who.indexOf("g-") === 0 || g.who.indexOf("team:") === 0) {
        var kindOf = group(g.who).kind;
        expand(g.who).forEach(function (m) {
          add(m[0], { role: g.role, via: group(m[2][0]).kind, groups: m[2], since: m[1] > g.since ? m[1] : g.since, top: kindOf });
        });
      } else {
        add(g.who, { role: g.role, via: "Direct assignment", note: g.note || "", groups: [], since: g.since });
      }
    });
    var rows = Object.keys(byPid).map(function (k) {
      var r = byPid[k];
      r.paths.sort(function (a, b) { return rank(b.role) - rank(a.role) || a.since.localeCompare(b.since); });
      r.since = r.paths.reduce(function (m, p) { return p.since < m ? p.since : m; }, "9999");
      return r;
    }).sort(function (a, b) { return rank(b.role) - rank(a.role) || person(a.pid).name.localeCompare(person(b.pid).name); });
    return { snap: snap, rows: rows, tenantWide: tenantWide, gap: asOf < SNAP.earliest };
  }

  /** "Inherits to x of y locations" and the locations with their own permissions (M56), SharePoint only. */
  function locationPerms(s) {
    var sd = M.sourceDetails[s.id];
    if (KIND[s.type] !== "sharepoint") return null;
    var list = sd && sd.locationsDetail ? sd.locationsDetail.map(function (l) {
      var u = /^Unique permissions · broken (.+)$/.exec(l.perms);
      return { name: l.name, unique: !!u, broken: u ? u[1] : null };
    }) : (DM.locations[s.id] || []).map(function (l) { return { name: l[0], unique: false }; });
    var inherit = list.filter(function (l) { return !l.unique; }).length;
    return { list: list, inherits: inherit, total: list.length };
  }

  /* ── Markup helpers ───────────────────────────────────────────────── */
  /* Nimbus: a Nimbus chip at the chip's own type; the group kind is .text-muted. */
  function groupChip(gid) {
    var g = group(gid);
    return '<button type="button" class="chip dm-group-chip" data-dm-group="' + esc(gid) + '">' + esc(g.name) +
      '&nbsp;<span class="text-muted">(' + esc(g.kind) + ")</span></button>";
  }
  /** One access path, in words with group chips (7.4): Name → member of X → nested in Y → assigned Edit on the site · since … */
  function pathHtml(pid, path, noun) {
    var p = person(pid), who = D.canSee(p) ? esc(p.name) : "This person";
    var parts = [who];
    path.groups.forEach(function (g, i) { parts.push((i ? "nested in " : "member of ") + groupChip(g)); });
    parts.push("assigned <b>" + esc(path.role) + "</b> on the " + noun + (path.note ? " (" + esc(path.note.toLowerCase()) + ")" : "") +
      " · since " + esc(path.since < SNAP.earliest ? fmt(SNAP.earliest) + ", the earliest snapshot" : fmt(path.since)));
    /* Nimbus: a paragraph (.lh-lg for the chips) with a .fw-bold label (was .dm-path-label, 13px, line-height 2). */
    return '<p class="dm-path lh-lg mb-0"><span class="fw-bold">Access Path:</span> ' + parts.join(' <i class="mdi mdi-arrow-right" aria-hidden="true"></i> ') + "</p>";
  }
  function viaSummary(r) {
    var top = r.paths[0];
    if (!top.groups.length) return { via: "Direct assignment", sub: top.note || "" };
    var names = top.groups.map(function (g) { return group(g).name; });
    var sub = names[0] + (names.length > 1 ? ", nested in " + names.slice(1).join(", nested in ") : "");
    if (r.paths.length > 1) sub += " · " + r.paths.length + " paths";
    return { via: top.via, sub: sub };
  }
  function nounFor(s) { var k = KIND[s.type]; return k === "exchange" ? "mailbox" : k === "teams" ? "team" : k === "onedrive" ? "OneDrive" : "site"; }

  /* ── Group Members drawer (M53) ───────────────────────────────────── */
  function groupMembersHtml(gid, ctx) {
    var g = group(gid);
    var direct = (g.members || []), nested = g.nested || [];
    var rows = direct.map(function (m) {
      var p = person(m[0]), ok = D.canSee(p);
      var status = p.guest && !ctx.isNatural(p.id) ? "Not a natural person in CaseFusion" : ctx.isCustodian(p.id) ? "Custodian" : "Not a custodian";
      return "<tr><td>" + (ok ? '<span class="d-block fw-bold">' + esc(p.name) + '</span><small class="text-muted">' + esc(emailOf(p)) + "</small>" : masked()) +
        (p.guest && !ctx.isNatural(p.id) ? ' <span class="badge badge-secondary">Guest</span>' : "") + "</td>" +
        '<td class="dm-col-when">' + esc(fmt(m[1])) + '</td><td class="dm-col-status">' + esc(status) + "</td></tr>";
    }).join("");
    var all = expand(gid).length;
    return '<div class="dm-group-head"><span class="dm-drawer-name">' + esc(g.name) + '</span> <span class="badge badge-secondary">' + esc(g.kind) + "</span></div>" +
      '<p class="dm-drawer-hint">' + all + (all === 1 ? " person" : " people") + " in this group" + (nested.length ? ", " + direct.length + " directly and the rest through the nested groups below." : ".") +
      " Membership is read from Microsoft Entra ID as of the latest permission snapshot (" + esc(fmt(SNAP.latest)) + ").</p>" +
      (nested.length ? '<div class="dm-group-nested"><span class="fw-bold">Nested Groups:</span> ' + nested.map(groupChip).join(" ") + "</div>" : "") +
      (direct.length ? '<div class="table-responsive"><table class="dm-table dm-drawer-table dm-table-compact"><thead><tr><th scope="col">Name</th><th scope="col" class="dm-col-when">Member Since</th><th scope="col" class="dm-col-status">Custodian Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<p class="text-muted mb-0">No direct members. Everyone in this group is in a nested group.</p>');
  }

  /* ── Guest Identity drawer (M17, R5) + CREATE NATURAL PERSON (M16, V2, held F16) ── */
  /** Which of the case's sources a guest can reach, from the access snapshot and Teams rosters. */
  function guestReach(pid, sources, ctx) {
    var out = [];
    sources.forEach(function (s) {
      var a = accessFor(s, SNAP.latest), r = a.rows.filter(function (x) { return x.pid === pid; })[0];
      if (!r) return;
      var v = viaSummary(r);
      out.push({ s: s, access: r.role + (KIND[s.type] === "teams" ? " (guest)" : ""), through: v.via + (v.sub ? " · " + v.sub : ""), events: ctx.eventsOf(s.id, pid) });
    });
    return out;
  }
  function guestDrawerHtml(pid, ctx) {
    var p = person(pid);
    var reach = guestReach(pid, ctx.sources(), ctx);
    var common = {};
    reach.forEach(function (x) { ctx.custodiansOn(x.s.id).forEach(function (c) { common[c] = true; }); });
    var commonNames = Object.keys(common).map(function (c) { return D.nameFor(person(c)); });
    var isTA = D.hasRole("Tenant Administrator");
    /* Nimbus: name/value pairs are the demo's dl.row list (.demo-kv: 12px bold labels, 14px values; Nimbus gap #9). */
    var kv = function (k, v) { return '<dt class="col-4 fw-bold">' + esc(k) + '</dt><dd class="col-8 mb-1">' + v + "</dd>"; };
    var first = reach.reduce(function (m, x) { var r = (DM.participants[x.s.id] || []).filter(function (y) { return y[0] === pid; })[0]; return r && r[1] < m ? r[1] : m; }, "9999");
    var html =
      '<div class="dm-guest-id">' + '<span class="monogram demo-avatar">' + esc(D.initials(p.name)) + "</span>" +
        '<span class="dm-drawer-idtext"><span class="dm-drawer-name">' + esc(p.name) + ' <span class="badge badge-secondary">Guest</span></span>' +
        '<span class="dm-drawer-path">' + esc(emailOf(p)) + " · " + esc(p.dept) + "</span></span></div>" +
      '<div class="alert alert-info mb-0" role="note"><span class="alert-icon" aria-hidden="true"><i class="mdi mdi-information"></i></span>' +
        '<span class="alert-message"><b>Not a natural person in CaseFusion.</b> Only a natural person can be a custodian or receive a legal hold notification.</span></div>' +
      '<h4 class="cf-category cf-cat-6 highlight-casefusion mb-0">Identity</h4>' +
      '<dl class="row demo-kv mb-0">' + kv("Identity Source", "Microsoft Entra ID · guest account") + kv("Home Organization", esc(p.guest)) + kv("Account", "Enabled") +
        kv("User Principal Name", '<small class="font-monospace text-break">' + esc(p.upn + "_" + p.guest + "#EXT#@" + M.tenant.domain.replace(".com", "") + ".onmicrosoft.com") + "</small>") +
        kv("Invitation", "Accepted · first seen " + esc(fmt(first === "9999" ? SNAP.earliest : first))) + "</dl>" +
      '<h4 class="cf-category cf-cat-6 highlight-casefusion mb-0">Access To This Case\'s Sources</h4>' +
      (reach.length ? '<div class="table-responsive"><table class="dm-table dm-drawer-table dm-table-compact"><thead><tr><th scope="col">Source</th><th scope="col">Access</th><th scope="col">Through</th><th scope="col" class="dm-col-num">Events In Case Window</th></tr></thead><tbody>' +
        reach.map(function (x) { return "<tr><td>" + esc(ctx.sourceTitle(x.s)) + "</td><td>" + esc(x.access) + "</td><td>" + esc(x.through) + '</td><td class="dm-col-num">' + esc(String(x.events)) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="text-muted mb-0">No access to this case\'s sources in the latest permission snapshot.</p>') +
      '<p class="mb-0"><span class="fw-bold">Custodians In Common:</span> ' + esc(commonNames.join(", ") || "None") + "</p>" +
      '<p class="small text-muted mb-0">The home organization is shown because it identifies the guest; under regional access it is an external-party disclosure, flagged for the regional access work (PRD 01 R5).</p>';
    /* CREATE NATURAL PERSON (held, F16): a Tenant Administrator creates the person from this identity. */
    var dis = isTA ? "" : " disabled";
    html += '<section class="card card-basic dm-create-np"><div class="card-body">' +
      '<h4 class="cf-category cf-cat-6 highlight-casefusion mb-2">Create Natural Person</h4>' +
      (isTA ? '<p class="small text-muted">Creates the natural person from this identity. The identity stays linked to them.</p>'
            : '<div class="note note-warning note-sm mb-3">Creating a natural person is a Tenant Administrator action.</div>') +
      '<div class="dm-np-grid">' +
        field("dmNpName", "Name", '<input id="dmNpName" type="text" class="cf-input-control" value="' + esc(p.name) + '"' + dis + " />", true) +
        '<div class="dm-np-field">' + D.select("dmNpType", [["", "Choose …"], ["Vendor", "Vendor"], ["Contractor", "Contractor"], ["Employee", "Employee"]], "", "Person Type *",
          { attrs: dis ? 'disabled aria-required="true"' : 'aria-required="true"' }) +
          '<div class="form-text">Vendor adds no standard sources (set on Source Types).</div></div>' +
        field("dmNpOrg", "Organization", '<input id="dmNpOrg" type="text" class="cf-input-control" value="' + esc(p.dept) + '"' + dis + " />", false) +
        field("dmNpEmail", "Email For Legal Hold Notifications", '<input id="dmNpEmail" type="email" class="cf-input-control" value=""' + dis + ' placeholder="name@' + esc(p.guest) + '" />', true) +
      "</div>" +
      field("dmNpReason", "Reason", '<textarea id="dmNpReason" class="cf-input-control" rows="2"' + dis + "></textarea>", true, "Kept in the identity history with your name.") +
      '<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="dmNpAdd" checked' + dis + ' />' +
        '<label class="form-check-label" for="dmNpAdd">Add as custodian on ' + esc(M.caseById(D.caseId).name) + "</label></div>" +
      '<p class="small text-muted mt-1 mb-0">Their data in this tenant is the shared sources above. Their own mailbox and OneDrive are in ' + esc(p.guest) + "'s Microsoft 365 tenant.</p>" +
      "</div></section>";
    return html;
  }
  function field(id, label, control, req, help) {
    return '<div class="cf-input-field cf-input-field-casefusion dm-np-field"><label class="cf-input-label" for="' + id + '">' + esc(label) + (req ? ' <span class="cf-input-required">*</span>' : "") + "</label>" +
      control + (help ? '<div class="cf-input-helper"><span class="cf-input-helper-text">' + esc(help) + "</span></div>" : "") + "</div>";
  }

  /* ── Header facts, badges (7.3 held, F20) ─────────────────────────── */
  var TYPE_NAME = { sharepoint: "SharePoint site", teams: "Teams team", onedrive: "OneDrive", exchange: "Exchange mailbox", copilot: "Copilot interactions",
                    box: "Box folder", webex: "Webex space", fileshare: "File share", yammer: "Yammer community", vivaengage: "Viva Engage community" };
  function holdBadge(s) {
    var other = s.owner && M.heldElsewhere[s.owner] ? 1 : 0;
    var n = 1 + other, cases = n + (n === 1 ? " Case" : " Cases");
    switch (s.hold) {
      case "Applied": return badge("danger", '<i class="mdi mdi-lock-outline" aria-hidden="true"></i> On Legal Hold · ' + cases);
      case "Partial": return badge("warning", "Partially On Legal Hold · " + esc(s.partial || ""));
      case "Applying": return badge("warning", "Legal Hold Applying");
      case "Not applied": return badge("warning", "Not On Legal Hold · Removed Outside CaseFusion");
      case "Attested": return badge("info", "Held In Place · Attested");
      default: return badge("secondary", "Hold Status Unknown");
    }
  }
  function badge(tone, html) { return '<span class="badge badge-' + tone + '">' + html + "</span>"; }
  function collectedFor(s) {
    var out = null;
    M.custodians.forEach(function (c) { ((c.collection || {}).items || []).forEach(function (it) { if (it.source === s.id) out = { request: c.collection.request, pkg: it.from, note: it.note, status: it.status }; }); });
    var nc = M.nonCustodialCollection[s.id];
    if (!out && nc) out = { request: nc.request, status: nc.text };
    return out;
  }
  function integration(s) { var h = M.handlerFor[s.type]; return h && h.kind === "Automatic"; }
  /**
   * The facts line and badges under the header (held, F20).
   * ctx: { items, custodiansOn(id), loadedScope, inScope(id), noAudit }
   */
  function headerFactsHtml(s, ctx) {
    var k = KIND[s.type], lp = locationPerms(s);
    var users = ctx.custodiansOn(s.id).length;
    var facts = [TYPE_NAME[k] || M.typeLabel(s.type)];
    if (ctx.noAudit) facts.push("found through permissions");
    if (lp && lp.total) facts.push(lp.inherits + " of " + lp.total + " locations inherit site permissions");
    if (!ctx.noAudit) facts.push(ctx.items + " items");
    facts.push(ctx.noAudit ? users + (users === 1 ? " custodian" : " custodians") + " in this case have access" : "used by " + users + (users === 1 ? " custodian" : " custodians") + " in this case");
    var b = [];
    if (s.decommissioned) b.push(badge("secondary", '<i class="mdi mdi-lock-outline" aria-hidden="true"></i> Read-Only · Type Decommissioned'));
    else if (s.hold) b.push(holdBadge(s));
    var col = collectedFor(s);
    if (col) b.push(badge("info", "In Expireon · " + esc(col.request)));
    b.push(integration(s) ? badge("success", "Integrated · " + esc(M.typeLabel(s.type))) : badge("secondary", "Not Integrated"));
    if (ctx.loadedScope && ctx.inScope(s.id)) b.push(badge("secondary", "In Scope · " + esc(ctx.loadedScope)));
    return '<p class="text-muted mb-0">' + esc(facts.join(" · ")) + "</p>" + '<div class="dm-drawer-badges">' + b.join("") + "</div>";
  }

  /* ── Ownership and CaseFusion details, Preservation and collection history (7.3 held, F20) ── */
  function firstSeen(s) {
    var d = (DM.participants[s.id] || []).concat(s.members || []).reduce(function (m, r) { return r[1] < m ? r[1] : m; }, "9999");
    return d === "9999" ? M.window.start : d;
  }
  function personLine(pid) {
    if (!pid) return "—";
    var p = person(pid);
    return D.canSee(p) ? "<b>" + esc(p.name) + "</b> · " + esc(p.title) : masked();
  }
  function drawer(key, title, summary, body, open) {
    return '<section class="card card-basic card-drawer demo-drawer dm-sd-drawer" aria-labelledby="dmSdH-' + key + '"><div class="card-body">' +
      '<div class="card-top demo-drawer-top"><h4 class="cf-category cf-cat-6 highlight-casefusion mb-0 flex-grow-1" id="dmSdH-' + key + '">' + esc(title) + "</h4>" +
        '<small class="text-muted dm-sd-sum">' + esc(summary) + "</small>" +
        '<button type="button" class="card-drawer-toggle" data-dm-sd-drawer="' + key + '" aria-expanded="' + !!open + '" aria-controls="dmSd-' + key + '" aria-label="' + (open ? "Collapse " : "Expand ") + esc(title) + '">' +
        '<i class="mdi mdi-chevron-up mdi-24px" aria-hidden="true"></i></button></div>' +
      '<div class="card-drawer-body' + (open ? "" : " collapsed") + '" id="dmSd-' + key + '">' + body + "</div></div></section>";
  }
  /* Nimbus: name/value pairs are the demo's dl.row list (.demo-kv, Nimbus gap #9), not a hand-styled table (.dm-kv-table). */
  function kvTable(rows) {
    return '<dl class="row demo-kv mb-0">' + rows.map(function (r) {
      return '<dt class="col-5 fw-bold">' + esc(r[0]) + '</dt><dd class="col-7 mb-2">' + r[1] + "</dd>";
    }).join("") + "</dl>";
  }
  /* Nimbus: sub-headings take the demo's in-row label (.demo-label: the Nimbus table-header type, muted). A div with
     role="heading", since Nimbus card heading rules would override the type (demo.css). */
  function subHead(t, cls) { return '<div class="demo-label' + (cls ? " " + cls : "") + '" role="heading" aria-level="5">' + esc(t) + "</div>"; }
  /** ctx: { noAudit, canRequest, open: { own, hist } } */
  function drawersHtml(s, ctx) {
    var sd = M.sourceDetails[s.id] || {};
    var k = KIND[s.type];
    var biz = sd.businessOwner || s.owner || null;
    var h = M.handlerFor[s.type] || (s.decommissioned ? { handler: "None · type decommissioned", kind: "None" } : { handler: "Microsoft Purview", kind: "Automatic" });
    var team = sd.team || (h.kind === "Response team" ? h.handler : "Microsoft Purview (automatic)");
    var conf = sd.confirmed ? esc(fmt(sd.confirmed[0])) + " by " + esc(D.nameFor(person(sd.confirmed[1]))) : "Not confirmed";
    var integ = integration(s);
    var found = ctx.noAudit && s.found === "Audit logs" ? "Permissions" : s.found;
    var disc = ctx.noAudit ? "Permissions (M365 ACL) · first seen " + fmt(SNAP.earliest) : (sd.discovery || (found + " (data map) · first seen " + fmt(firstSeen(s))));
    var col = collectedFor(s);
    var own = '<div class="dm-sd-cols"><div>' + subHead("Ownership") + kvTable([
        ["Business Owner", personLine(biz)],
        ["Response Team", "<b>" + esc(team) + "</b>"],
        ["System Owner", sd.systemOwner ? personLine(sd.systemOwner) + (D.canSee(person(sd.systemOwner)) ? " · " + esc(emailOf(person(sd.systemOwner))) : "") : "—"],
        ["Confirmed", conf + '<div><button type="button" class="btn btn-tertiary btn-sm px-0" data-dm-request-confirm' + (biz ? "" : ' disabled title="No business owner is named, so there is no one to ask."') + ">Request Confirmation</button></div>"]
      ]) + "</div><div>" + subHead("In CaseFusion") + kvTable([
        ["Integrated", integ ? badge("success", "Yes · " + esc(M.typeLabel(s.type))) + " Purview holds and Expireon collections run automatically" : "No · " + esc(h.handler) + (h.dest ? " · " + esc(h.dest) : "")],
        ["Discovery Method", esc(disc)],
        /* M33, M33a: every other route that has produced this source, never collapsed into one. */
        ["Also Added By", esc(sd.alsoAdded || "No other route has produced this source")],
        /* M45: a reported fact is attributed to whoever reported it. */
        ["Retention Policy", esc(sd.retention || "None reported")],
        ["In Expireon", col ? esc(col.request + (col.pkg ? " · " + col.pkg : "") + " · " + col.status + (col.note ? " · " + col.note : "")) : "Not collected"]
      ]) + "</div></div>";
    if (s.decommissioned) {
      var dc = s.decommissioned;
      own += '<div class="note note-secondary note-sm mt-2 mb-0"><b>Read-only.</b> ' + esc(M.typeLabel(s.type)) + " was decommissioned on " + esc(fmt(dc.on)) +
        ". Data outcome: " + esc(dc.outcome) + " (content until " + esc(dc.contentUntil) + "). Successor: " + esc(dc.successor.type) + " · " + esc(dc.successor.name) + ".</div>";
    }
    var ownSum = [biz ? D.nameFor(person(biz)) : "No business owner", team, integ ? "integrated" : "not integrated",
                  (ctx.noAudit ? "found through permissions since " + fmt(SNAP.earliest) : "found through " + found.toLowerCase() + " since " + fmt(firstSeen(s)))].join(" · ");

    /* Preservation and collection history: this case's requests, plus cases the viewer can't open, counted not named. */
    var pres = [], coll = [];
    if (s.request) {
      var rq = M.requests.filter(function (r) { return r.id === s.request; })[0] || {};
      var st = { "Applied": "In place", "Partial": "Partial · " + (s.partial || ""), "Applying": "Applying since 10-05-2026", "Not applied": "Removed outside CaseFusion 10-03-2026",
                 "Attested": "Attested" + (s.attestation && s.attestation.on ? " " + fmt(s.attestation.on) : ""), "Overdue": "Attestation overdue" }[s.hold] || "Awaiting the team";
      pres.push([fmt(rq.sent || M.firstNotice), esc(s.request + "·A"), esc(M.caseById(D.caseId).name), integ ? "Hold placed in Purview" : "Preservation requested from " + esc(h.handler), esc(st)]);
    }
    var elsewhere = s.owner && M.heldElsewhere[s.owner];
    if (elsewhere) {
      var open = D.canOpenCase(elsewhere.caseId);
      pres.push(["—", open ? "—" : "—", open ? esc(elsewhere.caseName) : "A case you can't open", "Hold placed", open ? "In place" : "In place · details hidden"]);
    }
    if (col) coll.push([col.note ? esc(col.note.split(" · ")[0]) : "—", "Collection request", esc(col.request + (col.pkg ? " · " + col.pkg : "")), esc(col.status), integ ? "Customer Azure storage" : "—"]);
    var histSum = (pres.length ? "On hold in " + pres.length + (pres.length === 1 ? " case" : " cases") + (s.request ? " since " + pres[0][0] : "") : "No preservation on this source") +
      " · " + (col ? (col.status === "Collected" ? "last collected " + (col.note || "").split(" · ")[0] : "collection " + col.status.toLowerCase()) : "not collected");
    var tbl = function (head, rows, empty) {
      return rows.length ? '<div class="table-responsive"><table class="dm-table dm-table-compact"><thead><tr>' + head.map(function (x) { return '<th scope="col">' + x + "</th>"; }).join("") +
        "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"
        : '<p class="text-muted mb-0">' + empty + "</p>";
    };
    var hist = subHead("Preservation") + tbl(["Date", "Request", "Case", "Event", "Status"], pres, "No preservation request covers this source.") +
      subHead("Collection", "mt-3") + tbl(["Date", "Kind", "Request Or Job", "Status", "Destination"], coll, "No collection has run on this source.") +
      (elsewhere && !D.canOpenCase(elsewhere.caseId) ? '<p class="small text-muted mb-0 mt-2">Rows from cases you can\'t open show that something exists, never what it is.</p>' : "");
    return drawer("own", "Ownership And CaseFusion Details", ownSum, own, ctx.open.own) + drawer("hist", "Preservation And Collection History", histSum, hist, ctx.open.hist);
  }

  window.DMS = {
    PROFILE_HREF: PROFILE_HREF,
    snapshots: SNAP,
    snapshotFor: snapshotFor,
    asOfOptions: asOfOptions,
    hasAccessView: hasAccessView,
    accessFor: accessFor,
    locationPerms: locationPerms,
    pathHtml: pathHtml,
    viaSummary: viaSummary,
    nounFor: nounFor,
    groupChip: groupChip,
    group: group,
    groupMembersHtml: groupMembersHtml,
    guestDrawerHtml: guestDrawerHtml,
    headerFactsHtml: headerFactsHtml,
    drawersHtml: drawersHtml,
    emailOf: emailOf,
    rank: rank,
    EDIT_OR_HIGHER: EDIT_OR_HIGHER,
    uniquePerms: DM.uniquePerms
  };
}());
