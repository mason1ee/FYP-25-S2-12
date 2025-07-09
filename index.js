import { getActiveHttpTab } from "./background.js";
const popoutButton = document.getElementById("popout-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
const downloadBtn = document.getElementById("download-log");
const vulnCountText = document.getElementById("vuln-count");
const scanContainer = document.getElementById("scan-container");
const classificationBtn = document.getElementById("classification-buttons");
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
const blockerStatusText = document.getElementById("blocker-status-text");
scanContainer.style.display = "none";

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  placeCreditsBanner();
  updateUIBasedOnActiveTab();
  updateCurrentDomain();
  initializeExtension();
  setInterval(updateCurrentDomain, 10);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
      startScan();
    } else {
      console.log('Skipping startScan: not a real website:', tab.url);
    }
  });

  chrome.storage.local.get('activeScanTabId', ({ activeScanTabId }) => {
    if (!activeScanTabId) {
      console.log('Pop-out: No activeScanTabId stored');
      return;
    }

    chrome.tabs.get(activeScanTabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.url) {
        console.warn('Pop-out: Failed to retrieve tab for scanning');
        return;
      }

      const isValid = tab.url.startsWith('http://') || tab.url.startsWith('https://');
      if (isValid) {
        console.log('Pop-out: Starting scan directly in pop-out for tab', tab.id);
        updateUIBasedOnActiveTab?.(); // if defined
        startScan();
      } else {
        console.warn('Pop-out: Tab URL is not valid for scanning:', tab.url);
      }
    });

  });

  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'scan';
  activateTab(tab);
});

// Hide popout button if already in a popout window
if (popoutButton && chrome.windows) {
  chrome.windows.getCurrent((win) => {
    win.type === "popup" ? popoutButton.style.display = "none" : popoutButton.style.display = "inline-block";
  });
}

// Handle popout
if (popoutButton) {
  popoutButton.addEventListener("click", async () => {
    try {
      // Step 1: Determine which extension tab is active
      const activeTabBtn = document.querySelector('.tab-nav .nav-tab.active');
      let tab = 'scan'; // default

      if (activeTabBtn) {
        const id = activeTabBtn.id;
        if (id.includes('settings')) tab = 'settings';
        else if (id.includes('sites')) tab = 'sites';
      }

      // Step 2: Try to get the active HTTP tab (non-critical)
      try {
        let activeTab = await getActiveHttpTab();

        if (!activeTab) {
          const windows = await new Promise((resolve, reject) => {
            chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (wins) => {
              if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
              resolve(wins);
            });
          });

          for (const win of windows) {
            activeTab = win.tabs.find(tab => tab.active && tab.url?.startsWith("http"));
            if (activeTab) break;
          }
        }

        // If found, store it
        if (activeTab) {
          await new Promise((resolve) =>
            chrome.storage.local.set({ activeScanTabId: activeTab.id }, resolve)
          );
        }

      } catch (tabErr) {
        console.warn("No active HTTP tab found. Skipping tab ID storage.");
      }

      // Step 3: Open the popup window regardless
      chrome.windows.create(
        {
          url: chrome.runtime.getURL(`index.html?tab=${tab}`),
          type: "popup",
          width: 350,
          height: 550
        },
        () => {
          window.close(); // Close original popup
        }
      );

    } catch (err) {
      console.error("Error during popout process:", err);
    }
  });
}

// function initializeExtension() {
//   let lastTabId = null;
//   let lastUrl = null;

//   function updateStateAndMaybeScan(tab) {
//     if (!tab || !tab.url) {
//       console.log("No tab or URL yet:", tab);
//       return;
//     }

//     const url = tab.url;
//     const isValidUrl = url.startsWith("http://") || url.startsWith("https://");

//     const tabChanged = tab.id !== lastTabId;
//     const urlChanged = url !== lastUrl;

//     console.log({
//       tabId: tab.id,
//       lastTabId,
//       url,
//       lastUrl,
//       tabChanged,
//       urlChanged,
//       isValidUrl,
//     });

//     lastTabId = tab.id;
//     if (isValidUrl) lastUrl = url;

//     if (!isValidUrl) {
//       console.log("⛔ Not a real website, skipping scan:", url);
//       return;
//     }

//     if (tabChanged || urlChanged) {
//       console.log("🟢 Running startScan on tab:", tab.id, "URL:", url);
//       updateUIBasedOnActiveTab();
//       startScan();
//     } else {
//       console.log("🟡 Skipping startScan, no tab or URL change");
//     }
//   }

