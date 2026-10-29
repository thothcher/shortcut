// Static demo only (GitHub Pages, made by demo/build.js). There is no server to send forms to,
// so a form opens the page the server would answer with. The build wrote its address into
// data-demo-to (on the form, on a button, or on each <option> of the program switcher).
(() => {
  const script = document.currentScript;

  // The sample books' "ბიბლიოთეკა" button returns to this user's library (see book.js).
  if (script.dataset.library) {
    try {
      localStorage.setItem('shortcut-demo-library', new URL(script.dataset.library, location.href).href);
      localStorage.setItem('shortcut-demo-email', script.dataset.email || '');
    } catch {
      // Storage blocked: the button then goes to the start page.
    }
  }

  const toast = document.createElement('div');
  toast.className = 'demo-toast';
  toast.setAttribute('role', 'status');
  document.body.append(toast);
  let timer;
  function say(text) {
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('is-on'), 4000);
  }

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      event.preventDefault();
      event.stopPropagation(); // the app's own submit handlers (upload progress) have nothing to do here
      if (form.noValidate && !form.reportValidity()) return;

      const email = form.querySelector('input[type="email"]')?.value.trim() || '';
      const to =
        event.submitter?.dataset.demoTo ||
        form.querySelector('option:checked')?.dataset.demoTo ||
        (form.dataset.demoAdmin && /^admin@/i.test(email) ? form.dataset.demoAdmin : '') ||
        form.dataset.demoTo;
      if (to) location.assign(to);
      else say(form.dataset.demoNote || 'სადემონსტრაციო ვერსიაში ცვლილებები არ ინახება.');
    },
    true,
  );
})();
