# CSC Seva Kendra — Complete Deployment & Security Guide

## Full-Stack Project Documentation

---

## 📁 Project Structure

```
csc-website/
├── frontend/                   # Static HTML/CSS/JS site
│   ├── index.html              # Home page (Marathi + English)
│   ├── services.html           # All 50+ services with filter
│   ├── about.html              # Owner profile + mission
│   ├── gallery.html            # Photo gallery
│   ├── contact.html            # Form + Map + FAQ
│   ├── admin.html              # Secure admin panel (SPA)
│   ├── css/
│   │   └── style.css           # Mobile-first design system
│   └── js/
│       └── main.js             # Config inject, WhatsApp, notices
│
├── backend/                    # Node.js / Express API
│   ├── server.js               # Entry point + security stack
│   ├── package.json
│   ├── .env.example            # Template (never commit .env!)
│   ├── db/
│   │   ├── index.js            # SQLite singleton
│   │   ├── setup.js            # Run once: create tables
│   │   └── create-admin.js     # Run once: seed admin user
│   ├── middleware/
│   │   ├── security.js         # Helmet, CORS, rate-limit, JWT
│   │   ├── upload.js           # Multer + Sharp image processing
│   │   └── logger.js           # Winston structured logging
│   ├── routes/
│   │   ├── public.js           # /api/notices, /api/contact, /api/gallery
│   │   └── admin.js            # /api/admin/* (JWT protected)
│   ├── uploads/                # Re-encoded images (auto-created)
│   └── logs/                   # App + security + access logs
│
└── docs/
    ├── nginx.conf              # Production Nginx config
    └── DEPLOYMENT.md           # This file
```

---

## 🚀 Local Development Setup

### Prerequisites

- Node.js 18+ → https://nodejs.org
- npm 9+

### Steps

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values:
#   JWT_SECRET  — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
#   INITIAL_ADMIN_PASS — strong password (min 12 chars, upper+lower+number+symbol)
#   CORS_ORIGINS — your frontend URLs

# 3. Create database tables
node db/setup.js

# 4. Create admin user
node db/create-admin.js

# 5. IMPORTANT: Remove INITIAL_ADMIN_USER and INITIAL_ADMIN_PASS from .env

# 6. Start backend
npm run dev    # development (with nodemon)
# or
npm start      # production

# 7. Open frontend
# Open frontend/index.html in browser (or use Live Server in VS Code)
# Admin panel: frontend/admin.html
```

> ✅ API runs on: http://localhost:3001
> ✅ Admin panel: http://localhost:3001/admin.html

---

## 🌐 Free Hosting Options (for Reselling)

### Option A: Netlify (Frontend) + Railway (Backend) — BEST FOR BEGINNERS

| Part     | Platform    | Free Tier |
| -------- | ----------- | --------- |
| Frontend | Netlify     | 100 GB/mo |
| Backend  | Railway     | $5 credit |
| DB       | SQLite file | Included  |
| SSL      | Auto        | Free      |

**Netlify Frontend Deploy:**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy frontend
cd frontend
netlify deploy --prod
```

**Railway Backend Deploy:**

```bash
# Install Railway CLI
npm install -g @railway/cli

cd backend
railway login
railway init
railway up
# Set environment variables in Railway dashboard
```

### Option B: VPS (DigitalOcean / Hetzner) — BEST FOR SCALE

- Hetzner CX11: €4.51/month = ₹400/month
- Can host 50+ CSC sites on one VPS
- Full control, Nginx, PM2

### Option C: Render.com (Free)

- Backend: https://render.com (free tier)
- Frontend: Render Static Sites (free)
- SQLite persists with disk mount

---

## 🖥️ Production VPS Setup (Ubuntu 22.04)

```bash
# 1. System update
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install Nginx
sudo apt install -y nginx

# 4. Install Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx

# 5. Install PM2 (process manager)
sudo npm install -g pm2

# 6. Clone / upload project
mkdir -p /var/www/csc-website
# Upload your files here

# 7. Setup backend
cd /var/www/csc-website/backend
npm install --production
cp .env.example .env
nano .env   # Fill in all values
node db/setup.js
node db/create-admin.js

# 8. Start with PM2
pm2 start server.js --name "csc-backend" --env production
pm2 save
pm2 startup    # Auto-start on reboot

# 9. Configure Nginx
sudo cp /var/www/csc-website/docs/nginx.conf /etc/nginx/sites-available/csc.conf
# Edit the file: replace yourdomain.in with real domain
sudo nano /etc/nginx/sites-available/csc.conf
sudo ln -s /etc/nginx/sites-available/csc.conf /etc/nginx/sites-enabled/
sudo nginx -t    # Test config
sudo systemctl reload nginx

# 10. Get SSL certificate
sudo certbot --nginx -d yourdomain.in -d www.yourdomain.in
# Auto-renews every 90 days

# 11. Setup firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# 12. Set file permissions
sudo chown -R www-data:www-data /var/www/csc-website/uploads
sudo chmod -R 755 /var/www/csc-website/uploads
```

