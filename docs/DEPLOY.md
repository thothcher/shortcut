# Deploying Konspekti

Recommended setup: **one small VPS + Docker + Caddy**. It's the cheapest option, and it's the simplest way to get HTTPS for every book subdomain (`cbt.konspekti.ge`, `body-language.konspekti.ge`, …).

Cost: a VPS such as Hetzner CX22 (2 vCPU, 4 GB RAM, 40 GB disk) costs about €5/month and handles thousands of students. The domain is billed yearly. E-mail (Resend free tier) and Caddy's certificates (Let's Encrypt) are free.

## 1. Domain and DNS

Buy the domain (`.ge` from a Georgian registrar, or `.com`). Then create two DNS records pointing to the server's IP:

| Type | Name | Value |
|---|---|---|
| A | `@` | server IP |
| A | `*` | server IP |

The wildcard `*` record is what makes `<book>.konspekti.ge` work. If you use Cloudflare for DNS, set both records to **DNS only** (grey cloud).

## 2. Server

Ubuntu 24.04, then:

```bash
curl -fsSL https://get.docker.com | sh
git clone <your private repo> konspekti && cd konspekti
cp .env.example .env && nano .env
```

Production `.env` (the important lines):

```ini
NODE_ENV=production
APP_URL=https://konspekti.ge
BOOKS_DOMAIN=konspekti.ge
SESSION_SECRET=<64 random hex chars: openssl rand -hex 32>
FLITT_MERCHANT_ID=<from Flitt>
FLITT_SECRET_KEY=<payment key from Flitt merchant portal>
RESEND_API_KEY=<from resend.com>
EMAIL_FROM="Konspekti <no-reply@konspekti.ge>"
COMPANY_NAME="ი/მ ..."
COMPANY_ID=...
COMPANY_ADDRESS=...
CONTACT_EMAIL=...
CONTACT_PHONE=...
ADMIN_API_TOKEN=<openssl rand -hex 24>
```

Edit `deploy/Caddyfile`: replace `konspekti.ge` with your domain and set your e-mail. Then:

```bash
docker compose up -d --build
docker compose logs -f app        # should print "Konspekti is running"
```

## 3. First admin

Register on the site with your own e-mail, then:

```bash
docker compose exec app node scripts/make-admin.js you@example.com
```

Refresh the page: the **ადმინი** link appears. Upload books under Admin → წიგნები.

## 4. Flitt: test first, then live

1. Put Flitt's public test merchant in `.env` (`FLITT_MERCHANT_ID=1549901`, `FLITT_SECRET_KEY=test`) and restart: `docker compose up -d`.
2. Pay on the site with test card `4444555511116666` (any expiry date and CVV; no 3-D Secure). Check:
   - you land on "გადახდა წარმატებულია!";
   - Admin → გადახდები shows the payment as წარმატებული;
   - `docker compose logs app` has no "Flitt callback rejected" lines. On a public server Flitt's callback arrives at `/api/payments/flitt/callback`.
3. Try the decline card `4444111155556666`: the order should end as უარყოფილი and no access is given.
4. When Flitt approves your merchant account, replace the two values with your live merchant ID and payment key (Merchant Portal → technical settings) and restart.

Flitt sends callbacks from `54.154.216.60` and `3.75.125.89`. If you use a firewall, allow them on port 443.

## 5. Backups (do this on day one)

Everything lives in the `konspekti_app-data` Docker volume: the database, the book sites and the covers. Add a daily cron job (`crontab -e`) that copies a consistent database snapshot plus the files off the server:

```cron
30 3 * * * cd /root/konspekti && docker compose exec -T app node scripts/backup.js /data/backups && docker run --rm -v konspekti_app-data:/data -v /root/backups:/backup alpine tar czf /backup/konspekti-$(date +\%F).tgz -C /data . && find /root/backups -mtime +14 -delete
```

Then sync `/root/backups` to off-site storage, e.g. with `rclone` to Cloudflare R2 or Backblaze B2. A backup that lives only on the same server is not a backup.

## 6. Updates

```bash
git pull && docker compose up -d --build
```

Database migrations run automatically at start-up.

## 7. Monitoring

Add a free uptime check (e.g. UptimeRobot) on `https://konspekti.ge/healthz`.

## Without Docker / other hosts

The app is a plain Node.js (22.12+) program: `npm ci --omit=dev && npm start`. Any host works if it gives you:

1. a **persistent disk** for `STORAGE_DIR` (SQLite and the book files), and
2. **wildcard subdomains with HTTPS** (`*.konspekti.ge`).

Serverless hosts such as Vercel or Netlify Functions don't fit: they have no persistent disk. Render and Railway have persistent disks; check their current wildcard-domain support before choosing them.
