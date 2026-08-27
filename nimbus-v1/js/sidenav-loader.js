/**
 * Shared Sidenav Loader
 * Fetches includes/sidenav.html, injects it into #sidebar-cf,
 * highlights the current page's nav item, expands its parent section,
 * and wires up accordion expand/collapse and slim toggle.
 *
 * Open/close logic adapted from the Category Items demo in cnds-sidenav.html.
 *
 * Usage: Each page sets window.sidenavSection and window.sidenavTopic
 *        before this script runs, OR the loader auto-detects from the URL.
 */
(function () {
  "use strict";

  // --- URL-to-navlink mapping ---
  // Maps filename (without extension) to { section, topic } identifiers.
  // section = the id suffix on tog_submenu_<Section>
  // topic   = the id suffix on navlink_<Topic>
  var NAV_MAP = {
    index: { section: "", topic: "Home" },
    "cnds-grid-system": { section: "Layout", topic: "GridSystem" },
    "cnds-breakpoints": { section: "Layout", topic: "Breakpoints" },
    "cnds-containers": { section: "Layout", topic: "Containers" },
    "cnds-columns": { section: "Layout", topic: "Columns" },
    "cnds-display": { section: "Layout", topic: "Display" },
    "cnds-flexbox": { section: "Layout", topic: "Flexbox" },
    "cnds-float": { section: "Layout", topic: "Float" },
    "cnds-gutters": { section: "Layout", topic: "Gutters" },
    "cnds-horizontal-alignment": {
      section: "Layout",
      topic: "HorizontalAlignment"
    },
    "cnds-layout-utilities": { section: "Layout", topic: "UtilitiesLayout" },
    "cnds-vertical-alignment": { section: "Layout", topic: "Vertical" },
    "cnds-z-index": { section: "Layout", topic: "Zindex" },
    "cnds-animations": { section: "ContentStyles", topic: "Animations" },
    "cnds-background-image": { section: "ContentStyles", topic: "Background" },
    "cnds-colors": { section: "ContentStyles", topic: "Colors" },
    "cnds-dividers": { section: "ContentStyles", topic: "Dividers" },
    "cnds-figures": { section: "ContentStyles", topic: "Figures" },
    "cnds-flags": { section: "ContentStyles", topic: "Flags" },
    "cnds-hover-effects": { section: "ContentStyles", topic: "Hover" },
    "cnds-icons": { section: "ContentStyles", topic: "Icon" },
    "cnds-images": { section: "ContentStyles", topic: "Images" },
    "cnds-masks": { section: "ContentStyles", topic: "Masks" },
    "cnds-reboot": { section: "ContentStyles", topic: "Reboot" },
    "cnds-shadows": { section: "ContentStyles", topic: "Shadows" },
    "cnds-typography": { section: "ContentStyles", topic: "Typography" },
    "cnds-breadcrumbs": { section: "Navigation", topic: "Breadcrumbs" },
    "cnds-explorer": { section: "Navigation", topic: "Explorer" },
    "cnds-footer": { section: "Navigation", topic: "Footer" },
    "cnds-header": { section: "Navigation", topic: "Header" },
    "cnds-pagination": { section: "Navigation", topic: "Pagination" },
    "cnds-pills": { section: "Navigation", topic: "Pills" },
    "cnds-sidenav": { section: "Navigation", topic: "SideNav" },
    "cnds-tabs": { section: "Navigation", topic: "Tabs" },
    "cnds-accordion": { section: "Components", topic: "Accordion" },
    "cnds-alerts": { section: "Components", topic: "Alerts" },
    "cnds-badges": { section: "Components", topic: "Badges" },
    "cnds-buttons": { section: "Components", topic: "Buttons" },
    "cnds-buttongroup": { section: "Components", topic: "ButtonGrp" },
    "cnds-cards": { section: "Components", topic: "Cards" },
    "cnds-carousel": { section: "Components", topic: "Carousel" },
    "cnds-chips": { section: "Components", topic: "Chips" },
    "cnds-collapse": { section: "Components", topic: "Collapse" },
    "cnds-dropdowns": { section: "Components", topic: "Dropdowns" },
    "cnds-expansionpanels": {
      section: "Components",
      topic: "ExpansionPanels"
    },
    "cnds-listgroup": { section: "Components", topic: "List" },
    "cnds-modal": { section: "Components", topic: "Modal" },
    "cnds-popconfirm": { section: "Components", topic: "Popconfirm" },
    "cnds-popovers": { section: "Components", topic: "Popovers" },
    "cnds-progress": { section: "Components", topic: "Progress" },
    "cnds-rating": { section: "Components", topic: "Rating" },
    "cnds-slidingpanels": { section: "Components", topic: "SlidingPanels" },
    "cnds-spinners": { section: "Components", topic: "Spinners" },
    "cnds-steppers": { section: "Components", topic: "Steppers" },
    "cnds-toasts": { section: "Components", topic: "Toasts" },
    "cnds-toolbars": { section: "Components", topic: "Toolbar" },
    "cnds-tooltips": { section: "Components", topic: "Tooltips" },
    "cnds-autocomplete": { section: "Forms", topic: "AutoComplete" },
    "cnds-checkbox": { section: "Forms", topic: "Checkbox" },
    "cnds-datepicker": { section: "Forms", topic: "DatePicker" },
    "cnds-datetimepicker": { section: "Forms", topic: "DateTimePicker" },
    "cnds-file": { section: "Forms", topic: "File" },
    "cnds-inputfields": { section: "Forms", topic: "InputFields" },
    "cnds-textarea": { section: "Forms", topic: "Textarea" },
    "cnds-inputgrp": { section: "Forms", topic: "InputGrp" },
    "cnds-multirange": { section: "Forms", topic: "MultiRange" },
    "cnds-radio": { section: "Forms", topic: "Radio" },
    "cnds-range": { section: "Forms", topic: "Range" },
    "cnds-search": { section: "Forms", topic: "Search" },
    "cnds-select": { section: "Forms", topic: "Select" },
    "cnds-switch": { section: "Forms", topic: "Switch" },
    "cnds-timepicker": { section: "Forms", topic: "TimePicker" },
    "cnds-validation": { section: "Forms", topic: "Validation" },
    "cnds-wysiwyg": { section: "Forms", topic: "Wysiwyg" },
    "cnds-charts": { section: "Data", topic: "Charts" },
    "cnds-charts-advanced": { section: "Data", topic: "ChartsAdvanced" },
    "cnds-tables": { section: "Data", topic: "Tables" },
    "cnds-datatables": { section: "Data", topic: "Datatables" },
    "cnds-borders": { section: "Utilities", topic: "Borders" },
    "cnds-clearfix": { section: "Utilities", topic: "Clearfix" },
    "cnds-close": { section: "Utilities", topic: "Close" },
    "cnds-embeds": { section: "Utilities", topic: "Embeds" },
    "cnds-interactions": { section: "Utilities", topic: "Interactions" },
    "cnds-opacity": { section: "Utilities", topic: "Opacity" },
    "cnds-overflow": { section: "Utilities", topic: "Overflow" },
    "cnds-position": { section: "Utilities", topic: "Position" },
    "cnds-screenreaders": { section: "Utilities", topic: "Screenreaders" },
    "cnds-sizing": { section: "Utilities", topic: "Sizing" },
    "cnds-spacing": { section: "Utilities", topic: "Spacing" },
    "cnds-stacks": { section: "Utilities", topic: "Stacks" },
    "cnds-stretchedlink": { section: "Utilities", topic: "StretchedLink" },
    "cnds-text": { section: "Utilities", topic: "Text" },
    "cnds-texttruncation": { section: "Utilities", topic: "TextTruncation" },
    "cnds-verticalrule": { section: "Utilities", topic: "VerticalRule" },
    "cnds-visibility": { section: "Utilities", topic: "Visibility" },
    "cnds-clipboard": { section: "Methods", topic: "Clipboard" },
    "cnds-infinitescroll": { section: "Methods", topic: "InfiniteScroll" },
    "cnds-lazyloading": { section: "Methods", topic: "LazyLoading" },
    "cnds-loadingmanagement": {
      section: "Methods",
      topic: "LoadingManagement"
    },
    "cnds-ripple": { section: "Methods", topic: "Ripple" },
    "cnds-scrollbar": { section: "Methods", topic: "Scrollbar" },
    "cnds-smoothscroll": { section: "Methods", topic: "SmoothScroll" },
    "cnds-sticky": { section: "Methods", topic: "Sticky" },
    "cnds-cookiesmanagement": {
      section: "Plugins",
      topic: "CookiesManagement"
    },
    "cnds-dataparser": { section: "Plugins", topic: "DataParser" },
    "cnds-dragdrop": { section: "Plugins", topic: "DragDrop" },
    "cnds-fileupload": { section: "Plugins", topic: "FileUpload" },
    "cnds-filters": { section: "Plugins", topic: "Filters" },
    "cnds-orgchart": { section: "Plugins", topic: "OrgChart" },
    "cnds-inputmask": { section: "Forms", topic: "InputMask" },
    "cnds-prism": { section: "Plugins", topic: "Prism" },
    "cnds-storagemanagement": {
      section: "Plugins",
      topic: "StorageManagement"
    },
    "cnds-transfer": { section: "Plugins", topic: "Transfer" },
    "cnds-treeview": { section: "Plugins", topic: "TreeView" },
    "cnds-treetable": { section: "Plugins", topic: "TreeTable" },
    "cnds-jquery": { section: "Jquery", topic: "jQuery" },
    "cnds-ckeditor": { section: "Jquery", topic: "CKEditor" },
    "cnds-wizard": { section: "Jquery", topic: "Wizard" },
    "cnds-templates": { section: "", topic: "Templates" }
  };

  /**
   * Detect current page from the URL and return { section, topic }.
   */
  function detectCurrentPage() {
    // Allow page-level overrides
    if (
      window.sidenavSection !== undefined &&
      window.sidenavTopic !== undefined
    ) {
      return { section: window.sidenavSection, topic: window.sidenavTopic };
    }

    var path = window.location.pathname;
    var filename = path.substring(path.lastIndexOf("/") + 1);
    // Remove .html extension
    var key = filename.replace(/\.html$/, "") || "index";

    if (NAV_MAP[key]) {
      return NAV_MAP[key];
    }

    // Fallback: no highlight
    return { section: "", topic: "" };
  }

  /**
   * Highlight the current nav item and expand its parent section (instant, no animation).
   */
  function highlightCurrentPage(section, topic) {
    // Clear any existing selections
    var allSelected = document.querySelectorAll(
      "#sidebar-cf .sidenav-link.selected"
    );
    for (var i = 0; i < allSelected.length; i++) {
      allSelected[i].classList.remove("selected");
    }
    var allActive = document.querySelectorAll(
      "#sidebar-cf .sidenav-link.active"
    );
    for (var j = 0; j < allActive.length; j++) {
      allActive[j].classList.remove("active");
    }

    // If no section but has topic (top-level items like Home, Templates)
    if (section === "" && topic !== "") {
      var navItem = document.getElementById("navlink_" + topic);
      if (navItem) {
        navItem.classList.add("selected");
      }
      return;
    }

    // If both section and topic are set (submenu items)
    if (section !== "" && topic !== "") {
      // Expand parent section
      var parentToggle = document.getElementById("tog_submenu_" + section);
      if (parentToggle) {
        parentToggle.classList.add("active");
        parentToggle.setAttribute("aria-expanded", "true");
        // Find and show the sibling .sidenav-collapse
        var collapseMenu =
          parentToggle.parentElement.querySelector(".sidenav-collapse");
        if (collapseMenu && !collapseMenu.classList.contains("show")) {
          collapseMenu.classList.add("show");
        }
      }
      // Highlight the specific nav item
      var navItem = document.getElementById("navlink_" + topic);
      if (navItem) {
        navItem.classList.add("selected");
      }
    }
  }

  // ── Animated expand / collapse (from Category Items demo) ────────────────

  function expandSubmenu(toggle, submenu) {
    toggle.setAttribute('aria-expanded', 'true');
    submenu.style.display  = 'block';
    submenu.style.overflow = 'hidden';
    submenu.style.height   = '0px';
    submenu.classList.add('collapsing');
    submenu.classList.remove('show');
    void submenu.offsetHeight;
    var target = submenu.scrollHeight;
    submenu.style.height     = target + 'px';
    submenu.style.transition = 'height 0.35s ease';
    var done = false;
    var onEnd = function () {
      if (done) return;
      done = true;
      submenu.removeEventListener('transitionend', onEnd);
      submenu.classList.remove('collapsing');
      submenu.classList.add('show');
      submenu.style.height = submenu.style.overflow =
        submenu.style.transition = submenu.style.display = '';
    };
    submenu.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, 400);
  }

  function collapseSubmenu(toggle, submenu) {
    toggle.setAttribute('aria-expanded', 'false');
    if (!submenu.querySelector('.sidenav-link.active, .sidenav-link.selected')) {
      toggle.classList.remove('active');
    }
    submenu.style.height     = submenu.scrollHeight + 'px';
    submenu.style.overflow   = 'hidden';
    submenu.style.transition = 'height 0.35s ease';
    submenu.classList.add('collapsing');
    void submenu.offsetHeight;
    submenu.style.height = '0px';
    var done = false;
    var onEnd = function () {
      if (done) return;
      done = true;
      submenu.removeEventListener('transitionend', onEnd);
      submenu.classList.remove('collapsing');
      submenu.classList.remove('show');
      submenu.style.height = submenu.style.overflow =
        submenu.style.transition = submenu.style.display = '';
    };
    submenu.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, 400);
  }

  function closeOthers(sidebarEl, exceptToggle) {
    var all = sidebarEl.querySelectorAll('[id^="tog_submenu_"]');
    all.forEach(function (t) {
      if (t === exceptToggle) return;
      var s = t.parentElement.querySelector('.sidenav-collapse');
      if (s && s.classList.contains('show')) collapseSubmenu(t, s);
    });
  }

  // ── Slim tooltips ─────────────────────────────────────────────────────────

  function getLinkLabel(link) {
    var span = link.querySelector('span');
    return span ? span.textContent.trim() : '';
  }

  function initSlimTooltips() {
    if (!window.Nimbus || !window.Nimbus.Tooltip) return;
    var links = document.querySelectorAll('#sidebar-cf .sidenav-link');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var label = getLinkLabel(link);
      if (!label) continue;
      if (!link.getAttribute('data-cnds-original-title')) {
        link.setAttribute('title', label);
      }
      window.Nimbus.Tooltip.getOrCreateInstance(link, {
        placement: 'right',
        trigger: 'hover',
        offset: [0, 12]
      });
    }
  }

  function disposeSlimTooltips() {
    if (!window.Nimbus || !window.Nimbus.Tooltip) return;
    var links = document.querySelectorAll('#sidebar-cf .sidenav-link');
    for (var i = 0; i < links.length; i++) {
      var instance = window.Nimbus.Tooltip.getInstance(links[i]);
      if (instance) instance.dispose();
      links[i].removeAttribute('title');
    }
  }

  function syncToggleIcon(isSlim) {
    var toggler = document.getElementById('slim-toggler');
    if (!toggler) return;
    var icon = toggler.querySelector('.mdi');
    if (!icon) return;
    if (isSlim) {
      icon.classList.remove('mdi-menu-open');
      icon.classList.add('mdi-menu-close');
    } else {
      icon.classList.remove('mdi-menu-close');
      icon.classList.add('mdi-menu-open');
    }
  }

  // ── Category accordion ────────────────────────────────────────────────────

  function setupCategoryToggles(sidebarEl) {
    var categoryToggles = sidebarEl.querySelectorAll('[id^="tog_submenu_"]');
    categoryToggles.forEach(function (toggle) {
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        var submenu = toggle.parentElement.querySelector('.sidenav-collapse');
        if (!submenu) return;
        if (submenu.classList.contains('collapsing')) return;
        var isOpen = submenu.classList.contains('show');
        var wasSlim = sidebarEl.classList.contains('sidenav-slim');
        if (wasSlim) {
          disposeSlimTooltips();
          sidebarEl.classList.remove('sidenav-slim');
          syncToggleIcon(false);
          requestAnimationFrame(function () {
            closeOthers(sidebarEl, toggle);
            expandSubmenu(toggle, submenu);
          });
          return;
        }
        closeOthers(sidebarEl, toggle);
        if (isOpen) {
          collapseSubmenu(toggle, submenu);
        } else {
          toggle.classList.add('active');
          expandSubmenu(toggle, submenu);
        }
      });
    });
  }

  // ── Slim toggle ───────────────────────────────────────────────────────────

  function setupSlimToggle(sidebarEl) {
    var toggler = document.getElementById('slim-toggler');
    if (!toggler) return;
    var categoryToggles = sidebarEl.querySelectorAll('[id^="tog_submenu_"]');

    toggler.addEventListener('click', function () {
      var isExpanded = !sidebarEl.classList.contains('sidenav-slim');
      if (isExpanded) {
        var openToggle = null, openSubmenu = null;
        categoryToggles.forEach(function (t) {
          var s = t.parentElement.querySelector('.sidenav-collapse');
          if (s && s.classList.contains('show')) { openToggle = t; openSubmenu = s; }
        });
        var doSlim = function () {
          sidebarEl.classList.add('sidenav-slim');
          syncToggleIcon(true);
          initSlimTooltips();
        };
        if (openSubmenu) { collapseSubmenu(openToggle, openSubmenu); setTimeout(doSlim, 380); }
        else { doSlim(); }
      } else {
        disposeSlimTooltips();
        sidebarEl.classList.remove('sidenav-slim');
        syncToggleIcon(false);
        setTimeout(function () {
          categoryToggles.forEach(function (t) {
            if (t.classList.contains('active')) {
              var s = t.parentElement.querySelector('.sidenav-collapse');
              if (s && !s.classList.contains('show')) expandSubmenu(t, s);
            }
          });
        }, 320);
      }
    });
  }

  // ── Main loader ───────────────────────────────────────────────────────────

  function loadSidenav() {
    var sidebarEl = document.getElementById('sidebar-cf');
    if (!sidebarEl) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'includes/sidenav.html', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      var ok =
        xhr.status === 200 ||
        (xhr.status === 0 && xhr.responseText && xhr.responseText.length > 0);

      if (!ok) {
        console.error(
          'Sidenav loader error: failed to load includes/sidenav.html (status ' +
            xhr.status + ')'
        );
        return;
      }

      sidebarEl.innerHTML = xhr.responseText;

      var page = detectCurrentPage();
      highlightCurrentPage(page.section, page.topic);

      setupCategoryToggles(sidebarEl);
      setupSlimToggle(sidebarEl);
    };
    xhr.send();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSidenav);
  } else {
    loadSidenav();
  }
})();
