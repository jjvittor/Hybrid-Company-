begin;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  nome text not null,
  categoria text not null check (categoria in ('vestir', 'morar')),
  descricao text not null,
  imagem text not null check (imagem ~ '^/catalogo/[a-z0-9-]+\.webp$'),
  preco_centavos integer not null check (preco_centavos between 0 and 100000000),
  edicao_total integer not null default 0 check (edicao_total >= 0),
  ativo boolean not null default false,
  peso_g integer check (peso_g > 0),
  comprimento_cm integer check (comprimento_cm > 0),
  largura_cm integer check (largura_cm > 0),
  altura_cm integer check (altura_cm > 0),
  check (not ativo or edicao_total > 0)
);
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete restrict,
  sku text not null unique,
  tamanho text not null default '',
  cor text,
  estoque integer not null default 0 check (estoque >= 0),
  peso_g integer check (peso_g > 0),
  comprimento_cm integer check (comprimento_cm > 0),
  largura_cm integer check (largura_cm > 0),
  altura_cm integer check (altura_cm > 0),
  unique (product_id, tamanho)
);
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete cascade,
  guest_hash text unique,
  expira_em timestamptz not null default now() + interval '30 days',
  check ((user_id is null) <> (guest_hash is null))
);
create table if not exists public.cart_items (
  cart_id uuid not null references public.carts on delete cascade,
  variant_id uuid not null references public.product_variants on delete cascade,
  quantidade integer not null check (quantidade between 1 and 99),
  preco_centavos integer not null check (preco_centavos >= 0),
  primary key (cart_id, variant_id)
);
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endereco jsonb not null check (jsonb_typeof(endereco) = 'object'),
  criado_em timestamptz not null default now()
);
create sequence if not exists public.commerce_order_number;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique default ('YBRD-' || lpad(nextval('public.commerce_order_number')::text, 6, '0')),
  user_id uuid references auth.users on delete set null,
  actor_hash text not null,
  idempotencia uuid not null,
  acesso_hash text unique,
  email text not null,
  cpf_final text not null check (cpf_final ~ '^\d{4}$'),
  endereco jsonb not null check (jsonb_typeof(endereco) = 'object'),
  frete jsonb not null check (jsonb_typeof(frete) = 'object'),
  subtotal_centavos bigint not null check (subtotal_centavos >= 0),
  frete_centavos bigint not null check (frete_centavos >= 0),
  desconto_centavos bigint not null check (desconto_centavos >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  metodo text not null check (metodo in ('pix', 'cartao', 'boleto')),
  parcelas integer not null default 1 check (parcelas between 1 and 6),
  status text not null default 'aguardando_pagamento' check (status in (
    'aguardando_pagamento','pago','em_separacao','enviado','entregue','expirado','cancelado','falha_pagamento','reembolsado'
  )),
  revisao_manual boolean not null default false,
  rastreio text,
  termos_versao text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  unique (actor_hash, idempotencia),
  check (total_centavos = subtotal_centavos + frete_centavos - desconto_centavos)
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete restrict,
  product_id uuid not null references public.products on delete restrict,
  variant_id uuid not null references public.product_variants on delete restrict,
  slug text not null, nome text not null, tamanho text not null, imagem text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  quantidade integer not null check (quantidade between 1 and 99),
  unique (order_id, variant_id)
);
create table if not exists public.stock_reservations (
  order_id uuid not null references public.orders on delete restrict,
  variant_id uuid not null references public.product_variants on delete restrict,
  quantidade integer not null check (quantidade between 1 and 99),
  expira_em timestamptz not null,
  primary key (order_id, variant_id)
);
create table if not exists public.edition_units (
  product_id uuid not null references public.products on delete restrict,
  numero_edicao integer not null check (numero_edicao > 0),
  order_item_id uuid not null references public.order_items on delete restrict,
  primary key (product_id, numero_edicao)
);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders on delete restrict,
  anterior text,
  status text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders on delete restrict,
  provider text not null,
  provider_payment_id text unique,
  status text not null default 'pendente',
  valor_centavos bigint not null check (valor_centavos >= 0),
  reembolsado_centavos bigint not null default 0 check (reembolsado_centavos >= 0 and reembolsado_centavos <= valor_centavos),
  instrucoes jsonb,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.webhook_events (
  provider_event_id text primary key,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z0-9-]{3,32}$'),
  tipo text not null check (tipo in ('percentual','fixo')),
  valor integer not null check (valor > 0 and (tipo <> 'percentual' or valor <= 100)),
  minimo_centavos integer not null default 0 check (minimo_centavos >= 0),
  inicio timestamptz, fim timestamptz,
  limite_total integer check (limite_total > 0),
  limite_por_usuario integer check (limite_por_usuario > 0),
  ativo boolean not null default false,
  check (fim is null or inicio is null or fim > inicio)
);
create table if not exists public.coupon_redemptions (
  coupon_id uuid not null references public.coupons on delete restrict,
  order_id uuid not null unique references public.orders on delete restrict,
  customer_hash text not null,
  primary key (coupon_id, order_id)
);
create table if not exists public.settings (chave text primary key, valor jsonb not null);
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete restrict,
  motivo text not null check (length(motivo) between 1 and 1000),
  status text not null default 'aberto' check (status in ('aberto','em_analise','aprovado','recusado','concluido')),
  criado_em timestamptz not null default now()
);
create table if not exists public.commerce_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_event_id bigint not null unique references public.order_events on delete restrict,
  tentativas integer not null default 0,
  disponivel_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists commerce_orders_customer on public.orders (user_id, criado_em desc);
