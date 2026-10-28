// Admin panel views. Plain tables and forms — fast to use, easy to change.
import { config, bookOrigin } from '../config.js';
import { html } from '../lib/html.js';
import { formatDate, formatDateTime, formatMoney, formatShortDateTime } from '../lib/format.js';
import { page, csrfField } from './layout.js';
import { icon } from './icons.js';
import { cover, fieldError, invalid } from './components.js';
import { statusTag, deviceName } from './account.js';

const TABS = [
  ['/admin', 'მიმოხილვა', 'chart'],
  ['/admin/books', 'წიგნები', 'book'],
  ['/admin/universities', 'უნივერსიტეტები', 'landmark'],
  ['/admin/users', 'მომხმარებლები', 'users'],
  ['/admin/orders', 'გადახდები', 'card'],
  ['/admin/requests', 'მოთხოვნები', 'message'],
];

function shell(c, { title, body, actions = '' }) {
  return page(c, {
    title: `${title} · ადმინი`,
    variant: 'admin',
    body: html`<div class="container admin">
      <nav class="admin__tabs" aria-label="ადმინის მენიუ">
        ${TABS.map(([href, label, ic]) => {
          const active = href === '/admin' ? c.path === '/admin' : c.path.startsWith(href);
          return html`<a class="admin__tab ${active ? 'is-active' : ''}" href="${href}">${icon(ic, 18)}<span>${label}</span></a>`;
        })}
      </nav>
      <div class="admin__head"><h1>${title}</h1><div class="admin__actions">${actions}</div></div>
      ${body}
    </div>`,
  });
}

const mb = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const confirmAttr = (text) => html` data-confirm="${text}"`;

// ───────── Overview ─────────

export function overviewPage(c, { stats, recentOrders, topBooks, requests }) {
  const tiles = [
    ['მომხმარებლები', stats.users, `+${stats.usersWeek} ამ კვირაში`],
    ['აქტიური წვდომა', stats.active, 'ახლა გადახდილი'],
    ['შემოსავალი — ეს თვე', formatMoney(stats.revenueMonth), `${stats.ordersMonth} გადახდა`],
    ['წიგნები', `${stats.booksLive} / ${stats.books}`, 'გამოქვეყნებული / სულ'],
  ];
  return shell(c, {
    title: 'მიმოხილვა',
    body: html`
      <div class="stats">
        ${tiles.map(([label, value, sub]) => html`<div class="stat"><p class="stat__label">${label}</p><p class="stat__value">${value}</p><p class="stat__sub">${sub}</p></div>`)}
      </div>
      <div class="admin__cols">
        <section class="card">
          <h2>ბოლო გადახდები</h2>
          ${ordersTable(recentOrders, { compact: true })}
          <a class="small" href="/admin/orders">ყველა გადახდა ${icon('arrowRight', 14)}</a>
        </section>
        <section class="card">
          <h2>პოპულარული წიგნები</h2>
          ${topBooks.length
            ? html`<table class="table"><thead><tr><th>წიგნი</th><th>მკითხველი</th><th>გახსნა</th></tr></thead><tbody>
                ${topBooks.map((b) => html`<tr><td><a href="/admin/books/${b.id}">${b.title}</a></td><td>${b.readers}</td><td>${b.opens}</td></tr>`)}
              </tbody></table>`
            : html`<p class="muted">ჯერ არავის გაუხსნია წიგნი.</p>`}
        </section>
        <section class="card">
          <h2>საგნების მოთხოვნები</h2>
          ${requestsList(requests)}
          <a class="small" href="/admin/requests">ყველა მოთხოვნა ${icon('arrowRight', 14)}</a>
        </section>
      </div>`,
  });
}

function requestsList(requests) {
  if (!requests.length) return html`<p class="muted">მოთხოვნები ჯერ არ არის.</p>`;
  return html`<ul class="list">
    ${requests.map((r) => html`<li><strong>${r.text}</strong><span class="muted small">${r.program ? `${r.uni} · ${r.program}` : ''} · ${formatDateTime(r.created_at)}</span></li>`)}
  </ul>`;
}

