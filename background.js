// let lastSecurityHeaders = {};

// chrome.runtime.onInstalled.addListener(() => {
//   console.log('Client-side Security Script Inspector extension installed');
// });

// // Restore JS-Blocker state on startup
// chrome.runtime.onStartup.addListener(() => {
//   chrome.storage.local.get('blocked', ({ blocked }) => {
//     if (typeof blocked === 'boolean') {
//       chrome.declarativeNetRequest.updateEnabledRulesets(
//         blocked
//           ? { enableRulesetIds: ['ruleset_1'] }
//           : { disableRulesetIds: ['ruleset_1'] }
//       );
//     }
//   });
// });

// chrome.webRequest.onHeadersReceived.addListener(
//   (details) => {
//     // Extract security headers from the response headers
//     const headers = {};
//     details.responseHeaders.forEach((header) => {
//       headers[header.name.toLowerCase()] = header.value;
//     });
//     lastSecurityHeaders = headers;
//   },
//   { urls: ["http://*/*", "https://*/*"] },
//   ["responseHeaders"]
// );

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "getSecurityHeaders") {
//     sendResponse({ headers: lastSecurityHeaders });
//   }
//   // Keep listener alive for async (though this is sync here)
//   return true;
// });

// chrome.runtime.onInstalled.addListener(() => {
//   chrome.storage.local.get(["whitelist", "blacklist"], (data) => {
//     if (!data.whitelist || !data.blacklist) { // Set up default list
//       chrome.storage.local.set({
//         whitelist: ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
//         blacklist: ["evil.com", "maliciousdomain.net"]
//       });
//     }
//   });
// });

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "getActiveTab") {
//     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//       sendResponse({ tab: tabs[0] });
//     });
//     return true; // Needed to keep the message channel open
//   }
// });

let lastSecurityHeaders = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log('Client-side Security Script Inspector extension installed');

  // Initialize default whitelist/blacklist if not set
  chrome.storage.local.get(["whitelist", "blacklist"], (data) => {
    if (!data.whitelist || !data.blacklist) {
      chrome.storage.local.set({
        whitelist: ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
        blacklist: ["evil.com", "maliciousdomain.net"]
      });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('blocked', ({ blocked }) => {
    if (typeof blocked === 'boolean') {
      chrome.declarativeNetRequest.updateEnabledRulesets(
        blocked
          ? { enableRulesetIds: ['ruleset_1'] }
          : { disableRulesetIds: ['ruleset_1'] }
      );
    }
  });
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

// Unified message listener
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

    return true; // keep message channel open for async response
  }

  return false;
});
