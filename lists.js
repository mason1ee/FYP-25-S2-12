import { getActiveHttpTab } from './background.js';

let whitelistFilterInput, blacklistFilterInput, whitelistBody, blacklistBody, whitelistSortBtn, blacklistSortBtn, whitelistBtn, blacklistBtn;
let whitelist = [], blacklist = [];

async function reloadOriginalTab() {
  try {
    const activeTab = await getActiveHttpTab();
    if (activeTab && activeTab.id) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      chrome.tabs.reload(activeTab.id);
      console.log(`Reloaded tab ${activeTab.id} (${activeTab.url})`);
    } else {
      console.warn("No suitable active HTTP tab found to reload.");
    }
  } catch (error) {
    console.error("Error getting active HTTP tab:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["whitelist", "blacklist"], data => {
    // Assign to outer variables, NOT redeclare
    whitelist = data.whitelist || [];
    blacklist = data.blacklist || [];

    whitelistBody = document.querySelector("#whitelist tbody");
    blacklistBody = document.querySelector("#blacklist tbody");

    whitelistFilterInput = document.getElementById("whitelist-filter");
    blacklistFilterInput = document.getElementById("blacklist-filter");

    whitelistSortBtn = document.getElementById("whitelist-sort");
    blacklistSortBtn = document.getElementById("blacklist-sort");

    whitelistBtn = document.getElementById("whitelistBtn");
    blacklistBtn = document.getElementById("blacklistBtn");

    whitelistBtn.addEventListener("click", async () => {
      chrome.runtime.sendMessage({ type: "getActiveTabHostname" }, async (response) => {
        if (response.error) {
          showCustomAlert(response.error);
          return;
        }

        const hostname = response.hostname;

        chrome.storage.local.get({ whitelist: [], blacklist: [] }, async (data) => {
          const whitelist = data.whitelist;
          const blacklist = data.blacklist;

          if (blacklist.includes(hostname)) {
            showCustomAlert(`${hostname} is already blacklisted and cannot be added to the whitelist.`);
            return;
          }

          if (whitelist.includes(hostname)) {
            showCustomAlert(`${hostname} is already whitelisted.`);
            return;
          }

          whitelist.push(hostname);
          chrome.storage.local.set({ whitelist }, async () => {
            showCustomAlert(`${hostname} added to Whitelist! Refreshing page...`);
            await reloadOriginalTab();
          });
        });
      });
    });

    blacklistBtn.addEventListener("click", async () => {
      chrome.runtime.sendMessage({ type: "getActiveTabHostname" }, async (response) => {
        if (response.error) {
          showCustomAlert(response.error);
          return;
        }

        const hostname = response.hostname;

        chrome.storage.local.get({ whitelist: [], blacklist: [] }, async (data) => {
          const whitelist = data.whitelist;
          const blacklist = data.blacklist;

          if (whitelist.includes(hostname)) {
            showCustomAlert(`${hostname} is already whitelisted and cannot be added to the blacklist.`);
            return;
          }

          if (blacklist.includes(hostname)) {
            showCustomAlert(`${hostname} is already blacklisted.`);
            return;
          }

          blacklist.push(hostname);
          chrome.storage.local.set({ blacklist }, async () => {
            showCustomAlert(`${hostname} added to Blacklist! Refreshing page...`);
            await reloadOriginalTab();
          });
        });
      });
    });

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

              showCustomAlert("All website lists and JS blocking rules have been reset.");
              refreshLists();
            });
          });
        });
      }
    });

  }); // end chrome.storage.local.get
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

async function removeDomain(domain, listName, jsSettingsToggle, blockerStatusText) {
  chrome.storage.local.get([listName, "jsBlockStates"], async (data) => {
    const list = data[listName] || [];
    const jsBlockStates = data.jsBlockStates || {};
    const index = list.indexOf(domain);

    if (index !== -1) {
      list.splice(index, 1);

      if (domain in jsBlockStates) {
        delete jsBlockStates[domain];
      }

      chrome.storage.local.set({ [listName]: list, jsBlockStates }, async () => {
        showCustomAlert(`${domain} removed from ${listName}. Refreshing page...`);
        refreshLists();

        const activeTab = await getActiveHttpTab();
        if (!activeTab || !activeTab.url || !activeTab.url.startsWith("http")) return;

        const currentHostname = new URL(activeTab.url).hostname;
        if (currentHostname === domain) {
          if (jsSettingsToggle && blockerStatusText) {
            jsSettingsToggle.checked = false;
            jsSettingsToggle.disabled = false;

            blockerStatusText.innerText = "INACTIVE";
            blockerStatusText.classList.add("inactive");
            blockerStatusText.classList.remove("active");
          }

          updateJSBlockRuleForHost(domain, false);

          await reloadOriginalTab();
        }
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