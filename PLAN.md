# Shortcut: project plan

*Name: Shortcut. To change it, set `APP_NAME` in `.env` and edit the logo in `src/views/icons.js`. Written 29 October 2026.*

## 1. The idea

Georgian students at TSU, IliaUni and BTU register, pick their university and program, pay **10 ₾ for 30 days**, and get a library of their subjects turned into interactive study websites: chapters, short summaries, flashcards, games, tests and exam questions. Different developers (or your PDF converter) build the book sites. **This platform is the shop and the library**: accounts, payment, access control, and one clean shelf of "books" per program.

Why it can work: students cram before midterms and finals, already share notes in Facebook groups, and 10 ₾ is an impulse price. Your sample books (ფსიქოკონსულტირება, CBT, სხეულის ენა, ეგზისტენციალური თერაპია) already have better UX than anything they get from the universities.

## 2. What is built (in this folder)

The full MVP works locally and has been tested end to end in a real browser (Edge), including a real payment through **Flitt's sandbox**.

**Students**
- Landing page in Georgian: hero, catalog preview, how it works, features, price, FAQ.
- Registration with university and program, login, logout, password reset by e-mail.
- Library: their program's books first, instant search, program switcher, "continue studying", free sample books, paywall banner, expiry warning 3 days before the end.
- "My subject is missing" form, so students tell you which book to make next.
- Account: access status, profile, program change, password change, devices, payment history.
- Pricing and checkout with a consent checkbox, success/pending/failed pages.

**Books**
- Every book gets its own address: `cbt.shortcut.ge`, `body-language.shortcut.ge`, …
- Any static build works: plain HTML, Vite, Next.js, Angular. GitHub Pages builds with a base path (`/CBT/`, `/body-lang/`) are detected automatically. Your four existing builds were imported unchanged and all open correctly.
- Access is checked on every file. A small "ბიბლიოთეკა" button and a faint e-mail watermark are added to every book page.
- Upload a ZIP in the admin panel, or push it through the **API** (for your PDF converter).

**Admin**
- Overview: users, active subscribers, revenue this month, popular books, subject requests.
- Books: create, edit, cover, programs, publish/free toggles, ZIP upload, delete.
- Universities and programs: add, rename, delete.
- Users: search, details, **add days manually** (cash or bank transfer, testers), block, sign out everywhere.
- Payments list with filters.

**Payments (Flitt)**
- Hosted checkout in Georgian, 10.00 GEL, card / Apple Pay / Google Pay. The request signature was verified against Flitt's live sandbox.
- Callback and return page verified by signature, amount and merchant. Access is added exactly once. A refund ("reversed") removes the days again.
- If Flitt's callback is late, the order page asks Flitt for the status itself.
- A built-in test checkout for development, so you can click through everything without Flitt.

**Safety**: scrypt passwords, HttpOnly cookies, CSRF protection, rate limits, and at most 2 devices per account. Book code is isolated from the platform. ZIP uploads are sanitised.

## 3. Stack, and why

| Part | Choice | Why |
|---|---|---|
| Server | **Node.js 22+ + Express 5**, one process | You know JS; no framework magic; easy to teach and maintain |
| Pages | Server-rendered HTML (`html\`\`` templates), one CSS file, ~100 lines of JS | Fast on cheap phones, no build step, SEO-friendly |
| Database | **SQLite** (one file) | Zero setup, backups are a file copy; handles tens of thousands of students on one server |
| Books | Static files on per-book subdomains | Works with every developer's framework without rebuilds; isolates book code |
| Payments | **Flitt** hosted checkout | Georgian, supports GEL, cards, Apple/Google Pay; we never touch card data |
| E-mail | Resend (free tier) | 3,000 e-mails/month free, simple HTTP API |
| Hosting | One VPS + Docker + **Caddy** | ~€5/month; Caddy gives HTTPS to every book subdomain automatically |

Only 4 runtime dependencies: `express`, `better-sqlite3`, `multer`, `yauzl`.

## 4. Your to-do list

### This week: things only you can do (they block taking money)

