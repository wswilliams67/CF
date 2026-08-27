/* ============================================================================
 * Nimbus v1 Portable Design System — CaseFusion 1.6
 * File:    js/pages/frame-ca-sidenav.js
 * Role:    Case Administrator AppFrame controller — shared chrome behaviour
 * Source:  extracted verbatim from pages/tmpl_ca_sidenav.html <script> block.
 *          §7 SCREEN HOOKS is deliberately NOT included — per-screen code now
 *          lives in its own js/pages/pge-*.js file.
 *
 * LOAD ORDER — after js/nimbus.js and js/app.js, before the page script:
 *     nimbus.js → app.js → THIS FILE → js/pages/pge-*.js
 *
 * Plain ES5 in an IIFE so the file drops into any server with no build step.
 * Nothing here re-implements a Nimbus component; it only wires the frame-level
 * behaviour the design system does not ship.
 *
 * Nimbus components are loaded ASYNCHRONOUSLY by js/nimbus.js. Anything that
 * touches a component class (Nimbus.Tooltip, Nimbus.Select, …) must run inside
 * the `cnds.ready` listener or an event handler — never at parse time.
 *
 * ANGULAR: becomes AppFrameComponent. §1 (fixed-sidenav top offset) and §2
 * (overlay registry) survive the port as-is; §3 notifications becomes a
 * NotificationService feed. See pages/tmpl_ca_sidenav.ANGULAR.md.
 * ========================================================================= */

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════
     0 · CONSTANTS & HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Animation durations in ms. These MIRROR the CSS transitions of the
   * same name — JS uses them to schedule post-transition work. Change a
   * CSS duration and you must change its twin here.
   *   SIDENAV_WIDTH  #caSidenav / .ca-main   transition: … 0.3s
   *   SUBMENU        .sidenav-collapse height slide (JS-driven, below)
   *   NOTIF_DISMISS  .notif-item collapse-and-remove
   */
  var DUR = { SIDENAV_WIDTH: 300, SUBMENU: 350, NOTIF_DISMISS: 300 };

  /** Grace period added to a duration before a fallback timer fires. */
  var TRANSITION_SLOP = 20;

  var byId = document.getElementById.bind(document);

  /**
   * Live reduced-motion query. Read per animation rather than cached at
   * parse time, so a mid-session OS preference change is honoured.
   */
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  function reducedMotion() { return motionQuery.matches; }

  /** Read a CSS length custom property off :root, in px. */
  function cssPx(name, fallback) {
    var n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(n) ? fallback : n;
  }

  /** createElement + className + textContent, in one call. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Run `fn` once: on the first `type` event fired BY `node` itself, or
   * after `timeoutMs` if the transition never lands (element hidden,
   * motion reduced, interrupted). The target check matters — transitionend
   * bubbles, so a child's transition would otherwise settle the parent early.
   */
  function once(node, type, fn, timeoutMs) {
    var done = false;
    var run = function (e) {
      if (done || (e && e.target !== node)) return;
      done = true;
      node.removeEventListener(type, run);
      fn();
    };
    node.addEventListener(type, run);
    setTimeout(run, timeoutMs);
  }

  /* ═══════════════════════════════════════════════════════════════
     1 · FRAME LAYOUT

     #caSidenav is position:fixed, so it cannot pick up the sticky
     header's height from normal flow — JS pins its top edge instead.
     The gap is read from --ca-sidenav-gap so the CSS stays the single
     source of truth for the frame's spacing.
     ═══════════════════════════════════════════════════════════════ */

  var header  = byId("caHeader");
  var main    = byId("main-content");
  var sidenav = byId("caSidenav");

  function updateLayout() {
    if (!sidenav) return;
    var gap = cssPx("--ca-sidenav-gap", 16);
    sidenav.style.top = ((header ? header.offsetHeight : 0) + gap) + "px";
  }

  /* offsetHeight forces a synchronous layout, so coalesce to one per frame. */
  var layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(function () { layoutQueued = false; updateLayout(); });
  }

  updateLayout();
  window.addEventListener("resize", queueLayout, { passive: true });

  /* The utility header deliberately carries NO elevation on scroll. A screen
     that sticks its own content header directly beneath this bar would end up
     with a shadow falling between two flush bars; the elevation belongs to
     whichever bar is the last one above the scrolling content, so each screen
     owns it. Removed 2026-08-26 at Scott's direction — do not reinstate here.
     Screen-level example: js/pages/pge-admin-natprsn-list.js
     wireHeaderElevation(). */

  /* ═══════════════════════════════════════════════════════════════
     2 · OVERLAY REGISTRY

     The bell popover, the portal menu and the account menu are mutually
     exclusive: opening one closes the others. Registering all three in
     one place buys a single document-click listener instead of three, a
     single Escape handler, and one roving-focus implementation.

     Each entry is:
       panel    the element that carries .open
       trigger  the control that owns aria-expanded
       root     what an outside-click is measured against. Usually the
                trigger's wrapper; the bell popover is re-parented to
                <body> (see §3) so it is its own root.
       roving   true to wire ArrowUp/ArrowDown over [role="menuitem"]
       onOpen   runs BEFORE .open is applied — position/measure here
       onClose  runs after .open is removed
     ═══════════════════════════════════════════════════════════════ */

  var overlays = [];

  function overlayIsOpen(o) { return o.panel.classList.contains("open"); }

  function closeOverlay(o, refocus) {
    if (!overlayIsOpen(o)) return;
    o.panel.classList.remove("open");
    o.panel.setAttribute("aria-hidden", "true");
    o.trigger.setAttribute("aria-expanded", "false");
    if (o.onClose) o.onClose();
    if (refocus) o.trigger.focus();
  }

  function closeAllOverlays(except) {
    overlays.forEach(function (o) { if (o !== except) closeOverlay(o, false); });
  }

  function openOverlay(o) {
    closeAllOverlays(o);
    if (o.onOpen) o.onOpen();
    o.panel.classList.add("open");
    o.panel.removeAttribute("aria-hidden");
    o.trigger.setAttribute("aria-expanded", "true");
    var first = o.panel.querySelector("[role='menuitem'], button, [href], input, [tabindex]");
    if (first) first.focus();
  }

  function toggleOverlay(o) {
    if (overlayIsOpen(o)) { closeOverlay(o, true); } else { openOverlay(o); }
  }

  /**
   * Register an overlay and wire its trigger + panel keyboard handling.
   * Returns the entry, or null when the markup for it is absent.
   */
  function registerOverlay(cfg) {
    if (!cfg.panel || !cfg.trigger) return null;
    cfg.root = cfg.root || cfg.trigger;
    overlays.push(cfg);

    cfg.trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleOverlay(cfg);
    });

    /* <button> gets Enter/Space for free; span[role="button"] does not. */
    if (cfg.trigger.tagName !== "BUTTON") {
      cfg.trigger.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggleOverlay(cfg);
      });
    }

    cfg.panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeOverlay(cfg, true); return; }
      if (!cfg.roving || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      var items = [].slice.call(cfg.panel.querySelectorAll("[role='menuitem']"));
      if (!items.length) return;
      /* indexOf is -1 when focus is on the panel itself: ArrowDown then
         lands on the first item, ArrowUp on the last. */
      var i = items.indexOf(document.activeElement);
      var next = e.key === "ArrowDown" ? i + 1 : i - 1 + items.length;
      items[((next % items.length) + items.length) % items.length].focus();
    });

    return cfg;
  }

  /* One outside-click listener for every registered overlay. */
  document.addEventListener("click", function (e) {
    overlays.forEach(function (o) {
      if (!overlayIsOpen(o)) return;
      if (o.root.contains(e.target) || o.trigger.contains(e.target)) return;
      closeOverlay(o, false);
    });
  });

  /* ═══════════════════════════════════════════════════════════════
     3 · NOTIFICATIONS

     DEMO_NOTIFICATIONS is placeholder data — replace the array with a
     service call and keep the render contract.

     Rows are built with createElement/textContent, NOT innerHTML.
     Subjects and messages are user-supplied strings in production, and
     string-concatenated markup would be a stored-XSS vector.
     ═══════════════════════════════════════════════════════════════ */

  var DEMO_NOTIFICATIONS = [
    { subject: "Legal hold violation detected",      timestamp: "Apr 18, 2026 · 2:14 PM",  message: "Legal hold violation detected on custodian mailbox. Immediate review required to prevent spoliation.", unread: true  },
    { subject: "Preserve in place job completed",    timestamp: "Apr 18, 2026 · 11:05 AM", message: "Preserve in place job for OneDrive has completed in Doe v. Acme Corporation.", unread: true  },
    { subject: "Custodian response overdue",         timestamp: "Apr 17, 2026 · 2:00 PM",  message: "Custodian response is overdue by 5 days. Escalation notice sent to outside counsel.", unread: true  },
    { subject: "Expert report deadline approaching", timestamp: "Apr 17, 2026 · 10:45 AM", message: "Expert report deadline is approaching in 3 business days. Draft review recommended.", unread: false },
    { subject: "Data source sync completed",         timestamp: "Apr 16, 2026 · 4:12 PM",  message: "Data source sync completed for Exchange Online connector.", unread: false }
  ];

  /** Build one .notif-item row. @param {{subject,timestamp,message,unread}} item */
  function buildNotifItem(item) {
    var row = el("div", "notif-item" + (item.unread ? " unread" : ""));

    if (item.unread) row.appendChild(el("span", "notif-unread-dot"));

    var label = el("div", "notif-item-label");
    label.appendChild(el("div", "notif-subject", item.subject));
    label.appendChild(el("div", "notif-timestamp", item.timestamp));
    row.appendChild(label);

    var expand = el("button", "notif-expand mdi mdi-chevron-down");
    expand.type = "button";
    expand.setAttribute("aria-label", "Expand notification");
    expand.setAttribute("aria-expanded", "false");
    row.appendChild(expand);

    var dismiss = el("button", "notif-dismiss mdi mdi-close");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    row.appendChild(dismiss);

    row.appendChild(el("div", "notif-item-message", item.message));
    return row;
  }

  function renderNotifications(listEl, data) {
    var frag = document.createDocumentFragment();
    data.forEach(function (item) { frag.appendChild(buildNotifItem(item)); });
    listEl.textContent = "";
    listEl.appendChild(frag);
  }

  function updateCounts(popoverEl, listEl) {
    var totalEl  = popoverEl.querySelector(".notif-count-total");
    var unreadEl = popoverEl.querySelector(".notif-count-unread");
    if (totalEl)  totalEl.textContent  = listEl.querySelectorAll(".notif-item").length + " Total";
    if (unreadEl) unreadEl.textContent = listEl.querySelectorAll(".notif-item.unread").length + " Unread";
  }

  /** Filled bell + count badge when unread, outline bell + no badge when clear. */
  function updateBellState(iconEl, badgeEl, listEl) {
    var count = listEl ? listEl.querySelectorAll(".notif-item.unread").length : 0;
    if (iconEl) {
      iconEl.classList.toggle("mdi-bell", count > 0);
      iconEl.classList.toggle("mdi-bell-outline", count === 0);
    }
    if (badgeEl) badgeEl.textContent = count === 0 ? "" : (count > 99 ? "99+" : String(count));
  }

  (function initNotifications() {
    var bellBtn  = byId("navBellBtn");
    var bellIcon = byId("navBellIcon");
    var badge    = byId("navBellBadge");
    var popover  = byId("navAlertPopover");
    var listEl   = byId("notifList");
    if (!bellBtn || !popover || !listEl) return;

    renderNotifications(listEl, DEMO_NOTIFICATIONS);
    updateCounts(popover, listEl);
    updateBellState(bellIcon, badge, listEl);

    /* Re-parent to <body>. The popover is position:fixed and wider than
       the utility bar; leaving it inside the header subjects it to the
       header's stacking context and any future overflow clipping. */
    document.body.appendChild(popover);

    /** Anchor the popover under the bell and point its arrow at the bell. */
    function positionPopover() {
      var r  = bellBtn.getBoundingClientRect();
      var pw = popover.offsetWidth || 400;
      var cx = r.left + r.width / 2;
      var left = Math.max(8, Math.min(cx - 20, window.innerWidth - pw - 8));
      popover.style.top  = (r.bottom + 10) + "px";
      popover.style.left = left + "px";
      popover.style.setProperty("--arrow-left",
        Math.max(12, Math.min(Math.round(cx - left - 8), pw - 32)) + "px");
    }

    /* The bell carries data-cnds-toggle="tooltip", which would otherwise
       sit on top of the open popover — suspend it while open. */
    function bellTooltip() {
      return (window.Nimbus && Nimbus.Tooltip)
        ? Nimbus.Tooltip.getInstance(bellBtn)
        : null;
    }

    var bell = registerOverlay({
      panel: popover,
      trigger: bellBtn,
      root: popover,
      onOpen: function () {
        positionPopover();
        var t = bellTooltip();
        if (t) { t.hide(); t.disable(); }
      },
      onClose: function () {
        var t = bellTooltip();
        if (t) t.enable();
      }
    });

    window.addEventListener("resize", function () {
      if (overlayIsOpen(bell)) positionPopover();
    }, { passive: true });

    /* Scrim under the sticky popover header once the list scrolls. */
    var head = popover.querySelector(".notif-header");
    if (head) {
      listEl.addEventListener("scroll", function () {
        head.classList.toggle("scrolled", this.scrollTop > 0);
      }, { passive: true });
    }

    function refreshBell() {
      updateCounts(popover, listEl);
      updateBellState(bellIcon, badge, listEl);
    }

    /* One delegated handler for expand + dismiss across all rows. */
    popover.addEventListener("click", function (e) {
      var expand = e.target.closest(".notif-expand");
      if (expand) {
        e.preventDefault();
        e.stopPropagation();
        var row = expand.closest(".notif-item");
        if (!row) return;
        var expanded = row.classList.toggle("expanded");
        expand.setAttribute("aria-expanded", expanded ? "true" : "false");
        /* Expanding counts as reading it. */
        if (expanded && row.classList.contains("unread")) {
          row.classList.remove("unread");
          var dot = row.querySelector(".notif-unread-dot");
          if (dot) dot.remove();
          refreshBell();
        }
        return;
      }

      var dismiss = e.target.closest(".notif-dismiss");
      if (!dismiss) return;
      e.preventDefault();
      e.stopPropagation();
      var item = dismiss.closest(".notif-item");
      if (!item) return;

      var drop = function () { item.remove(); refreshBell(); };
      if (reducedMotion()) { drop(); return; }

      /* Collapse the row to zero height, then remove it. max-height is
         seeded from the measured height so the transition has a start. */
      item.style.transition = "opacity 0.2s ease, max-height 0.3s ease, margin 0.3s ease, padding 0.3s ease";
      item.style.maxHeight  = item.offsetHeight + "px";
      item.style.overflow   = "hidden";
      item.style.opacity    = "0";
      requestAnimationFrame(function () {
        item.style.maxHeight = "0";
        item.style.marginTop = item.style.marginBottom = "0";
        item.style.paddingTop = item.style.paddingBottom = "0";
      });
      setTimeout(drop, DUR.NOTIF_DISMISS);
    });
  })();

  /* ═══════════════════════════════════════════════════════════════
     4 · PORTAL SWITCHER & ACCOUNT MENU
     ═══════════════════════════════════════════════════════════════ */

  (function initHeaderMenus() {
    var portalToggle  = byId("portalSwitcherToggle");
    var portalMenu    = byId("portalMenu");
    var portalChevron = byId("portalChevron");
    var accountToggle = byId("userAccountToggle");
    var accountMenu   = byId("accountMenu");

    /**
     * Centre the menu's CSS-triangle arrow under its trigger. The arrow is
     * drawn by ::before/::after at a `right` offset, so it is measured from
     * the menu's right edge — which is flush with the trigger's right edge.
     */
    function setMenuArrow(menu, trigger) {
      if (!menu || !trigger) return;
      var half = trigger.offsetWidth / 2;
      menu.style.setProperty("--menu-arrow-outer", Math.round(half - 8) + "px");
      menu.style.setProperty("--menu-arrow-inner", Math.round(half - 7) + "px");
    }

    function setChevron(open) {
      if (!portalChevron) return;
      portalChevron.classList.toggle("mdi-chevron-down", !open);
      portalChevron.classList.toggle("mdi-chevron-up", open);
    }

    registerOverlay({
      panel: portalMenu,
      trigger: portalToggle,
      root: byId("portalSwitcherWrapper"),
      roving: true,
      onOpen: function () { setMenuArrow(portalMenu, portalToggle); setChevron(true); },
      onClose: function () { setChevron(false); }
    });

    registerOverlay({
      panel: accountMenu,
      trigger: accountToggle,
      root: byId("userAccountWrapper"),
      roving: true,
      onOpen: function () { setMenuArrow(accountMenu, accountToggle); }
    });
  })();

  /* ═══════════════════════════════════════════════════════════════
     5 · THEME TOGGLE

     app.js owns the actual switch: it reads data-cnds-toggle="theme",
     writes data-cnds-theme on <html> and persists to localStorage. This
     block only keeps the button's icon and tooltip label in step.
     ═══════════════════════════════════════════════════════════════ */

  (function initThemeToggle() {
    var btn = byId("themeToggle");

    /**
     * Is the page dark right now?
     *
     * An ABSENT data-cnds-theme means "follow the system", not "light" — so it
     * is resolved through the media query rather than defaulting. Reading it as
     * light would put a sun on a page the OS is rendering dark.
     */
    function isDarkNow() {
      var attr = document.documentElement.getAttribute("data-cnds-theme");
      if (attr) return attr === "dark";
      return !!(window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    /* Icon and tooltip label, brought in step with the theme. */
    function syncThemeToggle() {
      var isDark = isDarkNow();
      document.querySelectorAll('[data-cnds-toggle="theme"] .mdi').forEach(function (icon) {
        icon.classList.toggle("mdi-weather-night", !isDark);
        icon.classList.toggle("mdi-weather-sunny", isDark);
      });
      if (!btn) return;

      var label = isDark ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-label", "Toggle theme");
      btn.setAttribute("data-cnds-original-title", label);

      /* `title` is the NATIVE tooltip and must not survive alongside the
         Nimbus one. Tooltip strips it at init for exactly that reason, and
         re-adding it here put both back on screen: the styled popup and the
         browser's own, a beat later, saying the same thing.

         It is still worth setting before the component exists — the button
         is hoverable from first paint, and cnds.ready can be a moment away —
         so the native title is kept only while there is no instance to
         replace it. */
      var mounted = window.Nimbus && window.Nimbus.Tooltip &&
                    window.Nimbus.Tooltip.getInstance(btn);
      if (mounted) btn.removeAttribute("title");
      else btn.setAttribute("title", label);
    }

    /* Observe the attribute rather than the click, so the icon is also
       correct when app.js restores a saved theme on load. */
    new MutationObserver(syncThemeToggle)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-cnds-theme"] });

    /* Run once for the state we ALREADY have. A MutationObserver fires only on
       a change, and the page ships <html data-cnds-theme="dark"> at parse time
       — so on a first visit nothing had ever mutated, the sync never ran, and
       the button kept its authored moon while the page was already dark: an
       icon meaning "switch to dark" on a dark page, beside a tooltip correctly
       reading "Switch to light theme". app.js only patched the icon when
       localStorage happened to hold a saved theme, which a first visit does
       not have. */
    syncThemeToggle();

    /* The system can change under an unpinned page — the OS switching at
       sunset — and that moves no attribute, so the observer above never sees
       it. Same sync, driven by the media query. */
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onScheme = function () {
        if (!document.documentElement.getAttribute("data-cnds-theme")) syncThemeToggle();
      };
      if (mq.addEventListener) mq.addEventListener("change", onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    /* The button already spends data-cnds-toggle on "theme", so the
       tooltip cannot be declared via data-cnds-toggle="tooltip" — it has
       to be constructed once the component class has finished loading. */
    document.addEventListener("cnds.ready", function () {
      if (btn && window.Nimbus && Nimbus.Tooltip) {
        Nimbus.Tooltip.getOrCreateInstance(btn, { placement: "bottom", delay: 0 });
      }
    });
  })();

  /* ═══════════════════════════════════════════════════════════════
     6 · SIDE NAV

     Markup contract (matches the Category Items demo in cnds-sidenav.html):
       li.sidenav-item            one row; title + data-original-title match
       a#navlink_<Topic>          a leaf link
       a#tog_submenu_<Section>    a category toggle; needs
                                  data-cnds-toggle="sidenav-collapse" and
                                  aria-expanded, with a sibling
                                  ul.sidenav-collapse
     Identifiers must be unique across the whole nav.

     The slide animation is JS-driven because components/sidenav.css ships
     .sidenav-collapse as a display:none / .show display:block pair with no
     height transition.
     ═══════════════════════════════════════════════════════════════ */

  (function initSidenav() {
    var sidenavEl = byId("caSidenav");
    var toggleBtn = byId("caSidenavToggle");
    if (!sidenavEl) return;

    var categoryToggles = [].slice.call(sidenavEl.querySelectorAll('[id^="tog_submenu_"]'));
    var navLinks        = [].slice.call(sidenavEl.querySelectorAll('[id^="navlink_"]'));

    function submenuOf(toggle) {
      return toggle.parentElement
        ? toggle.parentElement.querySelector(".sidenav-collapse")
        : null;
    }

    /* ── Submenu slide ────────────────────────────────────────────
       One routine for both directions. `.collapsing` holds the element
       at display:block for the duration (app.css), then `settle()` hands
       it back to the class-based .show state and clears every inline
       style so nothing leaks into the next run. */
    function animateSubmenu(toggle, submenu, open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");

      /* A category stays highlighted while it holds the active leaf. */
      if (!open && !submenu.querySelector(".sidenav-link.active")) {
        toggle.classList.remove("active");
      }

      var settle = function () {
        submenu.classList.remove("collapsing");
        submenu.classList.toggle("show", open);
        submenu.style.height = submenu.style.overflow =
          submenu.style.transition = submenu.style.display = "";
      };

      if (reducedMotion()) { settle(); return; }

      submenu.style.display  = "block";
      submenu.style.overflow = "hidden";
      submenu.classList.add("collapsing");
      submenu.classList.remove("show");

      /* Measure only after display:block — scrollHeight is 0 while hidden. */
      var full = submenu.scrollHeight + "px";
      submenu.style.height = open ? "0px" : full;
      void submenu.offsetHeight;                    // commit the start frame
      submenu.style.transition = "height " + DUR.SUBMENU + "ms ease";
      submenu.style.height = open ? full : "0px";

      once(submenu, "transitionend", settle, DUR.SUBMENU + TRANSITION_SLOP);
    }

    /** Accordion: only one category open at a time. */
    function closeOtherSubmenus(except) {
      categoryToggles.forEach(function (t) {
        if (t === except) return;
        var s = submenuOf(t);
        if (s && s.classList.contains("show")) animateSubmenu(t, s, false);
      });
    }

    function openSubmenu() {
      for (var i = 0; i < categoryToggles.length; i++) {
        var s = submenuOf(categoryToggles[i]);
        if (s && s.classList.contains("show")) {
          return { toggle: categoryToggles[i], submenu: s };
        }
      }
      return null;
    }

    /* ── Slim mode ────────────────────────────────────────────────
       State lives on the element, not in a local boolean: the Nimbus
       Sidenav component also toggles .sidenav-slim (see _isSlim /
       _expandFromSlim), so a JS flag can silently desync from the DOM. */
    function isSlim() { return sidenavEl.classList.contains("sidenav-slim"); }

    function setSlim(on) {
      if (on === isSlim()) return;
      sidenavEl.classList.toggle("sidenav-slim", on);
      if (main) main.classList.toggle("ca-main-slim", on);

      if (toggleBtn) {
        var icon = toggleBtn.querySelector(".mdi");
        if (icon) icon.className = "mdi " + (on ? "mdi-menu-close" : "mdi-menu-open");
        toggleBtn.setAttribute("aria-expanded", on ? "false" : "true");
        toggleBtn.setAttribute("aria-label", on ? "Expand navigation" : "Collapse navigation");
      }

      /* Labels are hidden in slim mode, so the icons need tooltips. */
      if (on) { addSlimTooltips(); } else { removeSlimTooltips(); }

      /* Re-pin the panel once the width transition lands: collapsing the
         nav can reflow the header, which moves the panel's top edge. */
      setTimeout(updateLayout, DUR.SIDENAV_WIDTH + TRANSITION_SLOP);
    }

    function slimTooltipLinks() {
      return [].slice.call(sidenavEl.querySelectorAll(".sidenav-link"));
    }

    function addSlimTooltips() {
      if (!window.Nimbus || !Nimbus.Tooltip) return;
      slimTooltipLinks().forEach(function (link) {
        var span  = link.querySelector("span:not(.sidenav-chevron)");
        var label = span ? span.textContent.trim() : "";
        if (!label) return;
        if (!link.getAttribute("data-cnds-original-title")) link.setAttribute("title", label);
        Nimbus.Tooltip.getOrCreateInstance(link, { placement: "right", trigger: "hover", offset: [0, 12] });
      });
    }

    function removeSlimTooltips() {
      if (!window.Nimbus || !Nimbus.Tooltip) return;
      slimTooltipLinks().forEach(function (link) {
        var inst = Nimbus.Tooltip.getInstance(link);
        if (inst) inst.dispose();
        link.removeAttribute("title");
      });
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    categoryToggles.forEach(function (toggle) {
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        var submenu = submenuOf(toggle);
        if (!submenu || submenu.classList.contains("collapsing")) return;

        /* Clicking a category while slim expands the panel first, then
           opens the submenu — mirrors Nimbus Sidenav._toggleSubmenu(). */
        if (isSlim()) {
          setSlim(false);
          requestAnimationFrame(function () {
            closeOtherSubmenus(toggle);
            animateSubmenu(toggle, submenu, true);
          });
          return;
        }

        closeOtherSubmenus(toggle);
        animateSubmenu(toggle, submenu, !submenu.classList.contains("show"));
      });
    });

    /* Leaf click — owns the active state. In Angular this whole handler
       is replaced by routerLinkActive; see tmpl_ca_sidenav.ANGULAR.md. */
    navLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();

        /* Optional hook: data-ca-tab="<id>" clicks a Nimbus tab button,
           for frames that swap content via tabs rather than routing. */
        var tabId  = link.getAttribute("data-ca-tab");
        var tabBtn = tabId ? byId(tabId) : null;
        if (tabBtn) tabBtn.click();

        navLinks.forEach(function (l) {
          l.classList.remove("active");
          l.removeAttribute("aria-current");
        });
        categoryToggles.forEach(function (t) { t.classList.remove("active"); });

        link.classList.add("active");
        link.setAttribute("aria-current", "page");

        /* Highlight the parent category when the leaf is nested. */
        var collapse = link.closest(".sidenav-collapse");
        var parent   = collapse ? collapse.previousElementSibling : null;
        if (parent) parent.classList.add("active");
      });
    });

    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        if (!isSlim()) {
          /* Collapse an open submenu BEFORE shrinking: the two height
             animations would otherwise fight over the same box. */
          var open = openSubmenu();
          if (!open) { setSlim(true); return; }
          animateSubmenu(open.toggle, open.submenu, false);
          setTimeout(function () { setSlim(true); }, DUR.SUBMENU + TRANSITION_SLOP);
          return;
        }

        setSlim(false);
        /* Restore the active category's submenu once the panel is wide. */
        setTimeout(function () {
          categoryToggles.forEach(function (t) {
            if (!t.classList.contains("active")) return;
            var s = submenuOf(t);
            if (s && !s.classList.contains("show")) animateSubmenu(t, s, true);
          });
          updateLayout();
        }, DUR.SIDENAV_WIDTH + TRANSITION_SLOP);
      });
    }
  })();
}());
