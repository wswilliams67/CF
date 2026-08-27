/**
 * CNDS Alert Component
 * Dismissible alert messages with show/hide/close animation
 *
 * Autohide behaviour:
 *   - If the alert contains a close button (.btn-close or [data-cnds-dismiss="alert"]),
 *     it is treated as **persistent** and will wait for the user to click the close
 *     icon before hiding — autohide is suppressed regardless of the autohide option.
 *   - If the alert has **no** close button, it is treated as **transient** and will
 *     automatically fade out after the configured delay (when autohide is true).
 *
 * Usage (static — always visible, dismissible):
 *   <div class="alert alert-warning alert-dismissible fade show" role="alert">
 *     <strong>Warning!</strong> Something needs attention.
 *     <button type="button" class="btn-close" data-cnds-dismiss="alert" aria-label="Close"></button>
 *   </div>
 *
 * Usage (dynamic — triggered via JS or data-cnds-alert-init):
 *   <div data-cnds-alert-init class="alert fade" id="my-alert" role="alert"
 *        data-cnds-color="primary" data-cnds-position="top-right"
 *        data-cnds-stacking="true" data-cnds-width="535px"
 *        data-cnds-append-to-body="true" data-cnds-hidden="true"
 *        data-cnds-autohide="true" data-cnds-delay="2000">
 *     Alert content here
 *   </div>
 *
 * Events:
 *   show.cnds.alert   — fires before showing (cancelable)
 *   shown.cnds.alert  — fires after fully shown
 *   hide.cnds.alert   — fires before hiding (cancelable)
 *   hidden.cnds.alert — fires after fully hidden
 *   close.cnds.alert  — fires before closing/removing (cancelable)
 *   closed.cnds.alert — fires after fully closed and removed
 */
