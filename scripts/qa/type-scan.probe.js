window.__typeScan = function (scope, label) {
  var seen = {};
  [].forEach.call((scope || document).querySelectorAll("*"), function (n) {
    if (n.closest(".skeleton-list, .skeleton-group, #PROBE")) return;
    if (!n.offsetParent && n !== document.body) return;
    var txt = "";
    [].forEach.call(n.childNodes, function (c) { if (c.nodeType === 3) txt += c.nodeValue.trim(); });
    if (!txt) return;
    var c = getComputedStyle(n);
    var ls = c.letterSpacing === "normal" ? 0 : Math.round(parseFloat(c.letterSpacing) * 100) / 100;
    var k = Math.round(parseFloat(c.fontSize)) + "/" + c.fontWeight + "/" + ls;
    if (!seen[k]) seen[k] = { n: 0, cls: {}, eg: [] };
    seen[k].n++;
    var cn = (n.className || "").toString().trim().split(/\s+/)[0] || n.tagName.toLowerCase();
    seen[k].cls[cn] = (seen[k].cls[cn] || 0) + 1;
    if (seen[k].eg.length < 2) seen[k].eg.push(txt.slice(0, 18));
  });
  return { label: label, rows: seen };
};
