/**
 * ============================================================
 * CNDS Datepicker Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Calendar-based date picker with month/year navigation,
 * min/max dates, disabled dates, format options, and inline mode.
 *
 * Usage:
 *   <div data-cnds-datepicker-init>
 *     <input type="text" />
 *   </div>
 *
 * Or programmatic:
 *   const dp = new Nimbus.Datepicker(element, { format: 'mm/dd/yyyy' });
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "datepicker";
  const EVENT_KEY = ".cnds." + NAME;

  const EVENT_OPEN = "open" + EVENT_KEY;
  const EVENT_CLOSE = "close" + EVENT_KEY;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const MONTH_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

  const CALENDAR_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0,0,0 5,21H19A2,2 0,0,0 21,19V5C21,3.89 20.1,3 19,3H18V1H16Z"/></svg>';
  const NAV_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
  const NAV_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
  const TITLE_ARROW =
    '<svg class="datepicker-title-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>';

  const Default = {
    format: "mm/dd/yyyy",
    startDay: 0, // 0=Sunday, 1=Monday
    minDate: null,
    maxDate: null,
    disabledDates: null, // Array of Date objects or date strings
    disabledDays: null, // Array of day numbers (0=Sun, 6=Sat)
    inline: false,
    modal: false, // true: opens as a centred modal overlay instead of a positioned dropdown
    autoClose: true,
    todayButton: true,
    clearButton: true,
    showOtherMonths: true,
    selectOtherMonths: false,
    yearRange: 100,
    readonly: true,
    container: null,
    disablePast: false,
    disableFuture: false
  };

  const DefaultType = {
    format: "string",
    startDay: "number",
    minDate: "(string|null)",
    maxDate: "(string|null)",
    disabledDates: "(array|null)",
    disabledDays: "(array|null)",
    inline: "boolean",
    modal: "boolean",
    autoClose: "boolean",
    todayButton: "boolean",
    clearButton: "boolean",
    showOtherMonths: "boolean",
    selectOtherMonths: "boolean",
    yearRange: "number",
    readonly: "boolean",
    container: "(string|null)",
    disablePast: "boolean",
    disableFuture: "boolean"
  };

  class Datepicker extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._input = null;
      this._dropdown = null;
      this._backdrop = null;
      this._modalPanel = null;
      this._modalDateDisplay = null;
      this._pendingDate = null; // Modal mode: tentative selection before OK
      this._isOpen = false;
      this._selectedDate = null;
      this._viewDate = new Date(); // Currently displayed month
      this._view = "days"; // 'days', 'months', 'years'
      this._minDate = null;
      this._maxDate = null;
      this._disabledDates = new Set();
      this._disabledDays = new Set();

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

    open() {
      if (this._isOpen || this._config.inline) return;
      this._isOpen = true;
      if (this._config.modal) {
        // Seed pending selection from current confirmed date
        this._pendingDate = this._selectedDate ? new Date(this._selectedDate) : null;
        this._updateModalDateDisplay();
        this._backdrop.classList.add("show");
        this._modalPanel.classList.add("show");
        this._dropdown.classList.add("show");
      } else {
        this._positionDropdown();
        this._dropdown.classList.add("show");
        this._addOutsideClickListener();
      }
      this._renderView();
      EventHandler.trigger(this._element, EVENT_OPEN);
    }

    close() {
      if (!this._isOpen || this._config.inline) return;
      this._isOpen = false;
      if (this._config.modal) {
        this._backdrop.classList.remove("show");
        this._modalPanel.classList.remove("show");
        this._dropdown.classList.remove("show");
      } else {
        this._dropdown.classList.remove("show", "drop-up");
        this._removeOutsideClickListener();
      }
      EventHandler.trigger(this._element, EVENT_CLOSE);
    }

    toggle() {
      this._isOpen ? this.close() : this.open();
    }

    /**
     * Set the selected date
     * @param {Date|string|null} date
     */
    setDate(date) {
      if (date === null) {
        this._selectedDate = null;
        this._input.value = "";
        EventHandler.trigger(this._element, EVENT_CHANGE, { date: null });
        return;
      }

      const d = date instanceof Date ? date : this._parseDate(date);
      if (!d || isNaN(d.getTime())) return;

      if (this._isDateDisabled(d)) return;

      this._selectedDate = d;
      this._viewDate = new Date(d);
      this._input.value = this._formatDate(d);
      this._renderView();
      EventHandler.trigger(this._element, EVENT_CHANGE, { date: d });
    }

    /**
     * Get the selected date
     * @returns {Date|null}
     */
    getDate() {
      return this._selectedDate;
    }

    /**
     * Get formatted date string
     * @returns {string}
     */
    getFormattedDate() {
      return this._selectedDate ? this._formatDate(this._selectedDate) : "";
    }

    clear() {
      this.setDate(null);
      this._renderView();
    }

    dispose() {
      this._removeOutsideClickListener();
      if (this._backdrop && this._backdrop.parentNode) {
        this._backdrop.remove();
      }
      // modalPanel contains _dropdown in modal mode; removing it removes both
      if (this._modalPanel && this._modalPanel.parentNode) {
        this._modalPanel.remove();
      } else if (this._dropdown && this._dropdown.parentNode) {
        this._dropdown.remove();
      }
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Parse min/max dates
      if (this._config.minDate) {
        this._minDate = this._parseDate(this._config.minDate);
      }
      if (this._config.maxDate) {
        this._maxDate = this._parseDate(this._config.maxDate);
      }
      if (this._config.disablePast) {
        const todayMin = new Date();
        todayMin.setHours(0, 0, 0, 0);
        if (!this._minDate || todayMin > this._minDate) this._minDate = todayMin;
      }
      if (this._config.disableFuture) {
        const todayMax = new Date();
        todayMax.setHours(0, 0, 0, 0);
        if (!this._maxDate || todayMax < this._maxDate) this._maxDate = todayMax;
      }
      if (this._config.disabledDates) {
        this._config.disabledDates.forEach((d) => {
          const parsed = d instanceof Date ? d : this._parseDate(d);
          if (parsed) this._disabledDates.add(this._dateKey(parsed));
        });
      }
      if (this._config.disabledDays) {
        this._config.disabledDays.forEach((d) => this._disabledDays.add(d));
      }

      // Find or create input
      this._input = this._element.querySelector("input");
      if (!this._input) {
        this._input = document.createElement("input");
        this._input.type = "text";
        this._element.appendChild(this._input);
      }

      if (this._config.readonly) {
        this._input.setAttribute("readonly", "");
      }

      // Parse existing value
      if (this._input.value) {
        const parsed = this._parseDate(this._input.value);
        if (parsed) {
          this._selectedDate = parsed;
          this._viewDate = new Date(parsed);
        }
      }

      // Add wrapper class
      this._element.classList.add("datepicker");
      if (this._config.inline) {
        this._element.classList.add("datepicker-inline");
      }

      // Wrap input
      if (!this._input.parentElement.classList.contains("datepicker-input")) {
        const wrapper = document.createElement("div");
        wrapper.className = "datepicker-input";
        this._input.parentNode.insertBefore(wrapper, this._input);
        wrapper.appendChild(this._input);

        // Add toggle button — native addEventListener to guarantee the click
        // fires regardless of any ancestor event handling or z-index layering.
        if (!this._config.inline) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "datepicker-toggle";
          toggle.setAttribute("aria-label", "Open calendar");
          toggle.innerHTML = CALENDAR_ICON;
          wrapper.appendChild(toggle);

          toggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
          });
        }
      }
      // Store a reference to the datepicker-input wrapper so the dropdown can be
      // anchored to it. This ensures top:100% is relative to the input's bottom
      // edge and is not pushed down by any cf-input-helper below it.
      this._inputWrapper = this._input.parentElement;

      // Build dropdown
      this._buildDropdown();

      // Keyboard
      EventHandler.on(this._input, "keydown", (e) => this._handleKeydown(e));

      // If inline, show immediately
      if (this._config.inline) {
        this._isOpen = true;
        this._dropdown.classList.add("show");
        this._renderView();
      }
    }

    _buildDropdown() {
      this._dropdown = document.createElement("div");
      this._dropdown.className = "datepicker-dropdown";
      this._dropdown.setAttribute("role", "dialog");
      this._dropdown.setAttribute("aria-label", "Date picker");

      if (this._config.modal) {
        // --- Modal mode ---
        // Build outer panel: header + date display + calendar body + footer
        this._modalPanel = document.createElement("div");
        this._modalPanel.className = "datepicker-modal-panel";
        // Carry the product class (if any) so CSS product overrides apply to the panel
        ["cf-input-field-casefusion", "cf-input-field-expireon", "cf-input-field-hyperlize"].forEach((cls) => {
          if (this._element.classList.contains(cls)) this._modalPanel.classList.add(cls);
        });

        // Header: "Select Date" title + × close
        const CLOSE_SVG =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
          "</svg>";
        const header = document.createElement("div");
        header.className = "datepicker-modal-header";
        header.innerHTML =
          '<span class="datepicker-modal-title">Select Date</span>' +
          '<button type="button" class="datepicker-modal-close" aria-label="Close calendar">' +
          CLOSE_SVG +
          "</button>";
        this._modalPanel.appendChild(header);

        // Selected-date display: e.g. "Fri, Apr 10" — updated live
        this._modalDateDisplay = document.createElement("div");
        this._modalDateDisplay.className = "datepicker-modal-date-display";
        this._modalPanel.appendChild(this._modalDateDisplay);

        // Calendar body — the dropdown element embedded inline (not floating)
        this._dropdown.classList.add("datepicker-modal-body");
        this._modalPanel.appendChild(this._dropdown);

        // Footer: Clear | spacer | Cancel | OK
        const footer = document.createElement("div");
        footer.className = "datepicker-modal-footer";
        footer.innerHTML =
          '<button type="button" class="btn btn-tertiary btn-sm" data-cnds-action="modal-clear">Clear</button>' +
          '<span class="datepicker-modal-spacer"></span>' +
          '<button type="button" class="btn btn-tertiary btn-sm" data-cnds-action="modal-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-cnds-action="modal-ok">OK</button>';
        this._modalPanel.appendChild(footer);

        document.body.appendChild(this._modalPanel);

        // Backdrop
        this._backdrop = document.createElement("div");
        this._backdrop.className = "datepicker-backdrop";
        document.body.appendChild(this._backdrop);

        // Events
        EventHandler.on(this._backdrop, "click", () => this.close());
        EventHandler.on(header.querySelector(".datepicker-modal-close"), "click", () => this.close());
        EventHandler.on(
          footer.querySelector('[data-cnds-action="modal-cancel"]'),
          "click",
          () => this.close()
        );
        EventHandler.on(
          footer.querySelector('[data-cnds-action="modal-clear"]'),
          "click",
          () => {
            this._pendingDate = null;
            this._updateModalDateDisplay();
            this._renderView();
          }
        );
        EventHandler.on(
          footer.querySelector('[data-cnds-action="modal-ok"]'),
          "click",
          () => {
            this.setDate(this._pendingDate);
            this.close();
          }
        );
      } else {
        const container = this._config.container
          ? document.querySelector(this._config.container)
          : this._inputWrapper;
        container.appendChild(this._dropdown);
      }
    }

    // Update the large date display in the modal header area
    _updateModalDateDisplay() {
      if (!this._modalDateDisplay) return;
      const date = this._pendingDate;
      if (!date) {
        this._modalDateDisplay.textContent = "\u2014"; // em dash when nothing selected
        return;
      }
      const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      this._modalDateDisplay.textContent =
        DAYS_SHORT[date.getDay()] +
        ", " +
        MONTH_SHORT[date.getMonth()] +
        " " +
        date.getDate();
    }

    _renderView() {
      switch (this._view) {
        case "days":
          this._renderDays();
          break;
        case "months":
          this._renderMonths();
          break;
        case "years":
          this._renderYears();
          break;
      }
    }

    _renderDays() {
      const year = this._viewDate.getFullYear();
      const month = this._viewDate.getMonth();

      let html = "";

      // Header — title LEFT, both nav buttons RIGHT (Figma: fr_header)
      html += '<div class="datepicker-header">';
      html +=
        '<button type="button" class="datepicker-title" data-cnds-action="show-months">' +
        MONTH_NAMES[month] + " " + year + TITLE_ARROW +
        "</button>";
      html += '<div class="datepicker-nav-group">';
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="prev-month" aria-label="Previous month">' +
        NAV_PREV + "</button>";
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="next-month" aria-label="Next month">' +
        NAV_NEXT + "</button>";
      html += "</div>";
      html += "</div>";

      // Weekday headers
      html += '<div class="datepicker-weekdays">';
      for (let i = 0; i < 7; i++) {
        const dayIndex = (this._config.startDay + i) % 7;
        html +=
          '<div class="datepicker-weekday">' + DAY_NAMES[dayIndex] + "</div>";
      }
      html += "</div>";

      // Days grid
      html += '<div class="datepicker-days">';

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      let startOffset = firstDay.getDay() - this._config.startDay;
      if (startOffset < 0) startOffset += 7;

      // Previous month days
      const prevMonthLast = new Date(year, month, 0);
      for (let i = startOffset - 1; i >= 0; i--) {
        const day = prevMonthLast.getDate() - i;
        const date = new Date(year, month - 1, day);
        if (this._config.showOtherMonths) {
          const classes = this._getDayClasses(date, true);
          const clickable =
            this._config.selectOtherMonths && !this._isDateDisabled(date);
          html +=
            '<button type="button" class="datepicker-day ' + classes + '"';
          if (clickable) {
            html += ' data-cnds-date="' + this._dateKey(date) + '"';
          } else {
            html += " disabled";
          }
          html += ">" + day + "</button>";
        } else {
          html += '<div class="datepicker-day"></div>';
        }
      }

      // Current month days
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const classes = this._getDayClasses(date, false);
        const disabled = this._isDateDisabled(date);
        html += '<button type="button" class="datepicker-day ' + classes + '"';
        if (!disabled) {
          html += ' data-cnds-date="' + this._dateKey(date) + '"';
        } else {
          html += " disabled";
        }
        html += ">" + day + "</button>";
      }

      // Next month days
      const totalCells = startOffset + lastDay.getDate();
      const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let i = 1; i <= remaining; i++) {
        const date = new Date(year, month + 1, i);
        if (this._config.showOtherMonths) {
          const classes = this._getDayClasses(date, true);
          const clickable =
            this._config.selectOtherMonths && !this._isDateDisabled(date);
          html +=
            '<button type="button" class="datepicker-day ' + classes + '"';
          if (clickable) {
            html += ' data-cnds-date="' + this._dateKey(date) + '"';
          } else {
            html += " disabled";
          }
          html += ">" + i + "</button>";
        } else {
          html += '<div class="datepicker-day"></div>';
        }
      }

      html += "</div>";

      // Footer (suppressed in modal mode — modal has its own footer)
      if (!this._config.modal && (this._config.todayButton || this._config.clearButton)) {
        html += '<div class="datepicker-footer">';
        if (this._config.todayButton) {
          html +=
            '<button type="button" class="btn btn-tertiary btn-sm" data-cnds-action="today">Today</button>';
        }
        if (this._config.clearButton) {
          html +=
            '<button type="button" class="btn btn-tertiary btn-sm" data-cnds-action="clear">Clear</button>';
        }
        html += "</div>";
      }

      this._dropdown.innerHTML = html;
      this._bindDropdownEvents();
    }

    _renderMonths() {
      const year = this._viewDate.getFullYear();

      let html = "";
      html += '<div class="datepicker-header">';
      html +=
        '<button type="button" class="datepicker-title" data-cnds-action="show-years">' +
        year + TITLE_ARROW +
        "</button>";
      html += '<div class="datepicker-nav-group">';
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="prev-year" aria-label="Previous year">' +
        NAV_PREV + "</button>";
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="next-year" aria-label="Next year">' +
        NAV_NEXT + "</button>";
      html += "</div>";
      html += "</div>";

      html += '<div class="datepicker-months">';
      for (let i = 0; i < 12; i++) {
        const ref = this._config.modal ? this._pendingDate : this._selectedDate;
        const isSelected =
          ref &&
          ref.getFullYear() === year &&
          ref.getMonth() === i;
        const firstOfMonth = new Date(year, i, 1);
        const lastOfMonth = new Date(year, i + 1, 0);
        const isDisabled =
          (this._minDate && lastOfMonth < this._minDate) ||
          (this._maxDate && firstOfMonth > this._maxDate);
        let cls = isSelected ? "selected" : "";
        if (isDisabled) cls += (cls ? " " : "") + "disabled";
        html += '<button type="button" class="datepicker-month ' + cls + '"';
        if (!isDisabled) {
          html += ' data-cnds-month="' + i + '"';
        } else {
          html += " disabled";
        }
        html += ">" + MONTH_SHORT[i] + "</button>";
      }
      html += "</div>";

      this._dropdown.innerHTML = html;
      this._bindDropdownEvents();
    }

    _renderYears() {
      const currentYear = this._viewDate.getFullYear();
      const startYear = currentYear - (currentYear % 12);
      const endYear = startYear + 11;

      let html = "";
      html += '<div class="datepicker-header">';
      html +=
        '<span class="datepicker-title">' +
        startYear + "\u2013" + endYear + TITLE_ARROW +
        "</span>";
      html += '<div class="datepicker-nav-group">';
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="prev-decade" aria-label="Previous decade">' +
        NAV_PREV + "</button>";
      html +=
        '<button type="button" class="datepicker-nav" data-cnds-action="next-decade" aria-label="Next decade">' +
        NAV_NEXT + "</button>";
      html += "</div>";
      html += "</div>";

      html += '<div class="datepicker-years">';
      for (let y = startYear; y <= endYear; y++) {
        const ref = this._config.modal ? this._pendingDate : this._selectedDate;
        const isSelected = ref && ref.getFullYear() === y;
        const firstOfYear = new Date(y, 0, 1);
        const lastOfYear = new Date(y, 11, 31);
        const isDisabled =
          (this._minDate && lastOfYear < this._minDate) ||
          (this._maxDate && firstOfYear > this._maxDate);
        let cls = isSelected ? "selected" : "";
        if (isDisabled) cls += (cls ? " " : "") + "disabled";
        html += '<button type="button" class="datepicker-year ' + cls + '"';
        if (!isDisabled) {
          html += ' data-cnds-year="' + y + '"';
        } else {
          html += " disabled";
        }
        html += ">" + y + "</button>";
      }
      html += "</div>";

      this._dropdown.innerHTML = html;
      this._bindDropdownEvents();
    }

    _bindDropdownEvents() {
      // Day clicks
      this._dropdown.querySelectorAll("[data-cnds-date]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const parts = btn.getAttribute("data-cnds-date").split("-");
          const date = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]),
            parseInt(parts[2])
          );
          if (this._config.modal) {
            // Modal: update pending selection; confirmed only on OK
            this._pendingDate = date;
            this._updateModalDateDisplay();
            this._renderView();
          } else {
            this.setDate(date);
            if (this._config.autoClose) this.close();
          }
        });
      });

      // Month clicks
      this._dropdown.querySelectorAll("[data-cnds-month]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          this._viewDate.setMonth(
            parseInt(btn.getAttribute("data-cnds-month"))
          );
          this._view = "days";
          this._renderView();
        });
      });

      // Year clicks
      this._dropdown.querySelectorAll("[data-cnds-year]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          this._viewDate.setFullYear(
            parseInt(btn.getAttribute("data-cnds-year"))
          );
          this._view = "months";
          this._renderView();
        });
      });

      // Navigation actions
      this._dropdown.querySelectorAll("[data-cnds-action]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = btn.getAttribute("data-cnds-action");
          this._handleAction(action);
        });
      });
    }

    _handleAction(action) {
      switch (action) {
        case "prev-month":
          this._viewDate.setMonth(this._viewDate.getMonth() - 1);
          this._renderView();
          break;
        case "next-month":
          this._viewDate.setMonth(this._viewDate.getMonth() + 1);
          this._renderView();
          break;
        case "prev-year":
          this._viewDate.setFullYear(this._viewDate.getFullYear() - 1);
          this._renderView();
          break;
        case "next-year":
          this._viewDate.setFullYear(this._viewDate.getFullYear() + 1);
          this._renderView();
          break;
        case "prev-decade":
          this._viewDate.setFullYear(this._viewDate.getFullYear() - 12);
          this._renderView();
          break;
        case "next-decade":
          this._viewDate.setFullYear(this._viewDate.getFullYear() + 12);
          this._renderView();
          break;
        case "show-months":
          this._view = "months";
          this._renderView();
          break;
        case "show-years":
          this._view = "years";
          this._renderView();
          break;
        case "today":
          this.setDate(new Date());
          if (this._config.autoClose) this.close();
          break;
        case "clear":
          this.clear();
          break;
      }
    }

    _handleKeydown(e) {
      if (!this._isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          this.open();
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          this.close();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this._moveDay(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          this._moveDay(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          this._moveDay(-7);
          break;
        case "ArrowDown":
          e.preventDefault();
          this._moveDay(7);
          break;
        case "Enter":
          e.preventDefault();
          if (this._selectedDate) {
            this._input.value = this._formatDate(this._selectedDate);
            if (this._config.autoClose) this.close();
          }
          break;
      }
    }

    _moveDay(offset) {
      const base = this._selectedDate || new Date();
      const newDate = new Date(base);
      newDate.setDate(newDate.getDate() + offset);

      if (!this._isDateDisabled(newDate)) {
        this._selectedDate = newDate;
        this._viewDate = new Date(newDate);
        this._input.value = this._formatDate(newDate);
        this._renderView();
        EventHandler.trigger(this._element, EVENT_CHANGE, { date: newDate });
      }
    }

    _getDayClasses(date, isOtherMonth) {
      const classes = [];
      if (isOtherMonth) classes.push("other-month");
      if (this._isToday(date)) classes.push("today");
      if (this._isSelected(date)) classes.push("selected");
      if (this._isDateDisabled(date)) classes.push("disabled");
      return classes.join(" ");
    }

    _isToday(date) {
      const today = new Date();
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }

    _isSelected(date) {
      // In modal mode highlight the pending (uncommitted) selection
      const ref = this._config.modal ? this._pendingDate : this._selectedDate;
      if (!ref) return false;
      return (
        date.getDate() === ref.getDate() &&
        date.getMonth() === ref.getMonth() &&
        date.getFullYear() === ref.getFullYear()
      );
    }

    _isDateDisabled(date) {
      if (this._minDate && date < this._minDate) return true;
      if (this._maxDate && date > this._maxDate) return true;
      if (this._disabledDays.has(date.getDay())) return true;
      if (this._disabledDates.has(this._dateKey(date))) return true;
      return false;
    }

    _dateKey(date) {
      return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
    }

    _formatDate(date) {
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = date.getFullYear();

      return this._config.format
        .replace("dd", dd)
        .replace("mm", mm)
        .replace("yyyy", yyyy)
        .replace("yy", String(yyyy).slice(-2));
    }

    _parseDate(str) {
      if (str instanceof Date) return str;
      if (!str || typeof str !== "string") return null;

      // ISO date strings (YYYY-MM-DD) are used for minDate/maxDate/disabledDates
      // and must be parsed in local time, not via the display format.
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return isNaN(date.getTime()) ? null : date;
      }

      const fmt = this._config.format;
      const ddIdx = fmt.indexOf("dd");
      const mmIdx = fmt.indexOf("mm");
      const yyyyIdx = fmt.indexOf("yyyy");

      if (ddIdx === -1 || mmIdx === -1 || yyyyIdx === -1) {
        // Fallback: try native parsing
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
      }

      const day = parseInt(str.substring(ddIdx, ddIdx + 2), 10);
      const month = parseInt(str.substring(mmIdx, mmIdx + 2), 10) - 1;
      const year = parseInt(str.substring(yyyyIdx, yyyyIdx + 4), 10);

      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    _positionDropdown() {
      const rect = this._element.getBoundingClientRect();
      const dropHeight = 320; // approximate
      const spaceBelow = window.innerHeight - rect.bottom;

      if (spaceBelow < dropHeight && rect.top > dropHeight) {
        this._dropdown.classList.add("drop-up");
      } else {
        this._dropdown.classList.remove("drop-up");
      }
    }

    _addOutsideClickListener() {
      this._outsideClickHandler = (e) => {
        if (
          !this._element.contains(e.target) &&
          !this._dropdown.contains(e.target)
        ) {
          this.close();
        }
      };
      setTimeout(() => {
        document.addEventListener("click", this._outsideClickHandler, true);
      }, 0);
    }

    _removeOutsideClickListener() {
      if (this._outsideClickHandler) {
        document.removeEventListener("click", this._outsideClickHandler, true);
        this._outsideClickHandler = null;
      }
    }

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        let instance = Datepicker.getInstance(this);
        if (!instance) {
          instance = new Datepicker(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function") {
            throw new TypeError("No method named " + config);
          }
          instance[config](...args);
        }
      });
    }
  }

  // Auto-init
  function autoInit(root) {
    if (root === undefined) root = document;
    var elements = root.querySelectorAll("[data-cnds-datepicker-init]");
    elements.forEach(function (el) {
      if (!Datepicker.getInstance(el)) {
        new Datepicker(el);
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

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Datepicker = Datepicker;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Datepicker);
  }
})();
