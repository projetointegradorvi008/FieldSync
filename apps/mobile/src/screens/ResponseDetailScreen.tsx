import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LocalResponseDetail, getLocalResponseDetail } from '../services/responses/responses-repository';
import { getCachedSchemaByVersionId } from '../services/surveys/surveys-repository';
import { SchemaQuestion } from '../services/surveys/schema-types';
import { colors, radius } from '../theme/colors';

// Detalhe de uma coleta local específica: junta a resposta salva no SQLite
// com o schema em cache (para mostrar o label de cada pergunta, não só o
// id interno) — respostas, localização e status de sincronização.
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCING: 'Sincronizando',
  SYNCED: 'Sincronizada',
  FAILED_MANUAL_REQUIRED: 'Falhou — sincronize novamente',
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ResponseDetailScreen({
  responseId,
  onBack,
}: {
  responseId: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<LocalResponseDetail | null>(null);
  const [questionById, setQuestionById] = useState<Record<string, SchemaQuestion>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const found = await getLocalResponseDetail(responseId);
      setDetail(found);
      if (found) {
        const schema = await getCachedSchemaByVersionId(found.surveyVersionId);
        if (schema) {
          const map: Record<string, SchemaQuestion> = {};
          for (const section of schema.sections) {
            for (const question of section.questions) map[question.id] = question;
          }
          setQuestionById(map);
        }
      }
      setIsLoading(false);
    })();
  }, [responseId]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Carregando...</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
        <Text style={styles.empty}>Coleta não encontrada.</Text>
      </View>
    );
  }

  const answerEntries = Object.entries(detail.answers);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>{'< Voltar'}</Text>
      </TouchableOpacity>

      <View style={styles.headRow}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_SOFT[detail.status] ?? colors.border }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[detail.status] ?? colors.mutedForeground }]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[detail.status] ?? colors.foreground }]}>
            {STATUS_LABEL[detail.status] ?? detail.status}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.section}>
          <Text style={styles.label}>Coletado em</Text>
          <Text style={styles.value}>{new Date(detail.collectedAt).toLocaleString('pt-BR')}</Text>
        </View>

        {detail.syncedAt && (
          <View style={styles.section}>
            <Text style={styles.label}>Sincronizado em</Text>
            <Text style={styles.value}>{new Date(detail.syncedAt).toLocaleString('pt-BR')}</Text>
          </View>
        )}

        {detail.respondentId && (
          <View style={styles.section}>
            <Text style={styles.label}>Entrevistado</Text>
            <Text style={styles.value}>{detail.respondentId}</Text>
          </View>
        )}

        {detail.lastError && (
          <View style={styles.section}>
            <Text style={styles.label}>Última mensagem</Text>
            <Text style={[styles.value, styles.error]}>{detail.lastError}</Text>
          </View>
        )}
      </View>

      {detail.latitude != null && detail.longitude != null && (
        <View style={styles.locationBox}>
          <Text style={styles.value}>
            {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
          </Text>
          {detail.accuracy != null && <Text style={styles.label}>precisão: ±{detail.accuracy}m</Text>}
        </View>
      )}

      <Text style={styles.sectionTitle}>Respostas</Text>
      {answerEntries.map(([questionId, value]) => (
        <View key={questionId} style={styles.answerCard}>
          <Text style={styles.answerLabel}>{questionById[questionId]?.label ?? questionId}</Text>
          <Text style={styles.answerValue}>{formatValue(value)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, paddingHorizontal: 18, backgroundColor: colors.background },
  content: { paddingBottom: 32, gap: 12 },
  back: { color: colors.primary, fontWeight: '500', marginBottom: 8 },
  empty: { textAlign: 'center', color: colors.mutedForeground, marginTop: 24 },
  headRow: { flexDirection: 'row' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: radius.pill },
  statusText: { fontWeight: '600', fontSize: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  section: { gap: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.mutedForeground, marginTop: 4 },
  label: { fontSize: 12, color: colors.mutedForeground },
  value: { fontSize: 14, color: colors.foreground },
  error: { color: colors.destructive },
  locationBox: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 2,
  },
  answerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 12,
    gap: 3,
  },
  answerLabel: { fontSize: 12, color: colors.mutedForeground },
  answerValue: { fontSize: 14.5, fontWeight: '500', color: colors.foreground },
});
