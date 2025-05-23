document.addEventListener("DOMContentLoaded", () => {
  const scanButton = document.getElementById("scan-button");
  const statusText = document.getElementById("status-text");
  const scanResult = document.getElementById("scan-result");
  const detailedResults = document.getElementById("detailed-results");

  const externalToggleBtn = document.createElement("button");
  externalToggleBtn.textContent = "View External URLs";
  externalToggleBtn.style.marginTop = "1em";
  externalToggleBtn.style.display = "none";

  const externalListContainer = document.createElement("div");
  externalListContainer.style.display = "none";
  externalListContainer.style.marginTop = "0.5em";

  detailedResults.parentElement.appendChild(externalToggleBtn);
  detailedResults.parentElement.appendChild(externalListContainer);

  let externalScripts = [];

  externalToggleBtn.addEventListener("click", () => {
    if (externalListContainer.style.display === "none") {
      externalListContainer.style.display = "block";
      externalToggleBtn.textContent = "Hide External URLs";
    } else {
      externalListContainer.style.display = "none";
      externalToggleBtn.textContent = "View External URLs";
    }
  });

  scanButton.addEventListener("click", () => {
    statusText.textContent = "Scanning...";
    scanResult.textContent = "";
    detailedResults.innerHTML = "";
    externalListContainer.innerHTML = "";
    externalListContainer.style.display = "none";
    externalToggleBtn.style.display = "none";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "startScan" }, (response) => {
        if (chrome.runtime.lastError) {
          statusText.textContent = "Error: " + chrome.runtime.lastError.message;
          return;
        }

        if (response && response.started) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getContentThreats" }, (res) => {
              if (!res || !res.threats) {
                statusText.textContent = "No response from content script.";
                return;
              }

              const threats = res.threats;
              externalScripts = threats.filter(threat => threat.url && threat.url !== "inline");

              if (threats.length === 0) {
                statusText.textContent = "No issues found.";
              } else {
                statusText.textContent = `Found ${threats.length} potential issue(s).`;
                scanResult.textContent = `Protocol: ${res.protocol}`;

                threats.forEach(threat => {
                  const li = document.createElement("li");

                  if (typeof threat === "string") {
                    li.textContent = threat;
                  } else if (threat.error) {
                    li.textContent = `${threat.scriptIndex}: ${threat.error}`;
                  } else {
                    li.textContent = `${threat.scriptIndex} - ${threat.url}`;
                  }

                  detailedResults.appendChild(li);
                });

                if (externalScripts.length > 0) {
                  externalToggleBtn.style.display = "inline-block";

                  const list = document.createElement("ul");
                  externalScripts.forEach(s => {
                    const urlItem = document.createElement("li");
                    const link = document.createElement("a");
                    link.href = s.url;
                    link.textContent = s.url;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    urlItem.appendChild(link);
                    list.appendChild(urlItem);
                  });

                  externalListContainer.appendChild(list);
                }
              }
            });
          }, 1000);
        }
      });
    });
  });
});
