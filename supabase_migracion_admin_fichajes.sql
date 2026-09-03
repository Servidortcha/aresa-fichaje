-- Admin puede editar/insertar fichajes de cualquier usuario
-- Ejecutar en Supabase SQL Editor

-- permitir admin insert para otro user_id
drop policy if exists "fichajes_insert_own" on public.fichajes;
create policy "fichajes_insert_own_or_admin" on public.fichajes for insert with check (
  auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);

-- permitir admin update
drop policy if exists "fichajes_update_admin" on public.fichajes;
create policy "fichajes_update_admin" on public.fichajes for update using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);

-- permitir admin delete
drop policy if exists "fichajes_delete_admin" on public.fichajes;
create policy "fichajes_delete_admin" on public.fichajes for delete using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);
