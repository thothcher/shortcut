import { html } from '../lib/html.js';
import { DAY } from '../config.js';
import { icon } from './icons.js';

const TONES = ['sage', 'sky', 'blush', 'sand', 'lilac'];

/** Same book → same colour, every time. */
export function toneFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Smaller title font when the title has a long word, so words are not split in the middle. */
function titleSize(title) {
  const longest = Math.max(0, ...String(title).split(/[\s/–—-]+/).map((w) => [...w].length));
  if (longest >= 17) return 'cover__title--xs';
  if (longest >= 14) return 'cover__title--s';
  if (longest >= 11) return 'cover__title--m';
  return '';
}

/** Book cover: the uploaded image, or a generated "book" in one of five calm colours. */
export function cover(book) {
  if (book.cover) {
    return html`<div class="cover cover--image"><img src="/covers/${book.cover}" alt="" loading="lazy" decoding="async"></div>`;
  }
  return html`<div class="cover cover--${toneFor(book.slug)}" aria-hidden="true">
    <span class="cover__spine"></span>
    <span class="cover__title ${titleSize(book.title)}">${book.title}</span>
    ${book.author && html`<span class="cover__author">${book.author}</span>`}
  </div>`;
}

/**
 * A book in the grid.
 * state: 'open' (can read), 'locked' (needs subscription), 'free', 'hidden' (admin preview)
 */
export function bookCard(book, { state, unis = '', href } = {}) {
  const isNew = Date.now() - book.created_at < 14 * DAY;
  const meta = [book.semester ? `${book.semester} სემესტრი` : '', unis].filter(Boolean).join(' · ');
  const search = `${book.title} ${book.author || ''} ${book.description || ''}`.toLowerCase();
  return html`<a class="book ${state === 'locked' ? 'book--locked' : ''}" href="${href || `/open/${book.slug}`}" data-search="${search}">
    <div class="book__cover">
      ${cover(book)}
      <div class="book__badges">
        ${state === 'free' && html`<span class="badge badge--free">უფასო</span>`}
        ${state === 'hidden' && html`<span class="badge badge--hidden">${icon('eye', 14)}დამალული</span>`}
        ${isNew && state !== 'hidden' && html`<span class="badge badge--new">ახალი</span>`}
      </div>
      ${state === 'locked' && html`<span class="book__lock" title="საჭიროა გამოწერა">${icon('lock', 16)}</span>`}
    </div>
    <div class="book__body">
      <h3 class="book__title">${book.title}</h3>
      ${book.author && html`<p class="book__author">${book.author}</p>`}
      ${meta && html`<p class="book__meta">${meta}</p>`}
    </div>
  </a>`;
}

export function emptyState({ iconName = 'inbox', title, text, action = '' }) {
  return html`<div class="empty">
    <div class="empty__icon">${icon(iconName, 28)}</div>
    <h3>${title}</h3>
    ${text && html`<p class="muted">${text}</p>`}
    ${action}
  </div>`;
}

/** Error line under a form field. */
export const fieldError = (errors, name) =>
  errors?.[name] ? html`<p class="field__error" id="${name}-error">${errors[name]}</p>` : '';

/** Attributes for an input that may have an error. */
export const invalid = (errors, name) => (errors?.[name] ? html` aria-invalid="true" aria-describedby="${name}-error"` : '');
