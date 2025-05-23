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

scanButton.addEventListener("click", startScan);

let interval = null;
let onScanResult = null;
let isScanning = false;

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

  if (interval) {
    clearInterval(interval);
    interval = null;
  }

  if (onScanResult) {
    chrome.runtime.onMessage.removeListener(onScanResult);
    onScanResult = null;
  }

  const scanDuration = 3000;
  const updateInterval = 100;
  let timeElapsed = 0;
  let progress = 0;
  const progressStep = (100 * updateInterval) / scanDuration;

  interval = setInterval(() => {
    timeElapsed += updateInterval;
    progress = Math.min(progress + progressStep, 100);
    progressBar.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      interval = null;
    }
  }, updateInterval);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) {
      clearInterval(interval);
      interval = null;
      resultText.textContent = "No active tab found.";
      resetScanButton();
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["acorn.min.js", "content.js"]
    }, () => {
      if (chrome.runtime.lastError) {
        clearInterval(interval);
        interval = null;
        resultText.textContent = "Failed to inject content script.";
        resetScanButton();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "startScan" }, (response) => {
        if (chrome.runtime.lastError || !response?.started) {
          clearInterval(interval);
          interval = null;
          resultText.textContent = "Content script not available on this page.";
          resetScanButton();
          return;
        }

        onScanResult = function (message, sender) {
          if (message.type === "page-analysis-result") {
            clearInterval(interval);
            interval = null;
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

              // Add summary table of script types
              chrome.tabs.sendMessage(tab.id, { action: "getContentThreats" }, (res) => {
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
}

function resetScanButton() {
  isScanning = false;
  scanButton.disabled = false;
  scanButton.innerHTML = "Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";
}
