/**
 * CNDS Ripple Component
 * Material Design-inspired ripple effect on click
 *
 * Opt-in only — ripple is NOT applied to buttons by default.
 * Enable by adding the .ripple-surface class or data-cnds-ripple="true" attribute:
 *
 * Usage:
 *   <button class="btn btn-primary ripple-surface">Click me</button>
 *   <button class="btn btn-primary" data-cnds-ripple="true">Click me</button>
 *
 * Color variants:
 *   <div class="ripple-surface ripple-surface-primary" data-cnds-ripple="true">...</div>
 *
 * Options (data attributes):
 *   data-cnds-ripple-color="primary|secondary|success|danger|warning|info|light|dark"
 *   data-cnds-ripple-duration="500ms"
 *   data-cnds-ripple-radius="0"  (0 = auto-calculate)
 *   data-cnds-ripple-centered="false"
 *   data-cnds-ripple-unbound="false"
 */
(function () {
  "use strict";

  const Utils = window.Nimbus.Utils;
  const EventHandler = window.Nimbus.EventHandler;

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  const NAME = "ripple";
  const RIPPLE_SURFACE_CLASS = "ripple-surface";
  const RIPPLE_WAVE_CLASS = "ripple-wave";
  const RIPPLE_UNBOUND_CLASS = "ripple-surface-unbound";
  const INPUT_WRAPPER_CLASS = "input-wrapper";
  const RIPPLE_SELECTOR =
    '[data-cnds-ripple="true"], .ripple-surface, [data-cnds-ripple-init]';

  const NAMED_COLORS = [
    "primary",
    "secondary",
    "success",
    "danger",
    "warning",
    "info",
    "light",
    "dark"
  ];

  const DefaultConfig = {
    rippleCentered: false,
    rippleColor: "",
    rippleDuration: "500ms",
    rippleRadius: 0,
    rippleUnbound: false
  };

  // -----------------------------------------------------------------------
  // Instance storage (WeakMap since we don't extend NimbusComponent)
  // -----------------------------------------------------------------------
  const instances = new WeakMap();

  // -----------------------------------------------------------------------
  // Ripple Class
  // -----------------------------------------------------------------------
  class Ripple {
    constructor(element, config = {}) {
      this._element = element;
      this._options = this._getConfig(config);
      this._clickHandler = this._createRipple.bind(this);
      this._rippleTimer = null;
      this._isMinWidthSet = false;
      this._rippleInSpan = false;

      if (this._element) {
        this._element.classList.add(RIPPLE_SURFACE_CLASS);
      }

      this.init();
      instances.set(element, this);
    }

    // -- Static --
    static get NAME() {
      return NAME;
    }

    static getInstance(element) {
      return instances.get(element) || null;
    }

    static getOrCreateInstance(element, config = {}) {
      return instances.get(element) || new Ripple(element, config);
    }

    // -- Public API --
    init() {
      this._addClickEvent(this._element);
    }

    dispose() {
      EventHandler.off(this._element, "mousedown", this._clickHandler);
      // Remove any lingering ripple waves
      const waves = this._element.querySelectorAll(`.${RIPPLE_WAVE_CLASS}`);
      waves.forEach((w) => w.remove());
      instances.delete(this._element);
    }

    // -- Private --
    _addClickEvent(element) {
      EventHandler.on(element, "mousedown", this._clickHandler);
    }

    _getEventLayer(event) {
      return {
        layerX: Math.round(
          event.clientX - event.target.getBoundingClientRect().x
        ),
        layerY: Math.round(
          event.clientY - event.target.getBoundingClientRect().y
        )
      };
    }

    /**
     * Create and animate a ripple wave at the click coordinates.
     * Matches Nimbus 8 behavior: uses CSS transitions with .active class,
     * transitionDelay/transitionDuration, and corner-based diameter calculation.
     */
    _createRipple(event) {
      if (this._element === null) return;

      if (!this._element.classList.contains(RIPPLE_SURFACE_CLASS)) {
        this._element.classList.add(RIPPLE_SURFACE_CLASS);
      }

      const { layerX, layerY } = this._getEventLayer(event);
      const offsetX = layerX;
      const offsetY = layerY;
      const height = this._element.offsetHeight;
      const width = this._element.offsetWidth;
      const duration = this._durationToMsNumber(this._options.rippleDuration);

      const diameterOptions = {
        offsetX: this._options.rippleCentered ? height / 2 : offsetX,
        offsetY: this._options.rippleCentered ? width / 2 : offsetY,
        height: height,
        width: width
      };

      const diameter = this._getDiameter(diameterOptions);
      const radius = this._options.rippleRadius || diameter / 2;
      const delayDuration = 0.5 * duration;
      const fadeDuration = duration - 0.5 * duration;

      const styles = {
        left: this._options.rippleCentered
          ? width / 2 - radius + "px"
          : offsetX - radius + "px",
        top: this._options.rippleCentered
          ? height / 2 - radius + "px"
          : offsetY - radius + "px",
        height: `${2 * this._options.rippleRadius || diameter}px`,
        width: `${2 * this._options.rippleRadius || diameter}px`,
        transitionDelay: `0s, ${delayDuration}ms`,
        transitionDuration: `${duration}ms, ${fadeDuration}ms`
      };

      const wave = document.createElement("div");
      this._createHTMLRipple({
        wrapper: this._element,
        ripple: wave,
        styles: styles
      });
      this._removeHTMLRipple({ ripple: wave, duration: duration });
    }

    _createHTMLRipple({ wrapper, ripple, styles }) {
      // Apply positioning styles
      Object.keys(styles).forEach((key) => (ripple.style[key] = styles[key]));

      // Add the ripple-wave class (CSS handles the radial-gradient, transform, etc.)
      ripple.classList.add(RIPPLE_WAVE_CLASS);

      // Handle custom color
      if (this._options.rippleColor !== "") {
        this._removeOldColorClasses(wrapper);
        this._addColor(ripple, wrapper);
      }

      // Handle unbound option
      this._toggleUnbound(wrapper);

      // Append and activate
      this._appendRipple(ripple, wrapper);
    }

    _removeHTMLRipple({ ripple, duration }) {
      if (this._rippleTimer) {
        clearTimeout(this._rippleTimer);
        this._rippleTimer = null;
      }

      this._rippleTimer = setTimeout(() => {
        if (ripple) {
          ripple.remove();

          if (this._element) {
            // Remove all remaining ripple waves
            const remainingWaves = this._element.querySelectorAll(
              `.${RIPPLE_WAVE_CLASS}`
            );
            remainingWaves.forEach((w) => w.remove());

            // Reset min-width if we set it
            if (this._isMinWidthSet) {
              this._element.style.minWidth = "";
              this._isMinWidthSet = false;
            }

            // Handle input wrapper span removal
            if (
              this._rippleInSpan &&
              this._element.classList.contains(INPUT_WRAPPER_CLASS)
            ) {
              this._removeWrapperSpan();
            } else {
              this._element.classList.remove(RIPPLE_SURFACE_CLASS);
            }
          }
        }
      }, duration);
    }

    _removeWrapperSpan() {
      const child = this._element.firstChild;
      this._element.replaceWith(child);
      this._element = child;
      this._element.focus();
      this._rippleInSpan = false;
    }

    _durationToMsNumber(value) {
      return Number(String(value).replace("ms", "").replace("s", "000"));
    }

    _getConfig(config = {}) {
      const dataAttrs = this._getDataAttributes(this._element);
      return { ...DefaultConfig, ...dataAttrs, ...config };
    }

    _getDataAttributes(element) {
      const attrs = {};
      if (element.getAttribute("data-cnds-ripple-color")) {
        attrs.rippleColor = element.getAttribute("data-cnds-ripple-color");
      }
      if (element.getAttribute("data-cnds-ripple-duration")) {
        attrs.rippleDuration = element.getAttribute(
          "data-cnds-ripple-duration"
        );
      }
      if (element.getAttribute("data-cnds-ripple-radius")) {
        attrs.rippleRadius = parseInt(
          element.getAttribute("data-cnds-ripple-radius"),
          10
        );
      }
      if (element.hasAttribute("data-cnds-ripple-centered")) {
        attrs.rippleCentered =
          element.getAttribute("data-cnds-ripple-centered") !== "false";
      }
      if (element.hasAttribute("data-cnds-ripple-unbound")) {
        attrs.rippleUnbound =
          element.getAttribute("data-cnds-ripple-unbound") !== "false";
      }
      return attrs;
    }

    /**
     * Calculate the ripple diameter based on click position relative to
     * the farthest corner of the element (matches Nimbus 8 algorithm).
     */
    _getDiameter({ offsetX, offsetY, height, width }) {
      const topHalf = offsetY <= height / 2;
      const leftHalf = offsetX <= width / 2;

      const hypotenuse = (a, b) => Math.sqrt(a ** 2 + b ** 2);

      const isCentered = offsetY === height / 2 && offsetX === width / 2;
      const isTopRight = topHalf === true && leftHalf === false;
      const isTopLeft = topHalf === true && leftHalf === true;
      const isBottomLeft = topHalf === false && leftHalf === true;
      const isBottomRight = topHalf === false && leftHalf === false;

      const corners = {
        topLeft: hypotenuse(offsetX, offsetY),
        topRight: hypotenuse(width - offsetX, offsetY),
        bottomLeft: hypotenuse(offsetX, height - offsetY),
        bottomRight: hypotenuse(width - offsetX, height - offsetY)
      };

      let maxDistance = 0;

      if (isCentered || isBottomRight) {
        maxDistance = corners.topLeft;
      } else if (isBottomLeft) {
        maxDistance = corners.topRight;
      } else if (isTopLeft) {
        maxDistance = corners.bottomRight;
      } else if (isTopRight) {
        maxDistance = corners.bottomLeft;
      }

      return 2 * maxDistance;
    }

    _appendRipple(ripple, wrapper) {
      wrapper.appendChild(ripple);
      // Trigger the CSS transition by adding .active after a brief delay
      setTimeout(() => {
        ripple.classList.add("active");
      }, 50);
    }

    _toggleUnbound(wrapper) {
      if (this._options.rippleUnbound === true) {
        wrapper.classList.add(RIPPLE_UNBOUND_CLASS);
      } else {
        wrapper.classList.remove(RIPPLE_UNBOUND_CLASS);
      }
    }

    _addColor(ripple, wrapper) {
      const color = this._options.rippleColor.toLowerCase();

      if (NAMED_COLORS.find((c) => c === color)) {
        // Use CSS class for named colors
        wrapper.classList.add(`${RIPPLE_SURFACE_CLASS}-${color}`);
      } else {
        // Custom color: build radial-gradient inline
        const rgb = this._colorToRGB(this._options.rippleColor).join(",");
        const gradient =
          `rgba(${rgb}, 0.2) 0, rgba(${rgb}, 0.3) 40%, ` +
          `rgba(${rgb}, 0.4) 50%, rgba(${rgb}, 0.5) 60%, rgba(${rgb}, 0) 70%`;
        ripple.style.backgroundImage = `radial-gradient(circle, ${gradient})`;
      }
    }

    _removeOldColorClasses(wrapper) {
      const regex = new RegExp(`${RIPPLE_SURFACE_CLASS}-[a-z]+`, "gi");
      const matches = wrapper.classList.value.match(regex) || [];
      matches.forEach((cls) => {
        wrapper.classList.remove(cls);
      });
    }

    _colorToRGB(color) {
      const TRANSPARENT = [0, 0, 0];

      if (color.toLowerCase() === "transparent") {
        return TRANSPARENT;
      }

      // Hex color
      if (color[0] === "#") {
        let hex = color;
        if (hex.length < 7) {
          hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        }
        return [
          parseInt(hex.substr(1, 2), 16),
          parseInt(hex.substr(3, 2), 16),
          parseInt(hex.substr(5, 2), 16)
        ];
      }

      // Named color or other format — resolve via DOM
      if (color.indexOf("rgb") === -1) {
        const testEl = document.body.appendChild(
          document.createElement("fictum")
        );
        const sentinel = "rgb(1, 2, 3)";
        testEl.style.color = sentinel;
        if (testEl.style.color !== sentinel) {
          document.body.removeChild(testEl);
          return TRANSPARENT;
        }
        testEl.style.color = color;
        if (testEl.style.color === sentinel || testEl.style.color === "") {
          document.body.removeChild(testEl);
          return TRANSPARENT;
        }
        color = getComputedStyle(testEl).color;
        document.body.removeChild(testEl);
      }

      // Parse rgb(r, g, b) string
      if (color.indexOf("rgb") === 0) {
        const parts = color.match(/[.\d]+/g).map((n) => +Number(n));
        parts.length = 3;
        return parts;
      }

      return TRANSPARENT;
    }
  }

  // -----------------------------------------------------------------------
  // Global click delegation for ripple
  // -----------------------------------------------------------------------
  EventHandler.on(
    document,
    "mousedown.cnds.ripple",
    RIPPLE_SELECTOR,
    function (e) {
      const instance = Ripple.getOrCreateInstance(this);
      instance._createRipple(e);
    }
  );

  // -----------------------------------------------------------------------
  // Auto-init on DOMContentLoaded
  // -----------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(RIPPLE_SELECTOR).forEach((el) => {
      Ripple.getOrCreateInstance(el);
    });
  });

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Ripple = Ripple;
})();
