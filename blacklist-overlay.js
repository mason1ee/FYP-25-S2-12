if (!sessionStorage.getItem("bypassJSBlocker")) {
  document.documentElement.style.display = "none";

  const blurWrapper = document.createElement('div');
  blurWrapper.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(5px);
    z-index: 999998;
    pointer-events: none;
  `;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: #1e1e1e;
    color: white;
    padding: 30px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    z-index: 999999;
    max-width: 400px;
    width: 90%;
    font-family: sans-serif;
    text-align: center;
  `;

  const message = document.createElement('div');
  message.textContent = "⚠️ Warning: This website is blacklisted.\nJavaScript has been blocked for your safety.\nProceed with caution. parts of the site may not function properly.";
  message.style.whiteSpace = "pre-line";

  const closeButton = document.createElement('span');
  closeButton.textContent = "×";
  closeButton.style.cssText = `
    position: absolute;
    top: 10px; right: 15px;
    cursor: pointer;
    font-size: 24px;
    color: #bbb;
  `;

  closeButton.onclick = () => {
    overlay.remove();
    blurWrapper.remove();
  };

  overlay.appendChild(closeButton);
  overlay.appendChild(message);

  const addOverlay = () => {
    document.body.appendChild(blurWrapper);
    document.body.appendChild(overlay);
    document.documentElement.style.display = "block";
  };

  if (document.body) {
    addOverlay();
  } else {
    document.addEventListener("DOMContentLoaded", addOverlay);
  }
}
