// Importación de fichajes desde Excel - admin sube tabla, se valida e inserta
import { downloadWorkbook } from './excel'

export type ImportPreview = {
  valid: ValidRow[]
  errors: { line: number; error: string; raw: string }[]
  total: number
}

export type ValidRow = {
  line: number
  user_id: string
  nombre: string
  email: string
  tipo: 'entrada' | 'salida'
  sucursal_id: string
  sucursal: string
  lat: number
  lng: number
  direccion: string
  created_at: string // ISO
}

const norm = (s: any) =>
  String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const HEADER_ALIAS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'correo', 'mail', 'empleado', 'usuario'],
  fecha: ['fecha', 'date', 'dia'],
  hora: ['hora', 'time'],
  tipo: ['tipo', 'type', 'movimiento'],
  sucursal: ['sucursal', 'geocerca', 'frente', 'suc', 'planta'],
}

function cellText(v: any): any {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if (typeof (v as any).text === 'string') return (v as any).text
    if (Array.isArray((v as any).richText)) return (v as any).richText.map((t: any) => t.text).join('')
    return ''
  }
  return String(v)
}

function parseFecha(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function parseHora(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${m[1].padStart(2, '0')}:${m[2]}`
  return null
}

function parseTipo(v: any): 'entrada' | 'salida' | null {
  const s = norm(v)
  if (s === 'entrada' || s === 'in' || s === 'e') return 'entrada'
  if (s === 'salida' || s === 'out' || s === 's') return 'salida'
  return null
}

export async function parseFichajesExcel(
  buf: ArrayBuffer,
  usuarios: { id: string; nombre: string; email: string }[],
  sucursales: { id: string; nombre: string; lat: number; lng: number; direccion?: string | null }[]
): Promise<ImportPreview> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('El archivo no tiene hojas')

  // header: primera fila no vacía
  let headerRow = 0
  let colIdx: Record<string, number> = {}
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (headerRow) return
    const vals = (row.values as any[]) ?? []
    const map: Record<string, number> = {}
    for (let c = 1; c < vals.length; c++) {
      const h = norm(cellText(vals[c]))
      for (const [field, aliases] of Object.entries(HEADER_ALIAS)) {
        if (aliases.includes(h) && !(field in map)) map[field] = c
      }
    }
    if (map.email && map.fecha && map.hora && map.tipo && map.sucursal) {
      headerRow = n
      colIdx = map
    }
  })
  if (!headerRow) throw new Error('No encuentro encabezado: se necesitan columnas Email, Fecha, Hora, Tipo y Sucursal')

  const byEmail = new Map(usuarios.map(u => [u.email.toLowerCase(), u]))
  const bySuc = new Map(sucursales.map(s => [norm(s.nombre), s]))
  const valid: ValidRow[] = []
  const errors: ImportPreview['errors'] = []
  let total = 0

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRow) return
    const vals = (row.values as any[]) ?? []
    const get = (f: string) => cellText(vals[colIdx[f]])
    // fila totalmente vacía
    if (!String(get('email')).trim() && !String(get('fecha')).trim()) return
    total++
    const raw = [get('email'), get('fecha'), get('hora'), get('tipo'), get('sucursal')].map(v => String(v instanceof Date ? v.toLocaleString() : v ?? '')).join(' | ')

    const prof = byEmail.get(String(get('email')).trim().toLowerCase())
    if (!prof) { errors.push({ line: n, error: `Email no registrado: ${get('email')}`, raw }); return }
    const fecha = parseFecha(get('fecha'))
    if (!fecha) { errors.push({ line: n, error: `Fecha inválida (usa AAAA-MM-DD o DD/MM/AAAA): ${get('fecha')}`, raw }); return }
    const hora = parseHora(get('hora'))
    if (!hora) { errors.push({ line: n, error: `Hora inválida (usa HH:MM): ${get('hora')}`, raw }); return }
    const tipo = parseTipo(get('tipo'))
    if (!tipo) { errors.push({ line: n, error: `Tipo inválido (entrada o salida): ${get('tipo')}`, raw }); return }
    const suc = bySuc.get(norm(get('sucursal')))
    if (!suc) { errors.push({ line: n, error: `Sucursal no encontrada: ${get('sucursal')}`, raw }); return }

    const dt = new Date(`${fecha}T${hora}:00`)
    if (isNaN(dt.getTime())) { errors.push({ line: n, error: `Fecha/hora inválida: ${fecha} ${hora}`, raw }); return }
    valid.push({
      line: n, user_id: prof.id, nombre: prof.nombre, email: prof.email, tipo,
      sucursal_id: suc.id, sucursal: suc.nombre, lat: suc.lat, lng: suc.lng,
      direccion: (suc as any).direccion ?? suc.nombre, created_at: dt.toISOString(),
    })
  })

  return { valid, errors, total }
}

export async function descargarPlantillaImportacion(sucursales: { nombre: string }[]) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fichajes')
  ws.columns = [
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Hora', key: 'hora', width: 10 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Sucursal', key: 'sucursal', width: 24 },
  ]
  const header = ws.getRow(1)
  header.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A5F' } }
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  const suc1 = sucursales[0]?.nombre ?? 'Taller'
  ws.addRow({ email: 'empleado@aresa.com', fecha: '2026-10-02', hora: '08:00', tipo: 'entrada', sucursal: suc1 })
  ws.addRow({ email: 'empleado@aresa.com', fecha: '2026-10-02', hora: '17:00', tipo: 'salida', sucursal: suc1 })

  const ayuda = wb.addWorksheet('Ayuda')
  ayuda.columns = [{ header: 'Instrucciones', key: 't', width: 90 }]
  ;[
    'Completa una fila por fichaje. No cambies los nombres de columna.',
    'Email: tiene que estar registrado en Usuarios (en minúsculas).',
    'Fecha: AAAA-MM-DD (ej 2026-10-02) o DD/MM/AAAA.',
    'Hora: HH:MM de 24h (ej 08:00).',
    'Tipo: entrada o salida.',
    `Sucursal: nombre exacto como está cargado (${sucursales.map(s => s.nombre).join(', ') || '—'}).`,
    'Las filas con error se muestran antes de importar y no se cargan.',
  ].forEach(t => ayuda.addRow({ t }))
  await downloadWorkbook(wb, 'Aresa_Plantilla_Importar_Fichajes.xlsx')
}
