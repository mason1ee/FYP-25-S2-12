window.showCustomAlert = function(message, duration = 0) {
  const alertBox = document.getElementById("custom-alert");
  const alertMessage = document.getElementById("alert-message");

  if (!alertBox || !alertMessage) {
    console.log("Custom alert elements not found in the DOM.");
    return;
  }

  alertMessage.textContent = message;
  alertBox.classList.remove("hidden");

  if (duration > 0) {
    setTimeout(() => {
      alertBox.classList.add("hidden");
    }, duration);
  }
};

window.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("alert-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const alertBox = document.getElementById("custom-alert");
      if (alertBox) alertBox.classList.add("hidden");
    });
  }
});