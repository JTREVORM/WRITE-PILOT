-- =============================================================================
-- WritePilot :: 0008 :: Notification column guard
-- -----------------------------------------------------------------------------
-- Phase 2 surfaces notifications in the application shell, which means a user
-- session now issues UPDATEs against this table to mark items as read.
--
-- RLS can restrict which *rows* a user may update but not which *columns*, so
-- without this a user could rewrite the title or body of their own notification.
-- Nothing security-critical hangs on that today, but notifications are written
-- by the system and read by the user: making them structurally read-only except
-- for the read state keeps that contract true, and matches the guard already
-- protecting the profiles table.
-- =============================================================================

create or replace function public.notifications_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- read_at is the only field a user session may move. Everything else is
  -- silently restored rather than raising, so marking a notification read never
  -- fails on an unrelated field the client happened to echo back.
  new.id := old.id;
  new.user_id := old.user_id;
  new.type := old.type;
  new.title := old.title;
  new.body := old.body;
  new.action_url := old.action_url;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists notifications_guard_protected_columns on public.notifications;
create trigger notifications_guard_protected_columns
  before update on public.notifications
  for each row execute function public.notifications_guard_protected_columns();

-- Marking every notification read is a single statement scanning this index.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
