/**
 * ============================================================
 * CNDS Datetimepicker Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Combined date and time picker with tabbed interface.
 * Composes Datepicker and Timepicker functionality.
 *
 * Usage:
 *   <div data-cnds-datetimepicker-init>
 *     <input type="text" />
 *   </div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "datetimepicker";
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
  const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const ICON = '<i class="mdi mdi-calendar-clock" aria-hidden="true"></i>';

  const Default = {
    dateFormat: "mm/dd/yyyy",
    format12: true,
    minuteStep: 1,
    startDay: 0,
    minDate: null,
    maxDate: null,
    inline: false,
    autoClose: false,
    showTodayButton: true,
    showClearButton: true,
    showOtherMonths: true,
    readonly: true,
    defaultTab: "date",
    disabled: false,
    disablePast: false,
    disableFuture: false
  };

  const DefaultType = {
    dateFormat: "string",
    format12: "boolean",
    minuteStep: "number",
    startDay: "number",
    minDate: "(string|null)",
    maxDate: "(string|null)",
    inline: "boolean",
    autoClose: "boolean",
    showTodayButton: "boolean",
    showClearButton: "boolean",
    showOtherMonths: "boolean",
    readonly: "boolean",
    defaultTab: "string",
    disabled: "boolean",
    disablePast: "boolean",
    disableFuture: "boolean"
  };

  class Datetimepicker extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._input = null;
      this._dropdown = null;
      this._isOpen = false;
      this._activeTab = this._config.defaultTab;

      // Date state
      this._selectedDate = null;
      this._viewDate = new Date();
      this._dateView = "days";
      this._minDate = null;
      this._maxDate = null;

      // Time state
      this._hours = 12;
      this._minutes = 0;
      this._ampm = "AM";

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
      if (this._isOpen || this._config.disabled) return;
      this._isOpen = true;
      this._dropdown.classList.add("show");
      this._render();
      EventHandler.trigger(this._element, EVENT_OPEN);
      this._addOutsideClickListener();
    }

    close() {
      if (!this._isOpen) return;
      this._isOpen = false;
      this._dropdown.classList.remove("show");
      EventHandler.trigger(this._element, EVENT_CLOSE);
      this._removeOutsideClickListener();
    }

    toggle() {
      this._isOpen ? this.close() : this.open();
    }

    setDateTime(date, hours, minutes, ampm) {
      if (date) {
        this._selectedDate =
          date instanceof Date ? date : this._parseDate(date);
        if (this._selectedDate) this._viewDate = new Date(this._selectedDate);
      }
      if (hours !== undefined) {
        this._hours = this._config.format12
          ? Math.max(1, Math.min(12, hours))
          : Math.max(0, Math.min(23, hours));
      }
      if (minutes !== undefined) {
        this._minutes = Math.max(0, Math.min(59, minutes));
      }
      if (ampm) this._ampm = ampm.toUpperCase();
      this._updateInput();
      this._render();
    }

    getDateTime() {
      return {
        date: this._selectedDate,
        hours: this._hours,
        minutes: this._minutes,
        ampm: this._config.format12 ? this._ampm : null,
        formatted: this._getFormattedValue()
      };
    }

    clear() {
      this._selectedDate = null;
      this._hours = 12;
      this._minutes = 0;
      this._ampm = "AM";
      this._input.value = "";
      this._render();
    }

    dispose() {
      this._removeOutsideClickListener();
      if (this._dropdown) this._dropdown.remove();
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._input = this._element.querySelector("input");
      if (!this._input) {
        this._input = document.createElement("input");
        this._input.type = "text";
        this._element.appendChild(this._input);
      }

      if (this._config.readonly) this._input.setAttribute("readonly", "");
      if (this._config.disabled) this._input.setAttribute("disabled", "");

      // Resolve min/max date constraints
      if (this._config.minDate) {
        this._minDate = this._parseDate(this._config.minDate);
      }
      if (this._config.maxDate) {
        this._maxDate = this._parseDate(this._config.maxDate);
      }
      if (this._config.disablePast) {
        var todayMin = new Date();
        todayMin.setHours(0, 0, 0, 0);
        if (!this._minDate || todayMin > this._minDate) this._minDate = todayMin;
      }
      if (this._config.disableFuture) {
        var todayMax = new Date();
        todayMax.setHours(0, 0, 0, 0);
        if (!this._maxDate || todayMax < this._maxDate) this._maxDate = todayMax;
      }

      this._element.classList.add("datetimepicker");
      if (this._config.inline)
        this._element.classList.add("datetimepicker-inline");

      // Wrap input
      if (
        !this._input.parentElement.classList.contains("datetimepicker-input")
      ) {
        var wrapper = document.createElement("div");
        wrapper.className = "datetimepicker-input";
        this._input.parentNode.insertBefore(wrapper, this._input);
        wrapper.appendChild(this._input);

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "datetimepicker-toggle";
        toggle.setAttribute("aria-label", "Open date time picker");
        if (this._config.disabled) toggle.setAttribute("disabled", "");
        toggle.innerHTML = ICON;
        wrapper.appendChild(toggle);
        EventHandler.on(
          toggle,
          "click",
          function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
          }.bind(this)
        );
      }

      // Dropdown
      this._dropdown = document.createElement("div");
      this._dropdown.className = "datetimepicker-dropdown";
      this._dropdown.setAttribute("role", "dialog");
      this._element.appendChild(this._dropdown);

      EventHandler.on(this._input, "click", this.open.bind(this));

      this._render();
    }

    _render() {
      var html = "";

      // Tabs
      html += '<div class="datetimepicker-tabs">';
      html +=
        '<button type="button" class="datetimepicker-tab' +
        (this._activeTab === "date" ? " active" : "") +
        '" data-cnds-tab="date">Date</button>';
      html +=
        '<button type="button" class="datetimepicker-tab' +
        (this._activeTab === "time" ? " active" : "") +
        '" data-cnds-tab="time">Time</button>';
      html += "</div>";

      // Date panel
      html +=
        '<div class="datetimepicker-panel' +
        (this._activeTab === "date" ? " active" : "") +
        '" data-cnds-panel="date">';
      html += this._renderDatePanel();
      html += "</div>";

      // Time panel
      html +=
        '<div class="datetimepicker-panel' +
        (this._activeTab === "time" ? " active" : "") +
        '" data-cnds-panel="time">';
      html += this._renderTimePanel();
      html += "</div>";

      // Footer
      html += '<div class="datetimepicker-footer">';
      if (this._config.showClearButton) {
        html +=
          '<button type="button" class="datetimepicker-footer-btn" data-cnds-action="clear">Clear</button>';
      }
      if (this._config.showTodayButton) {
        html +=
          '<button type="button" class="datetimepicker-footer-btn" data-cnds-action="now">Now</button>';
      }
      html += "</div>";

      this._dropdown.innerHTML = html;
      this._bindEvents();
    }

    _renderDatePanel() {
      var year = this._viewDate.getFullYear();
      var month = this._viewDate.getMonth();
      var html = "";

      if (this._dateView === "days") {
        html += '<div class="datepicker-header">';
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="prev-month">&#8249;</button>';
        html +=
          '<button type="button" class="datepicker-title" data-cnds-action="show-months">' +
          MONTH_NAMES[month] +
          " " +
          year +
          "</button>";
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="next-month">&#8250;</button>';
        html += "</div>";

        html += '<div class="datepicker-weekdays">';
        for (var i = 0; i < 7; i++) {
          var dayIndex = (this._config.startDay + i) % 7;
          html +=
            '<div class="datepicker-weekday">' + DAY_NAMES[dayIndex] + "</div>";
        }
        html += "</div>";

        html += '<div class="datepicker-days">';
        var firstDay = new Date(year, month, 1);
        var lastDay = new Date(year, month + 1, 0);
        var startOffset = firstDay.getDay() - this._config.startDay;
        if (startOffset < 0) startOffset += 7;

        var prevLast = new Date(year, month, 0);
        for (var j = startOffset - 1; j >= 0; j--) {
          var d = prevLast.getDate() - j;
          if (this._config.showOtherMonths) {
            html +=
              '<button type="button" class="datepicker-day other-month" disabled>' +
              d +
              "</button>";
          } else {
            html += '<div class="datepicker-day"></div>';
          }
        }

        for (var day = 1; day <= lastDay.getDate(); day++) {
          var date = new Date(year, month, day);
          var cls = [];
          if (this._isToday(date)) cls.push("today");
          if (this._isSelected(date)) cls.push("selected");
          var dayDisabled = this._isDateDisabled(date);
          if (dayDisabled) cls.push("disabled");
          html += '<button type="button" class="datepicker-day ' + cls.join(" ") + '"';
          if (!dayDisabled) {
            html += ' data-cnds-date="' + year + "-" + month + "-" + day + '"';
          } else {
            html += " disabled";
          }
          html += ">" + day + "</button>";
        }

        var totalCells = startOffset + lastDay.getDate();
        var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (var k = 1; k <= remaining; k++) {
          if (this._config.showOtherMonths) {
            html +=
              '<button type="button" class="datepicker-day other-month" disabled>' +
              k +
              "</button>";
          } else {
            html += '<div class="datepicker-day"></div>';
          }
        }
        html += "</div>";
      } else if (this._dateView === "months") {
        html += '<div class="datepicker-header">';
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="prev-year">&#8249;</button>';
        html +=
          '<button type="button" class="datepicker-title" data-cnds-action="show-years">' +
          year +
          "</button>";
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="next-year">&#8250;</button>';
        html += "</div>";
        html += '<div class="datepicker-months">';
        for (var m = 0; m < 12; m++) {
          var mCls =
            this._selectedDate &&
            this._selectedDate.getFullYear() === year &&
            this._selectedDate.getMonth() === m
              ? "selected"
              : "";
          html +=
            '<button type="button" class="datepicker-month ' +
            mCls +
            '" data-cnds-month="' +
            m +
            '">' +
            MONTH_SHORT[m] +
            "</button>";
        }
        html += "</div>";
      } else if (this._dateView === "years") {
        var startYear = year - (year % 12);
        html += '<div class="datepicker-header">';
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="prev-decade">&#8249;</button>';
        html +=
          '<span class="datepicker-title" style="cursor:default">' +
          startYear +
          " - " +
          (startYear + 11) +
          "</span>";
        html +=
          '<button type="button" class="datepicker-nav" data-cnds-action="next-decade">&#8250;</button>';
        html += "</div>";
        html += '<div class="datepicker-years">';
        for (var y = startYear; y < startYear + 12; y++) {
          var yCls =
            this._selectedDate && this._selectedDate.getFullYear() === y
              ? "selected"
              : "";
          html +=
            '<button type="button" class="datepicker-year ' +
            yCls +
            '" data-cnds-year="' +
            y +
            '">' +
            y +
            "</button>";
        }
        html += "</div>";
      }

      return html;
    }

    _renderTimePanel() {
      var html = '<div class="timepicker-spinners">';

      html += '<div class="timepicker-spinner">';
      html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="hour-up">' +
              '<i class="mdi mdi-chevron-up" aria-hidden="true"></i></button>';
      html += '<div class="timepicker-spinner-value"><span>' +
              String(this._hours).padStart(2, "0") + '</span></div>';
      html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="hour-down">' +
              '<i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>';
      html += "</div>";

      html += '<div class="timepicker-separator">:</div>';

      html += '<div class="timepicker-spinner">';
      html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="minute-up">' +
              '<i class="mdi mdi-chevron-up" aria-hidden="true"></i></button>';
      html += '<div class="timepicker-spinner-value"><span>' +
              String(this._minutes).padStart(2, "0") + '</span></div>';
      html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="minute-down">' +
              '<i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>';
      html += "</div>";

      if (this._config.format12) {
        html += '<div class="timepicker-ampm">';
        html +=
          '<button type="button" class="timepicker-ampm-btn' +
          (this._ampm === "AM" ? " active" : "") +
          '" data-cnds-action="set-am">AM</button>';
        html +=
          '<button type="button" class="timepicker-ampm-btn' +
          (this._ampm === "PM" ? " active" : "") +
          '" data-cnds-action="set-pm">PM</button>';
        html += "</div>";
      }

      html += "</div>";
      return html;
    }

    _bindEvents() {
      var self = this;

      // Tab switching
      this._dropdown
        .querySelectorAll("[data-cnds-tab]")
        .forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            self._activeTab = btn.getAttribute("data-cnds-tab");
            self._render();
          });
        });

      // Date clicks
      this._dropdown
        .querySelectorAll("[data-cnds-date]")
        .forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            var parts = btn.getAttribute("data-cnds-date").split("-");
            self._selectedDate = new Date(
              parseInt(parts[0]),
              parseInt(parts[1]),
              parseInt(parts[2])
            );
            self._viewDate = new Date(self._selectedDate);
            self._updateInput();
            self._render();
          });
        });

      // Month clicks
      this._dropdown
        .querySelectorAll("[data-cnds-month]")
        .forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            self._viewDate.setMonth(
              parseInt(btn.getAttribute("data-cnds-month"))
            );
            self._dateView = "days";
            self._render();
          });
        });

      // Year clicks
      this._dropdown
        .querySelectorAll("[data-cnds-year]")
        .forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            self._viewDate.setFullYear(
              parseInt(btn.getAttribute("data-cnds-year"))
            );
            self._dateView = "months";
            self._render();
          });
        });

      // All actions
      this._dropdown
        .querySelectorAll("[data-cnds-action]")
        .forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            self._handleAction(btn.getAttribute("data-cnds-action"));
          });
        });
    }

    _handleAction(action) {
      switch (action) {
        case "prev-month":
          this._viewDate.setMonth(this._viewDate.getMonth() - 1);
          this._render();
          break;
        case "next-month":
          this._viewDate.setMonth(this._viewDate.getMonth() + 1);
          this._render();
          break;
        case "prev-year":
          this._viewDate.setFullYear(this._viewDate.getFullYear() - 1);
          this._render();
          break;
        case "next-year":
          this._viewDate.setFullYear(this._viewDate.getFullYear() + 1);
          this._render();
          break;
        case "prev-decade":
          this._viewDate.setFullYear(this._viewDate.getFullYear() - 12);
          this._render();
          break;
        case "next-decade":
          this._viewDate.setFullYear(this._viewDate.getFullYear() + 12);
          this._render();
          break;
        case "show-months":
          this._dateView = "months";
          this._render();
          break;
        case "show-years":
          this._dateView = "years";
          this._render();
          break;
        case "hour-up":
          this._adjustHour(1);
          break;
        case "hour-down":
          this._adjustHour(-1);
          break;
        case "minute-up":
          this._adjustMinute(this._config.minuteStep);
          break;
        case "minute-down":
          this._adjustMinute(-this._config.minuteStep);
          break;
        case "set-am":
          this._ampm = "AM";
          this._updateInput();
          this._render();
          break;
        case "set-pm":
          this._ampm = "PM";
          this._updateInput();
          this._render();
          break;
        case "now": {
          var now = new Date();
          this._selectedDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          this._viewDate = new Date(this._selectedDate);
          var h = now.getHours();
          if (this._config.format12) {
            this._ampm = h >= 12 ? "PM" : "AM";
            this._hours = h % 12 || 12;
          } else {
            this._hours = h;
          }
          this._minutes = now.getMinutes();
          this._updateInput();
          this._render();
          break;
        }
        case "clear":
          this.clear();
          break;
      }
    }

    _adjustHour(delta) {
      if (this._config.format12) {
        this._hours += delta;
        if (this._hours > 12) this._hours = 1;
        if (this._hours < 1) this._hours = 12;
      } else {
        this._hours += delta;
        if (this._hours > 23) this._hours = 0;
        if (this._hours < 0) this._hours = 23;
      }
      this._updateInput();
      this._render();
    }

    _adjustMinute(delta) {
      this._minutes += delta;
      if (this._minutes >= 60) {
        this._minutes = 0;
        this._adjustHour(1);
        return;
      }
      if (this._minutes < 0) {
        this._minutes = 60 + this._minutes;
        this._adjustHour(-1);
        return;
      }
      this._updateInput();
      this._render();
    }

    _updateInput() {
      this._input.value = this._getFormattedValue();
      EventHandler.trigger(this._element, EVENT_CHANGE, this.getDateTime());
    }

    _getFormattedValue() {
      var parts = [];
      if (this._selectedDate) {
        var dd = String(this._selectedDate.getDate()).padStart(2, "0");
        var mm = String(this._selectedDate.getMonth() + 1).padStart(2, "0");
        var yyyy = this._selectedDate.getFullYear();
        parts.push(
          this._config.dateFormat
            .replace("dd", dd)
            .replace("mm", mm)
            .replace("yyyy", yyyy)
        );
      }
      var h = String(this._hours).padStart(2, "0");
      var m = String(this._minutes).padStart(2, "0");
      if (this._config.format12) {
        parts.push(h + ":" + m + " " + this._ampm);
      } else {
        parts.push(h + ":" + m);
      }
      return parts.join(", ");
    }

    _parseDate(str) {
      if (str instanceof Date) return str;
      if (!str) return null;
      var d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }

    _isToday(date) {
      var today = new Date();
      return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      );
    }

    _isSelected(date) {
      if (!this._selectedDate) return false;
      return (
        date.getDate() === this._selectedDate.getDate() &&
        date.getMonth() === this._selectedDate.getMonth() &&
        date.getFullYear() === this._selectedDate.getFullYear()
      );
    }

    _isDateDisabled(date) {
      if (this._minDate && date < this._minDate) return true;
      if (this._maxDate && date > this._maxDate) return true;
      return false;
    }

    _addOutsideClickListener() {
      var self = this;
      this._outsideClickHandler = function (e) {
        if (!self._element.contains(e.target)) self.close();
      };
      setTimeout(function () {
        document.addEventListener("click", self._outsideClickHandler, true);
      }, 0);
    }

    _removeOutsideClickListener() {
      if (this._outsideClickHandler) {
        document.removeEventListener("click", this._outsideClickHandler, true);
        this._outsideClickHandler = null;
      }
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Datetimepicker.getInstance(this);
        if (!instance) {
          instance = new Datetimepicker(
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
    root
      .querySelectorAll("[data-cnds-datetimepicker-init]")
      .forEach(function (el) {
        if (!Datetimepicker.getInstance(el)) {
          new Datetimepicker(el);
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
  window.Nimbus.Datetimepicker = Datetimepicker;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Datetimepicker);
  }
})();
