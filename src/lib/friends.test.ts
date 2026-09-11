import type { Friend } from './friends';

const mockStorage = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
  },
  getDeviceId: jest.fn(() => 'DEVICE-1'),
  getTossShareLink: jest.fn(async () => 'https://toss.im/share/abc'),
  share: jest.fn(async () => undefined),
}));

jest.mock('./config', () => ({
  isApiConfigured: jest.fn(() => true),
  callFunction: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 모듈 안에 사용자 id 캐시가 있어서 테스트마다 새로 불러와요. */
function loadFriends() {
  jest.resetModules();
  return {
    friends: require('./friends') as typeof import('./friends'),
    framework: require('@apps-in-toss/framework'),
    config: require('./config'),
  };
}

beforeEach(() => {
  mockStorage.clear();
  jest.clearAllMocks();
});

describe('사용자 식별자', () => {
  it('기기 식별자로 만들어 저장하고, 다음 호출부터는 저장된 값을 쓴다', async () => {
    const { friends, framework } = loadFriends();

    const first = await friends.getUserId();
    expect(first).toBe('d_DEVICE-1');
    expect(mockStorage.get('for-you:userId')).toBe('d_DEVICE-1');

    framework.getDeviceId.mockImplementation(() => 'DEVICE-2');
    expect(await friends.getUserId()).toBe('d_DEVICE-1');
  });

  it('앱을 다시 켜도(캐시가 비어도) 저장된 값을 읽는다', async () => {
    mockStorage.set('for-you:userId', 'd_SAVED');
    const { friends } = loadFriends();
    expect(await friends.getUserId()).toBe('d_SAVED');
  });

  it('기기 식별자를 못 읽으면 임의값으로 만든다', async () => {
    const { friends, framework } = loadFriends();
    framework.getDeviceId.mockImplementation(() => {
      throw new Error('sandbox');
    });

    const id = await friends.getUserId();
    expect(id.startsWith('r_')).toBe(true);
    expect(id.length).toBeGreaterThan(5);
  });
});

describe('서버가 연결된 경우', () => {
  it('초대 발급 / 수락 / 조회가 올바른 본문으로 호출된다', async () => {
    const { friends, config } = loadFriends();

    config.callFunction.mockResolvedValue({ code: 'AB23CD', expiresAt: 'x' });
    await friends.createInvite();
    expect(config.callFunction).toHaveBeenLastCalledWith(
      'friends',
      { action: 'create-invite', userId: 'd_DEVICE-1' },
      expect.any(Number),
    );

    config.callFunction.mockResolvedValue({ id: 'alice', connectedAt: 'x' });
    await friends.acceptInvite(' ab-23cd ');
    expect(config.callFunction).toHaveBeenLastCalledWith(
      'friends',
      { action: 'accept-invite', userId: 'd_DEVICE-1', code: 'AB23CD' },
      expect.any(Number),
    );

    config.callFunction.mockResolvedValue({ friend: null });
    expect(await friends.getFriend()).toBeNull();
    expect(config.callFunction).toHaveBeenLastCalledWith(
      'friends',
      { action: 'get-friend', userId: 'd_DEVICE-1' },
      expect.any(Number),
    );
  });

  it('공유 메시지에 코드와 링크가 함께 들어간다', async () => {
    const { friends, framework } = loadFriends();

    await friends.shareInvite('AB23CD');

    expect(framework.getTossShareLink).toHaveBeenCalledWith(
      'intoss://for-you?inviteCode=AB23CD',
    );
    const [{ message }] = framework.share.mock.calls[0];
    expect(message).toContain('AB23CD');
    expect(message).toContain('https://toss.im/share/abc');
  });
});

describe('서버 설정 전 목업', () => {
  function loadMockMode() {
    const loaded = loadFriends();
    loaded.config.isApiConfigured.mockReturnValue(false);
    return loaded;
  }

  it('초대 코드를 로컬에서 6자리로 만든다', async () => {
    const { friends, config } = loadMockMode();

    const invite = await friends.createInvite();
    expect(invite.code).toHaveLength(6);
    expect([...invite.code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(config.callFunction).not.toHaveBeenCalled();
  });

  it('내가 만든 코드는 수락할 수 없다', async () => {
    const { friends } = loadMockMode();

    const invite = await friends.createInvite();
    await expect(friends.acceptInvite(invite.code)).rejects.toThrow(
      '내 초대 코드예요. 친구에게 보내주세요.',
    );
    expect(await friends.getFriend()).toBeNull();
  });

  it('6자리가 아니면 거절한다', async () => {
    const { friends } = loadMockMode();
    await expect(friends.acceptInvite('ABC')).rejects.toThrow(
      '초대 코드는 6자리예요.',
    );
  });

  it('친구 코드를 넣으면 기기에 저장하고 다시 읽을 수 있다', async () => {
    const { friends } = loadMockMode();

    const friend: Friend = await friends.acceptInvite('zz34xy');
    expect(friend.id).toBe('mock_ZZ34XY');

    // 앱을 다시 켠 상황
    const reopened = loadMockMode();
    expect(await reopened.friends.getFriend()).toEqual(friend);
  });

  it('저장된 값이 깨져 있으면 친구 없음으로 본다', async () => {
    mockStorage.set('for-you:mockFriend', '{깨진 JSON');
    const { friends } = loadMockMode();
    expect(await friends.getFriend()).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('공백과 기호를 제거하고 대문자로 만든다', () => {
    const { friends } = loadFriends();
    expect(friends.normalizeCode(' ab-23 cd ')).toBe('AB23CD');
    expect(friends.normalizeCode('ab23cd')).toBe('AB23CD');
    expect(friends.normalizeCode('')).toBe('');
  });
});
