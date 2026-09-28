import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../services/auth/auth-context';
import { getOrCreateDeviceId } from '../services/auth/device-id';
import {
  getSessionValue,
  setSessionValue,
} from '../services/collection/session-context';
import { Draft, deleteDraft, getOrCreateDraft, saveDraftAnswers } from '../services/drafts/drafts-repository';
import {
  SavedHeader,
  deleteSavedHeader,
  listSavedHeaders,
  saveHeader,
} from '../services/collection/saved-headers-repository';
import { CapturedLocation, captureLocation } from '../services/location/location';
import { finalizeResponse } from '../services/responses/responses-repository';
import { refreshPendingCount } from '../services/sync/auto-sync';
import { getCachedSchema } from '../services/surveys/surveys-repository';
import { SchemaQuestion, SchemaSection, SurveySchema } from '../services/surveys/schema-types';
import { getFriendlyErrorMessage } from '../utils/alert';
import { colors, radius } from '../theme/colors';

// Renderiza dinamicamente um formulário a partir do schema em cache (Contrato
// C1): navega por seções, valida obrigatórios, salva rascunho a cada
// mudança de resposta (saveDraftAnswers) e, ao concluir, captura GPS e
// grava a resposta finalizada no SQLite local com status PENDING.
interface FormRendererScreenProps {
  surveyId: string;
  version: number;
  onExit: () => void;
}

const SESSION_SCOPABLE_TYPES = new Set(['TEXT', 'SINGLE_CHOICE', 'NUMBER']);

// Auto-insere "/" (DD/MM/AAAA) e ":" (HH:mm) enquanto o pesquisador digita —
// evita que ele precise digitar os separadores manualmente. Reformata a
// partir dos dígitos do valor recebido a cada mudança (abordagem simples,
// sem controle de posição do cursor — backspace em cima de um separador
// remove o dígito anterior a ele, comportamento aceitável para este caso).
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean).join(':');
}

