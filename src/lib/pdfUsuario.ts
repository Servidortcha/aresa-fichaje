// PDF credenciales usuario - Aresa Fichaje (P3) - jspdf dinámico para no inflar bundle inicial
type UsuarioPdf = {
  nombre: string
  email: string
  rol: string
  id: string
  created_at: string
  password?: string // solo disponible al crear
}

export async function generarPdfUsuario(u: UsuarioPdf) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // Fondo header Aresa
  doc.setFillColor(22, 58, 95) // #163A5F ink
  doc.rect(0, 0, W, 38, 'F')
  // barras decorativas
  doc.setFillColor(20, 195, 176)
  for (let x = 0; x < W; x += 18) doc.rect(x, 33, 10, 2, 'F')

  // Título
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('ARESA', 14, 16)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Fichaje  •  Tu jornada, en un toque', 14, 22)
  doc.setFontSize(8)
  doc.setTextColor(200, 220, 235)
  doc.text('Foto y ubicación verificadas  •  Sistema seguro', 14, 28)

  // Badge fecha
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(W - 62, 10, 52, 14, 2, 2, 'FD')
  doc.setTextColor(22, 58, 95)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('ENTREGA CREDENCIALES', W - 60, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(new Date().toLocaleDateString('es-AR'), W - 60, 20)

  // Card usuario
  let y = 48
  doc.setFillColor(240, 242, 248) // paper
  doc.roundedRect(14, y, W - 28, 52, 4, 4, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, y, W - 28, 52, 4, 4, 'S')

  doc.setTextColor(22, 58, 95)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(u.nombre, 18, y + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text(`LEGAJO ${u.id.slice(0, 8).toUpperCase()}  •  ${u.rol.toUpperCase()}  •  Alta ${new Date(u.created_at).toLocaleDateString('es-AR')}`, 18, y + 15)

  // Datos en 2 columnas
  doc.setFontSize(8)
  doc.setTextColor(22, 58, 95)
  doc.setFont('helvetica', 'bold')
  doc.text('Email (usuario):', 18, y + 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(u.email, 18, y + 29)
  // línea subrayado email
  doc.setDrawColor(22, 58, 95)
  doc.line(18, y + 30, 18 + doc.getTextWidth(u.email) + 2, y + 30)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Contraseña:', W / 2 + 4, y + 24)
  doc.setFont('helvetica', 'normal')
  if (u.password) {
    doc.setFontSize(10)
    doc.setFont('courier', 'bold')
    doc.text(u.password, W / 2 + 4, y + 29)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 20, 20)
    doc.text('⚠ Cambiar en primer acceso si fue generada por admin', W / 2 + 4, y + 34)
    doc.setTextColor(22, 58, 95)
  } else {
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text('No se muestra por seguridad.', W / 2 + 4, y + 29)
    doc.text('Usar la asignada o Recuperar contraseña.', W / 2 + 4, y + 33)
  }

  // Badge rol
  const rolX = W - 38
  const isAdmin = u.rol === 'admin'
  doc.setFillColor(isAdmin ? 22 : 75, isAdmin ? 58 : 115, isAdmin ? 95 : 85)
  doc.roundedRect(rolX, y + 6, 22, 8, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text(u.rol.toUpperCase(), rolX + 11, y + 11, { align: 'center' })

  // Instrucciones
  y = 108
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, y, W - 28, 62, 4, 4, 'FD')
  doc.setTextColor(22, 58, 95)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Cómo ingresar', 18, y + 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 65, 80)
  const pasos = [
    '1. Entrá a:  https://aresa-fichaje-nine.vercel.app  (guardalo como acceso directo / PWA)',
    '2. Tocá "Entrar"  →  escribí tu Email y Contraseña  →  tildá "Recordar cuenta"',
    '3. Otorgá permisos de Cámara y Ubicación (obligatorios para fichar).',
    '4. En "Fichar"  →  Abrir cámara  →  Capturar foto  →  se registra con GPS y geocerca.',
    '5. Revisá tus horas en "Mis fichajes". Si hay error, usa "Solicitar corrección".',
  ]
  let py = y + 16
  pasos.forEach(p => { doc.text(p, 18, py); py += 6 })

  // QR placeholder (url en texto + recuadro)
  y = 176
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, y, W - 28, 28, 3, 3, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, y, W - 28, 28, 3, 3, 'S')
  doc.setTextColor(22, 58, 95)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Acceso directo:', 18, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(46, 111, 158)
  doc.textWithLink('https://aresa-fichaje-nine.vercel.app', 18, y + 14, { url: 'https://aresa-fichaje-nine.vercel.app' })
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text('Escaneá o tocá el link. Instalá como App: en Chrome  →  menú  →  "Instalar app" / "Agregar a pantalla principal".', 18, y + 20)

  // Footer seguridad
  doc.setFontSize(6)
  doc.setTextColor(120, 130, 145)
  doc.text('🔒 Tus datos (foto/ubicación) se usan solo para verificar jornada. No compartas tu contraseña. Sesión 30 días si tildaste Recordar.', 14, H - 14)
  doc.text(`ID ${u.id}  •  Generado ${new Date().toISOString().slice(0, 10)} por Admin Aresa Fichaje  •  Documento privado`, 14, H - 10)

  // Línea corte
  doc.setDrawColor(180, 190, 200)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(14, H - 22, W - 14, H - 22)

  const filename = `Aresa_${u.nombre.replace(/\s+/g, '_')}_${u.email.split('@')[0]}.pdf`
  doc.save(filename)
}
