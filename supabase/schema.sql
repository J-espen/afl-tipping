-- AFL Tipping Competition Schema
-- Run this in your Supabase SQL editor (Database > SQL Editor > New query)

-- Enable realtime
alter publication supabase_realtime add table tips;
alter publication supabase_realtime add table leaderboard_cache;

-- Participants
create table if not exists participants (
  id serial primary key,
  name text not null unique
);

-- Fixtures (full season R0–R24)
create table if not exists fixtures (
  id serial primary key,
  round integer not null,
  match_num integer not null,
  game_date date,
  home_team text not null,
  away_team text not null,
  unique(round, match_num)
);

-- Lines (handicap lines per game)
create table if not exists lines (
  id serial primary key,
  round integer not null,
  match_num integer not null,
  home_team text not null,
  away_team text not null,
  line numeric,                    -- Home team handicap (e.g. -23.5)
  status text default 'pending_approval', -- 'pending_approval' | 'approved'
  final_margin numeric,            -- Home - Away final score margin
  ats_winner text,                 -- Team that won against the spread
  scrape_error text,               -- Error message if scrape failed
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(round, match_num)
);

-- Round locks
create table if not exists round_locks (
  round integer primary key,
  locked boolean default false,
  locked_at timestamptz
);

-- Tips
create table if not exists tips (
  id serial primary key,
  round integer not null,
  match_num integer not null,
  participant text not null,
  tip_team text not null,
  is_correct boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(round, match_num, participant)
);

-- Leaderboard cache (updated after results are entered)
create table if not exists leaderboard_cache (
  participant text primary key,
  total_score integer default 0,
  r0 integer default 0,
  r1 integer default 0,
  r2 integer default 0,
  r3 integer default 0,
  r4 integer default 0,
  r5 integer default 0,
  r6 integer default 0,
  r7 integer default 0,
  r8 integer default 0,
  r9 integer default 0,
  r10 integer default 0,
  r11 integer default 0,
  r12 integer default 0,
  r13 integer default 0,
  r14 integer default 0,
  r15 integer default 0,
  r16 integer default 0,
  r17 integer default 0,
  r18 integer default 0,
  r19 integer default 0,
  r20 integer default 0,
  r21 integer default 0,
  r22 integer default 0,
  r23 integer default 0,
  r24 integer default 0,
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_fixtures_round on fixtures(round);
create index if not exists idx_lines_round on lines(round);
create index if not exists idx_tips_round on tips(round);
create index if not exists idx_tips_participant on tips(participant);

-- Row Level Security (open for this honour-system app)
alter table participants enable row level security;
alter table fixtures enable row level security;
alter table lines enable row level security;
alter table round_locks enable row level security;
alter table tips enable row level security;
alter table leaderboard_cache enable row level security;

create policy "Public read" on participants for select using (true);
create policy "Public read" on fixtures for select using (true);
create policy "Public read" on lines for select using (true);
create policy "Public read" on round_locks for select using (true);
create policy "Public read" on tips for select using (true);
create policy "Public read" on leaderboard_cache for select using (true);

create policy "Public insert tips" on tips for insert with check (true);
create policy "Public update tips" on tips for update using (true);

create policy "Public upsert leaderboard" on leaderboard_cache for all using (true) with check (true);
create policy "Public manage lines" on lines for all using (true) with check (true);
create policy "Public manage locks" on round_locks for all using (true) with check (true);
create policy "Public manage fixtures" on fixtures for all using (true) with check (true);
create policy "Public manage participants" on participants for all using (true) with check (true);
