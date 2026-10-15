/**
 * ============================================================
 * CNDS ScrollSpy
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Automatically highlights the right-sidebar nav link whose
 * target section is currently in the viewport.  Works with any
 * `.menu-sidebar` nav that contains `a[href^="#"]` links.
 * ============================================================
 */

(() => {
  "use strict";

  const SIDEBAR_SELECTOR = ".nav-pills.menu-sidebar";
  const LINK_SELECTOR = 'a.nav-link[href^="#"]';
  const ACTIVE_CLASS = "active";
  const OFFSET = 80; // px below viewport top to consider "in view"
  const CLICK_LOCK_MS = 750; // ms to suppress scroll-spy after a nav click

  let ticking = false;
  let sidebarNav = null;
  let links = [];
  let sections = [];
  let clickLockUntil = 0; // timestamp — ignore scroll updates until this time

  /**
   * Gather all sidebar links and their matching target sections.
   */
  function collectTargets() {
    sidebarNav = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebarNav) return;

    links = Array.from(sidebarNav.querySelectorAll(LINK_SELECTOR));
    sections = [];

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (target) {
        sections.push({ link, target, id: href.slice(1) });
      }
    });
  }

  /**
   * Set the active link, removing active from all others.
   */
  function setActive(activeLink) {
    if (!activeLink) return;
    links.forEach((l) => l.classList.remove(ACTIVE_CLASS));
    activeLink.classList.add(ACTIVE_CLASS);
  }

  /**
   * Determine which section is currently in view and activate
   * the corresponding sidebar link.
   */
  function updateActiveOnScroll() {
    if (!sections.length) return;

    // If a nav link was recently clicked, skip the scroll-based
    // update so the clicked link stays highlighted while the
    // browser finishes its anchor scroll.
    if (Date.now() < clickLockUntil) return;

    const scrollY = window.pageYOffset;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    // If scrolled to the very bottom, activate the last section
    if (scrollY + windowHeight >= docHeight - 2) {
      setActive(sections[sections.length - 1].link);
      return;
    }

    // Walk sections in reverse — first one whose top is above the offset wins
    let current = null;
    for (let i = sections.length - 1; i >= 0; i--) {
      const rect = sections[i].target.getBoundingClientRect();
      if (rect.top <= OFFSET) {
        current = sections[i].link;
        break;
      }
    }

    // If nothing matched (user is above the first section), activate the first
    if (!current && sections.length) {
      current = sections[0].link;
    }

    setActive(current);
  }

  /**
   * Throttled scroll handler using requestAnimationFrame.
   */
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateActiveOnScroll();
        ticking = false;
      });
      ticking = true;
    }
  }

  /**
   * Handle click on a sidebar link — immediately set active
   * and lock the scroll handler for a short period so the
   * browser's anchor-scroll doesn't override the highlight.
   */
  function onLinkClick(event) {
    const link = event.target.closest(LINK_SELECTOR);
    if (!link || !sidebarNav || !sidebarNav.contains(link)) return;
    setActive(link);
    clickLockUntil = Date.now() + CLICK_LOCK_MS;
  }

  /**
   * Initialize the scrollspy.
   */
  function init() {
    collectTargets();
    if (!sidebarNav || !sections.length) return;

    window.addEventListener("scroll", onScroll, { passive: true });
    sidebarNav.addEventListener("click", onLinkClick);

    // Set initial active state
    updateActiveOnScroll();
  }

  // Auto-init on DOMContentLoaded or immediately if already loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // Defer slightly to ensure all sections are rendered
    requestAnimationFrame(init);
  }

  // Re-collect targets if the DOM changes (e.g., dynamic content)
  // Expose a refresh method on the public API
  window.Nimbus.ScrollSpy = {
    refresh() {
      collectTargets();
      updateActiveOnScroll();
    }
  };
})();
