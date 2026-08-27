/* ============================================================================
 * figma-variable-export.js
 * ----------------------------------------------------------------------------
 * Dumps every Figma variable from the Cloudficient Nimbus library as JSON, with
 * aliases fully resolved to concrete values in both Theme modes.
 *
 * HOW TO RUN
 *   Paste the body of this file into the Figma MCP `use_figma` tool against the
 *   Nimbus library (file key jThQfXbV5iVOpE6cGmASCj), or into a Figma plugin
 *   console. Save the returned JSON to:
 *
 *       nimbus-v1/tools/figma-variables.json
 *
 *   Then run:  python3 tools/build-nimbus-manifest.py
 *
 * WHY A DUMP AND NOT THE REST API
 *   Figma's REST variables endpoint (/v1/files/:key/variables/local) is
 *   Enterprise-only. This snippet needs no plan tier and no token. If the org
 *   moves to Enterprise, swap this step for a REST call — the JSON shape below
 *   is what build-nimbus-manifest.py expects, so nothing downstream changes.
 *
 * THE TRAP THIS SOLVES
 *   Aliases cross collections. Theme has modes Dark/Light; Primitives has a
 *   single "Mode 1". Following an alias with the *source* collection's modeId
 *   returns undefined and the value silently resolves to null. Every resolver
 *   written against this file must switch to the target collection's own mode
 *   when it crosses a boundary — see resolve() below.
 * ========================================================================== */

const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();

const collectionById = {};
for (const c of collections) collectionById[c.id] = c;
const variableById = {};
for (const v of variables) variableById[v.id] = v;

const toHex = (c) =>
  c && typeof c === 'object' && 'r' in c
    ? '#' + ['r', 'g', 'b'].map((k) => Math.round(c[k] * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
    : null;

/** Resolve a variable to a concrete value, following aliases across collections. */
const resolve = (variable, modeId, depth = 0) => {
  if (depth > 16) return { value: null, note: 'alias loop' };

  let value = variable.valuesByMode[modeId];
  if (value === undefined) {
    // Mode does not exist in this variable's collection — fall back to its default.
    const col = collectionById[variable.variableCollectionId];
    const fallbackMode = col ? col.defaultModeId : Object.keys(variable.valuesByMode)[0];
    value = variable.valuesByMode[fallbackMode] ?? variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
  }

  if (value && value.type === 'VARIABLE_ALIAS') {
    const next = variableById[value.id];
    if (!next) return { value: null, note: 'dangling alias' };
    const crossesCollection = next.variableCollectionId !== variable.variableCollectionId;
    const nextMode = crossesCollection ? collectionById[next.variableCollectionId].defaultModeId : modeId;
    const out = resolve(next, nextMode, depth + 1);
    return { value: out.value, note: out.note, via: [next.name].concat(out.via || []) };
  }

  return { value, via: [] };
};

const theme = collections.find((c) => c.name === 'Theme');
const darkMode = theme.modes.find((m) => m.name === 'Dark').modeId;
const lightMode = theme.modes.find((m) => m.name === 'Light').modeId;

const out = { generatedFrom: figma.root.name, collections: {}, variables: [] };
for (const c of collections) {
  out.collections[c.name] = { modes: c.modes.map((m) => m.name), defaultMode: c.defaultModeId };
}

for (const v of variables) {
  const col = collectionById[v.variableCollectionId];
  const row = {
    name: v.name,
    id: v.id,
    key: v.key || null,
    collection: col ? col.name : null,
    type: v.resolvedType,
    scopes: v.scopes,
    description: v.description || ''
  };

  if (col && col.name === 'Theme') {
    const l = resolve(v, lightMode);
    const d = resolve(v, darkMode);
    row.light = v.resolvedType === 'COLOR' ? toHex(l.value) : l.value;
    row.dark = v.resolvedType === 'COLOR' ? toHex(d.value) : d.value;
    row.lightVia = l.via || [];
    row.darkVia = d.via || [];
    if (l.note || d.note) row.note = l.note || d.note;
  } else {
    const only = resolve(v, col ? col.defaultModeId : Object.keys(v.valuesByMode)[0]);
    row.value = v.resolvedType === 'COLOR' ? toHex(only.value) : only.value;
    row.via = only.via || [];
    if (only.note) row.note = only.note;
  }

  out.variables.push(row);
}

out.variables.sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name));

// Duplicate names are a defect worth surfacing at export time, not later.
const seen = {};
for (const v of out.variables) {
  const k = v.collection + '|' + v.name;
  (seen[k] = seen[k] || []).push(v.id);
}
out.duplicateNames = Object.entries(seen)
  .filter(([, ids]) => ids.length > 1)
  .map(([k, ids]) => ({ key: k, ids }));

out.counts = Object.fromEntries(
  Object.keys(out.collections).map((c) => [c, out.variables.filter((v) => v.collection === c).length])
);

return out;
