import { html } from '../lib/html.js';
import { page } from './layout.js';
import { icon } from './icons.js';
import { fieldError, invalid } from './components.js';

function authShell(c, { title, intro, body, foot }) {
  return page(c, {
    title,
    variant: 'auth',
    body: html`<section class="auth">
      <div class="auth__card">
        <h1>${title}</h1>
        ${intro && html`<p class="muted auth__intro">${intro}</p>`}
        ${body}
      </div>
      ${foot && html`<p class="auth__foot">${foot}</p>`}
    </section>`,
  });
}

const formError = (errors) =>
  errors?._form ? html`<div class="alert alert--error" role="alert">${icon('alert')}<span>${errors._form}</span></div>` : '';

const passwordInput = ({ name, id = name, autocomplete, value = '', errors, minlength }) => html`<div class="password">
  <input class="input" type="password" id="${id}" name="${name}" autocomplete="${autocomplete}" required
    ${minlength ? html`minlength="${minlength}"` : ''} maxlength="128" value="${value}"${invalid(errors, name)}>
  <button class="password__toggle" type="button" data-toggle-password="${id}" aria-label="პაროლის ჩვენება">${icon('eye', 18)}</button>
</div>`;

export function loginPage(c, { values = {}, errors = {}, next = '' } = {}) {
  return authShell(c, {
    title: 'შესვლა',
    intro: 'კეთილი იყოს შენი დაბრუნება!',
    body: html`<form method="post" action="/login${next ? `?next=${encodeURIComponent(next)}` : ''}" class="form" novalidate>
      ${formError(errors)}
      <div class="field">
        <label class="label" for="email">ელ-ფოსტა</label>
        <input class="input" type="email" id="email" name="email" autocomplete="email" required maxlength="254" value="${values.email || ''}" autofocus>
      </div>
      <div class="field">
        <div class="label-row"><label class="label" for="password">პაროლი</label><a class="small" href="/forgot">დაგავიწყდა?</a></div>
        ${passwordInput({ name: 'password', autocomplete: 'current-password', errors })}
      </div>
      <button class="btn btn--primary btn--block btn--lg" type="submit">შესვლა</button>
    </form>`,
    foot: html`არ გაქვს ანგარიში? <a href="/register${next ? `?next=${encodeURIComponent(next)}` : ''}">დარეგისტრირდი</a>`,
  });
}

/**
 * universities: [{ id, short_name, name, programs: [{ id, name }] }]
 * The program list is filtered by university with JS; without JS one grouped list still works.
 */
export function registerPage(c, { universities, values = {}, errors = {}, next = '' }) {
  const selectedProgram = Number(values.program_id) || 0;
  const selectedUni =
    Number(values.university_id) || universities.find((u) => u.programs.some((p) => p.id === selectedProgram))?.id || 0;
  return authShell(c, {
    title: 'რეგისტრაცია',
    intro: 'შექმენი ანგარიში და აირჩიე შენი პროგრამა — ბიბლიოთეკა შენს საგნებს გაჩვენებს.',
    body: html`<form method="post" action="/register${next ? `?next=${encodeURIComponent(next)}` : ''}" class="form" novalidate>
      ${formError(errors)}
      <div class="field">
        <label class="label" for="name">სახელი და გვარი</label>
        <input class="input" id="name" name="name" autocomplete="name" required maxlength="80" value="${values.name || ''}"${invalid(errors, 'name')}>
        ${fieldError(errors, 'name')}
      </div>
      <div class="field">
        <label class="label" for="email">ელ-ფოსტა</label>
        <input class="input" type="email" id="email" name="email" autocomplete="email" required maxlength="254" value="${values.email || ''}"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <div class="field">
        <label class="label" for="password">პაროლი</label>
        ${passwordInput({ name: 'password', autocomplete: 'new-password', errors, minlength: 8 })}
        ${errors.password ? fieldError(errors, 'password') : html`<p class="hint">მინიმუმ 8 სიმბოლო.</p>`}
      </div>
      <div class="field-row">
        <div class="field">
          <label class="label" for="university_id">უნივერსიტეტი</label>
          <select class="select" id="university_id" name="university_id" data-university-select>
            <option value="">აირჩიე…</option>
            ${universities.map((u) => html`<option value="${u.id}" ${u.id === selectedUni ? 'selected' : ''}>${u.short_name}</option>`)}
          </select>
        </div>
        <div class="field">
          <label class="label" for="program_id">ფაკულტეტი / პროგრამა</label>
          <select class="select" id="program_id" name="program_id" required data-program-select${invalid(errors, 'program_id')}>
            <option value="">აირჩიე…</option>
            ${universities.map(
              (u) => html`<optgroup label="${u.short_name}" data-university="${u.id}">
                ${u.programs.map((p) => html`<option value="${p.id}" ${p.id === selectedProgram ? 'selected' : ''}>${p.name}</option>`)}
              </optgroup>`,
            )}
          </select>
        </div>
      </div>
      ${fieldError(errors, 'program_id')}
      <label class="check">
        <input type="checkbox" name="terms" value="1" required ${values.terms ? 'checked' : ''}${invalid(errors, 'terms')}>
        <span>ვეთანხმები <a href="/terms" target="_blank">წესებსა და პირობებს</a> და <a href="/privacy" target="_blank">კონფიდენციალურობის პოლიტიკას</a>.</span>
      </label>
      ${fieldError(errors, 'terms')}
      <button class="btn btn--primary btn--block btn--lg" type="submit">ანგარიშის შექმნა</button>
    </form>`,
    foot: html`უკვე გაქვს ანგარიში? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">შესვლა</a>`,
  });
}

