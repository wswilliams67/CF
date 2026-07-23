/**
 * ============================================================
 * CNDS Drag & Drop / Sortable Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Sortable lists and grids using native HTML5 drag and drop.
 * Supports handles, connected lists, and callbacks.
 *
 * Usage:
 *   <ul data-cnds-sortable-init>
 *     <li class="sortable-item">Item 1</li>
 *     <li class="sortable-item">Item 2</li>
 *   </ul>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "sortable";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_START = "start" + EVENT_KEY;
  const EVENT_END = "end" + EVENT_KEY;
  const EVENT_SORT = "sort" + EVENT_KEY;
  const EVENT_ADD = "add" + EVENT_KEY;
  const EVENT_REMOVE = "remove" + EVENT_KEY;

  const Default = {
    items: ".sortable-item",
    handle: null, // e.g. ".sortable-handle"
    group: null, // string name for connected lists
    disabled: false,
    animation: 150,
    ghostClass: "dragging",
    placeholderClass: "sortable-placeholder",
    dragOverClass: "drag-over"
  };

  const DefaultType = {
    items: "string",
    handle: "(string|null)",
    group: "(string|null)",
    disabled: "boolean",
    animation: "number",
    ghostClass: "string",
    placeholderClass: "string",
    dragOverClass: "string"
  };

  // Track all sortable instances for connected lists
  var allInstances = [];

  class Sortable extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._dragItem = null;
      this._placeholder = null;
      this._sourceContainer = null;

      this._init();
      allInstances.push(this);
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

    // --- Public API ---

    getOrder() {
      var items = this._element.querySelectorAll(this._config.items);
      return Array.from(items).map(function (item, index) {
        return {
          index: index,
          id: item.id || null,
          text: item.textContent.trim().substring(0, 50)
        };
      });
    }

    enable() {
      this._config.disabled = false;
      this._setupItems();
    }

    disable() {
      this._config.disabled = true;
      var items = this._element.querySelectorAll(this._config.items);
      items.forEach(function (item) {
        item.setAttribute("draggable", "false");
      });
    }

    refresh() {
      this._setupItems();
    }

    dispose() {
      var idx = allInstances.indexOf(this);
      if (idx !== -1) allInstances.splice(idx, 1);
      this._removePlaceholder();
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._element.classList.add("sortable");
      this._setupItems();
      this._bindContainerEvents();
    }

    _setupItems() {
      var self = this;
      var items = this._element.querySelectorAll(this._config.items);

      items.forEach(function (item) {
        if (self._config.disabled) {
          item.setAttribute("draggable", "false");
          return;
        }

        // If handle is specified, only allow drag from handle
        if (self._config.handle) {
          item.setAttribute("draggable", "false");
          var handle = item.querySelector(self._config.handle);
          if (handle) {
            handle.addEventListener("mousedown", function () {
              item.setAttribute("draggable", "true");
            });
            handle.addEventListener("mouseup", function () {
              item.setAttribute("draggable", "false");
            });
          }
        } else {
          item.setAttribute("draggable", "true");
        }

        // Drag start
        item.addEventListener("dragstart", function (e) {
          self._onDragStart(e, item);
        });

        // Drag end
        item.addEventListener("dragend", function (e) {
          self._onDragEnd(e, item);
        });
      });
    }

    _bindContainerEvents() {
      var self = this;

      this._element.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (!self._dragItem && !self._getActiveDragItem()) return;

        var dragItem = self._dragItem || self._getActiveDragItem();
        if (!dragItem) return;

        self._element.classList.add(self._config.dragOverClass);

        var afterElement = self._getDragAfterElement(e.clientY);
        if (afterElement) {
          self._element.insertBefore(
            self._getPlaceholder(dragItem),
            afterElement
          );
        } else {
          self._element.appendChild(self._getPlaceholder(dragItem));
        }
      });

      this._element.addEventListener("dragleave", function (e) {
        // Only remove class if actually leaving the container
        if (!self._element.contains(e.relatedTarget)) {
          self._element.classList.remove(self._config.dragOverClass);
        }
      });

      this._element.addEventListener("drop", function (e) {
        e.preventDefault();
        self._element.classList.remove(self._config.dragOverClass);

        var dragItem = self._dragItem || self._getActiveDragItem();
        if (!dragItem) return;

        // Insert the actual item where placeholder is
        if (
          self._placeholder &&
          self._placeholder.parentNode === self._element
        ) {
          self._element.insertBefore(dragItem, self._placeholder);
        } else {
          self._element.appendChild(dragItem);
        }

        self._removePlaceholder();

        // If from another container, fire add/remove events
        var sourceInstance = self._getSourceInstance();
        if (sourceInstance && sourceInstance !== self) {
          EventHandler.trigger(self._element, EVENT_ADD, {
            item: dragItem,
            from: sourceInstance._element
          });
          EventHandler.trigger(sourceInstance._element, EVENT_REMOVE, {
            item: dragItem,
            to: self._element
          });
        }

        EventHandler.trigger(self._element, EVENT_SORT, {
          order: self.getOrder()
        });
      });
    }

    _onDragStart(e, item) {
      this._dragItem = item;
      this._sourceContainer = this._element;
      item.classList.add(this._config.ghostClass);

      // Store reference globally for connected lists
      Sortable._activeDragItem = item;
      Sortable._activeSourceInstance = this;

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id || "");

      EventHandler.trigger(this._element, EVENT_START, {
        item: item
      });
    }

    _onDragEnd(e, item) {
      item.classList.remove(this._config.ghostClass);
      this._removePlaceholder();
      this._element.classList.remove(this._config.dragOverClass);

      // Clean up all connected containers
      allInstances.forEach(function (inst) {
        inst._element.classList.remove(inst._config.dragOverClass);
      });

      // Reset handle draggable
      if (this._config.handle) {
        item.setAttribute("draggable", "false");
      }

      this._dragItem = null;
      Sortable._activeDragItem = null;
      Sortable._activeSourceInstance = null;

      EventHandler.trigger(this._element, EVENT_END, {
        item: item,
        order: this.getOrder()
      });
    }

    _getActiveDragItem() {
      if (!this._config.group) return null;
      if (!Sortable._activeDragItem) return null;
      var sourceInst = Sortable._activeSourceInstance;
      if (sourceInst && sourceInst._config.group === this._config.group) {
        return Sortable._activeDragItem;
      }
      return null;
    }

    _getSourceInstance() {
      return Sortable._activeSourceInstance || null;
    }

    _getPlaceholder(referenceItem) {
      if (!this._placeholder) {
        this._placeholder = document.createElement("div");
        this._placeholder.className = this._config.placeholderClass;
      }
      // Match height of dragged item
      var rect = referenceItem.getBoundingClientRect();
      this._placeholder.style.height = rect.height + "px";
      return this._placeholder;
    }

    _removePlaceholder() {
      if (this._placeholder && this._placeholder.parentNode) {
        this._placeholder.parentNode.removeChild(this._placeholder);
      }
      this._placeholder = null;
    }

    _getDragAfterElement(y) {
      var self = this;
      var items = Array.from(
        this._element.querySelectorAll(
          this._config.items + ":not(." + this._config.ghostClass + ")"
        )
      );

      var closest = null;
      var closestOffset = Number.NEGATIVE_INFINITY;

      items.forEach(function (child) {
        var box = child.getBoundingClientRect();
        var offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closestOffset) {
          closestOffset = offset;
          closest = child;
        }
      });

      return closest;
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Sortable.getInstance(this);
        if (!instance) {
          instance = new Sortable(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function") {
            throw new TypeError("No method named " + config);
          }
          instance[config]();
        }
      });
    }
  }

  // Static properties for cross-instance drag tracking
  Sortable._activeDragItem = null;
  Sortable._activeSourceInstance = null;

  // Auto-init
  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-sortable-init]").forEach(function (el) {
      if (!Sortable.getInstance(el)) {
        new Sortable(el);
      }
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
  window.Nimbus.Sortable = Sortable;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Sortable);
  }
})();
