import { ArrayBufferTarget, Muxer } from '../../vendor/mp4-muxer-5.2.2.js';

export const STORY_VIDEO_DURATION = 15;
export const STORY_VIDEO_FPS = 30;

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const MAX_QUEUED_FRAMES = 4;
const ENCODER_TIMEOUT_MS = 30000;
// WebKit may round a canvas VideoFrame timestamp by one microsecond when
// converting through seconds. Normalize only that rounding, never missing or
// reordered frames: https://bugs.webkit.org/show_bug.cgi?id=321880
const TIMESTAMP_ROUNDING_TOLERANCE_US = 1;
const DIMENSIONS_MESSAGE = 'Use um canvas de 1080 × 1920 (Stories), 1080 × 1350 (Feed) ou 1920 × 1080 (Indoor TV) pixels.';
const UNSUPPORTED_MESSAGE = 'Este navegador não oferece exportação MP4 em H.264. Abra o editor em uma versão atual do Chrome ou Edge com suporte a H.264.';

function abortError() {
  return new DOMException('Exportação do vídeo cancelada.', 'AbortError');
}

function checkAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function timestampForFrame(frameIndex) {
  return Math.round(frameIndex * 1_000_000 / STORY_VIDEO_FPS);
}

/**
 * Keep the 30 fps grid during motion and hold a single sample in each still interval.
 * Omitted ranges preserve frame-by-frame export; [] explicitly means a still video.
 */
