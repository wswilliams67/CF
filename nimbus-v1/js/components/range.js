/**
 * ============================================================
 * CNDS Range Slider Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine } = window.Nimbus;

  const NAME = "range";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_CHANGE = `change${EVENT_KEY}`;
  const EVENT_INPUT = `input${EVENT_KEY}`;

  const Default = {
    showValue: true,
    format: null
  };

  const DefaultType = {
    showValue: "boolean",
    format: "function|null"
  };

  class Range extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._input =
        SelectorEngine.findOne(
          'input[type="range"], .form-range',
          this._element
        ) || this._element;

      this._valueDisplay = SelectorEngine.findOne(
        ".range-value",
        this._element
      );

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

    getValue() {
      return parseFloat(this._input.value);
    }

    setValue(value) {
      this._input.value = value;
      this._updateDisplay();
      EventHandler.trigger(this._element, EVENT_CHANGE, { value });
    }

    dispose() {
      EventHandler.off(this._input, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Auto-create .range-value tooltip element if showValue is enabled and
      // one is not already present in the DOM (mirrors multi-range label init).
      if (this._config.showValue && !this._valueDisplay) {
        const label = document.createElement("span");
        label.className = "range-value";
        this._element.appendChild(label);
        this._valueDisplay = label;
      }

      this._updateDisplay();
      this._bindEvents();
    }

    _bindEvents() {
      // Show tooltip on pointer press. Browsers implicitly apply pointer capture
      // to native range inputs during drag, so pointerup fires on the input
      // even when the pointer moves outside — no document-level listener needed.
      EventHandler.on(this._input, `pointerdown${EVENT_KEY}`, () => {
        this._element.classList.add("is-active");
      });

      EventHandler.on(this._input, `pointerup${EVENT_KEY}`, () => {
        this._element.classList.remove("is-active");
      });

      // Also remove on blur (keyboard navigation, tab away).
      EventHandler.on(this._input, `blur${EVENT_KEY}`, () => {
        this._element.classList.remove("is-active");
      });

      EventHandler.on(this._input, `input${EVENT_KEY}`, () => {
        this._updateDisplay();
        EventHandler.trigger(this._element, EVENT_INPUT, {
          value: this.getValue()
        });
      });

      EventHandler.on(this._input, `change${EVENT_KEY}`, () => {
        EventHandler.trigger(this._element, EVENT_CHANGE, {
          value: this.getValue()
        });
      });
    }

    _updateDisplay() {
      if (!this._valueDisplay) return;

      const value = this.getValue();
      const formatted = this._config.format
        ? this._config.format(value)
        : value;

      this._valueDisplay.textContent = formatted;

      // Position the tooltip to track the native thumb centre.
      // Native range thumbs are offset inward by half their width at the
      // extremes (browser keeps the thumb fully on-screen), so a plain
      // `percent%` would drift up to 8 px off-centre at 0 and 100.
      // Correction: calc(p% + (thumbHalf - p/100 * thumbWidth))
      //   At 0 %  : +8 px  → tooltip sits over the leftmost thumb centre
      //   At 50 % : ±0 px  → no correction needed at midpoint
      //   At 100 %: −8 px  → tooltip sits over the rightmost thumb centre
      const min = parseFloat(this._input.min) || 0;
      const max = parseFloat(this._input.max) || 100;
      const percent = ((value - min) / (max - min)) * 100;
      const correction = (10 - percent * 0.16).toFixed(2);
      this._valueDisplay.style.left = `calc(${percent}% + ${correction}px)`;
    }

  }

  // Auto-initialize all [data-cnds-range-init] elements
  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-range-init]").forEach((el) => {
      if (!Range.getInstance(el)) Range.getOrCreateInstance(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Range);
  }

  // Export
  window.Nimbus.Range = Range;
})();
