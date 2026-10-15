/* ═══════════════════════════════════════════════════════════════════════
   MERIDIAN BIOPHARMA — the one demo data set behind every screen.

   Rules
   · Every count on every screen is computed from these arrays. No page
     hard-codes a number; check.js asserts the totals the demo relies on.
   · Every page reopens on this starting data, so rehearsals repeat. Clicks
     change the page in front of you only.
   · Loaded with a plain <script src>, never fetch(), so the folder works
     from a web server or by double-click.
   · DEMO_TODAY is fixed. Relative ages ("3 days") derive from it.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var M = {};

  M.DEMO_TODAY = "2026-10-08";

  M.tenant = {
    name: "Meridian Biopharma",
    domain: "meridianbiopharma.com",
    oneDriveHost: "meridianbiopharma-my.sharepoint.com",
    sharePointHost: "meridianbiopharma.sharepoint.com",
    hosting: "EU",
    regions: [
      { id: "US",  name: "United States" },
      { id: "RoW", name: "Rest of world" }
    ]
  };

  /* ── Who is looking. The header switch flips between these two. ───── */
  M.viewers = [
    { id: "v-us",  personId: "p-donovan", region: "US",
      roles: ["Case Administrator", "Tenant Administrator", "Preservation adjudicator"],
      group: "CF-Legal-US" },
    { id: "v-row", personId: "p-hoffmann", region: "RoW",
      roles: ["Case Administrator"],
      group: "CF-Legal-RoW" }
  ];

  /* ── People. region drives masking for a viewer in the other region. ─ */
  M.people = [
    /* case team and tenant */
    { id: "p-donovan",  name: "Claire Donovan",  title: "Senior Paralegal",               dept: "Legal",                 region: "US",  location: "Boston, MA",        upn: "claire.donovan" },
    { id: "p-hoffmann", name: "Lena Hoffmann",   title: "Legal Counsel, Europe",          dept: "Legal",                 region: "RoW", location: "Frankfurt, DE",     upn: "lena.hoffmann" },
    { id: "p-reyes",    name: "Angela Reyes",    title: "Regulatory Counsel",             dept: "Legal",                 region: "US",  location: "Boston, MA",        upn: "angela.reyes" },
    { id: "p-okonkwo",  name: "Rita Okonkwo",    title: "Legal Technology Manager",       dept: "Legal",                 region: "US",  location: "Boston, MA",        upn: "rita.okonkwo" },
    { id: "p-kruger",   name: "Stefan Krüger",   title: "Microsoft 365 Administrator",    dept: "IT",                    region: "RoW", location: "Frankfurt, DE",     upn: "stefan.krueger" },
    /* response teams */
    { id: "p-fitzgerald", name: "Owen Fitzgerald", title: "Endpoint & Mobile Lead",       dept: "IT",                    region: "US",  location: "Boston, MA",        upn: "owen.fitzgerald" },
    { id: "p-marsh",    name: "Helen Marsh",     title: "Enterprise Content Lead",        dept: "Records & Content",     region: "US",  location: "Boston, MA",        upn: "helen.marsh" },
    { id: "p-whitaker", name: "Tom Whitaker",    title: "Collaboration Apps Engineer",    dept: "IT",                    region: "US",  location: "Raleigh, NC",       upn: "tom.whitaker" },
    /* custodians on MBP-0926 */
    { id: "p-vasquez",  name: "Elena Vasquez",   title: "VP, Regulatory Affairs",         dept: "Regulatory Affairs",    region: "US",  location: "Boston, MA",        upn: "elena.vasquez",  employeeId: "MB-10233" },
    { id: "p-torres",   name: "Michael Torres",  title: "VP, Clinical Development",       dept: "Clinical Development",  region: "US",  location: "Raleigh, NC",       upn: "michael.torres", employeeId: "MB-10871", departed: "2026-10-02" },
    { id: "p-wong",     name: "Lisa Wong",       title: "Regulatory Submissions Coordinator", dept: "Regulatory Affairs", region: "US", location: "Boston, MA",       upn: "lisa.wong",      employeeId: "MB-11402" },
    { id: "p-bauer",    name: "Katrin Bauer",    title: "Head of Regulatory Affairs, Germany", dept: "Regulatory Affairs", region: "RoW", location: "Frankfurt, DE",  upn: "katrin.bauer",   employeeId: "MB-20117" },
    { id: "p-park",     name: "James Park",      title: "QA Director",                    dept: "Quality",               region: "US",  location: "Raleigh, NC",       upn: "james.park",     employeeId: "MB-10544" },
    { id: "p-ellis",    name: "Robert Ellis",    title: "Former Quality Systems Manager", dept: "Quality",               region: "US",  location: "Raleigh, NC",       upn: "robert.ellis",   employeeId: "MB-09981", departed: "2026-03-13" },
    { id: "p-chen",     name: "Sarah Chen",      title: "Manufacturing Lead",             dept: "Manufacturing",         region: "US",  location: "Raleigh, NC",       upn: "sarah.chen",     employeeId: "MB-11873" },
    { id: "p-webb",     name: "Marcus Webb",     title: "Senior Data Scientist",          dept: "Clinical Development",  region: "US",  location: "Boston, MA",        upn: "marcus.webb",    employeeId: "MB-12006" },
    { id: "p-kohler",   name: "Jürgen Köhler",   title: "Pharmacovigilance Lead",         dept: "Drug Safety",           region: "RoW", location: "Frankfurt, DE",     upn: "juergen.koehler", employeeId: "MB-20488" },
    /* non-custodians the data map surfaces */
    { id: "p-nair",     name: "Priya Nair",      title: "Regulatory Affairs Associate",   dept: "Regulatory Affairs",    region: "US",  location: "Boston, MA",        upn: "priya.nair" },
    { id: "p-okafor",   name: "Daniel Okafor",   title: "Director, Finance Systems",      dept: "Finance",               region: "US",  location: "Boston, MA",        upn: "daniel.okafor" },
    { id: "p-weber",    name: "Anna Weber",      title: "Regulatory Affairs Specialist",  dept: "Regulatory Affairs",    region: "RoW", location: "Dublin, IE",        upn: "anna.weber" },
    { id: "p-vogt",     name: "Hanna Vogt",      title: "Packaging Technician",           dept: "Manufacturing",         region: "US",  location: "Raleigh, NC",       upn: "hanna.vogt" },
    { id: "p-lindqvist", name: "Tessa Lindqvist", title: "Clinical Project Manager (guest)", dept: "Lakeshore CRO",      region: null,  location: "Guest",             upn: "tessa.lindqvist", guest: "lakeshore-cro.example" }
  ];

  /* ── Cases. One case per request (the case barrier). ──────────────── */
  M.cases = [
    { id: "MBP-0926", name: "Veltrazine Product Liability", region: "US", category: "Legal", status: "Open",
      window: ["2024-01-01", "2026-06-30"], opened: "2026-08-20", primary: true,
      team: ["p-donovan", "p-reyes", "p-hoffmann"] },
    { id: "MBP-0931", name: "Halvorsen Class Action",       region: "US",  category: "Legal",         status: "Open" },
    { id: "MBP-0842", name: "Pellworth Arbitration",        region: "RoW", category: "Legal",         status: "Open" },
    { id: "MBP-0774", name: "Thorne Medical",               region: "US",  category: "Legal",         status: "Open" },
    { id: "MBP-0811", name: "Veltrazine EMA Inquiry",       region: "RoW", category: "Regulatory",    status: "Open" },
    { id: "MBP-0788", name: "Castellan Trade Secrets",      region: "US",  category: "Legal",         status: "Closed" },
    { id: "MBP-0691", name: "INV-26-014",                   region: "US",  category: "Investigation", status: "Closed", closed: "2026-08-31" },
    { id: "MBP-0612", name: "Corvane Pricing Inquiry",      region: "US",  category: "Regulatory",    status: "Closed" }
  ];

  /* ── Custodians on MBP-0926 and their custodian workflows.
        expected: which workflows apply here. A workflow not listed is "—".
        notRequired: an exclusion with a reason ("n/a" on Coverage).        */
  /* Legal hold notifications and surveys issued on MBP-0926. */
  M.legalHolds = [
    { id: "LH-0031", title: "Initial legal hold notification", sent: "2026-08-28", time: "09:00",
      settings: "Body as edited · 2 attachments · reminders every 3 days · escalation at 13 days · SUR-0012 attached", survey: "SUR-0012" },
    { id: "LH-0044", title: "Supplemental notification · scope widened to Teams and devices", sent: "2026-09-12", time: "14:00",
      settings: "Body as edited · no attachments · reminders every 4 days · escalation at 7 days" },
    { id: "LH-0052", title: "Executive review", silent: true, sent: "2026-08-20", time: "10:15" }
  ];
  M.surveys = [
    { id: "SUR-0012", title: "Data sources survey", questions: 12, due: "2026-09-08" },
    { id: "SUR-0019", title: "Personal devices survey", questions: 5, due: "2026-10-14" }
  ];
  M.firstNotice = "2026-08-28";

  /* Custodians on MBP-0926 and their custodian workflows (latest first is not assumed;
     the page sorts). lhn / surveys: one entry per notification or survey received.
     events: the timeline shown on the custodian panel.                          */
  M.custodians = [
    { personId: "p-vasquez", added: "2026-08-20", addedFrom: "Search",
      lhn: [{ id: "LH-0031", status: "Acknowledged", on: "2026-08-29",
              events: [["2026-08-28", "09:00", "Notification", "CaseFusion · email and Teams", "Sent"], ["2026-08-29", "08:41", "Acknowledged", "Elena Vasquez", "Acknowledged"]] }],
      surveys: [{ id: "SUR-0012", status: "Answered", on: "2026-09-02",
              events: [["2026-08-28", "09:00", "Survey", "Claire Donovan", "Sent"], ["2026-09-02", "16:10", "Answered · 1 location reported", "Elena Vasquez", "Answered"]] }],
      collection: { text: "2 of 2 collected", detail: "to Mar 2026", request: "COL-0139" } },
    { personId: "p-torres", added: "2026-08-20", addedFrom: "Search",
      lhn: [{ id: "LH-0031", status: "Acknowledged", on: "2026-09-01",
              events: [["2026-08-28", "09:00", "Notification", "CaseFusion · email and Teams", "Sent"], ["2026-08-31", "09:00", "Reminder 1", "CaseFusion", "Sent"], ["2026-09-01", "11:02", "Acknowledged", "Michael Torres", "Acknowledged"]] }],
      surveys: [{ id: "SUR-0012", status: "Answered", on: "2026-09-05",
              events: [["2026-08-28", "09:00", "Survey", "Claire Donovan", "Sent"], ["2026-09-05", "10:30", "Answered", "Michael Torres", "Answered"]] }] },
    { personId: "p-wong", added: "2026-08-20", addedFrom: "Search",
      lhn: [{ id: "LH-0031", status: "Acknowledged", on: "2026-08-28",
              events: [["2026-08-28", "09:00", "Notification", "CaseFusion · email and Teams", "Sent"], ["2026-08-28", "13:20", "Acknowledged", "Lisa Wong", "Acknowledged"]] }],
      surveys: [{ id: "SUR-0012", status: "Answered", on: "2026-09-03",
              events: [["2026-08-28", "09:00", "Survey", "Claire Donovan", "Sent"], ["2026-09-03", "09:12", "Answered", "Lisa Wong", "Answered"]] },
                { id: "SUR-0019", status: "Sent", due: "2026-10-14",
              events: [["2026-09-30", "14:00", "Survey", "Claire Donovan", "Sent"]] }] },
    { personId: "p-bauer", added: "2026-08-20", addedFrom: "Search",
      lhn: [{ id: "LH-0031", status: "Acknowledged", on: "2026-09-03",
              events: [["2026-08-28", "09:00", "Notification", "CaseFusion · email and Teams", "Sent"], ["2026-08-31", "09:00", "Reminder 1", "CaseFusion", "Sent"], ["2026-09-03", "08:15", "Acknowledged", "Katrin Bauer", "Acknowledged"]] }],
      surveys: [{ id: "SUR-0012", status: "Escalated", reminders: 2,
              events: [["2026-08-28", "09:00", "Survey", "Claire Donovan", "Sent"], ["2026-09-08", "", "Due date passed", "CaseFusion", "Not answered"], ["2026-09-11", "09:00", "Reminder 1", "CaseFusion", "Sent"], ["2026-09-14", "09:00", "Reminder 2", "CaseFusion", "Sent"], ["2026-09-21", "09:00", "Escalated to Angela Reyes", "SLA rule · 13 days without an answer", "Escalated"]] }] },
    { personId: "p-park", added: "2026-08-20", addedFrom: "Search",
      lhn: [{ id: "LH-0031", status: "Acknowledged", on: "2026-08-31",
              events: [["2026-08-28", "09:00", "Notification", "CaseFusion · email and Teams", "Sent"], ["2026-08-31", "07:55", "Acknowledged", "James Park", "Acknowledged"]] }],
      surveys: [{ id: "SUR-0012", status: "Answered", on: "2026-09-04",
              events: [["2026-08-28", "09:00", "Survey", "Claire Donovan", "Sent"], ["2026-09-04", "15:40", "Answered · 1 laptop reported", "James Park", "Answered"]] }] },
    { personId: "p-ellis", added: "2026-08-20", addedFrom: "Search", silent: true,
      lhn: [{ id: "LH-0052", status: "Silent", events: [["2026-08-20", "10:15", "Added to the silent legal hold", "Claire Donovan", "Tracked"]] }],
      surveys: [],
      notRequired: { preservation: "Mailbox already preserved on MBP-0811 (PRS-0088). Departed 03-13-2026." } },
    { personId: "p-chen",   added: "2026-09-16", addedFrom: "Org chart", addedNote: "Added 09-16-2026 from the org chart", afterNotice: true, lhn: [], surveys: [] },
    { personId: "p-webb",   added: "2026-09-16", addedFrom: "Data map",  addedNote: "Added 09-16-2026 from the data map",  afterNotice: true, lhn: [], surveys: [] },
    { personId: "p-kohler", added: "2026-09-17", addedFrom: "Interview", addedNote: "Added 09-17-2026 · named in an interview answer", afterNotice: true, lhn: [], surveys: [] }
  ];
  /* Held on another case (release dialog leaves them unticked, PRD 08 CV64). */
  M.heldElsewhere = { "p-bauer": { caseId: "MBP-0691", caseName: "INV-26-014" } };
  /* Non-custodial sources: association counts for Coverage's USED BY (not custodian counts). */
  M.usedBy = { "s-tm-program": 9, "s-tm-raeu": 4, "s-tm-safety": 5, "s-sp-subs": 6, "s-sp-label": 3, "s-box-cro": 3, "s-webex": 4, "s-fs-fra": 2 };
  M.nonCustodialCollection = { "s-tm-program": { text: "In progress", request: "COL-0142" }, "s-sp-subs": { text: "In progress", request: "COL-0142" } };

  /* ── The source ledger: every source on MBP-0926.
        hold: Purview words (Applied · Partial · Applying · Removing · Not applied)
              or CaseFusion's own (Attested · Overdue · Unknown).
        evidence: read | attested | imported | none
        segment is DERIVED (see M.segmentOf), never stored.                 */
  M.sources = [
    /* Exchange Online (6) */
    { id: "s-ex-vasquez", owner: "p-vasquez", type: "Exchange Online", name: "elena.vasquez@meridianbiopharma.com", found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 4310 },
    { id: "s-ex-torres",  owner: "p-torres",  type: "Exchange Online", name: "michael.torres@meridianbiopharma.com", found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 3870, note: "Inactive mailbox since 10-02-2026" },
    { id: "s-ex-wong",    owner: "p-wong",    type: "Exchange Online", name: "lisa.wong@meridianbiopharma.com",     found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 2215 },
    { id: "s-ex-bauer",   owner: "p-bauer",   type: "Exchange Online", name: "katrin.bauer@meridianbiopharma.com",  found: "Standard source", request: "PRS-0101", hold: "Applying", evidence: "read", events: 2690,
      exception: { type: "Stalled application", status: "Open", since: "2026-10-05", detail: "Applying since 10-05-2026. Purview has not reported Applied." } },
    { id: "s-ex-park",    owner: "p-park",    type: "Exchange Online", name: "james.park@meridianbiopharma.com",    found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 1985 },
    { id: "s-ex-okafor",  owner: "p-okafor",  type: "Exchange Online", name: "daniel.okafor@meridianbiopharma.com", found: "Permissions", request: null, hold: "Applied", evidence: "read", events: 570, nonCustodial: true,
      exception: { type: "Orphan hold", status: "Open", since: "2026-09-22", detail: "A Purview hold on this mailbox names this case, but no request on the case covers it." } },
    /* OneDrive (5) */
    { id: "s-od-vasquez", owner: "p-vasquez", type: "OneDrive", name: "OneDrive · Elena Vasquez",   found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 612 },
    { id: "s-od-torres",  owner: "p-torres",  type: "OneDrive", name: "OneDrive · Michael Torres",  found: "Standard source", request: "PRS-0101", hold: "Not applied", evidence: "read", events: 488,
      exception: { type: "Hold released on an active case", status: "Open", since: "2026-10-03", detail: "Removed from the Purview hold on 10-03-2026 by the offboarding run (stefan.krueger). No release was recorded in CaseFusion." } },
    { id: "s-od-wong",    owner: "p-wong",    type: "OneDrive", name: "OneDrive · Lisa Wong",       found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 301 },
    { id: "s-od-bauer",   owner: "p-bauer",   type: "OneDrive", name: "OneDrive · Katrin Bauer",    found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 377 },
    { id: "s-od-park",    owner: "p-park",    type: "OneDrive", name: "OneDrive · James Park",      found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 266 },
    /* Teams (3) */
    { id: "s-tm-program", owner: null, type: "Microsoft Teams", name: "Veltrazine Program",         found: "Audit logs",       request: "PRS-0101", hold: "Applied", evidence: "read", events: 512 },
    { id: "s-tm-raeu",    owner: null, type: "Microsoft Teams", name: "Regulatory Affairs EU",      found: "Permissions", request: "PRS-0101", hold: "Applied", evidence: "read", events: 244 },
    { id: "s-tm-safety",  owner: null, type: "Microsoft Teams", name: "Clinical Safety Review",     found: "Audit logs",       request: "PRS-0101", hold: "Applied", evidence: "read", events: 155 },
    /* SharePoint (2) */
    { id: "s-sp-subs",    owner: null, type: "SharePoint", name: "Regulatory Submissions",          found: "Permissions", request: "PRS-0101", hold: "Partial", evidence: "read", events: 81, partial: "2 of 5 locations",
      exception: { type: "Partial or failed application", status: "Open", since: "2026-09-29", detail: "Purview reports Partial: 2 of 5 site locations are on hold." } },
    { id: "s-sp-label",   owner: null, type: "SharePoint", name: "Veltrazine Labeling",             found: "Sources",  request: "PRS-0103", hold: "Applied", evidence: "read", events: 37 },
    /* Copilot (2) */
    { id: "s-cp-torres",  owner: "p-torres", type: "Copilot interactions", name: "Copilot · Michael Torres", found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 34 },
    { id: "s-cp-bauer",   owner: "p-bauer",  type: "Copilot interactions", name: "Copilot · Katrin Bauer",   found: "Standard source", request: "PRS-0101", hold: "Applied", evidence: "read", events: 23 },
    /* No activity data (3) */
    { id: "s-box-cro",    owner: null, type: "Box", name: "Veltrazine CRO Exchange",                found: "Survey answers", request: "PRS-0101", hold: "Unknown", evidence: "none", events: null },
    { id: "s-webex",      owner: null, type: "Webex", name: "Regulatory Affairs space",            found: "Sources",  request: "PRS-0101", hold: "Unknown", evidence: "none", events: null },
    { id: "s-fs-fra",     owner: null, type: "File share", name: "\\\\fra-fs01\\RegAffairs",          found: "Survey answers",  request: "PRS-0101", hold: "Attested", evidence: "attested", events: null, region: "RoW",
      attestation: { by: "Stefan Krüger", on: "2026-10-06", next: "2026-11-05" } },
    /* Added for custodians (2): devices */
    { id: "s-lt-44821",   owner: "p-park",   type: "Laptop", name: "Laptop LT-44821",                found: "Added for a custodian", request: "PRS-0101", hold: "Overdue", evidence: "attested", events: null, addedForCustodian: true,
      attestation: { by: "Owen Fitzgerald", due: "2026-10-01", last: "2026-09-01" },
      exception: { type: "Attestation overdue", status: "Open", since: "2026-10-01", detail: "Owen Fitzgerald's monthly attestation was due 10-01-2026." } },
    { id: "s-mb-2274",    owner: "p-vasquez", type: "Mobile device", name: "Mobile MB-2274",          found: "Added for a custodian", request: "PRS-0101", hold: "Attested", evidence: "attested", events: null, addedForCustodian: true,
      attestation: { by: "Owen Fitzgerald", on: "2026-10-01", next: "2026-11-01" } },
    /* Standard sources of the three custodians added after the notice.
       Not yet requested, so not in Hold status; Coverage counts them.    */
    { id: "s-ex-chen",   owner: "p-chen",   type: "Exchange Online", name: "sarah.chen@meridianbiopharma.com",     found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true },
    { id: "s-od-chen",   owner: "p-chen",   type: "OneDrive",        name: "OneDrive · Sarah Chen",                found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true },
    { id: "s-ex-webb",   owner: "p-webb",   type: "Exchange Online", name: "marcus.webb@meridianbiopharma.com",    found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true },
    { id: "s-od-webb",   owner: "p-webb",   type: "OneDrive",        name: "OneDrive · Marcus Webb",               found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true },
    { id: "s-ex-kohler", owner: "p-kohler", type: "Exchange Online", name: "juergen.koehler@meridianbiopharma.com", found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true,
      priorWork: { caseId: "MBP-0811", request: "PRS-0088", what: "Already preserved", on: "2026-05-12", via: "Purview" } },
    { id: "s-od-kohler", owner: "p-kohler", type: "OneDrive",        name: "OneDrive · Jürgen Köhler",             found: "Standard source", request: null, hold: null, evidence: "none", events: null, pending: true }
  ];

  /* ── Requests (one registry). Collection requests appear in the list
        only; anything deeper opens the "not in this demo" page.           */
  M.requests = [
    { id: "PRS-0101", caseId: "MBP-0926", kind: "Preservation", status: "In progress", sent: "2026-08-21", by: "p-donovan", due: "2026-10-09",
      title: "Initial preservation · 5 custodians", updated: "2 hours ago", scope: "All content, no date limit" },
    { id: "PRS-0103", caseId: "MBP-0926", kind: "Preservation", status: "Complete", sent: "2026-09-12", by: "p-donovan", due: "2026-09-19",
      title: "Veltrazine Labeling site", updated: "09-26-2026", scope: "All content, no date limit", readyToClose: true },
    { id: "COL-0142", caseId: "MBP-0926", kind: "Collection", status: "In progress", sent: "2026-09-18", by: "p-reyes", due: "2026-10-12",
      title: "Regulatory Submissions site and Veltrazine Program team", updated: "40 min ago", linked: "PRS-0101",
      requires: "2 failed collections · 1 question", failed: 2, progress: [10, 17], dates: "01-01-2024 – 06-30-2026", handlers: "3 handlers (1 automatic)" },
    { id: "COL-0139", caseId: "MBP-0926", kind: "Collection", status: "Complete · receipt pending", sent: "2026-09-02", by: "p-reyes", due: "2026-09-16",
      title: "Labeling correspondence, 2024", updated: "10-05-2026", backup: true,
      requires: "1 package waiting on your receipt", progress: [2, 2], dates: "01-01-2024 – 12-31-2024", handlers: "1 handler (automatic)" },
    { id: "PRS-0088", caseId: "MBP-0811", kind: "Preservation", status: "Complete", sent: "2026-05-12", by: "p-hoffmann", title: "EMA inquiry custodians" }
  ];
  /* Who handles each source type, and where the work lands (routing rules, PRD 06). */
  M.handlerFor = {
    "Exchange Online":      { handler: "Purview hold", kind: "Automatic", dest: "Microsoft Purview", rule: "Exchange, OneDrive, Teams, SharePoint holds → Purview" },
    "OneDrive":             { handler: "Purview hold", kind: "Automatic", dest: "Microsoft Purview", rule: "Exchange, OneDrive, Teams, SharePoint holds → Purview" },
    "Microsoft Teams":      { handler: "Purview hold", kind: "Automatic", dest: "Microsoft Purview", rule: "Exchange, OneDrive, Teams, SharePoint holds → Purview" },
    "SharePoint":           { handler: "Purview hold", kind: "Automatic", dest: "Microsoft Purview", rule: "Exchange, OneDrive, Teams, SharePoint holds → Purview" },
    "Copilot interactions": { handler: "Purview hold", kind: "Automatic", dest: "Microsoft Purview", rule: "Exchange, OneDrive, Teams, SharePoint holds → Purview" },
    "Box":                  { handler: "Enterprise Content", kind: "Response team", dest: "Held in place in Box", rule: "Box preservation → Enterprise Content" },
    "Webex":                { handler: "Collaboration Apps", kind: "Response team", dest: "Held in place in Webex", rule: "Chosen by the requester (no Webex rule)" },
    "File share":           { handler: "IT Infrastructure EU", kind: "Response team", dest: "Held in place on the share", rule: "File share preservation · Rest of world → IT Infrastructure EU" },
    "Laptop":               { handler: "Endpoint & Mobile", kind: "Response team", dest: "Device kept from reimaging", rule: "Laptop and mobile preservation → Endpoint & Mobile" },
    "Mobile device":        { handler: "Endpoint & Mobile", kind: "Response team", dest: "Device kept from reimaging", rule: "Laptop and mobile preservation → Endpoint & Mobile" }
  };
  /* Work item status from what the hold reads (glossary work item statuses). */
  M.workItemOf = function (s) {
    if (s.found === "Sources" && s.type === "Webex") return { status: "Returned", note: "Webex is not connected · returned 10-07-2026 by Collaboration Apps" };
    if (s.hold === "Applied") return { status: "Complete", note: "" };
    if (s.hold === "Attested") return { status: "Complete", note: "attested " + (s.attestation && s.attestation.on ? s.attestation.on : "") };
    if (s.hold === "Partial") return { status: "Partially complete", note: s.partial || "" };
    if (s.hold === "Applying") return { status: "In progress", note: "Applying since 10-05-2026" };
    if (s.hold === "Not applied") return { status: "Complete", note: "hold removed outside CaseFusion on 10-03-2026 · see Hold status" };
    if (s.hold === "Overdue") return { status: "Complete", note: "attestation overdue since 10-01-2026" };
    return { status: "In progress", note: "awaiting the team" };
  };
  /* Source type names as the product writes them (PRD 03), where the ledger keeps the workload name. */
  M.typeLabel = function (t) { return { "Exchange Online": "Exchange mailbox", "Microsoft Teams": "Teams team", "SharePoint": "SharePoint site", "Box": "Box folder", "Webex": "Webex space" }[t] || t; };
  /* Laptops a standard-source rule would add for the custodians added after the notice. */
  M.standardLaptops = { "p-chen": "LT-50231", "p-webb": "LT-50187", "p-kohler": "LT-60412" };

  /* ── Data map (PRD 01). Items are content items in the case window;
        events are unified-audit-log events (null = no activity data).         */
  M.items = { "s-ex-vasquez": 11840, "s-ex-torres": 9312, "s-ex-wong": 6204, "s-ex-bauer": 7115, "s-ex-park": 5420, "s-ex-okafor": 1980,
    "s-od-vasquez": 2210, "s-od-torres": 1764, "s-od-wong": 980, "s-od-bauer": 1322, "s-od-park": 904,
    "s-tm-program": 3418, "s-tm-raeu": 1207, "s-tm-safety": 866, "s-sp-subs": 4212, "s-sp-label": 611,
    "s-cp-torres": 142, "s-cp-bauer": 97, "s-box-cro": 388, "s-webex": 156, "s-fs-fra": 2730 };
  M.locations = { "s-ex-vasquez": "Exchange Online", "s-tm-program": "teams/VeltrazineProgram", "s-tm-raeu": "teams/RegulatoryAffairsEU",
    "s-tm-safety": "teams/ClinicalSafetyReview", "s-sp-subs": "/sites/RegSubmissions", "s-sp-label": "/sites/VeltrazineLabeling",
    "s-box-cro": "Box · /Veltrazine/CRO Exchange", "s-webex": "Webex · Regulatory Affairs space", "s-fs-fra": "\\\\fra-fs01\\RegAffairs" };
  M.dataMapScope = { name: "Regulatory custodians v3", saved: "09-12-2026", custodians: ["p-vasquez", "p-torres", "p-wong", "p-bauer", "p-park"] };
  M.window = { start: "2024-01-01", end: "2026-06-30" };
  M.reportedLocationsAwaiting = 11;
  /* Notable non-custodians (data map design 17235:760021): people not on the custodian list with
     20+ UAL events against an in-scope source in the case window, or a top collaborator with a
     custodian. Each reason traces to M.dataMap.accessed below (check.js). */
  M.notableNonCustodians = [
    { personId: "p-okafor",    kind: "Source activity",  workload: "Exchange",   source: "s-ex-okafor",  events: 570, note: "His own mailbox is on this case" },
    { personId: "p-nair",      kind: "Source activity",  workload: "Teams",      source: "s-tm-program", events: 38 },
    { personId: "p-weber",     kind: "Source activity",  workload: "Teams",      source: "s-tm-raeu",    events: 48 },
    { personId: "p-lindqvist", kind: "Top collaborator", workload: "Teams",      source: "s-tm-program", events: 30, guest: true, with: "p-wong" }
  ];
  /* Source details for the Regulatory Submissions site (PRD 01 §7.3–7.4). */
  M.sourceDetails = {
    "s-sp-subs": {
      inherit: "2 of 5 locations inherit site permissions",
      businessOwner: "p-vasquez", systemOwner: "p-okafor", team: "Enterprise Content", confirmed: ["2026-09-02", "p-vasquez"],
      discovery: "Permissions (data map) · first seen 01-14-2024",
      alsoAdded: "Survey answers SUR-0012 · Lisa Wong",
      retention: "Compliance retention until Jan 2031 (reported by SharePoint)",
      history: "On hold in 1 case since 08-21-2026 · 2 of 5 locations held · see Hold status",
      locationsDetail: [
        { name: "Shared Documents", items: 1420, last: "2026-06-24", perms: "Inherits from site" },
        { name: "eCTD Archive", items: 1204, last: "2024-12-18", perms: "Unique permissions · broken 03-03-2025" },
        { name: "Module 2 Drafts", items: 702, last: "2026-06-11", perms: "Inherits from site" },
        { name: "Module 5 CSR", items: 563, last: "2026-05-30", perms: "Unique permissions · broken 01-09-2026" },
        { name: "Labeling Archive", items: 323, last: "2025-08-02", perms: "Unique permissions · broken 08-02-2025" }
      ],
    }
  };

  /* ── Data map (design 17235:760021, PRD 01 §7.1–7.4 as revised 10-13) ──────────
        accessed: people with UAL activity per source in the case window; each list sums
        to the source's events. participants: Teams membership rosters (who belongs, not
        who posted). locations: per-location items, summing to the source's items.     */
  M.dataMap = {
    accessed: {
      "s-ex-vasquez": [["p-vasquez", 4280], ["p-nair", 30]],
      "s-ex-torres":  [["p-torres", 3870]],
      "s-ex-wong":    [["p-wong", 2215]],
      "s-ex-bauer":   [["p-bauer", 2668], ["p-weber", 22]],
      "s-ex-park":    [["p-park", 1985]],
      "s-ex-okafor":  [["p-okafor", 570]],
      "s-od-vasquez": [["p-vasquez", 590], ["p-nair", 22]],
      "s-od-torres":  [["p-torres", 488]],
      "s-od-wong":    [["p-wong", 301]],
      "s-od-bauer":   [["p-bauer", 377]],
      "s-od-park":    [["p-park", 266]],
      "s-tm-program": [["p-vasquez", 140], ["p-torres", 118], ["p-wong", 96], ["p-park", 70], ["p-nair", 38], ["p-lindqvist", 30], ["p-webb", 20]],
      "s-tm-raeu":    [["p-bauer", 102], ["p-kohler", 64], ["p-weber", 48], ["p-vasquez", 30]],
      "s-tm-safety":  [["p-torres", 61], ["p-kohler", 44], ["p-park", 32], ["p-chen", 18]],
      "s-sp-subs":    [["p-vasquez", 24], ["p-nair", 19], ["p-wong", 14], ["p-bauer", 9], ["p-torres", 5], ["p-park", 4], ["p-whitaker", 3], ["p-okafor", 3]],
      "s-sp-label":   [["p-wong", 18], ["p-vasquez", 9], ["p-chen", 6], ["p-vogt", 4]],
      "s-cp-torres":  [["p-torres", 34]],
      "s-cp-bauer":   [["p-bauer", 23]]
    },
    threshold: 20,
    participants: {
      "s-tm-program": [["p-vasquez", "2024-01-15"], ["p-torres", "2024-01-15"], ["p-wong", "2024-01-20"], ["p-park", "2024-02-03"], ["p-nair", "2024-05-01"],
                       ["p-webb", "2025-09-08"], ["p-chen", "2025-03-11"], ["p-lindqvist", "2025-11-03"], ["p-ellis", "2024-02-03"]],
      "s-tm-raeu":    [["p-bauer", "2024-03-11"], ["p-kohler", "2024-03-11"], ["p-weber", "2026-05-04"], ["p-vasquez", "2024-03-20"], ["p-hoffmann", "2025-01-07"]],
      "s-tm-safety":  [["p-torres", "2024-06-02"], ["p-kohler", "2024-06-02"], ["p-park", "2024-06-10"], ["p-chen", "2025-02-14"], ["p-webb", "2025-09-08"]]
    },
    locations: {
      "s-sp-subs":  [["Shared Documents", 1420, "2026-06-24"], ["eCTD Archive", 1204, "2024-12-18"], ["Module 2 Drafts", 702, "2026-06-11"], ["Module 5 CSR", 563, "2026-05-30"], ["Labeling Archive", 323, "2025-08-02"]],
      "s-sp-label": [["Shared Documents", 402, "2026-06-18"], ["Artwork Proofs", 209, "2026-05-22"]]
    },
    /* Sample items per location, for Item view (name, type, modified, owner). */
    items: {
      "Module 2 Drafts":  [["Veltrazine_Module2.5_ClinicalOverview_v7.docx", "Document", "2026-06-11", "p-wong"], ["Module 2.7.4 Summary of Clinical Safety.docx", "Document", "2026-06-02", "p-vasquez"],
                           ["EMA_RSI_Response_Draft.docx", "Document", "2026-05-27", "p-vasquez"], ["Labeling_Comparison_US_EU.xlsx", "Spreadsheet", "2026-05-19", "p-wong"], ["AE_Narratives_Batch3.pdf", "PDF", "2026-04-30", "p-park"]],
      "Shared Documents": [["FDA_Correspondence_Log.xlsx", "Spreadsheet", "2026-06-24", "p-wong"], ["Veltrazine_PSUR_2025.pdf", "PDF", "2026-03-31", "p-bauer"], ["Submission_Calendar_2026.xlsx", "Spreadsheet", "2026-06-02", "p-wong"],
                           ["NDA-2026-0143_Cover_Letter.docx", "Document", "2026-06-18", "p-vasquez"]],
      "eCTD Archive":     [["eCTD_0041_Module1.zip", "Archive", "2024-12-18", "p-wong"], ["eCTD_0040_Module1.zip", "Archive", "2024-09-02", "p-wong"], ["Sequence_Index_2024.xlsx", "Spreadsheet", "2024-12-18", "p-wong"]],
      "Module 5 CSR":     [["CSR_VLT-301_Final.pdf", "PDF", "2026-05-30", "p-torres"], ["CSR_VLT-302_Draft_v4.docx", "Document", "2026-05-12", "p-torres"], ["Patient_Narratives_VLT-301.pdf", "PDF", "2026-04-08", "p-park"]],
      "Labeling Archive": [["USPI_Veltrazine_2025-08.pdf", "PDF", "2025-08-02", "p-vasquez"], ["SmPC_Veltrazine_DE.docx", "Document", "2025-07-14", "p-bauer"], ["Carton_Artwork_v12.pdf", "PDF", "2025-06-30", "p-chen"]],
      "Artwork Proofs":   [["Carton_Artwork_v14.pdf", "PDF", "2026-05-22", "p-chen"], ["Blister_Foil_Proof_v3.pdf", "PDF", "2026-04-17", "p-chen"]],
      "Documents":        [["Weekly_Status_{{who}}.docx", "Document", "2026-06-26", null], ["Veltrazine_Notes.docx", "Document", "2026-05-14", null], ["Budget_FY26.xlsx", "Spreadsheet", "2026-03-02", null]],
      "Desktop":          [["Scan_0612.pdf", "PDF", "2026-06-12", null], ["Draft_Response.docx", "Document", "2026-04-21", null]],
      "Microsoft Teams Chat Files": [["Screenshot 2026-05-09.png", "Image", "2026-05-09", null], ["Shared_Tracker.xlsx", "Spreadsheet", "2026-02-18", null]]
    },
    /* Custodian tags (managed on the Custodians tab). */
    tags: { "Regulatory": ["p-vasquez", "p-wong", "p-bauer"], "Clinical": ["p-torres", "p-kohler"], "Quality": ["p-park", "p-ellis"], "Manufacturing": ["p-chen"], "Germany": ["p-bauer", "p-kohler"] },
    savedScopes: [
      { name: "Regulatory custodians v3", detail: "Case window · 5 custodians · no exclusions", saved: "2026-09-12", time: "3:14 PM", by: "p-donovan",
        custodians: ["p-vasquez", "p-torres", "p-wong", "p-bauer", "p-park"], excluded: [] },
      { name: "Regulatory custodians v2", detail: "Case window · 4 custodians · 1 exclusion", saved: "2026-08-28", time: "10:02 AM", by: "p-donovan",
        custodians: ["p-vasquez", "p-torres", "p-wong", "p-park"], excluded: ["s-webex"] },
      { name: "EU regulatory team", detail: "All time · 2 custodians", saved: "2026-09-03", time: "8:40 AM", by: "p-hoffmann",
        custodians: ["p-bauer", "p-kohler"], excluded: [], basis: "all" }
    ]
  };
  /* OneDrive locations follow one split (Documents, Desktop, Teams chat files), summing to items. */
  ["s-od-vasquez", "s-od-torres", "s-od-wong", "s-od-bauer", "s-od-park"].forEach(function (id) {
    var n = M.items[id], d = Math.round(n * 0.62), k = Math.round(n * 0.27);
    M.dataMap.locations[id] = [["Documents", d, "2026-06-26"], ["Desktop", k, "2026-06-12"], ["Microsoft Teams Chat Files", n - d - k, "2026-05-09"]];
  });

  /* ── Source types (PRD 03 §7.4). The 16-type seed set. std: standard source for
        [employee active, employee departed, contractor active, contractor departed, vendor active, vendor departed]. */
  M.sourceTypes = [
    { name: "Exchange mailbox", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Jan 2012 – present", disc: "Entra ID + audit logs", loc: "Email address", date: "Yes", terms: "KeyQL", unit: "Items", sources: 1240, std: [1, 1, 1, 1, 0, 0] },
    { name: "Inactive mailbox", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Jan 2012 – present", disc: "Entra ID", loc: "Email address", date: "Yes", terms: "KeyQL", unit: "Items", sources: 47, std: [0, 1, 0, 1, 0, 0] },
    { name: "OneDrive", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Sep 2014 – present", disc: "Entra ID + audit logs", loc: "OneDrive URL", date: "Yes", terms: "KeyQL", unit: "Items", sources: 1240, std: [1, 1, 1, 1, 0, 0] },
    { name: "SharePoint site", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Mar 2016 – present", disc: "Audit logs · permissions", loc: "Site URL", date: "Yes", terms: "KeyQL", unit: "Items", sources: 318, std: [0, 0, 0, 0, 0, 0] },
    { name: "Teams chats", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Nov 2017 – present", disc: "Audit logs · group membership", loc: "Chat or team ID", date: "Yes", terms: "KeyQL", unit: "Items", sources: 96, std: [0, 0, 0, 0, 0, 0] },
    { name: "Viva Engage", kind: "Microsoft 365", integ: "Purview", status: "Active", cov: "Jun 2010 – present", disc: "Entra ID + audit logs", loc: "Community name", date: "Yes", terms: "KeyQL", unit: "Items", sources: 4, std: [0, 0, 0, 0, 0, 0] },
    { name: "Yammer", kind: "Microsoft 365", integ: "Purview", status: "Decommissioned", note: "Succeeded by Viva Engage", cov: "Jun 2010 – Mar 2025", disc: "Sources", loc: "Community name", date: "Yes", terms: "KeyQL", unit: "Items", sources: 4, std: [1, 1, 0, 0, 0, 0], under: "Viva Engage" },
    { name: "Skype for Business", kind: "Microsoft 365", integ: "Not integrated", status: "Decommissioned", note: "Archived in Exchange", cov: "Apr 2011 – Jul 2021", disc: "Added manually", loc: "Conversation archive", date: "Yes", terms: "KWD", unit: "Items", sources: 0, std: [1, 1, 0, 0, 0, 0], under: "Exchange mailbox" },
    { name: "Box folder", kind: "Connected app", integ: "Not integrated", status: "Active", cov: "Feb 2015 – present", disc: "Added manually", loc: "Folder path", date: "Yes", terms: "KWD", unit: "Whole folder", sources: 11, std: [0, 0, 0, 0, 0, 0] },
    { name: "Slack channel", kind: "Connected app", integ: "Not integrated", status: "Active", cov: "Aug 2019 – present", disc: "Added manually", loc: "#channel name", date: "Yes", terms: "KWD", unit: "Daily exports", sources: 6, std: [0, 0, 0, 0, 0, 0] },
    { name: "Laptop", kind: "Device", integ: "Not integrated", status: "Active", cov: "Jan 2019 – present", disc: "Asset inventory", loc: "Asset tag or device name", date: "Varies by tool", terms: "KWD", unit: "Full image or targeted", sources: 1318, std: [1, 1, 1, 0, 0, 0] },
    { name: "Mobile device", kind: "Device", integ: "Not integrated", status: "Active", cov: "Jan 2019 – present", disc: "Asset inventory", loc: "Asset tag or phone number", date: "Varies by tool", terms: "NOQ", unit: "Full image or targeted", sources: 1190, std: [0, 0, 0, 0, 0, 0] },
    { name: "Webex space", kind: "Other", integ: "Not integrated", status: "Active", cov: "Jun 2021 – present", disc: "Added manually", loc: "Space name", date: "Yes", terms: "NOQ", unit: "Monthly exports", sources: 3, std: [0, 0, 0, 0, 0, 0], added: true },
    { name: "File share", kind: "Other", integ: "Not integrated", status: "Active", cov: "Jan 2010 – present", disc: "Added manually · Source import", loc: "UNC path or mount", date: "Varies by tool", terms: "KWD", unit: "Selected locations", sources: 28, std: [0, 0, 0, 0, 0, 0] },
    { name: "CRM records", kind: "Other", integ: "Not integrated", status: "Active", cov: "Mar 2014 – present", disc: "Added manually · Source import", loc: "System and object", date: "Yes", terms: "KWD", unit: "Search results", sources: 4, std: [0, 0, 0, 0, 0, 0] },
    { name: "Physical media", kind: "Other", integ: "No hold available", status: "Active", cov: "Jan 2008 – present", disc: "Added manually", loc: "Media tag or location", date: "No", terms: "NOQ", unit: "Whole container", sources: 9, std: [0, 0, 0, 0, 0, 0] }
  ];
  /* Yammer's decommissioning (PRD 03 §7.6) and the cases it touches (one computation, S90). */
  M.yammer = {
    decommissioned: "2025-03-14", covStart: "Jun 2010", covEnd: "Mar 2025", successor: "Viva Engage", people: 1240,
    sources: 14, communities: 4,
    effects: [
      { caseId: "MBP-0842", effect: "Holds follow", text: "The holds follow the content to Viva Engage. Nothing is released." },
      { caseId: "MBP-0926", effect: "Newly covered", text: "Yammer held the only content for this window. Viva Engage now covers it." },
      { caseId: "MBP-0691", effect: "Report only", text: "The preservation report keeps the Yammer name with its data outcome." }
    ]
  };

  /* ── My Work (PRD 11). One queue across every case the viewer can open.
        Rows are produced by other features; My Work resolves nothing.
        units: Preservation at risk counts units, not rows (MW34).
        maskPerson: if the viewer cannot see this person, use whyMasked (R3).   */
  M.viewerCases = {
    "v-us":  { open: 18, cases: ["MBP-0926", "MBP-0931", "MBP-0842", "MBP-0774", "MBP-0811", "MBP-0691", "MBP-0788"] },
    "v-row": { open: 4,  cases: ["MBP-0926", "MBP-0842", "MBP-0811"] }
  };
  M.signedOff = "10-07-2026 at 4:40 PM";
  M.myWork = [
    { id: "mw1", chip: "GAP", found: true, locked: true, units: { removed: 1 }, caseId: "MBP-0926", since: "2026-10-03",
      what: "1 Purview hold was removed outside CaseFusion",
      why: "Michael Torres's OneDrive · removed by the offboarding run on 10-03-2026. Nothing is preserved there for him.",
      whyMasked: "1 custodian's OneDrive · removed by the offboarding run on 10-03-2026. Nothing is preserved there for them.", maskPerson: "p-torres",
      action: { label: "OPEN HOLD STATUS", href: "case-hold-status.html" } },
    { id: "mw2", chip: "GAP", found: true, locked: true, units: { notOnHold: 3 }, caseId: "MBP-0926", since: "2026-09-17",
      what: "3 custodians added after the notice are not on hold",
      why: "Added from the data map, the org chart and an interview answer. No legal hold notification has been sent either.",
      action: { label: "PRESERVE AND NOTIFY", href: "case-coverage.html" } },
    { id: "mw3", chip: "GAP", found: true, locked: true, units: { leaver: 1 }, caseId: "MBP-0926", since: "2026-10-02",
      what: "Michael Torres left the organization",
      whatMasked: "A custodian left the organization", maskPerson: "p-torres",
      why: "On legal hold in 2 cases. His mailbox is inactive and stays preserved while a hold remains.",
      whyMasked: "On legal hold in 2 cases. The mailbox is inactive and stays preserved while a hold remains.",
      action: { label: "REVIEW LEAVER", href: "not-in-demo.html?what=Persona+Case+Profile+%C2%B7+Data+sources&ships=1" } },
    { id: "mw4", chip: "ANSWER", caseId: "MBP-0926", waitingText: "2 hours", age: 0.08,
      what: "Owen Fitzgerald asks which laptop to preserve",
      why: "“James Park has two laptops: LT-44821 and a loaner, LT-50112. Preserve both?” · PRS-0101",
      whyMasked: "“The custodian has two laptops: LT-44821 and a loaner, LT-50112. Preserve both?” · PRS-0101", maskPerson: "p-park",
      action: { label: "ANSWER", href: "not-in-demo.html?what=Question+on+PRS-0101" } },
    { id: "mw5", chip: "DECIDE", caseId: "MBP-0926", since: "2026-10-07",
      what: "1 returned work item on PRS-0101",
      why: "Collaboration Apps returned the Webex work item: Webex is not connected. Choose another handler or ask for an attestation.",
      action: { label: "OPEN REQUEST", href: "case-requests.html" } },
    { id: "mw6", chip: "APPROVE", caseId: "MBP-0931", waitingText: "5 hours", age: 0.2,
      what: "Enterprise Content asks to move a due date",
      why: "Box preservation · 10-12-2026 instead of 10-09-2026. “The folder owner is on leave until Monday.”",
      action: { label: "REVIEW", href: "not-in-demo.html?what=Due+date+request" } },
    { id: "mw7", chip: "CONFIRM", caseId: "MBP-0926", since: "2026-10-05",
      what: "PKG-0139-02 is waiting on your receipt",
      why: "Elena Vasquez mailbox · 640 MB · delivered to the Meridian review workspace.",
      whyMasked: "1 custodian's mailbox · 640 MB · delivered to the Meridian review workspace.", maskPerson: "p-vasquez",
      action: { label: "CONFIRM RECEIPT", href: "not-in-demo.html?what=Confirm+receipt" }, second: { label: "MANIFEST", href: "not-in-demo.html?what=Deliverable+manifest" } },
    { id: "mw8", chip: "GAP", found: true, locked: true, units: { attestation: 1 }, caseId: "MBP-0926", since: "2026-10-01",
      what: "Attestation overdue on a hold CaseFusion cannot read",
      why: "Laptop LT-44821 · Owen Fitzgerald has not attested in 37 days.",
      action: { label: "REQUEST ATTESTATION", toast: "Attestation requested from Owen Fitzgerald. It arrives in their Request Portal queue." } },
    { id: "mw9", chip: "GAP", found: true, caseId: "MBP-0931", since: "2026-09-25",
      what: "4 custodians have not acknowledged after escalation",
      why: "Escalated to their managers 13 days ago. Holds are applied; the notifications are outstanding.",
      action: { label: "SEND REMINDER", toast: "Reminder sent to 4 custodians on Halvorsen Class Action." }, second: { label: "COVERAGE", href: "not-in-demo.html?what=Coverage+%C2%B7+Halvorsen+Class+Action" } },
    { id: "mw10", chip: "REVIEW", caseId: "MBP-0926", since: "2026-10-04",
      what: "11 reported locations are awaiting review",
      why: "From 2 surveys and 3 interviews. Review these locations to add them to the data map.",
      action: { label: "OPEN REPORTED LOCATIONS", href: "not-in-demo.html?what=Reported+locations" } },
    { id: "mw11", chip: "DECIDE", found: true, caseId: "MBP-0691", since: "2026-08-31",
      what: "Case closed 38 days ago with 7 holds in force",
      why: "Closed 08-31-2026 with the reason “Related case expected”. The reminder is now 8 days overdue.",
      action: { label: "CREATE CLEANUP REQUEST", href: "not-in-demo.html?what=Data+cleanup+request" } },
    /* Snoozed by this person. Still counted in Needs you (MW48). */
    { id: "mw12", chip: "GAP", found: true, caseId: "MBP-0774", since: "2026-10-01", snoozedUntil: "2026-10-15",
      what: "2 custodians have not acknowledged", why: "Reminders sent on 10-04-2026 and 10-07-2026. Holds are applied.",
      action: { label: "SEND REMINDER", toast: "Reminder sent to 2 custodians on Thorne Medical." } },
    { id: "mw13", chip: "REVIEW", caseId: "MBP-0842", since: "2026-10-06", snoozedUntil: "2026-10-12",
      what: "Survey answers name 2 new locations", why: "From SUR-0031. Review these locations to add them to the data map.",
      action: { label: "OPEN REPORTED LOCATIONS", href: "not-in-demo.html?what=Reported+locations" } },
    { id: "mw14", chip: "ANSWER", caseId: "MBP-0811", since: "2026-10-07", snoozedUntil: "2026-10-09",
      what: "IT Infrastructure EU asks about the archive share", why: "“Is \\\\fra-fs02\\Archive in scope, or only RegAffairs?” · PRS-0088",
      action: { label: "ANSWER", href: "not-in-demo.html?what=Question+on+PRS-0088" } }
  ];
  M.caseAttention = {
    "MBP-0931": { stage: "Preservation", custodians: 118, onHold: "104 of 118", openRequests: 2, worst: "4 not acknowledged" },
    "MBP-0842": { stage: "Preservation", custodians: 22,  onHold: "22 of 22",   openRequests: 1, worst: "2 locations to review" },
    "MBP-0774": { stage: "Preservation", custodians: 31,  onHold: "31 of 31",   openRequests: 1, worst: "2 not acknowledged" },
    "MBP-0811": { stage: "Preservation", custodians: 7,   onHold: "7 of 7",     openRequests: 1, worst: "1 question" },
    "MBP-0691": { stage: "Closed",       custodians: 6,   onHold: "6 of 6",     openRequests: 0, worst: "Closed with holds in force" }
  };
  M.overdueWithTeams = [
    { team: "Endpoint & Mobile", days: 6, caseId: "MBP-0926", what: "LT-44821 attestation" },
    { team: "Enterprise Content", days: 3, caseId: "MBP-0931", what: "Box preservation" },
    { team: "IT Messaging", days: 2, caseId: "MBP-0931", what: "Shared mailbox preservation" }
  ];
  /* Only dates the product owns (MW72). kind: request | ack */
  /* This Week rows. flag: a short danger-text flag under the row ("Due Today", "At Risk"), replacing an icon-only warning
     whose meaning lived in a tooltip (Scott, 10-14: user clarity first). */
  M.thisWeek = [
    { day: "Today", kind: "request", n: 1, caseId: "MBP-0931", what: "PRS-0118 due · archive preservation", flag: "Due Today" },
    { day: "Fri",   kind: "ack",     n: 4, caseId: "MBP-0931", what: "4 acknowledgments due" },
    { day: "Fri",   kind: "request", n: 1, caseId: "MBP-0926", what: "PRS-0101 due · 2 work items open", flag: "At Risk" },
    { day: "Mon",   kind: "request", n: 1, caseId: "MBP-0842", what: "PRS-0120 due · Box folder preservation" },
    { day: "Tue",   kind: "ack",     n: 1, caseId: "MBP-0774", what: "1 acknowledgment due" },
    { day: "Wed",   kind: "request", n: 1, caseId: "MBP-0774", what: "PRS-0122 due · shared mailbox preservation" }
  ];
  /* What CaseFusion did since the viewer signed off (M.signedOff, 10-07-2026 at 4:40 PM): every entry is after that time.
     on + time (24h) are shown through M.fmtWhen: "Today at 6:12 AM", "Yesterday at 5:22 PM", else "10-05-2026 at 3:14 PM". */
  M.whatCaseFusionDid = [
    { n: 14, what: "Purview holds applied", context: "Halvorsen Class Action · new custodians from the 10-06-2026 import", on: "2026-10-08", time: "06:12", caseId: "MBP-0931" },
    { n: 3,  what: "work items routed to response teams", context: "Veltrazine Product Liability · PRS-0101 follow-ups", on: "2026-10-08", time: "02:40", caseId: "MBP-0926" },
    { n: 22, what: "reminders sent", context: "4 cases · legal hold notifications and surveys", on: "2026-10-08", time: "09:00", caseId: "MBP-0931" },
    { n: 1,  what: "custodian acknowledged", context: "Pellworth Arbitration · within the SLA", on: "2026-10-07", time: "17:22", caseId: "MBP-0842" },
    { n: 2,  what: "escalations sent", context: "Halvorsen Class Action · surveys past due", on: "2026-10-07", time: "18:05", caseId: "MBP-0931" }
  ];

  /* ── Header notifications (the frame's bell). ─────────────────────── */
  M.notifications = [
    { subject: "Hold removed outside CaseFusion", timestamp: "10-08-2026 · 9:12 AM", message: "OneDrive · Michael Torres was removed from the Purview hold on Veltrazine Product Liability.", unread: true },
    { subject: "Attestation overdue",             timestamp: "10-08-2026 · 8:00 AM", message: "Laptop LT-44821 has not been attested since 09-01-2026.", unread: true },
    { subject: "Custodians added after the notice", timestamp: "10-07-2026 · 4:40 PM", message: "3 custodians on Veltrazine Product Liability have not been sent a legal hold notification.", unread: true },
    { subject: "Survey not answered",             timestamp: "10-06-2026 · 10:05 AM", message: "Katrin Bauer has not answered SUR-0012.", unread: false }
  ];

  /* ── Hold detail for Hold status (PRD 07 §7.1). Freshness regimes:
        integrity = holds CaseFusion placed (continuous check);
        snapshot  = everything else (customer-run snapshot);
        attestation = sources CaseFusion cannot read.                       */
  M.freshness = {
    integrityAgo: "11 minutes ago",
    snapshot: "2026-09-14",
    snapshotIngested: "09-14-2026 at 2:10 AM",
    nextSnapshot: "2026-10-14"
  };
  (function holdDetail() {
    var byId = {};
    M.sources.forEach(function (s) { byId[s.id] = s; });
    M.sources.forEach(function (s) {
      if (s.pending) return;
      if (s.evidence === "read") { s.placedIn = "CaseFusion"; s.regime = "integrity"; s.kind = s.owner && !s.nonCustodial ? "Custodian hold" : "Source hold"; }
      if (s.evidence === "attested") { s.placedIn = "Response team"; s.regime = "attestation"; s.kind = "Source hold"; }
      if (s.evidence === "none") { s.placedIn = "Unknown"; s.regime = "none"; s.kind = "Source hold"; }
    });
    var t = byId["s-od-torres"];
    t.provisional = true;
    t.lastReadText = "Audit log, 14 min ago";
    t.reason = "Removed from the hold on an active case.";
    t.event = "The source was removed from the hold on 10-03-2026 at 11:20 AM by stefan.krueger, working in the Purview portal (offboarding run). CaseFusion read the change from the audit log and has not yet confirmed it with a reconciliation.";
    t.caveat = "Content is not necessarily gone: OneDrive applies a grace period after a hold is released.";
    t.raisedBy = "CaseFusion";
    t.notified = "Requester and Case Administrator";
    t.refreshTo = { hold: "Applied", lastReadText: "Verified just now",
      event: "Re-applied in the Purview portal on 10-08-2026 at 9:30 AM by stefan.krueger. CaseFusion read Applied at 9:42." };

    var sp = byId["s-sp-subs"];
    sp.regime = "snapshot"; sp.placedIn = "Purview portal";
    sp.reason = "2 of 5 locations report an error from Purview.";
    sp.event = "Purview applied the hold to 2 of the site's 5 locations. The other 3 report an error.";
    sp.locationErrors = [
      { location: "/sites/RegSubmissions/Shared Documents", status: "Applied" },
      { location: "/sites/RegSubmissions/eCTD Archive", status: "Applied" },
      { location: "/sites/RegSubmissions/Module 2 Drafts", status: "Error · the location was renamed after the hold was placed" },
      { location: "/sites/RegSubmissions/Module 5 CSR", status: "Error · the location exceeds the hold's item limit" },
      { location: "/sites/RegSubmissions/Labeling Archive", status: "Error · the site owner removed the hold's access" }
    ];
    sp.raisedBy = "CaseFusion"; sp.notified = "Requester and Case Administrator";

    var b = byId["s-ex-bauer"];
    b.reason = "Still applying after 3 days. Purview usually finishes within an hour.";
    b.event = "CaseFusion asked Purview to place the hold on 10-05-2026 at 2:05 PM. Purview has reported Applying since then.";
    b.raisedBy = "CaseFusion"; b.notified = "Requester and Case Administrator";

    var lt = byId["s-lt-44821"];
    lt.team = "Endpoint & Mobile";
    lt.reason = "Owen Fitzgerald has not attested in 37 days. The device may still be preserved; it is unverified.";
    lt.event = "Owen Fitzgerald attested the hold on 09-01-2026. The next attestation was due 10-01-2026 and has not been answered.";
    lt.lastReadText = "Attested 09-01-2026";
    lt.dueText = "Due 10-01-2026";
    lt.raisedBy = "CaseFusion"; lt.notified = "Owen Fitzgerald and Case Administrator";

    var o = byId["s-ex-okafor"];
    o.regime = "snapshot"; o.placedIn = "Purview portal"; o.kind = "Custodian hold";
    o.reason = "A hold covers this person but belongs to no case in CaseFusion. No case owns it.";
    o.event = "The 09-14-2026 snapshot shows a Purview hold on this mailbox, placed in the Purview portal. No CaseFusion request covers it.";
    o.raisedBy = "CaseFusion"; o.notified = "Preservation adjudicators";

    byId["s-mb-2274"].team = "Endpoint & Mobile";
    byId["s-mb-2274"].lastReadText = "Attested 10-01-2026";
    byId["s-mb-2274"].dueText = "Next due 11-01-2026";
    byId["s-fs-fra"].team = "IT Infrastructure EU";
    byId["s-fs-fra"].lastReadText = "Attested 10-06-2026";
    byId["s-fs-fra"].dueText = "Next due 11-05-2026";

    /* Event log per source (oldest first; the page shows newest first). Every entry has the same
       shape as what the page adds later: what happened, when, by whom, and a note. */
    function d(iso) { var p = iso.split("-"); return p[1] + "-" + p[2] + "-" + p[0]; }  /* house format mm-dd-yyyy */
    M.sources.forEach(function (s) {
      if (s.pending) return;
      s.log = s.evidence === "read" && s.request ? [{ on: "2026-08-21", what: "Hold placed through " + s.request, by: "CaseFusion", note: "CaseFusion verifies this hold continuously." }] : [];
      if (s.evidence === "attested" && s.attestation && s.attestation.on)
        s.log = [{ on: s.attestation.on, what: "Hold attested", by: s.attestation.by, note: "The next attestation is due " + d(s.attestation.next) + "." }];
    });
    t.log.push(
      { on: "2026-08-21", time: "10:14", what: "Purview reports Applied", by: "Purview", note: "The hold was applied to the OneDrive account 40 minutes after the request was sent." },
      { on: "2026-09-14", what: "Confirmed in the snapshot", by: "Preservation Collector", note: "The 09-14-2026 snapshot shows the hold applied." },
      { on: "2026-10-02", time: "17:05", what: "Account flagged for offboarding", by: "Directory sync", note: "Michael Torres was marked as leaving in the directory. The mailbox became inactive the same day." });
    t.log.push({ on: "2026-10-03", time: "11:20", what: "Removed from the hold", by: "stefan.krueger",
      note: "Made in the Purview portal during an offboarding run. Read from the audit log and not yet confirmed by a reconciliation. Content is not necessarily gone. OneDrive applies a grace period after a hold is released." });
    ["2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"].forEach(function (day) {
      t.log.push({ on: day, what: "Integrity check passed", by: "CaseFusion", note: "Purview reads Applied on this location." });
    });
    t.log.push({ on: "2026-09-12", time: "14:20", what: "Hold policy updated", by: "CaseFusion",
      note: "Teams and devices were added to the PRS-0101 hold policy after supplemental notice LH-0044. This location was unchanged." });
    /* Oldest first by date then time; an entry without a time sorts before timed entries that day. */
    t.log.sort(function (x, y) { return (x.on + (x.time || "00:00")).localeCompare(y.on + (y.time || "00:00")); });
    sp.log = [{ on: "2026-09-14", what: "Hold applied to 2 of 5 locations", by: "Purview", note: "Read from the 09-14-2026 snapshot. The other 3 locations report an error." }];
    b.log = [{ on: "2026-10-05", time: "14:05", what: "Hold requested from Purview", by: "CaseFusion", note: "Purview has reported Applying since the request." }];
    lt.log = [{ on: "2026-09-01", what: "Hold attested", by: "Owen Fitzgerald", note: "The next attestation was due 10-01-2026 and has not been answered." }];
    o.log = [{ on: "2026-09-14", what: "Hold found in the snapshot", by: "Preservation Collector", note: "The hold was placed in the Purview portal. No CaseFusion request covers it." }];
    byId["s-box-cro"].reason = "Box is not connected. No one has attested this folder.";
    byId["s-webex"].reason = "Webex is not connected. No one has attested this space.";
  }());

  /* ═════════ Derived views ═════════ */

  M.person = function (id) {
    for (var i = 0; i < M.people.length; i++) if (M.people[i].id === id) return M.people[i];
    return null;
  };
  M.caseById = function (id) {
    for (var i = 0; i < M.cases.length; i++) if (M.cases[i].id === id) return M.cases[i];
    return null;
  };

  /** Hold status segment for one source (PRD 07 five segments). */
  M.segmentOf = function (s) {
    if (s.pending) return null;
    if (s.exception && s.exception.status !== "Resolved" && s.exception.status !== "Muted") return "attention";
    /* A Purview state that is not clean, or an overdue attestation, is still someone's to act on. */
    if (["Partial", "Applying", "Removing", "Not applied", "Overdue"].indexOf(s.hold) !== -1) return "attention";
    if (s.hold === "Applied") return "confirmed";
    if (s.hold === "Attested") return "attested";
    if (s.evidence === "imported") return "imported";
    return "unknown";
  };

  M.holdStatusSources = function () {
    return M.sources.filter(function (s) { return !s.pending; });
  };

  /* ── Coverage (PRD 08). Every cell is a count or a status, never a verdict.
        state: done | progress | todo | action | silent | dash | na
        bucket: fully | progress | action                                     */
  M.sourcesOf = function (personId) {
    return M.sources.filter(function (s) { return s.owner === personId && !s.nonCustodial; });
  };
  M.coverageOf = function (c) {
    var out = {};
    var today = M.DEMO_TODAY;
    /* Legal hold notification */
    var notices = (c.lhn || []).filter(function (n) { return n.status !== "Silent"; });
    var silent = (c.lhn || []).filter(function (n) { return n.status === "Silent"; })[0];
    if (c.released) out.lhn = { state: "done", text: "Released", detail: "latest " + M.fmtDate(c.released).replace(/ \d{4}$/, "") };
    else if (!notices.length && silent) out.lhn = { state: "silent", text: "Silent legal hold", detail: silent.id + " · not notified" };
    else if (!notices.length) out.lhn = { state: "action", text: "Not sent", why: "notify" };
    else {
      var latest = notices[notices.length - 1];
      var acked = notices.filter(function (n) { return n.status === "Acknowledged"; }).length;
      var st = latest.status;
      var state = st === "Acknowledged" ? "done" : st === "Sent" ? "progress" : "action";
      out.lhn = { state: state, text: st, detail: acked + " of " + notices.length + " · latest " + M.fmtDate(latest.on || latest.sentOn || today).replace(/ \d{4}$/, "") };
    }
    /* Survey */
    var sv = c.surveys || [];
    if (c.notRequiredWf && c.notRequiredWf.survey) out.survey = { state: "na", text: "n/a" };
    else if (!sv.length) out.survey = { state: "dash", text: "—" };
    else {
      var s = sv[sv.length - 1];
      var answered = sv.filter(function (x) { return x.status === "Answered"; }).length;
      var sState = s.status === "Answered" ? "done" : s.status === "Sent" ? "progress" : "action";
      var sDetail = s.status === "Escalated" ? (s.reminders || 0) + " reminders · escalated" :
        s.status === "Sent" ? "due " + M.fmtDate(s.due).replace(/ \d{4}$/, "") : answered + " of " + sv.length;
      out.survey = { state: sState, text: s.status, detail: sDetail };
    }
    /* Interview: not expected on this case. */
    out.interview = (c.notRequiredWf && c.notRequiredWf.interview) ? { state: "na", text: "n/a" } : { state: "dash", text: "—" };
    /* Preservation */
    if (c.notRequired && c.notRequired.preservation) out.preservation = { state: "na", text: "n/a", detail: "not required · reason on record" };
    else {
      var src = M.sourcesOf(c.personId);
      var held = src.filter(function (x) { return x.hold === "Applied" || x.hold === "Attested"; });
      var notes = [];
      var removed = src.filter(function (x) { return x.hold === "Not applied"; }).length;
      var applying = src.filter(function (x) { return x.hold === "Applying"; }).length;
      var overdue = src.filter(function (x) { return x.hold === "Overdue"; }).length;
      var pending = src.filter(function (x) { return x.pending; }).length;
      var attested = src.filter(function (x) { return x.hold === "Attested"; }).length;
      if (removed) notes.push(removed + " removed from Purview hold");
      if (applying) notes.push(applying + " applying");
      if (overdue) notes.push(overdue + " attestation overdue");
      if (pending) notes.push(pending + " not requested");
      if (!notes.length && attested) notes.push(attested + " attested, not read");
      var pState = held.length === src.length ? "done" : (removed || overdue || pending || src.some(function (x) { return x.exception && x.exception.status === "Open"; })) ? "action" : "progress";
      out.preservation = { state: pState, text: held.length + " of " + src.length + " on hold", detail: notes.join(" · ") };
    }
    /* Collection: expected only where the case says so. */
    out.collection = c.collection ? { state: "done", text: c.collection.text, detail: c.collection.detail } : { state: "dash", text: "—" };

    var states = [out.lhn, out.survey, out.interview, out.preservation, out.collection].map(function (x) { return x.state; });
    out.bucket = states.indexOf("action") !== -1 ? "action" : states.indexOf("progress") !== -1 ? "progress" : "fully";
    return out;
  };
  /** Sources on the case that are not preserved (custodial and non-custodial). */
  M.dataGaps = function () {
    var ellisExempt = {};
    M.custodians.forEach(function (c) { if (c.notRequired && c.notRequired.preservation) ellisExempt[c.personId] = true; });
    return M.sources.filter(function (s) {
      if (s.nonCustodial) return false;
      if (s.owner && ellisExempt[s.owner]) return false;
      return !(s.hold === "Applied" || s.hold === "Attested");
    });
  };

  M.fmtDate = function (iso) {
    /* House date format: mm-dd-yyyy (casefusion-date-format). */
    var p = iso.split("-");
    return p[1] + "-" + p[2] + "-" + p[0];
  };
  /* A time beside a date is 12-hour, joined by "at": 10-03-2026 at 11:20 AM (casefusion-date-format). */
  M.fmtTime = function (hhmm) { var t = hhmm.split(":"), h = parseInt(t[0], 10); return ((h % 12) || 12) + ":" + t[1] + " " + (h < 12 ? "AM" : "PM"); };
  M.fmtDateTime = function (iso, hhmm) { return M.fmtDate(iso) + (hhmm ? " at " + M.fmtTime(hhmm) : ""); };
  /* Relative day for recent activity: Today / Yesterday against the demo clock, otherwise the house date (mm-dd-yyyy),
     always joined to a 12-hour time by "at" (Scott, 10-14). */
  M.fmtWhen = function (iso, hhmm) {
    var d = new Date(M.DEMO_TODAY + "T00:00:00"); d.setDate(d.getDate() - 1);
    var y = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var day = iso === M.DEMO_TODAY ? "Today" : iso === y ? "Yesterday" : M.fmtDate(iso);
    return day + (hhmm ? " at " + M.fmtTime(hhmm) : "");
  };
  M.daysBetween = function (a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  };
  M.ageFromToday = function (iso) { return M.daysBetween(iso, M.DEMO_TODAY); };

  window.MERIDIAN = M;
}());
