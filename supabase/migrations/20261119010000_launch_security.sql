begin;

-- Existing guest links keep only the remainder of their original 24-hour window.
-- The marker distinguishes genuine guest orders from accounts subsequently deleted.
alter table public.orders add column acesso_versao integer not null default 0 check (acesso_versao >= 0);
alter table public.orders alter column acesso_versao set default 1;
alter table public.orders add column acesso_reenviado_em timestamptz;
alter table public.orders add column risco_rede text check (risco_rede ~ '^[0-9a-f]{64}$');

create function public.commerce_resend_access(p_order uuid, p_email text) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.orders; event_id bigint;
begin
  update public.orders set acesso_reenviado_em=now()
    where id=p_order and user_id is null and acesso_hash is not null
      and lower(email)=lower(p_email)
      and (acesso_reenviado_em is null or acesso_reenviado_em <= now()-interval '15 minutes')
    returning * into o;
  if not found then return; end if;
  insert into public.order_events(order_id,status,detalhes)
    values(o.id,o.status,'{"evento":"reenviar_acesso"}') returning id into event_id;
  insert into public.commerce_email_outbox(order_event_id) values(event_id);
end $$;

create function public.commerce_revoke_access(p_order uuid, p_admin uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.orders;
begin
  update public.orders set acesso_versao=acesso_versao+1
    where id=p_order and user_id is null and acesso_hash is not null returning * into strict o;
  insert into public.order_events(order_id,status,detalhes)
    values(o.id,o.status,jsonb_build_object('evento','acesso_revogado','admin',p_admin));
end $$;

-- The ticket is issued only by the server after rate limiting and Turnstile.
-- This insert trigger also covers signup through a different Auth client.
create table ybrd_private.signup_tickets (
  token_hash bytea primary key, email_hash bytea not null, expires_at timestamptz not null
);
alter table ybrd_private.signup_tickets enable row level security;
revoke all on ybrd_private.signup_tickets from public,anon,authenticated;
create index signup_ticket_expiry on ybrd_private.signup_tickets(expires_at);
create function public.ybrd_signup_ticket(p_email text,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_hash !~ '^[a-f0-9]{64}$' or length(p_email) not between 3 and 254 then
    raise exception 'invalid ticket';
  end if;
  delete from ybrd_private.signup_tickets where expires_at <= now();
  insert into ybrd_private.signup_tickets values
    (decode(p_hash,'hex'),sha256(convert_to(lower(p_email),'UTF8')),now()+interval '2 minutes');
end $$;
create function ybrd_private.check_signup_ticket() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket text := new.raw_user_meta_data->>'ybrd_ticket';
begin
  if ticket is null or ticket !~ '^[a-f0-9]{64}$' then raise exception 'signup unavailable'; end if;
  delete from ybrd_private.signup_tickets
    where token_hash=sha256(convert_to(ticket,'UTF8'))
      and email_hash=sha256(convert_to(lower(new.email),'UTF8')) and expires_at>now();
  if not found then raise exception 'signup unavailable'; end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'ybrd_ticket';
  return new;
end $$;
create trigger ybrd_require_signup_ticket before insert on auth.users
  for each row execute function ybrd_private.check_signup_ticket();

-- One aggregate per product/event and ten-minute interval. No buyer identifiers.
create table public.commerce_security_alerts (
  tipo text not null check(tipo in ('reserva_concentrada','recusas_cartao')),
  escopo text not null,
  janela timestamptz not null,
  ocorrencias integer not null default 1,
  pico integer not null,
  primary key (tipo,escopo,janela)
);
alter table public.commerce_security_alerts enable row level security;
revoke all on public.commerce_security_alerts from public,anon,authenticated;
grant select,insert,update,delete on public.commerce_security_alerts to service_role;
create index commerce_alerts_recent on public.commerce_security_alerts(janela desc);
create function public.commerce_signal(p_type text,p_scope text,p_value integer) returns void
language sql security invoker set search_path='' as $$
  insert into public.commerce_security_alerts as a(tipo,escopo,janela,pico)
    values(p_type,p_scope,date_bin('10 minutes',now(),timestamptz '2000-01-01 UTC'),p_value)
    on conflict(tipo,escopo,janela) do update
    set ocorrencias=a.ocorrencias+1,pico=greatest(a.pico,excluded.pico);
$$;
create index commerce_recent_card_declines on public.order_events(criado_em,order_id)
  where anterior='aguardando_pagamento' and status='falha_pagamento';
create index commerce_recent_card_orders on public.orders(risco_rede,criado_em) where metodo='cartao';
create index commerce_reservations_variant on public.stock_reservations(variant_id,expira_em);

-- The status transition is emitted once, including for asynchronously reconciled declines.
create function public.commerce_watch_declines() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if not exists(select 1 from public.orders where id=new.order_id and metodo='cartao') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:decline-alert',0));
  select count(*) into n from public.order_events e join public.orders o on o.id=e.order_id
    where e.status='falha_pagamento' and e.anterior='aguardando_pagamento' and o.metodo='cartao'
      and e.criado_em>now()-interval '10 minutes';
  if n>=10 then perform public.commerce_signal('recusas_cartao','cartao',n); end if;
  return new;
end $$;
create trigger commerce_watch_declines after insert on public.order_events for each row
  when(new.status='falha_pagamento' and new.anterior='aguardando_pagamento')
  execute function public.commerce_watch_declines();

-- Called with the checkout's actor, customer, product and variant locks already held.
create function public.commerce_checkout_guard(p_input jsonb, p_price jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare verified boolean := coalesce((p_input->>'human_verified')::boolean,false);
  network text := p_input->>'network'; payer_declines integer; burst integer;
  global_declines integer; last_decline timestamptz; wait_seconds integer; item record;
begin
  if network is null or network !~ '^[a-f0-9]{64}$' then raise exception 'commerce_configuration'; end if;
  if p_input->>'metodo'='cartao' then
    select count(*) filter(where o.actor_hash=p_input->>'actor' or o.customer_hash=p_input->>'customer'),
           max(e.criado_em) filter(where o.actor_hash=p_input->>'actor' or o.customer_hash=p_input->>'customer'),
           count(*) filter(where e.criado_em>now()-interval '10 minutes')
      into payer_declines,last_decline,global_declines
      from public.order_events e join public.orders o on o.id=e.order_id
      where o.metodo='cartao' and e.status='falha_pagamento' and e.anterior='aguardando_pagamento'
        and e.criado_em>now()-interval '30 minutes';
    wait_seconds := case when payer_declines>=4 then 600 when payer_declines=3 then 120
                         when payer_declines=2 then 30 else 0 end;
    if wait_seconds>0 and last_decline+make_interval(secs=>wait_seconds)>now() then
      return jsonb_build_object('guard','wait','retry_after',
        ceil(extract(epoch from last_decline+make_interval(secs=>wait_seconds)-now()))::integer);
    end if;
    select count(*) into burst from public.orders where metodo='cartao' and risco_rede=network
      and criado_em>now()-interval '5 minutes';
    if not verified and (payer_declines>=2 or global_declines>=10 or burst>=10) then
      return '{"guard":"challenge"}';
    end if;
  end if;

  for item in
    with wanted as (
      select product_id,sum(quantidade) as qty from jsonb_to_recordset(p_price->'itens')
        x(product_id uuid,quantidade integer) group by product_id
    )
    select p.slug,w.qty,h.held,least(p.edicao_total-s.sold,v.free+h.held) as capacity,s.recent
    from wanted w join public.products p on p.id=w.product_id
    cross join lateral (select coalesce(sum(estoque),0) as free from public.product_variants where product_id=p.id) v
    cross join lateral (select coalesce(sum(r.quantidade),0) as held from public.stock_reservations r
      join public.product_variants pv on pv.id=r.variant_id where pv.product_id=p.id and r.expira_em>now()) h
    cross join lateral (select count(*) as sold,
      count(*) filter (where exists(select 1 from public.order_events e where e.order_id=i.order_id
        and e.status='pago' and e.anterior='aguardando_pagamento' and e.criado_em>now()-interval '30 minutes')) as recent
      from public.edition_units u join public.order_items i on i.id=u.order_item_id where u.product_id=p.id) s
    order by p.id
  loop
    if item.capacity>0 and (item.held+item.qty>=item.capacity or
      (2*(item.held+item.qty)>=item.capacity and item.held+item.qty>item.recent)) then
      perform public.commerce_signal('reserva_concentrada',item.slug,(item.held+item.qty)::integer);
      if item.qty>2 then return '{"guard":"quantity"}'; end if;
      if not verified then return '{"guard":"challenge"}'; end if;
    end if;
  end loop;
  return null;
end $$;

alter table public.payments add column cartao_repetir_em timestamptz;
create function public.commerce_claim_card(p_order uuid) returns boolean
language sql security invoker set search_path='' as $$
  with claimed as (
    update public.payments p set cartao_repetir_em=now()+interval '30 seconds'
    from public.orders o where o.id=p_order and o.id=p.order_id and o.metodo='cartao'
      and o.status='aguardando_pagamento' and o.expira_em>now() and p.provider_payment_id is null
      and (p.cartao_repetir_em is null or p.cartao_repetir_em<=now())
    returning p.id
  ) select exists(select 1 from claimed);
$$;
create function public.commerce_place_guarded(p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare o public.orders; price jsonb; guard jsonb; i record;
  owner text := p_input->>'actor'; customer text := p_input->>'customer';
  buyer uuid := (p_input->>'user')::uuid; idem uuid := (p_input->>'idempotencia')::uuid;
  method text := p_input->>'metodo'; parts integer := (p_input->>'parcelas')::integer;
  shipping jsonb := p_input->'frete'; expires timestamptz; buyer_cart uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('actor:'||owner,0));
  select * into o from public.orders where actor_hash=owner and idempotencia=idem;
  if found then return jsonb_build_object('id',o.id,'numero',o.numero,'status',o.status,'repetido',true); end if;
  perform pg_advisory_xact_lock(hashtextextended('customer:'||customer,0));
  if exists(select 1 from public.orders where customer_hash=customer and status='aguardando_pagamento' and expira_em>now()) then raise exception 'commerce_pending'; end if;
  if exists(select 1 from public.orders where actor_hash=owner and status='aguardando_pagamento' and expira_em>now()) then raise exception 'commerce_pending'; end if;
  if method='cartao' then perform pg_advisory_xact_lock(hashtextextended('card-network:'||(p_input->>'network'),0)); end if;
  if buyer is not null then select id into buyer_cart from public.carts where user_id=buyer for update; end if;
  price := public.commerce_price(p_input->'items',(shipping->>'precoCentavos')::bigint,p_input->>'cupom',customer,method);
  if price <> p_input->'expected' then raise exception 'commerce_price_changed'; end if;
  if parts not between 1 and (price->>'parcelas_maximas')::integer then raise exception 'commerce_installments'; end if;
  guard := public.commerce_checkout_guard(p_input,price);
  if guard is not null then return guard; end if;
  expires := now() + case when method='cartao' then interval '15 minutes' else interval '30 minutes' end;
  insert into public.orders(id,user_id,actor_hash,customer_hash,risco_rede,idempotencia,acesso_hash,email,cpf_final,endereco,frete,subtotal_centavos,frete_centavos,desconto_centavos,total_centavos,metodo,parcelas,termos_versao,expira_em)
  values((p_input->>'order')::uuid,buyer,owner,customer,case when method='cartao' then p_input->>'network' end,idem,p_input->>'access',p_input->>'email',p_input->>'cpf_final',p_input->'endereco',shipping,
    (price->>'subtotal_centavos')::bigint,(price->>'frete_centavos')::bigint,(price->>'desconto_centavos')::bigint,(price->>'total_centavos')::bigint,method,parts,price->>'termos_versao',expires)
  returning * into o;
  for i in select * from jsonb_to_recordset(price->'itens') as x(variant_id uuid,product_id uuid,slug text,nome text,imagem text,tamanho text,quantidade integer,preco_centavos integer) loop
    insert into public.order_items(order_id,variant_id,product_id,slug,nome,imagem,tamanho,quantidade,preco_centavos)
      values(o.id,i.variant_id,i.product_id,i.slug,i.nome,i.imagem,i.tamanho,i.quantidade,i.preco_centavos);
  end loop;
  perform public.commerce_reserve(o.id);
  if price->>'cupom_id' is not null then
    insert into public.coupon_redemptions(coupon_id,order_id,customer_hash) values((price->>'cupom_id')::uuid,o.id,customer);
  end if;
  if buyer is not null then
    if p_input->>'salvar'='true' and not exists(select 1 from public.addresses where user_id=buyer and endereco=o.endereco)
      and (select count(*) from public.addresses where user_id=buyer)<20 then
      insert into public.addresses(user_id,endereco) values(buyer,o.endereco);
    end if;
    delete from public.cart_items ci using public.order_items oi where ci.cart_id=buyer_cart and oi.order_id=o.id and ci.variant_id=oi.variant_id and ci.quantidade<=oi.quantidade;
    update public.cart_items ci set quantidade=ci.quantidade-oi.quantidade from public.order_items oi where ci.cart_id=buyer_cart and oi.order_id=o.id and ci.variant_id=oi.variant_id;
  end if;
  return jsonb_build_object('id',o.id,'numero',o.numero,'status',o.status,'repetido',false);
end $$;
-- Earlier server releases cannot create new reservations without the verified risk context.
create or replace function public.commerce_place(p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select public.commerce_place_guarded(p_input) $$;
revoke all on function public.commerce_place_guarded(jsonb),ybrd_private.check_signup_ticket(),public.ybrd_signup_ticket(text,text),
 public.commerce_checkout_guard(jsonb,jsonb),public.commerce_signal(text,text,integer),
 public.commerce_watch_declines(),public.commerce_claim_card(uuid),public.commerce_resend_access(uuid,text),
 public.commerce_revoke_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.commerce_place_guarded(jsonb),public.ybrd_signup_ticket(text,text),public.commerce_checkout_guard(jsonb,jsonb),
 public.commerce_signal(text,text,integer),public.commerce_watch_declines(),public.commerce_claim_card(uuid),
 public.commerce_resend_access(uuid,text),public.commerce_revoke_access(uuid,uuid) to service_role;
create or replace function public.ybrd_prune_security()
returns void language sql security definer set search_path='' as $$
  delete from ybrd_private.attempts where updated_at < now()-interval '1 day';
  delete from public.security_events where criado_em < now()-interval '30 days';
  delete from auth.sessions a using ybrd_private.sessions s where a.id=s.id and s.expires_at<=now();
  delete from ybrd_private.signup_tickets where expires_at <= now();
  delete from public.commerce_security_alerts where janela < now()-interval '30 days';
  update public.orders set risco_rede=null where risco_rede is not null and criado_em < now()-interval '1 day';
$$;
commit;
