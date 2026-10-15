/**
 * CNDS Toast Component
 * Auto-dismissing notification toasts with positioning, stacking, and animations.
 *
 * Auto-init (data attributes):
 *   <div class="toast" data-cnds-toast-init
 *        data-cnds-position="top-right"
 *        data-cnds-autohide="true"
 *        data-cnds-delay="3000"
 *        data-cnds-stacking="true"
 *        data-cnds-append-to-body="true"
 *        data-cnds-color="success"
 *        data-cnds-width="350px">
 *     <div class="toast-header">...</div>
 *     <div class="toast-body">...</div>
 *   </div>
 *
 * JavaScript init:
 *   const instance = new Nimbus.Toast(element, { position: 'top-right', autohide: true, delay: 3000 });
 *   instance.show();
 *
 * Dismiss (inside toast):
 *   <button type="button" class="btn-close" data-cnds-dismiss="toast"></button>
 *
 * Trigger from outside:
 *   <button data-cnds-toggle="toast" data-cnds-target="#myToast">Show</button>
 */
(function () {
  "use strict";

  var Utils        = window.Nimbus.Utils;
  var EventHandler = window.Nimbus.EventHandler;
  var NimbusComponent = window.Nimbus.NimbusComponent;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  var NAME         = "toast";
  var EVENT_SHOW   = "show.cnds.toast";
  var EVENT_SHOWN  = "shown.cnds.toast";
  var EVENT_HIDE   = "hide.cnds.toast";
  var EVENT_HIDDEN = "hidden.cnds.toast";

  var CLASS_SHOW    = "show";
  var CLASS_SHOWING = "showing";
  var CLASS_FADE    = "fade";

  var DefaultConfig = {
    animation:    true,
    autohide:     true,
    delay:        5000,
    position:     "top-right",
    offset:       24,
    width:        null,
    color:        null,
    hidden:       false,
    stacking:     true,
    appendToBody: false,
    container:    null
  };

  var DefaultType = {
    animation:    "boolean",
    autohide:     "boolean",
    delay:        "number",
    position:     "(string|null)",
    offset:       "number",
    width:        "(string|null)",
    color:        "(string|null)",
    hidden:       "boolean",
    stacking:     "boolean",
    appendToBody: "boolean",
    container:    "(string|null)"
  };

  // -----------------------------------------------------------------------
  // Stacking Registry
  // Tracks all visible toasts per position+container combination.
  // -----------------------------------------------------------------------
  var stackingRegistry = {};

  function _stackKey(position, container) {
    return (container || "__body__") + "::" + position;
  }

  function _recalcStack(key) {
    var group = stackingRegistry[key];
    if (!group || group.length === 0) return;

    var samplePos = null;
    for (var i = 0; i < group.length; i++) {
      if (group[i]._config && group[i]._config.position) {
        samplePos = group[i]._config.position;
        break;
      }
    }
    if (!samplePos) return;

    var isTop      = samplePos.indexOf("top") === 0;
    var baseOffset = (group[0]._config && group[0]._config.offset !== undefined)
                       ? group[0]._config.offset : 24;
    var current    = baseOffset;
    var gap        = 10;

    for (var j = 0; j < group.length; j++) {
      var el = group[j]._element;
      if (!el || !el.classList.contains(CLASS_SHOW)) continue;
      if (isTop) {
        el.style.top    = current + "px";
        el.style.bottom = "";
      } else {
        el.style.bottom = current + "px";
        el.style.top    = "";
      }
      current += el.offsetHeight + gap;
    }
  }

  function _registerInStack(toast) {
    var cfg = toast._config;
    if (!cfg.stacking || !cfg.position) return;
    var key = _stackKey(cfg.position, cfg.container);
    if (!stackingRegistry[key]) stackingRegistry[key] = [];
    if (stackingRegistry[key].indexOf(toast) === -1) {
      stackingRegistry[key].push(toast);
    }
  }

  function _unregisterFromStack(toast) {
    var cfg = toast._config;
    if (!cfg.position) return;
    var key   = _stackKey(cfg.position, cfg.container);
    var group = stackingRegistry[key];
    if (!group) return;
    var idx = group.indexOf(toast);
    if (idx > -1) group.splice(idx, 1);
    _recalcStack(key);
  }

  // -----------------------------------------------------------------------
  // Toast Class
  // -----------------------------------------------------------------------
  class Toast extends NimbusComponent {
    constructor(element, config) {
      super(element, config);
      this._config  = Object.assign({}, DefaultConfig, this._config);
      this._timeout = null;
      this._hasMouseInteraction    = false;
      this._hasKeyboardInteraction = false;
      this._isShown = this._element.classList.contains(CLASS_SHOW);

      this._setup();
      this._setupListeners();
    }

    static get NAME()        { return NAME; }
    static get Default()     { return DefaultConfig; }
    static get DefaultType() { return DefaultType; }

    // -----------------------------------------------------------------------
    // Private: setup
    // Positioning is only applied when the toast is explicitly configured
    // for dynamic/floating use (via data-cnds-position, appendToBody, or
    // container). Static inline toasts (e.g., Colors section demos) are
    // left in their natural document flow.
    // -----------------------------------------------------------------------
    _setup() {
      var el  = this._element;
      var cfg = this._config;

      var wantsPositioning =
        el.hasAttribute("data-cnds-position") ||
        cfg.appendToBody ||
        !!cfg.container;

      // Apply color data attribute
      if (cfg.color) {
        el.setAttribute("data-cnds-color", cfg.color);
      }

      // Apply explicit width
      if (cfg.width) {
        el.style.width = cfg.width;
      }

      if (wantsPositioning) {
        // Position element fixed to viewport (or absolute inside a container)
        if (cfg.container) {
          el.style.position = "absolute";
          var containerEl = document.querySelector(cfg.container);
          if (containerEl && getComputedStyle(containerEl).position === "static") {
            containerEl.style.position = "relative";
          }
        } else {
          el.style.position = "fixed";
        }

        el.style.zIndex    = "1090";
        el.style.transition = "top 0.3s ease, bottom 0.3s ease, opacity 0.15s linear";

        if (cfg.position) {
          this._applyPosition(cfg.position);
        }

        // Ensure fade class for smooth animation
        if (!el.classList.contains(CLASS_FADE)) {
          el.classList.add(CLASS_FADE);
        }

        // Start hidden when not already shown
        if (!this._isShown) {
          el.style.display = "none";
        }

        // Append to body or container
        if (cfg.appendToBody && el.parentNode !== document.body) {
          document.body.appendChild(el);
        }
      }
    }

    _applyPosition(position) {
      var el     = this._element;
      var offset = this._config.offset !== undefined ? this._config.offset : 24;

      el.style.top       = "";
      el.style.bottom    = "";
      el.style.left      = "";
      el.style.right     = "";
      el.style.transform = "";

      switch (position) {
        case "top-right":
          el.style.top   = offset + "px";
          el.style.right = offset + "px";
          break;
        case "top-left":
          el.style.top  = offset + "px";
          el.style.left = offset + "px";
          break;
        case "top-center":
          el.style.top       = offset + "px";
          el.style.left      = "50%";
          el.style.transform = "translateX(-50%)";
          break;
        case "bottom-right":
          el.style.bottom = offset + "px";
          el.style.right  = offset + "px";
          break;
        case "bottom-left":
          el.style.bottom = offset + "px";
          el.style.left   = offset + "px";
          break;
        case "bottom-center":
          el.style.bottom    = offset + "px";
          el.style.left      = "50%";
          el.style.transform = "translateX(-50%)";
          break;
      }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    show() {
      if (this._isShown) return;

      var showEvent = Utils.triggerEvent(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      this._clearTimeout();

      var el = this._element;
      el.style.display = "";

      if (this._config.stacking && this._config.position) {
        _registerInStack(this);
      }

      if (this._config.animation) {
        el.classList.add(CLASS_FADE);
      }

      Utils.reflow(el);
      el.classList.add(CLASS_SHOW, CLASS_SHOWING);
      this._isShown = true;

      if (this._config.stacking && this._config.position) {
        _recalcStack(_stackKey(this._config.position, this._config.container));
      }

      var self = this;
      var complete = function () {
        el.classList.remove(CLASS_SHOWING);
        Utils.triggerEvent(el, EVENT_SHOWN);
        self._maybeScheduleHide();
      };

      if (this._config.animation) {
        Utils.executeAfterTransition(complete, el);
      } else {
        complete();
      }
    }

    hide() {
      if (!this._isShown) return;

      var hideEvent = Utils.triggerEvent(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._clearTimeout();

      var el = this._element;
      el.classList.add(CLASS_SHOWING);
      this._isShown = false;

      var self = this;
      var complete = function () {
        el.classList.remove(CLASS_SHOWING, CLASS_SHOW);
        el.style.display = "none";
        _unregisterFromStack(self);
        Utils.triggerEvent(el, EVENT_HIDDEN);
      };

      if (this._config.animation) {
        Utils.executeAfterTransition(complete, el);
      } else {
        complete();
      }
    }

    update(config) {
      this._config = Object.assign({}, this._config, config);
      if (config.position) {
        this._applyPosition(config.position);
      }
    }

    dispose() {
      this._clearTimeout();
      if (this._element.classList.contains(CLASS_SHOW)) {
        this._element.classList.remove(CLASS_SHOW);
      }
      _unregisterFromStack(this);
      super.dispose();
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------
    _setupListeners() {
      EventHandler.on(this._element, "mouseenter.cnds.toast", () => {
        this._hasMouseInteraction = true;
        this._clearTimeout();
      });
      EventHandler.on(this._element, "mouseleave.cnds.toast", () => {
        this._hasMouseInteraction = false;
        this._maybeScheduleHide();
      });
      EventHandler.on(this._element, "focusin.cnds.toast", () => {
        this._hasKeyboardInteraction = true;
        this._clearTimeout();
      });
      EventHandler.on(this._element, "focusout.cnds.toast", () => {
        this._hasKeyboardInteraction = false;
        this._maybeScheduleHide();
      });
    }

    _maybeScheduleHide() {
      if (!this._config.autohide) return;
      if (this._hasMouseInteraction || this._hasKeyboardInteraction) return;
      this._timeout = setTimeout(() => {
        this.hide();
      }, this._config.delay);
    }

    _clearTimeout() {
      if (this._timeout) {
        clearTimeout(this._timeout);
        this._timeout = null;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Dismiss delegation — close button inside a toast
  // -----------------------------------------------------------------------
  EventHandler.on(
    document,
    "click.cnds.toast.dismiss",
    '[data-cnds-dismiss="toast"]',
    function (e) {
      var toast = this.closest(".toast");
      if (!toast) return;
      e.preventDefault();
      var instance = Toast.getOrCreateInstance(toast);
      instance.hide();
    }
  );

  // -----------------------------------------------------------------------
  // Toggle delegation — external trigger button
  // -----------------------------------------------------------------------
  EventHandler.on(
    document,
    "click.cnds.toast.trigger",
    '[data-cnds-toggle="toast"][data-cnds-target]',
    function (e) {
      var target = document.querySelector(this.getAttribute("data-cnds-target"));
      if (!target) return;
      e.preventDefault();
      Toast.getOrCreateInstance(target).show();
    }
  );

  // -----------------------------------------------------------------------
  // Auto-init: data-cnds-toast-init
  // -----------------------------------------------------------------------
  function initToasts(root) {
    root = root || document;
    var elements = root.querySelectorAll("[data-cnds-toast-init]");
    for (var i = 0; i < elements.length; i++) {
      if (!Toast.getInstance(elements[i])) {
        new Toast(elements[i]);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initToasts(); });
  } else {
    initToasts();
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Toast = Toast;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("toast", Toast);
  }
})();
