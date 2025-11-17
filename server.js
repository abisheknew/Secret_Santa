/* Express + SQLite Secret Santa server
   - Run: npm install && node server.js
   - Uses SQLite at data.sqlite and runs simple migrations on start
   - SendGrid optional: set SENDGRID_API_KEY and SENDER_EMAIL env vars
   - Magic-link auth implemented via single-use tokens emailed to users
*/

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const sgMail = require('@sendgrid/mail');
const templates = require('./emails/templates');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const DB_FILE = path.join(__dirname, 'data.sqlite');
const PORT = process.env.PORT || 3000;
const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'no-reply@example.com';

if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// If a built frontend exists under web/dist, serve it (production build)
const frontendDist = path.join(__dirname, 'web', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// Session support (simple, backed by SQLite store)
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: '.' }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

// Passport Google OAuth (optional)
app.use(passport.initialize());

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Expose a small status endpoint so frontend or dev can check if Google OAuth is enabled
app.get('/api/auth/status', (req, res) => {
  res.json({ google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
});

console.log(`Google OAuth configured: ${!!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)}`);

// Return current authenticated user (by session)
app.get('/api/me', async (req, res) => {
  try {
    if (!req.session || !req.session.user_id) return res.json({ authenticated: false });
    const u = await getAsync(`SELECT id,name,email,avatar_url FROM users WHERE id = ?`, [req.session.user_id]);
    if (!u) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: u });
  } catch (e) { console.error(e); res.status(500).json({ authenticated: false, error: e.message }); }
});

// Logout endpoint
app.post('/auth/logout', (req, res) => {
  try {
    if (req.session) {
      req.session.destroy(err => { if (err) console.error('session destroy', err); res.json({ success: true }); });
    } else res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ success: false }); }
});

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
      const name = profile.displayName || (profile.name && profile.name.givenName) || email;
      let user = null;
      if (email) user = await getAsync(`SELECT * FROM users WHERE email = ?`, [email]);
      if (!user) {
        const uid = uuidv4();
        await runAsync(`INSERT INTO users (id,name,email,avatar_url,verified,created_at) VALUES (?,?,?,?,?,?)`, [uid, name, email, profile.photos && profile.photos[0] && profile.photos[0].value || '', 1, now()]);
        user = { id: uid, name, email };
      }
      return done(null, user);
    } catch (e) { return done(e); }
  }));

  app.get('/auth/google', passport.authenticate('google', { scope: ['profile','email'] }));
  app.get('/auth/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/' }), (req, res) => {
    // create a session and redirect into the app
    try {
      if (req.user && req.session) req.session.user_id = req.user.id;
      const redirectTo = `/index.html?user_id=${req.user ? req.user.id : ''}`;
      return res.redirect(302, redirectTo);
    } catch (e) { return res.redirect('/'); }
  });
}

// Ensure DB file
const db = new sqlite3.Database(DB_FILE);
const { computeMapping } = require('./lib/assignments');

function now() { return new Date().toISOString(); }

function runAsync(sql, params=[]) {
  return new Promise((res, rej) => db.run(sql, params, function(err) { if (err) rej(err); else res(this); }));
}
function allAsync(sql, params=[]) { return new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))); }
function getAsync(sql, params=[]) { return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row))); }

