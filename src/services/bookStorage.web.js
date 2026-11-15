// Version navigateur : les classiques sont servis avec l'application (public/books)
// car gutenberg.org n'autorise pas la lecture depuis un autre site (CORS).
import { stripGutenbergBoilerplate } from './reading';

export const isBundledOnly = true;

export async function cachedText(id) {
  const response = await fetch(`books/${id}.txt`);
  if (!response.ok) throw new Error(`Livre introuvable (${response.status})`);
  return stripGutenbergBoilerplate(await response.text());
}

/** Sur le web, le sélecteur renvoie une URL data:…;base64,… */
export async function pdfAssetToBase64(asset) {
  if (asset.uri.startsWith('data:')) return asset.uri.slice(asset.uri.indexOf(',') + 1);
  const buf = await (await fetch(asset.uri)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
