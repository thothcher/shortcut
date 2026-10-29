// Added by the platform to every book page: a small "back to library" button and a faint
// watermark with the reader's e-mail (discourages sharing screenshots). Lives in a closed
// Shadow DOM so it cannot break the book's own styles, and the book cannot restyle it.
(() => {
  const script = document.currentScript;
  if (!script || window.__shortcutBar) return;
  window.__shortcutBar = true;

  const library = script.dataset.library;
  const appName = script.dataset.app || '';
  const watermark = script.dataset.wm || '';

  const CSS = `
    :host { all: initial; }
    .back {
      position: fixed; z-index: 2147483647;
      left: max(14px, env(safe-area-inset-left)); bottom: max(14px, env(safe-area-inset-bottom));
      display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px 0 12px;
      border-radius: 999px; background: rgba(39, 49, 47, 0.9); color: #fff; text-decoration: none;
      font: 500 14px/1 "Noto Sans Georgian", "Segoe UI", system-ui, sans-serif;
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.2); opacity: 0.92;
      transition: opacity 0.2s, transform 0.2s;
    }
    .back:hover, .back:focus-visible { opacity: 1; transform: translateY(-1px); }
    .back:focus-visible { outline: 2px solid #7fa896; outline-offset: 3px; }
    .back svg { width: 18px; height: 18px; flex: none; }
    @media (max-width: 640px) {
      .back { width: 44px; height: 44px; padding: 0; justify-content: center; }
      .back span { display: none; }
    }
    @media print { .back { display: none; } }
    .wm { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; background-repeat: repeat; }
  `;

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>';

  function watermarkUrl(text) {
    const safe = text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280">' +
      '<text x="220" y="140" text-anchor="middle" transform="rotate(-24 220 140)" ' +
      'font-family="system-ui, sans-serif" font-size="14" fill="rgb(128,128,128)" fill-opacity="0.09">' +
      safe +
      '</text></svg>';
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  function mount() {
    if (document.querySelector('shortcut-bar')) return;
    const host = document.createElement('shortcut-bar');
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);

    const link = document.createElement('a');
    link.className = 'back';
    link.href = library;
    link.setAttribute('aria-label', `${appName} — ბიბლიოთეკა`);
    link.innerHTML = `${ICON}<span>ბიბლიოთეკა</span>`;
    root.append(link);

    if (watermark) {
      const layer = document.createElement('div');
      layer.className = 'wm';
      layer.style.backgroundImage = watermarkUrl(watermark);
      root.append(layer);
    }
    document.documentElement.append(host);
  }

  // Wait until the page (and frameworks such as React or Angular) finished starting up.
  const start = () => setTimeout(mount, 300);
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();
