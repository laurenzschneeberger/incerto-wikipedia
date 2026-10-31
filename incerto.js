// Incerto for Wikipedia: content script.
// CSS does most of the work. This adds what CSS cannot: section numbers,
// the Goudy initial with small caps, figure labels, run-in headings,
// bibliography labels, and moving page actions and languages into Tools.
(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("incerto");

  // Settings: on/off (popup); article width, text size and colour (Appearance in the ··· menu).
  // fontSize / theme left null mean "whatever Wikipedia would do".
  const DEFAULTS = { enabled: true, width: 46, fontSize: null, theme: null };
  const settings = { ...DEFAULTS };
  const FONT_CLASSES = [0, 1, 2].map((n) => `vector-feature-custom-font-size-clientpref-${n}`);
  const THEME_CLASSES = ["day", "night", "os"].map((t) => `skin-theme-clientpref-${t}`);
  const swapClass = (all, keep) => { all.forEach((c) => root.classList.remove(c)); root.classList.add(keep); };
  const apply = () => {
    root.classList.toggle("incerto", settings.enabled !== false);
    root.style.setProperty("--tw-article-width", `${settings.width}rem`);
    if (settings.fontSize !== null && settings.fontSize !== undefined) swapClass(FONT_CLASSES, FONT_CLASSES[settings.fontSize]);
    if (settings.theme) swapClass(THEME_CLASSES, `skin-theme-clientpref-${settings.theme}`);
    syncAppearanceControls();
  };
  apply();
  try {
    chrome.storage.sync.get(DEFAULTS, (s) => { Object.assign(settings, s); apply(); });
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "sync") return;
      for (const k in c) if (k in DEFAULTS) settings[k] = c[k].newValue;
      apply();
    });
  } catch (_) { /* storage unavailable: defaults */ }
  const save = (patch) => { Object.assign(settings, patch); apply(); try { chrome.storage.sync.set(patch); } catch (_) {} };

  // Back matter is unnumbered, like \section* in LaTeX.
  const UNNUMBERED = /^(see also|notes?|references?|citations?|sources|bibliography|further reading|external links|footnotes|works cited|literature|einzelnachweise|weblinks|literatur|siehe auch|anmerkungen|notes et références|références|voir aussi|liens externes|bibliographie)$/i;
  const SKIP = "table, .infobox, .sidebar, .navbox, .toc, #toc, .gallery, .reflist, .references, blockquote, .quotebox, .ambox";

  const headingLevel = (el) => {
    const m = /^H([2-6])$/.exec(el.tagName);
    return m ? +m[1] : 0;
  };
  // Parsoid wraps headings in <div class="mw-heading mw-headingN">; legacy markup does not.
  const wrapperOf = (h) => (h.parentElement && h.parentElement.classList.contains("mw-heading") ? h.parentElement : h);
  const headingTextEl = (h) => h.querySelector(".mw-headline") || h;
  const headingText = (h) => {
    const c = headingTextEl(h).cloneNode(true);
    c.querySelectorAll(".mw-editsection, .tw-num").forEach((n) => n.remove());
    return c.textContent.trim();
  };
  const isHeadingBlock = (el) =>
    el && (el.classList.contains("mw-heading") || headingLevel(el) > 0);
  const nextContentSibling = (el) => {
    let n = el.nextElementSibling;
    while (n && (/^(LINK|STYLE|META|SCRIPT)$/.test(n.tagName) || n.classList.contains("mw-empty-elt"))) n = n.nextElementSibling;
    return n;
  };
  const hasText = (p) => p.textContent.replace(/\s+/g, "").length > 0;

  function numberSections(out) {
    let s2 = 0, s3 = 0, back = false;
    out.querySelectorAll("h2, h3").forEach((h) => {
      if (h.closest(SKIP) || h.id === "mw-toc-heading") return;
      const lvl = headingLevel(h);
      if (lvl === 2) {
        back = UNNUMBERED.test(headingText(h));
        if (back) return;
        s2++; s3 = 0;
      } else {
        if (back || s2 === 0) return;
        s3++;
      }
      const num = document.createElement("span");
      num.className = "tw-num";
      num.textContent = lvl === 2 ? `${s2}` : `${s2}.${s3}`;
      headingTextEl(h).prepend(num);
    });
  }

  // The first paragraph after a heading is not indented (LaTeX convention).
  function markFirstParagraphs(out) {
    out.querySelectorAll(".mw-heading, h2, h3, h4, h5, h6").forEach((h) => {
      const block = h.classList.contains("mw-heading") ? h : wrapperOf(h);
      if (block !== h && h.parentElement === block) return; // handled via wrapper
      let n = nextContentSibling(block);
      while (n && !isHeadingBlock(n) && n.tagName !== "P") {
        if (/^(UL|OL|DL|TABLE|BLOCKQUOTE|PRE)$/.test(n.tagName)) return;
        n = nextContentSibling(n);
      }
      if (n && n.tagName === "P") n.classList.add("tw-first");
    });
  }

  // h4–h6 followed by a paragraph become run-in heads, as in the book.
  function runInHeads(out) {
    out.querySelectorAll("h4, h5, h6").forEach((h) => {
      if (h.closest(SKIP)) return;
      const block = wrapperOf(h);
      const next = nextContentSibling(block);
      if (next && next.tagName === "P" && hasText(next) && headingText(h).length < 80) {
        block.classList.add("tw-runin");
        next.classList.add("tw-runin-p", "tw-first");
        next.prepend(block); // float inside the paragraph so it shares the first line
      }
    });
  }

  function figureLabels(out) {
    let n = 0;
    const caps = out.querySelectorAll(
      'figure[typeof~="mw:File/Thumb"] > figcaption, figure[typeof~="mw:File/Frame"] > figcaption, .thumb .thumbcaption'
    );
    caps.forEach((cap) => {
      if (cap.closest(".infobox, .sidebar, .navbox, .gallery, table") || !hasText(cap)) return;
      if (cap.querySelector(".tw-figlabel")) return;
      n++;
      const label = document.createElement("span");
      label.className = "tw-figlabel";
      label.textContent = `Figure ${n}: `;
      const magnify = cap.querySelector(".magnify");
      if (magnify) magnify.after(label); else cap.prepend(label);
    });
  }

  // [a], [b] notes become italic superscript marks, numbered refs stay [12].
  function footnoteMarks(out) {
    out.querySelectorAll("sup.reference").forEach((sup) => {
      const a = sup.querySelector("a");
      if (!a) return;
      const raw = a.textContent.replace(/[\[\]\s]/g, "");
      if (!/^[a-z]{1,2}$/.test(raw)) return;
      sup.classList.add("tw-efn");
      if (!a.querySelector(".cite-bracket")) {
        a.innerHTML = "";
        const l = document.createElement("span"); l.className = "cite-bracket"; l.textContent = "[";
        const r = document.createElement("span"); r.className = "cite-bracket"; r.textContent = "]";
        a.append(l, raw, r);
      }
    });
  }

  function leadParagraph(out) {
    for (const p of out.querySelectorAll("p")) {
      if (p.closest(SKIP + ", .hatnote, .shortdescription, .mw-empty-elt")) continue;
      if (p.textContent.trim().length < 60) continue;
      return p;
    }
    return null;
  }

  // Drop cap in Goudy Initials + the next words in small caps ("ONE CAN BELIEVE").
  function lettrine(out) {
    const p = leadParagraph(out);
    if (!p || p.querySelector(".tw-lettrine")) return;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) =>
        t.parentElement.closest("sup, style, script, .IPA, .rt-commentedText, .noexcerpt, [style*='display:none']")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let t = walker.nextNode();
    while (t && !t.data.trim()) t = walker.nextNode();
    if (!t) return;

    const lead = t.data.length - t.data.trimStart().length;
    const ch = t.data.charAt(lead);
    const base = ch.normalize("NFD").charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(base) || base !== ch.toUpperCase()) return; // Goudy has A–Z only

    // Split off the first letter.
    const letterNode = t.splitText(lead);
    let rest = letterNode.splitText(1);
    const cap = document.createElement("span");
    cap.className = "tw-lettrine";
    cap.textContent = letterNode.data;
    letterNode.replaceWith(cap);
    p.classList.add("tw-lettrine-p");

    // Small caps for the rest of the first word plus two more words.
    // If the article opens with its bold subject ("Sir Karl Raimund Popper"), set all of it.
    let remaining = 3;
    const bold = cap.parentElement.closest("b, strong");
    if (bold && p.contains(bold)) {
      const n = bold.textContent.trim().split(/\s+/).length;
      if (n <= 6) remaining = n;
    }
    let inWord = true, node = rest;
    while (node && remaining > 0) {
      const s = node.data;
      let cut = s.length;
      for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) {
          if (inWord && --remaining === 0) { cut = i; break; }
          inWord = false;
        } else inWord = true;
      }
      if (cut < s.length) node.splitText(cut);
      const sc = document.createElement("span");
      sc.className = "tw-sc";
      node.replaceWith(sc);
      sc.append(node);
      walker.currentNode = node;
      node = walker.nextNode();
    }
  }


  // References, Sources, Further reading ...: set like the book's bibliography,
  // "[241] Edward Thorp. A corrected derivation ...", hanging, one column.
  const BIBLIO = /^(notes?|references?|citations?|sources|bibliography|further reading|external links|footnotes|works cited|literature|selected (works|bibliography|publications)|works|publications|primary sources|secondary sources|general (and cited )?references|cited works|einzelnachweise|weblinks|literatur|anmerkungen|notes et références|références|liens externes|bibliographie)$/i;
  function bibliography(out) {
    out.querySelectorAll("ol.references").forEach((ol) => {
      const alpha = !!ol.closest(".reflist-lower-alpha, .notelist") ||
        /alpha/.test(getComputedStyle(ol).listStyleType);
      const start = parseInt(ol.getAttribute("start") || "1", 10);
      ol.classList.add("tw-biblio", "tw-numbered");
      [...ol.children].forEach((li, i) => {
        if (li.tagName !== "LI" || li.querySelector(":scope > .tw-refnum")) return;
        const n = start + i;
        const label = alpha ? toAlpha(n) : String(n);
        const back = li.querySelector(".mw-cite-backlink a[href^='#']");
        const num = document.createElement(back ? "a" : "span");
        num.className = "tw-refnum";
        num.textContent = `[${label}]`;
        if (back) { num.href = back.getAttribute("href"); num.title = "Back to the text"; }
        li.prepend(num);
      });
    });
    out.querySelectorAll(".mw-heading2 h2, .mw-heading3 h3, h2, h3").forEach((h) => {
      if (h.closest(SKIP) || !BIBLIO.test(headingText(h))) return;
      const block = wrapperOf(h);
      const lvl = headingLevel(h);
      for (let n = block.nextElementSibling; n; n = n.nextElementSibling) {
        const hl = n.classList.contains("mw-heading") ? headingLevel(n.querySelector("h2,h3,h4,h5,h6") || n) : headingLevel(n);
        if (hl && hl <= lvl) break;
        if (n.matches(".navbox, .navbox-styles, [role=navigation]")) continue;
        const lists = n.matches("ul") ? [n] : [...n.querySelectorAll("ul")].filter((u) => !u.closest(".navbox, .sidebar, .infobox, table, .hlist"));
        lists.forEach((u) => u.classList.add("tw-biblio"));
      }
    });
  }
  const toAlpha = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

  // Talk, Edit and View history go into the Tools menu; so do the languages.
  // Appearance: our own controls, so they work wherever Wikipedia put (or never rendered) its panel.
  function currentFontSize() {
    const i = FONT_CLASSES.findIndex((c) => root.classList.contains(c));
    return i < 0 ? 1 : i;
  }
  function currentTheme() {
    const t = ["day", "night", "os"].find((x) => root.classList.contains(`skin-theme-clientpref-${x}`));
    return t || "day";
  }
  function syncAppearanceControls() {
    const box = document.getElementById("tw-appearance");
    if (!box) return;
    const slider = box.querySelector('input[type="range"]');
    if (slider && +slider.value !== +settings.width) slider.value = settings.width;
    const fs = String(currentFontSize()), th = currentTheme();
    box.querySelectorAll("[data-fs]").forEach((b) => b.classList.toggle("tw-on", b.dataset.fs === fs));
    box.querySelectorAll("[data-theme]").forEach((b) => b.classList.toggle("tw-on", b.dataset.theme === th));
  }
  function buildAppearance(tools) {
    if (document.getElementById("tw-appearance")) return;
    const box = document.createElement("div");
    box.id = "tw-appearance";
    box.className = "vector-menu mw-portlet tw-added";
    box.innerHTML =
      '<div class="vector-menu-heading">Appearance</div>' +
      '<div class="vector-menu-content">' +
      '<div class="tw-app-label">Article width</div>' +
      '<input type="range" min="30" max="80" step="1" aria-label="Article width">' +
      '<div class="tw-width-ends"><span>narrow</span><span>wide</span></div>' +
      '<div class="tw-app-label">Text</div>' +
      '<div class="tw-seg"><button data-fs="0">small</button><button data-fs="1">standard</button><button data-fs="2">large</button></div>' +
      '<div class="tw-app-label">Colour</div>' +
      '<div class="tw-seg"><button data-theme="os">auto</button><button data-theme="day">light</button><button data-theme="night">dark</button></div>' +
      "</div>";
    const slider = box.querySelector("input");
    slider.value = settings.width;
    let t;
    slider.addEventListener("input", () => {
      settings.width = +slider.value;
      root.style.setProperty("--tw-article-width", `${settings.width}rem`);
      clearTimeout(t);
      t = setTimeout(() => chrome.storage.sync.set({ width: settings.width }), 250);
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      e.preventDefault();
      if (b.dataset.fs) save({ fontSize: +b.dataset.fs });
      if (b.dataset.theme) save({ theme: b.dataset.theme });
    });
    tools.append(box);
    syncAppearanceControls();
  }

  // Talk, Edit, View history, languages and Appearance live in the ‡ menu;
  // Contents is a fixed column on the left.
  function pageChrome() {
    const tools = document.getElementById("vector-page-tools");
    const unpinned = document.getElementById("vector-page-tools-unpinned-container");
    if (tools && unpinned && !unpinned.contains(tools)) {
      unpinned.append(tools);
      root.classList.replace("vector-feature-page-tools-pinned-enabled", "vector-feature-page-tools-pinned-disabled");
    }

    // Contents: always open, fixed to the left, starting just below the header.
    const toc = document.getElementById("vector-toc");
    if (toc && !document.getElementById("tw-toc-sidebar")) {
      const side = document.createElement("aside");
      side.id = "tw-toc-sidebar";
      side.setAttribute("aria-label", "Contents");
      side.append(toc);
      document.body.append(side);
      root.classList.add("tw-has-toc");
      root.classList.replace("vector-feature-toc-pinned-clientpref-1", "vector-feature-toc-pinned-clientpref-0");
      const header = document.querySelector(".vector-header-container, .mw-header");
      const inner = document.querySelector(".mw-page-container-inner") || document.querySelector(".mw-body");
      const place = () => {
        const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        side.style.top = `${top}px`;
      };
      // Push the page right only as far as needed to clear the column.
      const clear = () => {
        const narrow = innerWidth < 1000;
        root.classList.toggle("tw-toc-narrow", narrow);
        if (!inner) return;
        inner.style.paddingLeft = "";
        if (narrow || !root.classList.contains("incerto")) return;
        const need = side.getBoundingClientRect().right + 24 - inner.getBoundingClientRect().left;
        if (need > 0) inner.style.paddingLeft = `${need}px`;
      };
      clear();
      addEventListener("resize", clear);
      try { chrome.storage.onChanged.addListener((c) => { if (c.enabled) setTimeout(clear, 0); }); } catch (_) {}
      place();
      addEventListener("scroll", place, { passive: true });
      addEventListener("resize", place);
    }

    // The ‡ button moves up into the title bar, level with the title.
    const toolsDropdown = document.getElementById("vector-page-tools-dropdown");
    const titlebar = document.querySelector(".vector-page-titlebar");
    if (toolsDropdown && titlebar && !titlebar.contains(toolsDropdown)) titlebar.append(toolsDropdown);

    // Wikipedia's own Appearance panel is replaced by ours (it renders lazily and unreliably once moved).
    root.classList.replace("vector-feature-appearance-pinned-clientpref-1", "vector-feature-appearance-pinned-clientpref-0");
    if (tools) buildAppearance(tools);

    const actions = document.querySelector("#p-cactions .vector-menu-content-list");
    if (actions) {
      document.getElementById("p-cactions").classList.remove("emptyPortlet");
      const talk = document.querySelector("#ca-talk a");
      if (talk && !document.getElementById("tw-ca-talk")) {
        const li = document.createElement("li");
        li.id = "tw-ca-talk";
        li.className = "mw-list-item tw-added";
        const a = talk.cloneNode(true);
        a.removeAttribute("accesskey");
        li.append(a);
        actions.prepend(li);
      }
    }

    const langLinks = [...document.querySelectorAll("#p-lang-btn .interlanguage-link a, #p-lang .interlanguage-link a")];
    if (tools && langLinks.length && !document.getElementById("tw-languages")) {
      const box = document.createElement("div");
      box.id = "tw-languages";
      box.className = "vector-menu mw-portlet tw-added";
      box.innerHTML =
        '<div class="vector-menu-heading">Languages</div>' +
        '<div class="vector-menu-content"><details><summary></summary>' +
        '<input type="search" class="tw-lang-filter" placeholder="Filter languages">' +
        '<ul class="vector-menu-content-list"></ul></details></div>';
      box.querySelector("summary").textContent = `Read in ${langLinks.length} other language${langLinks.length > 1 ? "s" : ""}`;
      const ul = box.querySelector("ul");
      langLinks.forEach((a) => {
        const li = document.createElement("li");
        li.className = "mw-list-item";
        const c = a.cloneNode(true);
        c.classList.remove("interlanguage-link-target");
        li.append(c);
        ul.append(li);
      });
      box.querySelector("input").addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        ul.querySelectorAll("li").forEach((li) => {
          const a = li.firstChild;
          const hay = `${a.textContent} ${a.title} ${a.lang}`.toLowerCase();
          li.hidden = q && !hay.includes(q);
        });
      });
      const after = document.getElementById("p-cactions");
      if (after && tools.contains(after)) after.after(box); else tools.prepend(box);
    }
  }

  function typeset() {
    const out = document.querySelector("#mw-content-text .mw-parser-output");
    if (!out || out.dataset.incerto) return;
    out.dataset.incerto = "1";
    numberSections(out);
    markFirstParagraphs(out);
    runInHeads(out);
    figureLabels(out);
    footnoteMarks(out);
    lettrine(out);
    bibliography(out);
  }

  function run() {
    typeset();
    pageChrome();
    apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
