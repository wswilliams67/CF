/**
 * ============================================================
 * CNDS Tabs Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "tab";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SHOW = `show${EVENT_KEY}`;
  const EVENT_SHOWN = `shown${EVENT_KEY}`;
  const EVENT_HIDE = `hide${EVENT_KEY}`;
  const EVENT_HIDDEN = `hidden${EVENT_KEY}`;

  const CLASS_ACTIVE = "active";
  const CLASS_FADE = "fade";
  const CLASS_SHOW = "show";

  const SELECTOR_DATA_TOGGLE =
    '[data-cnds-toggle="tab"], [data-cnds-toggle="pill"], [data-cnds-toggle="list"], [data-cnds-tab-init]';

  class Tab extends NimbusComponent {
    constructor(element) {
      super(element);
      this._parent = this._element.closest(
        ".nav, .list-group, .nav-tabs, .nav-pills"
      );
    }

    static get NAME() {
      return NAME;
    }

    // --- Public Methods ---

    toggle() {
      this.show();
    }

    show() {
      if (this._element.classList.contains(CLASS_ACTIVE)) return;

      const target = SelectorEngine.getElementFromSelector(this._element);
      if (!target) return;

      // Find currently active tab
      const activeTab = this._getActiveTab();
      const activePane = activeTab
        ? SelectorEngine.getElementFromSelector(activeTab)
        : null;

      const showEvent = EventHandler.trigger(this._element, EVENT_SHOW, {
        relatedTarget: activeTab
      });
      if (showEvent.defaultPrevented) return;

      if (activeTab) {
        const hideEvent = EventHandler.trigger(activeTab, EVENT_HIDE, {
          relatedTarget: this._element
        });
        if (hideEvent.defaultPrevented) return;
      }

      // Deactivate current
      if (activeTab) {
        activeTab.classList.remove(CLASS_ACTIVE);
        activeTab.setAttribute("aria-selected", "false");
        activeTab.setAttribute("tabindex", "-1");
      }
      if (activePane) {
        activePane.classList.remove(CLASS_SHOW, CLASS_ACTIVE);
      }

      // Activate new
      this._element.classList.add(CLASS_ACTIVE);
      this._element.setAttribute("aria-selected", "true");
      this._element.removeAttribute("tabindex");

      target.classList.add(CLASS_ACTIVE);
      if (target.classList.contains(CLASS_FADE)) {
        Utils.reflow(target);
        target.classList.add(CLASS_SHOW);
      }

      // Trigger events
      if (activeTab) {
        EventHandler.trigger(activeTab, EVENT_HIDDEN, {
          relatedTarget: this._element
        });
      }
      EventHandler.trigger(this._element, EVENT_SHOWN, {
        relatedTarget: activeTab
      });
    }

    // --- Private Methods ---

    _getActiveTab() {
      if (!this._parent) return null;
      return SelectorEngine.findOne(
        `.${CLASS_ACTIVE}:not(.dropdown-item)`,
        this._parent
      );
    }
  }

  // Click delegation for tab triggers
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(SELECTOR_DATA_TOGGLE);
    if (!trigger) return;

    event.preventDefault();
    const instance = Tab.getOrCreateInstance(trigger);
    instance.show();
  });

  // Keyboard navigation
  document.addEventListener("keydown", (event) => {
    const trigger = event.target.closest(SELECTOR_DATA_TOGGLE);
    if (!trigger) return;

    const parent = trigger.closest(".nav, .list-group");
    if (!parent) return;

    const tabs = SelectorEngine.find(SELECTOR_DATA_TOGGLE, parent);
    const index = tabs.indexOf(trigger);

    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = index + 1 >= tabs.length ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = index - 1 < 0 ? tabs.length - 1 : index - 1;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== undefined) {
      tabs[nextIndex].focus();
      const instance = Tab.getOrCreateInstance(tabs[nextIndex]);
      instance.show();
    }
  });

  // -----------------------------------------------------------------------
  // Overflow menu (9.0.111). Tabs that don't fit collapse into a three-dot
  // menu at the trailing edge, so every tab stays reachable at any width.
  // Auto-initialises every horizontal .nav-tabs-nimbus bar on load; a bar
  // rendered later (e.g. by page script) calls Nimbus.TabOverflow.init(nav).
  // -----------------------------------------------------------------------
  function initTabOverflow(nav) {
    if (!nav || nav.classList.contains("flex-column") || nav._cndsTabOverflow) return;
    nav._cndsTabOverflow = true;

    const productClass =
      nav.classList.contains("nav-tabs-casefusion") ? "dropdown-menu-casefusion" :
      nav.classList.contains("nav-tabs-hyperlize")  ? "dropdown-menu-hyperlize"  :
      nav.classList.contains("nav-tabs-expireon")   ? "dropdown-menu-expireon"   : "";

    const moreItem = document.createElement("li");
    moreItem.className = "nav-item nav-tabs-more-item";
    moreItem.setAttribute("role", "presentation");
    moreItem.hidden = true;
    moreItem.innerHTML =
      '<button type="button" class="nav-link nav-tabs-more-btn" aria-haspopup="true" aria-expanded="false" aria-label="More tabs">' +
      '<i class="mdi mdi-dots-vertical mdi-18px" aria-hidden="true"></i></button>' +
      '<ul class="nav-tabs-more-dropdown dropdown-menu dropdown-menu-product ' + productClass + '" role="menu" hidden></ul>';
    nav.appendChild(moreItem);
    nav.classList.add("nav-tabs-overflow");

    const items = Array.from(nav.querySelectorAll(":scope > .nav-item:not(.nav-tabs-more-item)"));
    const moreBtn = moreItem.querySelector(".nav-tabs-more-btn");
    const dropdown = moreItem.querySelector(".nav-tabs-more-dropdown");
    let open = false;

    function place() {
      const r = moreBtn.getBoundingClientRect();
      dropdown.style.top = r.bottom + "px";
      dropdown.style.right = (window.innerWidth - r.right) + "px";
    }
    function close() {
      dropdown.hidden = true;
      moreBtn.setAttribute("aria-expanded", "false");
      open = false;
    }
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      open = !open;
      dropdown.hidden = !open;
      moreBtn.setAttribute("aria-expanded", String(open));
      if (open) place();
    });
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") { close(); moreBtn.focus(); } });
    window.addEventListener("resize", () => { if (open) place(); });
    window.addEventListener("scroll", () => { if (open) place(); }, true);

    function showItem(item) {
      item.style.cssText = "";
      const a = item.querySelector(".nav-link");
      if (a) { a.removeAttribute("aria-hidden"); a.removeAttribute("tabindex"); }
    }
    function hideItem(item) {
      // flex-grow 0: a justified bar's items grow by default, which would keep hidden tabs taking space
      item.style.cssText = "width:0;min-width:0;overflow:hidden;padding:0;margin:0;flex:0 0 0";
      const a = item.querySelector(".nav-link");
      if (a) { a.setAttribute("aria-hidden", "true"); a.setAttribute("tabindex", "-1"); }
    }

    function update() {
      items.forEach(showItem);
      moreItem.hidden = true;
      const navW = nav.clientWidth;
      // Fit test on real overflow: justified tabs fill the bar exactly, so summing rounded widths can read 1px over
      if (nav.scrollWidth <= navW + 1) { close(); return; }

      moreItem.hidden = false;
      const available = navW - moreItem.offsetWidth;
      let cum = 0, split = items.length;
      for (let i = 0; i < items.length; i++) {
        cum += items[i].offsetWidth;
        if (cum > available) { split = i; break; }
      }
      for (let j = split; j < items.length; j++) hideItem(items[j]);

      dropdown.innerHTML = "";
      let hasActive = false;
      for (let k = split; k < items.length; k++) {
        const link = items[k].querySelector(".nav-link");
        if (!link) continue;
        const isActive = link.classList.contains("active");
        if (isActive) hasActive = true;
        const li = document.createElement("li");
        li.setAttribute("role", "menuitem");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dropdown-item" + (isActive ? " active" : "");
        btn.textContent = link.textContent.trim();
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          link.removeAttribute("aria-hidden");
          link.click();
          link.setAttribute("aria-hidden", "true");
          close();
          update();
        });
        li.appendChild(btn);
        dropdown.appendChild(li);
      }
      // The three-dot button carries .active when the current tab is in the menu
      moreBtn.classList.toggle("active", hasActive);
      if (open) place();
    }

    nav.addEventListener("shown.cnds.tab", update);
    new ResizeObserver(update).observe(nav.parentElement);
    // Web fonts change tab widths without resizing the container: measure again once they load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    update();
  }

  function initAllTabOverflow() {
    document.querySelectorAll(".nav-tabs-nimbus:not(.flex-column)").forEach(initTabOverflow);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAllTabOverflow);
  else initAllTabOverflow();

  window.Nimbus.TabOverflow = { init: initTabOverflow };

  // Register with Data API
  window.Nimbus.DataAPI.registerComponent(NAME, Tab);

  // Export
  window.Nimbus.Tab = Tab;
})();
