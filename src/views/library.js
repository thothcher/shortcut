import { config } from '../config.js';
import { html } from '../lib/html.js';
import { daysLeft, firstName, formatDate, formatMoney } from '../lib/format.js';
import { canOpenBook, hasAccess } from '../users.js';
import { page, csrfField } from './layout.js';
import { icon } from './icons.js';
import { bookCard, emptyState } from './components.js';

function cardState(user, book) {
  if (!book.is_published) return 'hidden';
  if (book.is_free) return 'free';
  return canOpenBook(user, book) ? 'open' : 'locked';
}

function accessBanner(user) {
  if (user.role === 'admin') return '';
  if (!hasAccess(user)) {
    return html`<div class="banner">
      <span class="banner__icon">${icon('sparkles', 22)}</span>
      <div class="banner__text">
        <strong>გახსენი ყველა მასალა ${config.plan.days} დღით — მხოლოდ ${formatMoney(config.plan.amount)}</strong>
        <span>${user.access_until ? `წვდომის ვადა ამოიწურა ${formatDate(user.access_until)}.` : 'კონსპექტები, ბარათები, თამაშები და ტესტები ყველა საგანში.'}</span>
      </div>
      <a class="btn btn--primary" href="/pricing">გააქტიურე ${icon('arrowRight', 18)}</a>
    </div>`;
  }
  const left = daysLeft(user.access_until);
  if (left <= 3) {
    return html`<div class="banner banner--warn">
      <span class="banner__icon">${icon('clock', 22)}</span>
      <div class="banner__text">
        <strong>წვდომის ვადა ${left} დღეში იწურება</strong>
        <span>ვადა: ${formatDate(user.access_until)}. გააგრძელე, რომ სწავლა არ შეგიწყდეს.</span>
      </div>
      <a class="btn btn--primary" href="/pricing">გაგრძელება</a>
    </div>`;
  }
  return '';
}

/**
 * universities: [{ id, short_name, programs: [{ id, name }] }]
 * program: selected { id, name, short_name } or null
 */
export function libraryPage(c, { universities, program, isOwnProgram, books, recent, free, unis }) {
  const user = c.user;
  const card = (b) => bookCard(b, { state: cardState(user, b), unis: unis.get(b.id) });

  const body = html`<div class="container library">
    <div class="library__head">
      <div>
        ${program && html`<p class="eyebrow">${icon('cap', 16)} ${program.short_name} · ${program.name}</p>`}
        <h1>გამარჯობა, ${firstName(user.name)}!</h1>
      </div>
      ${hasAccess(user) &&
      user.role !== 'admin' &&
      html`<p class="access-line">${icon('checkCircle', 18)} წვდომა აქტიურია · ვადა: ${formatDate(user.access_until)}</p>`}
    </div>

    ${accessBanner(user)}

    ${recent.length > 0 &&
    html`<section class="shelf">
      <h2 class="shelf__title">გააგრძელე სწავლა</h2>
      <div class="books books--row">${recent.map(card)}</div>
    </section>`}

    <section class="shelf">
      <div class="shelf__head">
        <h2 class="shelf__title">${isOwnProgram ? 'შენი საგნები' : program ? `${program.short_name} · ${program.name}` : 'საგნები'}</h2>
        <form class="toolbar" method="get" action="/library" role="search">
          <label class="search">
            ${icon('search', 18)}
            <span class="visually-hidden">ძებნა</span>
            <input type="search" placeholder="მოძებნე საგანი…" data-filter="#books-main" autocomplete="off">
          </label>
          <label class="visually-hidden" for="program-switch">პროგრამის შეცვლა</label>
          <select class="select select--sm" id="program-switch" name="program" data-autosubmit>
            ${universities.map(
              (u) => html`<optgroup label="${u.short_name}">
                ${u.programs.map((p) => html`<option value="${p.id}" ${p.id === program?.id ? 'selected' : ''}>${p.name}</option>`)}
              </optgroup>`,
            )}
          </select>
          <button class="btn btn--light btn--sm js-hide" type="submit">ნახვა</button>
        </form>
      </div>

      ${books.length
        ? html`<div class="books" id="books-main">${books.map(card)}</div>
            <p class="no-results muted" hidden>ამ სიტყვით საგანი ვერ მოიძებნა.</p>`
        : emptyState({
            iconName: 'book',
            title: 'ამ პროგრამისთვის მასალები ჯერ არ დამატებულა',
            text: 'გვითხარი, რომელი საგანი გჭირდება — ქვემოთ მოცემული ფორმით.',
          })}
    </section>

    ${free.length > 0 &&
    !hasAccess(user) &&
    html`<section class="shelf">
      <h2 class="shelf__title">სცადე უფასოდ</h2>
      <div class="books books--row">${free.map(card)}</div>
    </section>`}

    <section class="request">
      <div class="request__text">
        <h2>შენი საგანი ვერ იპოვე?</h2>
        <p class="muted">მოგვწერე საგნის სახელი (სურვილისამებრ — ლექტორიც). ყველაზე მოთხოვნად საგნებს პირველ რიგში ვამატებთ.</p>
      </div>
      <form class="request__form" method="post" action="/requests">
        ${csrfField(c)}
        <input type="hidden" name="program_id" value="${program?.id || ''}">
        <label class="visually-hidden" for="request-text">საგნის სახელი</label>
        <input class="input" id="request-text" name="text" required maxlength="300" placeholder="მაგ. სოციალური ფსიქოლოგია — ნ. ბერიძე">
        <button class="btn btn--primary" type="submit">${icon('message', 18)} გაგზავნა</button>
      </form>
    </section>
  </div>`;

  return page(c, { title: 'ბიბლიოთეკა', body });
}
