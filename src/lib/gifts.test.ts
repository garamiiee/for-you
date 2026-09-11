import type { Gift } from './gifts';

const mockStorage = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
  },
}));

jest.mock('./friends', () => ({ getUserId: jest.fn(async () => 'alice') }));

jest.mock('./config', () => ({
  isApiConfigured: jest.fn(() => true),
  callFunction: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

function loadGifts() {
  jest.resetModules();
  return {
    gifts: require('./gifts') as typeof import('./gifts'),
    config: require('./config'),
  };
}

const TODAY = new Date().toISOString();
const YESTERDAY = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
const CUTOUT = 'data:image/png;base64,CUTOUT';

const gift = (over: Partial<Gift> = {}): Gift => ({
  id: 'g1',
  imageUrl: 'https://cdn/leaf.png',
  message: '낙엽',
  createdAt: TODAY,
  ...over,
});

beforeEach(() => {
  mockStorage.clear();
  jest.clearAllMocks();
});

describe('hasSentToday', () => {
  it('한국 시간 기준으로 오늘 보낸 게 있는지 본다', () => {
    const { gifts } = loadGifts();
    expect(gifts.hasSentToday([])).toBe(false);
    expect(gifts.hasSentToday([gift()])).toBe(true);
    expect(gifts.hasSentToday([gift({ createdAt: YESTERDAY })])).toBe(false);
  });
});

describe('서버가 연결된 경우', () => {
  it('데이터 URL 프리픽스를 벗겨서 보낸다', async () => {
    const { gifts, config } = loadGifts();
    config.callFunction.mockResolvedValue(gift());

    await gifts.sendGift(CUTOUT, '낙엽 주웠어');

    expect(config.callFunction).toHaveBeenCalledWith(
      'gifts',
      {
        action: 'send-gift',
        userId: 'alice',
        image: 'CUTOUT',
        message: '낙엽 주웠어',
      },
      expect.any(Number),
    );
  });

  it('목록과 취소도 올바른 본문으로 호출된다', async () => {
    const { gifts, config } = loadGifts();

    config.callFunction.mockResolvedValue({ received: [], sent: [] });
    await gifts.listGifts();
    expect(config.callFunction).toHaveBeenLastCalledWith(
      'gifts',
      { action: 'list-gifts', userId: 'alice' },
      expect.any(Number),
    );

    config.callFunction.mockResolvedValue({ deletedId: 'g1' });
    await gifts.deleteTodayGift();
    expect(config.callFunction).toHaveBeenLastCalledWith(
      'gifts',
      { action: 'delete-today-gift', userId: 'alice' },
      expect.any(Number),
    );
  });
});

describe('서버 설정 전 목업', () => {
  function loadMockMode() {
    const loaded = loadGifts();
    loaded.config.isApiConfigured.mockReturnValue(false);
    return loaded;
  }

  it('보낸 선물이 기기에 쌓이고 다시 읽힌다', async () => {
    const { gifts, config } = loadMockMode();

    const sent = await gifts.sendGift(CUTOUT, '  낙엽 주웠어  ');
    expect(sent.message).toBe('낙엽 주웠어');
    expect(sent.imageUrl).toBe(CUTOUT);
    expect(config.callFunction).not.toHaveBeenCalled();

    // 앱을 다시 켠 상황
    const reopened = loadMockMode();
    const box = await reopened.gifts.listGifts();
    expect(box.sent).toHaveLength(1);
    expect(box.received).toHaveLength(0);
  });

  it('메시지가 비어 있으면 거절한다', async () => {
    const { gifts } = loadMockMode();
    await expect(gifts.sendGift(CUTOUT, '   ')).rejects.toThrow(
      '함께 보낼 메시지를 적어주세요.',
    );
  });

  it('하루 두 번은 막는다', async () => {
    const { gifts } = loadMockMode();

    await gifts.sendGift(CUTOUT, '하나');
    await expect(gifts.sendGift(CUTOUT, '둘')).rejects.toThrow(
      '오늘은 이미 선물을 보냈어요.',
    );
  });

  it('취소하면 오늘 다시 보낼 수 있다', async () => {
    const { gifts } = loadMockMode();

    await gifts.sendGift(CUTOUT, '하나');
    await gifts.deleteTodayGift();

    expect((await gifts.listGifts()).sent).toHaveLength(0);
    await expect(gifts.sendGift(CUTOUT, '둘')).resolves.toBeTruthy();
  });

  it('취소할 게 없으면 거절한다', async () => {
    const { gifts } = loadMockMode();
    await expect(gifts.deleteTodayGift()).rejects.toThrow(
      '오늘 보낸 선물이 없어요.',
    );
  });

  it('어제 보낸 선물은 취소 대상이 아니다', async () => {
    mockStorage.set(
      'for-you:mockGifts',
      JSON.stringify({ received: [], sent: [gift({ createdAt: YESTERDAY })] }),
    );
    const { gifts } = loadMockMode();

    await expect(gifts.deleteTodayGift()).rejects.toThrow(
      '오늘 보낸 선물이 없어요.',
    );
    expect((await gifts.listGifts()).sent).toHaveLength(1);
  });

  it('저장된 값이 깨져 있으면 빈 선물함으로 본다', async () => {
    mockStorage.set('for-you:mockGifts', '{깨진 JSON');
    const { gifts } = loadMockMode();
    expect(await gifts.listGifts()).toEqual({ received: [], sent: [] });
  });
});
