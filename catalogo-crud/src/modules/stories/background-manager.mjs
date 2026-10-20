import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  isSupportedStoryBackground,
  isWallpaperBackground,
} from './background-service.mjs';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return slug || 'background';
}

function fileExtension(file) {
  const extension = path.extname(String(file?.filename || '')).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    throw new Error('Use imagens PNG, JPG, JPEG ou WEBP.');
  }
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(String(file?.contentType || '').toLowerCase())) {
    throw new Error('O arquivo enviado não parece ser uma imagem suportada.');
  }
  if (!file.buffer?.length || file.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Cada imagem deve ter entre 1 byte e 20 MB.');
  }
  return extension;
}

function resolveManagedFile(directory, fileName) {
  if (!fileName || path.basename(fileName) !== fileName || fileName.includes('\\')) return null;
  if (!isSupportedStoryBackground(fileName) || isWallpaperBackground(fileName)) return null;
  return path.join(directory, fileName);
}

function wallpaperName(backgroundName) {
  const extension = path.extname(backgroundName);
  return `${backgroundName.slice(0, -extension.length)}-wallpaper${extension}`;
}

const extensions = ['.png', '.jpg', '.jpeg', '.webp'];

function displayNameFromFile(file) {
  return String(file?.filename || 'background')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function createBackgroundManager({ directory, format }) {
  const indoor = format === 'indoor-h';

  async function add({ name, background, wallpaper }) {
    if (!background) throw new Error('Selecione a imagem do background.');
    if (indoor && !wallpaper) throw new Error('TV Indoor exige o background e o wallpaper da campanha.');

    const backgroundExtension = fileExtension(background);
    const wallpaperExtension = wallpaper ? fileExtension(wallpaper) : null;
    const label = slugify(name || displayNameFromFile(background));
    const id = randomUUID();
    const backgroundName = `${label}--${id}${backgroundExtension}`;
    const wallpaperFileName = indoor ? wallpaperName(`${label}--${id}${wallpaperExtension}`) : null;

    await fs.mkdir(directory, { recursive: true });
    const backgroundPath = path.join(directory, backgroundName);
    const wallpaperPath = wallpaperFileName ? path.join(directory, wallpaperFileName) : null;

    try {
      await fs.writeFile(backgroundPath, background.buffer, { flag: 'wx' });
      if (wallpaperPath) await fs.writeFile(wallpaperPath, wallpaper.buffer, { flag: 'wx' });
    } catch (error) {
      await fs.unlink(backgroundPath).catch(() => {});
      if (wallpaperPath) await fs.unlink(wallpaperPath).catch(() => {});
      throw error;
    }

    return { arquivo: backgroundName, wallpaper_arquivo: wallpaperFileName };
  }

  async function remove(fileName) {
    const backgroundPath = resolveManagedFile(directory, fileName);
    if (!backgroundPath) return false;

    try {
      await fs.unlink(backgroundPath);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }

    if (indoor) {
      await Promise.all(extensions.map((extension) => fs.unlink(
        path.join(directory, wallpaperName(`${fileName.slice(0, -path.extname(fileName).length)}${extension}`)),
      ).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      })));
    }
    return true;
  }

  return { add, remove };
}
