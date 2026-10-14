/* ==========================================================================
   Nimbus Language Switcher — header menu behaviour
   --------------------------------------------------------------------------
   Mirrors Figma Nimbus/LanguageSwitcher (Nimbus/Header "Show Language") and the
   styleguide's cnds-header.html. Markup: #languageSwitcherWrapper >
   button#languageSwitcherToggle (mdi-translate + .language-switcher-code) +
   div.account-menu#languageMenu with [role=menuitemradio][data-lang-code] items,
   listed alphabetically by their own name (Deutsch, English, Français).

   Self-contained so every page frame can use it, whichever generation of
   header script it has: it opens with the same `.account-menu.open` class the
   portal and account menus use, closes any other open header menu, and closes
   on an outside click or Escape. Choosing a language marks it checked and
   updates the code and the trigger's aria-label.

   Angular: the trigger binds [attr.aria-expanded] and the current locale's
   code/label from a LocaleService; items come from languages$ sorted with
   localeCompare on their own names; select emits the code to the service.
   ========================================================================== */
(function () {
  "use strict";

  function init() {
    var toggle = document.getElementById("languageSwitcherToggle");
    var menu = document.getElementById("languageMenu");
    if (!toggle || !menu || toggle.getAttribute("data-lang-init")) return;
    toggle.setAttribute("data-lang-init", "1");
    var items = function () { return Array.prototype.slice.call(menu.querySelectorAll("[role='menuitemradio']")); };

    function closeOthers() {
      var open = document.querySelectorAll(".account-menu.open, .notif-popover.open");
      Array.prototype.forEach.call(open, function (m) {
        if (m === menu) return;
        m.classList.remove("open"); m.setAttribute("aria-hidden", "true");
        var t = document.querySelector("[aria-controls='" + m.id + "']");
        if (t) t.setAttribute("aria-expanded", "false");
      });
    }
    function setArrow() {
      var half = toggle.offsetWidth / 2;
      menu.style.setProperty("--menu-arrow-outer", Math.round(half - 8) + "px");
      menu.style.setProperty("--menu-arrow-inner", Math.round(half - 7) + "px");
    }
    /* Some frames make header menus position:fixed (to escape #UtilityNav's overflow clip) and place
       them from script. Do the same here: right edge on the trigger's right edge, 12px below it. */
    function place() {
      if (getComputedStyle(menu).position !== "fixed") return;
      var r = toggle.getBoundingClientRect(), w = menu.offsetWidth || 180;
      menu.style.top = (r.bottom + 12) + "px";
      menu.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
    }
    function open() {
      closeOthers(); setArrow();
      menu.classList.add("open"); menu.removeAttribute("aria-hidden"); place();
      toggle.setAttribute("aria-expanded", "true");
      var cur = menu.querySelector("[aria-checked='true']") || items()[0];
      if (cur) cur.focus();
    }
    function close(focusTrigger) {
      menu.classList.remove("open"); menu.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
      if (focusTrigger) toggle.focus();
    }
    function isOpen() { return menu.classList.contains("open"); }

    toggle.addEventListener("click", function (e) { e.stopPropagation(); isOpen() ? close(true) : open(); });
    toggle.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isOpen()) open(); }
    });
    menu.addEventListener("keydown", function (e) {
      var list = items(), i = list.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === "Tab") { close(false); }
    });
    menu.addEventListener("click", function (e) {
      var item = e.target.closest ? e.target.closest("[role='menuitemradio']") : null;
      if (!item) return;
      e.preventDefault();
      items().forEach(function (it) { var on = it === item; it.setAttribute("aria-checked", on ? "true" : "false"); it.classList.toggle("active", on); });
      var code = toggle.querySelector(".language-switcher-code");
      if (code) code.textContent = item.getAttribute("data-lang-code");
      toggle.setAttribute("aria-label", "Language: " + item.textContent.trim());
      close(true);
    });
    window.addEventListener("resize", function () { if (isOpen()) place(); }, { passive: true });
    window.addEventListener("scroll", function () { if (isOpen()) place(); }, { passive: true });
    document.addEventListener("click", function (e) {
      if (isOpen() && !menu.contains(e.target) && !toggle.contains(e.target)) close(false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
