/**
 * CNDS Select Component
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Transforms a native <select data-cnds-select-init> into a custom dropdown UI.
 *
 * DOM structure built by this component:
 *
 *   .select-wrapper                        ← flex-col outer wrapper
 *     .select-label-row                    ← label + optional asterisk (above input)
 *       label.select-label
 *       span.select-required-asterisk      ← only if <select required>
 *     .select-field                        ← position:relative; wraps input + icons
 *       input.form-control.select-input    ← clickable trigger
 *       span.select-arrow                  ← chevron icon (absolute)
 *       span.select-clear-btn              ← × clear (absolute, multiselect)
 *     span.select-helper-text              ← if data-cnds-helper-text present
 *     select.select-initialized            ← native select (hidden)
 *
 *   .select-dropdown-container             ← appended to body (or container)
 *     .select-dropdown
 *       .input-group                       ← optional filter input
 *       .select-options-wrapper
 *         ul.select-options-list
 *           li.select-option-group-label
 *           li.select-option
 *
 * Usage (data attributes):
 *   <select data-cnds-select-init>...</select>
 *   <select data-cnds-select-init multiple>...</select>
 *
 * Usage (JavaScript):
 *   const instance = new Nimbus.Select(element, options);
 *   const instance = Nimbus.Select.getInstance(element);
 *   const instance = Nimbus.Select.getOrCreateInstance(element);
 *
 * Options / data attributes:
 *   filter (bool)            — show search input in dropdown;       data-cnds-filter="true"
 *   filterPlaceholder (str)  — filter input placeholder;            data-cnds-filter-placeholder="..."
 *   container (str)          — CSS selector for dropdown parent;    data-cnds-container="..."
 *   visibleOptions (int)     — max visible options before scroll;   data-cnds-visible-options="5"
 *   clearButton (bool)       — show × clear button;                 data-cnds-clear-button="true"
 *   validation (bool)        — enable required validation;          data-cnds-validation="true"
 *   validFeedback (str)      — valid feedback text;                 data-cnds-valid-feedback="..."
 *   invalidFeedback (str)    — invalid feedback text;               data-cnds-invalid-feedback="..."
 *   placeholder (str)        — placeholder text when nothing selected
 *   helperText (str)         — static helper text below the field;  data-cnds-helper-text="..."
 *
 * Dropdown positioning / auto-flip:
 *   The dropdown opens below the field by default. On open(), the container is
 *   made visible (display:"") before _positionDropdown() runs so scrollHeight
 *   reflects the rendered height. If the dropdown is taller than the space
 *   remaining below the field AND more room exists above, the component adds
 *   .open-above to the container — flipping the position to above the field
 *   and reversing the scale animation's transform-origin to bottom center.
 *   No configuration is required; the flip is fully automatic.
 *
 * Methods:
 *   open(), close(), toggle()
 *   getValue()           — returns selected value string (or array for multiple)
 *   setValue(val)        — set by value string or array of strings
 *   dispose()
 *
 * Events (dispatched on the original <select> element):
 *   open.cnds.select, opened.cnds.select
 *   close.cnds.select, closed.cnds.select
 *   valueChanged.cnds.select
 *   optionSelected.cnds.select, optionDeselected.cnds.select
 *   search.cnds.select  — e.detail.value
 */
