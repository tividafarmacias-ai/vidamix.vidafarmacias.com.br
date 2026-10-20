import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileVersion } from '../../http/file-version.mjs';

export const storyBackgroundExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function makeStoryBackgroundUrl(backgroundFile, urlPrefix) {
  return `${urlPrefix}/${backgroundFile.split('/').map(encodeURIComponent).join('/')}`;
}

function storyBackgroundLabel(backgroundFile, format) {
  const formatSuffix = format === 'indoor-h'
    ? /(?:[_\s-]+indoor(?:[_\s-]+h(?:orizontal)?)?|[_\s-]+df\s*-\s*prec\s+tv)$/i
    : format === 'feed' ? /(?:[_\s-]+feed)$/i : /(?:[_\s-]+stories?)$/i;
  const name = path.basename(backgroundFile, path.extname(backgroundFile))
    .replace(/^gabarito\s+/i, '')
    .replace(/--[a-f0-9-]{16,}$/i, '')
    .replace(formatSuffix, '')
    .replace(/_/g, ' ')
    .replace(/\s+-\s+$/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');

  if (!name) {
    if (format === 'indoor-h') return 'Background para Indoor';
    return format === 'feed' ? 'Background para Feed' : 'Background para Story';
  }

  return name
    .split(' ')
    .map((word) => (word.length <= 2 ? word.toUpperCase() : `${word[0].toLocaleUpperCase('pt-BR')}${word.slice(1)}`))
    .join(' ');
}

export function isSupportedStoryBackground(filePath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch {
    return false;
  }

  return path.basename(decodedPath) === decodedPath
    && storyBackgroundExtensions.has(path.extname(decodedPath).toLowerCase());
}

export function isWallpaperBackground(filePath) {
  return isSupportedStoryBackground(filePath)
    && /-wallpaper\.[^.]+$/i.test(filePath);
}

function wallpaperFilename(backgroundFile) {
  const extension = path.extname(backgroundFile);
  return `${backgroundFile.slice(0, -extension.length)}-wallpaper${extension}`;
}

async function createBackgroundEntry({ directory, fileName, format, urlPrefix }) {
  try {
    const info = await fs.stat(path.join(directory, fileName));
    const version = fileVersion(info);
    return {
      id: fileName,
      arquivo: fileName,
      nome: storyBackgroundLabel(fileName, format),
      url: `${makeStoryBackgroundUrl(fileName, urlPrefix)}?v=${version}`,
      thumbnail_url: `${makeStoryBackgroundUrl(fileName, urlPrefix)}?v=${version}&variant=thumb-v1`,
      preview_url: `${makeStoryBackgroundUrl(fileName, urlPrefix)}?v=${version}&variant=render-v1`,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function createStoryBackgroundService({ storyBackgroundsDirectory, format = 'stories', urlPrefix = '/story-backgrounds' }) {
  async function listStoryBackgrounds() {
    if (!existsSync(storyBackgroundsDirectory)) return [];

    const entries = await fs.readdir(storyBackgroundsDirectory, { withFileTypes: true });
    const fileEntries = entries
      .filter((entry) => entry.isFile() && isSupportedStoryBackground(entry.name) && !isWallpaperBackground(entry.name));
    const backgrounds = await Promise.all(fileEntries.map((entry) => createBackgroundEntry({
      directory: storyBackgroundsDirectory,
      fileName: entry.name,
      format,
      urlPrefix,
    })));

    if (format === 'indoor-h') {
      await Promise.all(backgrounds.map(async (background) => {
        if (!background) return;
        const stem = path.basename(background.arquivo, path.extname(background.arquivo));
        const wallpaper = entries.find((entry) => entry.isFile()
          && path.basename(entry.name, path.extname(entry.name)) === `${stem}-wallpaper`
          && isWallpaperBackground(entry.name))?.name;
        if (!wallpaper) return;
        const wallpaperEntry = await createBackgroundEntry({
          directory: storyBackgroundsDirectory,
          fileName: wallpaper,
          format,
          urlPrefix,
        });
        if (!wallpaperEntry) return;
        background.wallpaper_arquivo = wallpaperEntry.arquivo;
        background.wallpaper_url = wallpaperEntry.url;
        background.wallpaper_thumbnail_url = wallpaperEntry.thumbnail_url;
        background.wallpaper_preview_url = wallpaperEntry.preview_url;
      }));
    }

    return backgrounds.filter(Boolean)
      .sort((first, second) => first.nome.localeCompare(second.nome, 'pt-BR'));
  }

  return { listStoryBackgrounds };
}
