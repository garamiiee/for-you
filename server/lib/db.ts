/**
 * Postgres 접속.
 *
 * Vercel Marketplace 로 Postgres(Neon) 를 붙이면 DATABASE_URL 이 프로젝트
 * 환경 변수로 들어와요. 이름이 다른 제공자도 있어서 몇 개를 순서대로 봅니다.
 */
import { Pool, type PoolClient } from 'pg';

let pool: Pool | undefined;

function connectionString() {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL;

  if (url == null || url.length === 0) {
    throw new Error('DATABASE_URL 이 설정되지 않았어요.');
  }
  return url;
}

function getPool() {
  // 서버리스라서 인스턴스마다 커넥션을 적게 잡아요.
  pool ??= new Pool({ connectionString: connectionString(), max: 1 });
  return pool;
}

export async function query<T>(sql: string, params: unknown[] = []) {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function maybeOne<T>(sql: string, params: unknown[] = []) {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 트랜잭션 안에서 실행해요. 예외가 나면 되돌립니다. */
export async function transaction<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** unique 위반인지 확인해요. */
export function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === '23505';
}
