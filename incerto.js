// Incerto for Wikipedia: content script.
// CSS does most of the work. This adds what CSS cannot: section numbers,
// the Goudy initial with small caps, figure labels and run-in headings.
(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("incerto");

  const setEnabled = (on) => root.classList.toggle("incerto", on !== false);
  try {
    chrome.storage.sync.get("enabled", ({ enabled }) => setEnabled(enabled));
    chrome.storage.onChanged.addListener((c) => { if (c.enabled) setEnabled(c.enabled.newValue); });
  } catch (_) { /* storage unavailable: stay on */ }

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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", typeset);
  else typeset();
})();
