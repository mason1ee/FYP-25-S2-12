const scanButton = document.getElementById("scan-button");
const progressBar = document.getElementById("progress-bar");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
const detailedResults = document.getElementById("detailed-results");
const scanContainer = document.getElementById("scan-container");

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

const popoutButton = document.getElementById("popout-btn");

scanContainer.style.display = "none";

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

scanButton.addEventListener("click", startScan);

let interval = null;
let onScanResult = null;
let isScanning = false;


// function getTabIdForScanning(callback) {
//   chrome.storage.local.get("activeScanTabId", (data) => {
//     const savedTabId = data.activeScanTabId;

//     if (savedTabId) {
//       chrome.tabs.get(savedTabId, (tab) => {
//         if (chrome.runtime.lastError || !tab || !tab.active) {
//           console.warn("Saved tab ID invalid or not active, falling back to active tab.");
//           chrome.storage.local.remove("activeScanTabId");
//           chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
//             if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
//               console.error("No valid active tab found.");
//               callback(null);
//             } else {
//               callback(tabs[0].id);
//             }
//           });
//         } else {
//           callback(savedTabId);
//           // Optional cleanup
//           setTimeout(() => chrome.storage.local.remove("activeScanTabId"), 1000);
//         }
//       });
//     } else {
//       chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
//         if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
//           console.error("No valid active tab found.");
//           callback(null);
//         } else {
//           callback(tabs[0].id);
//         }
//       });
//     }
//   });
// }

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




// function startScan() {
//   if (isScanning) return;
//   isScanning = true;

//   scanContainer.style.display = "block";
//   scanButton.disabled = true;
//   scanButton.innerHTML = `<span class="spinner"></span> Scanning...`;
//   scanButton.style.opacity = 0.7;
//   scanButton.style.cursor = "not-allowed";

//   progressBar.style.width = "0%";
//   resultText.textContent = "";
//   detailedResults.innerHTML = "";
//   statusText.textContent = "";

//   if (interval) clearInterval(interval);
//   if (onScanResult) chrome.runtime.onMessage.removeListener(onScanResult);

//   const scanDuration = 3000;
//   const updateInterval = 100;
//   let timeElapsed = 0;
//   let progress = 0;
//   const progressStep = (100 * updateInterval) / scanDuration;

//   interval = setInterval(() => {
//     timeElapsed += updateInterval;
//     progress = Math.min(progress + progressStep, 100);
//     progressBar.style.width = `${progress}%`;

//     if (progress >= 100) {
//       clearInterval(interval);
//     }
//   }, updateInterval);

//   getTabIdForScanning((tabId) => {
//     if (!tabId) {
//       clearInterval(interval);
//       resultText.textContent = "No tab ID found for scanning.";
//       resetScanButton();
//       return;
//     }

//     chrome.scripting.executeScript({
//       target: { tabId },
//       files: ["acorn.min.js", "content.js"]
//     }, () => {
//       if (chrome.runtime.lastError) {
//         clearInterval(interval);
//         resultText.textContent = "Failed to inject content script.";
//         resetScanButton();
//         return;
//       }

//       chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
//         if (chrome.runtime.lastError || !response?.started) {
//           clearInterval(interval);
//           resultText.textContent = "Content script not available on this page.";
//           resetScanButton();
//           return;
//         }

//         onScanResult = function (message, sender) {
//           if (message.type === "page-analysis-result") {
//             clearInterval(interval);
//             progressBar.style.width = `100%`;

//             const contentThreats = message.threats || [];
//             const protocol = message.protocol || "";

//             chrome.runtime.sendMessage({ action: "getSecurityHeaders" }, (res) => {
//               const headers = res?.headers || {};
//               const headerThreats = [];

//               if (!headers["content-security-policy"])
//                 headerThreats.push("Missing Content-Security-Policy");
//               if (!headers["x-content-type-options"])
//                 headerThreats.push("Missing X-Content-Type-Options");
//               if (!headers["x-frame-options"])
//                 headerThreats.push("Missing X-Frame-Options");
//               if (!headers["strict-transport-security"])
//                 headerThreats.push("Missing Strict-Transport-Security");

//               if (protocol !== "https:") {
//                 headerThreats.push("Page is not served over HTTPS");
//               }

//               const allThreats = [...contentThreats, ...headerThreats];

