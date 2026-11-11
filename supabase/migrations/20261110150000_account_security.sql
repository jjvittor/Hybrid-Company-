-- Compatible with installations that already applied the Lovable/Drizzle profile migration.
create schema if not exists ybrd_private;
revoke all on schema ybrd_private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  telefone text,
  criado_em timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_nome_check;
alter table public.profiles drop constraint if exists profiles_telefone_check;
update public.profiles
set nome = left(regexp_replace(nome, '[[:cntrl:]]', '', 'g'), 80),
    telefone = case when telefone ~ '^[0-9+() .-]{0,20}$' then telefone else null end
where char_length(nome) > 80 or nome ~ '[[:cntrl:]]'
   or (telefone is not null and telefone !~ '^[0-9+() .-]{0,20}$');
alter table public.profiles add constraint profiles_nome_check
  check (char_length(nome) <= 80 and nome !~ '[[:cntrl:]]');
alter table public.profiles add constraint profiles_telefone_check
  check (telefone is null or telefone ~ '^[0-9+() .-]{0,20}$');

create or replace function public.create_signup_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nome) values (
    new.id, left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'nome', ''), '[[:cntrl:]]', '', 'g'), 80)
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_signup_profile() from public, anon, authenticated;
drop trigger if exists on_ybrd_user_created on auth.users;
create trigger on_ybrd_user_created after insert on auth.users
for each row execute function public.create_signup_profile();
insert into public.profiles (id, nome)
select id, left(regexp_replace(coalesce(raw_user_meta_data ->> 'nome', ''), '[[:cntrl:]]', '', 'g'), 80)
from auth.users on conflict (id) do nothing;

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role = 'admin'),
  primary key (user_id, role)
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('login_falho', 'login_ok', 'senha_alterada',
    'email_alterado', '2fa_ativado', 'bloqueio_tentativas', 'alerta_falhas', 'recuperacao_2fa')),
  ip_hash text check (ip_hash ~ '^[a-f0-9]{64}$'),
  criado_em timestamptz not null default now()
);
create table ybrd_private.sessions (
  id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('login', 'recovery')),
  expires_at timestamptz not null
);
create table ybrd_private.attempts (
  key text primary key,
  attempt_times timestamptz[] not null default '{}',
  login_times timestamptz[] not null default '{}',
  updated_at timestamptz not null default now(),
  failures integer not null,
  blocked_until timestamptz
);
create index ybrd_attempts_updated on ybrd_private.attempts (updated_at);
create index ybrd_security_events_created on public.security_events (criado_em);
create table ybrd_private.recovery_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  hash text not null check (hash ~ '^[a-f0-9]{64}$'),
  primary key (user_id, hash)
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.security_events enable row level security;
alter table ybrd_private.sessions enable row level security;
alter table ybrd_private.attempts enable row level security;
alter table ybrd_private.recovery_codes enable row level security;
revoke all on public.profiles, public.user_roles, public.security_events from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nome, telefone) on public.profiles to authenticated;
grant select on public.security_events to authenticated;
grant all on public.profiles, public.user_roles, public.security_events to service_role;

create function public.ybrd_register_session(p_id uuid, p_user uuid, p_purpose text)
returns void language sql security definer set search_path = '' as $$
  insert into ybrd_private.sessions (id, user_id, purpose, expires_at)
  select id, user_id, p_purpose, now() + case when p_purpose = 'login' then interval '12 hours' else interval '10 minutes' end
  from auth.sessions where id = p_id and user_id = p_user;
$$;

create function public.ybrd_session_access(p_id uuid, p_user uuid, p_purpose text)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from auth.mfa_factors where user_id = p_user and status = 'verified'
  ) then 'mfa' else 'ok' end
  from ybrd_private.sessions s
  join auth.sessions a on a.id = s.id and a.user_id = s.user_id
  join auth.users u on u.id = s.user_id
  where s.id = p_id and s.user_id = p_user and s.purpose = p_purpose
    and s.expires_at > now() and u.email_confirmed_at is not null;
$$;

create function public.ybrd_account_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case public.ybrd_session_access((auth.jwt()->>'session_id')::uuid, auth.uid(), 'login')
      when 'mfa' then auth.jwt()->>'aal' = 'aal2'
      when 'ok' then true
      else false end, false
  );
$$;
create function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ybrd_account_access() and auth.jwt()->>'aal' = 'aal2' and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = p_role
  );
$$;

drop policy if exists "Read own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id and (select public.ybrd_account_access()));
create policy "Update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id and (select public.ybrd_account_access()))
  with check ((select auth.uid()) = id and (select public.ybrd_account_access()));
create policy "Admin audit access" on public.security_events for select to authenticated
  using ((select public.has_role('admin')));

