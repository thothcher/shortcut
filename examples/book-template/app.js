// A tiny "book engine": turns book.json (chapters, flashcards, quiz) into a study site.
// Hash routes: #/  #/chapters  #/chapter/2  #/cards  #/quiz. Progress is saved in localStorage.
const main = document.getElementById('main');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
/** Escapes text, then shows `code` in backticks as <code>. */
const fmt = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');

const book = await (await fetch('book.json')).json();
document.title = book.title;
document.getElementById('book-title').textContent = book.title;
if (book.accent) document.body.classList.add(`accent-${book.accent}`);

const KEY = `${book.slug}:v1`;
let state = { studied: {}, known: {}, best: 0 };
try {
  state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* private mode: progress lives in memory only */
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

const chapterList = () => `<ol class="list">${book.chapters
  .map((c, i) => {
    const done = state.studied[i + 1];
    return `<li class="${done ? 'done' : ''}"><a href="#/chapter/${i + 1}"><span class="num">${done ? '✓' : i + 1}</span><span>${esc(c.title)}</span></a></li>`;
  })
  .join('')}</ol>`;

const views = {
  home() {
    const studied = Object.keys(state.studied).length;
    main.innerHTML = `<div class="wrap">
      <p class="eyebrow">${esc(book.author || '')}</p>
      <h1>${esc(book.title)}</h1>
      <p class="lead">${fmt(book.description || '')}</p>
      <div class="stats">
        <div class="stat"><b>${book.chapters.length}</b>თავი</div>
        <div class="stat"><b>${book.cards.length}</b>ბარათი</div>
        <div class="stat"><b>${book.quiz.length}</b>კითხვა</div>
      </div>
      <div class="actions">
        <a class="btn btn--primary" href="#/chapter/1">დაიწყე სწავლა</a>
        <a class="btn" href="#/cards">ბარათები</a>
        <a class="btn" href="#/quiz">ტესტი</a>
      </div>
      <p class="hint">ნასწავლია ${studied} / ${book.chapters.length} თავი${state.best ? ` · ტესტის საუკეთესო შედეგი: ${state.best} / ${book.quiz.length}` : ''}</p>
      ${chapterList()}
    </div>`;
  },

  chapters() {
    main.innerHTML = `<div class="wrap"><h1>თავები</h1>${chapterList()}</div>`;
  },

  chapter(arg) {
    const n = Math.min(Math.max(1, Number(arg) || 1), book.chapters.length);
    const c = book.chapters[n - 1];
    const done = Boolean(state.studied[n]);
    const last = n === book.chapters.length;
    main.innerHTML = `<div class="wrap">
      <p class="eyebrow">თავი ${n} / ${book.chapters.length}</p>
      <h1>${esc(c.title)}</h1>
      <div class="card"><h2>მთავარი</h2><ul>${c.summary.map((s) => `<li>${fmt(s)}</li>`).join('')}</ul></div>
      ${c.terms?.length ? `<div class="card"><h2>ძირითადი ტერმინები</h2><ul>${c.terms.map((t) => `<li>${fmt(t)}</li>`).join('')}</ul></div>` : ''}
      <div><button class="btn ${done ? '' : 'btn--primary'}" id="mark">${done ? '✓ ნასწავლია' : 'მონიშნე ნასწავლად'}</button></div>
      <div class="pager">
        ${n > 1 ? `<a class="btn" href="#/chapter/${n - 1}">← წინა</a>` : '<span></span>'}
        ${last ? '<a class="btn btn--primary" href="#/cards">ბარათები →</a>' : `<a class="btn" href="#/chapter/${n + 1}">შემდეგი →</a>`}
      </div>
    </div>`;
    main.querySelector('#mark').addEventListener('click', () => {
      if (state.studied[n]) delete state.studied[n];
      else state.studied[n] = true;
      save();
      views.chapter(n);
    });
  },

  cards() {
    let i = 0;
    let back = false;
    const render = () => {
      const total = book.cards.length;
      const known = book.cards.filter((_, k) => state.known[k]).length;
      const card = book.cards[i];
      main.innerHTML = `<div class="wrap">
        <p class="eyebrow">ბარათი ${i + 1} / ${total}</p>
        <div class="bar" aria-hidden="true"><span style="width:${Math.round((known / total) * 100)}%"></span></div>
        <button class="flash ${back ? 'is-back' : ''}" id="flash"><p>${fmt(back ? card.a : card.q)}</p></button>
        <p class="hint">${back ? 'როგორ გახსოვდა?' : 'დააჭირე ბარათს პასუხის სანახავად'}</p>
        <div class="actions" style="justify-content:center">
          <button class="btn" id="again">ვიმეორებ</button>
          <button class="btn btn--primary" id="know">ვიცი ✓</button>
        </div>
        <p class="hint">ნასწავლია ${known} / ${total}</p>
      </div>`;
      const next = () => {
        i = (i + 1) % total;
        back = false;
        render();
      };
      main.querySelector('#flash').addEventListener('click', () => {
        back = !back;
        render();
      });
      main.querySelector('#know').addEventListener('click', () => {
        state.known[i] = true;
        save();
        next();
      });
      main.querySelector('#again').addEventListener('click', () => {
        delete state.known[i];
        save();
        next();
      });
    };
    render();
  },

  quiz() {
    let i = 0;
    let score = 0;
    const render = () => {
      const total = book.quiz.length;
      if (i >= total) {
        state.best = Math.max(state.best || 0, score);
        save();
        main.innerHTML = `<div class="wrap">
          <p class="eyebrow">ტესტი დასრულდა</p>
          <h1>შედეგი: ${score} / ${total}</h1>
          <p class="lead">${score === total ? 'შესანიშნავია! ყველა პასუხი სწორია.' : 'გაიმეორე თავები და ბარათები, შემდეგ სცადე ხელახლა.'}</p>
          <div class="actions"><button class="btn btn--primary" id="retry">თავიდან ცდა</button><a class="btn" href="#/cards">ბარათები</a></div>
        </div>`;
        main.querySelector('#retry').addEventListener('click', () => views.quiz());
        return;
      }
      const q = book.quiz[i];
      main.innerHTML = `<div class="wrap">
        <p class="eyebrow">კითხვა ${i + 1} / ${total}</p>
        <h2>${fmt(q.q)}</h2>
        <div class="options">${q.options.map((o, k) => `<button class="option" data-k="${k}">${fmt(o)}</button>`).join('')}</div>
        <div id="after"></div>
      </div>`;
      for (const button of main.querySelectorAll('.option')) {
        button.addEventListener('click', () => {
          const chosen = Number(button.dataset.k);
          const right = chosen === q.answer;
          if (right) score++;
          for (const b of main.querySelectorAll('.option')) {
            b.disabled = true;
            const k = Number(b.dataset.k);
            if (k === q.answer) b.classList.add('is-right');
            else if (k === chosen) b.classList.add('is-wrong');
          }
          main.querySelector('#after').innerHTML = `<div class="feedback ${right ? '' : 'is-wrong'}"><strong>${right ? 'სწორია!' : 'არასწორია.'}</strong> ${fmt(q.why || '')}</div>
            <p style="margin-top:14px"><button class="btn btn--primary" id="next">${i + 1 < total ? 'შემდეგი →' : 'შედეგის ნახვა'}</button></p>`;
          main.querySelector('#next').addEventListener('click', () => {
            i++;
            render();
          });
        });
      }
    };
    render();
  },
};

function route() {
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  for (const link of document.querySelectorAll('[data-nav]')) {
    link.classList.toggle('is-active', link.dataset.nav === name || (name === 'chapter' && link.dataset.nav === 'chapters'));
  }
  (views[name] || views.home)(arg);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
