chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  document.querySelector('[name="enabled"]').checked = enabled !== false;
});
document.addEventListener("change", (e) => {
  if (e.target.name === "enabled") chrome.storage.sync.set({ enabled: e.target.checked });
});
