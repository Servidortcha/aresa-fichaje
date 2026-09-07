-- P3 Índices y constraints performance + auditoría
-- Ejecutar después de P0

-- 1) Índice para búsquedas por fecha (panel admin rango)
create index if not exists idx_fichajes_fecha on public.fichajes using btree (created_at desc);
create index if not exists idx_fichajes_tipo on public.fichajes (tipo);
create index if not exists idx_fichajes_geocerca on public.fichajes (geocerca_id) where geocerca_id is not null;

-- 2) Índice GIN para búsqueda empleado por nombre/email vía join (si usas view)
-- Nota: no creamos trigram aquí para evitar extensión pg_trgm si no está habilitada, pero recomendado:
-- create extension if not exists pg_trgm;
-- create index if not exists idx_profiles_nombre_trgm on public.profiles using gin (nombre gin_trgm_ops);

-- 3) Constraint para evitar fichaje duplicado exacto (mismo user, mismo segundo)
create unique index if not exists uq_fichajes_user_ts on public.fichajes (user_id, created_at);

-- 4) Auditoría extendida: si no existe, crea trigger log
create or replace function public.log_fichaje_audit() returns trigger as $$
begin
  insert into public.auditoria_fichajes (fichaje_id, accion, actor, detalle)
  values (coalesce(NEW.id, OLD.id), TG_OP, auth.uid(), jsonb_build_object('tipo', coalesce(NEW.tipo, OLD.tipo), 'at', now()));
  return coalesce(NEW, OLD);
end; $$ language plpgsql security definer;

drop trigger if exists trg_audit_fichajes on public.fichajes;
create trigger trg_audit_fichajes after insert or update or delete on public.fichajes
  for each row execute function public.log_fichaje_audit();
