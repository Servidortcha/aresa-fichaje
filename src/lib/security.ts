// Seguridad Aresa - src/lib/security.ts (P2 hardening)
export function isMockLocation(pos: GeolocationPosition): { mock:boolean, reason?:string } {
  const c = pos.coords
  // 1) accuracy
  if (c.accuracy === 0) return { mock: true, reason: 'Precisión 0 — posible mock' }
  if (c.accuracy > 200) return { mock: true, reason: `Precisión baja (${Math.round(c.accuracy)}m)` }
  if (c.accuracy < 5) return { mock: true, reason: `Precisión sospechosa ${c.accuracy}m — mock genérico` }
  // 2) mock flag Android (algunas WebView lo exponen)
  // @ts-ignore
  if ((pos as any).mocked === true || (c as any).mocked === true) return { mock: true, reason: 'Mock detectado por sistema' }
  // 3) altitude inconsistente: mock suele dar null o 0 exacto con high accuracy
  if (c.altitude === 0 && c.altitudeAccuracy === 0 && c.accuracy < 10) return { mock: true, reason: 'Altitud 0 exacta — posible mock' }
  // 4) velocidad irreal (> 200km/h = 55m/s) sin heading
  if (c.speed !== null && c.speed > 55 && (c.heading === null || isNaN(c.heading))) return { mock: true, reason: `Velocidad irreal ${Math.round((c.speed*3.6))}km/h` }
  // 5) timestamp futuro o muy viejo (>1min desfase)
  if (Math.abs(Date.now() - pos.timestamp) > 120_000) return { mock: true, reason: 'Timestamp desfasado >2min — reloj/mock' }
  // 6) coordenadas exactas redondas (mock suele usar 4 decimales exactos)
  const latStr = String(c.latitude), lngStr = String(c.longitude)
  if (/\.0{3,}$/.test(latStr) || /\.0{3,}$/.test(lngStr)) return { mock: true, reason: 'Coordenadas redondas sospechosas' }
  return { mock: false }
}

export function watermarkFoto(canvas: HTMLCanvasElement, lat:number, lng:number, when: Date, nombre?:string): string {
  const ctx = canvas.getContext('2d')!
  const h = 38
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, canvas.height - h, canvas.width, h)
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  // incluye timestamp ISO para auditoría y evita reuso de foto vieja
  const txt = `${when.toISOString()} · ${lat.toFixed(5)},${lng.toFixed(5)}${nombre ? ' · '+nombre : ''}`
  ctx.fillText(txt, 8, canvas.height - 14)
  // línea fina anti-crop: si la foto se recorta, el watermark desaparece y se detecta
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(0, canvas.height - h - 2, canvas.width, 2)
  return canvas.toDataURL('image/jpeg', 0.82)
}

// rate limit cliente simple (evita doble tap)
const lastFichaje = new Map<string, number>()
export function canFichar(userId:string, minMs= 30_000): boolean {
  const last = lastFichaje.get(userId) ?? 0
  if (Date.now() - last < minMs) return false
  lastFichaje.set(userId, Date.now())
  return true
}
