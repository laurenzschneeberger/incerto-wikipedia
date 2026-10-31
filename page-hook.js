// Runs in Wikipedia's own page context. When the extension adds an article to the desk,
// let Wikipedia's scripts enhance it as they would a normal page (collapsible navboxes,
// sortable tables, and so on).
document.addEventListener("tw-content", (e) => {
  try {
    const el = document.getElementById(e.detail);
    if (el && window.mw && window.jQuery) window.mw.hook("wikipage.content").fire(window.jQuery(el));
  } catch (_) { /* Wikipedia's scripts not available: the page still reads fine */ }
});
