/**
 * ============================================================
 * CNDS Treeview Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Hierarchical tree view with expand/collapse, checkboxes,
 * icons, search filtering, and keyboard navigation.
 *
 * Usage (HTML):
 *   <div data-cnds-treeview-init>
 *     <ul>
 *       <li>Parent
 *         <ul>
 *           <li>Child 1</li>
 *           <li>Child 2</li>
 *         </ul>
 *       </li>
 *     </ul>
 *   </div>
 *
 * Usage (JS data):
 *   new Nimbus.Treeview(el, {
 *     data: [{ label: 'Root', children: [{ label: 'Child' }] }]
 *   });
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "treeview";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_SELECT = "select" + EVENT_KEY;
  const EVENT_EXPAND = "expand" + EVENT_KEY;
  const EVENT_COLLAPSE = "collapse" + EVENT_KEY;
  const EVENT_CHECK = "check" + EVENT_KEY;

  const Default = {
    data: null,
    selectable: true,
    checkboxes: false,
    icons: true,
    expandAll: false,
    showLines: false,
    searchable: false,
    accordion: false,
    folderIcon: '<i class="mdi mdi-folder" aria-hidden="true"></i>',
    folderOpenIcon: '<i class="mdi mdi-folder-open" aria-hidden="true"></i>',
    fileIcon: '<i class="mdi mdi-file" aria-hidden="true"></i>'
  };

  const DefaultType = {
    data: "(array|null)",
    selectable: "boolean",
    checkboxes: "boolean",
    icons: "boolean",
    expandAll: "boolean",
    showLines: "boolean",
    searchable: "boolean",
    accordion: "boolean",
    folderIcon: "string",
    folderOpenIcon: "string",
    fileIcon: "string"
  };

  class Treeview extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._selectedNode = null;
      this._checkedNodes = new Set();
      this._searchInput = null;

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

    // --- Public API ---

    getSelected() {
      return this._selectedNode;
    }

    getChecked() {
      var checked = [];
      this._element
        .querySelectorAll(".treeview-checkbox input:checked")
        .forEach(function (cb) {
          var node = cb.closest(".treeview-node");
          if (node) {
            checked.push({
              element: node,
              label: node.querySelector(".treeview-label").textContent.trim()
            });
          }
        });
      return checked;
    }

    expandAll() {
      this._element
        .querySelectorAll(".treeview-children")
        .forEach(function (el) {
          el.classList.add("expanded");
        });
      this._element.querySelectorAll(".treeview-toggle").forEach(function (el) {
        el.classList.add("expanded");
        el.setAttribute("aria-expanded", "true");
      });
      this._updateIcons();
    }

    collapseAll() {
      this._element
        .querySelectorAll(".treeview-children")
        .forEach(function (el) {
          el.classList.remove("expanded");
        });
      this._element.querySelectorAll(".treeview-toggle").forEach(function (el) {
        el.classList.remove("expanded");
        el.setAttribute("aria-expanded", "false");
      });
      this._updateIcons();
    }

    filter(term) {
      var lowerTerm = (term || "").toLowerCase().trim();
      var nodes = this._element.querySelectorAll(".treeview-node");

      if (!lowerTerm) {
        nodes.forEach(function (n) {
          n.classList.remove("hidden");
        });
        return;
      }

      // First hide all
      nodes.forEach(function (n) {
        n.classList.add("hidden");
      });

      // Show matching and their ancestors
      nodes.forEach(function (node) {
        var label = node.querySelector(".treeview-label");
        if (label && label.textContent.toLowerCase().includes(lowerTerm)) {
          node.classList.remove("hidden");
          // Show all ancestors
          var parent = node.parentElement;
          while (parent) {
            if (
              parent.classList &&
              parent.classList.contains("treeview-node")
            ) {
              parent.classList.remove("hidden");
              var children = parent.querySelector(".treeview-children");
              if (children) children.classList.add("expanded");
              var toggle = parent.querySelector(
                ":scope > .treeview-content > .treeview-toggle"
              );
              if (toggle) toggle.classList.add("expanded");
            }
            parent = parent.parentElement;
          }
        }
      });

      this._updateIcons();
    }

    dispose() {
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._element.classList.add("treeview");
      if (this._config.showLines) this._element.classList.add("treeview-lines");

      // Build from data if provided
      if (this._config.data) {
        this._buildFromData();
      } else {
        this._enhanceExistingHTML();
      }

      // Search
      if (this._config.searchable) {
        this._buildSearch();
      }

      // Expand all if configured
      if (this._config.expandAll) {
        this.expandAll();
      }

      // Bind events
      this._bindEvents();
    }

    _buildFromData() {
      var self = this;
      this._element.innerHTML = "";

      if (this._config.searchable) {
        // Search will be added later
      }

      var rootList = document.createElement("ul");
      rootList.className = "treeview-list";

      this._config.data.forEach(function (nodeData) {
        rootList.appendChild(self._createNode(nodeData));
      });

      this._element.appendChild(rootList);
    }

    _createNode(data) {
      var self = this;
      var li = document.createElement("li");
      li.className = "treeview-node";
      if (data.id) li.setAttribute("data-cnds-id", data.id);
      if (data.disabled) li.classList.add("disabled");

      var hasChildren = data.children && data.children.length > 0;

      // Content row
      var content = document.createElement("div");
      content.className = "treeview-content";
      content.setAttribute("tabindex", "0");
      content.setAttribute("role", "treeitem");
      content.setAttribute("aria-selected", "false");
      if (data.disabled) content.setAttribute("aria-disabled", "true");

      // Toggle
      if (hasChildren) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "treeview-toggle";
        toggle.setAttribute("aria-label", "Toggle");
        toggle.setAttribute("aria-expanded", "false");
        var chevron = document.createElement("i");
        chevron.className = "mdi mdi-chevron-right";
        chevron.setAttribute("aria-hidden", "true");
        toggle.appendChild(chevron);
        content.appendChild(toggle);
      } else {
        var spacer = document.createElement("span");
        spacer.className = "treeview-toggle-spacer";
        content.appendChild(spacer);
      }

      // Checkbox
      if (this._config.checkboxes) {
        var cbWrap = document.createElement("span");
        cbWrap.className = "treeview-checkbox";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "form-check-input";
        if (data.checked) cb.checked = true;
        cbWrap.appendChild(cb);
        content.appendChild(cbWrap);
      }

      // Icon
      if (this._config.icons) {
        var icon = document.createElement("span");
        icon.className = "treeview-icon";
        if (data.icon) {
          icon.innerHTML = data.icon;
          icon.dataset.cndsCustomIcon = "true";
        } else {
          icon.innerHTML = hasChildren
            ? this._config.folderIcon
            : this._config.fileIcon;
        }
        content.appendChild(icon);
      }

      // Label
      var label = document.createElement("span");
      label.className = "treeview-label";
      label.textContent = data.label || "";
      content.appendChild(label);

      li.appendChild(content);

      // Children
      if (hasChildren) {
        var childrenWrap = document.createElement("div");
        childrenWrap.className = "treeview-children";

        var childList = document.createElement("ul");
        childList.className = "treeview-list";
        childList.setAttribute("role", "group");

        data.children.forEach(function (childData) {
          childList.appendChild(self._createNode(childData));
        });

        childrenWrap.appendChild(childList);
        li.appendChild(childrenWrap);
      }

      return li;
    }

    _enhanceExistingHTML() {
      var self = this;

      // Find existing UL
      var rootList = this._element.querySelector("ul");
      if (!rootList) return;

      rootList.classList.add("treeview-list");
      rootList.setAttribute("role", "tree");

      this._enhanceList(rootList);
    }

    _enhanceList(ul) {
      var self = this;
      var items = ul.querySelectorAll(":scope > li");

      items.forEach(function (li) {
        li.classList.add("treeview-node");

        // .treeview-disabled on li or on a child <a> marks the node as disabled
        if (li.classList.contains("treeview-disabled")) {
          li.classList.add("disabled");
          li.classList.remove("treeview-disabled");
        }
        if (li.querySelector(":scope > a.treeview-disabled")) {
          li.classList.add("disabled");
        }

        var childUl = li.querySelector(":scope > ul");
        var hasChildren = !!childUl;

        // Wrap text content in a content div
        var content = document.createElement("div");
        content.className = "treeview-content";
        content.setAttribute("tabindex", "0");
        content.setAttribute("role", "treeitem");
        content.setAttribute("aria-selected", "false");
        if (li.classList.contains("disabled")) content.setAttribute("aria-disabled", "true");

        // Toggle
        var toggle = null;
        if (hasChildren) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "treeview-toggle";
          toggle.setAttribute("aria-label", "Toggle");
          toggle.setAttribute("aria-expanded", "false");
          var chevron = document.createElement("i");
          chevron.className = "mdi mdi-chevron-right";
          chevron.setAttribute("aria-hidden", "true");
          toggle.appendChild(chevron);
          content.appendChild(toggle);
        } else {
          var spacer = document.createElement("span");
          spacer.className = "treeview-toggle-spacer";
          content.appendChild(spacer);
        }

        // Checkbox
        if (self._config.checkboxes) {
          var cbWrap = document.createElement("span");
          cbWrap.className = "treeview-checkbox";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "form-check-input";
          cbWrap.appendChild(cb);
          content.appendChild(cbWrap);
        }

        // Detect custom icon HTML embedded in the original li:
        //   leaf pattern:   <li><i class="fas ..."> Label</li>
        //   parent pattern: <li><a><span aria-label="toggle"><i class="..."></i></span>Label</a><ul>
        var customIconHtml = null;
        if (self._config.icons) {
          // 1. Direct <i>/<svg> child of <li> (leaf nodes)
          for (var k = 0; k < li.childNodes.length; k++) {
            var cn = li.childNodes[k];
            if (cn.nodeType === 1 && (cn.tagName === "I" || cn.tagName === "SVG") && cn !== childUl) {
              customIconHtml = cn.outerHTML;
              break;
            }
          }
          // 2. Inside <a>: content of aria-label="toggle" span (parent nodes), or direct <i>/<svg>
          if (!customIconHtml) {
            var anchorEl = li.querySelector(":scope > a");
            if (anchorEl) {
              var toggleSpan = anchorEl.querySelector("[aria-label='toggle']");
              if (toggleSpan) {
                customIconHtml = toggleSpan.innerHTML;
              } else {
                var iconInA = anchorEl.querySelector(":scope > i, :scope > svg");
                if (iconInA) customIconHtml = iconInA.outerHTML;
              }
            }
          }
        }

        // Icon
        if (self._config.icons) {
          var icon = document.createElement("span");
          icon.className = "treeview-icon";
          if (customIconHtml) {
            icon.innerHTML = customIconHtml;
            icon.dataset.cndsCustomIcon = "true";
          } else {
            icon.innerHTML = hasChildren
              ? self._config.folderIcon
              : self._config.fileIcon;
          }
          content.appendChild(icon);
        }

        // Label — clone the li, strip the nested UL and any aria-label="toggle"
        // spans (v8-style custom toggle icons), then read the remaining text.
        // This handles plain text nodes, <a> wrappers, and inline icon elements.
        var liClone = li.cloneNode(true);
        var ulInClone = liClone.querySelector(":scope > ul");
        if (ulInClone) ulInClone.remove();
        liClone.querySelectorAll("[aria-label='toggle']").forEach(function (s) {
          s.remove();
        });
        var labelText = liClone.textContent.trim();

        var label = document.createElement("span");
        label.className = "treeview-label";
        label.textContent = labelText;
        content.appendChild(label);

        // Remove all non-UL direct children (text nodes, <a>, <i>, etc.)
        var toRemove = [];
        for (var j = 0; j < li.childNodes.length; j++) {
          if (li.childNodes[j] !== childUl) {
            toRemove.push(li.childNodes[j]);
          }
        }
        toRemove.forEach(function (n) {
          n.remove();
        });

        // Insert content at beginning
        li.insertBefore(content, li.firstChild);

        // Wrap child UL in children container; honour class="show" as pre-expanded
        if (childUl) {
          var wasOpen = childUl.classList.contains("show");
          childUl.classList.add("treeview-list");
          childUl.setAttribute("role", "group");
          childUl.classList.remove("show");

          var childrenWrap = document.createElement("div");
          childrenWrap.className = "treeview-children";
          if (wasOpen) {
            childrenWrap.classList.add("expanded");
            if (toggle) {
              toggle.classList.add("expanded");
              toggle.setAttribute("aria-expanded", "true");
            }
          }
          li.insertBefore(childrenWrap, childUl);
          childrenWrap.appendChild(childUl);

          // Recurse
          self._enhanceList(childUl);
        }
      });
    }

    _buildSearch() {
      var self = this;
      var searchDiv = document.createElement("div");
      searchDiv.className = "treeview-search";

      this._searchInput = document.createElement("input");
      this._searchInput.type = "text";
      this._searchInput.placeholder = "Search...";
      this._searchInput.setAttribute("aria-label", "Search tree");
      searchDiv.appendChild(this._searchInput);

      this._element.insertBefore(searchDiv, this._element.firstChild);

      var debounce;
      EventHandler.on(this._searchInput, "input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          self.filter(self._searchInput.value);
        }, 200);
      });
    }

    _bindEvents() {
      var self = this;

      // Delegate clicks
      EventHandler.on(this._element, "click", function (e) {
        var toggle = e.target.closest(".treeview-toggle");
        if (toggle) {
          e.preventDefault();
          e.stopPropagation();
          self._toggleNode(toggle);
          return;
        }

        var content = e.target.closest(".treeview-content");
        if (content && self._config.selectable) {
          self._selectNode(content);
        }
      });

      // Checkbox changes
      if (this._config.checkboxes) {
        EventHandler.on(this._element, "change", function (e) {
          if (
            e.target.type === "checkbox" &&
            e.target.closest(".treeview-checkbox")
          ) {
            self._handleCheckbox(e.target);
          }
        });
      }

      // Keyboard
      EventHandler.on(this._element, "keydown", function (e) {
        var content = e.target.closest(".treeview-content");
        if (!content) return;

        switch (e.key) {
          case "Enter":
          case " ":
            e.preventDefault();
            if (self._config.selectable) self._selectNode(content);
            break;
          case "ArrowRight": {
            e.preventDefault();
            var toggle = content.querySelector(".treeview-toggle");
            if (toggle && !toggle.classList.contains("expanded")) {
              self._toggleNode(toggle);
            }
            break;
          }
          case "ArrowLeft": {
            e.preventDefault();
            var toggleL = content.querySelector(".treeview-toggle");
            if (toggleL && toggleL.classList.contains("expanded")) {
              self._toggleNode(toggleL);
            }
            break;
          }
          case "ArrowDown": {
            e.preventDefault();
            var next = self._getNextVisibleContent(content);
            if (next) next.focus();
            break;
          }
          case "ArrowUp": {
            e.preventDefault();
            var prev = self._getPrevVisibleContent(content);
            if (prev) prev.focus();
            break;
          }
        }
      });
    }

    _toggleNode(toggle) {
      var node = toggle.closest(".treeview-node");
      var children = node.querySelector(":scope > .treeview-children");
      if (!children) return;

      var isExpanded = toggle.classList.contains("expanded");

      // Accordion mode
      if (this._config.accordion && !isExpanded) {
        var siblings = node.parentElement.querySelectorAll(
          ":scope > .treeview-node"
        );
        var self = this;
        siblings.forEach(function (sib) {
          if (sib !== node) {
            var sibToggle = sib.querySelector(
              ":scope > .treeview-content > .treeview-toggle"
            );
            var sibChildren = sib.querySelector(":scope > .treeview-children");
            if (sibToggle) sibToggle.classList.remove("expanded");
            if (sibChildren) sibChildren.classList.remove("expanded");
          }
        });
      }

      toggle.classList.toggle("expanded");
      children.classList.toggle("expanded");
      toggle.setAttribute("aria-expanded", toggle.classList.contains("expanded").toString());

      // Also clear aria-expanded on accordion siblings that were collapsed
      if (this._config.accordion) {
        node.parentElement.querySelectorAll(":scope > .treeview-node").forEach(function (sib) {
          if (sib !== node) {
            var sibToggle = sib.querySelector(":scope > .treeview-content > .treeview-toggle");
            if (sibToggle) sibToggle.setAttribute("aria-expanded", "false");
          }
        });
      }

      this._updateIcons();

      var eventName = toggle.classList.contains("expanded")
        ? EVENT_EXPAND
        : EVENT_COLLAPSE;
      EventHandler.trigger(this._element, eventName, {
        node: node,
        label: node.querySelector(".treeview-label").textContent.trim()
      });
    }

    _selectNode(content) {
      // Deselect previous
      var prev = this._element.querySelector(".treeview-content.selected");
      if (prev) {
        prev.classList.remove("selected");
        prev.setAttribute("aria-selected", "false");
      }

      content.classList.add("selected");
      content.setAttribute("aria-selected", "true");
      this._selectedNode = content.closest(".treeview-node");

      EventHandler.trigger(this._element, EVENT_SELECT, {
        node: this._selectedNode,
        label: content.querySelector(".treeview-label").textContent.trim()
      });
    }

    _handleCheckbox(checkbox) {
      var node = checkbox.closest(".treeview-node");

      // Cascade to children
      var childCheckboxes = node.querySelectorAll(
        ".treeview-children .treeview-checkbox input"
      );
      childCheckboxes.forEach(function (cb) {
        cb.checked = checkbox.checked;
        cb.indeterminate = false;
      });

      // Update parent state
      this._updateParentCheckbox(node);

      EventHandler.trigger(this._element, EVENT_CHECK, {
        node: node,
        checked: checkbox.checked,
        allChecked: this.getChecked()
      });
    }

    _updateParentCheckbox(node) {
      var parentNode = node.parentElement.closest(".treeview-node");
      if (!parentNode) return;

      var parentCb = parentNode.querySelector(
        ":scope > .treeview-content .treeview-checkbox input"
      );
      if (!parentCb) return;

      var childCbs = parentNode.querySelectorAll(
        ".treeview-children .treeview-checkbox input"
      );
      var total = childCbs.length;
      var checked = 0;
      childCbs.forEach(function (cb) {
        if (cb.checked) checked++;
      });

      if (checked === 0) {
        parentCb.checked = false;
        parentCb.indeterminate = false;
      } else if (checked === total) {
        parentCb.checked = true;
        parentCb.indeterminate = false;
      } else {
        parentCb.checked = false;
        parentCb.indeterminate = true;
      }

      // Recurse up
      this._updateParentCheckbox(parentNode);
    }

    _updateIcons() {
      if (!this._config.icons) return;
      var self = this;
      this._element.querySelectorAll(".treeview-node").forEach(function (node) {
        var icon = node.querySelector(
          ":scope > .treeview-content > .treeview-icon"
        );
        if (!icon || icon.dataset.cndsCustomIcon) return;
        var toggle = node.querySelector(
          ":scope > .treeview-content > .treeview-toggle"
        );
        var hasChildren = !!node.querySelector(":scope > .treeview-children");
        if (!hasChildren) return;
        var isExpanded = toggle && toggle.classList.contains("expanded");
        icon.innerHTML = isExpanded
          ? self._config.folderOpenIcon
          : self._config.folderIcon;
      });
    }

    _getNextVisibleContent(current) {
      var allContents = Array.from(
        this._element.querySelectorAll(".treeview-content")
      );
      var visible = allContents.filter(function (c) {
        return c.offsetParent !== null && !c.closest(".treeview-node.hidden");
      });
      var idx = visible.indexOf(current);
      return idx < visible.length - 1 ? visible[idx + 1] : null;
    }

    _getPrevVisibleContent(current) {
      var allContents = Array.from(
        this._element.querySelectorAll(".treeview-content")
      );
      var visible = allContents.filter(function (c) {
        return c.offsetParent !== null && !c.closest(".treeview-node.hidden");
      });
      var idx = visible.indexOf(current);
      return idx > 0 ? visible[idx - 1] : null;
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Treeview.getInstance(this);
        if (!instance) {
          instance = new Treeview(
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

  // Auto-init
  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-treeview-init]").forEach(function (el) {
      if (!Treeview.getInstance(el)) {
        new Treeview(el);
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
  window.Nimbus.Treeview = Treeview;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Treeview);
  }
})();
