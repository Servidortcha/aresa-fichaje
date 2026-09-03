-- Migración frentes/sucursales fijas - ejecutar en Supabase SQL Editor
alter table public.geocercas add column if not exists direccion text;
alter table public.geocercas add column if not exists provincia text;
alter table public.geocercas add column if not exists tipo text default 'sucursal';
-- opcional: renombrar concepto sin romper código (geocercas seguirá funcionando)
-- para nueva semántica, puedes crear vista
create or replace view public.sucursales as select * from public.geocercas;
