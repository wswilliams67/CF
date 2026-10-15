/* Launcher: pick the viewer before opening a screen. Same key as the shell. */
(function () {
  "use strict";
  var KEY = "mbp-demo-viewer";
  var M = window.MERIDIAN;
  function current() {
    try { var v = localStorage.getItem(KEY); return M.viewers.some(function (x) { return x.id === v; }) ? v : "v-us"; } catch (e) { return "v-us"; }
  }
  function render() {
    var id = current();
    document.querySelectorAll("[data-viewer]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-viewer") === id ? "true" : "false");
    });
    var v = M.viewers.filter(function (x) { return x.id === id; })[0];
    var p = M.person(v.personId);
    document.getElementById("launchViewer").textContent =
      "Screens open as " + p.name + " (" + v.roles.join(", ") + "). People outside " +
      (v.region === "US" ? "the United States" : "the Rest of world region") + " show limited profile details.";
  }
  document.querySelectorAll("[data-viewer]").forEach(function (b) {
    b.addEventListener("click", function () {
      try { localStorage.setItem(KEY, b.getAttribute("data-viewer")); } catch (e) { /* private window */ }
      render();
    });
  });
  render();
}());