-- The two locks serialize requests sharing an IP or account, including simultaneous attempts.
create function public.ybrd_attempt(p_ip text, p_subject text, p_ip_limit integer,
  p_subject_limit integer, p_login boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ip_row ybrd_private.attempts%rowtype;
  subject_row ybrd_private.attempts%rowtype;
  stamp timestamptz;
  ip_times timestamptz[];
  subject_times timestamptz[];
  login_times_recent timestamptz[];
  reached_limit boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_subject, 1));
  stamp := clock_timestamp();
  insert into ybrd_private.attempts (key, failures) values (p_ip, 0), (p_subject, 0)
    on conflict (key) do nothing;
  select * into ip_row from ybrd_private.attempts where key = p_ip;
  select * into subject_row from ybrd_private.attempts where key = p_subject;
  if ip_row.blocked_until > stamp or subject_row.blocked_until > stamp then
    return jsonb_build_object('allowed', false, 'count', 0, 'captcha', false, 'blocked', false);
  end if;
  ip_times := array(select t from unnest(ip_row.attempt_times) t where t > stamp - interval '15 minutes');
  subject_times := array(select t from unnest(subject_row.attempt_times) t where t > stamp - interval '15 minutes');
  login_times_recent := array(select t from unnest(subject_row.login_times) t where t > stamp - interval '15 minutes');
  reached_limit := cardinality(ip_times) + 1 >= p_ip_limit or cardinality(subject_times) + 1 >= p_subject_limit;
  update ybrd_private.attempts set attempt_times = array_append(ip_times, stamp),
    updated_at = stamp, blocked_until = case when cardinality(ip_times) + 1 >= p_ip_limit then stamp + interval '15 minutes' end
    where key = p_ip;
  update ybrd_private.attempts set attempt_times = array_append(subject_times, stamp),
    login_times = case when p_login then array_append(login_times_recent, stamp) else login_times_recent end,
    failures = case when cardinality(login_times_recent) = 0 then 0 else failures end,
    updated_at = stamp, blocked_until = case when cardinality(subject_times) + 1 >= p_subject_limit then stamp + interval '15 minutes' end
    where key = p_subject;
  return jsonb_build_object('allowed', true, 'count', cardinality(subject_times) + 1,
    'captcha', cardinality(login_times_recent) >= 3, 'blocked', reached_limit);
end;
$$;

create function public.ybrd_login_result(p_subject text, p_success boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  update ybrd_private.attempts set failures = case when p_success then 0 else failures + 1 end,
    login_times = case when p_success then '{}'::timestamptz[] else login_times end
  where key = p_subject returning failures into total;
  return coalesce(total, 0);
end;
$$;

create function public.ybrd_replace_recovery_codes(p_user uuid, p_hashes text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 2));
  delete from ybrd_private.recovery_codes where user_id = p_user;
  insert into ybrd_private.recovery_codes (user_id, hash)
  select p_user, unnest(p_hashes);
end;
$$;
create function public.ybrd_use_recovery_code(p_user uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 2));
  if not exists (select 1 from ybrd_private.recovery_codes where user_id = p_user and hash = p_hash) then
    return false;
  end if;
  -- Revoke the old factor, all sessions and the whole code set atomically.
  delete from auth.sessions where user_id = p_user;
  delete from auth.mfa_factors where user_id = p_user;
  delete from ybrd_private.recovery_codes where user_id = p_user;
  return true;
end;
$$;

create function ybrd_private.audit_user_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.email is distinct from new.email then
    insert into public.security_events (user_id, tipo) values (new.id, 'email_alterado');
  end if;
  if coalesce(old.encrypted_password, '') <> coalesce(new.encrypted_password, '') then
    insert into public.security_events (user_id, tipo) values (new.id, 'senha_alterada');
  end if;
  return new;
end;
$$;
create trigger ybrd_audit_user_change after update of email, encrypted_password on auth.users
for each row execute function ybrd_private.audit_user_change();

create function ybrd_private.audit_factor_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'verified' and old.status is distinct from new.status then
    insert into public.security_events (user_id, tipo) values (new.user_id, '2fa_ativado');
  end if;
  return new;
end;
$$;
create trigger ybrd_audit_factor_change after update of status on auth.mfa_factors
for each row execute function ybrd_private.audit_factor_change();

revoke all on function public.ybrd_register_session(uuid, uuid, text),
  public.ybrd_session_access(uuid, uuid, text), public.ybrd_attempt(text, text, integer, integer, boolean),
  public.ybrd_login_result(text, boolean), public.ybrd_replace_recovery_codes(uuid, text[]),
  public.ybrd_use_recovery_code(uuid, text), public.ybrd_account_access(), public.has_role(text)
  from public, anon, authenticated;
grant execute on function public.ybrd_register_session(uuid, uuid, text),
  public.ybrd_session_access(uuid, uuid, text), public.ybrd_attempt(text, text, integer, integer, boolean),
  public.ybrd_login_result(text, boolean), public.ybrd_replace_recovery_codes(uuid, text[]),
  public.ybrd_use_recovery_code(uuid, text) to service_role;
grant execute on function public.ybrd_account_access(), public.has_role(text) to authenticated;

create function public.ybrd_revoke_sessions(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke all on function public.ybrd_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.ybrd_revoke_sessions(uuid) to service_role;

create function public.ybrd_remove_factor(p_user uuid, p_factor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 2));
  delete from auth.mfa_factors where id = p_factor and user_id = p_user and status = 'verified';
  if not found then return false; end if;
  delete from auth.sessions where user_id = p_user;
  delete from ybrd_private.recovery_codes where user_id = p_user;
  return true;
end;
$$;

create function public.ybrd_audit_subject(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = p_email and not is_sso_user limit 1;
$$;

create function public.ybrd_prune_security()
returns void language sql security definer set search_path = '' as $$
  delete from ybrd_private.attempts where updated_at < now() - interval '1 day';
  delete from public.security_events where criado_em < now() - interval '30 days';
  delete from auth.sessions a using ybrd_private.sessions s where a.id = s.id and s.expires_at <= now();
$$;
revoke all on function public.ybrd_remove_factor(uuid, uuid), public.ybrd_audit_subject(text),
  public.ybrd_prune_security() from public, anon, authenticated;
grant execute on function public.ybrd_remove_factor(uuid, uuid), public.ybrd_audit_subject(text),
  public.ybrd_prune_security() to service_role;

create function public.ybrd_claim_recovery(p_id uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from ybrd_private.sessions where id = p_id and user_id = p_user
    and purpose = 'recovery' and expires_at > now();
  return found;
end;
$$;
revoke all on function public.ybrd_claim_recovery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ybrd_claim_recovery(uuid, uuid) to service_role;
