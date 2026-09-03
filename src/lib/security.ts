// Seguridad Aresa - src/lib/security.ts
export function isMockLocation(pos: GeolocationPosition): { mock:boolean, reason?:string } {
  // Heurísticas anti-fraude
  const c = pos.coords
  // accuracy muy baja (mock suele ser 0 o muy alta)
  if (c.accuracy > 200) return { mock: true, reason: `Precisión baja (${Math.round(c.accuracy)}m)` }
  if (c.accuracy === 0) return { mock: true, reason: 'Precisión 0 — posible mock' }
  // @ts-ignore mock flag en algunos Android
  if ((pos as any).mocked === true) return { mock: true, reason: 'Mock detectado por sistema' }
  return { mock: false }
}

export function watermarkFoto(canvas: HTMLCanvasElement, lat:number, lng:number, when: Date, nombre?:string): string {
  const ctx = canvas.getContext('2d')!
  // barra inferior
  const h = 34
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, canvas.height - h, canvas.width, h)
  ctx.fillStyle = '#fff'
  ctx.font = '12px monospace'
  const txt = `${when.toLocaleString('es-AR')} · ${lat.toFixed(5)},${lng.toFixed(5)}${nombre ? ' · '+nombre : ''}`
  ctx.fillText(txt, 8, canvas.height - 12)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// rate limit cliente simple (evita doble tap)
const lastFichaje = new Map<string, number>()
export function canFichar(userId:string, minMs= 30_000): boolean {
  const last = lastFichaje.get(userId) ?? 0
  if (Date.now() - last < minMs) return false
  lastFichaje.set(userId, Date.now())
  return true
}
