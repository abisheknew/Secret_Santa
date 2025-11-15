import React, {useState} from 'react'
export default function App(){
  const [msg,setMsg]=useState('Welcome to Secret Santa built with Vite + React + Tailwind')
  return (<div className="p-6"><h1 className="text-2xl font-bold">Secret Santa (Web)</h1><p className="mt-4">{msg}</p></div>)
}
