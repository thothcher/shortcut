# Konspekti

A subscription platform for Georgian university students (TSU, IliaUni, BTU, …). A student registers, chooses their university and program, pays **10 ₾ for 30 days**, and gets a library of digital study books: summaries, flashcards, games and tests. Each book is a website built by a different developer (or by the PDF converter). The platform hosts the books behind the paywall and gives every student one simple place to find them.

- **[PLAN.md](PLAN.md)** — the project plan, roadmap and your to-do list
- **[docs/BOOK_SPEC.md](docs/BOOK_SPEC.md)** — rules for the developers who build the books
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — putting it online

## სწრაფი დაწყება

საჭიროა [Node.js](https://nodejs.org) 22.12 ან უფრო ახალი ვერსია. მუშაობს Windows-ზე, macOS-სა და Linux-ზე.

```bash
git clone https://github.com/thothcher/konspekti.git
cd konspekti
npm install
npm run seed   # ორი სადემონსტრაციო წიგნი და სამი ანგარიში
npm run dev
```

გახსენი <http://localhost:3000> Chrome-ში, Edge-ში ან Firefox-ში (წიგნები `*.localhost` მისამართებზე იხსნება).

| ანგარიში | ელ-ფოსტა | პაროლი |
|---|---|---|
| ადმინი | `admin@konspekti.local` | `konspekti-admin` |
| სტუდენტი, წვდომით | `student@konspekti.local` | `konspekti-demo` |
| ახალი სტუდენტი, წვდომის გარეშე | `new@konspekti.local` | `konspekti-demo` |

გადახდა სატესტო რეჟიმშია — ნამდვილი თანხა არ ჩამოიჭრება. სადემონსტრაციო წიგნების შიგთავსი `examples/books/*.json` ფაილებშია: შეცვალე ან დაამატე ახალი, შემდეგ კვლავ გაუშვი `npm run seed`.

## Run it locally

Needs Node.js 22.12 or newer.

```bash
npm install
npm run seed   # two sample books + three demo accounts (table above)
npm run dev
```

Open <http://localhost:3000>. Without any configuration, payments use a built-in **test checkout** (no real money), and e-mails (password reset) are printed in the terminal. Use Chrome, Edge or Firefox: books open on `*.localhost` subdomains.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-restart on code changes |
| `npm run seed` | Add the sample books from `examples/books` and the demo accounts |
| `npm test` | Unit tests (Flitt signatures, base-path detection, escaping, tokens) |
| `npm run make-admin -- you@example.com` | Make a registered user an admin |
| `npm run import-book -- cbt ../CBT/dist --title "…" --programs 1,7 --publish` | Import a build folder or ZIP as a book |
| `npm run backup` | Snapshot the database into `storage/backups` |

## How it works

```
                    konspekti.ge  (the platform)
  student ──────►   register · library · pay · account · admin
                         │
                         │ /open/cbt → 60-second signed ticket
                         ▼
                    cbt.konspekti.ge  (one subdomain per book)
                    checks the session + access on every request,
                    serves the book's static build, adds the
                    "ბიბლიოთეკა" button and an e-mail watermark
                         │
  Flitt  ◄──────────  pay 10 ₾ → callback → +30 days
```

- **One Node.js process** (Express 5) renders the pages on the server: no front-end build step, no template engine.
- **SQLite** (one file, `storage/data.db`) stores users, sessions, books, orders and subject requests.
- **Books live on their own subdomain** (`<slug>.<BOOKS_DOMAIN>`). Next.js, Angular, Vite or plain-HTML builds then work unchanged, even builds made for GitHub Pages with a base path such as `/CBT/`. The base path is detected when the ZIP is uploaded. In development the subdomains are `http://cbt.localhost:3000`.
- **Access** is checked on every file request. Logging out, or signing in on a third device, closes the book too.
- **Payments**: Flitt hosted checkout, signed SHA-1 requests and callbacks. One payment gives 30 days, with no automatic renewal. Paying again while access is active adds 30 days to the end date.

## Project layout

```
src/
  server.js          start the HTTP server
  app.js             middleware order and routes
  config.js          all settings (from .env)
  db.js              SQLite schema + migrations + seed universities
  users.js           users, sessions, access rules
  books.js           book queries, ZIP import, base-path detection, covers
  bookhost.js        serves <slug>.<domain> book sites behind the paywall
  payments/          flitt.js (API + signatures), orders.js (grant access once)
  routes/            public, auth, library, billing, account, admin, api
  views/             pages as tagged template literals (html`…`, auto-escaped)
  lib/               html escaping, crypto, zip, e-mail, rate limit, formatting
public/              css/app.css, js/app.js, js/bar.js (button injected into books), fonts
scripts/             seed-demo, make-admin, import-book, backup
examples/            sample books: book.json content + a tiny static "book engine"
test/                node --test unit tests
```

## Security notes

- Passwords are hashed with scrypt. Session cookies are HttpOnly and SameSite=Lax, with the `__Host-` prefix on HTTPS. The database stores only a hash of each session token.
- Every form post is checked against the site's `Origin`. Signed-in forms also carry a per-session CSRF token.
- Book JavaScript runs on another origin, so it cannot read platform pages or use the admin panel.
- Flitt callbacks are accepted only with a valid signature and the right merchant, amount and currency. Access is granted exactly once per order.
- ZIP uploads are protected against `../` paths and oversized archives. Cover images are checked by content, not file name.
- Login, registration, password reset and checkout are rate-limited.
