// Store last scan results globally
let lastThreats = [];
let lastProtocol = "";

// JavaScript scan for scripts (used for basic inline detection and messaging)
(() => {
  const scripts = document.querySelectorAll('script');
  const results = [];

  scripts.forEach((script, index) => {
    const src = script.src || 'inline';
    const usesEval = /eval\(/i.test(script.innerText);
    const isInline = !script.src;
    const suspicious = usesEval || isInline;

    results.push({
      index,
      src,
      usesEval,
      isInline,
      suspicious
    });
  });

  window.postMessage({ type: "SCRIPT_ANALYSIS", data: results }, "*");
})();

// Main page analysis logic
function analyzePage() {
  lastThreats = [];
  lastProtocol = "";

  const protocol = window.location.protocol;
  lastProtocol = protocol;
  const scripts = Array.from(document.scripts);
  let threats = [];

  let pendingFetches = 0;
  let completedFetches = 0;

  // Check for insecure forms
  const forms = Array.from(document.forms);
  forms.forEach((form, index) => {
    const action = form.getAttribute("action") || "";
    if (action && !action.startsWith("https://")) {
      threats.push(`Form ${index} sends data insecurely over HTTP`);
    }
  });

  function unsafeJSUsage(code, label) {
    if (/\.value/.test(code)) {
      threats.push(`Unsafe JavaScript usage of inputs in ${label}`);
    }
  }

  function processCode(code, label) {
    try {
      acorn.parse(code, { ecmaVersion: 2020 });
      unsafeJSUsage(code, label);
    } catch (e) {
      threats.push({
        scriptIndex: label,
        error: `Parse error: ${e.message}`,
      });
    }
  }

  function sendIfDone() {
    completedFetches++;
    if (completedFetches === pendingFetches) {
      finishAnalysis();
    }
  }

  function finishAnalysis() {
    lastThreats = threats;
    chrome.runtime.sendMessage({
      type: "page-analysis-result",
      protocol: lastProtocol,
      threats,
    });
  }

  scripts.forEach((script, index) => {
    const isInline = !script.src;
    const label = isInline ? `inline-${index}` : `external-${index}`;

    if (isInline) {
      const code = script.textContent;
      processCode(code, label);
      threats.push({
        scriptIndex: label,
        url: "inline"
      });
    } else {
      const src = script.src;
      pendingFetches++;

      fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
          return res.text();
        })
        .then((code) => {
          if (code.length > 100 * 1024) {
            threats.push({
              scriptIndex: label,
              error: `Skipped large script >100KB: ${src}`,
            });
          } else {
            processCode(code, label);
            threats.push({
              scriptIndex: label,
              url: src
            });
          }
          sendIfDone();
        })
        .catch((err) => {
          threats.push({
            scriptIndex: label,
            error: `Fetch error: ${err.message}`,
          });
          sendIfDone();
        });
    }
  });

  if (pendingFetches === 0) {
    finishAnalysis();
  }
}

// Message handling for popup and background scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScan") {
    analyzePage();
    sendResponse({ started: true });
    return true; // Keep channel open for async
  }
  if (message.action === "getContentThreats") {
    sendResponse({ threats: lastThreats, protocol: lastProtocol });
    return true;
  }
});
