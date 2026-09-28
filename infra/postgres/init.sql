-- Executado automaticamente na primeira inicialização
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca por texto

CREATE SCHEMA IF NOT EXISTS audit;
