/* ═══════════════════════════════════════════════════════════════════════
   Hold status controller (PRD 07 §7.1).
   One copy of the case's sources in memory; tiles, group rows and footer
   are recomputed from it after every action, so the partition always sums.
   This screen reads and records. It never places, changes or releases a
   hold: a hold changes in Purview, or through a request.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc;

  var SEGS = [
    { id: "attention", name: "Needs Attention",    sub: "Someone has to act" },
    { id: "confirmed", name: "On Hold, Confirmed", sub: "Read from the platform" },
    { id: "attested",  name: "Attested",           sub: "Vouched for, not readable" },
    { id: "imported",  name: "Imported",           sub: "From a record, not a reading" },
    { id: "unknown",   name: "Unknown",            sub: "No reliable signal" }
  ];
  var TYPE_LABEL = { "Exchange Online": "Exchange mailbox", "OneDrive": "OneDrive", "Microsoft Teams": "Teams team",
    "SharePoint": "SharePoint site", "Copilot interactions": "Copilot interactions", "Box": "Box folder", "Webex": "Webex space",
    "File share": "File share", "Laptop": "Laptop", "Mobile device": "Mobile device" };
  /* Least protected first. */
  var SEVERITY = { "Not applied": 0, "Overdue": 1, "Partial": 2, "Applying": 3, "Removing": 3, "Unknown": 4, "Applied": 5, "Attested": 6 };

  var sources = JSON.parse(JSON.stringify(M.holdStatusSources()));
  sources.forEach(function (s) { s.history = (s.log || []).slice(); });
  var openSeg = "attention";
  var expanded = {};
  var flash = null;
  var integrityText = "Integrity verified " + M.freshness.integrityAgo;

  function byId(id) { return sources.filter(function (s) { return s.id === id; })[0]; }
  function segCounts() {
    var c = { attention: 0, confirmed: 0, attested: 0, imported: 0, unknown: 0 };
    sources.forEach(function (s) { c[M.segmentOf(s)]++; });
    return c;
  }
  function openExc(s) { return s.exception && (s.exception.status === "Open" || s.exception.status === "Acknowledged"); }

  /* ── Cells ──────────────────────────────────────────────────────────── */
  function subject(s) {
    if (s.type === "Laptop" || s.type === "Mobile device") {
      var who = s.owner ? M.person(s.owner) : null;
      return esc(s.name.replace(/^(Laptop|Mobile) /, "")) + " · " + esc(s.team || "") +
        (who ? '<br><span class="' + (D.canSee(who) ? "" : "demo-masked") + '">' + (D.canSee(who) ? "" : '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>') + esc(D.nameFor(who)) + "</span>" : "");
    }
    if (s.owner) {
      var p = M.person(s.owner);
      return D.canSee(p) ? esc(p.name) : '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>';
    }
    return esc(s.name);
  }
  function pill(s) {
    var cls = { "Applied": "ok", "Attested": "info", "Partial": "warn", "Applying": "warn", "Removing": "warn",
      "Not applied": "bad", "Overdue": "bad", "Unknown": "muted" }[s.hold] || "muted";
    /* Microsoft's status words verbatim (PRD 07 H20): badge-verbatim keeps every Nimbus badge text style but the forced capitals (gap #10). */
    return '<span class="badge badge-pill badge-verbatim badge-' + window.MeridianDemo.badgeColor[cls] + '">' + esc(s.hold) + "</span>";
  }
  function excBadge(s) {
    if (!s.exception) return "";
    if (s.exception.status === "Resolved" || s.exception.status === "Muted") return "";
    /* Exception badge is square; the hold status beside it is a pill (PM mockup). */
    return '<span class="badge badge-default ms-1">EXCEPTION · ' + esc(s.exception.status.toUpperCase()) + "</span>";
  }
  function lastRead(s) {
    var main, extra = "";
    if (s.lastReadText) main = s.lastReadText;
    else if (s.regime === "integrity") main = "Verified 11 min ago";
    else if (s.regime === "snapshot") main = "Snapshot of " + M.fmtDate(M.freshness.snapshot).replace(/ \d{4}$/, "");
    else if (s.regime === "none") main = "Never read";
    else main = "—";
    if (s.provisional) extra = '<span class="d-block small fw-bold text-warning">Provisional</span>';
    if (s.dueText) extra += '<span class="d-block small ' + (s.hold === "Overdue" ? "text-danger" : "text-muted") + '">' + esc(s.dueText) + "</span>";
    return "<div>" + esc(main) + "</div>" + extra;
  }
  function primaryAction(s) {
    if (s.locationErrors && s.hold === "Partial") return { act: "errors", label: "VIEW ERRORS" };
    if (s.exception && s.exception.type === "Orphan hold" && openExc(s)) return { act: "link", label: "LINK TO CASE" };
    if (s.hold === "Overdue" || s.hold === "Unknown" || s.hold === "Attested") return { act: "attest", label: s.attestRequested ? "REQUESTED" : "REQUEST ATTESTATION" };
    return { act: "refresh", label: "REFRESH SOURCE" };
  }
  function needsReason(s) { return s.reason && (M.segmentOf(s) === "attention" || M.segmentOf(s) === "unknown"); }

  /* ── Render ─────────────────────────────────────────────────────────── */
  function renderFresh() {
    var t = integrityText + " · snapshot of " + M.fmtDate(M.freshness.snapshot) + ", ingested " + M.freshness.snapshotIngested +
      " · next expected " + M.fmtDate(M.freshness.nextSnapshot);
    /* Sentence case, with a new sentence after each separator dot (Scott, 10-14). */
    t = t.replace(/(^|· )([a-z])/g, function (m, pre, ch) { return pre + ch.toUpperCase(); });
    document.getElementById("hsFresh").textContent = t;
    document.getElementById("hsFresh2").textContent = t;
  }
  /* Card labels are Title Case: every word capitalised, short words included (house rule). */
  function titleCase(t) { return t.replace(/(^|[\s,(])([a-z])/g, function (m, pre, ch) { return pre + ch.toUpperCase(); }); }
  function renderTiles(c) {
    document.getElementById("hsTiles").innerHTML = SEGS.map(function (g) {
      /* Needs attention is always the danger card (Scott, 10-14); the others keep the default and selected styles. */
      var danger = g.id === "attention", empty = !c[g.id];
      return '<button type="button" class="card ' + (danger ? "card-outline card-danger" : "card-basic") + ' demo-tile" data-seg="' + g.id + '"' + (danger ? ' data-tone="danger"' : "") + ' aria-pressed="' + (g.id === openSeg) + '"' + (empty ? " disabled" : "") + ">" +
        '<span class="card-subtitle demo-tile-name">' + esc(titleCase(g.name)) + "</span>" +
        '<span class="card-title demo-tile-value">' + c[g.id] + "</span>" +
        '<span class="card-text demo-tile-label">' + esc(g.sub) + "</span></button>";
    }).join("");
  }
  function summary(id, rows) {
    if (id === "confirmed") return "Read from Purview · " + integrityText.toLowerCase().replace("integrity ", "") + " · nothing outstanding";
    if (id === "imported") return "No source on this case was imported from a prior tool";
    if (!rows.length) return "None";
    var names = rows.map(function (s) {
      if (s.owner && !D.canSee(M.person(s.owner))) return TYPE_LABEL[s.type] + " · profile details limited";
      return (TYPE_LABEL[s.type] || s.type) + (s.owner && !/Laptop|Mobile/.test(s.type) ? " · " + M.person(s.owner).name : "");
    });
    if (id === "attested") return names.join(" and ") + " · next attestation due 11-01-2026";
    if (id === "unknown") return names.join(" and ") + " · never attested";
    return names.join(", ");
  }
  /* Source row (Scott, 10-14): three columns — Source, Status, Last read — each value column labelled in the row
     itself (no header row), then a blurry divider and the row's stacked actions. Status keeps its context on one line:
     hold badge, exception badge and exception type, with the reason underneath. */
  function rowHtml(s) {
    var a = primaryAction(s);
    var open = !!expanded[s.id];
    var live = s.exception && openExc(s);
    return '<li class="list-group-item' + (open ? " hs-open" : "") + '" id="row-' + s.id + '"><div class="hs-row">' +
        '<div class="hs-id"><span class="d-block fw-bold">' + esc(TYPE_LABEL[s.type] || s.type) + '</span><span class="d-block small text-muted">' + subject(s) + "</span></div>" +
        '<div class="hs-status"><span class="hs-col-label">Status</span><div class="d-flex flex-wrap align-items-center gap-1">' + pill(s) + excBadge(s) +
            (live ? '<span class="small fw-bold text-danger ms-1">' + esc(s.exception.type) + "</span>" : "") + "</div>" +
          (needsReason(s) ? '<div class="mt-1">' + esc(s.reason) + (s.attestRequested ? " Attestation requested " + esc(M.fmtDate(M.DEMO_TODAY)) + "." : "") + "</div>" : "") + "</div>" +
        '<div><span class="hs-col-label">Last read</span>' + lastRead(s) + "</div>" +
        '<div class="vr vr-blurry" aria-hidden="true"></div>' +
        '<div class="hs-actions">' + (a.label === "REQUESTED" ? '<button type="button" class="btn btn-tertiary btn-sm" disabled>REQUESTED</button>' :
          '<button type="button" class="btn btn-tertiary btn-sm" data-act="' + a.act + '" data-id="' + s.id + '">' + a.label + "</button>") +
          '<button type="button" class="btn btn-tertiary btn-sm" data-expand="' + s.id + '" aria-expanded="' + open + '" aria-controls="det-' + s.id + '" aria-label="' + (open ? "Hide" : "View") + " details for " + esc(TYPE_LABEL[s.type] || s.type) + '">' + (open ? "HIDE" : "VIEW") + "</button></div>" +
      "</div>" + '<div class="collapse' + (open ? " show" : "") + '" id="det-' + s.id + '">' + detailHtml(s) + "</div></li>";
  }
  /* Card metadata: 12px bold labels, 14px values (type scale, Scott 10-14). */
  function kv(pairs) { return '<dl class="row mb-2 hs-kv">' + pairs.map(function (p) { return '<dt class="col-4 fw-bold">' + p[0] + '</dt><dd class="col-8 mb-1">' + p[1] + "</dd>"; }).join("") + "</dl>"; }
  /* Detail cards: Nimbus card title, no category heading; card-actions take mt-auto so every card's buttons sit
     on the bottom edge and line up across the row; all card buttons are small tertiary, right-aligned (Scott, 10-14). */
  function block(title, body, count) {
    /* count → a secondary badge across from the card title (the Events card's total, Scott 10-14). */
    /* Title in the column-label style (12px, bold, uppercase, muted), not Card/Title: the cards are detail of
       the source row, so they rank below its 14px name (Sally, Scott 10-14). Every card gets the same head row,
       so the first line of content lines up across the three cards whether or not a badge is present.
       A div with heading semantics, not an h4: Nimbus card heading rules would override the label type. */
    var head = '<div class="hs-dcard-head"><div class="hs-col-label" role="heading" aria-level="4">' + title + "</div>" +
      (count ? '<span class="badge badge-secondary" aria-label="' + count + ' events">' + count + "</span>" : "") + "</div>";
    return '<div class="col-md-4"><div class="card card-outline h-100 hs-dcard"><div class="card-body">' + head + body + "</div></div></div>";
  }
  /* A labelled list inside a detail card: solid rule above, flush rows with blurry dividers; 14px rows, 12px meta. */
  function activity(label, items) {
    return '<div class="hs-activity"><hr class="hr hr-blurry mb-3"><div class="hs-col-label">' + label + '</div><ul class="list-group list-group-flush">' + items.join(BLUR) + "</ul></div>";
  }
  /* The Event card shows the newest three events; the full list opens in a side panel (Sally, Scott 10-14).
     Three, not one: the latest event often needs the one that caused it beside it. */
  var EVENTS_SHOWN = 3;
  /* Rows inside a card are separated by the Nimbus blurry divider, not list borders (Scott 10-14). */
  var BLUR = '<li class="hs-row-divider" aria-hidden="true"><hr class="hr hr-blurry"></li>';
  function eventItems(s) {
    return s.history.slice().reverse().map(function (h) {
      /* Title runs full width; the date sits with the person on the second line (Scott 10-14). */
      return '<li class="list-group-item"><div class="hs-act-what">' + esc(h.what) + "</div>" +
        '<div class="hs-act-meta">' + esc(when(h)) + " · by " + esc(h.by) + "</div>" + (h.note ? '<div class="hs-act-note">' + esc(h.note) + "</div>" : "") + "</li>"; });
  }
  function subjectOf(s) {
    if (s.owner && !D.canSee(M.person(s.owner))) return "Profile details limited";
    return s.owner && !/Laptop|Mobile/.test(s.type) ? M.person(s.owner).name : s.name;
  }
  function openEvents(s) {
    D.offcanvas({ title: (TYPE_LABEL[s.type] || s.type) + " · " + subjectOf(s), width: "30vw",
      /* Total across from a small EVENTS label, the same badge as the card title (Scott 10-14). */
      body: '<div class="hs-dcard-head hs-panel-head"><span class="hs-col-label">Events</span><span class="badge badge-secondary" aria-label="' + s.history.length + ' events">' + s.history.length + "</span></div>" +
        '<ul class="list-group list-group-flush hs-events hs-events-panel">' + eventItems(s).join(BLUR) + "</ul>",
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' });
  }
  function detailHtml(s) {
    var c = M.caseById(D.caseId);
    /* Event card: one list of events, newest first, every entry the same shape (what · when · by · note).
       No events → the CaseFusion empty state, like the Exception card. Locations follow as their own list. */
    var all = eventItems(s), events = all.slice(0, EVENTS_SHOWN);
    var ev = block("Events",
      (events.length ? '<ul class="list-group list-group-flush hs-events">' + events.join(BLUR) + "</ul>" +
        (all.length > EVENTS_SHOWN ? '<div class="card-actions mt-auto justify-content-end"><button type="button" class="btn btn-tertiary btn-sm" data-act="events" data-id="' + s.id +
          '" aria-label="View all ' + all.length + ' events for ' + esc(TYPE_LABEL[s.type] || s.type) + '">VIEW ALL EVENTS</button></div>' : "") :
        '<div class="hs-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="hs-empty-title">No events recorded</span>' +
        '<span class="hs-empty-note">No reading or attestation exists for this source.</span></div>') +
      (s.locationErrors ? activity("Locations", s.locationErrors.map(function (l) {
        var bad = /^Error/.test(l.status);
        return '<li class="list-group-item"><div class="hs-act-head"><span class="hs-act-what">' + esc(l.location.split("/").pop()) + "</span>" +
          '<span class="hs-act-when' + (bad ? " text-danger" : "") + '">' + esc(bad ? "Error" : l.status) + "</span></div>" +
          '<div class="hs-act-meta">' + esc(l.location) + "</div>" + (bad ? '<div class="hs-act-note">' + esc(l.status.replace(/^Error · (.)/, function (m, c) { return c.toUpperCase(); })) + "</div>" : "") + "</li>"; })) : ""), all.length);
    /* Exception card is always present, so the three cards keep their places (Sally, Scott 10-14):
       open → its detail and actions; closed → the record of who closed it and why; none → an all-clear. */
    var ex = "";
    var clear = { confirmed: "Purview reads Applied. Nothing is outstanding.", attested: "The latest attestation is current. Nothing is outstanding.",
      imported: "The status is imported from a prior tool's record. Nothing is outstanding.", unknown: "No reliable signal is available. No exception is open.", attention: "No exception is open." }[M.segmentOf(s)];
    if (s.exception && !openExc(s)) {
      var cl = s.exception.closed;
      ex = block("Exception", kv([["Type", esc(s.exception.type)], ["State", esc(s.exception.status)]].concat(cl ? [["Closed", esc(M.fmtDate(cl.on)) + " · by " + esc(cl.by)], ["Reason", esc(cl.reason)]] : [])));
    } else if (s.exception) {
      var live = openExc(s);
      ex = block("Exception", kv([["Type", esc(s.exception.type)], ["State", esc(s.exception.status)], ["Raised", esc(M.fmtDate(s.exception.since)) + " · by " + esc(s.raisedBy || "CaseFusion")],
          ["Notified", esc(s.notified || "Case Administrator")]]) +
        (live ? '<div class="card-actions mt-auto justify-content-end">' + (s.exception.status === "Open" ? '<button type="button" class="btn btn-tertiary btn-sm" data-act="ack" data-id="' + s.id + '">ACKNOWLEDGE</button>' : "") +
          '<button type="button" class="btn btn-tertiary btn-sm" data-act="resolve" data-id="' + s.id + '">RESOLVE</button>' +
          '<button type="button" class="btn btn-tertiary btn-sm" data-act="mute" data-id="' + s.id + '">MUTE</button></div>' : ""));
    } else ex = block("Exception",  /* CaseFusion empty-state pattern (persona profile): icon, bold title, muted reassurance, centred, no box */
      '<div class="hs-empty"><i class="mdi mdi-cancel cnds-icon-2xl" aria-hidden="true"></i><span class="hs-empty-title">No open exception</span>' +
      '<span class="hs-empty-note">' + esc(clear) + "</span></div>");
    var hold = block("Hold", kv([["Case", esc(c.id + " " + c.name)], ["Kind", esc(s.kind || "Source hold")], ["Placed in", esc(s.placedIn || "Unknown")],
        ["Last read", esc(s.lastReadText || (s.regime === "integrity" ? "Verified 11 min ago" : s.regime === "snapshot" ? "Snapshot of 09-14-2026" : "Never read"))]]) +
      (s.evidence === "read" ? '<div class="card-actions mt-auto justify-content-end"><button type="button" class="btn btn-tertiary btn-sm" data-act="refresh" data-id="' + s.id + '">REFRESH SOURCE</button></div>' : ""));
    return '<div class="row g-2 mt-3">' + ev + ex + hold + "</div>";
  }
  /* Segment accordion: one open at a time. The open segment slides shut first, then the next
     slides open (Nimbus Collapse, driven here rather than by data-cnds-parent, which runs both at once). */
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
  function openSegment(next) {
    if (sliding || next === openSeg) return;
    if (next && !segCounts()[next]) return;  /* an empty category stays shut (its accordion is disabled) */
    if (!window.Nimbus || !Nimbus.Collapse) { openSeg = next; render(); return; }
    var prev = openSeg;
    openSeg = next;
    markHeaders();
    var showNext = function () {
      if (!next) { sliding = false; return; }
      var el = document.getElementById("hsSeg-" + next);
      el.addEventListener("shown.cnds.collapse", function done(e) { if (e.target !== el) return; el.removeEventListener("shown.cnds.collapse", done); sliding = false; });
      collapseOf(next).show();
    };
    sliding = true;
    if (prev) {
      var pel = document.getElementById("hsSeg-" + prev);
      pel.addEventListener("hidden.cnds.collapse", function done(e) { if (e.target !== pel) return; pel.removeEventListener("hidden.cnds.collapse", done); showNext(); });
      collapseOf(prev).hide();
    } else showNext();
  }
  /* One accordion item per segment (Nimbus accordion), state kept here. */
  function render() {
    var c = segCounts();
    renderTiles(c);
    renderFresh();
    /* Each category is a standalone Nimbus accordion (Scott, 10-14), stacked with a gap. One open at a time still. */
    var html = '<div class="hs-seg-stack">';
    SEGS.forEach(function (g) {
      var rows = sources.filter(function (s) { return M.segmentOf(s) === g.id; })
        .sort(function (a, b) { return (a.hold in SEVERITY ? SEVERITY[a.hold] : 9) - (b.hold in SEVERITY ? SEVERITY[b.hold] : 9); });
      var isOpen = g.id === openSeg;
      /* Every segment's rows are rendered, so Nimbus Collapse can slide them open and shut. */
      html += '<div class="accordion accordion-casefusion"><div class="accordion-item"><h3 class="accordion-header"><button type="button" class="accordion-button' + (isOpen ? "" : " collapsed") + '" data-seg-toggle="' + g.id + '" aria-controls="hsSeg-' + g.id + '" aria-expanded="' + isOpen + '"' + (rows.length ? "" : " disabled") + ">" +
        /* Title over a second-line summary; the count sits at the right end of the header, before the chevron. */
        '<span class="hs-seg-text"><span class="d-block hs-seg-title">' + esc(g.name) + "</span>" +
        '<span class="d-block small text-muted" data-seg-summary data-open="Sort by: least protected first" data-closed="' + esc(summary(g.id, rows)) + '">' + esc(isOpen ? "Sort by: least protected first" : summary(g.id, rows)) + "</span></span>" +
        '<span class="badge badge-secondary hs-seg-count">' + rows.length + "</span></button></h3>" +
        '<div class="accordion-collapse collapse' + (isOpen ? " show" : "") + '" id="hsSeg-' + g.id + '"><div class="accordion-body p-0">' + '<ul class="list-group list-group-flush hs-list">' + rows.map(rowHtml).join("") + "</ul></div></div></div></div>";
    });
    document.getElementById("hsTable").innerHTML = html + "</div>";
    document.getElementById("hsFooterCount").textContent =
      sources.length + " sources on this case · " + c.attention + " need attention · " + c.confirmed + " read as held · " +
      c.attested + " attested · " + c.imported + " imported · " + c.unknown + " unknown";
    flash = null;
  }

  /* Details slide open and shut with Nimbus Collapse; the toggle's label follows when the slide ends. */
  function slideDetails(id, forceOpen) {
    var el = document.getElementById("det-" + id);
    if (!el || !window.Nimbus || !Nimbus.Collapse) { expanded[id] = forceOpen || !expanded[id]; render(); return; }
    var c = Nimbus.Collapse.getOrCreateInstance(el, { toggle: false });
    if (forceOpen) c.show(); else c.toggle();
  }
  function syncDetails(e, open) {
    if (!e.target.id || e.target.id.indexOf("det-") !== 0) return;
    var id = e.target.id.slice(4), b = document.querySelector('[data-expand="' + id + '"]');
    expanded[id] = open;
    if (b) {  /* VIEW / HIDE, by convention (Scott, 10-14); the aria-label says what is shown */
      b.textContent = open ? "HIDE" : "VIEW"; b.setAttribute("aria-expanded", String(open));
      b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(View|Hide)/, open ? "Hide" : "View"));
    }
  }
  /* The open fill goes on as the row starts opening and comes off as it starts closing, so it never trails the slide. */
  function markOpen(e, open) {
    if (!e.target.id || e.target.id.indexOf("det-") !== 0) return;
    var li = e.target.closest(".list-group-item");
    if (li) li.classList.toggle("hs-open", open);
  }
  document.addEventListener("show.cnds.collapse", function (e) { markOpen(e, true); });
  document.addEventListener("hide.cnds.collapse", function (e) { markOpen(e, false); });
  document.addEventListener("shown.cnds.collapse", function (e) { syncDetails(e, true); });
  document.addEventListener("hidden.cnds.collapse", function (e) { syncDetails(e, false); });

  /* ── Actions ────────────────────────────────────────────────────────── */
  /* One activity entry: what happened, when, who did it, and the note they left (newest shown first). */
  function stamp(what, by, note) { return { on: M.DEMO_TODAY, time: "09:42", what: what, by: by, note: note || "" }; }
  /* House date format: mm-dd-yyyy, and a time beside a date is 12-hour joined by "at" (10-03-2026 at 11:20 AM). */
  function when(h) { return M.fmtDateTime(h.on, h.time); }

  function me() { return M.person(D.viewer().personId).name; }

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
     matters enough to restate it). The custodian follows the viewer's region rule: a limited profile shows the
     lock and "Profile details limited", as in the row. An orphan hold's person is not a custodian of this case. */
  function dialogContext(s) {
    var src = TYPE_LABEL[s.type] || s.type;
    if (s.type === "Laptop" || s.type === "Mobile device") src += " · " + s.name.replace(/^(Laptop|Mobile) /, "");
    else if (!s.owner) src += " · " + s.name;
    var rows = [["Source", esc(src)]];
    if (s.owner) {
      var p = M.person(s.owner);
      rows.push([s.exception && s.exception.type === "Orphan hold" ? "Person" : "Custodian",
        D.canSee(p) ? esc(p.name) : '<span class="demo-masked"><i class="mdi mdi-lock-outline" aria-hidden="true"></i>Profile details limited</span>']);
    }
    if (s.exception) rows.push(["Exception", esc(s.exception.type)]);
    return kv(rows);
  }
  function lifecycle(s, to) {
    var effect = {
      Acknowledged: "The exception is set to Acknowledged. The source stays in Needs Attention until the exception is resolved.",
      Resolved: "The exception is set to Resolved. The source leaves Needs Attention when its status is clean.",
      Muted: "The exception is set to Muted. A new exception of the same type on this source reopens it."
    }[to];
    var verb = { Acknowledged: "ACKNOWLEDGE", Resolved: "RESOLVE", Muted: "MUTE" }[to];
    D.reasonDialog({ title: verb.charAt(0) + verb.slice(1).toLowerCase() + " Exception", extra: dialogContext(s),
      effect: effect, confirm: verb }).then(function (r) {
      if (!r) return;
      var before = M.segmentOf(s);
      s.exception.status = to;
      if (to !== "Acknowledged") s.exception.closed = { on: M.DEMO_TODAY, by: me(), reason: r.reason };
      s.history.push(stamp("Exception " + to.toLowerCase(), me(), r.reason));
      var after = M.segmentOf(s);
      if (after !== before) { flash = s.id; D.toast("Exception " + to.toLowerCase() + ". The source moved to " + SEGS.filter(function (g) { return g.id === after; })[0].name + "."); }
      else D.toast("Exception " + to.toLowerCase() + ".");
      render();
    });
  }
  function linkToCase(s) {
    var v = D.viewer();
    var options = M.cases.filter(function (c) { return (c.status === "Open" && c.region === v.region) || c.id === D.caseId; })
      .map(function (c) { return [c.id, c.id + " · " + c.name]; });
    D.reasonDialog({
      title: "Link Hold to a Case",
      extra: dialogContext(s) + '<p class="mb-3">The hold is recorded against the selected case as a non-custodial held source.</p>' + D.select("hsLinkCase", options, D.caseId, "Case", { container: "{{modal}}", cls: "mb-3" }),
      effect: "The orphan hold exception is set to Resolved. The hold itself does not change.", confirm: "LINK TO CASE"
    }).then(function (r) {
      if (!r) return;
      var cid = r.dialog.querySelector("#hsLinkCase").value;
      s.exception.status = "Resolved";
      s.exception.closed = { on: M.DEMO_TODAY, by: me(), reason: "Linked to " + cid + ". " + r.reason };
      s.request = "Linked by " + me();
      s.history.push(stamp("Hold linked to " + cid, me(), r.reason));
      flash = s.id;
      D.toast("Hold linked to " + cid + ". The source moved to On Hold, Confirmed.");
      render();
    });
  }
  function requestAttestation(s) {
    var to = s.attestation && s.attestation.by ? s.attestation.by : (s.type === "Box" ? "Enterprise Content" : "Collaboration Apps");
    s.attestRequested = true;
    s.history.push(stamp("Attestation requested from " + to, me(), "The request is in their Request Portal queue."));
    D.toast("Attestation requested from " + to + ". The request is in their Request Portal queue.");
    render();
  }
  function exportCsv() {
    var head = ["Source", "Subject", "Segment", "Status", "Evidence", "Exception", "Exception state", "Last read"];
    var lines = [head.join(",")].concat(sources.map(function (s) {
      var subj = s.owner && !D.canSee(M.person(s.owner)) ? "Profile details limited" : (s.owner ? M.person(s.owner).name : s.name);
      return [TYPE_LABEL[s.type] || s.type, subj, M.segmentOf(s), s.hold, s.evidence, s.exception ? s.exception.type : "", s.exception ? s.exception.status : "",
        s.lastReadText || (s.regime === "integrity" ? "Verified 11 min ago" : s.regime === "snapshot" ? "Snapshot of 09-14-2026" : "Never read")]
        .map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(",");
    }));
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hold-status-" + D.caseId + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    D.toast("Hold status exported for " + D.caseId + ".");
  }

  /* How hold status works: a flyout (Nimbus offcanvas), so the reader keeps their place. */
  function openHelp() {
    var H = window.HoldStatusHelp;
    D.offcanvas({ title: "How Hold Status Works", width: "50vw",
      body: '<p class="text-muted mb-3">' + esc(H.lede) + "</p>" + H.html,
      footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="offcanvas">CLOSE</button>' });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    if (t.hasAttribute("data-hs-help")) { e.preventDefault(); openHelp(); return; }
    if (t.matches(".demo-tile[data-seg]")) { openSegment(t.getAttribute("data-seg")); return; }
    if (t.hasAttribute("data-expand")) { slideDetails(t.getAttribute("data-expand")); return; }
    if (t.hasAttribute("data-seg-toggle")) {
      var g = t.getAttribute("data-seg-toggle");
      openSegment(openSeg === g ? null : g); return;
    }
    if (t.hasAttribute("data-hs-refresh-case")) { integrityText = "Integrity verified just now"; render(); D.toast("Case refreshed. " + sources.length + " sources read."); return; }
    if (t.hasAttribute("data-hs-export")) { exportCsv(); return; }
    var act = t.getAttribute("data-act");
    if (!act) return;
    var s = byId(t.getAttribute("data-id"));
    if (act === "refresh") refreshSource(s);
    else if (act === "errors") slideDetails(s.id, true);
    else if (act === "ack") lifecycle(s, "Acknowledged");
    else if (act === "resolve") lifecycle(s, "Resolved");
    else if (act === "mute") lifecycle(s, "Muted");
    else if (act === "link") linkToCase(s);
    else if (act === "attest") requestAttestation(s);
    else if (act === "events") openEvents(s);
  });

  expanded["s-od-torres"] = true;
  render();
}());
