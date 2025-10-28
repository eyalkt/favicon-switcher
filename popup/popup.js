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

function uiSource() {
  return document.querySelector('input[name="source"]:checked').value;
}

function setSource(source) {
  const urlRadio = document.querySelector('input[name="source"][value="url"]');
  const rndRadio = document.querySelector(
    'input[name="source"][value="random"]'
  );
  const exRadio = document.querySelector(
    'input[name="source"][value="existing"]'
  );
  if (source === "url") urlRadio.checked = true;
  else if (source === "existing") exRadio.checked = true;
  else rndRadio.checked = true;
  toggleSourceRows(source);
}

function toggleScope(scope, host) {
  document
    .getElementById("domainRow")
    .classList.toggle("hidden", scope !== "domain");
  document
    .getElementById("patternRow")
    .classList.toggle("hidden", scope !== "pattern");
  if (scope === "domain") {
    const domainInput = document.getElementById("domainInput");
    domainInput.value = host || "";
    domainInput.title = domainInput.value;
  }
}

function toggleSourceRows(source) {
  document
    .getElementById("urlRow")
    .classList.toggle("hidden", source !== "url");
  document
    .getElementById("randomRow")
    .classList.toggle("hidden", source !== "random");
  document
    .getElementById("existingRow")
    .classList.toggle("hidden", source !== "existing");
}

function ruleFromUi(scope, host, enabledDefault = true, overrideUrl) {
  const faviconUrl =
    overrideUrl ?? document.getElementById("faviconUrlInput").value.trim();
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

function validateRule(rule, source) {
  if (rule.type === "domain" && !rule.value) return "Missing domain";
  if (rule.type === "pattern" && !rule.value) return "Missing pattern";
  if (source === "url" && !isValidFaviconUrl(rule.faviconUrl))
    return "Invalid favicon URL";
  if ((source === "random" || source === "existing") && !rule.faviconUrl)
    return source === "random" ? "Generate a favicon first" : "Pick a favicon";
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
  const patternInput = document.getElementById("patternInput");
  patternInput.value = "";
  patternInput.title = "";
  const urlInput = document.getElementById("faviconUrlInput");
  urlInput.value = "";
  urlInput.title = "";
  const enabledSwitch = document.getElementById("enabledSwitch");
  enabledSwitch.checked = false;
  enabledSwitch.disabled = true;
  setSource("random");
  lastGeneratedDataUrl = "";
  selectedExisting = "";
  setPreview("");
  setMessage("");
}

// Random favicon generation (40% shape)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}
function randomColor() {
  return hsl(randInt(0, 359), randInt(60, 90), randInt(35, 65));
}
function pickContrastingColor(bgHsl) {
  const m = /hsl\((\d+),\s*(\d+)%\,\s*(\d+)%\)/i.exec(bgHsl);
  if (!m) return hsl(randInt(0, 359), randInt(60, 90), randInt(20, 80));
  const h = parseInt(m[1], 10);
  const s = Math.min(100, Math.max(50, parseInt(m[2], 10)));
  const l = parseInt(m[3], 10);
  const altL = l > 50 ? randInt(15, 35) : randInt(65, 85);
  return hsl((h + randInt(90, 180)) % 360, s, altL);
}
function generateRandomFavicon(size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const bg = randomColor();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const shapes = ["circle", "square", "triangle"];
  const shape = shapes[randInt(0, shapes.length - 1)];
  const shapeColor = pickContrastingColor(bg);
  ctx.fillStyle = shapeColor;
  const shapeSize = Math.round(size * 0.4);
  const angle = randFloat(0, Math.PI * 2);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);
  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, shapeSize / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "square") {
    ctx.fillRect(-shapeSize / 2, -shapeSize / 2, shapeSize, shapeSize);
  } else {
    const h = (Math.sqrt(3) / 2) * shapeSize;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-shapeSize / 2, h / 2);
    ctx.lineTo(shapeSize / 2, h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return canvas.toDataURL("image/png");
}

let lastGeneratedDataUrl = "";
let selectedExisting = "";

function uniqueFavicons(rules) {
  const set = new Set();
  const list = [];
  for (const r of rules) {
    if (typeof r.faviconUrl === "string" && r.faviconUrl) {
      if (!set.has(r.faviconUrl)) {
        set.add(r.faviconUrl);
        list.push(r.faviconUrl);
      }
    }
  }
  return list;
}

