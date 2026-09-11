/**
 * 미니앱이 서버를 호출할 때 쓰는 Origin.
 *
 * 허용 Origin 이 SDK 버전마다 달라요.
 * - SDK 1.x ~ 2.x : <appName>.apps.tossmini.com / <appName>.private-apps.tossmini.com
 * - SDK 3.x       : <appName>.web.tossmini.com  / <appName>.private-web.tossmini.com
 *
 * 이 프로젝트는 @apps-in-toss/framework 2.x 라서 apps 쪽이지만, SDK 를 올리면
 * 바뀌고 3.x 도 시점에 따라 apps 로 돌아간다고 돼 있어서 네 개를 모두 허용해요.
 */
const APP_NAME = 'for-you';

export const ALLOWED_ORIGINS = [
  `https://${APP_NAME}.apps.tossmini.com`,
  `https://${APP_NAME}.private-apps.tossmini.com`,
  `https://${APP_NAME}.web.tossmini.com`,
  `https://${APP_NAME}.private-web.tossmini.com`,
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin != null && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed as string,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export function preflight(origin: string | null) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/** POST 만 받는 함수들의 공통 앞단이에요. 통과하면 `null` 을 돌려줘요. */
export function rejectUnlessPost(request: Request, origin: string | null) {
  if (request.method === 'OPTIONS') return preflight(origin);
  if (request.method !== 'POST') {
    return json({ error: 'POST만 지원해요.' }, 405, origin);
  }
  return null;
}
