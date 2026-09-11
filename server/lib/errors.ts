/** 사용자에게 그대로 보여줄 수 있는 오류예요. 그 외 오류는 500 으로 감춥니다. */
export class ClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
  }
}

/** POST 본문에서 userId 를 꺼내 검증해요. */
export function requireUserId(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : '';
  if (userId.length === 0 || userId.length > 128) {
    throw new ClientError('userId 가 필요해요.', 400);
  }
  return userId;
}
