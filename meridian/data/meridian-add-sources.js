/* ═══════════════════════════════════════════════════════════════════════
   MERIDIAN BIOPHARMA — the three Add source doors (PRD 01 §7.6–7.9).

   Extends window.MERIDIAN (data/meridian.js). Load it after meridian.js.
   It reads M and never redefines an existing key; everything it adds lives
   under M.addSources.

   What each door searches (M20a, M21):
     m365       the Microsoft 365 permissions sync: teams, sites, shared
                mailboxes, Viva Engage communities. 412 in the tenant.
     catalog    Sources, the tenant catalog (PRD 03): Box, Slack, curated
                SharePoint sites, applications, file shares, records.
     inventory  the asset inventory, per person, per source type.

   Hand-back to the data map (no shared store in this demo, so the query
   string carries it, as ?viewer= and ?custodians= already do):
     case-data-map.html?added=<token>,<token>…[&case=<case id>]
       m365:<row id>                    a Microsoft 365 row below; Found through "Permissions" (M20b)
       cat:<row id>                     a catalog row below; Found through "Sources"
       cust:<person id>:<type key>:<method key>:<identifier, URI-encoded>
                                        Found through "Added for a custodian" (M27)
     M.addSources.fromQuery(location.search) turns that string into case
     source records shaped like M.sources entries (id, owner, type, name,
     found, nonCustodial, identification, note, added, addedBy). The data
     map reads them; nothing here writes to M.sources.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN;
  if (!M || M.addSources) return;

  /* On this case already: the Microsoft 365 and catalog rows that are already case sources point at their
     M.sources id, so "Already on this case" (M23, V5) is read from the ledger, never typed. */
  function onCase(sourceId) {
    for (var i = 0; i < M.sources.length; i++) if (M.sources[i].id === sourceId) return true;
    return false;
  }

  var A = {};

  /* ── The Microsoft 365 door (§7.7) ─────────────────────────────────── */
  A.m365 = {
    /* What the permissions sync knows across the tenant (§5.2). A server count. */
    tenantTotal: 412,
    synced: { on: M.DEMO_TODAY, at: "02:10" },
    types: [
      { key: "team",      chip: "Teams",            label: "Team",                 people: "members" },
      { key: "site",      chip: "SharePoint Sites", label: "SharePoint site",      people: "with access" },
      { key: "mailbox",   chip: "Shared Mailboxes", label: "Shared mailbox",       people: "with mailbox permissions" },
      { key: "community", chip: "Communities",      label: "Viva Engage community", people: "members" }
    ],
    /* custodians: case custodians who are members or have access (person ids). People counts include them. A row's
       locations are what a hold on it reaches (M24); caveat marks the CONTENT LOCATIONS cell (M71b). */
    rows: [
      { id: "m-tm-pv", type: "team", name: "Pharmacovigilance Signal Review", what: "Microsoft 365 group", created: "Feb 2024", people: 14,
        custodians: ["p-kohler", "p-torres", "p-park", "p-chen"],
        locations: [
          ["Group mailbox", "messages in standard and shared channels, and channel meeting chats"],
          ["Team site", "files in standard channels"],
          ["Private channel site and private channel mailbox", "Causality Assessments (private, 6 members)"],
          ["Shared channel site", "files in CRO Safety Desk, shared with an outside organization"]
        ],
        locationCount: 5, privateChannel: { name: "Causality Assessments", members: 6 } },
      { id: "m-tm-launch", type: "team", name: "Veltrazine Launch Readiness", what: "Microsoft 365 group", created: "Jan 2025", people: 22,
        custodians: ["p-webb"],
        locations: [["Group mailbox", "messages in standard channels, and channel meeting chats"], ["Team site", "files in standard channels"], ["Shared channel site", "files in Agency Review, shared with an outside organization"]],
        locationCount: 3 },
      { id: "m-tm-program", type: "team", name: "Veltrazine Program", what: "Microsoft 365 group", created: "Jan 2024", people: 9, sourceId: "s-tm-program",
        locations: [["Group mailbox", "messages in standard and shared channels, and channel meeting chats"], ["Team site", "files in standard channels"], ["Private channel site and private channel mailbox", "Submission Strategy (private, 4 members)"]],
        locationCount: 4, privateChannel: { name: "Submission Strategy", members: 4 } },
      { id: "m-tm-raeu", type: "team", name: "Regulatory Affairs EU", what: "Microsoft 365 group", created: "Mar 2024", people: 5, sourceId: "s-tm-raeu",
        locations: [["Group mailbox", "messages in standard channels, and channel meeting chats"], ["Team site", "files in standard channels"]], locationCount: 2 },
      { id: "m-tm-safety", type: "team", name: "Clinical Safety Review", what: "Microsoft 365 group", created: "Jun 2024", people: 5, sourceId: "s-tm-safety",
        locations: [["Group mailbox", "messages in standard channels, and channel meeting chats"], ["Team site", "files in standard channels"]], locationCount: 2 },
      { id: "m-sp-qms", type: "site", name: "Quality Management System", what: "/sites/QMS", created: "Apr 2019", people: 24,
        custodians: ["p-park", "p-ellis", "p-chen"], locations: [["Site", "document libraries and lists"]], locationCount: 1 },
      { id: "m-sp-ellis", type: "site", name: "Quality Archive · Robert Ellis", what: "/sites/QualityArchive-REllis", created: "Sep 2021", people: 3,
        custodians: ["p-ellis"], locations: [["Site", "document libraries, owned by Robert Ellis until he left on 03-13-2026"]], locationCount: 1 },
      { id: "m-sp-subs", type: "site", name: "Regulatory Submissions", what: "/sites/RegSubmissions", created: "Mar 2016", people: 31, sourceId: "s-sp-subs",
        locations: [["Site", "document libraries and lists"]], locationCount: 1 },
      { id: "m-mb-ae", type: "mailbox", name: "adverse.events@meridianbiopharma.com", what: "Adverse event intake shared mailbox", created: "Jan 2018", people: 6,
        custodians: ["p-kohler", "p-park"], locations: [["Mailbox", "messages, calendar and attachments"]], locationCount: 1 },
      { id: "m-mb-medinfo", type: "mailbox", name: "medinfo@meridianbiopharma.com", what: "Medical information shared mailbox", created: "May 2017", people: 11,
        custodians: [], locations: [["Mailbox", "messages, calendar and attachments"]], locationCount: 1 },
      { id: "m-ve-reg", type: "community", name: "Regulatory Affairs Community", what: "Viva Engage · 212 members", created: "Jun 2016", people: 212,
        custodians: ["p-vasquez", "p-wong", "p-bauer"], locations: [["Community", "conversations and files, stored in the group mailbox"]], locationCount: 1 },
      /* Yammer's decommissioning (PRD 03 §7.6, §7.7): the same community before the migration. It cannot be added; its
         successor is offered in its place, and LEAVE OUT is recorded. */
      { id: "m-ym-field", type: "community", name: "Veltrazine Field Medical", what: "Yammer · decommissioned 03-14-2025", created: "Jun 2010", people: 86,
        custodians: ["p-torres", "p-webb"], locations: [["Community", "conversations and files until Mar 2025"]], locationCount: 1,
        decommissioned: true, successorId: "m-ve-field", typeLabel: "Yammer community" },
      { id: "m-ve-field", type: "community", name: "Veltrazine Field Medical", what: "Viva Engage · Yammer content migrated 03-14-2025", created: "Mar 2025", people: 86,
        custodians: ["p-torres", "p-webb"], locations: [["Community", "conversations and files, including Yammer content migrated 03-14-2025"]], locationCount: 1,
        successorOf: "m-ym-field" }
    ]
  };
  A.m365.rows.forEach(function (r) {
    /* A row already on the case reads its custodians from the data map's participants or accessed lists. */
    if (r.sourceId && !r.custodians) {
      var ids = M.custodians.map(function (c) { return c.personId; });
      var list = (M.dataMap.participants[r.sourceId] || M.dataMap.accessed[r.sourceId] || []).map(function (p) { return p[0]; });
      r.custodians = list.filter(function (p, i) { return ids.indexOf(p) !== -1 && list.indexOf(p) === i; });
    }
    r.onCase = !!r.sourceId && onCase(r.sourceId);
  });

  /* ── The Sources door (§7.8): the tenant catalog, minus Microsoft 365 teams, sites, mailboxes and communities. ── */
  A.catalog = {
    chips: [["all", "All Types"], ["box", "Box"], ["slack", "Slack"], ["sharepoint", "SharePoint"], ["other", "Other"]],
    /* Curated SharePoint sites that someone entered in Sources (the rest of the 318 arrive through the sync). */
    curatedSharePoint: 3,
    rows: [
      { id: "c-box-tmf", chip: "box", name: "Clinical Trial Master File", system: "Box", where: "/Clinical/TMF", type: "Box folder", owner: "p-marsh", team: "Enterprise Content", scale: "184,200 items · 1.1 TB" },
      { id: "c-box-cro", chip: "box", name: "Veltrazine CRO Exchange", system: "Box", where: "/Veltrazine/CRO Exchange", type: "Box folder", owner: "p-marsh", team: "Enterprise Content", scale: "388 items · 2 GB", sourceId: "s-box-cro" },
      { id: "c-slack-launch", chip: "slack", name: "#veltrazine-launch", system: "Slack", where: "Launch planning channel", type: "Slack channel", owner: "p-whitaker", team: "Collaboration Apps", scale: "42,800 messages · 8 GB" },
      { id: "c-slack-pv", chip: "slack", name: "#pv-signals", system: "Slack", where: "Signal detection channel", type: "Slack channel", owner: "p-kruger", team: "Collaboration Apps", scale: "9,140 messages · 1 GB" },
      { id: "c-sp-label", chip: "sharepoint", name: "Veltrazine Labeling", system: "SharePoint", where: "/sites/VeltrazineLabeling", type: "SharePoint site", owner: "p-reyes", team: "Microsoft Purview", scale: "611 items · 4 GB", sourceId: "s-sp-label" },
      { id: "c-sp-medaff", chip: "sharepoint", name: "Medical Affairs Library", system: "SharePoint", where: "/sites/MedicalAffairsLibrary", type: "SharePoint site", owner: "p-okonkwo", team: "Microsoft Purview", scale: "310,000 items · 640 GB" },
      { id: "c-crm-field", chip: "other", name: "Field Medical CRM", system: "Veeva CRM", where: "Medical inquiries object", type: "CRM records", owner: "p-okonkwo", team: "Enterprise Content", scale: "24,000 records" },
      { id: "c-fs-ral", chip: "other", name: "\\\\ral-fs02\\Quality", system: "File share", where: "Raleigh quality share", type: "File share", owner: "p-marsh", team: "Enterprise Content", scale: "96,500 items · 410 GB" },
      { id: "c-fs-fra", chip: "other", name: "\\\\fra-fs01\\RegAffairs", system: "File share", where: "Frankfurt regulatory share", type: "File share", owner: "p-kruger", team: "IT Infrastructure EU", scale: "2,730 items · 38 GB", sourceId: "s-fs-fra" },
      { id: "c-pm-rb", chip: "other", name: "Retention boxes RB-2024-114 to RB-2024-131", system: "Physical media", where: "Iron Mountain, Raleigh", type: "Physical media", owner: "p-marsh", team: "Enterprise Content", scale: "18 boxes" }
    ],
    /* Places custodians named that are not in Sources: reviewed as reported locations (PRD 02), never added here (M22). */
    reportedNotInSources: [
      { what: "Dropbox folder", label: "a Dropbox folder", by: "p-webb", from: "SUR-0019" },
      { what: "Confluence space", label: "a Confluence space", by: "p-park", from: "SUR-0012" }
    ]
  };
  A.catalog.rows.forEach(function (r) { r.onCase = !!r.sourceId && onCase(r.sourceId); });
  /* IN SOURCES · n: the catalog's non-Microsoft 365, non-device types from Source Types, plus curated SharePoint sites. */
  A.catalog.total = M.sourceTypes.filter(function (t) { return t.kind !== "Microsoft 365" && t.kind !== "Device"; })
    .reduce(function (n, t) { return n + t.sources; }, 0) + A.catalog.curatedSharePoint;

  /* ── The For custodians door (§7.9) ───────────────────────────────── */
  A.forCustodians = {
    /* Types that are not standard sources for these people (the option list is PRD 01 §7.9's). handlerType: the
       ledger type whose routing rule (M.handlerFor) sets the handler; null = no rule. */
    types: [
      { key: "mobile", name: "Mobile device", one: "mobile device", many: "mobile devices", handlerType: "Mobile device", ledgerType: "Mobile device", prefix: "Mobile" },
      { key: "laptop", name: "Laptop", one: "laptop", many: "laptops", handlerType: "Laptop", ledgerType: "Laptop", prefix: "Laptop" },
      { key: "cloud", name: "Personal cloud storage", one: "personal cloud storage account", many: "personal cloud storage accounts", handlerType: null, ledgerType: "Personal cloud storage", prefix: "Cloud storage" },
      { key: "removable", name: "Removable media", one: "removable media item", many: "removable media items", handlerType: null, ledgerType: "Removable media", prefix: "Removable media" },
      { key: "paper", name: "Paper files", one: "paper file set", many: "paper file sets", handlerType: "Physical media", ledgerType: "Physical media", prefix: "Paper files" }
    ],
    methods: [
      { key: "custodian_named", label: "Named by the custodian in a survey or interview" },
      { key: "asset_inventory", label: "From the asset inventory" },
      { key: "case_team_named", label: "Named by the case team" }
    ],
    /* The five executives the door opens with (§7.9: five phones for five executives is one action). */
    defaultCustodians: ["p-vasquez", "p-torres", "p-wong", "p-bauer", "p-park"],
    /* Asset inventory, per person and type: [identifier, description, system]. A record already on the case is
       offered but cannot be chosen (V5). A person with no record reads "Not in the inventory" (M28). */
    inventory: {
      mobile: {
        "p-vasquez": [["MB-2274", "iPhone 13", "Intune"], ["MB-2290", "iPhone 15", "Intune"]],
        "p-torres":  [["MB-2262", "iPhone 14", "ServiceNow"]],
        "p-wong":    [["MB-2210", "iPhone 15", "Intune"]],
        "p-park":    [["MB-2301", "Pixel 8", "Intune"]],
        "p-chen":    [["MB-3318", "iPhone 14", "Intune"]],
        "p-kohler":  [["MB-4106", "Galaxy S23", "Intune"]]
      },
      laptop: {
        "p-vasquez": [["LT-41207", "ThinkPad X1 Carbon", "Intune"]],
        "p-torres":  [["LT-44102", "MacBook Pro 14", "Jamf"]],
        "p-wong":    [["LT-45530", "ThinkPad T14", "Intune"]],
        "p-bauer":   [["LT-60218", "Latitude 7440", "Intune"]],
        "p-park":    [["LT-44821", "ThinkPad T14", "Intune"]],
        "p-chen":    [["LT-50231", "ThinkPad T14", "Intune"]],
        "p-webb":    [["LT-50187", "MacBook Pro 16", "Jamf"]],
        "p-kohler":  [["LT-60412", "Latitude 7440", "Intune"]]
      }
    },
    /* Notes the demo opens with for people not in the inventory (the board's examples, §7.9). */
    defaultNotes: { mobile: { "p-bauer": "Personal iPhone, named in an interview" } }
  };

  /* ── Hand-back to the data map ─────────────────────────────────────── */
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  A.m365Row = function (id) { return byId(A.m365.rows, id); };
  A.catalogRow = function (id) { return byId(A.catalog.rows, id); };
  A.typeOf = function (key) { return byId(A.forCustodians.types.map(function (t) { return { id: t.key, t: t }; }), key); };
  var M365_LEDGER = { team: "Microsoft Teams", site: "SharePoint", mailbox: "Exchange Online", community: "Viva Engage" };
  var CAT_LEDGER = { "Box folder": "Box", "SharePoint site": "SharePoint" };

  /** The query string's added= tokens as case sources (see the header). Unknown tokens are skipped. */
  A.fromQuery = function (search) {
    var m = /[?&]added=([^&]*)/.exec(search || ""), out = [];
    if (!m) return out;
    var by = (/[?&]by=([\w-]+)/.exec(search || "") || [])[1] || null;
    m[1].split(",").forEach(function (tok) {
      var p = tok.split(":");
      if (p[0] === "m365") {
        var r = A.m365Row(p[1]);
        if (r && !r.onCase && !r.decommissioned) out.push({ id: "s-new-" + r.id, owner: null, type: M365_LEDGER[r.type], name: r.name, found: "Permissions", nonCustodial: true,
          request: null, hold: null, evidence: "none", events: null, pending: true, added: M.DEMO_TODAY, addedBy: by, door: "m365" });
      } else if (p[0] === "cat") {
        var c = A.catalogRow(p[1]);
        if (c && !c.onCase) out.push({ id: "s-new-" + c.id, owner: null, type: CAT_LEDGER[c.type] || c.type, name: c.name, found: "Sources", nonCustodial: true,
          request: null, hold: null, evidence: "none", events: null, pending: true, added: M.DEMO_TODAY, addedBy: by, door: "catalog" });
      } else if (p[0] === "cust" && p.length >= 5) {
        var t = (A.typeOf(p[2]) || {}).t, meth = byId(A.forCustodians.methods.map(function (x) { return { id: x.key, x: x }; }), p[3]);
        var ident = decodeURIComponent(p.slice(4).join(":"));
        if (t && meth && M.person(p[1]) && ident) out.push({ id: "s-new-" + p[1] + "-" + t.key, owner: p[1], type: t.ledgerType, name: t.prefix + " " + ident, found: "Added for a custodian",
          addedForCustodian: true, identification: meth.x.label, request: null, hold: null, evidence: "none", events: null, pending: true, added: M.DEMO_TODAY, addedBy: by, door: "custodians" });
      }
    });
    return out;
  };

  M.addSources = A;
}());
