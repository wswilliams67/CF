/**
 * ============================================================
 * CNDS Utility Functions
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

const CNDS_PREFIX = "cnds";
const MILLISECONDS_MULTIPLIER = 1000;
const TRANSITION_END = "transitionend";

/**
 * Convert a string to camelCase
 * @param {string} str
 * @returns {string}
 */
function toKebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Convert a kebab-case string to camelCase
 * @param {string} str
 * @returns {string}
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Get the transition duration from an element in milliseconds
 * @param {HTMLElement} element
 * @returns {number}
 */
function getTransitionDuration(element) {
  if (!element) return 0;

  let { transitionDuration, transitionDelay } =
    window.getComputedStyle(element);

  const floatTransitionDuration = Number.parseFloat(transitionDuration);
  const floatTransitionDelay = Number.parseFloat(transitionDelay);

  if (!floatTransitionDuration && !floatTransitionDelay) {
    return 0;
  }

  // If multiple durations, take the first
  transitionDuration = transitionDuration.split(",")[0];
  transitionDelay = transitionDelay.split(",")[0];

  return (
    (Number.parseFloat(transitionDuration) +
      Number.parseFloat(transitionDelay)) *
    MILLISECONDS_MULTIPLIER
  );
}

/**
 * Execute callback after transition ends on element
 * @param {Function} callback
 * @param {HTMLElement} transitionElement
 * @param {boolean} [waitForTransition=true]
 */
function executeAfterTransition(
  callback,
  transitionElement,
  waitForTransition = true
) {
  if (!waitForTransition) {
    callback();
    return;
  }

  const duration = getTransitionDuration(transitionElement) + 5;
  let called = false;

  const handler = ({ target }) => {
    if (target !== transitionElement) return;
    called = true;
    transitionElement.removeEventListener(TRANSITION_END, handler);
    callback();
  };

  transitionElement.addEventListener(TRANSITION_END, handler);

  setTimeout(() => {
    if (!called) {
      transitionElement.dispatchEvent(new Event(TRANSITION_END));
    }
  }, duration);
}

/**
 * Get data-cnds-* attributes from an element as an object
 * @param {HTMLElement} element
 * @returns {Object}
 */
function getDataAttributes(element) {
  if (!element) return {};

  const attributes = {};
  const prefix = `data-${CNDS_PREFIX}-`;

  for (const attr of element.attributes) {
    if (attr.name.startsWith(prefix)) {
      let key = attr.name.slice(prefix.length);
      key = toCamelCase(key);

      // Auto-convert types
      let value = attr.value;
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (value === "null") value = null;
      else if (value === "" || value === "undefined") value = undefined;
      else if (!isNaN(Number(value)) && value !== "") value = Number(value);
      else if (value.startsWith("[") || value.startsWith("{")) {
        try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
      }

      attributes[key] = value;
    }
  }

  return attributes;
}

/**
 * Set a data-cnds-* attribute on an element
 * @param {HTMLElement} element
 * @param {string} key - camelCase key (will be converted to kebab-case)
 * @param {*} value
 */
function setDataAttribute(element, key, value) {
  element.setAttribute(`data-${CNDS_PREFIX}-${toKebabCase(key)}`, value);
}

/**
 * Remove a data-cnds-* attribute from an element
 * @param {HTMLElement} element
 * @param {string} key - camelCase key
 */
function removeDataAttribute(element, key) {
  element.removeAttribute(`data-${CNDS_PREFIX}-${toKebabCase(key)}`);
}

/**
 * Type check a config object against a schema
 * @param {string} componentName
 * @param {Object} config
 * @param {Object} configTypes - { key: 'string|number|boolean|element|function' }
 */
