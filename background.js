if (typeof lastSecurityHeaders === "undefined"){
  var lastSecurityHeaders = {};
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

  // Ensure default whitelist/blacklist
  chrome.storage.local.get(["whitelist", "blacklist", "blocked"], (data) => {
    const updates = {};

    if (!data.whitelist) {
      updates.whitelist = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
    }

    if (!data.blacklist) {
      updates.blacklist = ["evil.com", "maliciousdomain.net"];
    }

    // Explicitly set 'blocked' to false if undefined
    if (typeof data.blocked !== "boolean") {
      updates.blocked = false;
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        // Only apply blocker state after setting defaults
        applyBlockerState();
      });
    } else {
      // Apply blocker state immediately if no updates needed
      applyBlockerState();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  applyBlockerState();
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
            alert("⚠️ Warning: This site is in your blacklist!");
          }
        });
      }
    });
  }
});