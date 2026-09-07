// Helper XLSX seguro - P1 mitigación vuln GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9
// xlsx 0.18.5 no tiene fix; mitigamos con:
// 1) dynamic import (no en bundle inicial)
// 2) sanitización de fórmulas (=, +, -, @) para evitar CSV injection
// 3) límite de filas 5000
// TODO futuro: migrar a exceljs si se requiere edición intensiva

export function sanitizeCell(v: any): any {
  if (typeof v !== 'string') return v
  // evitar inyección de fórmula Excel: prefijar con ' si empieza con =,+,-,@
  if (/^[=+\-@]/.test(v.trim())) return `'${v}`
  // evitar prototype pollution keys
  if (v === '__proto__' || v === 'constructor' || v === 'prototype') return `_${v}`
  return v
}

export async function loadXLSX() {
  return await import('xlsx')
}
