"use strict";

// AI autocomplete: after a short typing pause, asks the configured AI provider
// to continue the text and shows the suggestion as grey "ghost text" after the
// caret. Tab accepts, Esc dismisses. Only triggers when the caret is at the end
// of the document, so the ghost overlay lines up with real content.
(function (root) {
  const ENABLED_KEY = "justtext.autocomplete";
  const MAX_CONTEXT = 4000; // chars of preceding text sent as context

  const Autocomplete = {
    editor: null,
    ghost: null,
    button: null,
    statusCb: null,
    enabled: false,
    _debounce: null,
    _seq: 0,
    _suggestion: "",
    _at: -1, // caret offset the suggestion applies to

    init(editor, ghost, button, statusCb) {
      this.editor = editor;
      this.ghost = ghost;
      this.button = button;
      this.statusCb = statusCb || function () {};
      this.enabled = localStorage.getItem(ENABLED_KEY) === "1";
      if (this.button) {
        this.button.onclick = () => this.toggle();
        this.button.classList.toggle("active", this.enabled);
      }
      this.editor.addEventListener("keydown", (e) => this._onKey(e));
      // clicking / arrow-moving away invalidates a pending ghost
      this.editor.addEventListener("mouseup", () => this.clear());
    },

    setEnabled(on) {
      this.enabled = on;
      localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
      if (this.button) this.button.classList.toggle("active", on);
      if (!on) this.clear();
      this.statusCb(on ? "AI autocomplete on" : "AI autocomplete off");
    },
    toggle() {
      this.setEnabled(!this.enabled);
    },

    // called from the editor "input" handler in main.js
    onInput() {
      if (!this.enabled) return;
      this.clear();
      if (!window.AI || !AI.isConfigured()) return;
      const ed = this.editor;
      // only when caret is collapsed at the very end of the text
      if (ed.selectionStart !== ed.selectionEnd) return;
      if (ed.selectionEnd !== ed.value.length) return;
      if (!ed.value.trim()) return;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._request(), 600);
    },
    onScroll() {
      if (this._suggestion) this._sync();
    },
    onTabSwitch() {
      this.clear();
    },

    async _request() {
      const ed = this.editor;
      const at = ed.selectionEnd;
      if (at !== ed.value.length) return;
      const before = ed.value.slice(-MAX_CONTEXT);
      const token = ++this._seq;
      this.statusCb("Thinking…");
      try {
        let out = await AI.completion(before);
        if (token !== this._seq) return; // superseded
        if (ed.selectionEnd !== ed.value.length) return; // caret moved
        out = (out || "").replace(/^\s*\n/, "");
        if (!out) {
          this.statusCb("");
          return;
        }
        this._show(out, ed.value.length);
        this.statusCb("Tab to accept");
      } catch (err) {
        this.statusCb("Autocomplete failed");
      }
    },

    _show(text, at) {
      this._suggestion = text;
      this._at = at;
      const value = this.editor.value;
      this.ghost.innerHTML =
        esc(value) + '<span class="ghost-text">' + esc(text) + "</span>";
      this.ghost.hidden = false;
      this._sync();
    },

    _sync() {
      this.ghost.scrollTop = this.editor.scrollTop;
      this.ghost.scrollLeft = this.editor.scrollLeft;
    },

    clear() {
      if (this._suggestion) {
        this._suggestion = "";
        this._at = -1;
        this.ghost.innerHTML = "";
        this.ghost.hidden = true;
      }
    },

    // returns true if a suggestion was accepted (so caller can preventDefault)
    acceptIfVisible() {
      if (!this._suggestion) return false;
      const ed = this.editor;
      const text = this._suggestion;
      this.clear();
      ed.setRangeText(text, ed.value.length, ed.value.length, "end");
      ed.dispatchEvent(new Event("input", { bubbles: true }));
      // don't immediately re-trigger from the input we just caused
      clearTimeout(this._debounce);
      return true;
    },

    _onKey(e) {
      if (!this._suggestion) return;
      if (e.key === "Escape") {
        this.clear();
      } else if (
        e.key !== "Tab" &&
        e.key !== "Shift" &&
        e.key !== "Control" &&
        e.key !== "Meta" &&
        e.key !== "Alt"
      ) {
        // any other key edits/moves — drop the stale ghost
        this.clear();
      }
    },
  };

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  root.Autocomplete = Autocomplete;
})(window);
