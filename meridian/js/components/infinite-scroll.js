/**
 * ============================================================
 * CNDS Infinite Scroll Utility
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler } = window.Nimbus;

  const NAME = "infiniteScroll";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_LOAD = `completed${EVENT_KEY}`;
  const EVENT_COMPLETE = `complete${EVENT_KEY}`;

  const Default = {
    threshold: 200,
    container: null,
    spinner: true,
    infiniteDirection: "y"
  };

  const DefaultType = {
    threshold: "number",
    container: "element|null",
    spinner: "boolean",
    infiniteDirection: "string"
  };

  class InfiniteScroll extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._isLoading = false;
      this._isComplete = false;
      this._scrollContainer = this._config.container || element;
      this._spinnerEl = null;

      this._init();
    }

    static get Default() {
      return Default;
    }

    static get DefaultType() {
      return DefaultType;
    }

    static get NAME() {
      return NAME;
    }

    // --- Public API ---

    complete() {
      this._isComplete = true;
      this._removeSpinner();
      EventHandler.trigger(this._element, EVENT_COMPLETE);
    }

    reset() {
      this._isComplete = false;
      this._isLoading = false;
    }

    loaded() {
      this._isLoading = false;
      this._removeSpinner();
    }

    dispose() {
      this._unbindScroll();
      this._removeSpinner();
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._bindScroll();
    }

    _bindScroll() {
      this._scrollHandler = () => this._onScroll();
      this._scrollContainer.addEventListener("scroll", this._scrollHandler, {
        passive: true
      });
    }

    _unbindScroll() {
      if (this._scrollHandler) {
        this._scrollContainer.removeEventListener(
          "scroll",
          this._scrollHandler
        );
      }
    }

    _onScroll() {
      if (this._isLoading || this._isComplete) return;

      const isHorizontal = this._config.infiniteDirection === "x";
      const isWindow = this._scrollContainer === window;

      const scrollSize = isHorizontal
        ? (isWindow ? document.documentElement.scrollWidth : this._scrollContainer.scrollWidth)
        : (isWindow ? document.documentElement.scrollHeight : this._scrollContainer.scrollHeight);

      const scrollPos = isHorizontal
        ? (isWindow ? window.pageXOffset : this._scrollContainer.scrollLeft)
        : (isWindow ? window.pageYOffset : this._scrollContainer.scrollTop);

      const clientSize = isHorizontal
        ? (isWindow ? window.innerWidth : this._scrollContainer.clientWidth)
        : (isWindow ? window.innerHeight : this._scrollContainer.clientHeight);

      if (scrollSize - scrollPos - clientSize <= this._config.threshold) {
        this._triggerLoad();
      }
    }

    _triggerLoad() {
      this._isLoading = true;

      if (this._config.spinner) {
        this._showSpinner();
      }

      EventHandler.trigger(this._element, EVENT_LOAD);
    }

    _showSpinner() {
      if (this._spinnerEl) return;

      this._spinnerEl = document.createElement("div");
      this._spinnerEl.className = "text-center py-3";
      this._spinnerEl.innerHTML =
        '<div class="spinner-border spinner-border-sm text-primary" role="status">' +
        '<span class="visually-hidden">Loading...</span></div>';

      this._element.appendChild(this._spinnerEl);
    }

    _removeSpinner() {
      if (this._spinnerEl) {
        this._spinnerEl.remove();
        this._spinnerEl = null;
      }
    }

    static jQueryInterface(config) {
      return this.each(function () {
        const data = InfiniteScroll.getOrCreateInstance(this, config);
        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config]();
        }
      });
    }
  }

  window.Nimbus.InfiniteScroll = InfiniteScroll;

  // Auto-initialize elements with data-cnds-infinite-scroll-init
  document.querySelectorAll("[data-cnds-infinite-scroll-init]").forEach(function (el) {
    if (!InfiniteScroll.getInstance(el)) {
      InfiniteScroll.getOrCreateInstance(el);
    }
  });
})();
