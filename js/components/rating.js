/**
 * ============================================================
 * CNDS Rating Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine } = window.Nimbus;

  const NAME = "rating";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_CHANGE = `scoreSelect${EVENT_KEY}`;
  const EVENT_HOVER = `scoreHover${EVENT_KEY}`;

  // Matches FA prefix + icon name, ignoring size/color utility classes
  const FA_ICON = /\b(fa[rsltb]?)\s+(fa-[\w-]+)\b/;

  const Default = {
    stars: 5,
    value: 0,
    readonly: false,
    half: false,
    icon: "fas fa-star",
    iconEmpty: "far fa-star",
    dynamic: false
  };

  const DefaultType = {
    stars: "number",
    value: "number",
    readonly: "boolean",
    half: "boolean",
    icon: "string",
    iconEmpty: "string",
    dynamic: "boolean"
  };

  class Rating extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._value = this._config.value;
      this._hoverValue = 0;

      this._init();
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

    getValue() {
      return this._value;
    }

    setValue(value) {
      if (this._config.readonly) return;

      value = Math.max(0, Math.min(this._config.stars, value));
      this._value = value;
      this._render();

      EventHandler.trigger(this._element, EVENT_CHANGE, { value });
    }

    dispose() {
      EventHandler.off(this._element, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._element.classList.add("rating");

      if (this._config.readonly) {
        this._element.setAttribute("data-cnds-readonly", "");
        // Section 508: readonly widget is a static image — role="img" with a text description
        this._element.setAttribute("role", "img");
        this._element.setAttribute("aria-readonly", "true");
      } else {
        // Section 508: interactive widget is a group of radio buttons
        this._element.setAttribute("role", "radiogroup");
      }

      // Use the element's own aria-label if supplied; otherwise set a default
      if (!this._element.hasAttribute("aria-label") && !this._element.hasAttribute("aria-labelledby")) {
        this._element.setAttribute("aria-label", "Rating");
      }

      // Read value from data attribute
      const dataValue = this._element.dataset.cndsValue;
      if (dataValue !== undefined) {
        this._value = parseFloat(dataValue);
      }

      // If stars count wasn't explicitly configured, count <li> elements
      if (!this._element.hasAttribute("data-cnds-stars")) {
        const liCount = this._element.querySelectorAll("li").length;
        if (liCount > 0) {
          this._config.stars = liCount;
        }
      }

      // Read per-star metadata from existing <li><i> elements before render clears them
      this._titles = [];
      this._before = [];
      this._after = [];
      this._colors = [];
      this._icons = [];
      this._element.querySelectorAll("li").forEach((li, i) => {
        const icon = li.querySelector("i") || li.querySelector("[data-cnds-before], [data-cnds-after], [title]");
        if (icon) {
          this._titles[i] = icon.getAttribute("title") || "";
          this._before[i] = icon.getAttribute("data-cnds-before") || "";
          this._after[i] = icon.getAttribute("data-cnds-after") || "";
          this._colors[i] = icon.getAttribute("data-cnds-color") || "";

          // Extract just FA prefix + icon name, strip size/color utility classes
          const m = (icon.className || "").match(FA_ICON);
          if (m) {
            this._icons[i] = { base: `${m[1]} ${m[2]}`, active: `fas ${m[2]}` };
          }
        }
      });

      this._render();
      this._bindEvents();
    }

    _iconFor(index, active) {
      const def = this._icons && this._icons[index];
      if (def) return active ? def.active : def.base;
      return active ? this._config.icon : this._config.iconEmpty;
    }

    _render() {
      this._element.innerHTML = "";

      // Keep readonly container's accessible label in sync with the displayed value
      if (this._config.readonly) {
        this._element.setAttribute(
          "aria-label",
          `Rating: ${this._value} out of ${this._config.stars}`
        );
      }

      for (let i = 1; i <= this._config.stars; i++) {
        const star = document.createElement("span");
        star.className = "rating-star";
        star.dataset.value = i;

        const title = this._titles && this._titles[i - 1];
        if (title) {
          star.setAttribute("title", title);
        }

        // Section 508: each interactive star is a radio button inside the radiogroup
        if (!this._config.readonly) {
          const isSelected = i === Math.round(this._value);
          star.setAttribute("role", "radio");
          star.setAttribute("aria-checked", isSelected ? "true" : "false");
          star.setAttribute(
            "aria-label",
            title ? `${i}: ${title}` : `${i} star${i !== 1 ? "s" : ""}`
          );
          // Roving tabindex — selected star (or star 1 when no selection) is the tab stop
          star.setAttribute(
            "tabindex",
            (this._value > 0 ? isSelected : i === 1) ? "0" : "-1"
          );
        }

        const color = this._colors && this._colors[i - 1];
        if (color) {
          star.style.color = color;
        }

        const icon = document.createElement("i");
        icon.setAttribute("aria-hidden", "true"); // decorative; label is on the star span

        if (i <= Math.floor(this._value)) {
          star.classList.add("active");
          icon.className = this._iconFor(i - 1, true);
        } else if (
          this._config.half &&
          i === Math.ceil(this._value) &&
          this._value % 1 !== 0
        ) {
          star.classList.add("half-active");
          icon.className = this._iconFor(i - 1, true);
        } else {
          icon.className = this._iconFor(i - 1, false);
        }

        const beforeText = this._before && this._before[i - 1];
        if (beforeText) {
          const beforeSpan = document.createElement("span");
          beforeSpan.className = "rating-label rating-label-before";
          beforeSpan.textContent = beforeText;
          star.appendChild(beforeSpan);
        }

        star.appendChild(icon);

        const afterText = this._after && this._after[i - 1];
        if (afterText) {
          const afterSpan = document.createElement("span");
          afterSpan.className = "rating-label rating-label-after";
          afterSpan.textContent = afterText;
          star.appendChild(afterSpan);
        }

        this._element.appendChild(star);
      }
    }

    _bindEvents() {
      if (this._config.readonly) return;

      EventHandler.on(
        this._element,
        `click${EVENT_KEY}`,
        ".rating-star",
        (event) => {
          const star = event.target.closest(".rating-star");
          if (!star) return;

          const value = parseInt(star.dataset.value, 10);
          this.setValue(value);
        }
      );

      EventHandler.on(
        this._element,
        `mouseover${EVENT_KEY}`,
        ".rating-star",
        (event) => {
          const star = event.target.closest(".rating-star");
          if (!star) return;

          const hoverValue = parseInt(star.dataset.value, 10);
          this._hoverValue = hoverValue;

          const stars = SelectorEngine.find(".rating-star", this._element);
          for (const s of stars) {
            const v = parseInt(s.dataset.value, 10);
            const icon = s.querySelector("i");
            if (v <= hoverValue) {
              s.classList.add("active");
              // In dynamic mode all preceding icons match the hovered icon
              const srcIdx = this._config.dynamic ? hoverValue - 1 : v - 1;
              icon.className = this._iconFor(srcIdx, true);
            } else {
              s.classList.remove("active");
              icon.className = this._iconFor(v - 1, false);
            }
            s.classList.remove("half-active");
          }

          EventHandler.trigger(this._element, EVENT_HOVER, {
            value: hoverValue
          });
        }
      );

      EventHandler.on(this._element, `mouseleave${EVENT_KEY}`, () => {
        this._hoverValue = 0;
        this._render();
      });

      // Section 508 keyboard operability — roving tabindex within radiogroup
      EventHandler.on(this._element, `keydown${EVENT_KEY}`, (event) => {
        const stars = Array.from(SelectorEngine.find(".rating-star", this._element));
        if (!stars.length) return;

        const focused = this._element.querySelector('[tabindex="0"]');
        const currentIdx = focused ? stars.indexOf(focused) : 0;
        let newIdx = currentIdx;

        switch (event.key) {
          case "ArrowRight":
          case "ArrowUp":
            newIdx = Math.min(currentIdx + 1, stars.length - 1);
            break;
          case "ArrowLeft":
          case "ArrowDown":
            newIdx = Math.max(currentIdx - 1, 0);
            break;
          case "Home":
            newIdx = 0;
            break;
          case "End":
            newIdx = stars.length - 1;
            break;
          case "Enter":
          case " ":
            if (focused) this.setValue(currentIdx + 1);
            event.preventDefault();
            return;
          default:
            return;
        }

        event.preventDefault();
        if (newIdx === currentIdx) return;

        // Move roving tabindex focus to the new star
        stars.forEach((s, idx) =>
          s.setAttribute("tabindex", idx === newIdx ? "0" : "-1")
        );
        stars[newIdx].focus();

        // Preview hover state visually while navigating
        const hoverVal = newIdx + 1;
        this._hoverValue = hoverVal;
        stars.forEach((s) => {
          const v = parseInt(s.dataset.value, 10);
          const icon = s.querySelector("i");
          const active = v <= hoverVal;
          s.classList.toggle("active", active);
          s.classList.remove("half-active");
          s.setAttribute("aria-checked", v === hoverVal ? "true" : "false");
          const srcIdx = this._config.dynamic ? hoverVal - 1 : v - 1;
          icon.className = active
            ? this._iconFor(srcIdx, true)
            : this._iconFor(v - 1, false);
        });

        EventHandler.trigger(this._element, EVENT_HOVER, { value: hoverVal });
      });

      // Reset hover preview when keyboard focus leaves the widget entirely
      EventHandler.on(this._element, `focusout${EVENT_KEY}`, (event) => {
        if (!this._element.contains(event.relatedTarget)) {
          this._hoverValue = 0;
          this._render();
        }
      });
    }

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        const data = Rating.getOrCreateInstance(this, config);
        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config](...args);
        }
      });
    }
  }

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Rating);
  }

  // Export
  window.Nimbus.Rating = Rating;
})();
