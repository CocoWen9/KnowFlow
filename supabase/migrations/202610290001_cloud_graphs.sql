-- KnowFlow 2: user-scoped relational graphs and atomic optimistic writes.
-- Apply as the migration owner (Supabase postgres), never from the browser.
create schema if not exists knowflow_internal;
revoke all on schema knowflow_internal from public, anon, authenticated;

create table public.graphs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_mutation_id uuid not null,
  last_mutation_hash text not null,
  payload_bytes integer not null check (payload_bytes between 0 and 1048576)
);
create index graphs_owner_updated_idx on public.graphs(owner_id, updated_at desc);

create table public.nodes (
  graph_id uuid not null references public.graphs(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  parent_id text,
  title text not null,
  question text not null,
  answer text not null,
  position_x double precision not null,
  position_y double precision not null,
  data jsonb not null default '{}',
  ordinal integer not null,
  primary key (graph_id, id),
  foreign key (graph_id, parent_id) references public.nodes(graph_id, id)
    deferrable initially deferred,
  check (parent_id is null or parent_id <> id),
  check (jsonb_typeof(data) = 'object'),
  check (abs(position_x) <= 10000000 and abs(position_y) <= 10000000)
);
create index nodes_parent_idx on public.nodes(graph_id, parent_id);

create table public.edges (
  graph_id uuid not null references public.graphs(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  source_id text not null,
  target_id text not null,
  relationship_type text not null,
  note text not null default '',
  data jsonb not null default '{}',
  presentation jsonb not null default '{}',
  ordinal integer not null,
  primary key (graph_id, id),
  foreign key (graph_id, source_id) references public.nodes(graph_id, id),
  foreign key (graph_id, target_id) references public.nodes(graph_id, id),
  check (jsonb_typeof(data) = 'object'),
  check (jsonb_typeof(presentation) = 'object')
);
create index edges_source_idx on public.edges(graph_id, source_id);
create index edges_target_idx on public.edges(graph_id, target_id);

alter table public.graphs enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
create policy graphs_read_own on public.graphs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy nodes_read_own on public.nodes for select to authenticated
  using (exists (select 1 from public.graphs g where g.id = graph_id and g.owner_id = (select auth.uid())));
create policy edges_read_own on public.edges for select to authenticated
  using (exists (select 1 from public.graphs g where g.id = graph_id and g.owner_id = (select auth.uid())));

-- Exposed table writes are forbidden. All writes must go through the versioned RPCs.
revoke all on public.graphs, public.nodes, public.edges from public, anon, authenticated;
grant select on public.graphs, public.nodes, public.edges to authenticated;

create function knowflow_internal.graph_json(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id, 'pinned', g.pinned, 'version', g.version,
    'createdAt', g.created_at, 'updatedAt', g.updated_at,
    'nodes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'type', 'conversation',
      'position', jsonb_build_object('x', n.position_x, 'y', n.position_y),
      'data', n.data || jsonb_build_object('title', n.title, 'userMessage', n.question,
        'assistantMessage', n.answer) || case when n.parent_id is null then '{}'::jsonb
        else jsonb_build_object('parentId', n.parent_id) end
    ) order by n.ordinal) from public.nodes n where n.graph_id = g.id), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(e.presentation || jsonb_build_object(
      'id', e.id, 'source', e.source_id, 'target', e.target_id,
      'data', e.data || jsonb_build_object('relationshipType', e.relationship_type, 'note', e.note)
    ) order by e.ordinal) from public.edges e where e.graph_id = g.id), '[]'::jsonb)
  ) from public.graphs g where g.id = p_id
$$;
revoke all on function knowflow_internal.graph_json(uuid) from public, anon, authenticated;

create function public.list_graphs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Sign in to access graphs.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(knowflow_internal.graph_json(id) order by updated_at desc), '[]'::jsonb)
    into v_result from public.graphs where owner_id = v_user;
  return v_result;
end $$;

