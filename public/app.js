const { useState, useEffect } = React;

function api(path, opts={}){
  const headers = opts.headers || {'Content-Type':'application/json'};
  return fetch(path, Object.assign({credentials:'same-origin'}, opts, { headers })).then(r => r.json());
}

function App(){
  const [groupId, setGroupId] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState([]);

  useEffect(()=>{ fetch('/api/notifications').then(r=>r.json()).then(j=>setNotifications(j.notifications||[])); }, []);

  async function createGroup(){
    const res = await api('/api/create_group',{method:'POST',body: JSON.stringify({ admin_name: adminName, admin_email: adminEmail, name: groupId })});
    if (res.success) { setGroupId(res.group.id); setMessage('Group created: '+res.group.id); }
    else setMessage('Error: '+(res.error||'unknown'));
  }

  async function sendInvites(){
    const emails = prompt('Enter comma separated emails');
    if (!emails) return;
    const list = emails.split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
    const res = await api('/api/invite',{method:'POST', body: JSON.stringify({ group_id: groupId, emails: list })});
    setMessage(JSON.stringify(res));
  }

  async function runDraw(){
    const res = await api('/api/run_draw',{method:'POST', body: JSON.stringify({ group_id: groupId })});
    setMessage(JSON.stringify(res));
    const n = await api('/api/notifications');
    setNotifications(n.notifications||[]);
  }

  return (
    <div className="card p-6">
      <header className="flex items-center justify-between card-section">
        <div className="flex items-center">
          <div className="logo-mark">SS</div>
          <div>
            <h1 className="text-3xl font-extrabold text-indigo-700">Secret Santa</h1>
            <div className="text-sm muted">PWA MVP — quick prototype</div>
          </div>
        </div>
        <div className="text-sm muted">v0.1</div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 card-section rounded-md">
          <h2 className="font-medium">Create Group</h2>
          <input className="mt-2 w-full p-2 border rounded" placeholder="Group name" value={groupId} onChange={e=>setGroupId(e.target.value)} />
          <input className="mt-2 w-full p-2 border rounded" placeholder="Admin name" value={adminName} onChange={e=>setAdminName(e.target.value)} />
          <input className="mt-2 w-full p-2 border rounded" placeholder="Admin email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} />
          <button className="mt-3 btn btn-primary" onClick={createGroup}>Create</button>
        </div>

        <div className="p-4 card-section rounded-md">
          <h2 className="font-medium">Admin Actions</h2>
          <div className="mt-2">Group ID: <code className="small-code">{groupId}</code></div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-success" onClick={sendInvites}>Invite (emails)</button>
            <button className="btn btn-danger" onClick={runDraw}>Run Draw</button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 card-section rounded-md">
          <h3 className="font-medium">Notifications (simulated)</h3>
          <div className="mt-2 h-48 overflow-auto">
            {notifications.map(n=> (
              <div key={n.id} className="p-3 border-b">
                <div className="notif-subject">{n.subject}</div>
                <div className="notif-meta">{n.email} • {n.created_at}</div>
                <pre className="mt-2">{n.body}</pre>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 card-section rounded-md">
          <h3 className="font-medium">Quick Links</h3>
          <ol className="list-decimal list-inside text-sm mt-2 muted">
            <li>Use the Invite button to send emails (simulated).</li>
            <li>Users can sign in with magic link using the "Sign-in (magic link)" form below.</li>
          </ol>
          <SignInBox />
        </div>
      </section>

      <div className="mt-6 text-sm muted">{message}</div>
    </div>
  );
}

function SignInBox(){
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('');
  async function request(){
    const res = await api('/api/auth/magic_link',{method:'POST', body: JSON.stringify({ email, group_id: groupId })});
    setStatus(res.success ? 'Magic link sent (check notifications)' : ('Error: '+(res.error||'')));
  }
  return (
    <div className="mt-4">
      <input className="w-full p-2 border rounded" placeholder="Your email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="w-full p-2 border rounded mt-2" placeholder="(optional) group id" value={groupId} onChange={e=>setGroupId(e.target.value)} />
      <button className="mt-2 btn btn-primary" onClick={request}>Sign-in (magic link)</button>
      <div className="text-xs mt-2 muted">{status}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
