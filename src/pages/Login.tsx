import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [nombre, setNombre] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const nav = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp({ email, password: pass })
      if (error) return setMsg(error.message)
      if (data.user) {
        // crear profile como empleado por defecto; el primer admin se cambia manual en SQL
        const { error: pErr } = await supabase.from('profiles').insert({ id: data.user.id, email, nombre, rol: 'empleado' })
        if (pErr) setMsg(pErr.message)
        else setMsg('Cuenta creada. Revisa tu email si pide confirmación y luego inicia sesión.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) return setMsg(error.message)
      nav('/')
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow mt-10">
      <h1 className="text-2xl font-bold text-center">Aresa Fichaje</h1>
      <p className="text-center text-gray-500 text-sm mb-6">Acceso para empleados y administradores</p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded ${mode === 'login' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>Entrar</button>
        <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded ${mode === 'register' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>Registrarse</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" required className="w-full border rounded px-3 py-2" />
        )}
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required className="w-full border rounded px-3 py-2" />
        <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" type="password" required className="w-full border rounded px-3 py-2" />
        <button type="submit" className="w-full bg-red-600 text-white py-2 rounded font-semibold">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </button>
      </form>
      {msg && <p className="mt-4 text-sm p-3 bg-yellow-50 border border-yellow-200 rounded">{msg}</p>}
      <p className="text-xs text-gray-400 mt-4">
        El primer usuario admin debe cambiar su rol en Supabase: <code>update profiles set rol='admin' where email='tu@email.com'</code>
      </p>
    </div>
  )
}
