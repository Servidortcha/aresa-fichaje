import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AuthState = {
  userId: string | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({ userId: null, profile: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
      // auditoría: sesión segura 12h
      if(data.session) localStorage.setItem('aresa_last_login', new Date().toISOString())
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null)
      if(session) localStorage.setItem('aresa_last_login', new Date().toISOString())
    })
    // auto logout por inactividad 12h
    const check = setInterval(async()=>{
      const last = localStorage.getItem('aresa_last_login')
      if(last && Date.now() - new Date(last).getTime() > 12*60*60*1000){
        await supabase.auth.signOut()
      }
    }, 60_000)
    const onAct = ()=> localStorage.setItem('aresa_last_active', Date.now().toString())
    window.addEventListener('click', onAct); window.addEventListener('keydown', onAct)
    return () => { sub.subscription.unsubscribe(); clearInterval(check); window.removeEventListener('click', onAct); window.removeEventListener('keydown', onAct) }
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', userId).single()
      .then(({ data, error }) => {
        if (error) console.error(error)
        setProfile((data as Profile) ?? null)
        setLoading(false)
      })
  }, [userId])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return <Ctx.Provider value={{ userId, profile, loading, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
