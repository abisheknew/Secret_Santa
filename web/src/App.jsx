import React, {useState} from 'react'
export default function App(){
  const [msg,setMsg]=useState('Welcome to Secret Santa built with Vite + React + Tailwind')
  const [me,setMe] = useState(null);

  useEffect(()=>{
    fetch('/api/me', {credentials:'same-origin'}).then(r=>r.json()).then(j=>{ if (j && j.authenticated) setMe(j.user); });
  },[]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Secret Santa (Web)</h1>
        {me ? (<div>Signed in as <strong>{me.name || me.email}</strong></div>) : (<a className="btn btn-outline" href="/auth/google">Sign in</a>)}
      </div>
      <p className="mt-4">{msg}</p>
    </div>
  )
}

// add a small Google sign-in CTA below the main app for quick testing
export function AuthCTA(){
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Sign in</h2>
      <div className="mt-3">
        <a className="btn btn-primary" href="/auth/google">Sign in with Google</a>
      </div>
    </div>
  )
}
