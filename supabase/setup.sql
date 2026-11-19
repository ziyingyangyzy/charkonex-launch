-- Charkonex Launch Board: database setup
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Before running, change the team password on the LAST line.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.board_tasks (
  id bigint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.board_meta (
  key text primary key,
  data jsonb not null
);
create table if not exists public.board_secret (
  id int primary key default 1 check (id = 1),
  pass_hash text not null
);
create table if not exists public.board_rev (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0
);
insert into public.board_rev (id, rev) values (1, 0) on conflict do nothing;

-- Lock the tables: with RLS on and no policies, the public key cannot read or
-- write them directly. All access goes through the password-checked functions below.
alter table public.board_tasks  enable row level security;
alter table public.board_meta   enable row level security;
alter table public.board_secret enable row level security;
alter table public.board_rev    enable row level security;

create or replace function public._board_check(pass text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if pass is null or not exists (
    select 1 from board_secret where pass_hash = extensions.crypt(pass, pass_hash)
  ) then
    raise exception 'bad password' using errcode = '28P01';
  end if;
end $$;

create or replace function public._board_bump() returns bigint
language sql security definer set search_path = public as $$
  update board_rev set rev = rev + 1 where id = 1 returning rev;
$$;

create or replace function public.board_get(pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _board_check(pass);
  return jsonb_build_object(
    'rev',   (select rev from board_rev where id = 1),
    'tasks', coalesce((select jsonb_agg(data order by id) from board_tasks), '[]'::jsonb),
    'meta',  coalesce((select jsonb_object_agg(key, data) from board_meta), '{}'::jsonb)
  );
end $$;

create or replace function public.board_rev(pass text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _board_check(pass);
  return (select rev from board_rev where id = 1);
end $$;

create or replace function public.board_put_task(pass text, t jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _board_check(pass);
  insert into board_tasks (id, data, updated_at) values ((t->>'id')::bigint, t, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
  return _board_bump();
end $$;

create or replace function public.board_del_task(pass text, tid bigint) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _board_check(pass);
  delete from board_tasks where id = tid;
  return _board_bump();
end $$;

create or replace function public.board_put_meta(pass text, k text, d jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _board_check(pass);
  insert into board_meta (key, data) values (k, d)
  on conflict (key) do update set data = excluded.data;
  return _board_bump();
end $$;

-- Loads the starting tasks the first time someone opens the site. Does nothing once the board has data.
create or replace function public.board_seed(pass text, tasks jsonb, meta jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare t jsonb; k text;
begin
  perform _board_check(pass);
  if exists (select 1 from board_tasks) or exists (select 1 from board_meta) then
    return (select rev from board_rev where id = 1);
  end if;
  for t in select * from jsonb_array_elements(tasks) loop
    insert into board_tasks (id, data) values ((t->>'id')::bigint, t);
  end loop;
  for k in select * from jsonb_object_keys(meta) loop
    insert into board_meta (key, data) values (k, meta->k);
  end loop;
  return _board_bump();
end $$;

revoke all on function public._board_check(text) from public, anon, authenticated;
revoke all on function public._board_bump() from public, anon, authenticated;
grant execute on function public.board_get(text), public.board_rev(text),
  public.board_put_task(text, jsonb), public.board_del_task(text, bigint),
  public.board_put_meta(text, text, jsonb), public.board_seed(text, jsonb, jsonb)
  to anon, authenticated;

-- Team password: replace CHANGE-ME with your own (long is better), then run.
-- To change it later, run just this line again with the new password.
insert into public.board_secret (id, pass_hash) values (1, extensions.crypt('CHANGE-ME', extensions.gen_salt('bf')))
on conflict (id) do update set pass_hash = excluded.pass_hash;
