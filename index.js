const popoutButton = document.getElementById("popout-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");

const scanButton = document.getElementById("scan-button");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
//const detailedResults = document.getElementById("detailed-results");
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

//const jsSettingsToggle = document.getElementById("toggle-js-blocker");
const blockerStatusText = document.getElementById("blocker-status-text");
 
scanContainer.style.display = "none";

if (popoutButton && chrome.windows) {
  chrome.windows.getCurrent((win) => {
    if (win.type === "popup") {
      popoutButton.style.display = "none";
    }
  });
}

function updateUIBasedOnActiveTab() {
  chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
    const activeTab = focusedWindow?.tabs?.find(tab => tab.active && tab.url?.startsWith("http"));

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

    chrome.storage.local.get({ blacklist: [], jsBlockStates: {} }, (data) => {
      const { blacklist, jsBlockStates } = data;
      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);

      blockerStatusText.innerText = isBlocked ? "ACTIVE" : "INACTIVE";
      blockerStatusText.classList.toggle("active", isBlocked);
      blockerStatusText.classList.toggle("inactive", !isBlocked);
      blockerStatusText.classList.remove("na");

      // Optionally toggle the checkbox
      // jsSettingsToggle.checked = isBlocked;

      if (classificationBtn) {
        classificationBtn.style.display = "inline-block";
      }
    });
  });
}

// For dynamic updates of JS Blocker Status
function initializeListeners() {
  chrome.tabs.onActivated.addListener(() => {
    updateUIBasedOnActiveTab();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url) {
      updateUIBasedOnActiveTab();
    }
  });

  chrome.windows.onFocusChanged.addListener(() => {
    updateUIBasedOnActiveTab();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.blacklist || changes.jsBlockStates)) {
      updateUIBasedOnActiveTab();
    }
  });
}

function updateCurrentDomain() {
  chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
    const activeTab = focusedWindow?.tabs?.find(tab => tab.active && tab.url?.startsWith("http"));
    const domainText = document.getElementById("current-domain");

    if (activeTab && activeTab.url) {
      try {
        scanButton.style.display = "inline-block";
        const hostname = new URL(activeTab.url).hostname;
        domainText.textContent = `Current Domain: ${hostname}`;
      } catch (e) {
        domainText.textContent = "Invalid URL.";
      }
    } else {
      document.getElementById("scan-instruction").style.display = "none";
      scanButton.style.display = "none";
      domainText.textContent = "No active website detected.";
    }
  });
}

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  initializeListeners();

  updateCurrentDomain();
  // Optional: keep it updated in case tab changes while popup is open
  setInterval(updateCurrentDomain, 1000);
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
    chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
      const activeTab = focusedWindow?.tabs?.find(tab => tab.active && tab.url?.startsWith("http"));
      if (activeTab) {
        chrome.storage.local.set({ activeScanTabId: activeTab.id }, () => {
          chrome.windows.create({
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: 350,
            height: 550
          }, () => {
            window.close();
          });
        });
      } else {
        // Fallback: try to find any valid active tab across all normal windows
        chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (windows) => {
          for (const win of windows) {
            const fallbackTab = win.tabs.find(tab => tab.active && tab.url?.startsWith("http"));
            if (fallbackTab) {
              chrome.storage.local.set({ activeScanTabId: fallbackTab.id }, () => {
                chrome.windows.create({
                  url: chrome.runtime.getURL("index.html"),
                  type: "popup",
                  width: 350,
                  height: 550
                }, () => {
                  window.close();
                });
              });
              return;
            }
          }
          console.error("No valid active tab found.");
        });
      }
    });
  });
}

// Hide popout button if already in a popout window
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
  scanButton.innerHTML = " Start Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";
}

