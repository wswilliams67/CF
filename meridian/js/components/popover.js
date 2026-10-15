/**
 * CNDS Popover Component
 * Extends Tooltip with richer content (header + body)
 *
 * Usage:
 *   <button data-cnds-toggle="popover"
 *           data-cnds-placement="right"
 *           data-cnds-title="Popover Title"
 *           data-cnds-content="Popover body content here.">
 *     Click me
 *   </button>
 *
 * Options (data attributes):
 *   data-cnds-placement="top|bottom|left|right"  — preferred side; auto-flips if clipped
 *   data-cnds-trigger="click|hover|focus|manual"
 *   data-cnds-title="Header text"
 *   data-cnds-content="Body text"
 *   data-cnds-html="false"
 *   data-cnds-delay="0"
 *   data-cnds-dismiss="true"  (dismiss on next click outside)
 *
 * Positioning behaviour:
 *   - The popover is appended to <body> and positioned with position:fixed so it
 *     escapes overflow:hidden ancestors.
 *   - Auto-flip: if the preferred placement would overflow the viewport, the
 *     popover automatically moves to the opposite side (right↔left, top↔bottom).
 *   - Scroll-tracking: while the popover is open, it repositions on every scroll
 *     and resize event so it stays anchored to its trigger.
 */
(function () {
  "use strict";

  const Utils = window.Nimbus.Utils;
  const EventHandler = window.Nimbus.EventHandler;
  const NimbusComponent = window.Nimbus.NimbusComponent;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  const NAME = "popover";
  const EVENT_SHOW = "show.cnds.popover";
  const EVENT_SHOWN = "shown.cnds.popover";
  const EVENT_HIDE = "hide.cnds.popover";
  const EVENT_HIDDEN = "hidden.cnds.popover";
  const EVENT_INSERTED = "inserted.cnds.popover";

  const CLASS_SHOW = "show";
  const CLASS_FADE = "fade";

  const DefaultConfig = {
    animation: true,
    placement: "right",
    trigger: "click",
    title: "",
    content: "",
    delay: 0,
    html: false,
    offset: [0, 12],
    container: "body",
    customClass: "",
    sanitize: true,
    dismissOnOutsideClick: true,
    viewportPadding: 8,
    scrollViewportPadding: null,
    trackScroll: true
  };

  const DefaultType = {
    animation: "boolean",
    placement: "string",
    trigger: "string",
    title: "(string|function)",
    content: "(string|function)",
    delay: "(number|object)",
    html: "boolean",
    offset: "(array|string)",
    container: "(string|element)",
    customClass: "string",
    sanitize: "boolean",
    dismissOnOutsideClick: "boolean",
    viewportPadding: "(number|object|boolean)",
    scrollViewportPadding: "(number|object|boolean)",
    trackScroll: "boolean"
  };

  // -----------------------------------------------------------------------
  // Popover Class
  // -----------------------------------------------------------------------
  class Popover extends NimbusComponent {
    constructor(element, config) {
      super(element, config);
      this._isShown = false;
      this._tip = null;
      this._hoverState = "";
      this._timeout = null;
      this._outsideClickHandler = null;
      this._scrollHandler = null;

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
      const title = this._getTitle();
      const content = this._getContent();
      if (!title && !content) return;

      const showEvent = Utils.triggerEvent(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      const tip = this._getTipElement();
      this._setContent(tip, title, content);

      if (this._config.animation) {
        tip.classList.add(CLASS_FADE);
      }

      const container = this._getContainer();
      if (!tip.parentNode || tip.parentNode !== container) {
        container.appendChild(tip);
      }

      Utils.triggerEvent(this._element, EVENT_INSERTED);

      // Position
      this._positionPopover(tip);

      tip.classList.add(CLASS_SHOW);
      this._isShown = true;

      const complete = () => {
        Utils.triggerEvent(this._element, EVENT_SHOWN);
        this._setupOutsideClick();
        this._setupScrollTracking();
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
      this._removeOutsideClick();

      const complete = () => {
        this._removeScrollTracking();
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

    dispose() {
      clearTimeout(this._timeout);
      this._removeOutsideClick();
      this._removeScrollTracking();
      if (this._tip && this._tip.parentNode) {
        this._tip.parentNode.removeChild(this._tip);
      }
      this._tip = null;
      super.dispose();
    }

    // -- Private --
    _getTitle() {
      let title = this._config.title;
      if (!title) {
        title = this._element.getAttribute("data-cnds-title") || "";
      }
      if (typeof title === "function") {
        title = title.call(this._element);
      }
      return title;
    }

    _getContent() {
      let content = this._config.content;
      if (!content) {
        content = this._element.getAttribute("data-cnds-content") || "";
      }
      if (typeof content === "function") {
        content = content.call(this._element);
      }
      return content;
    }

    _getTipElement() {
      if (!this._tip) {
        this._tip = this._createTipElement();
      }
      return this._tip;
    }

    _createTipElement() {
      const tip = document.createElement("div");
      tip.classList.add("popover", `popover-${this._config.placement}`);
      if (this._config.customClass) {
        tip.classList.add(...this._config.customClass.split(" "));
      }
      tip.setAttribute("role", "tooltip");
      tip.id = Utils.getUID("popover");

      const arrow = document.createElement("div");
      arrow.classList.add("popover-arrow");
      tip.appendChild(arrow);

      const header = document.createElement("h3");
      header.classList.add("popover-header");
      tip.appendChild(header);

      const body = document.createElement("div");
      body.classList.add("popover-body");
      tip.appendChild(body);

      return tip;
    }

    _setContent(tip, title, content) {
      const header = tip.querySelector(".popover-header");
      const body = tip.querySelector(".popover-body");

      // Header
      if (header) {
        if (title) {
          if (this._config.html) {
            header.innerHTML = title;
          } else {
            header.textContent = title;
          }
          header.style.display = "";
        } else {
          header.style.display = "none";
        }
      }

      // Body
      if (body) {
        if (this._config.html) {
          if (typeof content === "string") {
            body.innerHTML = content;
          } else {
            body.innerHTML = "";
            body.appendChild(content);
          }
        } else {
          body.textContent = content;
        }
      }

      // ARIA
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

    _positionPopover(tip, padOverride) {
      const placement = this._config.placement;
      const rect = this._element.getBoundingClientRect();

      // Measure tip using fixed positioning — coordinates are viewport-relative
      tip.style.position = "fixed";
      tip.style.visibility = "hidden";
      tip.style.display = "block";

      const tipRect = tip.getBoundingClientRect();
      const offset = this._getOffset();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Auto-flip: if preferred placement overflows the viewport, use the opposite side
      let effective = placement;
      if (placement === "right" && rect.right + offset[1] + tipRect.width > vw) {
        effective = "left";
      } else if (placement === "left" && rect.left - offset[1] - tipRect.width < 0) {
        effective = "right";
      } else if (placement === "bottom" && rect.bottom + offset[1] + tipRect.height > vh) {
        effective = "top";
      } else if (placement === "top" && rect.top - offset[1] - tipRect.height < 0) {
        effective = "bottom";
      }

      // Sync placement class so CSS arrow renders on the correct side
      tip.classList.remove("popover-top", "popover-bottom", "popover-left", "popover-right");
      tip.classList.add(`popover-${effective}`);

      let top, left;
      switch (effective) {
        case "top":
          top = rect.top - tipRect.height - offset[1];
          left = rect.left + rect.width / 2 - tipRect.width / 2 + offset[0];
          break;
        case "bottom":
          top = rect.bottom + offset[1];
          left = rect.left + rect.width / 2 - tipRect.width / 2 + offset[0];
          break;
        case "left":
          top = rect.top + rect.height / 2 - tipRect.height / 2 + offset[0];
          left = rect.left - tipRect.width - offset[1];
          break;
        case "right":
          top = rect.top + rect.height / 2 - tipRect.height / 2 + offset[0];
          left = rect.right + offset[1];
          break;
        default:
          top = rect.bottom + offset[1];
          left = rect.left + rect.width / 2 - tipRect.width / 2 + offset[0];
      }

      // Clamp to viewport — keeps the popover clear of sticky headers, floating pagers, etc.
      // padOverride lets scroll tracking use a different padding than the initial show.
      const pad = padOverride !== undefined ? padOverride : this._getViewportPadding();
      if (pad !== null) {
        top  = Math.max(pad.top,  Math.min(vh - tipRect.height - pad.bottom, top));
        left = Math.max(pad.left, Math.min(vw - tipRect.width  - pad.right,  left));
      }

      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
      tip.style.visibility = "";
      tip.style.display = "";
    }

    _getScrollPad() {
      const sp = this._config.scrollViewportPadding;
      if (sp === null) return this._getViewportPadding();
      if (sp === false) return null;
      if (typeof sp === "number") return { top: sp, bottom: sp, left: sp, right: sp };
      return {
        top:    (sp && sp.top    != null) ? sp.top    : 8,
        bottom: (sp && sp.bottom != null) ? sp.bottom : 8,
        left:   (sp && sp.left   != null) ? sp.left   : 8,
        right:  (sp && sp.right  != null) ? sp.right  : 8,
      };
    }

    _getViewportPadding() {
      const p = this._config.viewportPadding;
      if (p === false) return null;
      if (typeof p === "number") return { top: p, bottom: p, left: p, right: p };
      return {
        top:    (p && p.top    != null) ? p.top    : 8,
        bottom: (p && p.bottom != null) ? p.bottom : 8,
        left:   (p && p.left   != null) ? p.left   : 8,
        right:  (p && p.right  != null) ? p.right  : 8,
      };
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
          case "hover":
            EventHandler.on(this._element, "mouseenter.cnds.popover", () =>
              this._enter()
            );
            EventHandler.on(this._element, "mouseleave.cnds.popover", () =>
              this._leave()
            );
            break;
          case "focus":
            EventHandler.on(this._element, "focusin.cnds.popover", () =>
              this._enter()
            );
            EventHandler.on(this._element, "focusout.cnds.popover", () =>
              this._leave()
            );
            break;
          case "click":
            EventHandler.on(this._element, "click.cnds.popover", (e) => {
              e.preventDefault();
              this.toggle();
            });
            break;
          // manual — no auto listeners
        }
      });
    }

    _setupOutsideClick() {
      if (!this._config.dismissOnOutsideClick) return;
      if (this._outsideClickHandler) return;

      this._outsideClickHandler = (e) => {
        if (!this._tip) return;
        if (this._element.contains(e.target) || this._tip.contains(e.target))
          return;
        this.hide();
      };

      // Delay to avoid catching the current click
      setTimeout(() => {
        document.addEventListener("click", this._outsideClickHandler, true);
      }, 0);
    }

    _removeOutsideClick() {
      if (this._outsideClickHandler) {
        document.removeEventListener("click", this._outsideClickHandler, true);
        this._outsideClickHandler = null;
      }
    }

    _setupScrollTracking() {
      if (!this._config.trackScroll) return;
      if (this._scrollHandler) return;
      this._scrollHandler = (e) => {
        if (this._isShown && this._tip) {
          if (e && e.target && this._tip.contains(e.target)) return;
          this._positionPopover(this._tip, this._getScrollPad());
        }
      };
      document.addEventListener("scroll", this._scrollHandler, true);
      window.addEventListener("resize", this._scrollHandler);
    }

    _removeScrollTracking() {
      if (this._scrollHandler) {
        document.removeEventListener("scroll", this._scrollHandler, true);
        window.removeEventListener("resize", this._scrollHandler);
        this._scrollHandler = null;
      }
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
  window.Nimbus.Popover = Popover;

  // Register with DataAPI
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("popover", Popover);
  }
})();