//               if (allThreats.length > 0) {
//                 resultText.textContent = "Website is insecure!";
//                 resultText.style.color = "red";
//                 detailedResults.innerHTML = "";
//                 allThreats.forEach(threat => {
//                   const li = document.createElement("li");
//                   li.textContent = typeof threat === "string" ? threat : JSON.stringify(threat);
//                   detailedResults.appendChild(li);
//                 });
//               } else {
//                 resultText.textContent = "Website appears secure.";
//                 resultText.style.color = "green";
//                 detailedResults.innerHTML = "";
//               }

//               chrome.tabs.sendMessage(tabId, { action: "getContentThreats" }, (res) => {
//                 const threats = res?.threats || [];

//                 const inlineCount = threats.filter(t =>
//                   typeof t === "string" && t.includes("inline-")
//                 ).length;

//                 const externalScripts = threats.filter(t =>
//                   typeof t === "object" && t.scriptIndex?.includes("external-")
//                 );

//                 const externalCount = externalScripts.length;

//                 const scriptSummary = document.createElement("table");
//                 scriptSummary.style.marginTop = "1em";
//                 scriptSummary.style.borderCollapse = "collapse";
//                 scriptSummary.style.width = "100%";

//                 const headerRow = scriptSummary.insertRow();
//                 ["Inline", "External"].forEach((type) => {
//                   const th = document.createElement("th");
//                   th.textContent = type;
//                   th.style.padding = "8px";
//                   th.style.textAlign = "center";
//                   th.style.backgroundColor = "#f0f0f0";
//                   headerRow.appendChild(th);
//                 });

//                 const row = scriptSummary.insertRow();
//                 const inlineCell = row.insertCell();
//                 const externalCell = row.insertCell();

//                 inlineCell.textContent = inlineCount;
//                 externalCell.textContent = externalCount;

//                 inlineCell.style.backgroundColor = "#ffcccc";
//                 inlineCell.style.textAlign = "center";
//                 inlineCell.style.padding = "6px";

//                 externalCell.style.backgroundColor = "#ccffcc";
//                 externalCell.style.textAlign = "center";
//                 externalCell.style.padding = "6px";

//                 detailedResults.parentElement.appendChild(scriptSummary);

//                 if (externalCount > 0) {
//                   const showExternalBtn = document.createElement("button");
//                   showExternalBtn.textContent = "View External URLs";
//                   showExternalBtn.style.marginTop = "10px";
//                   showExternalBtn.addEventListener("click", () => {
//                     const urls = externalScripts.map(s => s.url || s.scriptIndex || "unknown");
//                     alert("External Script URLs:\n" + urls.join("\n"));
//                   });
//                   detailedResults.parentElement.appendChild(showExternalBtn);
//                 }
//               });

//               resetScanButton();
//               chrome.runtime.onMessage.removeListener(onScanResult);
//               onScanResult = null;
//             });
//           }
//         };

//         chrome.runtime.onMessage.addListener(onScanResult);
//       });
//     });
//   });
// }

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
  statusText.textContent = "";

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
      resetScanButton();
      return;
    }

    console.warn("startScan: No tabId retrieved.");
    
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
        console.warn("startScan: Tab URL is restricted or invalid.", tab?.url);
        clearInterval(interval);
        resultText.textContent = "Cannot scan this page. Restricted or unsupported URL.";
        resetScanButton();
        return;
      }

      console.log("Scanning tab URL:", tab.url);
      
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["acorn.min.js", "content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("startScan: Script injection failed.", chrome.runtime.lastError.message);
          clearInterval(interval);
          resultText.textContent = "Failed to inject content script. This page may block script injection.";
          resetScanButton();
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
          if (chrome.runtime.lastError || !response?.started) {
            console.warn("startScan: Content script did not respond.", chrome.runtime.lastError?.message);
            clearInterval(interval);
            resultText.textContent = "Content script not available on this page.";
            resetScanButton();
            return;
          }

          onScanResult = function (message, sender) {
            if (message.type === "page-analysis-result") {
              clearInterval(interval);
              progressBar.style.width = `100%`;

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
                } else {
                  resultText.textContent = "Website appears secure.";
                  resultText.style.color = "green";
                  detailedResults.innerHTML = "";
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

                  inlineCell.style.backgroundColor = "#ffcccc";
                  inlineCell.style.textAlign = "center";
                  inlineCell.style.padding = "6px";

                  externalCell.style.backgroundColor = "#ccffcc";
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


function resetScanButton() {
  isScanning = false;
  scanButton.disabled = false;
  scanButton.innerHTML = "Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";
}