-- Solicitudes de modificación de horas - empleado solicita, admin aprueba
create table if not exists public.solicitudes_modificacion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fichaje_id uuid references public.fichajes(id) on delete set null,
  tipo text not null check (tipo in ('modificacion','creacion')),
  -- para modificacion: fecha/hora y sucursal solicitadas
  fecha_solicitada date not null,
  hora_solicitada time not null,
  sucursal_id uuid references public.geocercas(id),
  motivo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  respuesta_admin text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.solicitudes_modificacion enable row level security;
-- empleado ve y crea las suyas
drop policy if exists "solicitudes_select_own_or_admin" on public.solicitudes_modificacion;
create policy "solicitudes_select_own_or_admin" on public.solicitudes_modificacion for select using (
  auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);
drop policy if exists "solicitudes_insert_own" on public.solicitudes_modificacion;
create policy "solicitudes_insert_own" on public.solicitudes_modificacion for insert with check (auth.uid()=user_id);
-- admin puede update (aprobar/rechazar)
drop policy if exists "solicitudes_update_admin" on public.solicitudes_modificacion;
create policy "solicitudes_update_admin" on public.solicitudes_modificacion for update using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);
create index if not exists idx_solicitudes_user on public.solicitudes_modificacion(user_id, created_at desc);
create index if not exists idx_solicitudes_estado on public.solicitudes_modificacion(estado);
