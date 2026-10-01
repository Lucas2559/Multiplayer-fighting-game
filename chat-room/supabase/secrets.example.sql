-- Nexus Canvas chat — the passwords, kept OUT of the repository.
--
-- Copy this to supabase/secrets.local.sql, fill in the real values, and run it
-- in the Supabase SQL Editor AFTER schema.sql. secrets.local.sql is git-ignored,
-- so the passwords never reach GitHub.
--
-- Re-running schema.sql resets these to their SET-ME-* placeholders, so run
-- this file again whenever you re-run the schema.

-- Unlocks changing an account's name or password.
create or replace function public.chat_master_password()
returns text language sql immutable as $$ select 'put-the-admin-password-here' $$;
revoke all on function public.chat_master_password() from public, anon, authenticated;

-- The built-in account that sees every chat.
create or replace function public.chat_dev_password()
returns text language sql immutable as $$ select 'put-the-dev-password-here' $$;
revoke all on function public.chat_dev_password() from public, anon, authenticated;

-- Shrijay's ordinary account.
create or replace function public.chat_shrijay_password()
returns text language sql immutable as $$ select 'put-shrijays-password-here' $$;
revoke all on function public.chat_shrijay_password() from public, anon, authenticated;

-- The seeded accounts' stored hashes come from the functions above, so re-apply
-- them now that the real passwords are in place.
set search_path = public, extensions;

insert into public.accounts (name_key, name, pass_hash, color)
values (lower(chat_dev_name()), chat_dev_name(),
        crypt(chat_dev_password(), gen_salt('bf')), chat_dev_color())
on conflict (name_key) do update
  set pass_hash = crypt(chat_dev_password(), gen_salt('bf')), updated_at = now();

insert into public.accounts (name_key, name, pass_hash, color)
values (lower(chat_shrijay_name()), chat_shrijay_name(),
        crypt(chat_shrijay_password(), gen_salt('bf')), '#5aa9e6')
on conflict (name_key) do update
  set pass_hash = crypt(chat_shrijay_password(), gen_salt('bf')), updated_at = now();