---

## 🔒 Security Architecture

### Layers of Protection

```
[Internet]
    │
    ▼
[Cloudflare CDN]          ← DDoS, WAF, bot protection, SSL
    │
    ▼
[UFW Firewall]            ← Only ports 80, 443, 22 open
    │
    ▼
[Nginx]                   ← Rate limiting, security headers,
    │                         block bad bots, block .php/.env
    ▼
[Node.js (127.0.0.1)]     ← Helmet, CORS whitelist, rate-limit,
    │                         body size limit, sanitization
    ▼
[Express Routes]          ← express-validator, JWT auth
    │
    ▼
[SQLite + bcrypt]         ← Parameterised queries (no SQL injection),
                              bcrypt(cost=12) hashed passwords
```

### Security Features Implemented

| Feature             | Implementation                            | Protection Against      |
| ------------------- | ----------------------------------------- | ----------------------- |
| SQL Injection       | Parameterised queries (better-sqlite3)    | DB manipulation         |
| XSS                 | `xss` lib on req.body + CSP header        | Script injection        |
| CSRF                | SameSite cookies + CORS whitelist         | Cross-site requests     |
| Brute Force         | Rate limiter (5 login attempts → lockout) | Password guessing       |
| JWT tampering       | HS256 + issuer/audience validation        | Token forgery           |
| Password storage    | bcrypt cost=12                            | Rainbow table attacks   |
| File upload         | Magic byte check + Sharp re-encode        | Polyglot/malware upload |
| Directory traversal | Static serve with dotfiles:deny           | File system access      |
| Clickjacking        | X-Frame-Options: DENY                     | iFrame attacks          |
| MIME sniffing       | X-Content-Type-Options: nosniff           | Type confusion          |
| Info disclosure     | Errors sanitised in production            | Server fingerprinting   |
| IP privacy          | SHA-256 hash in logs                      | Privacy compliance      |
| HTTPS               | HSTS + TLS 1.2/1.3 only                   | MITM attacks            |

---

## 🔁 Reselling This Template

### Per-Client Customisation Checklist

Edit these files for each new CSC center:

**frontend/js/main.js** — Change `CSC_CONFIG`:

```js
ownerName:    "नवीन मालक नाव",
centerName:   "केंद्र नाव",
vleId:        "VLE/MH/XXXX/XXXXXXX",
phone:        "+91 XXXXXXXXXX",
whatsapp:     "91XXXXXXXXXX",
address:      "नवीन पत्ता",
district:     "जिल्हा नाव",
mapsEmbed:    "New Google Maps embed URL",
yearEst:      2020,
```

**backend/.env**:

- New `JWT_SECRET` per deployment
- New admin password per client

**That's it!** — 30 minutes per client. ₹5,000–15,000 per site.

---

## 💰 Business Math

| Sites/month | Revenue | Hosting Cost | Profit  |
| ----------- | ------- | ------------ | ------- |
| 5 sites     | ₹37,500 | ₹2,000/mo    | ₹35,500 |
| 10 sites    | ₹75,000 | ₹2,000/mo    | ₹73,000 |
| Maintenance | ₹400×50 | ₹2,000/mo    | ₹18,000 |

---

## 🛠️ Admin Panel Guide

1. Open: `https://yourdomain.in/admin.html`
2. Login with your credentials
3. **Dashboard**: View message count + quick actions
4. **Messages**: View/reply to contact form submissions
5. **Notices**: Add/delete notice board entries
6. **Gallery**: Upload/delete center photos
7. **Settings**: Change admin password

---

## 🧰 Maintenance Commands

```bash
# Check backend status
pm2 status
pm2 logs csc-backend

# Restart backend
pm2 restart csc-backend

# View security logs
tail -f /var/www/csc-website/backend/logs/security.log

# Backup database
cp /var/www/csc-website/backend/db/csc.db /backup/csc-$(date +%Y%m%d).db

# Check SSL expiry
certbot certificates

# Test Nginx config
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔮 Future Improvements (Upsell Features)

1. **WhatsApp Business API** — Auto-reply to enquiries (₹500 setup)
2. **Appointment Booking** — Time-slot form (₹3,000)
3. **Fee Calculator** — Interactive tool per service (₹2,000)
4. **Google Reviews Widget** — Show star ratings live (₹1,000)
5. **QR Code Generator** — Auto-print card for each owner (₹500)
6. **SMS OTP notifications** — When form is submitted via Twilio (₹2,000)
7. **PWA / Offline mode** — Works without internet (₹3,000)
8. **Multi-language toggle** — Hindi + Marathi + English (₹2,000)

---

_Built for Digital India | CSC Scheme 2.0 | Maharashtra_
