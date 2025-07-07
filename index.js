import { getActiveHttpTab } from "./background.js";

// UI Element bindings
const scanButton = document.getElementById("scan-button");
const progressBar = document.getElementById("progress-bar");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("scan-result");
const downloadBtn = document.getElementById("download-log");
const vulnCountText = document.getElementById("vuln-count");
const scanContainer = document.getElementById("scan-container");
const classificationBtn = document.getElementById("classification-buttons");
const popoutButton = document.getElementById("popout-btn");

const scanTabBtn = document.getElementById("scan-tab-btn");
const settingsTabBtn = document.getElementById("settings-tab-btn");
const sitesTabBtn = document.getElementById("sites-tab-btn");

const scanTab = document.getElementById("scan-tab");
const settingsTab = document.getElementById("settings-tab");
const sitesSection = document.getElementById("sites-section");

const whitelistTabBtn = document.getElementById("whitelist-tab-btn");
const blacklistTabBtn = document.getElementById("blacklist-tab-btn");
const whitelistTab = document.getElementById("whitelist-tab");
const blacklistTab = document.getElementById("blacklist-tab");

const blockerStatusText = document.getElementById("blocker-status-text");
const darkModeToggle = document.getElementById("dark-mode-toggle");

let interval = null;
let onScanResult = null;
let isScanning = false;
let allThreats = [];
let totalSeverityScore = 0;
function resetScanButton() {
  isScanning = false;
  scanButton.disabled = false;
  scanButton.innerHTML = "Start Scan";
  scanButton.style.opacity = 1;
  scanButton.style.cursor = "pointer";
}

