/* ═══════════════════════════════════════════════════════════════════════
   Case › Add sources for custodians (PRD 01 §7.9, M20a, M21, M23, M26–M29,
   AC10, AC12, AC13, V5, V6, V7). The only door whose output is n sources
   for n people: one source type for several custodians in one action.
   Each custodian is looked up in the asset inventory; "Not in the
   inventory" is a normal outcome (M28) and the identifier is typed with a
   note. How each source was identified is kept on it (M27). Found through:
   Added for a custodian. Standard sources are unchanged.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var M = window.MERIDIAN, D = window.MeridianDemo, esc = D.esc, X = window.AddDoors, F = X.A.forCustodians;
  var LOCK = '<i class="mdi mdi-lock-outline" aria-hidden="true"></i>';
  var NONE = "none";
  var caseIds = M.custodians.map(function (c) { return c.personId; });
  var st, done = null, addedIdents = {};
  function typeOf(key) { for (var i = 0; i < F.types.length; i++) if (F.types[i].key === key) return F.types[i]; return null; }

  /* An inventory record already on the case (the ledger, or added in this visit) cannot be chosen again (V5). */
  function recOnCase(ident) {
    return !!addedIdents[ident] || M.sources.some(function (s) { return s.name.split(" ").indexOf(ident) !== -1; });
  }
  /* API seam: the asset inventory lookup, per person, for one source type. */
  var api = { lookup: function (pid, type) { return ((F.inventory[type] || {})[pid] || []).map(function (r) { return { id: r[0], desc: r[1], system: r[2], onCase: recOnCase(r[0]) }; }); } };

  function freshRow(pid) {
    var recs = api.lookup(pid, st.type), free = recs.filter(function (r) { return !r.onCase; })[0];
    return { rec: free ? free.id : NONE, ident: free ? free.id : "", note: ((F.defaultNotes[st.type] || {})[pid]) || "", touched: false };
  }
  function reset(pids) {
    st = { custodians: [], type: "mobile", method: "custodian_named", handler: "rule", rows: {} };
    (pids || F.defaultCustodians).forEach(addCustodian);
  }
  function addCustodian(pid) { if (st.custodians.indexOf(pid) === -1) { st.custodians.push(pid); st.rows[pid] = freshRow(pid); } }

  function who(pid, i) { var p = M.person(pid); return D.canSee(p) ? p.name : "the custodian in row " + (i + 1); }
  /* What blocks ADD, in words (V6, V7); empty when nothing does. */
  function blocker() {
    if (!st.custodians.length || !st.type) return "Choose the custodians and the source type.";
    for (var i = 0; i < st.custodians.length; i++) {
      if (!st.rows[st.custodians[i]].ident.trim()) return "Give an identifier for " + who(st.custodians[i], i) + ", or remove the row.";
    }
    return "";
  }
  var WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  /* ── Markup ────────────────────────────────────────────────────────── */
  var root = document.getElementById("adRoot");
  function selectHtml(id, opts, value, label, required, attrs) {
    return '<div class="select-wrapper-casefusion"><select id="' + id + '" data-cnds-select-init' + (attrs ? " " + attrs : "") + ">" +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? " selected" : "") + (o[2] ? ' data-cnds-secondary-text="' + esc(o[2]) + '"' : "") + (o[3] ? " disabled" : "") + ">" + esc(o[1]) + "</option>"; }).join("") +
      "</select>" + (label ? '<label class="form-label select-label">' + esc(label) + (required ? ' <span class="cf-input-required">*</span>' : "") + "</label>" : "") + "</div>";
  }
  function helper(text) { return '<div class="cf-input-helper"><span class="cf-input-helper-text ad-meta">' + text + "</span></div>"; }
  function handlerOpts() {
    var t = typeOf(st.type), rule = t && t.handlerType && M.handlerFor[t.handlerType];
    var o = [];
    if (rule) o.push(["rule", rule.handler + " · from the source type"]);
    o.push(["case", "Case team"], ["per", "Choose per request"]);
    return o;
  }
  function handlerHelp() {
    var t = typeOf(st.type);
    if (!t) return "Set by the routing rule for the source type.";
    return t.handlerType ? "Set by the routing rule for " + esc(t.name) + "." : "No routing rule covers " + esc(t.name) + ". The case team handles it, or the requester chooses per request.";
  }

  function fieldsHtml() {
    var left = caseIds.filter(function (pid) { return st.custodians.indexOf(pid) === -1; });
    var chips = st.custodians.map(function (pid) {
      var p = M.person(pid), ok = D.canSee(p);
      return '<span class="chip' + (ok ? "" : " demo-masked") + '">' + (ok ? "" : LOCK) + esc(D.nameFor(p)) +
        ' <i class="close mdi mdi-close-circle" role="button" tabindex="0" data-rm="' + pid + '" aria-label="Remove ' + esc(D.nameFor(p)) + '"></i></span>';
    }).join("");
    var menu = left.map(function (pid) {
      var p = M.person(pid), ok = D.canSee(p);
      return '<li><button type="button" class="dropdown-item" data-addc="' + pid + '">' + esc(D.nameFor(p)) + '<span class="dropdown-item-secondary-text">' + esc(ok ? p.title : "Outside your regions") + "</span></button></li>";
    }).join("");
    var addBtn = left.length ?
      '<div class="dropdown"><button type="button" class="btn btn-tertiary btn-sm dropdown-toggle" data-cnds-toggle="dropdown" aria-expanded="false"><i class="mdi mdi-plus" aria-hidden="true"></i> ADD CUSTODIAN</button>' +
        '<ul class="dropdown-menu dropdown-menu-product dropdown-menu-casefusion">' + menu + "</ul></div>" :
      '<span title="Every custodian on this case is chosen."><button type="button" class="btn btn-tertiary btn-sm" disabled><i class="mdi mdi-plus" aria-hidden="true"></i> ADD CUSTODIAN</button></span>';
    var typeOpts = [["", "", "", true]].concat(F.types.map(function (t) { return [t.key, t.name]; }));
    return '<div class="ad-fields mb-3">' +
      '<div><span class="cf-input-label d-block mb-1">Custodians <span class="cf-input-required">*</span></span>' +
        '<div class="ad-chips">' + (chips || '<span class="ad-meta text-muted">No custodians chosen.</span>') + addBtn + "</div>" +
        helper("Who the sources are for, from this case's custodians. Adding a source does not add a custodian.") + "</div>" +
      "<div>" + selectHtml("adType", typeOpts, st.type, "Source Type", true, 'data-cnds-placeholder="Choose a source type" data-cnds-clear-button="true"') +
        helper('Types that are not standard sources for these people. Standard sources are set on <a href="admin-source-types.html">Source Types</a>.') + "</div>" +
      "<div>" + selectHtml("adMethod", F.methods.map(function (m) { return [m.key, m.label]; }), st.method, "Identification Method", true) +
        helper("Kept on each source as the reason it is on the case.") + "</div>" +
      '<div id="adHandlerField">' + handlerField() + "</div>" +
    "</div>";
  }
  function handlerField() {
    var opts = handlerOpts();
    if (!opts.some(function (o) { return o[0] === st.handler; })) st.handler = opts[0][0];
    return selectHtml("adHandler", opts, st.handler, "Handler", true) + helper(handlerHelp());
  }

  function rowHtml(pid, i) {
    var p = M.person(pid), ok = D.canSee(p), r = st.rows[pid], recs = api.lookup(pid, st.type);
    var taken = recs.filter(function (x) { return x.onCase; }), chosen = recs.filter(function (x) { return x.id === r.rec; })[0];
    var opts = recs.map(function (x) { return [x.id, x.id + " · " + x.desc, x.onCase ? "Already on this case" : x.system, x.onCase]; }).concat([[NONE, "Not in the inventory"]]);
    var empty = !r.ident.trim(), bad = empty && r.touched;
    var name = ok ? esc(p.name) : LOCK + "Profile details limited";
    var t = typeOf(st.type);
    return "<tr><td><div class=\"ad-person\">" + (ok ? D.avatar(p, 32) : '<span class="monogram demo-avatar demo-avatar-32">' + LOCK + "</span>") +
        '<div><span class="d-block fw-bold' + (ok ? "" : " demo-masked") + '">' + name + '</span><span class="d-block ad-meta text-muted">' + esc(ok ? p.title : "Outside your regions") + "</span></div></div></td>" +
      "<td>" + selectHtml("adRec-" + pid, opts, r.rec, null, false, 'data-rec="' + pid + '" aria-label="From the asset inventory for ' + esc(D.nameFor(p)) + '"') +
        (chosen ? '<span class="d-block ad-meta text-muted mt-1">' + esc(chosen.system) + " record</span>" : "") +
        (taken.length ? '<span class="d-block ad-meta mt-1">' + esc(taken.map(function (x) { return (t ? t.prefix + " " : "") + x.id; }).join(", ")) + (taken.length === 1 ? " is" : " are") + " already on this case.</span>" : "") + "</td>" +
      '<td><div class="cf-input-field cf-input-field-sm cf-input-field-casefusion' + (bad ? " is-invalid" : "") + '"><div class="cf-input-wrapper">' +
        '<input type="text" class="cf-input-control" data-ident="' + pid + '" value="' + esc(r.ident) + '" aria-label="Identifier for ' + esc(D.nameFor(p)) + '"' + (bad ? ' aria-invalid="true"' : "") + " /></div>" +
        '<div class="cf-input-helper"><span class="cf-input-error">Give an identifier for ' + esc(who(pid, i)) + ", or remove the row.</span></div></div></td>" +
      '<td><div class="cf-input-field cf-input-field-sm cf-input-field-casefusion"><div class="cf-input-wrapper">' +
        '<input type="text" class="cf-input-control" data-note="' + pid + '" value="' + esc(r.note) + '" aria-label="Note for ' + esc(D.nameFor(p)) + '"' + (r.rec === NONE ? ' placeholder="Why it is not in the inventory"' : "") + " /></div></div></td>" +
      '<td class="text-end"><button type="button" class="btn btn-tertiary btn-sm" data-rm="' + pid + '">REMOVE</button></td></tr>';
  }
  function tableHtml() {
    if (!X.isReady()) return X.skeletonRows(Math.max(1, st.custodians.length), 5, false);
    if (!st.custodians.length) return '<tr><td colspan="5"><div class="demo-empty py-4"><i class="mdi mdi-account-multiple-outline mdi-36px" aria-hidden="true"></i><div class="demo-empty-title">No Custodians</div>' +
      '<div class="demo-empty-note">Use ADD CUSTODIAN to choose who the sources are for.</div></div></td></tr>';
    return st.custodians.map(rowHtml).join("");
  }
  function footHtml() {
    var t = typeOf(st.type), n = st.custodians.length, why = blocker();
    var words = n <= 10 ? WORDS[n] : String(n);
    return '<span class="ad-foot-text">These sources are on this case only, for ' + (n === 1 ? "this person" : "these " + words + " people") +
        ". Standard sources are unchanged, and nothing is preserved until a request is sent.</span>" +
      '<div class="toolbar-action-end"><span class="ad-meta text-muted me-2" id="adWhy" aria-live="polite">' + esc(why || (t && n ? n + " " + (n === 1 ? t.one : t.many) + " will be added for " + n + " custodian" + (n === 1 ? "" : "s") + "." : "")) + "</span>" +
        '<a class="btn btn-secondary" href="' + esc(X.dataMapUrl()) + '">CANCEL</a>' +
        '<button type="button" class="btn btn-primary" data-ad="add" aria-describedby="adWhy"' + (why ? " disabled" : "") + ">ADD " + (n || "") + (n ? " " : "") + "SOURCE" + (n === 1 ? "" : "S") + "</button></div>";
  }

  function render() {
    root.innerHTML = '<div id="adDone">' + (done || "") + "</div>" +
      '<p class="ad-body ad-intro mb-3">A device or account that is not one of their standard sources, for several custodians in one action. Each custodian is looked up in the asset inventory.</p>' +
      '<div class="ad-body" id="adFields">' + fieldsHtml() + "</div>" +
      '<div class="table-responsive mb-3"><table class="table align-middle mb-0 ad-table ad-cust-table ad-body"><thead><tr><th scope="col">Custodian</th><th scope="col">From the Asset Inventory</th>' +
        '<th scope="col">Identifier</th><th scope="col">Note</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody id="adRows">' + tableHtml() + "</tbody></table></div>" +
      '<div class="btn-toolbar-gray btn-toolbar-action ad-foot mb-4" id="adFoot" role="toolbar" aria-label="Add sources actions">' + footHtml() + "</div>";
    if (window.Nimbus && Nimbus.Select) Nimbus.Select.initAll(root);
  }
  /* Typing changes only the footer and the field's own state, so focus stays in the field. */
  function renderFoot() { document.getElementById("adFoot").innerHTML = footHtml(); }

  /* ── Events ────────────────────────────────────────────────────────── */
  function onSelect(e) {
    var el = e.target, id = el.id;
    if (id === "adType") { st.type = el.value; st.custodians.forEach(function (pid) { st.rows[pid] = freshRow(pid); }); render(); return; }
    if (id === "adMethod") { st.method = el.value; return; }
    if (id === "adHandler") { st.handler = el.value; return; }
    var pid = el.getAttribute && el.getAttribute("data-rec");
    if (pid) { var r = st.rows[pid]; if (r.rec === el.value) return; r.rec = el.value; r.ident = el.value === NONE ? "" : el.value; r.touched = false; render(); }
  }
  root.addEventListener("valueChanged.cnds.select", onSelect);
  root.addEventListener("change", function (e) { if (e.target.tagName === "SELECT") onSelect(e); });
  root.addEventListener("input", function (e) {
    var pid = e.target.getAttribute("data-ident");
    if (pid) { st.rows[pid].ident = e.target.value; var f = e.target.closest(".cf-input-field"); if (e.target.value.trim()) f.classList.remove("is-invalid"); renderFoot(); return; }
    pid = e.target.getAttribute("data-note");
    if (pid) st.rows[pid].note = e.target.value;
  });
  root.addEventListener("focusout", function (e) {
    var pid = e.target.getAttribute && e.target.getAttribute("data-ident");
    if (!pid) return;
    st.rows[pid].touched = true;
    var empty = !e.target.value.trim(), f = e.target.closest(".cf-input-field");
    f.classList.toggle("is-invalid", empty);
    if (empty) e.target.setAttribute("aria-invalid", "true"); else e.target.removeAttribute("aria-invalid");
  });
  function remove(pid) { st.custodians = st.custodians.filter(function (x) { return x !== pid; }); delete st.rows[pid]; render(); }
  root.addEventListener("keydown", function (e) { var pid = e.target.getAttribute && e.target.getAttribute("data-rm"); if (pid && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); remove(pid); } });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm], [data-addc], [data-ad]");
    if (!b) return;
    if (b.hasAttribute("data-rm")) { remove(b.getAttribute("data-rm")); return; }
    if (b.hasAttribute("data-addc")) { addCustodian(b.getAttribute("data-addc")); render(); return; }
    var a = b.getAttribute("data-ad");
    if (a === "again") { done = null; reset(); render(); return; }
    if (a === "add" && !blocker()) add();
  });
  function add() {
    var t = typeOf(st.type), n = st.custodians.length;
    var tokens = st.custodians.map(function (pid) { addedIdents[st.rows[pid].ident.trim()] = true; return "cust:" + pid + ":" + t.key + ":" + st.method + ":" + encodeURIComponent(st.rows[pid].ident.trim()); });
    var method = F.methods.filter(function (m) { return m.key === st.method; })[0].label;
    done = X.doneAlert(n, "Added for a custodian", tokens, n + " " + (n === 1 ? t.one : t.many) + " for " + n + " custodian" + (n === 1 ? "" : "s") + ", each identified as: " + method + ". Standard sources are unchanged.");
    /* Saved: nothing is left for CANCEL to discard (shell guard). */
    [].forEach.call(root.querySelectorAll("input, select"), function (f) { f.removeAttribute("data-demo-changed"); });
    st.custodians = []; st.rows = {};
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    D.toast(n + " source" + (n === 1 ? "" : "s") + " added to this case.");
  }

  reset();
  render();
  X.whenReady(render);
}());
