/**
 * ============================================================
 * CNDS DataTable Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Enhanced data table with sorting, filtering, pagination,
 * row selection, column visibility, CSV export, and loading states.
 *
 * Usage:
 *   <div data-cnds-datatable-init>
 *     <table class="table">...</table>
 *   </div>
 *
 * Or programmatic (v9 style):
 *   const dt = new Nimbus.DataTable(element, { columns, data, entriesPerPage: 10 });
 *
 * Or programmatic (v8-compatible style):
 *   const dt = new Nimbus.DataTable(element, { columns, rows }, { loading: true, hover: true });
 *
 * String columns and array rows are normalised automatically:
 *   columns: ['Name', 'Age']  →  [{ label: 'Name', field: 'name' }, ...]
 *   rows: [['Alice', 30], ...]  →  [{ name: 'Alice', age: 30 }, ...]
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, SelectorEngine, NimbusComponent } =
    window.Nimbus;

  const NAME = "datatable";
  const EVENT_KEY = `.cnds.${NAME}`;

  // Events
  const EVENT_SORT       = `sort${EVENT_KEY}`;
  const EVENT_SEARCH     = `search${EVENT_KEY}`;
  const EVENT_PAGE       = `page${EVENT_KEY}`;
  const EVENT_SELECT     = `select${EVENT_KEY}`;
  const EVENT_SELECT_ROWS = `selectRows${EVENT_KEY}`;   // v8 compat alias
  const EVENT_UPDATE     = `update${EVENT_KEY}`;
  const EVENT_RENDER     = `render${EVENT_KEY}`;        // v8 compat: fires after each _renderBody
  const EVENT_ROW_CLICKED = `rowClicked${EVENT_KEY}`;   // v8 compat: fires on tr click when clickableRows

  const Default = {
    entries: 10,
    entriesOptions: [5, 10, 25, 50, 100],
    search: true,
    pagination: true,
    noDataText: "No matching records found",
    sortable: true,
    selectable: false,
    striped: false,
    bordered: false,
    sm: false,
    fixedHeader: false,
    loading: false,
    hover: false,         // adds datatable-hover class (v8 compat)
    clickableRows: false, // fires rowClicked event on tr click (v8 compat)
    maxHeight: null,      // px or CSS string — constrains datatable-inner height
    maxWidth: null,       // px or CSS string — constrains datatable-inner width
    sortField: null,      // field name for initial sort (v8 compat data-cnds-sort-field)
    sortOrder: "asc",     // initial sort direction: 'asc' | 'desc' (v8 compat)
    columns: null,        // Array of column configs: [{ label, field, sortable, width, fixed, format }]
    data: null            // Array of row data objects (for JS-driven mode)
  };

  const DefaultType = {
    entries: "number",
    entriesOptions: "array",
    search: "boolean",
    pagination: "boolean",
    noDataText: "string",
    sortable: "boolean",
    selectable: "boolean",
    striped: "boolean",
    bordered: "boolean",
    sm: "boolean",
    fixedHeader: "boolean",
    loading: "boolean",
    hover: "boolean",
    clickableRows: "boolean",
    maxHeight: "(number|string|null)",
    maxWidth: "(number|string|null)",
    sortField: "(string|null)",
    sortOrder: "string",
    columns: "(array|null)",
    data: "(array|null)"
  };

  class DataTable extends NimbusComponent {
    /**
     * @param {HTMLElement} element
     * @param {Object} dataOrConfig  — config object, or { columns, rows } data object (v8 compat)
     * @param {Object} [options]     — extra options when 3-arg pattern is used (v8 compat)
     */
    constructor(element, dataOrConfig = {}, options = null) {
      // ── Normalise 3-arg pattern ──────────────────────────────
      // v8: new DataTable(el, { columns, rows }, { loading, hover })
      let config = (options !== null && typeof options === "object")
        ? Object.assign({}, options, dataOrConfig)
        : dataOrConfig;

      // ── rows: → data: alias ──────────────────────────────────
      if (config.rows !== undefined && config.data === undefined) {
        config = Object.assign({}, config, { data: config.rows });
      }

      super(element, config);

      // ── Instance state ───────────────────────────────────────
      this._table = null;
      this._thead = null;
      this._tbody = null;
      this._headerRow = null;
      this._allRows = [];
      this._filteredRows = [];
      this._sortColumn = -1;
      this._sortDirection = "none";
      this._currentPage = 1;
      this._searchTerm = "";
      this._searchColumns = null; // column-scoped search (v8 compat)
      this._selectedRows = new Set();

      // ── UI elements ──────────────────────────────────────────
      this._headerEl = null;
      this._footerEl = null;
      this._searchInput = null;
      this._entriesSelect = null;
      this._entriesSelectInstance = null;
      this._paginationEl = null;
      this._paginationNavEl = null;
      this._firstBtn = null;
      this._prevBtn = null;
      this._nextBtn = null;
      this._lastBtn = null;
      this._loadingEl = null;
      this._innerEl = null;
      this._selectAllCheckbox = null;

      // ── Normalise string columns → object columns ────────────
      if (Array.isArray(this._config.columns)) {
        this._config.columns = this._config.columns.map((col) =>
          typeof col === "string"
            ? { label: col, field: col.toLowerCase() }
            : col
        );
      }

      // ── Normalise array rows → object rows ───────────────────
      if (
        Array.isArray(this._config.data) &&
        Array.isArray(this._config.columns)
      ) {
        this._config.data = this._config.data.map((row) => {
          if (!Array.isArray(row)) return row;
          const obj = {};
          this._config.columns.forEach((col, i) => {
            obj[col.field] = row[i] !== undefined ? row[i] : "";
          });
          return obj;
        });
      }

      this._init();
    }

    // --- Static ---

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

    /**
     * Update the table data and/or options programmatically (v8 compat).
     * @param {Object|Array|null} data — { rows: [...] } or Array of row objects, or null
     * @param {Object} [options]       — any config options to update (e.g. { loading: false })
     */
    update(data, options = {}) {
      // Merge option overrides into live config
      if (options && typeof options === "object") {
        Object.assign(this._config, options);
      }

      if (data) {
        // Accept { rows: [...] }, { data: [...] }, or a bare Array
        let rows = null;
        if (Array.isArray(data)) {
          rows = data;
        } else if (data.rows !== undefined) {
          rows = data.rows;
        } else if (data.data !== undefined) {
          rows = data.data;
        }

        if (rows !== null) {
          // Normalise array rows
          if (Array.isArray(this._config.columns)) {
            rows = rows.map((row) => {
              if (!Array.isArray(row)) return row;
              const obj = {};
              this._config.columns.forEach((col, i) => {
                obj[col.field] = row[i] !== undefined ? row[i] : "";
              });
              return obj;
            });
          }
          this._config.data = rows;
          this._buildFromData();
          this._collectRows();
          this._applySearch();
          this._render();
        }
      }

      // Handle loading flag from options
      if (options.loading === false) {
        this.hideLoading();
      } else if (options.loading === true) {
        this.showLoading();
      }

      EventHandler.trigger(this._element, EVENT_UPDATE, { data });
    }

    /**
     * Update the table data programmatically (v9 original method).
     * @param {Array} data - Array of row objects
     */
    setData(data) {
      this._config.data = data;
      this._buildFromData();
      this._collectRows();
      this._applySearch();
      this._render();
      EventHandler.trigger(this._element, EVENT_UPDATE, { data });
    }

    /**
     * Search the table.
     * @param {string} term
     * @param {string[]} [columns] — optional array of field names to restrict search to (v8 compat)
     */
    search(term, columns) {
      this._searchTerm = term.toLowerCase().trim();
      this._searchColumns = (Array.isArray(columns) && columns.length) ? columns : null;
      if (this._searchInput) {
        this._searchInput.value = term;
      }
      this._currentPage = 1;
      this._applySearch();
      this._render();
      EventHandler.trigger(this._element, EVENT_SEARCH, { term });
    }

    /**
     * Sort by column index.
     * @param {number} columnIndex
     * @param {string} [direction='asc']
     */
    sort(columnIndex, direction = "asc") {
      this._sortColumn = columnIndex;
      this._sortDirection = direction;
      this._applySort();
      this._render();
      EventHandler.trigger(this._element, EVENT_SORT, {
        column: columnIndex,
        direction
      });
    }

    /** Go to a specific page. */
    goToPage(page) {
      const totalPages = this._getTotalPages();
      if (page < 1 || page > totalPages) return;
      this._currentPage = page;
      this._render();
      EventHandler.trigger(this._element, EVENT_PAGE, { page });
    }

    /** Get selected row indices. */
    getSelectedRows() {
      return [...this._selectedRows];
    }

    /** Get selected row data. */
    getSelectedData() {
      return this._filteredRows.filter((_, i) => this._selectedRows.has(i));
    }

    /** Select all visible rows on the current page. */
    selectAll() {
      const start = (this._currentPage - 1) * this._config.entries;
      const end = start + this._config.entries;
      for (let i = start; i < Math.min(end, this._filteredRows.length); i++) {
        this._selectedRows.add(i);
      }
      this._renderBody();
      this._updateSelectAll();
    }

    /** Deselect all rows. */
    deselectAll() {
      this._selectedRows.clear();
      this._renderBody();
      this._updateSelectAll();
    }

    /** Show loading overlay. */
    showLoading() {
      if (this._loadingEl) {
        this._loadingEl.classList.add("show");
      }
    }

    /** Hide loading overlay. */
    hideLoading() {
      if (this._loadingEl) {
        this._loadingEl.classList.remove("show");
      }
    }

    /**
     * Export table data to CSV.
     * @param {string} [filename='data.csv']
     */
    exportCSV(filename = "data.csv") {
      const headers = this._getHeaderLabels();
      const rows = this._filteredRows.map((row) =>
        this._getCellValues(row).map((val) => {
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        })
      );

      const csv = [headers.map((h) => `"${h}"`).join(",")]
        .concat(rows.map((r) => r.join(",")))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    /** Refresh / re-render the table. */
    refresh() {
      this._collectRows();
      this._applySearch();
      this._render();
    }

    dispose() {
      if (this._entriesSelectInstance) {
        this._entriesSelectInstance.dispose();
        this._entriesSelectInstance = null;
      }
      if (this._headerEl) this._headerEl.remove();
      if (this._footerEl) this._footerEl.remove();
      if (this._loadingEl) this._loadingEl.remove();

      this._element.classList.remove(
        "datatable",
        "datatable-striped",
        "datatable-bordered",
        "datatable-sm",
        "datatable-hover",
        "datatable-fixed-header",
        "datatable-clickable-rows"
      );

      if (this._innerEl && this._innerEl.parentNode === this._element) {
        this._element.insertBefore(this._table, this._innerEl);
        this._innerEl.remove();
      }

      super.dispose();
    }

    // --- Private ---

    _init() {
      // Resolve this._element (wrapper div) and this._table (<table> element).
      //
      // Three cases:
      //  a) element is a <div> that already contains a <table>  → use that table
      //  b) element is a <div> with no table inside             → create <table> inside it
      //  c) element IS a <table>                                → wrap it in a new <div>
      this._table = this._element.querySelector("table");

      if (!this._table) {
        if (this._element.tagName === "TABLE") {
          // Case c: table passed directly — wrap it
          const wrapper = document.createElement("div");
          this._element.parentNode.insertBefore(wrapper, this._element);
          wrapper.appendChild(this._element);
          this._table = this._element;
          this._element = wrapper;
        } else {
          // Case b: container div with no table — create one inside
          this._table = document.createElement("table");
          this._table.className = "table";
          this._element.appendChild(this._table);
        }
      }
      // Case a falls through with this._table already set above.

      // Ensure every datatable table carries the "table" base class so that
      // component/tables.css rules (cell backgrounds, border-color, etc.)
      // apply consistently regardless of whether the table was pre-existing
      // HTML markup or created dynamically.
      this._table.classList.add("table");

      this._thead = this._table.querySelector("thead");
      this._tbody = this._table.querySelector("tbody");

      if (!this._thead) {
        this._thead = document.createElement("thead");
        this._table.insertBefore(this._thead, this._table.firstChild);
      }
      if (!this._tbody) {
        this._tbody = document.createElement("tbody");
        this._table.appendChild(this._tbody);
      }

      this._headerRow = this._thead.querySelector("tr");

      // Wrapper classes
      this._element.classList.add("datatable");
      if (this._config.striped)       this._element.classList.add("datatable-striped");
      if (this._config.bordered)      this._element.classList.add("datatable-bordered");
      if (this._config.sm)            this._element.classList.add("datatable-sm");
      if (this._config.hover)         this._element.classList.add("datatable-hover");
      if (this._config.clickableRows) this._element.classList.add("datatable-clickable-rows");

      // Build from JS data if provided
      if (this._config.data && this._config.columns) {
        this._buildFromData();
      }

      this._collectRows();
      this._buildHeader();
      this._wrapTable();
      this._buildFooter();
      this._buildLoading();
      this._setupSortableHeaders();

      if (this._config.selectable) {
        this._addCheckboxColumn();
      }

      // Set up clickable-rows event delegation
      if (this._config.clickableRows) {
        EventHandler.on(this._element, "click", (e) => {
          const tr = e.target.closest("tbody tr");
          if (!tr || tr.classList.contains("datatable-nodata")) return;
          const visibleRows = Array.from(
            this._tbody.querySelectorAll("tr:not(.datatable-nodata)")
          );
          const pageIdx = visibleRows.indexOf(tr);
          if (pageIdx < 0) return;
          const globalIdx =
            (this._currentPage - 1) * this._config.entries + pageIdx;
          const event = new CustomEvent(EVENT_ROW_CLICKED, {
            bubbles: true,
            cancelable: true
          });
          event.index = globalIdx;
          this._element.dispatchEvent(event);
        });
      }

      this._applySearch();

      // Apply initial sort from sortField / sortOrder config
      if (this._config.sortField && Array.isArray(this._config.columns)) {
        const colIdx = this._config.columns.findIndex(
          (col) => col.field === this._config.sortField
        );
        if (colIdx >= 0) {
          this._sortColumn = colIdx;
          this._sortDirection = this._config.sortOrder || "asc";
          this._applySort();
          if (this._headerRow) {
            const th = this._headerRow.querySelectorAll("th")[colIdx];
            if (th) {
              th.classList.add(`sort-${this._sortDirection}`);
              th.setAttribute(
                "aria-sort",
                this._sortDirection === "asc" ? "ascending" : "descending"
              );
              const icon = th.querySelector(".datatable-sort-icon");
              if (icon) icon.style.transform = this._sortDirection === "desc" ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)";
            }
          }
        }
      }

      this._render();

      if (this._config.loading) {
        this.showLoading();
      }
    }

    /**
     * Build table header and body from JS data (columns + data arrays).
     * Supports:
     *   - col.sort / col.sortable  (both disable sort when false)
     *   - col.fixed: true → .fixed-left, col.fixed: 'right' → .fixed-right
     *   - col.width: number (px) or CSS string
     *   - col.format(cell, value, rowData) — v8-compatible:
     *       modify cell in-place (no return) OR return a string to use as content
     */
    _buildFromData() {
      const { columns, data } = this._config;
      if (!columns || !data) return;

      // Header
      this._thead.innerHTML = "";
      const headerRow = document.createElement("tr");
      columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label || col.field || "";

        if (col.width) {
          const w = typeof col.width === "number" ? col.width + "px" : col.width;
          th.style.width = w;
          th.style.minWidth = w;
        }
        // Disable sort with either 'sortable' (v9) or 'sort' (v8) property
        if (col.sort === false || col.sortable === false) {
          th.setAttribute("data-cnds-sort", "false");
        }
        // Fixed column pinning
        if (col.fixed === true)      th.classList.add("fixed-left");
        if (col.fixed === "right")   th.classList.add("fixed-right");

        headerRow.appendChild(th);
      });
      this._thead.appendChild(headerRow);
      this._headerRow = headerRow;

      // Body
      this._tbody.innerHTML = "";
      data.forEach((rowData) => {
        const tr = document.createElement("tr");
        columns.forEach((col) => {
          const td = document.createElement("td");

          // Fixed column pinning on data cells too
          if (col.fixed === true)    td.classList.add("fixed-left");
          if (col.fixed === "right") td.classList.add("fixed-right");

          const rawValue =
            rowData[col.field] != null ? rowData[col.field] : "";

          if (typeof col.format === "function") {
            // v8-compatible: format(cell, value, rowData)
            // If format returns a truthy string → use it as content.
            // If it returns undefined → assumes cell was modified in-place.
            td.textContent = rawValue; // seed with raw value first
            const result = col.format(td, rawValue, rowData);
            if (result !== undefined && result !== null) {
              // Returned a value — use it (HTML or plain text)
              if (typeof result === "string" && result.includes("<")) {
                td.innerHTML = result;
              } else {
                td.textContent = result;
              }
            }
            // else: cell was modified in-place by format(), leave it
          } else {
            const value = rawValue;
            if (typeof value === "string" && value.includes("<")) {
              td.innerHTML = value;
            } else {
              td.textContent = value;
            }
          }

          tr.appendChild(td);
        });
        this._tbody.appendChild(tr);
      });
    }

    /** Collect all body rows into internal array. */
    _collectRows() {
      this._allRows = Array.from(this._tbody.querySelectorAll("tr"));
      this._filteredRows = [...this._allRows];
    }

    /** Build the header toolbar (search input only). */
    _buildHeader() {
      if (!this._config.search) return;

      this._headerEl = document.createElement("div");
      this._headerEl.className = "datatable-header";

      const right = document.createElement("div");
      right.className = "datatable-header-right";

      const searchDiv = document.createElement("div");
      searchDiv.className = "datatable-search";

      const fieldDiv = document.createElement("div");
      fieldDiv.className = "cf-input-field cf-input-field-sm";

      const wrapperDiv = document.createElement("div");
      wrapperDiv.className = "cf-input-wrapper";

      this._searchInput = document.createElement("input");
      this._searchInput.type = "text";
      this._searchInput.className = "cf-input-control";
      this._searchInput.placeholder = "Search ...";
      this._searchInput.setAttribute("aria-label", "Search table");

      const iconEl = document.createElement("i");
      iconEl.className = "cf-input-icon mdi mdi-magnify";

      wrapperDiv.appendChild(this._searchInput);
      wrapperDiv.appendChild(iconEl);
      fieldDiv.appendChild(wrapperDiv);
      searchDiv.appendChild(fieldDiv);
      right.appendChild(searchDiv);

      let debounceTimer;
      EventHandler.on(this._searchInput, "input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this._searchTerm = this._searchInput.value.toLowerCase().trim();
          this._searchColumns = null;
          this._currentPage = 1;
          this._applySearch();
          this._render();
          EventHandler.trigger(this._element, EVENT_SEARCH, {
            term: this._searchTerm
          });
        }, 250);
      });

      this._headerEl.appendChild(right);
      this._element.insertBefore(this._headerEl, this._element.firstChild);
    }

    /**
     * Wrap the table in a scrollable container.
     * Applies maxHeight / maxWidth / fixedHeader config.
     */
    _wrapTable() {
      this._innerEl = document.createElement("div");
      this._innerEl.className = "datatable-inner";

      if (this._config.maxHeight) {
        this._innerEl.style.maxHeight =
          typeof this._config.maxHeight === "number"
            ? this._config.maxHeight + "px"
            : this._config.maxHeight;
        this._innerEl.style.overflowY = "auto";
      }
      if (this._config.maxWidth) {
        this._innerEl.style.maxWidth =
          typeof this._config.maxWidth === "number"
            ? this._config.maxWidth + "px"
            : this._config.maxWidth;
        this._innerEl.style.overflowX = "auto";
        this._table.style.width = "max-content";
      }
      if (this._config.fixedHeader) {
        this._element.classList.add("datatable-fixed-header");
      }

      this._element.insertBefore(this._innerEl, this._table);
      this._innerEl.appendChild(this._table);
    }

    /** Build the footer (v8-style: rows-per-page + nav + prev/next). */
    _buildFooter() {
      if (!this._config.pagination) return;

      this._footerEl = document.createElement("div");
      this._footerEl.className = "datatable-footer";

      this._paginationEl = document.createElement("div");
      this._paginationEl.className = "datatable-pagination";

      // Rows per page selector
      const selectWrapper = document.createElement("div");
      selectWrapper.className = "datatable-select-wrapper";

      const selectText = document.createElement("p");
      selectText.className = "datatable-select-text";
      selectText.textContent = "Rows per page:";

      this._entriesSelect = document.createElement("select");
      this._entriesSelect.name = "entries";
      this._entriesSelect.className = "";
      this._config.entriesOptions.forEach((n) => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        if (n === this._config.entries) opt.selected = true;
        this._entriesSelect.appendChild(opt);
      });

      selectWrapper.appendChild(selectText);
      selectWrapper.appendChild(this._entriesSelect);
      this._paginationEl.appendChild(selectWrapper);

      // Nav text: "1-10 of 57"
      this._paginationNavEl = document.createElement("div");
      this._paginationNavEl.className = "datatable-pagination-nav";
      this._paginationEl.appendChild(this._paginationNavEl);

      // First / Prev / Next / Last buttons
      const buttonsDiv = document.createElement("div");
      buttonsDiv.className = "datatable-pagination-buttons";

      this._firstBtn = document.createElement("button");
      this._firstBtn.className = "datatable-pagination-button datatable-pagination-first";
      this._firstBtn.setAttribute("aria-label", "First page");
      this._firstBtn.innerHTML = '<i class="mdi mdi-page-first"></i>';
      EventHandler.on(this._firstBtn, "click", () => {
        if (this._currentPage > 1) {
          this._currentPage = 1;
          this._render();
          EventHandler.trigger(this._element, EVENT_PAGE, { page: this._currentPage });
        }
      });

      this._prevBtn = document.createElement("button");
      this._prevBtn.className = "datatable-pagination-button datatable-pagination-left";
      this._prevBtn.setAttribute("aria-label", "Previous page");
      this._prevBtn.innerHTML = '<i class="mdi mdi-chevron-left"></i>';
      EventHandler.on(this._prevBtn, "click", () => {
        if (this._currentPage > 1) {
          this._currentPage--;
          this._render();
          EventHandler.trigger(this._element, EVENT_PAGE, { page: this._currentPage });
        }
      });

      this._nextBtn = document.createElement("button");
      this._nextBtn.className = "datatable-pagination-button datatable-pagination-right";
      this._nextBtn.setAttribute("aria-label", "Next page");
      this._nextBtn.innerHTML = '<i class="mdi mdi-chevron-right"></i>';
      EventHandler.on(this._nextBtn, "click", () => {
        if (this._currentPage < this._getTotalPages()) {
          this._currentPage++;
          this._render();
          EventHandler.trigger(this._element, EVENT_PAGE, { page: this._currentPage });
        }
      });

      this._lastBtn = document.createElement("button");
      this._lastBtn.className = "datatable-pagination-button datatable-pagination-last";
      this._lastBtn.setAttribute("aria-label", "Last page");
      this._lastBtn.innerHTML = '<i class="mdi mdi-page-last"></i>';
      EventHandler.on(this._lastBtn, "click", () => {
        const last = this._getTotalPages();
        if (this._currentPage < last) {
          this._currentPage = last;
          this._render();
          EventHandler.trigger(this._element, EVENT_PAGE, { page: this._currentPage });
        }
      });

      buttonsDiv.appendChild(this._firstBtn);
      buttonsDiv.appendChild(this._prevBtn);
      buttonsDiv.appendChild(this._nextBtn);
      buttonsDiv.appendChild(this._lastBtn);
      this._paginationEl.appendChild(buttonsDiv);

      this._footerEl.appendChild(this._paginationEl);
      this._element.appendChild(this._footerEl);

      // Initialize Nimbus Select on the entries <select> now that it's in the DOM
      if (window.Nimbus && window.Nimbus.Select) {
        this._entriesSelectInstance = new window.Nimbus.Select(this._entriesSelect, {
          visibleOptions: this._config.entriesOptions.length
        });
        this._entriesSelect.addEventListener("valueChanged.cnds.select", () => {
          this._config.entries = parseInt(this._entriesSelect.value, 10);
          this._currentPage = 1;
          this._render();
        });
      } else {
        // Fallback: native select change event if Select component isn't loaded
        EventHandler.on(this._entriesSelect, "change", () => {
          this._config.entries = parseInt(this._entriesSelect.value, 10);
          this._currentPage = 1;
          this._render();
        });
      }
    }

    /** Build loading overlay. */
    _buildLoading() {
      this._loadingEl = document.createElement("div");
      this._loadingEl.className = "datatable-loading";
      this._loadingEl.innerHTML =
        '<div class="datatable-loading-spinner"></div>';
      this._element.appendChild(this._loadingEl);
    }

    /** Set up sortable header click handlers. */
    _setupSortableHeaders() {
      if (!this._config.sortable || !this._headerRow) return;

      const ths = Array.from(this._headerRow.querySelectorAll("th"));
      ths.forEach((th, index) => {
        if (th.getAttribute("data-cnds-sort") === "false") return;

        th.classList.add("sortable");
        th.setAttribute("role", "columnheader");
        th.setAttribute("aria-sort", "none");
        th.setAttribute("tabindex", "0");

        const sortIcon = document.createElement("span");
        sortIcon.className = "datatable-sort-icon";
        sortIcon.innerHTML = '<i class="mdi mdi-arrow-up"></i>';
        th.appendChild(sortIcon);

        EventHandler.on(th, "click", () => {
          this._handleSort(index, th);
        });

        EventHandler.on(th, "keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this._handleSort(index, th);
          }
        });
      });
    }

    /** Handle sort click on a header cell. */
    _handleSort(index, th) {
      if (this._sortColumn === index) {
        if (this._sortDirection === "asc") {
          this._sortDirection = "desc";
        } else if (this._sortDirection === "desc") {
          this._sortDirection = "none";
          this._sortColumn = -1;
        } else {
          this._sortDirection = "asc";
        }
      } else {
        this._sortColumn = index;
        this._sortDirection = "asc";
      }

      const ths = this._headerRow.querySelectorAll("th");
      ths.forEach((header) => {
        header.classList.remove("sort-asc", "sort-desc");
        header.setAttribute("aria-sort", "none");
        const icon = header.querySelector(".datatable-sort-icon");
        if (icon) icon.style.transform = "translateY(-50%)";
      });

      if (this._sortDirection !== "none") {
        th.classList.add(
          this._sortDirection === "asc" ? "sort-asc" : "sort-desc"
        );
        th.setAttribute(
          "aria-sort",
          this._sortDirection === "asc" ? "ascending" : "descending"
        );
        const icon = th.querySelector(".datatable-sort-icon");
        if (icon) icon.style.transform = this._sortDirection === "desc" ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)";
      }

      this._applySort();
      this._currentPage = 1;
      this._render();

      EventHandler.trigger(this._element, EVENT_SORT, {
        column: this._sortColumn,
        direction: this._sortDirection
      });
    }

    /** Add checkbox column for row selection. */
    _addCheckboxColumn() {
      if (!this._headerRow) return;

      const thCheck = document.createElement("th");
      thCheck.className = "datatable-checkbox";
      thCheck.setAttribute("data-cnds-sort", "false");
      this._selectAllCheckbox = document.createElement("input");
      this._selectAllCheckbox.type = "checkbox";
      this._selectAllCheckbox.className = "form-check-input";
      this._selectAllCheckbox.setAttribute("aria-label", "Select all rows");
      thCheck.appendChild(this._selectAllCheckbox);
      this._headerRow.insertBefore(thCheck, this._headerRow.firstChild);

      EventHandler.on(this._selectAllCheckbox, "change", () => {
        if (this._selectAllCheckbox.checked) {
          this.selectAll();
        } else {
          this.deselectAll();
        }
      });
    }

    /**
     * Apply search filter.
     * Respects this._searchColumns for column-scoped search (v8 compat).
     */
    _applySearch() {
      if (!this._searchTerm) {
        this._filteredRows = [...this._allRows];
        return;
      }

      this._filteredRows = this._allRows.filter((row) => {
        const cells = row.querySelectorAll("td");

        // Column-scoped search
        if (this._searchColumns && this._searchColumns.length > 0) {
          return this._searchColumns.some((field) => {
            const colIdx = this._getColumnIndexByField(field);
            if (colIdx < 0) return false;
            const checkboxOffset = this._config.selectable ? 1 : 0;
            const cell = cells[colIdx + checkboxOffset];
            return (
              cell &&
              cell.textContent.toLowerCase().includes(this._searchTerm)
            );
          });
        }

        // Global search across all cells
        return Array.from(cells).some((cell) =>
          cell.textContent.toLowerCase().includes(this._searchTerm)
        );
      });
    }

    /** Get column index by field name (for column-scoped search). */
    _getColumnIndexByField(field) {
      if (!Array.isArray(this._config.columns)) return -1;
      return this._config.columns.findIndex((col) => col.field === field);
    }

    /** Apply sort to filtered rows. */
    _applySort() {
      if (this._sortColumn < 0 || this._sortDirection === "none") {
        this._applySearch();
        return;
      }

      const col = this._sortColumn;
      const dir = this._sortDirection === "asc" ? 1 : -1;
      const checkboxOffset = this._config.selectable ? 1 : 0;

      this._filteredRows.sort((a, b) => {
        const cellA = a.querySelectorAll("td")[col - checkboxOffset];
        const cellB = b.querySelectorAll("td")[col - checkboxOffset];

        if (!cellA || !cellB) return 0;

        let valA = cellA.textContent.trim();
        let valB = cellB.textContent.trim();

        const numA = parseFloat(valA.replace(/[,$%]/g, ""));
        const numB = parseFloat(valB.replace(/[,$%]/g, ""));

        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;

        const dateA = Date.parse(valA);
        const dateB = Date.parse(valB);

        if (!isNaN(dateA) && !isNaN(dateB)) return (dateA - dateB) * dir;

        return (
          valA.localeCompare(valB, undefined, { sensitivity: "base" }) * dir
        );
      });
    }

    /** Get total number of pages. */
    _getTotalPages() {
      return Math.max(
        1,
        Math.ceil(this._filteredRows.length / this._config.entries)
      );
    }

    /** Main render method. */
    _render() {
      this._renderBody();
      this._renderPagination();
    }

    /**
     * Render table body with current page rows.
     * Fires render.cnds.datatable after rendering (v8 compat).
     */
    _renderBody() {
      while (this._tbody.firstChild) {
        this._tbody.removeChild(this._tbody.firstChild);
      }

      if (this._filteredRows.length === 0) {
        const colCount = this._headerRow
          ? this._headerRow.querySelectorAll("th").length
          : 1;
        const tr = document.createElement("tr");
        tr.className = "datatable-nodata";
        const td = document.createElement("td");
        td.colSpan = colCount;
        td.textContent = this._config.noDataText;
        tr.appendChild(td);
        this._tbody.appendChild(tr);

        // Dispatch render event even for empty state
        const renderEvent = new CustomEvent(EVENT_RENDER, {
          bubbles: true,
          cancelable: false
        });
        this._element.dispatchEvent(renderEvent);
        return;
      }

      const start = (this._currentPage - 1) * this._config.entries;
      const end = Math.min(
        start + this._config.entries,
        this._filteredRows.length
      );
      const pageRows = this._filteredRows.slice(start, end);

      pageRows.forEach((row, pageIndex) => {
        const globalIndex = start + pageIndex;
        const clonedRow = row.cloneNode(true);

        if (this._config.selectable) {
          const tdCheck = document.createElement("td");
          tdCheck.className = "datatable-checkbox";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "form-check-input";
          cb.checked = this._selectedRows.has(globalIndex);
          cb.setAttribute("aria-label", `Select row ${globalIndex + 1}`);

          cb.addEventListener("change", () => {
            if (cb.checked) {
              this._selectedRows.add(globalIndex);
              clonedRow.classList.add("selected");
            } else {
              this._selectedRows.delete(globalIndex);
              clonedRow.classList.remove("selected");
            }
            this._updateSelectAll();

            const selectedRows = this.getSelectedRows();

            // v9 event (detail object)
            EventHandler.trigger(this._element, EVENT_SELECT, { selectedRows });

            // v8-compat event (properties directly on event)
            const selEvent = new CustomEvent(EVENT_SELECT_ROWS, {
              bubbles: true,
              cancelable: false
            });
            selEvent.selectedRows = selectedRows;
            selEvent.selectedIndexes = selectedRows;
            selEvent.allSelected =
              selectedRows.length === this._filteredRows.length;
            this._element.dispatchEvent(selEvent);
          });

          tdCheck.appendChild(cb);
          clonedRow.insertBefore(tdCheck, clonedRow.firstChild);
        }

        if (this._selectedRows.has(globalIndex)) {
          clonedRow.classList.add("selected");
        }

        this._tbody.appendChild(clonedRow);
      });

      // v8-compat render event — listeners can re-attach button handlers here
      const renderEvent = new CustomEvent(EVENT_RENDER, {
        bubbles: true,
        cancelable: false
      });
      this._element.dispatchEvent(renderEvent);
    }

    /** Render pagination: update nav text and button states. */
    _renderPagination() {
      if (!this._paginationEl) return;

      const total = this._filteredRows.length;
      const totalPages = this._getTotalPages();

      // Update nav text
      if (this._paginationNavEl) {
        if (total === 0) {
          this._paginationNavEl.textContent = "0-0 of 0";
        } else {
          const start = (this._currentPage - 1) * this._config.entries + 1;
          const end = Math.min(this._currentPage * this._config.entries, total);
          this._paginationNavEl.textContent = `${start}-${end} of ${total}`;
        }
      }

      // Enable/disable navigation buttons
      const atFirst = this._currentPage <= 1;
      const atLast = this._currentPage >= totalPages;
      if (this._firstBtn) this._firstBtn.disabled = atFirst;
      if (this._prevBtn)  this._prevBtn.disabled  = atFirst;
      if (this._nextBtn)  this._nextBtn.disabled  = atLast;
      if (this._lastBtn)  this._lastBtn.disabled  = atLast;
    }

    /** Update select-all checkbox state. */
    _updateSelectAll() {
      if (!this._selectAllCheckbox) return;

      const start = (this._currentPage - 1) * this._config.entries;
      const end = Math.min(
        start + this._config.entries,
        this._filteredRows.length
      );
      let allChecked = true;
      let someChecked = false;

      for (let i = start; i < end; i++) {
        if (this._selectedRows.has(i)) {
          someChecked = true;
        } else {
          allChecked = false;
        }
      }

      this._selectAllCheckbox.checked = allChecked && end > start;
      this._selectAllCheckbox.indeterminate = someChecked && !allChecked;
    }

    /** Get header labels as array. */
    _getHeaderLabels() {
      if (!this._headerRow) return [];
      return Array.from(this._headerRow.querySelectorAll("th"))
        .filter((th) => !th.classList.contains("datatable-checkbox"))
        .map((th) => th.textContent.trim());
    }

    /** Get cell values from a row. */
    _getCellValues(row) {
      return Array.from(row.querySelectorAll("td"))
        .filter((td) => !td.classList.contains("datatable-checkbox"))
        .map((td) => td.textContent.trim());
    }

    // --- Static Methods ---

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        let instance = DataTable.getInstance(this);
        if (!instance) {
          instance = new DataTable(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function") {
            throw new TypeError("No method named " + config);
          }
          instance[config](...args);
        }
      });
    }
  }

  // --- Auto-init from data-cnds-datatable-init ---
  function autoInit(root = document) {
    const elements = root.querySelectorAll("[data-cnds-datatable-init]");
    elements.forEach((el) => {
      if (!DataTable.getInstance(el)) {
        new DataTable(el);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => autoInit());
  } else {
    autoInit();
  }

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.DataTable = DataTable;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, DataTable);
  }
})();
