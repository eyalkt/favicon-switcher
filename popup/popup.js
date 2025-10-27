import { getRules, upsertRule, deleteRule } from "../common/storage.js";
import {
  getHost,
  isValidFaviconUrl,
  pickBestRule,
} from "../common/matching.js";

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setPreview(url) {
  const img = document.getElementById("faviconPreview");
  if (url) {
    img.src = url;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

function setMessage(msg, isError = false) {
  const el = document.getElementById("message");
  el.textContent = msg || "";
  el.style.color = isError ? "#ff6b6b" : "";
}

function uiScope() {
  return document.querySelector('input[name="scope"]:checked').value;
}

function toggleScope(scope, host) {
  document
    .getElementById("domainRow")
    .classList.toggle("hidden", scope !== "domain");
  document
    .getElementById("patternRow")
    .classList.toggle("hidden", scope !== "pattern");
  if (scope === "domain") {
    document.getElementById("domainInput").value = host || "";
  }
}

function ruleFromUi(scope, host, enabledDefault = true) {
  const faviconUrl = document.getElementById("faviconUrlInput").value.trim();
  const value =
    scope === "domain"
      ? host || ""
      : document.getElementById("patternInput").value.trim();
  return {
    type: scope,
    value,
    faviconUrl,
    enabled: enabledDefault,
  };
}

function validateRule(rule) {
  if (rule.type === "domain" && !rule.value) return "Missing domain";
  if (rule.type === "pattern" && !rule.value) return "Missing pattern";
  if (!isValidFaviconUrl(rule.faviconUrl)) return "Invalid favicon URL";
  return "";
}

async function applyInTab(tabId, url) {
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
      args: [url],
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function clearInTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/applyFavicon.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__faviconSwitcherClear) window.__faviconSwitcherClear();
      },
    });
    return true;
  } catch (_) {
    return false;
  }
}

function resetForm(host) {
  document.querySelector('input[name="scope"][value="domain"]').checked = true;
  toggleScope("domain", host);
  document.getElementById("patternInput").value = "";
  document.getElementById("faviconUrlInput").value = "";
  const enabledSwitch = document.getElementById("enabledSwitch");
  enabledSwitch.checked = false;
  enabledSwitch.disabled = true;
  setPreview("");
  setMessage("");
}

async function init() {
  const tab = await getCurrentTab();
  const url = (tab && tab.url) || "";
  const host = getHost(url);
  const contextEl = document.getElementById("context");
  contextEl.textContent = host ? `${host}` : "No active tab URL";

  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const enabledSwitch = document.getElementById("enabledSwitch");

  const urlInput = document.getElementById("faviconUrlInput");
  urlInput.addEventListener("input", (e) => {
    setPreview(e.target.value);
    urlInput.title = e.target.value || "";
  });
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBtn.click();
    }
  });
  urlInput.title = urlInput.value || "";

  document.getElementById("manageBtn").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  toggleScope(uiScope(), host);
  document.querySelectorAll('input[name="scope"]').forEach((r) => {
    r.addEventListener("change", () => toggleScope(uiScope(), host));
  });

  let rules = await getRules();
  let existing = pickBestRule(rules, url);

  if (existing) {
    document.getElementById("faviconUrlInput").value =
      existing.faviconUrl || "";
    setPreview(existing.faviconUrl || "");
    if (existing.type === "domain") {
      document.querySelector(
        'input[name="scope"][value="domain"]'
      ).checked = true;
      toggleScope("domain", host);
      document.getElementById("domainInput").value = existing.value;
    } else {
      document.querySelector(
        'input[name="scope"][value="pattern"]'
      ).checked = true;
      toggleScope("pattern", host);
      document.getElementById("patternInput").value = existing.value;
    }
    enabledSwitch.checked = existing.enabled !== false;
    enabledSwitch.disabled = false;
    deleteBtn.disabled = false;
  } else {
    enabledSwitch.checked = false;
    enabledSwitch.disabled = true;
    deleteBtn.disabled = true;
  }

  saveBtn.addEventListener("click", async () => {
    const scope = uiScope();
    const rule = ruleFromUi(scope, host, enabledSwitch.checked || true);
    const err = validateRule(rule);
    if (err) return setMessage(err, true);
    if (existing) rule.id = existing.id;
    await upsertRule(rule);
    // refresh local state
    rules = await getRules();
    existing = pickBestRule(rules, url);
    deleteBtn.disabled = !existing;
    enabledSwitch.checked = existing ? existing.enabled !== false : true;
    enabledSwitch.disabled = !existing;

    setMessage("Saved.");
    if (tab && tab.id && url) {
      if (existing && existing.enabled) {
        const ok = await applyInTab(tab.id, existing.faviconUrl);
        if (!ok) setMessage("Reload the page to view changes");
      } else {
        const ok = await clearInTab(tab.id);
        if (!ok) setMessage("Reload the page to view changes");
      }
    }
  });

  enabledSwitch.addEventListener("change", async () => {
    if (!existing) return;
    const updated = { ...existing, enabled: enabledSwitch.checked };
    await upsertRule(updated);
    rules = await getRules();
    existing = pickBestRule(rules, url);

    if (tab && tab.id) {
      if (updated.enabled) {
        const ok = await applyInTab(tab.id, updated.faviconUrl);
        if (!ok) setMessage("Reload the page to view changes");
      } else {
        const ok = await clearInTab(tab.id);
        if (!ok) setMessage("Reload the page to view changes");
      }
    }
  });

  deleteBtn.addEventListener("click", async () => {
    if (!existing) return resetForm(host);
    await deleteRule(existing.id);
    rules = await getRules();
    existing = pickBestRule(rules, url);
    resetForm(host);
    deleteBtn.disabled = true;
    if (tab && tab.id) {
      const ok = await clearInTab(tab.id);
      if (!ok) setMessage("Reload the page to view changes");
    }
    setMessage("Deleted.");
  });
}

init();
