#!/usr/bin/env bash
# Create and remove only our own local cluster. Never accepts a production URL.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$(pg_config --bindir):$PATH"
cluster=$(mktemp -d)
trap 'pg_ctl -D "$cluster/data" stop -m fast >/dev/null 2>&1 || true; rm -rf -- "$cluster"' EXIT
initdb -D "$cluster/data" -A trust -U postgres >/dev/null
pg_ctl -D "$cluster/data" -l "$cluster/postgres.log" -o "-k $cluster -c listen_addresses=''" -w start >/dev/null
export PGHOST="$cluster" PGPORT=5432 PGDATABASE=postgres PGUSER=postgres
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGHOSTADDR
pg=(psql -X -v ON_ERROR_STOP=1 -q)
"${pg[@]}" -f tests/postgres/bootstrap.sql
for migration in supabase/migrations/*.sql; do "${pg[@]}" -f "$migration"; done
"${pg[@]}" -f tests/postgres/launch-security.sql

# Two ordinary buyers compete for a limited drop. Product locks serialize the decision.
"${pg[@]}" -c "update public.orders set status='expirado' where status='aguardando_pagamento'"
for buyer in primeiro segundo; do
  "${pg[@]}" -Atc "set role service_role; select public.commerce_place_guarded(fixtures.order_input('concorrente-$buyer',1,false))" > "$cluster/$buyer" &
  if [[ $buyer == primeiro ]]; then first=$!; else second=$!; fi
done
wait "$first"
wait "$second"
"${pg[@]}" -c "do \$\$ begin assert (select count(*) from public.stock_reservations)=1; end \$\$"
"${pg[@]}" -c "update public.orders set status='expirado' where status='aguardando_pagamento'"
"${pg[@]}" -f tests/postgres/checkout-integrity.sql
# Both buyers have completed the normal verification and request the last physical unit.
"${pg[@]}" <<'SQL'
update public.product_variants set estoque=1 where product_id=(select id from public.products where slug='vaso-forma-areia');
create function fixtures.buy_last(label text) returns text language plpgsql as $buy$
declare result jsonb;
begin
  result := public.commerce_place_guarded(fixtures.order_input(label,1,true));
  if result ? 'id' then return 'reserved'; end if;
  raise exception 'unexpected checkout result';
exception when raise_exception then
  if sqlerrm='commerce_out_of_stock' then return 'sold-out'; end if;
  raise;
end $buy$;
SQL
for buyer in primeiro segundo; do
  "${pg[@]}" -Atc "set role service_role; select fixtures.buy_last('ultima-$buyer')" > "$cluster/$buyer" &
  if [[ $buyer == primeiro ]]; then first=$!; else second=$!; fi
done
wait "$first"
wait "$second"
[[ $(sort "$cluster/primeiro" "$cluster/segundo") == $'reserved\nsold-out' ]]
"${pg[@]}" -c "do \$\$ begin assert (select sum(quantidade)=1 from public.stock_reservations); end \$\$"
echo "PostgreSQL checks passed, including the last-unit race and coupon limits."
