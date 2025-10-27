export const STORAGE_KEY = "faviconSwitcherRules";

export async function getRules() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      resolve(Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : []);
    });
  });
}

export async function saveRules(rules) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: rules }, () => resolve());
  });
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function upsertRule(rule) {
  const rules = await getRules();
  const index = rules.findIndex((r) => r.id === rule.id);
  const now = Date.now();
  if (index >= 0) {
    rules[index] = { ...rules[index], ...rule, updatedAt: now };
  } else {
    rules.push({
      ...rule,
      id: rule.id || generateId(),
      createdAt: now,
      updatedAt: now,
    });
  }
  await saveRules(rules);
  return rules;
}

export async function deleteRule(ruleId) {
  const rules = await getRules();
  const filtered = rules.filter((r) => r.id !== ruleId);
  await saveRules(filtered);
  return filtered;
}

export async function setRules(rules) {
  await saveRules(rules);
  return rules;
}
