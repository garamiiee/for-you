/**
 * 배경 제거(누끼).
 *
 * 미니앱은 커스텀 네이티브 모듈을 못 붙여서 iOS Vision 같은 온디바이스
 * 세그멘테이션을 쓸 수 없어요. 그래서 서버가 처리해요.
 *
 * 외부 API 대신 U^2-Net(u2netp, Apache-2.0) 을 ONNX Runtime 의 WASM 백엔드로
 * 직접 돌려요. 키도 쿼터도 없고 요청이 밖으로 나가지 않아서, 무료 티어가
 * 소진돼 갑자기 실패하는 일이 없어요.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import jpeg from 'jpeg-js';
import * as ort from 'onnxruntime-web';
import { PNG } from 'pngjs';

/** u2netp 의 입력 크기예요. */
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** 너무 큰 사진은 줄여서 처리해요. 마스크는 어차피 320px 해상도예요. */
const MAX_EDGE = 1280;

const MODEL_DIR = path.join(process.cwd(), 'models');
const WASM_DIR = path.join(
  process.cwd(),
  'node_modules',
  'onnxruntime-web',
  'dist',
);

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = `${WASM_DIR}${path.sep}`;
ort.env.logLevel = 'error';

let sessionPromise: Promise<ort.InferenceSession> | undefined;

/** 세션 생성은 비싸서 인스턴스가 살아 있는 동안 재사용해요. */
function getSession() {
  sessionPromise ??= readFile(path.join(MODEL_DIR, 'u2netp.onnx')).then(
    (model) =>
      ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
  );
  return sessionPromise;
}

export class CutoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CutoutError';
  }
}

interface Bitmap {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8Array;
}

/** base64 사진에서 배경을 지우고 투명 PNG 바이트를 돌려줘요. */
export async function removeBackground(base64Image: string) {
  const source = decode(Buffer.from(base64Image, 'base64'));
  const image = source.width * source.height > 0 ? shrink(source) : source;

  const input = preprocess(image);
  const session = await getSession();
  const outputName = session.outputNames[0];
  if (outputName == null) throw new CutoutError('모델 출력이 없어요.');

  const result = await session.run({
    [session.inputNames[0] as string]: new ort.Tensor(
      'float32',
      input,
      [1, 3, SIZE, SIZE],
    ),
  });

  const prediction = result[outputName]?.data as Float32Array | undefined;
  if (prediction == null) throw new CutoutError('추론 결과가 비어 있어요.');

  return encodePng(image, toAlpha(prediction, image.width, image.height));
}

function decode(bytes: Buffer): Bitmap {
  // PNG 시그니처
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  }

  // JPEG 시그니처
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const decoded = jpeg.decode(bytes, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  }

  throw new CutoutError('JPEG 또는 PNG 만 처리할 수 있어요.');
}

/** 긴 변이 MAX_EDGE 를 넘으면 비율을 유지하며 줄여요. */
function shrink(image: Bitmap): Bitmap {
  const longest = Math.max(image.width, image.height);
  if (longest <= MAX_EDGE) return image;

  const scale = MAX_EDGE / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const resized = resize(image.data, image.width, image.height, width, height, 4);

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(Math.min(255, Math.max(0, resized[i] as number)));
  }
  return { width, height, data };
}

/** rembg 와 같은 전처리: 최대값으로 나눈 뒤 mean/std 정규화, NCHW. */
function preprocess(image: Bitmap) {
  const rgb = new Float32Array(image.width * image.height * 3);
  for (let i = 0, p = 0; p < rgb.length; i += 4, p += 3) {
    rgb[p] = image.data[i] as number;
    rgb[p + 1] = image.data[i + 1] as number;
    rgb[p + 2] = image.data[i + 2] as number;
  }

  const small = resize(rgb, image.width, image.height, SIZE, SIZE, 3);

  let max = 0;
  for (const value of small) if (value > max) max = value;
  if (max === 0) max = 1;

  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * SIZE * SIZE + i] =
        ((small[i * 3 + c] as number) / max - (MEAN[c] as number)) /
        (STD[c] as number);
    }
  }
  return input;
}

/** 모델 출력을 0~255 알파로 바꾸고 원본 크기로 되돌려요. */
function toAlpha(prediction: Float32Array, width: number, height: number) {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const value of prediction) {
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  const span = hi - lo || 1;

  const mask = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = ((prediction[i] as number) - lo) / span;
  }

  const full = resize(mask, SIZE, SIZE, width, height, 1);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = Math.round(Math.min(1, Math.max(0, full[i] as number)) * 255);
  }
  return alpha;
}

function encodePng(image: Bitmap, alpha: Uint8Array) {
  const png = new PNG({ width: image.width, height: image.height });
  for (let i = 0; i < alpha.length; i++) {
    png.data[i * 4] = image.data[i * 4] as number;
    png.data[i * 4 + 1] = image.data[i * 4 + 1] as number;
    png.data[i * 4 + 2] = image.data[i * 4 + 2] as number;
    png.data[i * 4 + 3] = alpha[i] as number;
  }
  return PNG.sync.write(png);
}

/** 쌍선형 보간 리사이즈. 외부 의존성을 늘리지 않으려고 직접 씁니다. */
function resize(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  channels: number,
) {
  const out = new Float32Array(dw * dh * channels);

  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));

    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));

      for (let c = 0; c < channels; c++) {
        const p00 = src[(y0 * sw + x0) * channels + c] as number;
        const p01 = src[(y0 * sw + x1) * channels + c] as number;
        const p10 = src[(y1 * sw + x0) * channels + c] as number;
        const p11 = src[(y1 * sw + x1) * channels + c] as number;
        out[(y * dw + x) * channels + c] =
          p00 * (1 - fx) * (1 - fy) +
          p01 * fx * (1 - fy) +
          p10 * (1 - fx) * fy +
          p11 * fx * fy;
      }
    }
  }
  return out;
}
