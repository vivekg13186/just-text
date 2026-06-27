// Minimal dependency-free test runner for the line operations.
// Run with: node tests/lineops.test.js
const ops = require("../src/lineops.js");

let pass = 0;
let fail = 0;
function eq(actual, expected, name) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

eq(ops.sortLines("b\na\nc"), "a\nb\nc", "sort asc");
eq(ops.sortLines("b\na\nc", { reverse: true }), "c\nb\na", "sort desc");
eq(ops.sortLines("B\na\nC", { caseSensitive: false }), "a\nB\nC", "sort case-insensitive");
eq(ops.removeDuplicates("a\nb\na\nc\nb"), "a\nb\nc", "dedup keeps order");
eq(ops.removeDuplicates("a\nA", { caseSensitive: false }), "a", "dedup case-insensitive");
eq(ops.removeEmpty("a\n\n  \nb"), "a\nb", "remove empty/whitespace lines");
eq(ops.filterStartsWith("apple\nbanana\navocado", "a"), "apple\navocado", "keep starts with");
eq(ops.filterStartsWith("apple\nbanana\navocado", "a", { keep: false }), "banana", "remove starts with");
eq(ops.filterEndsWith("one.txt\ntwo.md\nthree.txt", ".txt"), "one.txt\nthree.txt", "keep ends with");
eq(ops.filterContains("error: x\ninfo: y\nerror: z", "error"), "error: x\nerror: z", "keep contains");
eq(ops.filterContains("error: x\ninfo: y", "error", { keep: false }), "info: y", "remove contains");
eq(ops.trimTrailingWhitespace("a  \nb\t"), "a\nb", "trim trailing whitespace");
eq(ops.filterStartsWith("a\nb", ""), "a\nb", "empty prefix is no-op");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
