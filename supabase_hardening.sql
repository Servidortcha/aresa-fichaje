-- Hardening Aresa Fichaje - RLS y auditoría
-- Ejecutar después de supabase.sql

-- 1) Asegurar que fichajes no se puedan UPDATE/DELETE por empleado (solo admin) - ya migrado en supabase_migracion_admin_fichajes.sql
-- 2) Perfiles: solo admin puede cambiar rol
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update using (
  auth.uid() = id and (select rol from public.profiles where id=auth.uid()) = 'empleado' and rol = 'empleado'
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin') or rol='empleado'
);

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
