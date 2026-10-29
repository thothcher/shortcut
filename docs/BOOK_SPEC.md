# Book site spec — for the developers who build the books

The platform hosts each book on its own address, for example `https://cbt.shortcut.ge`, and only lets in students who paid. You build the book however you like. This page lists the few rules that make it work on the platform.

## 1. Deliver a static build

Send a **ZIP of the build folder**: the folder that has `index.html` in it.

| Tool | Build command | Folder to zip |
|---|---|---|
| Plain HTML/CSS/JS | — | the site folder |
| Vite (React, Vue, Svelte) | `npm run build` | `dist` |
| Next.js | `output: 'export'` in `next.config`, then `npm run build` | `out` |
| Angular | `ng build` | `dist` (any depth is fine, e.g. `dist/app/browser`) |
| Astro | `npm run build` | `dist` |

- Absolute paths (`/assets/x.js`, `/_next/...`) work, because every book lives at the root of its own subdomain.
- Builds made for GitHub Pages also work unchanged (`<base href="/CBT/">`, Next.js `basePath: '/body-lang'`). The platform detects the base path when the ZIP is uploaded.
- Routing: hash routes (`#/chapter/2`) and normal routes (`/chapter/2`) both work. Unknown paths fall back to `index.html`.
- Don't zip the project source (`src/`, `package.json`, `node_modules`). Zip the build output only. The upload refuses a Vite source folder and tells you why.

## 2. No server, no secrets

- The book must run without its own server or database. Anything in the build is visible to every student, so **never put API keys or passwords in the code**.
- If the book really needs a backend (accounts, AI, a database), discuss it first. It needs a different integration.
- Note: the current *CBT Hub* build calls an external database that no longer resolves (the "Psychologists", "Quizzes" and "Cases" sections fail to load). It needs fixing or the data moved into the build.

## 3. Progress and storage

- Save progress in `localStorage` with a versioned key, e.g. `cbt:v1`. Each book has its own origin, so books never see each other's data.
- Don't ask students to sign in inside the book. The platform has already checked them.

## 4. Leave room for the platform button

The platform adds a small **"ბიბლიოთეკა"** button in the **bottom-left corner** (44×44 px on phones) and a very faint watermark with the student's e-mail. Don't put essential controls in the bottom-left 70×70 px.

## 5. Quality bar

- **Mobile first**: most students will read on a phone. Test at 360 px width.
- **Georgian typography**: use `Noto Sans Georgian` / `Noto Serif Georgian` (self-hosted woff2, like the sample) and `lang="ka"`.
- **No trackers, ads or external analytics.** Self-host fonts and libraries where possible; CDNs are allowed but slow down first load.
- **Size**: keep the ZIP under 100 MB (the hard limit is 400 MB). Use WebP/AVIF for images.
- **Accessibility**: real buttons and links, visible focus, alt text for meaningful images, enough contrast.

## 6. Recommended learning structure

This is what works for exam preparation; the sample *ფსიქოკონსულტირება* follows it:

1. **Chapters** of 5–10 minutes each, matching the syllabus order.
2. In every chapter: **key ideas first** (3–5 bullets), then the short summary, then **key terms**.
3. **Flashcards**: 8–15 per chapter, one fact per card, the question on the front.
4. **Quiz** per chapter with an **explanation for every answer** (why it is right or wrong).
5. **Exam questions** section: likely midterm/final questions with model answers.
6. **Progress**: "studied" checkmarks, known/unknown cards, best quiz score.

## 7. Optional extras the platform uses

- `cover.jpg` / `cover.webp` / `cover.png` (600×800, 3:4) in the root of the build becomes the book cover automatically.
- `book.json` in the root (not used yet — it prepares cross-book features such as one review queue for all flashcards):

```json
{
  "title": "ფსიქოკონსულტირება",
  "author": "ლექციის კონსპექტი",
  "language": "ka",
  "version": 3,
  "chapters": [{ "id": "1", "title": "ფსიქოკონსულტირების არსი" }],
  "counts": { "chapters": 13, "flashcards": 133, "questions": 98 }
}
```

## 8. Content rights

Only use material you are allowed to use: your own summaries written in your own words, your own questions and cards, the lecturer's material **with written permission**, or openly licensed sources (CC BY, public domain). Do not paste whole pages of a textbook, scans, or images from books. List your sources on a "წყაროები" page.

## 9. How to hand over a book

- **Admin panel**: Admin → წიგნები → ახალი წიგნი → fill in the details → upload the ZIP.
- **API** (for the PDF converter or CI):

```bash
curl -X PUT "https://shortcut.ge/api/books/cbt/content?title=CBT&publish=1" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @site.zip
```

The response contains the detected title, the number of files and the base path.

## QA checklist before publishing

- [ ] Opens from the library on a phone and a laptop.
- [ ] Every chapter, card set, quiz and game loads (no errors in the browser console).
- [ ] Progress survives a page reload.
- [ ] Spelling checked in Georgian; facts checked against the syllabus.
- [ ] Sources listed; no copied textbook pages.
- [ ] Nothing important hidden behind the bottom-left platform button.
