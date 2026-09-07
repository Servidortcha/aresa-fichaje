-- P0 - Validación server-side de geocerca y rate-limit (ejecutar después de supabase_hardening.sql)
-- Evita spoofing de dentro_geocerca/distancia y doble-tap desde DevTools

-- 1) Función que recalcula geocerca en el servidor (no confía en el cliente)
create or replace function public.validar_fichaje()
returns trigger as $$
declare
  target record;
  min_dist integer := 2147483647;
  best_id uuid := null;
  best_dentro boolean := false;
  best_dist integer := null;
  d double precision;
begin
  -- buscar geocerca más cercana activa
  for target in select * from public.geocercas where activa = true loop
    -- Haversine en SQL (metros)
    d := 6371000 * 2 * asin(sqrt(
      power(sin(radians(target.lat - NEW.lat)/2),2) +
      cos(radians(NEW.lat)) * cos(radians(target.lat)) * power(sin(radians(target.lng - NEW.lng)/2),2)
    ));
    if d < min_dist then
      min_dist := d::integer;
      best_id := target.id;
      best_dist := d::integer;
      best_dentro := d <= target.radio_m;
    end if;
  end loop;

  -- sobrescribe valores del cliente (no se puede spoofear)
  NEW.geocerca_id := coalesce(NEW.geocerca_id, best_id);
  NEW.distancia_m := best_dist;
  NEW.dentro_geocerca := best_dentro;

  -- 2) Rate-limit server-side 30s por usuario (evita doble tap)
  if exists (
    select 1 from public.fichajes
    where user_id = NEW.user_id
    and created_at > now() - interval '30 seconds'
    order by created_at desc limit 1
  ) then
    raise exception 'Rate limit: espera 30s entre fichajes';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_validar_fichaje on public.fichajes;
create trigger trg_validar_fichaje
  before insert on public.fichajes
  for each row execute function public.validar_fichaje();