// ───────── Books ─────────

export function booksPage(c, { books }) {
  return shell(c, {
    title: 'წიგნები',
    actions: html`<a class="btn btn--primary" href="/admin/books/new">${icon('plus', 18)} ახალი წიგნი</a>`,
    body: books.length
      ? html`<div class="table-wrap"><table class="table table--books">
          <thead><tr><th></th><th>სათაური</th><th>მისამართი</th><th>პროგრამები</th><th>საიტი</th><th>სტატუსი</th></tr></thead>
          <tbody>
            ${books.map(
              (b) => html`<tr>
                <td class="thumb">${cover(b)}</td>
                <td><a href="/admin/books/${b.id}"><strong>${b.title}</strong></a>${b.author && html`<br><span class="muted small">${b.author}</span>`}</td>
                <td><code>${b.slug}</code></td>
                <td>${b.program_count}</td>
                <td>${b.content_version ? html`v${b.content_version} · ${b.content_files} ფაილი · ${mb(b.content_bytes)}` : html`<span class="tag tag--declined">არ არის ატვირთული</span>`}</td>
                <td>${b.is_published ? html`<span class="tag tag--approved">გამოქვეყნებული</span>` : html`<span class="tag">დამალული</span>`} ${b.is_free ? html`<span class="tag tag--processing">უფასო</span>` : ''}</td>
              </tr>`,
            )}
          </tbody>
        </table></div>`
      : html`<div class="card"><p>წიგნები ჯერ არ არის. დაამატე პირველი — შემდეგ ატვირთე მისი საიტის ZIP არქივი.</p></div>`,
  });
}

/** Program checkboxes grouped by university. */
function programPicker(universities, selected) {
  return html`<div class="picker">
    ${universities.map(
      (u) => html`<fieldset class="picker__group">
        <legend>${u.short_name}</legend>
        ${u.programs.map((p) => html`<label class="check"><input type="checkbox" name="program_ids" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}><span>${p.name}</span></label>`)}
      </fieldset>`,
    )}
  </div>`;
}

