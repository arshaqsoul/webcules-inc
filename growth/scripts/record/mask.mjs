// Privacy mask for recordings: blur every email address on screen except the ones a take explicitly allows.
// Injected into every document before capture, so the pixels that reach the frames never contain other people's addresses.
//
//   export const mask = { allowEmails: ["arshaqhishamsl@gmail.com"] };   // in a take script

export function maskInit(allowEmails = []) {
  return `(() => {
  if (window.__growthMask) return;
  window.__growthMask = true;
  const ALLOW = ${JSON.stringify(allowEmails.map((e) => e.toLowerCase()))};
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi;
  const BLUR = 'blur(7px)';
  const bad = (s) => (String(s).match(EMAIL) || []).some((m) => !ALLOW.includes(m.toLowerCase()));
  const hide = (el) => { if (el && el.style && el.style.filter !== BLUR) { el.style.filter = BLUR; el.style.userSelect = 'none'; } };
  function sweep(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (bad(n.nodeValue)) hide(n.parentElement);
    }
    for (const el of root.querySelectorAll ? root.querySelectorAll('input,textarea,select') : []) {
      if (bad(el.value)) hide(el);
    }
  }
  let queued = false;
  const run = () => { queued = false; sweep(document.body); };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  const start = () => {
    sweep(document.body);
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value'] });
    addEventListener('input', schedule, true);
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();`;
}
