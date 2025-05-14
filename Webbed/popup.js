chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    function: collectScriptData
  });
});

function collectScriptData() {
  const scripts = document.querySelectorAll('script');
  const results = [];

  scripts.forEach((script, index) => {
    const src = script.src || 'inline';
    const usesEval = /eval\(/i.test(script.innerText);
    const isInline = !script.src;
    const suspicious = usesEval || isInline;

    results.push({
      index,
      src,
      usesEval,
      isInline,
      suspicious
    });
  });

  chrome.runtime.sendMessage({ type: 'SCRIPT_RESULTS', results });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCRIPT_RESULTS') {
    const container = document.getElementById('scriptResults');
    container.innerHTML = msg.results.map(script => `
      <div class="script-entry ${script.suspicious ? 'danger' : 'safe'}">
        <strong>Script #${script.index}</strong><br>
        Source: ${script.src}<br>
        Inline: ${script.isInline}<br>
        Uses eval(): ${script.usesEval}
      </div>
    `).join('');
  }
});
