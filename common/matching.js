export function isHttpUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("http://") || url.startsWith("https://"))
  );
}

export function getHost(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return "";
  }
}

export function isValidFaviconUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("data:")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Chrome match pattern to regex (basic): scheme://host/path with * supported
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function patternToRegex(pattern) {
  // Examples: *://*.example.com/*, https://example.com/path/*
  const m = /^(\*|http|https):\/\/([^/]+)\/(.*)$/.exec(pattern);
  if (!m) return null;
  const [, scheme, host, path] = m;

  const schemePart = scheme === "*" ? "(?:http|https)" : scheme;

  let hostPart = host
    .split(".")
    .map((seg) => (seg === "*" ? "[^.]+" : escapeRegex(seg)))
    .join("\\.");
  if (host === "*") hostPart = "[^/]+";
  if (host.startsWith("*."))
    hostPart = "(?:[^.]+\\.)" + escapeRegex(host.slice(2));

  const pathPart = escapeRegex(path).replace(/\\\*/g, ".*");

  const re = new RegExp(`^${schemePart}:\/\/${hostPart}\/${pathPart}$`);
  return re;
}

export function doesRuleMatchUrl(rule, url) {
  if (!rule || rule.enabled === false) return false;
  if (!isHttpUrl(url)) return false;
  try {
    if (rule.type === "domain") {
      return getHost(url) === rule.value;
    }
    if (rule.type === "pattern") {
      const re = patternToRegex(rule.value);
      return !!re && re.test(url);
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function ruleSpecificity(rule) {
  if (rule.type === "domain")
    return 1000 + (rule.value ? rule.value.length : 0);
  if (rule.type === "pattern")
    return 2000 + (rule.value ? rule.value.length : 0);
  return 0;
}

export function pickBestRule(rules, url) {
  const matches = (Array.isArray(rules) ? rules : []).filter((r) =>
    doesRuleMatchUrl(r, url)
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a));
  return matches[0];
}

