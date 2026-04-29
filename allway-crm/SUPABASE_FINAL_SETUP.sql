-- ================================================================
-- ALLWAY CRM — FINAL SUPABASE SETUP
-- Includes: Returns Table + User Provisioning RPC
-- ================================================================

-- 1. RETURNS TABLE
create table if not exists returns (
  id serial primary key,
  invoice_id integer,
  client_name text not null,
  product_name text not null,
  quantity integer default 1,
  refund_usd numeric(12,2) default 0,
  refund_method text default 'Cash USD',
  reason text default '',
  note text default '',
  processed_by text not null,
  station text default '',
  created_at timestamptz default now()
);

-- Permissions for Returns
alter table returns disable row level security;
grant all on returns to anon;
grant usage, select on sequence returns_id_seq to anon;

-- 2. USER PROVISIONING RPC
-- Allows the Admin UI to create an Auth account + Public Profile in one transaction
create or replace function provision_auth_user(
  p_username text,
  p_password text,
  p_name text,
  p_role text,
  p_station text
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  v_email := lower(p_username) || '@allway.local';

  -- Create the Auth user
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
    created_at, updated_at, confirmation_token, email_change, 
    email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', p_username),
    now(), now(), '', '', '', ''
  )
  returning id into v_user_id;

  -- Create the Public Profile
  insert into public.users (id, name, username, password_hash, role, station, active)
  values (v_user_id, p_name, p_username, p_password, p_role, p_station, true);
end;
$$;

grant execute on function provision_auth_user to anon;
grant execute on function provision_auth_user to public;
