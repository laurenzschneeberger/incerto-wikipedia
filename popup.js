const DEFAULTS = { enabled: true, header: "a", navbox: "a" };
chrome.storage.sync.get(DEFAULTS, (s) => {
  document.querySelector('[name="enabled"]').checked = s.enabled !== false;
  for (const k of ["header", "navbox"]) {
    const r = document.querySelector(`[name="${k}"][value="${s[k]}"]`);
    if (r) r.checked = true;
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  chrome.storage.sync.set({ [el.name]: el.type === "checkbox" ? el.checked : el.value });
});
