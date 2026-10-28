import { config } from '../config.js';
import { html } from '../lib/html.js';
import { daysLeft, formatDate, formatDateTime, formatMoney, ORDER_STATUS } from '../lib/format.js';
import { hasAccess } from '../users.js';
import { page, csrfField } from './layout.js';
import { icon } from './icons.js';
import { fieldError, invalid } from './components.js';

/** "Chrome · Windows" from a user-agent string (good enough for a device list). */
export function deviceName(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'მოწყობილობა';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'ბრაუზერი';
  return `${browser} · ${os}`;
}

export const statusTag = (status) => html`<span class="tag tag--${status}">${ORDER_STATUS[status] || status}</span>`;

export function accountPage(c, { universities, orders, sessions, profileErrors = {}, passwordErrors = {}, values = {} }) {
  const user = c.user;
  const active = hasAccess(user);
  const body = html`<section class="container account">
    <h1>ჩემი ანგარიში</h1>
    <div class="account__grid">
      <div class="card card--access ${active ? 'is-active' : ''}">
        <h2>${icon('wallet', 20)} წვდომა</h2>
        ${user.role === 'admin'
          ? html`<p>ადმინისტრატორს ყველა მასალაზე აქვს წვდომა.</p>`
          : active
            ? html`<p class="big">${daysLeft(user.access_until)} დღე დარჩა</p>
                <p class="muted">ვადა: ${formatDate(user.access_until)}</p>
                <a class="btn btn--light" href="/pricing">ვადის გაგრძელება</a>`
            : html`<p class="big">არ არის აქტიური</p>
                <p class="muted">${formatMoney(config.plan.amount)} — ${config.plan.days} დღე, ავტომატური ჩამოჭრის გარეშე.</p>
                <a class="btn btn--primary" href="/pricing">გააქტიურე</a>`}
      </div>

      <div class="card">
        <h2>${icon('user', 20)} პროფილი</h2>
        <form method="post" action="/account/profile" class="form">
          ${csrfField(c)}
          <div class="field">
            <label class="label" for="name">სახელი და გვარი</label>
            <input class="input" id="name" name="name" required maxlength="80" value="${values.name ?? user.name}"${invalid(profileErrors, 'name')}>
            ${fieldError(profileErrors, 'name')}
          </div>
          <div class="field">
            <label class="label" for="email">ელ-ფოსტა</label>
            <input class="input" id="email" value="${user.email}" disabled>
          </div>
          <div class="field">
            <label class="label" for="program_id">ფაკულტეტი / პროგრამა</label>
            <select class="select" id="program_id" name="program_id" required${invalid(profileErrors, 'program_id')}>
              ${universities.map(
                (u) => html`<optgroup label="${u.short_name}">
                  ${u.programs.map((p) => html`<option value="${p.id}" ${p.id === user.program_id ? 'selected' : ''}>${p.name}</option>`)}
                </optgroup>`,
              )}
            </select>
            ${fieldError(profileErrors, 'program_id')}
          </div>
          <button class="btn btn--primary" type="submit">შენახვა</button>
        </form>
      </div>

      <div class="card">
        <h2>${icon('lock', 20)} პაროლის შეცვლა</h2>
        <form method="post" action="/account/password" class="form">
          ${csrfField(c)}
          <div class="field">
            <label class="label" for="current">მიმდინარე პაროლი</label>
            <input class="input" type="password" id="current" name="current" autocomplete="current-password" required${invalid(passwordErrors, 'current')}>
            ${fieldError(passwordErrors, 'current')}
          </div>
          <div class="field">
            <label class="label" for="new-password">ახალი პაროლი</label>
            <input class="input" type="password" id="new-password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required${invalid(passwordErrors, 'password')}>
            ${fieldError(passwordErrors, 'password')}
          </div>
          <button class="btn btn--light" type="submit">პაროლის შეცვლა</button>
        </form>
      </div>

      <div class="card">
        <h2>${icon('phone', 20)} მოწყობილობები</h2>
        <p class="muted small">ერთდროულად შეიძლება ${config.maxSessionsPerUser} მოწყობილობაზე შესვლა. ახალ მოწყობილობაზე შესვლისას ყველაზე ძველი სესია ავტომატურად იხურება.</p>
        <ul class="devices">
          ${sessions.map(
            (s) => html`<li>
              <span>${deviceName(s.user_agent || '')}${s.id === user.session_id && html` <span class="tag tag--approved">ეს მოწყობილობა</span>`}</span>
              <span class="muted small">${formatDateTime(s.last_seen_at)}</span>
            </li>`,
          )}
        </ul>
        ${sessions.length > 1 &&
        html`<form method="post" action="/account/sessions">${csrfField(c)}<button class="btn btn--light btn--sm" type="submit">სხვა მოწყობილობებიდან გამოსვლა</button></form>`}
      </div>

      <div class="card card--wide">
        <h2>${icon('card', 20)} გადახდების ისტორია</h2>
        ${orders.length
          ? html`<div class="table-wrap"><table class="table table--history">
              <thead><tr><th>თარიღი</th><th>თანხა</th><th>პერიოდი</th><th>სტატუსი</th></tr></thead>
              <tbody>
                ${orders.map(
                  (o) => html`<tr>
                    <td>${formatDateTime(o.created_at)}</td>
                    <td>${o.provider === 'manual' ? 'საჩუქარი' : formatMoney(o.amount)}</td>
                    <td>${o.days} დღე</td>
                    <td>${statusTag(o.status)}</td>
                  </tr>`,
                )}
              </tbody>
            </table></div>`
          : html`<p class="muted">გადახდები ჯერ არ არის.</p>`}
      </div>
    </div>

    <form method="post" action="/logout" class="account__logout">
      ${csrfField(c)}
      <button class="btn btn--ghost" type="submit">${icon('logout', 18)} გასვლა</button>
    </form>
  </section>`;
  return page(c, { title: 'ჩემი ანგარიში', body });
}
