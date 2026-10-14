/**
 * ============================================================
 * CNDS Collapse Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "collapse";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_SHOW = "show";
  const CLASS_COLLAPSE = "collapse";
  const CLASS_COLLAPSING = "collapsing";
  const CLASS_COLLAPSED = "collapsed";
  const CLASS_HORIZONTAL = "collapse-horizontal";

  const SELECTOR_DATA_TOGGLE = '[data-cnds-toggle="collapse"]';

  const Default = {
    parent: null,
    toggle: true
  };

  const DefaultType = {
    parent: "string|element|null",
    toggle: "boolean"
  };

  class Collapse extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._isTransitioning = false;
      this._triggerArray = SelectorEngine.find(
        `${SELECTOR_DATA_TOGGLE}[data-cnds-target="#${this._element.id}"],` +
          `${SELECTOR_DATA_TOGGLE}[href="#${this._element.id}"]`
      );

      if (this._config.parent) {
        this._parent = Utils.getElement(this._config.parent);
      }

      if (this._config.toggle) {
        // Don't auto-toggle on construction
      }
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

    toggle() {
      if (this._element.classList.contains(CLASS_SHOW)) {
        this.hide();
      } else {
        this.show();
      }
    }

    show() {
      if (
        this._isTransitioning ||
        this._element.classList.contains(CLASS_SHOW)
      ) {
        return;
      }

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      // Close siblings if parent accordion
      if (this._parent) {
        const openChildren = SelectorEngine.find(
          `.${CLASS_COLLAPSE}.${CLASS_SHOW}`,
          this._parent
        ).filter((el) => el !== this._element);

        for (const openChild of openChildren) {
          // Use getOrCreateInstance so panels that were open on page load
          // (and therefore never click-initialized) get a proper instance
          const config = {};
          const parentAttr = openChild.getAttribute("data-cnds-parent");
          if (parentAttr) config.parent = parentAttr;
          config.toggle = false;

          const instance = Collapse.getOrCreateInstance(openChild, config);
          if (instance) {
            instance.hide();
          }
        }
      }

      const dimension = this._getDimension();

      this._element.classList.remove(CLASS_COLLAPSE);
      this._element.classList.add(CLASS_COLLAPSING);
      this._element.style[dimension] = 0;

      this._addAriaAndCollapsedClass(true);
      this._isTransitioning = true;

      const scrollSize = `scroll${dimension[0].toUpperCase() + dimension.slice(1)}`;

      Utils.executeAfterTransition(() => {
        this._isTransitioning = false;
        this._element.classList.remove(CLASS_COLLAPSING);
        this._element.classList.add(CLASS_COLLAPSE, CLASS_SHOW);
        this._element.style[dimension] = "";
        EventHandler.trigger(this._element, EVENT_SHOWN);
      }, this._element);

      this._element.style[dimension] = `${this._element[scrollSize]}px`;
    }

    hide() {
      if (
        this._isTransitioning ||
        !this._element.classList.contains(CLASS_SHOW)
      ) {
        return;
      }

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      const dimension = this._getDimension();

      this._element.style[dimension] =
        `${this._element.getBoundingClientRect()[dimension]}px`;
      Utils.reflow(this._element);

      this._element.classList.add(CLASS_COLLAPSING);
      this._element.classList.remove(CLASS_COLLAPSE, CLASS_SHOW);

      this._addAriaAndCollapsedClass(false);
      this._isTransitioning = true;

      this._element.style[dimension] = "";

      Utils.executeAfterTransition(() => {
        this._isTransitioning = false;
        this._element.classList.remove(CLASS_COLLAPSING);
        this._element.classList.add(CLASS_COLLAPSE);
        EventHandler.trigger(this._element, EVENT_HIDDEN);
      }, this._element);
    }

    // --- Private Methods ---

    _getDimension() {
      return this._element.classList.contains(CLASS_HORIZONTAL)
        ? "width"
        : "height";
    }

    _addAriaAndCollapsedClass(isOpen) {
      for (const trigger of this._triggerArray) {
        trigger.classList.toggle(CLASS_COLLAPSED, !isOpen);
        trigger.setAttribute("aria-expanded", isOpen);
      }
    }
  }

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Collapse);

  // Export
  window.Nimbus.Collapse = Collapse;
})();
