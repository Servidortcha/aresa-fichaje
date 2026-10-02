// exceljs - única exportación de la app: rendición de horas (Resumen + Detalle)
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

// Rendición de horas por persona y sucursal (quincena) - ÚNICA exportación
export async function exportHoras(
  resumen: { empleado: string; email: string; sucursal: string; minutos: number; jornadas: number }[],
  detalle: { empleado: string; fecha: string; entrada: string; salida: string; sucursal: string; minutos: number }[],
  filename: string
) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()

  const ws = wb.addWorksheet('Resumen')
  ws.columns = [
    { header: 'Empleado', key: 'empleado', width: 22 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Sucursal', key: 'sucursal', width: 24 },
    { header: 'Horas', key: 'horas', width: 12 },
    { header: 'Jornadas', key: 'jornadas', width: 10 },
  ]
  for (const r of resumen.slice(0, 5000)) {
    const row = ws.addRow({ empleado: sanitizeCell(r.empleado), email: sanitizeCell(r.email), sucursal: sanitizeCell(r.sucursal), jornadas: r.jornadas })
    const cell = row.getCell('horas')
    cell.value = r.minutos / (24 * 60)
    cell.numFmt = '[h]:mm'
  }
  ws.getRow(1).eachCell(c => styleHeader(c, true))
  ws.getRow(1).height = 18
  for (let i = 2; i <= ws.rowCount; i++) ws.getRow(i).eachCell(c => styleDataCell(c, i % 2 === 0))
  ws.autoFilter = { from: 'A1', to: 'E1' }

  const wd = wb.addWorksheet('Detalle')
  wd.columns = [
    { header: 'Empleado', key: 'empleado', width: 22 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Entrada', key: 'entrada', width: 10 },
    { header: 'Salida', key: 'salida', width: 10 },
    { header: 'Sucursal', key: 'sucursal', width: 24 },
    { header: 'Horas', key: 'horas', width: 12 },
  ]
  for (const r of detalle.slice(0, 5000)) {
    const row = wd.addRow({ empleado: sanitizeCell(r.empleado), fecha: r.fecha, entrada: r.entrada, salida: r.salida, sucursal: sanitizeCell(r.sucursal) })
    const cell = row.getCell('horas')
    cell.value = r.minutos / (24 * 60)
    cell.numFmt = '[h]:mm'
  }
  wd.getRow(1).eachCell(c => styleHeader(c, true))
  wd.getRow(1).height = 18
  for (let i = 2; i <= wd.rowCount; i++) wd.getRow(i).eachCell(c => styleDataCell(c, i % 2 === 0))
  wd.autoFilter = { from: 'A1', to: 'F1' }

  await downloadWorkbook(wb, filename)
}
