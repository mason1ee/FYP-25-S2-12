const popoutButton = document.getElementById("popout-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");

const scanButton = document.getElementById("scan-button");
const progressBar = document.getElementById("progress-bar");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
const detailedResults = document.getElementById("detailed-results");
const downloadBtn = document.getElementById("download-log");
const vulnCountText = document.getElementById("vuln-count");
const scanContainer = document.getElementById("scan-container");
const classificationBtn = document.getElementById("classification-buttons");
const whitelistBtn = document.getElementById("whitelist-btn");
const blacklistBtn = document.getElementById("blacklist-btn");

const scanTabBtn = document.getElementById("scan-tab-btn");
const settingsTabBtn = document.getElementById("settings-tab-btn");
const scanTab = document.getElementById("scan-tab");
const settingsTab = document.getElementById("settings-tab");

const sitesTabBtn = document.getElementById("sites-tab-btn");
const sitesSection = document.getElementById("sites-section");
const whitelistTabBtn = document.getElementById("whitelist-tab-btn");
const blacklistTabBtn = document.getElementById("blacklist-tab-btn");
const whitelistTab = document.getElementById("whitelist-tab");
const blacklistTab = document.getElementById("blacklist-tab");

const jsSettingsToggle = document.getElementById("toggle-js-blocker");
const blockerStatusText = document.getElementById("blocker-status-text");

scanContainer.style.display = "none";

if (popoutButton && chrome.windows) {
  chrome.windows.getCurrent((win) => {
    if (win.type === "popup") {
      popoutButton.style.display = "none";
    }
  });
}

// Tab navigation
scanTabBtn.addEventListener("click", () => {
  scanTab.style.display = "block";
  settingsTab.style.display = "none";
  sitesSection.style.display = "none";
  scanTabBtn.classList.add("active");
  settingsTabBtn.classList.remove("active");
  sitesTabBtn.classList.remove("active");
});

settingsTabBtn.addEventListener("click", () => {
  scanTab.style.display = "none";
  settingsTab.style.display = "block";
  sitesSection.style.display = "none";
  settingsTabBtn.classList.add("active");
  scanTabBtn.classList.remove("active");
  sitesTabBtn.classList.remove("active");
});

sitesTabBtn.addEventListener("click", () => {
  scanTab.style.display = "none";
  settingsTab.style.display = "none";
  sitesSection.style.display = "block";
  scanTabBtn.classList.remove("active");
  settingsTabBtn.classList.remove("active");
  sitesTabBtn.classList.add("active");
});

/* Website list Tab Navigation */
whitelistTabBtn.addEventListener("click", () => {
  whitelistTab.style.display = "block";
  blacklistTab.style.display = "none";
  whitelistTabBtn.classList.add("active");
  blacklistTabBtn.classList.remove("active");
});

blacklistTabBtn.addEventListener("click", () => {
  whitelistTab.style.display = "none";
  blacklistTab.style.display = "block";
  whitelistTabBtn.classList.remove("active");
  blacklistTabBtn.classList.add("active");
});

// Handle popout
if (popoutButton) {
  popoutButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.storage.local.set({ activeScanTabId: tabs[0].id }, () => {
          chrome.windows.create({
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: 400,
            height: 600
          }, () =>{
            window.close();
          });
        });
      }
    });
  });
}

// Hide popout button if we're already in a popout window
chrome.windows.getCurrent({ populate: false }, (window) => {
  if (window && window.type === "popup") {
    // Small popups opened by the extension will have height less than typical popouts
    if (window.height > 600 || window.width > 400) {
      const popoutBtn = document.getElementById("popout-btn");
      if (popoutBtn) popoutBtn.style.display = "none";
    }
  }
});


function resetScanButton() {
  isScanning = false;
  scanButton.disabled = false;
  scanButton.innerHTML = "Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";
}

// On popup open, mirror the stored state
chrome.storage.local.get("blocked", ({ blocked }) => {
  jsSettingsToggle.checked = Boolean(blocked);
  blockerStatusText.innerText = blocked ? "ACTIVE" : "INACTIVE";
  blockerStatusText.classList.toggle('active', blocked);
  blockerStatusText.classList.toggle('inactive', !blocked);
});

// Sync dark mode setting from storage
chrome.storage.local.get("darkMode", ({ darkMode }) => {
  document.body.classList.toggle("dark-mode", darkMode);
  darkModeToggle.checked = Boolean(darkMode);
});

// Toggle dark mode
darkModeToggle.addEventListener("change", () => {
  const enabled = darkModeToggle.checked;
  document.body.classList.toggle("dark-mode", enabled);
  chrome.storage.local.set({ darkMode: enabled });
});