function startScan() {
  if (isScanning) return;
  isScanning = true;

  scanContainer.style.display = "block";
  resultText.textContent = "";
  vulnCountText.textContent = "";
  statusText.textContent = "Scanning in progress...";
  progressBar.style.width = "0%";
  downloadBtn.style.display = "none";
  classificationBtn.style.display = "none";

  // Reset data
  allThreats = [];
  totalSeverityScore = 0;

  // Animate progress bar
  const duration = 3000;
  const intervalTime = 100;
  let elapsed = 0;
  const increment = (100 * intervalTime) / duration;

  interval = setInterval(() => {
    elapsed += intervalTime;
    progressBar.style.width = `${Math.min((elapsed / duration) * 100, 100)}%`;
    if (elapsed >= duration) clearInterval(interval);
  }, intervalTime);

  // Start scan in content script
  getTabIdForScanning((tabId) => {
    if (!tabId) {
      resetScan("No valid tab found.");
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId },
      files: ["libs/acorn.min.js", "utils/alerts.js", "content.js"]
    }, () => {
      if (chrome.runtime.lastError) {
        resetScan("Failed to inject content script.");
        return;
      }

      chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
        if (!response?.started || chrome.runtime.lastError) {
          resetScan("Content script not available on this page.");
          return;
        }

        // Handle result from content.js
        onScanResult = function (message) {
          if (message.type === "page-analysis-result") {
            clearInterval(interval);
            progressBar.style.width = "100%";

            const contentThreats = message.threats || [];
            const protocol = message.protocol || "";

            chrome.runtime.sendMessage({ action: "getSecurityHeaders" }, (res) => {
              const headerThreats = [];
              const headers = res?.headers || {};

              if (!headers["content-security-policy"]) headerThreats.push("Missing Content-Security-Policy");
              if (!headers["x-content-type-options"]) headerThreats.push("Missing X-Content-Type-Options");
              if (!headers["x-frame-options"]) headerThreats.push("Missing X-Frame-Options");
              if (!headers["strict-transport-security"]) headerThreats.push("Missing Strict-Transport-Security");

              if (protocol !== "https:") headerThreats.push("Page is not served over HTTPS");

              // Combine and classify
              allThreats = [...contentThreats, ...headerThreats];

              const severityScores = {
                "Missing Content-Security-Policy": 5,
                "Missing X-Content-Type-Options": 3,
                "Missing X-Frame-Options": 2,
                "Missing Strict-Transport-Security": 5,
                "Page is not served over HTTPS": 10,
              };

              totalSeverityScore = 0;

              allThreats.forEach(th => {
                if (typeof th === "string") {
                  totalSeverityScore += severityScores[th] || 1;
                } else if (th?.type) {
                  totalSeverityScore += severityScores[th.type] || 2;
                }
              });

              let verdict = "";
              let color = "";
              if (totalSeverityScore >= 7) {
                verdict = "Website is insecure!";
                color = "red";
              } else if (totalSeverityScore >= 3) {
                verdict = "Website has some warnings.";
                color = "orange";
              } else {
                verdict = "Website appears secure.";
                color = "green";
              }

              resultText.textContent = verdict;
              resultText.style.color = color;
              vulnCountText.textContent = `${allThreats.length} vulnerabilities detected`;

              downloadBtn.style.display = "inline-block";
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
}

function resetScan(errorMessage = "") {
  clearInterval(interval);
  progressBar.style.width = "0%";
  if (errorMessage) resultText.textContent = errorMessage;
  statusText.textContent = "";
  resetScanButton();
  downloadBtn.style.display = "none";
  classificationBtn.style.display = "none";
  chrome.runtime.onMessage.removeListener(onScanResult);
  onScanResult = null;
}
downloadBtn.onclick = () => {
  chrome.storage.local.get(["jsBlockStates", "blacklist"], async ({ jsBlockStates, blacklist }) => {
    chrome.runtime.sendMessage({ type: "getActiveTabInfo" }, async (response) => {
      if (!response || response.error) {
        showCustomAlert(response?.error || "Unable to retrieve tab information.", 5000);
        return;
      }

      const { hostname, tabId, url } = response;
      const isBlocked = hostname in jsBlockStates ? jsBlockStates[hostname] : blacklist.includes(hostname);
      const jsStatus = isBlocked ? "JS Blocker: ACTIVE" : "JS Blocker: INACTIVE";

      const timestamp = new Date().toLocaleString("en-GB", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Asia/Singapore"
      });

      const inlineCount = allThreats.filter(t =>
        typeof t === "object" && t.scriptIndex?.startsWith("inline-")
      ).length;

      const externalScripts = allThreats.filter(t =>
        typeof t === "object" && t.scriptIndex?.startsWith("external-")
      );

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      let y = 10;

      // Header: Logo
      const logoUrl = chrome.runtime.getURL("Assets/logo/Webbed128.png");
      const imgData = await getBase64ImageFromUrl(logoUrl);
      doc.addImage(imgData, "PNG", 10, y, 48, 48);
      y += 55;

      // Centered title
      doc.setFontSize(16);
      const title = "Generated by Webbed | Client-Side Script Security Inspector";
      const centerX = (doc.internal.pageSize.getWidth() - doc.getTextWidth(title)) / 2;
      doc.text(title, centerX, y);
      y += 10;

      doc.setFontSize(12);
      doc.setTextColor(0);
      const info = [
        `FYP-25-S2-12`,
        `Scan Timestamp: ${timestamp}`,
        `Scanned URL: ${url}`,
        `Protocol: ${new URL(url).protocol}`,
        `${jsStatus}`,
        `Inline Scripts: ${inlineCount}`,
        `External Scripts: ${externalScripts.length}`,
        `Total Threats Detected: ${allThreats.length}`,
        `Total Severity Score: ${totalSeverityScore}`
      ];
      info.forEach(line => {
        doc.text(line, 10, y);
        y += 7;
      });

      y += 3;
      doc.setFontSize(13);
      doc.setTextColor(20, 20, 150);
      doc.text("🔍 Threat Breakdown:", 10, y);
      y += 8;

      const maxY = doc.internal.pageSize.getHeight() - 15;

      const wrapLines = (text) => doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - 20);

      allThreats.forEach((threat, index) => {
        let display = "";

        if (typeof threat === "string") {
          display = `• ${threat}`;
        } else {
          const id = threat.scriptIndex || "unknown";
          const src = threat.url || "inline";
          const err = threat.error ? ` ⚠️ ${threat.error}` : "";
          display = `• [${id}] ${src}${err}`;
        }

        const lines = wrapLines(display);
        lines.forEach(line => {
          if (y > maxY) {
            doc.addPage();
            y = 10;
          }
          doc.setTextColor(0, 0, 0);
          doc.text(line, 10, y);
          y += 6;
        });
      });

      y += 5;
      doc.setTextColor(0, 128, 0);
      doc.setFontSize(11);
      doc.text("✔ End of Report", 10, y);

      doc.save(`[Webbed]scan-report-${hostname}.pdf`);
    });
  });
};

function getBase64ImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    fetch(url).then((response) => response.blob()).then((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }).catch(reject);
  });
}
