// preload-darkmode.js
const darkMode = localStorage.getItem('darkMode') === 'true';
if (darkMode) {
  document.documentElement.classList.add('dark-mode-toggle');
}