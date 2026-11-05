alter table public.user_data add column if not exists appearance jsonb;
alter table public.user_data add column if not exists onboarded boolean not null default false;
alter table public.user_data add column if not exists settings jsonb;
alter table public.user_data add column if not exists liked_synced_at timestamptz;
alter table public.user_data add column if not exists spotify_user_id text;

create table if not exists public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.song_feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  mood text not null default 'Any',
  spotify_id text not null,
  vote text not null check (vote in ('up', 'down')),
  uri text,
  title text,
  artist text,
  image text,
  created_at timestamptz not null default now(),
  primary key (user_id, mood, spotify_id)
);

create table if not exists public.shown_songs (
  user_id uuid not null references auth.users (id) on delete cascade,
  mood text not null default 'Any',
  spotify_id text not null,
  title text,
  artist text,
  shown_at timestamptz not null default now(),
  primary key (user_id, mood, spotify_id)
);

create table if not exists public.liked_songs (
  user_id uuid not null references auth.users (id) on delete cascade,
  spotify_id text not null,
  uri text,
  title text,
  artist text,
  artist_ids text[],
  album text,
  image text,
  duration_ms integer,
  added_at timestamptz,
  primary key (user_id, spotify_id)
);

create table if not exists public.song_features (
  spotify_id text primary key,
  energy real,
  valence real,
  danceability real,
  acousticness real,
  instrumentalness real,
  fetched_at timestamptz not null default now()
);

create index if not exists mood_checkins_user_time on public.mood_checkins (user_id, created_at desc);
create index if not exists shown_songs_user_time on public.shown_songs (user_id, shown_at desc);
create index if not exists liked_songs_user_added on public.liked_songs (user_id, added_at desc);

alter table public.mood_checkins enable row level security;
alter table public.chat_days enable row level security;
alter table public.song_feedback enable row level security;
alter table public.shown_songs enable row level security;
alter table public.liked_songs enable row level security;

drop policy if exists "Own rows" on public.mood_checkins;
create policy "Own rows" on public.mood_checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own rows" on public.chat_days;
create policy "Own rows" on public.chat_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own rows" on public.song_feedback;
create policy "Own rows" on public.song_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own rows" on public.shown_songs;
create policy "Own rows" on public.shown_songs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own rows" on public.liked_songs;
create policy "Own rows" on public.liked_songs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.song_features enable row level security;

drop policy if exists "Signed in users read features" on public.song_features;
create policy "Signed in users read features"
  on public.song_features for select
  to authenticated
  using (true);

drop policy if exists "Signed in users add features" on public.song_features;
create policy "Signed in users add features"
  on public.song_features for insert
  to authenticated
  with check (true);

grant select, insert, update, delete on public.mood_checkins, public.chat_days, public.song_feedback, public.shown_songs, public.liked_songs to authenticated;
grant select, insert on public.song_features to authenticated;
