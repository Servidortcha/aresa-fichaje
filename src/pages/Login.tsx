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
        const { error: pErr } = await supabase.from('profiles').insert({ id: data.user.id, email, nombre, rol: 'empleado' })
        if (pErr) setMsg(pErr.message + ' — Si es “rate limit”, espera 1h o usa Add user en Supabase.')
        else setMsg('¡Bienvenido a Aresa! Cuenta creada. Ya puedes entrar — tu jornada queda segura con foto y GPS.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) return setMsg(error.message)
      nav('/')
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl p-6 text-white text-center shadow">
        <div className="w-12 h-12 bg-white text-red-600 rounded-xl grid place-items-center mx-auto font-bold text-xl">A</div>
        <h1 className="text-2xl font-bold mt-3">Aresa Fichaje</h1>
        <p className="text-red-100 text-sm">Tu jornada, en un toque — foto y ubicación verificadas, sin vueltas.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow border -mt-3">
        <div className="flex gap-2 mb-4 p-1 bg-gray-100 rounded-full">
          <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'login' ? 'bg-red-600 text-white shadow' : 'text-gray-600'}`}>Entrar</button>
          <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'register' ? 'bg-red-600 text-white shadow' : 'text-gray-600'}`}>Crear cuenta</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" required className="w-full border rounded-xl px-3 py-3" />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required className="w-full border rounded-xl px-3 py-3" />
          <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" type="password" required className="w-full border rounded-xl px-3 py-3" />
          <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow">
            {mode === 'login' ? 'Entrar →' : 'Crear cuenta y empezar'}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm p-3 bg-amber-50 border border-amber-200 rounded-xl">{msg}</p>}
        <div className="mt-4 bg-gray-50 border rounded-xl p-3">
          <p className="text-xs font-bold text-gray-700">🔒 Seguridad Aresa</p>
          <p className="text-xs text-gray-500">Tu foto y ubicación se usan solo para verificar la jornada. No se permite galería — solo cámara en vivo — y la ubicación debe ser precisa. Sesión protegida y fichajes inmutables.</p>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          ¿Admin? Crea tu cuenta y luego: <code className="bg-gray-100 px-1 rounded">update profiles set rol='admin' where email='tu@email'</code>
        </p>
      </div>
    </div>
  )
}
