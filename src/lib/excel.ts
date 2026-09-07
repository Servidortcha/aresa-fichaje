// Helper sanitize cell - P1/P2
// P2: xlsx eliminado (HIGH GHSA-4r6h/GHSA-5pgg) → migrado a exceljs (ver excelExport.ts)

export function sanitizeCell(v: any): any {
  if (typeof v !== 'string') return v
  // evitar inyección de fórmula Excel: prefijar con ' si empieza con =,+,-,@
  if (/^[=+\-@]/.test(v.trim())) return `'${v}`
  // evitar prototype pollution keys
  if (v === '__proto__' || v === 'constructor' || v === 'prototype') return `_${v}`
  return v
}

export async function loadExcelJS() {
  return await import('exceljs')
}

// Descarga workbook exceljs (browser)
export async function downloadWorkbook(workbook: any, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
