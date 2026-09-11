/**
 * 서버 연동 설정.
 *
 * Apps in Toss 미니앱은 `.env` 방식이 문서화돼 있지 않아서 상수로 둡니다.
 * 아래 주소를 실제 값으로 바꾸기 전까지는 앱이 로컬 목업으로 동작해요.
 *
 * 엔드포인트는 인증 없이 열려 있고 `userId` 로만 구분해요. 기기에서 만든
 * 식별자라 추측하기는 어렵지만 진짜 인증은 아니에요. 실제 인증이 필요해지면
 * `appLogin()` + 서버 토큰 교환으로 `userKey` 를 받아 쓰면 됩니다.
 */

/** 서버(Vercel) 배포 주소. 코드는 `server/` 에 있어요. */
export const API_BASE_URL =
  'https://for-you-server-lavumeplz-7617s-projects.vercel.app/api';

/** 서버 주소가 실제 값으로 채워졌는지 확인해요. */
export function isApiConfigured() {
  return !API_BASE_URL.includes('YOUR-DEPLOYMENT');
}

/** Edge Function 을 호출하고 JSON 응답을 돌려줘요. */
export async function callFunction<T>(
  name: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const response = await withTimeout(
    fetch(`${API_BASE_URL}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    timeoutMs,
  );

  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(`서버 응답을 읽지 못했어요. (${response.status})`);
  }

  if (!response.ok) {
    const message =
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `서버가 ${response.status}로 응답했어요.`;
    throw new ApiError(message, response.status);
  }

  return parsed as T;
}

export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 이 프로젝트의 타입 설정에서는 React Native 의 fetch 가 AbortSignal 을 받지 않아서
 * 타임아웃을 race 로 처리해요. 시간이 지나면 요청 결과를 버리고 실패로 넘깁니다.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ApiError('서버 응답이 너무 늦어요.')),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
