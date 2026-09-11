/**
 * 배경 제거(누끼).
 *
 * POST /api/extract  { image: base64 }  → { image: base64 PNG }
 *
 * 외부 API 키가 필요 없어요. U^2-Net 모델을 서버 안에서 직접 돌리기 때문에
 * 쿼터도 없고 사진이 제3자에게 나가지도 않아요. (자세한 건 lib/cutout.ts)
 */
import { json, rejectUnlessPost } from '../lib/cors.js';
import { CutoutError, removeBackground } from '../lib/cutout.js';

/** 1024px JPEG 한 장의 base64는 보통 1MB 안쪽이에요. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 콜드 스타트에 WASM 초기화가 들어가서 넉넉하게 잡았어요. */
export const config = { maxDuration: 60 };

export default {
  async fetch(request: Request) {
    const origin = request.headers.get('origin');
    const rejected = rejectUnlessPost(request, origin);
    if (rejected != null) return rejected;

    let base64Image: string;
    try {
      const body = (await request.json()) as { image?: unknown };
      if (typeof body.image !== 'string' || body.image.length === 0) {
        return json({ error: 'image 필드가 필요해요.' }, 400, origin);
      }
      // 앱이 순수 base64 를 보내지만, 데이터 URL 이 와도 처리되게 벗겨요.
      base64Image = body.image.replace(/^data:image\/\w+;base64,/, '');
    } catch {
      return json({ error: 'JSON 본문을 읽지 못했어요.' }, 400, origin);
    }

    if (base64Image.length > MAX_IMAGE_BYTES) {
      return json({ error: '이미지가 너무 커요.' }, 413, origin);
    }

    try {
      const png = await removeBackground(base64Image);
      return json({ image: png.toString('base64') }, 200, origin);
    } catch (error) {
      if (error instanceof CutoutError) {
        return json({ error: error.message }, 400, origin);
      }
      console.error('[extract] 배경 제거 실패', error);
      return json({ error: '배경 제거에 실패했어요.' }, 502, origin);
    }
  },
};
