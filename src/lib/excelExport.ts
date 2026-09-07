// P2 exceljs - reemplaza xlsx para eliminar HIGH vuln GHSA-4r6h/GHSA-5pgg
import { sanitizeCell, downloadWorkbook } from './excel'

const aresaColors = {
  ink: 'FF163A5F',
  steel: 'FF2E6F9E',
  paper: 'FFF2EEE3',
  white: 'FFFFFFFF',
  gold: 'FFFFD700',
  border: 'FFD8D2C4',
}

function styleHeader(cell: any, isPrimary: boolean) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPrimary ? aresaColors.ink : aresaColors.steel } }
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: isPrimary ? 8 : 7 }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: aresaColors.border } },
    left: { style: 'thin', color: { argb: aresaColors.border } },
    bottom: { style: 'thin', color: { argb: aresaColors.border } },
    right: { style: 'thin', color: { argb: aresaColors.border } },
  }
}

function styleDataCell(cell: any, isEven: boolean, isGold = false) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isGold ? aresaColors.gold : isEven ? aresaColors.paper : aresaColors.white } }
  cell.border = {
    top: { style: 'thin', color: { argb: aresaColors.border } },
    left: { style: 'thin', color: { argb: aresaColors.border } },
    bottom: { style: 'thin', color: { argb: aresaColors.border } },
    right: { style: 'thin', color: { argb: aresaColors.border } },
  }
  if (isGold) cell.font = { bold: true }
}

// Columnas Aresa estándar para fichajes (12 cols)
const fichajesColumns = [
  { header: 'Fecha', key: 'Fecha', width: 18 },
  { header: 'Empleado', key: 'Empleado', width: 18 },
  { header: 'Email', key: 'Email', width: 28 },
  { header: 'Tipo', key: 'Tipo', width: 10 },
  { header: 'Sucursal', key: 'Sucursal', width: 18 },
  { header: 'Provincia', key: 'Provincia', width: 12 },
  { header: 'Lat', key: 'Lat', width: 12 },
  { header: 'Lng', key: 'Lng', width: 12 },
  { header: 'Direccion', key: 'Direccion', width: 30 },
  { header: 'Dentro', key: 'Dentro', width: 8 },
  { header: 'Distancia_m', key: 'Distancia_m', width: 12 },
  { header: 'Foto', key: 'Foto', width: 40 },
]

export async function exportFichajesSimple(rowsRaw: any[], filename: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fichajes')
  ws.columns = fichajesColumns as any
  // rows con sanitización
  const rows = rowsRaw.slice(0, 5000).map(r => {
    const o: any = {}
    for (const k of Object.keys(r)) o[k] = sanitizeCell(r[k])
    return o
  })
  rows.forEach(r => ws.addRow(r))
  // header style
  ws.getRow(1).eachCell((cell: any) => styleHeader(cell, true))
  ws.getRow(1).height = 18
  // zebra + borders
  for (let i = 2; i <= ws.rowCount; i++) {
    const isEven = i % 2 === 0
    ws.getRow(i).eachCell((cell: any) => styleDataCell(cell, isEven))
  }
  // autoFilter
  ws.autoFilter = { from: 'A1', to: 'L1' }
  await downloadWorkbook(wb, filename)
}

export async function exportFichajesPorSucursal(
  porSuc: Map<string, any[]>,
  allRows: any[],
  filename: string
) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  for (const [suc, list] of porSuc) {
    const ws = wb.addWorksheet(suc.slice(0, 31))
    ws.columns = fichajesColumns as any
    const rows = list.slice(0, 5000).map((r: any) => {
      const o: any = {}
      for (const k of Object.keys(r)) o[k] = sanitizeCell(r[k])
      return o
    })
    rows.forEach((r: any) => ws.addRow(r))
    ws.getRow(1).eachCell((cell: any) => styleHeader(cell, true))
    for (let i = 2; i <= ws.rowCount; i++) {
      const isEven = i % 2 === 0
      ws.getRow(i).eachCell((cell: any) => styleDataCell(cell, isEven))
    }
    ws.autoFilter = { from: 'A1', to: 'L1' }
  }
  // hoja Todos
  const wsAll = wb.addWorksheet('Todos')
  wsAll.columns = fichajesColumns as any
  allRows.slice(0, 5000).forEach((r: any) => {
    const o: any = {}
    for (const k of Object.keys(r)) o[k] = sanitizeCell(r[k])
    wsAll.addRow(o)
  })
  wsAll.getRow(1).eachCell((cell: any) => styleHeader(cell, true))
  for (let i = 2; i <= wsAll.rowCount; i++) {
    const isEven = i % 2 === 0
    wsAll.getRow(i).eachCell((cell: any) => styleDataCell(cell, isEven))
  }
  wsAll.autoFilter = { from: 'A1', to: 'L1' }
  await downloadWorkbook(wb, filename)
}

