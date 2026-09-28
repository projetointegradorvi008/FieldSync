import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme/colors';

// Aviso de coleta de dados pessoais (LGPD, RF10) — exibido uma única vez por
// instalação, logo após o primeiro login, antes de qualquer tela funcional
// (ver App.tsx). Não é um fluxo de consentimento assinado (a coleta não
// envolve dado sensível), só transparência, conforme a seção de LGPD da
// especificação técnica.
export function LgpdNoticeScreen({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Antes de começar</Text>
        <Text style={styles.heroSubtitle}>Coleta de dados nesta pesquisa de campo.</Text>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.paragraph}>
          Para realizar as pesquisas atribuídas a você, este aplicativo coleta a localização (GPS)
          de cada resposta registrada e, quando a pesquisa pedir, o nome do entrevistado.
        </Text>
        <Text style={styles.paragraph}>
          Esses dados são usados exclusivamente para os fins da pesquisa contratada pela sua
          organização. Nenhum documento de identificação (CPF, RG) é coletado por este aplicativo.
        </Text>
        <Text style={styles.paragraph}>
          Você pode consultar este aviso novamente a qualquer momento com sua liderança.
        </Text>

        <TouchableOpacity style={styles.submitButton} onPress={onAcknowledge}>
          <Text style={styles.submitButtonText}>Entendi, continuar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  hero: {
    backgroundColor: '#16213e',
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 40,
    gap: 8,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginTop: -22,
    paddingHorizontal: 26,
    paddingTop: 30,
    gap: 16,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.foreground,
  },
  submitButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '600',
  },
});
