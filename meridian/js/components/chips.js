/**
 * ============================================================
 * CNDS Chips Input Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "chips";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_ADD = `add${EVENT_KEY}`;
  const EVENT_REMOVE = `remove${EVENT_KEY}`;
  const EVENT_SELECT = `select${EVENT_KEY}`;

  const SELECTOR_DATA_TOGGLE = '[data-cnds-toggle="chips"]';

  const Default = {
    separator: ",",
    maxChips: Infinity,
    allowDuplicates: false,
    chipClass: "",
    placeholder: "Add a tag...",
    initialValues: [],
    editable: false
  };

  const DefaultType = {
    separator: "string",
    maxChips: "number",
    allowDuplicates: "boolean",
    chipClass: "string",
    placeholder: "string",
    initialValues: "(array|string)",
    editable: "boolean"
  };

  class Chips extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._chips = [];
      this._input = null;

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

    add(value) {
      value = value.trim();
      if (!value) return;

      if (!this._config.allowDuplicates && this._chips.includes(value)) {
        return;
      }

      if (this._chips.length >= this._config.maxChips) return;

      const addEvent = EventHandler.trigger(this._element, EVENT_ADD, {
        value
      });

      if (addEvent.defaultPrevented) return;

      this._chips.push(value);
      this._renderChip(value);
      this._input.value = "";
    }

    remove(value) {
      const index = this._chips.indexOf(value);
      if (index === -1) return;

      const removeEvent = EventHandler.trigger(this._element, EVENT_REMOVE, {
        value
      });

      if (removeEvent.defaultPrevented) return;

      this._chips.splice(index, 1);

      // Remove the chip element
      const chipEls = SelectorEngine.find(".chip", this._element);
      for (const chipEl of chipEls) {
        if (chipEl.dataset.value === value) {
          chipEl.remove();
          break;
        }
      }
    }

    getValues() {
      return [...this._chips];
    }

    clear() {
      this._chips = [];
      const chipEls = SelectorEngine.find(".chip", this._element);
      for (const chipEl of chipEls) {
        chipEl.remove();
      }
    }

    dispose() {
      EventHandler.off(this._element, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Ensure the container has the chips-input class
      if (!this._element.classList.contains("chips-input")) {
        this._element.classList.add("chips-input");
      }

      // Pick up existing .chip elements already in the DOM
      const existingChips = SelectorEngine.find(".chip", this._element);
      for (const chipEl of existingChips) {
        // Extract text value (strip close-button text)
        const clone = chipEl.cloneNode(true);
        const closeEl =
          clone.querySelector(".chip-close") || clone.querySelector(".close");
        if (closeEl) closeEl.remove();
        const value = clone.textContent.trim();
        if (value) {
          chipEl.dataset.value = value;
          this._chips.push(value);

          // Bind close button on existing chip
          const existingClose =
            chipEl.querySelector(".chip-close") ||
            chipEl.querySelector(".close");
          if (existingClose) {
            EventHandler.on(existingClose, `click${EVENT_KEY}`, (e) => {
              e.stopPropagation();
              this.remove(value);
            });
          }
        }
      }

      // Find or create the input
      this._input = SelectorEngine.findOne("input", this._element);
      if (!this._input) {
        this._input = document.createElement("input");
        this._input.type = "text";
        this._input.placeholder = this._config.placeholder;
        this._element.appendChild(this._input);
      }

      // Handle editable option — bind double-click on existing chips
      if (this._config.editable) {
        for (const chipEl of existingChips) {
          this._bindEditableChip(chipEl);
        }
      }

      // Load initial chips from data attribute
      const initialChips = this._element.dataset.cndsChips;
      if (initialChips) {
        const values = initialChips
          .split(this._config.separator)
          .map((v) => v.trim())
          .filter(Boolean);
        for (const val of values) {
          this.add(val);
        }
      }

      // Load initial values from config option
      const initVals = this._config.initialValues;
      if (
        initVals &&
        (typeof initVals === "string" ? initVals.length : initVals.length)
      ) {
        const items =
          typeof initVals === "string"
            ? initVals
                .split(this._config.separator)
                .map((v) => v.trim())
                .filter(Boolean)
            : Array.isArray(initVals)
              ? initVals
              : [];
        for (const item of items) {
          const val = typeof item === "string" ? item : item.tag || item.value;
          if (val) this.add(val);
        }
      }

      this._bindEvents();
    }

    _bindEvents() {
      // Handle input keydown
      EventHandler.on(this._input, `keydown${EVENT_KEY}`, (event) => {
        if (event.key === "Enter" || event.key === this._config.separator) {
          event.preventDefault();
          this.add(this._input.value);
        }

        // Backspace removes last chip when input is empty
        if (event.key === "Backspace" && !this._input.value) {
          const lastChip = this._chips[this._chips.length - 1];
          if (lastChip) {
            this.remove(lastChip);
          }
        }
      });

      // Handle paste
      EventHandler.on(this._input, `paste${EVENT_KEY}`, (event) => {
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData).getData(
          "text"
        );
        const values = text
          .split(this._config.separator)
          .map((v) => v.trim())
          .filter(Boolean);
        for (const val of values) {
          this.add(val);
        }
      });

      // Click on container focuses input
      EventHandler.on(this._element, `click${EVENT_KEY}`, () => {
        this._input.focus();
      });
    }

    _renderChip(value) {
      const chip = document.createElement("span");
      chip.className = `chip ${this._config.chipClass}`.trim();
      chip.dataset.value = value;
      chip.textContent = value;

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "chip-close";
      closeBtn.innerHTML = '<i class="close mdi mdi-close-circle"></i>';
      closeBtn.setAttribute("aria-label", `Remove ${value}`);

      EventHandler.on(closeBtn, `click${EVENT_KEY}`, (e) => {
        e.stopPropagation();
        this.remove(value);
      });

      chip.appendChild(closeBtn);
      this._element.insertBefore(chip, this._input);

      // Bind editable behaviour on newly created chip
      if (this._config.editable) {
        this._bindEditableChip(chip);
      }
    }

    _bindEditableChip(chipEl) {
      EventHandler.on(chipEl, `dblclick${EVENT_KEY}`, () => {
        const oldValue = chipEl.dataset.value;
        const closeBtn =
          chipEl.querySelector(".chip-close") || chipEl.querySelector(".close");

        // Hide close button while editing
        if (closeBtn) closeBtn.style.display = "none";

        // Make the chip text editable
        chipEl.setAttribute("contenteditable", "true");
        chipEl.focus();

        // Select all text
        const range = document.createRange();
        const sel = window.getSelection();
        // Only select the text node, not the close button
        const textNode = chipEl.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          range.selectNodeContents(textNode);
        } else {
          range.selectNodeContents(chipEl);
        }
        sel.removeAllRanges();
        sel.addRange(range);

        const finishEdit = () => {
          chipEl.removeAttribute("contenteditable");
          if (closeBtn) closeBtn.style.display = "";

          // Get the new text (strip any HTML that might have been pasted)
          const newValue = chipEl.textContent
            .replace(
              chipEl.querySelector(".chip-close, .close")?.textContent || "",
              ""
            )
            .trim();

          if (newValue && newValue !== oldValue) {
            // Update internal chips array
            const idx = this._chips.indexOf(oldValue);
            if (idx !== -1) {
              this._chips[idx] = newValue;
            }
            chipEl.dataset.value = newValue;

            // Rebuild text content preserving close button
            const savedClose = chipEl.querySelector(".chip-close, .close");
            chipEl.textContent = newValue;
            if (savedClose) {
              chipEl.appendChild(savedClose);
            } else if (closeBtn) {
              chipEl.appendChild(closeBtn);
            }
          } else if (!newValue) {
            // If emptied, remove the chip
            this.remove(oldValue);
          } else {
            // Restore original text if unchanged
            const savedClose = chipEl.querySelector(".chip-close, .close");
            chipEl.textContent = oldValue;
            if (savedClose) {
              chipEl.appendChild(savedClose);
            } else if (closeBtn) {
              chipEl.appendChild(closeBtn);
            }
          }

          EventHandler.off(chipEl, `keydown.edit${EVENT_KEY}`);
          EventHandler.off(chipEl, `blur.edit${EVENT_KEY}`);
        };

        EventHandler.on(chipEl, `keydown.edit${EVENT_KEY}`, (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            chipEl.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            // Restore original value
            const savedClose = chipEl.querySelector(".chip-close, .close");
            chipEl.removeAttribute("contenteditable");
            chipEl.textContent = oldValue;
            if (savedClose) {
              chipEl.appendChild(savedClose);
            } else if (closeBtn) {
              chipEl.appendChild(closeBtn);
            }
            if (closeBtn) closeBtn.style.display = "";
            EventHandler.off(chipEl, `keydown.edit${EVENT_KEY}`);
            EventHandler.off(chipEl, `blur.edit${EVENT_KEY}`);
          }
        });

        EventHandler.on(chipEl, `blur.edit${EVENT_KEY}`, () => {
          finishEdit();
        });
      });
    }

    // --- Static ---

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        const data = Chips.getOrCreateInstance(this, config);

        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config](...args);
        }
      });
    }
  }

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Chips);
  }

  // Global click delegation for static chip close buttons
  document.addEventListener("click", (event) => {
    const closeBtn =
      event.target.closest(".chip .close") ||
      event.target.closest(".chip .chip-close");
    if (!closeBtn) return;

    const chip = closeBtn.closest(".chip");
    if (!chip) return;

    // If chip is inside a chips-input managed by the Chips component, skip
    // (the component handles its own close events)
    const chipsInput = chip.closest(SELECTOR_DATA_TOGGLE);
    if (chipsInput) {
      const instance = Chips.getInstance(chipsInput);
      if (instance) return; // Let the component handle it
    }

    // For static chips, remove with a fade transition
    chip.style.opacity = "0";
    chip.style.transition = "opacity 0.3s linear";
    setTimeout(() => chip.remove(), 300);
  });

  // Export
  window.Nimbus.Chips = Chips;
})();
