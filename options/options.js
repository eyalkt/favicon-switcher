import {
  getRules,
  upsertRule,
  deleteRule,
  setRules,
} from "../common/storage.js";
import { isValidFaviconUrl } from "../common/matching.js";

function setMessage(msg, isError = false) {
  const el = document.getElementById("message");
  el.textContent = msg || "";
  el.style.color = isError ? "#ff6b6b" : "";
}

function ruleRow(rule) {
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
    const value = prompt("New value (domain or pattern):", rule.value);
    if (value == null || value.trim() === "") return;
    const faviconUrl = prompt("Favicon URL:", rule.faviconUrl);
    if (faviconUrl == null || !isValidFaviconUrl(faviconUrl))
      return setMessage("Invalid favicon URL", true);
    await upsertRule({
      ...rule,
      value: value.trim(),
      faviconUrl: faviconUrl.trim(),
    });
    render();
    setMessage("Updated");
  });
  return tr;
}

async function render() {
  const tbody = document.getElementById("rulesBody");
  tbody.innerHTML = "";
  const rules = await getRules();
  for (const r of rules) tbody.appendChild(ruleRow(r));
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
  const cleaned = data.map((r) => ({
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

  render();
}

init();
