import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type React from 'react';
import { Alert } from 'react-native';
import { Route } from './index';

let mockParams: { inviteCode?: string } = {};

jest.mock('@granite-js/react-native', () => ({
  createRoute: (_path: string, options: object) => ({
    ...options,
    useParams: () => mockParams,
  }),
}));

jest.mock('@apps-in-toss/framework', () => ({
  fetchAlbumPhotos: jest.fn(),
  openCamera: jest.fn(),
  FetchAlbumPhotosPermissionError: class extends Error {},
  OpenCameraPermissionError: class extends Error {},
}));

jest.mock('../lib/api', () => ({ extractObject: jest.fn() }));

jest.mock('../lib/config', () => ({ isApiConfigured: () => true }));

jest.mock('../lib/friends', () => ({
  createInvite: jest.fn(),
  acceptInvite: jest.fn(),
  getFriend: jest.fn(),
  shareInvite: jest.fn(),
  normalizeCode: (code: string) =>
    code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
}));

jest.mock('../lib/gifts', () => ({
  sendGift: jest.fn(),
  listGifts: jest.fn(),
  deleteTodayGift: jest.fn(),
  // 날짜 판정은 목이 아니라 실제 구현을 그대로 씁니다.
  hasSentToday: (sent: { createdAt: string }[]) => {
    const key = (d: Date) =>
      new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const today = key(new Date());
    return sent.some((g) => key(new Date(g.createdAt)) === today);
  },
}));

const { fetchAlbumPhotos, openCamera } = require('@apps-in-toss/framework');
const { extractObject } = require('../lib/api');
const {
  createInvite,
  acceptInvite,
  getFriend,
  shareInvite,
} = require('../lib/friends');
const { sendGift, listGifts, deleteTodayGift } = require('../lib/gifts');

const EMPTY_BOX = { received: [], sent: [] };

const ForYouPage = (Route as unknown as { component: React.ComponentType })
  .component;

const CUTOUT = 'data:image/png;base64,CUTOUT';

/** 상태 업데이트가 promise 안에서 일어나서 press 는 act 로 감싸야 해요. */
async function press(text: string) {
  const element = await screen.findByText(text);
  await act(async () => {
    fireEvent.press(element);
  });
}

async function typeCode(text: string) {
  const input = await screen.findByPlaceholderText('6자리 코드');
  await act(async () => {
    fireEvent.changeText(input, text);
  });
}

