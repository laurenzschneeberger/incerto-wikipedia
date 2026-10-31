// Incerto for Wikipedia: stacked pages.
// Articles open side by side, like pages shuffled on a desk: clicking a link opens
// the article in a new column to the right. Columns stack into spines as you scroll,
// each column scrolls on its own, and the desk bounces a little at either end.
// Open columns are kept in the URL (?stacked=Title&stacked=Title) for reloads and Back.
(() => {
  "use strict";
  const TW = (window.TW = window.TW || {});
  const html = document.documentElement;
  const SPINE = 40;

  // --- tiny event hub shared with annotate.js ---
  const listeners = { column: [], close: [], focus: [] };
  TW.on = (ev, fn) => listeners[ev].push(fn);
  const emit = (ev, x) => listeners[ev].forEach((f) => { try { f(x); } catch (e) { console.error(e); } });
  TW.columns = [];

  let scroller, track, contents, focused = null;

  const display = (t) => t.replace(/_/g, " ").trim();
  const slug = (t) => display(t).replace(/ /g, "_");
  const same = (a, b) => slug(a).toLowerCase() === slug(b).toLowerCase();
  const keyFor = (t) => `tw-notes:${location.host}/wiki/${slug(t)}`;
  const NON_ARTICLE = /^(file|image|media|category|help|special|wikipedia|wp|project|talk|user|template|portal|draft|mediawiki|module|timedtext|book|gadget|topic|education program)( talk)?:/i;

  function canStack() {
    const b = document.body;
    return b && b.classList.contains("ns-0") && b.classList.contains("action-view") &&
      document.querySelector("#mw-content-text .mw-parser-output") && document.querySelector("main#content, #content");
  }

  // ---------- geometry ----------
  const colWidth = () => (TW.columns[0] ? TW.columns[0].el.offsetWidth : 700);
  function setTop() {
    const head = document.querySelector(".vector-header-container") || document.querySelector(".mw-header");
    html.style.setProperty("--tw-top", `${head ? Math.max(0, head.getBoundingClientRect().bottom) : 0}px`);
  }
  function restack() {
    const n = TW.columns.length;
    TW.columns.forEach((c, i) => {
      c.index = i;
      c.el.style.left = `${i * SPINE}px`;
      c.el.style.right = `calc(${(n - i) * SPINE}px - var(--tw-col-w))`;
      c.el.style.zIndex = String(i + 1);
      c.el.classList.toggle("tw-col-base", i === 0);
    });
    html.classList.toggle("tw-multi", n > 1);
    onScroll();
  }
  // Spines and shadows: which columns are covered by their right-hand neighbour?
  function onScroll() {
    const sr = scroller.getBoundingClientRect();
    const W = colWidth();
    TW.columns.forEach((c, i) => {
      const r = c.el.getBoundingClientRect();
      const next = TW.columns[i + 1];
      const nr = next && next.el.getBoundingClientRect();
      // A page turns into its spine only once it is (almost) fully covered.
      const coveredLeft = nr ? nr.left - r.left < SPINE * 1.6 : false;
      const natural = i * W - scroller.scrollLeft + sr.left;
      const stuckRight = natural - r.left > W - SPINE * 1.6;
      c.el.classList.toggle("tw-obscured", coveredLeft || stuckRight);
      c.el.classList.toggle("tw-overlapping", i > 0 && TW.columns[i - 1] &&
        r.left < TW.columns[i - 1].el.getBoundingClientRect().right - 1);
    });
  }
  // Scroll the desk just enough to show column i in full.
  function reveal(i, smooth = true) {
    const c = TW.columns[i];
    if (!c) return;
    const W = colWidth();
    const x = i * W; // natural position (offsetLeft reports the stuck one)
    const lo = x + W - scroller.clientWidth; // leftmost scroll that shows its right edge
    const hi = x - i * SPINE; // rightmost scroll before it sticks under earlier spines
    let target = scroller.scrollLeft;
    if (target < lo) target = lo;
    if (target > hi) target = hi;
    target = Math.max(0, target);
    if (Math.abs(target - scroller.scrollLeft) > 1) scroller.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
  }
  TW.reveal = (col) => reveal(TW.columns.indexOf(col));

  // ---------- the elastic bounce at either end ----------
  let over = 0, vel = 0, anim = 0, idle = 0;
  const paint = () => { track.style.transform = over ? `translate3d(${over.toFixed(2)}px,0,0)` : ""; };
  function release() {
    let last = performance.now();
    const k = 230, c = 2 * Math.sqrt(k) * 0.6; // slightly under-damped: one small rebound
    vel = 0;
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      vel += (-k * over - c * vel) * dt;
      over += vel * dt;
      if (Math.abs(over) < 0.25 && Math.abs(vel) < 4) { over = 0; paint(); anim = 0; return; }
      paint();
      anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function scrollsItself(el, dx) {
    for (let n = el; n && n !== scroller; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1) {
        const s = getComputedStyle(n).overflowX;
        if ((s === "auto" || s === "scroll") &&
          ((dx > 0 && n.scrollLeft < n.scrollWidth - n.clientWidth - 1) || (dx < 0 && n.scrollLeft > 0))) return true;
      }
    }
    return false;
  }
  function onWheel(e) {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx || scrollsItself(e.target, dx)) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const atStart = scroller.scrollLeft <= 0.5 && dx < 0;
    const atEnd = scroller.scrollLeft >= max - 0.5 && dx > 0;
    if (!atStart && !atEnd && !over) return;
    e.preventDefault();
    if (anim) { cancelAnimationFrame(anim); anim = 0; }
    const limit = 110;
    const next = over - dx * 0.38 * (1 - Math.min(Math.abs(over) / limit, 0.92));
    over = (over > 0 && next < 0) || (over < 0 && next > 0) ? 0 : Math.max(-limit, Math.min(limit, next));
    paint();
    clearTimeout(idle);
    idle = setTimeout(release, 80);
  }

  // ---------- columns ----------
  function frame(title) {
    const el = document.createElement("article");
    el.className = "tw-col";
    el.innerHTML =
      '<div class="tw-col-closezone"><button class="tw-col-close" title="Close this page">×</button></div>' +
      '<div class="tw-col-spine"><span></span></div>' +
      '<div class="tw-col-inner"></div>';
    el.querySelector(".tw-col-spine span").textContent = display(title);
    return el;
  }
  function makeBase() {
    const main = document.querySelector("main#content") || document.getElementById("content");
    const titleText = (document.querySelector(".mw-page-title-main, #firstHeading")?.textContent || document.title.replace(/ - Wikipedia$/, "")).trim();
    const canon = document.querySelector('link[rel="canonical"]');
    const path = canon ? decodeURIComponent(new URL(canon.href).pathname) : decodeURIComponent(location.pathname);
    const el = frame(titleText);
    el.querySelector(".tw-col-inner").append(main);
    track.append(el);
    const col = {
      el, inner: el.querySelector(".tw-col-inner"),
      root: document.querySelector("#mw-content-text .mw-parser-output"),
      title: path.replace(/^\/wiki\//, "") || titleText,
      key: `tw-notes:${location.host}${path}`,
      titlebar: document.querySelector(".vector-page-titlebar"),
      base: true,
    };
    wire(col);
    TW.columns.push(col);
    return col;
  }
  function makeColumn(title) {
    const el = frame(title);
    const inner = el.querySelector(".tw-col-inner");
    inner.innerHTML =
      '<header class="tw-col-titlebar vector-page-titlebar"><h1 class="mw-first-heading tw-col-title">' +
      '<span class="mw-page-title-main"></span></h1></header>' +
      '<div class="mw-body-content tw-col-body"><p class="tw-col-loading">Loading…</p></div>';
    inner.querySelector(".mw-page-title-main").textContent = display(title);
    track.append(el);
    const col = { el, inner, root: null, title, key: keyFor(title), titlebar: inner.querySelector(".tw-col-titlebar") };
    wire(col);
    TW.columns.push(col);
    return col;
  }
  function wire(col) {
    col.el.querySelector(".tw-col-close").addEventListener("click", (e) => { e.stopPropagation(); close(col); });
    col.el.querySelector(".tw-col-spine").addEventListener("click", () => { reveal(TW.columns.indexOf(col)); focus(col); });
    col.inner.addEventListener("scroll", () => { if (col === focused) trackActive(); }, { passive: true });
    col.el.addEventListener("mousedown", () => focus(col));
  }

  let hookId = 0;
  async function load(col, hash) {
    const url = `/w/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=text%7Cdisplaytitle` +
      `&disableeditsection=1&disabletoc=1&page=${encodeURIComponent(display(col.title))}`;
    const body = col.inner.querySelector(".tw-col-body");
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      if (data.error || !data.parse) throw new Error(data.error ? data.error.info : "No page");
      if (!col.el.isConnected) return;
      col.title = slug(data.parse.title);
      col.key = keyFor(col.title);
      const shown = new DOMParser().parseFromString(data.parse.displaytitle || data.parse.title, "text/html").body.textContent;
      col.inner.querySelector(".mw-page-title-main").textContent = shown;
      col.el.querySelector(".tw-col-spine span").textContent = shown;
      const tmp = document.createElement("div");
      tmp.innerHTML = data.parse.text;
      const out = tmp.querySelector(".mw-parser-output") || tmp;
      if (!out.classList.contains("mw-parser-output")) out.classList.add("mw-parser-output");
      out.id = `tw-col-content-${++hookId}`;
      body.textContent = "";
      body.append(out);
      col.root = out;
      if (TW.typeset) TW.typeset(out);
      document.dispatchEvent(new CustomEvent("tw-content", { detail: out.id })); // let Wikipedia's own scripts (collapsibles…) run
      syncUrl(false);
      emit("column", col);
      if (col === focused) buildContents(col);
      if (hash) scrollToId(col, hash);
    } catch (err) {
      body.innerHTML = '<p class="tw-col-loading"></p>';
      body.firstChild.textContent = `Could not load this page (${err.message}).`;
      const a = document.createElement("a");
      a.href = `/wiki/${encodeURIComponent(slug(col.title))}`;
      a.textContent = "Open it on its own";
      body.append(a);
    }
  }

  function open(fromCol, title, hash) {
    const existing = TW.columns.find((c) => same(c.title, title));
    if (existing) {
      reveal(TW.columns.indexOf(existing));
      focus(existing);
      if (hash) scrollToId(existing, hash);
      return;
    }
    const from = TW.columns.indexOf(fromCol);
    TW.columns.slice(from + 1).forEach((c) => remove(c));
    const col = makeColumn(title);
    restack();
    focus(col);
    syncUrl(true);
    requestAnimationFrame(() => reveal(TW.columns.indexOf(col)));
    load(col, hash);
  }
  function remove(col) {
    const i = TW.columns.indexOf(col);
    if (i < 0) return;
    TW.columns.splice(i, 1);
    col.el.remove();
    emit("close", col);
    if (focused === col) focused = null;
  }
  function close(col) {
    const i = TW.columns.indexOf(col);
    if (i === 0) {
      // Closing the base page: the next page becomes the base (a normal page load).
      const rest = TW.columns.slice(1);
      if (!rest.length) return;
      const u = new URL(`/wiki/${encodeURIComponent(slug(rest[0].title))}`, location.origin);
      rest.slice(1).forEach((c) => u.searchParams.append("stacked", slug(c.title)));
      location.assign(u);
      return;
    }
    remove(col);
    restack();
    syncUrl(true);
    focus(TW.columns[Math.min(i, TW.columns.length - 1)]);
  }

  // ---------- URL state ----------
  function syncUrl(push) {
    const u = new URL(location.href);
    u.searchParams.delete("stacked");
    TW.columns.slice(1).forEach((c) => u.searchParams.append("stacked", slug(c.title)));
    if (u.href === location.href) return;
    history[push ? "pushState" : "replaceState"]({ twStack: true }, "", u);
  }
  function restore(scrollToEnd) {
    const want = new URL(location.href).searchParams.getAll("stacked");
    const have = TW.columns.slice(1).map((c) => c.title);
    let k = 0;
    while (k < want.length && k < have.length && same(want[k], have[k])) k++;
    TW.columns.slice(k + 1).forEach((c) => remove(c));
    want.slice(k).forEach((t) => { const c = makeColumn(t); load(c); });
    restack();
    const last = TW.columns[TW.columns.length - 1];
    focus(last);
    if (scrollToEnd) requestAnimationFrame(() => reveal(TW.columns.length - 1, false));
  }

  // ---------- links ----------
  function scrollToId(col, id) {
    const target = (col.root || col.inner).querySelector(`[id="${CSS.escape(id)}"]`) || col.inner.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return false;
    const top = target.getBoundingClientRect().top - col.inner.getBoundingClientRect().top + col.inner.scrollTop - 24;
    col.inner.scrollTo({ top, behavior: "smooth" });
    return true;
  }
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const col = TW.columns.find((c) => c.el.contains(a));
    if (!col || a.closest(".vector-dropdown, .tw-ui, .navbar, .mw-editsection")) return;
    const href = a.getAttribute("href");
    if (href.startsWith("#")) {
      if (scrollToId(col, decodeURIComponent(href.slice(1)))) e.preventDefault();
      return;
    }
    let u;
    try { u = new URL(a.href); } catch (_) { return; }
    if (u.host !== location.host || !u.pathname.startsWith("/wiki/") || u.search) return;
    if (a.classList.contains("new") || a.classList.contains("mw-file-description") || a.classList.contains("image")) return;
    const title = decodeURIComponent(u.pathname.slice(6));
    if (!title || NON_ARTICLE.test(display(title))) return;
    e.preventDefault();
    const hash = u.hash ? decodeURIComponent(u.hash.slice(1)) : "";
    if (same(title, col.title)) { if (hash) scrollToId(col, hash); return; }
    col.root && col.root.querySelectorAll("a.tw-link-open").forEach((x) => x.classList.remove("tw-link-open"));
    a.classList.add("tw-link-open");
    open(col, title, hash);
  }

  // ---------- Contents: the left column follows the page you are reading ----------
  let tocItems = [];
  function headingText(h) {
    const c = h.cloneNode(true);
    c.querySelectorAll(".mw-editsection, .tw-num").forEach((n) => n.remove());
    return c.textContent.trim();
  }
  function buildContents(col) {
    contents.textContent = "";
    tocItems = [];
    if (!col) return;
    const label = document.createElement("button");
    label.className = "tw-contents-title";
    label.textContent = col.el.querySelector(".tw-col-spine span").textContent;
    label.addEventListener("click", () => col.inner.scrollTo({ top: 0, behavior: "smooth" }));
    contents.append(label);
    if (!col.root) return;
    const ul = document.createElement("ul");
    const seen = new Set();
    col.root.querySelectorAll("h2, h3").forEach((h) => {
      if (seen.has(h) || h.closest("table, .navbox, .infobox, .sidebar, .tw-ui")) return;
      seen.add(h);
      const li = document.createElement("li");
      li.className = h.tagName === "H2" ? "tw-toc-1" : "tw-toc-2";
      const a = document.createElement("a");
      a.href = `#${h.id || ""}`;
      a.textContent = headingText(h);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const top = h.getBoundingClientRect().top - col.inner.getBoundingClientRect().top + col.inner.scrollTop - 20;
        col.inner.scrollTo({ top, behavior: "smooth" });
      });
      li.append(a);
      ul.append(li);
      tocItems.push({ h, li });
    });
    contents.append(ul);
    trackActive();
  }
  function trackActive() {
    if (!focused || !tocItems.length) return;
    const top = focused.inner.getBoundingClientRect().top + 80;
    let active = null;
    for (const it of tocItems) { if (it.h.getBoundingClientRect().top <= top) active = it; else break; }
    tocItems.forEach((it) => it.li.classList.toggle("tw-active", it === active));
  }
  function focus(col) {
    if (!col || col === focused) return;
    focused = col;
    TW.columns.forEach((c) => c.el.classList.toggle("tw-focused", c === col));
    buildContents(col);
    emit("focus", col);
  }
  TW.focused = () => focused;

  // ---------- start ----------
  function start() {
    if (!canStack()) return;
    html.classList.add("tw-stacked");
    contents = document.createElement("nav");
    contents.id = "tw-contents";
    contents.setAttribute("aria-label", "Contents");
    scroller = document.createElement("div");
    scroller.id = "tw-stack";
    track = document.createElement("div");
    track.id = "tw-stack-track";
    scroller.append(track);
    document.body.append(contents, scroller);
    setTop();
    const base = makeBase();
    restack();
    focus(base);
    emit("column", base);

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("click", onClick);
    addEventListener("resize", () => { setTop(); onScroll(); });
    addEventListener("popstate", () => restore(false));

    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("page-hook.js");
    (document.head || html).append(s);

    if (new URL(location.href).searchParams.getAll("stacked").length) restore(true);
  }

  const settingsReady = TW.ready || Promise.resolve({ enabled: true });
  const domReady = new Promise((r) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", r) : r()));
  Promise.all([settingsReady, domReady]).then(([s]) => { if (s.enabled !== false) start(); });
})();
