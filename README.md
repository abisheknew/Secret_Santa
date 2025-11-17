# Secret_Santa
A minimal Secret Santa web app (MVP) implemented as a single Node.js server with a static frontend.

Features implemented in this scaffold:
- Create group (admin)
- Invite people by email (simulated: notifications stored in dataz.json and printed to console)
- Join group
- Add exclusions (mutual optional)
- Wishlists per user (JSON array of items)
- One-click draw/assign (admin) using random shuffle with retries
- Simple admin actions: list members, resend invite


How to run (development)
1. Install dependencies and start the server:

```bash
npm install
node server.js
```

2. Open http://localhost:3000 in your browser.

Environment variables (optional)
- SENDGRID_API_KEY - set to enable SendGrid email sending
- SENDER_EMAIL - from address used when sending emails (default: no-reply@example.com)

Notes / next steps:
- This MVP uses a simple JSON file (`data.json`) as the datastore and simulates email by saving notifications in `data.json` and printing to the console.
- For production readiness: replace JSON store with PostgreSQL/SQLite, add auth (magic links or JWT), integrate a real email provider (SendGrid), and add encryption for PII.

Files added:
- `server.js` — Node.js HTTP server implementing API and storage.
- `public/` — static frontend (index.html, app.js, styles.css).
- `data.json` — created at runtime to store data.

If you'd like, I can now:
- Switch this scaffold to use SQLite/Postgres
- Add real email sending (SendGrid) and magic-link authentication
- Convert frontend to React + Tailwind
- Add tests for the assignment algorithm

