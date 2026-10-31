// Toolbar click toggles the typesetting on every open Wikipedia tab.
const sync = (on) => {
  chrome.action.setBadgeText({ text: on ? "" : "off" });
  chrome.action.setBadgeBackgroundColor({ color: "#8F3838" });
  chrome.action.setTitle({ title: `Incerto typesetting: ${on ? "on" : "off"} (click to toggle)` });
};

chrome.action.onClicked.addListener(async () => {
  const { enabled = true } = await chrome.storage.sync.get("enabled");
  await chrome.storage.sync.set({ enabled: !enabled });
  sync(!enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled = true } = await chrome.storage.sync.get("enabled");
  sync(enabled);
});
