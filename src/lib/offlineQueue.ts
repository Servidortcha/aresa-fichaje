// P3 Offline queue - guarda fichajes fallidos por red y reintenta al volver online
const KEY = 'aresa_offline_queue'

export type QueuedFichaje = {
  id: string // local uuid
  user_id: string
  tipo: string
  lat: number
  lng: number
  direccion: string | null
  foto_dataUrl: string // base64 (se re-sube al reintentar)
  dentro_geocerca: boolean
  geocerca_id: string | null
  distancia_m: number | null
  created_at: string // ISO del intento original
  attempts: number
}

function load(): QueuedFichaje[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function save(q: QueuedFichaje[]) { localStorage.setItem(KEY, JSON.stringify(q)) }

export function enqueue(q: QueuedFichaje) {
  const all = load()
  all.push(q)
  save(all)
}

export function dequeue(id: string) {
  save(load().filter(x => x.id !== id))
}

export function getQueue(): QueuedFichaje[] { return load() }

export function clearQueue() { localStorage.removeItem(KEY) }
