import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anon) {
  console.warn('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY - revisa .env')
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }
})

// Helper para bucket fichajes-fotos: soporta bucket público y privado (P1)
// Guarda solo el path (ej: uid/timestamp.jpg) en foto_url; genera URL fresca al mostrar para no expirar
export async function getFotoUrl(path: string): Promise<string> {
  const { data: signed, error } = await supabase.storage.from('fichajes-fotos').createSignedUrl(path, 3600)
  if (!error && signed?.signedUrl) return signed.signedUrl
  const { data } = supabase.storage.from('fichajes-fotos').getPublicUrl(path)
  return data.publicUrl
}
export function isFotoPath(urlOrPath: string | null): boolean {
  if (!urlOrPath) return false
  return !urlOrPath.startsWith('http')
}
// Extrae path del foto_url guardado (puede ser path puro, public URL o signed URL expirada)
export function extraerPathFoto(stored: string | null): string | null {
  if (!stored) return null
  // si ya es path puro (uid/xxx.jpg)
  if (!stored.startsWith('http')) return stored
  try {
    const u = new URL(stored)
    // formatos: /storage/v1/object/public/fichajes-fotos/<path>  o  /object/sign/.../token
    // o  /storage/v1/object/sign/fichajes-fotos/<path>?token=...
    const idx = u.pathname.indexOf('/fichajes-fotos/')
    if (idx !== -1) {
      let p = u.pathname.slice(idx + '/fichajes-fotos/'.length)
      // quita query token si viene en pathname (sign)
      p = decodeURIComponent(p.split('?')[0])
      return p || null
    }
  } catch {}
  return null
}
export async function getFotoDisplayUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null
  const path = extraerPathFoto(stored)
  if (!path) return stored // si no se pudo extraer, devuelve original (puede ser public URL válida)
  return await getFotoUrl(path)
}

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
