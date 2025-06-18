if (typeof lastSecurityHeaders === "undefined"){
  var lastSecurityHeaders = {};
}

function updateDynamicBlacklistRules() {
  chrome.storage.local.get({ blacklist: [] }, ({ blacklist }) => {
    if (!Array.isArray(blacklist)) return;

    let rules = [];
    let ruleId = 1000; // Make sure IDs don't conflict with static ruleset

    for (const domain of blacklist) {
      const urlFilter = `*://${domain}/*`;

      // Rule 1: Modify CSP headers
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            {
              header: "Content-Security-Policy",
              operation: "set",
              value: "script-src 'self' blob:; script-src-elem 'self' blob:; object-src 'none';"
            }
          ]
        },
        condition: {
          urlFilter,
          resourceTypes: ["main_frame"]
        }
      });

      // Rule 2: Block scripts
      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter,
          resourceTypes: ["script"]
        }
      });
    }

    // Remove old dynamic rules first, then add new ones
    chrome.declarativeNetRequest.getDynamicRules(existing => {
      const idsToRemove = existing.map(rule => rule.id);
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: idsToRemove,
        addRules: rules
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to update dynamic blacklist rules:", chrome.runtime.lastError.message);
        } else {
          console.log("Dynamic blacklist rules updated.");
        }
      });
    });
  });
}

function applyBlockerState() {
  chrome.storage.local.get('blocked', ({ blocked }) => {
    if (typeof blocked === 'boolean') {
      chrome.declarativeNetRequest.updateEnabledRulesets(
        blocked
          ? { enableRulesetIds: ['ruleset_1'] }
          : { disableRulesetIds: ['ruleset_1'] }
      );
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Client-side Security Script Inspector extension installed');

  chrome.storage.local.get(["whitelist", "blacklist", "blocked"], (data) => {
    const updates = {};

    if (!data.whitelist) {
      updates.whitelist = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
    }

    if (!data.blacklist) {
      updates.blacklist = ["evil.com", "maliciousdomain.net"];
    }

    if (typeof data.blocked !== "boolean") {
      updates.blocked = false;
    }

    const needUpdate = Object.keys(updates).length > 0;

    if (needUpdate) {
      chrome.storage.local.set(updates, () => {
        applyBlockerState();
        updateDynamicBlacklistRules(); // safe here
      });
    } else {
      applyBlockerState();
      updateDynamicBlacklistRules(); // also safe here
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  applyBlockerState();
  updateDynamicBlacklistRules();
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const headers = {};
    details.responseHeaders.forEach((header) => {
      headers[header.name.toLowerCase()] = header.value;
    });
    lastSecurityHeaders = headers;
  },
  { urls: ["http://*/*", "https://*/*"] },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getActiveTabHostname") {
    chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
      if (focusedWindow) {
        const activeTab = focusedWindow.tabs.find(tab => 
          tab.active && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
        );

        if (activeTab) {
          try {
            const hostname = new URL(activeTab.url).hostname;
            sendResponse({ hostname });
            return;
          } catch {
            sendResponse({ error: "Failed to parse hostname." });
            return;
          }
        }
      }

      // fallback: search all windows if none found in focused window
      chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (windows) => {
        for (const win of windows) {
          const activeTab = win.tabs.find(tab =>
            tab.active && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
          );
          if (activeTab) {
            try {
              const hostname = new URL(activeTab.url).hostname;
              sendResponse({ hostname });
              return;
            } catch {
              sendResponse({ error: "Failed to parse hostname." });
              return;
            }
          }
        }
        sendResponse({ error: "No valid active tab found." });
      });
    });

    return true;
  }

  if (message.action === "getSecurityHeaders") {
    sendResponse({ headers: lastSecurityHeaders });
  }

  else if (message.action === "getActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }

  else if (message.setBlocked !== undefined) {
    const blocked = message.setBlocked;

    chrome.storage.local.set({ blocked }, () => {
      chrome.declarativeNetRequest.updateEnabledRulesets(
        blocked
          ? { enableRulesetIds: ['ruleset_1'] }
          : { disableRulesetIds: ['ruleset_1'] }
      );
      sendResponse({ blocked });
    });

    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.blacklist) {
      updateDynamicBlacklistRules(); // Trigger DNR update
    }
    if (changes.blocked) {
      applyBlockerState();
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const url = new URL(tab.url);
    const hostname = url.hostname;

    chrome.storage.local.get({ blacklist: [] }, (data) => {
      const blacklist = data.blacklist || [];
      if (blacklist.includes(hostname)) {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            alert("⚠️ Warning: This site is in your blacklist!\n JS Blocker is ACTIVE");
          }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getActiveTabInfo") {
    const sendTabInfo = (tab) => {
      if (!tab || !tab.url?.startsWith("http")) {
        sendResponse({ error: "No valid HTTP(S) tab found." });
        return;
      }

      try {
        const hostname = new URL(tab.url).hostname;
        sendResponse({ hostname, tabId: tab.id, url: tab.url });
      } catch {
        sendResponse({ error: "Failed to parse hostname." });
      }
    };

    chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
      const activeTab = focusedWindow?.tabs?.find(tab => tab.active && tab.url?.startsWith("http"));
      if (activeTab) {
        sendTabInfo(activeTab);
      } else {
        // Fallback to all windows
        chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }, (windows) => {
          for (const win of windows) {
            const tab = win.tabs.find(tab => tab.active && tab.url?.startsWith("http"));
            if (tab) {
              sendTabInfo(tab);
              return;
            }
          }
          sendResponse({ error: "No valid active tab found." });
        });
      }
    });

    return true; // ✅ KEEP THE MESSAGE PORT OPEN
  }
});