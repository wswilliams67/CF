/**
 * ============================================================
 * CNDS Filters Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Dynamic content filtering with multiple criteria,
 * search, and animated show/hide of matching items.
 *
 * Usage:
 *   <div data-cnds-filters-init data-cnds-target=".filter-items">
 *     <button data-cnds-filter="all">All</button>
 *     <button data-cnds-filter="category1">Cat 1</button>
 *   </div>
 *   <div class="filter-items">
 *     <div data-cnds-category="category1">Item</div>
 *   </div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "filters";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_FILTER = "filter" + EVENT_KEY;

  const Default = {
    target: null,
    itemSelector: "[data-cnds-category]",
    activeClass: "active",
    hiddenClass: "d-none",
    animation: true,
    animationDuration: 300,
    multiSelect: false,
    searchInput: null
  };

  const DefaultType = {
    target: "(string|null)",
    itemSelector: "string",
    activeClass: "string",
    hiddenClass: "string",
    animation: "boolean",
    animationDuration: "number",
    multiSelect: "boolean",
    searchInput: "(string|null)"
  };

  class Filters extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._container = null;
      this._items = [];
      this._activeFilters = new Set(["all"]);
      this._searchTerm = "";
      this._init();
    }

    static get NAME() {
      return NAME;
    }
    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }

    filter(category) {
      if (category === "all") {
        this._activeFilters.clear();
        this._activeFilters.add("all");
      } else if (this._config.multiSelect) {
        this._activeFilters.delete("all");
        if (this._activeFilters.has(category)) {
          this._activeFilters.delete(category);
        } else {
          this._activeFilters.add(category);
        }
        if (this._activeFilters.size === 0) this._activeFilters.add("all");
      } else {
        this._activeFilters.clear();
        this._activeFilters.add(category);
      }

      this._updateButtons();
      this._applyFilters();
      EventHandler.trigger(this._element, EVENT_FILTER, {
        filters: Array.from(this._activeFilters)
      });
    }

    search(term) {
      this._searchTerm = (term || "").toLowerCase().trim();
      this._applyFilters();
    }

    getActiveFilters() {
      return Array.from(this._activeFilters);
    }

    reset() {
      this._activeFilters.clear();
      this._activeFilters.add("all");
      this._searchTerm = "";
      this._updateButtons();
      this._applyFilters();
    }

    dispose() {
      super.dispose();
    }

    _init() {
      // Find target container
      if (this._config.target) {
        this._container = document.querySelector(this._config.target);
      }
      if (!this._container) {
        this._container = this._element.nextElementSibling;
      }

      if (this._container) {
        this._items = Array.from(
          this._container.querySelectorAll(this._config.itemSelector)
        );
      }

      this._bindEvents();
      this._updateButtons();
    }

    _bindEvents() {
      var self = this;

      // Filter buttons
      EventHandler.on(this._element, "click", function (e) {
        var btn = e.target.closest("[data-cnds-filter]");
        if (btn) {
          e.preventDefault();
          self.filter(btn.getAttribute("data-cnds-filter"));
        }
      });

      // Search input
      if (this._config.searchInput) {
        var searchEl = document.querySelector(this._config.searchInput);
        if (searchEl) {
          var debounce;
          EventHandler.on(searchEl, "input", function () {
            clearTimeout(debounce);
            debounce = setTimeout(function () {
              self.search(searchEl.value);
            }, 200);
          });
        }
      }
    }

    _updateButtons() {
      var self = this;
      var buttons = this._element.querySelectorAll("[data-cnds-filter]");
      buttons.forEach(function (btn) {
        var cat = btn.getAttribute("data-cnds-filter");
        if (self._activeFilters.has(cat)) {
          btn.classList.add(self._config.activeClass);
        } else {
          btn.classList.remove(self._config.activeClass);
        }
      });
    }

    _applyFilters() {
      var self = this;
      var showAll = this._activeFilters.has("all");

      this._items.forEach(function (item) {
        var categories = (item.getAttribute("data-cnds-category") || "")
          .split(",")
          .map(function (c) {
            return c.trim();
          });
        var matchesFilter =
          showAll ||
          categories.some(function (c) {
            return self._activeFilters.has(c);
          });
        var matchesSearch =
          !self._searchTerm ||
          item.textContent.toLowerCase().includes(self._searchTerm);
        var visible = matchesFilter && matchesSearch;

        if (self._config.animation) {
          if (visible) {
            item.classList.remove(self._config.hiddenClass);
            item.style.opacity = "0";
            item.style.transform = "scale(0.95)";
            item.style.transition =
              "opacity " +
              self._config.animationDuration +
              "ms, transform " +
              self._config.animationDuration +
              "ms";
            requestAnimationFrame(function () {
              item.style.opacity = "1";
              item.style.transform = "scale(1)";
            });
          } else {
            item.style.opacity = "0";
            item.style.transform = "scale(0.95)";
            setTimeout(function () {
              item.classList.add(self._config.hiddenClass);
            }, self._config.animationDuration);
          }
        } else {
          if (visible) {
            item.classList.remove(self._config.hiddenClass);
          } else {
            item.classList.add(self._config.hiddenClass);
          }
        }
      });
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Filters.getInstance(this);
        if (!instance)
          instance = new Filters(
            this,
            typeof config === "object" ? config : {}
          );
        if (typeof config === "string") {
          if (typeof instance[config] !== "function")
            throw new TypeError("No method named " + config);
          instance[config]();
        }
      });
    }
  }

  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-filters-init]").forEach(function (el) {
      if (!Filters.getInstance(el)) new Filters(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      autoInit();
    });
  } else {
    autoInit();
  }

  window.Nimbus = window.Nimbus || {};
  window.Nimbus.Filters = Filters;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, Filters);
})();