// Tell background to set JS-Blocker on/off
jsSettingsToggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({ setBlocked: jsSettingsToggle.checked }, ({ blocked }) => {
    blockerStatusText.innerText = blocked ? "ACTIVE" : "INACTIVE";
    blockerStatusText.classList.toggle('active', blocked);
    blockerStatusText.classList.toggle('inactive', !blocked);

    // Prompt user to refresh
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
        chrome.scripting.executeScript({
        target: { tabId },
        func: (state) => {
          alert(
            `JS Blocker is now ${state ? "ACTIVE" : "INACTIVE"}.\n` +
            `Please manually refresh the page to apply changes.`
          );
        },
        args: [blocked]
      });
    });
  });
});

scanButton.addEventListener("click", startScan);

let interval = null;
let onScanResult = null;
let isScanning = false;

function getTabIdForScanning(callback) {
  chrome.storage.local.get("activeScanTabId", (data) => {
    const savedTabId = data.activeScanTabId;

    if (savedTabId) {
      chrome.tabs.get(savedTabId, (tab) => {
        const isValid =
          tab &&
          tab.active &&
          tab.url &&
          !tab.url.startsWith("chrome-extension://") &&
          !tab.url.startsWith("chrome://") &&
          !tab.url.startsWith("edge://") &&
          !tab.url.startsWith("devtools://");

        if (!isValid) {
          console.warn("Saved tab is invalid or restricted:", tab?.url);
          chrome.storage.local.remove("activeScanTabId");
          fallbackToActiveTab(callback);
        } else {
          callback(savedTabId);
          setTimeout(() => chrome.storage.local.remove("activeScanTabId"), 1000);
        }
      });
    } else {
      fallbackToActiveTab(callback);
    }
  });
}

function fallbackToActiveTab(callback) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
      console.error("No valid active tab found.");
      callback(null);
    } else {
      const tab = tabs[0];
      const isValid =
        tab.url &&
        !tab.url.startsWith("chrome-extension://") &&
        !tab.url.startsWith("chrome://") &&
        !tab.url.startsWith("edge://") &&
        !tab.url.startsWith("devtools://");

      if (!isValid) {
        console.warn("Active tab is restricted or invalid:", tab.url);
        callback(null);
      } else {
        callback(tab.id);
      }
    }
  });
}

