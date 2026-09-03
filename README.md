# Aresa Fichaje — PWA Fichaje Remoto con Foto + Geolocalización + Geocerca

PWA instalable (celular/PC) + Supabase. Admin ve ubicación y foto en tiempo real.

## 1) Configurar Supabase (5 min)

1. Entra a tu proyecto en supabase.com > **SQL Editor** > pega todo el contenido de `supabase.sql` > Run.
2. Ve a **Storage** > verifica bucket `fichajes-fotos` creado (público).
3. **Database > Tables > profiles** > haz tu usuario admin: registra primero un usuario en la app, luego ejecuta:
   ```sql
   update public.profiles set rol='admin' where email='tu_email@aresa.com';
   ```
4. **Project Settings > API** > copia `URL` y `anon key` > pegalos en `.env`:
   ```
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. **Authentication > Providers > Email** > activa confirmación si quieres (opcional, desactívalo para pruebas rápidas).

## 2) Correr local

```bash
npm install
npm run dev
# abre http://localhost:5173
# Para probar cámara/GPS necesitas HTTPS — en celular usa la URL de deploy o usa ngrok
```

## 3) Deploy recomendado: Vercel (gratis)

```bash
npm i -g vercel
vercel --prod
# Agrega variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel > Settings > Environment Variables
```

Alternativa: Netlify / Cloudflare Pages — solo `npm run build` y sube `dist/`.

## 4) Uso

**Empleado:** Login > /fichar > Activar cámara + Obtener ubicación (obligatorios) > Capturar foto > Entrada/Pausa/Salida. Valida geocerca automática.

**Admin:** Login con rol admin > /admin > Ve tabla + mapa + fotos + ubicación. Filtros + Exportar Excel. Crea/borra geocercas (ej: Planta Tancacha -32.2426, -63.5420, 300m).

## 5) Seguridad / Privacidad

- RLS activo: empleado solo ve sus fichajes, admin ve todo.
- Fotos en bucket público (link directo) — para privado cambia bucket a privado y usa signed URLs.
- Cámara y GPS son obligatorios; no se permite foto de galería.
- Aviso legal: muestra consentimiento de foto/ubicación en onboarding (RGPD).
- Detecta fichaje fuera de geocerca pero lo guarda igual marcado en rojo.

## Estructura

```
src/lib/supabase.ts      # cliente + tipos
src/lib/geofence.ts      # Haversine + reverse geocode
src/context/AuthContext.tsx
src/pages/Login.tsx
src/pages/Empleado.tsx   # fichaje con foto viva + GPS
src/pages/Admin.tsx      # dashboard + mapa Leaflet + Excel
supabase.sql             # schema completo
```

## Próximos pasos (opcional)

- Notificación push si alguien ficha fuera de geocerca
- Cálculo horas trabajadas diario/mensual
- Reporte PDF
- Bloquear fichaje mock-location (requiere app nativa)
