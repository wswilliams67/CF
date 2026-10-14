/**
 * ============================================================
 * CNDS Sticky Component
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Pins elements to a fixed viewport position on scroll.
 * Supports top/bottom positioning, scroll-direction filtering,
 * parent and selector-based boundaries, animated transitions,
 * and programmatic control via the Nimbus.Sticky API.
 *
 * Data API auto-init: data-cnds-sticky="true"
 *
 * Options (data-cnds-sticky-* attributes):
 *   boundary            — true (parent) | CSS selector | false
 *   delay               — px past trigger before pinning activates
 *   direction           — 'up' | 'down' | 'both'
 *   media               — minimum viewport width in px (0 = always)
 *   offset              — px gap from viewport edge when pinned
 *   position            — 'top' | 'bottom'
 *   animation-sticky    — CSS class applied on entering sticky state
 *   animation-unsticky  — CSS class applied on leaving sticky state
 *   active-class        — CSS class maintained while element is sticky
 *
 * Events (dispatched on the sticky element):
 *   activated.cnds.sticky   — fired after the element is pinned
 *   deactivated.cnds.sticky — fired after the element is released
 *
 * Programmatic usage:
 *   const instance = new Nimbus.Sticky(el);
 *   instance.activate();
 *   instance.deactivate();
 *   Nimbus.Sticky.getInstance(el);
 *   Nimbus.Sticky.getOrCreateInstance(el);
 * ============================================================
 */
