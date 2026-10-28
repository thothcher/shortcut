import { config } from '../config.js';
import { html, raw } from '../lib/html.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { hasAccess } from '../users.js';
import { page, csrfField } from './layout.js';
import { icon } from './icons.js';
import { planCard } from './home.js';

export function pricingPage(c, { book = null, error = '' } = {}) {
  const user = c.user;
  const price = formatMoney(config.plan.amount);
  let action;
  if (!user) {
    action = html`<a class="btn btn--primary btn--lg btn--block" href="/register?next=/pricing">დაიწყე — შექმენი ანგარიში</a>
      <p class="small muted">უკვე გაქვს ანგარიში? <a href="/login?next=/pricing">შესვლა</a></p>`;
  } else {
    action = html`
      ${hasAccess(user) &&
      user.role !== 'admin' &&
      html`<p class="alert alert--info">${icon('clock')}<span>შენი წვდომა აქტიურია — ვადა: ${formatDate(user.access_until)}. ახალი გადახდა ვადას კიდევ ${config.plan.days} დღით გაზრდის.</span></p>`}
      ${error && html`<p class="alert alert--error" role="alert">${icon('alert')}<span>${error}</span></p>`}
      <form method="post" action="/billing/checkout" class="form">
        ${csrfField(c)}
        <label class="check check--box">
          <input type="checkbox" name="consent" value="1" required>
          <span>ვეთანხმები, რომ წვდომა გააქტიურდება გადახდისთანავე. გავეცანი <a href="/terms" target="_blank">წესებს</a> და <a href="/refunds" target="_blank">თანხის დაბრუნების პოლიტიკას</a>.</span>
        </label>
        <button class="btn btn--primary btn--lg btn--block" type="submit">${icon('card', 20)} გადახდა — ${price}</button>
      </form>`;
  }

  const body = html`<section class="container narrow pricing-page">
    <div class="section__head center">
      <h1>${book ? 'ეს მასალა გამოწერით იხსნება' : 'გააქტიურე წვდომა'}</h1>
      <p class="lead">${book ? html`„${book.title}“ და ყველა სხვა მასალა — ${config.plan.days} დღით.` : `ერთი გადახდა — ყველა მასალა ${config.plan.days} დღით.`}</p>
    </div>
    ${planCard(action)}
    ${config.payments.provider === 'mock' &&
    html`<p class="alert alert--info test-mode">${icon('alert')}<span>სატესტო რეჟიმი: Flitt ჯერ არ არის მიერთებული, ნამდვილი გადახდა არ მოხდება.</span></p>`}
    <p class="center small muted">ბარათის მონაცემებს ჩვენ ვერ ვხედავთ — გადახდა Flitt-ის დაცულ გვერდზე სრულდება.</p>
  </section>`;
  return page(c, { title: 'ფასი', body });
}

export function orderPage(c, { order, user, waitedTooLong }) {
  const pending = order.status === 'created' || order.status === 'processing';
  let content;
  if (order.status === 'approved') {
    content = html`<span class="status-icon status-icon--ok">${icon('checkCircle', 40)}</span>
      <h1>გადახდა წარმატებულია!</h1>
      <p class="lead">წვდომა აქტიურია. ვადა: <strong>${formatDate(user.access_until)}</strong>.</p>
      <a class="btn btn--primary btn--lg" href="/library">ბიბლიოთეკაში გადასვლა ${icon('arrowRight', 18)}</a>`;
  } else if (pending) {
    content = html`<span class="status-icon status-icon--wait"><span class="spinner"></span></span>
      <h1>გადახდა მუშავდება…</h1>
      <p class="lead">ეს რამდენიმე წამს გასტანს. გვერდი თავად განახლდება.</p>
      ${waitedTooLong &&
      html`<p class="alert alert--info">${icon('alert')}<span>თუ თანხა ჩამოგეჭრა, მაგრამ წვდომა არ გააქტიურდა, მოგვწერე: ${config.company.email} — მიუთითე შეკვეთის ნომერი.</span></p>`}
      <a class="btn btn--light" href="/billing/orders/${order.id}">${icon('refresh', 18)} განახლება</a>`;
  } else if (order.status === 'reversed') {
    content = html`<span class="status-icon">${icon('refresh', 40)}</span>
      <h1>თანხა დაბრუნებულია</h1>
      <p class="lead">ამ შეკვეთის თანხა დაგიბრუნდა ბარათზე.</p>
      <a class="btn btn--light" href="/library">ბიბლიოთეკა</a>`;
  } else {
    content = html`<span class="status-icon status-icon--bad">${icon('xCircle', 40)}</span>
      <h1>გადახდა ვერ შესრულდა</h1>
      <p class="lead">${order.status === 'expired' ? 'გადახდის დრო ამოიწურა.' : 'ბანკმა გადახდა არ დაადასტურა.'} სცადე თავიდან ან გამოიყენე სხვა ბარათი.</p>
      <a class="btn btn--primary btn--lg" href="/pricing">თავიდან ცდა</a>`;
  }
  return page(c, {
    title: 'გადახდა',
    head: pending && !waitedTooLong ? raw('<meta http-equiv="refresh" content="3">') : '',
    body: html`<section class="container narrow status-page">
      ${content}
      <p class="small muted">შეკვეთა: ${order.id} · ${formatMoney(order.amount)}</p>
    </section>`,
  });
}

export function mockCheckoutPage(c, { order }) {
  return page(c, {
    title: 'სატესტო გადახდა',
    body: html`<section class="container narrow status-page">
      <span class="badge badge--hidden">სატესტო რეჟიმი</span>
      <h1>${formatMoney(order.amount)}</h1>
      <p class="lead">ეს გვერდი Flitt-ის გადახდის გვერდს ცვლის, სანამ Flitt მიერთებული არ არის. ნამდვილი თანხა არ ჩამოიჭრება.</p>
      <form method="post" action="/billing/mock/${order.id}" class="mock-actions">
        ${csrfField(c)}
        <button class="btn btn--primary btn--lg" name="result" value="approved" type="submit">${icon('check', 18)} წარმატებული გადახდა</button>
        <button class="btn btn--light btn--lg" name="result" value="declined" type="submit">${icon('x', 18)} უარყოფა</button>
      </form>
    </section>`,
  });
}