(function () {
  "use strict";

  const DATA_KEY  = "_nimbusSelect";
  const OPTION_H  = 44; // px per option for max-height calculation (Figma: min-height 44px)

  // Clear glyph for the filter input's clear button (Material Design Icons)
  const CLEAR_ICON = '<i class="mdi mdi-close-circle" aria-hidden="true"></i>';

  const DEFAULTS = {
    filter:              false,
    filterPlaceholder:   "Search...",
    container:           "body",
    visibleOptions:      5,
    optionHeight:        OPTION_H,  // px per option for max-height; matches Figma 44px default
    clearButton:         false,
    validation:          false,
    validFeedback:       "Valid",
    invalidFeedback:     "Invalid",
    placeholder:         "",
    helperText:          "",
    iconPosition:        "left",
    showGroup:           false,
    groupSeparator:      "  >  ",
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function readConfig(el, overrides) {
    const ds = el.dataset || {};
    return Object.assign({}, DEFAULTS, {
      filter:            ds.cndsFilter            === "true" || overrides.filter            || false,
      filterPlaceholder: ds.cndsFilterPlaceholder  || overrides.filterPlaceholder  || DEFAULTS.filterPlaceholder,
      container:         ds.cndsContainer          || overrides.container          || DEFAULTS.container,
      visibleOptions:    parseInt(ds.cndsVisibleOptions || overrides.visibleOptions || DEFAULTS.visibleOptions, 10),
      optionHeight:      parseInt(ds.cndsOptionHeight   || overrides.optionHeight   || DEFAULTS.optionHeight, 10),
      clearButton:       ds.cndsClearButton        === "true" || overrides.clearButton        || false,
      validation:        ds.cndsValidation         === "true" || overrides.validation         || false,
      validFeedback:     ds.cndsValidFeedback      || overrides.validFeedback      || DEFAULTS.validFeedback,
      invalidFeedback:   ds.cndsInvalidFeedback    || overrides.invalidFeedback    || DEFAULTS.invalidFeedback,
      placeholder:       ds.cndsPlaceholder        || overrides.placeholder        || el.getAttribute("placeholder") || DEFAULTS.placeholder,
      helperText:        ds.cndsHelperText         || overrides.helperText         || DEFAULTS.helperText,
      iconPosition:      ds.cndsIconPosition       || overrides.iconPosition       || DEFAULTS.iconPosition,
      showGroup:         ds.cndsShowGroup          === "true" || overrides.showGroup   || false,
      groupSeparator:    ds.cndsGroupSeparator     || overrides.groupSeparator     || DEFAULTS.groupSeparator,
    });
  }

  // ---------------------------------------------------------------------------
  // Select class
  // ---------------------------------------------------------------------------

  class Select {

    constructor(element, options = {}) {
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error("Nimbus.Select: element must be a <select> element.");
      }
      if (element[DATA_KEY]) return element[DATA_KEY]; // already initialized

      this._el         = element;
      this._config     = readConfig(element, options);
      this._isMultiple = element.multiple;
      this._isOpen     = false;

      // DOM refs — populated in _build()
      this._wrapper     = null;
      this._field       = null;  // .select-field (position:relative inner container)
      this._trigger     = null;  // .select-input
      this._arrow       = null;
      this._clearBtn    = null;
      this._label       = null;  // label element
      this._dropCont    = null;  // .select-dropdown-container
      this._dropdown    = null;  // .select-dropdown
      this._optWrapper      = null;  // .select-options-wrapper
      this._optList         = null;  // .select-options-list
      this._filterInput     = null;
      this._filterClear     = null;  // .select-filter-clear button
      this._customContent   = null;  // .select-custom-content sibling
      this._validFeedback   = null;  // .select-valid-feedback
      this._invalidFeedback = null;  // .select-invalid-feedback
      this._hasValidated    = false; // true after first form submit attempt

      // Bound handlers for later removeEventListener
      this._onDocClick    = this._handleDocClick.bind(this);
      this._onDocKeydown  = this._handleDocKeydown.bind(this);
      this._onFormSubmit  = null;

      this._build();
      this._bindEvents();
      element[DATA_KEY] = this;
    }

    // -------------------------------------------------------------------------
    // DOM construction
    // -------------------------------------------------------------------------

    _build() {
      const el = this._el;

      // Find adjacent label — in the HTML it comes immediately after the <select>
      const nextEl = el.nextElementSibling;
      const existingLabel = nextEl && (nextEl.tagName === "LABEL" || nextEl.classList.contains("select-label"))
        ? nextEl : null;

      // Hide native <select>
      el.classList.add("select-initialized");

      // ── Outer wrapper (flex-col, gap-4px) ──────────────────────────────────
      const wrapper = document.createElement("div");
      wrapper.className = "select-wrapper";
      if (el.disabled) wrapper.classList.add("select-disabled");

      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el); // native select inside wrapper (hidden)

      // Transfer size modifier to wrapper so label CSS can respond
      if (el.classList.contains("form-control-sm") || el.classList.contains("select-sm")) {
        wrapper.classList.add("select-size-sm");
      } else if (el.classList.contains("form-control-lg") || el.classList.contains("select-lg")) {
        wrapper.classList.add("select-size-lg");
      }

      // ── Label row (fr_titles) — static label above the input ───────────────
      let label = null;
      if (existingLabel) {
        const labelRow = document.createElement("div");
        labelRow.className = "select-label-row";

        // Strip old classes; apply only the select-label class
        existingLabel.className = "select-label";
        labelRow.appendChild(existingLabel);
        label = existingLabel;

        // Required asterisk (color comes from product modifier or default)
        if (el.required) {
          const asterisk = document.createElement("span");
          asterisk.className = "select-required-asterisk";
          asterisk.setAttribute("aria-hidden", "true");
          asterisk.textContent = "*";
          labelRow.appendChild(asterisk);
        }

        // Clicking the label row opens/closes the dropdown
        labelRow.addEventListener("click", () => {
          if (!el.disabled) this.toggle();
        });

        wrapper.insertBefore(labelRow, el);
      }

      // ── Field container (position:relative) — input + arrow + clear ────────
      const field = document.createElement("div");
      field.className = "select-field";
      wrapper.insertBefore(field, el);

      // Trigger input
      const trigger = document.createElement("input");
      trigger.type = "text";
      trigger.className = "form-control select-input";

      // Transfer size class to trigger so form-control sizing works
      if (el.classList.contains("form-control-sm") || el.classList.contains("select-sm")) {
        trigger.classList.add("form-control-sm");
      } else if (el.classList.contains("form-control-lg") || el.classList.contains("select-lg")) {
        trigger.classList.add("form-control-lg");
      }

      trigger.readOnly = true;
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("autocomplete", "off");
      if (el.id) trigger.setAttribute("aria-controls", el.id + "-dropdown");
      if (el.disabled) trigger.disabled = true;
      field.appendChild(trigger);

      // Chevron arrow (MDI icon via CSS ::after)
      const arrow = document.createElement("span");
      arrow.className = "select-arrow";
      arrow.setAttribute("aria-hidden", "true");
      field.appendChild(arrow);

      // Clear button (multiselect or explicit clearButton option)
      let clearBtn = null;
      if (this._config.clearButton || this._isMultiple) {
        clearBtn = document.createElement("span");
        clearBtn.className = "select-clear-btn";
        clearBtn.innerHTML = '<i class="mdi mdi-close-circle mdi-18px"></i>';
        clearBtn.setAttribute("aria-label", "Clear selection");
        clearBtn.style.display = "none";
        field.appendChild(clearBtn);
      }

      // ── Static helper text (below the field) ───────────────────────────────
      const helperText = this._config.helperText || el.getAttribute("data-cnds-helper-text");
      if (helperText) {
        const helperEl = document.createElement("span");
        helperEl.className = "select-helper-text";
        helperEl.textContent = helperText;
        wrapper.insertBefore(helperEl, el);
      }

      // ── Validation feedback elements ────────────────────────────────────────
      if (this._config.validation) {
        const validFb = document.createElement("div");
        validFb.className = "select-valid-feedback";
        validFb.textContent = this._config.validFeedback;
        wrapper.insertBefore(validFb, el);

        const invalidFb = document.createElement("div");
        invalidFb.className = "select-invalid-feedback";
        invalidFb.textContent = this._config.invalidFeedback;
        wrapper.insertBefore(invalidFb, el);

        this._validFeedback   = validFb;
        this._invalidFeedback = invalidFb;
      }

      // Detect .select-custom-content sibling and store for use in dropdown
      const customContentEl = wrapper.parentNode
        ? wrapper.parentNode.querySelector(':scope > .select-custom-content')
        : null;
      this._customContent = customContentEl || null;

      // Build dropdown DOM (appended to body / container)
      this._buildDropdown();

      // Store refs
      this._wrapper  = wrapper;
      this._field    = field;
      this._trigger  = trigger;
      this._arrow    = arrow;
      this._clearBtn = clearBtn;
      this._label    = label;

      // Reflect current native select state
      this._updateDisplay();
    }

    _buildDropdown() {
      const containerEl =
        this._config.container === "body"
          ? document.body
          : (document.querySelector(this._config.container) || document.body);

      // Outer positioned container (position:absolute, appended to containerEl)
      const dropCont = document.createElement("div");
      dropCont.className = "select-dropdown-container";
      dropCont.style.cssText = "position:absolute;display:none;";

      // Mirror product theme from wrapper ancestor so selected-state colors apply
      for (const theme of ["casefusion", "expireon", "hyperlize"]) {
        if (this._el.closest(`.select-wrapper-${theme}`)) {
          dropCont.classList.add(`select-product-${theme}`);
          break;
        }
      }
      if (this._el.id) dropCont.id = this._el.id + "-dropdown";

      // Panel
      const dropdown = document.createElement("div");
      dropdown.className = "select-dropdown";
      dropdown.setAttribute("role", "listbox");
      if (this._isMultiple) dropdown.setAttribute("aria-multiselectable", "true");
      dropCont.appendChild(dropdown);

      // Optional filter input
      if (this._config.filter) {
        const inputGroup = document.createElement("div");
        inputGroup.className = "input-group select-filter-group";
        const fi = document.createElement("input");
        fi.type = "text";
        fi.className = "form-control";
        fi.placeholder = this._config.filterPlaceholder;
        inputGroup.appendChild(fi);

        // Clear button — revealed once the filter has text
        const fc = document.createElement("button");
        fc.type = "button";
        fc.className = "select-filter-clear";
        fc.setAttribute("aria-label", "Clear search");
        fc.tabIndex = -1;
        fc.hidden = true;
        fc.innerHTML = CLEAR_ICON;
        inputGroup.appendChild(fc);

        dropdown.appendChild(inputGroup);
        this._filterInput = fi;
        this._filterClear = fc;
      }

      // Scrollable options wrapper
      const optWrapper = document.createElement("div");
      optWrapper.className = "select-options-wrapper";
      optWrapper.style.maxHeight = `${this._config.visibleOptions * this._config.optionHeight}px`;
      dropdown.appendChild(optWrapper);

      // Options list
      const optList = document.createElement("ul");
      optList.className = "select-options-list";
      optWrapper.appendChild(optList);

      // Custom content slot — appended after options, inside the panel
      if (this._customContent) {
        dropdown.appendChild(this._customContent);
      }

      containerEl.appendChild(dropCont);

      this._dropCont   = dropCont;
      this._dropdown   = dropdown;
      this._optWrapper = optWrapper;
      this._optList    = optList;

      this._renderOptions();
    }

    // -------------------------------------------------------------------------
    // Option rendering
    // -------------------------------------------------------------------------

    /** Show the filter's clear button only while the field has text. */
    _syncFilterClear() {
      if (!this._filterClear) return;
      this._filterClear.hidden = !(this._filterInput && this._filterInput.value);
    }

    _renderOptions() {
      const list   = this._optList;
      const filter = this._filterInput ? this._filterInput.value.toLowerCase().trim() : "";
      list.innerHTML = "";

      const renderOption = (opt, indent) => {
        if (filter && !opt.text.toLowerCase().includes(filter)) return;

        const li = document.createElement("li");
        li.className = "select-option";
        if (opt.disabled) li.classList.add("disabled");
        if (opt.selected)  li.classList.add("selected");
        if (indent)        li.style.paddingLeft = "26px";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", opt.selected ? "true" : "false");
        li.dataset.value = opt.value;
        li._selectOpt = opt; // back-reference to native option

        // Custom icon
        const iconSrc      = opt.getAttribute("data-cnds-icon");
        const iconPosition = this._config.iconPosition === "right" ? "right" : "left";
        let iconEl = null;
        if (iconSrc) {
          iconEl = document.createElement("img");
          iconEl.src       = iconSrc;
          iconEl.className = "select-option-icon" + (iconPosition === "right" ? " select-option-icon-right" : "");
          iconEl.alt       = "";
        }

        // Checkbox for multiselect — sibling of text wrap, not inside it
        if (this._isMultiple) {
          const cb = document.createElement("input");
          cb.type      = "checkbox";
          cb.className = "form-check-input";
          cb.checked   = opt.selected;
          cb.disabled  = opt.disabled;
          cb.tabIndex  = -1;
          li.appendChild(cb);
        }

        // Left icon (before text)
        if (iconEl && iconPosition === "left") li.appendChild(iconEl);

        // Text container
        const textWrap = document.createElement("span");
        textWrap.className = "select-option-text";

        const textNode = document.createElement("span");
        textNode.className = "select-option-label";
        textNode.textContent = opt.text;
        textWrap.appendChild(textNode);

        // Secondary text
        const sec = opt.getAttribute("data-cnds-secondary-text");
        if (sec) {
          const secSpan = document.createElement("span");
          secSpan.className = "select-option-secondary-text";
          secSpan.textContent = sec;
          textWrap.appendChild(secSpan);
        }

        li.appendChild(textWrap);

        // Count badge for the "all" option — total number of selectable items
        // (every option except the placeholder and the all-option itself).
        if (opt.hasAttribute("data-cnds-all-option")) {
          const count = Array.from(this._el.options).filter(
            o => o.value !== "" && !o.hasAttribute("data-cnds-all-option")
          ).length;
          const badge = document.createElement("span");
          badge.className = "badge badge-secondary select-option-all-count";
          badge.textContent = count;
          li.appendChild(badge);
        }

        // Right icon (after text)
        if (iconEl && iconPosition === "right") li.appendChild(iconEl);
        list.appendChild(li);
      };

      Array.from(this._el.children).forEach(child => {
        if (child.tagName === "OPTGROUP") {
          const groupLabel = document.createElement("li");
          groupLabel.className = "select-option-group-label";
          groupLabel.textContent = child.label;
          list.appendChild(groupLabel);
          Array.from(child.children).forEach(opt => renderOption(opt, true));
        } else if (child.tagName === "OPTION") {
          // Skip empty disabled placeholder options (value="" disabled)
          if (child.value === "" && child.disabled) return;
          renderOption(child, false);
        }
      });

      // "No results" when filter matches nothing
      if (list.children.length === 0) {
        const noRes = document.createElement("li");
        noRes.className = "select-no-results";
        noRes.textContent = "No results found";
        list.appendChild(noRes);
      }
    }

    // -------------------------------------------------------------------------
    // Display sync
    // -------------------------------------------------------------------------

    /**
     * What the trigger shows for one selected option.
     *
     * With `showGroup`, an option that lives inside an <optgroup> is shown as
     * a breadcrumb — `GROUP  >  Option` — so the closed control still says
     * which group the choice came from. Without it the trigger shows only the
     * option text, and a list whose groups carry the meaning (rather than just
     * tidying the list) loses that meaning the moment it closes.
     *
     * The group is upper-cased here to match `.select-option-group-label`,
     * which does it in CSS. The trigger is an <input>, so its value is a
     * single string and text-transform cannot be applied to part of it.
     */
    /* NB not _label: this._label is already the label ELEMENT, assigned in the
       constructor, and an instance property shadows a prototype method. */
    _optionLabel(opt) {
      if (!this._config.showGroup) return opt.text;
      const g = opt.parentElement;
      if (!g || g.tagName !== "OPTGROUP" || !g.label) return opt.text;
      return g.label.toUpperCase() + this._config.groupSeparator + opt.text;
    }

    _updateDisplay() {
      const selected = Array.from(this._el.options).filter(
        o => o.selected && o.value !== "" && !o.disabled
      );

      if (selected.length === 0) {
        this._trigger.value = this._config.placeholder;
        this._trigger.classList.add("select-placeholder-active");
        if (this._clearBtn) this._clearBtn.style.display = "none";
      } else {
        this._trigger.value = selected.map(o => this._optionLabel(o)).join(", ");
        this._trigger.classList.remove("select-placeholder-active");
        if (this._clearBtn) this._clearBtn.style.display = "";
      }
      this._validate();
    }

    _syncOptionUI() {
      if (!this._optList) return;
      this._optList.querySelectorAll(".select-option").forEach(li => {
        const opt = li._selectOpt;
        if (!opt) return;
        li.classList.toggle("selected", opt.selected);
        li.setAttribute("aria-selected", opt.selected ? "true" : "false");
        const cb = li.querySelector(".form-check-input");
        if (cb) cb.checked = opt.selected;
      });
    }

    _validate() {
      if (!this._config.validation || !this._hasValidated) return;
      const hasValue = this.getValue() !== null && this.getValue() !== "";
      this._wrapper.classList.toggle("is-valid",   hasValue);
      this._wrapper.classList.toggle("is-invalid", !hasValue);
    }

    _positionDropdown() {
      // Called after the container is visible (display:"") so scrollHeight reflects
      // the rendered height. Flips upward when the dropdown is taller than the space
      // below the field and more room exists above — adds/removes .open-above on the
      // container, which CSS uses to reverse the scale animation's transform-origin.
      const rect  = this._field.getBoundingClientRect();
      const dropH = this._dropCont.scrollHeight;
      const gap   = 2; // px gap between field edge and dropdown edge (mirrors CSS margin-top: 2px)

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openAbove  = dropH > spaceBelow && spaceAbove > spaceBelow;

      this._dropCont.style.width = `${rect.width}px`;
      this._dropCont.classList.toggle("open-above", openAbove);

      const containerEl = this._dropCont.parentElement;
      if (!containerEl || containerEl === document.body) {
        // Body container: convert viewport coords to document coords
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        this._dropCont.style.top  = openAbove
          ? `${rect.top    + scrollY - dropH - gap}px`
          : `${rect.bottom + scrollY}px`;
        this._dropCont.style.left = `${rect.left + scrollX}px`;
      } else {
        // Custom container (e.g. a modal): position relative to the container element.
        // getBoundingClientRect() gives viewport coords; subtract the container's
        // viewport origin and add its scroll offset to get content-space coords.
        const containerRect = containerEl.getBoundingClientRect();
        this._dropCont.style.top  = openAbove
          ? `${rect.top    - containerRect.top + containerEl.scrollTop - dropH - gap}px`
          : `${rect.bottom - containerRect.top + containerEl.scrollTop}px`;
        this._dropCont.style.left = `${rect.left - containerRect.left + containerEl.scrollLeft}px`;
      }
    }

    // -------------------------------------------------------------------------
    // Event binding
    // -------------------------------------------------------------------------

    _bindEvents() {
      // Trigger click / arrow click — open or close
      this._trigger.addEventListener("click", () => this.toggle());
      this._arrow.addEventListener("click",   () => this.toggle());

      // Clear button
      if (this._clearBtn) {
        this._clearBtn.addEventListener("click", e => {
          e.stopPropagation();
          Array.from(this._el.options).forEach(o => { o.selected = false; });
          this._updateDisplay();
          this._syncOptionUI();
          this._dispatch("valueChanged.cnds.select");
        });
      }

      // Filter input
      if (this._filterInput) {
        this._filterInput.addEventListener("input", e => {
          this._renderOptions();
          this._syncFilterClear();
          this._el.dispatchEvent(
            new CustomEvent("search.cnds.select", {
              bubbles: true,
              detail: { value: e.target.value }
            })
          );
        });
        // Prevent trigger-click closing when clicking inside filter
        this._filterInput.addEventListener("click", e => e.stopPropagation());
      }

      // Filter clear button — resets the search and keeps focus in the field
      if (this._filterClear) {
        this._filterClear.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          this._filterInput.value = "";
          this._renderOptions();
          this._syncFilterClear();
          this._filterInput.focus();
          this._el.dispatchEvent(
            new CustomEvent("search.cnds.select", {
              bubbles: true,
              detail: { value: "" }
            })
          );
        });
      }

      // Option list click — event delegation
      this._optList.addEventListener("click", e => {
        const li = e.target.closest(".select-option");
        if (!li || li.classList.contains("disabled")) return;
        e.stopPropagation();

        const opt = li._selectOpt;
        if (!opt) return;

        if (this._isMultiple) {
          opt.selected = !opt.selected;
          li.classList.toggle("selected", opt.selected);
          li.setAttribute("aria-selected", opt.selected ? "true" : "false");
          const cb = li.querySelector(".form-check-input");
          if (cb) cb.checked = opt.selected;
          this._dispatch(opt.selected ? "optionSelected.cnds.select" : "optionDeselected.cnds.select");
        } else {
          Array.from(this._el.options).forEach(o => { o.selected = false; });
          this._optList.querySelectorAll(".select-option").forEach(el => {
            el.classList.remove("selected");
            el.setAttribute("aria-selected", "false");
          });
          opt.selected = true;
          li.classList.add("selected");
          li.setAttribute("aria-selected", "true");
          this._dispatch("optionSelected.cnds.select");
          this.close();
        }

        this._updateDisplay();
        this._dispatch("valueChanged.cnds.select");
      });

      // Prevent container-click from closing
      this._optWrapper.addEventListener("click", e => e.stopPropagation());

      // Validation — intercept ancestor form submit
      if (this._config.validation) {
        const form = this._el.closest("form");
        if (form) {
          this._onFormSubmit = (e) => {
            e.preventDefault();
            this._hasValidated = true;
            this._validate();
          };
          form.addEventListener("submit", this._onFormSubmit);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Document-level handlers (attached on open, removed on close)
    // -------------------------------------------------------------------------

    _handleDocClick(e) {
      if (
        !this._wrapper.contains(e.target) &&
        !this._dropCont.contains(e.target)
      ) {
        this.close();
      }
    }

    _handleDocKeydown(e) {
      if (!this._isOpen) return;

      const items = Array.from(
        this._optList.querySelectorAll(".select-option:not(.disabled)")
      );

      if (e.key === "Escape") {
        this.close();
        this._trigger.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const active = this._optList.querySelector(".select-option.active");
        const idx = active ? items.indexOf(active) : -1;
        if (active) active.classList.remove("active");
        const next = items[Math.min(idx + 1, items.length - 1)];
        if (next) { next.classList.add("active"); next.scrollIntoView({ block: "nearest" }); }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const active = this._optList.querySelector(".select-option.active");
        const idx = active ? items.indexOf(active) : items.length;
        if (active) active.classList.remove("active");
        const prev = items[Math.max(idx - 1, 0)];
        if (prev) { prev.classList.add("active"); prev.scrollIntoView({ block: "nearest" }); }
      } else if (e.key === "Enter" || e.key === " ") {
        const active = this._optList.querySelector(".select-option.active");
        if (active) { e.preventDefault(); active.click(); }
      }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    open() {
      if (this._isOpen || this._trigger.disabled) return;

      this._dispatch("open.cnds.select");
      this._dropCont.style.display = ""; // show before positioning so scrollHeight is readable
      this._positionDropdown();

      requestAnimationFrame(() => {
        this._dropdown.classList.add("open");
        this._wrapper.classList.add("open");
        this._trigger.classList.add("focused");
      });

      this._trigger.setAttribute("aria-expanded", "true");
      this._isOpen = true;

      if (this._filterInput) {
        setTimeout(() => this._filterInput.focus(), 50);
      }

      document.addEventListener("click",   this._onDocClick);
      document.addEventListener("keydown", this._onDocKeydown);

      this._dispatch("opened.cnds.select");
    }

    close() {
      if (!this._isOpen) return;

      this._dispatch("close.cnds.select");

      this._dropdown.classList.remove("open");
      this._wrapper.classList.remove("open");
      this._trigger.classList.remove("focused");
      this._trigger.setAttribute("aria-expanded", "false");

      const onEnd = () => {
        this._dropCont.style.display = "none";
        this._dropdown.removeEventListener("transitionend", onEnd);
      };
      this._dropdown.addEventListener("transitionend", onEnd, { once: true });
      setTimeout(onEnd, 250); // fallback

      this._isOpen = false;

      if (this._filterInput) {
        this._filterInput.value = "";
        this._renderOptions();
        this._syncFilterClear();
      }

      this._optList.querySelectorAll(".select-option.active").forEach(
        li => li.classList.remove("active")
      );

      document.removeEventListener("click",   this._onDocClick);
      document.removeEventListener("keydown", this._onDocKeydown);

      this._dispatch("closed.cnds.select");
    }

    toggle() {
      this._isOpen ? this.close() : this.open();
    }

    getValue() {
      const vals = Array.from(this._el.options)
        .filter(o => o.selected)
        .map(o => o.value);
      return this._isMultiple ? vals : (vals[0] ?? null);
    }

    setValue(value) {
      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      Array.from(this._el.options).forEach(o => {
        o.selected = values.includes(o.value);
      });
      this._updateDisplay();
      this._syncOptionUI();
      this._dispatch("valueChanged.cnds.select");
    }

    dispose() {
      document.removeEventListener("click",   this._onDocClick);
      document.removeEventListener("keydown", this._onDocKeydown);

      if (this._onFormSubmit) {
        const form = this._el.closest("form");
        if (form) form.removeEventListener("submit", this._onFormSubmit);
      }

      if (this._dropCont) this._dropCont.remove();

      if (this._wrapper && this._wrapper.parentNode) {
        const parent = this._wrapper.parentNode;

        // Move native select out of wrapper, back to original position
        parent.insertBefore(this._el, this._wrapper);

        // Move label back to after the native select (its original HTML position)
        if (this._label) {
          this._label.className = "form-label select-label";
          parent.insertBefore(this._label, this._el.nextSibling);
        }

        // Restore custom content after the select/label
        if (this._customContent) {
          parent.insertBefore(this._customContent, this._el.nextSibling);
        }

        this._wrapper.remove();
      }

      this._el.classList.remove("select-initialized");
      delete this._el[DATA_KEY];
    }

    _dispatch(eventName) {
      const evt = new CustomEvent(eventName, { bubbles: true, cancelable: true });
      this._el.dispatchEvent(evt);
      return evt;
    }

    // -------------------------------------------------------------------------
    // Static API
    // -------------------------------------------------------------------------

    static getInstance(element) {
      return (element && element[DATA_KEY]) || null;
    }

    static getOrCreateInstance(element, options = {}) {
      return Select.getInstance(element) || new Select(element, options);
    }

    /**
     * Auto-initialize all [data-cnds-select-init] elements not yet initialized.
     * Called at module load and can be called again after dynamic DOM changes.
     */
    static initAll(root = document) {
      root.querySelectorAll("[data-cnds-select-init]").forEach(el => {
        if (el[DATA_KEY]) return; // already initialized
        try {
          new Select(el);
        } catch (e) {
          console.warn("[CNDS] Select init failed:", el, e);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Select = Select;

  // Register with DataAPI under "select-init" (matches data-cnds-select-init)
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("select-init", Select);
  }

  // ---------------------------------------------------------------------------
  // data-cnds-toggle="selectId" button support
  // ---------------------------------------------------------------------------
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-cnds-toggle]");
    if (!btn) return;
    const targetId = btn.getAttribute("data-cnds-toggle");
    const targetEl = document.getElementById(targetId);
    if (!targetEl || !(targetEl instanceof HTMLSelectElement)) return;
    const instance = Select.getInstance(targetEl);
    if (instance) {
      e.preventDefault();
      e.stopPropagation();
      instance.toggle();
    }
  });

  // ---------------------------------------------------------------------------
  // Auto-initialize at module load (DOM is already ready when this runs)
  // ---------------------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Select.initAll());
  } else {
    Select.initAll();
  }
})();
