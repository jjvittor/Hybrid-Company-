-- Independent fixtures, rolled back before the concurrency test.
begin;
set plpgsql.check_asserts = on;
insert into public.coupons(codigo,tipo,valor,limite_por_usuario,limite_total,ativo)
  values ('CONTA-TESTE','percentual',10,1,2,true);
do $$
declare buyer uuid := (select id from auth.users where email='primeiro@example.test');
  other_buyer uuid := (select id from auth.users where email='segundo@example.test');
  input jsonb; quote jsonb; actual jsonb; expected_error text;
begin
  assert buyer is not null and other_buyer is not null;
  assert not has_function_privilege('authenticated','public.commerce_price_for_account(jsonb,bigint,text,text,text,uuid)','execute');
  input := fixtures.order_input('compra-com-cupom',1,true);
  -- Client-supplied item prices are ignored, and stale/missing expected totals cannot place an order.
  input := jsonb_set(input,'{items,0,preco_centavos}','0');
  quote := public.commerce_price(input->'items',0,'',input->>'customer','pix');
  assert (quote->>'subtotal_centavos')::int=(select preco_centavos from public.products where slug='vaso-forma-areia');
  assert quote=input->'expected';
  foreach expected_error in array array['{}','null'] loop
    begin
      perform public.commerce_place_guarded(jsonb_set(input,'{expected}',expected_error::jsonb));
      raise exception 'missing price validation';
    exception when raise_exception then
      if sqlerrm<>'commerce_price_changed' then raise; end if;
    end;
  end loop;
  begin
    perform public.commerce_place_guarded(input-'expected');
    raise exception 'missing quote accepted';
  exception when raise_exception then
    if sqlerrm<>'commerce_price_changed' then raise; end if;
  end;
  begin
    perform public.commerce_price_for_account(input->'items',0,'CONTA-TESTE',input->>'customer','pix',null);
    raise exception 'guest received personal coupon';
  exception when raise_exception then
    if sqlerrm<>'commerce_coupon_account' then raise; end if;
  end;
  quote := public.commerce_price_for_account(input->'items',0,'CONTA-TESTE',input->>'customer','pix',buyer);
  input := input || jsonb_build_object('cupom','CONTA-TESTE','expected',quote,'user',buyer,'access',null);
  actual := public.commerce_place_guarded(input);
  assert actual ? 'id';
  assert (public.commerce_place_guarded(input)->>'repetido')::boolean;
  assert (select count(*)=1 from public.coupon_redemptions where order_id=(actual->>'id')::uuid);
  begin
    perform public.commerce_price_for_account(input->'items',0,'CONTA-TESTE',repeat('c',64),'pix',buyer);
    raise exception 'account limit bypassed by alternate checkout identity';
  exception when raise_exception then
    if sqlerrm<>'commerce_coupon' then raise; end if;
  end;
  input := fixtures.order_input('segunda-conta-cupom',1,true);
  quote := public.commerce_price_for_account(input->'items',0,'CONTA-TESTE',input->>'customer','pix',other_buyer);
  actual := public.commerce_place_guarded(input || jsonb_build_object('cupom','CONTA-TESTE','expected',quote,'user',other_buyer,'access',null));
  assert actual ? 'id';
  begin
    perform public.commerce_price_for_account(input->'items',0,'CONTA-TESTE',repeat('e',64),'pix',buyer);
    raise exception 'campaign limit bypassed';
  exception when raise_exception then
    if sqlerrm<>'commerce_coupon' then raise; end if;
  end;
end $$;
rollback;
