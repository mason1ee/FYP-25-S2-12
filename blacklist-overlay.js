if (!sessionStorage.getItem("bypassJSBlocker")) {
  document.documentElement.style.display = "none";

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: #121212; color: white;
    z-index: 999999; display: flex; flex-direction: column;
    align-items: center; justify-content: center; font-family: sans-serif;
    text-align: center; padding: 20px;
  `;

  const message = document.createElement('h2');
  message.textContent = "This website is blacklisted.\nThis page and its scripts have been blocked for browsing safety.";

  overlay.appendChild(message);

  const addOverlay = () => {
    document.body?.appendChild(overlay);
    document.documentElement.style.display = "block";
  };

  if (document.body) {
    addOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", addOverlay);
  }
}
