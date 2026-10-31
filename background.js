// Keeps the toolbar badge in step with the on/off setting chosen in the popup.
const sync = (on) => {
  chrome.action.setBadgeText({ text: on === false ? "off" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#8F3838" });
};
const refresh = () => chrome.storage.sync.get({ enabled: true }, ({ enabled }) => sync(enabled));

chrome.runtime.onStartup.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
chrome.storage.onChanged.addListener((c) => { if (c.enabled) sync(c.enabled.newValue); });
