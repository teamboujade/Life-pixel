// Recherche de livres gratuits du domaine public (section 9) via Gutendex
// (Project Gutenberg) — API publique, sans clé ni abonnement.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { stripGutenbergBoilerplate } from './reading';

const pickTextUrl = (formats) => {
  const key = Object.keys(formats).find((k) => k.startsWith('text/plain'));
  return key ? formats[key] : null;
};

// Classiques français vérifiés, servis directement par gutenberg.org :
// utilisés si Gutendex (service bénévole) est indisponible.
const CLASSICS = [
  [17489, 'Les misérables, Tome I : Fantine', 'Victor Hugo'],
  [17989, 'Le comte de Monte-Cristo, Tome I', 'Alexandre Dumas'],
  [13951, 'Les trois mousquetaires', 'Alexandre Dumas'],
  [14155, 'Madame Bovary', 'Gustave Flaubert'],
  [4650, "Candide, ou l'optimisme", 'Voltaire'],
  [2650, 'Du côté de chez Swann', 'Marcel Proust'],
  [800, 'Le tour du monde en quatre-vingts jours', 'Jules Verne'],
  [5097, 'Vingt mille lieues sous les mers', 'Jules Verne'],
  [4791, 'Voyage au centre de la Terre', 'Jules Verne'],
  [17519, 'Les misérables, Tome V : Jean Valjean', 'Victor Hugo'],
].map(([id, title, author]) => ({
  id: `gutenberg-${id}`,
  title,
  author,
  textUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
  coverUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
}));

const normalize = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Classiques locaux filtrés par titre/auteur (sans accents ni casse). */
export function searchClassics(query = '') {
  const q = normalize(query.trim());
  return q ? CLASSICS.filter((b) => normalize(`${b.title} ${b.author}`).includes(q)) : CLASSICS;
}

async function fetchWithTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recherche sur Gutendex. Renvoie { books, offline } : `offline` est vrai
 * quand Gutendex n'a pas répondu et que les classiques intégrés sont servis.
 */
export async function searchFreeBooks(query = '', language = 'fr') {
  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());
  if (language) params.set('languages', language);
  try {
    const response = await fetchWithTimeout(`https://gutendex.com/books/?${params}`);
    if (!response.ok) throw new Error(`Gutendex a répondu ${response.status}`);
    const data = await response.json();
    const books = data.results
      .map((book) => ({
        id: `gutenberg-${book.id}`,
        title: book.title,
        author: book.authors?.[0]?.name ?? 'Auteur inconnu',
        textUrl: pickTextUrl(book.formats),
        coverUrl: book.formats['image/jpeg'] ?? null,
      }))
      .filter((b) => b.textUrl);
    return { books, offline: false };
  } catch {
    return { books: language === 'en' ? [] : searchClassics(query), offline: true };
  }
}

export async function downloadBookText(textUrl) {
  // Gutenberg sert parfois l'URL en http : on force https.
  const response = await fetchWithTimeout(textUrl.replace(/^http:/, 'https:'), 60000);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`);
  return stripGutenbergBoilerplate(await response.text());
}

/** Ouvre le sélecteur de fichiers et renvoie { id, title, base64 } ou null. */
export async function pickLocalPdfDocument() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const base64 = await new File(asset.uri).base64();
  return {
    id: `pdf-${asset.name}-${asset.size ?? 0}`,
    title: asset.name.replace(/\.pdf$/i, ''),
    base64,
  };
}

// Cache local des livres téléchargés : relecture hors-ligne.

function booksDir() {
  const dir = new Directory(Paths.document, 'books');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const safeName = (id) => id.replace(/[^a-z0-9_-]/gi, '_');

export async function loadBookText(book) {
  const file = new File(booksDir(), `${safeName(book.id)}.txt`);
  if (file.exists) return file.text();
  const text = await downloadBookText(book.textUrl);
  await file.write(text);
  return text;
}
