/**
 * CNDS Autocomplete Component
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Usage:
 *   const ac = new Nimbus.Autocomplete(element, options);
 *
 * Options:
 *   filter(value)       — required; returns array or Promise<array>
 *   displayValue(item)  — string to show in input/list; default identity
 *   threshold           — min chars before filtering; default 0
 *   itemContent(item)   — HTML string for custom list row
 *   customContent       — HTML string appended to dropdown footer
 *   autoSelect          — select highlighted item on Tab; default false
 *   container           — CSS selector for dropdown parent; default 'body'
 *   listHeight          — max-height of item list in px; default 190
 *
 * Events (dispatched on the wrapper element):
 *   update.cnds.autocomplete  — event.detail.results / event.results
 *   open.cnds.autocomplete
 *   close.cnds.autocomplete
 *   itemSelect.cnds.autocomplete  — event.detail.value
 */
(function () {
  "use strict";

  const DEFAULTS = {
    filter: null,
    displayValue: (value) => value,
    threshold: 0,
    itemContent: null,
    customContent: "",
    autoSelect: false,
    container: "body",
    listHeight: 190,
  };

  class Autocomplete {
    constructor(element, options = {}) {
      this._element = element;
      this._options = Object.assign({}, DEFAULTS, options);

      // Read data-cnds-* attribute overrides
      const ds = element.dataset || {};
      if (ds.cndsListHeight !== undefined) {
        this._options.listHeight = parseInt(ds.cndsListHeight, 10);
      }
      if (ds.cndsAutoselect === "true" || ds.cndsAutoSelect === "true") {
        this._options.autoSelect = true;
      }
      if (ds.cndsThreshold !== undefined) {
        this._options.threshold = parseInt(ds.cndsThreshold, 10);
      }

      this._input = element.querySelector(".form-control, .cf-input-control") || element.querySelector("input");
      this._label = element.querySelector(".form-label, .cf-input-label") || element.querySelector("label");
      // Prefer the immediate positioned wrapper (cf-input-wrapper / form-outline) for loader
      // placement and rect measurement; fall back to the passed element.
      this._inputWrapper = element.querySelector(".cf-input-wrapper") || element;
      this._dropdown = null;
      this._items = [];
      this._activeIndex = -1;
      this._isOpen = false;
      this._loader = null;

      // Add component marker classes (kept alongside form-control / form-label)
      if (this._input) this._input.classList.add("autocomplete-input");
      if (this._label) this._label.classList.add("autocomplete-label");

      // Store bound handlers so they can be removed on dispose
      this._boundFocus    = this._onFocus.bind(this);
      this._boundBlur     = this._onBlur.bind(this);
      this._boundInput    = this._onInput.bind(this);
      this._boundKeydown  = this._onKeydown.bind(this);

      this._init();
      element._nimbusAutocomplete = this;
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    _init() {
      if (!this._input) return;

      // Loader spinner — appended to the positioned wrapper so absolute positioning
      // resolves correctly inside the input field.
      this._loader = document.createElement("div");
      this._loader.className = "autocomplete-loader spinner-border spinner-border-sm d-none";
      this._loader.setAttribute("role", "status");
      this._loader.setAttribute("aria-hidden", "true");
      this._inputWrapper.appendChild(this._loader);

      this._input.addEventListener("focus",   this._boundFocus);
      this._input.addEventListener("blur",    this._boundBlur);
      this._input.addEventListener("input",   this._boundInput);
      this._input.addEventListener("keydown", this._boundKeydown);
    }

    // -------------------------------------------------------------------------
    // Input event handlers
    // -------------------------------------------------------------------------

    _onFocus() {
      this._input.classList.add("focused");
      if (this._label) this._label.classList.add("active");
    }

    _onBlur() {
      // Delay removal so a mousedown on a list item fires before the blur
      setTimeout(() => {
        if (!this._isOpen) {
          this._input.classList.remove("focused");
          if (this._label && !this._input.value) {
            this._label.classList.remove("active");
          }
        }
      }, 150);
    }

    _onInput() {
      const value = this._input.value;
      if (value.length < this._options.threshold) {
        this.close();
        return;
      }
      this._runFilter(value);
    }

    _onKeydown(e) {
      if (!this._isOpen) return;

      const items = this._dropdown
        ? this._dropdown.querySelectorAll(".autocomplete-item")
        : [];

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          this._activeIndex = Math.min(this._activeIndex + 1, items.length - 1);
          this._updateActive(items);
          break;

        case "ArrowUp":
          e.preventDefault();
          this._activeIndex = Math.max(this._activeIndex - 1, -1);
          this._updateActive(items);
          break;

        case "Enter":
          e.preventDefault();
          if (this._activeIndex >= 0) this._selectItem(this._activeIndex);
          break;

        case "Escape":
          this.close();
          this._input.focus();
          break;

        case "Tab":
          if (this._options.autoSelect && this._activeIndex >= 0) {
            e.preventDefault();
            this._selectItem(this._activeIndex);
          } else {
            this.close();
          }
          break;
      }
    }

    // -------------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------------

    async _runFilter(value) {
      if (!this._options.filter) return;

      this._showLoader();
      try {
        const result = this._options.filter(value);
        const items = result instanceof Promise ? await result : result;
        this._items = Array.isArray(items) ? items : [];
        this._render(this._items);

        // Dispatch update event — expose results on both detail and directly
        const event = new CustomEvent("update.cnds.autocomplete", {
          bubbles: true,
          detail: { results: this._items },
        });
        event.results = this._items;
        this._element.dispatchEvent(event);
      } catch (err) {
        console.error("[Nimbus.Autocomplete] filter error:", err);
        this._items = [];
        this._render([]);
      } finally {
        this._hideLoader();
      }
    }

    // -------------------------------------------------------------------------
    // Dropdown rendering
    // -------------------------------------------------------------------------

    _render(items) {
      this._destroyDropdown();

      if (!items.length) return;

      this._activeIndex = -1;

      // Measure the input's direct container for positioning — cf-input-wrapper
      // (position:relative) gives an accurate rect that excludes the label above.
      const rect = this._inputWrapper.getBoundingClientRect();
      const scrollTop  = window.pageYOffset  || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset  || document.documentElement.scrollLeft;

      // Container (handles z-index)
      const container = document.createElement("div");
      container.className = "autocomplete-dropdown-container";
      container.style.cssText = [
        "position:absolute",
        `width:${rect.width}px`,
        `top:${rect.bottom + scrollTop + 4}px`,
        `left:${rect.left + scrollLeft}px`,
      ].join(";");

      // Dropdown panel
      const dropdown = document.createElement("div");
      dropdown.className = "autocomplete-dropdown";

      // Items list
      const list = document.createElement("ul");
      list.className = "autocomplete-items-list";
      list.style.maxHeight = this._options.listHeight + "px";

      items.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "autocomplete-item";
        li.setAttribute("data-index", index);

        if (this._options.itemContent) {
          li.innerHTML = this._options.itemContent(item);
        } else {
          const text = this._options.displayValue(item);
          li.textContent = typeof text === "string" ? text : String(text);
        }

        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // Prevent input blur before selection
          this._selectItem(index);
        });

        list.appendChild(li);
      });

      dropdown.appendChild(list);

      // Optional custom footer
      if (this._options.customContent) {
        const tmp = document.createElement("div");
        tmp.innerHTML = this._options.customContent;
        while (tmp.firstChild) dropdown.appendChild(tmp.firstChild);
      }

      container.appendChild(dropdown);

      // Append to configured container
      const appendTarget =
        this._options.container === "body"
          ? document.body
          : document.querySelector(this._options.container) || document.body;
      appendTarget.appendChild(container);

      this._dropdown = container;
      this._isOpen = true;

      // Animate open
      requestAnimationFrame(() => dropdown.classList.add("open"));

      // Close on outside click
      this._outsideClickHandler = (e) => {
        if (!this._element.contains(e.target) && !container.contains(e.target)) {
          this.close();
        }
      };
      document.addEventListener("click", this._outsideClickHandler);

      this._element.dispatchEvent(
        new CustomEvent("open.cnds.autocomplete", { bubbles: true })
      );
    }

    // -------------------------------------------------------------------------
    // Selection
    // -------------------------------------------------------------------------

    _selectItem(index) {
      const item = this._items[index];
      if (item === undefined) return;

      const text = this._options.displayValue(item);
      this._input.value = typeof text === "string" ? text : String(text);
      this._input.classList.add("focused");
      if (this._label) this._label.classList.add("active");

      const event = new CustomEvent("itemSelect.cnds.autocomplete", {
        bubbles: true,
        detail: { value: item },
      });
      this._element.dispatchEvent(event);

      this.close();
      this._input.focus();
    }

    // -------------------------------------------------------------------------
    // Active item highlight
    // -------------------------------------------------------------------------

    _updateActive(items) {
      items.forEach((item, i) => {
        const isActive = i === this._activeIndex;
        item.classList.toggle("active", isActive);
        if (isActive) item.scrollIntoView({ block: "nearest" });
      });
    }

    // -------------------------------------------------------------------------
    // Loader helpers
    // -------------------------------------------------------------------------

    _showLoader() {
      if (this._loader) this._loader.classList.remove("d-none");
    }

    _hideLoader() {
      if (this._loader) this._loader.classList.add("d-none");
    }

    // -------------------------------------------------------------------------
    // Dropdown teardown
    // -------------------------------------------------------------------------

    _destroyDropdown() {
      if (this._dropdown) {
        this._dropdown.remove();
        this._dropdown = null;
      }
      if (this._outsideClickHandler) {
        document.removeEventListener("click", this._outsideClickHandler);
        this._outsideClickHandler = null;
      }
      this._isOpen = false;
      this._activeIndex = -1;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    open() {
      this._runFilter(this._input ? this._input.value : "");
    }

    close() {
      if (!this._isOpen) return;
      this._destroyDropdown();
      if (this._input) {
        this._input.classList.remove("focused");
        if (this._label && !this._input.value) {
          this._label.classList.remove("active");
        }
      }
      this._element.dispatchEvent(
        new CustomEvent("close.cnds.autocomplete", { bubbles: true })
      );
    }

    dispose() {
      this._destroyDropdown();
      if (this._input) {
        this._input.removeEventListener("focus",   this._boundFocus);
        this._input.removeEventListener("blur",    this._boundBlur);
        this._input.removeEventListener("input",   this._boundInput);
        this._input.removeEventListener("keydown", this._boundKeydown);
        this._input.classList.remove("autocomplete-input", "focused");
      }
      if (this._label) this._label.classList.remove("autocomplete-label");
      if (this._loader) this._loader.remove();
      delete this._element._nimbusAutocomplete;
    }

    // -------------------------------------------------------------------------
    // Static helpers
    // -------------------------------------------------------------------------

    static getInstance(element) {
      return element._nimbusAutocomplete || null;
    }

    static getOrCreateInstance(element, options) {
      return element._nimbusAutocomplete || new Autocomplete(element, options);
    }
  }

  // Register on Nimbus namespace
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Autocomplete = Autocomplete;
})();
