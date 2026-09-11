/**
 * 배경 제거(누끼) 서버 연동.
 *
 * 미니앱은 커스텀 네이티브 모듈을 붙일 수 없어서 iOS Vision 같은 온디바이스
 * 세그멘테이션을 쓸 수 없어요. 그래서 사진을 우리 서버로 보내고 투명 PNG를
 * 돌려받는 구조로 갑니다. (서버 코드는 supabase/functions/extract 참고)
 */
import { callFunction } from './config';

/** remove.bg 호출이 몇 초 걸릴 수 있어서 넉넉하게 잡았어요. */
const EXTRACT_TIMEOUT_MS = 30_000;

/**
 * base64 사진(프리픽스 없는 순수 base64)을 보내고 누끼 딴 PNG 데이터 URL을 받아요.
 * `fetchAlbumPhotos({ base64: true })`가 주는 `photo.dataUri`를 그대로 넣으면 됩니다.
 */
export async function extractObject(base64Image: string): Promise<string> {
  const result = await callFunction<{ image?: string }>(
    'extract',
    { image: base64Image },
    EXTRACT_TIMEOUT_MS,
  );

  if (typeof result.image !== 'string' || result.image.length === 0) {
    throw new Error('추출 결과 이미지가 비어 있어요.');
  }

  return `data:image/png;base64,${result.image}`;
}
