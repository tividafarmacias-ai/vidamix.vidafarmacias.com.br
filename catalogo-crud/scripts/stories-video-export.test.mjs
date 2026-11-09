import assert from 'node:assert/strict';
import test from 'node:test';
import { exportStoryVideo, getStoryVideoConfig, getStoryVideoFramePlan } from '../public/js/features/stories/video-export.js';
import { getStoryVideoDuration, getStoryVideoMotionRanges } from '../public/js/features/stories/video-animation.js';
import { getIndoorDuration, getIndoorMotionRanges } from '../public/js/features/indoor/renderer.js';

// Exercise the real exporter and MP4 muxer; only browser encoding is simulated.
// These tiny AVC samples test the container, not decoder playback or canvas pixels.
const AVC_DESCRIPTION = Uint8Array.from([
  1, 66, 0, 40, 255, 225, 0, 9, 103, 66, 0, 40, 149, 168, 20, 1, 110,
  1, 0, 4, 104, 206, 60, 128,
]);

function installEncoder(t, behavior = {}) {
  const recordings = { frames: [], encoders: [], supportChecks: [], queueMaximum: 0, liveFrames: 0 };
  const replacements = {
    navigator: behavior.navigator || { userAgent: 'Chrome Android', platform: 'Linux', maxTouchPoints: 5 },
    isSecureContext: true,
    VideoFrame: class {
      constructor(canvas, options) {
        this.canvas = canvas;
        Object.assign(this, options);
        this.closeCount = 0;
        recordings.frames.push(this);
        recordings.liveFrames += 1;
      }
      close() {
        this.closeCount += 1;
        recordings.liveFrames -= 1;
      }
    },
    VideoEncoder: class extends EventTarget {
      static async isConfigSupported(config) {
        recordings.supportChecks.push(config);
        return { supported: behavior.supported?.(config) ?? true, config };
      }
      constructor(callbacks) {
        super();
        this.callbacks = callbacks;
        this.state = 'unconfigured';
        this.encodeQueueSize = 0;
        this.queue = [];
        this.inputs = [];
        this.flushes = [];
        this.closeCount = 0;
        this.flushCount = 0;
        recordings.encoders.push(this);
      }
      configure(config) {
        this.config = config;
        this.state = 'configured';
      }
      encode(frame, options) {
        assert.equal(frame.closeCount, 0, 'Frames must be open while encoding');
        const index = this.inputs.length;
        if (behavior.throwEncodeAt === index) throw new Error('Mock encode failure');
        const input = { index, timestamp: frame.timestamp, duration: frame.duration, ...options };
        this.inputs.push(input);
        this.queue.push(input);
        this.encodeQueueSize = this.queue.length;
        recordings.queueMaximum = Math.max(recordings.queueMaximum, this.encodeQueueSize);
        this.scheduleDrain();
      }
      scheduleDrain() {
        if (this.scheduled || behavior.holdQueue || this.state === 'closed') return;
        this.scheduled = setImmediate(() => {
          this.scheduled = undefined;
          if (this.state === 'closed') return;
          const input = this.queue.shift();
          this.encodeQueueSize = this.queue.length;
          if (behavior.failAt === input.index) {
            this.callbacks.error(new Error('Mock codec failure'));
            return;
          }
          if (behavior.dropOutputAt !== input.index) {
            const data = Uint8Array.of(0, 0, 0, 2, input.keyFrame ? 0x65 : 0x41, 0x80);
            this.callbacks.output({
              timestamp: behavior.outputTimestamp?.(input) ?? input.timestamp,
              duration: null, // Real encoders may omit the chunk duration.
              type: input.keyFrame ? 'key' : 'delta',
              byteLength: data.byteLength,
              copyTo(destination) { destination.set(data); },
            }, input.index === 0 ? {
              decoderConfig: {
                codec: this.config.codec, codedWidth: this.config.width, codedHeight: this.config.height,
                description: AVC_DESCRIPTION,
              },
            } : undefined);
          }
          this.dispatchEvent(new Event('dequeue'));
          if (this.queue.length) this.scheduleDrain();
          else this.flushes.splice(0).forEach(({ resolve }) => resolve());
        });
      }
      flush() {
        this.flushCount += 1;
        if (behavior.flushFailure) return Promise.reject(new Error('Mock flush failure'));
        if (!this.queue.length) return Promise.resolve();
        return new Promise((resolve, reject) => this.flushes.push({ resolve, reject }));
      }
      close() {
        this.closeCount += 1;
        this.state = 'closed';
        clearImmediate(this.scheduled);
        this.queue.length = 0;
        this.encodeQueueSize = 0;
        this.flushes.splice(0).forEach(({ reject }) => reject(new Error('Encoder closed')));
      }
    },
  };
  for (const [key, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  t.after(() => recordings.encoders.forEach((encoder) => {
    if (encoder.state !== 'closed') encoder.close();
  }));
  return recordings;
}

function options(overrides = {}) {
  return { canvas: { width: 1080, height: 1920 }, renderFrame() {}, ...overrides };
}

for (const device of [
  { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari', platform: 'iPhone' },
  { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit CriOS', platform: 'iPhone' },
  { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit', platform: 'iPhone', standalone: true },
  { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit Safari', platform: 'MacIntel', maxTouchPoints: 5 },
]) {
  for (const [width, height] of [[1080, 1920], [1080, 1350], [1920, 1080]]) {
    test(`captures the entire pixel buffer on ${device.userAgent}, PWA=${!!device.standalone}, ${width}x${height}`, async (t) => {
      const recordings = installEncoder(t, { navigator: device });
      const pixels = new Uint8ClampedArray(width * height * 4);
      let reads = 0;
      let renders = 0;
      const canvas = {
        width, height,
        // CSS size must not influence exported pixels.
        clientWidth: 360, clientHeight: 640,
        getContext(kind) {
          assert.equal(kind, '2d');
          return { getImageData(x, y, w, h, settings) {
            assert.deepEqual([x, y, w, h], [0, 0, width, height]);
            assert.equal(settings.colorSpace, 'srgb');
            assert.equal(++reads, renders, 'Capture occurs after each render');
            return { data: pixels };
          } };
        },
      };
      await exportStoryVideo(options({ canvas, duration: 2 / 30, renderFrame() {
        renders += 1;
        pixels.set([renders, 22, 33, 255], pixels.length - 4);
      } }));
      assert.equal(reads, 2);
      for (const frame of recordings.frames) {
        assert.equal(frame.canvas, pixels, 'Pass raw pixels instead of the native canvas surface');
        assert.equal(frame.canvas.length, width * height * 4);
        assert.deepEqual(Array.from(frame.canvas.slice(-4)), [2, 22, 33, 255]);
        assert.equal(frame.format, 'RGBX');
        assert.deepEqual([frame.codedWidth, frame.codedHeight, frame.displayWidth, frame.displayHeight], [width, height, width, height]);
        assert.deepEqual(frame.layout, [{ offset: 0, stride: width * 4 }]);
      }
      assertReleased(recordings);
    });
  }
}

test('releases encoder when iOS pixel readback fails', async (t) => {
  const recordings = installEncoder(t, { navigator: { userAgent: 'iPhone' } });
  const canvas = { width: 1080, height: 1920, getContext() {
    return { getImageData() { throw new Error('Pixel readback failed'); } };
  } };
  await assert.rejects(exportStoryVideo(options({ canvas })), /Pixel readback failed/);
  assertReleased(recordings);
});

function assertReleased(recordings) {
  assert.equal(recordings.liveFrames, 0);
  assert.ok(recordings.frames.every((frame) => frame.closeCount === 1));
  assert.ok(recordings.encoders.every((encoder) => encoder.closeCount === 1));
}

function readBoxes(buffer, start = 0, end = buffer.length) {
  const boxes = [];
  let offset = start;
  while (offset < end) {
    assert.ok(offset + 8 <= end, 'Complete MP4 box header');
    const shortSize = buffer.readUInt32BE(offset);
    const size = shortSize === 1 ? Number(buffer.readBigUInt64BE(offset + 8)) : shortSize || end - offset;
    const headerSize = shortSize === 1 ? 16 : 8;
    assert.ok(size >= headerSize && offset + size <= end, 'MP4 box fits its parent');
    const box = { type: buffer.toString('ascii', offset + 4, offset + 8), start: offset, end: offset + size };
    if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(box.type)) {
      box.children = readBoxes(buffer, offset + headerSize, box.end);
    }
    boxes.push(box);
    offset += size;
  }
  return boxes;
}

function findBox(boxes, type) {
  for (const box of boxes) {
    if (box.type === type) return box;
    const nested = box.children && findBox(box.children, type);
    if (nested) return nested;
  }
}

function boxDuration(buffer, box) {
  assert.ok(box);
  const version = buffer[box.start + 8];
  const timescale = buffer.readUInt32BE(box.start + (version === 1 ? 28 : 20));
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(box.start + 32))
    : buffer.readUInt32BE(box.start + 24);
  return duration / timescale;
}

function sampleDurations(buffer, boxes) {
  const stts = findBox(boxes, 'stts');
  const count = buffer.readUInt32BE(stts.start + 12);
  const durations = [];
  for (let index = 0; index < count; index += 1) {
    const offset = stts.start + 16 + index * 8;
    durations.push(...Array(buffer.readUInt32BE(offset)).fill(buffer.readUInt32BE(offset + 4)));
  }
  return durations;
}

test('frame planning merges overlapping motion, rounds boundaries outwards and leaves input untouched', () => {
  const motionRanges = Object.freeze([
    { start: 1.21, end: 1.38 }, { start: -1, end: 0.05 },
    { start: 1.3, end: 1.5 }, { start: 1.5, end: 1.6 },
    { start: 1.95, end: 4 }, { start: 5, end: 6 }, { start: 1, end: 1 },
  ].map(Object.freeze));
  const plan = getStoryVideoFramePlan({ duration: 2, motionRanges });
  const animated = new Set([0, 1, ...Array.from({ length: 12 }, (_, i) => 36 + i), 58, 59]);
  assert.deepEqual(plan.filter(sample => sample.endFrame - sample.startFrame === 1).map(sample => sample.startFrame), [...animated]);
  assert.deepEqual(plan.filter(sample => sample.endFrame - sample.startFrame > 1).map(sample => [sample.startFrame, sample.endFrame]), [[2, 36], [48, 58]]);
  assert.equal(plan.reduce((sum, sample) => sum + sample.duration, 0), 2_000_000);
  assert.equal(getStoryVideoFramePlan({ duration: 2 }).length, 60, 'Unmapped animations keep full rendering');
  assert.equal(getStoryVideoFramePlan({ duration: 2, motionRanges: [] }).length, 1);
});

test('invalid durations or motion maps fail before allocating encoder resources', async (t) => {
  const recordings = installEncoder(t);
  for (const duration of [0, -1, NaN, Infinity, 0.01]) {
    await assert.rejects(exportStoryVideo(options({ duration })), RangeError);
  }
  for (const motionRanges of [null, {}, [null], [{ start: 2, end: 1 }], [{ start: 0, end: Infinity }]]) {
    await assert.rejects(exportStoryVideo(options({ motionRanges })), TypeError);
  }
  assert.equal(recordings.encoders.length, 0);
  assert.equal(recordings.frames.length, 0);
});

const layers = [
  { kind: 'product', index: 0 }, { kind: 'product', index: 1 },
  { kind: 'details', index: 0 }, { kind: 'details', index: 1 }, { kind: 'text', index: 0 },
];
const sparseScenarios = [
  { name: 'entirely static', width: 1080, height: 1920, duration: 15, motionRanges: [] },
  { name: 'a static ending after animation', width: 1080, height: 1920, duration: 15, motionRanges: [{ start: 0, end: 1 }] },
  { name: 'a final single frame after a long hold', width: 1080, height: 1920, duration: 15, motionRanges: [{ start: 449 / 30, end: 15 }] },
  ...[1920, 1350].flatMap(height => [false, true].map(wallpaper => ({
    name: `${height === 1920 ? 'Stories' : 'Feed'} with wallpaper=${wallpaper}`, width: 1080, height,
    duration: getStoryVideoDuration(wallpaper), motionRanges: getStoryVideoMotionRanges({ layers, wallpaper }),
  }))),
  ...[false, true].map(hasWallpaper => {
    const products = [20, 10, 15, 10, 20].map(duration => ({ duration }));
    return {
      name: `Indoor mixed durations with wallpaper=${hasWallpaper}`, width: 1920, height: 1080,
      duration: getIndoorDuration(hasWallpaper, products), motionRanges: getIndoorMotionRanges({ hasWallpaper, products }),
    };
  }),
];

for (const scenario of sparseScenarios) test(`sparse MP4 preserves every sample duration: ${scenario.name}`, async (t) => {
  const recordings = installEncoder(t, { outputTimestamp: input => input.timestamp + (input.index % 3 - 1) });
  const canvas = { width: scenario.width, height: scenario.height };
  const plan = getStoryVideoFramePlan(scenario);
  const rendered = [];
  const progress = [];
  const blob = await exportStoryVideo(options({ ...scenario, canvas,
    renderFrame: seconds => rendered.push(seconds), onProgress: value => progress.push(value),
  }));
  assert.deepEqual(rendered, plan.map(sample => sample.startFrame / 30));
  assert.equal(recordings.frames.length, plan.length);
  assert.ok(plan.length < scenario.duration * 30 / 4);
  let end = 0;
  for (const [index, frame] of recordings.frames.entries()) {
    assert.equal(frame.timestamp, end, 'No timestamp gaps or overlaps');
    assert.equal(frame.duration, plan[index].duration);
    if (plan[index].endFrame - plan[index].startFrame > 1) {
      assert.equal(recordings.encoders[0].inputs[index].keyFrame, true, 'Static holds are seekable');
    }
    end += frame.duration;
  }
  assert.equal(end, scenario.duration * 1_000_000);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.equal(progress.filter(value => value === 1).length, 1);
  assert.ok(progress.every((value, index) => value >= 0 && value <= 1 && (!index || value >= progress[index - 1])));
  assert.ok(recordings.queueMaximum <= 4);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const boxes = readBoxes(buffer);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mvhd')), scenario.duration);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mdhd')), scenario.duration);
  assert.equal(buffer.readUInt32BE(findBox(boxes, 'stsz').start + 16), plan.length);
  assert.deepEqual(sampleDurations(buffer, boxes), plan.map(sample => sample.endFrame - sample.startFrame),
    'Actual MP4 sample table must preserve all holds, including the final sample');
  assert.ok(boxes.findIndex(box => box.type === 'moov') < boxes.findIndex(box => box.type === 'mdat'));
  const header = findBox(boxes, 'tkhd');
  assert.equal(buffer.readUInt32BE(header.end - 8) / 65536, scenario.width);
  assert.equal(buffer.readUInt32BE(header.end - 4) / 65536, scenario.height);
  assertReleased(recordings);
});

test('iOS captures pixels once for an entire static interval', async (t) => {
  const recordings = installEncoder(t, { navigator: { userAgent: 'iPhone' } });
  let reads = 0;
  let renders = 0;
  const canvas = { width: 1080, height: 1920, getContext() {
    return { getImageData() { reads += 1; return { data: new Uint8ClampedArray(1080 * 1920 * 4) }; } };
  } };
  await exportStoryVideo(options({ canvas, motionRanges: [], renderFrame() { renders += 1; } }));
  assert.equal(reads, 1);
  assert.equal(renders, 1);
  assert.equal(recordings.frames[0].duration, 15_000_000);
  assertReleased(recordings);
});

test('sparse export rejects missing, duplicated and reordered outputs', async (t) => {
  const scenario = sparseScenarios.find(scenario => scenario.name.startsWith('Stories'));
  const plan = getStoryVideoFramePlan(scenario);
  for (const behavior of [
    { dropOutputAt: plan.length - 1 },
    { dropOutputAt: 3 },
    { outputTimestamp: input => input.index === 3 ? plan[2].timestamp : input.timestamp },
    { outputTimestamp: input => input.index === 3 ? plan[4].timestamp : input.timestamp },
  ]) await t.test(JSON.stringify(behavior), async (child) => {
    const recordings = installEncoder(child, behavior);
    await assert.rejects(exportStoryVideo(options(scenario)), /sequência|todos os quadros/);
    assertReleased(recordings);
  });
});

test('exports a 15-second 1080 × 1920 MP4 with 450 timed frames and bounded encoding memory', async (t) => {
  const recordings = installEncoder(t);
  const rendered = [];
  const progress = [];
  const canvas = { width: 1080, height: 1920 };
  const blob = await exportStoryVideo(options({
    canvas, renderFrame: (seconds) => rendered.push(seconds), onProgress: (value) => progress.push(value),
  }));
  assert.equal(blob.type, 'video/mp4');
  assert.equal(recordings.frames.length, 450);
  assert.equal(rendered.length, 450);
  assert.equal(rendered[0], 0);
  assert.equal(rendered.at(-1), 449 / 30);
  assert.equal(recordings.frames[0].timestamp, 0);
  let totalDuration = 0;
  for (const [index, frame] of recordings.frames.entries()) {
    assert.equal(frame.canvas, canvas);
    assert.equal(frame.timestamp, Math.round(index * 1_000_000 / 30));
    assert.equal(frame.timestamp, totalDuration, 'Timestamps have no gaps or overlap');
    totalDuration += frame.duration;
  }
  assert.equal(totalDuration, 15_000_000);
  assert.ok(recordings.queueMaximum > 1, 'Mock encoder applies real queue pressure');
  assert.ok(recordings.queueMaximum <= 4, 'Encoder queue remains bounded');
  assert.ok(recordings.encoders[0].flushCount > 1);
  assert.equal(recordings.encoders[0].inputs[0].keyFrame, true);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.equal(progress.filter((value) => value === 1).length, 1);
  assert.ok(progress.every((value, index) => value >= 0 && value <= 1 && (!index || value >= progress[index - 1])));
  assertReleased(recordings);

  const buffer = Buffer.from(await blob.arrayBuffer());
  const boxes = readBoxes(buffer);
  assert.equal(boxes[0].type, 'ftyp');
  assert.ok(boxes.findIndex((box) => box.type === 'moov') < boxes.findIndex((box) => box.type === 'mdat'), 'Fast-start metadata precedes video data');
  assert.equal(boxDuration(buffer, findBox(boxes, 'mvhd')), 15);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mdhd')), 15);
  const trackHeader = findBox(boxes, 'tkhd');
  assert.equal(buffer.readUInt32BE(trackHeader.end - 8) / 65536, 1080);
  assert.equal(buffer.readUInt32BE(trackHeader.end - 4) / 65536, 1920);
  assert.equal(buffer.readUInt32BE(findBox(boxes, 'stsz').start + 16), 450);
  assert.ok(buffer.includes(Buffer.from('avcC')));
});

test('exports Feed MP4 at 1080 × 1350 with 450 frames and 15 seconds', async (t) => {
  const recordings = installEncoder(t);
  const canvas = { width: 1080, height: 1350 };
  const blob = await exportStoryVideo(options({ canvas }));
  assert.equal(blob.type, 'video/mp4');
  assert.equal(recordings.frames.length, 450);
  assert.equal(recordings.supportChecks[0].height, 1350);
  assert.ok(recordings.frames.every((frame) => frame.canvas === canvas));
  const buffer = Buffer.from(await blob.arrayBuffer());
  const boxes = readBoxes(buffer);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mvhd')), 15);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mdhd')), 15);
  const header = findBox(boxes, 'tkhd');
  assert.equal(buffer.readUInt32BE(header.end - 8) / 65536, 1080);
  assert.equal(buffer.readUInt32BE(header.end - 4) / 65536, 1350);
  assertReleased(recordings);
});

