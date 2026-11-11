begin;
create table if not exists public.cart_merge_events (
  cart_id uuid not null references public.carts on delete cascade,
  merge_id uuid not null,
  criado_em timestamptz not null default now(),
  primary key (cart_id, merge_id)
);
alter table public.cart_merge_events enable row level security;
revoke all on public.cart_merge_events from public, anon, authenticated;
grant select, insert, delete on public.cart_merge_events to service_role;

create or replace function public.commerce_cart(p_user uuid, p_merge uuid, p_items jsonb, p_change jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.carts; i record; v record; applied integer; notices text[] := array[]::text[];
begin
  insert into public.carts(user_id) values(p_user) on conflict(user_id) do nothing;
  select * into strict c from public.carts where user_id = p_user for update;
  if c.expira_em <= now() then
    delete from public.cart_items where cart_id = c.id;
    delete from public.cart_merge_events where cart_id = c.id;
  end if;
  update public.carts set expira_em = now() + interval '30 days' where id = c.id;
  if p_merge is not null then
    insert into public.cart_merge_events(cart_id,merge_id) values(c.id,p_merge) on conflict do nothing;
    get diagnostics applied = row_count;
    if applied > 0 then
      for i in select * from jsonb_to_recordset(p_items) as x(slug text, size text, quantity integer) loop
        select v1.id,v1.estoque,p.preco_centavos into v from public.product_variants v1
          join public.products p on p.id=v1.product_id where p.slug=i.slug and p.ativo and v1.tamanho=i.size;
        if found and v.estoque > 0 then
          insert into public.cart_items(cart_id,variant_id,quantidade,preco_centavos)
            values(c.id,v.id,least(v.estoque,i.quantity,99),v.preco_centavos)
          on conflict(cart_id,variant_id) do update set quantidade=least(v.estoque,public.cart_items.quantidade+excluded.quantidade,99);
        else notices := array_append(notices, 'Esgotado, removemos da sacola.'); end if;
      end loop;
    end if;
  end if;
  if p_change is not null then
    select v1.id,v1.estoque,p.preco_centavos,p.ativo into v from public.product_variants v1
      join public.products p on p.id=v1.product_id where p.slug=p_change->>'slug' and v1.tamanho=p_change->>'size';
    if found then
      if (p_change->>'delta')::integer = 0 then delete from public.cart_items where cart_id=c.id and variant_id=v.id;
      elsif v.ativo and v.estoque > 0 then
        if (p_change->>'delta')::integer = 1 then
          insert into public.cart_items(cart_id,variant_id,quantidade,preco_centavos) values(c.id,v.id,1,v.preco_centavos)
          on conflict(cart_id,variant_id) do update set quantidade=least(v.estoque,public.cart_items.quantidade+1,99);
        else
          update public.cart_items set quantidade=greatest(1,quantidade-1) where cart_id=c.id and variant_id=v.id;
        end if;
      else notices := array_append(notices, 'Esgotado, removemos da sacola.'); end if;
    end if;
  end if;
  delete from public.cart_items ci using public.product_variants v1, public.products p
  where ci.cart_id=c.id and ci.variant_id=v1.id and p.id=v1.product_id and (not p.ativo or v1.estoque=0);
  if found then notices := array_append(notices, 'Esgotado, removemos da sacola.'); end if;
  if exists(select 1 from public.cart_items ci join public.product_variants v1 on v1.id=ci.variant_id join public.products p on p.id=v1.product_id where ci.cart_id=c.id and ci.preco_centavos<>p.preco_centavos) then
    notices := array_append(notices,'Preço atualizado.');
  end if;
  if exists(select 1 from public.cart_items ci join public.product_variants v1 on v1.id=ci.variant_id where ci.cart_id=c.id and ci.quantidade>v1.estoque) then
    notices := array_append(notices,'Quantidade ajustada ao estoque disponível.');
  end if;
  update public.cart_items ci set quantidade=least(ci.quantidade,v1.estoque),preco_centavos=p.preco_centavos
  from public.product_variants v1 join public.products p on p.id=v1.product_id
  where ci.cart_id=c.id and ci.variant_id=v1.id;
  return jsonb_build_object('notices',to_jsonb(notices),'items',coalesce((
    select jsonb_agg(jsonb_build_object('slug',p.slug,'size',v1.tamanho,'quantity',ci.quantidade) order by p.slug,v1.tamanho)
    from public.cart_items ci join public.product_variants v1 on v1.id=ci.variant_id join public.products p on p.id=v1.product_id
    where ci.cart_id=c.id
  ),'[]'::jsonb));
end $$;
revoke all on function public.commerce_cart(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_cart(uuid,uuid,jsonb,jsonb) to service_role;
commit;
