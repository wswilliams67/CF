/**
 * CNDS App JavaScript — Cloudficient Nimbus Design System v1.0.0
 *
 * Application-specific JavaScript that runs after the Nimbus framework
 * has fully loaded. Use this file for:
 *   - Page-specific initialization
 *   - Custom event handlers
 *   - Business logic
 *   - API calls
 *
 * Usage in HTML:
 *   <script src="js/nimbus.js"></script>
 *   <script src="js/app.js" defer></script>
 *
 * Or wait for the framework ready event:
 *   document.addEventListener('cnds.ready', function(e) {
 *     console.log('Nimbus version:', e.detail.version);
 *   });
 */
(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Wait for CNDS to be ready
  // -----------------------------------------------------------------------
  document.addEventListener("cnds.ready", function () {
    console.log("[App] Nimbus framework ready");
    init();
  });

  // Fallback: if cnds.ready already fired before this script loaded
  if (window.Nimbus && window.Nimbus.VERSION) {
    // Small delay to ensure all components are registered
    setTimeout(init, 0);
  }

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    // -----------------------------------------------------------------------
    // Theme toggle
    // -----------------------------------------------------------------------
    const themeToggle = document.querySelector('[data-cnds-toggle="theme"]');
    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        const html = document.documentElement;
        const current = html.getAttribute("data-cnds-theme") || "light";
        const next = current === "light" ? "dark" : "light";
        const icon = this.querySelector("i, .fa, .mdi");

        const applyTheme = () => {
          html.setAttribute("data-cnds-theme", next);
          if (icon) {
            icon.classList.toggle("mdi-weather-night");
            icon.classList.toggle("mdi-weather-sunny");
          }
          try {
            localStorage.setItem("cnds-theme", next);
          } catch (e) {
            // localStorage not available
          }
        };

        if (document.startViewTransition) {
          document.startViewTransition(applyTheme);
        } else {
          html.classList.add("cnds-theme-fading");
          setTimeout(function () { html.classList.remove("cnds-theme-fading"); }, 350);
          applyTheme();
        }
      });
    }

    // Restore saved theme preference
    try {
      const savedTheme = localStorage.getItem("cnds-theme");
      if (savedTheme) {
        document.documentElement.setAttribute("data-cnds-theme", savedTheme);

        // Update toggle icon to match restored theme
        if (themeToggle && savedTheme === "dark") {
          const icon = themeToggle.querySelector("i, .fa, .mdi");
          if (icon) {
            icon.classList.remove("mdi-weather-night");
            icon.classList.add("mdi-weather-sunny");
          }
        }
      }
    } catch (e) {
      // localStorage not available
    }

    // -----------------------------------------------------------------------
    // Sidenav toggle for mobile
    // -----------------------------------------------------------------------
    const sidenavToggle = document.querySelector(
      '[data-cnds-toggle="sidenav-mobile"]'
    );
    if (sidenavToggle) {
      sidenavToggle.addEventListener("click", function () {
        const target = document.querySelector(
          this.getAttribute("data-cnds-target") || ".sidenav"
        );
        if (target && window.Nimbus.Sidenav) {
          const instance = window.Nimbus.Sidenav.getOrCreateInstance(target);
          instance.toggle();
        }
      });
    }

    // -----------------------------------------------------------------------
    // Auto-initialize floating labels
    // -----------------------------------------------------------------------
    document
      .querySelectorAll(".form-outline .form-control")
      .forEach((input) => {
        // Add 'active' class to label when input has value
        const label = input.parentElement.querySelector(".form-label");
        if (label && input.value) {
          label.classList.add("active");
        }

        input.addEventListener("focus", () => {
          if (label) label.classList.add("active");
        });

        input.addEventListener("blur", () => {
          if (label && !input.value) {
            label.classList.remove("active");
          }
        });
      });

    // -----------------------------------------------------------------------
    // Add any page-specific initialization below
    // -----------------------------------------------------------------------
  }
})();