function renderExistingGrid(faviconUrls) {
  const grid = document.getElementById("existingGrid");
  grid.innerHTML = "";
  faviconUrls.forEach((url) => {
    const item = document.createElement("div");
    item.className =
      "existing-item" + (selectedExisting === url ? " selected" : "");
    const img = document.createElement("img");
    img.src = url;
    item.appendChild(img);
    item.title = url;
    item.onclick = () => {
      selectedExisting = url;
      setPreview(url);
      // update selection styles
      grid
        .querySelectorAll(".existing-item")
        .forEach((el) => el.classList.remove("selected"));
      item.classList.add("selected");
    };
    grid.appendChild(item);
  });
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

  const patternInput = document.getElementById("patternInput");
  patternInput.addEventListener("input", (e) => {
    patternInput.title = e.target.value || "";
  });
  patternInput.title = patternInput.value || "";

  document.getElementById("manageBtn").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Source toggle
  toggleSourceRows(uiSource());
  document.querySelectorAll('input[name="source"]').forEach((r) => {
    r.addEventListener("change", () => {
      const source = uiSource();
      toggleSourceRows(source);
      if (source === "url") {
        urlInput.value = "";
        urlInput.title = "";
        setPreview("");
      } else if (source === "random") {
        if (lastGeneratedDataUrl) setPreview(lastGeneratedDataUrl);
      } else if (source === "existing") {
        // ensure preview matches selected item
        if (selectedExisting) setPreview(selectedExisting);
        else setPreview("");
      }
    });
  });

  // Generate button
  const generateBtn = document.getElementById("generateBtn");
  generateBtn.addEventListener("click", () => {
    lastGeneratedDataUrl = generateRandomFavicon(64);
    setPreview(lastGeneratedDataUrl);
    setMessage("Generated. Click Save to apply.");
  });

  toggleScope(uiScope(), host);
  document.querySelectorAll('input[name="scope"]').forEach((r) => {
    r.addEventListener("change", () => toggleScope(uiScope(), host));
  });

  let rules = await getRules();
  let existing = pickBestRule(rules, url);

  // Render existing favicon choices
  renderExistingGrid(uniqueFavicons(rules));

  if (existing) {
    // Decide source by URL scheme
    const isData =
      typeof existing.faviconUrl === "string" &&
      existing.faviconUrl.startsWith("data:");
    if (isData) {
      setSource("random");
      lastGeneratedDataUrl = existing.faviconUrl;
      setPreview(existing.faviconUrl || "");
      urlInput.value = ""; // keep URL field empty when saved as random
      urlInput.title = "";
    } else {
      setSource("url");
      urlInput.value = existing.faviconUrl || "";
      urlInput.title = urlInput.value;
      setPreview(existing.faviconUrl || "");
    }

    if (existing.type === "domain") {
      document.querySelector(
        'input[name="scope"][value="domain"]'
      ).checked = true;
      toggleScope("domain", host);
      const domainInput = document.getElementById("domainInput");
      domainInput.value = existing.value;
      domainInput.title = domainInput.value;
    } else {
      document.querySelector(
        'input[name="scope"][value="pattern"]'
      ).checked = true;
      toggleScope("pattern", host);
      patternInput.value = existing.value;
      patternInput.title = patternInput.value;
    }
    enabledSwitch.checked = existing.enabled !== false;
    enabledSwitch.disabled = false;
    deleteBtn.disabled = false;
  } else {
    enabledSwitch.checked = false;
    enabledSwitch.disabled = true;
    deleteBtn.disabled = true;
    setSource("random");
  }

  saveBtn.addEventListener("click", async () => {
    const scope = uiScope();
    const source = uiSource();
    let faviconUrl =
      source === "url"
        ? document.getElementById("faviconUrlInput").value.trim()
        : source === "random"
        ? lastGeneratedDataUrl
        : selectedExisting;
    if (source === "random" && !faviconUrl) {
      // auto-generate if not yet generated
      lastGeneratedDataUrl = generateRandomFavicon(64);
      faviconUrl = lastGeneratedDataUrl;
      setPreview(faviconUrl);
    }

    const rule = ruleFromUi(
      scope,
      host,
      enabledSwitch.checked || true,
      faviconUrl
    );
    const err = validateRule(rule, source);
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
