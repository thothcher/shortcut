import { config } from '../config.js';
import { html } from '../lib/html.js';
import { formatMoney } from '../lib/format.js';
import { page } from './layout.js';
import { icon, tick } from './icons.js';
import { bookCard, cover } from './components.js';

// Fill the hero when there are fewer than three books. The slugs only pick the cover colour
// (see toneFor): blue, iris, coral — tones that real books cover less often in a small catalog.
const SAMPLE_COVERS = [
  { slug: 'd', title: 'ფსიქოკონსულტირება', author: 'ლექციის კონსპექტი' },
  { slug: 'e', title: 'სხეულის ენა', author: 'არავერბალური კომუნიკაცია' },
  { slug: 'c', title: 'კოგნიტური თერაპია', author: 'ბარათები და ტესტები' },
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
    <div class="container">
      <div class="hero__text">
        <p class="eyebrow">თსუ · ილიაუნი · BTU — შუალედურებისა და ფინალურებისთვის</p>
        <h1 class="display">მოემზადე გამოცდებისთვის ჭკვიანურად</h1>
        <p class="lead">შენი პროგრამის საგნები ციფრულ ფორმატში — მოკლე კონსპექტები, თავებად დაყოფილი მასალა, დასამახსოვრებელი ბარათები და სასწავლო თამაშები. ყველაფერი ერთ სივრცეში.</p>
        <div class="hero__actions">
          <a class="btn btn--primary btn--lg" href="/register">დაიწყე ახლავე ${icon('arrowRight', 18)}</a>
          <a class="btn btn--light btn--lg" href="#how">როგორ მუშაობს?</a>
        </div>
        <ul class="rates">
          <li>${tick()} <span><strong>${price}</strong> — ${days} დღე</span></li>
          <li>${tick()} ავტომატური ჩამოჭრის გარეშე</li>
          <li>${tick()} ტელეფონზეც</li>
        </ul>
      </div>

      <div class="desk" aria-hidden="true">
        <div class="paper sheet">
          <div class="sheet__top"><span class="label-caps">კონსპექტი</span><span class="label-caps">თავი 3 / 13</span></div>
          <p class="sheet__title">ემპათიის სამი სახე</p>
          <ol class="sheet__rows">
            <li><span class="sheet__n">1</span><span>კოგნიტური ემპათია<i class="skel"></i></span></li>
            <li><span class="sheet__n">2</span><span>ემოციური ემპათია<i class="skel"></i></span></li>
            <li><span class="sheet__n">3</span><span>თანაგრძნობა<i class="skel"></i></span></li>
          </ol>
          <div class="sheet__foot"><span class="label-caps">კითხვის დრო</span><span>7 წთ</span></div>
        </div>
        <div class="desk__books">
          ${heroBooks.map((b, i) => html`<div class="desk__book desk__book--${i + 1}">${cover(b)}</div>`)}
        </div>
        <div class="paper flash">
          <div class="flash__top"><span class="label-caps">ბარათი 12 / 133</span><span class="flash__chip">ფსიქოლოგია</span></div>
          <p class="flash__q">რა არის ემპათია?</p>
          <div class="flash__a"><i class="skel"></i><i class="skel"></i></div>
          <span class="flash__hint">${icon('refresh', 14)} დააჭირე გადასატრიალებლად</span>
        </div>
        <div class="paper desk__pill">${tick()} ნასწავლია 9 / 13 თავი</div>
      </div>
    </div>
  </section>

  ${books.length > 0 &&
  html`<section class="section">
    <div class="container">
      <div class="section__head">
        <p class="eyebrow">ბიბლიოთეკა</p>
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

  <section class="section${books.length > 0 ? ' section--flush' : ''}" id="how">
    <div class="container">
      <div class="panel">
        <div class="section__head center">
          <p class="eyebrow">როგორ მუშაობს</p>
          <h2>სამი ნაბიჯი და უკვე სწავლობ</h2>
        </div>
        <ol class="steps">
          <li class="step"><span class="step__n">1</span><h3>დარეგისტრირდი</h3><p>აირჩიე უნივერსიტეტი და პროგრამა — ბიბლიოთეკა შენს საგნებს გაჩვენებს.</p></li>
          <li class="step"><span class="step__n">2</span><h3>გააქტიურე წვდომა</h3><p>გადაიხადე ${price} ბარათით და მიიღე სრული წვდომა ${days} დღით.</p></li>
          <li class="step"><span class="step__n">3</span><h3>ისწავლე</h3><p>გახსენი საგანი: კონსპექტი, ბარათები, თამაშები და ტესტები.</p></li>
        </ol>
      </div>
    </div>
  </section>

  <section class="section section--flush">
    <div class="container">
      <div class="section__head center">
        <p class="eyebrow">მასალები</p>
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

  <section class="section section--flush" id="pricing">
    <div class="container">
      <div class="panel pricing-split">
        <div>
          <div class="section__head">
            <p class="eyebrow">ფასი</p>
            <h2>ერთი მარტივი ფასი</h2>
            <p class="muted">იხდი ერთხელ და სწავლობ ${days} დღე. როცა ვადა ამოიწურება, თავად გადაწყვეტ, გააგრძელო თუ არა.</p>
          </div>
          <ul class="ticks">
            <li>${tick()} ხელშეკრულების გარეშე</li>
            <li>${tick()} დამალული გადასახადის გარეშე</li>
            <li>${tick()} ავტომატური ჩამოჭრის გარეშე</li>
          </ul>
        </div>
        ${planCard(html`<a class="btn btn--primary btn--lg btn--block" href="/register">დაიწყე ${icon('arrowRight', 18)}</a>`)}
      </div>
    </div>
  </section>

  <section class="section section--flush">
    <div class="container narrow">
      <div class="section__head center">
        <p class="eyebrow">კითხვები</p>
        <h2>ხშირად დასმული კითხვები</h2>
      </div>
      <div class="faq">
        ${faq.map(([q, a]) => html`<details class="faq__item"><summary>${q}</summary><p>${a}</p></details>`)}
      </div>
    </div>
  </section>

  <section class="section section--flush">
    <div class="container">
      <div class="cta">
        <h2>გამოცდამდე ცოტა დრო დარჩა? დაიწყე დღესვე.</h2>
        <a class="btn btn--primary btn--lg" href="/register">ანგარიშის შექმნა ${icon('arrowRight', 18)}</a>
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
      <span class="label-caps">თვიური წვდომა</span>
      <p class="plan__price"><strong>${price}</strong><span>/ ${config.plan.days} დღე</span></p>
    </div>
    <ul class="ticks">
      <li>${tick()} ყველა საგანი და მასალა</li>
      <li>${tick()} კონსპექტები, ბარათები, თამაშები და ტესტები</li>
      <li>${tick()} ტელეფონი, ტაბლეტი და კომპიუტერი</li>
      <li>${tick()} ავტომატური ჩამოჭრის გარეშე — იხდი მხოლოდ მაშინ, როცა გჭირდება</li>
    </ul>
    ${action}
    <p class="plan__secure small muted">${icon('shield', 16)} უსაფრთხო გადახდა ბარათით Flitt-ის მეშვეობით</p>
  </div>`;
}
