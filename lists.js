import { getActiveHttpTab } from './background.js';

let blacklistFilterInput, blacklistBody, blacklistSortBtn;
let whitelist = [], blacklist = [];

export async function reloadTabsMatchingOriginalTabDomain() {
  try {
    const activeTab = await getActiveHttpTab();
    if (!activeTab || !activeTab.url) {
      console.warn("No suitable active HTTP tab found to match against.");
      return;
    }

    const activeUrl = new URL(activeTab.url);
    const activeDomain = activeUrl.hostname;

    const allTabs = await chrome.tabs.query({});

    const matchingTabs = allTabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        return (
          url.hostname === activeDomain || url.hostname.endsWith(`.${activeDomain}`)
        );
      } catch {
        return false;
      }
    });

    if (matchingTabs.length === 0) {
      console.log("No open tabs matched the active tab's domain.");
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const tab of matchingTabs) {
      if (tab.id !== undefined) {
        chrome.tabs.reload(tab.id);
        console.log(`Reloaded tab ${tab.id}: ${tab.url}`);
      }
    }

    if (typeof window.showCustomAlert === "function") {
      window.showCustomAlert(
        `Reloaded ${matchingTabs.length} tab(s) matching domain: ${activeDomain}`,
        3000,
        false
      );
    }

  } catch (error) {
    console.error("Error reloading tabs matching active tab domain:", error);
  }
}

async function reloadTabsByDomainFromBlacklist(blacklist) {
  try {
    if (!Array.isArray(blacklist) || blacklist.length === 0) {
      console.warn("Blacklist is empty or invalid, no tabs will be reloaded.");
      return;
    }

    const tabs = await chrome.tabs.query({});

    const matchingTabs = tabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        return blacklist.some(domain =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );
      } catch {
        return false;
      }
    });

    if (matchingTabs.length === 0) {
      console.log("No open tabs matched blacklist domains.");
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const tab of matchingTabs) {
      if (tab.id !== undefined) {
        chrome.tabs.reload(tab.id);
        console.log(`Reloaded tab ${tab.id}: ${tab.url}`);
      }
    }

    if (typeof window.showCustomAlert === "function") {
      window.showCustomAlert(`Reloaded ${matchingTabs.length} tab(s) matching blacklist domains.`, 3000, false);
    }

  } catch (error) {
    console.error("Error reloading tabs by blacklist domains:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["whitelist", "blacklist"], data => {
    // Assign to outer variables, NOT redeclare
    whitelist = data.whitelist || [];
    blacklist = data.blacklist || [];

    blacklistBody = document.querySelector("#blacklist tbody");

    blacklistFilterInput = document.getElementById("blacklist-filter");

    blacklistSortBtn = document.getElementById("blacklist-sort");

    blacklistFilterInput.addEventListener("input", populateTables);

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
      showCustomConfirm(
        "Are you sure you want to reset all lists?",
        async () => {
          try {
            const defaultWhitelist = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
            const defaultBlacklist = ["evil.com", "maliciousdomain.net"];

            // STEP 1: Get the current (pre-reset) blacklist
            const { blacklist: oldBlacklist = [] } = await chrome.storage.local.get("blacklist");

            // STEP 2: Reset storage to defaults
            await chrome.storage.local.set({
              whitelist: defaultWhitelist,
              blacklist: defaultBlacklist,
              jsBlockStates: {}
            });

            // STEP 3: Remove all dynamic rules
            const rules = await new Promise((resolve) =>
              chrome.declarativeNetRequest.getDynamicRules(resolve)
            );
            const ruleIds = rules.map(rule => rule.id);

            await new Promise((resolve) =>
              chrome.declarativeNetRequest.updateDynamicRules(
                { removeRuleIds: ruleIds },
                resolve
              )
            );

            if (chrome.runtime.lastError) {
              console.error("Error removing rules:", chrome.runtime.lastError);
            } else {
              console.log("All blocking rules removed.");

              // STEP 4: Reload tabs that match the OLD blacklist
              await reloadTabsByDomainFromBlacklist(oldBlacklist);

              showCustomAlert("All website lists and JS blocking rules have been reset.", 1500);
              refreshLists();
            }
          } catch (error) {
            console.error("Error during list reset:", error);
          }
        },
        () => {
          console.log("User canceled the reset.");
        },
        1000
      );
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
    if (domain.toLowerCase().startsWith(filter)) {
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
        showCustomAlert(`${domain} removed from ${listName}. Refreshing page...`, 3000, false);
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

          await reloadTabsMatchingOriginalTabDomain();
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
  clearTable(blacklistBody);

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