//   chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
//     chrome.tabs.get(tabId, (tab) => {
//       updateStateAndMaybeScan(tab);
//     });
//   });

//   chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === "complete" && tab.active) {
//       updateStateAndMaybeScan(tab);
//     }
//   });

//   chrome.windows.onFocusChanged.addListener((windowId) => {
//     if (windowId === chrome.windows.WINDOW_ID_NONE) return;
//     chrome.windows.get(windowId, { populate: true }, (window) => {
//       if (!window || !window.tabs) return;
//       const activeTab = window.tabs.find((t) => t.active);
//       updateStateAndMaybeScan(activeTab);
//     });
//   });

//   chrome.storage.onChanged.addListener((changes, areaName) => {
//     if (areaName === 'local' && (changes.blacklist || changes.jsBlockStates)) {
//       updateUIBasedOnActiveTab();
//     }
//   });
  
//   chrome.storage.local.get("darkMode", ({ darkMode }) => {
//     const isDarkMode = Boolean(darkMode);
//     const root = document.documentElement;
//     root.classList.toggle("dark-mode", isDarkMode);
//     darkModeToggle.checked = isDarkMode;
//     localStorage.setItem("darkMode", isDarkMode);
//   });
// }

function initializeExtension() {
  let lastTabId = null;
  let lastUrl = null;
  let debounceTimer = null;
  const DEBOUNCE_DELAY = 300; // ms

  function isValidUrl(url) {
    return url && (url.startsWith("http://") || url.startsWith("https://"));
  }

  function updateStateAndMaybeScan(tab) {
    if (!tab || !isValidUrl(tab.url)) {
      console.log("⛔ Invalid or missing tab:", tab);
      return;
    }

    const tabChanged = tab.id !== lastTabId;
    const urlChanged = tab.url !== lastUrl;

    console.log("Checking tab change:", {
      tabId: tab.id,
      lastTabId,
      url: tab.url,
      lastUrl,
      tabChanged,
      urlChanged
    });

    if (!tabChanged && !urlChanged) {
      console.log("🟡 Skipping: No tab or URL change");
      return;
    }

    // Debounce any multiple calls within 300ms
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastTabId = tab.id;
      lastUrl = tab.url;
      console.log("🟢 Debounced startScan for:", tab.url);
      updateUIBasedOnActiveTab();
      startScan();
    }, DEBOUNCE_DELAY);
  }

  // Helper to get current active tab
  function checkActiveTabAndScan() {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      updateStateAndMaybeScan(tabs[0]);
    });
  }

  chrome.tabs.onActivated.addListener(checkActiveTabAndScan);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.status === 'complete') {
      updateStateAndMaybeScan(tab);
    }
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    checkActiveTabAndScan();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.blacklist || changes.jsBlockStates)) {
      updateUIBasedOnActiveTab();
    }
  });

  // Initial scan
  checkActiveTabAndScan();

  // Dark mode setup
  chrome.storage.local.get("darkMode", ({ darkMode }) => {
    const isDarkMode = Boolean(darkMode);
    const root = document.documentElement;
    root.classList.toggle("dark-mode", isDarkMode);
    darkModeToggle.checked = isDarkMode;
    localStorage.setItem("darkMode", isDarkMode);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'requestStartScan') {
    const tabId = message.tabId;

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        console.warn('Background: Tab not found for scan:', tabId);
        sendResponse({ success: false, error: 'Tab not found' });
        return;
      }

      try {
        const urlObj = new URL(tab.url);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          sendResponse({ success: false, error: 'Invalid URL protocol' });
          return;
        }
      } catch {
        sendResponse({ success: false, error: 'Malformed URL' });
        return;
      }

      // Send message to content script inside the tab to run startScan
      chrome.tabs.sendMessage(tab.id, { action: 'startScanInTab' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Background: Error sending message to tab:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: 'Failed to communicate with tab' });
        } else {
          sendResponse({ success: true });
        }
      });
    });

    return true;
  }
});

function activateTab(tabName) {
  // Hide all sections
  document.querySelectorAll('.section, #scan-tab').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

  // Show selected tab
  switch (tabName) {
    case 'settings':
      document.getElementById('settings-tab').style.display = 'block';
      document.getElementById('settings-tab-btn').classList.add('active');
      break;
    case 'sites':
      document.getElementById('sites-section').style.display = 'block';
      document.getElementById('sites-tab-btn').classList.add('active');
      break;
    default:
      document.getElementById('scan-tab').style.display = 'block';
      document.getElementById('scan-tab-btn').classList.add('active');
  }
}