for (const duration of [40, 43]) test(`exports Indoor TV MP4 at 1920 × 1080 with ${duration * 30} timed frames and ${duration} seconds`, async (t) => {
  const recordings = installEncoder(t);
  const canvas = { width: 1920, height: 1080 };
  const rendered = [];
  const frameCount = duration * 30;
  const blob = await exportStoryVideo(options({ canvas, duration, renderFrame: (seconds) => rendered.push(seconds) }));
  assert.equal(blob.type, 'video/mp4');
  assert.equal(recordings.frames.length, frameCount);
  assert.equal(rendered.length, frameCount);
  assert.equal(rendered[0], 0);
  assert.equal(rendered.at(-1), (frameCount - 1) / 30);
  assert.equal(recordings.supportChecks[0].width, 1920);
  assert.equal(recordings.supportChecks[0].height, 1080);
  assert.equal(recordings.encoders[0].config.width, 1920);
  assert.equal(recordings.encoders[0].config.height, 1080);
  let totalDuration = 0;
  for (const frame of recordings.frames) {
    assert.equal(frame.canvas, canvas);
    assert.equal(frame.timestamp, totalDuration, 'Landscape timestamps have no gaps or overlap');
    totalDuration += frame.duration;
  }
  assert.equal(totalDuration, duration * 1_000_000);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const boxes = readBoxes(buffer);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mvhd')), duration);
  assert.equal(boxDuration(buffer, findBox(boxes, 'mdhd')), duration);
  const header = findBox(boxes, 'tkhd');
  assert.equal(buffer.readUInt32BE(header.end - 8) / 65536, 1920);
  assert.equal(buffer.readUInt32BE(header.end - 4) / 65536, 1080);
  assert.equal(buffer.readUInt32BE(findBox(boxes, 'stsz').start + 16), frameCount);
  assertReleased(recordings);
});

