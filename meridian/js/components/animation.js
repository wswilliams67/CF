/**
 * ============================================================
 * CNDS Animation Utility
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Programmatic animation control — trigger CSS animations via
 * JavaScript, listen for animation end, chain animations, and
 * integrate with the animations.css utility classes.
 *
 * Usage:
 *   Nimbus.Animation.animate(element, 'fadeInUp');
 *   Nimbus.Animation.animate(element, 'bounceIn', { duration: 800 });
 *   Nimbus.Animation.chain(element, ['fadeIn', 'pulse', 'fadeOut']);
 *
 * Data API:
 *   <div data-cnds-animate="fadeInUp" data-cnds-animate-trigger="click">
 *   <div data-cnds-animate="pulse" data-cnds-animate-trigger="scroll">
 * ============================================================
 */

(() => {
  "use strict";

  const { EventHandler, SelectorEngine } = window.Nimbus;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  const NAME = "animation";
  const EVENT_KEY = `.cnds.${NAME}`;
  const DATA_ATTR = "data-cnds-animate";
  const DATA_TRIGGER = "data-cnds-animate-trigger";
  const DATA_DELAY = "data-cnds-animate-delay";
  const DATA_DURATION = "data-cnds-animate-duration";
  const DATA_REPEAT = "data-cnds-animate-repeat";

  const ANIMATION_END_EVENTS = ["animationend", "webkitAnimationEnd"];

  const Default = {
    duration: null, // ms — null means use CSS default
    delay: 0, // ms
    repeat: 1, // number of times (Infinity for infinite)
    removeOnEnd: true // remove animation class when done
  };

  // -----------------------------------------------------------------------
  // Animation Utility
  // -----------------------------------------------------------------------
  const Animation = {
    /**
     * Animate an element with a named animation class.
     * @param {HTMLElement} element
     * @param {string} animationName - CSS class name (e.g., 'fadeInUp', 'animate-fadeInUp')
     * @param {Object} [options={}]
     * @returns {Promise<HTMLElement>} Resolves when animation completes
     */
    animate(element, animationName, options = {}) {
      return new Promise((resolve) => {
        const config = { ...Default, ...options };

        // Normalize class name — add prefix if not present
        const className = animationName.startsWith("animate-")
          ? animationName
          : `animate-${animationName}`;

        // Remove any existing animation classes first
        this._removeAnimationClasses(element);

        // Apply custom duration/delay via inline styles.
        // If no duration is specified, check whether the element already has
        // a CSS-provided duration (via [data-cnds-animate] or [data-cnds-animation]).
        // If not, fall back to 1000ms so the animation is visible.
        if (config.duration !== null) {
          element.style.animationDuration = `${config.duration}ms`;
        } else {
          const computed = window.getComputedStyle(element);
          const current = parseFloat(computed.animationDuration) || 0;
          if (current === 0) {
            element.style.animationDuration = "1000ms";
          }
        }
        if (config.delay > 0) {
          element.style.animationDelay = `${config.delay}ms`;
        }
        if (config.repeat === Infinity) {
          element.style.animationIterationCount = "infinite";
        } else if (config.repeat > 1) {
          element.style.animationIterationCount = String(config.repeat);
        }

        // Ensure element is visible
        element.style.animationFillMode = "both";

        // Listen for animation end
        const onEnd = () => {
          ANIMATION_END_EVENTS.forEach((evt) => {
            element.removeEventListener(evt, onEnd);
          });

          if (config.removeOnEnd) {
            element.classList.remove(className);
            // Clean up inline animation styles
            element.style.animationDuration = "";
            element.style.animationDelay = "";
            element.style.animationIterationCount = "";
            element.style.animationFillMode = "";
          }

          // Dispatch custom event
          EventHandler.trigger(element, `animationEnd${EVENT_KEY}`, {
            animationName
          });

          resolve(element);
        };

        ANIMATION_END_EVENTS.forEach((evt) => {
          element.addEventListener(evt, onEnd, { once: true });
        });

        // Trigger animation by adding class
        // Use requestAnimationFrame to ensure the class removal has taken effect
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.add(className);
          });
        });
      });
    },

    /**
     * Chain multiple animations on an element sequentially.
     * @param {HTMLElement} element
     * @param {Array<string|{name: string, options: Object}>} animations
     * @returns {Promise<HTMLElement>}
     */
    async chain(element, animations) {
      for (const anim of animations) {
        if (typeof anim === "string") {
          await this.animate(element, anim);
        } else {
          await this.animate(element, anim.name, anim.options || {});
        }
      }
      return element;
    },

    /**
     * Animate multiple elements with the same animation (staggered).
     * @param {HTMLElement[]|NodeList} elements
     * @param {string} animationName
     * @param {Object} [options={}]
     * @param {number} [staggerDelay=100] - Delay between each element in ms
     * @returns {Promise<HTMLElement[]>}
     */
    stagger(elements, animationName, options = {}, staggerDelay = 100) {
      const promises = Array.from(elements).map((el, index) => {
        const staggeredOptions = {
          ...options,
          delay: (options.delay || 0) + index * staggerDelay
        };
        return this.animate(el, animationName, staggeredOptions);
      });
      return Promise.all(promises);
    },

    /**
     * Stop all animations on an element.
     * @param {HTMLElement} element
     */
    stop(element) {
      this._removeAnimationClasses(element);
      element.style.animation = "none";
      // Force reflow
      void element.offsetHeight;
      element.style.animation = "";
      element.style.animationDuration = "";
      element.style.animationDelay = "";
      element.style.animationIterationCount = "";
      element.style.animationFillMode = "";

      EventHandler.trigger(element, `animationStop${EVENT_KEY}`);
    },

    /**
     * Toggle visibility with animation (show/hide).
     * @param {HTMLElement} element
     * @param {string} showAnimation - e.g., 'fadeIn'
     * @param {string} hideAnimation - e.g., 'fadeOut'
     * @param {Object} [options={}]
     * @returns {Promise<HTMLElement>}
     */
    async toggle(
      element,
      showAnimation = "fadeIn",
      hideAnimation = "fadeOut",
      options = {}
    ) {
      const isHidden =
        element.classList.contains("d-none") ||
        window.getComputedStyle(element).display === "none" ||
        element.hidden;

      if (isHidden) {
        element.classList.remove("d-none");
        element.hidden = false;
        element.style.display = "";
        return this.animate(element, showAnimation, options);
      } else {
        await this.animate(element, hideAnimation, options);
        element.classList.add("d-none");
        return element;
      }
    },

    /**
     * Animate element into view (show).
     * @param {HTMLElement} element
     * @param {string} [animationName='fadeIn']
     * @param {Object} [options={}]
     * @returns {Promise<HTMLElement>}
     */
    show(element, animationName = "fadeIn", options = {}) {
      element.classList.remove("d-none");
      element.hidden = false;
      element.style.display = "";
      return this.animate(element, animationName, options);
    },

    /**
     * Animate element out of view (hide).
     * @param {HTMLElement} element
     * @param {string} [animationName='fadeOut']
     * @param {Object} [options={}]
     * @returns {Promise<HTMLElement>}
     */
    async hide(element, animationName = "fadeOut", options = {}) {
      await this.animate(element, animationName, {
        ...options,
        removeOnEnd: false
      });
      element.classList.add("d-none");
      this._removeAnimationClasses(element);
      element.style.animationDuration = "";
      element.style.animationDelay = "";
      element.style.animationIterationCount = "";
      element.style.animationFillMode = "";
      return element;
    },

    // -----------------------------------------------------------------------
    // Scroll-triggered animations (IntersectionObserver)
    // -----------------------------------------------------------------------

    /**
     * Observe elements and animate them when they scroll into view.
     * @param {string} [selector='[data-cnds-animate-trigger="scroll"]']
     * @param {Object} [observerOptions={}]
     */
    observeScroll(selector, observerOptions = {}) {
      const sel = selector || `[${DATA_TRIGGER}="scroll"]`;
      const elements = SelectorEngine.find(sel);

      if (!elements.length || !("IntersectionObserver" in window)) return;

      const options = {
        root: observerOptions.root || null,
        rootMargin: observerOptions.rootMargin || "0px",
        threshold: observerOptions.threshold || 0.1
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const animName = el.getAttribute(DATA_ATTR);
            const delay = parseInt(el.getAttribute(DATA_DELAY), 10) || 0;
            const duration = el.getAttribute(DATA_DURATION);

            if (animName) {
              const animOptions = { delay };
              if (duration) {
                animOptions.duration = parseInt(duration, 10);
              }
              this.animate(el, animName, animOptions);
            }

            // Stop observing once animated
            observer.unobserve(el);
          }
        });
      }, options);

      elements.forEach((el) => observer.observe(el));

      return observer;
    },

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Remove all animate-* classes from an element.
     * @param {HTMLElement} element
     * @private
     */
    _removeAnimationClasses(element) {
      const classes = Array.from(element.classList).filter((cls) =>
        cls.startsWith("animate-")
      );
      classes.forEach((cls) => element.classList.remove(cls));
    },

    // -----------------------------------------------------------------------
    // Data API auto-init
    // -----------------------------------------------------------------------

    /**
     * Initialize click-triggered animations from data attributes.
     */
    init() {
      // Click triggers
      const clickElements = SelectorEngine.find(`[${DATA_TRIGGER}="click"]`);
      clickElements.forEach((el) => {
        EventHandler.on(el, `click${EVENT_KEY}`, () => {
          const animName = el.getAttribute(DATA_ATTR);
          const delay = parseInt(el.getAttribute(DATA_DELAY), 10) || 0;
          const duration = el.getAttribute(DATA_DURATION);
          const repeat = el.getAttribute(DATA_REPEAT);

          if (animName) {
            const options = { delay };
            if (duration) options.duration = parseInt(duration, 10);
            if (repeat)
              options.repeat =
                repeat === "infinite" ? Infinity : parseInt(repeat, 10);
            Animation.animate(el, animName, options);
          }
        });
      });

      // Hover triggers
      const hoverElements = SelectorEngine.find(`[${DATA_TRIGGER}="hover"]`);
      hoverElements.forEach((el) => {
        EventHandler.on(el, `mouseenter${EVENT_KEY}`, () => {
          const animName = el.getAttribute(DATA_ATTR);
          if (animName) {
            Animation.animate(el, animName);
          }
        });
      });

      // Scroll triggers
      this.observeScroll();

      // Auto-play (no trigger = play on load)
      const autoElements = SelectorEngine.find(
        `[${DATA_ATTR}]:not([${DATA_TRIGGER}])`
      );
      autoElements.forEach((el) => {
        // Skip elements that already have the animation class applied via CSS
        const animName = el.getAttribute(DATA_ATTR);
        if (animName && !el.classList.contains(`animate-${animName}`)) {
          const delay = parseInt(el.getAttribute(DATA_DELAY), 10) || 0;
          const duration = el.getAttribute(DATA_DURATION);
          const options = { delay };
          if (duration) options.duration = parseInt(duration, 10);
          Animation.animate(el, animName, options);
        }
      });
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Animation = Animation;
})();
