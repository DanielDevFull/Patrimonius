import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file));

/** Largura x altura do cabeçalho IHDR de um PNG. */
function pngSize(file: string): [number, number] {
  const buf = read(file);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('ícones do PWA', () => {
  it('PNGs nos tamanhos exigidos por instaladores e pelo iOS', () => {
    expect(pngSize('public/icon-192.png')).toEqual([192, 192]);
    expect(pngSize('public/icon-512.png')).toEqual([512, 512]);
    expect(pngSize('public/icon-512-maskable.png')).toEqual([512, 512]);
    expect(pngSize('public/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('index.html declara o apple-touch-icon', () => {
    expect(read('index.html').toString()).toMatch(/<link rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/);
  });

  it('manifest declara os PNGs (any e maskable) e um id', () => {
    const config = read('vite.config.ts').toString();
    expect(config).toMatch(/src: 'icon-192\.png', sizes: '192x192', type: 'image\/png'/);
    expect(config).toMatch(/src: 'icon-512\.png', sizes: '512x512', type: 'image\/png'/);
    expect(config).toMatch(/src: 'icon-512-maskable\.png', sizes: '512x512', type: 'image\/png', purpose: 'maskable'/);
    expect(config).toMatch(/id: '\.\/'/);
  });
});
