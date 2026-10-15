/* ═══════════════════════════════════════════════════════════════════════
   DEMO SHELL — renders the 1.6 app frame around every demo page.

   Load order on every page (end of <body>):
     data/meridian.js → js/demo/shell.js → js/nimbus.js → js/app.js
     → js/pages/frame-ca-sidenav.js → js/demo/<page>.js

   The shell runs before nimbus.js and the frame controller, so the markup
   they bind to (#caSidenav, #caHeader, menus) already exists when they run.

   <body> attributes the shell reads
     data-demo-nav   = mywork | tenant | cases | admin | preservation
     data-demo-tab   = overview | custodians | legalholds | surveys | interviews
                       | timeline | datamap | coverage | holdstatus | requests
                       (presence of a tab means this is a case page)
     data-demo-case  = case id (defaults to the primary case)

   A case page puts <div data-demo-case-header></div> where the case title,
   toolbar and tabs belong.

   Viewer switch: the account menu offers the demo viewers (Case Administrators in the US and Rest of world, and a
   US Case User for PRD 08 CV72). The choice is kept in localStorage per browser and the page
   reloads, so every screen re-renders for that viewer. Pages read it from
   MeridianDemo.viewer().
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var M = window.MERIDIAN;
  /* This script's cache stamp (?v=…), reused on avatar URLs so a stale or failed copy is never reused after a publish. */
  var STAMP = ((document.currentScript && document.currentScript.src.match(/\?v=\d+/)) || [""])[0];
  var KEY = "mbp-demo-viewer";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(name) {
    return name.split(" ").map(function (w) { return w.charAt(0); }).slice(0, 2).join("").toUpperCase();
  }

  /* ── Viewer ─────────────────────────────────────────────────────────── */
  /* ?viewer=v-us|v-row|v-cu opens any page as that persona (review guides link straight to a viewer's view); the
     choice is remembered like a pick from the account menu. */
  (function () {
    var q = /[?&]viewer=([\w-]+)/.exec(location.search);
    if (q && M.viewers.some(function (x) { return x.id === q[1]; })) { try { localStorage.setItem(KEY, q[1]); } catch (e) { /* private mode: default viewer */ } }
  }());
  function viewerId() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) { v = null; }
    return M.viewers.some(function (x) { return x.id === v; }) ? v : "v-us";
  }
  function viewer() {
    var id = viewerId();
    for (var i = 0; i < M.viewers.length; i++) if (M.viewers[i].id === id) return M.viewers[i];
    return M.viewers[0];
  }
  function setViewer(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* private window: switch lasts this page only */ }
    window.location.reload();
  }
  /** True when the viewer may see this person's full profile. */
  function canSee(person) {
    /* Guests and people without a home region are not region-scoped. */
    return !person || !person.region || person.region === viewer().region;
  }

  /* ── Routes ─────────────────────────────────────────────────────────── */
  var NAV = [
    { id: "mywork",       label: "My Work",         icon: "mdi-inbox-full",      href: "my-work.html" },
    { id: "tenant",       label: "Tenant Overview", icon: "mdi-home-account",    href: "not-in-demo.html?what=Tenant+Overview" },
    { id: "cases",        label: "My Cases",        icon: "mdi-folder-account",  href: "case-coverage.html" },
    { id: "admin",        label: "Admin",           icon: "mdi-shield-account",  href: "admin-source-types.html" },
    { id: "preservation", label: "Preservation",    icon: "mdi-archive-lock-outline", href: "not-in-demo.html?what=Preservation", roster: "Preservation adjudicator" }
  ];
  var TABS = [
    { id: "overview",    label: "Overview" },
    { id: "custodians",  label: "Custodians" },
    { id: "legalholds",  label: "Legal Holds" },
    { id: "surveys",     label: "Surveys" },
    { id: "interviews",  label: "Interviews" },
    { id: "timeline",    label: "Timeline" },
    { id: "datamap",     label: "Data Map",    href: "case-data-map.html" },
    { id: "coverage",    label: "Coverage",    href: "case-coverage.html" },
    { id: "holdstatus",  label: "Hold status", href: "case-hold-status.html" },
    { id: "requests",    label: "Requests",    href: "case-requests.html" }
  ];
  function tabHref(t) {
    return t.href || ("not-in-demo.html?what=" + encodeURIComponent(t.label) + "&ships=1");
  }

  /* ── Sidenav ────────────────────────────────────────────────────────── */
  function sidenavHtml(active) {
    var v = viewer();
    var items = NAV.filter(function (n) { return !n.roster || v.roles.indexOf(n.roster) !== -1; }).map(function (n) {
      var on = n.id === active;
      return '<li class="sidenav-item" title="' + esc(n.label) + '" data-original-title="' + esc(n.label) + '">' +
        '<a id="navlink_' + n.id + '" class="sidenav-link' + (on ? " active" : "") + '" href="' + n.href + '"' + (on ? ' aria-current="page"' : "") + '>' +
        '<i class="mdi ' + n.icon + ' mdi-18px me-2" aria-hidden="true"></i><span>' + esc(n.label) + '</span></a></li>';
    }).join("");
    return '<nav id="caSidenav" class="sidenav show" aria-label="Application navigation">' +
      '<div class="sidebar-header"><button type="button" id="caSidenavToggle" class="ca-nav-toggle" aria-label="Collapse navigation" aria-expanded="true" aria-controls="caSidenav">' +
      '<span class="mdi mdi-menu-open" aria-hidden="true"></span></button></div>' +
      '<ul class="sidenav-menu" id="caSidenavMenu">' + items + '</ul></nav>';
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  function headerHtml() {
    var v = viewer();
    var me = M.person(v.personId);
    var regionName = v.region === "US" ? "United States" : "Rest of world";
    var switchItems = M.viewers.map(function (x) {
      var p = M.person(x.personId);
      var on = x.id === v.id;
      return '<a class="account-menu-item' + (on ? " active" : "") + '" href="#" role="menuitem" data-demo-viewer="' + x.id + '">' +
        esc(p.name) + ' · ' + esc(x.roles[0]) + ' · ' + (x.region === "US" ? "United States" : "Rest of world") + '</a>';
    }).join("");
    return '<div class="sticky-top" id="caHeader">' +
      '<nav class="nav nav-cf-utility" id="UtilityNav" aria-label="Utility navigation">' +
        '<div class="fr_logo"><img src="../img/cf/core/logo_casefusion.svg" width="32" height="36" alt="CaseFusion" />' +
        '<div class="fr_product-name"><span class="product-bold">Case</span><span class="product-light">Fusion</span></div></div>' +
        '<div class="fr_tools">' +
          '<div class="nav-alert-popover-wrapper" id="navAlertWrapper">' +
            '<button type="button" class="nav-icon-btn" id="navBellBtn" aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false" aria-controls="navAlertPopover" title="Notifications">' +
            '<span class="mdi mdi-bell" id="navBellIcon" aria-hidden="true"></span><span class="nav-bell-badge" id="navBellBadge" aria-live="polite" aria-atomic="true"></span></button>' +
            '<div class="notif-popover" id="navAlertPopover" role="dialog" aria-label="Notifications" aria-hidden="true">' +
              '<div class="notif-header"><span class="notif-header-title">Notifications</span><div class="notif-header-counts">' +
              '<span class="notif-count-unread">0 Unread</span><span class="notif-header-divider"></span><span class="notif-count-total">0 Total</span></div></div>' +
              '<div class="notif-list" id="notifList"></div></div></div>' +
          '<span class="nav-cf-utility-divider" aria-hidden="true"></span>' +
          '<button type="button" class="nav-icon-btn" id="themeToggle" data-cnds-toggle="theme" aria-label="Toggle theme" title="Switch theme"><span class="mdi mdi-weather-night" aria-hidden="true"></span></button>' +
          /* Nimbus language switcher (styleguide cnds-header.html; Figma Nimbus/LanguageSwitcher). Same group as the
             theme toggle, so no divider between them. Languages are listed alphabetically by their own name. */
          '<div class="language-switcher-wrapper" id="languageSwitcherWrapper">' +
            '<button type="button" class="language-switcher" id="languageSwitcherToggle" aria-haspopup="menu" aria-expanded="false" aria-controls="languageMenu" aria-label="Language: English" title="Language">' +
            '<span class="mdi mdi-translate" aria-hidden="true"></span><span class="language-switcher-code">EN</span></button>' +
            '<div class="account-menu" id="languageMenu" role="menu" aria-hidden="true"><div class="account-menu-header">Language</div>' +
            '<a class="account-menu-item" href="#" role="menuitemradio" aria-checked="false" lang="de" data-lang-code="DE" data-lang-name="German">Deutsch</a>' +
            '<a class="account-menu-item active" href="#" role="menuitemradio" aria-checked="true" lang="en" data-lang-code="EN" data-lang-name="English">English</a>' +
            '<a class="account-menu-item" href="#" role="menuitemradio" aria-checked="false" lang="fr" data-lang-code="FR" data-lang-name="French">Français</a></div></div>' +
          '<span class="nav-cf-utility-divider" aria-hidden="true"></span>' +
          '<div class="portal-switcher-wrapper" id="portalSwitcherWrapper">' +
            '<span class="portal-switcher" id="portalSwitcherToggle" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-controls="portalMenu">' +
            '<span class="mdi mdi-account-switch-outline" aria-hidden="true"></span><span class="portal-switcher-label">Tenant/Case Portal</span><span id="portalChevron" class="mdi mdi-chevron-down" aria-hidden="true"></span></span>' +
            '<div class="account-menu" id="portalMenu" role="menu" aria-hidden="true"><div class="account-menu-header">Portal</div>' +
            '<a class="account-menu-item active" href="#" role="menuitem">Tenant/Case Portal</a>' +
            '<a class="account-menu-item" href="not-in-demo.html?what=Request+Portal" role="menuitem">Request Portal</a>' +
            '<a class="account-menu-item" href="not-in-demo.html?what=Custodian+Portal&ships=1" role="menuitem">Custodian Portal</a></div></div>' +
          '<span class="nav-cf-utility-divider" aria-hidden="true"></span>' +
          '<div class="user-info-wrapper" id="userAccountWrapper">' +
            '<span class="user-info" id="userAccountToggle" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu">' +
            '<span class="user-avatar" aria-hidden="true">' + esc(initials(me.name)) + '</span>' +
            '<span class="user-name-label">' + esc(me.name) + '</span>' +
            '<span class="badge badge-pill badge-info demo-region-badge" title="Viewer region">' + esc(regionName) + '</span></span>' +
            '<div class="account-menu" id="accountMenu" role="menu" aria-hidden="true">' +
              '<div class="account-menu-header">View as</div>' + switchItems +
              '<div class="account-menu-header">Account</div>' +
              '<a class="account-menu-item" href="not-in-demo.html?what=Preferences&ships=1" role="menuitem">Preferences</a>' +
              '<a class="account-menu-item" href="../index.html" role="menuitem">Sign Out</a></div></div>' +
        '</div></nav></div>';
  }

  /* ── Case header: title, toolbar, tabs ──────────────────────────────── */
  function caseHeaderHtml(caseId, activeTab) {
    var c = M.caseById(caseId);
    var tabs = TABS.map(function (t) {
      var on = t.id === activeTab;
      return '<li class="nav-item" role="presentation"><a class="nav-link' + (on ? " active" : "") + '" href="' + tabHref(t) + '"' + (on ? ' aria-current="page"' : "") + '>' + esc(t.label) + '</a></li>';
    }).join("");
    return '<div class="case-title-bar">' +
        '<a class="case-back" href="my-work.html" aria-label="Back to My Work"><i class="mdi mdi-arrow-left-circle mdi-24px" aria-hidden="true"></i></a>' +
        '<h1 class="case-title">' + esc(c.name) + '</h1>' +
      '</div>' +
      '<div class="case-toolbar">' +
        '<div class="btn-toolbar-gray btn-toolbar-list case-search-bar"><div class="case-search-field">' +
          '<input type="search" class="form-control form-control-sm" placeholder="Search …" aria-label="Search case" />' +
          '<i class="mdi mdi-chevron-down case-search-chevron" aria-hidden="true"></i></div>' +
          '<span class="toolbar-list-divider" aria-hidden="true"></span>' +
          '<div class="form-check form-switch case-adv"><input class="form-check-input" type="checkbox" role="switch" id="advSearchToggle" />' +
          '<label class="form-check-label" for="advSearchToggle">Advanced Search</label></div></div>' +
        '<div class="dropdown"><button class="btn btn-secondary btn-lg dropdown-toggle case-new" type="button" data-cnds-toggle="dropdown" aria-expanded="false">' +
          '<i class="mdi mdi-plus mdi-24px" aria-hidden="true"></i>New <i class="mdi mdi-chevron-down mdi-18px" aria-hidden="true"></i></button>' +
          '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion">' +
            '<li><a class="dropdown-item" href="not-in-demo.html?what=New+Custodian&ships=1">New Custodian</a></li>' +
            '<li><a class="dropdown-item" href="not-in-demo.html?what=New+Legal+Hold&ships=1">New Legal Hold</a></li>' +
            '<li><a class="dropdown-item" href="not-in-demo.html?what=New+Survey&ships=1">New Survey</a></li>' +
            '<li><a class="dropdown-item" href="case-new-preservation.html">New Preservation Request</a></li></ul></div>' +
      '</div>' +
      '<nav aria-label="Case sections"><ul class="nav nav-tabs nav-tabs-nimbus nav-tabs-casefusion nav-justified case-subnav" role="tablist">' + tabs + '</ul></nav>';
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  var body = document.body;
  var tab = body.getAttribute("data-demo-tab");
  var nav = body.getAttribute("data-demo-nav") || (tab ? "cases" : "mywork");
  var caseId = body.getAttribute("data-demo-case") || "MBP-0926";

  body.insertAdjacentHTML("afterbegin",
    '<a class="visually-hidden-focusable" href="#main-content">Skip to main content</a>' +
    sidenavHtml(nav) + headerHtml());

  var slot = document.querySelector("[data-demo-case-header]");
  if (slot && tab) slot.outerHTML = caseHeaderHtml(caseId, tab);

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-demo-viewer]");
    if (!a) return;
    e.preventDefault();
    setViewer(a.getAttribute("data-demo-viewer"));
  });

  /* ── Unsaved-changes guard (Scott, 10-14). Cancelling a modal, panel or form that has input in it asks first,
        with the CaseFusion cancel confirmation: "Please Confirm", NO (secondary) and YES (primary). A control counts as changed when its value differs from what it held on first focus; a control
        changed without focus (a Nimbus Select widget) counts as changed. Search boxes never count.             */
  var initial = new WeakMap();
  function fieldValue(f) { return f.type === "checkbox" || f.type === "radio" ? String(f.checked) : f.value; }
  function isField(f) { return f && f.matches && f.matches("input, textarea, select") && f.type !== "search" && f.type !== "hidden" && !f.closest("[data-demo-noguard]"); }
  document.addEventListener("focusin", function (e) { if (isField(e.target) && !initial.has(e.target)) initial.set(e.target, fieldValue(e.target)); }, true);
  ["input", "change"].forEach(function (type) {
    document.addEventListener(type, function (e) { var f = e.target; if (isField(f) && !initial.has(f)) f.setAttribute("data-demo-changed", ""); }, true);
  });
  function hasChanges(scope) {
    return [].some.call(scope.querySelectorAll("input, textarea, select"), function (f) {
      if (!isField(f)) return false;
      return f.hasAttribute("data-demo-changed") || (initial.has(f) && initial.get(f) !== fieldValue(f));
    });
  }
  function forgetChanges(scope) {
    [].forEach.call(scope.querySelectorAll("input, textarea, select"), function (f) { initial.delete(f); f.removeAttribute("data-demo-changed"); });
  }
  /* Resolves true when the user chooses to discard. The CaseFusion cancel confirmation (Case file 22565:112650):
     "Please Confirm", a yes/no question, NO / YES. Scott chose it over the 09-30 "Discard Changes?" pattern (10-14);
     the question is reworded to the formal tone (no "you"). */
  function confirmDiscard() {
    return new Promise(function (resolve) {
      var discard = false;
      var m = modal({ title: "Please Confirm", noGuard: true,
        body: '<p class="mb-0">Cancel without saving? The information entered will be lost. This action cannot be undone.</p>',
        footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">NO</button>' +
                '<button type="button" class="btn btn-primary" data-demo-discard>YES</button>',
        onHidden: function () { resolve(discard); } });
      m.el.querySelector("[data-demo-discard]").addEventListener("click", function () { discard = true; m.hide(); });
    });
  }
  /* Modals and panels: CANCEL, the close button, Escape and the backdrop all arrive as a Nimbus hide event, which
     is cancelable. The helpers' own hide() (called after a successful save) is let through. */
  function guardDismiss(el, inst, kind) {
    var allow = false;
    el.addEventListener("hide.cnds." + kind, function (e) {
      if (e.target !== el || allow || !hasChanges(el)) return;
      e.preventDefault();
      confirmDiscard().then(function (discard) { if (discard) { allow = true; inst.hide(); } });
    });
    return function () { allow = true; inst.hide(); };
  }
  /* Page forms: a CANCEL button or link outside a modal or panel. The scope is the nearest dropdown menu, card or
     form, else the page. On discard the click is replayed, so a link still navigates and a reset still resets. */
  var replaying = false;
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("a.btn, button.btn");
    if (!t || replaying || t.textContent.trim() !== "CANCEL" || t.closest(".modal, .offcanvas")) return;
    var scope = t.closest(".dropdown-menu, .card, form, [data-demo-form]") || document.querySelector("main") || document.body;
    if (!hasChanges(scope)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    confirmDiscard().then(function (discard) {
      if (!discard) return;
      forgetChanges(scope); replaying = true; t.click(); replaying = false;
    });
  }, true);
  /* A save (SAVE DRAFT, SAVE AS SCOPE, SAVE …) keeps what was entered, so CANCEL afterwards has nothing to discard. */
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("a.btn, button.btn");
    if (!t || !/^SAVE\b/.test(t.textContent.trim()) || t.closest(".modal, .offcanvas")) return;
    forgetChanges(t.closest(".dropdown-menu, .card, form, [data-demo-form]") || document.querySelector("main") || document.body);
  });

  /* ── Nimbus modal, built on demand (cnds-modal). Removed from the DOM when hidden.
        opts: { title, size: "sm"|""|"lg"|"xl", body: html, footer: html, onHidden(), noGuard }
        Cancelling with unsaved input asks first (guardDismiss); the returned hide() is the save path.  */
  var modalSeq = 0;
  function modal(opts) {
    var id = "demoModal" + (++modalSeq);
    var el = document.createElement("div");
    el.className = "modal fade";
    el.id = id;
    el.tabIndex = -1;
    el.setAttribute("aria-labelledby", id + "Title");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable' + (opts.size ? " modal-" + opts.size : "") + '"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="' + id + 'Title">' + esc(opts.title) + '</h5>' +
      '<button type="button" class="btn-close" data-cnds-dismiss="modal" aria-label="Close"></button></div>' +
      '<div class="modal-body">' + (opts.body || "").replace(/\{\{modal\}\}/g, "#" + id) + "</div>" +
      (opts.footer ? '<div class="modal-footer">' + opts.footer + "</div>" : "") + "</div></div>";
    document.body.appendChild(el);
    if (window.Nimbus && Nimbus.DataAPI) Nimbus.DataAPI.initAll(el);
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(el);
    var inst = Nimbus.Modal.getOrCreateInstance(el);
    el.addEventListener("hidden.cnds.modal", function () {
      if (opts.onHidden) opts.onHidden();
      inst.dispose(); el.remove();
    });
    var hide = opts.noGuard ? function () { inst.hide(); } : guardDismiss(el, inst, "modal");
    /* Stacked modals layer themselves: Nimbus modal.js lifts a modal opened over another, with its backdrop (10-14). */
    inst.show();
    return { el: el, id: id, hide: hide };
  }

  /* ── Nimbus offcanvas (cnds-slidingpanels), built on demand.
        opts: { title, width: CSS width (90vw lists, 50vw forms), body, footer, onHidden() } */
  var panelSeq = 0;
  function offcanvas(opts) {
    var id = "demoPanel" + (++panelSeq);
    var el = document.createElement("div");
    el.className = "offcanvas offcanvas-end";
    el.id = id;
    el.tabIndex = -1;
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", id + "Title");
    if (opts.width) el.style.setProperty("--cnds-offcanvas-width", opts.width);
    /* Stacked drawers (a follow-on step over an open drawer): Nimbus gives every offcanvas and backdrop one z-index,
       so a second panel would share its parent's layer and its backdrop would not dim the parent. Each level up
       lifts the panel and its backdrop 10, giving one wash per visible boundary (Nimbus gap D13, logged in
       tools/nimbus-gaps.md; to move into offcanvas.js when Scott approves). */
    var depth = document.querySelectorAll(".offcanvas.show, .offcanvas.showing").length;
    if (depth) el.style.setProperty("--cnds-offcanvas-zindex", String(1045 + depth * 10));
    el.innerHTML = '<div class="offcanvas-header"><h3 class="offcanvas-title" id="' + id + 'Title">' + esc(opts.title) + '</h3>' +
      '<button type="button" class="btn-close" data-cnds-dismiss="offcanvas" aria-label="Close"></button></div>' +
      '<div class="offcanvas-body">' + (opts.body || "") + "</div>" +
      (opts.footer ? '<div class="offcanvas-footer">' + opts.footer + "</div>" : "");
    document.body.appendChild(el);
    if (window.Nimbus && Nimbus.DataAPI) Nimbus.DataAPI.initAll(el);
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(el);
    var inst = Nimbus.Offcanvas.getOrCreateInstance(el);
    el.addEventListener("hidden.cnds.offcanvas", function () {
      if (opts.onHidden) opts.onHidden();
      inst.dispose(); el.remove();
    });
    var hide = guardDismiss(el, inst, "offcanvas");
    inst.show();
    if (depth) { var bds = document.querySelectorAll(".offcanvas-backdrop"); if (bds.length) bds[bds.length - 1].style.zIndex = String(1040 + depth * 10); }
    return { el: el, id: id, hide: hide,
      setBody: function (html) { el.querySelector(".offcanvas-body").innerHTML = html; if (Nimbus.Select) Nimbus.Select.initAll(el); },
      setFooter: function (html) { var f = el.querySelector(".offcanvas-footer"); if (f) f.innerHTML = html; } };
  }

  /* ── Nimbus Select markup (cnds-select). Label goes AFTER the select; product colour
        from the wrapper. Inside a modal pass container "{{modal}}".
        options: [[value, label]] or [[value, label, secondaryText]]                       */
  function select(id, options, value, label, cfg) {
    cfg = cfg || {};
    return '<div class="select-wrapper-casefusion' + (cfg.cls ? " " + cfg.cls : "") + '"><select id="' + id + '" data-cnds-select-init' +
      (cfg.size ? ' class="form-control-' + cfg.size + '"' : "") + (cfg.container ? ' data-cnds-container="' + cfg.container + '"' : "") +
      (cfg.attrs ? " " + cfg.attrs : "") + ">" +
      options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + (o[2] ? ' data-cnds-secondary-text="' + esc(o[2]) + '"' : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select>" + (label ? '<label class="form-label select-label">' + esc(label) + "</label>" : "") + "</div>";
  }

  /* ── Reason dialog on the Nimbus modal: a required reason, and what it writes (PRD 07 V3).
        opts: { title, intro, effect, confirm, danger, extra: html }
        Resolves with { reason, dialog } or null on cancel.                                 */
  function reasonDialog(opts) {
    return new Promise(function (resolve) {
      var result = null;
      var body = (opts.intro ? '<p class="mb-3">' + esc(opts.intro) + "</p>" : "") + (opts.extra || "") +
        '<div class="cf-input-field cf-input-field-casefusion mt-2">' +
          '<label class="cf-input-label" for="demoReason">Reason <span class="cf-input-required">*</span></label>' +
          '<div class="cf-input-wrapper"><textarea id="demoReason" class="cf-input-control" rows="3"></textarea></div>' +
          '<div class="cf-input-helper"><span class="cf-input-helper-text">Say why. The reason is kept with the case and appears in the preservation report.</span></div></div>' +
        (opts.effect ? '<p class="note note-info note-sm mt-3 mb-0">' + esc(opts.effect) + "</p>" : "");
      var m = modal({ title: opts.title, body: body,
        footer: '<button type="button" class="btn btn-secondary" data-cnds-dismiss="modal">CANCEL</button>' +
                '<button type="button" class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-demo-ok disabled>' + esc(opts.confirm || "CONFIRM") + "</button>",
        onHidden: function () { resolve(result); } });
      var ta = m.el.querySelector("#demoReason"), ok = m.el.querySelector("[data-demo-ok]");
      ta.addEventListener("input", function () { ok.disabled = ta.value.trim() === ""; });
      ok.addEventListener("click", function () { result = { reason: ta.value.trim(), dialog: m.el }; m.hide(); });
      m.el.addEventListener("shown.cnds.modal", function () { ta.focus(); });
    });
  }

  /* ── Toast on Nimbus.Toast, lower right (glossary: a toast confirms an action that succeeded). */
  function toast(msg, kind) {
    var danger = kind === "error";
    if (!(window.Nimbus && Nimbus.Toast)) { window.alert(msg); return; }
    var t = document.createElement("div");
    t.className = "toast fade";
    t.setAttribute("role", danger ? "alert" : "status");
    t.setAttribute("aria-live", danger ? "assertive" : "polite");
    t.setAttribute("aria-atomic", "true");
    t.innerHTML = '<div class="toast-header"><i class="mdi mdi-' + (danger ? "alert-circle" : "check-circle") + ' cnds-icon-xl lh-1 me-2" aria-hidden="true"></i>' +
      '<strong class="me-auto lh-1">CaseFusion</strong><button type="button" class="btn-close" data-cnds-dismiss="toast" aria-label="Close"></button></div>' +
      '<div class="toast-body"></div>';
    t.querySelector(".toast-body").textContent = msg;
    var inst = new Nimbus.Toast(t, { appendToBody: true, stacking: true, position: "bottom-right", width: "380px", autohide: true, delay: 5000, color: danger ? "danger" : "success" });
    t.addEventListener("hidden.cnds.toast", function () { inst.dispose(); t.remove(); });
    inst.show();
  }

  /* Open-row fill for record lists (.demo-rows, demo.css): an item gets .demo-open as its details start to slide
     open and loses it as they start to close, so the fill fades with the slide. Any Nimbus collapse that is a
     direct child of a .demo-rows item counts. */
  ["show", "hide"].forEach(function (phase) {
    document.addEventListener(phase + ".cnds.collapse", function (e) {
      var li = e.target.parentElement;
      if (li && li.classList.contains("list-group-item") && li.parentElement && li.parentElement.classList.contains("demo-rows")) li.classList.toggle("demo-open", phase === "show");
    });
  });

  /* Pager under a list (Nimbus pagination-toolbar, as on Data Map): per-page select (10 by default unless a screen says otherwise),
     "a-b of n", and First / Previous / Next / Last. All four arrows disable on a single page. Hide it when n is 0.
     Buttons carry data-pg="first|prev|next|last" + data-pg-for="<key>"; the select carries data-pg-size="<key>".
     Initialise the select (Nimbus.Select.initAll) after inserting the markup. */
  function pager(key, total, page, size, label, container) {
    var pages = Math.max(1, Math.ceil(total / size)), a = total ? (page - 1) * size + 1 : 0, b = Math.min(total, page * size);
    var btn = function (act, ic, lbl, dis) { return '<button type="button" class="pagination-toolbar-btn" data-pg="' + act + '" data-pg-for="' + key + '" aria-label="' + lbl + '"' + (dis ? " disabled" : "") + '><i class="mdi ' + ic + '" aria-hidden="true"></i></button>'; };
    return '<div class="pagination-toolbar mt-2"><span class="pagination-toolbar-label">' + (label || "Results per page:") + "</span>" +
      select("pg-" + key, sizes(size).map(function (n) { return [String(n), String(n)]; }), String(size), null, { size: "sm", container: container, attrs: 'data-pg-size="' + key + '" aria-label="Results per page"' }) +
      '<span class="pagination-toolbar-range">' + a + "-" + b + " of " + total + '</span><nav class="pagination-toolbar-nav" aria-label="Page navigation">' +
      btn("first", "mdi-skip-previous", "First page", page <= 1) + btn("prev", "mdi-chevron-left", "Previous page", page <= 1) +
      btn("next", "mdi-chevron-right", "Next page", page >= pages) + btn("last", "mdi-skip-next", "Last page", page >= pages) + "</nav></div>";
  }
  /* Page-size options: 10, 25, 50, plus the list's own default if it differs (e.g. a screen whose default is not on the list). */
  function sizes(size) { var l = [10, 25, 50]; if (l.indexOf(size) === -1) l.push(size); return l.sort(function (a, b) { return a - b; }); }
  function turnPage(page, act, total, size) {
    var pages = Math.max(1, Math.ceil(total / size));
    return act === "first" ? 1 : act === "prev" ? Math.max(1, page - 1) : act === "next" ? Math.min(pages, page + 1) : pages;
  }

  /* Drawer cards (demo.css): keep each chevron's label in step with its body ("Collapse X" / "Expand X"). Nimbus
     Collapse updates aria-expanded itself. */
  ["shown", "hidden"].forEach(function (phase) {
    document.addEventListener(phase + ".cnds.collapse", function (e) {
      if (!e.target.classList || !e.target.classList.contains("card-drawer-body")) return;
      var b = document.querySelector('.card-drawer-toggle[aria-controls="' + e.target.id + '"]');
      if (b) b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(Collapse|Expand)/, phase === "shown" ? "Collapse" : "Expand"));
    });
  });

  /* Action columns share the longest button's width (Scott, 10-14): measure the widest button in a list's action
     cells and publish it as --demo-actions-w on the list, so every row's grid gives that column the same width.
     Call after rendering a list. Buttons never wrap, so this is the width the column needs. */
  function fitActions(list, cellSelector) {
    if (!list) return;
    var w = 0;
    list.querySelectorAll(cellSelector + " .btn").forEach(function (b) { w = Math.max(w, Math.ceil(b.getBoundingClientRect().width)); });
    if (w) list.style.setProperty("--demo-actions-w", w + "px");
  }

  /* Selected tile → the library's outline card (no custom selected style). Gap #1 in tools/nimbus-gaps.md. */
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      (m.type === "attributes" ? [m.target] : Array.prototype.slice.call(m.target.querySelectorAll ? m.target.querySelectorAll(".demo-tile") : []))
        .forEach(function (t) {
          if (!t.classList || !t.classList.contains("demo-tile")) return;
          if (t.hasAttribute("data-tone")) return;  /* a tile with a fixed tone (e.g. danger) keeps it when selected */
          var on = t.getAttribute("aria-pressed") === "true";
          t.classList.toggle("card-outline", on); t.classList.toggle("card-brand-green", on); t.classList.toggle("card-basic", !on);
        });
    });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });

  /* Language menu: the demo ships in English only, so another language explains that and keeps EN selected. */
  document.addEventListener("click", function (e) {
    var item = e.target.closest && e.target.closest("#languageMenu [data-lang-code]");
    if (!item) return;
    e.preventDefault();
    if (item.getAttribute("data-lang-code") !== "EN") toast(item.getAttribute("data-lang-name") + " is not part of this demo. The interface stays in English.");
    var t = document.getElementById("languageSwitcherToggle"); if (t) t.click();  /* close the menu, focus returns to the trigger */
  });

  /* A photo that fails to load becomes the person's initials monogram, never a broken image. Error events do not
     bubble, so this listens in the capture phase. */
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (!img.matches || !img.matches("img.demo-avatar[data-initials]")) return;
    var m = document.createElement("span");
    m.className = "monogram demo-avatar"; m.textContent = img.getAttribute("data-initials");
    img.replaceWith(m);
  }, true);

  /* Shared helpers for page scripts. */
  window.MeridianDemo = {
    /* Demo status tone → Nimbus badge colour. */
    badgeColor: { ok: "success", warn: "warning", bad: "danger", info: "info", muted: "secondary", exc: "danger" },
    reasonDialog: reasonDialog,
    esc: esc,
    initials: initials,
    /** A person's profile photo as a 42px Nimbus avatar (Nimbus/Avatar Mode=Avatar, Size=42px, Border=Yes);
        the initials monogram when the person has no photo. Callers show a limited profile's lock monogram instead. */
    avatar: function (p) {
      return M.avatars[p.id] ? '<img class="demo-avatar" src="../img/avatars/' + p.id + ".jpg" + STAMP + '" alt="' + esc(p.name) + ' profile photo" width="42" height="42" data-initials="' + esc(initials(p.name)) + '" />' :
        '<span class="monogram demo-avatar">' + esc(initials(p.name)) + "</span>";
    },
    viewer: viewer,
    /** True when the demo viewer holds this role ("Case Administrator", "Case User", …). */
    hasRole: function (r) { return viewer().roles.indexOf(r) !== -1; },
    /** True when the demo viewer can open this case (M.viewerCases). */
    canOpenCase: function (id) { var a = M.viewerCases[viewer().id]; return !!a && a.cases.indexOf(id) !== -1; },
    canSee: canSee,
    caseId: caseId,
    /** Name as the current viewer may see it. */
    nameFor: function (person) {
      return canSee(person) ? person.name : "Profile details limited";
    },
    toast: toast,
    select: select,
    modal: modal,
    fitActions: fitActions,
    pager: pager,
    turnPage: turnPage,
    offcanvas: offcanvas
  };
}());
