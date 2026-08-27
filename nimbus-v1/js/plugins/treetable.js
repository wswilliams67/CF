/**
 * ============================================================
 * CNDS TreeTable Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Hierarchical data table with expandable rows.
 * Combines DataTable features with tree structure.
 *
 * Usage:
 *   <div data-cnds-treetable-init>
 *     <table>...</table>
 *   </div>
 *
 * Rows use data-cnds-parent="parentId" and data-cnds-id="id"
 * to define hierarchy.
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "treetable";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_EXPAND = "expand" + EVENT_KEY;
  const EVENT_COLLAPSE = "collapse" + EVENT_KEY;

  const Default = {
    indent: 24,
    expandAll: false,
    icons: true,
    parentIcon:     '<i class="mdi mdi-folder" aria-hidden="true"></i>',
    parentOpenIcon: '<i class="mdi mdi-folder-open" aria-hidden="true"></i>',
    leafIcon:       '<i class="mdi mdi-file" aria-hidden="true"></i>',
    animated: true
  };

  const DefaultType = {
    indent: "number",
    expandAll: "boolean",
    icons: "boolean",
    parentIcon:     "string",
    parentOpenIcon: "string",
    leafIcon:       "string",
    animated: "boolean"
  };

  class TreeTable extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._table = null;
      this._tbody = null;
      this._rows = new Map(); // id -> { row, parentId, children, level, expanded }
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

    expandAll() {
      var self = this;
      this._rows.forEach(function (data, id) {
        if (data.children.length > 0) {
          data.expanded = true;
          self._updateToggle(data);
        }
      });
      this._updateVisibility();
    }

    collapseAll() {
      var self = this;
      this._rows.forEach(function (data, id) {
        data.expanded = false;
        self._updateToggle(data);
      });
      this._updateVisibility();
    }

    toggleRow(id) {
      var data = this._rows.get(id);
      if (!data || data.children.length === 0) return;
      data.expanded = !data.expanded;
      this._updateToggle(data);
      this._updateVisibility();
      var evt = data.expanded ? EVENT_EXPAND : EVENT_COLLAPSE;
      EventHandler.trigger(this._element, evt, { id: id, row: data.row });
    }

    dispose() {
      this._rows.clear();
      super.dispose();
    }

    _init() {
      this._element.classList.add("treetable", "datatable");
      this._table = this._element.querySelector("table") || this._element;
      this._tbody = this._table.querySelector("tbody");
      if (!this._tbody) return;

      this._parseRows();
      this._buildTreeCells();
      this._bindEvents();

      if (this._config.expandAll) {
        this.expandAll();
      } else {
        this._updateVisibility();
      }
    }

    _parseRows() {
      var self = this;
      var rows = this._tbody.querySelectorAll("tr");

      rows.forEach(function (row) {
        var id = row.getAttribute("data-cnds-id");
        var parentId = row.getAttribute("data-cnds-parent") || null;
        if (!id) {
          id = Utils.getUID("tt");
          row.setAttribute("data-cnds-id", id);
        }
        self._rows.set(id, {
          row: row,
          parentId: parentId,
          children: [],
          level: 0,
          expanded: false
        });
      });

      // Build children arrays and compute levels
      this._rows.forEach(function (data, id) {
        if (data.parentId && self._rows.has(data.parentId)) {
          self._rows.get(data.parentId).children.push(id);
        }
      });

      // Compute levels
      this._rows.forEach(function (data, id) {
        data.level = self._getLevel(id);
      });
    }

    _getLevel(id) {
      var data = this._rows.get(id);
      if (!data || !data.parentId) return 0;
      return 1 + this._getLevel(data.parentId);
    }

    _buildTreeCells() {
      var self = this;
      this._rows.forEach(function (data, id) {
        var firstTd = data.row.querySelector("td");
        if (!firstTd) return;

        var originalContent = firstTd.innerHTML;
        var hasChildren = data.children.length > 0;

        var cell = document.createElement("div");
        cell.className = "treetable-cell";

        // Indent
        var indent = document.createElement("span");
        indent.className = "treetable-indent";
        indent.style.width = data.level * self._config.indent + "px";
        cell.appendChild(indent);

        // Toggle — MDI chevron-right; rotated 90° via CSS when .expanded
        if (hasChildren) {
          var toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "treetable-toggle";
          toggle.setAttribute("data-cnds-toggle-id", id);
          toggle.setAttribute("aria-label", "Toggle row");
          var chevron = document.createElement("i");
          chevron.className = "mdi mdi-chevron-right";
          chevron.setAttribute("aria-hidden", "true");
          toggle.appendChild(chevron);
          cell.appendChild(toggle);
          data.row.classList.add("parent-row");
        } else {
          var spacer = document.createElement("span");
          spacer.className = "treetable-toggle-spacer";
          cell.appendChild(spacer);
        }

        // Icon — uses innerHTML so MDI <i> elements render correctly
        if (self._config.icons) {
          var icon = document.createElement("span");
          icon.className = "treetable-icon";
          icon.innerHTML = hasChildren
            ? self._config.parentIcon
            : self._config.leafIcon;
          cell.appendChild(icon);
        }

        // Label
        var label = document.createElement("span");
        label.className = "treetable-label";
        label.innerHTML = originalContent;
        cell.appendChild(label);

        firstTd.innerHTML = "";
        firstTd.appendChild(cell);
      });
    }

    _bindEvents() {
      var self = this;
      EventHandler.on(this._element, "click", function (e) {
        var toggle = e.target.closest(".treetable-toggle");
        if (toggle) {
          var id = toggle.getAttribute("data-cnds-toggle-id");
          if (id) self.toggleRow(id);
        }
      });
    }

    _updateToggle(data) {
      var toggle = data.row.querySelector(".treetable-toggle");
      if (toggle) {
        if (data.expanded) {
          toggle.classList.add("expanded");
        } else {
          toggle.classList.remove("expanded");
        }
      }
      // Swap folder icon to open/closed state to match TreeView behaviour
      if (this._config.icons && data.children.length > 0) {
        var iconEl = data.row.querySelector(".treetable-icon");
        if (iconEl) {
          iconEl.innerHTML = data.expanded
            ? this._config.parentOpenIcon
            : this._config.parentIcon;
        }
      }
    }

    _updateVisibility() {
      var self = this;
      this._rows.forEach(function (data, id) {
        if (!data.parentId) {
          data.row.classList.remove("collapsed");
          data.row.style.display = "";
        } else {
          var visible = self._isAncestorsExpanded(id);
          if (visible) {
            data.row.classList.remove("collapsed");
            data.row.style.display = "";
          } else {
            data.row.classList.add("collapsed");
            data.row.style.display = "none";
          }
        }
      });
    }

    _isAncestorsExpanded(id) {
      var data = this._rows.get(id);
      if (!data || !data.parentId) return true;
      var parent = this._rows.get(data.parentId);
      if (!parent) return true;
      if (!parent.expanded) return false;
      return this._isAncestorsExpanded(data.parentId);
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = TreeTable.getInstance(this);
        if (!instance) {
          instance = new TreeTable(
            this,
            typeof config === "object" ? config : {}
          );
        }
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
    root.querySelectorAll("[data-cnds-treetable-init]").forEach(function (el) {
      if (!TreeTable.getInstance(el)) new TreeTable(el);
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
  window.Nimbus.TreeTable = TreeTable;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, TreeTable);
})();
