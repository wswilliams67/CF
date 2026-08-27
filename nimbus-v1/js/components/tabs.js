/**
 * ============================================================
 * CNDS Tabs Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "tab";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_ACTIVE = "active";
  const CLASS_FADE = "fade";
  const CLASS_SHOW = "show";

  const SELECTOR_DATA_TOGGLE =
    '[data-cnds-toggle="tab"], [data-cnds-toggle="pill"], [data-cnds-toggle="list"], [data-cnds-tab-init]';

  class Tab extends NimbusComponent {
    constructor(element) {
      super(element);
      this._parent = this._element.closest(
        ".nav, .list-group, .nav-tabs, .nav-pills"
      );
    }

    static get NAME() {
      return NAME;
    }

    // --- Public Methods ---

    toggle() {
      this.show();
    }

    show() {
      if (this._element.classList.contains(CLASS_ACTIVE)) return;

      const target = SelectorEngine.getElementFromSelector(this._element);
      if (!target) return;

      // Find currently active tab
      const activeTab = this._getActiveTab();
      const activePane = activeTab
        ? SelectorEngine.getElementFromSelector(activeTab)
        : null;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW, {
        relatedTarget: activeTab
      });
      if (showEvent.defaultPrevented) return;

      if (activeTab) {
        const hideEvent = EventHandler.trigger(activeTab, EVENT_HIDE, {
          relatedTarget: this._element
        });
        if (hideEvent.defaultPrevented) return;
      }

      // Deactivate current
      if (activeTab) {
        activeTab.classList.remove(CLASS_ACTIVE);
        activeTab.setAttribute("aria-selected", "false");
        activeTab.setAttribute("tabindex", "-1");
      }
      if (activePane) {
        activePane.classList.remove(CLASS_SHOW, CLASS_ACTIVE);
      }

      // Activate new
      this._element.classList.add(CLASS_ACTIVE);
      this._element.setAttribute("aria-selected", "true");
      this._element.removeAttribute("tabindex");

      target.classList.add(CLASS_ACTIVE);
      if (target.classList.contains(CLASS_FADE)) {
        Utils.reflow(target);
        target.classList.add(CLASS_SHOW);
      }

      // Trigger events
      if (activeTab) {
        EventHandler.trigger(activeTab, EVENT_HIDDEN, {
          relatedTarget: this._element
        });
      }
      EventHandler.trigger(this._element, EVENT_SHOWN, {
        relatedTarget: activeTab
      });
    }

    // --- Private Methods ---

    _getActiveTab() {
      if (!this._parent) return null;
      return SelectorEngine.findOne(
        `.${CLASS_ACTIVE}:not(.dropdown-item)`,
        this._parent
      );
    }
  }

  // Click delegation for tab triggers
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(SELECTOR_DATA_TOGGLE);
    if (!trigger) return;

    event.preventDefault();
    const instance = Tab.getOrCreateInstance(trigger);
    instance.show();
  });

  // Keyboard navigation
  document.addEventListener("keydown", (event) => {
    const trigger = event.target.closest(SELECTOR_DATA_TOGGLE);
    if (!trigger) return;

    const parent = trigger.closest(".nav, .list-group");
    if (!parent) return;

    const tabs = SelectorEngine.find(SELECTOR_DATA_TOGGLE, parent);
    const index = tabs.indexOf(trigger);

    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = index + 1 >= tabs.length ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = index - 1 < 0 ? tabs.length - 1 : index - 1;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== undefined) {
      tabs[nextIndex].focus();
      const instance = Tab.getOrCreateInstance(tabs[nextIndex]);
      instance.show();
    }
  });

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Tab);

  // Export
  window.Nimbus.Tab = Tab;
})();
