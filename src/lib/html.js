// Tiny HTML templating with automatic escaping (no template engine needed).
//
//   html`<p>${user.name}</p>`        → the name is escaped
//   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`  → arrays are joined
//   ${cond && html`...`}             → false / null / undefined render nothing
//   raw(trustedString)               → inserted as-is (only for HTML you wrote yourself)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(String(value ?? ''));

function stringify(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += stringify(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}
