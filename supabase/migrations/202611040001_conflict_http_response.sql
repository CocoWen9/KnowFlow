-- A stale graph version is a permanent application conflict. Raising 40001
-- causes the hosted database API to retry it. Return a PostgREST HTTP 409
-- with the existing JSON error code so deployed Workers still recognize it.
do $migration$
declare
  target regprocedure;
  definition text;
  old_clause constant text := 'using errcode = ''40001'';';
  new_clause constant text := $clause$raise sqlstate 'PGRST' using
      message = '{"code":"40001","message":"Graph changed. Reload before saving.","details":null,"hint":null}',
      detail = '{"status":409,"headers":{}}';$clause$;
begin
  foreach target in array array[
    'public.save_graph(uuid,integer,jsonb,uuid)'::regprocedure,
    'public.delete_graph(uuid,integer)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if strpos(definition, new_clause) > 0 then
      continue;
    end if;
    if (length(definition) - length(replace(definition, old_clause, ''))) <> length(old_clause) then
      raise exception 'Unexpected conflict clause in %', target;
    end if;
    definition := regexp_replace(definition,
      'raise exception ''Graph changed\. Reload before (saving|deleting)\.'' using errcode = ''40001'';',
      new_clause);
    if strpos(definition, old_clause) > 0 then
      raise exception 'Could not update conflict clause in %', target;
    end if;
    execute definition;
  end loop;
end;
$migration$;
