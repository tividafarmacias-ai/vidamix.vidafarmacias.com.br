function drawImageCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

export function getBackgroundBadgeTheme(image, { width = 72, height = 128 } = {}) {
  const fallback = { fill: '#0e746c', text: '#ffffff' };
  if (!image) return fallback;

  try {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    drawImageCover(sampleContext, image, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const { data } = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const colors = new Map();

    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha < 200) continue;

      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
      const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
      if (saturation < 0.08 && luminance > 238) continue;

      const bucketRed = Math.round(red / 24) * 24;
      const bucketGreen = Math.round(green / 24) * 24;
      const bucketBlue = Math.round(blue / 24) * 24;
      const key = `${bucketRed},${bucketGreen},${bucketBlue}`;
      const weight = 1 + (saturation * 2) + (luminance > 36 && luminance < 230 ? 0.45 : 0);
      const entry = colors.get(key) || { red: 0, green: 0, blue: 0, weight: 0 };
      entry.red += red * weight;
      entry.green += green * weight;
      entry.blue += blue * weight;
      entry.weight += weight;
      colors.set(key, entry);
    }

    const dominant = [...colors.values()].sort((left, right) => right.weight - left.weight)[0];
    if (!dominant) return fallback;

    const red = Math.round(dominant.red / dominant.weight);
    const green = Math.round(dominant.green / dominant.weight);
    const blue = Math.round(dominant.blue / dominant.weight);
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    return {
      fill: `rgb(${red}, ${green}, ${blue})`,
      text: luminance > 155 ? '#0b2b33' : '#ffffff',
    };
  } catch {
    return fallback;
  }
}