test('tries alternate compatible H.264 configurations before rendering', async (t) => {
  const recordings = installEncoder(t, { supported: (config) => config.codec === 'avc1.42e028' });
  const config = await getStoryVideoConfig();
  assert.equal(config.codec, 'avc1.42e028');
  assert.equal(recordings.supportChecks.length, 2);
  assert.equal(config.width, 1080);
  assert.equal(config.height, 1920);
  assert.equal(config.framerate, 30);
  assert.equal(config.avc.format, 'avc');
});

test('reports unsupported H.264 without creating frames or an encoder', async (t) => {
  const recordings = installEncoder(t, { supported: () => false });
  await assert.rejects(exportStoryVideo(options()), /H\.264/);
  assert.equal(recordings.supportChecks.length, 2);
  assert.equal(recordings.frames.length, 0);
  assert.equal(recordings.encoders.length, 0);
});

test('explains missing WebCodecs and insecure HTTP support', async (t) => {
  installEncoder(t);
  globalThis.VideoEncoder = undefined;
  await assert.rejects(getStoryVideoConfig(), /H\.264/);
  globalThis.isSecureContext = false;
  await assert.rejects(getStoryVideoConfig(), /HTTPS|localhost/);
});

test('rejects incorrect canvas dimensions before starting the encoder', async (t) => {
  const recordings = installEncoder(t);
  for (const canvas of [
    { width: 720, height: 1280 },
    { width: 1920, height: 1350 },
    { width: 1920, height: 1920 },
    { width: 1080, height: 1080 },
  ]) {
    await assert.rejects(exportStoryVideo(options({ canvas })), /1080/);
    await assert.rejects(getStoryVideoConfig(canvas), /1080/);
  }
  assert.equal(recordings.supportChecks.length, 0);
  assert.equal(recordings.encoders.length, 0);
});

