function analyzePage() {
  // Reset identifiers before new scan
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

  // Detect unsafe JS usage on inputs (simplified example)
  // For demo: look for any inline script that accesses input.value directly
  // (You can improve this detection logic)
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

    // Listen for messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startScan") {
      analyzePage();
      sendResponse({ started: true });
      return true; // keep channel open
    }
    if (message.action === "getContentThreats") {
      sendResponse({ threats: lastThreats, protocol: lastProtocol });
    }
    return true;
  });
}

// Listen for popup queries requesting threats
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getContentThreats") {
    sendResponse({ threats: lastThreats, protocol: lastProtocol });
  }
  // Indicate response is sent synchronously
  return true;
});

// Run analysis on DOM ready
if (document.readyState === "complete" || document.readyState === "interactive") {
  analyzePage();
} else {
  window.addEventListener("DOMContentLoaded", analyzePage);
}