async function migrate() {
  // Users
  await runAsync(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, avatar_url TEXT, phone TEXT, verified INTEGER DEFAULT 0, created_at TEXT)`);
  // Groups
  await runAsync(`CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT, admin_user_id TEXT, event_date TEXT, reveal_date TEXT, budget_min INTEGER, budget_max INTEGER, year INTEGER, join_code TEXT, created_at TEXT)`);
  // Members
  await runAsync(`CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, group_id TEXT, user_id TEXT, display_name TEXT, joined_at TEXT, is_admin INTEGER DEFAULT 0)`);
  // Exclusions
  await runAsync(`CREATE TABLE IF NOT EXISTS exclusions (id TEXT PRIMARY KEY, group_id TEXT, user_a_id TEXT, user_b_id TEXT, mutual INTEGER DEFAULT 0)`);
  // Invitations
  await runAsync(`CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, group_id TEXT, email TEXT, token TEXT, status TEXT, sent_at TEXT)`);
  // Assignments
  await runAsync(`CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, group_id TEXT, year INTEGER, giver_id TEXT, receiver_id TEXT, notified_at TEXT, revealed_at TEXT)`);
  // Wishlists
  await runAsync(`CREATE TABLE IF NOT EXISTS wishlists (id TEXT PRIMARY KEY, group_id TEXT, user_id TEXT, items TEXT, created_at TEXT, updated_at TEXT)`);
  // Activity log
  await runAsync(`CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, group_id TEXT, user_id TEXT, action TEXT, timestamp TEXT)`);
  // Magic links
  await runAsync(`CREATE TABLE IF NOT EXISTS magic_links (id TEXT PRIMARY KEY, user_id TEXT, token TEXT, group_id TEXT, expires_at TEXT, used INTEGER DEFAULT 0, created_at TEXT)`);
  // Notifications (simulated/stored)
  await runAsync(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, email TEXT, subject TEXT, body TEXT, created_at TEXT)`);
}

async function sendEmail(email, subject, body, html) {
  // Prefer SendGrid if configured
  if (SENDGRID_KEY) {
    const msg = { to: email, from: SENDER_EMAIL, subject, text: body, html: html };
    try { await sgMail.send(msg); return true; } catch (e) { console.error('SendGrid error', e); }
  }

  // Next prefer Brevo / Sendinblue if configured
  const BREVO_KEY = process.env.BREVO_API_KEY || '';
  const BREVO_SENDER = process.env.SENDER_EMAIL || SENDER_EMAIL;
  if (BREVO_KEY) {
    try {
      await sendViaBrevo(email, subject, body, html, BREVO_KEY, BREVO_SENDER);
      return true;
    } catch (e) {
      console.error('Brevo send error', e);
    }
  }

  // fallback: store notification and log
  await runAsync(`INSERT INTO notifications (id,email,subject,body,created_at) VALUES (?,?,?,?,?)`, [uuidv4(), email, subject, body || html || '', now()]);
  console.log('Simulated email ->', email, subject, body || html || '');
  return false;
}

// Brevo (Sendinblue) send via HTTP API
async function sendViaBrevo(to, subject, text, html, apiKey, sender) {
  if (!apiKey) throw new Error('Brevo API key missing');
  const url = 'https://api.sendinblue.com/v3/smtp/email';
  const payload = {
    sender: { name: 'Secret Santa', email: sender },
    to: [{ email: to }],
    subject: subject,
    htmlContent: html || (text ? `<pre>${escapeHtml(text)}</pre>` : ''),
    textContent: text || ''
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const bodyText = await res.text();
    const err = new Error(`Brevo send failed: ${res.status} ${res.statusText} ${bodyText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function escapeHtml(str){ if(!str) return ''; return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

// Utility: compute assignments (random shuffle with retries)
async function computeAssignmentsSQL(group_id, maxRetries = 2000) {
  const members = await allAsync(`SELECT user_id FROM members WHERE group_id = ?`, [group_id]);
  if (!members || members.length < 2) return { success: false, error: 'Need at least 2 participants' };
  const memberIds = members.map(m => m.user_id);
  const exclRows = await allAsync(`SELECT user_a_id, user_b_id, mutual FROM exclusions WHERE group_id = ?`, [group_id]);
  const exclusions = exclRows.map(r => [r.user_a_id, r.user_b_id, !!r.mutual]);
  return computeMapping(memberIds, exclusions, maxRetries);
}

// API endpoints
app.post('/api/create_group', async (req, res) => {
  const { admin_name, admin_email, name, event_date, reveal_date, budget_min, budget_max } = req.body;
  if (!admin_email) return res.status(400).json({ success:false, error:'admin_email required' });
  try {
    // create user if not exists
    let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [admin_email]);
    if (!user) {
      const uid = uuidv4();
      await runAsync(`INSERT INTO users (id,name,email,avatar_url,phone,verified,created_at) VALUES (?,?,?,?,?,?,?)`, [uid, admin_name||admin_email.split('@')[0], admin_email, '', '', 0, now()]);
      user = { id: uid, name: admin_name||admin_email.split('@')[0], email: admin_email };
      await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), null, uid, 'user_created', now()]);
    }
    const gid = uuidv4();
    const join_code = uuidv4();
    await runAsync(`INSERT INTO groups (id,name,admin_user_id,event_date,reveal_date,budget_min,budget_max,year,join_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [gid, name||'Secret Santa', user.id, event_date||null, reveal_date||null, budget_min||0, budget_max||0, new Date().getFullYear(), join_code, now()]);
    await runAsync(`INSERT INTO members (id,group_id,user_id,display_name,joined_at,is_admin) VALUES (?,?,?,?,?,?)`, [uuidv4(), gid, user.id, admin_name||user.name, now(), 1]);
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), gid, user.id, 'group_created', now()]);
    res.json({ success:true, group: { id: gid, name, join_code } });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error: e.message }); }
});

