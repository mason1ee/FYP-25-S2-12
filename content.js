// Global scan result storage
if (typeof lastThreats === "undefined") {
  var lastThreats = [];
}

if (typeof lastProtocol === "undefined") {
  var lastProtocol = "";
}

// Trusted CDN list
var trustedCDNs = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "ajax.googleapis.com",
  "code.jquery.com",
  "stackpath.bootstrapcdn.com",
  "unpkg.com",
  "cdn.skypack.dev",
  "ajax.aspnetcdn.com",
];

// For pop out window scan
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScanInTab') {
    console.log('[Content Script] startScanInTab received');

    // Make sure the scan function exists in this context
    if (typeof startScan === 'function') {
      updateUIBasedOnActiveTab?.(); // Optional chaining in case not defined
      startScan();
      sendResponse({ success: true });
    } else {
      console.warn('startScan is not defined in content script');
      sendResponse({ success: false, error: 'startScan not found' });
    }
  }
});

function isSuspiciousDomain(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    return !trustedCDNs.some(cdn => hostname === cdn || hostname.endsWith("." + cdn));
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

// Helper: Common CSRF token name patterns
var csrfTokenPattern = /csrf|token|authenticity|xsrf/i;

// Main scanner
function analyzePage() {
  lastThreats = [];
  lastProtocol = window.location.protocol;
  var scripts = Array.from(document.scripts);
  var forms = Array.from(document.forms);
  let threats = [];
  let pendingFetches = 0;
  let completedFetches = 0;

  // Insecure form detection & CSRF token presence in forms
  forms.forEach((form, i) => {
    var action = form.getAttribute("action") || "";
    if (action && !action.startsWith("https://")) {
      threats.push(`Form ${i+1} sends data insecurely over HTTP`);
    }

    var hiddenInputs = Array.from(form.querySelectorAll('input[type="hidden"]'));
    var hasCSRFToken = hiddenInputs.some(input =>
      csrfTokenPattern.test(input.name) || csrfTokenPattern.test(input.id)
    );
    if (!hasCSRFToken) {
      threats.push(`Form ${i+1} does not contain a hidden CSRF token`);
    }
  });

  // Patterns that indicate potentially unsafe usage of user input (e.g., from .value)
const dangerousPatterns = [
  {
    regex: /\.value\s*[\+\=]/,
    message: "Input `.value` is being concatenated or assigned to a variable (XSS risk if inserted into the DOM)."
  },
  {
    regex: /innerHTML\s*=\s*.*\.value/,
    message: "Assigning `.value` directly to `innerHTML` can allow attackers to inject malicious HTML or JavaScript (XSS)."
  },
  {
    regex: /eval\s*\(.*\.value.*\)/,
    message: "`eval()` is being used with `.value` — this enables attackers to execute arbitrary JavaScript code, critical security risk."
  },
  {
    regex: /document\.write\s*\(.*\.value.*\)/,
    message: "`document.write()` with user input can overwrite the page or insert harmful scripts (XSS risk)."
  }
];

var unsafeJSUsage = (code, label) => {
  if (!/\.value/.test(code)) return;

  dangerousPatterns.forEach(({ regex, message }) => {
    if (regex.test(code)) {
      threats.push(`Unsafe JavaScript detected in ${label}: ${message}`);
    }
  });
};

  var processCode = (code, label) => {
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

    chrome.runtime.sendMessage({
      type: "page-analysis-result",
      protocol: lastProtocol,
      threats
    });
  };

  // CSRF Monitoring
  let csrfIssuesFound = false;
  const csrfHeaderPattern = /^x[-_]csrf[-_]token$/i;

  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init = {}) {
    const method = (init.method || "GET").toUpperCase();

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      let hasCSRF = false;

      if (init.headers) {
        const headers = new Headers(init.headers);
        for (const [key] of headers.entries()) {
          if (csrfHeaderPattern.test(key)) {
            hasCSRF = true;
            break;
          }
        }
      }

      if (!hasCSRF) {
        const url = typeof input === "string" ? input : input.url;
        const urlObj = new URL(url, window.location.origin);
        for (const [key] of urlObj.searchParams.entries()) {
          if (csrfTokenPattern.test(key)) {
            hasCSRF = true;
            break;
          }
        }
      }

      if (!hasCSRF) {
        csrfIssuesFound = true;
        threats.push(`Fetch request to ${typeof input === "string" ? input : input.url} lacks CSRF token in headers or parameters`);
      }
    }

    return originalFetch.apply(this, arguments);
  };

  // Override XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method ? method.toUpperCase() : "GET";
    this._url = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(this._method)) {
      let hasCSRF = false;
      const originalSetRequestHeader = this.setRequestHeader;
      const headers = {};
      this.setRequestHeader = function(name, value) {
        headers[name.toLowerCase()] = value;
        originalSetRequestHeader.call(this, name, value);
      };

      setTimeout(() => {
        for (const headerName in headers) {
          if (csrfHeaderPattern.test(headerName)) {
            hasCSRF = true;
            break;
          }
        }

        if (!hasCSRF && body) {
          if (typeof body === "string") {
            if (body.includes("=")) {
              const params = new URLSearchParams(body);
              for (const key of params.keys()) {
                if (csrfTokenPattern.test(key)) {
                  hasCSRF = true;
                  break;
                }
              }
            } else if (body.startsWith("{")) {
              try {
                const obj = JSON.parse(body);
                for (const key in obj) {
                  if (csrfTokenPattern.test(key)) {
                    hasCSRF = true;
                    break;
                  }
                }
              } catch {}
            }
          }
        }

        if (!hasCSRF) {
          csrfIssuesFound = true;
          threats.push(`XHR request to ${this._url} lacks CSRF token in headers or body`);
        }
      }, 0);
    }

    return originalXhrSend.apply(this, arguments);
  };

  // Script analysis
  scripts.forEach((script, index) => {
    const isInline = !script.src;
    const label = isInline ? `inline-${index+1}` : `external-${index+1}`;

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
            //Check against trusted CDNs
            if (isSuspiciousDomain(src)) {
              threats.push(`[${label}] Suspicious JavaScript source detected: ${src}`);
            } else {
              threats.push({ scriptIndex: label, url: src });
            }
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