/**
 * ============================================================
 * CNDS Data API - Auto-Initialization Engine
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Scans the DOM for data-cnds-* attributes and automatically
 * initializes the corresponding components.
 * ============================================================
 */

(() => {
  "use strict";

  const CNDS_PREFIX = "cnds";

  /**
   * Registry of component constructors keyed by their toggle/init attribute
   * e.g., { 'collapse': CollapseClass, 'dropdown': DropdownClass }
   */
  const componentRegistry = new Map();

  /**
   * Components that should NOT be auto-constructed on page load.
   * These are click-triggered toggles that get initialized on first interaction.
   */
  const CLICK_ONLY_COMPONENTS = new Set([
    "collapse",
    "modal",
    "offcanvas",
    "dropdown",
    "popconfirm"
  ]);

  /**
   * Register a component for auto-initialization
   * @param {string} name - Component name (e.g., 'collapse', 'modal')
   * @param {Function} ComponentClass - The component constructor
   */
  function registerComponent(name, ComponentClass) {
    componentRegistry.set(name, ComponentClass);
  }

  /**
   * Initialize all registered components by scanning the DOM
   * @param {HTMLElement} [root=document]
   */
  function initAll(root = document) {
    // --- Toggle-based components (data-cnds-toggle="xxx") ---
    const toggleElements = root.querySelectorAll(
      `[data-${CNDS_PREFIX}-toggle]`
    );
    for (const element of toggleElements) {
      const toggleType = element.getAttribute(`data-${CNDS_PREFIX}-toggle`);
      const ComponentClass = componentRegistry.get(toggleType);

      if (ComponentClass && !ComponentClass.getInstance(element)) {
        // Skip click-only components — they init on first interaction
        if (CLICK_ONLY_COMPONENTS.has(toggleType)) continue;

        try {
          ComponentClass.getOrCreateInstance(element);
        } catch (e) {
          console.warn(
            `CNDS: Failed to auto-init "${toggleType}" on element:`,
            element,
            e
          );
        }
      }
    }

    // --- Ride-based components (data-cnds-ride="xxx") ---
    const rideElements = root.querySelectorAll(`[data-${CNDS_PREFIX}-ride]`);
    for (const element of rideElements) {
      const rideType = element.getAttribute(`data-${CNDS_PREFIX}-ride`);
      const ComponentClass = componentRegistry.get(rideType);

      if (ComponentClass && !ComponentClass.getInstance(element)) {
        try {
          ComponentClass.getOrCreateInstance(element, { ride: rideType });
        } catch (e) {
          console.warn(
            `CNDS: Failed to auto-init ride "${rideType}" on element:`,
            element,
            e
          );
        }
      }
    }

    // --- Init-based components (data-cnds-init="xxx") ---
    const initElements = root.querySelectorAll(`[data-${CNDS_PREFIX}-init]`);
    for (const element of initElements) {
      const initType = element.getAttribute(`data-${CNDS_PREFIX}-init`);
      const ComponentClass = componentRegistry.get(initType);

      if (ComponentClass && !ComponentClass.getInstance(element)) {
        try {
          ComponentClass.getOrCreateInstance(element);
        } catch (e) {
          console.warn(
            `CNDS: Failed to auto-init "${initType}" on element:`,
            element,
            e
          );
        }
      }
    }

    // --- Named init-based components (data-cnds-<name>-init) ---
    for (const [name, ComponentClass] of componentRegistry) {
      const namedInitElements = root.querySelectorAll(
        `[data-${CNDS_PREFIX}-${name}-init]`
      );
      for (const element of namedInitElements) {
        if (!ComponentClass.getInstance(element)) {
          try {
            ComponentClass.getOrCreateInstance(element);
          } catch (e) {
            console.warn(
              `CNDS: Failed to auto-init "${name}" on element:`,
              element,
              e
            );
          }
        }
      }
    }

    // --- Initialize utility modules ---
    if (
      window.Nimbus.Animation &&
      typeof window.Nimbus.Animation.init === "function"
    ) {
      try {
        window.Nimbus.Animation.init();
      } catch (e) {
        console.warn("CNDS: Failed to init Animation:", e);
      }
    }
    if (
      window.Nimbus.Clipboard &&
      typeof window.Nimbus.Clipboard.init === "function"
    ) {
      try {
        window.Nimbus.Clipboard.init();
      } catch (e) {
        console.warn("CNDS: Failed to init Clipboard:", e);
      }
    }
    if (
      window.Nimbus.Sticky &&
      typeof window.Nimbus.Sticky.init === "function"
    ) {
      try {
        window.Nimbus.Sticky.init();
      } catch (e) {
        console.warn("CNDS: Failed to init Sticky:", e);
      }
    }
  }

  /**
   * Set up global event delegation for click-triggered components
   */
  function setupClickDelegation() {
    const { SelectorEngine } = window.Nimbus;

    document.addEventListener("click", (event) => {
      // Find the closest element with data-cnds-toggle
      const trigger = event.target.closest(`[data-${CNDS_PREFIX}-toggle]`);
      if (!trigger) return;

      const toggleType = trigger.getAttribute(`data-${CNDS_PREFIX}-toggle`);
      const ComponentClass = componentRegistry.get(toggleType);

      if (!ComponentClass) {
        console.warn(`CNDS DataAPI: no component registered for toggle="${toggleType}". Was the component script loaded?`);
        return;
      }

      // Prevent default for links
      if (trigger.tagName === "A" || trigger.closest("a")) {
        event.preventDefault();
      }

      // For components that target a separate element (collapse, modal),
      // resolve the target element(s) from data-cnds-target or href.
      // Uses getMultipleElementsFromSelector to support class-based
      // selectors that match more than one element (e.g. ".multi-collapse").
      const TARGET_COMPONENTS = new Set(["collapse", "modal", "offcanvas"]);
      if (TARGET_COMPONENTS.has(toggleType)) {
        event.preventDefault();
        const targetElements =
          SelectorEngine.getMultipleElementsFromSelector(trigger);

        if (targetElements.length === 0) {
          console.warn(`CNDS DataAPI: no target found for ${toggleType} trigger. Check data-cnds-target attribute.`, trigger);
          return;
        }

        // Handle "toggle between modals" pattern: if the trigger also
        // has data-cnds-dismiss="modal", hide the current modal first,
        // then show the target modal after the hide transition completes.
        const dismissType = trigger.getAttribute(`data-${CNDS_PREFIX}-dismiss`);
        if (toggleType === "modal" && dismissType === "modal") {
          const currentModal = trigger.closest(".modal");
          const currentInstance =
            currentModal && ComponentClass.getInstance(currentModal);
          if (currentInstance) {
            // Listen for the full namespaced hidden event dispatched by EventHandler.trigger.
            currentModal.addEventListener(
              "hidden.cnds.modal",
              () => {
                for (const targetElement of targetElements) {
                  const config = {};
                  const instance = ComponentClass.getOrCreateInstance(
                    targetElement,
                    config
                  );
                  if (instance && typeof instance.show === "function") {
                    instance.show(trigger);
                  }
                }
              },
              { once: true }
            );
            currentInstance.hide();
            return;
          }
        }

        for (const targetElement of targetElements) {
          // Build config from the target element's data attributes
          const config = {};
          const parentAttr = targetElement.getAttribute(
            `data-${CNDS_PREFIX}-parent`
          );
          if (parentAttr) config.parent = parentAttr;

          try {
            const instance = ComponentClass.getOrCreateInstance(
              targetElement,
              config
            );
            if (instance && typeof instance.toggle === "function") {
              // Pass trigger as relatedTarget for modals
              instance.toggle(trigger);
            }
          } catch (e) {
            console.error(`CNDS DataAPI: error toggling ${toggleType}:`, e);
          }
        }
        return;
      }

      // Get or create instance and call toggle
      const instance = ComponentClass.getOrCreateInstance(trigger);
      if (instance && typeof instance.toggle === "function") {
        instance.toggle();
      }
    });
  }

  /**
   * Set up global event delegation for dismiss buttons
   * Handles data-cnds-dismiss="alert", data-cnds-dismiss="modal", etc.
   */
  function setupDismissDelegation() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(`[data-${CNDS_PREFIX}-dismiss]`);
      if (!trigger) return;

      // If the trigger also has data-cnds-toggle, the click delegation
      // handler already manages the dismiss-then-toggle flow. Skip here
      // to avoid double-handling.
      if (trigger.hasAttribute(`data-${CNDS_PREFIX}-toggle`)) return;

      const dismissType = trigger.getAttribute(`data-${CNDS_PREFIX}-dismiss`);
      const ComponentClass = componentRegistry.get(dismissType);

      if (!ComponentClass) {
        // Fallback: just hide the closest matching element
        const target = trigger.closest(`.${dismissType}`);
        if (target) {
          target.classList.remove("show");
          // For alerts, remove from DOM after transition
          if (dismissType === "alert") {
            const { executeAfterTransition } = window.Nimbus.Utils;
            executeAfterTransition(() => target.remove(), target);
          }
        }
        return;
      }

      // Find the component element (parent with the component class)
      const componentElement =
        trigger.closest(`.${dismissType}`) || trigger.parentElement;
      const instance = ComponentClass.getInstance(componentElement);

      if (instance && typeof instance.hide === "function") {
        instance.hide();
      } else if (instance && typeof instance.close === "function") {
        instance.close();
      }
    });
  }

  /**
   * Set up keyboard event delegation
   */
  function setupKeyboardDelegation() {
    document.addEventListener("keydown", (event) => {
      // Escape key closes modals, dropdowns, etc.
      if (event.key === "Escape") {
        // Close the topmost modal (if keyboard option is enabled)
        const openModal = document.querySelector(".modal.show");
        if (openModal) {
          const ModalClass = componentRegistry.get("modal");
          if (ModalClass) {
            const instance = ModalClass.getInstance(openModal);
            if (instance) {
              // Respect the keyboard config option
              if (instance._config && instance._config.keyboard === false) {
                return;
              }
              // Static backdrop: animate instead of closing
              if (instance._config && instance._config.backdrop === "static") {
                if (typeof instance._triggerStaticAnimation === "function") {
                  instance._triggerStaticAnimation();
                }
                return;
              }
              if (typeof instance.hide === "function") {
                instance.hide();
              }
            }
          }
          return;
        }

        // Close open offcanvas panels
        const openOffcanvas = document.querySelector(".offcanvas.show");
        if (openOffcanvas) {
          const OffcanvasClass = componentRegistry.get("offcanvas");
          if (OffcanvasClass) {
            const instance = OffcanvasClass.getInstance(openOffcanvas);
            if (instance) {
              if (instance._config && instance._config.keyboard === false) return;
              if (typeof instance.hide === "function") {
                instance.hide();
              }
            }
          }
          return;
        }

        // Close open dropdowns
        const openDropdown = document.querySelector(".dropdown-menu.show");
        if (openDropdown) {
          const DropdownClass = componentRegistry.get("dropdown");
          if (DropdownClass) {
            const trigger =
              openDropdown.previousElementSibling ||
              openDropdown.parentElement.querySelector(
                `[data-${CNDS_PREFIX}-toggle="dropdown"]`
              );
            if (trigger) {
              const instance = DropdownClass.getInstance(trigger);
              if (instance && typeof instance.hide === "function") {
                instance.hide();
              }
            }
          }
        }
      }
    });
  }

  let _delegationSetup = false;

  /**
   * Initialize the Data API
   * Called by nimbus.js after all components are loaded.
   * Safe to call multiple times — delegation is set up only once.
   */
  function init() {
    if (!_delegationSetup) {
      setupClickDelegation();
      setupDismissDelegation();
      setupKeyboardDelegation();
      _delegationSetup = true;
    }
    initAll();
  }

  // Do NOT auto-initialize here — nimbus.js boot() calls init()
  // after all component scripts are loaded and registered.

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.DataAPI = {
    registerComponent,
    initAll,
    init
  };
})();
