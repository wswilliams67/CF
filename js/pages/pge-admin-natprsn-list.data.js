/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/pge-admin-natprsn-list.data.js
 * Screen:  Admin › Natural Persons (list)
 * Page:    pages/pge-admin-natprsn-list.html
 *
 * THE API SEAM — every record this screen shows comes through here, and
 * nothing here touches the DOM.
 *
 * The controller (pge-admin-natprsn-list.js) may not read an array. It asks
 * this service for a PAGE and waits for a promise, which is what the Angular
 * build will do against a real endpoint. That is the whole reason the file
 * exists: keeping the seam honest means the controller never grows filtering,
 * sorting or paging logic that would have to be deleted at port time.
 *
 * Extracted from the controller 09-01-2026. It was the last 1.6 screen still
 * reading its rows synchronously, so it was also the last that could not show
 * a loading state — a skeleton needs something to wait for.
 *
 *     GET /api/tenants/{tenantId}/natural-persons?q&sort&dir&page&size
 *     GET /api/tenants/{tenantId}/pending-matches/count
 *
 * ANGULAR: delete this file. NaturalPersonService becomes a real HttpClient
 * service returning Observable<Page<NaturalPerson>>; the mock rows and the
 * query engine below have no counterpart on the client.
 *
 * LOAD ORDER — before pge-admin-natprsn-list.js, which reads the global it
 * publishes at the bottom.
 * ==========================================================================*/

