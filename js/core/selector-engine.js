/**
 * ============================================================
 * CNDS Selector Engine
 * Cloudficient Nimbus Design System v1.0.0
 *
 * DOM querying utilities with data-cnds-target support
 * ============================================================
 */

(() => {
  "use strict";

  const CNDS_PREFIX = "cnds";

  /**
   * Get the target selector from data-cnds-target or href
   * @param {HTMLElement} element
   * @returns {string|null}
   */
  function getSelectorFromElement(element) {
    let selector = element.getAttribute(`data-${CNDS_PREFIX}-target`);

    if (!selector || selector === "#") {
      let hrefAttribute = element.getAttribute("href");

      if (
        !hrefAttribute ||
        (!hrefAttribute.includes("#") && !hrefAttribute.startsWith("."))
      ) {
        return null;
      }

      // Strip everything before # if it's an anchor link
      if (hrefAttribute.includes("#") && !hrefAttribute.startsWith("#")) {
        hrefAttribute = `#${hrefAttribute.split("#")[1]}`;
      }

      selector =
        hrefAttribute && hrefAttribute !== "#" ? hrefAttribute.trim() : null;
    }

    // Try to parse the selector to validate it
    try {
      if (selector) {
        document.querySelector(selector);
      }
    } catch {
      return null;
    }

    return selector;
  }

  /**
   * Get the target element from data-cnds-target or href
   * @param {HTMLElement} element
   * @returns {HTMLElement|null}
   */
  function getElementFromSelector(element) {
    const selector = getSelectorFromElement(element);
    return selector ? document.querySelector(selector) : null;
  }

  /**
   * Get multiple target elements from data-cnds-target
   * @param {HTMLElement} element
   * @returns {HTMLElement[]}
   */
  function getMultipleElementsFromSelector(element) {
    const selector = getSelectorFromElement(element);
    return selector ? Array.from(document.querySelectorAll(selector)) : [];
  }

  const SelectorEngine = {
    /**
     * Find a single element
     * @param {string} selector
     * @param {HTMLElement} [element=document.documentElement]
     * @returns {HTMLElement|null}
     */
    findOne(selector, element = document.documentElement) {
      return element.querySelector(selector);
    },

    /**
     * Find all matching elements
     * @param {string} selector
     * @param {HTMLElement} [element=document.documentElement]
     * @returns {HTMLElement[]}
     */
    find(selector, element = document.documentElement) {
      return Array.from(element.querySelectorAll(selector));
    },

    /**
     * Find all children matching selector
     * @param {HTMLElement} element
     * @param {string} selector
     * @returns {HTMLElement[]}
     */
    children(element, selector) {
      return Array.from(element.children).filter((child) =>
        child.matches(selector)
      );
    },

    /**
     * Find all parents matching selector
     * @param {HTMLElement} element
     * @param {string} selector
     * @returns {HTMLElement[]}
     */
    parents(element, selector) {
      const parents = [];
      let ancestor = element.parentNode.closest(selector);

      while (ancestor) {
        parents.push(ancestor);
        ancestor = ancestor.parentNode.closest(selector);
      }

      return parents;
    },

    /**
     * Find the closest ancestor matching selector
     * @param {HTMLElement} element
     * @param {string} selector
     * @returns {HTMLElement|null}
     */
    closest(element, selector) {
      return element.closest(selector);
    },

    /**
     * Find the previous sibling matching selector
     * @param {HTMLElement} element
     * @param {string} selector
     * @returns {HTMLElement|null}
     */
    prev(element, selector) {
      let previous = element.previousElementSibling;
      while (previous) {
        if (previous.matches(selector)) return previous;
        previous = previous.previousElementSibling;
      }
      return null;
    },

    /**
     * Find the next sibling matching selector
     * @param {HTMLElement} element
     * @param {string} selector
     * @returns {HTMLElement|null}
     */
    next(element, selector) {
      let next = element.nextElementSibling;
      while (next) {
        if (next.matches(selector)) return next;
        next = next.nextElementSibling;
      }
      return null;
    },

    /**
     * Get focusable children of an element
     * @param {HTMLElement} element
     * @returns {HTMLElement[]}
     */
    focusableChildren(element) {
      const focusables = [
        "a[href]",
        'button:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]'
      ];

      return this.find(focusables.join(", "), element).filter(
        (el) =>
          !el.classList.contains("disabled") &&
          window.Nimbus.Utils.isVisible(el)
      );
    },

    /**
     * Get the selector from an element's data-cnds-target or href
     */
    getSelectorFromElement,

    /**
     * Get the target element from data-cnds-target or href
     */
    getElementFromSelector,

    /**
     * Get multiple target elements
     */
    getMultipleElementsFromSelector
  };

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.SelectorEngine = SelectorEngine;
})();
