// Stockage des livres sur le téléphone (Android / iOS natif).
import { Directory, File, Paths } from 'expo-file-system';
import { stripGutenbergBoilerplate } from './reading';

export const isBundledOnly = false;

function booksDir() {
  const dir = new Directory(Paths.document, 'books');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Lit le livre depuis le cache local, ou le télécharge et le met en cache (relecture hors-ligne). */
export async function cachedText(id, download) {
  const file = new File(booksDir(), `${id.replace(/[^a-z0-9_-]/gi, '_')}.txt`);
  if (file.exists) return stripGutenbergBoilerplate(await file.text());
  const text = await download();
  await file.write(text);
  return text;
}

export async function pdfAssetToBase64(asset) {
  return new File(asset.uri).base64();
}