export function bookFormPage(c, { book, universities, programIds = [], values = {}, errors = {}, uploadError = '', uploadInfo = null }) {
  const isNew = !book;
  const v = { ...(book || {}), ...values };
  const host = `${v.slug || 'slug'}.${config.booksDomain}`;
  const meta = html`<form class="card form" method="post" enctype="multipart/form-data"
      action="${isNew ? '/admin/books' : `/admin/books/${book.id}`}?_csrf=${c.csrf}">
    <h2>ინფორმაცია</h2>
    ${errors._form && html`<p class="alert alert--error">${icon('alert')}<span>${errors._form}</span></p>`}
    <div class="field">
      <label class="label" for="title">სათაური</label>
      <input class="input" id="title" name="title" required maxlength="120" value="${v.title || ''}"${invalid(errors, 'title')}>
      ${fieldError(errors, 'title')}
    </div>
    <div class="field">
      <label class="label" for="slug">მისამართი (ლათინურად)</label>
      <input class="input" id="slug" name="slug" required maxlength="48" pattern="[a-z0-9-]+" value="${v.slug || ''}" data-slug-preview="#slug-host"${invalid(errors, 'slug')}>
      ${errors.slug ? fieldError(errors, 'slug') : html`<p class="hint">წიგნი გაიხსნება მისამართზე: <code id="slug-host" data-domain="${config.booksDomain}">${host}</code></p>`}
    </div>
    <div class="field-row">
      <div class="field">
        <label class="label" for="author">ავტორი / ლექტორი</label>
        <input class="input" id="author" name="author" maxlength="120" value="${v.author || ''}">
      </div>
      <div class="field field--narrow">
        <label class="label" for="semester">სემესტრი</label>
        <input class="input" id="semester" name="semester" type="number" min="1" max="12" value="${v.semester || ''}">
      </div>
    </div>
    <div class="field">
      <label class="label" for="description">მოკლე აღწერა</label>
      <textarea class="textarea" id="description" name="description" rows="3" maxlength="600">${v.description || ''}</textarea>
    </div>
    <div class="field">
      <span class="label">რომელ პროგრამებს ეკუთვნის</span>
      ${programPicker(universities, programIds)}
    </div>
    <div class="field">
      <label class="label" for="cover">ყდა <span class="muted small">(JPG, PNG ან WEBP, 3:4, მაქს. 3 MB — არასავალდებულო)</span></label>
      <div class="cover-field">
        ${book && html`<div class="cover-field__preview">${cover(book)}</div>`}
        <div>
          <input class="input" type="file" id="cover" name="cover" accept="image/jpeg,image/png,image/webp,image/avif">
          ${book?.cover && html`<label class="check"><input type="checkbox" name="remove_cover" value="1"><span>ყდის წაშლა</span></label>`}
          <p class="hint">თუ ყდა არ აქვს, ავტომატურად შეიქმნება ფერადი ყდა სათაურით.</p>
        </div>
      </div>
    </div>
    <div class="toggles">
      <label class="check"><input type="checkbox" name="is_published" value="1" ${v.is_published ? 'checked' : ''}><span><strong>გამოქვეყნებული</strong> — სტუდენტები ხედავენ ბიბლიოთეკაში</span></label>
      <label class="check"><input type="checkbox" name="is_free" value="1" ${v.is_free ? 'checked' : ''}><span><strong>უფასო</strong> — ნებისმიერ დარეგისტრირებულ მომხმარებელს შეუძლია გახსნა</span></label>
    </div>
    <button class="btn btn--primary" type="submit">${isNew ? 'შექმნა' : 'შენახვა'}</button>
  </form>`;

  if (isNew) return shell(c, { title: 'ახალი წიგნი', body: html`<div class="admin__form">${meta}</div>` });

  const upload = html`<div class="stack">
    <form class="card form" method="post" enctype="multipart/form-data" action="/admin/books/${book.id}/content?_csrf=${c.csrf}" data-upload>
      <h2>${icon('upload', 20)} საიტის ატვირთვა</h2>
      ${uploadError && html`<p class="alert alert--error">${icon('alert')}<span>${uploadError}</span></p>`}
      ${uploadInfo && html`<p class="alert alert--ok">${icon('checkCircle')}<span>აიტვირთა v${uploadInfo.version}: ${uploadInfo.files} ფაილი. საბაზო გზა: <code>${uploadInfo.basePath}</code></span></p>`}
      <p class="muted small">ატვირთე ZIP არქივი build საქაღალდით (dist, out ან build — სადაც index.html დევს). არქივში საქაღალდის სიღრმეს მნიშვნელობა არ აქვს. ახალი ატვირთვა ძველ ვერსიას ცვლის.</p>
      <input class="input" type="file" name="zip" accept=".zip,application/zip" required>
      <button class="btn btn--primary" type="submit">${icon('upload', 18)} ატვირთვა</button>
      <p class="upload-progress muted small" hidden>იტვირთება… ნუ დახურავ გვერდს.</p>
    </form>

    <div class="card">
      <h2>საიტი</h2>
      ${book.content_version
        ? html`<dl class="kv">
            <div><dt>ვერსია</dt><dd>v${book.content_version} · ${book.content_files} ფაილი · ${mb(book.content_bytes)}</dd></div>
            <div><dt>მისამართი</dt><dd><code>${bookOrigin(book.slug)}${book.base_path}</code></dd></div>
          </dl>
          <a class="btn btn--light" href="/open/${book.slug}" target="_blank">${icon('external', 18)} გახსნა</a>`
        : html`<p class="muted">საიტი ჯერ არ არის ატვირთული.</p>`}
      <form class="form form--inline" method="post" action="/admin/books/${book.id}/base-path">
        ${csrfField(c)}
        <div class="field">
          <label class="label" for="base_path">საბაზო გზა</label>
          <input class="input" id="base_path" name="base_path" value="${book.base_path}" maxlength="100">
          <p class="hint">ატვირთვისას ავტომატურად განისაზღვრება (მაგ. Angular-ის <code>&lt;base href="/CBT/"&gt;</code> → <code>/CBT/</code>). შეცვალე მხოლოდ მაშინ, თუ საიტი სწორად არ იხსნება.</p>
        </div>
        <button class="btn btn--light btn--sm" type="submit">შენახვა</button>
      </form>
    </div>

    <form class="card card--danger" method="post" action="/admin/books/${book.id}/delete">
      ${csrfField(c)}
      <h2>წიგნის წაშლა</h2>
      <p class="muted small">წაიშლება წიგნი, მისი საიტი და სტატისტიკა. ამის დაბრუნება შეუძლებელია.</p>
      <button class="btn btn--danger btn--sm" type="submit"${confirmAttr(`წავშალო „${book.title}“?`)}>${icon('trash', 16)} წაშლა</button>
    </form>
  </div>`;

  return shell(c, {
    title: book.title,
    actions: html`<a class="btn btn--light" href="/admin/books">${icon('arrowLeft', 18)} ყველა წიგნი</a>`,
    body: html`<div class="admin__split">${meta}${upload}</div>`,
  });
}

