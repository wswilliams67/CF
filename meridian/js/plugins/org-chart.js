/**
 * ============================================================
 * CNDS Organization Chart Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Hierarchical org chart rendered from JSON data.
 *
 * Usage:
 *   new Nimbus.OrgChart(el, {
 *     data: { name: 'CEO', title: 'Chief Executive', children: [...] }
 *   });
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "orgchart";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_SELECT   = "select"   + EVENT_KEY;
  const EVENT_EXPAND   = "expand"   + EVENT_KEY;
  const EVENT_COLLAPSE = "collapse" + EVENT_KEY;

  // Module-level counter generates unique IDs for aria-controls references.
  let _nodeIdCounter = 0;

  const Default = {
    data: null,
    direction: "top",       // "top" = vertical top-down tree
    nodeTemplate: null,     // function(data) => HTML string
    expandAll: true
  };

  const DefaultType = {
    data: "(object|null)",
    direction: "string",
    nodeTemplate: "(function|null)",
    expandAll: "boolean"
  };

  class OrgChart extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._selectedNode = null;
      this._init();
    }

    static get NAME()        { return NAME; }
    static get Default()     { return Default; }
    static get DefaultType() { return DefaultType; }

    // ── Public API ────────────────────────────────────────────────────────────

    getSelected() {
      return this._selectedNode;
    }

    expandAll() {
      // Show all children containers and sync button state.
      this._element
        .querySelectorAll(".org-chart-children.collapsed")
        .forEach(function (el) { el.classList.remove("collapsed"); });

      this._element
        .querySelectorAll(".org-chart-toggle")
        .forEach(function (btn) {
          var icon = btn.querySelector("i");
          if (icon) icon.className = "mdi mdi-chevron-up";
          btn.setAttribute("aria-expanded", "true");
        });
    }

    collapseAll() {
      // Hide all children containers and sync button state.
      this._element
        .querySelectorAll(".org-chart-children")
        .forEach(function (el) { el.classList.add("collapsed"); });

      this._element
        .querySelectorAll(".org-chart-toggle")
        .forEach(function (btn) {
          var icon = btn.querySelector("i");
          if (icon) icon.className = "mdi mdi-chevron-down";
          btn.setAttribute("aria-expanded", "false");
        });
    }

    update(data) {
      this._config.data = data;
      this._render();
    }

    dispose() {
      super.dispose();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _init() {
      this._element.classList.add("org-chart");

      // Parse JSON from attribute when no programmatic data was supplied.
      if (!this._config.data) {
        var dataAttr = this._element.getAttribute("data-cnds-data");
        if (dataAttr) {
          try {
            this._config.data = JSON.parse(dataAttr);
          } catch (e) {
            /* invalid JSON — silently skip */
          }
        }
      }

      if (this._config.data) {
        this._render();
      }

      this._bindEvents();
    }

    _render() {
      this._element.innerHTML = "";
      var container = document.createElement("div");
      container.className = "org-chart-container";
      container.appendChild(this._buildNode(this._config.data));
      this._element.appendChild(container);
    }

    _buildNode(data) {
      var self = this;

      // ── Node wrapper ──────────────────────────────────────────────────────
      var node = document.createElement("div");
      node.className = "org-chart-node";
      if (data.id) node.setAttribute("data-cnds-id", data.id);

      // ── Card ──────────────────────────────────────────────────────────────
      var card = document.createElement("div");
      card.className = "org-chart-card";

      if (this._config.nodeTemplate) {
        // Custom template — caller supplies the inner HTML string.
        card.innerHTML = this._config.nodeTemplate(data);
      } else {
        // Default layout: avatar + name + title.
        var avatar = document.createElement("div");
        avatar.className = "org-chart-avatar";
        avatar.setAttribute("aria-hidden", "true"); // decorative; name text is the accessible label

        if (data.avatar) {
          var img = document.createElement("img");
          img.src = data.avatar;
          img.alt = data.name || "";
          avatar.appendChild(img);
        } else {
          // Initial-based fallback — text content is the first letter of name.
          avatar.textContent = (data.name || "?").charAt(0).toUpperCase();
        }
        card.appendChild(avatar);

        var info = document.createElement("div");
        info.className = "org-chart-info";

        var nameEl = document.createElement("div");
        nameEl.className = "org-chart-name";
        nameEl.textContent = data.name || "";
        info.appendChild(nameEl);

        if (data.title) {
          var titleEl = document.createElement("div");
          titleEl.className = "org-chart-title";
          titleEl.textContent = data.title;
          info.appendChild(titleEl);
        }

        card.appendChild(info);
      }

      node.appendChild(card);

      // ── Children ──────────────────────────────────────────────────────────
      if (data.children && data.children.length > 0) {
        // Unique ID ties the toggle button to its children container via aria-controls.
        var childrenId = "org-chart-children-" + (++_nodeIdCounter);

        // Vertical connector line between parent card and toggle button.
        var connector = document.createElement("div");
        connector.className = "org-chart-connector";
        connector.setAttribute("aria-hidden", "true"); // purely decorative
        node.appendChild(connector);

        // Toggle button — keyboard accessible via native <button> semantics.
        var isExpanded = this._config.expandAll;
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "org-chart-toggle";
        toggle.innerHTML = '<i class="mdi ' + (isExpanded ? "mdi-chevron-up" : "mdi-chevron-down") + '" aria-hidden="true"></i>';
        toggle.setAttribute("aria-label",    "Toggle children");
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.setAttribute("aria-controls", childrenId);
        node.appendChild(toggle);

        // Children container.
        var children = document.createElement("div");
        children.className = "org-chart-children";
        children.id = childrenId;
        if (!isExpanded) children.classList.add("collapsed");

        data.children.forEach(function (childData) {
          children.appendChild(self._buildNode(childData));
        });

        node.appendChild(children);
      }

      return node;
    }

    _bindEvents() {
      var self = this;

      EventHandler.on(this._element, "click", function (e) {

        // ── Toggle click ───────────────────────────────────────────────────
        var toggle = e.target.closest(".org-chart-toggle");
        if (toggle) {
          var node     = toggle.closest(".org-chart-node");
          var children = node.querySelector(":scope > .org-chart-children");
          if (children) {
            var collapsed = children.classList.toggle("collapsed");
            var icon = toggle.querySelector("i");
            if (icon) icon.className = "mdi " + (collapsed ? "mdi-chevron-down" : "mdi-chevron-up");
            toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            var evt = collapsed ? EVENT_COLLAPSE : EVENT_EXPAND;
            EventHandler.trigger(self._element, evt, { node: node });
          }
          return;
        }

        // ── Card click (select) ────────────────────────────────────────────
        var card = e.target.closest(".org-chart-card");
        if (card) {
          // Deselect any previously selected card.
          self._element
            .querySelectorAll(".org-chart-card.selected")
            .forEach(function (c) { c.classList.remove("selected"); });

          card.classList.add("selected");
          self._selectedNode = card.closest(".org-chart-node");
          EventHandler.trigger(self._element, EVENT_SELECT, {
            node: self._selectedNode,
            id:   self._selectedNode.getAttribute("data-cnds-id")
          });
        }
      });
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = OrgChart.getInstance(this);
        if (!instance)
          instance = new OrgChart(this, typeof config === "object" ? config : {});
        if (typeof config === "string") {
          if (typeof instance[config] !== "function")
            throw new TypeError("No method named " + config);
          instance[config]();
        }
      });
    }
  }

  // Auto-initialize any element carrying data-cnds-org-chart-init.
  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-org-chart-init]").forEach(function (el) {
      if (!OrgChart.getInstance(el)) new OrgChart(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { autoInit(); });
  } else {
    autoInit();
  }

  window.Nimbus = window.Nimbus || {};
  window.Nimbus.OrgChart = OrgChart;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, OrgChart);
})();
