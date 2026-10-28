// Small progressive enhancements. Every page also works without JavaScript.
document.documentElement.classList.add('js');

// Instant search over the book grid.
for (const input of document.querySelectorAll('input[data-filter]')) {
  const grid = document.querySelector(input.dataset.filter);
  if (!grid) continue;
  const empty = grid.parentElement.querySelector('.no-results');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const card of grid.querySelectorAll('.book')) {
      const match = !q || card.dataset.search.includes(q);
      card.hidden = !match;
      if (match) shown++;
    }
    if (empty) empty.hidden = shown > 0;
  });
}

// Selects that submit their form on change (program switcher).
for (const select of document.querySelectorAll('select[data-autosubmit]')) {
  select.addEventListener('change', () => select.form.requestSubmit());
}

// Registration: show only the chosen university's programs.
const uniSelect = document.querySelector('[data-university-select]');
const programSelect = document.querySelector('[data-program-select]');
if (uniSelect && programSelect) {
  const groups = [...programSelect.querySelectorAll('optgroup')].map((g) => ({
    uni: g.dataset.university,
    options: [...g.querySelectorAll('option')].map((o) => ({ value: o.value, text: o.textContent })),
  }));
  const render = () => {
    const current = programSelect.value;
    const group = groups.find((g) => g.uni === uniSelect.value);
    programSelect.replaceChildren(new Option(group ? 'აირჩიე…' : 'ჯერ აირჩიე უნივერსიტეტი', ''));
    for (const o of group?.options || []) programSelect.append(new Option(o.text, o.value, false, o.value === current));
    programSelect.disabled = !group;
  };
  uniSelect.addEventListener('change', render);
  render();
}

// Show / hide password.
for (const button of document.querySelectorAll('[data-toggle-password]')) {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.classList.toggle('is-on', show);
    button.setAttribute('aria-label', show ? 'პაროლის დამალვა' : 'პაროლის ჩვენება');
  });
}

// Confirm before destructive actions.
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-confirm]');
  if (el && !window.confirm(el.dataset.confirm)) event.preventDefault();
});

// Admin: suggest a Latin address (slug) from a Georgian title, and preview the book's subdomain.
const GEO = { ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h' };
const toSlug = (text) =>
  [...text.toLowerCase()].map((ch) => GEO[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

const slugInput = document.querySelector('[data-slug-preview]');
if (slugInput) {
  const preview = document.querySelector(slugInput.dataset.slugPreview);
  const title = document.getElementById('title');
  let touched = Boolean(slugInput.value);
  const update = () => {
    if (preview) preview.textContent = `${slugInput.value || 'slug'}.${preview.dataset.domain}`;
  };
  slugInput.addEventListener('input', () => {
    touched = true;
    update();
  });
  title?.addEventListener('input', () => {
    if (touched) return;
    slugInput.value = toSlug(title.value);
    update();
  });
}

// Admin: feedback while a big ZIP uploads.
for (const form of document.querySelectorAll('form[data-upload]')) {
  form.addEventListener('submit', () => {
    form.querySelector('.upload-progress')?.removeAttribute('hidden');
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
  });
}
