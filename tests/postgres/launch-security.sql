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
  assert (select acesso_versao=2 and acesso_revogado_em is not null from public.orders where id=(first_order->>'id')::uuid);
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
  for i in 3..4 loop
    update public.order_events e set criado_em=now()-interval '3 minutes' from public.orders payer
      where e.order_id=payer.id and payer.customer_hash=encode(sha256(convert_to('cartao-1','UTF8')),'hex')
      and e.status='falha_pagamento' and e.anterior='aguardando_pagamento';
    o := public.commerce_place_guarded(fixtures.order_input('cartao-1',1,true,'cartao'));
    id := (o->>'id')::uuid;
    select total_centavos into strict amount from public.orders where public.orders.id=(o->>'id')::uuid;
    insert into public.payments(order_id,provider,valor_centavos) values(id,'mercado-pago',amount);
    perform public.commerce_payment_update(id,'mercado-pago','fixture-pausa-'||i,'recusado',amount,null);
    outcome := public.commerce_place_guarded(fixtures.order_input('cartao-1',1,true,'cartao'));
    assert outcome->>'guard'='wait' and (outcome->>'retry_after')::integer=case when i=3 then 120 else 600 end;
  end loop;
  -- Age the decline fixtures while keeping the card-order network window active.
  update public.order_events set criado_em=now()-interval '1 hour'
    where status='falha_pagamento' and anterior='aguardando_pagamento';
  payload := fixtures.order_input('rede',1,false,'cartao');
  assert public.commerce_place_guarded(payload)->>'guard'='challenge';
  outcome := public.commerce_place_guarded(payload||jsonb_build_object('network',repeat('b',64)));
  assert outcome ? 'id';
  update public.orders set status='expirado' where public.orders.id=(outcome->>'id')::uuid;
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

-- Two confirmed customers use real RLS policies under the ordinary application role.
do $$
declare buyer uuid; sid uuid; token text; email text; label text;
begin
  foreach label in array array['primeiro','segundo','administrador'] loop
    buyer := gen_random_uuid();
    sid := gen_random_uuid();
    token := encode(sha256(convert_to(label||sid::text,'UTF8')),'hex');
    email := label||'@example.test';
    perform public.ybrd_signup_ticket(email,encode(sha256(convert_to(token,'UTF8')),'hex'));
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values(buyer,email,now(),jsonb_build_object('ybrd_ticket',token,'nome',label));
    insert into auth.sessions(id,user_id) values(sid,buyer);
    perform public.ybrd_register_session(sid,buyer,'login');
    insert into public.addresses(user_id,endereco) values(buyer,'{}');
    update public.orders set user_id=buyer,acesso_hash=null
      where customer_hash=encode(sha256(convert_to(label,'UTF8')),'hex') and status='expirado';
    perform set_config('fixtures.'||label,jsonb_build_object('sub',buyer,'session_id',sid,'aal','aal1')::text,false);
  end loop;
end $$;
insert into public.user_roles(user_id,role) values ((current_setting('fixtures.administrador')::jsonb->>'sub')::uuid,'admin');
insert into auth.mfa_factors(id,user_id,status) values (gen_random_uuid(),(current_setting('fixtures.administrador')::jsonb->>'sub')::uuid,'verified');
set role authenticated;
do $$
declare label text; changed integer;
begin
  foreach label in array array['primeiro','segundo'] loop
    perform set_config('request.jwt.claims',current_setting('fixtures.'||label),false);
    assert (select count(id)=1 and bool_and(id=auth.uid()) from public.profiles);
    assert (select count(id)=1 and bool_and(user_id=auth.uid()) from public.orders);
    assert (select count(id)=1 and bool_and(user_id=auth.uid()) from public.addresses);
    update public.profiles set nome='Cliente' where id<>auth.uid();
    get diagnostics changed=row_count; assert changed=0;
    update public.profiles set nome='Cliente' where id=auth.uid();
    get diagnostics changed=row_count; assert changed=1;
    assert not public.has_role('admin');
    assert not has_table_privilege(current_user,'public.user_roles','INSERT');
  end loop;
end $$;
do $$
declare claims jsonb := current_setting('fixtures.administrador')::jsonb;
begin
  perform set_config('request.jwt.claims',claims::text,false);
  assert not public.has_role('admin');
  perform set_config('request.jwt.claims',(claims || '{"aal":"aal2"}')::text,false);
  assert public.has_role('admin');
  perform set_config('request.jwt.claims',(current_setting('fixtures.primeiro')::jsonb || '{"aal":"aal2"}')::text,false);
  assert not public.has_role('admin');
end $$;
reset role;
delete from auth.mfa_factors where user_id=(current_setting('fixtures.administrador')::jsonb->>'sub')::uuid;
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',(current_setting('fixtures.administrador')::jsonb || '{"aal":"aal2"}')::text,false);
  assert not public.has_role('admin');
  perform set_config('request.jwt.claims',current_setting('fixtures.segundo'),false);
end $$;
reset role;
delete from auth.sessions where id=(auth.jwt()->>'session_id')::uuid;
set role authenticated;
do $$ begin
  assert not exists(select id from public.profiles);
  assert not exists(select id from public.orders);
end $$;
reset role;

-- Exercise the limiter boundary using synthetic timestamps in the disposable database.
insert into ybrd_private.attempts(key,failures,attempt_times)
  values ('fixture-mfa-account',0,array_fill(clock_timestamp(),array[4]));
set role service_role;
do $$
declare decision jsonb;
begin
  decision := public.ybrd_attempt('fixture-mfa-ip','fixture-mfa-account',20,5,false);
  assert (decision->>'allowed')::boolean and (decision->>'blocked')::boolean;
  decision := public.ybrd_attempt('fixture-mfa-ip','fixture-mfa-account',20,5,false);
  assert not (decision->>'allowed')::boolean;
end $$;
reset role;
