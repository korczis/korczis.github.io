// Feedback for Flowbite's copy to clipboard, through Flowbite's own API as its documentation shows:
// the CopyClipboard instance (data-copy-to-clipboard-target) copies, and its onCopy callback swaps
// the [data-copy-default] parts for the [data-copy-success] ones, in the trigger and in its Flowbite
// tooltip (named by the trigger's data-copy-tooltip), shows the tooltip, lets a polite live region
// ([data-copy-status], in the same group) say it, and puts everything back after two seconds.
// Flowbite creates its instances on window load; this runs after it. The home's copy-email button.
(() => {
  const RESET_MS = 2000;

  function wire() {
    const instances = window.FlowbiteInstances;
    if (!instances) return;
    for (const trigger of document.querySelectorAll('[data-copy-to-clipboard-target]')) {
      const clipboard = instances.getInstance('CopyClipboard', trigger.getAttribute('data-copy-to-clipboard-target'));
      if (!clipboard) continue;
      const tipId = trigger.getAttribute('data-copy-tooltip');
      const tooltip = tipId ? instances.getInstance('Tooltip', tipId) : null;
      const scopes = [trigger, tipId ? document.getElementById(tipId) : null].filter(Boolean);
      const status = trigger.parentElement?.querySelector('[data-copy-status]');
      const swap = (copied) => {
        for (const scope of scopes) {
          for (const el of scope.querySelectorAll('[data-copy-default]')) el.classList.toggle('hidden', copied);
          for (const el of scope.querySelectorAll('[data-copy-success]')) el.classList.toggle('hidden', !copied);
        }
        if (status) status.textContent = copied ? (window.KorczisHub?.t?.('js_copied') ?? '') : '';
      };
      let timer = null;
      clipboard.updateOnCopyCallback(() => {
        swap(true);
        tooltip?.show();
        clearTimeout(timer);
        timer = setTimeout(() => swap(false), RESET_MS);
      });
    }
  }

  if (document.readyState === 'complete') wire();
  else window.addEventListener('load', wire);
})();