async function updateUIBasedOnActiveTab() {
  try {
    resetScanContainer();
    const activeTab = await getActiveHttpTab();

    if (!activeTab || !activeTab.url) {
      // Set status to "Not Applicable"
      blockerStatusText.classList.toggle("na", blockerStatusText.innerText = "Not Applicable");
      blockerStatusText.classList.remove("active", "inactive");
      
      if (classificationBtn) {
        classificationBtn.style.display = "none";
      }

      return;
    }
    
    const hostname = new URL(activeTab.url).hostname;
    //startScan();

    chrome.storage.local.get({ blacklist: [], jsBlockStates: {} }, (data) => {
      const { blacklist, jsBlockStates } = data;
      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);

      blockerStatusText.innerText = isBlocked ? "ACTIVE" : "INACTIVE";
      blockerStatusText.classList.toggle("active", isBlocked);
      blockerStatusText.classList.toggle("inactive", !isBlocked);
      blockerStatusText.classList.remove("na");

      if (classificationBtn) {
        classificationBtn.style.display = "inline-block";
      }
    });
  } catch (err) {
    console.error("Failed to get active tab: ", err);
  }
  
}

async function updateCurrentDomain() {
  try {
    const activeTab = await getActiveHttpTab();
    const domainText = document.getElementById("current-domain");
    if (activeTab && activeTab.url) {
      try {
        const hostname = new URL(activeTab.url).hostname;
        domainText.textContent = `${hostname}`;
      } catch (e) {
        domainText.textContent = "Invalid URL.";
      }
    } else {
      domainText.textContent = "No active website detected.";
    }
  } catch (err) {
    console.log("Failed to get active tab: ", err);
  }
}

document.getElementById("alert-close").addEventListener("click", () => {
  document.getElementById("custom-alert").classList.add("hidden");
});

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
  whitelistTab.style.display = "block";
  blacklistTab.style.display = "none";
  whitelistTabBtn.classList.add("active");
  blacklistTabBtn.classList.remove("active");
  sitesTabBtn.classList.add("active");
});

