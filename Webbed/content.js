(() => {
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

  // Send data to the popup via the background script
  window.postMessage({ type: "SCRIPT_ANALYSIS", data: results }, "*");
})();
