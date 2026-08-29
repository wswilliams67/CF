/**
 * ============================================================
 * CNDS Offcanvas (Sliding Panel) Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "offcanvas";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_SHOW = "show";
  const CLASS_OFFCANVAS_OPEN = "offcanvas-open";

  const CLASS_STATIC = "offcanvas-static";

  const Default = {
    backdrop: true,
    keyboard: true,
    scroll: false
  };

  const DefaultType = {
    /* `true` | `false` | "static" — matching Modal. "static" keeps the backdrop
       visible and dimmed but inert: clicking it nudges the panel instead of
       dismissing it. For a panel the operator cannot re-open once it is gone —
       one reached by a deep link, or one holding an unsaved decision — an
       accidental click on the dimmed area destroys the arrival, and a panel
       that vanishes is worse than one that declines to. */
    backdrop: "(boolean|string)",
    keyboard: "boolean",
    scroll: "boolean"
  };

  class Offcanvas extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._backdrop = null;
      this._backdropClickHandler = null;
      this._isShown = false;
      this._isTransitioning = false;
      this._triggerElement = null;
      this._focusTrapHandler = null;
    }

    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }
    static get NAME() {
      return NAME;
    }

    // --- Public Methods ---

    toggle(relatedTarget) {
      return this._isShown ? this.hide() : this.show(relatedTarget);
    }

    show(relatedTarget) {
      if (this._isShown || this._isTransitioning) return;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW, {
        relatedTarget
      });
      if (showEvent.defaultPrevented) return;

      this._isShown = true;
      this._isTransitioning = true;

      if (relatedTarget) {
        this._triggerElement = relatedTarget;
      }

      if (!this._config.scroll) {
        document.body.classList.add(CLASS_OFFCANVAS_OPEN);
      }

      this._element.removeAttribute("aria-hidden");
      this._element.setAttribute("aria-modal", "true");
      this._element.setAttribute("role", "dialog");

      if (this._config.backdrop) {
        this._showBackdrop();
      }

      Utils.reflow(this._element);
      this._element.classList.add(CLASS_SHOW);

      const transitionComplete = () => {
        this._trapFocus();
        this._isTransitioning = false;
        EventHandler.trigger(this._element, EVENT_SHOWN, { relatedTarget });
      };

      Utils.executeAfterTransition(transitionComplete, this._element);
    }

    hide() {
      if (!this._isShown || this._isTransitioning) return;

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._isShown = false;
      this._isTransitioning = true;

      this._releaseFocus();
      this._element.classList.remove(CLASS_SHOW);

      const transitionComplete = () => {
        this._element.setAttribute("aria-hidden", "true");
        this._element.removeAttribute("aria-modal");
        this._element.removeAttribute("role");

        if (!this._config.scroll) {
          document.body.classList.remove(CLASS_OFFCANVAS_OPEN);
        }

        this._hideBackdrop();

        if (this._triggerElement) {
          this._triggerElement.focus();
          this._triggerElement = null;
        }

        this._isTransitioning = false;
        EventHandler.trigger(this._element, EVENT_HIDDEN);
      };

      Utils.executeAfterTransition(transitionComplete, this._element);
    }

    dispose() {
      this._hideBackdrop();
      this._releaseFocus();
      super.dispose();
    }

    // --- Private Methods ---

    _showBackdrop() {
      if (this._backdrop) return;

      this._backdrop = document.createElement("div");
      this._backdrop.className = "offcanvas-backdrop fade";
      document.body.appendChild(this._backdrop);

      Utils.reflow(this._backdrop);
      this._backdrop.classList.add(CLASS_SHOW);

      /* A static backdrop is still shown and still swallows the click — it just
         does not dismiss. Without the nudge nothing happens at all, which reads
         as a broken control rather than a deliberate one. */
      this._backdropClickHandler = () => {
        if (this._config.backdrop === "static") {
          this._triggerStaticAnimation();
          return;
        }
        this.hide();
      };
      this._backdrop.addEventListener("click", this._backdropClickHandler);
    }

    /**
     * Nudge the panel to say "not that way".
     *
     * The class is removed on animationend rather than on a timer, so the
     * duration lives in CSS alone and `prefers-reduced-motion` — which
     * collapses it — does not leave the class stuck for 300ms of nothing. The
     * timeout is a fallback for the case where the animation never runs.
     */
    _triggerStaticAnimation() {
      const el = this._element;
      if (el.classList.contains(CLASS_STATIC)) return;
      el.classList.add(CLASS_STATIC);

      const clear = () => {
        el.classList.remove(CLASS_STATIC);
        el.removeEventListener("animationend", clear);
      };
      el.addEventListener("animationend", clear);
      setTimeout(clear, 500);
    }

    _hideBackdrop() {
      if (!this._backdrop) return;

      const backdrop = this._backdrop;
      this._backdrop = null;

      if (this._backdropClickHandler) {
        backdrop.removeEventListener("click", this._backdropClickHandler);
        this._backdropClickHandler = null;
      }

      backdrop.classList.remove(CLASS_SHOW);
      Utils.executeAfterTransition(() => backdrop.remove(), backdrop);
    }

    _trapFocus() {
      this._element.focus();

      this._focusTrapHandler = (event) => {
        if (event.key !== "Tab") return;

        const focusable = SelectorEngine.focusableChildren(this._element);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      };

      this._element.addEventListener("keydown", this._focusTrapHandler);
    }

    _releaseFocus() {
      if (this._focusTrapHandler) {
        this._element.removeEventListener("keydown", this._focusTrapHandler);
        this._focusTrapHandler = null;
      }
    }
  }

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Offcanvas);

  // Export
  window.Nimbus.Offcanvas = Offcanvas;
})();
