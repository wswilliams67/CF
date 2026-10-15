/**
 * ============================================================
 * CNDS Transfer Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Dual-list transfer for moving items between two panels.
 *
 * Usage:
 *   <div data-cnds-transfer-init
 *        data-cnds-source='[{"value":"1","label":"Item 1"}]'
 *        data-cnds-target-items='[]'>
 *   </div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "transfer";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  const Default = {
    sourceTitle: "Source",
    targetTitle: "Target",
    sourceItems: [],
    targetItems: [],
    searchable: true,
    selectAll: true
  };

  const DefaultType = {
    sourceTitle: "string",
    targetTitle: "string",
    sourceItems: "array",
    targetItems: "array",
    searchable: "boolean",
    selectAll: "boolean"
  };

  class Transfer extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._sourceItems = [];
      this._targetItems = [];
      this._sourceSelected = new Set();
      this._targetSelected = new Set();
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

    getSourceItems() {
      return this._sourceItems.slice();
    }
    getTargetItems() {
      return this._targetItems.slice();
    }

    moveToTarget() {
      var self = this;
      this._sourceSelected.forEach(function (val) {
        var idx = self._sourceItems.findIndex(function (i) {
          return i.value === val;
        });
        if (idx !== -1) {
          self._targetItems.push(self._sourceItems.splice(idx, 1)[0]);
        }
      });
      this._sourceSelected.clear();
      this._render();
      this._triggerChange();
    }

    moveToSource() {
      var self = this;
      this._targetSelected.forEach(function (val) {
        var idx = self._targetItems.findIndex(function (i) {
          return i.value === val;
        });
        if (idx !== -1) {
          self._sourceItems.push(self._targetItems.splice(idx, 1)[0]);
        }
      });
      this._targetSelected.clear();
      this._render();
      this._triggerChange();
    }

    moveAllToTarget() {
      this._targetItems = this._targetItems.concat(this._sourceItems);
      this._sourceItems = [];
      this._sourceSelected.clear();
      this._render();
      this._triggerChange();
    }

    moveAllToSource() {
      this._sourceItems = this._sourceItems.concat(this._targetItems);
      this._targetItems = [];
      this._targetSelected.clear();
      this._render();
      this._triggerChange();
    }

    dispose() {
      super.dispose();
    }

    _init() {
      this._element.classList.add("transfer");

      // Parse items from data attributes
      var srcAttr = this._element.getAttribute("data-cnds-source");
      var tgtAttr = this._element.getAttribute("data-cnds-target-items");
      if (srcAttr)
        try {
          this._config.sourceItems = JSON.parse(srcAttr);
        } catch (e) {
          /* */
        }
      if (tgtAttr)
        try {
          this._config.targetItems = JSON.parse(tgtAttr);
        } catch (e) {
          /* */
        }

      this._sourceItems = this._config.sourceItems.slice();
      this._targetItems = this._config.targetItems.slice();

      this._render();
    }

    _render() {
      this._element.innerHTML = "";

      var sourcePanel = this._buildPanel(
        "source",
        this._config.sourceTitle,
        this._sourceItems,
        this._sourceSelected
      );
      var actions = this._buildActions();
      var targetPanel = this._buildPanel(
        "target",
        this._config.targetTitle,
        this._targetItems,
        this._targetSelected
      );

      this._element.appendChild(sourcePanel);
      this._element.appendChild(actions);
      this._element.appendChild(targetPanel);
    }

    _buildPanel(side, title, items, selected) {
      var self = this;
      var panel = document.createElement("div");
      panel.className = "transfer-panel";

      // Header
      var header = document.createElement("div");
      header.className = "transfer-header";
      var headerLeft = document.createElement("div");
      headerLeft.className = "transfer-header-check";

      if (this._config.selectAll) {
        var selectAll = document.createElement("input");
        selectAll.type = "checkbox";
        selectAll.addEventListener("change", function () {
          if (selectAll.checked) {
            items.forEach(function (i) {
              if (!i.disabled) selected.add(i.value);
            });
          } else {
            selected.clear();
          }
          self._renderList(list, items, selected);
        });
        headerLeft.appendChild(selectAll);
      }

      var titleSpan = document.createElement("span");
      titleSpan.textContent = title;
      headerLeft.appendChild(titleSpan);

      var count = document.createElement("span");
      count.className = "transfer-count";
      count.textContent = selected.size + "/" + items.length;

      header.appendChild(headerLeft);
      header.appendChild(count);
      panel.appendChild(header);

      // Search
      if (this._config.searchable) {
        var searchDiv = document.createElement("div");
        searchDiv.className = "transfer-search";
        var searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search...";
        searchInput.addEventListener("input", function () {
          self._filterList(list, items, searchInput.value.toLowerCase().trim());
        });
        searchDiv.appendChild(searchInput);
        panel.appendChild(searchDiv);
      }

      // List
      var list = document.createElement("ul");
      list.className = "transfer-list";
      this._renderList(list, items, selected);
      panel.appendChild(list);

      return panel;
    }

    _renderList(list, items, selected) {
      var self = this;
      list.innerHTML = "";
      items.forEach(function (item) {
        var li = document.createElement("li");
        li.className = "transfer-item";
        if (item.disabled) li.classList.add("disabled");
        if (selected.has(item.value)) li.classList.add("selected");

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(item.value);
        if (item.disabled) cb.disabled = true;
        cb.addEventListener("change", function () {
          if (cb.checked) {
            selected.add(item.value);
            li.classList.add("selected");
          } else {
            selected.delete(item.value);
            li.classList.remove("selected");
          }
        });

        var label = document.createElement("span");
        label.textContent = item.label || item.value;

        li.appendChild(cb);
        li.appendChild(label);
        li.addEventListener("click", function (e) {
          if (e.target === cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        });
        list.appendChild(li);
      });
    }

    _filterList(list, items, term) {
      var children = list.querySelectorAll(".transfer-item");
      children.forEach(function (li, idx) {
        var text = li.textContent.toLowerCase();
        li.style.display = !term || text.includes(term) ? "" : "none";
      });
    }

    _buildActions() {
      var self = this;
      var div = document.createElement("div");
      div.className = "transfer-actions";

      var moveRight = this._createBtn(
        "›",
        "Move selected to target",
        function () {
          self.moveToTarget();
        }
      );
      var moveAllRight = this._createBtn(
        "»",
        "Move all to target",
        function () {
          self.moveAllToTarget();
        }
      );
      var moveLeft = this._createBtn(
        "‹",
        "Move selected to source",
        function () {
          self.moveToSource();
        }
      );
      var moveAllLeft = this._createBtn("«", "Move all to source", function () {
        self.moveAllToSource();
      });

      div.appendChild(moveAllRight);
      div.appendChild(moveRight);
      div.appendChild(moveLeft);
      div.appendChild(moveAllLeft);
      return div;
    }

    _createBtn(text, label, handler) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "transfer-btn";
      btn.textContent = text;
      btn.setAttribute("aria-label", label);
      btn.addEventListener("click", handler);
      return btn;
    }

    _triggerChange() {
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        source: this._sourceItems.slice(),
        target: this._targetItems.slice()
      });
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Transfer.getInstance(this);
        if (!instance)
          instance = new Transfer(
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
    root.querySelectorAll("[data-cnds-transfer-init]").forEach(function (el) {
      if (!Transfer.getInstance(el)) new Transfer(el);
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
  window.Nimbus.Transfer = Transfer;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, Transfer);
})();