function typeCheckConfig(componentName, config, configTypes) {
  for (const [property, expectedTypes] of Object.entries(configTypes)) {
    const value = config[property];
    const valueType = typeof value;

    // Strip parentheses and split on pipe, e.g. "(array|string)" → ["array", "string"]
    const cleaned = expectedTypes.replace(/[()]/g, "");
    const types = cleaned.split("|").map((t) => t.trim());

    let isValid = false;
    for (const type of types) {
      if (type === "element") {
        isValid = value instanceof HTMLElement || value === null;
      } else if (type === "function") {
        isValid = typeof value === "function";
      } else if (type === "array") {
        isValid = Array.isArray(value);
      } else if (type === "object") {
        isValid = typeof value === "object" && value !== null;
      } else if (type === "null") {
        isValid = value === null || value === undefined;
      } else {
        isValid = typeof value === type;
      }
      if (isValid) break;
    }

    if (!isValid) {
      throw new TypeError(
        `CNDS: Option "${property}" provided type "${valueType}" but expected type "${expectedTypes}" for ${componentName}.`
      );
    }
  }
}

/**
 * Check if an element is visible (not display:none, not hidden)
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isVisible(element) {
  if (!element || !element.getClientRects().length) return false;

  const style = getComputedStyle(element);
  return (
    style.getPropertyValue("visibility") !== "hidden" &&
    style.getPropertyValue("display") !== "none"
  );
}

/**
 * Check if an element is disabled
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isDisabled(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;

  if (typeof element.disabled !== "undefined") {
    return element.disabled;
  }

  return (
    element.hasAttribute("disabled") &&
    element.getAttribute("disabled") !== "false"
  );
}

/**
 * Check if element matches a selector
 * @param {HTMLElement} element
 * @param {string} selector
 * @returns {boolean}
 */
function isElement(obj) {
  if (!obj || typeof obj !== "object") return false;
  return typeof obj.nodeType !== "undefined";
}

/**
 * Get an element from a selector string or element
 * @param {string|HTMLElement} obj
 * @returns {HTMLElement|null}
 */
function getElement(obj) {
  if (isElement(obj)) return obj;
  if (typeof obj === "string" && obj.length > 0) {
    return document.querySelector(obj);
  }
  return null;
}

/**
 * Reflow an element (force browser to recalculate layout)
 * @param {HTMLElement} element
 */
function reflow(element) {
  element.offsetHeight; // eslint-disable-line no-unused-expressions
}

/**
 * Generate a unique ID
 * @param {string} [prefix='cnds']
 * @returns {string}
 */
let uidCounter = 0;
function getUID(prefix = "cnds") {
  do {
    uidCounter++;
  } while (document.getElementById(`${prefix}-${uidCounter}`));
  return `${prefix}-${uidCounter}`;
}

/**
 * Merge default config with user config and data attributes
 * @param {Object} defaults
 * @param {Object} dataAttrs
 * @param {Object} userConfig
 * @returns {Object}
 */
function mergeConfig(defaults, dataAttrs, userConfig) {
  return {
    ...defaults,
    ...dataAttrs,
    ...(typeof userConfig === "object" ? userConfig : {})
  };
}

/**
 * Noop function
 */
function noop() {}

/**
 * Trigger a custom event on an element
 * @param {HTMLElement} element
 * @param {string} eventName
 * @param {Object} [detail={}]
 * @returns {CustomEvent}
 */
function triggerEvent(element, eventName, detail = {}) {
  const event = new CustomEvent(eventName, {
    bubbles: true,
    cancelable: true,
    detail
  });
  element.dispatchEvent(event);
  return event;
}

// Export to global namespace
window.Nimbus = window.Nimbus || {};
window.Nimbus.Utils = {
  CNDS_PREFIX,
  TRANSITION_END,
  toKebabCase,
  toCamelCase,
  getTransitionDuration,
  executeAfterTransition,
  getDataAttributes,
  setDataAttribute,
  removeDataAttribute,
  typeCheckConfig,
  isVisible,
  isDisabled,
  isElement,
  getElement,
  reflow,
  getUID,
  mergeConfig,
  noop,
  triggerEvent
};
