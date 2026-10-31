// Incerto for Wikipedia: highlights, Post-it notes and the notebook.
// Select text: a small toolbar offers Highlight or Note. A highlight with a note carries
// a thin red rule at its end; click any highlight and its Post-it unfolds above it.
// Works per page on the stacked desk (each column is its own article with its own notes).
// Kept in chrome.storage.local per article; re-anchored by quoting the text.
(() => {
  "use strict";
  const TW = (window.TW = window.TW || {});
  const html = document.documentElement;
  const CONTEXT = 32;
  const SKIP_SEL = ".tw-ui, .tw-num, .tw-figlabel, .tw-refnum, style, script, .mw-editsection";
  const NO_WRAP_PARENT = /^(TABLE|TBODY|THEAD|TFOOT|TR|UL|OL|DL|COLGROUP)$/;

  const docs = new Map(); // column -> doc
  let toolbar, postit, selLayer, nbPanel, nbDoc = null;

  const on = () => html.classList.contains("incerto");
  const elOf = (t) => (t instanceof Element ? t : t && t.parentElement) || html;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const save = (doc) => chrome.storage.local.set({ [doc.key]: doc.store });
  const docFor = (node) => { for (const d of docs.values()) if (d.root && d.root.contains(node)) return d; return null; };
  const marksOf = (doc, id) => doc.root.querySelectorAll(`mark.tw-hl[data-tw-id="${id}"]`);

  // ---------- text index over one article ----------
  function index(doc) {
    const nodes = [];
    let text = "";
    const w = document.createTreeWalker(doc.root, NodeFilter.SHOW_TEXT, {
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
    const probe = document.createRange();
    probe.setStart(container, offset);
    for (const n of idx.nodes) if (probe.comparePoint(n.node, 0) >= 0) return n.start;
    return idx.text.length;
  }
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
  // Wrap text offsets [s, e) of an index in <mark>s. Splitting keeps every text node's
  // start offset intact for the text before it, so one index serves many wraps
  // as long as they are applied from the end of the article backwards.
  function wrapAt(idx, s, e, id) {
    let lo = 0, hi = idx.nodes.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (idx.nodes[mid].start <= s) lo = mid; else hi = mid - 1; }
    let any = false;
    for (let k = lo; k < idx.nodes.length; k++) {
      const { node, start } = idx.nodes[k];
      if (start >= e) break;
      const end = start + node.data.length;
      if (end <= s) continue;
      if (NO_WRAP_PARENT.test(node.parentElement.tagName) && !node.data.trim()) continue;
      let t = node;
      const a = Math.max(0, s - start), b = Math.min(node.data.length, e - start);
      if (b < t.data.length) t.splitText(b);
      if (a > 0) t = t.splitText(a);
      if (!t.data) continue;
      const m = document.createElement("mark");
      m.className = "tw-hl";
      m.dataset.twId = id;
      t.replaceWith(m);
      m.append(t);
      any = true;
    }
    return any;
  }
  function wrap(doc, h) {
    const idx = index(doc);
    const s = locate(idx, h);
    return s >= 0 && wrapAt(idx, s, s + h.text.length, h.id);
  }
  // Re-anchor a whole page's highlights from a single index.
  function wrapAll(doc) {
    if (!doc.store.length) return;
    const idx = index(doc);
    const found = doc.store.map((h) => ({ h, s: locate(idx, h) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
    let floor = Infinity;
    const later = [];
    for (const { h, s } of found) {
      const e = s + h.text.length;
      if (e > floor) { later.push(h); continue; } // overlaps one already wrapped: redo with a fresh index
      wrapAt(idx, s, e, h.id);
      floor = s;
    }
    later.forEach((h) => wrap(doc, h));
  }
  function unwrap(doc, id) {
    marksOf(doc, id).forEach((m) => { const p = m.parentNode; m.replaceWith(...m.childNodes); p.normalize(); });
  }
  // A noted highlight ends in a thin red rule.
  function dress(doc) {
    doc.store.forEach((h) => {
      const ms = marksOf(doc, h.id);
      ms.forEach((m, i) => {
        m.classList.toggle("tw-noted", !!h.note);
        m.classList.toggle("tw-noted-end", !!h.note && i === ms.length - 1);
      });
    });
    updateCount(doc);
  }

  // ---------- floating bits live inside the page's own scroller ----------
  function hostOf(doc) { return (doc && doc.col.inner) || document.body; }
  function place(el, doc, rect, gap = 10) {
    const host = hostOf(doc);
    if (el.parentElement !== host) host.append(el);
    el.classList.add("tw-show");
    const hr = host === document.body ? { left: -scrollX, top: -scrollY } : host.getBoundingClientRect();
    const w = el.offsetWidth, hgt = el.offsetHeight;
    const cx = rect.left + rect.width / 2;
    let left = cx - hr.left + host.scrollLeft - w / 2;
    left = Math.max(host.scrollLeft + 8, Math.min(left, host.scrollLeft + host.clientWidth - w - 8));
    let top = rect.top - hr.top + host.scrollTop - hgt - gap;
    const below = top < host.scrollTop + 4;
    if (below) top = rect.bottom - hr.top + host.scrollTop + gap;
    el.classList.toggle("tw-below", below);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const tail = el.querySelector(".tw-postit-tail");
    if (tail) tail.style.left = `${Math.max(14, Math.min(w - 14, cx - hr.left + host.scrollLeft - left))}px`;
  }
  const hide = (el) => el && el.classList.remove("tw-show");

  // ---------- selection toolbar ----------
  let selDoc = null;
  function currentRange() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    const d = docFor(r.commonAncestorContainer);
    if (!d || r.toString().trim().length < 2) return null;
    if (elOf(r.commonAncestorContainer).closest(".tw-ui")) return null;
    selDoc = d;
    return r;
  }
  function create(withNote) {
    const r = currentRange();
    hide(toolbar);
    if (!r || !selDoc) return;
    const doc = selDoc;
    const idx = index(doc);
    let s = offsetOf(idx, r.startContainer, r.startOffset);
    let e = offsetOf(idx, r.endContainer, r.endOffset);
    while (s < e && /\s/.test(idx.text[s])) s++;
    while (e > s && /\s/.test(idx.text[e - 1])) e--;
    if (e <= s) return;
    const h = {
      id: uid(), text: idx.text.slice(s, e),
      prefix: idx.text.slice(Math.max(0, s - CONTEXT), s), suffix: idx.text.slice(e, e + CONTEXT),
      note: "", created: Date.now(),
    };
    getSelection().removeAllRanges();
    if (!wrap(doc, h)) return;
    doc.store.push(h);
    save(doc);
    dress(doc);
    if (withNote) openPostit(doc, h, true);
  }

  // ---------- the Post-it ----------
  let open = null; // { doc, h, editing }
  function markRect(doc, h) {
    const rects = [...marksOf(doc, h.id)].flatMap((m) => [...m.getClientRects()]);
    if (!rects.length) return null;
    const top = Math.min(...rects.map((r) => r.top));
    // Centre over the whole highlight, sitting just above its first line.
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }
  function openPostit(doc, h, edit) {
    commitPostit();
    open = { doc, h, editing: edit || !h.note };
    const text = postit.querySelector(".tw-postit-text");
    const ta = postit.querySelector(".tw-postit-input");
    postit.classList.toggle("tw-has-note", !!h.note);
    postit.classList.toggle("tw-editing", open.editing);
    text.textContent = h.note;
    ta.value = h.note;
    const r = markRect(doc, h);
    if (!r) { open = null; return; }
    hide(toolbar);
    postit.classList.remove("tw-unfold");
    place(postit, doc, r);
    if (open.editing) { fit(ta); place(postit, doc, r); ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
    void postit.offsetWidth;
    postit.classList.add("tw-unfold");
  }
  function fit(ta) { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; }
  function commitPostit(keep = true) {
    if (!open) return;
    const { doc, h, editing } = open;
    if (editing && keep) {
      const v = postit.querySelector(".tw-postit-input").value.trim();
      if (v !== h.note) { h.note = v; save(doc); dress(doc); }
    }
    open = null;
    hide(postit);
  }
  function makePostit() {
    postit = document.createElement("div");
    postit.className = "tw-postit tw-ui";
    postit.innerHTML =
      '<button class="tw-postit-x" title="Delete note">×</button>' +
      '<div class="tw-postit-text" title="Click to edit"></div>' +
      '<textarea class="tw-postit-input" rows="2" placeholder="Write a note…"></textarea>' +
      '<div class="tw-postit-foot"><button class="tw-postit-remove">remove highlight</button></div>' +
      '<span class="tw-postit-tail"></span>';
    const ta = postit.querySelector(".tw-postit-input");
    postit.querySelector(".tw-postit-text").addEventListener("click", () => {
      if (!open) return;
      open.editing = true;
      postit.classList.add("tw-editing");
      ta.value = open.h.note;
      fit(ta);
      ta.focus({ preventScroll: true });
    });
    postit.querySelector(".tw-postit-x").addEventListener("click", () => {
      if (!open) return;
      const { doc, h } = open;
      h.note = "";
      save(doc);
      dress(doc);
      open = null;
      hide(postit);
    });
    postit.querySelector(".tw-postit-remove").addEventListener("click", () => {
      if (!open) return;
      const { doc, h } = open;
      unwrap(doc, h.id);
      doc.store = doc.store.filter((x) => x !== h);
      save(doc);
      dress(doc);
      open = null;
      hide(postit);
    });
    ta.addEventListener("input", () => fit(ta));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); commitPostit(false); }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitPostit(true); }
    });
    postit.addEventListener("mousedown", (e) => { if (!e.target.closest("textarea")) e.preventDefault(); });
  }

  // ---------- selection drawn like a highlight ----------
  function paintSelection() {
    selLayer.textContent = "";
    if (!on()) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const doc = docFor(r.commonAncestorContainer) || docFor(r.startContainer);
    if (!doc) return;
    const scope = doc.root.contains(r.commonAncestorContainer) ? r.commonAncestorContainer : doc.root;
    const w = document.createTreeWalker(scope.nodeType === 3 ? scope.parentNode : scope, NodeFilter.SHOW_TEXT);
    const clip = hostOf(doc) === document.body ? { top: 0, bottom: innerHeight } : hostOf(doc).getBoundingClientRect();
    const frag = document.createDocumentFragment();
    const padCache = new Map();
    let count = 0;
    for (let t; (t = w.nextNode()) && count < 4000; ) {
      if (!r.intersectsNode(t) || !doc.root.contains(t) || !t.data.trim()) continue;
      count++;
      const sub = document.createRange();
      sub.selectNodeContents(t);
      if (t === r.startContainer) sub.setStart(t, r.startOffset);
      if (t === r.endContainer) sub.setEnd(t, r.endOffset);
      const pe = t.parentElement;
      let pad = padCache.get(pe);
      if (pad === undefined) { pad = parseFloat(getComputedStyle(pe).fontSize) * 0.04; padCache.set(pe, pad); }
      for (const rect of sub.getClientRects()) {
        if (rect.width < 0.5 || rect.bottom < clip.top || rect.top > clip.bottom) continue;
        const d = document.createElement("div");
        d.style.cssText = `left:${rect.left}px;top:${rect.top - pad}px;width:${rect.width}px;height:${rect.height + 2 * pad}px`;
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

  // ---------- the notebook ----------
  function sectionOf(doc, el) {
    let found = null;
    doc.root.querySelectorAll("h2, h3").forEach((h) => {
      if (h.closest("table, .navbox, .infobox")) return;
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
  function entries(doc) {
    return doc.store
      .map((h) => ({ h, el: marksOf(doc, h.id)[0] }))
      .filter((x) => x.el)
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(({ h, el }) => ({ h, el, section: sectionOf(doc, el) }));
  }
  const titleOf = (doc) =>
    (doc.col.titlebar?.querySelector(".mw-page-title-main, .mw-first-heading")?.textContent ||
      (doc.col.title || "").replace(/_/g, " ") || document.title).trim();
  function toMarkdown(doc) {
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const path = doc.key.slice(doc.key.indexOf("/wiki/") + 6);
    const url = `${location.origin}/wiki/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
    const out = [`# ${titleOf(doc)}`, "", `*Wikipedia* · <${url}> · ${date}`, ""];
    let last = null;
    entries(doc).forEach(({ h, section }) => {
      if (section !== last) { out.push(`## ${section || "Introduction"}`, ""); last = section; }
      out.push(`> ${h.text.replace(/\s*\n\s*/g, " ")}`, "");
      if (h.note) out.push(`**Note.** ${h.note.replace(/\n/g, "  \n")}`, "");
    });
    return out.join("\n");
  }
  function download(doc) {
    const blob = new Blob([toMarkdown(doc)], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${titleOf(doc).replace(/[\\/:*?"<>|]+/g, " ").trim()} - notebook.md`;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
  }
  function updateCount(doc) {
    if (doc.button) {
      const n = doc.store.filter((h) => marksOf(doc, h.id)[0]).length;
      doc.button.querySelector(".tw-nb-count").textContent = n || "";
    }
    if (nbDoc === doc && html.classList.contains("tw-nb-open")) renderNotebook();
  }
  function renderNotebook() {
    const doc = nbDoc;
    if (!doc) return;
    const list = entries(doc);
    const notes = list.filter((x) => x.h.note).length;
    nbPanel.querySelector(".tw-nb-sub").textContent =
      `${titleOf(doc)} · ${list.length} highlight${list.length === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}`;
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
  function toggleNotebook(doc, force) {
    const isOpen = html.classList.contains("tw-nb-open");
    const want = typeof force === "boolean" ? force : !(isOpen && nbDoc === doc);
    if (want) nbDoc = doc;
    html.classList.toggle("tw-nb-open", want);
    docs.forEach((d) => d.button && d.button.classList.toggle("tw-on", want && d === nbDoc));
    if (want) renderNotebook();
  }
  function makeNotebookPanel() {
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
    nbPanel.querySelector(".tw-nb-close").addEventListener("click", () => toggleNotebook(nbDoc, false));
    nbPanel.querySelector(".tw-nb-dl").addEventListener("click", () => nbDoc && download(nbDoc));
    nbPanel.querySelector(".tw-nb-list").addEventListener("click", (e) => {
      const item = e.target.closest(".tw-nb-item");
      if (!item || !nbDoc) return;
      const all = marksOf(nbDoc, item.dataset.twId);
      if (!all[0]) return;
      if (TW.reveal) TW.reveal(nbDoc.col);
      all[0].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      all.forEach((x) => { x.classList.remove("tw-flash"); void x.offsetWidth; x.classList.add("tw-flash"); });
    });
  }
  function addNotebookButton(doc) {
    const b = document.createElement("button");
    b.className = "tw-notebook-btn tw-ui";
    b.title = "Notebook: your highlights and notes on this page";
    b.innerHTML = '<span class="tw-manicule"></span><span class="tw-nb-count"></span>';
    b.addEventListener("click", () => toggleNotebook(doc));
    const bar = doc.col.titlebar;
    const tools = bar && bar.querySelector("#vector-page-tools-dropdown");
    if (tools) tools.before(b); else if (bar) bar.append(b);
    doc.button = b;
  }

  // ---------- one doc per page on the desk ----------
  function attach(col) {
    if (!col.root || docs.has(col)) return;
    const doc = { col, root: col.root, key: col.key, store: [] };
    docs.set(col, doc);
    addNotebookButton(doc);
    chrome.storage.local.get(doc.key, (r) => {
      doc.store = Array.isArray(r[doc.key]) ? r[doc.key] : [];
      wrapAll(doc);
      dress(doc);
    });
  }
  function detach(col) {
    const doc = docs.get(col);
    if (!doc) return;
    if (open && open.doc === doc) { open = null; hide(postit); }
    if (nbDoc === doc) toggleNotebook(doc, false);
    docs.delete(col);
  }

  function bind() {
    toolbar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) create(b.dataset.act === "note"); });
    toolbar.addEventListener("mousedown", (e) => e.preventDefault());
    document.addEventListener("mouseup", (e) => {
      if (elOf(e.target).closest(".tw-ui")) return;
      setTimeout(() => {
        const r = currentRange();
        if (r && on()) { commitPostit(); place(toolbar, selDoc, r.getBoundingClientRect(), 8); }
        else hide(toolbar);
      }, 0);
    });
    document.addEventListener("click", (e) => {
      const target = elOf(e.target);
      if (target.closest("a[href]")) return; // links inside a highlight stay links
      const m = target.closest("mark.tw-hl");
      if (!m || !getSelection().isCollapsed) return;
      const doc = docFor(m);
      const h = doc && doc.store.find((x) => x.id === m.dataset.twId);
      if (!h) return;
      e.preventDefault();
      if (open && open.h === h) { commitPostit(); return; }
      openPostit(doc, h, false);
    });
    document.addEventListener("mousedown", (e) => {
      const t = elOf(e.target);
      if (open && !t.closest(".tw-postit") && !t.closest("mark.tw-hl")) commitPostit(true);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      hide(toolbar);
      if (open && !open.editing) commitPostit();
      if (html.classList.contains("tw-nb-open")) toggleNotebook(nbDoc, false);
    });
    document.addEventListener("selectionchange", queueSelection);
    addEventListener("resize", queueSelection);
    document.addEventListener("scroll", queueSelection, true);
  }

  function init() {
    toolbar = document.createElement("div");
    toolbar.className = "tw-toolbar tw-ui";
    toolbar.innerHTML =
      '<button data-act="hl"><span class="tw-swatch"></span>Highlight</button>' +
      '<button data-act="note"><span class="tw-pen">✎</span>Note</button>';
    makePostit();
    makeNotebookPanel();
    selLayer = document.createElement("div");
    selLayer.className = "tw-sel-layer tw-ui";
    selLayer.setAttribute("aria-hidden", "true");
    document.body.append(selLayer);
    bind();
    (TW.columns || []).forEach(attach);
    if (TW.on) {
      TW.on("column", attach);
      TW.on("close", detach);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
