/**
 * ============================================================
 * CNDS Smooth Scroll Utility
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { EventHandler } = window.Nimbus;

  const NAME = "smoothScroll";
  const DATA_KEY = "cnds.smoothScroll";
  const EVENT_KEY = `.${DATA_KEY}`;

  // Matches any <a> pointing to an on-page anchor. data-cnds-smooth-scroll-init
  // is the declarative marker; this selector is intentionally broad so that
  // navigation links (sidenav, right-rail scrollspy) also animate.
  const SELECTOR = 'a[href^="#"]:not([href="#"])';

  const Default = {
    container: "body",
    duration: 500,
    easing: "linear",
    offset: 0
  };

  const Easings = {
    linear:         (t) => t,
    easeInQuad:     (t) => t * t,
    easeOutQuad:    (t) => t * (2 - t),
    easeInOutQuad:  (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic:    (t) => t * t * t,
    easeOutCubic:   (t) => --t * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuart:    (t) => t * t * t * t,
    easeOutQuart:   (t) => 1 - --t * t * t * t,
    easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
    easeInQuint:    (t) => t * t * t * t * t,
    easeOutQuint:   (t) => 1 + --t * t * t * t * t,
    easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t
  };

  // ── SmoothScroll class ──────────────────────────────────────────────────────

  class SmoothScroll {
    constructor(element, config = {}) {
      this._element = element;
      this._config = { ...Default, ...config };
      this._rafId = null;
      this._cancelled = false;

      this._clickHandler = (event) => this._handleClick(event);
      this._element.addEventListener("click", this._clickHandler);

      SmoothScroll._instances.set(element, this);
    }

    // ── Public methods ────────────────────────────────────────────────────────

    /**
     * Cancel an in-progress scroll animation immediately.
     */
    cancelScroll() {
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
        this._cancelled = true;
        this._element.dispatchEvent(
          new CustomEvent(`scrollCancel${EVENT_KEY}`, { bubbles: true })
        );
      }
    }

    /**
     * Remove all event listeners and drop the instance from the registry.
     */
    dispose() {
      this.cancelScroll();
      this._element.removeEventListener("click", this._clickHandler);
      SmoothScroll._instances.delete(this._element);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _handleClick(event) {
      const href = this._element.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();

      const config = {
        ...this._config,
        offset:    parseInt(this._element.dataset.cndsOffset    ?? this._config.offset,   10),
        duration:  parseInt(this._element.dataset.cndsDuration  ?? this._config.duration, 10),
        easing:             this._element.dataset.cndsEasing    ?? this._config.easing,
        container:          this._element.dataset.cndsContainer ?? this._config.container
      };

      this._animateScroll(target, config);

      if (href.startsWith("#")) {
        history.pushState(null, null, href);
      }
    }

    _animateScroll(targetEl, config) {
      // Resolve container: window for 'body' / missing, DOM element otherwise
      const useWindow =
        !config.container ||
        config.container === "body" ||
        config.container === "window";

      const containerEl = useWindow
        ? null
        : typeof config.container === "string"
          ? document.querySelector(config.container)
          : config.container;

      if (!useWindow && !containerEl) return;

      // Starting scroll position
      const startPosition = useWindow
        ? window.pageYOffset
        : containerEl.scrollTop;

      // Target offset relative to the scroll container
      const containerTop = useWindow
        ? 0
        : containerEl.getBoundingClientRect().top;

      const targetPosition =
        targetEl.getBoundingClientRect().top -
        containerTop +
        startPosition -
        config.offset;

      const distance = targetPosition - startPosition;
      const easingFn = Easings[config.easing] ?? Easings.linear;

      // Suppress CSS scroll-behavior: smooth so rAF has full control
      let prevBehavior;
      if (useWindow) {
        prevBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = "auto";
      }

      this._cancelled = false;
      this._element.dispatchEvent(
        new CustomEvent(`scrollStart${EVENT_KEY}`, { bubbles: true })
      );

      let startTime = null;

      const step = (currentTime) => {
        if (this._cancelled) return;

        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / config.duration, 1);
        const newPos = startPosition + distance * easingFn(progress);

        if (useWindow) {
          window.scrollTo(0, newPos);
        } else {
          containerEl.scrollTop = newPos;
        }

        if (elapsed < config.duration) {
          this._rafId = requestAnimationFrame(step);
        } else {
          this._rafId = null;
          if (useWindow) {
            document.documentElement.style.scrollBehavior = prevBehavior;
          }
          this._element.dispatchEvent(
            new CustomEvent(`scrollEnd${EVENT_KEY}`, { bubbles: true })
          );
        }
      };

      this._rafId = requestAnimationFrame(step);
    }

    // ── Static ────────────────────────────────────────────────────────────────

    static getInstance(element) {
      return SmoothScroll._instances.get(element) ?? null;
    }

    static getOrCreateInstance(element, config = {}) {
      return (
        SmoothScroll._instances.get(element) ?? new SmoothScroll(element, config)
      );
    }
  }

  SmoothScroll._instances = new Map();

  // ── Delegated auto-init ─────────────────────────────────────────────────────
  // Intercepts clicks on any qualifying anchor and runs the scroll without
  // requiring an explicit constructor call. Skips elements already managed by
  // another component (tabs, collapse, accordion).

  EventHandler.on(document, "click", SELECTOR, function (event) {
    if (this.hasAttribute("data-cnds-toggle")) return;
    if (this.hasAttribute("data-cnds-tab-init")) return;

    const href = this.getAttribute("href") || this.dataset.cndsTarget;
    if (!href || href === "#") return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();

    const config = {
      container: this.dataset.cndsContainer ?? Default.container,
      offset:    parseInt(this.dataset.cndsOffset   ?? Default.offset,   10),
      duration:  parseInt(this.dataset.cndsDuration ?? Default.duration, 10),
      easing:             this.dataset.cndsEasing   ?? Default.easing
    };

    // Resolve container
    const useWindow =
      !config.container ||
      config.container === "body" ||
      config.container === "window";

    const containerEl = useWindow
      ? null
      : document.querySelector(config.container);

    if (!useWindow && !containerEl) return;

    const startPosition = useWindow ? window.pageYOffset : containerEl.scrollTop;
    const containerTop  = useWindow ? 0 : containerEl.getBoundingClientRect().top;
    const targetPosition =
      target.getBoundingClientRect().top - containerTop + startPosition - config.offset;

    const distance  = targetPosition - startPosition;
    const easingFn  = Easings[config.easing] ?? Easings.linear;

    let prevBehavior;
    if (useWindow) {
      prevBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
    }

    this.dispatchEvent(new CustomEvent(`scrollStart${EVENT_KEY}`, { bubbles: true }));

    let startTime = null;

    const step = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed  = currentTime - startTime;
      const progress = Math.min(elapsed / config.duration, 1);
      const newPos   = startPosition + distance * easingFn(progress);

      if (useWindow) {
        window.scrollTo(0, newPos);
      } else {
        containerEl.scrollTop = newPos;
      }

      if (elapsed < config.duration) {
        requestAnimationFrame(step);
      } else {
        if (useWindow) {
          document.documentElement.style.scrollBehavior = prevBehavior;
        }
        this.dispatchEvent(new CustomEvent(`scrollEnd${EVENT_KEY}`, { bubbles: true }));
      }
    };

    requestAnimationFrame(step);

    if (href.startsWith("#")) {
      history.pushState(null, null, href);
    }
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  window.Nimbus.SmoothScroll = SmoothScroll;
})();
