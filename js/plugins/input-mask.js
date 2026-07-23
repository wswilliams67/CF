/**
 * ============================================================
 * CNDS Input Mask Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Applies input masks to text fields for formatted data entry.
 * Supports: phone, date, SSN, currency, custom patterns.
 *
 * Mask characters:
 *   9 = digit (0-9)
 *   a = letter (a-z, A-Z)
 *   * = alphanumeric
 *   Other characters are literal separators
 *
 * Usage:
 *   <input data-cnds-input-mask-init data-cnds-mask="(999) 999-9999" />
 *
 * Or programmatic:
 *   new Nimbus.InputMask(input, { mask: '99/99/9999' });
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "inputmask";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_COMPLETE = "complete" + EVENT_KEY;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  // Predefined masks
  const PRESETS = {
    phone: "(999) 999-9999",
    phoneIntl: "+9 (999) 999-9999",
    date: "99/99/9999",
    dateISO: "9999-99-99",
    time: "99:99",
    time12: "99:99 aa",
    ssn: "999-99-9999",
    zip: "99999",
    zipPlus4: "99999-9999",
    creditCard: "9999 9999 9999 9999",
    currency: "$9,999,999.99",
    ip: "999.999.999.999",
    ein: "99-9999999"
  };

  const Default = {
    mask: null,
    preset: null,
    placeholder: "_",
    showMaskOnFocus: true,
    showMaskOnHover: false,
    clearIncomplete: false,
    greedy: false
  };

  const DefaultType = {
    mask: "(string|null)",
    preset: "(string|null)",
    placeholder: "string",
    showMaskOnFocus: "boolean",
    showMaskOnHover: "boolean",
    clearIncomplete: "boolean",
    greedy: "boolean"
  };

  class InputMask extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._mask = "";
      this._buffer = [];
      this._definitions = [];
      this._isComplete = false;

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

    // --- Public API ---

    getValue() {
      return this._element.value;
    }

    getUnmaskedValue() {
      var val = this._element.value;
      var result = "";
      for (var i = 0; i < val.length && i < this._mask.length; i++) {
        var def = this._definitions[i];
        if (def && def.type !== "literal") {
          var ch = val[i];
          if (ch !== this._config.placeholder) {
            result += ch;
          }
        }
      }
      return result;
    }

    isComplete() {
      return this._isComplete;
    }

    setMask(mask) {
      this._config.mask = mask;
      this._parseMask();
      this._applyMask();
    }

    clear() {
      this._element.value = "";
      this._isComplete = false;
    }

    dispose() {
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Resolve mask
      if (this._config.preset && PRESETS[this._config.preset]) {
        this._mask = PRESETS[this._config.preset];
      } else if (this._config.mask) {
        this._mask = this._config.mask;
      } else {
        // Try data attribute
        var attrMask = this._element.getAttribute("data-cnds-mask");
        if (attrMask) {
          if (PRESETS[attrMask]) {
            this._mask = PRESETS[attrMask];
          } else {
            this._mask = attrMask;
          }
        }
      }

      if (!this._mask) return;

      this._parseMask();
      this._bindEvents();

      // Apply mask to existing value
      if (this._element.value) {
        this._applyMask();
      }
    }

    _parseMask() {
      this._definitions = [];
      for (var i = 0; i < this._mask.length; i++) {
        var ch = this._mask[i];
        if (ch === "9") {
          this._definitions.push({ type: "digit", char: ch, regex: /[0-9]/ });
        } else if (ch === "a") {
          this._definitions.push({
            type: "letter",
            char: ch,
            regex: /[a-zA-Z]/
          });
        } else if (ch === "*") {
          this._definitions.push({
            type: "alnum",
            char: ch,
            regex: /[a-zA-Z0-9]/
          });
        } else {
          this._definitions.push({ type: "literal", char: ch, regex: null });
        }
      }
    }

    _bindEvents() {
      var self = this;

      EventHandler.on(this._element, "input", function () {
        self._applyMask();
      });

      EventHandler.on(this._element, "keydown", function (e) {
        self._handleKeydown(e);
      });

      EventHandler.on(this._element, "focus", function () {
        if (self._config.showMaskOnFocus && !self._element.value) {
          self._showPlaceholder();
        }
      });

      EventHandler.on(this._element, "blur", function () {
        if (self._config.clearIncomplete && !self._isComplete) {
          self._element.value = "";
        }
        // Remove placeholder if empty
        var raw = self.getUnmaskedValue();
        if (!raw) {
          self._element.value = "";
        }
      });

      if (this._config.showMaskOnHover) {
        EventHandler.on(this._element, "mouseenter", function () {
          if (!self._element.value) {
            self._showPlaceholder();
          }
        });
        EventHandler.on(this._element, "mouseleave", function () {
          if (document.activeElement !== self._element) {
            var raw = self.getUnmaskedValue();
            if (!raw) {
              self._element.value = "";
            }
          }
        });
      }

      // Paste
      EventHandler.on(this._element, "paste", function () {
        setTimeout(function () {
          self._applyMask();
        }, 0);
      });
    }

    _handleKeydown(e) {
      // Allow navigation keys
      if (
        [
          "Backspace",
          "Delete",
          "Tab",
          "Escape",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End"
        ].indexOf(e.key) !== -1
      ) {
        return;
      }

      // Allow Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) return;
    }

    _applyMask() {
      var rawValue = this._element.value.replace(/[^a-zA-Z0-9]/g, "");
      var result = "";
      var rawIndex = 0;
      var complete = true;

      for (var i = 0; i < this._definitions.length; i++) {
        var def = this._definitions[i];

        if (def.type === "literal") {
          result += def.char;
          // If raw value has this literal at this position, skip it
          if (rawIndex < rawValue.length && rawValue[rawIndex] === def.char) {
            rawIndex++;
          }
          continue;
        }

        if (rawIndex < rawValue.length) {
          var ch = rawValue[rawIndex];
          if (def.regex.test(ch)) {
            result += ch;
            rawIndex++;
          } else {
            // Skip invalid character, try next raw char
            rawIndex++;
            i--; // retry this definition
            continue;
          }
        } else {
          complete = false;
          break;
        }
      }

      this._element.value = result;
      this._isComplete = complete && result.length === this._mask.length;

      EventHandler.trigger(this._element, EVENT_CHANGE, {
        value: result,
        unmasked: this.getUnmaskedValue(),
        complete: this._isComplete
      });

      if (this._isComplete) {
        EventHandler.trigger(this._element, EVENT_COMPLETE, {
          value: result,
          unmasked: this.getUnmaskedValue()
        });
      }
    }

    _showPlaceholder() {
      var result = "";
      for (var i = 0; i < this._definitions.length; i++) {
        var def = this._definitions[i];
        if (def.type === "literal") {
          result += def.char;
        } else {
          result += this._config.placeholder;
        }
      }
      this._element.value = result;
      // Position cursor at start of editable area
      var firstEditable = this._definitions.findIndex(function (d) {
        return d.type !== "literal";
      });
      if (firstEditable >= 0) {
        this._element.setSelectionRange(firstEditable, firstEditable);
      }
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = InputMask.getInstance(this);
        if (!instance) {
          instance = new InputMask(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function") {
            throw new TypeError("No method named " + config);
          }
          instance[config]();
        }
      });
    }
  }

  // Auto-init
  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-input-mask-init]").forEach(function (el) {
      if (!InputMask.getInstance(el)) {
        new InputMask(el);
      }
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
  window.Nimbus.InputMask = InputMask;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, InputMask);
  }
})();
