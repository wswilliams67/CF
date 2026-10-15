/**
 * ============================================================
 * CNDS Timepicker Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Time selection with hour/minute spinners, AM/PM toggle,
 * 12/24 hour format, step intervals, and min/max time.
 *
 * Usage:
 *   <div data-cnds-timepicker-init>
 *     <input type="text" />
 *   </div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "timepicker";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_OPEN = "open" + EVENT_KEY;
  const EVENT_CLOSE = "close" + EVENT_KEY;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  const CLOCK_ICON = '<i class="mdi mdi-clock-outline" aria-hidden="true"></i>';

  const Default = {
    format12: true,
    minuteStep: 1,
    defaultHour: null,
    defaultMinute: null,
    minTime: null,
    maxTime: null,
    inline: false,
    readonly: true,
    withIcon: true,
    showArrows: true
  };

  const DefaultType = {
    format12: "boolean",
    minuteStep: "number",
    defaultHour: "(number|null)",
    defaultMinute: "(number|null)",
    minTime: "(string|null)",
    maxTime: "(string|null)",
    inline: "boolean",
    readonly: "boolean",
    withIcon: "boolean",
    showArrows: "boolean"
  };

  class Timepicker extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._input = null;
      this._toggle = null;
      this._dropdown = null;
      this._liveRegion = null;
      this._isOpen = false;
      this._hours = 12;
      this._minutes = 0;
      this._ampm = "AM";
      this._minTime = null;
      this._maxTime = null;
      this._lastFocusedAction = null;

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
      this._lastFocusedAction = null;

      // If no value is committed and no defaultHour is configured,
      // sync spinners to current time on each open
      if (!this._input.value && this._config.defaultHour === null) {
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();
        if (this._config.format12) {
          this._ampm = h >= 12 ? "PM" : "AM";
          this._hours = h % 12 || 12;
        } else {
          this._hours = h;
        }
        this._minutes = m;
      }

      // Clamp initial spinner state to within min/max limits
      var openCur = this._toTotalMinutes();
      var openMax = this._limitToTotalMinutes(this._maxTime);
      var openMin = this._limitToTotalMinutes(this._minTime);
      if (openMax !== null && openCur > openMax) {
        this._setFromTotalMinutes(openMax);
      } else if (openMin !== null && openCur < openMin) {
        this._setFromTotalMinutes(openMin);
      }

      this._dropdown.classList.add("show");
      this._renderSpinners();
      // 2.4.3 / 2.4.7: move focus into widget on open (small delay lets transition start)
      // When showArrows is false there is no hour-up chevron to focus, so fall back
      // to the first focusable control in the dropdown (AM/PM toggle or footer button).
      var firstBtn = this._dropdown.querySelector("[data-cnds-action='hour-up']") ||
        this._dropdown.querySelector("button:not([disabled])");
      if (firstBtn) setTimeout(function () { firstBtn.focus(); }, 50);
      if (this._toggle) this._toggle.setAttribute("aria-expanded", "true");
      EventHandler.trigger(this._element, EVENT_OPEN);
      this._addOutsideClickListener();
    }

    close() {
      if (!this._isOpen || this._config.inline) return;
      this._isOpen = false;
      this._lastFocusedAction = null;
      this._dropdown.classList.remove("show");
      if (this._toggle) this._toggle.setAttribute("aria-expanded", "false");
      // 2.4.3: return focus to whichever toggle element opened the picker
      var toggleBtn = this._toggle || this._element.querySelector(".timepicker-toggle, .timepicker-toggle-button");
      if (toggleBtn) toggleBtn.focus();
      EventHandler.trigger(this._element, EVENT_CLOSE);
      this._removeOutsideClickListener();
    }

    toggle() {
      this._isOpen ? this.close() : this.open();
    }

    setTime(hours, minutes, ampm) {
      if (this._config.format12) {
        this._hours = Math.max(1, Math.min(12, hours));
        this._ampm = (ampm || "AM").toUpperCase();
      } else {
        this._hours = Math.max(0, Math.min(23, hours));
      }
      this._minutes = Math.max(0, Math.min(59, minutes));
      this._updateInput();
      this._renderSpinners();
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        hours: this._hours,
        minutes: this._minutes,
        ampm: this._ampm,
        formatted: this.getFormattedTime()
      });
    }

    getTime() {
      return {
        hours: this._hours,
        minutes: this._minutes,
        ampm: this._config.format12 ? this._ampm : null
      };
    }

    getFormattedTime() {
      var h = String(this._hours).padStart(2, "0");
      var m = String(this._minutes).padStart(2, "0");
      if (this._config.format12) {
        return h + ":" + m + " " + this._ampm;
      }
      return h + ":" + m;
    }

    clear() {
      this._hours = this._config.format12 ? 12 : 0;
      this._minutes = 0;
      this._ampm = "AM";
      this._input.value = "";
      this._renderSpinners();
    }

    dispose() {
      this._removeOutsideClickListener();
      if (this._dropdown) this._dropdown.remove();
      if (this._liveRegion) this._liveRegion.remove();
      super.dispose();
    }

    // --- Private ---

    _init() {
      // Parse min/max
      if (this._config.minTime)
        this._minTime = this._parseTimeString(this._config.minTime);
      if (this._config.maxTime)
        this._maxTime = this._parseTimeString(this._config.maxTime);

      // Find input
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
        var parsed = this._parseTimeString(this._input.value);
        if (parsed) {
          this._hours = parsed.hours;
          this._minutes = parsed.minutes;
          this._ampm = parsed.ampm || "AM";
        }
      } else if (this._config.defaultHour !== null) {
        this._hours = this._config.defaultHour;
        this._minutes = this._config.defaultMinute || 0;
        if (this._config.format12) {
          this._ampm = this._hours >= 12 ? "PM" : "AM";
          this._hours = this._hours % 12 || 12;
        }
      } else {
        // Default to current time
        var now = new Date();
        var h = now.getHours();
        var mm = now.getMinutes();
        if (this._config.format12) {
          this._ampm = h >= 12 ? "PM" : "AM";
          this._hours = h % 12 || 12;
        } else {
          this._hours = h;
        }
        this._minutes = mm;
      }

      // Wrapper
      this._element.classList.add("timepicker");
      if (this._config.inline) this._element.classList.add("timepicker-inline");

      // Wrap input
      if (!this._input.parentElement.classList.contains("timepicker-input")) {
        var wrapper = document.createElement("div");
        wrapper.className = "timepicker-input";
        this._input.parentNode.insertBefore(wrapper, this._input);
        wrapper.appendChild(this._input);

        if (!this._config.inline && this._config.withIcon !== false) {
          // A custom toggle (button or icon) can be placed as a sibling of the
          // input in the source HTML. Detect it here, move it into the wrapper
          // (so absolute positioning works), then wire up its click handler.
          // Fall back to creating the default clock icon button when none exists.
          var customToggle = this._element.querySelector(
            ".timepicker-toggle-button, [data-cnds-toggle='timepicker']"
          );

          var toggle;
          if (customToggle) {
            wrapper.appendChild(customToggle);
            toggle = customToggle;
          } else {
            toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "timepicker-toggle";
            toggle.setAttribute("aria-label", "Open time picker");
            toggle.innerHTML = CLOCK_ICON;
            wrapper.appendChild(toggle);
          }

          // 4.1.2: convey popup type and state to assistive technology
          toggle.setAttribute("aria-haspopup", "dialog");
          toggle.setAttribute("aria-expanded", "false");
          this._toggle = toggle;

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
      }

      // Build dropdown
      var dropdownId = Utils.getUID("cnds-tp-");
      this._dropdown = document.createElement("div");
      this._dropdown.className = "timepicker-dropdown";
      this._dropdown.id = dropdownId;
      this._dropdown.setAttribute("role", "dialog");
      this._dropdown.setAttribute("aria-label", "Time picker");
      this._dropdown.setAttribute("aria-modal", "true");
      if (this._toggle) this._toggle.setAttribute("aria-controls", dropdownId);
      // Non-inline: anchor to .timepicker-input so top:100% positions below the
      // input field only, not below the label + input.
      // Inline: anchor to the wrapper so the static dropdown flows after the input.
      if (!this._config.inline) {
        this._input.parentElement.appendChild(this._dropdown);
      } else {
        this._element.appendChild(this._dropdown);
      }

      // 1.3.1 / 4.1.2: visually-hidden live region — screen readers announce time changes
      this._liveRegion = document.createElement("div");
      this._liveRegion.setAttribute("aria-live", "polite");
      this._liveRegion.setAttribute("aria-atomic", "true");
      this._liveRegion.className = "visually-hidden";
      this._element.appendChild(this._liveRegion);

      // 2.1.1: Escape closes the dropdown and returns focus to toggle
      // 2.1.1 / dialog pattern: Tab/Shift+Tab trapped within the open dropdown
      EventHandler.on(this._element, "keydown", function (e) {
        if (e.key === "Escape" && this._isOpen) {
          e.stopPropagation();
          this.close();
          return;
        }
        if (e.key === "Tab" && this._isOpen) {
          var focusable = Array.from(
            this._dropdown.querySelectorAll(
              'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter(function (el) { return el.offsetParent !== null; });
          if (!focusable.length) { e.preventDefault(); return; }
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
          } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
      }.bind(this));

      // Popup is triggered by the clock icon toggle button only (see above).
      // Input focus/click do not open the picker.

      if (this._config.inline) {
        this._isOpen = true;
        this._dropdown.classList.add("show");
      }

      this._renderSpinners();
    }

    _renderSpinners() {
      // Pre-compute limit flags for button disabled states
      var maxMin = this._limitToTotalMinutes(this._maxTime);
      var minMin = this._limitToTotalMinutes(this._minTime);
      var step = this._config.minuteStep;

      var atMax = maxMin !== null && this._toTotalMinutes() >= maxMin;
      var atMin = minMin !== null && this._toTotalMinutes() <= minMin;

      // Project next-step values to detect limit boundaries more precisely
      var nextMinUp = this._toTotalMinutes() + step;
      var nextMinDown = this._toTotalMinutes() - step;
      var nextHourUp = this._toTotalMinutes() + 60;
      var nextHourDown = this._toTotalMinutes() - 60;

      var disableHourUp   = maxMin !== null && nextHourUp > maxMin;
      var disableHourDown = minMin !== null && nextHourDown < minMin;
      var disableMinUp    = maxMin !== null && nextMinUp > maxMin;
      var disableMinDown  = minMin !== null && nextMinDown < minMin;

      // AM/PM period availability
      var disableAM = false, disablePM = false;
      if (this._config.format12 && (maxMin !== null || minMin !== null)) {
        // AM spans 0–719 min (12:00 AM – 11:59 AM), PM spans 720–1439
        var amMax = 719, pmMin = 720;
        if (maxMin !== null && maxMin < pmMin) disablePM = true;
        if (minMin !== null && minMin > amMax) disableAM = true;
      }

      var showArrows = this._config.showArrows;

      var html = '<div class="timepicker-ui' + (showArrows ? '' : ' timepicker-no-arrows') + '"><div class="timepicker-spinners">';

      // Hours spinner
      html += '<div class="timepicker-spinner">';
      if (showArrows) {
        html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="hour-up" aria-label="Increase hour"' +
          (disableHourUp ? ' disabled aria-disabled="true"' : '') +
          '><i class="mdi mdi-chevron-up" aria-hidden="true"></i></button>';
      }
      html +=
        '<div class="timepicker-spinner-value" data-cnds-display="hours"><span>' +
        String(this._hours).padStart(2, "0") +
        "</span></div>";
      if (showArrows) {
        html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="hour-down" aria-label="Decrease hour"' +
          (disableHourDown ? ' disabled aria-disabled="true"' : '') +
          '><i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>';
      }
      html += "</div>";

      // Separator
      html += '<div class="timepicker-separator">:</div>';

      // Minutes spinner
      html += '<div class="timepicker-spinner">';
      if (showArrows) {
        html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="minute-up" aria-label="Increase minute"' +
          (disableMinUp ? ' disabled aria-disabled="true"' : '') +
          '><i class="mdi mdi-chevron-up" aria-hidden="true"></i></button>';
      }
      html +=
        '<div class="timepicker-spinner-value" data-cnds-display="minutes"><span>' +
        String(this._minutes).padStart(2, "0") +
        "</span></div>";
      if (showArrows) {
        html += '<button type="button" class="timepicker-spinner-btn" data-cnds-action="minute-down" aria-label="Decrease minute"' +
          (disableMinDown ? ' disabled aria-disabled="true"' : '') +
          '><i class="mdi mdi-chevron-down" aria-hidden="true"></i></button>';
      }
      html += "</div>";

      // AM/PM — 4.1.2: aria-pressed conveys toggle state to screen readers
      if (this._config.format12) {
        html += '<div class="timepicker-ampm">';
        html +=
          '<button type="button" class="timepicker-ampm-btn' +
          (this._ampm === "AM" ? " active" : "") +
          '" data-cnds-action="set-am"' +
          ' aria-pressed="' + (this._ampm === "AM" ? "true" : "false") + '"' +
          (disableAM ? ' disabled aria-disabled="true"' : '') +
          ' aria-label="Select AM">AM</button>';
        html +=
          '<button type="button" class="timepicker-ampm-btn' +
          (this._ampm === "PM" ? " active" : "") +
          '" data-cnds-action="set-pm"' +
          ' aria-pressed="' + (this._ampm === "PM" ? "true" : "false") + '"' +
          (disablePM ? ' disabled aria-disabled="true"' : '') +
          ' aria-label="Select PM">PM</button>';
        html += "</div>";
      }

      html += "</div>";

      // Footer — Clear / Now / OK  (Figma: node 785-10403)
      html += '<div class="timepicker-footer">';
      html += '<button type="button" class="timepicker-footer-btn btn btn-tertiary" data-cnds-action="clear" aria-label="Clear time">Clear</button>';
      html += '<button type="button" class="timepicker-footer-btn btn btn-tertiary" data-cnds-action="now" aria-label="Set to current time">Now</button>';
      html += '<button type="button" class="timepicker-footer-btn btn btn-tertiary" data-cnds-action="ok" aria-label="Confirm time">Ok</button>';
      html += "</div>";

      html += "</div>"; // close timepicker-ui

      this._dropdown.innerHTML = html;
      this._bindSpinnerEvents();

      // 2.4.3 / 2.4.7: restore focus to the button that was last activated
      if (this._lastFocusedAction) {
        var target = this._dropdown.querySelector(
          "[data-cnds-action='" + this._lastFocusedAction + "']"
        );
        if (target) target.focus();
      }
    }

    _bindSpinnerEvents() {
      var self = this;
      this._dropdown
        .querySelectorAll("[data-cnds-action]")
        .forEach(function (btn) {
          var action = btn.getAttribute("data-cnds-action");

          btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            self._lastFocusedAction = action;
            self._handleAction(action);
          });

          // 2.1.1: Arrow keys adjust spinners; Enter/Space activate buttons natively
          btn.addEventListener("keydown", function (e) {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (action === "hour-up" || action === "hour-down") {
                self._lastFocusedAction = "hour-up";
                self._handleAction("hour-up");
              } else if (action === "minute-up" || action === "minute-down") {
                self._lastFocusedAction = "minute-up";
                self._handleAction("minute-up");
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (action === "hour-up" || action === "hour-down") {
                self._lastFocusedAction = "hour-down";
                self._handleAction("hour-down");
              } else if (action === "minute-up" || action === "minute-down") {
                self._lastFocusedAction = "minute-down";
                self._handleAction("minute-down");
              }
            }
          });
        });
    }

    _handleAction(action) {
      switch (action) {
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
          if (this._ampm !== "AM") {
            this._ampm = "AM";
            var curAm = this._toTotalMinutes();
            var maxAm = this._limitToTotalMinutes(this._maxTime);
            var minAm = this._limitToTotalMinutes(this._minTime);
            if ((maxAm !== null && curAm > maxAm) || (minAm !== null && curAm < minAm)) {
              this._ampm = "PM"; break; // revert — AM period out of range
            }
          }
          this._updateInput();
          this._renderSpinners();
          break;
        case "set-pm":
          if (this._ampm !== "PM") {
            this._ampm = "PM";
            var curPm = this._toTotalMinutes();
            var maxPm = this._limitToTotalMinutes(this._maxTime);
            var minPm = this._limitToTotalMinutes(this._minTime);
            if ((maxPm !== null && curPm > maxPm) || (minPm !== null && curPm < minPm)) {
              this._ampm = "AM"; break; // revert — PM period out of range
            }
          }
          this._updateInput();
          this._renderSpinners();
          break;
        case "clear":
          this.clear();
          break;
        case "now":
          var nowDate = new Date();
          var nowH = nowDate.getHours();
          var nowM = nowDate.getMinutes();
          if (this._config.format12) {
            this._ampm = nowH >= 12 ? "PM" : "AM";
            this._hours = nowH % 12 || 12;
          } else {
            this._hours = nowH;
          }
          this._minutes = nowM;
          this._updateInput();
          this._renderSpinners();
          break;
        case "ok":
          this._updateInput();
          this.close();
          break;
      }
    }

    _adjustHour(delta) {
      var prevH = this._hours;
      var prevAmpm = this._ampm;
      if (this._config.format12) {
        this._hours += delta;
        if (this._hours > 12) this._hours = 1;
        if (this._hours < 1) this._hours = 12;
      } else {
        this._hours += delta;
        if (this._hours > 23) this._hours = 0;
        if (this._hours < 0) this._hours = 23;
      }
      var cur = this._toTotalMinutes();
      var max = this._limitToTotalMinutes(this._maxTime);
      var min = this._limitToTotalMinutes(this._minTime);
      // Direction-aware: only block upward movement past max, downward past min
      if ((delta > 0 && max !== null && cur > max) || (delta < 0 && min !== null && cur < min)) {
        this._hours = prevH;
        this._ampm = prevAmpm;
        return;
      }
      this._updateInput();
      this._renderSpinners();
    }

    _adjustMinute(delta) {
      var prevM = this._minutes;
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
      var cur = this._toTotalMinutes();
      var max = this._limitToTotalMinutes(this._maxTime);
      var min = this._limitToTotalMinutes(this._minTime);
      // Direction-aware: only block upward movement past max, downward past min
      if ((delta > 0 && max !== null && cur > max) || (delta < 0 && min !== null && cur < min)) {
        this._minutes = prevM;
        return;
      }
      this._updateInput();
      this._renderSpinners();
    }

    // Sets picker state from total minutes in 24h notation
    _setFromTotalMinutes(total) {
      var h24 = Math.floor(total / 60);
      var m = total % 60;
      this._minutes = m;
      if (this._config.format12) {
        this._ampm = h24 >= 12 ? "PM" : "AM";
        this._hours = h24 % 12 || 12;
      } else {
        this._hours = h24;
      }
    }

    // Returns current picker time as total minutes in 24h notation
    _toTotalMinutes() {
      if (this._config.format12) {
        var h = this._ampm === "PM"
          ? (this._hours === 12 ? 12 : this._hours + 12)
          : (this._hours === 12 ? 0 : this._hours);
        return h * 60 + this._minutes;
      }
      return this._hours * 60 + this._minutes;
    }

    // Converts a parsed limit object { hours, minutes, ampm } to total 24h minutes
    _limitToTotalMinutes(limit) {
      if (!limit) return null;
      var h;
      if (limit.ampm === "PM") {
        h = limit.hours === 12 ? 12 : limit.hours + 12;
      } else if (limit.ampm === "AM") {
        h = limit.hours === 12 ? 0 : limit.hours;
      } else {
        h = limit.hours; // no suffix — treat as 24h
      }
      return h * 60 + limit.minutes;
    }

    _updateInput() {
      var formatted = this.getFormattedTime();
      this._input.value = formatted;
      // 1.3.1: announce updated time to screen readers via live region
      if (this._liveRegion) this._liveRegion.textContent = formatted;
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        hours: this._hours,
        minutes: this._minutes,
        ampm: this._ampm,
        formatted: formatted
      });
    }

    _parseTimeString(str) {
      if (!str) return null;
      var match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!match) return null;
      return {
        hours: parseInt(match[1], 10),
        minutes: parseInt(match[2], 10),
        ampm: match[3] ? match[3].toUpperCase() : null
      };
    }

    _addOutsideClickListener() {
      var self = this;
      this._outsideClickHandler = function (e) {
        if (!self._element.contains(e.target)) {
          self.close();
        }
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
        var instance = Timepicker.getInstance(this);
        if (!instance) {
          instance = new Timepicker(
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
    root.querySelectorAll("[data-cnds-timepicker-init]").forEach(function (el) {
      if (!Timepicker.getInstance(el)) {
        new Timepicker(el);
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
  window.Nimbus.Timepicker = Timepicker;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Timepicker);
  }
})();
