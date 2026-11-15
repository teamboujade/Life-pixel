// Logique de la liseuse : pagination et estimation du temps (section 5).

/**
 * Découpe un texte en pages d'environ `pageSize` caractères en coupant
 * de préférence entre deux paragraphes, sinon entre deux mots.
 */
export function paginateText(text, pageSize = 1800) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const pages = [];
  let current = '';

  const flush = () => {
    if (current.trim()) pages.push(current.trim());
    current = '';
  };

  for (const raw of paragraphs) {
    const para = raw.replace(/\s*\n\s*/g, ' ').trim();
    if (!para) continue;
    if (current.length + para.length + 2 <= pageSize) {
      current += (current ? '\n\n' : '') + para;
      continue;
    }
    flush();
    if (para.length <= pageSize) {
      current = para;
      continue;
    }
    // Paragraphe trop long : on coupe entre deux mots.
    let rest = para;
    while (rest.length > pageSize) {
      let cut = rest.lastIndexOf(' ', pageSize);
      if (cut < pageSize * 0.5) cut = pageSize;
      pages.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    current = rest;
  }
  flush();
  return pages.length ? pages : [''];
}

/** Minutes estimées pour lire `totalPages` à `pagesPerMin` pages/minute. */
export function estimateReadingMinutes(totalPages, pagesPerMin = 1) {
  const speed = pagesPerMin > 0 ? pagesPerMin : 1;
  return Math.max(1, Math.round(totalPages / speed));
}

/**
 * Nouvelle vitesse de lecture (moyenne glissante) après une session.
 * Les sessions trop courtes (< 2 min ou < 2 pages) sont ignorées.
 */
export function updateReadingSpeed(currentSpeed, pagesRead, activeSeconds) {
  if (activeSeconds < 120 || pagesRead < 2) return currentSpeed;
  const sessionSpeed = pagesRead / (activeSeconds / 60);
  const clamped = Math.min(5, Math.max(0.2, sessionSpeed));
  return Math.round((currentSpeed * 0.7 + clamped * 0.3) * 100) / 100;
}

/** Retire l'en-tête et le pied de page de licence ajoutés par Project Gutenberg. */
export function stripGutenbergBoilerplate(text) {
  const start = text.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = text.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  let body = text;
  if (end > 0) body = body.slice(0, end);
  if (start >= 0) body = body.slice(body.indexOf('\n', start) + 1);
  return body.trim();
}
