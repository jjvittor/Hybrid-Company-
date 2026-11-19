-- Minimal Supabase-owned schema for a new disposable PostgreSQL database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb,
  encrypted_password text, email_confirmed_at timestamptz, is_sso_user boolean default false
);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
create table auth.mfa_factors (id uuid primary key, user_id uuid references auth.users(id), status text);
-- PostgREST normally sets these verified claims for the duration of a request.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to service_role,authenticated,anon;
