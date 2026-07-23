/**
 * ============================================================
 * CNDS Multi Range Slider Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Dual-thumb range slider for selecting a value range.
 *
 * Usage:
 *   <div data-cnds-multi-range-init data-cnds-min="0" data-cnds-max="100"
 *        data-cnds-value-low="20" data-cnds-value-high="80"></div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "multirange";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  const Default = {
    min: 0,
    max: 100,
    step: 1,
    valueLow: 20,
    valueHigh: 80,
    showLabels: true,
    showScale: false,
    scaleSteps: 5,
    numberOfRanges: 2,
    disabled: false,
    formatLabel: null
  };

  const DefaultType = {
    min: "number",
    max: "number",
    step: "number",
    valueLow: "number",
    valueHigh: "number",
    showLabels: "boolean",
    showScale: "boolean",
    scaleSteps: "number",
    numberOfRanges: "number",
    disabled: "boolean",
    formatLabel: "(function|null)"
  };

  class MultiRange extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._track = null;
      this._fill = null;
      this._thumbLow = null;
      this._thumbHigh = null;
      this._labelLow = null;
      this._labelHigh = null;
      this._activeThumb = null;
      this._init();
    }

    static get NAME() {
      return NAME;
    }
    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }

    getValues() {
      return { low: this._config.valueLow, high: this._config.valueHigh };
    }

    setValues(low, high) {
      this._config.valueLow = Math.max(
        this._config.min,
        Math.min(low, this._config.valueHigh)
      );
      this._config.valueHigh = Math.min(
        this._config.max,
        Math.max(high, this._config.valueLow)
      );
      this._updateUI();
      this._triggerChange();
    }

    setLow(val) {
      this._config.valueLow = Math.max(
        this._config.min,
        Math.min(val, this._config.valueHigh)
      );
      this._updateUI();
      this._triggerChange();
    }

    setHigh(val) {
      this._config.valueHigh = Math.min(
        this._config.max,
        Math.max(val, this._config.valueLow)
      );
      this._updateUI();
      this._triggerChange();
    }

    dispose() {
      super.dispose();
    }

    _init() {
      this._element.classList.add("multi-range");
      if (this._config.disabled) this._element.classList.add("disabled");

      // Build UI
      this._track = document.createElement("div");
      this._track.className = "multi-range-track";

      this._fill = document.createElement("div");
      this._fill.className = "multi-range-fill";
      this._track.appendChild(this._fill);

      // Low thumb
      this._thumbLow = document.createElement("div");
      this._thumbLow.className = "multi-range-thumb";
      this._thumbLow.setAttribute("role", "slider");
      this._thumbLow.setAttribute("tabindex", "0");
      this._thumbLow.setAttribute("aria-label", "Low value");
      if (this._config.showLabels) {
        this._labelLow = document.createElement("div");
        this._labelLow.className = "multi-range-label";
        this._thumbLow.appendChild(this._labelLow);
      }
      this._track.appendChild(this._thumbLow);

      // Single-range mode: hide low thumb and pin its value to min
      if (this._config.numberOfRanges === 1) {
        this._thumbLow.style.display = "none";
        this._config.valueLow = this._config.min;
      }

      // High thumb
      this._thumbHigh = document.createElement("div");
      this._thumbHigh.className = "multi-range-thumb";
      this._thumbHigh.setAttribute("role", "slider");
      this._thumbHigh.setAttribute("tabindex", "0");
      this._thumbHigh.setAttribute("aria-label", "High value");
      if (this._config.showLabels) {
        this._labelHigh = document.createElement("div");
        this._labelHigh.className = "multi-range-label";
        this._thumbHigh.appendChild(this._labelHigh);
      }
      this._track.appendChild(this._thumbHigh);

      this._element.appendChild(this._track);

      // Scale
      if (this._config.showScale) {
        var scale = document.createElement("div");
        scale.className = "multi-range-scale";
        var range = this._config.max - this._config.min;
        for (var i = 0; i <= this._config.scaleSteps; i++) {
          var span = document.createElement("span");
          span.textContent = Math.round(
            this._config.min + (range / this._config.scaleSteps) * i
          );
          scale.appendChild(span);
        }
        this._element.appendChild(scale);
      }

      this._updateUI();
      this._bindEvents();
    }

    _updateUI() {
      var range = this._config.max - this._config.min;
      var lowPct = ((this._config.valueLow - this._config.min) / range) * 100;
      var highPct = ((this._config.valueHigh - this._config.min) / range) * 100;

      this._thumbHigh.style.left = highPct + "%";
      if (this._config.numberOfRanges === 1) {
        this._fill.style.left = "0%";
        this._fill.style.width = highPct + "%";
      } else {
        this._thumbLow.style.left = lowPct + "%";
        this._fill.style.left = lowPct + "%";
        this._fill.style.width = highPct - lowPct + "%";
      }

      var formatFn =
        this._config.formatLabel ||
        function (v) {
          return v;
        };

      if (this._labelLow)
        this._labelLow.textContent = formatFn(this._config.valueLow);
      if (this._labelHigh)
        this._labelHigh.textContent = formatFn(this._config.valueHigh);

      this._thumbLow.setAttribute("aria-valuenow", this._config.valueLow);
      this._thumbLow.setAttribute("aria-valuemin", this._config.min);
      this._thumbLow.setAttribute("aria-valuemax", this._config.valueHigh);
      this._thumbHigh.setAttribute("aria-valuenow", this._config.valueHigh);
      this._thumbHigh.setAttribute("aria-valuemin", this._config.valueLow);
      this._thumbHigh.setAttribute("aria-valuemax", this._config.max);
    }

    _bindEvents() {
      var self = this;

      // Mouse events
      var onMouseDown = function (thumb, isLow) {
        return function (e) {
          e.preventDefault();
          self._activeThumb = isLow ? "low" : "high";
          thumb.classList.add("active");
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        };
      };

      var onMouseMove = function (e) {
        self._handleMove(e.clientX);
      };

      var onMouseUp = function () {
        if (self._activeThumb === "low")
          self._thumbLow.classList.remove("active");
        else self._thumbHigh.classList.remove("active");
        self._activeThumb = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      this._thumbLow.addEventListener(
        "mousedown",
        onMouseDown(this._thumbLow, true)
      );
      this._thumbHigh.addEventListener(
        "mousedown",
        onMouseDown(this._thumbHigh, false)
      );

      // Touch events
      var onTouchStart = function (thumb, isLow) {
        return function (e) {
          self._activeThumb = isLow ? "low" : "high";
          thumb.classList.add("active");
          document.addEventListener("touchmove", onTouchMove, {
            passive: false
          });
          document.addEventListener("touchend", onTouchEnd);
        };
      };

      var onTouchMove = function (e) {
        e.preventDefault();
        if (e.touches.length > 0) self._handleMove(e.touches[0].clientX);
      };

      var onTouchEnd = function () {
        if (self._activeThumb === "low")
          self._thumbLow.classList.remove("active");
        else self._thumbHigh.classList.remove("active");
        self._activeThumb = null;
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
      };

      this._thumbLow.addEventListener(
        "touchstart",
        onTouchStart(this._thumbLow, true),
        { passive: true }
      );
      this._thumbHigh.addEventListener(
        "touchstart",
        onTouchStart(this._thumbHigh, false),
        { passive: true }
      );

      // Keyboard
      this._thumbLow.addEventListener("keydown", function (e) {
        self._handleKey(e, "low");
      });
      this._thumbHigh.addEventListener("keydown", function (e) {
        self._handleKey(e, "high");
      });
    }

    _handleMove(clientX) {
      var rect = this._track.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      var range = this._config.max - this._config.min;
      var val = this._config.min + pct * range;
      val = Math.round(val / this._config.step) * this._config.step;

      if (this._activeThumb === "low") {
        this._config.valueLow = Math.max(
          this._config.min,
          Math.min(val, this._config.valueHigh)
        );
      } else {
        this._config.valueHigh = Math.min(
          this._config.max,
          Math.max(val, this._config.valueLow)
        );
      }

      this._updateUI();
      this._triggerChange();
    }

    _handleKey(e, which) {
      var step = this._config.step;
      var delta = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
      else return;

      e.preventDefault();
      if (which === "low") {
        this._config.valueLow = Math.max(
          this._config.min,
          Math.min(this._config.valueLow + delta, this._config.valueHigh)
        );
      } else {
        this._config.valueHigh = Math.min(
          this._config.max,
          Math.max(this._config.valueHigh + delta, this._config.valueLow)
        );
      }
      this._updateUI();
      this._triggerChange();
    }

    _triggerChange() {
      // Dispatch with the full namespaced event name so native addEventListener
      // can match 'change.cnds.multirange' directly, without relying on
      // EventHandler's namespace-stripping behaviour.
      this._element.dispatchEvent(
        new CustomEvent(EVENT_CHANGE, {
          bubbles: true,
          cancelable: true,
          detail: {
            low: this._config.valueLow,
            high: this._config.valueHigh
          }
        })
      );
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = MultiRange.getInstance(this);
        if (!instance)
          instance = new MultiRange(
            this,
            typeof config === "object" ? config : {}
          );
        if (typeof config === "string") {
          if (typeof instance[config] !== "function")
            throw new TypeError("No method named " + config);
          instance[config]();
        }
      });
    }
  }

  function autoInit(root) {
    if (root === undefined) root = document;
    root
      .querySelectorAll("[data-cnds-multi-range-init]")
      .forEach(function (el) {
        if (!MultiRange.getInstance(el)) new MultiRange(el);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      autoInit();
    });
  } else {
    autoInit();
  }

  window.Nimbus = window.Nimbus || {};
  window.Nimbus.MultiRange = MultiRange;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, MultiRange);
})();
