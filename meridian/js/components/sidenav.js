/**
 * ============================================================
 * CNDS Sidenav Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 *
 * Provides:
 *   - Expand/collapse submenu categories (accordion mode)
 *   - Rotate-icon arrow indicators on category links
 *   - Slim/expanded toggle
 *   - Mobile overlay mode with backdrop
 *   - Smooth height-based slide animation matching v8 behavior
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "sidenav";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_SHOW = "show";
  const CLASS_COLLAPSING = "collapsing";

  const Default = {
    backdrop: true,
    keyboard: true,
    slim: false,
    accordion: true,
    mode: "over", // 'over', 'push', 'side'
    width: 240,
    position: "left"
  };

  const DefaultType = {
    backdrop: "boolean",
    keyboard: "boolean",
    slim: "boolean",
    accordion: "boolean",
    mode: "string",
    width: "number",
    position: "string"
  };

  class Sidenav extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._isShown = this._element.classList.contains(CLASS_SHOW);
      this._backdrop = null;
      this._content =
        document.querySelector(".sidenav-content") ||
        document.querySelector("main");

      this._setupSubmenus();
    }

    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }
    static get NAME() {
      return NAME;
    }

    // --- Public Methods ---

    toggle() {
      return this._isShown ? this.hide() : this.show();
    }

    show() {
      if (this._isShown) return;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW);
      if (showEvent.defaultPrevented) return;

      this._isShown = true;
      this._element.classList.add(CLASS_SHOW);

      if (this._config.backdrop && this._config.mode === "over") {
        this._showBackdrop();
      }

      if (this._config.mode === "push" && this._content) {
        const margin =
          this._config.position === "right" ? "marginRight" : "marginLeft";
        this._content.style[margin] = `${this._config.width}px`;
      }

      Utils.executeAfterTransition(() => {
        EventHandler.trigger(this._element, EVENT_SHOWN);
      }, this._element);
    }

    hide() {
      if (!this._isShown) return;

      const hideEvent = EventHandler.trigger(this._element, EVENT_HIDE);
      if (hideEvent.defaultPrevented) return;

      this._isShown = false;
      this._element.classList.remove(CLASS_SHOW);

      this._hideBackdrop();

      if (this._config.mode === "push" && this._content) {
        this._content.style.marginLeft = "";
        this._content.style.marginRight = "";
      }

      Utils.executeAfterTransition(() => {
        EventHandler.trigger(this._element, EVENT_HIDDEN);
      }, this._element);
    }

    toggleSlim() {
      this._element.classList.toggle("sidenav-slim");
      this._config.slim = this._element.classList.contains("sidenav-slim");
    }

    dispose() {
      this._hideBackdrop();
      super.dispose();
    }

    // --- Private Methods ---

    _showBackdrop() {
      if (this._backdrop) return;

      this._backdrop = document.createElement("div");
      this._backdrop.className = "sidenav-backdrop";
      document.body.appendChild(this._backdrop);

      Utils.reflow(this._backdrop);
      this._backdrop.classList.add(CLASS_SHOW);

      this._backdrop.addEventListener("click", () => this.hide());
    }

    _hideBackdrop() {
      if (!this._backdrop) return;

      this._backdrop.classList.remove(CLASS_SHOW);

      Utils.executeAfterTransition(() => {
        if (this._backdrop) {
          this._backdrop.remove();
          this._backdrop = null;
        }
      }, this._backdrop);
    }

    /**
     * Set up submenu expand/collapse behavior.
     *
     * Matches v8 MDB sidenav behavior:
     *   - Category links (those with a .sidenav-collapse sibling) toggle their submenu
     *   - Accordion mode: opening one category closes all others
     *   - Rotate-icon arrows are appended to category links
     *   - Smooth height-based slide animation
     *   - aria-expanded attribute management
     */
    _setupSubmenus() {
      // Find all sidenav-item elements that contain a .sidenav-collapse submenu
      const sidenavItems = SelectorEngine.find(".sidenav-item", this._element);

      for (const item of sidenavItems) {
        const submenu = item.querySelector(":scope > .sidenav-collapse");
        if (!submenu) continue;

        // The toggle link is the direct child .sidenav-link
        const toggleLink = item.querySelector(":scope > .sidenav-link");
        if (!toggleLink) continue;

        // Add rotate-icon arrow if not already present
        if (!toggleLink.querySelector(".rotate-icon")) {
          const arrow = document.createElement("i");
          arrow.className = "mdi mdi-chevron-down rotate-icon";
          toggleLink.appendChild(arrow);
        }

        // Set initial aria-expanded state
        const isExpanded = submenu.classList.contains(CLASS_SHOW);
        toggleLink.setAttribute("aria-expanded", String(isExpanded));

        // Rotate arrow if already expanded
        if (isExpanded) {
          const icon = toggleLink.querySelector(".rotate-icon");
          if (icon) icon.style.transform = "rotate(180deg)";
        }

        // Click handler
        toggleLink.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this._toggleSubmenu(item, toggleLink, submenu);
        });
      }

      // Also handle non-category items (no submenu) — expand sidenav from slim on click
      for (const item of sidenavItems) {
        const submenu = item.querySelector(":scope > .sidenav-collapse");
        if (submenu) continue; // Skip items with submenus (already handled above)

        const link = item.querySelector(":scope > .sidenav-link");
        if (!link) continue;

        link.addEventListener("click", (event) => {
          if (this._isSlim()) {
            // Expand sidenav from slim, then let the link navigate
            event.preventDefault();
            event.stopPropagation();
            this._expandFromSlim();
            // Navigate after a brief delay to let the sidenav expand
            const href = link.getAttribute("href");
            if (href && href !== "#") {
              setTimeout(() => {
                window.location.href = href;
              }, 100);
            }
          }
        });
      }
    }

    /**
     * Check if the sidenav is currently in slim/collapsed mode.
     * @returns {boolean}
     */
    _isSlim() {
      return (
        this._element.classList.contains("sidenav-slim") ||
        this._element.getAttribute("data-cnds-slim-collapsed") === "true"
      );
    }

    /**
     * Expand the sidenav from slim mode (remove slim class/attribute).
     * After expanding, opens the clicked submenu.
     */
    _expandFromSlim() {
      this._element.classList.remove("sidenav-slim");
      this._element.removeAttribute("data-cnds-slim-collapsed");
      this._config.slim = false;
    }

    /**
     * Toggle a submenu open/closed with smooth height animation.
     * In accordion mode, closes all other open submenus first.
     * If the sidenav is in slim mode, expands it first, then opens the submenu.
     */
    _toggleSubmenu(item, toggleLink, submenu) {
      // If sidenav is slim/collapsed, expand it first, then open this submenu
      if (this._isSlim()) {
        this._expandFromSlim();
        // Small delay to let CSS transition complete before measuring heights
        requestAnimationFrame(() => {
          this._closeAllSubmenus(null);
          this._expandSubmenu(toggleLink, submenu);
        });
        return;
      }

      // Ignore clicks while animating
      if (submenu.classList.contains(CLASS_COLLAPSING)) return;

      const isCurrentlyOpen = submenu.classList.contains(CLASS_SHOW);

      if (this._config.accordion && !isCurrentlyOpen) {
        // Close all other open submenus
        this._closeAllSubmenus(item);
      }

      if (isCurrentlyOpen) {
        this._collapseSubmenu(toggleLink, submenu);
      } else {
        this._expandSubmenu(toggleLink, submenu);
      }
    }

    /**
     * Close all open submenus except the one belonging to `exceptItem`.
     */
    _closeAllSubmenus(exceptItem) {
      const openSubmenus = SelectorEngine.find(
        ".sidenav-collapse.show",
        this._element
      );

      for (const openSubmenu of openSubmenus) {
        const parentItem = openSubmenu.closest(".sidenav-item");
        if (parentItem === exceptItem) continue;

        const parentToggle = parentItem
          ? parentItem.querySelector(":scope > .sidenav-link")
          : null;

        if (parentToggle) {
          this._collapseSubmenu(parentToggle, openSubmenu);
        }
      }
    }

    /**
     * Expand a submenu with smooth height animation (v8 slide-down).
     */
    _expandSubmenu(toggleLink, submenu) {
      // Set aria and rotate icon
      toggleLink.setAttribute("aria-expanded", "true");
      const icon = toggleLink.querySelector(".rotate-icon");
      if (icon) icon.style.transform = "rotate(180deg)";

      // Measure the natural height
      submenu.style.display = "block";
      submenu.style.overflow = "hidden";
      submenu.style.height = "0px";
      submenu.classList.add(CLASS_COLLAPSING);
      submenu.classList.remove(CLASS_SHOW);

      // Force reflow
      void submenu.offsetHeight;

      const targetHeight = submenu.scrollHeight;
      submenu.style.height = targetHeight + "px";
      submenu.style.transition = "height 0.35s ease";

      let done = false;
      const onEnd = () => {
        if (done) return;
        done = true;
        submenu.removeEventListener("transitionend", onEnd);
        submenu.classList.remove(CLASS_COLLAPSING);
        submenu.classList.add(CLASS_SHOW);
        submenu.style.height = "";
        submenu.style.overflow = "";
        submenu.style.transition = "";
        submenu.style.display = "";
      };

      submenu.addEventListener("transitionend", onEnd);

      // Fallback in case transitionend doesn't fire
      setTimeout(onEnd, 400);
    }

    /**
     * Collapse a submenu with smooth height animation (v8 slide-up).
     */
    _collapseSubmenu(toggleLink, submenu) {
      // Set aria and rotate icon
      toggleLink.setAttribute("aria-expanded", "false");
      const icon = toggleLink.querySelector(".rotate-icon");
      if (icon) icon.style.transform = "rotate(0deg)";

      // Set current height explicitly so we can animate from it
      const currentHeight = submenu.scrollHeight;
      submenu.style.height = currentHeight + "px";
      submenu.style.overflow = "hidden";
      submenu.style.transition = "height 0.35s ease";
      submenu.classList.add(CLASS_COLLAPSING);

      // Force reflow
      void submenu.offsetHeight;

      // Animate to 0
      submenu.style.height = "0px";

      let done = false;
      const onEnd = () => {
        if (done) return;
        done = true;
        submenu.removeEventListener("transitionend", onEnd);
        submenu.classList.remove(CLASS_COLLAPSING);
        submenu.classList.remove(CLASS_SHOW);
        submenu.style.height = "";
        submenu.style.overflow = "";
        submenu.style.transition = "";
        submenu.style.display = "";
      };

      submenu.addEventListener("transitionend", onEnd);

      // Fallback in case transitionend doesn't fire
      setTimeout(onEnd, 400);
    }
  }

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Sidenav);

  // Export
  window.Nimbus.Sidenav = Sidenav;
})();
