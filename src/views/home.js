import { config } from '../config.js';
import { html } from '../lib/html.js';
import { formatMoney } from '../lib/format.js';
import { page } from './layout.js';
import { icon } from './icons.js';
import { bookCard, cover } from './components.js';

const SAMPLE_COVERS = [
  { slug: 'a', title: 'ფსიქოკონსულტირება', author: 'ლექციის კონსპექტი' },
  { slug: 'bbbb', title: 'სხეულის ენა', author: 'არავერბალური კომუნიკაცია' },
  { slug: 'cc', title: 'კოგნიტური თერაპია', author: 'ბარათები და ტესტები' },
];

const FEATURES = [
  ['fileText', 'მოკლე კონსპექტები', 'თითოეული თავის მთავარი იდეები — მარტივი, გასაგები ენით.'],
  ['list', 'თავებად დაყოფილი მასალა', 'დიდი სახელმძღვანელო — პატარა, ადვილად აღსაქმელ ნაწილებად.'],
  ['layers', 'დასამახსოვრებელი ბარათები', 'გადააბრუნე ბარათი და შეამოწმე, რა გახსოვს.'],
  ['gamepad', 'თამაშები და ტესტები', 'გაიმეორე მასალა თამაშით და შეაფასე შენი ცოდნა.'],
  ['phone', 'ტელეფონზეც მოსახერხებელი', 'ისწავლე ნებისმიერ ადგილას — ავტობუსშიც კი.'],
  ['cap', 'შენი პროგრამის მიხედვით', 'მასალები დალაგებულია უნივერსიტეტისა და პროგრამის მიხედვით.'],
];

