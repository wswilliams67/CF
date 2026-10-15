/**
 * ============================================================
 * CNDS Lazy Loading Utility
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { EventHandler } = window.Nimbus;

  const NAME = "lazyLoad";
  const SELECTOR = "[data-cnds-lazy]";

  const Default = {
    rootMargin: "200px 0px",
    threshold: 0.01,
    loaded: "cnds-lazy-loaded",
    error: "cnds-lazy-error"
  };

  let observer = null;

  function loadElement(el) {
    const src = el.dataset.cndsSrc || el.dataset.cndsLazy;
    const srcset = el.dataset.cndsSrcset;
    const bgSrc = el.dataset.cndsBg;

    if (src && (el.tagName === "IMG" || el.tagName === "IFRAME")) {
      el.src = src;
    }

    if (srcset && el.tagName === "IMG") {
      el.srcset = srcset;
    }

    if (bgSrc) {
      el.style.backgroundImage = `url('${bgSrc}')`;
    }

    // Handle load/error events for images
    if (el.tagName === "IMG") {
      el.addEventListener(
        "load",
        () => {
          el.classList.add(Default.loaded);
          el.removeAttribute("data-cnds-lazy");
          el.removeAttribute("data-cnds-src");
          el.removeAttribute("data-cnds-srcset");
        },
        { once: true }
      );

      el.addEventListener(
        "error",
        () => {
          el.classList.add(Default.error);
        },
        { once: true }
      );
    } else {
      el.classList.add(Default.loaded);
      el.removeAttribute("data-cnds-lazy");
    }
  }

  function init(options = {}) {
    const config = { ...Default, ...options };

    if (!("IntersectionObserver" in window)) {
      // Fallback: load all immediately
      document.querySelectorAll(SELECTOR).forEach(loadElement);
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadElement(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      {
        rootMargin: config.rootMargin,
        threshold: config.threshold
      }
    );

    document.querySelectorAll(SELECTOR).forEach((el) => {
      observer.observe(el);
    });
  }

  /**
   * Observe new elements added dynamically
   */
  function observe(element) {
    if (observer && element) {
      observer.observe(element);
    }
  }

  /**
   * Refresh — re-scan DOM for new lazy elements
   */
  function refresh() {
    if (!observer) {
      init();
      return;
    }

    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (!el.classList.contains(Default.loaded)) {
        observer.observe(el);
      }
    });
  }

  function destroy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }

  window.Nimbus.LazyLoad = { init, observe, refresh, destroy };
})();