(function () {
  "use strict";

  /**
   * Mock latency. DELIBERATELY ABOVE the controller's 250ms skeleton delay:
   * a mock faster than the threshold means the skeleton never paints, so it
   * cannot be reviewed, demonstrated, or noticed when it breaks.
   */
  var LATENCY_MS = 700;

  function resolve(value) {
    return new Promise(function (done) {
      setTimeout(function () { done(value); }, LATENCY_MS);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     1 · DEMO DATA  — MOCK, NOT PRODUCTION

     Stands in for GET /api/tenants/{tenantId}/natural-persons. Enough rows to
     fill a default page of 10 and prove paging; the two records the Figma
     board shows are kept first so the screen matches the design on load.

     ANGULAR: delete this array. NaturalPersonService returns Page<NaturalPerson>
     and §3 collapses into the query it sends.
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @typedef {Object} NaturalPerson
   * @property {string}  id             stable record id (route param)
   * @property {string}  displayName    what the card headlines
   * @property {string}  firstName
   * @property {string}  middleName
   * @property {string}  lastName
   * @property {string}  employeeId
   * @property {string}  dateOfBirth    ISO yyyy-mm-dd; rendered mm-dd-yyyy
   * @property {string}  gender         MALE | FEMALE | OTHER | …
   * @property {string} [genderSpecify] free text, only when gender === OTHER
   * @property {string}  location
   * @property {{value:string, primary:boolean}[]} emails
   * @property {{value:string, primary:boolean}[]} phones
   */

  /** @type {NaturalPerson[]} */
  var DEMO_PERSONS = [
    {
      id: "np-1001", displayName: "Frances Lindqvist",
      firstName: "Frances", middleName: "Elise", lastName: "Lindqvist",
      employeeId: "EMP-004182", dateOfBirth: "1984-03-19",
      gender: "Female", location: "Stockholm, SE",
      emails: [
        { value: "frances.lindqvist@northwind.example", primary: true },
        { value: "f.lindqvist@contoso.example", primary: false }
      ],
      phones: [
        { value: "+46 8 555 0142", primary: true },
        { value: "+46 70 555 0198", primary: false }
      ]
    },
    {
      id: "np-1002", displayName: "Albert Von Hohenstein-Zimmermannberg-Featherstahlscheidt",
      firstName: "Albert", middleName: "Charles", lastName: "Von Hohenstein-Zimmermannberg-Featherstahlscheidt",
      employeeId: "EMP-004183", dateOfBirth: "1971-11-02",
      gender: "Male", location: "Munich, DE",
      emails: [
        { value: "albert.vonhohenstein@northwind.example", primary: true },
        { value: "a.von.h@fabrikam.example", primary: false }
      ],
      phones: [
        { value: "+49 89 555 0117", primary: true },
        { value: "+49 151 555 0163", primary: false }
      ]
    },
    {
      id: "np-1003", displayName: "Priya Raghunathan",
      firstName: "Priya", middleName: "", lastName: "Raghunathan",
      employeeId: "EMP-004190", dateOfBirth: "1990-07-28",
      gender: "Female", location: "Bengaluru, IN",
      emails: [{ value: "priya.raghunathan@northwind.example", primary: true }],
      phones: [{ value: "+91 80 5550 1442", primary: true }]
    },
    {
      id: "np-1004", displayName: "Marcus Webb",
      firstName: "Marcus", middleName: "Dean", lastName: "Webb",
      employeeId: "EMP-004201", dateOfBirth: "1979-01-14",
      gender: "Male", location: "Austin, TX, US",
      emails: [
        { value: "marcus.webb@northwind.example", primary: true },
        { value: "mwebb@adventure-works.example", primary: false }
      ],
      phones: [{ value: "+1 512 555 0166", primary: true }]
    },
    {
      id: "np-1005", displayName: "Aoife Ní Bhraonáin",
      firstName: "Aoife", middleName: "", lastName: "Ní Bhraonáin",
      employeeId: "EMP-004212", dateOfBirth: "1993-05-06",
      gender: "Female", location: "Dublin, IE",
      emails: [{ value: "aoife.nibhraonain@northwind.example", primary: true }],
      phones: [
        { value: "+353 1 555 0129", primary: true },
        { value: "+353 87 555 0174", primary: false }
      ]
    },
    {
      id: "np-1006", displayName: "Tobias Andersen",
      firstName: "Tobias", middleName: "Jon", lastName: "Andersen",
      employeeId: "EMP-004219", dateOfBirth: "1966-09-30",
      gender: "Other", genderSpecify: "Non-binary", location: "Oslo, NO",
      emails: [{ value: "tobias.andersen@northwind.example", primary: true }],
      phones: [{ value: "+47 21 555 0108", primary: true }]
    },
    {
      id: "np-1007", displayName: "Chen Wei",
      firstName: "Chen", middleName: "", lastName: "Wei",
      employeeId: "EMP-004228", dateOfBirth: "1988-12-11",
      gender: "Male", location: "Singapore, SG",
      emails: [
        { value: "chen.wei@northwind.example", primary: true },
        { value: "wei.chen@tailspin.example", primary: false }
      ],
      phones: [{ value: "+65 6555 0183", primary: true }]
    },
    {
      id: "np-1008", displayName: "Isabela Moreira",
      firstName: "Isabela", middleName: "Cristina", lastName: "Moreira",
      employeeId: "EMP-004235", dateOfBirth: "1995-02-23",
      gender: "Female", location: "São Paulo, BR",
      emails: [{ value: "isabela.moreira@northwind.example", primary: true }],
      phones: [{ value: "+55 11 5555 0121", primary: true }]
    },
    {
      id: "np-1009", displayName: "Jennifer Liu",
      firstName: "Jennifer", middleName: "", lastName: "Liu",
      employeeId: "EMP-004241", dateOfBirth: "1998-06-17",
      gender: "Female", location: "Vancouver, BC, CA",
      emails: [
        { value: "jennifer.liu@northwind.example", primary: true },
        { value: "j.liu@litware.example", primary: false }
      ],
      phones: [{ value: "+1 604 555 0193", primary: true }]
    },
    {
      id: "np-1010", displayName: "Ahmed El-Sayed",
      firstName: "Ahmed", middleName: "Karim", lastName: "El-Sayed",
      employeeId: "EMP-004250", dateOfBirth: "1982-04-09",
      gender: "Male", location: "Cairo, EG",
      emails: [{ value: "ahmed.elsayed@northwind.example", primary: true }],
      phones: [
        { value: "+20 2 5550 0147", primary: true },
        { value: "+20 100 555 0132", primary: false }
      ]
    },
    {
      id: "np-1011", displayName: "Greta Lindholm",
      firstName: "Greta", middleName: "Marie", lastName: "Lindholm",
      employeeId: "EMP-004262", dateOfBirth: "1975-08-21",
      gender: "Female", location: "Helsinki, FI",
      emails: [{ value: "greta.lindholm@northwind.example", primary: true }],
      phones: [{ value: "+358 9 555 0155", primary: true }]
    },
    {
      id: "np-1012", displayName: "Samuel Okonkwo",
      firstName: "Samuel", middleName: "", lastName: "Okonkwo",
      employeeId: "EMP-004270", dateOfBirth: "1986-10-03",
      gender: "Male", location: "Lagos, NG",
      emails: [{ value: "samuel.okonkwo@northwind.example", primary: true }],
      phones: [{ value: "+234 1 555 0178", primary: true }]
    },
    {
      id: "np-1013", displayName: "Hannah Brightwater",
      firstName: "Hannah", middleName: "Rose", lastName: "Brightwater",
      employeeId: "EMP-004281", dateOfBirth: "1991-03-30",
      gender: "Female", location: "Manchester, UK",
      emails: [
        { value: "hannah.brightwater@northwind.example", primary: true },
        { value: "h.brightwater@proseware.example", primary: false }
      ],
      phones: [{ value: "+44 161 555 0164", primary: true }]
    },
    {
      id: "np-1014", displayName: "Diego Ramírez",
      firstName: "Diego", middleName: "Luis", lastName: "Ramírez",
      employeeId: "EMP-004293", dateOfBirth: "1969-07-12",
      gender: "Male", location: "Madrid, ES",
      emails: [{ value: "diego.ramirez@northwind.example", primary: true }],
      phones: [{ value: "+34 91 555 0136", primary: true }]
    }
  ];

  /**
   * Pending candidate pairs across the whole tenant.
   *
   * MOCK — this is live data in production. The badge is the reason to open the
   * queue, so a stale number is worse than no number. It counts PENDING pairs
   * only, not the whole queue: a pair that has already been decided is not
   * outstanding work. (Figma annotation on node ...;12948:17149.)
   *
   * MUST MATCH THE QUEUE'S PENDING TILE. This badge is the reason to open the
   * queue, and the queue's tile is counted live off the same records its rows
   * are drawn from — so a hardcoded number here that disagrees means the count
   * changes under the operator the moment they click through. It read 5,313
   * (the Figma annotation's figure) against the queue's 5,281 until 2026-08-26.
   *
   * In production the disagreement cannot arise: both read the same
   * pending-matches count endpoint. It exists only because the mock states the
   * number in two places, and this is the one that cannot count.
   *
   * ANGULAR: CandidateQueueService.pendingCount$ — polled or pushed, bound with
   * the async pipe so the badge tracks the backlog without a page reload. Point
   * it at the SAME endpoint the queue's stats tile uses; two endpoints that
   * "both count pending pairs" is how this drifts again.
   */
  var PENDING_MATCH_COUNT = 5281;  /* ═══════════════════════════════════════════════════════════════════════
     2 · QUERY HELPERS

     ANGULAR: all three steps move server-side. The component sends
     {q, sort, dir, page, size} and renders the Page<NaturalPerson> it gets
     back; nothing below survives the port.
     ═══════════════════════════════════════════════════════════════════════ */

  /** Fields the search box looks at. */
  function searchIndex(person) {
    return [
      person.displayName,
      person.firstName, person.middleName, person.lastName,
      person.employeeId, person.location,
      person.emails.map(function (e) { return e.value; }).join(" "),
      person.phones.map(function (p) { return p.value; }).join(" ")
    ].join(" ").toLowerCase();
  }

  function sortKey(person, field) {
    switch (field) {
      case "employeeId":  return person.employeeId.toLowerCase();
      case "dateOfBirth": return person.dateOfBirth;   /* ISO sorts lexically */
      case "location":    return person.location.toLowerCase();
      default:            return person.displayName.toLowerCase();
    }
  }

  /**
   * The query engine. Runs the three steps a WHERE/ORDER BY/LIMIT would.
   * @returns {{rows:Object[], total:number, pageCount:number, page:number}}
   */
  function queryPage(q) {
    var rows = DEMO_PERSONS;

    var needle = (q.query || "").trim().toLowerCase();
    if (needle) {
      rows = rows.filter(function (person) {
        return searchIndex(person).indexOf(needle) !== -1;
      });
    }

    /* Copy before sorting — Array#sort mutates, and DEMO_PERSONS stands in for
       an immutable API response. */
    var sign = q.dir === "desc" ? -1 : 1;
    rows = rows.slice().sort(function (a, b) {
      var ka = sortKey(a, q.sort);
      var kb = sortKey(b, q.sort);
      if (ka < kb) return -1 * sign;
      if (ka > kb) return 1 * sign;
      return 0;
    });

    var total = rows.length;
    var pageSize = q.pageSize || 10;
    var pageCount = Math.max(1, Math.ceil(total / pageSize));
    var page = Math.min(Math.max(1, q.page || 1), pageCount);
    var start = (page - 1) * pageSize;

    return {
      rows: rows.slice(start, start + pageSize),
      total: total,
      pageCount: pageCount,
      page: page
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     4 · SERVICE  —  the only surface the controller may touch
     ═══════════════════════════════════════════════════════════════════════ */

  var NaturalPersonService = {
    /**
     * One page of natural persons.
     *
     * @param {{query:string, sort:string, dir:string, page:number, pageSize:number}} q
     * @returns {Promise<{rows:Object[], total:number, pageCount:number, page:number}>}
     *
     * `page` comes BACK as well as going in: a filter can strand the caller
     * past the last page, and the clamp belongs with the count that caused it.
     */
    list: function (q) { return resolve(queryPage(q)); },

    /**
     * Pending candidate pairs across the whole tenant, for the toolbar badge.
     * Separate call because it is a separate endpoint in production, and it
     * must agree with the queue's own stats tile.
     */
    pendingCount: function () { return resolve(PENDING_MATCH_COUNT); }
  };

  window.CaseFusion = window.CaseFusion || {};
  window.CaseFusion.NaturalPersonService = NaturalPersonService;
}());
