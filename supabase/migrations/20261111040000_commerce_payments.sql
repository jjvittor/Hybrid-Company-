begin;
alter table public.security_events drop constraint if exists security_events_tipo_check;
alter table public.security_events add constraint security_events_tipo_check check (tipo in ('login_falho','login_ok','senha_alterada','email_alterado','2fa_ativado','bloqueio_tentativas','alerta_falhas','recuperacao_2fa','pagamento_divergente'));
alter table public.webhook_events add column if not exists payment_reference text;
alter table public.webhook_events add column if not exists tentativas integer not null default 0;
alter table public.webhook_events add column if not exists disponivel_em timestamptz not null default now();
create index if not exists commerce_webhook_pending on public.webhook_events(disponivel_em) where processado_em is null;

create or replace function public.commerce_payment_update(p_order uuid,p_provider text,p_reference text,p_status text,p_paid bigint,p_instructions jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.payments; applied text; event_id bigint;
begin
  select * into strict o from public.orders where id=p_order for update;
  select * into strict p from public.payments where order_id=p_order for update;
  if p.provider<>p_provider or (p.provider_payment_id is not null and p.provider_payment_id<>p_reference) or o.total_centavos<>p_paid then
    if not o.revisao_manual then
      update public.orders set revisao_manual=true where id=p_order;
      insert into public.security_events(tipo,user_id) values('pagamento_divergente',o.user_id);
      insert into public.order_events(order_id,status,detalhes) values(o.id,o.status,jsonb_build_object('evento','pagamento_divergente'));
    end if;
    return 'revisao';
  end if;
  -- Stale pending and declined responses cannot undo an approved payment.
  if p.status='aprovado' and p_status in ('pendente','recusado','cancelado') then return o.status; end if;
  if p_status not in ('pendente','aprovado','recusado','cancelado','reembolsado','revisao') then raise exception 'commerce_payment_status'; end if;
  update public.payments set provider_payment_id=p_reference,status=p_status,instrucoes=p_instructions,atualizado_em=now() where id=p.id;
  if p_status='aprovado' then
    applied := public.commerce_confirm(o.id,p_paid);
    if applied='revisao' then insert into public.security_events(tipo,user_id) values('pagamento_divergente',o.user_id); end if;
    return applied;
  end if;
  if p_status='recusado' and o.status='aguardando_pagamento' then
    update public.orders set status='falha_pagamento' where id=o.id;
    return 'falha_pagamento';
  end if;
  if p_status='cancelado' and o.status='aguardando_pagamento' then
    update public.orders set status='cancelado' where id=o.id;
    return 'cancelado';
  end if;
  if p_status='pendente' and p.instrucoes is null and p_instructions ? 'codigoPix' and o.status='aguardando_pagamento' then
    insert into public.order_events(order_id,status,detalhes) values(o.id,o.status,jsonb_build_object('evento','pix_pendente')) returning id into event_id;
    insert into public.commerce_email_outbox(order_event_id) values(event_id);
  end if;
  if p_status in ('reembolsado','revisao') then update public.orders set revisao_manual=true where id=o.id; end if;
  return o.status;
end $$;

create or replace function public.commerce_claim_webhooks(p_limit integer) returns setof public.webhook_events
language sql security invoker set search_path='' as $$
  with ready as (
    select provider_event_id from public.webhook_events where processado_em is null and disponivel_em<=now() and tentativas<20
    order by recebido_em limit least(greatest(1,p_limit),20) for update skip locked
  ) update public.webhook_events e set tentativas=e.tentativas+1,disponivel_em=now()+interval '2 minutes'
    from ready where e.provider_event_id=ready.provider_event_id returning e.*;
$$;
revoke all on function public.commerce_payment_update(uuid,text,text,text,bigint,jsonb),public.commerce_claim_webhooks(integer) from public,anon,authenticated;
grant execute on function public.commerce_payment_update(uuid,text,text,text,bigint,jsonb),public.commerce_claim_webhooks(integer) to service_role;
commit;
