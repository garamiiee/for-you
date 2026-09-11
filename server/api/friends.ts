/**
 * 친구 연결.
 *
 * POST /api/friends
 * - { action: 'create-invite', userId }        → { code, expiresAt }
 * - { action: 'accept-invite', userId, code }  → { id, connectedAt }
 * - { action: 'get-friend',    userId }        → { friend: { id, connectedAt } | null }
 */
import type { PoolClient } from 'pg';
import { json, rejectUnlessPost } from '../lib/cors.js';
import { isUniqueViolation, maybeOne, transaction } from '../lib/db.js';
import { ClientError, requireUserId } from '../lib/errors.js';

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 31자예요. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const INVITE_TTL_HOURS = 24;
const MAX_CODE_ATTEMPTS = 5;

interface Friend {
  id: string;
  connectedAt: string;
}

export default {
  async fetch(request: Request) {
    const origin = request.headers.get('origin');
    const rejected = rejectUnlessPost(request, origin);
    if (rejected != null) return rejected;

    let body: { action?: unknown; userId?: unknown; code?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON 본문을 읽지 못했어요.' }, 400, origin);
    }

    try {
      const userId = requireUserId(body.userId);

      switch (body.action) {
        case 'create-invite':
          return json(await createInvite(userId), 200, origin);
        case 'accept-invite':
          return json(await acceptInvite(userId, body.code), 200, origin);
        case 'get-friend':
          return json({ friend: await findFriend(userId) }, 200, origin);
        default:
          return json({ error: '알 수 없는 action 이에요.' }, 400, origin);
      }
    } catch (error) {
      if (error instanceof ClientError) {
        return json({ error: error.message }, error.status, origin);
      }
      console.error('[friends] 처리 실패', error);
      return json({ error: '친구 정보를 처리하지 못했어요.' }, 500, origin);
    }
  },
};

async function ensureUser(client: PoolClient, id: string) {
  await client.query(
    'insert into users (id) values ($1) on conflict (id) do nothing',
    [id],
  );
}

async function friendOf(client: PoolClient, userId: string) {
  const { rows } = await client.query<{
    user_a: string;
    user_b: string;
    created_at: Date;
  }>(
    'select user_a, user_b, created_at from friendships where user_a = $1 or user_b = $1 limit 1',
    [userId],
  );

  const row = rows[0];
  if (row == null) return null;

  return {
    id: row.user_a === userId ? row.user_b : row.user_a,
    connectedAt: row.created_at.toISOString(),
  };
}

async function createInvite(userId: string) {
  return transaction(async (client) => {
    await ensureUser(client, userId);

    if ((await friendOf(client, userId)) != null) {
      throw new ClientError('이미 친구와 연결돼 있어요.', 409);
    }

    // 유효한 코드는 한 사람당 하나만 남겨요.
    await client.query(
      "update invites set status = 'expired' where inviter_id = $1 and status = 'pending'",
      [userId],
    );

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000,
    );

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateCode();
      try {
        await client.query(
          'insert into invites (code, inviter_id, expires_at) values ($1, $2, $3)',
          [code, userId, expiresAt],
        );
        return { code, expiresAt: expiresAt.toISOString() };
      } catch (error) {
        // 코드가 겹쳤으면 다시 뽑아요. 그 외 오류는 그대로 올립니다.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new ClientError('초대 코드를 만들지 못했어요. 다시 시도해주세요.', 503);
  });
}

async function acceptInvite(userId: string, rawCode: unknown) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (code.length !== CODE_LENGTH) {
    throw new ClientError('초대 코드는 6자리예요.', 400);
  }

  return transaction(async (client) => {
    await ensureUser(client, userId);

    // 같은 코드를 두 사람이 동시에 수락하지 못하게 행을 잠가요.
    const { rows } = await client.query<{
      inviter_id: string;
      status: string;
      expires_at: Date;
    }>(
      'select inviter_id, status, expires_at from invites where code = $1 for update',
      [code],
    );
    const invite = rows[0];

    if (invite == null) throw new ClientError('없는 초대 코드예요.', 404);
    if (invite.inviter_id === userId) {
      throw new ClientError('내 초대 코드예요. 친구에게 보내주세요.', 400);
    }
    if (invite.status !== 'pending') {
      throw new ClientError('이미 사용된 코드예요.', 409);
    }
    if (invite.expires_at.getTime() <= Date.now()) {
      throw new ClientError('만료된 코드예요. 새 코드를 받아주세요.', 410);
    }
    if ((await friendOf(client, userId)) != null) {
      throw new ClientError('이미 친구와 연결돼 있어요.', 409);
    }
    if ((await friendOf(client, invite.inviter_id)) != null) {
      throw new ClientError('상대방이 이미 다른 친구와 연결돼 있어요.', 409);
    }

    // 같은 쌍이 두 번 저장되지 않게 항상 정렬해서 넣어요.
    const [userA, userB] = [userId, invite.inviter_id].sort();
    let connectedAt: Date;
    try {
      const inserted = await client.query<{ created_at: Date }>(
        'insert into friendships (user_a, user_b) values ($1, $2) returning created_at',
        [userA, userB],
      );
      connectedAt = inserted.rows[0]!.created_at;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ClientError('이미 친구와 연결돼 있어요.', 409);
      }
      throw error;
    }

    await client.query(
      "update invites set status = 'accepted', accepted_by = $2 where code = $1",
      [code, userId],
    );

    return {
      id: invite.inviter_id,
      connectedAt: connectedAt.toISOString(),
    } satisfies Friend;
  });
}

async function findFriend(userId: string): Promise<Friend | null> {
  const row = await maybeOne<{
    user_a: string;
    user_b: string;
    created_at: Date;
  }>(
    'select user_a, user_b, created_at from friendships where user_a = $1 or user_b = $1 limit 1',
    [userId],
  );
  if (row == null) return null;

  return {
    id: row.user_a === userId ? row.user_b : row.user_a,
    connectedAt: row.created_at.toISOString(),
  };
}

/** 편향 없이 뽑으려고 남는 구간은 버리고 다시 뽑아요. */
function generateCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';

  while (code.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
      if (code.length === CODE_LENGTH) break;
    }
  }

  return code;
}
