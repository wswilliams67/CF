/**
 * ============================================================
 * CNDS Clipboard Utility
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Copy text to the clipboard using the modern Clipboard API
 * with a fallback for older browsers. Supports copying from
 * input fields, text content, or arbitrary strings.
 *
 * Usage:
 *   Nimbus.Clipboard.copy('Hello World');
 *   Nimbus.Clipboard.copyFromElement(document.querySelector('#myInput'));
 *
 * Data API:
 *   <button data-cnds-clipboard-target="#myInput">Copy</button>
 *   <button data-cnds-clipboard-text="Static text to copy">Copy</button>
 * ============================================================
 */

(() => {
  "use strict";

  const { EventHandler, SelectorEngine } = window.Nimbus;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  const NAME = "clipboard";
  const EVENT_KEY = `.cnds.${NAME}`;
  const DATA_TARGET = "data-cnds-clipboard-target";
  const DATA_TEXT = "data-cnds-clipboard-text";
  const DATA_FEEDBACK = "data-cnds-clipboard-feedback";
  const DATA_FEEDBACK_DURATION = "data-cnds-clipboard-feedback-duration";

  const DEFAULT_FEEDBACK_DURATION = 2000; // ms

  // -----------------------------------------------------------------------
  // Clipboard Utility
  // -----------------------------------------------------------------------
  const Clipboard = {
    /**
     * Copy a string to the clipboard.
     * @param {string} text - The text to copy
     * @returns {Promise<boolean>} - Resolves true on success, false on failure
     */
    async copy(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        // Fallback for older browsers
        return this._fallbackCopy(text);
      } catch (err) {
        console.warn("[CNDS Clipboard] Copy failed:", err);
        return this._fallbackCopy(text);
      }
    },

    /**
     * Copy text content from a DOM element.
     * For input/textarea elements, copies the value.
     * For other elements, copies the textContent.
     * @param {HTMLElement} element
     * @returns {Promise<boolean>}
     */
    async copyFromElement(element) {
      if (!element) return false;

      let text;
      const tagName = element.tagName.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select"
      ) {
        text = element.value;
      } else if (element.hasAttribute("contenteditable")) {
        text = element.textContent;
      } else {
        text = element.textContent;
      }

      const success = await this.copy(text);

      if (success) {
        EventHandler.trigger(element, `copied${EVENT_KEY}`, { text });
      } else {
        EventHandler.trigger(element, `error${EVENT_KEY}`, { text });
      }

      return success;
    },

    /**
     * Copy the inner HTML of an element.
     * @param {HTMLElement} element
     * @returns {Promise<boolean>}
     */
    async copyHTML(element) {
      if (!element) return false;
      return this.copy(element.innerHTML);
    },

    /**
     * Select all text in an input/textarea element.
     * @param {HTMLElement} element
     */
    select(element) {
      if (!element) return;
      const tagName = element.tagName.toLowerCase();

      if (tagName === "input" || tagName === "textarea") {
        element.select();
        element.setSelectionRange(0, element.value.length);
      } else {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    },

    // -----------------------------------------------------------------------
    // Visual feedback helpers
    // -----------------------------------------------------------------------

    /**
     * Show visual feedback on a trigger button after copy.
     * @param {HTMLElement} triggerElement - The button that was clicked
     * @param {boolean} success - Whether the copy succeeded
     * @param {Object} [options={}]
     */
    showFeedback(triggerElement, success, options = {}) {
      const feedbackText =
        options.feedbackText ||
        triggerElement.getAttribute(DATA_FEEDBACK) ||
        (success ? "Copied!" : "Failed");
      const duration =
        options.duration ||
        parseInt(triggerElement.getAttribute(DATA_FEEDBACK_DURATION), 10) ||
        DEFAULT_FEEDBACK_DURATION;

      // Store original content
      const originalHTML = triggerElement.innerHTML;
      const originalTitle = triggerElement.getAttribute("title");

      // Apply feedback
      triggerElement.innerHTML = feedbackText;
      triggerElement.setAttribute("title", feedbackText);

      if (success) {
        triggerElement.classList.add("clipboard-copied");
      } else {
        triggerElement.classList.add("clipboard-error");
      }

      // Restore after duration
      setTimeout(() => {
        triggerElement.innerHTML = originalHTML;
        if (originalTitle) {
          triggerElement.setAttribute("title", originalTitle);
        } else {
          triggerElement.removeAttribute("title");
        }
        triggerElement.classList.remove("clipboard-copied", "clipboard-error");
      }, duration);
    },

    // -----------------------------------------------------------------------
    // Fallback copy method
    // -----------------------------------------------------------------------

    /**
     * Fallback copy using execCommand for older browsers.
     * @param {string} text
     * @returns {boolean}
     * @private
     */
    _fallbackCopy(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;

      // Prevent scrolling
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      let success = false;
      try {
        success = document.execCommand("copy");
      } catch (err) {
        console.warn("[CNDS Clipboard] execCommand fallback failed:", err);
      }

      document.body.removeChild(textarea);
      return success;
    },

    // -----------------------------------------------------------------------
    // Data API auto-init
    // -----------------------------------------------------------------------

    /**
     * Initialize clipboard triggers from data attributes.
     */
    init() {
      // Target-based copy: data-cnds-clipboard-target="#selector"
      const targetTriggers = SelectorEngine.find(`[${DATA_TARGET}]`);
      targetTriggers.forEach((trigger) => {
        EventHandler.on(trigger, `click${EVENT_KEY}`, async (e) => {
          e.preventDefault();
          const targetSelector = trigger.getAttribute(DATA_TARGET);
          const targetEl = SelectorEngine.findOne(targetSelector);

          if (targetEl) {
            const success = await Clipboard.copyFromElement(targetEl);
            Clipboard.showFeedback(trigger, success);

            EventHandler.trigger(trigger, `copy${EVENT_KEY}`, {
              success,
              source: targetEl
            });
          }
        });
      });

      // Text-based copy: data-cnds-clipboard-text="some text"
      const textTriggers = SelectorEngine.find(`[${DATA_TEXT}]`);
      textTriggers.forEach((trigger) => {
        EventHandler.on(trigger, `click${EVENT_KEY}`, async (e) => {
          e.preventDefault();
          const text = trigger.getAttribute(DATA_TEXT);
          const success = await Clipboard.copy(text);
          Clipboard.showFeedback(trigger, success);

          EventHandler.trigger(trigger, `copy${EVENT_KEY}`, {
            success,
            text
          });
        });
      });
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Clipboard = Clipboard;
})();
