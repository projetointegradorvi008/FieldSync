import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../services/auth/auth-context';
import { getFriendlyErrorMessage, showAlert } from '../utils/alert';
import { colors, radius } from '../theme/colors';

// Tela de login (email/senha). A autenticação de fato acontece em
// AuthProvider (auth-context.tsx); esta tela só chama `login` e mostra
// erro (em popup, ver utils/alert.ts) /carregamento.
export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      showAlert('Não foi possível entrar', getFriendlyErrorMessage(err, 'Falha ao entrar.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = !!email && !!password && !isSubmitting;

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>FieldSync</Text>
        <Text style={styles.heroSubtitle}>
          Coleta de campo offline-first, com sincronização automática e georreferenciamento.
        </Text>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.title}>Entrar</Text>
        <Text style={styles.subtitle}>Entre com sua conta de pesquisador.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="nome@suaempresa.com.br"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Senha</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!isPasswordVisible}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setIsPasswordVisible((v) => !v)} style={styles.toggleButton}>
              <Text style={styles.toggleButtonText}>{isPasswordVisible ? 'Ocultar' : 'Mostrar'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isSubmitting ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitButtonText}>Entrar</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.foot}>Acesso restrito a pesquisadores cadastrados pela sua organização.</Text>
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
  title: {
    fontSize: 19,
    fontWeight: '600',
    color: colors.foreground,
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 13,
    marginTop: -12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.foreground,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.surface,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.foreground,
  },
  toggleButton: {
    paddingHorizontal: 14,
  },
  toggleButtonText: {
    color: colors.primary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  submitButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '600',
  },
  spinner: {
    marginTop: 4,
  },
  foot: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
});