create function public.get_graph(p_graph_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to access graphs.' using errcode = '42501'; end if;
  if not exists (select 1 from public.graphs where id = p_graph_id and owner_id = auth.uid()) then
    raise exception 'Graph not found.' using errcode = 'P0002';
  end if;
  return knowflow_internal.graph_json(p_graph_id);
end $$;

create function public.save_graph(p_graph_id uuid, p_expected_version integer, p_graph jsonb, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_existing public.graphs%rowtype;
  v_node jsonb; v_edge jsonb; v_data jsonb; v_i integer := 0;
  v_bytes integer := octet_length(p_graph::text); v_hash text := md5(p_graph::text);
  v_cycle boolean;
begin
  if v_user is null then raise exception 'Sign in to save graphs.' using errcode = '42501'; end if;
  if p_graph_id is null or p_mutation_id is null or p_expected_version is null or p_expected_version < 0
    or p_graph is null or jsonb_typeof(p_graph) <> 'object'
    or jsonb_typeof(p_graph->'nodes') is distinct from 'array'
    or jsonb_typeof(p_graph->'edges') is distinct from 'array'
    or (p_graph ? 'id' and p_graph->>'id' is distinct from p_graph_id::text)
    or (p_graph ? 'pinned' and jsonb_typeof(p_graph->'pinned') <> 'boolean') then
    raise exception 'Invalid graph.' using errcode = '22023';
  end if;
  if v_bytes > 1048576 or jsonb_array_length(p_graph->'nodes') > 1000
    or jsonb_array_length(p_graph->'edges') > 3000 then
    raise exception 'Graph exceeds the size limit.' using errcode = '22023';
  end if;

  -- Serialize account writes, including concurrent creations, quota checks and deletion.
  -- The row lock is held only for this short database transaction, never during an AI request.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_graph_id::text, 0));
  perform 1 from auth.users where id = v_user for update;
  select * into v_existing from public.graphs where id = p_graph_id for update;
  if found then
    if v_existing.owner_id <> v_user then raise exception 'Graph not found.' using errcode = 'P0002'; end if;
    if v_existing.last_mutation_id = p_mutation_id then
      if v_existing.last_mutation_hash <> v_hash or v_existing.version <> p_expected_version + 1 then
        raise exception 'Mutation ID was reused for a different change.' using errcode = '22023';
      end if;
      return knowflow_internal.graph_json(p_graph_id);
    end if;
    if v_existing.version <> p_expected_version then
      raise exception 'Graph changed. Reload before saving.' using errcode = '40001';
    end if;
  elsif p_expected_version <> 0 then
    raise exception 'Graph not found.' using errcode = 'P0002';
  elsif (select count(*) from public.graphs where owner_id = v_user) >= 100 then
    raise exception 'Graph limit reached (100).' using errcode = '22023';
  end if;
  if (select coalesce(sum(payload_bytes), 0) from public.graphs where owner_id = v_user and id <> p_graph_id) + v_bytes > 8388608 then
    raise exception 'Workspace exceeds the 8 MiB cloud storage limit.' using errcode = '22023';
  end if;

  insert into public.graphs(id, owner_id, pinned, version, last_mutation_id, last_mutation_hash, payload_bytes)
    values (p_graph_id, v_user, coalesce((p_graph->>'pinned')::boolean, false), 1, p_mutation_id, v_hash, v_bytes)
    on conflict(id) do update set pinned = excluded.pinned, version = public.graphs.version + 1,
      updated_at = now(), last_mutation_id = excluded.last_mutation_id,
      last_mutation_hash = excluded.last_mutation_hash, payload_bytes = excluded.payload_bytes;
  delete from public.edges where graph_id = p_graph_id;
  delete from public.nodes where graph_id = p_graph_id;

  for v_node in select value from jsonb_array_elements(p_graph->'nodes') loop
    v_data := v_node->'data';
    if jsonb_typeof(v_node) <> 'object' or jsonb_typeof(v_node->'id') is distinct from 'string'
      or length(v_node->>'id') not between 1 and 200
      or jsonb_typeof(v_data) is distinct from 'object'
      or jsonb_typeof(v_data->'title') is distinct from 'string'
      or jsonb_typeof(v_data->'userMessage') is distinct from 'string'
      or jsonb_typeof(v_data->'assistantMessage') is distinct from 'string'
      or jsonb_typeof(v_node#>'{position,x}') is distinct from 'number'
      or jsonb_typeof(v_node#>'{position,y}') is distinct from 'number'
      or (v_data ? 'parentId' and jsonb_typeof(v_data->'parentId') not in ('string','null'))
      or (v_data ? 'isPending' and v_data->'isPending' <> 'false'::jsonb) then
      raise exception 'Invalid or unfinished node.' using errcode = '22023';
    end if;
    insert into public.nodes(graph_id, id, parent_id, title, question, answer, position_x, position_y, data, ordinal)
      values (p_graph_id, v_node->>'id', v_data->>'parentId', v_data->>'title',
        v_data->>'userMessage', v_data->>'assistantMessage',
        (v_node#>>'{position,x}')::double precision, (v_node#>>'{position,y}')::double precision,
        v_data - array['parentId','title','userMessage','assistantMessage','isPending'], v_i);
    v_i := v_i + 1;
  end loop;
  -- Checking ancestors without revisiting a node makes malformed cycles terminate.
  with recursive ancestry as (
    select id as origin, id, parent_id, array[id] as path, false as cycle from public.nodes where graph_id = p_graph_id
    union all
    select a.origin, n.id, n.parent_id, a.path || n.id, n.id = any(a.path)
      from ancestry a join public.nodes n on n.graph_id = p_graph_id and n.id = a.parent_id where not a.cycle
  ) select coalesce(bool_or(cycle), false) into v_cycle from ancestry;
  if v_cycle then raise exception 'Parent relationships cannot contain a cycle.' using errcode = '22023'; end if;

  v_i := 0;
  for v_edge in select value from jsonb_array_elements(p_graph->'edges') loop
    v_data := coalesce(v_edge->'data', '{}'::jsonb);
    if jsonb_typeof(v_edge) <> 'object' or jsonb_typeof(v_edge->'id') is distinct from 'string'
      or length(v_edge->>'id') not between 1 and 200
      or jsonb_typeof(v_edge->'source') is distinct from 'string'
      or jsonb_typeof(v_edge->'target') is distinct from 'string'
      or jsonb_typeof(v_data) <> 'object'
      or (v_data ? 'relationshipType' and jsonb_typeof(v_data->'relationshipType') <> 'string')
      or (v_data ? 'note' and jsonb_typeof(v_data->'note') <> 'string')
      or (v_data ? 'isPending' and v_data->'isPending' <> 'false'::jsonb) then
      raise exception 'Invalid or unfinished edge.' using errcode = '22023';
    end if;
    insert into public.edges(graph_id, id, source_id, target_id, relationship_type, note, data, presentation, ordinal)
      values (p_graph_id, v_edge->>'id', v_edge->>'source', v_edge->>'target',
        coalesce(v_data->>'relationshipType', 'related-to'), coalesce(v_data->>'note', ''),
        v_data - array['relationshipType','note','isPending'],
        v_edge - array['id','source','target','data','selected'], v_i);
    v_i := v_i + 1;
  end loop;
  -- Ensure deferred parent references fail before returning, and roll back the whole operation.
  set constraints all immediate;
  return knowflow_internal.graph_json(p_graph_id);
end $$;

create function public.delete_graph(p_graph_id uuid, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_existing public.graphs%rowtype;
begin
  if v_user is null then raise exception 'Sign in to delete graphs.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_graph_id::text, 0));
  perform 1 from auth.users where id = v_user for update;
  select * into v_existing from public.graphs where id = p_graph_id and owner_id = v_user for update;
  if not found then raise exception 'Graph not found.' using errcode = 'P0002'; end if;
  if p_expected_version is null or v_existing.version <> p_expected_version then
    raise exception 'Graph changed. Reload before deleting.' using errcode = '40001';
  end if;
  delete from public.graphs where id = p_graph_id;
  return jsonb_build_object('deleted', true);
end $$;

revoke all on function public.list_graphs(), public.get_graph(uuid),
  public.save_graph(uuid, integer, jsonb, uuid), public.delete_graph(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_graphs(), public.get_graph(uuid),
  public.save_graph(uuid, integer, jsonb, uuid), public.delete_graph(uuid, integer) to authenticated;
