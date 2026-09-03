-- Aresa Fichaje - SQL para Supabase: src/lib/supabase.ts:12
-- Pegar en Supabase > SQL Editor > Run

-- 1) profiles (vinculada a auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  rol text not null check (rol in ('admin','empleado')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own_or_admin" on public.profiles for update using (auth.uid() = id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin'));

-- 2) geocercas
create table if not exists public.geocercas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  lat double precision not null,
  lng double precision not null,
  radio_m integer not null check (radio_m > 0),
  activa boolean default true,
  created_at timestamptz default now()
);
alter table public.geocercas enable row level security;
create policy "geocercas_all" on public.geocercas for all using (true) with check (true);
-- Si quieres restringir creación solo admin, reemplaza por:
-- create policy "geocercas_select" on public.geocercas for select using (true);
-- create policy "geocercas_admin_write" on public.geocercas for all using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin'));

-- 3) fichajes
create table if not exists public.fichajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','pausa_inicio','pausa_fin','salida')),
  lat double precision not null,
  lng double precision not null,
  direccion text,
  foto_url text,
  dentro_geocerca boolean not null default false,
  geocerca_id uuid references public.geocercas(id) on delete set null,
  distancia_m integer,
  created_at timestamptz default now()
);
alter table public.fichajes enable row level security;
create policy "fichajes_select_own_or_admin" on public.fichajes for select using (
  auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol='admin')
);
create policy "fichajes_insert_own" on public.fichajes for insert with check (auth.uid() = user_id);
-- indices
create index if not exists idx_fichajes_user on public.fichajes(user_id, created_at desc);
create index if not exists idx_fichajes_created on public.fichajes(created_at desc);

-- 4) Storage para fotos
insert into storage.buckets (id, name, public) values ('fichajes-fotos','fichajes-fotos', true)
on conflict (id) do nothing;

create policy "fotos_public_read" on storage.objects for select using (bucket_id='fichajes-fotos');
create policy "fotos_insert_own" on storage.objects for insert with check (bucket_id='fichajes-fotos' and auth.role()='authenticated');
create policy "fotos_update_own" on storage.objects for update using (bucket_id='fichajes-fotos' and auth.role()='authenticated');
create policy "fotos_delete_own" on storage.objects for delete using (bucket_id='fichajes-fotos' and auth.role()='authenticated');

-- 5) Realtime
alter publication supabase_realtime add table public.fichajes;

-- 6) Trigger para auto-crear profile? Opcional, lo hacemos desde app.
-- Para hacer admin al primer usuario:
-- update public.profiles set rol='admin' where email='tu_email@aresa.com';

-- Geocerca ejemplo Tancacha (ajusta coords)
insert into public.geocercas (nombre, lat, lng, radio_m) values ('Planta Aresa Tancacha', -32.2426, -63.5420, 300) on conflict do nothing;