function startScan() {
  if (isScanning) return;
  isScanning = true;

  scanContainer.style.display = "block";
  scanButton.disabled = true;
  scanButton.innerHTML = `<span class="spinner"></span> Scanning...`;
  scanButton.style.opacity = 0.7;
  scanButton.style.cursor = "not-allowed";

  progressBar.style.width = "0%";
  resultText.textContent = "";
  detailedResults.innerHTML = "";
  vulnCountText.textContent = "";  // Clear vuln count on new scan
  statusText.textContent = "Scanning in Progress...";  // Show scanning status

  if (interval) clearInterval(interval);
  if (onScanResult) chrome.runtime.onMessage.removeListener(onScanResult);

  const scanDuration = 3000;
  const updateInterval = 100;
  let timeElapsed = 0;
  let progress = 0;
  const progressStep = (100 * updateInterval) / scanDuration;

  interval = setInterval(() => {
    timeElapsed += updateInterval;
    progress = Math.min(progress + progressStep, 100);
    progressBar.style.width = `${progress}%`;
    if (progress >= 100) clearInterval(interval);
  }, updateInterval);

  getTabIdForScanning((tabId) => {
    if (!tabId) {
      clearInterval(interval);
      resultText.textContent = "No valid tab ID found for scanning.";
      statusText.textContent = "";
      console.error("No valid tab ID found.");
      resetScanButton();
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (
        chrome.runtime.lastError ||
        !tab ||
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("devtools://")
      ) {
        clearInterval(interval);
        resultText.textContent = "Cannot scan this page. Restricted or unsupported URL.";
        statusText.textContent = "";
        resetScanButton();
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ["acorn.min.js", "content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          clearInterval(interval);
          resultText.textContent = "Failed to inject content script. This page may block script injection.";
          statusText.textContent = "";
          resetScanButton();
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
          if (chrome.runtime.lastError || !response?.started) {
            clearInterval(interval);
            resultText.textContent = "Content script not available on this page.";
            statusText.textContent = "";
            resetScanButton();
            return;
          }

          onScanResult = function (message, sender) {
            if (message.type === "page-analysis-result") {
              clearInterval(interval);
              progressBar.style.width = `100%`;
              statusText.textContent = "Scan Completed!";  // Show completed status

              const contentThreats = message.threats || [];
              const protocol = message.protocol || "";

              chrome.runtime.sendMessage({ action: "getSecurityHeaders" }, (res) => {
                const headers = res?.headers || {};
                const headerThreats = [];

                if (!headers["content-security-policy"])
                  headerThreats.push("Missing Content-Security-Policy");
                if (!headers["x-content-type-options"])
                  headerThreats.push("Missing X-Content-Type-Options");
                if (!headers["x-frame-options"])
                  headerThreats.push("Missing X-Frame-Options");
                if (!headers["strict-transport-security"])
                  headerThreats.push("Missing Strict-Transport-Security");

                if (protocol !== "https:") {
                  headerThreats.push("Page is not served over HTTPS");
                }

                const allThreats = [...contentThreats, ...headerThreats];

                if (allThreats.length > 0) {
                  resultText.textContent = "Website is insecure!";
                  resultText.style.color = "red";
                  detailedResults.innerHTML = "";
                  allThreats.forEach(threat => {
                    const li = document.createElement("li");
                    li.textContent = typeof threat === "string" ? threat : JSON.stringify(threat);
                    detailedResults.appendChild(li);
                  });
                  vulnCountText.textContent = `${allThreats.length} vulnerabilities detected.`;
                } else {
                  resultText.textContent = "Website appears secure.";
                  resultText.style.color = "green";
                  detailedResults.innerHTML = "";
                  vulnCountText.textContent = "";
                }

                chrome.tabs.sendMessage(tabId, { action: "getContentThreats" }, (res) => {
                  const threats = res?.threats || [];

                  const inlineCount = threats.filter(t =>
                    typeof t === "string" && t.includes("inline-")
                  ).length;

                  const externalScripts = threats.filter(t =>
                    typeof t === "object" && t.scriptIndex?.includes("external-")
                  );

                  const externalCount = externalScripts.length;

                  const scriptSummary = document.createElement("table");
                  scriptSummary.style.marginTop = "1em";
                  scriptSummary.style.borderCollapse = "collapse";
                  scriptSummary.style.width = "100%";

                  const headerRow = scriptSummary.insertRow();
                  ["Inline", "External"].forEach((type) => {
                    const th = document.createElement("th");
                    th.textContent = type;
                    th.style.padding = "8px";
                    th.style.textAlign = "center";
                    th.style.backgroundColor = "#f0f0f0";
                    headerRow.appendChild(th);
                  });

                  const row = scriptSummary.insertRow();
                  const inlineCell = row.insertCell();
                  const externalCell = row.insertCell();

                  inlineCell.textContent = inlineCount;
                  externalCell.textContent = externalCount;

                  inlineCell.style.backgroundColor = "#ffcccc"; // red-ish for inline
                  inlineCell.style.textAlign = "center";
                  inlineCell.style.padding = "6px";

                  externalCell.style.backgroundColor = "#ccffcc"; // green-ish for external
                  externalCell.style.textAlign = "center";
                  externalCell.style.padding = "6px";

                  detailedResults.parentElement.appendChild(scriptSummary);

                  if (externalCount > 0) {
                    const showExternalBtn = document.createElement("button");
                    showExternalBtn.textContent = "View External URLs";
                    showExternalBtn.style.marginTop = "10px";
                    showExternalBtn.addEventListener("click", () => {
                      const urls = externalScripts.map(s => s.url || s.scriptIndex || "unknown");
                      alert("External Script URLs:\n" + urls.join("\n"));
                    });
                    detailedResults.parentElement.appendChild(showExternalBtn);
                  }
                });
                // Show the download button
              downloadBtn.style.display = "inline-block";

              downloadBtn.onclick = () => {
                chrome.storage.local.get("blocked", ({ blocked }) => {
                  const timestamp     = new Date().toISOString();
                  // Count inline vs external entries
                  const inlineCount   = contentThreats.filter(
                    th => typeof th === 'object' && th.scriptIndex?.startsWith('inline-')
                  ).length;
                  const externalCount = contentThreats.filter(
                    th => typeof th === 'object' && th.scriptIndex?.startsWith('external-')
                  ).length;

                  // Build the log with a top‐line summary
                  let log =
                    '=== Generated by Webbed | Client-Side Script Security Inspector ===\n'+
                    '--- FYP-25-S2-12 ---\n\n\n' + 
                    `Scan Timestamp: ${timestamp}\n` +
                    `JS Blocker Active: ${blocked}\n` +
                    `Protocol: ${protocol}\n\n` +
                    `Script Summary: ${inlineCount} inline, ${externalCount} external scripts found\n\n` +
                    `Threats:\n`;

                  // Append each threat, human-readably
                  contentThreats.forEach(th => {
                    let line;
                    if (typeof th === 'string') {
                      line = th;
                    } else {
                      const idx = th.scriptIndex || 'unknown';
                      const url = th.url         || 'n/a';
                      const err = th.error       ? ' - ' + th.error : '';
                      line = `[${idx}] ${url}${err}`;
                    }
                    log += '- ' + line + '\n';
                  });
                  
                  // Trigger a plain-ASCII UTF-8 download
                  const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href     = url;
                  a.download = `[Webbed]scan-log-${timestamp}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                });
              };

              //show whitelist/blacklist button
              classificationBtn.style.display = "inline-block";
              
                resetScanButton();
                chrome.runtime.onMessage.removeListener(onScanResult);
                onScanResult = null;
              });
            }
          };

          chrome.runtime.onMessage.addListener(onScanResult);
        });
      });
    });
  });
}

window.addEventListener("unload", () => {
  chrome.storage.local.remove("activeScanTabId", () => {
    console.log("Cleaned up activeScanTabId on unload.");
  });
});