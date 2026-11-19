-- Only run on the disposable database created by the test runner.
set plpgsql.check_asserts = on;
update public.settings set valor='"regression"' where chave='termos_versao';
update public.products set ativo=true,edicao_total=4 where slug='vaso-forma-areia';
update public.product_variants set estoque=4 where product_id=(select id from public.products where slug='vaso-forma-areia');
create schema fixtures;
create function fixtures.order_input(p_label text, qty integer, human boolean, method text default 'pix') returns jsonb
language plpgsql as $$
declare items jsonb := jsonb_build_array(jsonb_build_object('slug','vaso-forma-areia','size','','quantity',qty));
declare customer text := encode(sha256(convert_to(p_label,'UTF8')),'hex');
begin
  return jsonb_build_object('actor',customer,'customer',customer,'network',repeat('a',64),
    'order',gen_random_uuid(),'idempotencia',gen_random_uuid(),'user',null,'access',gen_random_uuid()::text,
    'email','cliente@example.test','cpf_final','1234','endereco','{}'::jsonb,
    'frete','{"precoCentavos":0}'::jsonb,'items',items,'cupom','','metodo',method,'parcelas',1,
    'human_verified',human,'expected',public.commerce_price(items,0,'',customer,method));
end $$;
grant usage on schema fixtures to service_role;
set role service_role;
do $$
declare first_input jsonb; second_input jsonb; first_order jsonb; second_order jsonb; result jsonb;
begin
  first_input := fixtures.order_input('primeiro',1,false);
  first_order := public.commerce_place_guarded(first_input);
  assert first_order ? 'id';
  assert (public.commerce_place_guarded(first_input)->>'repetido')::boolean;
  second_input := fixtures.order_input('segundo',1,false);
  second_order := public.commerce_place_guarded(second_input);
  assert second_order->>'guard'='challenge' and not(second_order ? 'id');
  assert (select count(*)=1 from public.stock_reservations);
  assert (select count(*)=1 from public.orders);
  assert exists(select 1 from public.commerce_security_alerts where escopo='vaso-forma-areia');
  second_order := public.commerce_place_guarded(second_input || '{"human_verified":true}');
  assert second_order ? 'id' and (select count(*)=2 from public.stock_reservations);
  perform public.commerce_resend_access((first_order->>'id')::uuid,'outro@example.test');
  assert not exists(select from public.order_events where detalhes->>'evento'='reenviar_acesso');
  perform public.commerce_resend_access((first_order->>'id')::uuid,'cliente@example.test');
  perform public.commerce_resend_access((first_order->>'id')::uuid,'cliente@example.test');
  assert (select count(*)=1 from public.commerce_email_outbox q join public.order_events e on e.id=q.order_event_id where e.detalhes->>'evento'='reenviar_acesso');
  perform public.commerce_revoke_access((first_order->>'id')::uuid, gen_random_uuid());
  assert (select acesso_versao=2 from public.orders where id=(first_order->>'id')::uuid);
  update public.orders set expira_em=now()-interval '1 second' where status='aguardando_pagamento';
  assert public.commerce_expire_orders(10)=2;
  assert (select estoque=4 from public.product_variants where product_id=(select id from public.products where slug='vaso-forma-areia'));
  result := public.commerce_place_guarded(fixtures.order_input('volume',3,true));
  assert result->>'guard'='quantity';
  assert not exists(select from public.stock_reservations);
end $$;

-- Gateway decline fixtures use the same reconcile routine for synchronous and asynchronous decisions.
do $$
declare i integer; o jsonb; payload jsonb; outcome jsonb; ref text; id uuid; amount bigint;
begin
  for i in 1..10 loop
    payload := fixtures.order_input('cartao-'||i,1,true,'cartao');
    o := public.commerce_place_guarded(payload); id := (o->>'id')::uuid;
    select total_centavos into strict amount from public.orders where public.orders.id=(o->>'id')::uuid;
    insert into public.payments(order_id,provider,valor_centavos) values(id,'mercado-pago',amount);
    assert public.commerce_claim_card(id);
    assert not public.commerce_claim_card(id);
    ref := 'test-'||i;
    perform public.commerce_payment_update(id,'mercado-pago',ref,'recusado',amount,null);
    perform public.commerce_payment_update(id,'mercado-pago',ref,'recusado',amount,null);
  end loop;
  assert (select count(*) from public.order_events where status='falha_pagamento' and anterior='aguardando_pagamento')=10;
  assert exists(select 1 from public.commerce_security_alerts where tipo='recusas_cartao' and pico>=10);
  outcome := public.commerce_place_guarded(fixtures.order_input('outra-conta',1,false,'cartao'));
  assert outcome->>'guard'='challenge';
  -- A confirmed decline on a second order for the same customer initiates a targeted cooldown.
  o := public.commerce_place_guarded(fixtures.order_input('cartao-1',1,true,'cartao'));
  id := (o->>'id')::uuid;
  select total_centavos into strict amount from public.orders where public.orders.id=(o->>'id')::uuid;
  insert into public.payments(order_id,provider,valor_centavos) values(id,'mercado-pago',amount);
  perform public.commerce_payment_update(id,'mercado-pago','test-11','recusado',amount,null);
  outcome := public.commerce_place_guarded(fixtures.order_input('cartao-1',1,true,'cartao'));
  assert outcome->>'guard'='wait' and (outcome->>'retry_after')::integer between 1 and 30;
  outcome := public.commerce_place_guarded(fixtures.order_input('pix-independente',1,false,'pix'));
  assert outcome ? 'id';
end $$;
reset role;

do $$
declare token text := repeat('b',64); ok boolean := false;
begin
  assert not has_function_privilege('anon','public.ybrd_signup_ticket(text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.commerce_revoke_access(uuid,uuid)','EXECUTE');
  assert not has_table_privilege('authenticated','public.commerce_security_alerts','SELECT');
  begin
    insert into auth.users(email,raw_user_meta_data) values ('cliente@example.test','{}');
  exception when raise_exception then ok := sqlerrm='signup unavailable'; end;
  assert ok;
  perform public.ybrd_signup_ticket('aprovado@example.test',encode(sha256(convert_to(token,'UTF8')),'hex'));
  ok := false;
  begin
    insert into auth.users(email,raw_user_meta_data) values ('outro@example.test',jsonb_build_object('ybrd_ticket',token));
  exception when raise_exception then ok := sqlerrm='signup unavailable'; end;
  assert ok;
  insert into auth.users(email,raw_user_meta_data) values ('aprovado@example.test',jsonb_build_object('ybrd_ticket',token,'nome','Teste'));
  assert not exists(select from ybrd_private.signup_tickets);
  assert not exists(select from auth.users where raw_user_meta_data ? 'ybrd_ticket');
  assert exists(select from public.profiles where nome='Teste');
  perform public.ybrd_signup_ticket('expirado@example.test',encode(sha256(convert_to(token,'UTF8')),'hex'));
  update ybrd_private.signup_tickets set expires_at=now();
  ok := false;
  begin
    insert into auth.users(email,raw_user_meta_data) values ('expirado@example.test',jsonb_build_object('ybrd_ticket',token));
  exception when raise_exception then ok := sqlerrm='signup unavailable'; end;
  assert ok;
end $$;
