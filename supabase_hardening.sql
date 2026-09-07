-- Hardening Aresa Fichaje - RLS y auditoría (P0 - SECURITY FIX)
-- Ejecutar después de supabase.sql Y de supabase_migracion_admin_fichajes.sql
-- Corrige políticas permisivas de supabase.sql:16-17,42

-- 0) PROFILES: cerrar lectura/inserción abierta (ANTES: using(true) / with check(true))
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select using (
  auth.role() = 'authenticated'
);
-- solo el trigger security definer o el propio usuario puede insertar su perfil
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (
  auth.uid() = id
);

-- 1) Asegurar que fichajes no se puedan UPDATE/DELETE por empleado (solo admin) - ya migrado en supabase_migracion_admin_fichajes.sql
-- 2) Perfiles: solo admin puede cambiar rol, empleado solo su nombre y nunca rol
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update using (
  auth.uid() = id and (select rol from public.profiles where id=auth.uid()) = 'empleado' and rol = 'empleado'
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin') or rol='empleado'
);

-- 2b) GEOCERCAS: cerrar escritura anónima (ANTES: for all using(true))
drop policy if exists "geocercas_all" on public.geocercas;
create policy "geocercas_select" on public.geocercas for select using (
  auth.role() = 'authenticated' or true  -- lectura para mapa empleado; cambiar a auth.role()='authenticated' si quieres 100% privado
);
create policy "geocercas_admin_write" on public.geocercas for all using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);

-- 2c) STORAGE: cerrar lectura pública anónima -> solo autenticados (fotos con dato personal)
-- Si quieres bucket 100% privado, cambia bucket a private y usa signed URLs en el código
drop policy if exists "fotos_public_read" on storage.objects;
create policy "fotos_read_authenticated" on storage.objects for select using (
  bucket_id='fichajes-fotos' and auth.role()='authenticated'
);
-- insert/update/delete ya requieren authenticated (se mantienen)
-- Opcional: reforzar que solo dueño o admin pueda borrar su carpeta
-- drop policy if exists "fotos_delete_own" on storage.objects;
-- create policy "fotos_delete_admin_or_owner" on storage.objects for delete using (
--   bucket_id='fichajes-fotos' and (auth.role()='authenticated' and (storage.foldername(name))[1] = auth.uid()::text or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin'))
-- );

-- 3) Auditoría simple: log de fichajes (opcional)
create table if not exists public.auditoria_fichajes (
  id uuid primary key default gen_random_uuid(),
  fichaje_id uuid,
  accion text,
  actor uuid references public.profiles(id),
  detalle jsonb,
  created_at timestamptz default now()
);
alter table public.auditoria_fichajes enable row level security;
create policy "auditoria_admin" on public.auditoria_fichajes for all using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')) with check (true);
