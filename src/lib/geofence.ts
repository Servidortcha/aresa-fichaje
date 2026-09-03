// Haversine distance in meters: src/lib/geofence.ts:5
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function dentroDeGeocerca(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radioM: number
): { dentro: boolean; distancia: number } {
  const d = distanciaMetros(lat, lng, centerLat, centerLng)
  return { dentro: d <= radioM, distancia: Math.round(d) }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { Accept: 'application/json' } }
    )
    const j = await res.json()
    return j.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

// DMS -> decimal: src/lib/geofence.ts:39 - soporta 32°14'39.7"S 63°59'07.4"W y variantes
export function dmsPartToDec(deg: number, min: number, sec: number, dir: string): number {
  let dec = Math.abs(deg) + min / 60 + sec / 3600
  if (dir.toUpperCase() === 'S' || dir.toUpperCase() === 'W') dec *= -1
  // si deg ya es negativo y dir es S/W, respeta
  if (deg < 0) dec = -Math.abs(dec)
  return dec
}

export function parseDMS(input: string): { lat: number; lng: number } | null {
  // Normaliza: reemplaza ° '" etc por espacios, mantiene letras
  // Intenta parsear con regex flexible
  const s = input.trim()
  // Pattern para 32°14'39.7"S 63°59'07.4"W  o 32 14 39.7 S 63 59 07.4 W
  // También soporta coma como separador decimal
  const re = /(-?\d+)[°\s]+(\d+)[\'\s]+([\d.,]+)[\"\s]*([NS])[\s,;]+(-?\d+)[°\s]+(\d+)[\'\s]+([\d.,]+)[\"\s]*([EW])/i
  const m = s.match(re)
  if (m) {
    const lat = dmsPartToDec(parseInt(m[1]), parseInt(m[2]), parseFloat(m[3].replace(',', '.')), m[4])
    const lng = dmsPartToDec(parseInt(m[5]), parseInt(m[6]), parseFloat(m[7].replace(',', '.')), m[8])
    return { lat, lng }
  }
  // Si viene solo lat o lng separado por?
  return null
}

export function parseCoordinate(input: string): { lat: number; lng: number } | null {
  const s = input.trim()
  // 1) intenta DMS
  const dms = parseDMS(s)
  if (dms) return dms
  // 2) intenta decimal " -32.2426, -63.542" o "-32.2426 -63.542"
  const decRe = /(-?\d+\.?\d*)[\s,;]+(-?\d+\.?\d*)/
  const m2 = s.match(decRe)
  if (m2) {
    const lat = parseFloat(m2[1]); const lng = parseFloat(m2[2])
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
  }
  return null
}

export function decimalToDMS(lat: number, lng: number): string {
  const toDMS = (dec: number, isLat: boolean) => {
    const dir = dec >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W')
    const ad = Math.abs(dec)
    const d = Math.floor(ad)
    const mFloat = (ad - d) * 60
    const m = Math.floor(mFloat)
    const sec = (mFloat - m) * 60
    return `${d}°${String(m).padStart(2,'0')}'${sec.toFixed(1).padStart(4,'0')}"${dir}`
  }
  return `${toDMS(lat, true)} ${toDMS(lng, false)}`
}