- [ ] **1. Content rights.** This is the most important item; see §7. Decide, book by book, what you are allowed to publish. Original summaries in your own words, your own cards and quizzes, lecturers' material with written permission, or openly licensed sources. **Not** converted textbooks.
- [ ] **2. Name and domain.** Check the name is free (domain, Instagram, Facebook), buy the domain, and set `APP_NAME`.
- [ ] **3. Register as an individual entrepreneur (ი/მ)** and apply for **small business status** at rs.ge: 1% tax on turnover up to 500,000 ₾ a year. IE registration is also possible at TBC / Bank of Georgia branches. Confirm the details with an accountant, including VAT (registration becomes mandatory above 100,000 ₾ turnover in 12 months).
- [ ] **4. Business bank account** (IBAN) for Flitt payouts.
- [ ] **5. Apply to Flitt as a merchant** (flitt.com, "connect"). Ask about: required documents, fees per card payment, payout schedule, Apple Pay/Google Pay activation, and whether they need the site live for review.
- [ ] **6. Legal pages.** Fill `COMPANY_*` and `CONTACT_*` in `.env`. Payment providers check these pages. Have a lawyer read the Terms, Privacy and Refund pages: they are good templates, but they are not legal advice. The checkout already asks for consent that access starts immediately (digital content).

### Next 1–2 weeks: launch

- [ ] **7. Server and deployment**: follow [docs/DEPLOY.md](docs/DEPLOY.md). Set DNS: `@` and `*` → server.
- [ ] **8. E-mail**: create a Resend account, verify the domain (they show the DNS records), set `RESEND_API_KEY`.
- [ ] **9. Admin account**: register, then `make-admin`.
- [ ] **10. Books**: upload the psychology books, assign them to the right programs and semesters, add covers (600×800). Mark one book per program as **free** (the hook).
- [ ] **11. Fix the CBT book**: its "Psychologists / Quizzes / Cases" sections call an external database that no longer resolves. Move that data into the build.
- [ ] **12. Payment test on the real server** with Flitt's test merchant (DEPLOY.md §4), then switch to your live keys.
- [ ] **13. Backups and uptime check** (DEPLOY.md §5 and §7) **before** the first real student.
- [ ] **14. Soft launch** to one or two student groups you know. Watch Admin → გადახდები and მოთხოვნები daily.

### When you get a chance

- [ ] Check this fall's **exam calendars** for TSU, IliaUni and BTU. Midterms usually fall around weeks 8–10, and finals come in January. Publish each book 2–3 weeks before its exam.
- [ ] Ask 2–3 lecturers for a partnership: their material, your platform, a revenue share or free access for their students.
- [ ] Rebuild `dreams` and `journey` (enneagram) as static exports, if they don't really need their server. Then they can be books too.
- [ ] Make the public GitHub Pages copies of paid books private, otherwise anyone can read them for free.

## 5. Roadmap

**Phase 1: launch (now → 2 weeks).** Deploy what is built; psychology at TSU and IliaUni; Flitt live; first 50 paying students.

**Phase 2: after the first payments (weeks 3–8)**
- Google sign-in (most students have Gmail; fewer abandoned sign-ups).
- E-mail verification, and "your access ends in 3 days" reminder e-mails.
- Promo codes and referrals ("bring 3 friends → 1 month free"), and student ambassadors per faculty.
- A **semester pass** (e.g. 25 ₾ for 4 months) next to the monthly price.
- Optional auto-renew through Flitt subscriptions (their API supports scheduled payments). Keep "no auto-charge" as the default promise.
- Refund button in admin (Flitt reversal API), and a simple funnel chart (visits → sign-ups → payments).

**Phase 3: scale the content (months 2–6)**
- Connect the PDF converter to the upload API (already built: `PUT /api/books/:slug/content`).
- A `book.json` standard (see BOOK_SPEC §7), then cross-book features: one spaced-repetition review queue for all flashcards, search across all books, progress synced to the account.
- More universities (GTU, SANGU, Free University, Caucasus University…) and more programs, driven by the subject-request list.
- Installable app (PWA) with offline reading.
- Later: lecturer accounts with their own stats, and licences sold to universities or departments.

