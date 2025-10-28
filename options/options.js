import {
  getRules,
  upsertRule,
  deleteRule,
  setRules,
  saveRules,
} from "../common/storage.js";
import { isValidFaviconUrl } from "../common/matching.js";

function setMessage(msg, isError = false) {
  const el = document.getElementById("message");
  el.textContent = msg || "";
  el.style.color = isError ? "#ff6b6b" : "";
}

function dedupeRules(rules) {
  const byKey = new Map();
  for (const r of rules) {
    const key = r.id ? `id:${r.id}` : `vk:${r.type}|${r.value}|${r.faviconUrl}`;
    if (!byKey.has(key)) byKey.set(key, r);
  }
  return Array.from(byKey.values());
}

function ruleRow(rule, index) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><span class="badge">${rule.type}</span></td>
    <td>${rule.value}</td>
    <td><img class="icon" src="${rule.faviconUrl}" alt="icon" /></td>
    <td><input type="checkbox" class="toggle" ${
      rule.enabled !== false ? "checked" : ""
    } /></td>
    <td class="action">
      <button class="edit">Edit</button>
      <button class="delete">Delete</button>
    </td>
  `;
  tr.querySelector(".toggle").addEventListener("change", async (e) => {
    await upsertRule({ ...rule, enabled: e.target.checked });
    setMessage(e.target.checked ? "Enabled" : "Disabled");
  });
  tr.querySelector(".delete").addEventListener("click", async () => {
    await deleteRule(rule.id);
    render();
    setMessage("Deleted");
  });
  tr.querySelector(".edit").addEventListener("click", async () => {
    openEditModal(rule, index);
  });
  return tr;
}

async function render() {
  const tbody = document.getElementById("rulesBody");
  tbody.innerHTML = "";
  const rulesRaw = await getRules();
  const rules = dedupeRules(rulesRaw);
  rules.forEach((r, i) => tbody.appendChild(ruleRow(r, i)));
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) exportBtn.disabled = rules.length === 0;
}

function exportRules(rules) {
  const blob = new Blob([JSON.stringify(rules, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "favicon-switcher-rules.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importRulesFromFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    setMessage("Invalid JSON", true);
    return;
  }
  if (!Array.isArray(data))
    return setMessage("Expected an array of rules", true);
  const deduped = dedupeRules(data);
  const cleaned = deduped.map((r) => ({
    id: r.id || undefined,
    type: r.type === "pattern" ? "pattern" : "domain",
    value: String(r.value || ""),
    faviconUrl: String(r.faviconUrl || ""),
    enabled: r.enabled !== false,
    createdAt: r.createdAt || Date.now(),
    updatedAt: Date.now(),
  }));
  await setRules(cleaned);
  render();
  setMessage("Imported");
}

// Random generator helpers (same as popup)
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
  const shapeSize = Math.round(size * 0.3);
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

let editState = { rule: null, dataUrl: "", index: -1 };

function openEditModal(rule, index) {
  editState.rule = rule;
  editState.index = index;
  editState.dataUrl = "";
  const modal = document.getElementById("editModal");
  const typeRadios = document.getElementsByName("editType");
  const sourceRadios = document.getElementsByName("editSource");
  const valueInput = document.getElementById("editValue");
  const urlInput = document.getElementById("editUrlInput");
  const urlRow = document.getElementById("editUrlRow");
  const randomRow = document.getElementById("editRandomRow");
  const generateBtn = document.getElementById("editGenerateBtn");
  const preview = document.getElementById("editPreview");
  const enabledChk = document.getElementById("editEnabled");
  const saveBtn = document.getElementById("editSaveBtn");
  const cancelBtn = document.getElementById("editCancelBtn");

  // Prefill type and value
  Array.from(typeRadios).forEach(
    (r) =>
      (r.checked = r.value === (rule.type === "pattern" ? "pattern" : "domain"))
  );
  valueInput.value = rule.value || "";

  // Decide source by faviconUrl
  const isData =
    typeof rule.faviconUrl === "string" && rule.faviconUrl.startsWith("data:");
  Array.from(sourceRadios).forEach(
    (r) => (r.checked = r.value === (isData ? "random" : "url"))
  );
  if (isData) {
    editState.dataUrl = rule.faviconUrl;
    urlInput.value = "";
    preview.src = rule.faviconUrl;
    preview.style.display = "block";
    urlRow.classList.add("hidden");
    randomRow.classList.remove("hidden");
  } else {
    urlInput.value = rule.faviconUrl || "";
    preview.src = rule.faviconUrl || "";
    preview.style.display = rule.faviconUrl ? "block" : "none";
    urlRow.classList.remove("hidden");
    randomRow.classList.add("hidden");
  }

  enabledChk.checked = rule.enabled !== false;

  // Handlers
  Array.from(sourceRadios).forEach((r) => {
    r.onchange = () => {
      if (r.checked) {
        if (r.value === "url") {
          urlRow.classList.remove("hidden");
          randomRow.classList.add("hidden");
          urlInput.value = "";
          preview.removeAttribute("src");
          preview.style.display = "none";
        } else {
          urlRow.classList.add("hidden");
          randomRow.classList.remove("hidden");
          if (editState.dataUrl) {
            preview.src = editState.dataUrl;
            preview.style.display = "block";
          }
        }
      }
    };
  });

  generateBtn.onclick = () => {
    editState.dataUrl = generateRandomFavicon(64);
    preview.src = editState.dataUrl;
    preview.style.display = "block";
  };

  saveBtn.onclick = async () => {
    const type =
      Array.from(typeRadios).find((r) => r.checked)?.value === "pattern"
        ? "pattern"
        : "domain";
    const value = valueInput.value.trim();
    const source =
      Array.from(sourceRadios).find((r) => r.checked)?.value || "url";
    const faviconUrl =
      source === "random" ? editState.dataUrl : urlInput.value.trim();

    if (!value) return setMessage("Missing match value", true);
    if (source === "url") {
      if (!isValidFaviconUrl(faviconUrl))
        return setMessage("Invalid favicon URL", true);
    } else {
      if (!faviconUrl) return setMessage("Generate a favicon first", true);
    }

    // Skip save if unchanged: still reload to normalize list
    const old = editState.rule;
    const noChange =
      old.type === type &&
      old.value === value &&
      old.faviconUrl === faviconUrl &&
      (old.enabled !== false) === !!enabledChk.checked;
    if (noChange) {
      modal.classList.add("hidden");
      window.location.reload();
      return;
    }

    // Update in place to avoid duplication
    const rules = await getRules();
    let idx = editState.index;
    // Validate idx still points to the same rule
    if (
      !(
        idx >= 0 &&
        idx < rules.length &&
        ((old.id && rules[idx].id === old.id) ||
          (!old.id &&
            rules[idx].type === old.type &&
            rules[idx].value === old.value &&
            rules[idx].faviconUrl === old.faviconUrl))
      )
    ) {
      // fallback by id, then by original identity
      idx = old.id ? rules.findIndex((r) => r.id === old.id) : -1;
      if (idx < 0)
        idx = rules.findIndex(
          (r) =>
            r.type === old.type &&
            r.value === old.value &&
            r.faviconUrl === old.faviconUrl
        );
    }

    if (idx < 0) {
      modal.classList.add("hidden");
      window.location.reload();
      return;
    }

    const now = Date.now();
    const updated = {
      ...rules[idx],
      type,
      value,
      faviconUrl,
      enabled: !!enabledChk.checked,
      updatedAt: now,
    };
    rules[idx] = updated;
    await saveRules(rules);

    modal.classList.add("hidden");
    window.location.reload();
  };

  cancelBtn.onclick = async () => {
    modal.classList.add("hidden");
    await render();
  };

  modal.classList.remove("hidden");
}

function init() {
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) exportBtn.disabled = true;

  document.getElementById("exportBtn").addEventListener("click", async () => {
    const rules = await getRules();
    exportRules(rules);
  });

  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await importRulesFromFile(file);
    e.target.value = "";
  });

  // Auto-refresh when storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes && changes.faviconSwitcherRules) {
      render();
    }
  });

  render();
}

init();
