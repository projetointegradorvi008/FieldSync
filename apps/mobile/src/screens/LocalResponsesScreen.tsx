import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LocalResponse, listLocalResponses } from '../services/responses/responses-repository';
import { colors, radius } from '../theme/colors';

// "Minhas coletas": lista as respostas já gravadas neste aparelho (qualquer
// status), agrupadas por pesquisa. Sincronizar não tem mais botão aqui —
// existe um único ponto de sincronização manual, na tela inicial
// (HomeScreen), para não duplicar a ação em dois lugares.
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCING: 'Sincronizando',
  SYNCED: 'Sincronizada',
  FAILED_MANUAL_REQUIRED: 'Falhou — toque em Sincronizar para tentar de novo',
  CONFLICT: 'Em conflito',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: colors.warning,
  SYNCING: colors.primary,
  SYNCED: colors.success,
  FAILED_MANUAL_REQUIRED: colors.destructive,
  CONFLICT: colors.conflict,
};

const STATUS_SOFT: Record<string, string> = {
  PENDING: colors.warningSoft,
  SYNCING: colors.accentSoft,
  SYNCED: colors.successSoft,
  FAILED_MANUAL_REQUIRED: colors.destructiveSoft,
  CONFLICT: colors.conflictSoft,
};

interface Section {
  title: string;
  data: LocalResponse[];
}

function groupBySurvey(responses: LocalResponse[]): Section[] {
  const bySurvey = new Map<string, Section>();
  for (const response of responses) {
    const existing = bySurvey.get(response.surveyId);
    if (existing) {
      existing.data.push(response);
    } else {
      bySurvey.set(response.surveyId, { title: response.surveyTitle, data: [response] });
    }
  }
  return Array.from(bySurvey.values());
}

export function LocalResponsesScreen({
  onBack,
  onOpenResponse,
}: {
  onBack: () => void;
  onOpenResponse: (responseId: string) => void;
}) {
  const [responses, setResponses] = useState<LocalResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setResponses(await listLocalResponses());
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const sections = useMemo(() => groupBySurvey(responses), [responses]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Minhas coletas</Text>
      </View>

      {isLoading ? (
        <Text style={styles.empty}>Carregando...</Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma coleta registrada ainda.</Text>}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>
              {section.title} ({section.data.length})
            </Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpenResponse(item.id)}>
              <View
                style={[styles.statusPill, { backgroundColor: STATUS_SOFT[item.status] ?? colors.border }]}
              >
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] ?? colors.mutedForeground }]} />
                <Text style={[styles.cardStatus, { color: STATUS_COLOR[item.status] ?? colors.foreground }]}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
              <Text style={styles.cardMeta}>Coletado em {new Date(item.collectedAt).toLocaleString('pt-BR')}</Text>
              {item.lastError && <Text style={styles.cardError}>{item.lastError}</Text>}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, paddingHorizontal: 18, gap: 14, backgroundColor: colors.background },
  header: { gap: 4 },
  back: { color: colors.primary, fontWeight: '500' },
  title: { fontSize: 21, fontWeight: '700', color: colors.foreground },
  empty: { textAlign: 'center', color: colors.mutedForeground, marginTop: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  list: { paddingBottom: 24 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.mutedForeground,
    backgroundColor: colors.background,
    paddingTop: 14,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusDot: { width: 7, height: 7, borderRadius: radius.pill },
  cardStatus: { fontSize: 12, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: colors.mutedForeground },
  cardError: { fontSize: 12, color: colors.destructive },
});
