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
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to service_role,authenticated,anon;
