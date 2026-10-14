/* "Not in this demo" — says what the screen is and whether it ships today.
   Query: ?what=<screen name>&ships=1  (ships=1: the screen exists in the product today). */
(function () {
  "use strict";
  var q = new URLSearchParams(window.location.search);
  var what = q.get("what") || "This screen";
  var ships = q.get("ships") === "1";
  document.getElementById("demoStubTitle").textContent = what;
  document.getElementById("demoStubText").textContent = ships
    ? what + " ships in CaseFusion today. It is not part of this demo."
    : what + " is not part of this demo.";
  document.title = what + " · Meridian Biopharma · CaseFusion";
}());
