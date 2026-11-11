begin;
alter table public.orders add column if not exists customer_hash text;
create index if not exists commerce_pending_customer on public.orders(customer_hash,expira_em) where status='aguardando_pagamento';
create or replace function public.commerce_number() returns text
language plpgsql security invoker set search_path = '' as $$
declare n text := nextval('public.commerce_order_number')::text;
begin return 'YBRD-' || lpad(n, greatest(6,length(n)), '0'); end $$;
alter table public.orders alter column numero set default public.commerce_number();

create or replace function public.commerce_price(p_items jsonb, p_shipping bigint, p_coupon text, p_customer text, p_method text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare i record; c public.coupons; lines jsonb := '[]'; subtotal bigint := 0; discount bigint := 0;
  pix bigint := 0; total bigint; coupon_id uuid; n integer := 0; use_count integer;
  cfg jsonb; max_parts integer; minimum integer; version text;
begin
  if jsonb_array_length(p_items) not between 1 and 40 or p_shipping < 0 then raise exception 'commerce_cart'; end if;
  if p_method not in ('pix','cartao','boleto') then raise exception 'commerce_method'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(slug text,size text,quantity integer) group by slug,size having count(*) > 1)
  then raise exception 'commerce_duplicate'; end if;
  select coalesce(jsonb_object_agg(chave,valor),'{}') into cfg from public.settings;
  version := cfg->>'termos_versao';
  if version is null or length(version) not between 1 and 80 then raise exception 'commerce_terms'; end if;
  if p_method='boleto' and coalesce((cfg->>'boleto_ativo')::boolean,false)=false then raise exception 'commerce_method'; end if;
  perform p.id from public.products p where p.slug in (select value->>'slug' from jsonb_array_elements(p_items)) order by p.id for update;
  for i in
    select v.id as variant_id,p.id as product_id,p.slug,p.nome,p.imagem,v.tamanho,x.quantity,p.preco_centavos,v.estoque
    from jsonb_to_recordset(p_items) as x(slug text,size text,quantity integer)
    join public.products p on p.slug=x.slug and p.ativo
    join public.product_variants v on v.product_id=p.id and v.tamanho=x.size
    order by v.id for update of v
  loop
    if i.quantity is null or i.quantity not between 1 and 99 or i.quantity > i.estoque then raise exception 'commerce_out_of_stock'; end if;
    n := n + 1;
    subtotal := subtotal + i.quantity::bigint * i.preco_centavos;
    lines := lines || jsonb_build_array(jsonb_build_object('variant_id',i.variant_id,'product_id',i.product_id,'slug',i.slug,'nome',i.nome,'imagem',i.imagem,'tamanho',i.tamanho,'quantidade',i.quantity,'preco_centavos',i.preco_centavos));
  end loop;
  if n <> jsonb_array_length(p_items) then raise exception 'commerce_out_of_stock'; end if;
  if coalesce(p_coupon,'') <> '' then
    select * into c from public.coupons where codigo=p_coupon for update;
    if not found or not c.ativo or subtotal<c.minimo_centavos or (c.inicio is not null and c.inicio>now()) or (c.fim is not null and c.fim<=now()) then raise exception 'commerce_coupon'; end if;
    select count(*) into use_count from public.coupon_redemptions r join public.orders o on o.id=r.order_id
      where r.coupon_id=c.id and o.status not in ('cancelado','expirado','falha_pagamento') and (o.status<>'aguardando_pagamento' or o.expira_em>now());
    if c.limite_total is not null and use_count>=c.limite_total then raise exception 'commerce_coupon'; end if;
    select count(*) into use_count from public.coupon_redemptions r join public.orders o on o.id=r.order_id
      where r.coupon_id=c.id and r.customer_hash=p_customer and o.status not in ('cancelado','expirado','falha_pagamento') and (o.status<>'aguardando_pagamento' or o.expira_em>now());
    if c.limite_por_usuario is not null and use_count>=c.limite_por_usuario then raise exception 'commerce_coupon'; end if;
    coupon_id := c.id;
    discount := least(subtotal, case when c.tipo='fixo' then c.valor else subtotal*c.valor/100 end);
  end if;
  if p_method='pix' then
    if coalesce((cfg->>'pix_acumula_cupom')::boolean,true) then
      pix := (subtotal-discount)*least(100,greatest(0,coalesce((cfg->>'pix_percentual')::integer,0)))/100;
      discount := discount + pix;
    else
      pix := subtotal*least(100,greatest(0,coalesce((cfg->>'pix_percentual')::integer,0)))/100;
      if pix>=discount then coupon_id := null; discount := pix; end if;
    end if;
  end if;
  total := greatest(0,subtotal+p_shipping-discount);
  minimum := greatest(1,coalesce((cfg->>'parcela_minima_centavos')::integer,3000));
  max_parts := case when p_method='cartao' then greatest(1,least(6,coalesce((cfg->>'parcelas_maximas')::integer,6),total/minimum)) else 1 end;
  return jsonb_build_object('itens',lines,'subtotal_centavos',subtotal,'frete_centavos',p_shipping,
    'desconto_centavos',discount,'total_centavos',total,'parcelas_maximas',max_parts,'cupom_id',coupon_id,'termos_versao',version);
end $$;

create or replace function public.commerce_place(p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare o public.orders; price jsonb; i record;
  owner text := p_input->>'actor'; customer text := p_input->>'customer';
  buyer uuid := (p_input->>'user')::uuid; idem uuid := (p_input->>'idempotencia')::uuid;
  method text := p_input->>'metodo'; parts integer := (p_input->>'parcelas')::integer;
  shipping jsonb := p_input->'frete'; expires timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('cart:'||owner||':'||idem::text,0));
  select * into o from public.orders where actor_hash=owner and idempotencia=idem;
  if found then return jsonb_build_object('id',o.id,'numero',o.numero,'status',o.status,'repetido',true); end if;
  perform pg_advisory_xact_lock(hashtextextended('customer:'||customer,0));
  if exists(select 1 from public.orders where customer_hash=customer and status='aguardando_pagamento' and expira_em>now()) then raise exception 'commerce_pending'; end if;
  price := public.commerce_price(p_input->'items',(shipping->>'precoCentavos')::bigint,p_input->>'cupom',customer,method);
  if price <> p_input->'expected' then raise exception 'commerce_price_changed'; end if;
  if parts not between 1 and (price->>'parcelas_maximas')::integer then raise exception 'commerce_installments'; end if;
  expires := now() + case when method='cartao' then interval '15 minutes' else interval '30 minutes' end;
  insert into public.orders(id,user_id,actor_hash,customer_hash,idempotencia,acesso_hash,email,cpf_final,endereco,frete,subtotal_centavos,frete_centavos,desconto_centavos,total_centavos,metodo,parcelas,termos_versao,expira_em)
  values((p_input->>'order')::uuid,buyer,owner,customer,idem,p_input->>'access',p_input->>'email',p_input->>'cpf_final',p_input->'endereco',shipping,
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
    delete from public.cart_items ci using public.carts ca where ci.cart_id=ca.id and ca.user_id=buyer and ci.variant_id in (select variant_id from public.order_items where order_id=o.id);
  end if;
  return jsonb_build_object('id',o.id,'numero',o.numero,'status',o.status,'repetido',false);
end $$;
revoke all on function public.commerce_number(), public.commerce_price(jsonb,bigint,text,text,text), public.commerce_place(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_number(), public.commerce_price(jsonb,bigint,text,text,text), public.commerce_place(jsonb) to service_role;
commit;
