/**
 * ============================================================
 * CNDS Dropdown Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "dropdown";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_SHOW = "show";
  const SELECTOR_DATA_TOGGLE = '[data-cnds-toggle="dropdown"]';
  const SELECTOR_MENU = ".dropdown-menu";
  const SELECTOR_SEARCH_INPUT = ".dropdown-search-input";

  const Default = {
    offset: [0, 2],
    autoClose: true,
    display: "dynamic",
    flip: false
  };

  const DefaultType = {
    offset: "string|number|object",
    autoClose: "boolean|string",
    display: "string",
    flip: "boolean"
  };

  class Dropdown extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._menu = this._getMenuElement();
      this._inNavbar = this._detectNavbar();
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
      if (
        this._element.disabled ||
        this._element.classList.contains("disabled")
      )
        return;

      if (!this._menu) return;

      const isActive = this._menu.classList.contains(CLASS_SHOW);

      if (isActive) {
        this.hide();
      } else {
        this.show();
      }
    }

    show() {
      if (!this._menu) return;
      if (
        this._element.disabled ||
        this._element.classList.contains("disabled") ||
        this._menu.classList.contains(CLASS_SHOW)
      ) {
        return;
      }

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      // Close other open dropdowns
      Dropdown.clearMenus();

      // Position the menu
      this._positionMenu();

      this._menu.classList.add(CLASS_SHOW);
      this._element.classList.add(CLASS_SHOW);
      this._element.setAttribute("aria-expanded", "true");

      // Add click-outside listener
      this._addClickOutsideListener();

      EventHandler.trigger(this._element, EVENT_SHOWN);
    }

    hide() {
      if (!this._menu.classList.contains(CLASS_SHOW)) return;

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._menu.classList.remove(CLASS_SHOW);
      this._element.classList.remove(CLASS_SHOW);
      this._element.setAttribute("aria-expanded", "false");

      this._removeClickOutsideListener();

      // Reset search filter when dropdown closes
      Dropdown._resetSearchFilter(this._menu);

      EventHandler.trigger(this._element, EVENT_HIDDEN);
    }

    dispose() {
      this._removeClickOutsideListener();
      super.dispose();
    }

    // --- Private Methods ---

    _getMenuElement() {
      // Look for sibling menu or child menu
      const parent = this._element.parentElement;
      return parent ? parent.querySelector(SELECTOR_MENU) : null;
    }

    _detectNavbar() {
      return this._element.closest(".navbar") !== null;
    }

    _positionMenu() {
      if (!this._menu) return;

      const parent = this._element.parentElement;

      // Reset inline styles before repositioning
      this._menu.style.top = "";
      this._menu.style.bottom = "";
      this._menu.style.left = "";
      this._menu.style.right = "";

      // Basic positioning based on dropup/dropend/dropstart classes
      if (parent.classList.contains("dropup")) {
        this._menu.style.top = "auto";
        this._menu.style.bottom = "100%";
      } else if (parent.classList.contains("dropend")) {
        this._menu.style.left = "100%";
        this._menu.style.top = "0";
      } else if (parent.classList.contains("dropstart")) {
        this._menu.style.right = "100%";
        this._menu.style.left = "auto";
        this._menu.style.top = "0";
      } else {
        // Default: dropdown (down)
        this._menu.style.top = "100%";
      }

      // Check if menu-end alignment
      if (this._menu.classList.contains("dropdown-menu-end")) {
        this._menu.style.right = "0";
        this._menu.style.left = "auto";
      }

      // Smart placement (opt-in): data-cnds-flip="true" on the toggle
      if (this._config.flip) this._flipIfClipped(parent);
    }

    /* Smart placement. The direction classes (.dropup, .dropend, .dropstart,
       or down by default) say where the menu prefers to open. With flip on,
       the menu opens there when it fits, and flips to the opposite side only
       when it does not fit and the opposite side has more room. Without
       flip, the class is followed exactly, so a direction can still be forced.

       Room is measured inside the clipping boundary: the viewport, narrowed
       by every ancestor that scrolls or clips (an offcanvas or modal body),
       so a menu in a flyout stays inside the flyout.
       The side it opened on is written to data-cnds-placement on the menu
       (top, bottom, start, end) for styling. */
    _flipIfClipped(parent) {
      const menu = this._menu;
      const vis = menu.style.visibility;
      const disp = menu.style.display;
      menu.style.visibility = "hidden";
      menu.style.display = "block";
      const m = menu.getBoundingClientRect();
      menu.style.display = disp;
      menu.style.visibility = vis;

      const t = parent.getBoundingClientRect();
      const b = Dropdown._clipBounds(parent);
      let placement;

      if (parent.classList.contains("dropend") || parent.classList.contains("dropstart")) {
        const start = parent.classList.contains("dropstart");
        const right = b.right - t.right;
        const left = t.left - b.left;
        const flip = m.width > (start ? left : right) && (start ? right : left) > (start ? left : right);
        placement = start !== flip ? "start" : "end";
        if (placement === "start") {
          menu.style.left = "auto";
          menu.style.right = "100%";
        } else {
          menu.style.right = "auto";
          menu.style.left = "100%";
        }
      } else {
        const up = parent.classList.contains("dropup");
        const below = b.bottom - t.bottom;
        const above = t.top - b.top;
        const flip = m.height > (up ? above : below) && (up ? below : above) > (up ? above : below);
        placement = up !== flip ? "top" : "bottom";
        if (placement === "top") {
          menu.style.top = "auto";
          menu.style.bottom = "100%";
        } else {
          menu.style.bottom = "auto";
          menu.style.top = "100%";
        }
      }
      menu.setAttribute("data-cnds-placement", placement);
    }

    /* The visible area a menu inside `el` can use: the viewport, intersected
       with each ancestor whose overflow is not visible. */
    static _clipBounds(el) {
      const b = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
          const r = a.getBoundingClientRect();
          b.top = Math.max(b.top, r.top);
          b.left = Math.max(b.left, r.left);
          b.bottom = Math.min(b.bottom, r.bottom);
          b.right = Math.min(b.right, r.right);
        }
      }
      return b;
    }

    _addClickOutsideListener() {
      this._clickOutsideHandler = (event) => {
        if (
          !this._element.contains(event.target) &&
          !this._menu.contains(event.target)
        ) {
          this.hide();
        }
      };
      // Delay to avoid catching the current click
      setTimeout(() => {
        document.addEventListener("click", this._clickOutsideHandler);
      }, 0);
    }

    _removeClickOutsideListener() {
      if (this._clickOutsideHandler) {
        document.removeEventListener("click", this._clickOutsideHandler);
        this._clickOutsideHandler = null;
      }
    }

    // --- Static Methods ---

    static clearMenus(event) {
      const openMenus = SelectorEngine.find(`${SELECTOR_MENU}.${CLASS_SHOW}`);
      for (const menu of openMenus) {
        const toggle = menu.parentElement?.querySelector(SELECTOR_DATA_TOGGLE);
        if (toggle) {
          const instance = Dropdown.getInstance(toggle);
          if (instance) {
            instance.hide();
          }
        }
      }
    }

    /**
     * Filter menu items by search query. Works on any dropdown-menu element.
     * Hides non-matching items, group headers with no visible children,
     * and dividers adjacent to hidden sections.
     * @param {HTMLElement} menu - The .dropdown-menu element
     * @param {string} query - The search string (lowercased)
     */
    static _filterMenuItems(menu, query) {
      const items = Array.from(menu.children);

      // First pass: show/hide filterable items
      for (const li of items) {
        // Never hide the search container itself
        if (li.classList.contains("dropdown-search")) continue;

        // Dividers — handled in second pass
        if (li.querySelector(".dropdown-divider")) {
          li.style.display = "";
          li._isFilterDivider = true;
          continue;
        }

        // Group headers — handled in second pass
        if (li.querySelector(".dropdown-group-header")) {
          li.style.display = "";
          li._isFilterGroupHeader = true;
          continue;
        }

        // Standard headers (.dropdown-header) — handled in second pass
        if (li.querySelector(".dropdown-header")) {
          li.style.display = "";
          li._isFilterStdHeader = true;
          continue;
        }

        // Plain text items
        const textItem = li.querySelector(".dropdown-item-text");
        if (textItem) {
          if (!query) {
            li.style.display = "";
          } else {
            const text = textItem.textContent.toLowerCase();
            li.style.display = text.includes(query) ? "" : "none";
          }
          continue;
        }

        // Filterable items (dropdown-item links/buttons)
        const item = li.querySelector(".dropdown-item");
        if (item) {
          if (!query) {
            li.style.display = "";
          } else {
            const text = item.textContent.toLowerCase();
            li.style.display = text.includes(query) ? "" : "none";
          }
          continue;
        }

        // Anything else
        if (!query) {
          li.style.display = "";
        } else {
          const text = li.textContent.toLowerCase();
          li.style.display = text.includes(query) ? "" : "none";
        }
      }

      // Second pass: hide group headers / standard headers if all their items
      // are hidden, and hide dividers if they are adjacent to hidden sections
      if (query) {
        for (let i = 0; i < items.length; i++) {
          const li = items[i];

          // Group header: hide if no visible items follow before next header/divider
          if (li._isFilterGroupHeader) {
            let hasVisibleChild = false;
            for (let j = i + 1; j < items.length; j++) {
              const next = items[j];
              if (
                next._isFilterGroupHeader ||
                next._isFilterStdHeader ||
                next._isFilterDivider
              )
                break;
              if (next.style.display !== "none") {
                hasVisibleChild = true;
                break;
              }
            }
            li.style.display = hasVisibleChild ? "" : "none";
          }

          // Standard header: hide if no visible items follow before next header/divider
          if (li._isFilterStdHeader) {
            let hasVisibleChild = false;
            for (let j = i + 1; j < items.length; j++) {
              const next = items[j];
              if (
                next._isFilterGroupHeader ||
                next._isFilterStdHeader ||
                next._isFilterDivider
              )
                break;
              if (next.style.display !== "none") {
                hasVisibleChild = true;
                break;
              }
            }
            li.style.display = hasVisibleChild ? "" : "none";
          }

          // Divider: hide if no visible items exist on either side
          if (li._isFilterDivider) {
            let hasVisibleBefore = false;
            for (let j = i - 1; j >= 0; j--) {
              const prev = items[j];
              if (prev.classList.contains("dropdown-search")) continue;
              if (prev._isFilterDivider) break;
              if (prev.style.display !== "none") {
                hasVisibleBefore = true;
                break;
              }
            }
            let hasVisibleAfter = false;
            for (let j = i + 1; j < items.length; j++) {
              const next = items[j];
              if (next._isFilterDivider) break;
              if (next.style.display !== "none") {
                hasVisibleAfter = true;
                break;
              }
            }
            li.style.display =
              hasVisibleBefore && hasVisibleAfter ? "" : "none";
          }
        }
      }

      // Clean up temporary flags
      for (const li of items) {
        delete li._isFilterDivider;
        delete li._isFilterGroupHeader;
        delete li._isFilterStdHeader;
      }
    }

    /**
     * Reset search filter: clear input and show all items.
     * @param {HTMLElement} menu - The .dropdown-menu element
     */
    static _resetSearchFilter(menu) {
      if (!menu) return;
      const searchInput = menu.querySelector(SELECTOR_SEARCH_INPUT);
      if (searchInput) {
        searchInput.value = "";
      }
      const items = menu.children;
      for (const li of items) {
        li.style.display = "";
      }
    }
  }

  // --- Global delegated type-ahead search listener ---
  // Works for both toggled dropdowns and static/visible menus
  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches(SELECTOR_SEARCH_INPUT)) return;

    const menu = input.closest(SELECTOR_MENU);
    if (!menu) return;

    const query = input.value.trim().toLowerCase();
    Dropdown._filterMenuItems(menu, query);
  });

  // Prevent clicks inside search inputs from closing the dropdown
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.matches(SELECTOR_SEARCH_INPUT)) {
        event.stopPropagation();
      }
    },
    true
  );

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Dropdown);

  // Export
  window.Nimbus.Dropdown = Dropdown;
})();
