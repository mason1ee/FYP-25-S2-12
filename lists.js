document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["whitelist", "blacklist"], data => {
    let whitelist = data.whitelist || [];
    let blacklist = data.blacklist || [];
  
    const whitelistBody = document.querySelector("#whitelist tbody");
    const blacklistBody = document.querySelector("#blacklist tbody");

    const whitelistFilterInput = document.getElementById("whitelist-filter");
    const blacklistFilterInput = document.getElementById("blacklist-filter");

    const whitelistSortBtn = document.getElementById("whitelist-sort");
    const blacklistSortBtn = document.getElementById("blacklist-sort");

    const whitelistBtn = document.getElementById("whitelistBtn");
    const blacklistBtn = document.getElementById("blacklistBtn");

    const jsSettingsToggle = document.getElementById("toggle-js-blocker");
    const blockerStatusText = document.getElementById("blocker-status-text");

    console.log(document.getElementById('jsSettingsToggle'));

     whitelistBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "getActiveTabHostname" }, (response) => {
        if (response.error) {
          alert(response.error);
          return;
        }

        const hostname = response.hostname;

        chrome.storage.local.get({ whitelist: [], blacklist: [] }, (data) => {
          const whitelist = data.whitelist;
          const blacklist = data.blacklist;

          if (blacklist.includes(hostname)) {
            alert(`${hostname} is already blacklisted and cannot be added to the whitelist.`);
            return;
          }

          if (whitelist.includes(hostname)) {
            alert(`${hostname} is already whitelisted.`);
            return;
          }

          whitelist.push(hostname);
          chrome.storage.local.set({ whitelist }, () => {
            alert(`${hostname} added to Whitelist!`);
          });
        });
      });
    });

     blacklistBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "getActiveTabHostname" }, (response) => {
        if (response.error) {
          alert(response.error);
          return;
        }

        const hostname = response.hostname;

        chrome.storage.local.get({ whitelist: [], blacklist: [] }, (data) => {
          const whitelist = data.whitelist;
          const blacklist = data.blacklist;

          if (whitelist.includes(hostname)) {
            alert(`${hostname} is already whitelisted and cannot be added to the blacklist.`);
            return;
          }

          if (blacklist.includes(hostname)) {
            alert(`${hostname} is already blacklisted.`);
            return;
          }

          blacklist.push(hostname);
          chrome.storage.local.set({ blacklist }, () => {
            alert(`${hostname} added to Blacklist!`);
          });
        });
      });
    });

    function sortDomains(domains, order) {
      return domains.slice().sort((a, b) => {
        if (a.toLowerCase() < b.toLowerCase()) return order === "asc" ? -1 : 1;
        if (a.toLowerCase() > b.toLowerCase()) return order === "asc" ? 1 : -1;
        return 0;
      });
    }

    function addRows(tableBody, domains, filterText, order, listName) {
      const filter = filterText.toLowerCase();
      const sortedDomains = sortDomains(domains, order);
      sortedDomains.forEach(domain => {
        if (domain.toLowerCase().includes(filter)) {
          const row = document.createElement("tr");

          const cellDomain = document.createElement("td");
          cellDomain.textContent = domain;
          row.appendChild(cellDomain);

          const cellButton = document.createElement("td");
          const removeBtn = document.createElement("button");
          removeBtn.classList.add("remove-btn");
          removeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12.5a1 1 0 01-1 .5H7.5a1 1 0 01-1-.5L5 9zm5-6h4v2h-4V3z"/>
            </svg>
          `;
          removeBtn.style.cursor = "pointer";
          removeBtn.addEventListener("click", () => {
            removeDomain(domain, listName);
          });
          cellButton.appendChild(removeBtn);
          row.appendChild(cellButton);

          tableBody.appendChild(row);
        }
      });
    }

    function removeDomain(domain, listName, jsSettingsToggle, blockerStatusText) {
      chrome.storage.local.get([listName, "jsBlockStates"], (data) => {
        const list = data[listName] || [];
        const jsBlockStates = data.jsBlockStates || {};
        const index = list.indexOf(domain);

        if (index !== -1) {
          list.splice(index, 1);

          if (domain in jsBlockStates) {
            delete jsBlockStates[domain];
          }

        chrome.storage.local.set({ [listName]: list, jsBlockStates }, () => {
          alert(`${domain} removed from ${listName}.`);
          refreshLists();

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab || !tab.url) return;

            const currentHostname = new URL(tab.url).hostname;
            if (currentHostname === domain) {
              if (jsSettingsToggle && blockerStatusText) {
                jsSettingsToggle.checked = false;
                jsSettingsToggle.disabled = false;
                blockerStatusText.innerText = "INACTIVE";
                blockerStatusText.classList.remove("active");
                blockerStatusText.classList.add("inactive");
              }

              updateJSBlockRuleForHost(domain, false);

              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  alert("JS Blocker is now INACTIVE.\nPlease manually refresh the page to apply changes.");
                }
              });
            }
          });
        });
      }
  });
}

    function clearTable(tableBody) {
      while (tableBody.firstChild) {
        tableBody.removeChild(tableBody.firstChild);
      }
    }

    function populateTables() {
      clearTable(whitelistBody);
      clearTable(blacklistBody);

      addRows(
        whitelistBody,
        whitelist,
        whitelistFilterInput.value,
        whitelistSortBtn.getAttribute("data-order"),
        "whitelist"
      );

      addRows(
        blacklistBody,
        blacklist,
        blacklistFilterInput.value,
        blacklistSortBtn.getAttribute("data-order"),
        "blacklist"
      );
    }

    function refreshLists() {
      chrome.storage.local.get(["whitelist", "blacklist"], (data) => {
        whitelist = data.whitelist || [];
        blacklist = data.blacklist || [];
        populateTables();
      });
    }

    function toggleSortOrder(button) {
      const currentOrder = button.getAttribute("data-order");
      const newOrder = currentOrder === "asc" ? "desc" : "asc";
      button.setAttribute("data-order", newOrder);
      button.textContent = newOrder === "asc" ? "Sort Asc" : "Sort Desc";
    }

    whitelistFilterInput.addEventListener("input", populateTables);
    blacklistFilterInput.addEventListener("input", populateTables);

    whitelistSortBtn.addEventListener("click", () => {
      toggleSortOrder(whitelistSortBtn);
      populateTables();
    });

    blacklistSortBtn.addEventListener("click", () => {
      toggleSortOrder(blacklistSortBtn);
      populateTables();
    });

    populateTables();

    // Watch for changes in storage and update the table
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && (changes.whitelist || changes.blacklist)) {
        refreshLists();
      }
    });

    document.getElementById("reset-lists").addEventListener("click", () => {
      if (confirm("Are you sure you want to reset all lists?")) {
        const defaultWhitelist = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
        const defaultBlacklist = ["evil.com", "maliciousdomain.net"];

        chrome.storage.local.set({
          whitelist: defaultWhitelist,
          blacklist: defaultBlacklist,
          jsBlockStates: {}
        }, () => {
          chrome.declarativeNetRequest.getDynamicRules((rules) => {
            const ruleIds = rules.map(rule => rule.id);
            chrome.declarativeNetRequest.updateDynamicRules({
              removeRuleIds: ruleIds
            }, () => {
              if (chrome.runtime.lastError) {
                console.error("Error removing rules:", chrome.runtime.lastError);
              } else {
                console.log("All blocking rules removed.");
              }

              alert("All website lists and JS blocking rules have been reset.");
              refreshLists();
            });
          });
        });
      }
    });
  });
});

// Hash + block function (unchanged)
export function updateJSBlockRuleForHost(hostname, shouldBlock) {
  const ruleId = Math.abs(hashCode(hostname));
  if (shouldBlock) {
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: `||${hostname}^`,
          resourceTypes: ["script"]
        }
      }],
      removeRuleIds: []
    });
  } else {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId]
    });
  }
  console.log(`Rule for ${hostname} ${shouldBlock ? 'added' : 'removed'}`);
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}