darkModeToggle.addEventListener("change", () => {
  const enabled = darkModeToggle.checked;
  const root = document.documentElement;

  // Enable transitions only *after* the user toggles
  root.classList.add("enable-transitions");
  root.classList.toggle("dark-mode", enabled);

  chrome.storage.local.set({ darkMode: enabled });
  localStorage.setItem("darkMode", enabled);

  applyDarkModeStylesToTable();
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

function getTabIdForScanning(callback) {
  chrome.storage.local.get("activeScanTabId", (data) => {
    const savedTabId = data.activeScanTabId;

    if (savedTabId) {
      chrome.tabs.get(savedTabId, (tab) => {
        if (isValidTab(tab)) {
          callback(savedTabId);
          setTimeout(() => chrome.storage.local.remove("activeScanTabId"), 1000);
        } else {
          console.warn("Saved tab is invalid or restricted:", tab?.url);
          chrome.storage.local.remove("activeScanTabId");
          fallbackToActiveTab(callback);
        }
      });
    } else {
      fallbackToActiveTab(callback);
    }
  });
}

async function fallbackToActiveTab(callback) {
  try{
    let tab = await getActiveHttpTab();

    if (tab) {
      callback(tab.id);
    } else {
      // Fallback: search all windows
      chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (windows) => {
        for (const win of windows) {
          tab = win.tabs.find(tab => tab.active && isValidTab(tab));
          if (tab) {
            callback(tab.id);
            return;
          }
        }

        console.error("No valid active tab found.");
        callback(null);
      });
    }
  } catch (err) {
    console.log("Error getting active tab:", err);
  }
}

function isValidTab(tab) {
  return tab?.url &&
    !tab.url.startsWith("chrome-extension://") &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("edge://") &&
    !tab.url.startsWith("devtools://");
}

function applyDarkModeStylesToTable() {
  const isDark = document.body.classList.contains("dark-mode");

  const inlineCell = document.getElementById("inline-count-cell");
  const externalCell = document.getElementById("external-count-cell");

  if (inlineCell && externalCell) {
    // Style the data cells
    inlineCell.style.backgroundColor = isDark ? "#662222" : "#ffcccc";
    inlineCell.style.color = isDark ? "#ffffff" : "#000000";

    externalCell.style.backgroundColor = isDark ? "#226622" : "#ccffcc";
    externalCell.style.color = isDark ? "#ffffff" : "#000000";
  }

  // Style the entire script summary table, if it exists
  const scriptSummary = document.getElementById("script-summary");
  if (scriptSummary) {
    scriptSummary.style.border = "1px solid " + (isDark ? "#888" : "#ccc");

    const ths = scriptSummary.querySelectorAll("th");
    ths.forEach((th) => {
      th.style.backgroundColor = isDark ? "#444" : "#f0f0f0";
      th.style.color = isDark ? "#ffffff" : "#000000";
    });

    const tds = scriptSummary.querySelectorAll("td");
    tds.forEach((td) => {
      td.style.border = "1px solid " + (isDark ? "#666" : "#ccc");
    });
  }
}

let interval = null;
let onScanResult = null;
let isScanning = false;

function resetScanContainer() {
  // Hide scan container UI
  scanContainer.style.display = "none";

  // Reset progress bar and texts
  progressBar.style.width = "0%";
  resultText.textContent = "";
  vulnCountText.textContent = "";
  statusText.textContent = "";

  // Hide download and classification buttons if visible
  downloadBtn.style.display = "none";
  classificationBtn.style.display = "none";

  // Clear any intervals and listeners
  if (interval) clearInterval(interval);
  if (onScanResult) {
    chrome.runtime.onMessage.removeListener(onScanResult);
    onScanResult = null;
  }

  // Reset scanning flag
  isScanning = false;
}

let allThreats = [];
let totalSeverityScore = 0;

async function printDomainScore() {
  let currentTab = await getActiveHttpTab();
  let url = "";

  try {
    url = new URL(currentTab.url)
  } catch (e) {
    console.log("Error: " + e);
  }

  console.log(url.hostname + "'s Total Vulnerabilities: " + allThreats.length);
  console.log(url.hostname + "'s Score: " + totalSeverityScore);
}
function setBadge(targetTabId, score, isSecure) {
  chrome.action.setBadgeText({ text: score.toString(), tabId: targetTabId });

  if (isSecure) {
    chrome.action.setBadgeBackgroundColor({ color: "#66CC66", tabId: targetTabId });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId: targetTabId });
  }
}

