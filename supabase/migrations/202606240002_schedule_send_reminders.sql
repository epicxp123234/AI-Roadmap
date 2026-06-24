create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('send-reminders-daily');
exception
  when others then null;
end $$;

select cron.schedule(
  'send-reminders-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://knqclhfxhkishaivowhe.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