/** 홈 → 사진 시트 → 앨범에서 선택하기 (앨범 열기 전 350ms 대기가 있어요) */
async function pickFromAlbum() {
  await press('나도 선물하러 가기');
  await press('앨범에서 선택하기');
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

describe('선물 추출 흐름', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = {};
    jest.useFakeTimers();
    extractObject.mockReset();
    fetchAlbumPhotos.mockReset();
    openCamera.mockReset();
    createInvite.mockReset();
    acceptInvite.mockReset();
    getFriend.mockReset();
    shareInvite.mockReset();
    fetchAlbumPhotos.mockResolvedValue([{ id: '1', dataUri: 'RAWBASE64' }]);
    getFriend.mockResolvedValue(null);
    shareInvite.mockResolvedValue(undefined);
    sendGift.mockReset();
    listGifts.mockReset();
    deleteTodayGift.mockReset();
    listGifts.mockResolvedValue(EMPTY_BOX);
    sendGift.mockResolvedValue({ id: 'g1' });
    deleteTodayGift.mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('앨범 사진을 서버로 보내고 누끼 이미지를 확인 화면에 띄운다', async () => {
    // 요청이 떠 있는 동안의 화면을 확인하려고 응답 시점을 직접 잡아요.
    let finishExtraction: ((uri: string) => void) | undefined;
    extractObject.mockReturnValue(
      new Promise<string>((resolve) => {
        finishExtraction = resolve;
      }),
    );
    render(<ForYouPage />);

    await pickFromAlbum();

    // 데이터 URL 프리픽스를 붙이지 않은 순수 base64 가 서버로 가야 해요.
    await waitFor(() =>
      expect(extractObject).toHaveBeenCalledWith('RAWBASE64'),
    );

    // 응답을 기다리는 동안은 추출 중 화면이에요.
    expect(screen.getByText('오브젝트를 추출 중이에요 ...')).toBeTruthy();

    await act(async () => {
      finishExtraction?.(CUTOUT);
    });

    expect(screen.getByText('보내고 싶은 선물이 맞나요?')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(CUTOUT);
  });

  it('추출이 실패하면 실패 화면으로 넘어간다', async () => {
    extractObject.mockRejectedValue(new Error('502'));
    render(<ForYouPage />);

    await pickFromAlbum();

    await waitFor(() => expect(screen.getByText('다시 시도')).toBeTruthy());
    expect(screen.queryByText('보내고 싶은 선물이 맞나요?')).toBeNull();
  });

  it('다시 시도를 누르면 앨범을 다시 열지 않고 같은 사진으로 재요청한다', async () => {
    extractObject.mockRejectedValueOnce(new Error('502'));
    extractObject.mockResolvedValueOnce(CUTOUT);
    render(<ForYouPage />);

    await pickFromAlbum();
    await waitFor(() => expect(screen.getByText('다시 시도')).toBeTruthy());

    await press('다시 시도');

    await waitFor(() => expect(extractObject).toHaveBeenCalledTimes(2));
    expect(extractObject).toHaveBeenNthCalledWith(2, 'RAWBASE64');
    expect(screen.getByText('보내고 싶은 선물이 맞나요?')).toBeTruthy();
    expect(fetchAlbumPhotos).toHaveBeenCalledTimes(1);
  });

  it('카메라로 찍은 사진도 같은 추출 흐름을 탄다', async () => {
    openCamera.mockResolvedValue({ id: 'c1', dataUri: 'CAMBASE64' });
    extractObject.mockResolvedValue(CUTOUT);
    render(<ForYouPage />);

    await press('나도 선물하러 가기');
    await press('사진 촬영하기');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(openCamera).toHaveBeenCalledWith({ base64: true, maxWidth: 1024 });
    await waitFor(() =>
      expect(extractObject).toHaveBeenCalledWith('CAMBASE64'),
    );
    expect(screen.getByText('보내고 싶은 선물이 맞나요?')).toBeTruthy();
    // 앨범은 열리지 않아야 해요.
    expect(fetchAlbumPhotos).not.toHaveBeenCalled();
  });

  it('카메라를 취소하면 홈에 그대로 머문다', async () => {
    openCamera.mockResolvedValue(undefined);
    render(<ForYouPage />);

    await press('나도 선물하러 가기');
    await press('사진 촬영하기');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(extractObject).not.toHaveBeenCalled();
    expect(screen.getByText('나도 선물하러 가기')).toBeTruthy();
  });

  it('카메라 권한이 없으면 안내하고 추출하지 않는다', async () => {
    const { OpenCameraPermissionError } = require('@apps-in-toss/framework');
    openCamera.mockRejectedValue(new OpenCameraPermissionError());
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    render(<ForYouPage />);

    await press('나도 선물하러 가기');
    await press('사진 촬영하기');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      '카메라 접근이 필요해요',
      '선물할 물건을 찍으려면 카메라 접근을 허용해주세요.',
    );
    expect(extractObject).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('친구 연결 흐름', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParams = {};
    jest.useFakeTimers();
    createInvite.mockReset();
    acceptInvite.mockReset();
    getFriend.mockReset();
    shareInvite.mockReset();
    getFriend.mockResolvedValue(null);
    shareInvite.mockResolvedValue(undefined);
    sendGift.mockReset();
    listGifts.mockReset();
    deleteTodayGift.mockReset();
    listGifts.mockResolvedValue(EMPTY_BOX);
    sendGift.mockResolvedValue({ id: 'g1' });
    deleteTodayGift.mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('친구가 없으면 홈 버튼이 초대 문구를 보여준다', async () => {
    render(<ForYouPage />);
    expect(await screen.findByText('선물할 친구를 초대할래요 〉')).toBeTruthy();
  });

  it('친구가 있으면 홈 버튼이 변경 문구를 보여준다', async () => {
    getFriend.mockResolvedValue({ id: 'bob', connectedAt: '2026-09-11' });
    render(<ForYouPage />);

    await waitFor(() =>
      expect(screen.getByText('선물할 친구를 변경하고 싶어요 〉')).toBeTruthy(),
    );
  });

  it('초대 코드를 만들면 코드와 공유 버튼이 보인다', async () => {
    createInvite.mockResolvedValue({ code: 'AB23CD', expiresAt: '2026-09-12' });
    render(<ForYouPage />);

    await press('선물할 친구를 초대할래요 〉');
    await press('초대 코드 만들기');

    await waitFor(() => expect(screen.getByText('AB23CD')).toBeTruthy());

    await press('공유하기');
    expect(shareInvite).toHaveBeenCalledWith('AB23CD');
  });

  it('코드 입력이 6자리가 되기 전에는 연결 버튼이 눌리지 않는다', async () => {
    render(<ForYouPage />);
    await press('선물할 친구를 초대할래요 〉');

    await typeCode('AB23');
    await press('연결하기');
    expect(acceptInvite).not.toHaveBeenCalled();

    await typeCode('AB23CD');
    await press('연결하기');
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith('AB23CD'));
  });

  it('소문자와 공백을 넣어도 대문자 6자리로 정리된다', async () => {
    acceptInvite.mockResolvedValue({ id: 'alice', connectedAt: '2026-09-11' });
    render(<ForYouPage />);
    await press('선물할 친구를 초대할래요 〉');

    await typeCode(' ab-23cd ');
    expect(screen.getByPlaceholderText('6자리 코드').props.value).toBe(
      'AB23CD',
    );
  });

  it('연결에 성공하면 홈으로 돌아가고 친구 상태가 반영된다', async () => {
    acceptInvite.mockResolvedValue({ id: 'alice', connectedAt: '2026-09-11' });
    render(<ForYouPage />);

    await press('선물할 친구를 초대할래요 〉');
    await typeCode('AB23CD');
    await press('연결하기');

    await waitFor(() =>
      expect(screen.getByText('선물할 친구를 변경하고 싶어요 〉')).toBeTruthy(),
    );
  });

  it('서버가 준 실패 메시지를 그대로 보여준다', async () => {
    acceptInvite.mockRejectedValue(new Error('이미 사용된 코드예요.'));
    render(<ForYouPage />);

    await press('선물할 친구를 초대할래요 〉');
    await typeCode('AB23CD');
    await press('연결하기');

    await waitFor(() =>
      expect(screen.getByText('이미 사용된 코드예요.')).toBeTruthy(),
    );
    // 실패했으니 친구 화면에 머물러야 해요.
    expect(screen.getByText('친구와 선물함을 연결해요')).toBeTruthy();
  });

  it('이미 연결된 상태로 친구 화면에 들어가면 연결 완료 화면이 보인다', async () => {
    getFriend.mockResolvedValue({ id: 'bob', connectedAt: '2026-09-11' });
    render(<ForYouPage />);

    await press('선물할 친구를 변경하고 싶어요 〉');

    expect(screen.getByText('이미 친구와 연결됐어요')).toBeTruthy();
    expect(screen.queryByText('초대 코드 만들기')).toBeNull();
  });

  it('공유 링크로 들어오면 코드가 채워진 친구 화면이 바로 열린다', async () => {
    mockParams = { inviteCode: 'ab-23cd' };
    render(<ForYouPage />);

    expect(await screen.findByText('친구와 선물함을 연결해요')).toBeTruthy();
    expect(screen.getByPlaceholderText('6자리 코드').props.value).toBe(
      'AB23CD',
    );

    await press('연결하기');
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith('AB23CD'));
  });

  it('링크의 코드가 6자리가 아니면 홈에 그대로 머문다', async () => {
    mockParams = { inviteCode: 'ABC' };
    render(<ForYouPage />);

    expect(await screen.findByText('선물할 친구를 초대할래요 〉')).toBeTruthy();
    expect(screen.queryByText('친구와 선물함을 연결해요')).toBeNull();
  });
});

describe('선물 보내기 흐름', () => {
  let errorSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  const TODAY = new Date().toISOString();
  const gift = (
    over: Partial<{
      id: string;
      imageUrl: string;
      message: string;
      createdAt: string;
    }> = {},
  ) => ({
    id: 'g1',
    imageUrl: 'https://cdn/leaf.png',
    message: '낙엽 주웠어',
    createdAt: TODAY,
    ...over,
  });

  beforeEach(() => {
    mockParams = {};
    jest.useFakeTimers();
    extractObject.mockReset();
    fetchAlbumPhotos.mockReset();
    openCamera.mockReset();
    getFriend.mockReset();
    sendGift.mockReset();
    listGifts.mockReset();
    deleteTodayGift.mockReset();
    fetchAlbumPhotos.mockResolvedValue([{ id: '1', dataUri: 'RAWBASE64' }]);
    extractObject.mockResolvedValue(CUTOUT);
    getFriend.mockResolvedValue({ id: 'bob', connectedAt: TODAY });
    listGifts.mockResolvedValue(EMPTY_BOX);
    sendGift.mockResolvedValue(gift());
    deleteTodayGift.mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    errorSpy.mockRestore();
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  /** 홈 → 사진 선택 → 추출 → 메시지 입력 → 검토 화면까지 */
  async function reachReviewScreen() {
    await pickFromAlbum();
    await waitFor(() => expect(screen.getByText('맞아요!')).toBeTruthy());
    await press('맞아요!');
    await typeMessage('낙엽 주웠어');
    await press('입력 완료');
    await waitFor(() =>
      expect(screen.getByText('이대로 보낼래요')).toBeTruthy(),
    );
  }

  async function typeMessage(text: string) {
    const input = await screen.findByPlaceholderText(
      '선물과 함께 보낼 말을 적어주세요',
    );
    await act(async () => {
      fireEvent.changeText(input, text);
    });
  }

  it('받은 선물 개수를 서버 목록에서 가져온다', async () => {
    listGifts.mockResolvedValue({
      received: [gift({ id: 'r1' }), gift({ id: 'r2' })],
      sent: [],
    });
    render(<ForYouPage />);

    await waitFor(() =>
      expect(
        screen.getByText('친구에게 받은 선물이 벌써 2개나 쌓였어요!'),
      ).toBeTruthy(),
    );
  });

  it('선물이 없으면 시작 안내를 보여준다', async () => {
    render(<ForYouPage />);
    expect(
      await screen.findByText(
        '친구에게 선물을 보내고\n우리의 선물함을 시작해보세요',
      ),
    ).toBeTruthy();
  });

  it('오늘 보낸 선물이 있으면 보내기 버튼이 잠긴다', async () => {
    listGifts.mockResolvedValue({ received: [], sent: [gift()] });
    render(<ForYouPage />);

    await waitFor(() =>
      expect(screen.getByText('오늘은 이미 선물을 보냈어요')).toBeTruthy(),
    );
  });

  it('어제 보낸 선물만 있으면 오늘 다시 보낼 수 있다', async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    listGifts.mockResolvedValue({
      received: [],
      sent: [gift({ createdAt: yesterday })],
    });
    render(<ForYouPage />);

    await waitFor(() =>
      expect(screen.getByText('나도 선물하러 가기')).toBeTruthy(),
    );
  });

  it('누끼 이미지와 메시지를 서버로 보내고 목록을 다시 불러온다', async () => {
    render(<ForYouPage />);
    await reachReviewScreen();

    await press('이대로 보낼래요');

    await waitFor(() =>
      expect(sendGift).toHaveBeenCalledWith(CUTOUT, '낙엽 주웠어'),
    );
    expect(listGifts).toHaveBeenCalledTimes(2); // 최초 로드 + 전송 후 갱신
    expect(screen.getByText('오늘 선물도 잘 두고 왔어요.')).toBeTruthy();
  });

  it('전송이 끝나면 함께 모은 선물 탭으로 돌아간다', async () => {
    render(<ForYouPage />);
    await reachReviewScreen();
    await press('이대로 보낼래요');

    await waitFor(() =>
      expect(screen.getByText('오늘 선물도 잘 두고 왔어요.')).toBeTruthy(),
    );

    await act(async () => {
      jest.advanceTimersByTime(1600);
    });

    expect(screen.getByText('나도 선물하러 가기')).toBeTruthy();
  });

  it('전송이 실패하면 검토 화면으로 돌아가고 이유를 알려준다', async () => {
    sendGift.mockRejectedValue(new Error('오늘은 이미 선물을 보냈어요.'));
    render(<ForYouPage />);
    await reachReviewScreen();

    await press('이대로 보낼래요');

    await waitFor(() =>
      expect(screen.getByText('이대로 보낼래요')).toBeTruthy(),
    );
    expect(alertSpy).toHaveBeenCalledWith(
      '선물을 보내지 못했어요',
      '오늘은 이미 선물을 보냈어요.',
    );
  });

  it('오늘 선물을 취소하면 서버에 알리고 목록을 갱신한다', async () => {
    listGifts.mockResolvedValue({ received: [], sent: [gift()] });
    render(<ForYouPage />);

    await waitFor(() =>
      expect(screen.getByText('오늘은 이미 선물을 보냈어요')).toBeTruthy(),
    );

    // 이미 보낸 상태에서도 시트가 열려야 지우기로 들어갈 수 있어요.
    await press('오늘은 이미 선물을 보냈어요');
    await press('오늘 보낸 선물 지우기');

    await waitFor(() => expect(deleteTodayGift).toHaveBeenCalledTimes(1));
    expect(listGifts).toHaveBeenCalledTimes(2); // 최초 로드 + 취소 후 갱신
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('취소가 실패하면 이유를 알려준다', async () => {
    listGifts.mockResolvedValue({ received: [], sent: [gift()] });
    deleteTodayGift.mockRejectedValue(new Error('오늘 보낸 선물이 없어요.'));
    render(<ForYouPage />);

    await waitFor(() =>
      expect(screen.getByText('오늘은 이미 선물을 보냈어요')).toBeTruthy(),
    );

    await press('오늘은 이미 선물을 보냈어요');
    await press('오늘 보낸 선물 지우기');

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        '선물을 취소하지 못했어요',
        '오늘 보낸 선물이 없어요.',
      ),
    );
  });
});
