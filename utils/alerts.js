// showCustomAlert("Hello!", 3000) → works with delay
// showCustomAlert("Reloading tab...", 3000, false) → message hides immediately on reload

window.showCustomAlert = function(message, duration = 3000, persistOnReload = true) {
  const alertBox = document.getElementById("custom-alert");
  const alertMessage = document.getElementById("alert-message");

  if (!alertBox || !alertMessage) {
    console.log("Custom alert elements not found in the DOM.");
    return;
  }

  alertMessage.textContent = message;
  alertBox.classList.remove("hidden");

  // If alert should NOT persist on reload, tag it in sessionStorage
  if (!persistOnReload) {
    sessionStorage.setItem("hideCustomAlertOnLoad", "true");
  }

  if (duration > 0) {
    setTimeout(() => {
      alertBox.classList.add("hidden");
    }, duration);
  }
};

window.showCustomConfirm = function(message, onConfirm, onCancel = null, refreshDelayMs = 0) {
  const confirmBox = document.getElementById("custom-confirm");
  const confirmMessage = document.getElementById("confirm-message");
  const yesBtn = document.getElementById("confirm-yes");
  const noBtn = document.getElementById("confirm-no");

  if (!confirmBox || !confirmMessage || !yesBtn || !noBtn) {
    console.warn("Custom confirm elements not found.");
    return;
  }

  confirmMessage.textContent = message;
  confirmBox.classList.remove("hidden");

  const cleanup = () => {
    confirmBox.classList.add("hidden");
    yesBtn.removeEventListener("click", yesHandler);
    noBtn.removeEventListener("click", noHandler);
  };

  const yesHandler = () => {
    cleanup();
    if (refreshDelayMs > 0) {
      setTimeout(() => {
        onConfirm?.();
      }, refreshDelayMs);
    } else {
      onConfirm?.();
    }
  };

  const noHandler = () => {
    cleanup();
    if (onCancel) onCancel();
  };

  yesBtn.addEventListener("click", yesHandler);
  noBtn.addEventListener("click", noHandler);
};

// DOMContentLoaded setup
window.addEventListener("DOMContentLoaded", () => {
  const alertBox = document.getElementById("custom-alert");

  if (sessionStorage.getItem("hideCustomAlertOnLoad") === "true") {
    if (alertBox) alertBox.classList.add("hidden");
    sessionStorage.removeItem("hideCustomAlertOnLoad");
  }

  const closeBtn = document.getElementById("alert-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (alertBox) alertBox.classList.add("hidden");
    });
  }
});