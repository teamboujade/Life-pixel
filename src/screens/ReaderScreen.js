// Module Lecture (sections 5, 9, 18) : livres gratuits Gutenberg + import PDF,
// estimation du temps de lecture et chronomètre de lecture active.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen, Header, Card, Button, ProgressBar } from '../components/ui';
import { searchFreeBooks, loadBookText, pickLocalPdfDocument } from '../services/bookFinder';
import { paginateText, estimateReadingMinutes } from '../services/reading';
import { buildPdfHtml } from '../services/pdfWebView';
import { useReadingTimer } from '../hooks/useReadingTimer';
import { useAppStore } from '../store/useAppStore';
import { formatDuration } from '../utils/geometry';
import { colors } from '../theme';

// ───────────────────────── Session de lecture ─────────────────────────

function ReadingSession({ doc, onClose }) {
  const speed = useAppStore((s) => s.readingSpeedPagesPerMin);
  const saved = useAppStore((s) => s.bookProgress[doc.id]);
  const setBookProgress = useAppStore((s) => s.setBookProgress);
  const addReadingSession = useAppStore((s) => s.addReadingSession);

  const [totalPages, setTotalPages] = useState(doc.pages?.length ?? saved?.totalPages ?? 0);
  const [page, setPage] = useState(Math.min(saved?.page ?? 1, doc.pages?.length ?? Infinity));
  const [fontSize, setFontSize] = useState(18);
  const pagesSeen = useRef(new Set([page]));
  const scrollRef = useRef(null);
  const { activeSeconds, paused, pauseReason, markActivity, resume } = useReadingTimer();

  // Temps estimé pour finir le document à partir de la page de départ.
  const [startPage] = useState(page);
  const remainingPages = Math.max(1, totalPages - startPage + 1);
  const estimatedMinutes = estimateReadingMinutes(remainingPages, speed);
  const progressPercentage = Math.min(100, Math.floor((activeSeconds / (estimatedMinutes * 60)) * 100));

  const goTo = (p) => {
    const next = Math.max(1, Math.min(totalPages, p));
    setPage(next);
    pagesSeen.current.add(next);
    markActivity();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const close = () => {
    addReadingSession({
      bookId: doc.id,
      title: doc.title,
      totalPages,
      pagesRead: Math.max(0, pagesSeen.current.size - 1),
      activeSeconds,
    });
    setBookProgress(doc.id, {
      page,
      totalPages,
      title: doc.title,
      author: doc.author,
      kind: doc.kind,
      textUrl: doc.textUrl,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const pdfHtml = useMemo(
    () => (doc.kind === 'pdf' ? buildPdfHtml(doc.base64, saved?.page ?? 1) : null),
    // Le HTML ne doit être construit qu'une fois par document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id],
  );

  const onPdfMessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'loaded') setTotalPages(msg.numPages);
    if (msg.type === 'page') {
      setPage(msg.page);
      pagesSeen.current.add(msg.page);
      markActivity();
    }
    if (msg.type === 'activity') markActivity();
  };

  return (
    <Screen>
      <View style={s.topBar}>
        <Pressable onPress={close} accessibilityRole="button" hitSlop={12}>
          <Text style={s.back}>‹ Bibliothèque</Text>
        </Pressable>
        <Text style={s.timer}>{formatDuration(activeSeconds)}</Text>
      </View>
      <View style={s.sessionInfo}>
        <Text style={s.docTitle} numberOfLines={1}>
          {doc.title}
        </Text>
        <Text style={s.meta}>
          Page {page}/{totalPages || '…'} · estimé {estimatedMinutes} min · progression {progressPercentage}%
        </Text>
        <ProgressBar value={progressPercentage} />
      </View>

      <View style={{ flex: 1 }} onTouchStart={markActivity}>
        {doc.kind === 'pdf' ? (
          <WebView
            source={{ html: pdfHtml, baseUrl: 'https://localhost/' }}
            originWhitelist={['*']}
            onMessage={onPdfMessage}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.textPage}
            onScroll={markActivity}
            scrollEventThrottle={2000}
          >
            <Text style={[s.bookText, { fontSize, lineHeight: fontSize * 1.55 }]} selectable>
              {doc.pages[page - 1]}
            </Text>
          </ScrollView>
        )}

        {paused && (
          <Pressable style={s.pauseOverlay} onPress={resume} accessibilityRole="button">
            <Text style={s.pauseTitle}>⏸</Text>
            <Text style={s.pauseText}>{pauseReason}</Text>
            <Text style={s.pauseHint}>Touchez pour reprendre</Text>
          </Pressable>
        )}
      </View>

      {doc.kind === 'text' && (
        <View style={s.pager}>
          <Button label="‹" variant="ghost" onPress={() => goTo(page - 1)} disabled={page <= 1} style={s.pagerBtn} />
          <Button label="A−" variant="ghost" onPress={() => setFontSize((f) => Math.max(14, f - 2))} style={s.pagerBtn} />
          <Button label="A+" variant="ghost" onPress={() => setFontSize((f) => Math.min(28, f + 2))} style={s.pagerBtn} />
          <Button label="›" onPress={() => goTo(page + 1)} disabled={page >= totalPages} style={s.pagerBtn} />
        </View>
      )}
    </Screen>
  );
}

// ───────────────────────── Bibliothèque ─────────────────────────

export default function ReaderScreen() {
  const bookProgress = useAppStore((s) => s.bookProgress);
  const speed = useAppStore((s) => s.readingSpeedPagesPerMin);
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('fr');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(true);
  const [offline, setOffline] = useState(false);
  const [opening, setOpening] = useState(null);
  const [doc, setDoc] = useState(null);

  const runSearch = useCallback(async (q, lang) => {
    setSearching(true);
    const { books, offline: off } = await searchFreeBooks(q, lang);
    setResults(books);
    setOffline(off);
    setSearching(false);
  }, []);
  const search = () => runSearch(query, language);

  // Suggestions (livres populaires en français) au premier affichage.
  useEffect(() => {
    searchFreeBooks('', 'fr').then(({ books, offline: off }) => {
      setResults(books);
      setOffline(off);
      setSearching(false);
    });
  }, []);

  const openBook = async (book) => {
    setOpening(book.id);
    try {
      const text = await loadBookText(book);
      setDoc({ kind: 'text', ...book, pages: paginateText(text) });
    } catch (e) {
      Alert.alert('Erreur', `Impossible d’ouvrir ce livre : ${e.message}`);
    } finally {
      setOpening(null);
    }
  };

  const importPdf = async () => {
    try {
      const pdf = await pickLocalPdfDocument();
      if (pdf) setDoc({ kind: 'pdf', ...pdf });
    } catch (e) {
      Alert.alert('Erreur', `Import impossible : ${e.message}`);
    }
  };

  if (doc) return <ReadingSession doc={doc} onClose={() => setDoc(null)} />;

  const recent = Object.entries(bookProgress)
    .filter(([, p]) => p.kind === 'text' && p.textUrl)
    .sort((a, b) => (b[1].updatedAt ?? '').localeCompare(a[1].updatedAt ?? ''))
    .slice(0, 5);

  return (
    <Screen>
      <FlatList
        data={results}
        keyExtractor={(b) => b.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            <Header
              title="Lecture"
              subtitle={`Livres libres de droits et vos PDF · vitesse actuelle ${speed} page/min`}
            />
            <Card title="Mes documents">
              <Button label="Importer un PDF du téléphone" onPress={importPdf} />
              {recent.map(([id, p]) => (
                <Pressable
                  key={id}
                  style={s.recent}
                  onPress={() => openBook({ id, title: p.title, author: p.author, textUrl: p.textUrl })}
                >
                  <Text style={s.recentTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={s.meta}>
                    Reprendre page {p.page}/{p.totalPages}
                  </Text>
                </Pressable>
              ))}
            </Card>
            <Card title="Bibliothèque gratuite (Project Gutenberg)">
              <View style={s.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={search}
                  placeholder="Titre ou auteur (ex. Hugo)"
                  placeholderTextColor={colors.muted}
                  returnKeyType="search"
                  style={s.input}
                />
                <Button label="OK" onPress={search} style={{ paddingHorizontal: 16 }} />
              </View>
              <View style={s.langs}>
                {[
                  ['fr', 'Français'],
                  ['en', 'Anglais'],
                  ['', 'Toutes'],
                ].map(([code, label]) => (
                  <Pressable
                    key={code || 'all'}
                    onPress={() => {
                      setLanguage(code);
                      runSearch(query, code);
                    }}
                    style={[s.chip, language === code && s.chipOn]}
                  >
                    <Text style={[s.chipText, language === code && { color: '#fff' }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {searching && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}
              {!searching && offline && (
                <Text style={[s.meta, { marginTop: 8 }]}>
                  Le catalogue complet ne répond pas pour l’instant : voici une sélection de classiques gratuits.
                </Text>
              )}
              {!searching && results.length === 0 && (
                <Text style={[s.meta, { marginTop: 8 }]}>Aucun résultat.</Text>
              )}
            </Card>
          </>
        }
        renderItem={({ item }) => (
          <Pressable style={s.book} onPress={() => openBook(item)} disabled={!!opening}>
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={s.cover} />
            ) : (
              <View style={[s.cover, { backgroundColor: colors.border }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.bookTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={s.meta}>{item.author}</Text>
            </View>
            {opening === item.id && <ActivityIndicator color={colors.accent} />}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  timer: { color: colors.accent, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionInfo: { paddingHorizontal: 16, paddingBottom: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  docTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
  textPage: { padding: 20, paddingBottom: 40 },
  bookText: { color: colors.text },
  pager: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  pagerBtn: { flex: 1, paddingVertical: 10 },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.92)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  pauseTitle: { fontSize: 40, color: colors.text },
  pauseText: { color: colors.text, fontSize: 16, textAlign: 'center', marginTop: 12 },
  pauseHint: { color: colors.primary, marginTop: 16, fontWeight: '700' },
  recent: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10 },
  recentTitle: { color: colors.text, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    minHeight: 48,
  },
  langs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '600' },
  book: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  cover: { width: 44, height: 64, borderRadius: 4 },
  bookTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