// ───────── Universities & programs ─────────

export function universitiesPage(c, { universities, error = '' }) {
  return shell(c, {
    title: 'უნივერსიტეტები და პროგრამები',
    body: html`
      ${error && html`<p class="alert alert--error">${icon('alert')}<span>${error}</span></p>`}
      <div class="unis">
        ${universities.map(
          (u) => html`<section class="card">
            <form class="form form--inline" method="post" action="/admin/universities/${u.id}">
              ${csrfField(c)}
              <div class="field field--narrow"><label class="label">მოკლე სახელი</label><input class="input" name="short_name" required maxlength="20" value="${u.short_name}"></div>
              <div class="field"><label class="label">სრული სახელი</label><input class="input" name="name" required maxlength="160" value="${u.name}"></div>
              <button class="btn btn--light btn--sm" type="submit">შენახვა</button>
            </form>
            <ul class="programs">
              ${u.programs.map(
                (p) => html`<li>
                  <form class="form form--inline" method="post" action="/admin/programs/${p.id}">
                    ${csrfField(c)}
                    <input class="input input--sm" name="name" required maxlength="120" value="${p.name}" aria-label="პროგრამის სახელი">
                    <span class="muted small">${p.students} სტუდ. · ${p.books} წიგნი</span>
                    <button class="btn btn--light btn--sm" type="submit">შენახვა</button>
                    <button class="btn btn--ghost btn--sm" type="submit" formaction="/admin/programs/${p.id}/delete"${confirmAttr(`წავშალო პროგრამა „${p.name}“? სტუდენტებს პროგრამა მოეხსნებათ.`)} aria-label="წაშლა">${icon('trash', 16)}</button>
                  </form>
                </li>`,
              )}
            </ul>
            <form class="form form--inline" method="post" action="/admin/programs">
              ${csrfField(c)}
              <input type="hidden" name="university_id" value="${u.id}">
              <input class="input input--sm" name="name" required maxlength="120" placeholder="ახალი პროგრამა (მაგ. სოციოლოგია)">
              <button class="btn btn--light btn--sm" type="submit">${icon('plus', 16)} დამატება</button>
            </form>
          </section>`,
        )}
        <section class="card">
          <h2>ახალი უნივერსიტეტი</h2>
          <form class="form" method="post" action="/admin/universities">
            ${csrfField(c)}
            <div class="field-row">
              <div class="field field--narrow"><label class="label" for="u-code">კოდი (ლათ.)</label><input class="input" id="u-code" name="code" required maxlength="20" pattern="[a-z0-9-]+" placeholder="sangu"></div>
              <div class="field field--narrow"><label class="label" for="u-short">მოკლე სახელი</label><input class="input" id="u-short" name="short_name" required maxlength="20" placeholder="SANGU"></div>
            </div>
            <div class="field"><label class="label" for="u-name">სრული სახელი</label><input class="input" id="u-name" name="name" required maxlength="160"></div>
            <button class="btn btn--primary btn--sm" type="submit">${icon('plus', 16)} დამატება</button>
          </form>
        </section>
      </div>`,
  });
}

