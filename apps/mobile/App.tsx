import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getDatabase } from './src/database';
import { AuthProvider, useAuth } from './src/services/auth/auth-context';
import { acknowledgeLgpdNotice, isLgpdNoticeAcknowledged } from './src/services/config/app-config-repository';
import { LoginScreen } from './src/screens/LoginScreen';
import { LgpdNoticeScreen } from './src/screens/LgpdNoticeScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SurveysScreen } from './src/screens/SurveysScreen';
import { FormRendererScreen } from './src/screens/FormRendererScreen';
import { LocalResponsesScreen } from './src/screens/LocalResponsesScreen';
import { ResponseDetailScreen } from './src/screens/ResponseDetailScreen';
import { clearCollectionSession } from './src/services/collection/session-context';
import { startAutoSync, stopAutoSync } from './src/services/sync/auto-sync';
import { LocalSurvey } from './src/services/surveys/surveys-repository';

// Componente raiz do app. Não usa uma biblioteca de navegação — é uma
// máquina de estados simples entre as telas em src/screens/, guardada em
// `screen`. Também é onde a sincronização automática é iniciada assim que
// há um usuário logado e o banco SQLite local está pronto.
type Screen = 'home' | 'surveys' | 'form' | 'responses' | 'response-detail';

function Root() {
  const [dbReady, setDbReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [activeSurvey, setActiveSurvey] = useState<LocalSurvey | null>(null);
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
  const [lgpdAcknowledged, setLgpdAcknowledged] = useState<boolean | null>(null);
  const { user, isLoading } = useAuth();

  useEffect(() => {
    getDatabase()
      .then(() => setDbReady(true))
      .catch((error) => console.error('Falha ao inicializar o banco local', error));
  }, []);

  useEffect(() => {
    if (!dbReady || !user) return;
    startAutoSync();
    return () => stopAutoSync();
  }, [dbReady, user]);

  // Aviso de coleta de dados (LGPD, RF10) — checado uma vez por login, mas
  // só exibido de fato se ainda não tiver sido reconhecido neste aparelho
  // (flag persistida em app_config, ver acknowledgeLgpdNotice).
  useEffect(() => {
    if (!dbReady || !user) return;
    isLgpdNoticeAcknowledged().then(setLgpdAcknowledged);
  }, [dbReady, user]);

  if (isLoading || !dbReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>FieldSync</Text>
        <ActivityIndicator style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (lgpdAcknowledged === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!lgpdAcknowledged) {
    return (
      <LgpdNoticeScreen
        onAcknowledge={() => {
          acknowledgeLgpdNotice().then(() => setLgpdAcknowledged(true));
        }}
      />
    );
  }

  let content;
  if (screen === 'form' && activeSurvey) {
    content = (
      <FormRendererScreen
        surveyId={activeSurvey.id}
        version={activeSurvey.currentVersion}
        onExit={() => {
          // Encerra a sessão de coleta (RF11) ao voltar para a lista.
          clearCollectionSession();
          setScreen('surveys');
        }}
      />
    );
  } else if (screen === 'response-detail' && activeResponseId) {
    content = (
      <ResponseDetailScreen responseId={activeResponseId} onBack={() => setScreen('responses')} />
    );
  } else if (screen === 'responses') {
    content = (
      <LocalResponsesScreen
        onBack={() => setScreen('home')}
        onOpenResponse={(responseId) => {
          setActiveResponseId(responseId);
          setScreen('response-detail');
        }}
      />
    );
  } else if (screen === 'surveys') {
    content = (
      <SurveysScreen
        onBack={() => setScreen('home')}
        onOpenSurvey={(survey) => {
          setActiveSurvey(survey);
          setScreen('form');
        }}
      />
    );
  } else {
    content = (
      <HomeScreen
        onOpenSurveys={() => setScreen('surveys')}
        onOpenResponses={() => setScreen('responses')}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.screen}>{content}</View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
});
