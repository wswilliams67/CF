/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-identities.data.js
 * Screen:  Admin › Natural Persons › Identities
 * Figma:   CaseFusion v1.5 — Tenant Manager, section 12457:6785 (#17475)
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THIS IS THE ONLY FILE THAT HOLDS DATA.                              │
 * │  Deleting the mock block below and re-pointing each method at the    │
 * │  real endpoint is the ENTIRE backend hookup. No other file on this   │
 * │  screen knows where a record comes from.                             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHY THE SEAM IS HERE
 * ────────────────────
 * Same contract as the Pending Match Queue (#17515): the CALLER states what it
 * wants — tab, page, size, search, filters, sort — and the SERVICE returns one
 * page plus the TOTAL behind it. The controller never filters, never sorts and
 * never slices, because it is only ever handed the page it asked for.
 *
 * This screen is READ-ONLY throughout. Nothing here writes. Merge navigates to
 * #17474, candidate adjudication happens in #17515's pair review, and the audit
 * log is immutable by FR-95 — so there is no recordDecision() equivalent and
 * there should never be one.
 *
 * Every method returns a PROMISE, including the ones the mock could answer
 * synchronously: a method that is sync today and async tomorrow changes every
 * call site.
 *
 * ANGULAR: NaturalPersonService. Each method becomes an Observable; the tabs
 * are three independent queries against one person, so they can load lazily as
 * each tab is first opened rather than all at once on route entry.
 *
 * SECTIONS
 *   0 · TRANSPORT        the promise + latency wrapper
 *   1 · TYPES            the shapes the API must return
 *   2 · MOCK RECORDS     NOT PRODUCTION — delete this block
 *   3 · QUERYING         filter / sort / page, as the server would
 *   4 · SERVICE          the contract the screen is written against
 * ==========================================================================*/

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════════
     0 · TRANSPORT
     ═══════════════════════════════════════════════════════════════════════ */

  /*
   * Deliberately slower than the controller's 250ms skeleton delay, so the
   * loading path is exercised every time rather than only on a slow network.
   * Set to 0 to feel the screen at full speed.
   */
  var LATENCY_MS = 650;

  function resolve(value) {
    return new Promise(function (done) {
      setTimeout(function () { done(value); }, LATENCY_MS);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1 · TYPES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @typedef {Object} Person
   * @property {string} id
   * @property {string} name          "Byrne, Jennifer" — sort order, as stored
   * @property {string} email
   * @property {string} jobTitle
   * @property {number} identityCount TOTAL records, never the filtered count
   * @property {number} sourceCount   TOTAL distinct sources
   *
   * `identityCount` and `sourceCount` are ALWAYS the unfiltered totals for the
   * person. They answer "how big is this person", which must not move when the
   * operator searches inside a tab — same rule as the queue's stat tiles.
   */

  /**
   * @typedef {Object} IdentityRecord
   * @property {string}  id
   * @property {string}  key            the source's own identifier for the person
   * @property {string}  source         "AD" | "HRIS" | …
   * @property {string}  effective      mm-dd-yyyy, the date the source asserts
   * @property {"Linked"|"Established"|"Inherited"|"Association withdrawn"|"Reassigned on rebuild"} status
   * @property {"success"|"caution"|"default"|"muted"} tone
   * @property {string}  assertedLabel  "Asserted:" | "Withdrawn:" | "Reassigned:"
   * @property {string}  asserted       mm-dd-yyyy, OR the literal "not recorded"
   * @property {string}  reason         why the association exists
   * @property {boolean} [reasonVerbatim] true when `reason` is the SOURCE's own
   *                                      string and must be quoted, not reworded
   * @property {string[]} matchedOn     ALWAYS present — see below
   *
   * THREE PROPERTIES CARRY THE AUDIT and the API must not soften any of them:
   *
   * `assertedLabel` VARIES WITH THE STATUS. It names the event the date belongs
   * to, so an association that ended reads "Withdrawn:" or "Reassigned:". A
   * fixed "Asserted:" would date the wrong event.
   *
   * `asserted` may be the literal string "not recorded" rather than a date,
   * where the ledger never captured one. Send that string; do not send null and
   * do not substitute a date.
   *
   * `matchedOn` is ALWAYS PRESENT and never empty. Where no rule produced the
   * join, it states that in words — ["Not recorded — linked by hand, no rule
   * applied"] or ["—"]. An earlier draft omitted the field instead; an omitted
   * line and an empty one look identical to the operator and mean different
   * things to the audit, so the design states the absence rather than dropping
   * the line.
   *
   * `reasonVerbatim` carries the rule the annotations state as
   * "quoted = verbatim from source; unquoted = composed here". A verbatim
   * reason keeps the source's own wording, abbreviations included, and the
   * quote marks are what tell the reader it was not written by this client.
   */

  /**
   * @typedef {Object} Candidate
   * @property {string}   id
   * @property {string}   name
   * @property {number}   identityCount  how many identities the OTHER person has
   * @property {string[]} sources        that person's source systems
   * @property {"needs-corroboration"|"near-match-refused"} tier
   * @property {string}   tierLabel
   * @property {"caution"|"muted"} tone
   * @property {string}   flagged        mm-dd-yyyy
   * @property {string}   why            the matcher's plain-language reason
   * @property {string[]} matchedOn
   * @property {number}   strength       sort key; higher is stronger
   *
   * A CANDIDATE is a person or identity flagged as possibly the same human as
   * the subject (Scott, 08-28-2026). It is not a synonym for "pending match":
   * the candidate is the flagged party, the pending match is the PAIR of them
   * awaiting a decision. The tab counts pending matches; its rows are
   * candidates. This endpoint returns candidates and records no decision —
   * deciding a pair is #17515.
   *
   * TWO TIERS ONLY, and the omission is deliberate: a pair that matched on two
   * or more keys, or on the UPN, resolves on its own and never reaches this
   * endpoint. It appears in History as a Linked event instead. Do not add an
   * "auto merge" tier here to make the list look complete.
   *
   * Column 1 shows the other person's SIZE (identityCount + sources), not an
   * email address: an operator deciding whether two records are one human needs
   * to know how much evidence sits behind the other one.
   */

  /**
   * @typedef {Object} HistoryEvent
   * @property {string} id
   * @property {"event"|"fact"} kind
   * @property {string} at            mm-dd-yyyy
   * @property {string} [time]        "10:05" — events only; facts have no time
   * @property {string} [meridiem]    "AM" | "PM" — events only
   * @property {string} title         the verdict ("Merged", "Linked") or the
   *                                  fact name ("Job title changed")
   *
   * Ledger events (kind: "event"):
   * @property {string} [subject]     what the decision was about
   * @property {string} [detail]      what was decided
   * @property {string} [decidedBy]   "Human (Scott Williams)" | "System (auto-merge)"
   * @property {string} [subjectNow]  where the subject went, if it has moved
   *
   * Employment facts (kind: "fact"):
   * @property {string} [source]      the system that delivered the value
   * @property {string} [record]      that system's identifier
   * @property {string} [from]
   * @property {string} [to]
   * @property {string} [recorded]    when the SOURCE told us — which can be
   *                                  later than `at`, when it took effect
   *
   * ONE STREAM, TWO ROW TYPES. Events are ledger decisions somebody or
   * something recorded; facts are values a source delivered and carry no
   * decision, which is why they have no decider. They interleave by date
   * because the question an auditor asks is "what happened to this person, in
   * order" — splitting them into two lists answers a question nobody asked.
   *
   * `time` and `meridiem` are stored APART from `at` because the row renders
   * them as a stacked date/time stamp, not as one string.
   *
   * READ-ONLY AND IMMUTABLE (FR-95). No row is ever removed or edited: a
   * retraction is its OWN event rather than a deletion of the entry it
   * reverses, so the sequence of what was believed, and when, stays intact.
   * Every person has at least a creation event, so this list is never empty.
   */

  /**
   * @typedef {Object} ListQuery
   * @property {number} page
   * @property {number} pageSize
   * @property {string} search
   * @property {string} [show]    the tab's filter selection
   * @property {string} [sort]
   * @property {"asc"|"desc"} [dir]
   */

  /* ═══════════════════════════════════════════════════════════════════════
     2 · MOCK RECORDS — NOT PRODUCTION

     Everything below this banner is stand-in data. Delete it and point the
     service at the real endpoints; nothing above or below depends on how it
     was built.
     ═══════════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════════
     2b · THE PERSON DIRECTORY — how this screen is reached

     The Natural Persons list links each card's IDENTITIES button to
     `…-identities.html?personId=np-1001`, so this screen is ALWAYS about one
     person and the id says which. Honouring it is what makes list → identities
     a real flow rather than two screens that happen to share a look.

     These 14 mirror the list's own `DEMO_PERSONS` — same ids, same names — so
     a click carries through. They are duplicated rather than imported because
     the two screens stand in for two ENDPOINTS: when this becomes an API,
     `GET /natural-persons/{id}` answers here and nothing is shared but the id.

     A person the directory does not know, or no id at all, falls back to the
     Byrne fixture below — the one the Figma frames draw. That keeps the
     designed screen reproducible from a bare URL.
     ═══════════════════════════════════════════════════════════════════════ */

  var DIRECTORY = [
    { id: "np-1001", name: "Frances Lindqvist", first: "Frances", last: "Lindqvist",
      employeeId: "EMP-004182", location: "Stockholm, SE", email: "frances.lindqvist@northwind.example", phone: "+46 8 555 0142" },
    { id: "np-1002", name: "Albert Von Hohenstein-Zimmermannberg-Featherstahlscheidt", first: "Albert", last: "Von Hohenstein-Zimmermannberg-Featherstahlscheidt",
      employeeId: "EMP-004183", location: "Munich, DE", email: "albert.vonhohenstein@northwind.example", phone: "+49 89 555 0117" },
    { id: "np-1003", name: "Priya Raghunathan", first: "Priya", last: "Raghunathan",
      employeeId: "EMP-004190", location: "Bengaluru, IN", email: "priya.raghunathan@northwind.example", phone: "+91 80 5550 1442" },
    { id: "np-1004", name: "Marcus Webb", first: "Marcus", last: "Webb",
      employeeId: "EMP-004201", location: "Austin, TX, US", email: "marcus.webb@northwind.example", phone: "+1 512 555 0166" },
    { id: "np-1005", name: "Aoife N\u00ed Bhraon\u00e1in", first: "Aoife", last: "N\u00ed Bhraon\u00e1in",
      employeeId: "EMP-004212", location: "Dublin, IE", email: "aoife.nibhraonain@northwind.example", phone: "+353 1 555 0129" },
    { id: "np-1006", name: "Tobias Andersen", first: "Tobias", last: "Andersen",
      employeeId: "EMP-004219", location: "Oslo, NO", email: "tobias.andersen@northwind.example", phone: "+47 21 555 0108" },
    { id: "np-1007", name: "Chen Wei", first: "Chen", last: "Wei",
      employeeId: "EMP-004228", location: "Singapore, SG", email: "chen.wei@northwind.example", phone: "+65 6555 0183" },
    { id: "np-1008", name: "Isabela Moreira", first: "Isabela", last: "Moreira",
      employeeId: "EMP-004235", location: "S\u00e3o Paulo, BR", email: "isabela.moreira@northwind.example", phone: "+55 11 5555 0121" },
    { id: "np-1009", name: "Jennifer Liu", first: "Jennifer", last: "Liu",
      employeeId: "EMP-004241", location: "Vancouver, BC, CA", email: "jennifer.liu@northwind.example", phone: "+1 604 555 0193" },
    { id: "np-1010", name: "Ahmed El-Sayed", first: "Ahmed", last: "El-Sayed",
      employeeId: "EMP-004250", location: "Cairo, EG", email: "ahmed.elsayed@northwind.example", phone: "+20 2 5550 0147" },
    { id: "np-1011", name: "Greta Lindholm", first: "Greta", last: "Lindholm",
      employeeId: "EMP-004262", location: "Helsinki, FI", email: "greta.lindholm@northwind.example", phone: "+358 9 555 0155" },
    { id: "np-1012", name: "Samuel Okonkwo", first: "Samuel", last: "Okonkwo",
      employeeId: "EMP-004270", location: "Lagos, NG", email: "samuel.okonkwo@northwind.example", phone: "+234 1 555 0178" },
    { id: "np-1013", name: "Hannah Brightwater", first: "Hannah", last: "Brightwater",
      employeeId: "EMP-004281", location: "Manchester, UK", email: "hannah.brightwater@northwind.example", phone: "+44 161 555 0164" },
    { id: "np-1014", name: "Diego Ram\u00edrez", first: "Diego", last: "Ram\u00edrez",
      employeeId: "EMP-004293", location: "Madrid, ES", email: "diego.ramirez@northwind.example", phone: "+34 91 555 0136" }
  ];

  var PERSON = {
    id: "np-1042",
    name: "Byrne, Jennifer",
    email: "j.byrne@acme.com",
    jobTitle: "Claims Analyst",
    identityCount: 4,
    sourceCount: 2
  };

  /*
   * Ordered by SOURCE in payload order — AD first, then HRIS — and newest
   * first within each source. The screen mirrors the payload rather than
   * re-sorting it, so what the operator sees matches what the developer and
   * the backend both see.
   */
  /*
   * IDENTITY RECORDS — one per source record attached to this person.
   *
   * ORDER IS THE PAYLOAD'S, and the payload's order is by source: AD first,
   * then HRIS. The screen mirrors it rather than re-sorting, so what the
   * operator sees matches what the developer and the backend both see. The
   * "Source" sort option restores this order after the operator has changed it.
   *
   * FOUR FIELDS CARRY THE AUDIT and none of them may be invented:
   *
   *   status         does the association still hold — the vocabulary is
   *                  closed: Linked · Established · Inherited ·
   *                  Association withdrawn · Reassigned on rebuild
   *   assertedLabel  VARIES WITH THE STATUS. "Asserted:" for a live
   *                  association, "Withdrawn:" and "Reassigned:" for the two
   *                  that ended. The label names the event the date belongs
   *                  to, so a fixed "Asserted:" would date the wrong thing.
   *   asserted       the date — or the literal string "not recorded" where
   *                  the ledger never captured one (inherited associations).
   *   matchedOn      ALWAYS PRESENT, never omitted. Where no rule applied,
   *                  it says so in words ("Not recorded — linked by hand, no
   *                  rule applied") or with an em dash. An absent line and an
   *                  empty one read identically to the operator and mean
   *                  different things to the audit, so the design states the
   *                  absence rather than dropping the row.
   *
   * A `reason` that came from the source system is flagged `reasonVerbatim`
   * and rendered IN QUOTES, reproduced unaltered. Unquoted means composed for
   * the screen and following house conventions.
   */
  var RECORDS = [
    { id: "ir-44201", key: "jennifer.byrne", source: "AD", effective: "09-02-2024",
      status: "Linked", tone: "success",
      assertedLabel: "Asserted:", asserted: "09-02-2024",
      reason: "2 corroborating keys", reasonVerbatim: true,
      matchedOn: ["Full name + email address", "Employee ID"] },

    { id: "ir-44205", key: "j.byrne", source: "AD", effective: "08-11-2026",
      status: "Linked", tone: "success",
      assertedLabel: "Asserted:", asserted: "08-11-2026",
      reason: "Accepted on UPN", reasonVerbatim: true,
      matchedOn: ["UPN"] },

    /* The founding record. "Created this person" is the only reason that is
       not a join — nothing preceded it. */
    { id: "ir-44120", key: "44120", source: "HRIS", effective: "08-19-2024",
      status: "Established", tone: "success",
      assertedLabel: "Asserted:", asserted: "08-19-2024",
      reason: "Created this person", reasonVerbatim: true,
      matchedOn: ["No keys matched on an existing person."] },

    { id: "ir-44192", key: "44192", source: "HRIS", effective: "05-14-2026",
      status: "Linked", tone: "success",
      assertedLabel: "Asserted:", asserted: "05-14-2026",
      reason: "2 corroborating keys", reasonVerbatim: true,
      matchedOn: ["Full name + email address", "Full name + phone number"] }
  ];

  /*
   * THE IDENTITY DETAIL PANEL — what DETAILS opens on the Identities tab.
   *
   * ORIGINAL VALUES ARE THE SOURCE'S, NOT THE PERSON'S. That is the whole
   * point of the section: it shows the record exactly as AD or HRIS delivered
   * it, before any merging. So `givenName` here is "Jill" while the person
   * displays as "Byrne, Jennifer" — the mismatch is data, not a typo, and it
   * is often the reason an operator opened the panel.
   *
   * An absent value is an em dash, never a blank row and never omitted: which
   * fields a source did NOT populate is itself evidence.
   *
   * `keys` carries the key TYPES only. Matched values are stored as hashes and
   * can never be displayed — the note at the foot of the panel says so, and it
   * is not optional copy.
   */
  var DETAIL = {
    "ir-44192": {
      original: [
        /* "Jill" disagrees with the person's display name, and the frame paints
           it Text/Danger. That is the panel earning its keep: the mismatch
           between what a source holds and what the person shows is usually the
           reason someone opened it. `tone` carries it — never infer the
           highlight by comparing strings in the view. */
        { label: "Given name", value: "Jill", tone: "danger" },
        { label: "Surname", value: "Byrne" },
        { label: "Display name", value: "Byrne, Jennifer" },
        { label: "Email", value: "j.byrne@acme.com" },
        /* Absent, and muted rather than dropped — which fields a source did
           NOT populate is evidence. */
        { label: "UPN", value: "—", tone: "muted" },
        /* Also disagrees with the person — two flagged fields, not one. */
        { label: "Phone", value: "+1 847 555 0912", tone: "danger" },
        { label: "Job title", value: "Claims Analyst" },
        { label: "Department", value: "Complex Claims" },
        { label: "Manager", value: "Hawkins, Guy" },
        { label: "Location", value: "Remote — Illinois" },
        { label: "Country", value: "United States" },
        { label: "Account status", value: "Active" },
        { label: "Employee ID", value: "44192" }
      ],
      keys: null      /* derived — see keyVerdicts() */
    },
    "ir-44201": {
      original: [
        { label: "Given name", value: "Jennifer" },
        { label: "Surname", value: "Byrne" },
        { label: "Display name", value: "Jennifer Byrne" },
        { label: "Email", value: "jennifer.byrne@acme.com" },
        { label: "UPN", value: "jennifer.byrne@acme.com" },
        /* Also disagrees with the person — two flagged fields, not one. */
        { label: "Phone", value: "+1 847 555 0912", tone: "danger" },
        { label: "Job title", value: "Claims Analyst" },
        { label: "Department", value: "Complex Claims" },
        { label: "Manager", value: "Hawkins, Guy" },
        { label: "Location", value: "Chicago, Illinois" },
        { label: "Country", value: "United States" },
        { label: "Account status", value: "Active" },
        { label: "Employee ID", value: "—", tone: "muted" }
      ],
      keys: null      /* derived — see keyVerdicts() */
    },
    "ir-44205": {
      original: [
        { label: "Given name", value: "J." },
        { label: "Surname", value: "Byrne" },
        { label: "Display name", value: "J. Byrne" },
        { label: "Email", value: "j.byrne@acme.com" },
        { label: "UPN", value: "j.byrne@acme.com" },
        { label: "Phone", value: "—", tone: "muted" },
        { label: "Job title", value: "Claims Analyst" },
        { label: "Department", value: "—", tone: "muted" },
        { label: "Manager", value: "—", tone: "muted" },
        { label: "Location", value: "—", tone: "muted" },
        { label: "Country", value: "United States" },
        { label: "Account status", value: "Active" },
        { label: "Employee ID", value: "—", tone: "muted" }
      ],
      keys: null      /* derived — see keyVerdicts() */
    },
    "ir-44120": {
      original: [
        { label: "Given name", value: "Jennifer" },
        { label: "Surname", value: "Byrne" },
        { label: "Display name", value: "Byrne, Jennifer" },
        { label: "Email", value: "j.byrne@acme.com" },
        { label: "UPN", value: "—", tone: "muted" },
        { label: "Phone", value: "+1 847 555 0912" },
        { label: "Job title", value: "Claims Adjuster" },
        { label: "Department", value: "Claims Operations" },
        { label: "Manager", value: "Howard, Esther" },
        { label: "Location", value: "Springfield, Illinois" },
        { label: "Country", value: "United States" },
        { label: "Account status", value: "Active" },
        { label: "Employee ID", value: "44120" }
      ],
      keys: null      /* derived — see keyVerdicts() */
    }
  };

  /*
   * EDGE-STATE OVERLAYS — screens A2 to A5.
   *
   * Held apart from RECORDS so the default screen matches frame A exactly.
   * The state switcher at the foot of §4 swaps them in; nothing in the
   * controller knows they exist.
   */

  /* A2 — associations that predate the assertion ledger. The join is real;
     the explanation was never written down. `asserted` is the literal string
     "not recorded", NOT a blank and NOT a placeholder date. */
  var RECORDS_INHERITED = [
    { id: "ir-44201", key: "jennifer.byrne", source: "AD", effective: "09-02-2024",
      status: "Inherited", tone: "default",
      assertedLabel: "Asserted:", asserted: "not recorded",
      reason: "Association predates the ledger — basis not recorded",
      matchedOn: ["—"] },
    RECORDS[1],
    { id: "ir-44120", key: "44120", source: "HRIS", effective: "08-19-2024",
      status: "Inherited", tone: "default",
      assertedLabel: "Asserted:", asserted: "not recorded",
      reason: "Association predates the ledger — basis not recorded",
      matchedOn: ["—"] },
    RECORDS[3]
  ];

  /* A2's banner. Rendered as Nimbus/Alert type=info above the toolbar — the
     rows alone cannot explain why two of them have no basis. */
  var INHERITED_NOTICE =
    "Two of these associations predate the assertion ledger. They were carried forward from " +
    "legacy mapping tables, so nothing records why each one matched — the person identifier is " +
    "the whole claim. The identities themselves are complete; their field values are shown in " +
    "full under Details.";

  /* A3 — two associations that ended. Both keep their matched keys: the join
     was real while it lasted, and the audit needs to show on what. */
  var RECORDS_ENDED = [
    { id: "ir-51877", key: "51877", source: "HRIS", effective: "09-03-2025",
      status: "Association withdrawn", tone: "caution",
      assertedLabel: "Withdrawn:", asserted: "07-20-2026",
      reason: "Withdrawn by Human (Scott Williams) — linked in error",
      matchedOn: ["Full name + phone number"] },
    { id: "ir-44207", key: "44207", source: "HRIS", effective: "03-18-2026",
      status: "Reassigned on rebuild", tone: "caution",
      assertedLabel: "Reassigned:", asserted: "06-11-2026",
      reason: "Re-pointed to Nakamura, Erin on the next rebuild",
      matchedOn: ["Employee ID"] }
  ];

  /* A4 — a human made the join, so a rule never ran. The row says that in
     words rather than leaving the line off. */
  var RECORD_BY_HAND = {
    id: "ir-44207h", key: "44207", source: "HRIS", effective: "03-18-2026",
    status: "Linked", tone: "success",
    assertedLabel: "Asserted:", asserted: "03-18-2026",
    reason: "Manual review — same person confirmed by HR", reasonVerbatim: true,
    matchedOn: ["Not recorded — linked by hand, no rule applied"]
  };

  /* A5 — a person built from a single identity. */
  var RECORDS_SINGLE = [
    { id: "ir-51204", key: "51204", source: "HRIS", effective: "04-02-2026",
      status: "Established", tone: "success",
      assertedLabel: "Asserted:", asserted: "04-02-2026",
      reason: "Created this person", reasonVerbatim: true,
      matchedOn: ["No keys matched on an existing person."] }
  ];

  /*
   * PENDING MATCHES — other natural persons who may be the same human.
   *
   * TWO TIERS ONLY, and the omission is the design:
   *
   *   Needs corroboration   one key matched; a human has to look
   *   Near match, refused   close, but the merge policy declined it
   *
   * There is NO auto-merge tier here. A pair that matched on two or more keys,
   * or on the UPN, resolves on its own and never reaches this tab — it appears
   * under History as a Linked event. The note above the list says exactly that,
   * which is what stops an empty-looking tier from reading as a missing one.
   *
   * `strength` orders the tiers (2 above 1); `flagged` orders within a tier.
   */
  /* The fixture person's comparison rows, matching the queue's vocabulary. */
  /* The person cards carry provenance and hold state — the frame shows
     "Created … by refused merge" / "First seen …" and a Nimbus/Badge for holds.
     A hold is shown on either side; "No holds" is stated rather than left
     blank, because absence of a badge cannot distinguish "checked, none" from
     "not checked". */
  /**
   * The matcher's NAMED REASON for refusing a pair — the quoted line at the
   * top of the pair review panel.
   *
   * It is not the tier label. The tier says what the evidence EARNED
   * ("Needs corroboration"); the reason says what the matcher FOUND
   * ("2 corroborating keys"). The frame shows both, one quoted above the keys
   * and one beside each key, and rendering the tier in both places made the
   * panel state the same fact twice while omitting the one the operator came
   * for.
   *
   * Derived from the evidence rather than stored, and derived by exactly the
   * rule the Pending Match Queue's fixture uses, so a pair carries the same
   * reason on both screens.
   *
   * @param {{matchedOn:string[], tier:string}} c
   * @returns {string}
   */
  /* ANGULAR: this derivation moves SERVER-SIDE. The reason is the matcher's
     own account of why it refused, so the API should return it rather than the
     client inferring it from the key shape — this function exists only so the
     demo agrees with #17515 without the two fixtures being wired together. */
  function reasonFor(c) {
    if (c.tier === "near-match-refused") return "cohort match, no corroboration";
    return (c.matchedOn[0] || "").indexOf(" + ") !== -1
      ? "2 corroborating keys"
      : "shared address, single key";
  }

  /**
   * The HANDOFF a "Review in the queue" link carries.
   *
   * A pending match is a PAIR, and the pair is adjudicated on #17515 — so the
   * link has to name the pair, not just the queue. It carries the two display
   * names rather than an internal row id because the two screens are backed by
   * different tables today and will be backed by different endpoints tomorrow:
   * the names are the business key both sides already agree on, and the id is
   * only meaningful inside whichever fixture minted it.
   *
   * `pair` goes along as a courtesy — when the queue happens to hold a row
   * with that id it is an exact hit and no name matching is needed.
   *
   * @param {string} established  this screen's subject, "Surname, Given"
   * @param {string} candidate    the flagged person, same form
   * @returns {{est:string, cand:string}}
   */
  function pairHint(established, candidate) {
    return { est: established, cand: candidate };
  }

  function fixtureCards(c) {
    return {
      candidate: { created: "Created " + c.flagged + " by refused merge", hold: null },
      person: { created: "First seen 06-01-2024",
                hold: "On Legal Hold Since 03-03-2026  ·  Acme v. Byrne" }
    };
  }

  /**
   * THE FIVE FIELDS THE FRAME COMPARES — Surname, Given name, Email, Job title,
   * Source, in that order.
   *
   * Surname and given name are compared SEPARATELY rather than as one display
   * name: a nickname changes the given name while the surname holds, and a
   * marriage does the reverse. Collapsed into one row the two cases look
   * identical, and they are not equally good evidence.
   *
   * `Source` carries its own verdict, "Expected" — two records from different
   * systems are supposed to differ there, so it must never read as evidence
   * against the pair.
   */
  function fixtureComparison(c) {
    var given = (c.name.split(",")[1] || "").trim() || "\u2014";
    var surname = (c.name.split(",")[0] || "").trim();
    var theirEmail = "j.byrne@" + (c.sources[0] === "AD" ? "acme.com" : "acme-hr.example");
    return [
      { field: "Surname", candidate: surname, person: "Byrne",
        agree: surname === "Byrne" ? "Matches" : "Differs" },
      { field: "Given name", candidate: given, person: "Jennifer",
        agree: given === "Jennifer" ? "Matches" : "Differs" },
      { field: "Email", candidate: theirEmail, person: "j.byrne@acme.com",
        agree: theirEmail === "j.byrne@acme.com" ? "Matches" : "Differs" },
      { field: "Job title", candidate: "\u2014", person: "Claims Analyst", agree: "One Side" },
      { field: "Source", candidate: c.sources[0], person: "AD",
        agree: c.sources[0] === "AD" ? "Matches" : "Expected" }
    ];
  }

  var CANDIDATES = [
    { id: "np-2201", name: "Byrne, Jennifer M.", identityCount: 2, sources: ["AD", "HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-12-2026", why: "Middle initial does not match, same work location",
      matchedOn: ["Full name + phone number"] },
    { id: "np-2202", name: "Byrne-Adams, Jennifer", identityCount: 1, sources: ["HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-11-2026", why: "Hyphenated surname after a recorded name change",
      matchedOn: ["Full name + email address"] },
    { id: "np-2203", name: "Byrne, Jenny", identityCount: 1, sources: ["HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-10-2026", why: "Nickname does not match an existing person",
      matchedOn: ["Full name + email address"] },
    { id: "np-2204", name: "Byrne, J.", identityCount: 2, sources: ["AD"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-09-2026", why: "Initial-form name with matching department",
      matchedOn: ["Full name + phone number"] },
    { id: "np-2205", name: "Byrne, Jennifer", identityCount: 1, sources: ["AD"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-06-2026", why: "Same display name on a different domain",
      matchedOn: ["Full name"] },
    { id: "np-2206", name: "Byrne, Jennifer L.", identityCount: 2, sources: ["HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-03-2026", why: "Middle initial conflicts with existing person",
      matchedOn: ["Full name + email address"] },
    { id: "np-2207", name: "Burns, Jennifer", identityCount: 1, sources: ["HRIS"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "08-08-2026", why: "Surname differs by one character",
      matchedOn: ["Full name + email address"] },
    { id: "np-2208", name: "Byrnes, Jennifer", identityCount: 1, sources: ["HRIS"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "08-05-2026", why: "Surname does not match, plural form",
      matchedOn: ["Full name + phone number"] },
    { id: "np-2209", name: "J Byrne", identityCount: 1, sources: ["AD"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "08-04-2026", why: "Sparse source record, generic name form",
      matchedOn: ["Full name"] },
    { id: "np-2210", name: "Jen Byrne", identityCount: 1, sources: ["AD"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "08-01-2026", why: "Short-form given name, no corroborating key",
      matchedOn: ["Full name"] },

    /* Page 2. The design draws "1-10 of 12", so two rows exist beyond the
       first page; their content is not drawn and is composed here to the same
       grammar. Replace wholesale when the endpoint lands. */
    { id: "np-2211", name: "Byrne, Jennie", identityCount: 1, sources: ["HRIS"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "07-29-2026", why: "Given name does not match, spelling",
      matchedOn: ["Full name"] },
    { id: "np-2212", name: "Byrne, Jenifer", identityCount: 1, sources: ["AD"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "07-22-2026", why: "Given name does not match, single character",
      matchedOn: ["Full name"] }
  ];

  /*
   * HISTORY — one chronological stream, TWO row types, newest first.
   *
   *   kind: "event"  a ledger decision somebody or something recorded.
   *                  Subject / Detail / Decided by, and — only where the
   *                  subject has since moved — Subject now.
   *   kind: "fact"   a value a source delivered. From / To / Recorded, and no
   *                  decider, because nobody decided it.
   *
   * They interleave by date deliberately: an operator asking "what happened to
   * this person" does not care which of the two a given change was.
   *
   * `at` is mm-dd-yyyy and `time` is h:mm plus a separate meridiem — the row's
   * date stamp renders them as three and two stacked lines, so they are stored
   * apart rather than parsed out of one string. Facts carry no time: their
   * stamp is the date alone, centred in the same 84px box.
   */
  var HISTORY = [
    { id: "ev-9012", kind: "event", at: "08-12-2026", time: "10:05", meridiem: "AM",
      title: "Merged",
      subject: "Powell, Marcus (person)",
      detail: "Merged into this person",
      decidedBy: "Human (Scott Williams)",
      subjectNow: "No longer a separate person" },

    { id: "ev-9011", kind: "event", at: "08-11-2026", time: "2:22", meridiem: "PM",
      title: "Linked",
      subject: "j.byrne (AD)",
      detail: "Accepted on UPN",
      decidedBy: "System (auto-merge)" },

    { id: "ev-9010", kind: "event", at: "08-11-2026", time: "9:41", meridiem: "AM",
      title: "Near match, refused",
      subject: "Burns, Jennifer (person)",
      detail: "Refused by the merge policy — both people stand",
      decidedBy: "System (merge policy)" },

    { id: "ev-9009", kind: "event", at: "07-20-2026", time: "4:03", meridiem: "PM",
      title: "Association withdrawn",
      subject: "51877 (HRIS)",
      detail: "Withdrawn from this person",
      decidedBy: "Human (Scott Williams)",
      subjectNow: "Linked to Nakamura, Erin on 06-11-2026" },

    { id: "ev-9008", kind: "fact", at: "06-15-2026",
      title: "Job title changed", source: "HRIS", record: "44192",
      from: "Claims Analyst I", to: "Claims Analyst", recorded: "06-18-2026" },

    { id: "ev-9007", kind: "event", at: "05-14-2026", time: "8:12", meridiem: "AM",
      title: "Linked",
      subject: "44192 (HRIS)",
      detail: "Accepted on 2 corroborating keys",
      decidedBy: "System (auto-merge)" },

    { id: "ev-9006", kind: "fact", at: "05-14-2026",
      title: "Employment status changed", source: "HRIS", record: "44192",
      from: "Contractor", to: "Full-time employee", recorded: "05-14-2026" },

    { id: "ev-9005", kind: "fact", at: "03-02-2026",
      title: "Manager changed", source: "HRIS", record: "44192",
      from: "Howard, Esther", to: "Hawkins, Guy", recorded: "03-05-2026" },

    { id: "ev-9004", kind: "fact", at: "01-08-2026",
      title: "Work location changed", source: "HRIS", record: "44192",
      from: "Chicago, Illinois", to: "Remote — Illinois", recorded: "01-08-2026" },

    { id: "ev-9003", kind: "fact", at: "11-04-2025",
      title: "Department changed", source: "HRIS", record: "44120",
      from: "Claims Operations", to: "Complex Claims", recorded: "11-10-2025" },

    /* Page 2. The design draws "1-10 of 14"; these four are not drawn and are
       composed to the same grammar. The oldest is the creation event — every
       person has one, which is why a History empty state cannot occur. */
    { id: "ev-9002", kind: "fact", at: "06-02-2025",
      title: "Work location changed", source: "HRIS", record: "44120",
      from: "Springfield, Illinois", to: "Chicago, Illinois", recorded: "06-04-2025" },

    { id: "ev-9001", kind: "event", at: "09-02-2024", time: "11:52", meridiem: "AM",
      title: "Linked",
      subject: "jennifer.byrne (AD)",
      detail: "Accepted on 2 corroborating keys",
      decidedBy: "System (auto-merge)" },

    { id: "ev-9000", kind: "fact", at: "08-19-2024",
      title: "Job title changed", source: "HRIS", record: "44120",
      from: "Claims Adjuster", to: "Claims Analyst I", recorded: "08-22-2024" },

    { id: "ev-8999", kind: "event", at: "08-19-2024", time: "7:30", meridiem: "AM",
      title: "Established",
      subject: "44120 (HRIS)",
      detail: "Created this person — no keys matched on an existing person",
      decidedBy: "System (ingestion)" }
  ];

  /* ═══════════════════════════════════════════════════════════════════════
     3 · QUERYING — what the server would do

     The controller must never do any of this. It exists here so the mock
     behaves like the endpoint it stands in for, and so the shape of the
     query is visible to whoever writes that endpoint.
     ═══════════════════════════════════════════════════════════════════════ */

  /*
   * Everything a row displays is searchable, and NOTHING it does not.
   *
   * The three row shapes are folded into one list rather than branched on,
   * because a search box that quietly ignores a column the operator can see is
   * worse than one that is slow. Add a displayed field here whenever you add
   * one to a row.
   */
  function textOf(row) {
    return [
      /* identity record */ row.key, row.source, row.status, row.assertedLabel,
                            row.asserted, row.reason, row.effective,
      /* pending match  */ row.name, row.tierLabel, row.why, row.flagged,
      /* history        */ row.title, row.subject, row.detail, row.decidedBy,
                            row.subjectNow, row.from, row.to, row.recorded,
                            row.record, row.at
    ]
      .concat(row.matchedOn || [], row.sources || [])
      .filter(Boolean).join(" ").toLowerCase();
  }

  function matchesSearch(row, q) {
    if (!q) return true;
    return textOf(row).indexOf(q.toLowerCase()) !== -1;
  }

  /* mm-dd-yyyy → sortable. The wire format should be an ISO instant; this
     exists only because the mock stores what the screen displays. */
  function dateKey(mdy) {
    if (!mdy) return 0;
    var p = mdy.split("-");
    return p.length === 3 ? Number(p[2] + p[0] + p[1]) : 0;
  }

  function page(rows, query) {
    var size = query.pageSize || 10;
    var total = rows.length;
    var pageCount = Math.max(1, Math.ceil(total / size));
    var n = Math.min(Math.max(1, query.page || 1), pageCount);
    return { rows: rows.slice((n - 1) * size, n * size),
             total: total, page: n, pageSize: size, pageCount: pageCount };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     2c · PER-PERSON DATA — derived, so any person in the directory opens

     Everything above this line is the Byrne fixture: the exact rows the Figma
     frames draw, kept verbatim so the designed screen reproduces. Everything
     below BUILDS an equivalent set for any other person from their own name,
     email, phone and employee id.

     Derived rather than hand-written for fourteen people because the point is
     the flow, not fourteen bespoke stories — and because a generator cannot
     drift from the shapes the screen renders. Every field the row components
     read is produced here; if a renderer starts reading a new one, this is
     where it has to be added or the other thirteen people break.

     WHEN THE API LANDS none of this survives. The service below is the seam:
     point its four methods at endpoints and delete §2b, §2c and §3.
     ═══════════════════════════════════════════════════════════════════════ */

  /* A stable pseudo-random from the person id, so a given person always gets
     the same data — a demo that reshuffles on reload is not a demo. */
  function seedOf(id) {
    var n = 0;
    for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
    return n;
  }
  function pick(seed, list, salt) {
    return list[(seed + (salt || 0)) % list.length];
  }

  var SOURCES = ["AD", "HRIS"];
  var TITLES = ["Claims Analyst", "Claims Adjuster", "Case Manager",
                "Compliance Officer", "Records Analyst"];
  var DEPARTMENTS = ["Complex Claims", "Claims Operations", "Compliance",
                     "Records Management"];
  var MANAGERS = ["Hawkins, Guy", "Howard, Esther", "Nakamura, Erin",
                  "Powell, Marcus"];

  function derivePerson(d) {
    var seed = seedOf(d.id);
    var ids = deriveIdentities(d, seed);
    var sources = {};
    ids.forEach(function (r) { sources[r.source] = true; });
    return {
      id: d.id,
      name: d.last + ", " + d.first,
      email: d.email,
      jobTitle: pick(seed, TITLES),
      identityCount: ids.length,
      sourceCount: Object.keys(sources).length
    };
  }

  function deriveIdentities(d, seed) {
    var handle = (d.first.charAt(0) + d.last).toLowerCase().replace(/[^a-z]/g, "");
    var full = (d.first + "." + d.last).toLowerCase().replace(/[^a-z.]/g, "");
    var empNo = d.employeeId.replace(/[^0-9]/g, "") || "0000";
    var count = 2 + (seed % 3);                    /* 2 to 4 identities */

    var template = [
      { key: full, source: "AD", effective: "09-02-2024",
        status: "Linked", tone: "success", assertedLabel: "Asserted:",
        asserted: "09-02-2024", reason: "2 corroborating keys", reasonVerbatim: true,
        matchedOn: ["Full name + email address", "Employee ID"] },
      { key: empNo, source: "HRIS", effective: "08-19-2024",
        status: "Established", tone: "success", assertedLabel: "Asserted:",
        asserted: "08-19-2024", reason: "Created this person", reasonVerbatim: true,
        matchedOn: ["No keys matched on an existing person."] },
      { key: handle, source: "AD", effective: "08-11-2026",
        status: "Linked", tone: "success", assertedLabel: "Asserted:",
        asserted: "08-11-2026", reason: "Accepted on UPN", reasonVerbatim: true,
        matchedOn: ["UPN"] },
      { key: String(Number(empNo) + 72), source: "HRIS", effective: "05-14-2026",
        status: "Linked", tone: "success", assertedLabel: "Asserted:",
        asserted: "05-14-2026", reason: "2 corroborating keys", reasonVerbatim: true,
        matchedOn: ["Full name + email address", "Full name + phone number"] }
    ];

    return template.slice(0, count).map(function (r, i) {
      var out = Object.assign({}, r);
      out.id = d.id + "-ir-" + i;
      return out;
    });
  }

  /* An em dash is an absent value and is muted; everything else is default. */
  function val(label, value) {
    return value === "—" ? { label: label, value: value, tone: "muted" }
                         : { label: label, value: value };
  }

  /**
   * The per-key verdict in the detail panel.
   *
   * THE DESIGN CONTAINS EXACTLY ONE VERDICT — "Needs corroboration", in
   * Text/Caution. There is no "Corroborated", no green, and no second word:
   * every key-row drawn anywhere in the frames carries that one label or none.
   * An earlier pass invented a green CORROBORATED and it did not match.
   *
   * The rule the drawing implies: the label marks a key that is NOT sufficient
   * on its own. The one panel the frames draw has two keys and flags both,
   * under a reason of "2 corroborating keys" — so the flag describes the key
   * TYPE's strength, not whether this particular join was corroborated.
   *
   * So: more than one key means each of them needed the others, and each is
   * flagged. A single key was sufficient by itself — or is not a key at all,
   * like "No keys matched on an existing person." — and carries no label. A row
   * no status renders the key type alone, which is what the renderer does when
   * `status` is absent.
   */
  function keyVerdicts(matchedOn) {
    var list = matchedOn || [];
    return list.map(function (k) {
      return list.length > 1
        ? { type: k, status: "Needs corroboration", tone: "caution" }
        : { type: k };
    });
  }

  function deriveDetail(d, seed, record) {
    return {
      original: [
        { label: "Given name", value: d.first },
        { label: "Surname", value: d.last },
        { label: "Display name", value: d.last + ", " + d.first },
        { label: "Email", value: d.email },
        val("UPN", record.source === "AD" ? d.email : "—"),
        val("Phone", d.phone || "—"),
        { label: "Job title", value: pick(seed, TITLES) },
        { label: "Department", value: pick(seed, DEPARTMENTS, 1) },
        { label: "Manager", value: pick(seed, MANAGERS, 2) },
        { label: "Location", value: d.location },
        { label: "Country", value: d.location.split(", ").pop() },
        { label: "Account status", value: "Active" },
        val("Employee ID", record.source === "HRIS" ? d.employeeId : "—")
      ],
      keys: keyVerdicts(record.matchedOn)
    };
  }

  /**
   * The field-by-field comparison behind one pending match.
   *
   * Same shape and vocabulary as the queue's pair review (#17515) so the two
   * panels cannot drift: `field`, the two values, and an `agree` verdict of
   * "Matches" | "Differs" | "One Side". The column order follows the person
   * cards — candidate first, then this person.
   *
   * Values are the SOURCES' own, so a field can differ without the pair being
   * wrong; that judgement is the operator's and is made in the queue.
   */
  function deriveComparison(d, cand, seed) {
    var given = (cand.name.split(",")[1] || "").trim() || "\u2014";
    var surname = (cand.name.split(",")[0] || "").trim();
    var theirEmail = (surname.toLowerCase().replace(/[^a-z]/g, "") || "x") +
      "@" + (d.email.split("@")[1] || "acme.com");
    return [
      { field: "Surname", candidate: surname, person: d.last,
        agree: surname === d.last ? "Matches" : "Differs" },
      { field: "Given name", candidate: given, person: d.first,
        agree: given === d.first ? "Matches" : "Differs" },
      { field: "Email", candidate: theirEmail, person: d.email,
        agree: theirEmail === d.email ? "Matches" : "Differs" },
      { field: "Job title", candidate: "\u2014", value: null, person: pick(seed, TITLES),
        agree: "One Side" },
      { field: "Source", candidate: cand.sources[0], person: "AD",
        agree: cand.sources[0] === "AD" ? "Matches" : "Expected" }
    ];
  }

  function deriveCandidates(d, seed) {
    /**
     * `on` says WHICH HALF of the display name the variant alters, because
     * "Surname, Given" puts them on opposite sides of the comma. Appending
     * every suffix to the surname — which an earlier pass did — produced
     * "Byrne M., Jennifer" and "Byrne, J., Jennifer", neither of which is a
     * name a source system would ever emit.
     *
     * This also keeps the generated names in the SAME form the Pending Match
     * Queue writes ("Patel, Anaya R."), which is what lets the queue resolve
     * a pair handed to it from this screen. See `pairHint` below.
     */
    var variants = [
      { on: "given", suffix: " M.", why: "Middle initial does not match, same work location",
        keys: ["Full name + phone number"] },
      { on: "surname", suffix: "-Adams", why: "Hyphenated surname after a recorded name change",
        keys: ["Full name + email address"] },
      { on: "given", suffix: " J.", why: "Initial-form name with matching department",
        keys: ["Full name + phone number"] },
      { on: "surname", suffix: "s", why: "Surname does not match, plural form",
        keys: ["Full name + phone number"] },
      { on: "given", suffix: " (dup)", why: "Same display name on a different domain",
        keys: ["Full name"] }
    ];
    var count = seed % 4;                          /* 0 to 3 — some have none */
    return variants.slice(0, count).map(function (v, i) {
      var refused = i >= 2;
      return {
        id: d.id + "-cand-" + i,
        name: v.on === "surname"
          ? d.last + v.suffix + ", " + d.first
          : d.last + ", " + d.first + v.suffix,
        identityCount: 1 + (i % 2),
        sources: [SOURCES[i % 2]],
        tier: refused ? "near-match-refused" : "needs-corroboration",
        tierLabel: refused ? "Near match, refused" : "Needs corroboration",
        tone: refused ? "muted" : "caution",
        strength: refused ? 1 : 2,
        flagged: ["08-12-2026", "08-11-2026", "08-08-2026", "08-04-2026"][i],
        why: v.why,
        matchedOn: v.keys,
        /* Filled below — needs the finished candidate to build against. */
        compare: null
      };
    }).map(function (c) {
      c.compare = deriveComparison(d, c, seed);
      c.cards = { candidate: { created: "Created " + c.flagged + " by refused merge", hold: null },
                  person: { created: "First seen 06-01-2024", hold: null } };
      c.reason = reasonFor(c);
      c.pairHint = pairHint(d.last + ", " + d.first, c.name);
      return c;
    });
  }

  function deriveHistory(d, seed) {
    var ids = deriveIdentities(d, seed);
    var out = [];
    ids.forEach(function (r, i) {
      out.push({
        id: d.id + "-ev-" + i, kind: "event", at: r.asserted,
        time: ["10:05", "2:22", "9:41", "8:12"][i % 4],
        meridiem: i % 2 ? "PM" : "AM",
        title: r.status,
        subject: r.key + " (" + r.source + ")",
        detail: r.reason,
        decidedBy: r.matchedOn.length > 1 ? "System (auto-merge)" : "System (ingestion)"
      });
    });
    out.push({
      id: d.id + "-fact-0", kind: "fact", at: "06-15-2026",
      title: "Job title changed", source: "HRIS",
      record: d.employeeId.replace(/[^0-9]/g, "") || "0000",
      from: pick(seed, TITLES, 3), to: pick(seed, TITLES),
      recorded: "06-18-2026"
    });
    out.push({
      id: d.id + "-fact-1", kind: "fact", at: "03-02-2026",
      title: "Manager changed", source: "HRIS",
      record: d.employeeId.replace(/[^0-9]/g, "") || "0000",
      from: pick(seed, MANAGERS, 1), to: pick(seed, MANAGERS, 2),
      recorded: "03-05-2026"
    });
    return out;
  }

  /* Which person is this screen about? The list hands the id over in the URL. */
  /* ANGULAR: ActivatedRoute.queryParamMap.get('personId'). The subject is a
     QUERY PARAM, not a path segment, because #17515's return link appends
     &tab= alongside it and the browser Back button has to land on the same
     view the operator left. */
  function requestedPersonId() {
    try {
      return (new RegExp("[?&]personId=([^&]+)").exec(window.location.search) || [])[1] || "";
    } catch (e) { return ""; }
  }

  var DIRECTORY_ENTRY = (function () {
    var want = requestedPersonId();
    if (!want) return null;
    var hit = DIRECTORY.filter(function (d) { return d.id === want; })[0];
    return hit || null;
  })();

  /* One object the service reads, so every method scopes the same way. */
  var SUBJECT = (function () {
    if (!DIRECTORY_ENTRY) return null;              /* fall back to the fixture */
    var d = DIRECTORY_ENTRY, seed = seedOf(d.id);
    var ids = deriveIdentities(d, seed);
    var detail = {};
    ids.forEach(function (r) { detail[r.id] = deriveDetail(d, seed, r); });
    return {
      person: derivePerson(d),
      records: ids,
      candidates: deriveCandidates(d, seed),
      history: deriveHistory(d, seed),
      detail: detail
    };
  })();

  /* ═══════════════════════════════════════════════════════════════════════
     3b · EDGE-STATE SWITCHER — a review aid, not a feature

     Frames A2 to A5 are states of ONE screen, so they are reachable by query
     string rather than built as separate pages:

         ?state=inherited    A2 · associations that predate the ledger
         ?state=ended        A3 · withdrawn and reassigned
         ?state=byhand       A4 · a reason with no rule behind it
         ?state=single       A5 · a person built from one identity
         (no parameter)      A  · the default

     THIS WHOLE SECTION DELETES when the real endpoint lands. It exists so a
     reviewer can reach every drawn state without a rebuild; it is not a
     product capability and nothing in the controller reads it.
     ═══════════════════════════════════════════════════════════════════════ */

  var edgeState = (function () {
    var which = "";
    try {
      which = (new RegExp("[?&]state=([^&]+)").exec(window.location.search) || [])[1] || "";
    } catch (e) { which = ""; }

    return {
      name: function () { return which; },

      records: function () {
        if (which === "inherited") return RECORDS_INHERITED;
        if (which === "ended")     return RECORDS.concat(RECORDS_ENDED);
        if (which === "byhand")    return RECORDS.slice(0, 3).concat([RECORD_BY_HAND]);
        if (which === "single")    return RECORDS_SINGLE;
        return RECORDS;
      },

      /* Present ONLY on A2. Every other state has no notice at all — the
         property is absent from the response rather than empty. */
      notice: function () {
        return which === "inherited" ? INHERITED_NOTICE : null;
      },

      /* A5's person is a different person, so its header counts differ. */
      person: function () {
        if (which === "single") {
          return { id: "np-1187", name: "Okonjo, Adaeze", email: "a.okonjo@acme.com",
                   jobTitle: "Claims Analyst", identityCount: 1, sourceCount: 1 };
        }
        var p = Object.assign({}, PERSON);
        p.identityCount = edgeState.records().length;
        p.sourceCount = (function () {
          var seen = {};
          edgeState.records().forEach(function (r) { seen[r.source] = true; });
          return Object.keys(seen).length;
        })();
        return p;
      },

      /* C1 — the pending-matches empty state. */
      candidates: function () {
        return which === "single" ? [] : CANDIDATES;
      }
    };
  })();

  /* ═══════════════════════════════════════════════════════════════════════
     4 · SERVICE — the contract the screen is written against

     Everything above is replaceable. This is not.
     ═══════════════════════════════════════════════════════════════════════ */

  var NaturalPersonService = {

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}
     * @returns {Promise<Person>}
     *
     * The person header. Its counts are the UNFILTERED totals and must stay so
     * — they answer "how big is this person", which cannot move when the
     * operator searches inside a tab.
     */
    person: function () {
      return resolve(SUBJECT ? SUBJECT.person : edgeState.person());
    },

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}/identity-records
     *     ?page=&pageSize=&search=&sort=&dir=
     * @param {ListQuery} query
     * @returns {Promise<{rows: IdentityRecord[], total, page, pageSize, pageCount, sources}>}
     *
     * TWO SORTS, and "source" is the default because it is the payload's own
     * order. Re-sorting by effective date is a view the operator asks for;
     * returning to Source restores what the backend sent.
     *
     * `notice` is present only on the inherited-associations state (A2) and
     * is what the screen renders as a Nimbus/Alert above the toolbar. Absent
     * on every other state — the field is not blanked, it is not there.
     *
     * ANGULAR: identityRecords$(query). Sorting is the server's job; do not
     * re-sort the returned page in the template.
     */
    identities: function (query) {
      query = query || {};
      var all = SUBJECT ? SUBJECT.records : edgeState.records();
      var sources = {};
      all.forEach(function (r) { sources[r.source] = true; });

      var rows = all.filter(function (r) { return matchesSearch(r, query.search); });
      if (query.sort === "effective") {
        rows.sort(function (a, b) {
          var d = dateKey(a.effective) - dateKey(b.effective);
          return query.dir === "asc" ? d : -d;
        });
      } else if (query.dir === "desc") {
        /* "Source" ASCENDING is the payload's own order — the list starts as
           the backend sent it. Only the descending case is work. */
        rows = rows.slice().reverse();
      }
      var out = page(rows, query);
      out.sources = Object.keys(sources).length;
      if (!SUBJECT && edgeState.notice()) out.notice = edgeState.notice();
      return resolve(out);
    },

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}/candidates
     *     ?page=&pageSize=&search=&show=&sort=&dir=
     * @param {ListQuery} query
     * @returns {Promise<{rows: Candidate[], total, page, pageSize, pageCount, unfilteredTotal}>}
     *
     * Sorted by match STRENGTH, strongest tier first, newest flagged within a
     * tier. An adjudicator scanning candidates wants the most likely true
     * matches at the top; name or date order buries them.
     *
     * `unfilteredTotal` drives the TAB LABEL, which must not move when the
     * operator searches — and when it is 0 the label drops its count entirely
     * rather than rendering a bracketed zero.
     */
    candidates: function (query) {
      query = query || {};
      var all = (SUBJECT ? SUBJECT.candidates : edgeState.candidates()).slice();
      if (!SUBJECT) all.forEach(function (c) { if (!c.compare) c.compare = fixtureComparison(c); });
      var rows = all.filter(function (c) {
        if (query.show && query.show !== "all" && c.tier !== query.show) return false;
        return matchesSearch(c, query.search);
      });

      rows.sort(function (a, b) {
        if (query.sort === "flagged") {
          var d = dateKey(a.flagged) - dateKey(b.flagged);
          return query.dir === "asc" ? d : -d;
        }
        /* strength first, then newest flagged inside the tier */
        return (b.strength - a.strength) || (dateKey(b.flagged) - dateKey(a.flagged));
      });

      var out = page(rows, query);
      out.unfilteredTotal = all.length;
      return resolve(out);
    },

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}/history
     *     ?page=&pageSize=&search=&show=&sort=&dir=
     * @param {ListQuery} query
     * @returns {Promise<{rows: HistoryEvent[], total, page, pageSize, pageCount}>}
     *
     * ONE stream, newest first. `show` filters by KIND — all | decisions |
     * facts. A "decision" is a ledger EVENT (kind: "event"); the filter value
     * keeps the operator's word while the data keeps the developer's.
     *
     * NOTE the API paginates Adjudications[] at 50 while this pages at 10. The
     * two numbers are independent on purpose: the backend batch size is about
     * transport, the page size is about reading. Do not couple them.
     */
    history: function (query) {
      query = query || {};
      var source = SUBJECT ? SUBJECT.history : HISTORY;
      var rows = source.filter(function (e) {
        if (query.show === "decisions" && e.kind !== "event") return false;
        if (query.show === "facts" && e.kind !== "fact") return false;
        return matchesSearch(e, query.search);
      });
      rows.sort(function (a, b) {
        var d = dateKey(a.at) - dateKey(b.at);
        return query.dir === "asc" ? d : -d;
      });
      return resolve(page(rows, query));
    },

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}/candidates/{id}
     * @returns {Promise<Candidate|null>}
     *
     * Backs the pair review panel opened from a Pending matches row. Returns
     * the same object the list row was built from, plus its `compare` rows —
     * so the panel and the row can never disagree about the same pair.
     */
    candidate: function (id) {
      var pool = SUBJECT ? SUBJECT.candidates : edgeState.candidates();
      var hit = pool.filter(function (c) { return c.id === id; })[0];
      if (!hit) return resolve(null);
      var out = Object.assign({}, hit);
      if (!out.compare) out.compare = fixtureComparison(hit);
      if (!out.cards) out.cards = fixtureCards(hit);
      if (!out.reason) out.reason = reasonFor(hit);
      /* The pair, named the way the queue names it, so REVIEW IN THE QUEUE can
         open this exact pair instead of the queue's default row. */
      if (!out.pairHint) out.pairHint = pairHint(PERSON.name, hit.name);
      return resolve(out);
    },

    /**
     * GET /api/tenants/{tenantId}/identity-records/{recordId}
     * @returns {Promise<IdentityRecord|null>}
     *
     * Backs the detail panel opened from a History row's VIEW. Always
     * resolvable, including when the subject has moved — the event happened
     * and must stay inspectable, so this must not 404 for a record that was
     * withdrawn or a person that was merged away.
     */
    identityDetail: function (id) {
      if (SUBJECT) {
        var r = SUBJECT.records.filter(function (x) { return x.id === id; })[0];
        if (!r) return resolve(null);
        var o = Object.assign({}, r);
        var dd = SUBJECT.detail[id];
        if (dd) { o.original = dd.original.slice(); o.keys = keyVerdicts(r.matchedOn); }
        return resolve(o);
      }
      var all = RECORDS.concat(RECORDS_INHERITED, RECORDS_ENDED, RECORDS_SINGLE,
                               [RECORD_BY_HAND]);
      var hit = all.filter(function (r) { return r.id === id; })[0];
      if (!hit) return resolve(null);

      var out = Object.assign({}, hit);
      var d = DETAIL[id];
      if (d) { out.original = d.original.slice(); out.keys = keyVerdicts(hit.matchedOn); }
      else {
        /* A record with no captured field values still opens — the panel says
           so rather than refusing. Same rule as the absent `reason`. */
        out.original = null;
        out.keys = keyVerdicts(hit.matchedOn);
      }
      return resolve(out);
    }

    /* NO historyEvent ENDPOINT. The History tab's DETAILS button and its panel
       were removed on 08-28-2026 (PM): the panel restated the subject, the
       detail and the decider, all of which the row already carries. Nothing
       fetches a single event any more.

       If a real per-event view is ever wanted it should show something the row
       does NOT — the full assertion, its supersession chain — rather than the
       same three fields again. */
  };

  window.CaseFusion = window.CaseFusion || {};
  window.CaseFusion.NaturalPersonService = NaturalPersonService;
})();
