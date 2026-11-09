import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackgroundManager } from '../src/modules/stories/background-manager.mjs';
import { createStoryBackgroundService } from '../src/modules/stories/background-service.mjs';

test('Stories saves, lists and removes its optional wallpaper with a different extension', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stories-wallpaper-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const manager = createBackgroundManager({ directory, format: 'stories' });
  const service = createStoryBackgroundService({ storyBackgroundsDirectory: directory });
  const background = { filename: 'background.png', contentType: 'image/png', buffer: Buffer.from('background') };
  const wallpaper = { filename: 'wallpaper.webp', contentType: 'image/webp', buffer: Buffer.from('wallpaper') };
  const campaign = await manager.add({ name: 'Campanha', background, wallpaper });
  const plain = await manager.add({ name: 'Simples', background });
  const items = await service.listStoryBackgrounds();
  assert.equal(items.length, 2);
  const item = items.find(item => item.arquivo === campaign.arquivo);
  assert.equal(item.wallpaper_arquivo, campaign.wallpaper_arquivo);
  assert.match(item.wallpaper_preview_url, /-wallpaper\.webp\?v=.+&variant=render-v1$/);
  assert.equal(items.find(item => item.arquivo === plain.arquivo).wallpaper_url, undefined);
  assert.equal(await manager.remove(campaign.arquivo), true);
  assert.deepEqual(await fs.readdir(directory), [plain.arquivo]);
});
