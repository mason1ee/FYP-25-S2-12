let lastSecurityHeaders = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log('Script Inspector extension installed');
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Extract security headers from the response headers
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
  // Keep listener alive for async (though this is sync here)
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["whitelist", "blacklist"], (data) => {
    if (!data.whitelist || !data.blacklist) { // Set up default list
      chrome.storage.local.set({
        whitelist: ["cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
        blacklist: ["evil.com", "maliciousdomain.net"]
      });
    }
  });
});