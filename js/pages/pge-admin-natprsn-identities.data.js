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
      matchedOn: ["No earlier person shared a key"] },

    { id: "ir-44192", key: "44192", source: "HRIS", effective: "05-14-2026",
      status: "Linked", tone: "success",
      assertedLabel: "Asserted:", asserted: "05-14-2026",
      reason: "2 corroborating keys", reasonVerbatim: true,
      matchedOn: ["Full name + email address", "Full name + phone number"] }
  ];

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
      matchedOn: ["No earlier person shared a key"] }
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
  var CANDIDATES = [
    { id: "np-2201", name: "Byrne, Jennifer M.", identityCount: 2, sources: ["AD", "HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-12-2026", why: "Middle initial variant, same work location",
      matchedOn: ["Full name + phone number"] },
    { id: "np-2202", name: "Byrne-Adams, Jennifer", identityCount: 1, sources: ["HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-11-2026", why: "Hyphenated surname after a recorded name change",
      matchedOn: ["Full name + email address"] },
    { id: "np-2203", name: "Byrne, Jenny", identityCount: 1, sources: ["HRIS"],
      tier: "needs-corroboration", tierLabel: "Needs corroboration", tone: "caution", strength: 2,
      flagged: "08-10-2026", why: "Nickname variant of an existing person",
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
      flagged: "08-05-2026", why: "Surname plural variant",
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
      flagged: "07-29-2026", why: "Given-name spelling variant",
      matchedOn: ["Full name"] },
    { id: "np-2212", name: "Byrne, Jenifer", identityCount: 1, sources: ["AD"],
      tier: "near-match-refused", tierLabel: "Near match, refused", tone: "muted", strength: 1,
      flagged: "07-22-2026", why: "Single-character given-name variant",
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
      detail: "Created this person — no earlier person shared a key",
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
      return resolve(edgeState.person());
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
      var all = edgeState.records();
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
      if (edgeState.notice()) out.notice = edgeState.notice();
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
      var all = edgeState.candidates().slice();
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
      var rows = HISTORY.filter(function (e) {
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
     * GET /api/tenants/{tenantId}/identity-records/{recordId}
     * @returns {Promise<IdentityRecord|null>}
     *
     * Backs the detail panel opened from a History row's VIEW. Always
     * resolvable, including when the subject has moved — the event happened
     * and must stay inspectable, so this must not 404 for a record that was
     * withdrawn or a person that was merged away.
     */
    identityDetail: function (id) {
      var all = RECORDS.concat(RECORDS_ENDED, RECORDS_SINGLE, [RECORD_BY_HAND]);
      var hit = all.filter(function (r) { return r.id === id; })[0];
      return resolve(hit ? Object.assign({}, hit) : null);
    },

    /**
     * GET /api/tenants/{tenantId}/natural-persons/{personId}/history/{eventId}
     * @returns {Promise<HistoryEvent|null>}
     */
    historyEvent: function (id) {
      var hit = HISTORY.filter(function (e) { return e.id === id; })[0];
      return resolve(hit ? Object.assign({}, hit) : null);
    }
  };

  window.CaseFusion = window.CaseFusion || {};
  window.CaseFusion.NaturalPersonService = NaturalPersonService;
})();
