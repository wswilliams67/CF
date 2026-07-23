/**
 * CNDS — Cloudficient Nimbus Design System v1.0.0
 * Main JavaScript Entry Point
 *
 * This file bootstraps the Nimbus namespace and loads all core engine
 * modules and component scripts in the correct dependency order.
 *
 * Usage in HTML:
 *   <script src="js/nimbus.js"></script>
 *   <script src="js/app.js"></script>
 *
 * After loading, all components are available via:
 *   window.Nimbus.Modal, window.Nimbus.Dropdown, etc.
 *
 * The DataAPI auto-initializes components on DOMContentLoaded
 * based on data-cnds-* attributes found in the DOM.
 */
(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Initialize global namespace
  // -----------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.VERSION = "9.0.97";

  // -----------------------------------------------------------------------
  // Script loader — loads scripts sequentially to respect dependencies
  // -----------------------------------------------------------------------
  const BASE_PATH = (function () {
    // Detect the base path from the current script's src
    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || "";
      if (src.includes("nimbus.js")) {
        return src.substring(0, src.lastIndexOf("/") + 1);
      }
    }
    return "js/";
  })();

  /**
   * Load a single script and return a Promise that resolves when loaded.
   * @param {string} path - Relative path from the js/ directory
   * @returns {Promise<void>}
   */
  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BASE_PATH + path + "?v=" + window.Nimbus.VERSION;
      script.async = false; // maintain order
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${path}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load scripts sequentially (each waits for the previous).
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async function loadScriptsSequential(paths) {
    for (const path of paths) {
      await loadScript(path);
    }
  }

  // -----------------------------------------------------------------------
  // Define load order — core engine first, then components
  // -----------------------------------------------------------------------
  const CORE_SCRIPTS = [
    "core/utils.js",
    "core/event-handler.js",
    "core/selector-engine.js",
    "core/component.js",
    "core/data-api.js"
  ];

  const COMPONENT_SCRIPTS = [
    // Phase 1 — Core Components
    "components/select.js",
    "components/autocomplete.js",
    "components/button.js",
    "components/collapse.js",
    "components/dropdown.js",
    "components/modal.js",
    "components/offcanvas.js",
    "components/sidenav.js",
    "components/tabs.js",
    "components/toast.js",
    "components/tooltip.js",
    "components/popover.js",
    "components/alert.js",
    "components/ripple.js",
    // Phase 2 — Extended Components
    "components/carousel.js",
    "components/chips.js",
    "components/range.js",
    "components/rating.js",
    "components/stepper.js",
    "components/loading.js",
    "components/popconfirm.js",
    "components/animation.js",
    "components/clipboard.js",
    // Phase 2 — Utilities (no NimbusComponent base)
    "components/scrollspy.js",
    "components/smooth-scroll.js",
    "components/infinite-scroll.js",
    "components/lazy-load.js",
    "components/sticky.js",
    // Phase 3 — Plugins
    "plugins/datatable.js",
    "plugins/datepicker.js",
    "plugins/timepicker.js",
    "plugins/datetimepicker.js",
    "plugins/file-upload.js",
    "plugins/input-mask.js",
    "plugins/drag-drop.js",
    "plugins/treeview.js",
    "plugins/treetable.js",
    "plugins/charts.js",
    "plugins/filters.js",
    "plugins/transfer.js",
    "plugins/org-chart.js",
    "plugins/multi-range.js",
    "plugins/wysiwyg.js"
  ];

  // -----------------------------------------------------------------------
  // Boot sequence
  // -----------------------------------------------------------------------
  async function boot() {
    try {
      // 1. Load core engine modules (order matters)
      await loadScriptsSequential(CORE_SCRIPTS);

      // 2. Load component modules (order matters less, but some depend on others)
      await loadScriptsSequential(COMPONENT_SCRIPTS);

      // 3. Initialize DataAPI — auto-init all components in the DOM
      if (window.Nimbus.DataAPI) {
        // If DOM is already loaded, init immediately
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            window.Nimbus.DataAPI.init();
          });
        } else {
          window.Nimbus.DataAPI.init();
        }
      }

      // 4. Dispatch ready event
      const readyEvent = new CustomEvent("cnds.ready", {
        bubbles: true,
        detail: { version: window.Nimbus.VERSION }
      });
      document.dispatchEvent(readyEvent);

      console.log(
        `%c✓ CNDS Nimbus v${window.Nimbus.VERSION} loaded`,
        "color: #00ac69; font-weight: bold;"
      );
    } catch (err) {
      console.error("[CNDS] Failed to load Nimbus:", err);
    }
  }

  // Start loading
  boot();
})();
