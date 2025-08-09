import { getActiveHttpTab } from "./background.js";
import { reloadTabsMatchingOriginalTabDomain } from './lists.js';
const popoutButton = document.getElementById("popout-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
const downloadBtn = document.getElementById("download-log");
const downloadDBtn = document.getElementById("download-dlog");
const vulnCountText = document.getElementById("vuln-count");
const scanContainer = document.getElementById("scan-container");
const scanTabBtn = document.getElementById("scan-tab-btn");
const settingsTabBtn = document.getElementById("settings-tab-btn");
const scanTab = document.getElementById("scan-tab");
const settingsTab = document.getElementById("settings-tab");
const sitesTabBtn = document.getElementById("sites-tab-btn");
const sitesSection = document.getElementById("sites-section");
const blacklistTabBtn = document.getElementById("blacklist-tab-btn");
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
if (popoutButton && chrome.windows && chrome.tabs) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
      chrome.windows.getCurrent((win) => {
        win.type === "popup"
          ? (popoutButton.style.display = "none")
          : (popoutButton.style.display = "inline-block");
      });
    } else {
      // Hide the button if it's not a proper website
      popoutButton.style.display = "none";
    }
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

    // Debounce any multiple calls within specified time
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

      return;
    }
    
    const hostname = new URL(activeTab.url).hostname;

    chrome.storage.local.get({ blacklist: [], jsBlockStates: {} }, (data) => {
      const { blacklist, jsBlockStates } = data;
      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);

      blockerStatusText.innerText = isBlocked ? "ACTIVE" : "INACTIVE";
      blockerStatusText.classList.toggle("active", isBlocked);
      blockerStatusText.classList.toggle("inactive", !isBlocked);
      blockerStatusText.classList.remove("na");
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
      resetScanContainer();
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
  blacklistTab.style.display = "block";
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

/* Website list Tab Navigation*/

blacklistTabBtn.addEventListener("click", () => {
  blacklistTab.style.display = "block";
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
  downloadDBtn.style.display = "none"

  // Clear any intervals and listeners
  if (interval) clearInterval(interval);
  if (onScanResult) {
    chrome.runtime.onMessage.removeListener(onScanResult);
    onScanResult = null;
  }

  // Reset scanning flag
  isScanning = false;
}

function setBadge(targetTabId, score, isSecure) {
  chrome.action.setBadgeText({ text: score.toString(), tabId: targetTabId });

  if (isSecure) {
    chrome.action.setBadgeBackgroundColor({ color: "#66CC66", tabId: targetTabId });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId: targetTabId });
  }
}

let allThreats = [];
let totalSeverityScore = 0;
const blacklistSeverityscore = 30;
let summaryIssues = [];

