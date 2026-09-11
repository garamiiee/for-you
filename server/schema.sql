-- 오다 주웠어..♥ 스키마
-- Supabase 대시보드의 SQL Editor 에 그대로 붙여 실행하면 됩니다.

-- 사용자. id 는 앱이 만든 데모용 식별자예요.
-- 나중에 토스 로그인을 붙이면 앱 전용 userKey 로 바뀝니다.
create table if not exists public.users (
  id text primary key,
  created_at timestamptz not null default now()
);

-- 초대 코드. 한 사람당 유효한 pending 코드는 하나만 두려고
-- 새로 만들 때 이전 코드를 expired 로 바꿔요.
create table if not exists public.invites (
  code text primary key,
  inviter_id text not null references public.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired')),
  accepted_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists invites_inviter_idx
  on public.invites (inviter_id, status);

-- 친구 관계. 같은 쌍이 두 번 저장되지 않게 항상 user_a < user_b 로 정렬해서 넣어요.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a text not null references public.users (id) on delete cascade,
  user_b text not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_unique unique (user_a, user_b)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

-- 주고받은 선물. 이미지는 Storage 에 올리고 URL 만 저장해요.
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null references public.users (id) on delete cascade,
  recipient_id text not null references public.users (id) on delete cascade,
  image_url text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint gifts_not_self check (sender_id <> recipient_id)
);

create index if not exists gifts_recipient_idx
  on public.gifts (recipient_id, created_at desc);
create index if not exists gifts_sender_idx
  on public.gifts (sender_id, created_at desc);

-- 이미지는 Vercel Blob 에 올리고 gifts.image_url 에 URL 만 저장해요.
-- 테이블 접근은 서버 함수만 하고, 접속 문자열은 함수 환경 변수에만 있어요.
