// Global scan result storage
let lastThreats = [];
let lastProtocol = "";
let whitelist = [];
let blacklist = [];

// Trusted CDN list
const trustedCDNs = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "ajax.googleapis.com",
  "code.jquery.com",
  "stackpath.bootstrapcdn.com"
];

function isSuspiciousDomain(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    return !trustedCDNs.some(cdn => hostname.includes(cdn));
  } catch (e) {
    return true; // malformed URL
  }
}

// Quick passive script inspection (for inline/eval detection)
(() => {
  const scripts = document.querySelectorAll("script");
  const results = [];

  scripts.forEach((script, index) => {
    const usesEval = /eval\(/i.test(script.innerText);
    results.push({
      index,
      src: script.src || "inline",
      usesEval,
      isInline: !script.src,
      suspicious: usesEval || !script.src
    });
  });

  window.postMessage({ type: "SCRIPT_ANALYSIS", data: results }, "*");
})();

// Main scanner
function analyzePage() {
  lastThreats = [];
  lastProtocol = window.location.protocol;
  const scripts = Array.from(document.scripts);
  const forms = Array.from(document.forms);
  let threats = [];
  let pendingFetches = 0;
  let completedFetches = 0;

  // Insecure form detection
  forms.forEach((form, i) => {
    const action = form.getAttribute("action") || "";
    if (action && !action.startsWith("https://")) {
      threats.push(`Form ${i} sends data insecurely over HTTP`);
    }
  });

  // Parse JS, detect unsafe input usage
  const unsafeJSUsage = (code, label) => {
    if (/\.value/.test(code)) {
      threats.push(`Unsafe JavaScript usage of inputs in ${label}`);
    }
  };

  const processCode = (code, label) => {
    try {
      acorn.parse(code, { ecmaVersion: 2020 });
      unsafeJSUsage(code, label);
    } catch (e) {
      threats.push({ scriptIndex: label, error: `Parse error: ${e.message}` });
    }
  };

  const sendIfDone = () => {
    if (++completedFetches === pendingFetches) finishAnalysis();
  };

  const finishAnalysis = () => {
    lastThreats = threats;
    const site = window.location.hostname;
    const classification = classifySite(threats);

    if (classification === "whitelist") whitelist.push(site);
    else if (classification === "blacklist") blacklist.push(site);

    chrome.storage.local.get(["whitelist", "blacklist"], (data) => {
      const wl = new Set(data.whitelist || []);
      const bl = new Set(data.blacklist || []);

      if (classification === "whitelist") {
        wl.add(site);
        bl.delete(site);
      } else {
        bl.add(site);
        wl.delete(site);
      }

      chrome.storage.local.set({
        whitelist: Array.from(wl),
        blacklist: Array.from(bl)
      });
    });

    chrome.runtime.sendMessage({
      type: "page-analysis-result",
      protocol: lastProtocol,
      threats
    });
  };

  // Script analysis
  scripts.forEach((script, index) => {
    const isInline = !script.src;
    const label = isInline ? `inline-${index}` : `external-${index}`;

    if (isInline) {
      processCode(script.textContent, label);
      threats.push({ scriptIndex: label, url: "inline" });
    } else {
      const src = script.src;
      pendingFetches++;

      fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
          return res.text();
        })
        .then((code) => {
          if (code.length > 102400) {
            threats.push({
              scriptIndex: label,
              error: `Skipped large script >100KB: ${src}`
            });
          } else {
            processCode(code, label);
            if (isSuspiciousDomain(src)) {
              threats.push(`Suspicious JavaScript source detected: ${src}`);
            }
            threats.push({ scriptIndex: label, url: src });
          }
          sendIfDone();
        })
        .catch((err) => {
          threats.push({
            scriptIndex: label,
            error: `Fetch error: ${err.message}`
          });
          sendIfDone();
        });
    }
  });

  if (pendingFetches === 0) finishAnalysis();
}

// Site classification logic
function classifySite(threats) {
  const threatCount = threats.length;

  const hasCriticalThreat = threats.some((t) =>
    typeof t === "object" &&
    (t.error?.includes("eval") || (typeof t === "string" && t.includes("HTTP")))
  );

  const isInsecure = window.location.protocol !== "https:";

  return (isInsecure || hasCriticalThreat || threatCount > 20)
    ? "blacklist"
    : "whitelist";
}

// Listen for scan-related messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScan") {
    analyzePage();
    sendResponse({ started: true });
    return true;
  }

  if (message.action === "getContentThreats") {
    sendResponse({ threats: lastThreats, protocol: lastProtocol });
    return true;
  }
});
