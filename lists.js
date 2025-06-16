document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["whitelist", "blacklist"], data => {
    let whitelist = data.whitelist;
    let blacklist = data.blacklist;

    const whitelistBody = document.querySelector("#whitelist tbody");
    const blacklistBody = document.querySelector("#blacklist tbody");

    const whitelistFilterInput = document.getElementById("whitelist-filter");
    const blacklistFilterInput = document.getElementById("blacklist-filter");

    const whitelistSortBtn = document.getElementById("whitelist-sort");
    const blacklistSortBtn = document.getElementById("blacklist-sort");

    const whitelistBtn = document.getElementById("whitelistBtn");
    const blacklistBtn = document.getElementById("blacklistBtn");

  whitelistBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const hostname = new URL(tabs[0].url).hostname;

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
          chrome.storage.local.set({ whitelist: whitelist });
          alert(`${hostname} added to Whitelist!`);
        });
      }
    });
  });

  blacklistBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const hostname = new URL(tabs[0].url).hostname;

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
          chrome.storage.local.set({ blacklist: blacklist });
          alert(`${hostname} added to Blacklist!`);
        });
      }
    });
  });

    function clearTable(tableBody) {
      while (tableBody.firstChild) {
        tableBody.removeChild(tableBody.firstChild);
      }
    }

    // Sort domains based on order ("asc" or "desc")
    function sortDomains(domains, order) {
      return domains.slice().sort((a, b) => {
        if (a.toLowerCase() < b.toLowerCase()) return order === "asc" ? -1 : 1;
        if (a.toLowerCase() > b.toLowerCase()) return order === "asc" ? 1 : -1;
        return 0;
      });
    }

    // Add rows that match filter after sorting
    function addRows(tableBody, domains, filterText, order) {
      const filter = filterText.toLowerCase();
      const sortedDomains = sortDomains(domains, order);
      sortedDomains.forEach(domain => {
        if (domain.toLowerCase().includes(filter)) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.textContent = domain;
          row.appendChild(cell);
          tableBody.appendChild(row);
        }
      });
    }

    // Populate tables with current filters and sorting
    function populateTables() {
      clearTable(whitelistBody);
      clearTable(blacklistBody);

      addRows(
        whitelistBody,
        whitelist,
        whitelistFilterInput.value,
        whitelistSortBtn.getAttribute("data-order")
      );

      addRows(
        blacklistBody,
        blacklist,
        blacklistFilterInput.value,
        blacklistSortBtn.getAttribute("data-order")
      );
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
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.whitelist || changes.blacklist)) {
    location.reload();
  }
});

//For Reset
document.getElementById("reset-lists").addEventListener("click", () => {
  if (confirm("Are you sure you want to reset all lists?")) {
    chrome.storage.local.set({
      whitelist: ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      blacklist: ["evil.com", "maliciousdomain.net"]
    }, () => {
      alert("All website lists have been reset.");
      chrome.runtime.sendMessage({ action: "updateBlacklistRules" }); // Trigger update
      location.reload();
    });
  }
});

document.getElementById("reset-lists").addEventListener("click", () => {
  if (confirm("Are you sure you want to reset all lists?")) {
    const defaultWhitelist = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
    const defaultBlacklist = ["evil.com", "maliciousdomain.net"];

    // Clear jsBlockStates and set new whitelist + blacklist
    chrome.storage.local.set({
      whitelist: defaultWhitelist,
      blacklist: defaultBlacklist,
      jsBlockStates: {}  // ✅ Reset JS block states
    }, () => {
      // ✅ Remove all blocking rules in DNR
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
          location.reload();
        });
      });
    });
  }
});

export function updateJSBlockRuleForHost(hostname, shouldBlock) {
  const ruleId = Math.abs(hashCode(hostname)); // Unique rule ID for each hostname

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
      removeRuleIds: [] // Don't remove anything else
    });
  } else {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId]
    });
  }
  console.log(`Rule for ${hostname} ${shouldBlock ? 'added' : 'removed'}`);
}

// Simple hash function to create a numeric rule ID
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}