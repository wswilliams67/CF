/* ═══════════════════════════════════════════════════════════════════════
   Hold Status tab — controller (PRD 07 §7.1–7.2).

   WHAT THIS SCREEN DOES
     Reads and records. It never places, changes or releases a hold: a hold
     changes in Purview, or through a request. The actions here refresh a
     reading, record an exception decision (acknowledge / resolve / mute),
     link an orphan hold to a case, or request an attestation.

   DATA (demo seam → API)
     M.holdStatusSources() returns the case's sources. In the product this is
     one API call; everything else on the screen is derived from that list.
     Fields read here:
       id, type, name, owner (person id), team          identity
       hold            Purview status word, shown verbatim (PRD 07 H20)
       evidence        "read" | "attested" | "imported" | …
       regime          "integrity" | "snapshot" | "none"  (freshness regime)
       lastReadText, provisional, dueText, reason       row text
       exception       { type, status, since, closed? }  status: Open |
                       Acknowledged | Resolved | Muted
       raisedBy, notified, kind, placedIn              detail cards
       locationErrors  [{ location, status }]          SharePoint partials
       refreshTo       demo only: what a refresh will read next
       attestation, attestRequested, log               events (log → history)
     The segment (Needs Attention, On Hold Confirmed, …) is DERIVED by
     M.segmentOf(s), never stored, so the five counts always sum to the total.

   STATE (this file only)
     sources   a working copy; actions mutate it, then render() redraws all.
     openSeg   the one open segment accordion (null = all shut).
     expanded  { sourceId: true } for rows whose detail cards are open.

   RENDER CYCLE
     render() rebuilds the tiles, freshness lines, accordions and counts from
     `sources`. Row details and accordions animate with Nimbus Collapse; the
     handlers at "Collapse events" keep `expanded` and the VIEW/HIDE toggle in
     step with the animation instead of re-rendering mid-slide.

   DEMO-ONLY
     Fixed clock (stamp(): DEMO_TODAY at 09:42), canned refresh results
     (refreshTo), and CSV export built in the browser. Shared helpers come
     from shell.js (window.MeridianDemo): dialogs, panels, toasts, the
     viewer's region rule (canSee / nameFor) and the cancel confirmation.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;

  /* ── Constants ──────────────────────────────────────────────────────── */
  /* The five segments, in display order. Names are Title Case (house rule). */
  var SEGS = [
    { id: "attention", name: "Needs Attention",    sub: "Someone has to act" },
    { id: "confirmed", name: "On Hold, Confirmed", sub: "Read from the platform" },
    { id: "attested",  name: "Attested",           sub: "Vouched for, not readable" },
    { id: "imported",  name: "Imported",           sub: "From a record, not a reading" },
    { id: "unknown",   name: "Unknown",            sub: "No reliable signal" }
  ];
  /* Display names for source types (the row's bold first line). */
  var TYPE_LABEL = { "Exchange Online": "Exchange mailbox", "OneDrive": "OneDrive", "Microsoft Teams": "Teams team",
    "SharePoint": "SharePoint site", "Copilot interactions": "Copilot interactions", "Box": "Box folder", "Webex": "Webex space",
    "File share": "File share", "Laptop": "Laptop", "Mobile device": "Mobile device" };
  /* Row order inside a segment: least protected first. Unlisted statuses sort last. */
  var SEVERITY = { "Not applied": 0, "Overdue": 1, "Partial": 2, "Applying": 3, "Removing": 3, "Unknown": 4, "Applied": 5, "Attested": 6 };
  /* Hold status → Nimbus badge colour key (D.badgeColor maps the key to a badge class). */
  var PILL = { "Applied": "ok", "Attested": "info", "Partial": "warn", "Applying": "warn", "Removing": "warn",
    "Not applied": "bad", "Overdue": "bad", "Unknown": "muted" };
  /* The Events card shows the newest three; VIEW ALL EVENTS opens the full list in a side panel.
     Three, not one: the latest event often needs the one that caused it beside it (Sally, Scott 10-14). */
  var EVENTS_SHOWN = 3;
  /* Rows inside a card are separated by the Nimbus blurry divider, not list borders (Scott 10-14). */
  var BLUR = '<li class="hs-row-divider" aria-hidden="true"><hr class="hr hr-blurry"></li>';
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';

  /* ── State ──────────────────────────────────────────────────────────── */
  var sources = JSON.parse(JSON.stringify(M.holdStatusSources()));
  sources.forEach(function (s) { s.history = (s.log || []).slice(); });
  var openSeg = "attention";
  var expanded = {};
  var integrityText = "Integrity verified " + M.freshness.integrityAgo;

  /* ── Small helpers ──────────────────────────────────────────────────── */
  function byId(id) { for (var i = 0; i < sources.length; i++) if (sources[i].id === id) return sources[i]; return null; }
  function typeLabel(s) { return TYPE_LABEL[s.type] || s.type; }
  function isDevice(s) { return s.type === "Laptop" || s.type === "Mobile device"; }
  /* An exception still needs a decision while it is Open or Acknowledged. */
  function openExc(s) { return !!s.exception && (s.exception.status === "Open" || s.exception.status === "Acknowledged"); }
  function segCounts() {
    var c = { attention: 0, confirmed: 0, attested: 0, imported: 0, unknown: 0 };
    sources.forEach(function (s) { c[M.segmentOf(s)]++; });
    return c;
  }
  /* The viewer's region rule: a person outside it shows as a lock + "Profile details limited" (never dimmed). */
  function personHtml(p) {
    return D.canSee(p) ? esc(p.name) : '<span class="demo-masked">' + LOCK + "Profile details limited</span>";
  }
  /* The same person as plain text (summaries, panel titles, CSV). */
  function personText(s) {
    if (s.owner && !D.canSee(M.person(s.owner))) return "Profile details limited";
    return s.owner && !isDevice(s) ? M.person(s.owner).name : s.name;
  }
  /* The headline of the Last read column, the Hold card and the CSV, from one place. */
  function lastReadMain(s) {
    if (s.lastReadText) return s.lastReadText;
    if (s.regime === "integrity") return "Verified 11 min ago";
    if (s.regime === "snapshot") return "Snapshot of " + M.fmtDate(M.freshness.snapshot);
    if (s.regime === "none") return "Never read";
    return "—";
  }
  /* House date format: mm-dd-yyyy; a time beside a date is 12-hour joined by "at" (10-03-2026 at 11:20 AM). */
  function when(h) { return M.fmtDateTime(h.on, h.time); }
  function me() { return M.person(D.viewer().personId).name; }
  /* One event: what happened, when, who, and their note. Demo clock: today at 09:42. */
  function stamp(what, by, note) { return { on: M.DEMO_TODAY, time: "09:42", what: what, by: by, note: note || "" }; }
  function btn(label, act, id, extra) {
    return '<button type="button" class="btn btn-tertiary btn-sm" data-act="' + act + '" data-id="' + id + '"' + (extra || "") + ">" + label + "</button>";
  }
  function cardActions(html) { return '<div class="card-actions mt-auto justify-content-end">' + html + "</div>"; }
  /* CaseFusion empty state (persona profile pattern): icon, bold title, muted reassurance, centred, no box. */
  function emptyState(title, note) {
    return '<div class="hs-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="hs-empty-title">' + title +
      '</span><span class="hs-empty-note">' + esc(note) + "</span></div>";
  }

  /* ── Row cells ──────────────────────────────────────────────────────── */
  /* Second line under the source name: the owner; devices show "ID · team" then the owner. */
  function subject(s) {
    if (isDevice(s)) {
      var who = s.owner ? M.person(s.owner) : null;
      return esc(s.name.replace(/^(Laptop|Mobile) /, "")) + " · " + esc(s.team || "") + (who ? "<br>" + personHtml(who) : "");
    }
    return s.owner ? personHtml(M.person(s.owner)) : esc(s.name);
  }
  /* Purview's status word verbatim (PRD 07 H20): badge-verbatim keeps every Nimbus badge style but the forced
     capitals (Nimbus gap #10). Pill shape for the hold status; the exception badge beside it is square. */
  function pill(s) {
    return '<span class="badge badge-pill badge-verbatim badge-' + D.badgeColor[PILL[s.hold] || "muted"] + '">' + esc(s.hold) + "</span>";
  }
  function excBadge(s) {
    return openExc(s) ? '<span class="badge badge-default ms-1">EXCEPTION · ' + esc(s.exception.status.toUpperCase()) + "</span>" : "";
  }
  function lastRead(s) {
    var extra = s.provisional ? '<span class="d-block small fw-bold text-warning-emphasis">Provisional</span>' : "";
    if (s.dueText) extra += '<span class="d-block small ' + (s.hold === "Overdue" ? "text-danger" : "text-muted") + '">' + esc(s.dueText) + "</span>";
    return "<div>" + esc(lastReadMain(s)) + "</div>" + extra;
  }
  /* The row's one primary action, chosen by what the source needs most. */
  function primaryAction(s) {
    if (s.locationErrors && s.hold === "Partial") return { act: "errors", label: "VIEW ERRORS" };
    if (openExc(s) && s.exception.type === "Orphan hold") return { act: "link", label: "LINK TO CASE" };
    if (s.hold === "Overdue" || s.hold === "Unknown" || s.hold === "Attested") return { act: "attest", label: s.attestRequested ? "REQUESTED" : "REQUEST ATTESTATION" };
    return { act: "refresh", label: "REFRESH SOURCE" };
  }
  /* The reason line shows only where someone has to act or nothing is known. */
  function needsReason(s) { var g = M.segmentOf(s); return s.reason && (g === "attention" || g === "unknown"); }

  /* ── Source row ─────────────────────────────────────────────────────── */
  /* Three columns (Source · Status · Last read), each value labelled in the row itself (no header row), then a
     blurry divider and the stacked actions. Status keeps its context on one line: hold badge, exception badge and
     exception type, with the reason underneath (Scott, 10-14). .hs-open puts the open-row fill on the item. */
  function rowHtml(s) {
    var a = primaryAction(s), open = !!expanded[s.id], label = typeLabel(s);
    var primary = a.label === "REQUESTED" ? '<button type="button" class="btn btn-tertiary btn-sm" disabled>REQUESTED</button>' : btn(a.label, a.act, s.id);
    return '<li class="list-group-item' + (open ? " hs-open" : "") + '" id="row-' + s.id + '"><div class="hs-row">' +
        '<div class="hs-id"><span class="d-block fw-bold">' + esc(label) + '</span><span class="d-block small text-muted">' + subject(s) + "</span></div>" +
        '<div class="hs-status"><span class="hs-col-label">Status</span><div class="d-flex flex-wrap align-items-center gap-1">' + pill(s) + excBadge(s) +
            (openExc(s) ? '<span class="small fw-bold text-danger ms-1">' + esc(s.exception.type) + "</span>" : "") + "</div>" +
          (needsReason(s) ? '<div class="mt-1">' + esc(s.reason) + (s.attestRequested ? " Attestation requested " + esc(M.fmtDate(M.DEMO_TODAY)) + "." : "") + "</div>" : "") + "</div>" +
        '<div><span class="hs-col-label">Last read</span>' + lastRead(s) + "</div>" +
        '<div class="vr vr-blurry" aria-hidden="true"></div>' +
        '<div class="hs-actions">' + primary +
          /* VIEW / HIDE by convention; the aria-label says what it shows. */
          '<button type="button" class="btn btn-tertiary btn-sm" data-expand="' + s.id + '" aria-expanded="' + open + '" aria-controls="det-' + s.id +
          '" aria-label="' + (open ? "Hide" : "View") + " details for " + esc(label) + '">' + (open ? "HIDE" : "VIEW") + "</button></div>" +
      "</div>" + '<div class="collapse' + (open ? " show" : "") + '" id="det-' + s.id + '">' + detailHtml(s) + "</div></li>";
  }

  /* ── Detail cards (Events · Exception · Hold) ───────────────────────── */
  /* Name/value pairs: 12px bold labels, 14px values. Values arrive already escaped (some carry markup). */
  function kv(pairs) {
    return '<dl class="row mb-2 hs-kv">' + pairs.map(function (p) { return '<dt class="col-4 fw-bold">' + p[0] + '</dt><dd class="col-8 mb-1">' + p[1] + "</dd>"; }).join("") + "</dl>";
  }
  /* One card. Title: the Nimbus category type (cf-cat-6) without its highlight bar, which marks page sections such
     as SOURCES (Sally, Scott 10-14). A div with heading semantics, because Nimbus card h4 rules would override the
     type. Every card gets the same head row (24px, the badge height) so first lines align across the three.
     card-actions take mt-auto, so every card's buttons sit on the bottom edge and line up across the row. */
  function block(title, body, count) {
    var head = '<div class="hs-dcard-head"><div class="cf-category cf-cat-6 flex-grow-1 mb-0" role="heading" aria-level="4">' + title + "</div>" +
      (count ? '<span class="badge badge-secondary" aria-label="' + count + ' events">' + count + "</span>" : "") + "</div>";
    return '<div class="col-md-4"><div class="card card-outline h-100 hs-dcard"><div class="card-body">' + head + body + "</div></div></div>";
  }
  /* A labelled list inside a card (Locations): blurry rule above, flush rows with blurry dividers. */
  function activity(label, items) {
    return '<div class="hs-activity"><hr class="hr hr-blurry mb-3"><div class="hs-col-label">' + label + '</div><ul class="list-group list-group-flush">' + items.join(BLUR) + "</ul></div>";
  }
  /* Events newest first, each the same shape: title full width, then "date · by person", then the note. */
  function eventItems(s) {
    return s.history.slice().reverse().map(function (h) {
      return '<li class="list-group-item"><div class="hs-act-what">' + esc(h.what) + "</div>" +
        '<div class="hs-act-meta">' + esc(when(h)) + " · by " + esc(h.by) + "</div>" + (h.note ? '<div class="hs-act-note">' + esc(h.note) + "</div>" : "") + "</li>";
    });
  }
  function locationItems(s) {
    return s.locationErrors.map(function (l) {
      var bad = /^Error/.test(l.status);
      return '<li class="list-group-item"><div class="hs-act-head"><span class="hs-act-what">' + esc(l.location.split("/").pop()) + "</span>" +
        '<span class="hs-act-when' + (bad ? " text-danger" : "") + '">' + esc(bad ? "Error" : l.status) + "</span></div>" +
        '<div class="hs-act-meta">' + esc(l.location) + "</div>" +
        (bad ? '<div class="hs-act-note">' + esc(l.status.replace(/^Error · (.)/, function (m, c) { return c.toUpperCase(); })) + "</div>" : "") + "</li>";
    });
  }
  function eventsCard(s) {
    var all = eventItems(s);
    var body = all.length
      ? '<ul class="list-group list-group-flush hs-events">' + all.slice(0, EVENTS_SHOWN).join(BLUR) + "</ul>" +
        (all.length > EVENTS_SHOWN ? cardActions(btn("VIEW ALL EVENTS", "events", s.id, ' aria-label="View all ' + all.length + " events for " + esc(typeLabel(s)) + '"')) : "")
      : emptyState("No events recorded", "No reading or attestation exists for this source.");
    if (s.locationErrors) body += activity("Locations", locationItems(s));
    return block("Events", body, all.length);
  }
  /* Always present, so the three cards keep their places: open → detail and decisions; closed → who closed it
     and why; none → an all-clear that says why nothing is outstanding (Sally, Scott 10-14). */
  var ALL_CLEAR = { confirmed: "Purview reads Applied. Nothing is outstanding.", attested: "The latest attestation is current. Nothing is outstanding.",
    imported: "The status is imported from a prior tool's record. Nothing is outstanding.", unknown: "No reliable signal is available. No exception is open.",
    attention: "No exception is open." };
  function exceptionCard(s) {
    var x = s.exception;
    if (!x) return block("Exception", emptyState("No open exception", ALL_CLEAR[M.segmentOf(s)]));
    var pairs = [["Type", esc(x.type)], ["State", esc(x.status)]];
    if (!openExc(s)) {
      if (x.closed) pairs.push(["Closed", esc(M.fmtDate(x.closed.on)) + " · by " + esc(x.closed.by)], ["Reason", esc(x.closed.reason)]);
      return block("Exception", kv(pairs));
    }
    pairs.push(["Raised", esc(M.fmtDate(x.since)) + " · by " + esc(s.raisedBy || "CaseFusion")], ["Notified", esc(s.notified || "Case Administrator")]);
    /* ACKNOWLEDGE only while Open; an acknowledged exception can still be resolved or muted. */
    return block("Exception", kv(pairs) + cardActions((x.status === "Open" ? btn("ACKNOWLEDGE", "ack", s.id) : "") + btn("RESOLVE", "resolve", s.id) + btn("MUTE", "mute", s.id)));
  }
  function holdCard(s) {
    var c = M.caseById(D.caseId);
    return block("Hold", kv([["Case", esc(c.id + " " + c.name)], ["Kind", esc(s.kind || "Source hold")], ["Placed in", esc(s.placedIn || "Unknown")], ["Last read", esc(lastReadMain(s))]]) +
      /* Only a source CaseFusion can read can be refreshed. */
      (s.evidence === "read" ? cardActions(btn("REFRESH SOURCE", "refresh", s.id)) : ""));
  }
  function detailHtml(s) { return '<div class="row g-2 mt-3">' + eventsCard(s) + exceptionCard(s) + holdCard(s) + "</div>"; }

  /* All events in a side panel (Nimbus offcanvas). The header with the total is sticky (CSS .hs-panel-head). */
  function openEvents(s) {
    var n = s.history.length;
    D.offcanvas({ title: typeLabel(s) + " · " + personText(s), width: "30vw",
      body: '<div class="hs-dcard-head hs-panel-head"><span class="hs-col-label">Events</span><span class="badge badge-secondary" aria-label="' + n + ' events">' + n + "</span></div>" +
        '<ul class="list-group list-group-flush hs-events hs-events-panel">' + eventItems(s).join(BLUR) + "</ul>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' });
  }

  /* ── Page render ────────────────────────────────────────────────────── */
  /* Freshness: the three regimes in one line, never one merged clock (H60, H112). Sentence case, with a new
     sentence after each separator dot. The pinned action bar carries a shorter line without the ingest time. */
  function sentence(t) { return t.replace(/(^|· )([a-z])/g, function (m, pre, ch) { return pre + ch.toUpperCase(); }); }
  function renderFresh() {
    var snap = " · snapshot of " + M.fmtDate(M.freshness.snapshot), next = " · next expected " + M.fmtDate(M.freshness.nextSnapshot);
    document.getElementById("hsFresh").textContent = sentence(integrityText + snap + ", ingested " + M.freshness.snapshotIngested + next);
    document.getElementById("hsFresh2").textContent = sentence(integrityText + snap + next);
  }
  /* Summary cards: one per segment, each a filter that opens its accordion. Needs Attention is always the danger
     card; an empty segment's card is disabled (Scott, 10-14). */
  function renderTiles(c) {
    document.getElementById("hsTiles").innerHTML = SEGS.map(function (g) {
      var danger = g.id === "attention";
      return '<button type="button" class="card ' + (danger ? "card-outline card-danger" : "card-basic") + ' demo-tile" data-seg="' + g.id + '"' +
        (danger ? ' data-tone="danger"' : "") + ' aria-pressed="' + (g.id === openSeg) + '"' + (c[g.id] ? "" : " disabled") + ">" +
        '<span class="card-subtitle demo-tile-name">' + esc(g.name) + "</span>" +
        '<span class="card-title demo-tile-value">' + c[g.id] + "</span>" +
        '<span class="card-text demo-tile-label">' + esc(g.sub) + "</span></button>";
    }).join("");
  }
  /* A shut accordion's second line names what is inside; an open one says how it is sorted. */
  var OPEN_SUMMARY = "Sort by: least protected first";
  function summary(id, rows) {
    if (id === "confirmed") return "Read from Purview · " + integrityText.toLowerCase().replace("integrity ", "") + " · nothing outstanding";
    if (id === "imported") return "No source on this case was imported from a prior tool";
    if (!rows.length) return "None";
    var names = rows.map(function (s) {
      if (s.owner && !D.canSee(M.person(s.owner))) return typeLabel(s) + " · profile details limited";
      return typeLabel(s) + (s.owner && !isDevice(s) ? " · " + M.person(s.owner).name : "");
    });
    if (id === "attested") return names.join(" and ") + " · next attestation due 11-01-2026";
    if (id === "unknown") return names.join(" and ") + " · never attested";
    return names.join(", ");
  }
  /* One standalone Nimbus accordion per segment, stacked with a gap; one open at a time (Scott, 10-14).
     Every segment's rows are rendered, so Nimbus Collapse can slide them open and shut. */
  function segmentHtml(g, rows) {
    var isOpen = g.id === openSeg;
    return '<div class="accordion accordion-casefusion"><div class="accordion-item"><h3 class="accordion-header">' +
      '<button type="button" class="accordion-button' + (isOpen ? "" : " collapsed") + '" data-seg-toggle="' + g.id + '" aria-controls="hsSeg-' + g.id + '" aria-expanded="' + isOpen + '"' + (rows.length ? "" : " disabled") + ">" +
        '<span class="hs-seg-text"><span class="d-block hs-seg-title">' + esc(g.name) + "</span>" +
        '<span class="d-block small text-muted" data-seg-summary data-open="' + OPEN_SUMMARY + '" data-closed="' + esc(summary(g.id, rows)) + '">' + esc(isOpen ? OPEN_SUMMARY : summary(g.id, rows)) + "</span></span>" +
        '<span class="badge badge-secondary hs-seg-count">' + rows.length + "</span></button></h3>" +
      '<div class="accordion-collapse collapse' + (isOpen ? " show" : "") + '" id="hsSeg-' + g.id + '"><div class="accordion-body p-0">' +
        '<ul class="list-group list-group-flush hs-list">' + rows.map(rowHtml).join("") + "</ul></div></div></div></div>";
  }
  function render() {
    /* Group once, then sort each group least protected first. */
    var groups = { attention: [], confirmed: [], attested: [], imported: [], unknown: [] };
    sources.forEach(function (s) { var g = M.segmentOf(s); if (groups[g]) groups[g].push(s); });
    var rank = function (s) { return s.hold in SEVERITY ? SEVERITY[s.hold] : 9; };
    SEGS.forEach(function (g) { groups[g.id].sort(function (a, b) { return rank(a) - rank(b); }); });
    var c = {}; SEGS.forEach(function (g) { c[g.id] = groups[g.id].length; });

    renderTiles(c);
    renderFresh();
    document.getElementById("hsTable").innerHTML = '<div class="hs-seg-stack">' + SEGS.map(function (g) { return segmentHtml(g, groups[g.id]); }).join("") + "</div>";
    document.getElementById("hsFooterCount").textContent =
      sources.length + " sources on this case · " + c.attention + " need attention · " + c.confirmed + " read as held · " +
      c.attested + " attested · " + c.imported + " imported · " + c.unknown + " unknown";
  }

  /* ── Segment accordions ─────────────────────────────────────────────── */
  /* One open at a time: the open segment slides shut first, then the next slides open. Driven here, not by
     data-cnds-parent, which runs both slides at once. Header state updates without a full re-render. */
  var sliding = false;
  function collapseOf(id) { return Nimbus.Collapse.getOrCreateInstance(document.getElementById("hsSeg-" + id), { toggle: false }); }
  function markHeaders() {
    document.querySelectorAll("[data-seg-toggle]").forEach(function (b) {
      var on = b.getAttribute("data-seg-toggle") === openSeg;
      b.classList.toggle("collapsed", !on); b.setAttribute("aria-expanded", String(on));
      var sm = b.querySelector("[data-seg-summary]"); sm.textContent = sm.getAttribute(on ? "data-open" : "data-closed");
    });
    renderTiles(segCounts());
  }
  /* Runs fn once, when el itself (not a nested collapse) fires the event. */
  function once(el, type, fn) {
    el.addEventListener(type, function done(e) { if (e.target !== el) return; el.removeEventListener(type, done); fn(); });
  }
  function openSegment(next) {
    if (sliding || next === openSeg) return;
    if (next && !segCounts()[next]) return;  /* an empty segment stays shut (its accordion is disabled) */
    if (!window.Nimbus || !Nimbus.Collapse) { openSeg = next; render(); return; }
    var prev = openSeg;
    openSeg = next;
    markHeaders();
    sliding = true;
    var showNext = function () {
      if (!next) { sliding = false; return; }
      once(document.getElementById("hsSeg-" + next), "shown.cnds.collapse", function () { sliding = false; });
      collapseOf(next).show();
    };
    if (prev) { once(document.getElementById("hsSeg-" + prev), "hidden.cnds.collapse", showNext); collapseOf(prev).hide(); }
    else showNext();
  }

  /* ── Row details: Collapse events ───────────────────────────────────── */
  function slideDetails(id, forceOpen) {
    var el = document.getElementById("det-" + id);
    if (!el || !window.Nimbus || !Nimbus.Collapse) { expanded[id] = forceOpen || !expanded[id]; render(); return; }
    var c = Nimbus.Collapse.getOrCreateInstance(el, { toggle: false });
    if (forceOpen) c.show(); else c.toggle();
  }
  /* The source id of a row-details collapse event, or null for any other collapse (segments, Nimbus widgets). */
  function detailsId(e) { var id = e.target.id || ""; return id.indexOf("det-") === 0 ? id.slice(4) : null; }
  /* The open fill goes on as the row starts opening and comes off as it starts closing (CSS fades it). */
  function markOpen(e, open) {
    if (!detailsId(e)) return;
    var li = e.target.closest(".list-group-item");
    if (li) li.classList.toggle("hs-open", open);
  }
  /* When the slide ends: remember the state, and flip VIEW / HIDE and its aria. */
  function syncDetails(e, open) {
    var id = detailsId(e);
    if (!id) return;
    expanded[id] = open;
    var b = document.querySelector('[data-expand="' + id + '"]');
    if (!b) return;
    b.textContent = open ? "HIDE" : "VIEW";
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(View|Hide)/, open ? "Hide" : "View"));
  }
  document.addEventListener("show.cnds.collapse", function (e) { markOpen(e, true); });
  document.addEventListener("hide.cnds.collapse", function (e) { markOpen(e, false); });
  document.addEventListener("shown.cnds.collapse", function (e) { syncDetails(e, true); });
  document.addEventListener("hidden.cnds.collapse", function (e) { syncDetails(e, false); });

  /* ── Actions ────────────────────────────────────────────────────────── */
  /* Demo: a refresh reads the canned next state (refreshTo) if there is one; otherwise nothing changed. */
  function refreshSource(s) {
    if (s.refreshTo) {
      s.hold = s.refreshTo.hold;
      s.lastReadText = s.refreshTo.lastReadText;
      s.provisional = false;
      s.history.push(stamp("Source refreshed · Purview reads Applied", me(), s.refreshTo.event));
      delete s.refreshTo;
      s.reason = "Purview reads Applied again. The exception stays open until it is resolved with a reason.";
      D.toast("Source refreshed. Purview reads Applied.");
    } else {
      if (s.regime === "integrity") s.lastReadText = "Verified just now";
      D.toast("Source refreshed. The status has not changed.");
    }
    expanded[s.id] = true;
    render();
  }
  /* Who and what a dialog acts on, at the top of its body (PM, 10-14: the dialog covers the row, and the action
     matters enough to restate it). The person follows the region rule. An orphan hold's person is not a custodian
     of this case, so the label is "Person". */
  function dialogContext(s) {
    var src = typeLabel(s);
    if (isDevice(s)) src += " · " + s.name.replace(/^(Laptop|Mobile) /, "");
    else if (!s.owner) src += " · " + s.name;
    var rows = [["Source", esc(src)]];
    if (s.owner) rows.push([s.exception && s.exception.type === "Orphan hold" ? "Person" : "Custodian", personHtml(M.person(s.owner))]);
    if (s.exception) rows.push(["Exception", esc(s.exception.type)]);
    return kv(rows);
  }
  /* Acknowledge / Resolve / Mute: a required reason (D.reasonDialog), recorded on the exception and as an event. */
  var LIFECYCLE = {
    Acknowledged: { verb: "ACKNOWLEDGE", effect: "The exception is set to Acknowledged. The source stays in Needs Attention until the exception is resolved." },
    Resolved:     { verb: "RESOLVE",     effect: "The exception is set to Resolved. The source leaves Needs Attention when its status is clean." },
    Muted:        { verb: "MUTE",        effect: "The exception is set to Muted. A new exception of the same type on this source reopens it." }
  };
  function lifecycle(s, to) {
    var L = LIFECYCLE[to];
    D.reasonDialog({ title: L.verb.charAt(0) + L.verb.slice(1).toLowerCase() + " Exception", extra: dialogContext(s), effect: L.effect, confirm: L.verb })
      .then(function (r) {
        if (!r) return;
        var before = M.segmentOf(s);
        s.exception.status = to;
        if (to !== "Acknowledged") s.exception.closed = { on: M.DEMO_TODAY, by: me(), reason: r.reason };
        s.history.push(stamp("Exception " + to.toLowerCase(), me(), r.reason));
        var after = M.segmentOf(s);
        D.toast("Exception " + to.toLowerCase() + "." + (after !== before ? " The source moved to " + SEGS.filter(function (g) { return g.id === after; })[0].name + "." : ""));
        render();
      });
  }
  /* Orphan hold → link it to an open case in the viewer's region. Resolves the exception; the hold is untouched. */
  function linkToCase(s) {
    var v = D.viewer();
    var options = M.cases.filter(function (c) { return (c.status === "Open" && c.region === v.region) || c.id === D.caseId; })
      .map(function (c) { return [c.id, c.id + " · " + c.name]; });
    D.reasonDialog({
      title: "Link Hold to a Case",
      extra: dialogContext(s) + '<p class="mb-3">The hold is recorded against the selected case as a non-custodial held source.</p>' +
        D.select("hsLinkCase", options, D.caseId, "Case", { container: "{{modal}}", cls: "mb-3" }),
      effect: "The orphan hold exception is set to Resolved. The hold itself does not change.", confirm: "LINK TO CASE"
    }).then(function (r) {
      if (!r) return;
      var cid = r.dialog.querySelector("#hsLinkCase").value;
      s.exception.status = "Resolved";
      s.exception.closed = { on: M.DEMO_TODAY, by: me(), reason: "Linked to " + cid + ". " + r.reason };
      s.request = "Linked by " + me();
      s.history.push(stamp("Hold linked to " + cid, me(), r.reason));
      D.toast("Hold linked to " + cid + ". The source moved to On Hold, Confirmed.");
      render();
    });
  }
  /* Sources CaseFusion cannot read are vouched for by their owning team, through the Request Portal. */
  function requestAttestation(s) {
    var to = s.attestation && s.attestation.by ? s.attestation.by : (s.type === "Box" ? "Enterprise Content" : "Collaboration Apps");
    s.attestRequested = true;
    s.history.push(stamp("Attestation requested from " + to, me(), "The request is in their Request Portal queue."));
    D.toast("Attestation requested from " + to + ". The request is in their Request Portal queue.");
    render();
  }
  /* Demo: CSV built in the browser. Limited profiles stay limited in the export. */
  function exportCsv() {
    var head = ["Source", "Subject", "Segment", "Status", "Evidence", "Exception", "Exception state", "Last read"];
    var cell = function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; };
    var lines = [head.join(",")].concat(sources.map(function (s) {
      /* Subject is the owner for every owned source, devices included; otherwise the source's own name. */
      var subj = !s.owner ? s.name : D.canSee(M.person(s.owner)) ? M.person(s.owner).name : "Profile details limited";
      return [typeLabel(s), subj, M.segmentOf(s), s.hold, s.evidence, s.exception ? s.exception.type : "", s.exception ? s.exception.status : "", lastReadMain(s)].map(cell).join(",");
    }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "hold-status-" + D.caseId + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    D.toast("Hold status exported for " + D.caseId + ".");
  }
  /* How hold status works: a flyout (Nimbus offcanvas), so the reader keeps their place. Copy: hold-status-help.js. */
  function openHelp() {
    var H = window.HoldStatusHelp;
    D.offcanvas({ title: "How Hold Status Works", width: "50vw",
      body: '<p class="text-muted mb-3">' + esc(H.lede) + "</p>" + H.html,
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' });
  }

  /* ── Click routing ──────────────────────────────────────────────────── */
  /* Row and card buttons carry data-act + data-id; page controls carry their own data attribute. */
  var ACTIONS = {
    refresh: refreshSource,
    errors:  function (s) { slideDetails(s.id, true); },
    ack:     function (s) { lifecycle(s, "Acknowledged"); },
    resolve: function (s) { lifecycle(s, "Resolved"); },
    mute:    function (s) { lifecycle(s, "Muted"); },
    link:    linkToCase,
    attest:  requestAttestation,
    events:  openEvents
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    if (t.hasAttribute("data-hs-help")) { e.preventDefault(); openHelp(); return; }
    if (t.matches(".demo-tile[data-seg]")) { openSegment(t.getAttribute("data-seg")); return; }
    if (t.hasAttribute("data-expand")) { slideDetails(t.getAttribute("data-expand")); return; }
    if (t.hasAttribute("data-seg-toggle")) { var g = t.getAttribute("data-seg-toggle"); openSegment(openSeg === g ? null : g); return; }
    if (t.hasAttribute("data-hs-refresh-case")) { integrityText = "Integrity verified just now"; render(); D.toast("Case refreshed. " + sources.length + " sources read."); return; }
    if (t.hasAttribute("data-hs-export")) { exportCsv(); return; }
    var fn = ACTIONS[t.getAttribute("data-act")], s = fn && byId(t.getAttribute("data-id"));
    if (s) fn(s);
  });

  /* Demo start: Needs Attention open, with the OneDrive row's details showing (the story's first stop). */
  expanded["s-od-torres"] = true;
  render();
}());
