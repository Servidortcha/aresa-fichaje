-- Migración: añade tipo_fichaje a solicitudes_modificacion para alta como entrada/salida
alter table public.solicitudes_modificacion add column if not exists tipo_fichaje text check (tipo_fichaje in ('entrada','salida')) default 'entrada';