// ───────── Users ─────────

export function usersPage(c, { users, q, total }) {
  return shell(c, {
    title: 'მომხმარებლები',
    body: html`
      <form class="toolbar toolbar--admin" method="get" action="/admin/users" role="search">
        <label class="search">${icon('search', 18)}<input type="search" name="q" value="${q}" placeholder="ელ-ფოსტა ან სახელი"></label>
        <button class="btn btn--light btn--sm" type="submit">ძებნა</button>
        <span class="muted small">სულ: ${total}</span>
      </form>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>სახელი</th><th>ელ-ფოსტა</th><th>პროგრამა</th><th>წვდომა</th><th>რეგისტრაცია</th></tr></thead>
        <tbody>
          ${users.map(
            (u) => html`<tr>
              <td><a href="/admin/users/${u.id}">${u.name}</a>${u.role === 'admin' && html` <span class="tag tag--processing">ადმინი</span>`}${u.is_blocked ? html` <span class="tag tag--declined">დაბლოკილი</span>` : ''}</td>
              <td>${u.email}</td>
              <td>${u.program ? `${u.uni} · ${u.program}` : '—'}</td>
              <td>${u.access_until > Date.now() ? html`<span class="tag tag--approved">${formatDate(u.access_until)}</span>` : html`<span class="muted">—</span>`}</td>
              <td>${formatDate(u.created_at)}</td>
            </tr>`,
          )}
        </tbody>
      </table></div>
      ${!users.length && html`<p class="muted">ვერავინ მოიძებნა.</p>`}`,
  });
}

export function userPage(c, { u, program, orders, sessions, opens }) {
  return shell(c, {
    title: u.name,
    actions: html`<a class="btn btn--light" href="/admin/users">${icon('arrowLeft', 18)} ყველა</a>`,
    body: html`<div class="admin__cols">
      <section class="card">
        <h2>ინფორმაცია</h2>
        <dl class="kv">
          <div><dt>ელ-ფოსტა</dt><dd>${u.email}</dd></div>
          <div><dt>პროგრამა</dt><dd>${program ? `${program.short_name} · ${program.name}` : '—'}</dd></div>
          <div><dt>როლი</dt><dd>${u.role === 'admin' ? 'ადმინი' : 'სტუდენტი'}</dd></div>
          <div><dt>რეგისტრაცია</dt><dd>${formatDateTime(u.created_at)}</dd></div>
          <div><dt>ბოლო შესვლა</dt><dd>${formatDateTime(u.last_login_at)}</dd></div>
          <div><dt>წვდომა</dt><dd>${u.access_until > Date.now() ? `აქტიურია · ვადა: ${formatDate(u.access_until)}` : u.access_until ? `ამოიწურა ${formatDate(u.access_until)}` : 'არასდროს ჰქონია'}${u.role === 'admin' ? ' (ადმინს ყოველთვის აქვს წვდომა)' : ''}</dd></div>
          <div><dt>გახსნილი წიგნები</dt><dd>${opens}</dd></div>
        </dl>
      </section>
      <section class="card">
        <h2>წვდომის დამატება</h2>
        <p class="muted small">მაგ. ნაღდი ფულით ან გადმორიცხვით გადახდისას, ტესტერისთვის ან კომპენსაციად.</p>
        <form class="form" method="post" action="/admin/users/${u.id}/grant">
          ${csrfField(c)}
          <div class="field-row">
            <div class="field field--narrow"><label class="label" for="days">დღე</label><input class="input" id="days" name="days" type="number" min="1" max="365" value="${config.plan.days}" required></div>
            <div class="field"><label class="label" for="note">შენიშვნა</label><input class="input" id="note" name="note" maxlength="200" placeholder="მაგ. გადმორიცხვა TBC, 10 ₾"></div>
          </div>
          <button class="btn btn--primary btn--sm" type="submit">${icon('plus', 16)} დამატება</button>
        </form>
        <div class="row-actions">
          <form method="post" action="/admin/users/${u.id}/block">${csrfField(c)}
            <button class="btn btn--light btn--sm" type="submit"${confirmAttr(u.is_blocked ? 'განვბლოკო?' : 'დავბლოკო მომხმარებელი? ყველა სესია დაიხურება.')}>${u.is_blocked ? 'განბლოკვა' : 'დაბლოკვა'}</button>
          </form>
          <form method="post" action="/admin/users/${u.id}/logout">${csrfField(c)}
            <button class="btn btn--light btn--sm" type="submit">ყველა მოწყობილობიდან გამოყვანა (${sessions.length})</button>
          </form>
        </div>
        ${sessions.length > 0 &&
        html`<ul class="devices">${sessions.map((s) => html`<li><span>${deviceName(s.user_agent || '')}</span><span class="muted small">${s.ip || ''} · ${formatDateTime(s.last_seen_at)}</span></li>`)}</ul>`}
      </section>
      <section class="card card--wide">
        <h2>გადახდები</h2>
        ${ordersTable(orders)}
      </section>
    </div>`,
  });
}