// Indicador exibido abaixo de uma pergunta GPS: captura a localização atual
// e mostra só as coordenadas em texto, sem mini-mapa. Um mini-mapa com tiles
// do OpenStreetMap já foi usado aqui, mas o tile server da OSM bloqueia
// requisições diretas de apps sem User-Agent/Referer conforme sua política
// de uso (erro 403 Access blocked) — não compensa montar um proxy só para
// isso quando a informação que importa (a coordenada capturada) já está
// disponível em texto. Não usa react-native-maps — essa lib não funciona no
// Expo Go (exige build de desenvolvimento nativo), inviável para o fluxo
// deste app (ver AGENTS.md). A captura aqui é só para exibição — o
// handleFinalize abaixo captura de novo (mais atual) na hora de submeter.
function GpsPreviewMap() {
  const [location, setLocation] = useState<CapturedLocation | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    captureLocation().then((result) => {
      if (!cancelled) setLocation(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (location === undefined) {
    return (
      <View style={styles.mapPreview}>
        <ActivityIndicator />
      </View>
    );
  }

  if (location === null) {
    return (
      <Text style={styles.placeholder}>
        Não foi possível obter a localização agora — verifique se o GPS está ativado e a permissão concedida.
        Será tentado novamente ao concluir.
      </Text>
    );
  }

  return (
    <View style={styles.gpsBox}>
      <Text style={styles.gpsCoords}>
        {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
      </Text>
      {location.accuracy != null && (
        <Text style={styles.gpsAccuracy}>precisão: ±{Math.round(location.accuracy)}m · capturado agora</Text>
      )}
    </View>
  );
}

// TEXT/NUMBER/BOOLEAN/SINGLE_CHOICE/MULTIPLE_CHOICE/DATE/TIME são
// totalmente interativos aqui. GPS nunca bloqueia por obrigatoriedade a nível
// de campo — a localização é UMA por resposta (não por pergunta), capturada
// ao finalizar (ver 4.5 na spec); se a captura falhar com uma pergunta GPS
// obrigatória, quem finaliza barra a conclusão (ver handleFinalize).
function isAnswered(question: SchemaQuestion, value: unknown): boolean {
  switch (question.type) {
    case 'TEXT':
    case 'DATE':
    case 'TIME':
      return typeof value === 'string' && value.trim().length > 0;
    case 'NUMBER':
      return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value));
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'SINGLE_CHOICE':
      return typeof value === 'string' && value.length > 0;
    case 'MULTIPLE_CHOICE': {
      const minSelect = (question.config?.minSelect as number | undefined) ?? 1;
      return Array.isArray(value) && value.length >= minSelect;
    }
    case 'GPS':
      return true;
    default:
      return true;
  }
}

function hasGpsQuestion(sections: SchemaSection[]): boolean {
  return sections.some((section) => section.questions.some((q) => q.type === 'GPS'));
}

function isGpsRequired(sections: SchemaSection[]): boolean {
  return sections.some((section) => section.questions.some((q) => q.type === 'GPS' && q.required));
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: SchemaQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (question.type) {
    case 'TEXT':
      return (
        <TextInput
          style={styles.input}
          value={(value as string) ?? ''}
          onChangeText={onChange}
          maxLength={question.config?.maxLength as number | undefined}
          placeholder="Digite sua resposta"
        />
      );
    case 'NUMBER':
      return (
        <TextInput
          style={styles.input}
          value={(value as string) ?? ''}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
        />
      );
    case 'DATE':
      return (
        <TextInput
          style={styles.input}
          value={(value as string) ?? ''}
          onChangeText={(text) => onChange(formatDateInput(text))}
          keyboardType="numeric"
          maxLength={10}
          placeholder={(question.config?.format as string) ?? 'DD/MM/AAAA'}
        />
      );
    case 'TIME':
      return (
        <TextInput
          style={styles.input}
          value={(value as string) ?? ''}
          onChangeText={(text) => onChange(formatTimeInput(text))}
          keyboardType="numeric"
          maxLength={5}
          placeholder={(question.config?.format as string) ?? 'HH:mm'}
        />
      );
    case 'BOOLEAN':
      return (
        <View style={styles.row}>
          {[
            { label: 'Sim', val: true },
            { label: 'Não', val: false },
          ].map((option) => (
            <TouchableOpacity
              key={option.label}
              style={[styles.choice, value === option.val && styles.choiceSelected]}
              onPress={() => onChange(option.val)}
            >
              <Text style={value === option.val ? styles.choiceTextSelected : styles.choiceText}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    case 'SINGLE_CHOICE':
      return (
        <View style={styles.column}>
          {((question.config?.options as string[]) ?? []).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.choice, value === option && styles.choiceSelected]}
              onPress={() => onChange(option)}
            >
              <Text style={value === option ? styles.choiceTextSelected : styles.choiceText}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    case 'MULTIPLE_CHOICE': {
      const selected = (value as string[] | undefined) ?? [];
      const maxSelect = question.config?.maxSelect as number | undefined;
      return (
        <View style={styles.column}>
          {((question.config?.options as string[]) ?? []).map((option) => {
            const isSelected = selected.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[styles.choice, isSelected && styles.choiceSelected]}
                onPress={() => {
                  if (isSelected) {
                    onChange(selected.filter((o) => o !== option));
                  } else if (!maxSelect || selected.length < maxSelect) {
                    onChange([...selected, option]);
                  }
                }}
              >
                <Text style={isSelected ? styles.choiceTextSelected : styles.choiceText}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    case 'GPS':
      return (
        <View style={styles.column}>
          <Text style={styles.placeholder}>A localização desta resposta será capturada automaticamente ao concluir — confira abaixo:</Text>
          <GpsPreviewMap />
        </View>
      );
    default:
      return null;
  }
}

export function FormRendererScreen({ surveyId, version, onExit }: FormRendererScreenProps) {
  const { user } = useAuth();
  const [schema, setSchema] = useState<SurveySchema | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedHeaders, setSavedHeaders] = useState<SavedHeader[]>([]);

  async function loadForm() {
    setIsLoading(true);
    setSectionIndex(0);
    try {
      const cachedSchema = await getCachedSchema(surveyId, version);
      if (!cachedSchema) {
        setLoadError('Formulário não baixado. Volte e puxe a lista para atualizar.');
        return;
      }

      const loadedDraft = await getOrCreateDraft(surveyId, cachedSchema.versionId);

      // Rascunho novo (sem respostas ainda): pré-preenche com o último valor
      // da sessão de coleta atual (RF11) tanto perguntas sessionScoped quanto
      // TODAS as perguntas da seção cabeçalho (isHeader) — o cabeçalho só
      // precisa ser respondido uma vez por sessão, mas continua editável a
      // qualquer momento por já vir preenchido e navegável normalmente.
      let initialAnswers = loadedDraft.answers;
      if (Object.keys(loadedDraft.answers).length === 0) {
        const prefilled: Record<string, unknown> = {};
        for (const section of cachedSchema.sections) {
          for (const question of section.questions) {
            if (section.isHeader || question.config?.sessionScoped) {
              const remembered = getSessionValue(surveyId, question.id);
              if (remembered !== undefined) prefilled[question.id] = remembered;
            }
          }
        }
        initialAnswers = prefilled;
        if (Object.keys(prefilled).length > 0) {
          await saveDraftAnswers(loadedDraft.id, prefilled);
        }
      }

      setSchema(cachedSchema);
      setDraft(loadedDraft);
      setAnswers(initialAnswers);
      setErrors({});
      setSavedHeaders(await listSavedHeaders(surveyId));
    } catch (err) {
      setLoadError(getFriendlyErrorMessage(err, 'Falha ao carregar formulário.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar
    loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, version]);

  const bodySections = useMemo(
    () => (schema?.sections ?? []).filter((section) => section.questions.length > 0),
    [schema],
  );

  // Perguntas da seção cabeçalho reaproveitam o valor da sessão de coleta
  // independente do tipo/checkbox sessionScoped (ver loadForm) — GPS nunca
  // aparece aqui, o Backend já bloqueia isso ao publicar.
  const headerQuestionIds = useMemo(() => {
    const header = bodySections.find((section) => section.isHeader);
    return new Set((header?.questions ?? []).map((q) => q.id));
  }, [bodySections]);

  const currentSection = bodySections[sectionIndex];
  const isLastSection = bodySections.length > 0 && sectionIndex === bodySections.length - 1;

  function updateAnswer(question: SchemaQuestion, value: unknown) {
    setAnswers((current) => {
      const next = { ...current, [question.id]: value };
      if (draft) saveDraftAnswers(draft.id, next).catch(() => {});
      return next;
    });
    setErrors((current) => ({ ...current, [question.id]: false }));

    if (
      headerQuestionIds.has(question.id) ||
      (SESSION_SCOPABLE_TYPES.has(question.type) && question.config?.sessionScoped)
    ) {
      setSessionValue(surveyId, question.id, value);
    }
  }

  // Aplica todas as respostas de um cabeçalho salvo de uma vez (ver botão
  // "Salvar cabeçalho" abaixo) — reusa updateAnswer por pergunta para manter
  // o rascunho e a sessão de coleta consistentes, igual a digitar cada campo.
  function applySavedHeader(saved: SavedHeader) {
    const header = bodySections.find((section) => section.isHeader);
    if (!header) return;
    for (const question of header.questions) {
      if (saved.answers[question.id] !== undefined) {
        updateAnswer(question, saved.answers[question.id]);
      }
    }
  }

  async function handleSaveHeader() {
    const header = bodySections.find((section) => section.isHeader);
    if (!header) return;

    const headerAnswers: Record<string, unknown> = {};
    for (const question of header.questions) {
      if (answers[question.id] !== undefined) headerAnswers[question.id] = answers[question.id];
    }
    if (Object.keys(headerAnswers).length === 0) {
      Alert.alert('Nada para salvar', 'Preencha ao menos um campo do cabeçalho antes de salvar.');
      return;
    }

    // Resumo legível a partir dos dois primeiros valores preenchidos — evita
    // pedir um nome ao pesquisador (Alert.prompt não existe no Android).
    const label = header.questions
      .map((q) => headerAnswers[q.id])
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .slice(0, 2)
      .join(' · ') || `Cabeçalho ${savedHeaders.length + 1}`;

    const saved = await saveHeader(surveyId, label, headerAnswers);
    setSavedHeaders((current) => [saved, ...current]);
    Alert.alert('Cabeçalho salvo', 'Ele vai aparecer na lista de cabeçalhos salvos desta pesquisa.');
  }

  function handleDeleteSavedHeader(saved: SavedHeader) {
    Alert.alert('Excluir cabeçalho salvo', `Excluir "${saved.label}" da lista desta pesquisa?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedHeader(saved.id);
          setSavedHeaders((current) => current.filter((h) => h.id !== saved.id));
        },
      },
    ]);
  }

  function validateSection(section: NonNullable<typeof currentSection>): boolean {
    const nextErrors: Record<string, boolean> = {};
    let allValid = true;
    for (const question of section.questions) {
      if (question.required && !isAnswered(question, answers[question.id])) {
        nextErrors[question.id] = true;
        allValid = false;
      }
    }
    setErrors((current) => ({ ...current, ...nextErrors }));
    return allValid;
  }

  async function handleFinalize() {
    if (!schema || !draft || !user) return;

    setIsFinalizing(true);
    try {
      let location = null;
      if (hasGpsQuestion(bodySections)) {
        location = await captureLocation();
        if (!location && isGpsRequired(bodySections)) {
          Alert.alert(
            'Localização necessária',
            'Este formulário exige localização. Verifique se o GPS está ativado e a permissão de localização concedida, e tente novamente.',
          );
          return;
        }
      }

      const textAnswers: Record<string, unknown> = {};
      for (const section of bodySections) {
        for (const question of section.questions) {
          const value = answers[question.id];
          if (value !== undefined) textAnswers[question.id] = value;
        }
      }

      const deviceId = await getOrCreateDeviceId();
      await finalizeResponse({
        surveyId,
        surveyVersionId: schema.versionId,
        researcherId: user.id,
        deviceId,
        answers: textAnswers,
        location,
      });
      await deleteDraft(draft.id);
      await refreshPendingCount();

      Alert.alert('Coleta finalizada', 'A resposta foi salva no dispositivo e aguarda sincronização.', [
        { text: 'Nova coleta', onPress: () => loadForm() },
        { text: 'Voltar à lista', onPress: onExit },
      ]);
    } catch (err) {
      Alert.alert('Falha ao finalizar', getFriendlyErrorMessage(err, 'Tente novamente.'));
    } finally {
      setIsFinalizing(false);
    }
  }

  function handleNext() {
    if (!currentSection) return;
    if (!validateSection(currentSection)) return;

    if (isLastSection) {
      const allValid = bodySections.every((section) => validateSection(section));
      if (!allValid) return;
      handleFinalize();
      return;
    }
    setSectionIndex((i) => i + 1);
  }

  function handleBack() {
    if (sectionIndex > 0) setSectionIndex((i) => i - 1);
    else onExit();
  }

  function handleClearAnswers() {
    Alert.alert(
      'Limpar dados preenchidos',
      'Isso apaga todas as respostas já preenchidas nesta coleta. Confirma?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            setAnswers({});
            setErrors({});
            setSectionIndex(0);
            if (draft) saveDraftAnswers(draft.id, {}).catch(() => {});
          },
        },
      ],
    );
  }

  const requiredCount = useMemo(
    () => currentSection?.questions.filter((q) => q.required).length ?? 0,
    [currentSection],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError || !schema) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError ?? 'Formulário indisponível.'}</Text>
        <TouchableOpacity onPress={onExit}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentSection) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Formulário sem perguntas para coletar.</Text>
        <TouchableOpacity onPress={onExit}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.back}>{'< Voltar'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{schema.title}</Text>
        {schema.description && <Text style={styles.description}>{schema.description}</Text>}
        <Text style={styles.sectionMeta}>
          Seção {sectionIndex + 1} de {bodySections.length}
          {requiredCount > 0 ? ` · ${requiredCount} obrigatória(s)` : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>{currentSection.title ?? ''}</Text>
        {currentSection.isHeader && (
          <Text style={styles.headerHint}>
            Cabeçalho da coleta — respondido uma vez por sessão; edite se algo mudar.
          </Text>
        )}
        {currentSection.isHeader && savedHeaders.length > 0 && (
          <View style={styles.savedHeadersBox}>
            <Text style={styles.savedHeadersTitle}>Cabeçalhos salvos nesta pesquisa</Text>
            {savedHeaders.map((saved) => (
              <View key={saved.id} style={styles.savedHeaderRow}>
                <TouchableOpacity style={styles.savedHeaderTapArea} onPress={() => applySavedHeader(saved)}>
                  <Text style={styles.savedHeaderLabel}>{saved.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteSavedHeader(saved)} hitSlop={8}>
                  <Text style={styles.savedHeaderDelete}>Excluir</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {currentSection.questions.map((question) => (
          <View key={question.id} style={styles.field}>
            <Text style={styles.label}>
              {question.label}
              {question.required && <Text style={styles.required}> *</Text>}
            </Text>
            <QuestionField
              question={question}
              value={answers[question.id]}
              onChange={(value) => updateAnswer(question, value)}
            />
            {errors[question.id] && <Text style={styles.error}>Campo obrigatório.</Text>}
          </View>
        ))}
        {currentSection.isHeader && (
          <TouchableOpacity style={styles.saveHeaderButton} onPress={handleSaveHeader}>
            <Text style={styles.saveHeaderButtonText}>Salvar cabeçalho</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleNext} disabled={isFinalizing}>
          <Text style={styles.primaryButtonText}>
            {isFinalizing ? 'Finalizando...' : isLastSection ? 'Concluir' : 'Avançar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleClearAnswers} disabled={isFinalizing}>
          <Text style={styles.secondaryButtonText}>Limpar dados preenchidos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.primary, fontWeight: '500' },
  title: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  description: { fontSize: 13, color: colors.mutedForeground },
  sectionMeta: { fontSize: 11, color: colors.mutedForeground },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: colors.foreground },
  headerHint: { fontSize: 12, color: colors.primary, fontStyle: 'italic', marginTop: -8, marginBottom: 12 },
  savedHeadersBox: { gap: 6, marginBottom: 16 },
  savedHeadersTitle: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  savedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  savedHeaderTapArea: { flex: 1 },
  savedHeaderLabel: { color: colors.foreground },
  savedHeaderDelete: { fontSize: 12.5, color: colors.destructive, fontWeight: '600' },
  saveHeaderButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveHeaderButtonText: { color: colors.primary, fontWeight: '600' },
  scroll: { paddingHorizontal: 18, paddingBottom: 24, gap: 16 },
  field: { gap: 8, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  required: { color: colors.primary },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 14.5,
    color: colors.foreground,
  },
  row: { flexDirection: 'row', gap: 10 },
  column: { flexDirection: 'column', gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  choiceText: { color: colors.foreground },
  choiceTextSelected: { color: colors.primary, fontWeight: '600' },
  placeholder: { color: colors.mutedForeground, fontStyle: 'italic' },
  error: { color: colors.destructive, fontSize: 12 },
  footer: {
    padding: 18,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  primaryButton: { height: 50, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: colors.primaryForeground, fontWeight: '600', fontSize: 15 },
  secondaryButton: { paddingVertical: 6, alignItems: 'center' },
  secondaryButtonText: { color: colors.destructive, fontWeight: '600', fontSize: 13 },
  mapPreview: {
    width: 256,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBox: {
    flexDirection: 'column',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gpsCoords: { fontSize: 13.5, fontWeight: '600', color: colors.foreground },
  gpsAccuracy: { fontSize: 11.5, color: colors.mutedForeground },
});