(() => {
  "use strict";

  const { NimbusComponent, EventHandler } = window.Nimbus;

  const NAME           = "sticky";
  const DATA_ATTR_INIT = "data-cnds-sticky";

  // -----------------------------------------------------------------------
  // Defaults
  // -----------------------------------------------------------------------
  const Default = {
    stickyBoundary:          false,
    stickyDelay:             0,
    stickyDirection:         "down",
    stickyMedia:             0,
    stickyOffset:            0,
    stickyPosition:          "top",
    stickyAnimationSticky:   "",
    stickyAnimationUnsticky: "",
    stickyActiveClass:       ""
  };

  const DefaultType = {
    stickyBoundary:          "(boolean|string)",
    stickyDelay:             "number",
    stickyDirection:         "string",
    stickyMedia:             "number",
    stickyOffset:            "number",
    stickyPosition:          "string",
    stickyAnimationSticky:   "string",
    stickyAnimationUnsticky: "string",
    stickyActiveClass:       "string"
  };

  // -----------------------------------------------------------------------
  // Sticky Class
  // -----------------------------------------------------------------------
  class Sticky extends NimbusComponent {
    /**
     * @param {HTMLElement} element
     * @param {Object}      [config={}]
     */
    constructor(element, config = {}) {
      super(element, config);

      this._isActive    = false;   // true while the element is position:fixed
      this._placeholder = null;    // ghost div that holds layout space when pinned
      this._lastScrollY = window.scrollY;
      this._triggerY    = 0;       // scrollY value at which pinning begins
      this._boundaryEl  = null;    // resolved boundary element (or null)

      // Bind so we can remove the exact same function reference on dispose
      this._onScroll = this._handleScroll.bind(this);
      this._onResize = this._handleResize.bind(this);

      this._setup();
    }

    // -----------------------------------------------------------------------
    // Static properties
    // -----------------------------------------------------------------------
    static get NAME()        { return NAME; }
    static get Default()     { return Default; }
    static get DefaultType() { return DefaultType; }

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------
    _setup() {
      this._resolveBoundary();
      this._calcTrigger();

      window.addEventListener("scroll", this._onScroll, { passive: true });
      window.addEventListener("resize", this._onResize);

      // Check immediately — the page may already be scrolled past the trigger
      this._handleScroll();
    }

    /** Resolve the boundary element from config. */
    _resolveBoundary() {
      const b = this._config.stickyBoundary;
      if (b === true) {
        this._boundaryEl = this._element.parentElement;
      } else if (typeof b === "string" && b) {
        this._boundaryEl = document.querySelector(b);
      } else {
        this._boundaryEl = null;
      }
    }

    /**
     * Calculate the scrollY threshold at which the element should pin.
     * Must be called from the element's natural (non-fixed) position.
     */
    _calcTrigger() {
      // Temporarily release so getBoundingClientRect reflects natural position
      const wasActive = this._isActive;
      if (wasActive) this._release();

      const rect    = this._element.getBoundingClientRect();
      const scrollY = window.scrollY;

      if (this._config.stickyPosition === "top") {
        this._triggerY = rect.top + scrollY - this._config.stickyOffset;
      } else {
        // bottom: pin when the element's bottom would scroll off the viewport bottom
        this._triggerY =
          rect.bottom + scrollY - (window.innerHeight - this._config.stickyOffset);
      }

      if (wasActive) this._pin();
    }

    // -----------------------------------------------------------------------
    // Scroll handler
    // -----------------------------------------------------------------------
    _handleScroll() {
      const scrollY = window.scrollY;

      // Disable below the media breakpoint (if set)
      if (this._config.stickyMedia > 0 && window.innerWidth < this._config.stickyMedia) {
        if (this._isActive) this._deactivate();
        this._lastScrollY = scrollY;
        return;
      }

      const dir       = this._config.stickyDirection;
      const goingDown = scrollY > this._lastScrollY;
      const goingUp   = scrollY < this._lastScrollY;

      // Direction gate — only respond to the configured scroll direction
      if (dir === "down" && !goingDown) {
        if (this._isActive && scrollY < this._triggerY) this._deactivate();
        this._lastScrollY = scrollY;
        return;
      }
      if (dir === "up" && !goingUp) {
        if (this._isActive && scrollY > this._triggerY) this._deactivate();
        this._lastScrollY = scrollY;
        return;
      }

      const shouldPin = scrollY >= this._triggerY + this._config.stickyDelay;

      if (shouldPin && !this._isActive) {
        if (!this._pastBoundary()) this._activate();
      } else if (!shouldPin && this._isActive) {
        this._deactivate();
      } else if (this._isActive && this._pastBoundary()) {
        // Release before the element collides with its boundary
        this._deactivate();
      }

      this._lastScrollY = scrollY;
    }

    // -----------------------------------------------------------------------
    // Boundary check
    // -----------------------------------------------------------------------
    /** Returns true when the pinned element has reached (or passed) its boundary. */
    _pastBoundary() {
      if (!this._boundaryEl) return false;

      const bRect  = this._boundaryEl.getBoundingClientRect();
      const elH    = this._element.offsetHeight;
      const offset = this._config.stickyOffset;

      if (this._config.stickyPosition === "top") {
        return bRect.bottom - offset - elH <= 0;
      }
      return bRect.top + offset + elH >= window.innerHeight;
    }

    // -----------------------------------------------------------------------
    // Pin / release
    // -----------------------------------------------------------------------
    _activate() {
      this._pin();
      this._isActive = true;

      if (this._config.stickyActiveClass) {
        this._element.classList.add(this._config.stickyActiveClass);
      }
      if (this._config.stickyAnimationSticky) {
        this._playAnimation(this._config.stickyAnimationSticky);
      }

      this._triggerEvent("activated");
    }

    _deactivate() {
      this._release();
      this._isActive = false;

      if (this._config.stickyActiveClass) {
        this._element.classList.remove(this._config.stickyActiveClass);
      }
      if (this._config.stickyAnimationUnsticky) {
        this._playAnimation(this._config.stickyAnimationUnsticky);
      }

      this._triggerEvent("deactivated");
    }

    /** Apply position:fixed and insert a placeholder to hold layout space. */
    _pin() {
      const rect = this._element.getBoundingClientRect();

      // Create the placeholder once; reuse on subsequent activations
      if (!this._placeholder) {
        this._placeholder = document.createElement("div");
        this._placeholder.setAttribute("aria-hidden", "true");
        this._placeholder.style.visibility = "hidden";
      }
      this._placeholder.style.width  = this._element.offsetWidth  + "px";
      this._placeholder.style.height = this._element.offsetHeight + "px";
      this._element.insertAdjacentElement("afterend", this._placeholder);

      Object.assign(this._element.style, {
        position: "fixed",
        zIndex:   "1030",
        left:     rect.left + "px",
        width:    rect.width + "px"
      });

      // Set the correct edge; clear the opposite edge
      if (this._config.stickyPosition === "top") {
        this._element.style.top    = this._config.stickyOffset + "px";
        this._element.style.bottom = "";
      } else {
        this._element.style.bottom = this._config.stickyOffset + "px";
        this._element.style.top    = "";
      }
    }

    /** Remove position:fixed and discard the placeholder. */
    _release() {
      Object.assign(this._element.style, {
        position: "",
        zIndex:   "",
        top:      "",
        bottom:   "",
        left:     "",
        width:    ""
      });

      if (this._placeholder && this._placeholder.parentNode) {
        this._placeholder.parentNode.removeChild(this._placeholder);
        // Keep the node in memory — it is reused if the element pins again
      }
    }

    // -----------------------------------------------------------------------
    // Animation helper
    // -----------------------------------------------------------------------
    _playAnimation(className) {
      // Remove first to allow re-triggering the same animation
      this._element.classList.remove(className);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this._element.classList.add(className);
          this._element.addEventListener(
            "animationend",
            () => this._element.classList.remove(className),
            { once: true }
          );
        });
      });
    }

    // -----------------------------------------------------------------------
    // Resize handler — recalculate trigger when viewport dimensions change
    // -----------------------------------------------------------------------
    _handleResize() {
      if (this._isActive) this._deactivate();
      this._calcTrigger();
    }

    // -----------------------------------------------------------------------
    // Public instance API
    // -----------------------------------------------------------------------
    /** Manually pin the element regardless of scroll position. */
    activate() {
      if (!this._isActive) this._activate();
    }

    /** Manually release the element from its pinned position. */
    deactivate() {
      if (this._isActive) this._deactivate();
    }

    dispose() {
      window.removeEventListener("scroll", this._onScroll);
      window.removeEventListener("resize", this._onResize);
      if (this._isActive) this._release();
      super.dispose();
    }

    // -----------------------------------------------------------------------
    // Static initialiser — called by DataAPI.initAll()
    // -----------------------------------------------------------------------
    /**
     * Scan the DOM for [data-cnds-sticky="true"] and instantiate each element.
     * @param {Document|HTMLElement} [root=document]
     */
    static init(root = document) {
      const elements = root.querySelectorAll(`[${DATA_ATTR_INIT}="true"]`);
      for (const el of elements) {
        if (!Sticky.getInstance(el)) {
          try {
            new Sticky(el);
          } catch (e) {
            console.warn("CNDS Sticky: failed to init element:", el, e);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus.Sticky = Sticky;

  // Register with DataAPI for data-cnds-init="sticky" support (future use)
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Sticky);
  }
})();