// ───────── Orders ─────────

function ordersTable(orders, { compact = false } = {}) {
  if (!orders.length) return html`<p class="muted">გადახდები ჯერ არ არის.</p>`;
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>თარიღი</th>${!compact && html`<th>შეკვეთა</th>`}<th>მომხმარებელი</th><th>თანხა</th><th>სტატუსი</th>${!compact && html`<th></th>`}</tr></thead>
    <tbody>
      ${orders.map(
        (o) => html`<tr>
          <td class="nowrap">${compact ? formatShortDateTime(o.created_at) : formatDateTime(o.created_at)}</td>
          ${!compact && html`<td><code class="small">${o.id}</code>${o.note && html`<br><span class="muted small">${o.note}</span>`}</td>`}
          <td>${o.email ? html`<a href="/admin/users/${o.user_id}">${o.email}</a>` : ''}</td>
          <td class="nowrap">${o.provider === 'manual' ? `${o.days} დღე (ხელით)` : formatMoney(o.amount)}${o.provider === 'mock' && !compact ? ' · ტესტი' : ''}</td>
          <td>${statusTag(o.status)}</td>
          ${!compact && html`<td>${o.provider === 'flitt' && ['created', 'processing'].includes(o.status) && html`<a class="small" href="/billing/orders/${o.id}">შემოწმება</a>`}</td>`}
        </tr>`,
      )}
    </tbody>
  </table></div>`;
}

export function ordersPage(c, { orders, status }) {
  const filters = [['', 'ყველა'], ['approved', 'წარმატებული'], ['created', 'დაუსრულებელი'], ['declined', 'უარყოფილი'], ['reversed', 'დაბრუნებული']];
  return shell(c, {
    title: 'გადახდები',
    body: html`
      <nav class="filters">${filters.map(([v, label]) => html`<a class="chip ${status === v ? 'chip--ok' : ''}" href="/admin/orders${v ? `?status=${v}` : ''}">${label}</a>`)}</nav>
      ${ordersTable(orders)}`,
  });
}

export function requestsPage(c, { requests }) {
  return shell(c, {
    title: 'საგნების მოთხოვნები',
    body: html`<p class="muted">სტუდენტები აქ წერენ, რომელი საგნები სჭირდებათ. ეს შემდეგი წიგნების სიაა.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>თარიღი</th><th>მოთხოვნა</th><th>პროგრამა</th><th>სტუდენტი</th></tr></thead>
        <tbody>
          ${requests.map((r) => html`<tr><td>${formatDateTime(r.created_at)}</td><td><strong>${r.text}</strong></td><td>${r.program ? `${r.uni} · ${r.program}` : '—'}</td><td>${r.email || '—'}</td></tr>`)}
        </tbody>
      </table></div>
      ${!requests.length && html`<p class="muted">მოთხოვნები ჯერ არ არის.</p>`}`,
  });
}