(function () {
  "use strict";

  var Utils = window.Nimbus.Utils;
  var EventHandler = window.Nimbus.EventHandler;
  var NimbusComponent = window.Nimbus.NimbusComponent;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  var NAME = "alert";

  var EVENT_SHOW = "show.cnds.alert";
  var EVENT_SHOWN = "shown.cnds.alert";
  var EVENT_HIDE = "hide.cnds.alert";
  var EVENT_HIDDEN = "hidden.cnds.alert";
  var EVENT_CLOSE = "close.cnds.alert";
  var EVENT_CLOSED = "closed.cnds.alert";

  var CLASS_SHOW = "show";
  var CLASS_FADE = "fade";

  var DEFAULTS = {
    position: null,
    width: null,
    color: null,
    delay: 5000,
    autohide: false,
    hidden: false,
    stacking: false,
    appendToBody: false,
    container: null,
    offset: 10
  };

  // -----------------------------------------------------------------------
  // Stacking Registry — tracks visible stacked alerts per position key
  // Each entry: { position: string, alerts: Alert[] }
  // -----------------------------------------------------------------------
  var stackingRegistry = {};

  /**
   * Build a unique key for the stacking group.
   * Alerts in the same container + position share a stack.
   */
  function _stackKey(position, container) {
    var prefix = container || "__body__";
    return prefix + "::" + position;
  }

  /**
   * Recalculate positions for every visible alert in a stacking group.
   * Alerts stack downward from the anchor edge (top or bottom).
   */
  function _recalcStack(key) {
    var group = stackingRegistry[key];
    if (!group || group.length === 0) return;

    // Determine the stacking direction from the first alert's position
    var samplePos = null;
    for (var i = 0; i < group.length; i++) {
      if (group[i]._config && group[i]._config.position) {
        samplePos = group[i]._config.position;
        break;
      }
    }
    if (!samplePos) return;

    var isTop = samplePos.indexOf("top") === 0;
    var baseOffset = 10; // default gap from edge

    // Use the first alert's offset config if available
    if (group.length > 0 && group[0]._config && group[0]._config.offset) {
      baseOffset = group[0]._config.offset;
    }

    var currentOffset = baseOffset;
    var gap = 10; // gap between stacked alerts

    for (var j = 0; j < group.length; j++) {
      var alert = group[j];
      var el = alert._element;

      // Only position visible (shown) alerts
      if (!el || !el.classList.contains(CLASS_SHOW)) continue;

      if (isTop) {
        el.style.top = currentOffset + "px";
        el.style.bottom = "";
      } else {
        el.style.bottom = currentOffset + "px";
        el.style.top = "";
      }

      // Accumulate height for next alert
      currentOffset += el.offsetHeight + gap;
    }
  }

  /**
   * Register an alert instance in its stacking group.
   */
  function _registerInStack(alert) {
    var cfg = alert._config;
    if (!cfg.stacking || !cfg.position) return;

    var key = _stackKey(cfg.position, cfg.container);
    if (!stackingRegistry[key]) {
      stackingRegistry[key] = [];
    }

    // Avoid duplicates
    if (stackingRegistry[key].indexOf(alert) === -1) {
      stackingRegistry[key].push(alert);
    }
  }

  /**
   * Unregister an alert instance from its stacking group and recalculate.
   */
  function _unregisterFromStack(alert) {
    var cfg = alert._config;
    if (!cfg.position) return;

    var key = _stackKey(cfg.position, cfg.container);
    var group = stackingRegistry[key];
    if (!group) return;

    var idx = group.indexOf(alert);
    if (idx > -1) {
      group.splice(idx, 1);
    }

    // Recalculate remaining alerts so they slide up
    _recalcStack(key);
  }

  // -----------------------------------------------------------------------
  // Alert Class
  // -----------------------------------------------------------------------
  class Alert extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      // The parent _getConfig already merged Default + data attrs + config
      // but we need to ensure our DEFAULTS are used as the base
      this._config = Object.assign({}, DEFAULTS, this._config);
      this._isShown = false;
      this._hideTimeout = null;

      this._setup();
    }

    static get NAME() {
      return NAME;
    }

    static get Default() {
      return DEFAULTS;
    }

    // -- Private setup --
    _setup() {
      var el = this._element;
      var cfg = this._config;

      // Apply color class
      if (cfg.color) {
        var classes = Array.from(el.classList);
        for (var i = 0; i < classes.length; i++) {
          if (
            classes[i].indexOf("alert-") === 0 &&
            classes[i] !== "alert-dismissible"
          ) {
            el.classList.remove(classes[i]);
          }
        }
        el.classList.add("alert-" + cfg.color);
      }

      // Apply width
      if (cfg.width) {
        el.style.width = cfg.width;
      }

      // Apply position
      if (cfg.position) {
        // Use absolute positioning when inside a container, fixed for viewport
        if (cfg.container) {
          el.style.position = "absolute";
          // Ensure the container has position: relative for absolute children
          var containerEl = document.querySelector(cfg.container);
          if (
            containerEl &&
            getComputedStyle(containerEl).position === "static"
          ) {
            containerEl.style.position = "relative";
          }
        } else {
          el.style.position = "fixed";
        }
        el.style.zIndex = "1080";
        // Add CSS transition for smooth stacking repositioning
        el.style.transition =
          "top 0.3s ease, bottom 0.3s ease, opacity 0.15s linear";
        this._applyPosition(cfg.position);
      }

      // Ensure fade class for positioned/dynamic alerts only.
      // Static inline alerts should NOT get fade added automatically
      // unless they already have it in the markup.
      if (cfg.position && !el.classList.contains(CLASS_FADE)) {
        el.classList.add(CLASS_FADE);
      }

      // Start hidden if configured
      if (cfg.hidden) {
        el.classList.remove(CLASS_SHOW);
        el.style.display = "none";
        this._isShown = false;
      } else {
        // For non-hidden alerts: ensure they are visible.
        // If the element has the fade class, it needs 'show' to be visible
        // (because .fade:not(.show) { opacity: 0 }).
        if (
          el.classList.contains(CLASS_FADE) &&
          !el.classList.contains(CLASS_SHOW)
        ) {
          el.classList.add(CLASS_SHOW);
        }
        this._isShown = true;
      }

      // Append to body if configured
      if (cfg.appendToBody && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    }

    _applyPosition(position) {
      var el = this._element;
      var offset = this._config.offset || 10;

      el.style.top = "";
      el.style.bottom = "";
      el.style.left = "";
      el.style.right = "";
      el.style.transform = "";

      switch (position) {
        case "top-right":
          el.style.top = offset + "px";
          el.style.right = offset + "px";
          break;
        case "top-left":
          el.style.top = offset + "px";
          el.style.left = offset + "px";
          break;
        case "top-center":
          el.style.top = offset + "px";
          el.style.left = "50%";
          el.style.transform = "translateX(-50%)";
          break;
        case "bottom-right":
          el.style.bottom = offset + "px";
          el.style.right = offset + "px";
          break;
        case "bottom-left":
          el.style.bottom = offset + "px";
          el.style.left = offset + "px";
          break;
        case "bottom-center":
          el.style.bottom = offset + "px";
          el.style.left = "50%";
          el.style.transform = "translateX(-50%)";
          break;
      }
    }

    /**
     * Check whether this alert contains a close button.
     * Alerts with a close button are persistent (user must click to dismiss).
     * Alerts without a close button are transient (autohide after delay).
     */
    _hasCloseButton() {
      return !!this._element.querySelector(
        '.btn-close, [data-cnds-dismiss="alert"]'
      );
    }

    // -- Public API --
    show() {
      if (this._isShown) return;

      var showEvent = Utils.triggerEvent(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      var self = this;
      this._element.style.display = "";

      // Register in stacking group
      if (this._config.stacking && this._config.position) {
        _registerInStack(this);
      }

      // Force reflow so the browser picks up the display change
      void this._element.offsetHeight;

      this._element.classList.add(CLASS_SHOW);
      this._isShown = true;

      // Recalculate stack positions after showing (needs offsetHeight)
      if (this._config.stacking && this._config.position) {
        var key = _stackKey(this._config.position, this._config.container);
        _recalcStack(key);
      }

      var complete = function () {
        Utils.triggerEvent(self._element, EVENT_SHOWN);

        // Autohide logic: alerts with a close button are persistent
        // (wait for user click); alerts without are transient (auto-fade).
        var shouldAutohide = self._config.autohide && !self._hasCloseButton();

        if (shouldAutohide) {
          self._hideTimeout = setTimeout(function () {
            self.hide();
          }, self._config.delay);
        }
      };

      if (this._element.classList.contains(CLASS_FADE)) {
        Utils.executeAfterTransition(complete, this._element);
      } else {
        complete();
      }
    }

    hide() {
      if (!this._isShown) return;

      var hideEvent = Utils.triggerEvent(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      if (this._hideTimeout) {
        clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
      }

      var self = this;
      this._element.classList.remove(CLASS_SHOW);
      this._isShown = false;

      var complete = function () {
        self._element.style.display = "none";
        // Unregister from stack and recalculate remaining alerts
        _unregisterFromStack(self);
        Utils.triggerEvent(self._element, EVENT_HIDDEN);
      };

      if (this._element.classList.contains(CLASS_FADE)) {
        Utils.executeAfterTransition(complete, this._element);
      } else {
        complete();
      }
    }

    close() {
      var closeEvent = Utils.triggerEvent(this._element, EVENT_CLOSE);
      if (closeEvent.defaultPrevented) return;

      this._element.classList.remove(CLASS_SHOW);
      this._isShown = false;

      var self = this;
      var isAnimated = this._element.classList.contains(CLASS_FADE);

      var complete = function () {
        self._destroyElement();
      };

      if (isAnimated) {
        Utils.executeAfterTransition(complete, this._element);
      } else {
        complete();
      }
    }

    toggle() {
      if (this._isShown) {
        this.hide();
      } else {
        this.show();
      }
    }

    update(config) {
      this._config = Object.assign({}, this._config, config);
      this._setup();
    }

    // -- Private --
    _destroyElement() {
      if (this._hideTimeout) {
        clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
      }

      // Unregister from stack and recalculate remaining alerts
      _unregisterFromStack(this);
      Utils.triggerEvent(this._element, EVENT_CLOSED);

      if (this._element.parentNode) {
        this._element.parentNode.removeChild(this._element);
      }

      this.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Dismiss delegation
  // -----------------------------------------------------------------------
  EventHandler.on(
    document,
    "click.cnds.alert.dismiss",
    '[data-cnds-dismiss="alert"]',
    function (e) {
      e.preventDefault();

      var targetSelector = this.getAttribute("data-cnds-target");
      var alertEl;

      if (targetSelector) {
        alertEl = document.querySelector(targetSelector);
      } else {
        alertEl = this.closest(".alert");
      }

      if (!alertEl) return;

      var instance = Alert.getOrCreateInstance(alertEl);
      instance.close();
    }
  );

  // -----------------------------------------------------------------------
  // Auto-init: data-cnds-alert-init
  // -----------------------------------------------------------------------
  function initAlerts(root) {
    root = root || document;
    var elements = root.querySelectorAll("[data-cnds-alert-init]");
    for (var i = 0; i < elements.length; i++) {
      if (!Alert.getInstance(elements[i])) {
        new Alert(elements[i]);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initAlerts();
    });
  } else {
    initAlerts();
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Alert = Alert;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("alert", Alert);
  }
})();