function startScan() {
  totalSeverityScore = 0;
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

              // Filter inline threats separately but keep them in the list if present
              const hasInline = contentThreats.some(threat => threat.type === "inline");
              const filteredContentThreats = contentThreats.filter(threat => threat.type !== "inline");
              if (hasInline) {
                filteredContentThreats.push({ type: "inline", description: "Inline threat detected" });
              }

              // Helper function moved out of main flow for clarity
              function countInlineScripts(threats) {
                return threats.filter(th =>
                  (typeof th === "string" && th.includes("inline-")) ||
                  (typeof th === "object" && th.scriptIndex?.startsWith("inline-"))
                ).length;
              }

              const inlineCount = countInlineScripts(allThreats);
              const externalCount = new Set(
                allThreats
                  .filter(th => typeof th === "object" && th.scriptIndex?.startsWith("external-"))
                  .map(th => th.scriptIndex)
              ).size;

              const protocol = message.protocol || "";

              chrome.runtime.sendMessage({ action: "getSecurityHeaders" }, (res) => {
                const headers = res?.headers || {};
                const headerThreats = [];

                const severityScores = {
                  "Page is not served over HTTPS": blacklistSeverityscore,
                  "Missing Content-Security-Policy": 1,
                  "Missing Strict-Transport-Security": 2,
                  "Missing X-Content-Type-Options": 1,
                  "Missing X-Frame-Options": 1,
                  "inline": 0.001
                };

                function getSeverityScore(threat) {
                  return severityScores[threat] || 0;
                }

                // Check protocol and headers, add corresponding threats
                if (protocol !== "https:") {
                  headerThreats.push("Page is not served over HTTPS");
                }
                if (!headers["content-security-policy"]) headerThreats.push("Missing Content-Security-Policy");
                if (!headers["x-content-type-options"]) headerThreats.push("Missing X-Content-Type-Options");
                if (!headers["x-frame-options"]) headerThreats.push("Missing X-Frame-Options");
                if (!headers["strict-transport-security"]) headerThreats.push("Missing Strict-Transport-Security");

                // Reset score before tallying
                totalSeverityScore = 0;

                // Add header threats severity
                headerThreats.forEach(threat => {
                  totalSeverityScore += getSeverityScore(threat) || 1;
                });

                // Add content threats severity - use filteredContentThreats only once
                filteredContentThreats.forEach(threat => {
                  if (typeof threat === "string") {
                    totalSeverityScore += getSeverityScore(threat) || 0.001;
                  } else if (threat && typeof threat === "object" && threat.type) {
                    totalSeverityScore += getSeverityScore(threat.type) || 0.001;
                  }
                });

                // Use filteredContentThreats as combined threats for further processing
                allThreats = [...filteredContentThreats, ...headerThreats];

                totalSeverityScore = Math.ceil(totalSeverityScore);

                // Determine status based on severity
                let statusMessage = "";
                let statusColor = "";
                let isSecure = false;

                printDomainScore();

                if (totalSeverityScore >= blacklistSeverityscore) {
                  statusMessage = "Website has critical vulnerabilities";
                  statusColor = "red";
                  isSecure = false;
                  setBadge(tabId, totalSeverityScore, false);
                } else if (totalSeverityScore >= 8) {
                  statusMessage = "Website has some security warnings.";
                  statusColor = "orange";
                  isSecure = true;
                  setBadge(tabId, totalSeverityScore, true);
                } else {
                  statusMessage = "Website appears secure.";
                  statusColor = "green";
                  isSecure = true;
                  setBadge(tabId, totalSeverityScore, true);
                }

                resultText.textContent = statusMessage;
                resultText.style.color = statusColor;

                const lines = [];
                let count = 0;
                const skippedLargeScriptUrls = [];

                const failedFetchCount = allThreats.filter(th =>
                  typeof th === "object" &&
                  th.scriptIndex?.startsWith("external-") &&
                  th.error?.includes("Fetch error: Failed to fetch")
                ).length;

                allThreats.forEach(th => {
                  if (typeof th === "string") {
                    count++;
                    lines.push(`[${count}] ${th}`);
                  } else if (th && typeof th === "object") {
                    const idx = th.scriptIndex || "unknown";
                    const src = th.url || "n/a";
                    const err = th.error ? ` - ${th.error}` : "";

                    if (th.error?.includes("Skipped large script")) {
                      if (src !== "n/a") skippedLargeScriptUrls.push(src);
                      return; // skip adding as individual line
                    }

                    if (
                      !th.error?.includes("Fetch error: Failed to fetch") &&
                      !(typeof th.scriptIndex === "string" && th.scriptIndex.startsWith("inline"))
                    ) {
                      count++;
                      lines.push(`[${count}] [${idx}] ${src}${err}`);
                    }
                  }
                });

                // Add summary lines (these are part of the visible lines)
                if (inlineCount > 0) {
                  count++;
                  lines.push(`[${count}] Total ${inlineCount} inline scripts detected`);
                }

                if (externalCount > 0) {
                  count++;
                  lines.push(`[${count}] Total ${externalCount} external scripts detected`);
                }

                if (failedFetchCount > 0) {
                  count++;
                  lines.push(`[${count}] Total ${failedFetchCount} failed to fetch external scripts`);
                }

                console.log("skipped: " + skippedLargeScriptUrls);
                if (skippedLargeScriptUrls.length > 0) {
                  count++;
                  lines.push(`[${count}] ${skippedLargeScriptUrls.length} large scripts skipped: ${skippedLargeScriptUrls.join(", ")}`);
                }

                // Use the actual number of visible lines for the info block & header
                const displayedIssueCount = lines.length;

                // Show vulnerabilities count if any
                if (allThreats.length > 0) {
                  vulnCountText.textContent = `${displayedIssueCount} issues detected.`;
                } else {
                  vulnCountText.textContent = "";
                }

                async function printDomainScore() {
                  let currentTab = await getActiveHttpTab();
                  let url = "";

                  try {
                    url = new URL(currentTab.url)
                  } catch (e) {
                    console.log("Error: " + e);
                  }

                  console.log(url.hostname + "'s Total Potential Issues: " + displayedIssueCount);
                  console.log(url.hostname + "'s Score: " + totalSeverityScore);
                }

                // Continue with existing logic for displaying detailed threats, download button etc.
                chrome.tabs.sendMessage(tabId, { action: "getContentThreats" }, (res) => {
                  const threats = res?.threats || [];
                  applyDarkModeStylesToTable();
                });

                function getTimestamp() {
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
                  const filenameSafeTimestamp = timestamp.replace(/[^\d]/g, "_");
                  return { timestamp, filenameSafeTimestamp };
                }


                function addWrappedText(doc, text, x, y, maxWidth, fontSize = 11, lineHeight = 6) {
                  const lines = doc.splitTextToSize(text, maxWidth);
                  const pageHeight = doc.internal.pageSize.getHeight();
                  doc.setFontSize(fontSize);

                  lines.forEach(line => {
                    if (y > pageHeight - 10) {
                      doc.addPage();
                      y = 10;
                    }
                    doc.text(line, x, y);
                    y += lineHeight;
                  });

                  return y;
                }

                function addVulnerabilityDescriptions(doc, y, pageWidth, descriptions) {
                  descriptions.forEach(entry => {
                    const wrappedTitle = doc.splitTextToSize(`• ${entry.title}`, pageWidth - 20);
                    const wrappedDesc = doc.splitTextToSize(entry.desc, pageWidth - 20);
                    const neededHeight = (wrappedTitle.length + wrappedDesc.length) * 6;

                    if (y + neededHeight > doc.internal.pageSize.getHeight() - 10) {
                      doc.addPage();
                      y = 10;
                    }

                    doc.setFont(undefined, "bold");
                    wrappedTitle.forEach(line => {
                      doc.text(line, 10, y);
                      y += 6;
                    });

                    doc.setFont(undefined, "normal");
                    wrappedDesc.forEach(line => {
                      doc.text(line, 14, y);
                      y += 6;
                    });

                    y += 4;
                  });

                  return y;
                }

                async function getBase64ImageFromUrl(imageUrl) {
                  const blob = await fetch(imageUrl).then(res => res.blob());
                  return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                }

                const vulnerabilityDescriptions = [
                  {
                    title: "Missing Content-Security-Policy",
                    desc: "This means the website does not clearly tell the browser which types of content are safe to load..."
                  },
                  {
                    title: "Missing Strict-Transport-Security",
                    desc: "The website doesn't force a secure connection (HTTPS)..."
                  },
                  {
                    title: "Missing X-Content-Type-Options",
                    desc: "Without this setting, a browser might incorrectly guess the file type..."
                  },
                  {
                    title: "Missing X-Frame-Options",
                    desc: "The website can be embedded in other sites, increasing risk of clickjacking..."
                  },
                  {
                    title: "Page is not served over HTTPS",
                    desc: "The website does not use HTTPS, allowing attackers to intercept data..."
                  },
                  {
                    title: "Inline Scripts ('inline')",
                    desc: "Using inline scripts increases the risk of code injection..."
                  },
                  {
                    title: "External Script Issues",
                    desc: "External scripts may not be safe or may fail to load, exposing the site to risks..."
                  },
                  {
                    title: "Unsafe JavaScript Detected: .value used in variable assignment",
                    desc: "User inputs combined with variables can allow harmful scripts..."
                  },
                  {
                    title: "Unsafe JavaScript Detected: .value assigned to innerHTML",
                    desc: "Assigning user input to innerHTML can lead to code injection..."
                  },
                  {
                    title: "Unsafe JavaScript Detected: eval() used with .value",
                    desc: "Using eval() on user input is dangerous as it executes code directly..."
                  },
                  {
                    title: "Unsafe JavaScript Detected: document.write() with .value",
                    desc: "document.write() with input allows attackers to rewrite content with malicious code..."
                  }
                ];

                downloadBtn.style.display = "inline-block";
                downloadDBtn.style.display = "inline-block";

                downloadBtn.onclick = () => {
                  chrome.storage.local.get(["jsBlockStates", "blacklist"], async ({ jsBlockStates, blacklist }) => {
                    chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async (response) => {
                      if (!response || response.error) {
                        showCustomAlert(response?.error || "Unable to retrieve tab information.", 5000);
                        return;
                      }

                      const { hostname, url } = response;
                      const { timestamp, filenameSafeTimestamp } = getTimestamp();

                      const { jsPDF } = window.jspdf;
                      const doc = new jsPDF();
                      let y = 10;
                      const pageWidth = doc.internal.pageSize.getWidth();

                      const imgData = await getBase64ImageFromUrl(chrome.runtime.getURL("Assets/logo/Webbed128.png"));
                      doc.addImage(imgData, "PNG", 10, y, 48, 48);
                      y += 58;

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

                      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);
                      const color = totalSeverityScore >= 20
                                          ? [255, 0, 0]         // Red
                                          : totalSeverityScore >= 10
                                          ? [255, 165, 0]       // Orange
                                          : [0, 128, 0];        // Green

                      const summary = statusMessage;

                      doc.setTextColor(...color);
                      doc.text(`${summary}`, 10, y);
                      y += 10;
                      doc.setTextColor(0, 0, 0);

                      // Suspicious JS activity
                      const hasJSThreats = allThreats.some(th =>
                        typeof th === "object" && (
                          th.scriptIndex?.startsWith("external-") || th.scriptIndex?.startsWith("inline")
                        )
                      );
                      if (hasJSThreats) {
                        summaryIssues.push("Suspicious or unsafe JavaScript activity detected.");
                      }

                      // Header-related issues
                      const headerKeywords = [
                        "Page is not served over HTTPS",
                        "Missing Content-Security-Policy",
                        "Missing Strict-Transport-Security",
                        "Missing X-Content-Type-Options",
                        "Missing X-Frame-Options"
                      ];
                      for (const header of headerKeywords) {
                        if (allThreats.some(th =>
                          (typeof th === "string" && th.includes(header)) ||
                          (typeof th === "object" && th.type === header)
                        )) {
                          summaryIssues.push(header);
                        }
                      }

                      // Inline / External script counts
                      if (inlineCount > 0) {
                        summaryIssues.push(`Total ${inlineCount} inline scripts`);
                      }
                      if (externalCount > 0) {
                        summaryIssues.push(`Total ${externalCount} external scripts detected`);
                      }

                      // Number the list
                      const numberedSummary = summaryIssues.map((text, idx) => `[${idx + 1}] ${text}`);

                      const infoLines = [
                        `Report for: ${url}`,
                        `Scan Timestamp: ${timestamp}`,
                        `JS Blocker: ${isBlocked ? "ACTIVE" : "INACTIVE"}`,
                        `Protocol: ${new URL(url).protocol}`,
                        `Severity Score: ${totalSeverityScore}`,
                        `${summaryIssues.length} potential issues`,
                        `Script Summary: ${inlineCount} inline, ${externalCount} external`
                      ];
                      infoLines.forEach((line) => {
                        const split = doc.splitTextToSize(line, pageWidth - 20);
                        split.forEach((part) => {
                          doc.text(part, 10, y);
                          y += 10;
                        });
                      });

                      y += 5;

                      doc.setFontSize(13);
                      doc.text(`Issues Found:`, 10, y);
                      y += 8;
                      doc.setFontSize(11);
                      y = addWrappedText(doc, numberedSummary.join("\n"), 10, y, pageWidth - 20, 11, 6);

                      y += 10;
                      if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 10; }

                      doc.setFontSize(14);
                      doc.text("Vulnerability Descriptions", 10, y);
                      y += 10;
                      doc.setFontSize(11);
                      y = addVulnerabilityDescriptions(doc, y, pageWidth, vulnerabilityDescriptions);

                      const reportFile = `[Webbed]scan-log-${hostname}_${filenameSafeTimestamp}.pdf`;
                      doc.save(reportFile);
                    });
                  });
                };

                // For detailed report
                downloadDBtn.onclick = () => {
                  chrome.storage.local.get(["jsBlockStates", "blacklist"], async ({ jsBlockStates, blacklist }) => {
                    chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async (response) => {
                      if (!response || response.error) {
                        showCustomAlert(response?.error || "Unable to retrieve tab information.", 5000);
                        return;
                      }

                      const { hostname, tabId, url } = response;
                      const currentTab = { id: tabId, url };
                      const { timestamp, filenameSafeTimestamp } = getTimestamp();

                      const inlineCount = countInlineScripts(allThreats);
                      const externalScriptsSet = new Set();
                      allThreats.forEach(th => {
                        if (typeof th === "object" && th.scriptIndex?.startsWith("external-")) {
                          externalScriptsSet.add(th.scriptIndex);
                        }
                      });
                      const externalCount = externalScriptsSet.size;

                      const { jsPDF } = window.jspdf;
                      const doc = new jsPDF();
                      let y = 10;
                      const pageWidth = doc.internal.pageSize.getWidth();

                      const imgUrl = chrome.runtime.getURL("Assets/logo/Webbed128.png");
                      const imgData = await getBase64ImageFromUrl(imgUrl);
                      doc.addImage(imgData, "PNG", 10, y, 48, 48);
                      y += 58;

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

                      const protocol = new URL(currentTab.url).protocol;
                      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);
                      const color = totalSeverityScore >= 20
                                          ? [255, 0, 0]         // Red
                                          : totalSeverityScore >= 10
                                          ? [255, 165, 0]       // Orange
                                          : [0, 128, 0];        // Green
                      const summary = statusMessage;

                      doc.setTextColor(...color);
                      doc.text(`${summary}`, 10, y);
                      y += 10;
                      doc.setTextColor(0, 0, 0);

                      const infoLines = [
                        `Detailed Report for: ${currentTab.url}`,
                        `Scan Timestamp: ${timestamp}`,
                        `JS Blocker: ${isBlocked ? "ACTIVE" : "INACTIVE"}`,
                        `Protocol: ${protocol}`,
                        `Severity Score: ${totalSeverityScore}`,
                        `${displayedIssueCount} potential issues`,
                        `Script Summary: ${inlineCount} inline, ${externalCount} external`
                      ];

                      infoLines.forEach((line) => {
                        const split = doc.splitTextToSize(line, pageWidth - 20);
                        split.forEach((part) => {
                          doc.text(part, 10, y);
                          y += 10;
                        });
                      });

                      y += 5;

                      doc.setFontSize(13);
                      doc.text(`Issues Found:`, 10, y);
                      y += 8;
                      doc.setFontSize(11);

                      // Print the actual lines
                      y = addWrappedText(doc, lines.join("\n"), 10, y, pageWidth - 20, 11, 6);

                      y += 10;
                      if (y > doc.internal.pageSize.getHeight() - 60) {
                        doc.addPage();
                        y = 10;
                      }

                      doc.setFontSize(14);
                      doc.text("Vulnerability Descriptions", 10, y);
                      y += 10;
                      doc.setFontSize(11);

                      y = addVulnerabilityDescriptions(doc, y, pageWidth, vulnerabilityDescriptions);

                      const reportFile = `[Webbed]Detailed-scan-log-${hostname}_${filenameSafeTimestamp}.pdf`;
                      doc.save(reportFile);
                    });
                  });
                };

                chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async ({ hostname }) => {
                  if (!hostname) return;

                  chrome.storage.local.get(["whitelist", "blacklist"], async ({ whitelist = [], blacklist = [] }) => {
                    whitelist = whitelist || [];
                    blacklist = blacklist || [];

                    const inWhitelist = whitelist.includes(hostname);
                    const inBlacklist = blacklist.includes(hostname);

                    // Remove from both lists to avoid duplicates
                    if (inWhitelist || inBlacklist) {
                      whitelist = whitelist.filter(site => site !== hostname);
                      blacklist = blacklist.filter(site => site !== hostname);
                    }

                    // Add to correct list based on severity score

                    if (totalSeverityScore >= blacklistSeverityscore) {
                      chrome.storage.local.get("blacklist", async ({ blacklist = [] }) => {
                        if (!blacklist.includes(hostname)) {
                          await sleep(2000);
                          window.showCustomAlert("Website flagged! Blacklisting...");
                          blacklist.push(hostname);
                          await sleep(1000);
                          reloadTabsMatchingOriginalTabDomain();
                          chrome.storage.local.set({ blacklist });
                          return;
                        } else{
                          return;
                        }
                      });
                    } else {
                      whitelist.push(hostname);
                      chrome.storage.local.set({ whitelist });
                    }
                  });
                });

                function sleep(ms) {
                  return new Promise(resolve => setTimeout(resolve, ms));
                }

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
          setTimeout(() => splash.remove(), 180);
        }, 500);
      });
    }
  });
});