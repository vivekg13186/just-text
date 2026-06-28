"use strict";

// ---- Tauri bridge (graceful fallback when opened in a plain browser) ------
const TAURI = window.__TAURI__ || null;
const invoke = TAURI ? TAURI.core.invoke : null;
const dialog = TAURI ? TAURI.dialog : null;

const backend = {
  readFile: (path) => (invoke ? invoke("read_file", { path }) : Promise.reject("no backend")),
  writeFile: (path, content) => (invoke ? invoke("write_file", { path, content }) : Promise.reject("no backend")),
};

// MDI "close" icon used for tab close buttons.
const CLOSE_ICON =
  '<svg class="icon" viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>';

// ---- DOM refs -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const editor = $("editor");
const gutter = $("gutter");
const tabbar = $("tabbar");
const statusbar = $("statusbar");

// ---- state ----------------------------------------------------------------
let tabs = [];
let activeId = null;
let tabSeq = 1;

function newTab(title = "Untitled", content = "") {
  const tab = {
    id: tabSeq++,
    title,
    content,
    filePath: null,
    dirty: false,
    scrollTop: 0,
    selStart: 0,
    selEnd: 0,
  };
  tabs.push(tab);
  activeId = tab.id;
  renderTabs();
  loadTabIntoEditor(tab);
  return tab;
}

function activeTab() {
  return tabs.find((t) => t.id === activeId) || null;
}

function saveEditorToState() {
  const t = activeTab();
  if (!t) return;
  t.content = editor.value;
  t.scrollTop = editor.scrollTop;
  t.selStart = editor.selectionStart;
  t.selEnd = editor.selectionEnd;
}

function loadTabIntoEditor(tab) {
  editor.value = tab.content;
  editor.scrollTop = tab.scrollTop;
  editor.setSelectionRange(tab.selStart || 0, tab.selEnd || 0);
  updateGutter();
  if (window.Spellcheck) Spellcheck.onTabSwitch();
  editor.focus();
}

function switchTab(id) {
  if (id === activeId) return;
  saveEditorToState();
  activeId = id;
  const t = activeTab();
  renderTabs();
  if (t) loadTabIntoEditor(t);
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const t = tabs[idx];
  if (t.dirty && !confirm("This tab has unsaved changes. Close anyway?")) return;
  tabs.splice(idx, 1);
  if (activeId === id) {
    const next = tabs[idx] || tabs[idx - 1];
    if (next) {
      activeId = next.id;
      loadTabIntoEditor(next);
    } else {
      newTab();
      return;
    }
  }
  renderTabs();
}

function markDirty() {
  const t = activeTab();
  if (t && !t.dirty) {
    t.dirty = true;
    renderTabs();
  }
}

// ---- rendering ------------------------------------------------------------
function renderTabs() {
  tabbar.innerHTML = "";
  for (const t of tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === activeId ? " active" : "");
    el.onclick = () => switchTab(t.id);

    const label = document.createElement("span");
    label.textContent = t.title;
    el.appendChild(label);
    if (t.dirty) {
      const dot = document.createElement("span");
      dot.className = "dirty";
      dot.textContent = "●";
      el.appendChild(dot);
    }

    const close = document.createElement("button");
    close.className = "tab-close icon-only";
    close.innerHTML = CLOSE_ICON;
    close.title = "Close tab";
    close.onclick = (e) => {
      e.stopPropagation();
      closeTab(t.id);
    };
    el.appendChild(close);
    tabbar.appendChild(el);
  }
}

function updateGutter() {
  const count = editor.value.split("\n").length;
  let out = "";
  for (let i = 1; i <= count; i++) out += i + "\n";
  gutter.textContent = out;
  gutter.scrollTop = editor.scrollTop;
}

function setStatus(msg) {
  statusbar.textContent = msg;
}

// ---- line operations ------------------------------------------------------
function applyLineOp(fn) {
  const v = editor.value;
  let s = editor.selectionStart;
  let e = editor.selectionEnd;
  let start, end;
  if (e > s) {
    start = v.lastIndexOf("\n", s - 1) + 1;
    const after = v.indexOf("\n", e);
    end = after === -1 ? v.length : after;
    // if selection end sits exactly at a line start, trim the trailing newline
    if (e > start && v[e - 1] === "\n") end = e - 1;
  } else {
    start = 0;
    end = v.length;
  }
  const segment = v.slice(start, end);
  const result = fn(segment);
  editor.value = v.slice(0, start) + result + v.slice(end);
  editor.setSelectionRange(start, start + result.length);
  markDirty();
  updateGutter();
  editor.focus();
}

