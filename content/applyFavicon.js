(() => {
  const rels = [
    "icon",
    "shortcut icon",
    "apple-touch-icon",
    "apple-touch-icon-precomposed",
  ];

  let currentFaviconUrl = null;
  let lastApplied = "";
  let observer = null;
  let suppressObserver = false;
  let pendingReapply = null;
  let historyPatched = false;

  function toAbsoluteUrl(url) {
    try {
      if (url.startsWith("data:")) return url;
      return new URL(url, location.href).href;
    } catch (_) {
      return url;
    }
  }

  function areIconsCorrect(url) {
    if (!url) return false;
    const expected = toAbsoluteUrl(url);
    const links = Array.from(document.querySelectorAll('link[rel*="icon"]'));
    return links.some((l) => (l.href || "") === expected);
  }

  function removeOurIconsOnly() {
    document
      .querySelectorAll('link[rel*="icon"][data-favicon-switcher="1"]')
      .forEach((n) => n.remove());
  }

  function removeExistingIcons() {
    document.querySelectorAll('link[rel*="icon"]').forEach((n) => n.remove());
  }

  function addIconLinks(url) {
    const abs = toAbsoluteUrl(url);
    rels.forEach((rel) => {
      const link = document.createElement("link");
      link.rel = rel;
      link.href = abs;
      link.dataset.faviconSwitcher = "1";
      document.head.appendChild(link);
    });
  }

  function safeApply(url) {
    if (!document.head) return;
    suppressObserver = true;
    try {
      removeExistingIcons();
      addIconLinks(url);
      lastApplied = location.href;
    } finally {
      suppressObserver = false;
    }
  }

  function apply(url) {
    if (!url || typeof url !== "string") return;
    currentFaviconUrl = url;
    if (areIconsCorrect(url)) return;
    safeApply(url);
  }

  function clear() {
    suppressObserver = true;
    try {
      removeOurIconsOnly();
      currentFaviconUrl = null;
    } finally {
      suppressObserver = false;
    }
  }

  function scheduleReapply() {
    if (!currentFaviconUrl) return;
    if (pendingReapply) return;
    pendingReapply = setTimeout(() => {
      pendingReapply = null;
      if (!areIconsCorrect(currentFaviconUrl)) {
        safeApply(currentFaviconUrl);
      }
    }, 100);
  }

  function onDomMutated(mutations) {
    if (suppressObserver) return;
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.tagName === "LINK") {
            const rel = (node.getAttribute("rel") || "").toLowerCase();
            if (rel.includes("icon")) {
              scheduleReapply();
              return;
            }
          }
        }
      }
    }
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(onDomMutated);
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  }

  function patchHistory() {
    if (historyPatched) return;
    historyPatched = true;
    const applyIfUrlChanged = () => {
      if (currentFaviconUrl && lastApplied !== location.href) {
        apply(currentFaviconUrl);
      }
    };
    const _push = history.pushState;
    history.pushState = function (...args) {
      const ret = _push.apply(this, args);
      applyIfUrlChanged();
      return ret;
    };
    const _replace = history.replaceState;
    history.replaceState = function (...args) {
      const ret = _replace.apply(this, args);
      applyIfUrlChanged();
      return ret;
    };
    window.addEventListener("popstate", applyIfUrlChanged);
  }

  window.__faviconSwitcherApply = function (url) {
    try {
      ensureObserver();
      patchHistory();
      apply(url);
    } catch (e) {
      // ignore
    }
  };

  window.__faviconSwitcherClear = function () {
    try {
      ensureObserver();
      clear();
    } catch (e) {}
  };
})();