test('honors cancellation before export starts', async (t) => {
  const recordings = installEncoder(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(exportStoryVideo(options({ signal: controller.signal })), { name: 'AbortError' });
  assert.equal(recordings.frames.length, 0);
  assert.equal(recordings.supportChecks.length, 0);
});

test('cancels during rendering and releases all frames and the encoder', async (t) => {
  const recordings = installEncoder(t);
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(exportStoryVideo(options({
    signal: controller.signal,
    renderFrame(seconds) { if (seconds >= 0.2) controller.abort(); },
    onProgress(value) { progress.push(value); },
  })), { name: 'AbortError' });
  assert.ok(recordings.frames.length > 0 && recordings.frames.length < 450);
  assert.ok(!progress.includes(1));
  assertReleased(recordings);
});

test('cancels promptly while waiting for a stalled encoder queue', async (t) => {
  const recordings = installEncoder(t, { holdQueue: true });
  const controller = new AbortController();
  const pending = exportStoryVideo(options({ signal: controller.signal }));
  const timer = setTimeout(() => controller.abort(), 10);
  t.after(() => clearTimeout(timer));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(recordings.frames.length <= 4);
  assertReleased(recordings);
});

test('closes the current frame when encode throws', async (t) => {
  const recordings = installEncoder(t, { throwEncodeAt: 2 });
  await assert.rejects(exportStoryVideo(options()), /Mock encode failure/);
  assert.equal(recordings.frames.length, 3);
  assertReleased(recordings);
});

test('reports asynchronous codec failure and releases resources', async (t) => {
  const recordings = installEncoder(t, { failAt: 2 });
  await assert.rejects(exportStoryVideo(options()), /codificar|H\.264/);
  assertReleased(recordings);
});

test('does not return an incomplete MP4 when a frame is missing', async (t) => {
  const recordings = installEncoder(t, { dropOutputAt: 449 });
  await assert.rejects(exportStoryVideo(options()), /todos os quadros/);
  assertReleased(recordings);
});

for (const height of [1920, 1350]) {
  test(`normalizes WebKit microsecond rounding for 1080 × ${height} without altering MP4 timing`, async (t) => {
    const recordings = installEncoder(t, {
      outputTimestamp: (input) => input.timestamp + (input.index % 3 - 1),
    });
    const blob = await exportStoryVideo(options({ canvas: { width: 1080, height } }));
    const buffer = Buffer.from(await blob.arrayBuffer());
    const boxes = readBoxes(buffer);
    assert.equal(blob.type, 'video/mp4');
    assert.equal(boxDuration(buffer, findBox(boxes, 'mvhd')), 15);
    assert.equal(boxDuration(buffer, findBox(boxes, 'mdhd')), 15);
    assert.equal(buffer.readUInt32BE(findBox(boxes, 'stsz').start + 16), 450);
    assertReleased(recordings);
  });
}

test('rejects timestamp changes beyond rounding rather than downloading a mistimed MP4', async (t) => {
  const recordings = installEncoder(t, { outputTimestamp: (input) => input.timestamp + 2 });
  await assert.rejects(exportStoryVideo(options()), /sequência/);
  assertReleased(recordings);
});

test('still rejects duplicated frame timestamps despite microsecond rounding tolerance', async (t) => {
  const recordings = installEncoder(t, {
    outputTimestamp: (input) => input.index === 2 ? 33333 : input.timestamp,
  });
  await assert.rejects(exportStoryVideo(options()), /sequência/);
  assertReleased(recordings);
});

test('releases resources when rendering or encoder flush fails', async (t) => {
  await t.test('rendering failure', async (child) => {
    const recordings = installEncoder(child);
    await assert.rejects(exportStoryVideo(options({ renderFrame() { throw new Error('Render failure'); } })), /Render failure/);
    assertReleased(recordings);
  });
  await t.test('flush failure', async (child) => {
    const recordings = installEncoder(child, { flushFailure: true });
    await assert.rejects(exportStoryVideo(options()), /Mock flush failure/);
    assertReleased(recordings);
  });
});
