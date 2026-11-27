begin;

-- Verify the current factor as well as the JWT assurance level and the registered login session.
create or replace function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select auth.jwt()->>'aal') = 'aal2'
    and public.ybrd_session_access((auth.jwt()->>'session_id')::uuid, auth.uid(), 'login') = 'mfa'
    and exists (
      select 1 from public.user_roles where user_id = (select auth.uid()) and role = p_role
    ), false
  );
$$;

revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;
commit;