export function getStoryVideoFramePlan({ duration = STORY_VIDEO_DURATION, motionRanges } = {}) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isSafeInteger(duration * STORY_VIDEO_FPS)) {
    throw new RangeError('A duração deve corresponder a um número inteiro positivo de quadros.');
  }
  const frameCount = duration * STORY_VIDEO_FPS;
  const ranges = motionRanges === undefined ? [{ start: 0, end: duration }] : motionRanges;
  if (!Array.isArray(ranges) || ranges.some((range) => !range
      || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end < range.start)) {
    throw new TypeError('Informe intervalos de movimento válidos em segundos.');
  }
  // Round outwards to preserve motion at boundaries between sampled frames.
  const intervals = ranges.filter(({ start, end }) => end > start && end > 0 && start < duration)
    .map(({ start, end }) => ({
      start: Math.max(0, Math.floor(start * STORY_VIDEO_FPS)),
      end: Math.min(frameCount, Math.ceil(end * STORY_VIDEO_FPS)),
    }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  const frames = [];
  const addFrame = (startFrame, endFrame) => {
    const timestamp = timestampForFrame(startFrame);
    frames.push({ startFrame, endFrame, timestamp, duration: timestampForFrame(endFrame) - timestamp });
  };
  let cursor = 0;
  for (const { start, end } of merged) {
    if (cursor < start) addFrame(cursor, start);
    for (let index = start; index < end; index += 1) addFrame(index, index + 1);
    cursor = end;
  }
  if (cursor < frameCount) addFrame(cursor, frameCount);
  return frames;
}

function supportsDimensions(width, height) {
  return (width === VIDEO_WIDTH && [VIDEO_HEIGHT, 1350].includes(height))
    || (width === 1920 && height === 1080);
}

function needsPixelFrameCapture() {
  const navigator = globalThis.navigator;
  // Include iPadOS desktop mode and every iOS browser/PWA, not only Safari.
  return /iPad|iPhone|iPod/.test(navigator?.userAgent || '')
    || (/Mac/.test(navigator?.platform || '') && navigator?.maxTouchPoints > 1);
}

function createFrameCapture(canvas, width, height) {
  if (!needsPixelFrameCapture()) {
    return (timing) => new VideoFrame(canvas, { ...timing, alpha: 'discard' });
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível capturar os pixels da arte para o vídeo.');
  // Avoid the iOS canvas -> native video surface path: its backing surface can
  // disagree with the logical canvas size and produce a top-left crop. Reading
  // pixels fixes the row stride and full frame extent independently of DPR/CSS.
  return (timing) => {
    const pixels = context.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
    return new VideoFrame(pixels.data, {
      ...timing,
      format: 'RGBX',
      codedWidth: width,
      codedHeight: height,
      displayWidth: width,
      displayHeight: height,
      layout: [{ offset: 0, stride: width * 4 }],
      colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true },
    });
  };
}

/** Checks the actual H.264 encoder at the artwork's output resolution. */
export async function getStoryVideoConfig({ signal, width = VIDEO_WIDTH, height = VIDEO_HEIGHT } = {}) {
  checkAborted(signal);
  if (!supportsDimensions(width, height)) {
    throw new Error(DIMENSIONS_MESSAGE);
  }
  if (globalThis.isSecureContext === false) {
    throw new Error('Para exportar MP4, abra o editor por HTTPS ou em localhost. O navegador bloqueia a codificação de vídeo em conexões HTTP comuns.');
  }
  if (typeof globalThis.VideoEncoder !== 'function'
      || typeof globalThis.VideoEncoder.isConfigSupported !== 'function'
      || typeof globalThis.VideoFrame !== 'function') {
    throw new Error(UNSUPPORTED_MESSAGE);
  }

  // Level 4 supports the 8,160 macroblocks required by 1080 × 1920 at 30 fps.
  // Baseline excludes B-frames, keeping decode and presentation order equal.
  // Quality mode must preserve every frame; realtime mode may drop frames.
  for (const codec of ['avc1.420028', 'avc1.42e028']) {
    const config = {
      codec,
      width,
      height,
      framerate: STORY_VIDEO_FPS,
      bitrate: 8_000_000,
      latencyMode: 'quality',
      hardwareAcceleration: 'no-preference',
      avc: { format: 'avc' },
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      checkAborted(signal);
      if (support.supported) return config;
    } catch (error) {
      checkAborted(signal);
      // An unavailable profile may reject instead of returning supported: false.
    }
  }
  throw new Error(UNSUPPORTED_MESSAGE);
}

/**
 * Encode explicitly timed frames as a real MP4/H.264 file, without audio.
 * renderFrame(seconds) paints the supplied Stories, Feed or Indoor TV canvas and may be async.
 * motionRanges lists every animated interval; other intervals are encoded once with an extended duration.
 * onProgress receives a fraction between 0 and 1; 1 means the MP4 is finalized.
 * The caller owns the canvas and any images/object URLs used while rendering.
 */
export async function exportStoryVideo({ canvas, renderFrame, onProgress = () => {}, signal, duration = STORY_VIDEO_DURATION, motionRanges }) {
  checkAborted(signal);
  const framePlan = getStoryVideoFramePlan({ duration, motionRanges });
  if (!canvas || !supportsDimensions(canvas.width, canvas.height)) {
    throw new Error(DIMENSIONS_MESSAGE);
  }
  if (typeof renderFrame !== 'function' || typeof onProgress !== 'function') {
    throw new TypeError('Informe as funções de renderização e progresso do vídeo.');
  }
  const { width, height } = canvas;
  const config = await getStoryVideoConfig({ signal, width, height });
  checkAborted(signal);
  const captureFrame = createFrameCapture(canvas, width, height);

  const target = new ArrayBufferTarget();
  let muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: STORY_VIDEO_FPS },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });
  let encoder;
  let failure;
  let encodedFrames = 0;
  let submittedFrames = 0;
  let rejectInterrupted;
  const interrupted = new Promise((resolve, reject) => { rejectInterrupted = reject; });
  // The encoder can fail between awaited operations; attach a handler immediately.
  interrupted.catch(() => {});

  const closeEncoder = () => {
    if (encoder && encoder.state !== 'closed') encoder.close();
  };
  const fail = (error) => {
    if (failure) return;
    failure = error;
    rejectInterrupted(error);
    closeEncoder();
  };
  const onAbort = () => fail(abortError());
  const checkState = () => {
    checkAborted(signal);
    if (failure) throw failure;
  };
  const waitForEncoder = async (operation) => {
    let timeout;
    try {
      await Promise.race([
        operation,
        interrupted,
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('O codificador de vídeo parou de responder. Tente exportar novamente.')), ENCODER_TIMEOUT_MS);
        }),
      ]);
      checkState();
    } finally {
      clearTimeout(timeout);
    }
  };
  const waitForQueue = async () => {
    if (encoder.encodeQueueSize < MAX_QUEUED_FRAMES) return;
    let onDequeue;
    try {
      await waitForEncoder(new Promise((resolve) => {
        onDequeue = () => {
          if (encoder.encodeQueueSize < MAX_QUEUED_FRAMES) resolve();
        };
        encoder.addEventListener('dequeue', onDequeue);
        onDequeue();
      }));
    } finally {
      encoder.removeEventListener('dequeue', onDequeue);
    }
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    checkState();
    encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        if (failure || !muxer) return;
        try {
          const expected = framePlan[encodedFrames];
          if (encodedFrames >= submittedFrames || !expected
              || Math.abs(chunk.timestamp - expected.timestamp) > TIMESTAMP_ROUNDING_TOLERANCE_US) {
            throw new Error('O codificador não preservou a sequência de quadros da arte.');
          }
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          // Use our duration even if an encoder omits chunk.duration. Rounding
          // adjacent timestamps separately prevents drift at 30 frames/second.
          muxer.addVideoChunkRaw(data, chunk.type, expected.timestamp, expected.duration, metadata);
          encodedFrames += 1;
        } catch (error) {
          fail(error);
        }
      },
      error: (error) => fail(new Error('Não foi possível codificar o MP4 neste dispositivo. Tente novamente no Chrome ou Edge com suporte a H.264.', { cause: error })),
    });
    encoder.configure(config);
    onProgress(0);

    let lastKeyFrame = -Infinity;
    for (const [sampleIndex, sample] of framePlan.entries()) {
      checkState();
      await Promise.race([Promise.resolve(renderFrame(sample.startFrame / STORY_VIDEO_FPS)), interrupted]);
      checkState();
      const frame = captureFrame({
        timestamp: sample.timestamp,
        duration: sample.duration,
      });
      try {
        // Still samples are independently seekable; keyframe spacing follows
        // elapsed video time, even when hundreds of duplicate frames are skipped.
        const keyFrame = sample.endFrame - sample.startFrame > 1
          || sample.startFrame - lastKeyFrame >= STORY_VIDEO_FPS * 2;
        if (keyFrame) lastKeyFrame = sample.startFrame;
        submittedFrames += 1;
        encoder.encode(frame, { keyFrame });
      } finally {
        frame.close();
      }
      await waitForQueue();
      // Periodically drain the encoder's internal buffers as well as its queue.
      if ((sampleIndex + 1) % STORY_VIDEO_FPS === 0 && sampleIndex + 1 < framePlan.length) {
        await waitForEncoder(encoder.flush());
      }
      onProgress((sampleIndex + 1) / framePlan.length * 0.98);
      if ((sampleIndex + 1) % MAX_QUEUED_FRAMES === 0) {
        // Yield to input/painting, so progress and cancellation stay responsive.
        await Promise.race([new Promise((resolve) => setTimeout(resolve, 0)), interrupted]);
      }
    }

    await waitForEncoder(encoder.flush());
    if (encodedFrames !== framePlan.length) {
      throw new Error('O navegador não codificou todos os quadros da arte. Tente exportar novamente.');
    }
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    onProgress(1);
    checkState();
    return blob;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    closeEncoder();
    muxer = null;
    target.buffer = null;
  }
}
