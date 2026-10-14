/**
 * ============================================================
 * CNDS Loading Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine } = window.Nimbus;

  const NAME = "loading";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;

  const Default = {
    spinner: "border",
    text: "",
    fullpage: false,
    backdrop: true,
    color: "primary"
  };

  const DefaultType = {
    spinner: "string",
    text: "string",
    fullpage: "boolean",
    backdrop: "boolean",
    color: "string"
  };

  class Loading extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._overlay = null;
      this._isShown = false;

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

    show() {
      if (this._isShown) return;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      this._isShown = true;

      if (!this._overlay) {
        this._createOverlay();
      }

      // Ensure parent is positioned
      const position = getComputedStyle(this._element).position;
      if (position === "static") {
        this._element.style.position = "relative";
      }

      this._element.appendChild(this._overlay);

      // Force reflow then show
      void this._overlay.offsetHeight;
      this._overlay.classList.add("show");
    }

    hide() {
      if (!this._isShown) return;

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._isShown = false;
      this._overlay.classList.remove("show");

      setTimeout(() => {
        if (this._overlay && this._overlay.parentNode) {
          this._overlay.parentNode.removeChild(this._overlay);
        }
      }, 200);
    }

    toggle() {
      if (this._isShown) {
        this.hide();
      } else {
        this.show();
      }
    }

    dispose() {
      this.hide();
      this._overlay = null;
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Auto-show if element has data attribute
      if (this._element.hasAttribute("data-cnds-loading")) {
        this.show();
      }
    }

    _createOverlay() {
      this._overlay = document.createElement("div");
      this._overlay.className = "loading-overlay";

      if (this._config.fullpage) {
        this._overlay.classList.add("loading-fullpage");
      }

      // Create spinner
      const spinner = document.createElement("div");
      if (this._config.spinner === "grow") {
        spinner.className = `spinner-grow text-${this._config.color}`;
      } else if (this._config.spinner === "dots") {
        spinner.className = `spinner-dots text-${this._config.color}`;
        spinner.innerHTML = "<span></span><span></span><span></span>";
      } else {
        spinner.className = `spinner-border text-${this._config.color}`;
      }
      spinner.setAttribute("role", "status");

      const srText = document.createElement("span");
      srText.className = "visually-hidden";
      srText.textContent = "Loading...";
      spinner.appendChild(srText);

      this._overlay.appendChild(spinner);

      // Add text if provided
      if (this._config.text) {
        const text = document.createElement("span");
        text.className = "loading-text";
        text.textContent = this._config.text;
        this._overlay.appendChild(text);
      }
    }

    // --- Static convenience ---

    static show(element, config) {
      const instance = Loading.getOrCreateInstance(element, config);
      instance.show();
      return instance;
    }

    static hide(element) {
      const instance = Loading.getInstance(element);
      if (instance) instance.hide();
    }

    static jQueryInterface(config) {
      return this.each(function () {
        const data = Loading.getOrCreateInstance(this, config);
        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config]();
        }
      });
    }
  }

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Loading);
  }

  // Export
  window.Nimbus.Loading = Loading;
})();