app.post('/api/invite', async (req, res) => {
  const { group_id, emails } = req.body;
  if (!group_id || !emails || !Array.isArray(emails)) return res.status(400).json({ success:false, error:'group_id and emails[] required' });
  try {
    const group = await getAsync(`SELECT * FROM groups WHERE id = ?`, [group_id]);
    if (!group) return res.status(404).json({ success:false, error:'group not found' });
    const created = [];
    for (const email of emails) {
      const token = uuidv4();
      await runAsync(`INSERT INTO invitations (id,group_id,email,token,status,sent_at) VALUES (?,?,?,?,?,?)`, [uuidv4(), group_id, email, token, 'pending', now()]);
      await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, null, 'invite_sent', now()]);
      const link = `${req.protocol}://${req.get('host')}/join.html?token=${token}&group_id=${group_id}`;
      const tpl = templates.renderInvite({ groupName: group.name, link });
      await sendEmail(email, tpl.subject, tpl.text, tpl.html);
      created.push({ email, token });
    }
    res.json({ success:true, created });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

// Magic link request (sends one-time token email)
app.post('/api/auth/magic_link', async (req,res) => {
  const { email, group_id } = req.body;
  if (!email) return res.status(400).json({ success:false, error:'email required' });
  try {
    let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) { const uid = uuidv4(); await runAsync(`INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)`, [uid, email.split('@')[0], email, now()]); user = { id: uid }; }
    const token = uuidv4();
    const expires_at = new Date(Date.now() + 1000*60*60).toISOString(); // 1 hour
    await runAsync(`INSERT INTO magic_links (id,user_id,token,group_id,expires_at,used,created_at) VALUES (?,?,?,?,?,?,?)`, [uuidv4(), user.id, token, group_id||null, expires_at, 0, now()]);
    const link = `${req.protocol}://${req.get('host')}/auth/verify?token=${token}`;
    const tpl = templates.renderMagicLink({ link });
    await sendEmail(email, tpl.subject, tpl.text, tpl.html);
    res.json({ success:true, message:'sent' });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

// Verify magic link and set session
app.get('/auth/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send('token required');
  try {
    const row = await getAsync(`SELECT * FROM magic_links WHERE token = ?`, [token]);
    if (!row) return res.status(400).send('invalid token');
    if (row.used) return res.status(400).send('token already used');
    if (new Date(row.expires_at) < new Date()) return res.status(400).send('token expired');
    await runAsync(`UPDATE magic_links SET used = 1 WHERE id = ?`, [row.id]);
    // set session cookie so frontend can identify the user
    req.session = req.session || {};
    req.session.user_id = row.user_id;
    // redirect to frontend with user id and group id
    const redirectTo = `/index.html?user_id=${row.user_id}${row.group_id ? '&group_id='+row.group_id : ''}`;
    return res.redirect(302, redirectTo);
  } catch (e) { console.error(e); res.status(500).send('server error'); }
});

app.post('/api/join', async (req, res) => {
  const { group_id, name, email } = req.body;
  if (!group_id || !email) return res.status(400).json({ success:false, error:'group_id and email required' });
  try {
    let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) { const uid=uuidv4(); await runAsync(`INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)`, [uid, name||email.split('@')[0], email, now()]); user = { id: uid, name: name||email.split('@')[0], email } }
    const member = await getAsync(`SELECT * FROM members WHERE group_id = ? AND user_id = ?`, [group_id, user.id]);
    if (member) return res.json({ success:true, message:'already a member', user_id: user.id });
    await runAsync(`INSERT INTO members (id,group_id,user_id,display_name,joined_at,is_admin) VALUES (?,?,?,?,?,?)`, [uuidv4(), group_id, user.id, name||user.name, now(), 0]);
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, user.id, 'joined_group', now()]);
    res.json({ success:true, user_id: user.id });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

// Join via invitation token
app.post('/api/join_with_token', async (req,res) => {
  const { token, name, email } = req.body;
  if (!token || !email) return res.status(400).json({ success:false, error:'token and email required' });
  try {
    const inv = await getAsync(`SELECT * FROM invitations WHERE token = ?`, [token]);
    if (!inv) return res.status(400).json({ success:false, error:'invalid token' });
    // create user if needed
    let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) { const uid=uuidv4(); await runAsync(`INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)`, [uid, name||email.split('@')[0], email, now()]); user = { id: uid }; }
    // add member
    const member = await getAsync(`SELECT * FROM members WHERE group_id = ? AND user_id = ?`, [inv.group_id, user.id]);
    if (!member) await runAsync(`INSERT INTO members (id,group_id,user_id,display_name,joined_at,is_admin) VALUES (?,?,?,?,?,?)`, [uuidv4(), inv.group_id, user.id, name||user.name, now(), 0]);
    await runAsync(`UPDATE invitations SET status = 'accepted' WHERE id = ?`, [inv.id]);
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), inv.group_id, user.id, 'joined_group_via_invite', now()]);
    res.json({ success:true, user_id: user.id });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.post('/api/add_exclusion', async (req, res) => {
  const { group_id, user_a_id, user_b_id, mutual } = req.body;
  if (!group_id || !user_a_id || !user_b_id) return res.status(400).json({ success:false, error:'missing fields' });
  try {
    await runAsync(`INSERT INTO exclusions (id,group_id,user_a_id,user_b_id,mutual) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, user_a_id, user_b_id, mutual?1:0]);
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, user_a_id, 'exclusion_added', now()]);
    res.json({ success:true });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { group_id, user_id, items } = req.body;
  if (!group_id || !user_id) return res.status(400).json({ success:false, error:'group_id and user_id required' });
  try {
    const exists = await getAsync(`SELECT * FROM wishlists WHERE group_id = ? AND user_id = ?`, [group_id, user_id]);
    if (exists) {
      await runAsync(`UPDATE wishlists SET items = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(items||[]), now(), exists.id]);
    } else {
      await runAsync(`INSERT INTO wishlists (id,group_id,user_id,items,created_at,updated_at) VALUES (?,?,?,?,?,?)`, [uuidv4(), group_id, user_id, JSON.stringify(items||[]), now(), now()]);
    }
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, user_id, 'wishlist_updated', now()]);
    res.json({ success:true });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.post('/api/run_draw', async (req, res) => {
  const { group_id } = req.body;
  if (!group_id) return res.status(400).json({ success:false, error:'group_id required' });
  try {
    const group = await getAsync(`SELECT * FROM groups WHERE id = ?`, [group_id]);
    if (!group) return res.status(404).json({ success:false, error:'group not found' });
    // compute
    const result = await computeAssignmentsSQL(group_id);
    if (!result.success) return res.status(409).json({ success:false, error: result.error });
    // delete existing for this group/year
    await runAsync(`DELETE FROM assignments WHERE group_id = ? AND year = ?`, [group_id, group.year]);
    for (const m of result.mapping) {
      const a = { id: uuidv4(), group_id, year: group.year, giver_id: m.giver_id, receiver_id: m.receiver_id, notified_at: now(), revealed_at: null };
      await runAsync(`INSERT INTO assignments (id,group_id,year,giver_id,receiver_id,notified_at,revealed_at) VALUES (?,?,?,?,?,?,?)`, [a.id,a.group_id,a.year,a.giver_id,a.receiver_id,a.notified_at,a.revealed_at]);
      const giver = await getAsync(`SELECT * FROM users WHERE id = ?`, [m.giver_id]);
      const receiver = await getAsync(`SELECT * FROM users WHERE id = ?`, [m.receiver_id]);
      const wishlist = await getAsync(`SELECT items FROM wishlists WHERE group_id = ? AND user_id = ?`, [group_id, receiver.id]);
      const body = `Hi ${giver.name},\n\nYou are Secret Santa for: ${receiver.name}\nWishlist: ${wishlist ? wishlist.items : '[]'}\n\n(Do not forward this)`;
      await sendEmail(giver.email, `Your Secret Santa assignment for ${group.name}`, body);
    }
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), group_id, group.admin_user_id, 'draw_run', now()]);
    res.json({ success:true, assignments_count: result.mapping.length });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.get('/api/my_assignment', async (req, res) => {
  const { group_id, user_id } = req.query;
  if (!group_id || !user_id) return res.status(400).json({ success:false, error:'group_id and user_id required' });
  try {
    const a = await getAsync(`SELECT * FROM assignments WHERE group_id = ? AND giver_id = ?`, [group_id, user_id]);
    if (!a) return res.json({ success:true, assignment: null });
    const receiver = await getAsync(`SELECT * FROM users WHERE id = ?`, [a.receiver_id]);
    const wishlist = await getAsync(`SELECT items FROM wishlists WHERE group_id = ? AND user_id = ?`, [group_id, receiver.id]);
    res.json({ success:true, assignment: { receiver_id: receiver.id, receiver_name: receiver.name, wishlist: wishlist ? JSON.parse(wishlist.items) : [] } });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.get('/api/members', async (req,res) => {
  const { group_id } = req.query;
  if (!group_id) return res.status(400).json({ success:false, error:'group_id required' });
  try {
    const members = await allAsync(`SELECT m.user_id,u.name as display_name,m.joined_at,m.is_admin FROM members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?`, [group_id]);
    res.json({ success:true, members });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.post('/api/resend_invite', async (req,res) => {
  const { invitation_id } = req.body;
  if (!invitation_id) return res.status(400).json({ success:false, error:'invitation_id required' });
  try {
    const inv = await getAsync(`SELECT * FROM invitations WHERE id = ?`, [invitation_id]);
    if (!inv) return res.status(404).json({ success:false, error:'invitation not found' });
    const link = `${req.protocol}://${req.get('host')}/join.html?token=${inv.token}&group_id=${inv.group_id}`;
    await sendEmail(inv.email, 'Invitation reminder', `Reminder: join using ${link}`);
    await runAsync(`UPDATE invitations SET sent_at = ? WHERE id = ?`, [now(), invitation_id]);
    await runAsync(`INSERT INTO activity (id,group_id,user_id,action,timestamp) VALUES (?,?,?,?,?)`, [uuidv4(), inv.group_id, null, 'invite_resent', now()]);
    res.json({ success:true });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

app.get('/api/notifications', async (req,res) => {
  try { const notifs = await allAsync(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200`); res.json({ success:true, notifications: notifs }); }
  catch (e) { console.error(e); res.status(500).json({ success:false, error:e.message }); }
});

// Serve index.html by default
// If web/dist exists, prefer serving its index.html for SPA routing
if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res, next) => {
    // allow API and auth routes through
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/sw.js') || req.path.startsWith('/manifest.json')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
}

async function init(){ try { await migrate(); console.log('DB migrated'); } catch (e){ console.error('Init error', e); process.exit(1); } }

// export app for tests and only start server when run directly
init();
if (require.main === module) {
  app.listen(PORT, ()=>console.log(`Server listening on http://localhost:${PORT}`));
}

module.exports = app;
