/**
 * ============================================================
 * CNDS Popconfirm Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler } = window.Nimbus;

  const NAME = "popconfirm";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_CONFIRM = `confirm${EVENT_KEY}`;
  const EVENT_CANCEL = `cancel${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;

  const Default = {
    message: "Are you sure?",
    okText: "OK",
    cancelText: "Cancel",
    okClass: "btn btn-primary btn-sm",
    cancelClass: "btn btn-secondary btn-sm",
    popconfirmIcon: "",
    popconfirmMode: "inline",
    position: "bottom",
    backdrop: true
  };

  const DefaultType = {
    message: "string",
    okText: "string",
    cancelText: "string",
    okClass: "string",
    cancelClass: "string",
    popconfirmIcon: "string",
    popconfirmMode: "string",
    position: "string",
    backdrop: "boolean"
  };

  class Popconfirm extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._popconfirmEl = null;
      this._backdropEl = null;
      this._isShown = false;
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

    // --- Public API ---

    show() {
      if (this._isShown) return;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      this._isShown = true;
      this._createPopconfirm();
    }

    hide() {
      if (!this._isShown) return;

      EventHandler.trigger(this._element, EVENT_HIDE);

      this._isShown = false;

      if (this._popconfirmEl) {
        this._popconfirmEl.classList.remove("show");
        setTimeout(() => {
          if (this._popconfirmEl && this._popconfirmEl.parentNode) {
            this._popconfirmEl.parentNode.removeChild(this._popconfirmEl);
          }
          this._popconfirmEl = null;
        }, 200);
      }

      if (this._backdropEl) {
        this._backdropEl.remove();
        this._backdropEl = null;
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
      this.hide();
      EventHandler.off(this._element, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _createPopconfirm() {
      this._popconfirmEl = document.createElement("div");
      this._popconfirmEl.className = "popconfirm";

      const isModal = this._config.popconfirmMode === "modal";
      if (isModal) {
        this._popconfirmEl.classList.add("popconfirm-mode-modal");
      }

      this._popconfirmEl.setAttribute("data-cnds-placement", this._config.position);

      // Message
      const message = document.createElement("div");
      message.className = "popconfirm-message";
      if (this._config.popconfirmIcon) {
        message.innerHTML = `<i class="${this._config.popconfirmIcon}" aria-hidden="true"></i> ${this._config.message}`;
      } else {
        message.textContent = this._config.message;
      }

      // Actions
      const actions = document.createElement("div");
      actions.className = "popconfirm-actions";

      if (this._config.cancelText) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = this._config.cancelClass;
        cancelBtn.textContent = this._config.cancelText;
        EventHandler.on(cancelBtn, "click", () => {
          EventHandler.trigger(this._element, EVENT_CANCEL);
          this.hide();
        });
        actions.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = this._config.okClass;
      confirmBtn.textContent = this._config.okText;
      EventHandler.on(confirmBtn, "click", () => {
        EventHandler.trigger(this._element, EVENT_CONFIRM);
        this.hide();
      });
      actions.appendChild(confirmBtn);

      this._popconfirmEl.appendChild(message);
      this._popconfirmEl.appendChild(actions);

      document.body.appendChild(this._popconfirmEl);

      // Backdrop
      if (this._config.backdrop) {
        this._backdropEl = document.createElement("div");
        this._backdropEl.className = isModal
          ? "popconfirm-backdrop popconfirm-backdrop-modal"
          : "popconfirm-backdrop";
        EventHandler.on(this._backdropEl, "click", () => this.hide());
        document.body.appendChild(this._backdropEl);
      }

      // Add show first (display:block), then position so getBoundingClientRect returns real dimensions.
      // Both happen before the browser paints, so the element appears at the correct position.
      requestAnimationFrame(() => {
        if (!this._popconfirmEl) return;
        this._popconfirmEl.classList.add("show");
        if (!isModal) {
          this._position();
        }
      });
    }

    _position() {
      if (!this._popconfirmEl) return;

      const triggerRect = this._element.getBoundingClientRect();
      const popRect = this._popconfirmEl.getBoundingClientRect();
      const scrollTop = window.pageYOffset;
      const scrollLeft = window.pageXOffset;
      const pos = this._config.position;

      let top, left;

      if (pos === "top" || pos === "top left" || pos === "top right") {
        top = triggerRect.top + scrollTop - popRect.height - 8;
        if (pos === "top left") {
          left = triggerRect.left + scrollLeft;
        } else if (pos === "top right") {
          left = triggerRect.right + scrollLeft - popRect.width;
        } else {
          left = triggerRect.left + scrollLeft + triggerRect.width / 2 - popRect.width / 2;
        }
      } else if (pos === "bottom" || pos === "bottom left" || pos === "bottom right") {
        top = triggerRect.bottom + scrollTop + 8;
        if (pos === "bottom left") {
          left = triggerRect.left + scrollLeft;
        } else if (pos === "bottom right") {
          left = triggerRect.right + scrollLeft - popRect.width;
        } else {
          left = triggerRect.left + scrollLeft + triggerRect.width / 2 - popRect.width / 2;
        }
      } else if (pos === "left" || pos === "left top" || pos === "left bottom") {
        left = triggerRect.left + scrollLeft - popRect.width - 8;
        if (pos === "left top") {
          top = triggerRect.top + scrollTop;
        } else if (pos === "left bottom") {
          top = triggerRect.bottom + scrollTop - popRect.height;
        } else {
          top = triggerRect.top + scrollTop + triggerRect.height / 2 - popRect.height / 2;
        }
      } else if (pos === "right" || pos === "right top" || pos === "right bottom") {
        left = triggerRect.right + scrollLeft + 8;
        if (pos === "right top") {
          top = triggerRect.top + scrollTop;
        } else if (pos === "right bottom") {
          top = triggerRect.bottom + scrollTop - popRect.height;
        } else {
          top = triggerRect.top + scrollTop + triggerRect.height / 2 - popRect.height / 2;
        }
      } else {
        // default to bottom-centered
        top = triggerRect.bottom + scrollTop + 8;
        left = triggerRect.left + scrollLeft + triggerRect.width / 2 - popRect.width / 2;
      }

      this._popconfirmEl.style.top = `${top}px`;
      this._popconfirmEl.style.left = `${left}px`;
    }

    static jQueryInterface(config) {
      return this.each(function () {
        const data = Popconfirm.getOrCreateInstance(this, config);
        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config]();
        }
      });
    }
  }

  // Register with Data API (click-triggered via data-cnds-toggle="popconfirm")
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Popconfirm);
  }

  // Export
  window.Nimbus.Popconfirm = Popconfirm;
})();
