/**
 * 친구 연결.
 *
 * 사용자 둘을 잇는 건 서버에 기록이 남아야 해서 Edge Function 을 거쳐요.
 * (서버 코드는 supabase/functions/friends 참고)
 *
 * 식별자에 대해: 정식으로는 `appLogin()` 으로 받은 인가 코드를 서버가 mTLS 로
 * 교환해서 앱 전용 `userKey` 를 얻어야 해요. 그건 인증서 발급과 개인정보
 * 복호화까지 필요해서, 지금은 기기에 저장한 데모용 식별자를 씁니다.
 * 나중에 `getUserId()` 안쪽만 토스 로그인으로 갈아끼우면 돼요.
 */
import {
  Storage,
  getDeviceId,
  getTossShareLink,
  share,
} from '@apps-in-toss/framework';
import { ApiError, callFunction, isApiConfigured } from './config';

const USER_ID_KEY = 'for-you:userId';
const MOCK_INVITE_KEY = 'for-you:mockInvite';
const MOCK_FRIEND_KEY = 'for-you:mockFriend';
const REQUEST_TIMEOUT_MS = 10_000;

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 31자예요. 서버와 같은 알파벳을 씁니다. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface Invite {
  code: string;
  expiresAt: string;
}

export interface Friend {
  id: string;
  connectedAt: string;
}

let cachedUserId: string | null = null;

/** 기기에 저장된 데모용 사용자 식별자를 가져와요. 없으면 만들어서 저장합니다. */
export async function getUserId(): Promise<string> {
  if (cachedUserId != null) return cachedUserId;

  const stored = await Storage.getItem(USER_ID_KEY);
  if (stored != null && stored.length > 0) {
    cachedUserId = stored;
    return stored;
  }

  const created = createUserId();
  await Storage.setItem(USER_ID_KEY, created);
  cachedUserId = created;
  return created;
}

/** 내 초대 코드를 새로 발급받아요. 이전에 만든 코드는 서버에서 무효화돼요. */
export async function createInvite(): Promise<Invite> {
  if (!isApiConfigured()) return createMockInvite();

  const userId = await getUserId();
  return callFunction<Invite>(
    'friends',
    { action: 'create-invite', userId },
    REQUEST_TIMEOUT_MS,
  );
}

/** 친구가 준 코드로 연결해요. 코드는 대소문자 구분 없이 받습니다. */
export async function acceptInvite(code: string): Promise<Friend> {
  if (!isApiConfigured()) return acceptMockInvite(code);

  const userId = await getUserId();
  return callFunction<Friend>(
    'friends',
    { action: 'accept-invite', userId, code: normalizeCode(code) },
    REQUEST_TIMEOUT_MS,
  );
}

/** 연결된 친구를 가져와요. 아직 없으면 `null` 이에요. */
export async function getFriend(): Promise<Friend | null> {
  if (!isApiConfigured()) return readMockFriend();

  const userId = await getUserId();
  const result = await callFunction<{ friend: Friend | null }>(
    'friends',
    { action: 'get-friend', userId },
    REQUEST_TIMEOUT_MS,
  );
  return result.friend;
}

/**
 * 초대 코드를 공유 시트로 보내요.
 *
 * `intoss://` 딥링크는 정식 출시 후에만 열려서, 출시 전에는 링크를 눌러도
 * 앱이 열리지 않아요. 그래서 메시지에 코드도 함께 적어 보냅니다.
 */
export async function shareInvite(code: string): Promise<void> {
  const link = await getTossShareLink(`intoss://for-you?inviteCode=${code}`);
  await share({
    message: `오다 주웠어 에서 선물 주고받자!\n초대 코드: ${code}\n${link}`,
  });
}

/** 6자리 코드. 헷갈리는 글자(0/O, 1/I/L)는 빼고 만들어요. */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function createUserId(): string {
  // 기기 식별자를 쓸 수 있으면 그걸 쓰고, 못 쓰면 임의값으로 만들어요.
  try {
    const deviceId = getDeviceId();
    if (typeof deviceId === 'string' && deviceId.length > 0) {
      return `d_${deviceId}`;
    }
  } catch {
    // 샌드박스 등에서 기기 식별자를 못 읽는 경우가 있어요.
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `r_${Date.now().toString(36)}${random}`;
}

// ---------------------------------------------------------------------------
// 서버 설정 전 목업.
// config.ts 의 URL/키를 채우면 위의 실제 호출로 자동 전환돼요.
// 이 기기에만 저장되니까 다른 기기와는 연결되지 않아요.
// ---------------------------------------------------------------------------

async function createMockInvite(): Promise<Invite> {
  const code = generateLocalCode();
  await Storage.setItem(MOCK_INVITE_KEY, code);
  return {
    code,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function acceptMockInvite(rawCode: string): Promise<Friend> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    throw new ApiError('초대 코드는 6자리예요.');
  }

  if ((await Storage.getItem(MOCK_INVITE_KEY)) === code) {
    throw new ApiError('내 초대 코드예요. 친구에게 보내주세요.');
  }

  const friend: Friend = {
    id: `mock_${code}`,
    connectedAt: new Date().toISOString(),
  };
  await Storage.setItem(MOCK_FRIEND_KEY, JSON.stringify(friend));
  return friend;
}

async function readMockFriend(): Promise<Friend | null> {
  const stored = await Storage.getItem(MOCK_FRIEND_KEY);
  if (stored == null) return null;

  try {
    return JSON.parse(stored) as Friend;
  } catch {
    return null;
  }
}

function generateLocalCode(): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    code += CODE_ALPHABET.charAt(index);
  }
  return code;
}
