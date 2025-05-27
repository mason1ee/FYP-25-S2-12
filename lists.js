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
      location.reload(); // Reload popup to reflect changes
    });
  }
});

