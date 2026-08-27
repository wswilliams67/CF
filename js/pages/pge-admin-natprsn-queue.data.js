/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-queue.data.js
 * Screen:  Admin › Natural Persons › Pending Match Queue
 * Figma:   CaseFusion v1.5 — Tenant Manager, section 12466:6785 (#17515)
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
 * The screen quotes 5,281 pending pairs. Nothing that size is ever shipped to
 * the browser in one array, so the contract below is the one a paged API
 * actually offers:
 *
 *   the CALLER states what it wants   — view, page, size, search, filters
 *   the SERVICE returns one page      — rows + the TOTAL behind them
 *
 * The controller therefore never filters, never sorts and never slices. It
 * cannot: it is only ever handed the page it asked for. That is deliberate.
 * A UI that filters client-side reads fine against 12 mock rows and collapses
 * against 5,281 real ones, and by then the filtering logic is spread across
 * the render path and is expensive to retract.
 *
 * Every method returns a PROMISE, including the ones the mock could answer
 * synchronously. A method that is sync today and async tomorrow changes every
 * call site; one that is async from the start does not. The mock also holds a
 * deliberate delay (LATENCY_MS) so the loading and race-guard paths are
 * exercised in development rather than discovered in staging.
 *
 * ANGULAR MIGRATION
 * ─────────────────
 * This object becomes `PendingMatchService`, `@Injectable({providedIn:'root'})`,
 * with each method returning `Observable<T>` from `HttpClient` instead of a
 * Promise. The signatures are already the right shape — see the per-method
 * ANGULAR notes. The @typedefs below become interfaces in
 * `pending-match.model.ts` and should be generated from the OpenAPI document
 * rather than hand-copied.
 *
 * REST endpoints each method stands in for are named on the method.
 * `{tenantId}` is ambient in this screen's route.
 * ========================================================================= */

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════════
     0 · TRANSPORT

     The one place that knows the data is fake. Swap the body of `resolve()`
     for an HTTP call and everything above it is unchanged.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Mock round-trip, in ms. MOCK ONLY — delete with the rest of §2/§3.
   *
   * Deliberately longer than the screen's skeleton delay (250ms, see
   * SKELETON_DELAY_MS in the controller). At the 120ms this started on, the
   * response always beat the threshold and the skeleton NEVER appeared —
   * so the loading state could not be reviewed, demonstrated to a developer,
   * or caught when it broke. A mock latency exists to exercise the async
   * paths; one that skips the most visible of them is not doing its job.
   *
   * It also stands for something real: 5,281 pending pairs is a paged query
   * against a live index, not a 120ms lookup.
   */
  var LATENCY_MS = 700;

  /**
   * Wrap a mock value in the same shape a network call returns.
   *
   * ANGULAR: delete this. `HttpClient.get<T>(url)` already returns the
   * Observable this is imitating.
   */
  function resolve(value) {
    return new Promise(function (done) {
      setTimeout(function () { done(value); }, LATENCY_MS);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1 · TYPES

     ANGULAR: `pending-match.model.ts`, generated from the OpenAPI document.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @typedef {Object} QueueStats
   * @property {number} pending     pairs awaiting a decision
   * @property {number} samePerson  decided same person — RECORDED, NOT MERGED
   * @property {number} notTheSame  decided not the same
   */

  /**
   * @typedef {Object} PendingMatch
   * @property {string}   id
   * @property {string}   groupId       the signature group this pair sits under
   * @property {string}   established   name on the established person
   * @property {string}   candidate     name on the distinct person
   * @property {string[]} sources       [established, candidate] source systems
   * @property {string}   status        display text for the state
   * @property {"default"|"caution"|"success"|"danger"} tone
   * @property {string[]} [matchedOn]   OMITTED when the assertion was not recorded
   * @property {string}   [reason]      OMITTED when the assertion was not recorded
   * @property {string}   note
   * @property {boolean}  [holdKnown]   false when hold data could NOT be retrieved
   * @property {string}   [legalHold]
   *
   * `matchedOn` and `reason` are ABSENT, never empty, when the matcher did not
   * record why. Absence of an explanation is not an empty explanation, and the
   * API must preserve that distinction — do not serialise them as "" or [].
   */

  /**
   * @typedef {Object} SignatureGroup
   * @property {string}   id
   * @property {string}   name          the signature, as the matcher named it
   * @property {number}   pairs         total pairs carrying this signature
   * @property {string}   status
   * @property {"default"|"caution"|"success"|"danger"} tone
   * @property {string[]} [matchedOn]
   * @property {string}   [reason]
   * @property {string[]} states        every pair state present in the group
   * @property {string}   note
   * @property {boolean}  noteIsWarning
   * @property {number}   reviewable    pairs still open to review; 0 disables REVIEW
 * @property {boolean}  canDispatch   may this group be decided in bulk?
   */

  /**
   * @typedef {Object} ListQuery
   * @property {"grouped"|"pairs"} view
   * @property {number} page       1-based
   * @property {number} pageSize
   * @property {string} search     free text; "" for none
   * @property {{keyType:string[], reason:string[], state:string[], source:string[]}} filters
   *           empty array === no constraint on that field
   *
   * ANGULAR: serialise to `HttpParams`. Repeat multi-valued keys
   * (`?state=Pending&state=Reopened`) rather than joining them — a comma is a
   * legal character inside a reason string and would be ambiguous.
   */

  /**
   * @typedef {Object} PageResult
   * @property {Array}  rows       this page only
   * @property {number} total      rows behind the whole query, NOT rows.length
   * @property {number} page
   * @property {number} pageSize
   * @property {number} pageCount
   *
   * `total` drives the pager range and MUST be the server's count. Deriving it
   * from rows.length is the defect this shape exists to prevent.
   */

  /* ═══════════════════════════════════════════════════════════════════════
     2 · MOCK RECORDS — NOT PRODUCTION

     Everything from here to §3 is throwaway. It is the only part of the file
     that goes when the API arrives.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * States an operator can still act on. Anything else is already decided, so
   * it is not a stop on the walk and is not counted as work on a group row.
   */
  var ADJUDICABLE_STATES = ["Pending", "Reopened"];

  /*
   * States that close a pair WITHOUT an operator decision (edge states 3 and 4).
   *
   * Both are counted nowhere. They are not pending, and they are not a "Same
   * person" or "Not the same" outcome either, because no one decided anything
   * — the pair stopped being answerable. Letting either fall into a tile would
   * either overstate the work left or invent an adjudication that never
   * happened, and the queue total has to stay honest about both.
   *
   * Kept as a named list rather than an `if` in countStats so the exclusion is
   * one fact in one place: the tiles, the group counts and `reviewable` all
   * read it.
   *
   * ANGULAR / API: these are STATES on the record, not a separate endpoint. The
   * server's counts must exclude them the same way — a tile computed with
   * `WHERE state <> 'Pending'` would credit them to an outcome nobody chose.
   */
  var CLOSED_WITHOUT_DECISION = ["Stale — cannot be decided", "Resolved elsewhere"];

  /* The last re-ingestion, reported even when the queue is empty.
     Silence must be distinguishable from staleness: "nothing to review" and
     "nothing has run" look identical on an empty screen, and only one of them
     is good news.

     ANGULAR / API: ships on the stats payload rather than a second call — the
     empty state and the tiles have to describe the same moment. `completedAt`
     is a display string here; send an ISO instant and format it in the client,
     mm-dd-yyyy per this product's convention. */
  var LAST_INGESTION = { completedAt: "08-16-2026 04:12 UTC", newPending: 0 };

  /**
   * @type {QueueStats}
   *
   * COUNTED off MOCK_PAIRS once the queue is built (see deriveStats below),
   * not declared. The tiles, the unmerged alert, each group row's pair count,
   * the all-pairs total, the pager range and the walker step are then all the
   * same numbers read from the same array — they cannot disagree with each
   * other, which is the failure this replaced.
   */
  var MOCK_STATS = { pending: 0, samePerson: 0, notTheSame: 0 };

  /**
   * How many pairs each signature carries, from the backend ticket.
   *
   * These size the generated mock set below; `group.pairs` and `group.states`
   * are then COUNTED BACK OFF the pairs, never declared. That is the whole
   * point: a hand-written "124" on the row and a walker that counts real
   * records will disagree the moment either changes, and the operator sees
   * "124 pairs" on a row that opens a queue of four.
   */
  var GROUP_SIZES = {
    "sig-cohort-only":    3764,
    "sig-shared-address": 1359,
    "sig-two-keys":        124,
    "sig-not-recorded":     34
  };

  /**
   * Decisions already recorded, on top of the pending pairs above.
   *
   * These are what the stat tiles and the persistent unmerged-decisions alert
   * report, and the alert is the reason they have to exist: it says N
   * same-person decisions are recorded and NOT executed, and an alert citing
   * a number nothing backs is untestable — it would read "2" against a design
   * that shows 142, and nobody would know whether that was the mock or the
   * alert being wrong.
   *
   * They are ADDITIONAL to GROUP_SIZES rather than carved out of it, so each
   * group row still shows the pending count the design draws.
   */
  var DECIDED_SIZES = {
    "Same person — awaiting merge": 142,
    "Not the same":                 891
  };

  /** @type {SignatureGroup[]} */
  var MOCK_GROUPS = [
    {
      id: "sig-cohort-only",
      name: "Cohort only — no address match",
      status: "Pending",
      tone: "default",
      matchedOn: ["Last name + mobile phone"],
      reason: "cohort match, no corroboration",
      note: "Near-match strength. No corroborating evidence on these pairs.",
      noteIsWarning: false,
      canDispatch: true
    },
    {
      id: "sig-shared-address",
      name: "Shared address — Hospira site",
      status: "Pending",
      tone: "default",
      matchedOn: ["Full name + email address"],
      reason: "shared address, single key",
      note: "Needs corroboration. Single key on a shared address — not identifying on its own.",
      noteIsWarning: false,
      canDispatch: true
    },
    {
      id: "sig-two-keys",
      name: "Two corroborating keys",
      status: "Mixed",
      tone: "caution",
      matchedOn: ["Full name + email address", "Full name + phone number"],
      reason: "2 corroborating keys",
      note: "Deserves review. Two independent keys agree, which policy does not treat as sufficient to merge automatically.",
      noteIsWarning: true,
      canDispatch: false
    },
    {
      id: "sig-not-recorded",
      name: "Not recorded",
      status: "Pending",
      tone: "default",
      note: "Why these pairs matched was not recorded. The links are real; only the explanation is missing.",
      noteIsWarning: false,
      canDispatch: false
    }
  ];

  /**
   * @type {PendingMatch[]}
   *
   * `groupId` is carried on every pair. The grouped view's REVIEW button walks
   * the pairs of ONE group, so the relationship has to be in the data — a
   * group row that opened whichever pair happened to be pending first would
   * put the operator in a different group from the one they clicked.
   */
  var MOCK_PAIRS = [
    { id: "pm-1", groupId: "sig-two-keys", established: "Byrne, Jennifer", candidate: "Byrne, Jenny", sources: ["AD", "HRIS"],
      establishedMeta: "4 identities · First seen 06-01-2024",
      candidateMeta: "1 identity · Created 08-11-2026 by refused merge",
      legalHold: "Acme v. Byrne, on legal hold since 03-03-2026",
      refusedOn: "08-11-2026",
      status: "Pending", tone: "default",
      matchedOn: ["Full name + email address"], reason: "2 corroborating keys",
      note: "Needs corroboration. Two keys matched; policy requires more than this to merge automatically." },
    { id: "pm-2", groupId: "sig-two-keys", established: "Okafor, Chidi", candidate: "Okafor, C.", sources: ["HRIS", "HRIS"],
      establishedMeta: "2 identities · First seen 02-14-2023",
      candidateMeta: "1 identity · Created 08-12-2026 by refused merge",
      refusedOn: "08-12-2026",
      status: "Pending", tone: "default",
      matchedOn: ["Full name + phone number"], reason: "2 corroborating keys",
      note: "Needs corroboration. Two keys matched; policy requires more than this to merge automatically." },
    /* Edge case §7 — hold data could not be retrieved. Neither card claims
       "No holds": absence of data is not absence of a hold. */
    { id: "pm-3", groupId: "sig-shared-address", established: "Hernández, Sofía", candidate: "Hernandez, Sofia", sources: ["AD", "HRIS"],
      establishedMeta: "3 identities · First seen 09-30-2021",
      candidateMeta: "1 identity · Created 08-13-2026 by refused merge",
      holdKnown: false,
      refusedOn: "08-13-2026",
      status: "Pending", tone: "default",
      matchedOn: ["Full name + email address"], reason: "shared address, single key",
      note: "Needs corroboration. Single key on a shared address — not identifying on its own." },
    { id: "pm-4", groupId: "sig-two-keys", established: "Patel, Anaya", candidate: "Patel, Anaya R.", sources: ["HRIS", "HRIS"],
      status: "Same person — awaiting merge", tone: "caution",
      matchedOn: ["Full name + phone number"], reason: "2 corroborating keys",
      note: "Recorded 08-14-2026. Nothing has been merged — merging happens as a separate step." },
    { id: "pm-5", groupId: "sig-shared-address", established: "Kowalski, Marek", candidate: "Kowalski, M.", sources: ["AD", "HRIS"],
      status: "Not the same", tone: "default",
      matchedOn: ["Full name + email address"], reason: "shared address, single key",
      note: "Recorded 08-13-2026. Pair is suppressed at match time and will not be re-raised." },
    { id: "pm-6", groupId: "sig-two-keys", established: "Nguyen, Linh", candidate: "Nguyen, Linh T.", sources: ["HRIS", "AD"],
      status: "Same person — awaiting merge", tone: "caution",
      matchedOn: ["Full name + date of birth"], reason: "name + date of birth",
      note: "Recorded 08-15-2026. Nothing has been merged — merging happens as a separate step." },
    { id: "pm-7", groupId: "sig-two-keys", established: "Adeyemi, Tunde", candidate: "Adeyemi, Tunde", sources: ["AD", "HRIS"],
      status: "Reopened", tone: "danger",
      matchedOn: ["Full name + email address"], reason: "2 corroborating keys",
      note: "Previously: Not the same, recorded 08-09-2026. Returned after the 08-15-2026 re-ingestion — durability defect." },
    /* Edge state 3 — one side deleted or reassigned.
       The pair cannot be decided at all: there is no longer a person to decide
       ABOUT. It keeps its matchedOn and reason because the match was real when
       it was made; what changed is the world, not the evidence. Counted
       nowhere — see CLOSED_WITHOUT_DECISION. */
    { id: "pm-20", groupId: "sig-two-keys", established: "Byrne, Jennifer", candidate: "Byrne, Jenny", sources: ["AD", "HRIS"],
      establishedMeta: "4 identities · First seen 06-01-2024",
      candidateMeta: "Deleted 08-14-2026 by data retention",
      status: "Stale — cannot be decided", tone: "caution",
      matchedOn: ["Full name + email address"], reason: "2 corroborating keys",
      note: "Distinct person deleted 08-14-2026 by data retention. Removed from active counts \u2014 no decision can be recorded against a person that no longer exists." },

    /* Edge state 4 — both persons already merged, by another path.
       Closed, but NOT an adjudication: nobody answered this pair. Shown as
       resolved elsewhere precisely so it is never read as a decision the
       operator made and never credited to either outcome tile. */
    { id: "pm-21", groupId: "sig-two-keys", established: "Patel, Anaya", candidate: "Patel, A.", sources: ["AD", "HRIS"],
      establishedMeta: "2 identities · First seen 11-08-2023",
      candidateMeta: "1 identity · Created 08-10-2026 by refused merge",
      status: "Resolved elsewhere", tone: "success",
      matchedOn: ["Full name + email address"], reason: "2 corroborating keys",
      note: "Merged on 08-15-2026 \u2014 not from this queue. No operator decision was recorded." },

    { id: "pm-8", groupId: "sig-cohort-only", established: "Silva, Marco", candidate: "Silva, M. A.", sources: ["HRIS", "HRIS"],
      status: "Pending", tone: "default",
      matchedOn: ["Last name + mobile phone"], reason: "cohort match, no corroboration",
      note: "Near-match strength. No corroborating evidence on this pair." },
    { id: "pm-9", groupId: "sig-cohort-only", established: "Dubois, Camille", candidate: "Dubois, C.", sources: ["AD", "HRIS"],
      status: "Pending", tone: "default",
      matchedOn: ["Last name + mobile phone"], reason: "cohort match, no corroboration",
      note: "Near-match strength. No corroborating evidence on this pair." },
    /* Assertion not recorded — matchedOn and reason are ABSENT, not empty. */
    { id: "pm-10", groupId: "sig-not-recorded", established: "Rossi, Giulia", candidate: "Rossi, G.", sources: ["HRIS", "AD"],
      status: "Pending", tone: "default",
      note: "Why this pair matched was not recorded. The link is real; only the explanation is missing." },
    { id: "pm-11", groupId: "sig-two-keys", established: "Haugen, Ingrid", candidate: "Haugen, I.", sources: ["AD", "HRIS"],
      status: "Pending", tone: "default",
      matchedOn: ["Full name + email address"], reason: "2 corroborating keys",
      note: "Needs corroboration. Two keys matched; policy requires more than this to merge automatically." },
    { id: "pm-12", groupId: "sig-cohort-only", established: "Costa, Rafael", candidate: "Costa, R.", sources: ["HRIS", "AD"],
      status: "Pending", tone: "default",
      matchedOn: ["Last name + mobile phone"], reason: "cohort match, no corroboration",
      note: "Near-match strength. No corroborating evidence on this pair." }
  ];

  /* ─────────────────────────────────────────────────────────────────────
     FILLING OUT THE QUEUE — MOCK ONLY

     The twelve pairs above are the CURATED ones: they carry the edge cases
     the screen has to handle (a legal hold, unretrievable hold data, an
     assertion that was never recorded, a reopened pair). They are not enough
     to exercise the screen, because the whole argument for the grouped view
     is scale — 3,764 pairs on one signature is why a flat list is a wall
     rather than a work queue, and that argument is untestable against twelve
     rows.

     So the rest are generated up to GROUP_SIZES. This is what makes every
     number on the screen agree: the stat tiles, each group row's pair count,
     the all-pairs total, the pager range and the walker step are all COUNTED
     off this one array. Nothing is asserted anywhere.

     Deterministic — no Math.random. The same seed gives the same queue every
     reload, so a bug found on "page 47" is still on page 47 afterwards.
     ───────────────────────────────────────────────────────────────────────── */

  var FILLER_SURNAMES = [
    "Alvarez", "Bianchi", "Cohen", "Dlamini", "Eriksen", "Fischer", "Gallagher",
    "Haddad", "Ivanov", "Jansen", "Kimura", "Lindqvist", "Moreau", "Novak",
    "Oyelaran", "Petrov", "Quintero", "Reyes", "Sorensen", "Tanaka", "Ueda",
    "Vargas", "Weber", "Yilmaz", "Zielinski"
  ];
  var FILLER_GIVEN = [
    "Adam", "Bea", "Carlos", "Dana", "Elias", "Farah", "Gustav", "Hana",
    "Idris", "Jonas", "Kira", "Lucas", "Mira", "Noor", "Otto", "Petra"
  ];

  /** Which key type and matcher reason each signature asserts. */
  var GROUP_EVIDENCE = {
    "sig-cohort-only":    { key: "Last name + mobile phone",   reason: "cohort match, no corroboration",
      note: "Near-match strength. No corroborating evidence on this pair." },
    "sig-shared-address": { key: "Full name + email address",  reason: "shared address, single key",
      note: "Needs corroboration. Single key on a shared address — not identifying on its own." },
    "sig-two-keys":       { key: "Full name + phone number",   reason: "2 corroborating keys",
      note: "Needs corroboration. Two keys matched; policy requires more than this to merge automatically." },
    /* No key and no reason: this group IS the not-recorded case. */
    "sig-not-recorded":   { key: null, reason: null,
      note: "Why this pair matched was not recorded. The link is real; only the explanation is missing." }
  };

  /** One synthetic pair. Deterministic in `seq` — see the note above. */
  function fillerPair(seq, groupId, status, tone) {
    var ev = GROUP_EVIDENCE[groupId];
    var sur = FILLER_SURNAMES[seq % FILLER_SURNAMES.length];
    var giv = FILLER_GIVEN[(seq * 7) % FILLER_GIVEN.length];

    var pair = {
      id: "pm-g" + seq,
      groupId: groupId,
      established: sur + ", " + giv,
      /* The candidate is the same person written differently — an initial —
         which is what a near-match in this queue actually looks like. */
      candidate: sur + ", " + giv.charAt(0) + ".",
      sources: (seq % 3 === 0) ? ["HRIS", "HRIS"]
             : (seq % 3 === 1) ? ["AD", "HRIS"] : ["HRIS", "AD"],
      status: status,
      tone: tone,
      note: status === "Pending" ? ev.note
          : status === "Not the same"
            ? "Pair is suppressed at match time and will not be re-raised."
            : "Nothing has been merged — merging happens as a separate step."
    };
    /* ABSENT, not empty, for the not-recorded group — the distinction the
       whole screen turns on. */
    if (ev.key) { pair.matchedOn = [ev.key]; pair.reason = ev.reason; }
    return pair;
  }

  function generatePairs() {
    var out = [];
    var seq = 0;
    var groupIds = Object.keys(GROUP_SIZES);

    /* Pending, up to each group's size. Only ADJUDICABLE curated pairs count
       toward the target — a group's size is how much work it holds. */
    groupIds.forEach(function (groupId) {
      var have = MOCK_PAIRS.filter(function (p) {
        return p.groupId === groupId && ADJUDICABLE_STATES.indexOf(p.status) !== -1;
      }).length;
      for (var i = 0; i < GROUP_SIZES[groupId] - have; i++) {
        out.push(fillerPair(++seq, groupId, "Pending", "default"));
      }
    });

    /*
     * Decisions already recorded.
     *
     * NOT spread evenly. Same-person outcomes land only on the group with
     * CORROBORATING keys, because that is what actually happens: a key strong
     * enough to confirm an identity is the one that produces confirmations,
     * and a low-strength key produces volume that never turns out to be the
     * same person.
     *
     * That asymmetry is the measurement panel's entire argument — high
     * production with near-zero same-person outcomes is a policy problem
     * rather than a workload. Distributing these round-robin flattened it and
     * left every key type looking equally productive, which is both unrealistic
     * and makes the panel demonstrate nothing.
     */
    var SAME_PERSON_GROUPS = ["sig-two-keys"];
    var NOT_SAME_GROUPS = groupIds.filter(function (g) { return g !== "sig-two-keys"; });

    Object.keys(DECIDED_SIZES).forEach(function (status) {
      var tone = status === "Not the same" ? "default" : "caution";
      var pool = status === "Not the same" ? NOT_SAME_GROUPS : SAME_PERSON_GROUPS;
      var already = MOCK_PAIRS.filter(function (p) { return p.status === status; }).length;
      for (var i = 0; i < DECIDED_SIZES[status] - already; i++) {
        out.push(fillerPair(++seq, pool[i % pool.length], status, tone));
      }
    });

    return out;
  }

  MOCK_PAIRS = MOCK_PAIRS.concat(generatePairs());

  /**
   * Count each group's work off the pairs themselves.
   *
   * `pairs` is the number of pairs STILL AWAITING A DECISION, which is what
   * the row's REVIEW button walks — so the row's count and the panel's
   * "Pair n of N" are the same number by construction and cannot drift.
   * On a pending-match queue that is also what "N pairs" plainly means.
   *
   * `states` is every state present in the group, so the State filter keeps a
   * group whose pairs include a selected state.
   */
  /**
   * Recount a group's work from the pairs.
   *
   * Run on every query rather than once at load, so a group row and the walk
   * REVIEW opens can never drift apart as decisions land — the rule Scott set
   * when the row said "124 pairs" and the panel opened "Pair 1 of 4".
   *
   * A DECIDED group is the exception: it keeps the count it was decided with.
   * Its adjudicable count is zero by definition, and a row reading "0 pairs"
   * would erase the size of what just happened. The design keeps the row, at
   * full contrast, until the next list load.
   */
  function recountGroups() {
    MOCK_GROUPS.forEach(function (g) {
      /* `reviewable` is ALWAYS the live adjudicable count, even for a decided
         group whose display count is frozen. The row's REVIEW button reads
         this, so it can never offer a review of nothing — and it stays correct
         without the UI having to know about the `decided` flag. */
      g.reviewable = MOCK_PAIRS.filter(function (p) {
        return p.groupId === g.id && ADJUDICABLE_STATES.indexOf(p.status) !== -1;
      }).length;
      /* Edge state 6 — a group part-way through. `decided` is what has already
         been answered inside this group and `pairs` is its display total, so
         the row can say "32% decided" and the dispatch modal can say exactly
         how many decisions it is about to record. Both are derived, never
         stored: a decision taken in the panel has to move them.

         Pairs closed without a decision are in NEITHER number. They are not
         work remaining and they are not something anyone decided. */
      var all = MOCK_PAIRS.filter(function (p) { return p.groupId === g.id; });
      g.decidedCount = all.filter(function (p) {
        return ADJUDICABLE_STATES.indexOf(p.status) === -1 &&
               CLOSED_WITHOUT_DECISION.indexOf(p.status) === -1;
      }).length;
      g.total = g.decidedCount + g.reviewable;
      g.percentDecided = g.total ? Math.round((g.decidedCount / g.total) * 100) : 0;

      if (g.decided) return;
      var mine = all;
      g.pairs = mine.filter(function (p) {
        return ADJUDICABLE_STATES.indexOf(p.status) !== -1;
      }).length;
      var seen = {};
      mine.forEach(function (p) { seen[p.status] = true; });
      g.states = Object.keys(seen);
    });
  }
  recountGroups();

  /**
   * Count the tiles off MOCK_PAIRS.
   *
   * Computed PER CALL, not once at load: decisions and group dispatch both
   * change these, and a snapshot taken at startup would leave the tiles saying
   * 5,281 while the list underneath showed the remainder. The real endpoint
   * counts per request too.
   *
   * `pending` includes Reopened — a reopened pair needs deciding again.
   */
  function countStats() {
    var s = { pending: 0, samePerson: 0, notTheSame: 0, closedWithoutDecision: 0,
              lastIngestion: LAST_INGESTION };
    MOCK_PAIRS.forEach(function (p) {
      if (ADJUDICABLE_STATES.indexOf(p.status) !== -1) s.pending++;
      /* Checked BEFORE the outcome tests. "Resolved elsewhere" would otherwise
         never match anything and pass silently, but a future state worded like
         an outcome would land in the wrong tile — order the guard, not luck. */
      else if (CLOSED_WITHOUT_DECISION.indexOf(p.status) !== -1) s.closedWithoutDecision++;
      else if (p.status.indexOf("Same person") === 0) s.samePerson++;
      else if (p.status === "Not the same") s.notTheSame++;
    });
    return s;
  }

  /**
   * Filter option lists — the design's parked-open menus, verbatim.
   *
   * These are FACETS and belong to the server, not the page: the set of key
   * types a tenant actually has is a property of that tenant's data. Hard-
   * coding them in the controller would show an operator a Source filter for a
   * system they have never connected.
   *
   * `All` is NOT in these lists — it is the empty selection, added by the
   * control. A value called "All" would be a value the API has to understand.
   */
  var MOCK_FACETS = {
    /* Includes "Not recorded" as a selectable VALUE: pairs whose assertion was
       never recorded still have a key type, and must remain findable. */
    keyType: ["Full name + email address", "Full name + phone number",
              "Full name + date of birth", "Last name + mobile phone",
              "Employee ID", "UPN", "Not recorded"],
    /* The MATCHER's reason, not the decision reason captured in Pair Review. */
    reason: ["“cohort match, no corroboration”",
             "“shared address, single key”",
             "“2 corroborating keys”",
             "“name + date of birth”", "Not recorded"],
    /* The two same-person states stay SEPARATELY selectable: conflating them
       hides an unshipped merge backlog. */
    /* The two closed-without-a-decision states are filterable like any other:
       an operator who wants to see what the queue dropped, and why, has no
       other route to it once the pairs are out of every count. */
    state: ["Pending", "Not the same", "Same person — awaiting merge",
            "Same person — merged", "Reopened",
            "Stale — cannot be decided", "Resolved elsewhere"],
    source: ["AD", "HRIS"]
  };

  /**
   * Decision reasons, grouped by the outcome each one asserts.
   *
   * The GROUP is the whole mechanism: a reason under "Not the same person"
   * enables only NOT THE SAME. The option states the outcome, so offering the
   * opposite decision would let the record contradict its own justification.
   * "Other — add a note" is the escape hatch and enables BOTH, since the note
   * has not yet said which way it goes.
   *
   * Server-owned because the list is auditable: adjudications are reported on
   * by reason, so the vocabulary is governed and versioned, not a UI constant.
   */
  var MOCK_REASONS = [
    {
      label: "Not the same person", outcome: "not-same",
      options: [
        "Different people — name coincidence",
        "Different people — shared address only",
        "Different people — identifier reuse",
        "Confirmed distinct by the source system"
      ]
    },
    {
      label: "Same person", outcome: "same",
      options: [
        "Corroborated by multiple keys",
        "Confirmed by the custodian",
        "Confirmed against an authoritative source",
        "Name change — same person"
      ]
    },
    { label: "Other", outcome: "either", options: ["Other — add a note"] }
  ];

  /* ═══════════════════════════════════════════════════════════════════════
     3 · MOCK QUERY ENGINE — NOT PRODUCTION

     Stands in for what the database does. Delete with §2.

     Kept here rather than in the controller ON PURPOSE. The rules are real
     (they are the screen's semantics and the backend must implement them),
     but the PLACE they run is the server. Leaving them in the controller
     would mean the client keeps filtering after the API lands.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Does a row survive the filters?
   *
   * AND across filters, OR within one — which is what "Key type: 3 selected"
   * means. Backend: this is the WHERE clause.
   */
  function matchesFilters(row, filters) {
    if (filters.state.length) {
      /* A pair row IS one state. A group row CONTAINS several, and survives if
         ANY of its pairs is in a selected state — a group is not itself in a
         decision state, so matching on its signature status instead would
         empty the grouped view the moment State was touched. */
      var states = row.states || [row.status];
      if (!states.some(function (st) { return filters.state.indexOf(st) !== -1; })) return false;
    }

    if (filters.reason.length) {
      /* Absent reason is the selectable value "Not recorded" — see MOCK_FACETS. */
      var reason = row.reason ? "“" + row.reason + "”" : "Not recorded";
      if (filters.reason.indexOf(reason) === -1) return false;
    }

    if (filters.keyType.length) {
      var keys = (row.matchedOn && row.matchedOn.length) ? row.matchedOn : ["Not recorded"];
      if (!keys.some(function (k) { return filters.keyType.indexOf(k) !== -1; })) return false;
    }

    if (filters.source.length) {
      /* EITHER side. Groups carry no source, so a source filter cannot apply
         to them — they are left in rather than silently emptied. */
      if (!row.sources) return true;
      if (!row.sources.some(function (s) { return filters.source.indexOf(s) !== -1; })) return false;
    }

    return true;
  }

  /** Free-text across everything the row shows. Backend: a full-text index. */
  function matchesSearch(row, q) {
    if (!q) return true;
    var hay = [row.name, row.established, row.candidate, row.status, row.reason, row.note]
      .concat(row.matchedOn || []).concat(row.sources || [])
      .filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }

  /**
   * The pairs a grouped row represents UNDER A GIVEN QUERY.
   *
   * ONE definition, read by both the row's `reviewable` count and the walk
   * that REVIEW actually opens. They used to compute it separately and drifted
   * apart: a State filter left a row saying 124 reviewable while the walk came
   * back empty, so a live button announced there was nothing behind it.
   * Whatever this returns, the button and the panel agree by construction.
   *
   * Free text is the subtle part. If the search matched the GROUP itself, it
   * has already done its work at group level and must NOT narrow the pairs
   * inside — otherwise searching a signature name finds the group and then
   * disables its REVIEW, because no individual pair carries that text. If the
   * group did not match, only the pairs that did are in scope, which is what
   * makes searching a person's name open exactly that person.
   *
   * Filters always narrow, in both cases: they are a statement about which
   * pairs matter, not about how to find a row.
   *
   * ANGULAR / API: this is one query, not a client-side scan. The grouped list
   * endpoint returns each group with a `reviewable` count computed under the
   * SAME predicate the worklist endpoint uses — ideally a shared WHERE clause
   * or view. If the two are written separately they will drift, and the symptom
   * is a live REVIEW button that opens nothing. Do not compute `reviewable` in
   * the component from the rows it can see; it is a property of the query.
   */
  function groupPairs(group, query) {
    var filters = query.filters ||
      { keyType: [], reason: [], state: [], source: [] };
    var q = query.search;
    var groupMatched = !q || matchesSearch(group, q);
    return MOCK_PAIRS.filter(function (p) {
      return p.groupId === group.id &&
             matchesFilters(p, filters) &&
             (groupMatched || matchesSearch(p, q));
    });
  }

  /** Every row for a query, in the view's order, before paging. */
  function matchingRows(query) {
    /* Counts are recomputed here, not cached, so a group row always reports
       the work that is actually left. */
    recountGroups();
    var filters = query.filters || { keyType: [], reason: [], state: [], source: [] };

    var rows = query.view === "pairs"
      ? MOCK_PAIRS.slice()
      /* Sorted here rather than trusted from the mock: largest group first is
         a RULE of the screen, so the server must ORDER BY pairs DESC. */
      : MOCK_GROUPS.slice().sort(function (a, b) { return b.pairs - a.pairs; });

    /*
     * A grouped row matches a search if the GROUP matches or any pair inside
     * it does.
     *
     * The filters already look through a group to its pairs — that is why
     * filtering State to "Reopened" surfaces the group containing the reopened
     * pair — and search did not, which made the two behave differently for no
     * reason an operator could see. Searching a person's name in grouped view
     * returned nothing at all, which reads as "this person is not in the
     * queue" when they are one toggle away. An empty result has to mean
     * absent, not looked-in-the-wrong-place.
     */
    function rowMatchesSearch(row) {
      if (!query.search) return true;
      if (matchesSearch(row, query.search)) return true;
      if (query.view === "pairs") return false;
      return MOCK_PAIRS.some(function (p) {
        return p.groupId === row.id && matchesSearch(p, query.search);
      });
    }

    var kept = rows.filter(function (row) {
      return matchesFilters(row, filters) && rowMatchesSearch(row);
    });

    if (query.view === "pairs") return kept;

    /*
     * `reviewable` must answer the question the REVIEW button actually asks:
     * "how many pairs would this open, GIVEN THE CURRENT QUERY?"
     *
     * recountGroups() computes it across the whole group, which is right for
     * an unfiltered list and wrong the moment a filter narrows things. Filter
     * State to "Stale — cannot be decided" and the group survives (it does
     * contain one), reports 124 reviewable, and enables REVIEW — while the
     * walk, which DOES respect the query, comes back empty. The operator
     * clicks a live button and is told there was nothing there, which is
     * exactly what disabling it is supposed to prevent.
     *
     * Copied, never mutated in place: MOCK_GROUPS.slice() copies the array and
     * not the objects, so writing `reviewable` onto a row would leak this
     * query's filters into the next one — and into the unfiltered tiles.
     *
     * The progress numbers are deliberately NOT narrowed. "297 of 4,061
     * decided" is a fact about the group, not about the current filter.
     */
    return kept.map(function (g) {
      var open = groupPairs(g, query).filter(function (p) {
        return ADJUDICABLE_STATES.indexOf(p.status) !== -1;
      }).length;
      return Object.assign({}, g, { reviewable: open });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4 · SERVICE — the contract the screen is written against

     Everything above is replaceable. This is not.
     ═══════════════════════════════════════════════════════════════════════ */

  var PendingMatchService = {

    /**
     * GET /api/tenants/{tenantId}/pending-matches/stats
     * @returns {Promise<QueueStats>}
     *
     * A STREAM, not a snapshot — the counts move as decisions commit, and the
     * unmerged alert is driven from the same object as the tiles so the two
     * can never disagree.
     *
     * ANGULAR: stats(): Observable<QueueStats>, bound with the async pipe and
     * re-fetched (or pushed) on every decision.
     */
    stats: function () {
      return resolve(countStats());
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches/facets
     * @returns {Promise<{keyType:string[],reason:string[],state:string[],source:string[]}>}
     *
     * Fetched ONCE on load. The filter menus are built from it, so a tenant
     * only ever sees values their own data contains.
     */
    facets: function () {
      return resolve(MOCK_FACETS);
    },

    /**
     * GET /api/adjudication-reasons
     * @returns {Promise<Array<{label:string,outcome:string,options:string[]}>>}
     *
     * `outcome` is "not-same" | "same" | "either" and drives which decision
     * button enables. It is part of the CONTRACT, not a UI convenience — the
     * server decides what a reason asserts.
     */
    reasons: function () {
      return resolve(MOCK_REASONS);
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches
     *     ?view=&page=&pageSize=&search=&keyType=&reason=&state=&source=
     *
     * @param {ListQuery} query
     * @returns {Promise<PageResult>}
     *
     * THE MAIN READ. `view=grouped` returns SignatureGroup rows, `view=pairs`
     * returns PendingMatch rows; both are paged the same way.
     *
     * `total` is the count behind the WHOLE query. The pager reads it, so it
     * must come from the server — never from rows.length.
     *
     * Callers may fire this faster than it answers (a keystroke per search
     * character). Responses can therefore land out of order, and the caller is
     * responsible for discarding stale ones — see the request token in the
     * controller's render(). ANGULAR: switchMap() does this for you, and is
     * the reason to prefer it over mergeMap here.
     */
    query: function (query) {
      var rows = matchingRows(query);
      var total = rows.length;
      var pageSize = query.pageSize;
      var pageCount = Math.max(1, Math.ceil(total / pageSize));
      /* Clamped server-side too: a client asking for page 7 of a 3-page result
         gets page 3, not an empty list it has to interpret. */
      var page = Math.min(Math.max(1, query.page), pageCount);
      var start = (page - 1) * pageSize;

      return resolve({
        rows: rows.slice(start, start + pageSize),
        total: total,
        page: page,
        pageSize: pageSize,
        pageCount: pageCount
      });
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches/{pairId}
     * @returns {Promise<PendingMatch|null>}
     *
     * The panel re-fetches by id rather than reusing the list row: the list
     * row carries what the LIST shows, and the panel shows more. Re-fetching
     * also means a pair decided in another tab opens in its current state.
     */
    pair: function (id) {
      var found = null;
      for (var i = 0; i < MOCK_PAIRS.length; i++) {
        if (MOCK_PAIRS[i].id === id) { found = MOCK_PAIRS[i]; break; }
      }
      return resolve(found);
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches/{pairId}/comparison
     * @returns {Promise<Array<{field,established,distinct,verdict,agree}>>}
     *
     * THREE verdicts, and they stay distinct: "match", "differ", "missing".
     * Absence is not disagreement — collapsing missing into differ is a
     * correctness error, because a null in a legacy import carries no
     * evidentiary weight while a genuine conflict does. The API must return
     * all three; do not let it normalise missing to differ.
     */
    comparison: function (pairId) {
      var pair = null;
      for (var i = 0; i < MOCK_PAIRS.length; i++) {
        if (MOCK_PAIRS[i].id === pairId) { pair = MOCK_PAIRS[i]; break; }
      }
      if (!pair) return resolve([]);

      var estGiven = pair.established.split(", ")[1] || "";
      var canGiven = pair.candidate.split(", ")[1] || "";
      return resolve([
        { field: "Surname", established: pair.established.split(",")[0],
          distinct: pair.candidate.split(",")[0], verdict: "match" },
        { field: "Given name", established: estGiven, distinct: canGiven,
          verdict: estGiven === canGiven ? "match" : "differ" },
        { field: "Email", established: "j.byrne@acme.example",
          distinct: "j.byrne@acme.example", verdict: "match" },
        { field: "Job title", established: "Claims Analyst", distinct: null,
          verdict: "missing", agree: "One side" },
        { field: "Source", established: pair.sources[0], distinct: pair.sources[1],
          verdict: "missing", agree: "Expected" }
      ]);
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches/worklist
     *     ?groupId=&view=&search=&filters…
     *
     * @param {ListQuery} query          the list the operator is working from
     * @param {string|null} groupId      set when REVIEW was pressed on a group row
     * @returns {Promise<string[]>}      ordered pair ids, adjudicable ones only
     *
     * THE SKIP WALK. Pair Review is not a detail page — it is a station, and
     * SKIP advances to the next record rather than closing. This returns the
     * order it advances in.
     *
     * Two rules that must survive the real implementation:
     *
     *   · It is NOT paged. The operator is walking a work queue and should not
     *     stop at the bottom of page 1. Return ids only — a worklist of 5,281
     *     ids is a few hundred KB, whereas 5,281 records is not shippable.
     *
     *   · It honours the SAME filters as the list. Skipping out of the filter
     *     the operator set would hand them a record they had excluded.
     *
     * Already-decided pairs are excluded: skipping "to the next record to be
     * adjudicated" means the next one that still needs a decision, so a
     * decided row is not a stop on the walk even when it is visible in the
     * list.
     */
    worklist: function (query, groupId) {
      /* From a group row the walk is that group's pairs — the SAME set the
         row counted as `reviewable`, via groupPairs(), so the button's
         enablement and what the panel contains cannot disagree. */
      var group = groupId && MOCK_GROUPS.filter(function (g) {
        return g.id === groupId;
      })[0];
      var rows = query.view === "pairs"
        ? matchingRows(query)
        : group
          ? groupPairs(group, query)
          : MOCK_PAIRS.filter(function (p) {
              return matchesFilters(p, query.filters ||
                { keyType: [], reason: [], state: [], source: [] }) &&
                matchesSearch(p, query.search);
            });

      return resolve(rows.filter(function (p) {
        if (!p.id || p.id.indexOf("pm-") !== 0) return false;         /* pairs only */
        if (groupId && p.groupId !== groupId) return false;
        return ADJUDICABLE_STATES.indexOf(p.status) !== -1;
      }).map(function (p) { return p.id; }));
    },

    /**
     * GET /api/tenants/{tenantId}/pending-matches/measurement
     * @returns {Promise<{rollups, byKeyType, trend, signal}>}
     *
     * The deliverable the ticket asks for: how many candidates are we
     * producing, and on which keys.
     *
     * TENANT-WIDE AND UNFILTERED. It takes no query, deliberately — the
     * queue's filters must not reach it. The panel exists to turn queue volume
     * into a matching-policy argument, and an argument computed from whatever
     * the operator happened to have filtered to is not one you can take to
     * anybody.
     *
     * THE ROLLUPS ARE DERIVED FROM THE BREAKDOWN, never stated separately. A
     * headline that does not equal its own table destroys confidence in the
     * whole panel — the design notes a draft where the two disagreed by 32.
     * They are summed here for exactly that reason.
     */
    measurement: function () {
      /* Every key type the tenant has, including ones producing NOTHING. A key
         that never fires is as interesting as one that fires constantly, so
         empty rows are kept rather than dropped. */
      var rows = {};
      MOCK_FACETS.keyType.forEach(function (k) {
        rows[k] = { keyType: k, pending: 0, samePerson: 0, notTheSame: 0, total: 0 };
      });

      MOCK_PAIRS.forEach(function (p) {
        var k = (p.matchedOn && p.matchedOn.length) ? p.matchedOn[0] : "Not recorded";
        if (!rows[k]) rows[k] = { keyType: k, pending: 0, samePerson: 0, notTheSame: 0, total: 0 };
        var r = rows[k];
        if (ADJUDICABLE_STATES.indexOf(p.status) !== -1) r.pending++;
        else if (p.status.indexOf("Same person") === 0) r.samePerson++;
        else if (p.status === "Not the same") r.notTheSame++;
        r.total++;
      });

      var byKeyType = Object.keys(rows).map(function (k) { return rows[k]; })
        .sort(function (a, b) { return b.total - a.total; });

      /* Summed from the rows above — see the note on this method. */
      var rollups = { pending: 0, samePerson: 0, notTheSame: 0, total: 0 };
      byKeyType.forEach(function (r) {
        rollups.pending += r.pending;
        rollups.samePerson += r.samePerson;
        rollups.notTheSame += r.notTheSame;
        rollups.total += r.total;
      });

      /* Production over time, one drip per week. Deterministic — the same
         shape every reload, so a reading taken off this chart is repeatable.
         Weighted by each key type's share of the total, which keeps the chart
         and the table telling the same story. */
      var labels = ["07-07-2026","07-14-2026","07-21-2026","07-28-2026","08-04-2026","08-11-2026"];
      var SHAPE = [0.10, 0.14, 0.18, 0.20, 0.19, 0.19];
      var trend = {
        labels: labels,
        datasets: byKeyType.map(function (r) {
          var run = 0;
          var data = SHAPE.map(function (f, i) {
            var v = (i === SHAPE.length - 1) ? (r.total - run) : Math.round(r.total * f);
            run += v;
            return Math.max(0, v);
          });
          return { label: r.keyType, data: data };
        })
      };

      /*
       * The reason the panel exists. High production with near-zero
       * same-person outcomes is a POLICY problem, not a workload — the key is
       * manufacturing candidates that never turn out to be the same person.
       *
       * Named explicitly, with both numbers, because "some keys are noisy" is
       * not an argument anyone can act on. The panel SURFACES this; it does
       * not edit key policy (§9).
       */
      var worst = null;
      byKeyType.forEach(function (r) {
        if (r.total < 100) return;                       /* too small to argue from */
        var rate = r.samePerson / r.total;
        if (!worst || rate < worst.rate || (rate === worst.rate && r.total > worst.row.total)) {
          worst = { row: r, rate: rate };
        }
      });

      return resolve({
        rollups: rollups,
        byKeyType: byKeyType,
        trend: trend,
        signal: worst ? { keyType: worst.row.keyType, produced: worst.row.total,
                          confirmedSame: worst.row.samePerson } : null
      });
    },

    /**
     * POST /api/tenants/{tenantId}/pending-matches/{pairId}/decision
     * body: { verdict: "SAME_PERSON" | "NOT_THE_SAME", reason, note }
     *
     * @returns {Promise<{pairId:string, verdict:string, reason:string}>}
     *
     * WRITES AN ADJUDICATION RECORD ONLY. No merge is performed in this
     * release — merge execution ships in #17474. That is implementation
     * sequencing and must never appear as on-screen copy, but the API shape
     * has to reflect it: this endpoint returns a decision receipt, not a
     * merged person.
     *
     * ANGULAR: returns Observable<DecisionReceipt>; the component refreshes
     * stats() and the list off the response rather than mutating local state,
     * so the tiles cannot drift from the queue.
     */
    recordDecision: function (pairId, verdict, reason) {
      /* Mock only — a real POST returns the server's record. Mutating here
         keeps the demo self-consistent as an operator works through pairs. */
      for (var i = 0; i < MOCK_PAIRS.length; i++) {
        if (MOCK_PAIRS[i].id === pairId) {
          MOCK_PAIRS[i].status = verdict === "SAME_PERSON"
            ? "Same person — awaiting merge" : "Not the same";
          MOCK_PAIRS[i].tone = verdict === "SAME_PERSON" ? "caution" : "default";
          break;
        }
      }
      return resolve({ pairId: pairId, verdict: verdict, reason: reason });
    },

    /**
     * POST /api/tenants/{tenantId}/pending-matches/{pairId}/skip
     * @returns {Promise<{pairId:string}>}
     *
     * Records that this operator passed over the pair and LEAVES IT PENDING.
     * It is not a decision and must not change the pair's state — the count on
     * the Pending tile does not move.
     *
     * It is still a write: without it a skip is invisible, and a pair everyone
     * skips looks identical to one nobody has reached. If the backend declines
     * to record skips, this becomes a no-op resolve() and the UI is unchanged
     * — which is exactly why the call sits here rather than being assumed away
     * at the call site.
     */
    skip: function (pairId) {
      return resolve({ pairId: pairId });
    },

    /**
     * POST /api/tenants/{tenantId}/pending-matches/groups/{groupId}/dispatch
     * body: { reason, expectedCount }
     *
     * @returns {Promise<{groupId:string, decided:number}>}
     *
     * Records NOT_THE_SAME for every STILL-PENDING pair in the group — not the
     * group total. `expectedCount` is the number the operator typed to
     * confirm; the server MUST reject the call if it no longer matches, since
     * the count can move between the modal opening and the operator typing.
     *
     * TODO(task 6): the modal that calls this.
     */
    dispatchGroup: function (groupId, reason, expectedCount) {
      /* Mock only — a real POST returns the server's per-item result. Writes
         NOT_THE_SAME for every STILL-PENDING pair in the group, which is what
         `expectedCount` was confirming; already-decided pairs are untouched. */
      var decided = 0;
      MOCK_PAIRS.forEach(function (p) {
        if (p.groupId === groupId && ADJUDICABLE_STATES.indexOf(p.status) !== -1) {
          p.status = "Not the same";
          p.tone = "default";
          decided++;
        }
      });

      /* The group stays in the list, marked decided. Removing it would shift
         the rows beneath it directly under the cursor — onto the next group's
         "Decide whole group" control. It keeps its count and evidence at full
         contrast; only the status changes and the dispatch action goes. */
      MOCK_GROUPS.forEach(function (g) {
        if (g.id !== groupId) return;
        g.decided = true;
        g.pairs = decided;          /* frozen: what this row just decided */
        g.status = "Decided";
        g.tone = "success";
        g.canDispatch = false;      /* REVIEW remains, so it stays auditable */
        g.states = ["Not the same"];
      });

      return resolve({ groupId: groupId, decided: decided, reason: reason });
    }
  };

  /* Namespaced rather than global: this screen's controller is the only
     consumer today, but the Measurement panel (task 7) reads the same records
     and must not get a second copy of them. */
  window.CaseFusion = window.CaseFusion || {};
  window.CaseFusion.PendingMatchService = PendingMatchService;
})();