function promptFilter(kind, keep) {
  const verb = keep ? "Keep" : "Remove";
  const label = { starts: "starting with", ends: "ending with", has: "containing" }[kind];
  const value = prompt(`${verb} lines ${label}:`);
  if (value === null || value === "") return;
  applyLineOp((txt) => {
    if (kind === "starts") return lineops.filterStartsWith(txt, value, { keep });
    if (kind === "ends") return lineops.filterEndsWith(txt, value, { keep });
    return lineops.filterContains(txt, value, { keep });
  });
}

const LINE_OPS = {
  "sort-asc": (t) => lineops.sortLines(t),
  "sort-desc": (t) => lineops.sortLines(t, { reverse: true }),
  "sort-ci": (t) => lineops.sortLines(t, { caseSensitive: false }),
  dedup: (t) => lineops.removeDuplicates(t),
  "rm-empty": (t) => lineops.removeEmpty(t),
  trim: (t) => lineops.trimTrailingWhitespace(t),
};

// ---- find & replace -------------------------------------------------------
function buildRegex(term, { global = true } = {}) {
  const caseSensitive = $("find-case").checked;
  const wholeWord = $("find-word").checked;
  let pat = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wholeWord) pat = `\\b${pat}\\b`;
  let flags = global ? "g" : "";
  if (!caseSensitive) flags += "i";
  return new RegExp(pat, flags);
}

function scrollMatchIntoView(index) {
  const before = editor.value.slice(0, index);
  const line = before.split("\n").length - 1;
  const lh = parseFloat(getComputedStyle(editor).lineHeight) || 18;
  const target = line * lh - editor.clientHeight / 2;
  editor.scrollTop = Math.max(0, target);
  updateGutter();
}

function findNext(backward = false) {
  const term = $("find-input").value;
  if (!term) return;
  const v = editor.value;
  let re;
  try {
    re = buildRegex(term);
  } catch {
    $("find-status").textContent = "Bad pattern";
    return;
  }
  const matches = [...v.matchAll(re)];
  if (matches.length === 0) {
    $("find-status").textContent = "No matches";
    return;
  }
  let match;
  if (backward) {
    const pos = editor.selectionStart;
    match = [...matches].reverse().find((m) => m.index < pos) || matches[matches.length - 1];
  } else {
    const pos = editor.selectionEnd;
    match = matches.find((m) => m.index >= pos) || matches[0];
  }
  editor.focus();
  editor.setSelectionRange(match.index, match.index + match[0].length);
  scrollMatchIntoView(match.index);
  $("find-status").textContent = `${matches.indexOf(match) + 1} / ${matches.length}`;
}

function replaceOne() {
  const term = $("find-input").value;
  if (!term) return;
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  let re;
  try {
    re = buildRegex(term, { global: false });
  } catch {
    return;
  }
  if (sel && re.test(sel)) {
    const start = editor.selectionStart;
    const rep = $("replace-input").value;
    editor.setRangeText(rep, editor.selectionStart, editor.selectionEnd, "end");
    markDirty();
    updateGutter();
    editor.setSelectionRange(start + rep.length, start + rep.length);
  }
  findNext();
}

function replaceAll() {
  const term = $("find-input").value;
  if (!term) return;
  let re;
  try {
    re = buildRegex(term);
  } catch {
    return;
  }
  const rep = $("replace-input").value;
  const matches = editor.value.match(re);
  const count = matches ? matches.length : 0;
  editor.value = editor.value.replace(re, rep);
  markDirty();
  updateGutter();
  $("find-status").textContent = `Replaced ${count}`;
}

function toggleFind(show) {
  const panel = $("find-panel");
  const visible = show === undefined ? panel.hidden : show;
  panel.hidden = !visible;
  if (visible) {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel && !sel.includes("\n")) $("find-input").value = sel;
    $("find-input").focus();
    $("find-input").select();
  } else {
    editor.focus();
  }
}

// ---- file save/open -------------------------------------------------------
async function openFile() {
  if (!dialog) return setStatus("File dialogs require the desktop app");
  const path = await dialog.open({
    multiple: false,
    filters: [{ name: "Text", extensions: ["txt", "md", "log", "csv"] }, { name: "All", extensions: ["*"] }],
  });
  if (!path) return;
  const content = await backend.readFile(path);
  saveEditorToState();
  const name = path.split(/[\\/]/).pop();
  const tab = newTab(name, content);
  tab.filePath = path;
  tab.dirty = false;
  renderTabs();
  setStatus(`Opened ${path}`);
}

