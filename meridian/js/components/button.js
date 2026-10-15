/**
 * Nimbus Button Component
 * ============================================================
 * Handles:
 *   - Toggle push state (active class) on regular buttons
 *   - Fixed action button (FAB) show/hide of child list
 *
 * Usage:
 *   <div class="fixed-action-btn" data-cnds-button-init>
 *     <a class="btn btn-primary btn-floating btn-lg"><i class="fas fa-pencil-alt"></i></a>
 *     <ul class="list-unstyled">
 *       <li><a class="btn btn-danger btn-floating btn-lg"><i class="mdi mdi-star"></i></a></li>
 *     </ul>
 *   </div>
 *
 * JS API:
 *   const instance = new Nimbus.Button(element);
 *   instance.show();   // open FAB list
 *   instance.hide();   // close FAB list
 *   instance.toggle(); // toggle active / FAB list
 * ============================================================
 */
(function () {
  "use strict";

  var NimbusComponent = window.Nimbus.NimbusComponent;
  var EventHandler = window.Nimbus.EventHandler;
  var Utils = window.Nimbus.Utils;

  var NAME = "button";
  var EVENT_KEY = ".cnds.button";
  var DATA_KEY = "cnds.button";

  var EVENT_SHOW = "show" + EVENT_KEY;
  var EVENT_SHOWN = "shown" + EVENT_KEY;
  var EVENT_HIDE = "hide" + EVENT_KEY;
  var EVENT_HIDDEN = "hidden" + EVENT_KEY;

  var CLASS_ACTIVE = "active";
  var CLASS_SHOW = "show";
  var SELECTOR_FIXED = ".fixed-action-btn";
  var SELECTOR_DATA_INIT = "[data-cnds-button-init]";

  var DEFAULTS = {
    // no config options needed for now
  };

  class Button extends NimbusComponent {
    constructor(element, config) {
      super(element, config);
      this._isFixed = this._element.classList.contains("fixed-action-btn");
      this._isOpen = false;
      this._list = this._isFixed ? this._element.querySelector("ul") : null;
      this._trigger = this._isFixed
        ? this._element.querySelector(":scope > a, :scope > button")
        : null;

      this._setup();
    }

    // -----------------------------------------------------------------------
    // Public
    // -----------------------------------------------------------------------

    /**
     * Toggle push state on regular buttons, or show/hide on FAB
     */
    toggle() {
      if (this._isFixed) {
        this._isOpen ? this.hide() : this.show();
      } else {
        this._element.classList.toggle(CLASS_ACTIVE);
        this._element.setAttribute(
          "aria-pressed",
          this._element.classList.contains(CLASS_ACTIVE)
        );
      }
    }

    /**
     * Show the FAB child list
     */
    show() {
      if (!this._isFixed || this._isOpen) return;

      var showEvent = Utils.triggerEvent(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      this._element.classList.add(CLASS_ACTIVE, CLASS_SHOW);
      this._isOpen = true;

      // Animate each li sliding upward from behind the main button
      this._animateItems(true);

      var self = this;
      var items = this._list ? this._list.querySelectorAll("li") : [];
      var lastItem = items.length ? items[items.length - 1] : null;
      if (lastItem) {
        Utils.executeAfterTransition(function () {
          Utils.triggerEvent(self._element, EVENT_SHOWN);
        }, lastItem);
      } else {
        Utils.triggerEvent(this._element, EVENT_SHOWN);
      }
    }

    /**
     * Hide the FAB child list
     */
    hide() {
      if (!this._isFixed || !this._isOpen) return;

      var hideEvent = Utils.triggerEvent(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      // Animate items back down
      this._animateItems(false);

      var self = this;
      var items = this._list ? this._list.querySelectorAll("li") : [];
      var lastItem = items.length ? items[0] : null;
      if (lastItem) {
        Utils.executeAfterTransition(function () {
          self._element.classList.remove(CLASS_ACTIVE, CLASS_SHOW);
          self._isOpen = false;
          Utils.triggerEvent(self._element, EVENT_HIDDEN);
        }, lastItem);
      } else {
        this._element.classList.remove(CLASS_ACTIVE, CLASS_SHOW);
        this._isOpen = false;
        Utils.triggerEvent(this._element, EVENT_HIDDEN);
      }
    }

    dispose() {
      if (this._isFixed && this._trigger) {
        EventHandler.off(this._trigger, "click");
      }
      // Clean up toggle button click handler
      if (!this._isFixed) {
        EventHandler.off(this._element, "click");
      }
      EventHandler.off(document, "click." + DATA_KEY);
      super.dispose();
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    static get NAME() {
      return NAME;
    }

    _getConfig(config) {
      return Object.assign({}, DEFAULTS, config || {});
    }

    /**
     * Animate list items sliding out from (or back behind) the main button.
     * Each item gets a staggered translateY so they fan out upward.
     * @param {boolean} opening - true = slide out, false = slide back
     */
    _animateItems(opening) {
      if (!this._list) return;

      var items = this._list.querySelectorAll("li");
      // Get the height of the main trigger button
      var triggerHeight = this._trigger ? this._trigger.offsetHeight : 56;
      // Get the height of a child button (they should all be the same size)
      var firstChildBtn = items.length
        ? items[0].querySelector(".btn-floating, .btn")
        : null;
      var childHeight = firstChildBtn
        ? firstChildBtn.offsetHeight
        : triggerHeight;
      var gap = 15; // consistent gap between each item in px

      items.forEach(function (li, index) {
        var n = index + 1; // 1-based index
        if (opening) {
          // Each li is absolutely positioned at bottom:0, centered with translateX(-50%)
          // Offset upward: first clears the trigger, then each subsequent clears the previous child
          var offset = triggerHeight + gap + index * (childHeight + gap);
          li.style.transform = "translateX(-50%) translateY(-" + offset + "px)";
          li.style.transitionDelay = n * 0.05 + "s";
          li.style.opacity = "1";
        } else {
          // Slide back to origin (behind main button)
          li.style.transform = "translateX(-50%) translateY(0)";
          li.style.transitionDelay = (items.length - n) * 0.05 + "s";
          li.style.opacity = "0";
        }
      });
    }

    _setup() {
      if (this._isFixed && this._trigger) {
        // Click on the main FAB button toggles the list
        var self = this;
        EventHandler.on(this._trigger, "click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.toggle();
        });

        // Click outside closes the list
        EventHandler.on(document, "click." + DATA_KEY, function (e) {
          if (self._isOpen && !self._element.contains(e.target)) {
            self.hide();
          }
        });
      }

      // For toggle buttons (non-FAB), add click handler and set initial aria-pressed
      if (!this._isFixed) {
        if (this._element.classList.contains(CLASS_ACTIVE)) {
          this._element.setAttribute("aria-pressed", "true");
        }

        // Add click handler for toggle buttons
        if (this._element.hasAttribute("data-cnds-toggle")) {
          var self = this;
          EventHandler.on(this._element, "click", function (e) {
            e.preventDefault();
            self.toggle();
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Auto-init
  // -----------------------------------------------------------------------
  function initButtons(root) {
    root = root || document;
    // Init fixed action buttons
    var fixedBtns = root.querySelectorAll(SELECTOR_FIXED + SELECTOR_DATA_INIT);
    fixedBtns.forEach(function (el) {
      if (!Button.getInstance(el)) {
        new Button(el);
      }
    });

    // Init toggle buttons (buttons with data-cnds-toggle="button")
    var toggleBtns = root.querySelectorAll('[data-cnds-toggle="button"]');
    toggleBtns.forEach(function (el) {
      if (!Button.getInstance(el)) {
        new Button(el);
      }
    });
  }

  // Run on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initButtons();
    });
  } else {
    initButtons();
  }

  // Listen for cnds.ready (Nimbus boot complete)
  document.addEventListener("cnds.ready", function () {
    initButtons();
  });

  // -----------------------------------------------------------------------
  // Expose
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Button = Button;
})();
