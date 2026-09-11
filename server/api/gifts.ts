/**
 * 선물 주고받기.
 *
 * POST /api/gifts
 * - { action: 'send-gift', userId, image, message } → { id, imageUrl, message, createdAt }
 * - { action: 'list-gifts', userId }                → { received: Gift[], sent: Gift[] }
 * - { action: 'delete-today-gift', userId }         → { deletedId }
 *
 * 이미지는 Vercel Blob 에 올리고 DB 에는 URL 만 저장해요. base64 를 그대로
 * 넣으면 선물 하나에 수백 KB 씩 쌓여서요.
 */
import { del, put } from '@vercel/blob';
import { json, rejectUnlessPost } from '../lib/cors.js';
import { maybeOne, query, transaction } from '../lib/db.js';
import { ClientError, requireUserId } from '../lib/errors.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 120;

/** 하루 한 번만 보낼 수 있어요. 한국 시간 기준으로 날짜를 끊습니다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const config = { maxDuration: 60 };

interface Gift {
  id: string;
  imageUrl: string;
  message: string;
  createdAt: string;
}

interface GiftRow {
  id: string;
  image_url: string;
  message: string;
  created_at: Date;
}

export default {
  async fetch(request: Request) {
    const origin = request.headers.get('origin');
    const rejected = rejectUnlessPost(request, origin);
    if (rejected != null) return rejected;

    let body: {
      action?: unknown;
      userId?: unknown;
      image?: unknown;
      message?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON 본문을 읽지 못했어요.' }, 400, origin);
    }

    try {
      const userId = requireUserId(body.userId);

      switch (body.action) {
        case 'send-gift':
          return json(
            await sendGift(userId, body.image, body.message),
            200,
            origin,
          );
        case 'list-gifts':
          return json(await listGifts(userId), 200, origin);
        case 'delete-today-gift':
          return json(await deleteTodayGift(userId), 200, origin);
        default:
          return json({ error: '알 수 없는 action 이에요.' }, 400, origin);
      }
    } catch (error) {
      if (error instanceof ClientError) {
        return json({ error: error.message }, error.status, origin);
      }
      console.error('[gifts] 처리 실패', error);
      return json({ error: '선물을 처리하지 못했어요.' }, 500, origin);
    }
  },
};

async function sendGift(
  userId: string,
  rawImage: unknown,
  rawMessage: unknown,
) {
  const image =
    typeof rawImage === 'string'
      ? rawImage.replace(/^data:image\/\w+;base64,/, '')
      : '';
  if (image.length === 0) {
    throw new ClientError('선물 이미지가 필요해요.', 400);
  }
  if (image.length > MAX_IMAGE_BYTES) {
    throw new ClientError('이미지가 너무 커요.', 413);
  }

  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (message.length === 0) {
    throw new ClientError('함께 보낼 메시지를 적어주세요.', 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ClientError(`메시지는 ${MAX_MESSAGE_LENGTH}자까지예요.`, 400);
  }

  // 이미지를 올리기 전에 보낼 수 있는 상태인지 먼저 확인해요.
  const friendId = await findFriendId(userId);
  if (friendId == null) {
    throw new ClientError('먼저 친구와 연결해주세요.', 409);
  }
  if (await hasSentToday(userId)) {
    throw new ClientError('오늘은 이미 선물을 보냈어요.', 409);
  }

  const uploaded = await put(
    `gifts/${userId}/${crypto.randomUUID()}.png`,
    Buffer.from(image, 'base64'),
    { access: 'public', contentType: 'image/png', addRandomSuffix: false },
  );

  try {
    const row = await transaction(async (client) => {
      // 동시에 두 번 눌렸을 때 두 개가 저장되지 않게 다시 확인해요.
      const { rows: existing } = await client.query(
        'select 1 from gifts where sender_id = $1 and created_at >= $2 limit 1',
        [userId, startOfTodayKst()],
      );
      if (existing.length > 0) {
        throw new ClientError('오늘은 이미 선물을 보냈어요.', 409);
      }

      const inserted = await client.query<GiftRow>(
        `insert into gifts (sender_id, recipient_id, image_url, message)
         values ($1, $2, $3, $4)
         returning id, image_url, message, created_at`,
        [userId, friendId, uploaded.url, message],
      );
      return inserted.rows[0]!;
    });

    return toGift(row);
  } catch (error) {
    // 저장에 실패했으면 올린 이미지를 남기지 않아요.
    await del(uploaded.url).catch((cleanupError) => {
      console.error('[gifts] 업로드 정리 실패', cleanupError);
    });
    throw error;
  }
}

async function listGifts(userId: string) {
  const [received, sent] = await Promise.all([
    fetchGifts('recipient_id', userId),
    fetchGifts('sender_id', userId),
  ]);
  return { received, sent };
}

async function fetchGifts(column: 'recipient_id' | 'sender_id', userId: string) {
  const rows = await query<GiftRow>(
    `select id, image_url, message, created_at from gifts
     where ${column} = $1 order by created_at desc`,
    [userId],
  );
  return rows.map(toGift);
}

/**
 * 오늘 보낸 선물을 지워요. 하루 한 번 제한 때문에 다시 보낼 수 있어야 해서
 * 필요한 동작이에요. 이미지 파일도 같이 지웁니다.
 */
async function deleteTodayGift(userId: string) {
  const deleted = await maybeOne<{ id: string; image_url: string }>(
    `delete from gifts
     where id = (
       select id from gifts
       where sender_id = $1 and created_at >= $2
       order by created_at desc limit 1
     )
     returning id, image_url`,
    [userId, startOfTodayKst()],
  );

  if (deleted == null) {
    throw new ClientError('오늘 보낸 선물이 없어요.', 404);
  }

  // 파일 삭제가 실패해도 선물은 이미 지워졌으니 진행을 막지 않아요.
  await del(deleted.image_url).catch((error) => {
    console.error('[gifts] 이미지 삭제 실패', error);
  });

  return { deletedId: deleted.id };
}

async function hasSentToday(userId: string) {
  const row = await maybeOne(
    'select 1 from gifts where sender_id = $1 and created_at >= $2 limit 1',
    [userId, startOfTodayKst()],
  );
  return row != null;
}

async function findFriendId(userId: string) {
  const row = await maybeOne<{ user_a: string; user_b: string }>(
    'select user_a, user_b from friendships where user_a = $1 or user_b = $1 limit 1',
    [userId],
  );
  if (row == null) return null;
  return row.user_a === userId ? row.user_b : row.user_a;
}

/** 한국 시간 자정을 Date 로 돌려줘요. */
function startOfTodayKst(): Date {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const midnightKst = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  return new Date(midnightKst - KST_OFFSET_MS);
}

function toGift(row: GiftRow): Gift {
  return {
    id: row.id,
    imageUrl: row.image_url,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  };
}