## 6. Business model

| | per month |
|---|---|
| Price | 10 ₾ per student per 30 days |
| Server | ≈ €5 (≈ 15 ₾) |
| E-mail | 0 ₾ (free tier) |
| Domain | yearly, small |
| Flitt fee | ask Flitt (a % per payment) |
| Tax (small business) | 1% of turnover |

Example: 300 paying students → ≈ 3,000 ₾ gross a month. Fixed costs stay almost flat as you grow; the real cost is **making good books**.

Expect **seasonality**: demand peaks before midterms and finals (roughly November–January and April–June). Release new books before each peak. The semester pass and reminders smooth out the quiet months.

## 7. Content: the educator's view, and the big risk

**Copyright is the main risk of this business.** Turning a published textbook into a website and charging for access, without permission, infringes the Georgian Law on Copyright and Related Rights (საავტორო და მომიჯნავე უფლებების შესახებ). It is also a reason for a payment provider to close the merchant account, and a reason for universities to work against you rather than with you. What is safe:

1. **Your own study material**: summaries written in your own words, structured by the syllabus. Ideas and facts are free; a textbook's text, figures and tables are not.
2. **Your own flashcards, quizzes, games and exam questions.** This is the real value students pay for.
3. **Lecturers' material with written permission.** Offer a revenue share. It also gives you credibility and a marketing channel.
4. **Open material** (CC BY, public domain), with attribution.

Use the PDF converter to **draft structure** (chapters, terms, candidate questions) from material you have rights to. Then edit and rewrite. For anything unclear, ask an IP lawyer or Sakpatenti.

**What makes a book worth 10 ₾** (the sample already does most of this):
- Matches a real course: same chapters and order as the syllabus, and the course name in the title.
- Each chapter: key ideas → short summary → key terms → 8–15 flashcards → quiz with explanations.
- An exam-questions section with model answers, and visible progress.
- Accurate and proofread. One wrong answer in a quiz costs more trust than ten good chapters earn.

**Where to start**: psychology at TSU and IliaUni, where you already have five books. For BTU: your own programming and web-development material.

## 8. Risks and answers

| Risk | Answer |
|---|---|
| Copyright complaints | Only rights-cleared content (§7); sources page in each book; a takedown contact (the contact page) |
| One student pays, ten use the account | Max 2 devices (new login signs out the oldest); e-mail watermark on pages; sessions tied to book access |
| Screenshots shared in groups | Watermark makes the source traceable; the value is the interactive tools, not a static page |
| Flitt approval takes time | Start now; meanwhile, grant access manually in admin for bank-transfer payments |
| Universities object to their names | "Independent, not affiliated" notice is in the footer and terms; no university logos used |
| Quiet months between exams | Semester pass, new books before each exam period, reminders |
| Server or data loss | Daily off-site backups (DEPLOY.md §5) |

## 9. Numbers to watch (Admin → მიმოხილვა)

- Sign-ups per week, and the share who pay (the conversion rate).
- Active subscribers; renewals in the next exam period.
- Most-opened books, and books nobody opens (fix or remove them).
- Subject requests: the top 5 are your next books.
- Refunds and complaints (aim for close to zero).

## 10. Decisions I made for you (easy to change)

| Decision | Where to change |
|---|---|
| One plan: 10 ₾ / 30 days, no auto-renewal | `PRICE_TETRI`, `ACCESS_DAYS` in `.env` |
| One payment opens **all** books; the library shows the student's program first | `canOpenBook()` in `src/users.js` |
| At most 2 devices at the same time | `MAX_SESSIONS_PER_USER` |
| E-mail watermark on book pages | `WATERMARK=off` |
| Free books still need registration (so you collect sign-ups) | `canOpenBook()` |
| Seed list of universities and programs | Admin → უნივერსიტეტები (sample data — check the real program names) |
| Brand colours and fonts match your sample book | `public/css/app.css` (`:root` tokens) |
