import { getRules } from "../common/storage.js";
import { pickBestRule, isHttpUrl } from "../common/matching.js";

async function applyIfMatched(tabId, url) {
  if (!isHttpUrl(url)) return;
  const rules = await getRules();
  const rule = pickBestRule(rules, url);
  if (!rule) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/applyFavicon.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (faviconUrl) => {
        if (window.__faviconSwitcherApply)
          window.__faviconSwitcherApply(faviconUrl);
      },
      args: [rule.faviconUrl],
    });
  } catch (e) {
    // ignore injection errors (e.g., restricted pages)
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab && tab.url) {
    applyIfMatched(tabId, tab.url);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // initial setup if needed
});

