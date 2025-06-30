if (typeof lastSecurityHeaders === "undefined"){
  var lastSecurityHeaders = {};
}

async function removeAllDynamicRules() {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
      const idsToRemove = existingRules.map(rule => rule.id);
      if (idsToRemove.length === 0) {
        resolve();
        return;
      }
      chrome.declarativeNetRequest.updateDynamicRules(
        { removeRuleIds: idsToRemove },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        }
      );
    });
  });
}

async function addDynamicRules(rules) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(
      { addRules: rules },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      }
    );
  });
}

async function updateDynamicBlacklistRules() {
  try {
    await removeAllDynamicRules();

    // Start ID from 10000 to avoid conflicts
    let nextId = 10000;

    const getNextUniqueId = () => nextId++;

    const data = await new Promise((resolve) => {
      chrome.storage.local.get({ blacklist: [] }, resolve);
    });

    if (!Array.isArray(data.blacklist)) return;

    const rules = [];

    for (const domain of data.blacklist) {
      const urlFilter = `*://${domain}/*`;

      rules.push({
        id: getNextUniqueId(),
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

      rules.push({
        id: getNextUniqueId(),
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter,
          resourceTypes: ["script"]
        }
      });
    }

    await addDynamicRules(rules);
    console.log("✅ Dynamic blacklist rules updated successfully.");
  } catch (error) {
    //console.error("❌ Failed to update dynamic blacklist rules:", error.message);
  }
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

  chrome.storage.local.get(["whitelist", "blacklist", "blocked", "jsBlockStates"], (data) => {
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

    if (!data.jsBlockStates || typeof data.jsBlockStates !== "object") {
      updates.jsBlockStates = {};
    }

    const needUpdate = Object.keys(updates).length > 0;

    if (needUpdate) {
      chrome.storage.local.set(updates, () => {
        applyBlockerState();
        updateDynamicBlacklistRules();
      });
    } else {
      applyBlockerState();
      updateDynamicBlacklistRules();
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
    return true;
  }

  if (message.action === "getActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }

  if (message.setBlocked !== undefined) {
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
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.blacklist) {
      updateDynamicBlacklistRules();
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
            showCustomAlert("⚠️ Warning: This site is in your blacklist!\n JS Blocker is ACTIVE");
          }
        });
      }
    });
  }
});

export async function getActiveHttpTab() {
  return new Promise((resolve, reject) => {
    chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }, (focusedWindow) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      const activeTab = focusedWindow?.tabs?.find(
        tab => tab.active && tab.url?.startsWith("http")
      );

      resolve(activeTab || null);
    });
  });
}