const DEFAULTS = { enabled: true, icons: "a" };
chrome.storage.sync.get(DEFAULTS, (s) => {
  document.querySelector('[name="enabled"]').checked = s.enabled !== false;
  const r = document.querySelector(`[name="icons"][value="${s.icons}"]`);
  if (r) r.checked = true;
});
document.querySelector(".key").textContent = /Mac/.test(navigator.platform) ? "\u2325Q" : "Alt+Q";
document.addEventListener("change", (e) => {
  const el = e.target;
  chrome.storage.sync.set({ [el.name]: el.type === "checkbox" ? el.checked : el.value });
});