// Simonetti con exceljs - carga plantilla y rellena (migración P2 completa sin xlsx)
export async function exportSimonettiExcelJS(opts: {
  exportMes: string
  fichMes: any[]
  profs: any[]
  fetchTemplate: () => Promise<ArrayBuffer>
  setMsg: (s: string) => void
}) {
  const { default: ExcelJS } = await import('exceljs')
  const { exportMes, fichMes, profs, fetchTemplate, setMsg } = opts
  try {
    const [y, m] = exportMes.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const mesNombres = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
    const diaSem = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
    const mesStr = mesNombres[m - 1]

    const buf = await fetchTemplate()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const sheetName = wb.worksheets[0]?.name ?? 'Sheet1'
    const ws = wb.getWorksheet(sheetName)!
    // Si plantilla no cargó, fallback: crear desde cero
    if (!ws) throw new Error('Plantilla sin hojas')

    // --- mapear dayCols leyendo fila 1 (headers día) y fila 2 (subheaders) ---
    // Usamos getCell por columna (1-indexed)
    // Estructura plantilla: fila1 = "1-ENE LUNES" merge 4-7 cols por día, fila2 = Entrada/Salida/Total Hs./DÍAS/Ausencia
    const dayCols: Record<number, { entrada: number[]; salida: number[]; total: number | null; dias: number | null; ausencia: number | null }> = {}
    const colToDay: Record<number, string> = {}

    // Leer merges para mapear col -> day string
    // exceljs: ws.model.merges contiene strings "A1:D1" o objetos
    const merges: string[] = (ws as any).model?.merges ?? []
    // También intentar leer vía _merges
    const mergeList = merges.length ? merges : ((ws as any)._merges ? Object.keys((ws as any)._merges) : [])

    for (const mr of mergeList) {
      try {
        const range = typeof mr === 'string' ? mr : (mr as any).range ?? ''
        if (!range) continue
        // range like "E1:H1"
        const match = String(range).match(/([A-Z]+)1:([A-Z]+)1/)
        if (!match) continue
        const colToNum = (col: string) => {
          let n = 0
          for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
          return n
        }
        const s = colToNum(match[1])
        const e = colToNum(match[2])
        const v = ws.getCell(s, 1).value
        const vs = String(v ?? '')
        if (vs.match(/^\d+-/)) {
          for (let c = s; c <= e; c++) colToDay[c] = vs
        }
      } catch {}
    }
    // fallback lectura directa fila 1
    for (let c = 1; c <= 230; c++) {
      const v = ws.getCell(1, c).value
      const vs = String(v ?? '')
      if (vs.match(/^\d+-/)) colToDay[c] = vs
    }

    for (let col = 1; col <= 230; col++) {
      const dayStr = colToDay[col]
      if (!dayStr) continue
      const dayNum = parseInt(dayStr.split('-')[0])
      if (!dayNum || dayNum > 31) continue
      if (!dayCols[dayNum]) dayCols[dayNum] = { entrada: [], salida: [], total: null, dias: null, ausencia: null }
      const sub = String(ws.getCell(2, col).value ?? '')
      if (sub === 'Entrada') dayCols[dayNum].entrada.push(col)
      else if (sub === 'Salida') dayCols[dayNum].salida.push(col)
      else if (sub === 'Total Hs.') dayCols[dayNum].total = col
      else if (sub === 'DÍAS TRABAJADOS' || sub === 'DÍAS TRABAJADOS'.replace('Í', 'I')) dayCols[dayNum].dias = col
      else if (sub === 'Ausencia') dayCols[dayNum].ausencia = col
    }

    // actualizar headers días según mes
    for (let d = 1; d <= 31; d++) {
      const dc = dayCols[d]
      if (!dc) continue
      const dt = new Date(y, m - 1, d)
      const wd = diaSem[dt.getDay()]
      const newHeader = d <= daysInMonth ? `${d}-${mesStr} ${wd}` : ''
      // buscar primera col de ese día y actualizar (si había merge, solo primera celda tiene valor)
      for (let c = 1; c <= 230; c++) {
        if (colToDay[c] && colToDay[c].startsWith(`${d}-`)) {
          ws.getCell(1, c).value = newHeader || null
          break
        }
      }
    }

    // renombrar hoja
    const newName = `${mesStr}-${String(y).slice(-2)}`
    ws.name = newName

    // agrupar fichajes por usuario/día
    const fichByUserDay = new Map<string, Map<number, { entrada: string[]; salida: string[] }>>()
    for (const f of fichMes ?? []) {
      const d = new Date(f.created_at)
      if (d.getMonth() + 1 !== m || d.getFullYear() !== y) continue
      const day = d.getDate()
      const key = f.user_id
      if (!fichByUserDay.has(key)) fichByUserDay.set(key, new Map())
      const mDay = fichByUserDay.get(key)!
      if (!mDay.has(day)) mDay.set(day, { entrada: [], salida: [] })
      const entry = mDay.get(day)!
      const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      if (f.tipo === 'entrada') entry.entrada.push(hh)
      else if (f.tipo === 'salida') entry.salida.push(hh)
    }

    // limpiar filas 3..34 desde col 5 (E) en adelante
    for (let r = 3; r <= 35; r++) {
      const row = ws.getRow(r)
      for (let c = 5; c <= 230; c++) {
        const cell = row.getCell(c)
        cell.value = null
      }
    }

    // llenar filas por usuario (fila 3 = row 3)
    let rowIdx = 3
    for (const prof of profs) {
      if (rowIdx > 34) break
      const row = ws.getRow(rowIdx)
      const legajo = String(prof.id).slice(0, 8).toUpperCase()
      row.getCell(1).value = sanitizeCell(legajo) // A
      row.getCell(2).value = sanitizeCell(prof.nombre) // B
      row.getCell(3).value = '' // C DESTINO
      row.getCell(4).value = 'ARESA' // D
      const userDays = fichByUserDay.get(prof.id)
      for (let d = 1; d <= daysInMonth; d++) {
        const dc = dayCols[d]
        if (!dc) continue
        const dayData = userDays?.get(d)
        if (!dayData) continue
        const allTimes: string[] = []
        const maxPairs = Math.max(dayData.entrada.length, dayData.salida.length)
        for (let i = 0; i < maxPairs; i++) {
          if (dayData.entrada[i]) allTimes.push(dayData.entrada[i])
          if (dayData.salida[i]) allTimes.push(dayData.salida[i])
        }
        const orderedCols: number[] = []
        const flat = [...dc.entrada, ...dc.salida, dc.total, dc.dias, dc.ausencia].filter(Boolean) as number[]
        flat.sort((a, b) => a - b)
        for (const col of flat) if (dc.entrada.includes(col) || dc.salida.includes(col)) orderedCols.push(col)
        for (let i = 0; i < Math.min(allTimes.length, orderedCols.length); i++) {
          const col = orderedCols[i]
          const cell = row.getCell(col)
          cell.value = allTimes[i]
          cell.numFmt = 'h:mm'
        }
        if (dc.total && dayData.entrada.length && dayData.salida.length) {
          let totalMin = 0
          const pairs = Math.min(dayData.entrada.length, dayData.salida.length)
          for (let i = 0; i < pairs; i++) {
            const [h1, m1] = dayData.entrada[i].split(':').map(Number)
            const [h2, m2] = dayData.salida[i].split(':').map(Number)
            totalMin += h2 * 60 + m2 - (h1 * 60 + m1)
          }
          if (totalMin > 0) {
            const cell = row.getCell(dc.total)
            cell.value = totalMin / (24 * 60)
            cell.numFmt = '[h]:mm'
          }
        }
        if (dc.dias) {
          const cell = row.getCell(dc.dias)
          const has = dayData.entrada.length > 0 || dayData.salida.length > 0
          cell.value = has ? 1 : 0
        }
        if (dc.ausencia) {
          const cell = row.getCell(dc.ausencia)
          const has = dayData.entrada.length > 0 || dayData.salida.length > 0
          cell.value = has ? '' : 'A'
        }
      }
      // HORAS TOTALES y DÍAS al final cols 226,227 (si existen)
      let mesTotalMin = 0
      let diasTrab = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const dc = dayCols[d]
        if (dc?.total) {
          const v = row.getCell(dc.total).value
          if (typeof v === 'number') mesTotalMin += v * 24 * 60
        }
        if (dc?.dias) {
          const v = row.getCell(dc.dias).value
          if (v === 1) diasTrab++
        }
      }
      const ht = row.getCell(226)
      if (mesTotalMin > 0) { ht.value = mesTotalMin / (24 * 60); ht.numFmt = '[h]:mm' }
      row.getCell(227).value = diasTrab
      rowIdx++
    }

    // decorar headers
    for (let c = 1; c <= 230; c++) {
      const h1 = ws.getRow(1).getCell(c)
      if (h1.value) { h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c < 5 ? aresaColors.ink : aresaColors.steel } }; h1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 }; h1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; h1.border = { top: { style: 'thin', color: { argb: aresaColors.border } }, bottom: { style: 'thin', color: { argb: aresaColors.border } }, left: { style: 'thin', color: { argb: aresaColors.border } }, right: { style: 'thin', color: { argb: aresaColors.border } } } }
      const h2 = ws.getRow(2).getCell(c)
      if (h2.value) { h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aresaColors.steel } }; h2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 7 }; h2.alignment = { horizontal: 'center', vertical: 'middle' }; h2.border = { top: { style: 'thin', color: { argb: aresaColors.border } }, bottom: { style: 'thin', color: { argb: aresaColors.border } }, left: { style: 'thin', color: { argb: aresaColors.border } }, right: { style: 'thin', color: { argb: aresaColors.border } } } }
    }
    for (let r = 3; r <= 35; r++) {
      const row = ws.getRow(r)
      const isEven = r % 2 === 0
      for (let c = 1; c <= 230; c++) {
        const cell = row.getCell(c)
        if (cell.value !== null && cell.value !== undefined) {
          if (!cell.fill || (cell.fill as any).fgColor?.argb === undefined) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? aresaColors.paper : aresaColors.white } }
          }
          cell.border = { top: { style: 'thin', color: { argb: aresaColors.border } }, bottom: { style: 'thin', color: { argb: aresaColors.border } }, left: { style: 'thin', color: { argb: aresaColors.border } }, right: { style: 'thin', color: { argb: aresaColors.border } } }
          cell.alignment = { vertical: 'middle', horizontal: c < 3 ? 'left' : 'center' } as any
        }
      }
      for (const col of [225, 226, 227]) {
        const cell = row.getCell(col)
        if (cell.value !== null) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aresaColors.gold } }; cell.font = { bold: true }; cell.border = { top: { style: 'thin', color: { argb: aresaColors.border } }, bottom: { style: 'thin', color: { argb: aresaColors.border } }, left: { style: 'thin', color: { argb: aresaColors.border } }, right: { style: 'thin', color: { argb: aresaColors.border } } } }
      }
    }

    await downloadWorkbook(wb, `Simonetti_${mesStr}${y}_Fichajes_${exportMes}.xlsx`)
    setMsg(`Exportado formato Simonetti ${mesStr} ${y} ✓ (exceljs)`)
  } catch (e: any) {
    console.error(e)
    setMsg('Error export Simonetti: ' + e.message)
  }
}
