export const STORY_VIDEO_DURATION_SECONDS = 15;
export const STORY_WALLPAPER_DURATION_SECONDS = 3;

export function getStoryVideoDuration(hasWallpaper = false) {
  return STORY_VIDEO_DURATION_SECONDS + (hasWallpaper ? STORY_WALLPAPER_DURATION_SECONDS : 0);
}

const ENTRANCE_DURATION = 0.9;
const EXIT_START = 13.5;
const EXIT_DURATION = 0.9;
const WALLPAPER_FADE_DURATION = 0.5;

function getLayerTiming(layer) {
  const secondary = layer.index === 1;
  const delay = layer.kind === 'product' ? 0 : layer.kind === 'details' ? 0.22 : 0.46;
  return {
    entranceStart: delay + (secondary ? 0.16 : 0),
    exitStart: EXIT_START + delay * 0.5 + (secondary ? 0.08 : 0),
  };
}

/** Motion intervals in seconds, derived from the same timings as the renderer. */
export function getStoryVideoMotionRanges(snapshot) {
  const offset = snapshot.wallpaper ? STORY_WALLPAPER_DURATION_SECONDS : 0;
  const ranges = snapshot.wallpaper
    ? [{ start: offset - WALLPAPER_FADE_DURATION, end: offset }]
    : [];
  for (const layer of snapshot.layers) {
    const { entranceStart, exitStart } = getLayerTiming(layer);
    ranges.push(
      { start: offset + entranceStart, end: offset + entranceStart + ENTRANCE_DURATION },
      { start: offset + exitStart, end: offset + exitStart + EXIT_DURATION },
    );
  }
  return ranges;
}

function smoothStep(value) {
  const progress = Math.max(0, Math.min(1, value));
  return progress * progress * (3 - 2 * progress);
}

/** Returns deterministic canvas transforms, with an unchanged reading interval. */
export function getStoryVideoLayerState(layer, seconds) {
  const time = Math.max(0, Math.min(STORY_VIDEO_DURATION_SECONDS, Number(seconds) || 0));
  const secondary = layer.index === 1;
  const direction = secondary ? 1 : -1;
  const kind = layer.kind;
  const { entranceStart, exitStart } = getLayerTiming(layer);
  const entrance = smoothStep((time - entranceStart) / ENTRANCE_DURATION);
  const exit = smoothStep((time - exitStart) / EXIT_DURATION);
  const entering = 1 - entrance;
  const product = kind === 'product';
  const details = kind === 'details';
  const horizontalDistance = product ? 52 * entering + 36 * exit : 0;

  return {
    opacity: entrance * (1 - exit),
    translateX: horizontalDistance === 0 ? 0 : direction * horizontalDistance,
    translateY: (product ? 42 : details ? 58 : 34) * entering - (product ? 38 : details ? 42 : 24) * exit,
    scale: 1 - (product ? 0.06 : details ? 0.02 : 0.03) * entering - 0.02 * exit,
  };
}

/**
 * Draws full-size transparent layers over the fixed, opaque artwork background.
 * Layer bounds provide the animation pivot; painting order and blending are
 * preserved so the middle of the video matches the static artwork exactly.
 */
export function drawStoryVideoFrame(context, snapshot, seconds) {
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.clearRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(snapshot.background, 0, 0);

    if (snapshot.wallpaper) {
      const time = Math.max(0, Number(seconds) || 0);
      if (time < STORY_WALLPAPER_DURATION_SECONDS) {
        // Fade into the background during the last half-second of the opening.
        context.globalAlpha = 1 - smoothStep((time - (STORY_WALLPAPER_DURATION_SECONDS - WALLPAPER_FADE_DURATION)) / WALLPAPER_FADE_DURATION);
        context.drawImage(snapshot.wallpaper, 0, 0);
        return;
      }
      seconds = time - STORY_WALLPAPER_DURATION_SECONDS;
    }

    for (const layer of snapshot.layers) {
      const animation = getStoryVideoLayerState(layer, seconds);
      if (animation.opacity <= 0) continue;

      context.save();
      try {
        context.globalAlpha = animation.opacity;
        context.globalCompositeOperation = layer.compositeOperation || 'source-over';
        if (animation.translateX !== 0 || animation.translateY !== 0 || animation.scale !== 1) {
          const centerX = layer.bounds.x + layer.bounds.width / 2;
          const centerY = layer.bounds.y + layer.bounds.height / 2;
          context.translate(centerX + animation.translateX, centerY + animation.translateY);
          context.scale(animation.scale, animation.scale);
          context.translate(-centerX, -centerY);
        }
        context.drawImage(layer.canvas, 0, 0);
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
}