chrome.storage.local.get("darkMode", ({ darkMode }) => {
  const isDarkMode = Boolean(darkMode);
  const root = document.documentElement;

  root.classList.toggle("dark-mode", isDarkMode);
  darkModeToggle.checked = isDarkMode;

  
  localStorage.setItem("darkMode", isDarkMode);
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

// jsSettingsToggle.addEventListener("change", () => {
//   chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, (response) => {
//     if (!response || response.error) {
//       alert(response?.error || "Unable to retrieve tab information.");
//       jsSettingsToggle.checked = false;
//       blockerStatusText.innerText = "INACTIVE";
//       blockerStatusText.classList.remove("active");
//       blockerStatusText.classList.add("inactive");
//       return;
//     }

//     const { hostname, tabId } = response;

//     chrome.storage.local.get({ blacklist: [], jsBlockStates: {} }, (data) => {
//       const { blacklist, jsBlockStates } = data;

//       if (!blacklist.includes(hostname)) {
//         alert(`${hostname} is not blacklisted.\nJS blocking will not be applied.`);
//         jsSettingsToggle.checked = false;
//         blockerStatusText.innerText = "INACTIVE";
//         blockerStatusText.classList.remove("active");
//         blockerStatusText.classList.add("inactive");
//         return;
//       }

//       const shouldBlock = jsSettingsToggle.checked;
//       jsBlockStates[hostname] = shouldBlock;

//       chrome.storage.local.set({ jsBlockStates }, () => {
//         blockerStatusText.innerText = shouldBlock ? "ACTIVE" : "INACTIVE";
//         blockerStatusText.classList.toggle("active", shouldBlock);
//         blockerStatusText.classList.toggle("inactive", !shouldBlock);

//         // Apply the rule (must define this function somewhere)
//         updateJSBlockRuleForHost(hostname, shouldBlock);

//         // Notify the user to refresh
//         chrome.scripting.executeScript({
//           target: { tabId },
//           func: (state) => {
//             alert(
//               `JS Blocker is now ${state ? "ACTIVE" : "INACTIVE"}.\nPlease manually refresh the page to apply changes.`
//             );
//           },
//           args: [shouldBlock]
//         });
//       });
//     });
//   });
// });

scanButton.addEventListener("click", startScan);

let interval = null;
let onScanResult = null;
let isScanning = false;

chrome.tabs.onActivated.addListener((activeInfo) => {
  // When user switches tab, reset scan container
  resetScanContainer();
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

function fallbackToActiveTab(callback) {
  chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
    let tab = focusedWindow?.tabs?.find(tab => tab.active && isValidTab(tab));

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
  });
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

function resetScanContainer() {
  // Hide scan container UI
  scanContainer.style.display = "none";

  // Reset progress bar and texts
  progressBar.style.width = "0%";
  resultText.textContent = "";
  vulnCountText.textContent = "";
  statusText.textContent = "";
  
  // Enable scan button and reset text
  scanButton.disabled = false;
  scanButton.innerHTML = "Start Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";

  // Hide download and classification buttons if visible
  downloadBtn.style.display = "none";
  classificationBtn.style.display = "none";

  // Clear any intervals and listeners
  if (interval) clearInterval(interval);
  if (onScanResult) {
    chrome.runtime.onMessage.removeListener(onScanResult);
    onScanResult = null;
  }

  // Show scan instructions again
  document.getElementById("scan-instruction").style.display = "block";

  // Reset scanning flag
  isScanning = false;
}

function startScan() {
  if (isScanning) return;
  isScanning = true;

  document.getElementById("scan-instruction").style.display = "none";

  scanContainer.style.display = "block";
  scanButton.disabled = true;
  scanButton.innerHTML = `<span class="spinner"></span> Scanning...`;
  scanButton.style.opacity = 0.7;
  scanButton.style.cursor = "not-allowed";

  progressBar.style.width = "0%";
  resultText.textContent = "";
  //detailedResults.innerHTML = "";
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
      //No valid tab ID found for scanning.";
      statusText.textContent = "";
      console.error("Cannot scan this page. Restricted or unsupported URL.");
      //"No valid tab ID found.");
      //classificationBtn.style.display = "none";
      resetScanButton();
      progressContainer.style.display="none";
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
        files: ["libs/acorn.min.js", "content.js"]
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

              const hasInline = contentThreats.some(threat => threat.type === "inline");

              // Get all non-inline threats
              const filteredContentThreats = contentThreats.filter(threat => threat.type !== "inline");

              // If inline exists, add a placeholder threat object
              if (hasInline) {
                filteredContentThreats.push({ type: "inline", description: "Inline threat detected" });
              }

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

                const allThreats = [...filteredContentThreats, ...headerThreats];

                // original code to show all after scan
                var isSecure = false;

                if (allThreats.length > 0) {
                  resultText.textContent = "Website is insecure!";
                  resultText.style.color = "red";
                  isSecure = false;
                  //detailedResults.innerHTML = ""; // Clear detailed list
                  vulnCountText.textContent = `${allThreats.length} vulnerabilities detected.`;
                }

                else {
                  resultText.textContent = "Website appears secure.";
                  resultText.style.color = "green";
                  isSecure = true;
                  //detailedResults.innerHTML = "";
                  vulnCountText.textContent = "";
                }

                chrome.tabs.sendMessage(tabId, { action: "getContentThreats" }, (res) => {
                  const threats = res?.threats || [];

                  // Apply dark mode styles immediately after building the table
                  applyDarkModeStylesToTable();

                });
                
              // Show the download button
              downloadBtn.style.display = "inline-block";

              downloadBtn.onclick = () => {
                chrome.storage.local.get(["jsBlockStates", "blacklist"], async ({ jsBlockStates, blacklist }) => {
                  chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async (response) => {
                    if (!response || response.error) {
                      alert(response?.error || "Unable to retrieve tab information.");
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

                // show whitelist/blacklist button
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