// Schema do banco local offline (expo-sqlite)
// Criado na primeira execução do app

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `

  -- Configurações do app (retenção, thresholds, política de retry — ver 4.6 e 4.8)
  CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
    -- chaves usadas no MVP:
    --   mobile_retention_days              (padrão '7')
    --   storage_warning_threshold_percent  (padrão '80')
    --   sync_retry_interval_minutes        (padrão '60')
    --   sync_max_auto_retries              (padrão '3')
  );

  -- Usuário autenticado localmente
  CREATE TABLE IF NOT EXISTS local_user (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL,
    device_id   TEXT NOT NULL,
    synced_at   TEXT
  );

  -- Pesquisas disponíveis (baixadas do servidor)
  CREATE TABLE IF NOT EXISTS surveys (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL,
    current_version    INTEGER NOT NULL DEFAULT 0,
    starts_at          TEXT,
    ends_at            TEXT,
    downloaded_at      TEXT NOT NULL
  );

  -- Versões de formulários (schema JSON completo — Contrato C1)
  -- Armazenar versão é crítico para o Contrato C3
  CREATE TABLE IF NOT EXISTS survey_versions (
    id          TEXT PRIMARY KEY,      -- survey_version_id do backend
    survey_id   TEXT NOT NULL,
    version     INTEGER NOT NULL,
    schema_json TEXT NOT NULL,         -- JSON completo do formulário
    downloaded_at TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id)
  );

  -- Rascunhos de respostas em andamento
  CREATE TABLE IF NOT EXISTS drafts (
    id                 TEXT PRIMARY KEY,  -- UUID gerado no device
    survey_id          TEXT NOT NULL,
    survey_version_id  TEXT NOT NULL,     -- versão no momento do início (C3)
    answers_json       TEXT NOT NULL,     -- JSON parcial das respostas
    started_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id),
    FOREIGN KEY (survey_version_id) REFERENCES survey_versions(id)
  );

  -- Cabeçalhos salvos pelo pesquisador (botão "Salvar cabeçalho" na seção
  -- isHeader) — reaproveitados via lista ao reabrir a mesma pesquisa, sem
  -- precisar redigitar. Independente do rascunho da resposta em si (drafts):
  -- um cabeçalho salvo continua disponível mesmo depois de finalizar ou
  -- descartar uma coleta.
  CREATE TABLE IF NOT EXISTS saved_headers (
    id           TEXT PRIMARY KEY,  -- UUID gerado no device
    survey_id    TEXT NOT NULL,
    label        TEXT NOT NULL,     -- resumo legível (ex: valor do 1º campo preenchido)
    answers_json TEXT NOT NULL,
    saved_at     TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id)
  );

  -- Respostas finalizadas (pendentes ou sincronizadas)
  CREATE TABLE IF NOT EXISTS responses (
    id                 TEXT PRIMARY KEY,  -- UUID gerado no device (idempotency key)
    survey_id          TEXT NOT NULL,
    survey_version_id  TEXT NOT NULL,     -- versão no momento da coleta (C3)
    researcher_id      TEXT NOT NULL,
    device_id          TEXT NOT NULL,
    respondent_id      TEXT,
    answers_json       TEXT NOT NULL,
    location_hash      TEXT,
    latitude           REAL,
    longitude          REAL,
    accuracy           REAL,
    collected_at       TEXT NOT NULL,    -- timestamp do device
    status             TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | SYNCING | SYNCED | FAILED_MANUAL_REQUIRED | CONFLICT
    sync_attempts      INTEGER NOT NULL DEFAULT 0,
    next_retry_at      TEXT,             -- agora + SYNC_RETRY_INTERVAL_MINUTES — ver política de retry em 4.8
    last_error         TEXT,
    synced_at          TEXT,             -- usado também pela política de retenção de 7 dias (ver 4.6)
    FOREIGN KEY (survey_id) REFERENCES surveys(id),
    FOREIGN KEY (survey_version_id) REFERENCES survey_versions(id)
  );

  -- A captura/envio de fotos foi removida do produto — a tabela "files"
  -- (usada só para isso) é apagada em instalações antigas que já a tinham.
  DROP TABLE IF EXISTS files;

  -- Fila de sincronização (controla ordem e retry)
  CREATE TABLE IF NOT EXISTS sync_queue (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,     -- 'RESPONSE'
    reference_id TEXT NOT NULL,     -- response.id
    priority     INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'PENDING',
    next_retry   TEXT,              -- backoff exponencial
    created_at   TEXT NOT NULL
  );

  -- Índices para performance offline
  CREATE INDEX IF NOT EXISTS idx_responses_status      ON responses(status);
  CREATE INDEX IF NOT EXISTS idx_responses_survey      ON responses(survey_id);
  CREATE INDEX IF NOT EXISTS idx_sync_queue_status     ON sync_queue(status, next_retry);
  CREATE INDEX IF NOT EXISTS idx_survey_versions_survey ON survey_versions(survey_id);
  CREATE INDEX IF NOT EXISTS idx_saved_headers_survey   ON saved_headers(survey_id);
`;
