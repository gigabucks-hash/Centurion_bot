"use strict";

// Used only where @parcel/watcher turns ignore globs into regex source.
// Stars and globstars only. No extglobs, no nested quantifiers.

function escapeChar(c) {
  return /[\\^$+?.()|[\]{}]/.test(c) ? "\\" + c : c;
}

function makeRe(glob, options = {}) {
  const windows = options.windows === true;
  const sep = windows ? "[\\\\/]" : "\\/";
  const notSep = windows ? "[^\\\\/]" : "[^/]";
  const parts = String(glob).split("/");
  let body = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const prev = i > 0 ? parts[i - 1] : "";
    if (part === "**") {
      const next = parts[i + 1];
      if (next === undefined) body += `(?:${sep}.*)?`;
      else if (i === 0) body += `(?:(?:${notSep}+${sep})*)?`;
      else body += `(?:${sep}(?:${notSep}+${sep})*)?`;
      continue;
    }
    if (i > 0 && prev !== "**") body += sep;
    let seg = "";
    for (let j = 0; j < part.length; j++) {
      const c = part[j];
      if (c === "*") seg += `${notSep}*`;
      else if (c === "?") seg += notSep;
      else if (c === "\\" && j + 1 < part.length) seg += escapeChar(part[++j]);
      else seg += escapeChar(c);
    }
    body += seg;
  }
  return new RegExp(`^${body}$`);
}

function picomatch(glob, options) {
  const regex = makeRe(glob, options);
  const fn = (input) => regex.test(input);
  fn.regex = regex;
  return fn;
}

picomatch.makeRe = makeRe;
module.exports = picomatch;
