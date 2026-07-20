alter table public.profiles
  add column if not exists has_seen_onboarding boolean not null default false;

update public.profiles p
set has_seen_onboarding = true
where has_seen_onboarding = false
  and exists (
    select 1
    from public.roadmaps r
    where r.user_id = p.id
  );