async function saveFile() {
  const t = activeTab();
  if (!t) return;
  saveEditorToState();
  if (t.filePath) {
    await backend.writeFile(t.filePath, t.content);
    t.dirty = false;
    renderTabs();
    setStatus(`Saved ${t.filePath}`);
  } else {
    saveFileAs();
  }
}

async function saveFileAs() {
  const t = activeTab();
  if (!t || !dialog) return setStatus("File dialogs require the desktop app");
  saveEditorToState();
  const path = await dialog.save({
    filters: [{ name: "Text", extensions: ["txt"] }, { name: "All", extensions: ["*"] }],
  });
  if (!path) return;
  await backend.writeFile(path, t.content);
  t.filePath = path;
  t.title = path.split(/[\\/]/).pop();
  t.dirty = false;
  renderTabs();
  setStatus(`Saved ${path}`);
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(editor.value);
    setStatus("Copied all text to clipboard");
  } catch {
    editor.select();
    document.execCommand("copy");
    setStatus("Copied all text to clipboard");
  }
}

// ---- theme ----------------------------------------------------------------
function setTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("justtext.theme", name);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  setTheme(cur === "dark" ? "light" : "dark");
}

// ---- wiring ---------------------------------------------------------------
function wire() {
  editor.addEventListener("input", () => {
    markDirty();
    updateGutter();
    if (window.Spellcheck) Spellcheck.onInput();
  });
  editor.addEventListener("scroll", () => {
    gutter.scrollTop = editor.scrollTop;
    if (window.Spellcheck) Spellcheck.onScroll();
  });
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      editor.setRangeText("\t", editor.selectionStart, editor.selectionEnd, "end");
      markDirty();
    }
  });

  $("btn-new").onclick = () => {
    saveEditorToState();
    newTab();
  };
  $("btn-open").onclick = openFile;
  $("btn-save").onclick = saveFile;
  $("btn-saveas").onclick = saveFileAs;
  $("btn-find").onclick = () => toggleFind();
  $("btn-copyall").onclick = copyAll;
  $("btn-theme").onclick = toggleTheme;

  // lines dropdown
  const linesMenu = $("lines-menu");
  $("btn-lines").onclick = (e) => {
    e.stopPropagation();
    linesMenu.classList.toggle("open");
  };
  document.addEventListener("click", () => linesMenu.classList.remove("open"));
  linesMenu.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const op = b.dataset.op;
      linesMenu.classList.remove("open");
      if (LINE_OPS[op]) applyLineOp(LINE_OPS[op]);
      else if (op === "keep-starts") promptFilter("starts", true);
      else if (op === "rm-starts") promptFilter("starts", false);
      else if (op === "keep-ends") promptFilter("ends", true);
      else if (op === "rm-ends") promptFilter("ends", false);
      else if (op === "keep-has") promptFilter("has", true);
      else if (op === "rm-has") promptFilter("has", false);
    };
  });

  // find panel
  $("find-next").onclick = () => findNext(false);
  $("find-prev").onclick = () => findNext(true);
  $("replace-one").onclick = replaceOne;
  $("replace-all").onclick = replaceAll;
  $("find-close").onclick = () => toggleFind(false);
  $("find-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") findNext(e.shiftKey);
    if (e.key === "Escape") toggleFind(false);
  });

  // global shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); saveEditorToState(); newTab(); }
    else if (k === "o") { e.preventDefault(); openFile(); }
    else if (k === "s" && e.shiftKey) { e.preventDefault(); saveFileAs(); }
    else if (k === "s") { e.preventDefault(); saveFile(); }
    else if (k === "f") { e.preventDefault(); toggleFind(true); }
    else if (k === "c" && e.shiftKey) { e.preventDefault(); copyAll(); }
    else if (k === "t") { e.preventDefault(); toggleTheme(); }
    else if (k === "j") { e.preventDefault(); if (window.AI) AI.open(); }
    else if (k === "w") { e.preventDefault(); if (activeId != null) closeTab(activeId); }
  });

  window.addEventListener("beforeunload", saveEditorToState);
}

// ---- init -----------------------------------------------------------------
function init() {
  setTheme(localStorage.getItem("justtext.theme") || "light");
  wire();
  if (window.Spellcheck) Spellcheck.init(editor, $("highlights"), $("btn-spell"), setStatus);
  if (window.AI) AI.init(editor, setStatus);
  newTab();
}

init();
