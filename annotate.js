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
    root.querySelectorAll("mark.tw-hot").forEach((m) => m.classList.remove("tw-hot"));
    updateNotebook();
    const noted = store.filter((h) => h.note && root.querySelector(`mark.tw-hl[data-tw-id="${h.id}"]`));
    document.documentElement.classList.toggle("tw-has-notes", noted.length > 0); // marker only, no layout change
    if (!noted.length) return;
    // Notes live in the page's own right margin; the article is never narrowed.
    // If the margin is too tight, the margin column hides and notes show on hover.
    const room = document.documentElement.clientWidth - column.parentElement.getBoundingClientRect().right;
    const width = Math.min(240, room - 28 - 16);
    const fits = width >= 140;
    document.documentElement.classList.toggle("tw-notes-hidden", !fits);
    column.style.width = `${Math.max(0, width)}px`;
    root.querySelectorAll("mark.tw-hl").forEach((m) => {
      const h = store.find((x) => x.id === m.dataset.twId);
      if (h && h.note && !fits) m.title = h.note; else m.removeAttribute("title");
    });
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
      el.innerHTML = '<button class="tw-sidenote-x" title="Delete note">×</button><span class="tw-sidenote-num"></span><span class="tw-sidenote-text"></span>';
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
      const target = elOf(e.target);
      if (target.closest("a[href]")) return; // links inside a highlight stay links
      const m = target.closest("mark.tw-hl, .tw-note-mark");
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

  // ---------- selection drawn like a highlight ----------
  // ::selection always fills the whole line box; a highlight only covers the letters,
  // leaving air between lines. So the selection is painted by hand, text node by text node.
  let selLayer;
  function paintSelection() {
    selLayer.textContent = "";
    if (!document.documentElement.classList.contains("incerto")) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const scope = root.contains(r.commonAncestorContainer) ? r.commonAncestorContainer : root;
    if (!r.intersectsNode(root)) return;
    const w = document.createTreeWalker(scope.nodeType === 3 ? scope.parentNode : scope, NodeFilter.SHOW_TEXT);
    const frag = document.createDocumentFragment();
    let count = 0;
    for (let t; (t = w.nextNode()) && count < 4000; ) {
      if (!r.intersectsNode(t) || !root.contains(t) || !t.data.trim()) continue;
      count++;
      const sub = document.createRange();
      sub.selectNodeContents(t);
      if (t === r.startContainer) sub.setStart(t, r.startOffset);
      if (t === r.endContainer) sub.setEnd(t, r.endOffset);
      const pad = parseFloat(getComputedStyle(t.parentElement).fontSize) * 0.04;
      for (const rect of sub.getClientRects()) {
        if (rect.width < 0.5) continue;
        const d = document.createElement("div");
        d.style.cssText = `left:${rect.left + scrollX}px;top:${rect.top + scrollY - pad}px;width:${rect.width}px;height:${rect.height + 2 * pad}px`;
        frag.append(d);
      }
    }
    selLayer.append(frag);
  }
  let selQueued = false;
  const queueSelection = () => {
    if (selQueued) return;
    selQueued = true;
    requestAnimationFrame(() => { selQueued = false; paintSelection(); });
  };

  // ---------- the notebook: every highlight and note on the page ----------
  let nbButton, nbPanel;
  const firstMark = (id) => root.querySelector(`mark.tw-hl[data-tw-id="${id}"]`);
  function sectionOf(el) {
    let found = null;
    root.querySelectorAll("h2, h3").forEach((h) => {
      if (h.closest("table, .navbox, .infobox") ) return;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
    });
    if (!found) return "";
    const c = found.cloneNode(true);
    c.querySelectorAll(".mw-editsection").forEach((n) => n.remove());
    const num = c.querySelector(".tw-num");
    const n = num ? num.textContent.trim() : "";
    if (num) num.remove();
    return (n ? `${n} ` : "") + c.textContent.trim();
  }
  function entries() {
    return store
      .map((h) => ({ h, el: firstMark(h.id) }))
      .filter((x) => x.el)
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(({ h, el }) => ({ h, el, section: sectionOf(el) }));
  }
  const pageTitle = () => (document.querySelector(".mw-page-title-main, #firstHeading")?.textContent || document.title).trim();
  function toMarkdown() {
    const list = entries();
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const canon = document.querySelector('link[rel="canonical"]')?.href || location.href;
    const out = [`# ${pageTitle()}`, "", `*Wikipedia* · <${canon}> · ${date}`, ""];
    let last = null;
    list.forEach(({ h, section }) => {
      if (section !== last) { out.push(`## ${section || "Introduction"}`, ""); last = section; }
      out.push(`> ${h.text.replace(/\s*\n\s*/g, " ")}`, "");
      if (h.note) out.push(`**Note.** ${h.note.replace(/\n/g, "  \n")}`, "");
    });
    return out.join("\n");
  }
  function download() {
    const blob = new Blob([toMarkdown()], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${pageTitle().replace(/[\\/:*?"<>|]+/g, " ").trim()} - notebook.md`;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
  }
  function updateNotebook() {
    if (!nbButton) return;
    const n = store.filter((h) => firstMark(h.id)).length;
    nbButton.querySelector(".tw-nb-count").textContent = n ? n : "";
    if (nbPanel && document.documentElement.classList.contains("tw-nb-open")) renderNotebook();
  }
  function renderNotebook() {
    const list = entries();
    const notes = list.filter((x) => x.h.note).length;
    nbPanel.querySelector(".tw-nb-sub").textContent =
      `${pageTitle()} · ${list.length} highlight${list.length === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}`;
    const body = nbPanel.querySelector(".tw-nb-list");
    body.textContent = "";
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "tw-nb-empty";
      p.textContent = "Nothing yet. Select a passage and choose Highlight or Note.";
      body.append(p);
    }
    let last = null;
    list.forEach(({ h, section }) => {
      if (section !== last) {
        const s = document.createElement("div");
        s.className = "tw-nb-section";
        s.textContent = section || "Introduction";
        body.append(s);
        last = section;
      }
      const item = document.createElement("button");
      item.className = "tw-nb-item";
      item.dataset.twId = h.id;
      const q = document.createElement("span");
      q.className = "tw-nb-quote";
      q.textContent = h.text;
      item.append(q);
      if (h.note) {
        const n = document.createElement("span");
        n.className = "tw-nb-note";
        n.textContent = h.note;
        item.append(n);
      }
      body.append(item);
    });
    nbPanel.querySelector(".tw-nb-dl").disabled = !list.length;
  }
  function toggleNotebook(force) {
    const open = typeof force === "boolean" ? force : !document.documentElement.classList.contains("tw-nb-open");
    document.documentElement.classList.toggle("tw-nb-open", open);
    if (open) renderNotebook();
  }
  function makeNotebook() {
    nbButton = document.createElement("button");
    nbButton.id = "tw-notebook-btn";
    nbButton.className = "tw-ui";
    nbButton.title = "Notebook: your highlights and notes";
    nbButton.innerHTML = '<span class="tw-manicule"></span><span class="tw-nb-count"></span>';
    nbButton.addEventListener("click", () => toggleNotebook());
    const titlebar = document.querySelector(".vector-page-titlebar");
    const tools = titlebar && titlebar.querySelector("#vector-page-tools-dropdown");
    if (tools) tools.before(nbButton);
    else if (titlebar) titlebar.append(nbButton);
    else document.getElementById("firstHeading")?.after(nbButton);

    nbPanel = document.createElement("aside");
    nbPanel.id = "tw-notebook";
    nbPanel.className = "tw-ui";
    nbPanel.setAttribute("aria-label", "Notebook");
    nbPanel.innerHTML =
      '<div class="tw-nb-head"><span class="tw-manicule"></span><div><div class="tw-nb-title">Notebook</div>' +
      '<div class="tw-nb-sub"></div></div><button class="tw-nb-close" title="Close">×</button></div>' +
      '<div class="tw-nb-list"></div>' +
      '<div class="tw-nb-foot"><button class="tw-nb-dl">Download as Markdown</button></div>';
    document.body.append(nbPanel);
    nbPanel.querySelector(".tw-nb-close").addEventListener("click", () => toggleNotebook(false));
    nbPanel.querySelector(".tw-nb-dl").addEventListener("click", download);
    nbPanel.querySelector(".tw-nb-list").addEventListener("click", (e) => {
      const item = e.target.closest(".tw-nb-item");
      const m = item && firstMark(item.dataset.twId);
      if (!m) return;
      m.scrollIntoView({ behavior: "smooth", block: "center" });
      const all = root.querySelectorAll(`mark.tw-hl[data-tw-id="${item.dataset.twId}"]`);
      all.forEach((x) => { x.classList.remove("tw-flash"); void x.offsetWidth; x.classList.add("tw-flash"); });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.documentElement.classList.contains("tw-nb-open")) toggleNotebook(false);
    });
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
    makeNotebook();
    selLayer = document.createElement("div");
    selLayer.className = "tw-sel-layer tw-ui";
    selLayer.setAttribute("aria-hidden", "true");
    document.body.append(selLayer);
    document.addEventListener("selectionchange", queueSelection);
    addEventListener("resize", queueSelection);
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
