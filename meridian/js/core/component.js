/**
 * ============================================================
 * CNDS Base Component
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Base class for all interactive CNDS components.
 * Provides config merging, instance storage, and lifecycle.
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler } = window.Nimbus;

  // Instance storage: WeakMap keyed by element, value is Map of componentName -> instance
  const instanceMap = new WeakMap();

  function getInstanceMap(element) {
    if (!instanceMap.has(element)) {
      instanceMap.set(element, new Map());
    }
    return instanceMap.get(element);
  }

  /**
   * NimbusComponent - Base class for all CNDS components
   */
  class NimbusComponent {
    /**
     * @param {HTMLElement} element - The DOM element
     * @param {Object} [config={}] - User configuration
     */
    constructor(element, config = {}) {
      element = Utils.getElement(element);

      if (!element) {
        throw new Error(`${this.constructor.NAME}: element is not valid.`);
      }

      this._element = element;
      this._config = this._getConfig(config);

      // Store instance
      const map = getInstanceMap(element);
      map.set(this.constructor.NAME, this);
    }

    // --- Static Properties ---

    /** @returns {Object} Default configuration */
    static get Default() {
      return {};
    }

    /** @returns {Object} Default type checking schema */
    static get DefaultType() {
      return {};
    }

    /** @returns {string} Component name */
    static get NAME() {
      throw new Error("Components must override static get NAME()");
    }

    /** @returns {string} Event namespace */
    static get EVENT_KEY() {
      return `.cnds.${this.NAME}`;
    }

    /** @returns {string} Data API attribute */
    static get DATA_KEY() {
      return `cnds.${this.NAME}`;
    }

    // --- Instance Methods ---

    /**
     * Dispose of the component, cleaning up events and references
     */
    dispose() {
      // Remove all namespaced events
      EventHandler.off(this._element, this.constructor.EVENT_KEY);

      // Remove instance from storage
      const map = getInstanceMap(this._element);
      map.delete(this.constructor.NAME);

      // Null out properties
      for (const propertyName of Object.getOwnPropertyNames(this)) {
        this[propertyName] = null;
      }
    }

    /**
     * Build the config by merging defaults, data attributes, and user config
     * @param {Object} config
     * @returns {Object}
     * @protected
     */
    _getConfig(config) {
      const dataAttributes = Utils.getDataAttributes(this._element);
      const merged = Utils.mergeConfig(
        this.constructor.Default,
        dataAttributes,
        config
      );

      // Type check if DefaultType is defined
      if (Object.keys(this.constructor.DefaultType).length > 0) {
        Utils.typeCheckConfig(
          this.constructor.NAME,
          merged,
          this.constructor.DefaultType
        );
      }

      return merged;
    }

    /**
     * Trigger a component event
     * @param {string} eventName - Short event name (e.g., 'show', 'hide')
     * @param {Object} [detail={}]
     * @returns {CustomEvent}
     * @protected
     */
    _triggerEvent(eventName, detail = {}) {
      return EventHandler.trigger(
        this._element,
        `${eventName}${this.constructor.EVENT_KEY}`,
        detail
      );
    }

    // --- Static Methods ---

    /**
     * Get an existing instance for an element
     * @param {HTMLElement} element
     * @returns {NimbusComponent|null}
     */
    static getInstance(element) {
      if (!element) return null;
      const map = instanceMap.get(element);
      return map ? map.get(this.NAME) || null : null;
    }

    /**
     * Get or create an instance for an element
     * @param {HTMLElement} element
     * @param {Object} [config={}]
     * @returns {NimbusComponent}
     */
    static getOrCreateInstance(element, config = {}) {
      return this.getInstance(element) || new this(element, config);
    }
  }

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.NimbusComponent = NimbusComponent;
})();