create index if not exists commerce_orders_expires on public.orders (expira_em) where status = 'aguardando_pagamento';
create index if not exists commerce_items_product on public.order_items (product_id);
create index if not exists commerce_editions_item on public.edition_units (order_item_id);
create index if not exists commerce_events_order on public.order_events (order_id, criado_em);
create index if not exists commerce_coupon_customer on public.coupon_redemptions (coupon_id, customer_hash);

do $$ declare t text;
begin
  foreach t in array array['products','product_variants','carts','cart_items','stock_reservations','edition_units','addresses','orders','order_items','order_events','payments','webhook_events','coupons','coupon_redemptions','settings','return_requests','commerce_email_outbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.commerce_order_number, public.order_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.commerce_order_number, public.order_events_id_seq to service_role;
-- Customer-facing operations use server endpoints. Direct reads are limited to safe columns.
grant select (id, numero, user_id, status, metodo, subtotal_centavos, frete_centavos, desconto_centavos, total_centavos, rastreio, criado_em, expira_em) on public.orders to authenticated;
grant select on public.addresses to authenticated;
drop policy if exists commerce_read_own_order on public.orders;
create policy commerce_read_own_order on public.orders for select to authenticated
  using (((select auth.uid()) = user_id and (select public.ybrd_account_access())) or (select public.has_role('admin')));
drop policy if exists commerce_read_own_address on public.addresses;
create policy commerce_read_own_address on public.addresses for select to authenticated
  using ((select auth.uid()) = user_id and (select public.ybrd_account_access()));

create or replace function public.commerce_release(p_order uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare r record;
begin
  for r in select * from public.stock_reservations where order_id = p_order order by variant_id for update loop
    update public.product_variants set estoque = estoque + r.quantidade where id = r.variant_id;
    delete from public.stock_reservations where order_id = p_order and variant_id = r.variant_id;
  end loop;
end $$;

create or replace function public.commerce_order_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare event_id bigint;
begin
  if tg_op = 'UPDATE' then
    if new.status = old.status then return new; end if;
    if not (
      (old.status = 'aguardando_pagamento' and new.status in ('pago','expirado','cancelado','falha_pagamento')) or
      (old.status = 'pago' and new.status in ('em_separacao','reembolsado','cancelado')) or
      (old.status = 'em_separacao' and new.status in ('enviado','reembolsado')) or
      (old.status = 'enviado' and new.status in ('entregue','reembolsado')) or
      (old.status = 'entregue' and new.status = 'reembolsado')
    ) then raise exception 'commerce_invalid_transition'; end if;
    if old.status = 'aguardando_pagamento' and new.status in ('expirado','cancelado','falha_pagamento') then
      perform public.commerce_release(new.id);
    end if;
  elsif new.status <> 'aguardando_pagamento' then
    raise exception 'commerce_invalid_initial_status';
  end if;
  insert into public.order_events(order_id, anterior, status)
    values(new.id, case when tg_op = 'UPDATE' then old.status end, new.status) returning id into event_id;
  if new.status <> 'em_separacao' then
    insert into public.commerce_email_outbox(order_event_id) values(event_id);
  end if;
  return new;
end $$;
drop trigger if exists commerce_order_status on public.orders;
create trigger commerce_order_status after insert or update of status on public.orders
  for each row execute function public.commerce_order_status();

create or replace function public.commerce_expire_orders(p_limit integer default 50) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  with stale as (
    select id from public.orders where status = 'aguardando_pagamento' and expira_em <= now()
    order by expira_em, id limit least(greatest(p_limit, 1), 100) for update skip locked
  ) update public.orders set status = 'expirado' where id in (select id from stale);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.commerce_reserve(p_order uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare o public.orders; i record;
begin
  select * into strict o from public.orders where id = p_order for update;
  if o.status <> 'aguardando_pagamento' or o.expira_em <= now() then raise exception 'commerce_invalid_reservation'; end if;
  if exists(select 1 from public.stock_reservations where order_id = p_order) then return; end if;
  if not exists(select 1 from public.order_items where order_id = p_order) then raise exception 'commerce_empty_order'; end if;
  perform id from public.products where id in (select product_id from public.order_items where order_id = p_order) order by id for update;
  for i in
    select p.id, p.edicao_total, sum(oi.quantidade) as quantidade
    from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order
    group by p.id
  loop
    if i.quantidade + (select count(*) from public.edition_units where product_id = i.id)
      + coalesce((select sum(sr.quantidade) from public.stock_reservations sr join public.product_variants v on v.id = sr.variant_id where v.product_id = i.id), 0) > i.edicao_total
    then raise exception 'commerce_out_of_stock'; end if;
  end loop;
  for i in
    select oi.variant_id, oi.quantidade, v.estoque, p.ativo
    from public.order_items oi join public.product_variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
    where oi.order_id = p_order order by v.id for update of v
  loop
    if not i.ativo or i.estoque < i.quantidade then raise exception 'commerce_out_of_stock'; end if;
    update public.product_variants set estoque = estoque - i.quantidade where id = i.variant_id;
    insert into public.stock_reservations values(p_order, i.variant_id, i.quantidade, o.expira_em);
  end loop;
end $$;

create or replace function public.commerce_confirm(p_order uuid, p_paid_centavos bigint) returns text
language plpgsql security invoker set search_path = '' as $$
declare o public.orders; i record; n integer;
begin
  select * into strict o from public.orders where id = p_order for update;
  if o.total_centavos = p_paid_centavos and o.status in ('pago','em_separacao','enviado','entregue','reembolsado') then return o.status; end if;
  if o.total_centavos <> p_paid_centavos or o.status <> 'aguardando_pagamento' or o.expira_em <= now()
    or not exists(select 1 from public.stock_reservations where order_id = p_order) then
    if not o.revisao_manual then
      update public.orders set revisao_manual = true where id = p_order;
      insert into public.order_events(order_id,status,detalhes) values(p_order,o.status,jsonb_build_object('evento','pagamento_em_revisao'));
    end if;
    return 'revisao';
  end if;
  perform id from public.products where id in (select product_id from public.order_items where order_id = p_order) order by id for update;
  for i in select * from public.order_items where order_id = p_order order by product_id, id loop
    select coalesce(max(numero_edicao), 0) into n from public.edition_units where product_id = i.product_id;
    if n + i.quantidade > (select edicao_total from public.products where id = i.product_id) then raise exception 'commerce_edition_limit'; end if;
    insert into public.edition_units(product_id, numero_edicao, order_item_id)
      select i.product_id, edition, i.id from generate_series(n + 1, n + i.quantidade) as edition;
  end loop;
  delete from public.stock_reservations where order_id = p_order;
  update public.orders set status = 'pago' where id = p_order;
  return 'pago';
end $$;

revoke all on function public.commerce_release(uuid), public.commerce_order_status(), public.commerce_expire_orders(integer), public.commerce_reserve(uuid), public.commerce_confirm(uuid,bigint) from public, anon, authenticated;
grant execute on function public.commerce_release(uuid), public.commerce_order_status(), public.commerce_expire_orders(integer), public.commerce_reserve(uuid), public.commerce_confirm(uuid,bigint) to service_role;

insert into public.settings(chave,valor) values
  ('pix_percentual','5'), ('parcelas_maximas','6'), ('parcela_minima_centavos','3000'),
  ('frete_gratis_acima_centavos','null'), ('pix_acumula_cupom','true'),
  ('reserva_cartao_minutos','15'), ('reserva_pix_minutos','30'), ('frete_fixo','[]'),
  ('termos_versao','null'), ('boleto_ativo','false')
on conflict(chave) do nothing;

insert into public.products(slug,nome,categoria,descricao,imagem,preco_centavos) values
  ('camiseta-heavy-box-off-white','Camiseta Heavy Box Off-White','vestir','Camiseta off-white de silhueta box.','/catalogo/tee.webp',18900),
  ('poltrona-tubular-verde','Poltrona Tubular Verde','morar','Estrutura tubular verde e assento claro.','/catalogo/chair.webp',249000),
  ('moletom-concreto-verde','Moletom Concreto Verde','vestir','Moletom verde com capuz e bolso frontal.','/catalogo/hoodie.webp',42900),
  ('vaso-forma-areia','Vaso Forma Areia','morar','Vaso areia com corpo arredondado e alça lateral.','/catalogo/vase.webp',24900),
  ('calca-cargo-wide','Calça Cargo Wide','vestir','Calça cargo de perna ampla.','/catalogo/cargo.webp',39900),
  ('mesa-lateral-concreto','Mesa Lateral Concreto','morar','Mesa lateral em tom de concreto.','/catalogo/table.webp',89000),
  ('bone-six-panel-verde','Boné Six Panel Verde','vestir','Boné de seis painéis com aba curva.','/catalogo/cap.webp',15900),
  ('tenis-hybrid-runner','Tênis Hybrid Runner','vestir','Tênis inspirado em modelos de corrida.','/catalogo/sneaker.webp',69900)
on conflict(slug) do nothing;
insert into public.product_variants(product_id,sku,tamanho)
select id, upper(slug || case when tamanho = '' then '' else '-' || tamanho end), tamanho
from public.products cross join lateral unnest(case
  when slug = 'tenis-hybrid-runner' then array['38','39','40','41','42']
  when slug in ('camiseta-heavy-box-off-white','moletom-concreto-verde','calca-cargo-wide') then array['P','M','G','GG']
  else array[''] end) as tamanho
where imagem ~ '^/catalogo/(tee|chair|hoodie|vase|cargo|table|cap|sneaker)\.webp$'
on conflict(product_id,tamanho) do nothing;

commit;
