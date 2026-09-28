import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LocalSurvey, listLocalSurveys, syncSurveys } from '../services/surveys/surveys-repository';
import { getFriendlyErrorMessage, showAlert } from '../utils/alert';
import { colors, radius } from '../theme/colors';

// Lista de pesquisas atribuídas ao pesquisador. Mostra primeiro o cache
// local (funciona offline) e tenta atualizar em segundo plano via
// syncSurveys(); um card só é abrível se o schema da versão atual já foi
// baixado (hasCachedVersion) — sem isso não há como renderizar o formulário
// offline. listLocalSurveys() já só retorna pesquisas PUBLISHED (ver
// surveys-repository.ts), então STATUS_LABEL aqui só existe por segurança.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Arquivada',
};

type SortOption = 'title' | 'startsAt_desc' | 'startsAt_asc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'title', label: 'Título (A–Z)' },
  { value: 'startsAt_desc', label: 'Mais recentes' },
  { value: 'startsAt_asc', label: 'Mais antigas' },
];

// `startsAt` é o campo de data mais próximo de "data de publicação"
// disponível localmente (LocalSurvey não guarda um createdAt/publishedAt
// separado) — pesquisas sem data ficam sempre por último nas ordenações por
// data, mas continuam ordenadas por título entre si.
function sortSurveys(surveys: LocalSurvey[], sort: SortOption): LocalSurvey[] {
  const sorted = [...surveys];
  switch (sort) {
    case 'startsAt_desc':
      return sorted.sort((a, b) => {
        if (!a.startsAt && !b.startsAt) return a.title.localeCompare(b.title);
        if (!a.startsAt) return 1;
        if (!b.startsAt) return -1;
        return b.startsAt.localeCompare(a.startsAt);
      });
    case 'startsAt_asc':
      return sorted.sort((a, b) => {
        if (!a.startsAt && !b.startsAt) return a.title.localeCompare(b.title);
        if (!a.startsAt) return 1;
        if (!b.startsAt) return -1;
        return a.startsAt.localeCompare(b.startsAt);
      });
    case 'title':
    default:
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export function SurveysScreen({
  onBack,
  onOpenSurvey,
}: {
  onBack: () => void;
  onOpenSurvey: (survey: LocalSurvey) => void;
}) {
  const [surveys, setSurveys] = useState<LocalSurvey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<SortOption>('title');

  const sortedSurveys = useMemo(() => sortSurveys(surveys, sort), [surveys, sort]);

  const loadFromCache = useCallback(async () => {
    setSurveys(await listLocalSurveys());
  }, []);

  useEffect(() => {
    (async () => {
      await loadFromCache();
      setIsLoading(false);
      try {
        setSurveys(await syncSurveys());
      } catch (err) {
        showAlert('Falha ao sincronizar pesquisas', getFriendlyErrorMessage(err, 'Não foi possível atualizar a lista de pesquisas.'));
      }
    })();
  }, [loadFromCache]);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      setSurveys(await syncSurveys());
    } catch (err) {
      showAlert('Falha ao sincronizar pesquisas', getFriendlyErrorMessage(err, 'Não foi possível atualizar a lista de pesquisas.'));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Minhas pesquisas</Text>
      </View>

      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.sortChip, sort === option.value && styles.sortChipSelected]}
            onPress={() => setSort(option.value)}
          >
            <Text style={sort === option.value ? styles.sortChipTextSelected : styles.sortChipText}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <Text style={styles.empty}>Carregando...</Text>
      ) : (
        <FlatList
          data={sortedSurveys}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={sortedSurveys.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma pesquisa atribuída ainda.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              disabled={!item.hasCachedVersion}
              onPress={() => onOpenSurvey(item)}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
              <Text style={styles.cardMeta}>
                {STATUS_LABEL[item.status] ?? item.status} · versão {item.currentVersion} ·{' '}
                <Text style={item.hasCachedVersion ? styles.avail : styles.unavail}>
                  {item.hasCachedVersion ? 'formulário disponível offline' : 'formulário não baixado'}
                </Text>
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 18,
    gap: 14,
    backgroundColor: colors.background,
  },
  header: {
    gap: 4,
  },
  back: {
    color: colors.primary,
    fontWeight: '500',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.foreground,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  sortChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft,
  },
  sortChipText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  sortChipTextSelected: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: colors.mutedForeground,
    marginTop: 24,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 12,
    gap: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  cardDescription: {
    color: colors.mutedForeground,
    fontSize: 12.5,
    lineHeight: 18,
  },
  cardMeta: {
    fontSize: 11.5,
    color: colors.mutedForeground,
  },
  avail: {
    color: colors.success,
    fontWeight: '600',
  },
  unavail: {
    color: colors.mutedForeground,
  },
});