function startScan() {
  if (isScanning) return;
  isScanning = true;

  scanContainer.style.display = "block";

  progressBar.style.width = "0%";
  resultText.textContent = "";
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
      resultText.textContent = "Cannot scan this page. Restricted or unsupported URL.";
      statusText.textContent = "";
      console.error("Cannot scan this page. Restricted or unsupported URL.");
      progressContainer.style.display = "none";
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
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ["libs/acorn.min.js", "utils/alerts.js" ,"content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          clearInterval(interval);
          resultText.textContent = "Failed to inject content script. This page may block script injection.";
          statusText.textContent = "";
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
          if (chrome.runtime.lastError || !response?.started) {
            clearInterval(interval);
            resultText.textContent = "Content script not available on this page.";
            statusText.textContent = "";
            return;
          }

          onScanResult = function (message, sender) {
            if (message.type === "page-analysis-result") {
              clearInterval(interval);
              progressBar.style.width = `100%`;
              statusText.textContent = "Scan Completed!";

              const contentThreats = message.threats || [];

              const hasInline = contentThreats.some(threat => threat.type === "inline");

              // Filter out inline threats for separate handling
              const filteredContentThreats = contentThreats.filter(threat => threat.type !== "inline");

              if (hasInline) {
                filteredContentThreats.push({ type: "inline", description: "Inline threat detected" });
              }

              const protocol = message.protocol || "";

              chrome.runtime.sendMessage({ action: "getSecurityHeaders" }, (res) => {
                const headers = res?.headers || {};
                const headerThreats = [];

                // Define severity scores for header issues and protocol issues
                const severityScores = {
                  "Missing Content-Security-Policy": 5,
                  "Missing Strict-Transport-Security": 5,
                  "Missing X-Content-Type-Options": 3,
                  "Missing X-Frame-Options": 2,
                  "Page is not served over HTTPS": 10,
                  "inline": 3,
                };

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

                // Combine all threats (headers + content)
                allThreats = [...filteredContentThreats, ...headerThreats];

                // Calculate total severity score
                allThreats.forEach(threat => {
                  if (typeof threat === "string") {
                    totalSeverityScore += severityScores[threat] || 1;
                  } else if (threat.type) {
                    totalSeverityScore += severityScores[threat.type] || 1;
                  }
                });

                // Determine status based on severity score thresholds
                let statusMessage = "";
                let statusColor = "";
                let isSecure = false;

                printDomainScore();
                
                if (totalSeverityScore >= 7) {
                  statusMessage = "Website is insecure!";
                  statusColor = "red";
                  isSecure = false;
                  setBadge(tabId, totalSeverityScore, false);
                } else if (totalSeverityScore >= 3) {
                  statusMessage = "Website has some security warnings.";
                  statusColor = "orange";
                  isSecure = true; // Warning but not fully insecure
                  setBadge(tabId, totalSeverityScore, true);
                } else if (totalSeverityScore == 0) {
                  statusMessage = "Website appears secure.";
                  statusColor = "green";
                  isSecure = true;
                  setBadge(tabId, "", true);
                } else {
                  statusMessage = "Website appears secure.";
                  statusColor = "green";
                  isSecure = true;
                  setBadge(tabId, totalSeverityScore, true);
                }

                resultText.textContent = statusMessage;
                resultText.style.color = statusColor;

                // Show vulnerabilities count if any
                if (allThreats.length > 0) {
                  vulnCountText.textContent = `${allThreats.length} vulnerabilities detected.`;
                } else {
                  vulnCountText.textContent = "";
                }

                // Continue with existing logic for displaying detailed threats, download button etc.
                chrome.tabs.sendMessage(tabId, { action: "getContentThreats" }, (res) => {
                  const threats = res?.threats || [];
                  applyDarkModeStylesToTable();
                });

                downloadBtn.style.display = "inline-block";
                downloadBtn.onclick = () => {
                  chrome.storage.local.get(["jsBlockStates", "blacklist"], async ({ jsBlockStates, blacklist }) => {
                    chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async (response) => {
                      if (!response || response.error) {
                        showCustomAlert(response?.error || "Unable to retrieve tab information.", 5000);
                        return;
                      }

                      const { hostname, tabId, url } = response;

                      const currentTab = { id: tabId, url };

                      const options = {
                        timeZone: "Asia/Singapore",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      };
                      const formatter = new Intl.DateTimeFormat("en-GB", options);
                      const timestamp = formatter.format(new Date());

                      // Count inline vs external entries
                      const inlineCount = contentThreats.filter(
                        th =>
                          (typeof th === "string" && th.includes("inline-")) ||
                          (typeof th === "object" && th.scriptIndex?.startsWith("inline-"))
                      ).length;

                      const externalScriptsSet = new Set();

                      //Count external script
                      contentThreats.forEach(th => {
                        if (typeof th === "object" && th.scriptIndex?.startsWith("external-")) {
                          externalScriptsSet.add(th.scriptIndex);
                        } else if (typeof th === "string") {
                          const match = th.match(/external-\d+/);
                          if (match) externalScriptsSet.add(match[0]);
                        }
                      });

                      const externalCount = externalScriptsSet.size;

                      // Initialize jsPDF
                      const { jsPDF } = window.jspdf;
                      const doc = new jsPDF();
                      let y = 10;
                      
                      // Load logo
                      const imgUrl = chrome.runtime.getURL("Assets/logo/Webbed128.png");
                      const imgData = await getBase64ImageFromUrl(imgUrl);
                      doc.addImage(imgData, "PNG", 10, y, 48, 48);
                      y += 58;

                      // Centered title
                      const pageWidth = doc.internal.pageSize.getWidth();

                      doc.setFontSize(18);
                      const title = "    Generated by Webbed | Client-Side Script Security Inspector    ";
                      const titleWidth = doc.getTextWidth(title);
                      doc.text(title, (pageWidth - titleWidth) / 2, y);
                      y += 10;

                      doc.setFontSize(18);
                      const subheader = "    FYP-25-S2-12    ";
                      const subheaderWidth = doc.getTextWidth(subheader);
                      doc.text(subheader, (pageWidth - subheaderWidth) / 2, y);
                      y += 12;

                      // Summary info
                      const protocol = new URL(currentTab.url).protocol;

                      var message = isSecure ? "appears secure" : "is insecure!";
                      var color = isSecure ? [0, 128, 0] : [255, 0, 0];

                      doc.setTextColor(...color);
                      doc.text(`Website ${message}`, 10, y);
                      y += 10;

                      doc.setTextColor(0, 0, 0);

                      var jsActive = (hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname)) ? "JS Blocker Active" : "JS Blocker disabled";

                      const infoLines = [
                        `Report for: ${currentTab.url}`,
                        `Scan Timestamp: ${timestamp}`,
                        `${jsActive}`,
                        `Protocol: ${protocol}`,
                        `${allThreats.length} vulnerabilities detected`,
                        `Script Summary: ${inlineCount} inline and ${externalCount} external scripts found.`,
                      ];

                      infoLines.forEach((line) => {
                        const split = doc.splitTextToSize(line, pageWidth - 20);
                        split.forEach((part) => {
                          doc.text(part, 10, y);
                          y += 10;
                        });
                      });

                      y += 5;

                      // Threat logs
                      let log = `Threats:\n`;
                      let count = 0;

                      headerThreats.forEach((th) => {
                        let line;
                        if (typeof th === "string") {
                          line = th;
                        } else {
                          const idx = th.scriptIndex || "unknown";
                          const url = th.url || "n/a";
                          const err = th.error ? " - " + th.error : "";
                          line = `[${idx}] ${url}${err}`;
                        }
                        count++;
                        log += `[${count}] ${line}\n`;
                      });

                      contentThreats.forEach((th) => {
                        let line;

                        if (typeof th === "string") {
                          line = th;
                        } else {
                          const idx = th.scriptIndex || "unknown";

                          // Skip inline scripts
                          if (typeof idx === "string" && idx.startsWith("inline")) {
                            return;
                          }

                          const url = th.url || "n/a";
                          const err = th.error ? " - " + th.error : "";
                          line = `[${idx}] ${url}${err}`;
                        }

                        count++;
                        log += `[${count}] ${line}\n`;
                      });

                      if (inlineCount > 0) {
                        count++;
                        log += `[${count}] Total ${inlineCount} inline scripts\n`;
                      }

                      doc.setFontSize(11);
                      const maxLineWidth = pageWidth - 20;
                      const lines = doc.splitTextToSize(log, maxLineWidth);

                      lines.forEach((line) => {
                        if (y > doc.internal.pageSize.getHeight() - 10) {
                          doc.addPage();
                          y = 10;
                          doc.setFontSize(11);
                        }
                        doc.text(line, 10, y);
                        y += 6;
                      });

                      doc.save(`[Webbed]scan-log-${timestamp}.pdf`);
                    });

                    // Helper function
                    function getBase64ImageFromUrl(imageUrl) {
                      return new Promise((resolve, reject) => {
                        fetch(imageUrl)
                          .then((response) => response.blob())
                          .then((blob) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                          })
                          .catch(reject);
                      });
                    }
                  });
                };
                

                classificationBtn.style.display = "inline-block";

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

function placeCreditsBanner() {
  const banner = document.getElementById('credits-banner');
  const scanTab = document.getElementById('scan-tab');
  const settingsTab = document.getElementById('settings-tab');
  const sitesSection = document.getElementById('sites-section');

  // Remove from current location if any
  banner.style.display = 'block';  // Show it

  // Clear duplicates if any
  [scanTab, settingsTab, sitesSection].forEach(section => {
    const existing = section.querySelector('#credits-banner');
    if (existing && existing !== banner) {
      existing.remove();
    }
  });

  // Append a clone or the original to each section that needs it:
  scanTab.appendChild(banner.cloneNode(true));
  settingsTab.appendChild(banner.cloneNode(true));
  sitesSection.appendChild(banner.cloneNode(true));

  // Hide original container if you want to keep it hidden
  banner.style.display = 'none';
}

window.addEventListener("unload", () => {
  chrome.storage.local.remove("activeScanTabId", () => {
    console.log("Cleaned up activeScanTabId on unload.");
  });
});

window.addEventListener("DOMContentLoaded", async () => {
  const splash = document.getElementById("splash-screen");

  // Get the active tab ID
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    splash.remove(); // fallback: no tab info
    return;
  }

  const tabKey = `splashShown-${tab.id}`;

  chrome.storage.local.get(tabKey, (result) => {
    if (result[tabKey]) {
      splash.remove(); // already shown on this tab
    } else {
      // Mark as shown for this tab
      chrome.storage.local.set({ [tabKey]: true }, () => {
        // Show splash for 1s, then fade out
        setTimeout(() => {
          splash.style.opacity = "0";
          setTimeout(() => splash.remove(), 400);
        }, 1000);
      });
    }
  });
});