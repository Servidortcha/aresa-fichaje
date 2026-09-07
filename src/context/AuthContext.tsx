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
    const LS_KEY = 'aresa_last_active'
    const touch = () => localStorage.setItem(LS_KEY, Date.now().toString())
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
      if(data.session) touch()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null)
      if(session) touch()
    })
    // auto logout por inactividad 12h (antes bug: leía aresa_last_login pero escribía aresa_last_active)
    const check = setInterval(async()=>{
      const last = localStorage.getItem(LS_KEY)
      if(last && Date.now() - Number(last) > 12*60*60*1000){
        await supabase.auth.signOut()
        localStorage.removeItem(LS_KEY)
      }
    }, 60_000)
    window.addEventListener('click', touch); window.addEventListener('keydown', touch)
    return () => { sub.subscription.unsubscribe(); clearInterval(check); window.removeEventListener('click', touch); window.removeEventListener('keydown', touch) }
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
