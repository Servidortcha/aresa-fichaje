import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anon) {
  console.warn('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY - revisa .env')
}

export const supabase = createClient(url ?? '', anon ?? '')

export type Profile = {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'empleado'
  created_at: string
}

export type Geocerca = {
  id: string
  nombre: string
  lat: number
  lng: number
  radio_m: number
  activa: boolean
  direccion?: string | null
  provincia?: string | null
  tipo?: string | null
  created_at?: string
}

export type Fichaje = {
  id: string
  user_id: string
  tipo: 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'
  lat: number
  lng: number
  direccion: string | null
  foto_url: string | null
  dentro_geocerca: boolean
  geocerca_id: string | null
  distancia_m: number | null
  created_at: string
  profiles?: Profile
}
