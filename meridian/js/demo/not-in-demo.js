/* "Not in this demo" — says what the screen is and whether it ships today.
   Query: ?what=<screen name>&ships=1&filter=<status>  (ships=1: the screen exists in the product today; filter: the
   status the screen opens filtered to). */
(function () {
  "use strict";
  var q = new URLSearchParams(window.location.search);
  var what = q.get("what") || "This screen";
  var ships = q.get("ships") === "1";
  document.getElementById("demoStubTitle").textContent = what;
  document.getElementById("demoStubText").textContent = ships
    ? what + " ships in CaseFusion today. It is not part of this demo."
    : what + " is not part of this demo.";
  /* &filter=<status>: the screen opens pre-filtered (e.g. My Cases from My Work's SHOW ALL 18 CASES opens filtered to Active). */
  var filter = q.get("filter");
  if (filter) document.getElementById("demoStubText").textContent += " It opens filtered to " + filter + " cases.";
  document.title = what + " · Meridian Biopharma · CaseFusion";
}());
