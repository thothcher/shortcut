// Static demo only: gives a sample book the platform's "ბიბლიოთეკა" button and e-mail watermark,
// as the real server does (src/bookhost.js → injectBar). demo.js remembers whose library to return to.
(() => {
  const me = document.currentScript;
  const saved = (key) => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };
  const bar = document.createElement('script');
  bar.src = new URL('../js/bar.js', me.src).href;
  bar.dataset.library = saved('shortcut-demo-library') || new URL('../../', me.src).href;
  bar.dataset.app = me.dataset.app || ''; // APP_NAME, written by demo/build.js
  const email = saved('shortcut-demo-email');
  if (email) bar.dataset.wm = email;
  document.head.append(bar);
})();
