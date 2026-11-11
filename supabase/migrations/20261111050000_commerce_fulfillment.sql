begin;
alter table public.order_items add column if not exists edicao_total integer check (edicao_total>0);
create or replace function public.commerce_snapshot_edition() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  select edicao_total into new.edicao_total from public.products where id=new.product_id;
  return new;
end $$;
drop trigger if exists commerce_snapshot_edition on public.order_items;
create trigger commerce_snapshot_edition before insert on public.order_items for each row execute function public.commerce_snapshot_edition();

create or replace function public.commerce_inventory() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'priceCentavos',p.preco_centavos,'editionTotal',p.edicao_total,
    'available',least(a.remaining,v.stock),'variants',v.variants) order by p.slug),'[]'::jsonb)
  from public.products p
  cross join lateral (
    select greatest(0,p.edicao_total-(select count(*) from public.edition_units e where e.product_id=p.id)-coalesce((select sum(r.quantidade)
      from public.stock_reservations r join public.product_variants pv on pv.id=r.variant_id where pv.product_id=p.id),0)) as remaining
  ) a
  cross join lateral (
    select coalesce(sum(pv.estoque),0) as stock,coalesce(jsonb_agg(jsonb_build_object('size',pv.tamanho,'stock',least(pv.estoque,a.remaining)) order by pv.tamanho),'[]'::jsonb) as variants
    from public.product_variants pv where pv.product_id=p.id
  ) v where p.ativo;
$$;

create or replace function public.commerce_claim_emails(p_limit integer) returns setof public.commerce_email_outbox
language sql security invoker set search_path='' as $$
  with ready as (
    select id from public.commerce_email_outbox where enviado_em is null and disponivel_em<=now() and tentativas<12
    order by disponivel_em limit least(greatest(1,p_limit),10) for update skip locked
  ) update public.commerce_email_outbox e set tentativas=e.tentativas+1,disponivel_em=now()+interval '5 minutes'
    from ready where e.id=ready.id returning e.*;
$$;

create or replace function public.commerce_admin_transition(p_order uuid,p_status text,p_tracking text,p_admin uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.orders;
begin
  select * into strict o from public.orders where id=p_order for update;
  if o.revisao_manual or p_status not in ('em_separacao','enviado','entregue','cancelado') then raise exception 'commerce_admin_transition'; end if;
  if p_status='cancelado' and (o.status<>'aguardando_pagamento' or exists(select 1 from public.payments where order_id=p_order)) then raise exception 'commerce_cancel_payment'; end if;
  if p_status='enviado' and (p_tracking is null or length(p_tracking) not between 3 and 80) then raise exception 'commerce_tracking'; end if;
  update public.orders set status=p_status,rastreio=case when p_status='enviado' then p_tracking else rastreio end where id=p_order;
  insert into public.order_events(order_id,status,detalhes) values(o.id,p_status,jsonb_build_object('evento','operacao_admin','admin',p_admin));
end $$;

create table if not exists public.payment_refunds (
  id uuid primary key,
  payment_id uuid not null references public.payments on delete restrict,
  valor_centavos bigint not null check (valor_centavos>0),
  status text not null default 'pendente' check (status in ('pendente','aprovado')),
  provider_refund_id text unique,
  admin_id uuid references auth.users on delete set null,
  criado_em timestamptz not null default now()
);
create unique index if not exists commerce_single_pending_refund on public.payment_refunds(payment_id) where status='pendente';
alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from public,anon,authenticated;
grant select,insert,update on public.payment_refunds to service_role;

create or replace function public.commerce_begin_refund(p_order uuid,p_id uuid,p_cents bigint,p_admin uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.payments; r public.payment_refunds;
begin
  select * into strict o from public.orders where id=p_order for update;
  select * into strict p from public.payments where order_id=p_order for update;
  select * into r from public.payment_refunds where id=p_id;
  if found then
    if r.payment_id<>p.id or r.valor_centavos<>p_cents then raise exception 'commerce_refund_mismatch'; end if;
  else
    if o.revisao_manual or o.status not in ('pago','em_separacao','enviado','entregue') or p.status<>'aprovado'
      or p.provider_payment_id is null or p_cents<=0 or p_cents>p.valor_centavos-p.reembolsado_centavos
      or exists(select 1 from public.payment_refunds where payment_id=p.id and status='pendente') then raise exception 'commerce_refund_unavailable'; end if;
    insert into public.payment_refunds(id,payment_id,valor_centavos,admin_id) values(p_id,p.id,p_cents,p_admin) returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'status',r.status,'provider',p.provider,'referencia',p.provider_payment_id,'centavos',r.valor_centavos);
end $$;
create or replace function public.commerce_finish_refund(p_id uuid,p_reference text) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.payments; r public.payment_refunds; event_id bigint; refunded bigint;
begin
  select * into strict r from public.payment_refunds where id=p_id;
  select * into strict o from public.orders where id=(select order_id from public.payments where id=r.payment_id) for update;
  select * into strict p from public.payments where id=r.payment_id for update;
  select * into strict r from public.payment_refunds where id=p_id for update;
  if r.status='aprovado' then return; end if;
  refunded := p.reembolsado_centavos+r.valor_centavos;
  update public.payment_refunds set status='aprovado',provider_refund_id=p_reference where id=p_id;
  update public.payments set reembolsado_centavos=refunded where id=p.id;
  if refunded=p.valor_centavos then
    update public.orders set status='reembolsado' where id=o.id;
  else
    insert into public.order_events(order_id,status,detalhes) values(o.id,o.status,jsonb_build_object('evento','reembolso_parcial','valor_centavos',r.valor_centavos)) returning id into event_id;
    insert into public.commerce_email_outbox(order_event_id) values(event_id);
  end if;
end $$;

create or replace function public.commerce_return(p_order uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.orders;
begin
  select * into strict o from public.orders where id=p_order for update;
  if o.status not in ('pago','em_separacao','enviado','entregue') or exists(select 1 from public.return_requests where order_id=p_order and status in ('aberto','em_analise','aprovado')) then raise exception 'commerce_return_unavailable'; end if;
  insert into public.return_requests(order_id,motivo) values(p_order,p_reason);
  insert into public.order_events(order_id,status,detalhes) values(o.id,o.status,jsonb_build_object('evento','troca_solicitada'));
end $$;
revoke all on function public.commerce_snapshot_edition(),public.commerce_inventory(),public.commerce_claim_emails(integer),public.commerce_admin_transition(uuid,text,text,uuid),public.commerce_begin_refund(uuid,uuid,bigint,uuid),public.commerce_finish_refund(uuid,text),public.commerce_return(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_snapshot_edition(),public.commerce_inventory(),public.commerce_claim_emails(integer),public.commerce_admin_transition(uuid,text,text,uuid),public.commerce_begin_refund(uuid,uuid,bigint,uuid),public.commerce_finish_refund(uuid,text),public.commerce_return(uuid,text) to service_role;
commit;
