begin;

-- Base pricing already locks the campaign and checks the global and historical CPF limits.
-- Keep that lock until the order and redemption are written in the same transaction.
create function public.commerce_price_for_account(
  p_items jsonb, p_shipping bigint, p_coupon text, p_customer text, p_method text, p_user uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare price jsonb; campaign public.coupons; used integer;
begin
  price := public.commerce_price(p_items,p_shipping,p_coupon,p_customer,p_method);
  if price->>'cupom_id' is null then return price; end if;
  select * into strict campaign from public.coupons where id=(price->>'cupom_id')::uuid;
  if campaign.limite_por_usuario is not null then
    if not exists (select from auth.users where id=p_user and email_confirmed_at is not null) then
      raise exception 'commerce_coupon_account';
    end if;
    select count(*) into used from public.coupon_redemptions r
      join public.orders o on o.id=r.order_id
      where r.coupon_id=campaign.id and o.user_id=p_user
        and o.status not in ('cancelado','expirado','falha_pagamento')
        and (o.status<>'aguardando_pagamento' or o.expira_em>now());
    if used>=campaign.limite_por_usuario then raise exception 'commerce_coupon'; end if;
  end if;
  return price;
end $$;

revoke all on function public.commerce_price_for_account(jsonb,bigint,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.commerce_price_for_account(jsonb,bigint,text,text,text,uuid) to service_role;

create or replace function public.commerce_place_guarded(p_input jsonb) returns jsonb
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
  price := public.commerce_price_for_account(p_input->'items',(shipping->>'precoCentavos')::bigint,p_input->>'cupom',customer,method,buyer);
  if price is distinct from p_input->'expected' then raise exception 'commerce_price_changed'; end if;
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

commit;
