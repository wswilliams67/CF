/**
 * ============================================================
 * CNDS Modal Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "modal";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_SHOW = "show";
  const CLASS_FADE = "fade";
  const CLASS_STATIC = "modal-static";
  const CLASS_MODAL_OPEN = "modal-open";

  const SELECTOR_DIALOG = ".modal-dialog";

  const Default = {
    backdrop: true,
    keyboard: true,
    focus: true,
    modalNonInvasive: false
  };

  const DefaultType = {
    backdrop: "boolean|string",
    keyboard: "boolean",
    focus: "boolean",
    modalNonInvasive: "boolean"
  };

  class Modal extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._dialog = SelectorEngine.findOne(SELECTOR_DIALOG, this._element);
      this._backdrop = null;
      this._isShown = false;
      this._isTransitioning = false;
      this._focusTrap = null;
      this._scrollbarWidth = 0;

      // Bound handlers for proper cleanup
      this._onModalClick = (event) => {
        if (
          event.target === this._element &&
          this._config.backdrop !== "static"
        ) {
          this.hide();
        } else if (
          event.target === this._element &&
          this._config.backdrop === "static"
        ) {
          this._triggerStaticAnimation();
        }
      };
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

      const isNonInvasive = this._config.modalNonInvasive;

      if (!isNonInvasive) {
        // Save scrollbar width and hide scrollbar
        this._scrollbarWidth =
          window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (this._scrollbarWidth > 0) {
          document.body.style.paddingRight = `${this._scrollbarWidth}px`;
        }

        // Show backdrop
        if (this._config.backdrop) {
          this._showBackdrop();
        }

        document.body.classList.add(CLASS_MODAL_OPEN);
      }

      this._element.style.display = "block";
      this._element.removeAttribute("aria-hidden");
      this._element.setAttribute("aria-modal", true);
      this._element.setAttribute("role", "dialog");
      this._element.scrollTop = 0;

      if (this._dialog) {
        this._dialog.scrollTop = 0;
      }

      // Add click-outside listener (not for non-invasive modals)
      if (!isNonInvasive) {
        this._element.addEventListener("click", this._onModalClick);
      }

      Utils.reflow(this._element);

      this._element.classList.add(CLASS_SHOW);

      const transitionComplete = () => {
        if (this._config.focus && !isNonInvasive) {
          this._trapFocus();
        }

        this._isTransitioning = false;
        EventHandler.trigger(this._element, EVENT_SHOWN, { relatedTarget });
      };

      if (this._element.classList.contains(CLASS_FADE)) {
        Utils.executeAfterTransition(transitionComplete, this._dialog);
      } else {
        transitionComplete();
      }
    }

    hide() {
      if (!this._isShown || this._isTransitioning) return;

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._isShown = false;
      this._isTransitioning = true;

      const isNonInvasive = this._config.modalNonInvasive;

      if (!isNonInvasive) {
        this._releaseFocus();
      }

      // Remove click-outside listener
      this._element.removeEventListener("click", this._onModalClick);

      this._element.classList.remove(CLASS_SHOW);

      const transitionComplete = () => {
        this._element.style.display = "none";
        this._element.setAttribute("aria-hidden", true);
        this._element.removeAttribute("aria-modal");
        this._element.removeAttribute("role");

        if (!isNonInvasive) {
          // Remove backdrop
          this._hideBackdrop();

          // Restore scrollbar
          document.body.classList.remove(CLASS_MODAL_OPEN);
          document.body.style.overflow = "";
          document.body.style.paddingRight = "";
        }

        this._isTransitioning = false;
        EventHandler.trigger(this._element, EVENT_HIDDEN);
      };

      if (this._element.classList.contains(CLASS_FADE)) {
        Utils.executeAfterTransition(transitionComplete, this._dialog);
      } else {
        transitionComplete();
      }
    }

    dispose() {
      this._element.removeEventListener("click", this._onModalClick);
      this._hideBackdrop();
      this._releaseFocus();
      super.dispose();
    }

    // --- Private Methods ---

    _showBackdrop() {
      if (this._backdrop) return;

      this._backdrop = document.createElement("div");
      this._backdrop.className = "modal-backdrop fade";
      document.body.appendChild(this._backdrop);

      Utils.reflow(this._backdrop);
      this._backdrop.classList.add(CLASS_SHOW);

      // Click on backdrop to close (unless static)
      if (this._config.backdrop !== "static") {
        this._backdropClickHandler = () => this.hide();
        this._backdrop.addEventListener("click", this._backdropClickHandler);
      }
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

      Utils.executeAfterTransition(() => {
        backdrop.remove();
      }, backdrop);
    }

    _trapFocus() {
      // Focus the modal element itself (tabindex="-1") rather than the
      // first focusable child so the close button doesn't show a focus ring.
      this._element.focus();

      const focusableElements = SelectorEngine.focusableChildren(this._element);

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

    _triggerStaticAnimation() {
      this._element.classList.add(CLASS_STATIC);
      setTimeout(() => {
        this._element.classList.remove(CLASS_STATIC);
      }, 300);
    }
  }

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Modal);

  // Export
  window.Nimbus.Modal = Modal;
})();