export function forgotPage(c, { values = {}, errors = {}, sent = false } = {}) {
  if (sent) {
    return authShell(c, {
      title: 'შეამოწმე ელ-ფოსტა',
      body: html`<div class="sent">
        <span class="sent__icon">${icon('inbox', 28)}</span>
        <p>თუ <strong>${values.email}</strong> რეგისტრირებულია, მასზე პაროლის აღდგენის ბმული გაიგზავნა. ბმული 1 საათი მოქმედებს.</p>
        <p class="muted small">ვერ პოულობ? შეამოწმე Spam / Promotions საქაღალდე.</p>
      </div>`,
      foot: html`<a href="/login">${icon('arrowLeft', 16)} შესვლაზე დაბრუნება</a>`,
    });
  }
  return authShell(c, {
    title: 'პაროლის აღდგენა',
    intro: 'შეიყვანე რეგისტრაციისას მითითებული ელ-ფოსტა — გამოგიგზავნით ბმულს ახალი პაროლის დასაყენებლად.',
    body: html`<form method="post" action="/forgot" class="form" novalidate>
      ${formError(errors)}
      <div class="field">
        <label class="label" for="email">ელ-ფოსტა</label>
        <input class="input" type="email" id="email" name="email" autocomplete="email" required maxlength="254" value="${values.email || ''}" autofocus${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <button class="btn btn--primary btn--block btn--lg" type="submit">ბმულის გაგზავნა</button>
    </form>`,
    foot: html`<a href="/login">${icon('arrowLeft', 16)} შესვლაზე დაბრუნება</a>`,
  });
}

export function resetPage(c, { token, errors = {} }) {
  return authShell(c, {
    title: 'ახალი პაროლი',
    intro: 'მოიფიქრე ახალი პაროლი — მინიმუმ 8 სიმბოლო.',
    body: html`<form method="post" action="/reset/${token}" class="form" novalidate>
      ${formError(errors)}
      <div class="field">
        <label class="label" for="password">ახალი პაროლი</label>
        ${passwordInput({ name: 'password', autocomplete: 'new-password', errors, minlength: 8 })}
        ${fieldError(errors, 'password')}
      </div>
      <div class="field">
        <label class="label" for="password2">გაიმეორე პაროლი</label>
        ${passwordInput({ name: 'password2', autocomplete: 'new-password', errors, minlength: 8 })}
        ${fieldError(errors, 'password2')}
      </div>
      <button class="btn btn--primary btn--block btn--lg" type="submit">პაროლის შენახვა</button>
    </form>`,
  });
}
