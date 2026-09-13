/**
 * 선물 주고받기.
 *
 * 누끼 딴 이미지는 서버가 Storage 에 올리고 URL 만 돌려줘요.
 * (서버 코드는 supabase/functions/gifts 참고)
 */
import { Storage } from '@apps-in-toss/framework';
import { ApiError, callFunction, isApiConfigured } from './config';
import { getUserId } from './friends';

const MOCK_GIFTS_KEY = 'for-you:mockGifts';
const SEND_TIMEOUT_MS = 30_000;
const LIST_TIMEOUT_MS = 10_000;

export interface Gift {
  id: string;
  imageUrl: string;
  message: string;
  recipientName?: string;
  createdAt: string;
}

export interface GiftBox {
  received: Gift[];
  sent: Gift[];
}

/** 누끼 딴 이미지와 메시지를 친구에게 보내요. */
export async function sendGift(
  imageUri: string,
  message: string,
  recipientName = '',
): Promise<Gift> {
  if (!isApiConfigured()) return sendMockGift(imageUri, message, recipientName);

  const userId = await getUserId();
  const gift = await callFunction<Gift>(
    'gifts',
    {
      action: 'send-gift',
      userId,
      image: stripDataUrl(imageUri),
      message: packMessage(message, recipientName),
    },
    SEND_TIMEOUT_MS,
  );
  return unpackGift(gift);
}

/** 주고받은 선물을 모두 가져와요. */
export async function listGifts(): Promise<GiftBox> {
  if (!isApiConfigured()) return readMockGifts();

  const userId = await getUserId();
  const box = await callFunction<GiftBox>(
    'gifts',
    { action: 'list-gifts', userId },
    LIST_TIMEOUT_MS,
  );
  return {
    received: box.received.map(unpackGift),
    sent: box.sent.map(unpackGift),
  };
}

/** 오늘 보낸 선물을 취소해요. 취소하면 오늘 다시 보낼 수 있어요. */
export async function deleteTodayGift(): Promise<void> {
  if (!isApiConfigured()) return deleteMockTodayGift();

  const userId = await getUserId();
  await callFunction<{ deletedId: string }>(
    'gifts',
    { action: 'delete-today-gift', userId },
    LIST_TIMEOUT_MS,
  );
}

/** 오늘 이미 보냈는지 확인해요. 서버도 같은 기준(한국 시간)으로 막아요. */
export function hasSentToday(sent: Gift[]): boolean {
  const today = kstDateKey(new Date());
  return sent.some((gift) => kstDateKey(new Date(gift.createdAt)) === today);
}

function stripDataUrl(imageUri: string) {
  return imageUri.replace(/^data:image\/\w+;base64,/, '');
}

// 기존 서버/DB 구조를 바꾸지 않고도 받는 사람 이름을 선물과 함께 보관해요.
const RECIPIENT_SEPARATOR = '\u2063';

function packMessage(message: string, recipientName: string) {
  const name = recipientName.trim();
  const trimmedMessage = message.trim();
  return name
    ? `${RECIPIENT_SEPARATOR}${name}${RECIPIENT_SEPARATOR}${trimmedMessage}`
    : trimmedMessage;
}

function unpackGift(gift: Gift): Gift {
  if (!gift.message.startsWith(RECIPIENT_SEPARATOR)) return gift;

  const separatorIndex = gift.message.indexOf(RECIPIENT_SEPARATOR, 1);
  if (separatorIndex < 0) return gift;

  return {
    ...gift,
    recipientName: gift.message.slice(1, separatorIndex),
    message: gift.message.slice(separatorIndex + 1),
  };
}

/** 한국 시간 기준 날짜(YYYY-MM-DD)로 바꿔요. */
function kstDateKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 서버 설정 전 목업. 이 기기에만 저장돼요.
// ---------------------------------------------------------------------------

async function sendMockGift(
  imageUri: string,
  message: string,
  recipientName: string,
): Promise<Gift> {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    throw new ApiError('함께 보낼 메시지를 적어주세요.');
  }

  const box = await readMockGifts();
  if (hasSentToday(box.sent)) {
    throw new ApiError('오늘은 이미 선물을 보냈어요.');
  }

  const gift: Gift = {
    id: `mock_${Date.now().toString(36)}`,
    imageUrl: imageUri,
    message: trimmed,
    recipientName: recipientName.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const next: GiftBox = { received: box.received, sent: [gift, ...box.sent] };
  await Storage.setItem(MOCK_GIFTS_KEY, JSON.stringify(next));
  return gift;
}

async function readMockGifts(): Promise<GiftBox> {
  const stored = await Storage.getItem(MOCK_GIFTS_KEY);
  if (stored == null) return { received: [], sent: [] };

  try {
    const parsed = JSON.parse(stored) as Partial<GiftBox>;
    return {
      received: Array.isArray(parsed.received) ? parsed.received : [],
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
    };
  } catch {
    return { received: [], sent: [] };
  }
}

async function deleteMockTodayGift(): Promise<void> {
  const box = await readMockGifts();
  const today = kstDateKey(new Date());
  const next: GiftBox = {
    received: box.received,
    sent: box.sent.filter(
      (gift) => kstDateKey(new Date(gift.createdAt)) !== today,
    ),
  };

  if (next.sent.length === box.sent.length) {
    throw new ApiError('오늘 보낸 선물이 없어요.');
  }

  await Storage.setItem(MOCK_GIFTS_KEY, JSON.stringify(next));
}