export function homePage(c, { books, unis }) {
  const price = formatMoney(config.plan.amount);
  const days = config.plan.days;
  const heroBooks = [...books.filter((b) => b.cover), ...books.filter((b) => !b.cover), ...SAMPLE_COVERS].slice(0, 3);
  const faq = [
    ['ყოველ თვე ავტომატურად ჩამომეჭრება თანხა?', `არა. გადახდა ერთჯერადია და წვდომას ${days} დღით გაძლევს. ვადის ამოწურვის შემდეგ თავად გადაწყვეტ, გააგრძელო თუ არა.`],
    ['რომელი უნივერსიტეტების მასალებია?', 'ამ ეტაპზე — თსუ, ილიაუნი და BTU. სიას მუდმივად ვავსებთ.'],
    ['ჩემი საგანი სიაში არ არის. რა ვქნა?', 'დარეგისტრირდი და ბიბლიოთეკიდან მოგვწერე საგნის სახელი. ყველაზე მოთხოვნად საგნებს პირველ რიგში ვამატებთ.'],
    ['შემიძლია ტელეფონით სწავლა?', 'კი. პლატფორმაც და მასალებიც ტელეფონზეა მორგებული.'],
    ['რამდენ მოწყობილობაზე შემიძლია შესვლა?', `ერთდროულად ${config.maxSessionsPerUser} მოწყობილობაზე — მაგალითად, ტელეფონსა და ლეპტოპზე.`],
    ['ეს უნივერსიტეტის ოფიციალური რესურსია?', `არა. ${config.appName} დამოუკიდებელი სასწავლო პლატფორმაა. მასალები არ ცვლის ლექციებსა და სავალდებულო ლიტერატურას — ის გეხმარება, უკეთ მოემზადო.`],
  ];

  const body = html`
  <section class="hero">
    <div class="container hero__grid">
      <div class="hero__text">
        <p class="eyebrow">${icon('sparkles', 16)} თსუ · ილიაუნი · BTU — შუალედურებისა და ფინალურებისთვის</p>
        <h1 class="display">მოემზადე გამოცდებისთვის ჭკვიანურად</h1>
        <p class="lead">შენი პროგრამის საგნები ციფრულ ფორმატში — მოკლე კონსპექტები, თავებად დაყოფილი მასალა, დასამახსოვრებელი ბარათები და სასწავლო თამაშები. ყველაფერი ერთ სივრცეში.</p>
        <div class="hero__actions">
          <a class="btn btn--primary btn--lg" href="/register">დაიწყე ახლავე ${icon('arrowRight', 18)}</a>
          <a class="btn btn--light btn--lg" href="#how">როგორ მუშაობს?</a>
        </div>
        <p class="hero__note">${icon('check', 16)} ${price} — ${days} დღე · ავტომატური ჩამოჭრის გარეშე</p>
      </div>
      <div class="hero__visual" aria-hidden="true">
        <div class="hero__stack">
          ${heroBooks.map((b, i) => html`<div class="hero__book hero__book--${i + 1}">${cover(b)}</div>`)}
        </div>
        <div class="hero-card">
          <span class="hero-card__label">${icon('layers', 14)} ბარათი 12 / 133</span>
          <p class="hero-card__q">რა არის ემპათია?</p>
          <span class="hero-card__hint">${icon('refresh', 14)} დააჭირე გადასატრიალებლად</span>
        </div>
        <div class="hero-pill">${icon('checkCircle', 16)} ნასწავლია 9 / 13 თავი</div>
      </div>
    </div>
  </section>

  ${books.length > 0 &&
  html`<section class="section">
    <div class="container">
      <div class="section__head">
        <h2>უკვე პლატფორმაზე</h2>
        <p class="muted">მასალების სია მუდმივად იზრდება.</p>
      </div>
      <div class="books">
        ${books.slice(0, 8).map((b) =>
          bookCard(b, { state: b.is_free ? 'free' : 'locked', unis: unis.get(b.id), href: `/register?next=/open/${b.slug}` }),
        )}
      </div>
    </div>
  </section>`}

  <section class="section section--tint" id="how">
    <div class="container">
      <div class="section__head center">
        <h2>როგორ მუშაობს</h2>
        <p class="muted">სამი ნაბიჯი და უკვე სწავლობ.</p>
      </div>
      <ol class="steps">
        <li class="step"><span class="step__n">1</span><h3>დარეგისტრირდი</h3><p>აირჩიე უნივერსიტეტი და პროგრამა — ბიბლიოთეკა შენს საგნებს გაჩვენებს.</p></li>
        <li class="step"><span class="step__n">2</span><h3>გააქტიურე წვდომა</h3><p>გადაიხადე ${price} ბარათით და მიიღე სრული წვდომა ${days} დღით.</p></li>
        <li class="step"><span class="step__n">3</span><h3>ისწავლე</h3><p>გახსენი საგანი: კონსპექტი, ბარათები, თამაშები და ტესტები.</p></li>
      </ol>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head center">
        <h2>ყველაფერი, რაც გამოცდისთვის გჭირდება</h2>
      </div>
      <div class="features">
        ${FEATURES.map(([ic, title, text]) => html`<div class="feature">
          <span class="feature__icon">${icon(ic, 22)}</span>
          <h3>${title}</h3>
          <p>${text}</p>
        </div>`)}
      </div>
    </div>
  </section>

  <section class="section section--tint" id="pricing">
    <div class="container narrow center">
      <div class="section__head center">
        <h2>ერთი მარტივი ფასი</h2>
        <p class="muted">არანაირი ხელშეკრულება და დამალული გადასახადი.</p>
      </div>
      ${planCard(html`<a class="btn btn--primary btn--lg btn--block" href="/register">დაიწყე ${icon('arrowRight', 18)}</a>`)}
    </div>
  </section>

  <section class="section">
    <div class="container narrow">
      <div class="section__head center"><h2>ხშირად დასმული კითხვები</h2></div>
      <div class="faq">
        ${faq.map(([q, a]) => html`<details class="faq__item"><summary>${q}</summary><p>${a}</p></details>`)}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="cta">
        <h2>გამოცდამდე ცოტა დრო დარჩა? დაიწყე დღესვე.</h2>
        <a class="btn btn--light btn--lg" href="/register">ანგარიშის შექმნა ${icon('arrowRight', 18)}</a>
      </div>
    </div>
  </section>`;

  return page(c, { body });
}

/** The single plan, used on the landing page and on /pricing. */
export function planCard(action) {
  const price = formatMoney(config.plan.amount);
  return html`<div class="plan">
    <div class="plan__head">
      <span class="plan__name">თვიური წვდომა</span>
      <p class="plan__price"><strong>${price}</strong><span>/ ${config.plan.days} დღე</span></p>
    </div>
    <ul class="ticks">
      <li>${icon('check', 18)} ყველა საგანი და მასალა</li>
      <li>${icon('check', 18)} კონსპექტები, ბარათები, თამაშები და ტესტები</li>
      <li>${icon('check', 18)} ტელეფონი, ტაბლეტი და კომპიუტერი</li>
      <li>${icon('check', 18)} ავტომატური ჩამოჭრის გარეშე — იხდი მხოლოდ მაშინ, როცა გჭირდება</li>
    </ul>
    ${action}
    <p class="plan__secure small muted">${icon('shield', 16)} უსაფრთხო გადახდა ბარათით Flitt-ის მეშვეობით</p>
  </div>`;
}
