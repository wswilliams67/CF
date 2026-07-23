/**
 * CNDS Tooltip Component
 * Lightweight tooltips using CSS-only positioning (no Popper.js dependency)
 *
 * Usage:
 *   <button data-cnds-toggle="tooltip" data-cnds-placement="top" title="Tooltip text">
 *     Hover me
 *   </button>
 *
 * Placements: top, bottom, left, right
 *
 * Options (data attributes):
 *   data-cnds-placement="top|bottom|left|right"
 *   data-cnds-trigger="hover|focus|click|manual"
 *   data-cnds-delay="200"
 *   data-cnds-html="false"
 *   data-cnds-offset="0,8"
 *   data-cnds-animation="true"
 */
(function () {
  "use strict";

  const Utils = window.Nimbus.Utils;
  const EventHandler = window.Nimbus.EventHandler;
  const NimbusComponent = window.Nimbus.NimbusComponent;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  const NAME = "tooltip";
  const EVENT_SHOW = "show.cnds.tooltip";
  const EVENT_SHOWN = "shown.cnds.tooltip";
  const EVENT_HIDE = "hide.cnds.tooltip";
  const EVENT_HIDDEN = "hidden.cnds.tooltip";
  const EVENT_INSERTED = "inserted.cnds.tooltip";

  const CLASS_SHOW = "show";
  const CLASS_FADE = "fade";

  const TRIGGER_HOVER = "hover";
  const TRIGGER_FOCUS = "focus";
  const TRIGGER_CLICK = "click";
  const TRIGGER_MANUAL = "manual";

  const DefaultConfig = {
    animation: true,
    placement: "top",
    trigger: "hover focus",
    title: "",
    delay: 0,
    html: false,
    offset: [0, 8],
    container: "body",
    customClass: "",
    sanitize: true
  };

  const DefaultType = {
    animation: "boolean",
    placement: "string",
    trigger: "string",
    title: "(string|function)",
    delay: "(number|object)",
    html: "boolean",
    offset: "(array|string)",
    container: "(string|element)",
    customClass: "string",
    sanitize: "boolean"
  };

  // -----------------------------------------------------------------------
  // Tooltip Class
  // -----------------------------------------------------------------------
  class Tooltip extends NimbusComponent {
    constructor(element, config) {
      super(element, config);
      this._isShown = false;
      this._tip = null;
      this._hoverState = "";
      this._timeout = null;

      // Store original title and remove from element to prevent native tooltip
      if (this._element.getAttribute("title")) {
        this._element.setAttribute(
          "data-cnds-original-title",
          this._element.getAttribute("title")
        );
        this._element.removeAttribute("title");
      }

      this._setupListeners();
    }

    // -- Static --
    static get NAME() {
      return NAME;
    }
    static get Default() {
      return DefaultConfig;
    }
    static get DefaultType() {
      return DefaultType;
    }

    // -- Public API --
    show() {
      if (this._element.style.display === "none" || !this._getTitle()) return;

      const showEvent = Utils.triggerEvent(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      const tip = this._getTipElement();
      this._setContent(tip);

      if (this._config.animation) {
        tip.classList.add(CLASS_FADE);
      }

      // Append to container
      const container = this._getContainer();
      if (!tip.parentNode || tip.parentNode !== container) {
        container.appendChild(tip);
      }

      Utils.triggerEvent(this._element, EVENT_INSERTED);

      // Position the tooltip
      this._positionTooltip(tip);

      tip.classList.add(CLASS_SHOW);
      this._isShown = true;

      const complete = () => {
        Utils.triggerEvent(this._element, EVENT_SHOWN);
      };

      if (this._config.animation) {
        Utils.executeAfterTransition(complete, tip);
      } else {
        complete();
      }
    }

    hide() {
      if (!this._isShown) return;

      const hideEvent = Utils.triggerEvent(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      const tip = this._getTipElement();
      tip.classList.remove(CLASS_SHOW);

      const complete = () => {
        if (this._hoverState !== "show" && tip.parentNode) {
          tip.parentNode.removeChild(tip);
        }
        this._isShown = false;
        Utils.triggerEvent(this._element, EVENT_HIDDEN);
      };

      if (this._config.animation) {
        Utils.executeAfterTransition(complete, tip);
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

    enable() {
      this._isEnabled = true;
    }

    disable() {
      this._isEnabled = false;
    }

    dispose() {
      clearTimeout(this._timeout);
      if (this._tip && this._tip.parentNode) {
        this._tip.parentNode.removeChild(this._tip);
      }
      // Restore original title
      const originalTitle = this._element.getAttribute(
        "data-cnds-original-title"
      );
      if (originalTitle) {
        this._element.setAttribute("title", originalTitle);
        this._element.removeAttribute("data-cnds-original-title");
      }
      this._tip = null;
      super.dispose();
    }

    // -- Private --
    _getTitle() {
      let title = this._config.title;
      if (!title) {
        title = this._element.getAttribute("data-cnds-original-title") || "";
      }
      if (typeof title === "function") {
        title = title.call(this._element);
      }
      return title;
    }

    _getTipElement() {
      if (!this._tip) {
        this._tip = this._createTipElement();
      }
      return this._tip;
    }

    _createTipElement() {
      const tip = document.createElement("div");
      tip.classList.add("tooltip", `tooltip-${this._config.placement}`);
      if (this._config.customClass) {
        tip.classList.add(...this._config.customClass.split(" "));
      }
      tip.setAttribute("role", "tooltip");
      tip.setAttribute("data-cnds-placement", this._config.placement);
      tip.id = Utils.getUID("tooltip");

      const arrow = document.createElement("div");
      arrow.classList.add("tooltip-arrow");
      tip.appendChild(arrow);

      const inner = document.createElement("div");
      inner.classList.add("tooltip-inner");
      tip.appendChild(inner);

      return tip;
    }

    _setContent(tip) {
      const inner = tip.querySelector(".tooltip-inner");
      if (!inner) return;

      const title = this._getTitle();
      if (this._config.html) {
        if (typeof title === "string") {
          inner.innerHTML = title;
        } else {
          inner.innerHTML = "";
          inner.appendChild(title);
        }
      } else {
        inner.textContent = title;
      }

      // Set ARIA
      this._element.setAttribute("aria-describedby", tip.id);
    }

    _getContainer() {
      if (this._config.container === "body") {
        return document.body;
      }
      if (typeof this._config.container === "string") {
        return document.querySelector(this._config.container);
      }
      return this._config.container;
    }

    _positionTooltip(tip) {
      const placement = this._config.placement;
      const rect = this._element.getBoundingClientRect();
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft =
        window.pageXOffset || document.documentElement.scrollLeft;

      // Make tip visible but off-screen to measure
      tip.style.position = "absolute";
      tip.style.visibility = "hidden";
      tip.style.display = "block";

      const tipRect = tip.getBoundingClientRect();
      const offset = this._getOffset();

      let top, left;

      switch (placement) {
        case "top":
          top = rect.top + scrollTop - tipRect.height - offset[1];
          left =
            rect.left +
            scrollLeft +
            rect.width / 2 -
            tipRect.width / 2 +
            offset[0];
          break;
        case "bottom":
          top = rect.bottom + scrollTop + offset[1];
          left =
            rect.left +
            scrollLeft +
            rect.width / 2 -
            tipRect.width / 2 +
            offset[0];
          break;
        case "left":
          top =
            rect.top +
            scrollTop +
            rect.height / 2 -
            tipRect.height / 2 +
            offset[0];
          left = rect.left + scrollLeft - tipRect.width - offset[1];
          break;
        case "right":
          top =
            rect.top +
            scrollTop +
            rect.height / 2 -
            tipRect.height / 2 +
            offset[0];
          left = rect.right + scrollLeft + offset[1];
          break;
        default:
          top = rect.top + scrollTop - tipRect.height - offset[1];
          left =
            rect.left +
            scrollLeft +
            rect.width / 2 -
            tipRect.width / 2 +
            offset[0];
      }

      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
      tip.style.visibility = "";
      tip.style.display = "";
    }

    _getOffset() {
      const offset = this._config.offset;
      if (typeof offset === "string") {
        return offset.split(",").map((v) => parseInt(v.trim(), 10));
      }
      return offset;
    }

    _getDelay(direction) {
      const delay = this._config.delay;
      if (typeof delay === "object") {
        return delay[direction] || 0;
      }
      return delay;
    }

    _setupListeners() {
      const triggers = this._config.trigger.split(" ");

      triggers.forEach((trigger) => {
        switch (trigger) {
          case TRIGGER_HOVER:
            EventHandler.on(this._element, "mouseenter.cnds.tooltip", () =>
              this._enter()
            );
            EventHandler.on(this._element, "mouseleave.cnds.tooltip", () =>
              this._leave()
            );
            break;
          case TRIGGER_FOCUS:
            EventHandler.on(this._element, "focusin.cnds.tooltip", () =>
              this._enter()
            );
            EventHandler.on(this._element, "focusout.cnds.tooltip", () =>
              this._leave()
            );
            break;
          case TRIGGER_CLICK:
            EventHandler.on(this._element, "click.cnds.tooltip", () =>
              this.toggle()
            );
            break;
          // TRIGGER_MANUAL — no auto listeners
        }
      });
    }

    _enter() {
      this._hoverState = "show";
      clearTimeout(this._timeout);

      const delay = this._getDelay("show");
      if (!delay) {
        this.show();
        return;
      }

      this._timeout = setTimeout(() => {
        if (this._hoverState === "show") {
          this.show();
        }
      }, delay);
    }

    _leave() {
      this._hoverState = "out";
      clearTimeout(this._timeout);

      const delay = this._getDelay("hide");
      if (!delay) {
        this.hide();
        return;
      }

      this._timeout = setTimeout(() => {
        if (this._hoverState === "out") {
          this.hide();
        }
      }, delay);
    }
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Tooltip = Tooltip;

  // Register with DataAPI
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("tooltip", Tooltip);
  }
})();
