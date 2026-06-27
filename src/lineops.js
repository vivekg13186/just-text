// Pure line-based text transformations. Works in the browser (global `lineops`)
// and under Node (module.exports) so it can be unit-tested.
(function (root) {
  "use strict";

  const split = (t) => t.split("\n");
  const join = (a) => a.join("\n");

  function sortLines(text, { reverse = false, caseSensitive = true } = {}) {
    const lines = split(text);
    lines.sort((a, b) => {
      const x = caseSensitive ? a : a.toLowerCase();
      const y = caseSensitive ? b : b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (reverse) lines.reverse();
    return join(lines);
  }

  function removeDuplicates(text, { caseSensitive = true } = {}) {
    const seen = new Set();
    const out = [];
    for (const line of split(text)) {
      const key = caseSensitive ? line : line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(line);
      }
    }
    return join(out);
  }

  function removeEmpty(text, { whitespaceOnly = true } = {}) {
    return join(
      split(text).filter((ln) => (whitespaceOnly ? ln.trim() !== "" : ln !== ""))
    );
  }

  function filterStartsWith(text, prefix, { keep = true } = {}) {
    if (prefix === "") return text;
    return join(split(text).filter((ln) => ln.startsWith(prefix) === keep));
  }

  function filterEndsWith(text, suffix, { keep = true } = {}) {
    if (suffix === "") return text;
    return join(split(text).filter((ln) => ln.endsWith(suffix) === keep));
  }

  function filterContains(text, needle, { keep = true } = {}) {
    if (needle === "") return text;
    return join(split(text).filter((ln) => ln.includes(needle) === keep));
  }

  function trimTrailingWhitespace(text) {
    return join(split(text).map((ln) => ln.replace(/\s+$/, "")));
  }

  const api = {
    sortLines,
    removeDuplicates,
    removeEmpty,
    filterStartsWith,
    filterEndsWith,
    filterContains,
    trimTrailingWhitespace,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.lineops = api;
  }
})(typeof window !== "undefined" ? window : this);
