import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const storyBackgroundExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function makeStoryBackgroundUrl(backgroundFile) {
  return `/story-backgrounds/${backgroundFile.split('/').map(encodeURIComponent).join('/')}`;
}

function storyBackgroundLabel(backgroundFile) {
  const name = path.basename(backgroundFile, path.extname(backgroundFile))
    .replace(/^gabarito\s+/i, '')
    .replace(/(?:[_\s-]+stories?)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+-\s+$/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');

  if (!name) return 'Background para Story';

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

export function createStoryBackgroundService({ storyBackgroundsDirectory }) {
  async function listStoryBackgrounds() {
    if (!existsSync(storyBackgroundsDirectory)) return [];

    const entries = await fs.readdir(storyBackgroundsDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isSupportedStoryBackground(entry.name))
      .map((entry) => ({
        arquivo: entry.name,
        nome: storyBackgroundLabel(entry.name),
        url: makeStoryBackgroundUrl(entry.name),
      }))
      .sort((first, second) => first.nome.localeCompare(second.nome, 'pt-BR'));
  }

  return { listStoryBackgrounds };
}
