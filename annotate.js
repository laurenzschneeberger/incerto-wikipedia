// Incerto for Wikipedia: highlights and margin notes.
// Select text in an article: a small toolbar offers Highlight or Note.
// Notes sit in the right margin as numbered sidenotes. Everything is kept
// in chrome.storage.local per article and re-anchored by quoting the text.
(() => {
  "use strict";
  const CONTEXT = 32;
  const SKIP_SEL = ".tw-ui, .tw-num, .tw-figlabel, .tw-refnum, .tw-note-mark, style, script, .mw-editsection";
  const NO_WRAP_PARENT = /^(TABLE|TBODY|THEAD|TFOOT|TR|UL|OL|DL|COLGROUP)$/;

  let root, column, store = [], key, toolbar, popover;

  const pageKey = () => {
    const c = document.querySelector('link[rel="canonical"]');
    const u = new URL(c ? c.href : location.href);
    return `tw-notes:${u.host}${decodeURIComponent(u.pathname)}`;
  };
  const elOf = (t) => (t instanceof Element ? t : t && t.parentElement) || document.documentElement;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const save = () => chrome.storage.local.set({ [key]: store });

  // ---------- text index over the article ----------
  function index() {
    const nodes = [];
    let text = "";
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement.closest(SKIP_SEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let t; (t = w.nextNode()); ) { nodes.push({ node: t, start: text.length }); text += t.data; }
    return { nodes, text };
  }
  function offsetOf(idx, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      const e = idx.nodes.find((n) => n.node === container);
      if (e) return e.start + offset;
    }
    // Element boundary (or skipped text): first indexed text at or after it.
    const probe = document.createRange();
    probe.setStart(container, offset);
    for (const n of idx.nodes) {
      if (probe.comparePoint(n.node, 0) >= 0) return n.start;
    }
    return idx.text.length;
  }

  // ---------- anchoring ----------
  function locate(idx, h) {
    let best = -1, bestScore = -1;
    for (let i = idx.text.indexOf(h.text); i !== -1; i = idx.text.indexOf(h.text, i + 1)) {
      const pre = idx.text.slice(Math.max(0, i - h.prefix.length), i);
      const suf = idx.text.slice(i + h.text.length, i + h.text.length + h.suffix.length);
      let score = 0;
      for (let k = 1; k <= pre.length && pre[pre.length - k] === h.prefix[h.prefix.length - k]; k++) score++;
      for (let k = 0; k < suf.length && suf[k] === h.suffix[k]; k++) score++;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }
  function wrap(h) {
    const idx = index();
    const s = locate(idx, h);
    if (s < 0) return false;
    const e = s + h.text.length;
    const marks = [];
    for (const { node, start } of idx.nodes) {
      const end = start + node.data.length;
      if (end <= s || start >= e) continue;
      if (NO_WRAP_PARENT.test(node.parentElement.tagName) && !node.data.trim()) continue;
      let t = node;
      const a = Math.max(0, s - start), b = Math.min(node.data.length, e - start);
      if (b < t.data.length) t.splitText(b);
      if (a > 0) t = t.splitText(a);
      if (!t.data) continue;
      const m = document.createElement("mark");
      m.className = "tw-hl";
      m.dataset.twId = h.id;
      t.replaceWith(m);
      m.append(t);
      marks.push(m);
    }
    if (!marks.length) return false;
    if (h.note) {
      const sup = document.createElement("sup");
      sup.className = "tw-note-mark tw-ui";
      sup.dataset.twId = h.id;
      marks[marks.length - 1].after(sup);
    }
    return true;
  }
  function unwrap(id) {
    root.querySelectorAll(`mark.tw-hl[data-tw-id="${id}"]`).forEach((m) => {
      const p = m.parentNode;
      m.replaceWith(...m.childNodes);
      p.normalize();
    });
    root.querySelectorAll(`.tw-note-mark[data-tw-id="${id}"]`).forEach((n) => n.remove());
  }

  // ---------- the margin ----------
  function layout() {
    if (column.querySelector(".tw-editing")) return; // don't yank the textarea away mid-sentence
    column.innerHTML = "";
    const noted = store.filter((h) => h.note && root.querySelector(`mark.tw-hl[data-tw-id="${h.id}"]`));
    document.documentElement.classList.toggle("tw-has-notes", noted.length > 0);
    if (!noted.length) return;
    // Wide window: notes live in the empty space right of the article.
    // Narrow window: the article gives up a margin for them.
    const room = document.documentElement.clientWidth - column.parentElement.getBoundingClientRect().right;
    document.documentElement.classList.toggle("tw-notes-outside", room >= 300);
    const host = column.parentElement.getBoundingClientRect();
    const items = noted
      .map((h) => ({ h, top: root.querySelector(`mark.tw-hl[data-tw-id="${h.id}"]`).getBoundingClientRect().top - host.top }))
      .sort((a, b) => a.top - b.top);
    let floor = 0;
    items.forEach(({ h, top }, i) => {
      const n = i + 1;
      root.querySelectorAll(`.tw-note-mark[data-tw-id="${h.id}"]`).forEach((s) => (s.textContent = n));
      const el = document.createElement("aside");
      el.className = "tw-sidenote tw-ui";
      el.dataset.twId = h.id;
      el.innerHTML = '<span class="tw-sidenote-num"></span><span class="tw-sidenote-text"></span><button class="tw-sidenote-x" title="Remove note">×</button>';
      el.querySelector(".tw-sidenote-num").textContent = n;
      el.querySelector(".tw-sidenote-text").textContent = h.note;
      column.append(el);
      const y = Math.max(top, floor);
      el.style.top = `${y}px`;
      floor = y + el.offsetHeight + 10;
    });
  }
  let layoutQueued = false;
  const relayout = () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => { layoutQueued = false; layout(); });
  };

  // ---------- editing a note in place ----------
  function editNote(h) {
    relayout();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let el = column.querySelector(`.tw-sidenote[data-tw-id="${h.id}"]`);
      if (!el) {
        // Brand new note: give it a temporary slot so there is somewhere to type.
        h.note = h.note || " ";
        layout();
        el = column.querySelector(`.tw-sidenote[data-tw-id="${h.id}"]`);
        if (!el) return;
      }
      const span = el.querySelector(".tw-sidenote-text");
      const ta = document.createElement("textarea");
      ta.className = "tw-sidenote-input";
      ta.value = h.note.trim();
      ta.placeholder = "Write a note…";
      ta.rows = Math.max(2, Math.ceil(ta.value.length / 24));
      span.replaceWith(ta);
      el.classList.add("tw-editing");
      ta.focus();
      const done = (keep) => {
        if (!ta.isConnected) return;
        const v = ta.value.trim();
        if (keep && v) h.note = v;
        else if (!keep && h.note.trim()) { /* revert */ }
        else h.note = "";
        if (!h.note) root.querySelectorAll(`.tw-note-mark[data-tw-id="${h.id}"]`).forEach((s) => s.remove());
        else if (!root.querySelector(`.tw-note-mark[data-tw-id="${h.id}"]`)) {
          const marks = root.querySelectorAll(`mark.tw-hl[data-tw-id="${h.id}"]`);
          const sup = document.createElement("sup");
          sup.className = "tw-note-mark tw-ui";
          sup.dataset.twId = h.id;
          marks[marks.length - 1].after(sup);
        }
        el.classList.remove("tw-editing");
        save();
        layout();
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); done(false); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); done(true); }
      });
      ta.addEventListener("input", () => { ta.rows = Math.max(2, Math.ceil(ta.value.length / 24)); });
      ta.addEventListener("blur", () => done(true));
    }));
  }

  // ---------- toolbar on selection, popover on a highlight ----------
  function makeUI() {
    toolbar = document.createElement("div");
    toolbar.className = "tw-toolbar tw-ui";
    toolbar.innerHTML =
      '<button data-act="hl"><span class="tw-swatch"></span>Highlight</button>' +
      '<button data-act="note"><span class="tw-pen">✎</span>Note</button>';
    popover = document.createElement("div");
    popover.className = "tw-toolbar tw-popover tw-ui";
    popover.innerHTML = '<button data-act="edit"></button><button data-act="remove">Remove</button>';
    document.body.append(toolbar, popover);
    [toolbar, popover].forEach((el) => el.addEventListener("mousedown", (e) => e.preventDefault()));
  }
  const hide = (el) => el.classList.remove("tw-show");
  function showAt(el, rect) {
    el.classList.add("tw-show");
    const w = el.offsetWidth;
    const x = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2 + scrollX), scrollX + document.documentElement.clientWidth - w - 8);
    const above = rect.top + scrollY - el.offsetHeight - 10;
    el.style.left = `${x}px`;
    el.style.top = `${above > scrollY ? above : rect.bottom + scrollY + 10}px`;
  }

  function currentRange() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.commonAncestorContainer)) return null;
    if (r.toString().trim().length < 2) return null;
    if (r.commonAncestorContainer.parentElement?.closest(".tw-ui")) return null;
    return r;
  }
  function create(withNote) {
    const r = currentRange();
    hide(toolbar);
    if (!r) return;
    const idx = index();
    let s = offsetOf(idx, r.startContainer, r.startOffset);
    let e = offsetOf(idx, r.endContainer, r.endOffset);
    while (s < e && /\s/.test(idx.text[s])) s++;
    while (e > s && /\s/.test(idx.text[e - 1])) e--;
    if (e <= s) return;
    const h = {
      id: uid(),
      text: idx.text.slice(s, e),
      prefix: idx.text.slice(Math.max(0, s - CONTEXT), s),
      suffix: idx.text.slice(e, e + CONTEXT),
      note: "",
      created: Date.now(),
    };
    getSelection().removeAllRanges();
    if (!wrap(h)) return;
    store.push(h);
    save();
    if (withNote) editNote(h); else relayout();
  }

  function bind() {
    toolbar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) create(b.dataset.act === "note");
    });
    popover.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      const h = store.find((x) => x.id === popover.dataset.twId);
      hide(popover);
      if (!b || !h) return;
      if (b.dataset.act === "remove") {
        unwrap(h.id);
        store = store.filter((x) => x !== h);
        save();
        relayout();
      } else editNote(h);
    });
    document.addEventListener("mouseup", (e) => {
      if (elOf(e.target).closest(".tw-ui")) return;
      setTimeout(() => {
        const r = currentRange();
        if (r && document.documentElement.classList.contains("incerto")) { hide(popover); showAt(toolbar, r.getBoundingClientRect()); }
        else hide(toolbar);
      }, 0);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hide(toolbar); hide(popover); } });
    root.addEventListener("click", (e) => {
      const m = elOf(e.target).closest("mark.tw-hl, .tw-note-mark");
      if (!m || !getSelection().isCollapsed) return;
      const h = store.find((x) => x.id === m.dataset.twId);
      if (!h) return;
      popover.dataset.twId = h.id;
      popover.querySelector('[data-act="edit"]').textContent = h.note ? "Edit note" : "Add note";
      hide(toolbar);
      showAt(popover, m.getBoundingClientRect());
      e.preventDefault();
    });
    document.addEventListener("mousedown", (e) => { if (!elOf(e.target).closest(".tw-ui, mark.tw-hl")) hide(popover); });

    // the margin
    column.addEventListener("click", (e) => {
      const note = e.target.closest(".tw-sidenote");
      if (!note || note.classList.contains("tw-editing")) return;
      const h = store.find((x) => x.id === note.dataset.twId);
      if (!h) return;
      if (e.target.closest(".tw-sidenote-x")) {
        h.note = "";
        root.querySelectorAll(`.tw-note-mark[data-tw-id="${h.id}"]`).forEach((s) => s.remove());
        save();
        relayout();
      } else editNote(h);
    });
    const hover = (id, on) => root.querySelectorAll(`mark.tw-hl[data-tw-id="${id}"]`).forEach((m) => m.classList.toggle("tw-hot", on));
    column.addEventListener("mouseover", (e) => { const n = e.target.closest(".tw-sidenote"); if (n) hover(n.dataset.twId, true); });
    column.addEventListener("mouseout", (e) => { const n = e.target.closest(".tw-sidenote"); if (n) hover(n.dataset.twId, false); });

    new ResizeObserver(relayout).observe(root);
    addEventListener("resize", relayout);
    document.fonts.ready.then(relayout);
    chrome.storage.onChanged.addListener((c, area) => { if (area === "sync" && c.enabled) relayout(); });
  }

  function init() {
    root = document.querySelector("#mw-content-text .mw-parser-output");
    if (!root || root.dataset.twNotes) return;
    root.dataset.twNotes = "1";
    const host = document.getElementById("mw-content-text");
    column = document.createElement("div");
    column.className = "tw-margin tw-ui";
    host.append(column);
    key = pageKey();
    makeUI();
    bind();
    chrome.storage.local.get(key, (r) => {
      store = Array.isArray(r[key]) ? r[key] : [];
      store.forEach(wrap);
      relayout();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
