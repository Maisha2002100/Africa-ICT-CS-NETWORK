# Africa ICT & CS Network — Deployment Guide

## Project Structure

```
/
├── index.html          # Main homepage + auth + payment
├── courses.html        # Course catalogue + payment
├── admin.html          # Admin panel (hidden — tap logo 6×)
├── supabase_setup.sql  # Run this in Supabase SQL editor once
├── vercel.json         # Vercel routing config
├── .env.example        # Copy to .env.local for local dev
└── api/
    ├── pay.js          # POST: initiate STK push | GET: poll status
    └── webhook.js      # POST: PayHero payment callback
```

---

## 1. Deploy Backend to Vercel (Required for Payments)

The `api/` folder is a Vercel serverless backend that:
- Proxies PayHero requests (solves browser CORS)
- Keeps PayHero credentials server-side (more secure)
- Handles payment callbacks from PayHero

### Steps

1. Push this project to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add these **Environment Variables** in Vercel dashboard:

| Key | Value |
|-----|-------|
| `PAYHERO_AUTH` | `Basic YVlPRn...` (your PayHero Basic auth) |
| `PAYHERO_CHANNEL` | `8492` |
| `SUPABASE_URL` | `https://oqkbcnnjudfhlizrqjeu.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your Supabase **service role** key (from Project Settings → API) |

4. Deploy → your backend URL will be `https://africa-ictcs-api.vercel.app`

> **Note:** The project already calls `https://africa-ictcs-api.vercel.app` — if your Vercel URL is different, do a find-replace in the HTML files.

---

## 2. Supabase Setup

1. Go to your Supabase project → SQL Editor
2. Run the contents of `supabase_setup.sql`
3. This creates: `profiles`, `courses`, `enrollments`, `payments` tables with RLS

---

## 3. Custom Email Domain (Africa ICT Network branding)

To send verification emails from `noreply@africaictnetwork.com` instead of Supabase defaults:

### Option A — Supabase Custom SMTP (Recommended)
1. Supabase dashboard → **Authentication → Email Templates**
2. Go to **Settings → Auth → SMTP Settings**
3. Enter your SMTP details:
   - Host: your mail server (e.g. `smtp.zoho.com`, `smtp.gmail.com`, AWS SES)
   - Port: 587 (TLS) or 465 (SSL)
   - Username: `noreply@africaictnetwork.com`
   - Password: your email password or app password
4. Set **Sender name**: `Africa ICT & CS Network`
5. Set **Sender email**: `noreply@africaictnetwork.com`

### Option B — Custom Email Templates only
In Supabase → Authentication → Email Templates, you can customise:
- Subject line (e.g. "Verify your Africa ICT Network account")
- HTML body with your branding/logo
- The "From" display name

### Recommended free SMTP services
- **Resend** (resend.com) — 3,000 free emails/month, great deliverability
- **Brevo** (brevo.com) — 300 free/day
- **Zoho Mail** — if you have a domain email set up

---

## 4. Admin Panel Access

The admin panel is hidden and accessible by:
1. **Tap the logo 6 times** on any page (index or courses)
2. A pin prompt appears — enter your admin credentials
3. Full admin panel at `admin.html` for course + user management

---

## 5. Payment Flow

```
User clicks "Enroll" → enters phone → clicks "Pay Now"
  → POST /api/pay (Vercel) → PayHero STK push → phone receives prompt
  → User approves on phone
  → PayHero calls POST /api/webhook → updates Supabase payment + enrollment
  → Frontend polls GET /api/pay?reference=XXX every 5s → shows success
```

---

## PayHero Callback URL

Set in your PayHero dashboard:
```
https://africa-ictcs-api.vercel.app/api/webhook
```
