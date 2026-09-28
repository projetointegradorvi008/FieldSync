# Estrutura do Projeto

Este documento descreve **cada pasta e cada arquivo** do repositório, para
quem está chegando agora e precisa se orientar sem conhecimento prévio do
código. Para o passo a passo de instalação e execução, ver
[`README.md`](README.md); para arquitetura, contratos e schema completos, ver
[`docs/FieldSync_Especificacao_Tecnica.md`](docs/FieldSync_Especificacao_Tecnica.md).

O projeto é um **monorepo simples** (sem ferramenta de workspace como Turborepo
ou pnpm workspaces): três aplicações independentes dentro de `apps/`, cada uma
com seu próprio `package.json` e `node_modules`, mais uma pasta `infra/` com
tudo que não é código de aplicação (proxy, banco, scripts) e uma pasta
`.github/workflows/` com a automação de CI/CD.

```text
fieldsync/
├── apps/
│   ├── backend/   API (NestJS) + banco de dados (PostgreSQL/PostGIS)
│   ├── web/       Painel do gestor (Next.js)
│   └── mobile/    App do pesquisador de campo (Expo / React Native)
├── infra/
│   ├── nginx/     Proxy reverso único de entrada (porta 80/443)
│   ├── postgres/  Script de inicialização do banco (extensões)
│   └── scripts/   Scripts de operação (backup.sh)
├── .github/workflows/  CI (lint + testes) e deploy (build de imagens + publicação em VPS)
├── docs/          Especificação técnica e este documento
├── docker-compose.yml         Definição base dos containers (produção)
├── docker-compose.dev.yml     Overrides para desenvolvimento local (hot reload, portas expostas)
├── docker-compose.prod.yml    Overrides para produção (imagens do GHCR, limites de recursos, monitoramento)
├── .env.example   Modelo de variáveis de ambiente (copiar para .env)
├── .nvmrc         Versão do Node.js usada no projeto (24.20.0)
└── README.md      Guia de instalação e execução passo a passo
```

---

## Tecnologias utilizadas

### Front-End Web (`apps/web/`)

| Categoria | Tecnologia |
| --------- | ---------- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Estilo | Tailwind CSS v4, `class-variance-authority`, `tailwind-merge`, `tw-animate-css` |
| Componentes de UI | shadcn/ui sobre Radix UI (`@radix-ui/react-label`, `@radix-ui/react-slot`), ícones `lucide-react` |
| Construtor de formulários | `@dnd-kit` (core/sortable/utilities) — arrastar-e-soltar de perguntas/seções |
| Mapas | Leaflet + `react-leaflet` + `react-leaflet-cluster` (clustering de marcadores no Analytics) |
| Gráficos | Recharts (`BarChart`/`LineChart` do Analytics) |
| QR Code | `qrcode` (pareamento do Mobile via aba Sessões) |
| Lint/Format | ESLint 9 (`eslint-config-next`), TypeScript 5 |

### Backend (`apps/backend/`)

| Categoria | Tecnologia |
| --------- | ---------- |
| Framework | NestJS 10 + TypeScript, Node.js 24 |
| ORM / Banco | Prisma 6 (`@prisma/client`) sobre PostgreSQL/PostGIS |
| Autenticação | `@nestjs/jwt` (JWT), `argon2` (hash de senha Argon2id) |
| Validação | `class-validator` + `class-transformer` (DTOs) |
| Documentação de API | `@nestjs/swagger` (OpenAPI em `/api/docs`) |
| Segurança HTTP | `helmet`, `@nestjs/throttler` (rate limiting) |
| Fila / Jobs assíncronos | `pg-boss` (fila sobre o próprio Postgres — sem Redis/serviço extra) |
| Testes | Jest (unitário), Supertest (integração/e2e), `autocannon` (apoio ao teste de carga) |
| Lint/Format | ESLint 8, Prettier 3 |

### Mobile (`apps/mobile/`)

| Categoria | Tecnologia |
| --------- | ---------- |
| Framework | Expo 57 (React Native 0.86) + React 19 + TypeScript |
| Banco local (offline-first) | `expo-sqlite` |
| Sessão/tokens | `expo-secure-store` |
| Localização (GPS) | `expo-location` |
| Notificações locais | `expo-notifications` |
| Conectividade | `@react-native-community/netinfo` (detecção online/offline e disparo do sync automático) |
| Testes | Jest + `jest-expo` |
| Lint/Format | ESLint 9 (`eslint-config-expo`), Prettier 3 |

### Dados e Infraestrutura

| Categoria | Tecnologia |
| --------- | ---------- |
| Banco de dados | PostgreSQL 16 com extensão PostGIS 3.4 (`postgis/postgis:16-3.4-alpine`) — localização geográfica, materialized view `mv_survey_kpis` |
| Fila de jobs | `pg-boss` (roda sobre o Postgres, sem serviço dedicado) |
| Proxy reverso | Nginx (`nginx:1.25-alpine`) — ponto único de entrada (porta 80/443) na frente de Web e Backend |
| Orquestração | Docker + Docker Compose (base + overrides de dev/produção) |
| CI/CD | GitHub Actions (lint, testes, build de imagens, deploy em VPS) |
| Monitoramento (produção) | Uptime Kuma |
| Rede de campo (opcional) | Tailscale — conecta o celular ao servidor fora da mesma rede Wi-Fi |

---

## Raiz do repositório

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `README.md` | Guia principal: pré-requisitos, passo a passo de instalação em desenvolvimento local (Modo 1), produção local (Modo 2) e VPS (Modo 3), backup/restauração e solução de problemas comuns. |
| `docker-compose.yml` | Serviços base compartilhados por dev e produção: `tailscale`, `postgres`, `backend`, `web`, `nginx`, redes e volumes nomeados. |
| `docker-compose.dev.yml` | Overrides usados junto do `docker-compose.yml` em desenvolvimento: builda até o estágio `builder` (não o final de produção), monta o código-fonte como volume (hot reload com `npm run start:dev` / `npm run dev`), expõe a porta do Postgres diretamente no host e adiciona o serviço `mobile` (dev server do Expo). |
| `docker-compose.prod.yml` | Overrides usados em produção (local ou VPS): usa as imagens já publicadas no GHCR (`ghcr.io/.../backend`, `.../web`), aplica limites de CPU/memória e adiciona o serviço `uptime-kuma` (monitoramento de disponibilidade). |
| `.env.example` | Modelo de todas as variáveis de ambiente do projeto, com comentários explicando cada bloco (Tailscale, banco, JWT, URLs públicas, Administrador de produção, CORS). Nunca editar diretamente — copiar para `.env`. |
| `.env` | Cópia local do `.env.example` com valores reais (senhas, segredos). **Nunca commitado** (ver `.gitignore`) — cada ambiente (seu computador, o servidor) tem o seu próprio. |
| `.gitignore` | Lista de arquivos/pastas que o Git deve ignorar (`.env`, `node_modules`, `dist`, `.expo`, etc.), para não versionar segredos nem artefatos de build. |
| `.nvmrc` | Versão exata do Node.js (`24.20.0`) que o `nvm` deve usar neste projeto — evita divergência de versão entre máquinas. |

---

## `apps/backend/` — API (NestJS)

Aplicação NestJS (TypeScript, Node.js) responsável por toda a regra de
negócio: autenticação, gestão de pesquisas, motor de sincronização,
detecção de conflitos e analytics. Fala com o PostgreSQL/PostGIS via Prisma
ORM.

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `Dockerfile` | Build multi-estágio: um estágio `builder` completo (todas as dependências, gera o Prisma Client, compila TypeScript) e um estágio `production` com as dependências de produção, o já compilado (`dist/`) e também `prisma/` + `src/` + os tsconfigs — necessários para `npx prisma migrate deploy`/`db seed` (bootstrap do Administrador, ver `prisma/seed.ts`) rodarem dentro do próprio container de produção; roda como usuário não-root. |
| `.dockerignore` | Arquivos que não devem ser copiados para dentro da imagem Docker (ex: `node_modules`, `dist` locais). |
| `.eslintrc.js` | Regras de lint (ESLint) específicas do Backend. |
| `.gitignore` | Ignorados específicos do Backend (`dist/`, `node_modules/`, etc.). |
| `nest-cli.json` | Configuração da CLI do NestJS; inclui o plugin `@nestjs/swagger` que gera automaticamente os schemas OpenAPI a partir dos tipos das DTOs. |
| `package.json` / `package-lock.json` | Dependências e scripts (`start:dev`, `build`, `test`, `test:e2e`, `lint`) do Backend. |
| `.prettierrc` | Regras de formatação de código (Prettier). |
| `prisma.config.ts` | Configuração do Prisma CLI (ex: caminho do schema, do seed). |
| `README.md` | README padrão gerado pelo `nest new` (informações genéricas do framework). |
| `tsconfig.json` / `tsconfig.build.json` | Configuração do compilador TypeScript (o `.build.json` é usado só na hora de gerar o `dist/` de produção, excluindo arquivos de teste). |
| `.claude/skills`, `.windsurf/skills` | Configurações de assistentes de IA usados durante o desenvolvimento; não fazem parte da aplicação em si. |

### `apps/backend/prisma/`

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `schema.prisma` | **Fonte única da verdade do banco de dados.** Define todas as entidades (`Organization`, `User`, `RefreshToken`, `Device`, `Survey`, `SurveyVersion`, `Question`, `QuestionOption`, `Response`, `Answer`, `Location` com PostGIS, `SyncRecord`, `ConflictRecord`, `AuditLog`), enums e índices. Qualquer mudança de estrutura de dados começa aqui. |
| `seed.ts` | Ponto de entrada de `npx prisma db seed` — o comportamento depende de `NODE_ENV`: em desenvolvimento (`seedDevelopment`), cria uma organização de teste, 7 usuários (um por perfil, com 3 PESQUISADOR) e 3 pesquisas de exemplo (uma `DRAFT`, duas `PUBLISHED`, uma delas já com 60 respostas). Em produção (`seedProduction`, `NODE_ENV=production`), cria só 1 organização e 1 usuário ADMINISTRADOR a partir de `ADMIN_PASSWORD` (validada por `validateAdminPasswordStrength` em `../src/config/env.validation.ts`) — nenhum dado de exemplo. Usa `upsert` em ambos os casos; em produção, nunca sobrescreve a senha de um Administrador que já exista (só a define na criação), para rodar com segurança em todo deploy. |
| `migrations/` | 12 migrations incrementais, da criação inicial do schema (`20260906152516_init`) até a remoção completa do tipo de pergunta PHOTO e da tabela de arquivos (`20260913000000_remove_photo_and_files`), passando por `isRootAdmin`/`AuditLog` SetNull, tipo/estilo de pesquisa, ajustes de cabeçalho de pesquisa, **remoção da atribuição de pesquisador por pesquisa** (`20260911011723_remove_cover_sections_and_researcher_assignment`) e campos opcionais (`Response.researcherId`, `Device.userId`). Cada pasta tem seu próprio `migration.sql`. |
| `migrations/migration_lock.toml` | Arquivo de controle do Prisma que trava o provedor de banco (`postgresql`) usado pelas migrations. |

### `apps/backend/scripts/`

| Arquivo | Descrição |
| ------- | --------- |
| `load-test-sync.js` | Script Node.js autônomo (fora do NestJS) que simula carga real no `POST /sync`: múltiplos "dispositivos" concorrentes, cada um fazendo login e enviando lotes de respostas, medindo p50/p95/p99 de latência e conferindo 0% de erros e nenhuma resposta duplicada/perdida (ver seção 6.4 da especificação técnica). |

### `apps/backend/src/` — código-fonte da API

Cada subpasta é um **módulo NestJS** (agrupando `controller` + `service` +
`module` + `dto/`), seguindo o padrão: o *controller* recebe a requisição
HTTP e valida a entrada, o *service* contém a regra de negócio, e o `.module.ts`
"declara" o módulo para o NestJS (o que ele expõe, do que depende).

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `main.ts` | Ponto de entrada da aplicação: cria a instância NestJS, aplica `helmet` (cabeçalhos de segurança HTTP), configura CORS a partir de `CORS_ORIGIN`, monta o Swagger em `/api/docs` (só fora de produção) e sobe o servidor HTTP. |
| `app.module.ts` | Módulo raiz: importa todos os módulos de funcionalidade (Auth, Users, Surveys, Sync, Conflicts, Analytics, Health, Queue) e registra o rate limiting global (`ThrottlerModule` + `ThrottlerGuard` como guard padrão de toda a aplicação). |

**`common/`** — utilitários compartilhados entre módulos.
- `filters/http-exception.filter.ts` — filtro global que traduz qualquer erro (validação, Prisma/Postgres, ou não tratado) para uma mensagem em português compreensível, mantendo o detalhe técnico só no log.

**`config/`** — leitura e validação das variáveis de ambiente.
- `env.validation.ts` — valida, na inicialização do processo, que todas as variáveis de ambiente obrigatórias existem e têm o formato esperado (`JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN` e, só quando `NODE_ENV=production`, `ADMIN_PASSWORD` — força mínima e nunca a senha de desenvolvimento); a aplicação recusa subir se faltar ou for inválido algo crítico. Exporta `validateAdminPasswordStrength`, reaproveitada por `prisma/seed.ts` para validar a mesma regra fora do boot do Nest.

**`prisma/`** — integração com o banco via Prisma.
- `prisma.service.ts` — encapsula o `PrismaClient`, conectando ao banco na inicialização do módulo e desconectando ao encerrar; é injetado em todos os outros serviços que precisam consultar o banco.
- `prisma.module.ts` — declara o `PrismaService` como um provider global, disponível em qualquer módulo sem precisar reimportar.

**`queue/`** — fila de jobs assíncronos.
- `queue.service.ts` — encapsula o `pg-boss` (fila baseada no próprio PostgreSQL): publica jobs (ex: notificação de conflito detectado) e agenda o job periódico que atualiza a *materialized view* `mv_survey_kpis`.
- `queue.module.ts` — declara o `QueueService` como provider global.

**`auth/`** — autenticação, sessão e controle de acesso.
- `auth.controller.ts` — rotas `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` e gestão de sessões (listar/revogar dispositivos); login e refresh têm rate limit próprio (mais restritivo que o global, proteção contra força bruta e contra abuso da rotação de token).
- `auth.service.ts` — regra de negócio: verifica senha (Argon2id), emite/rotaciona JWTs, detecta reuso de refresh token (`REUSE_DETECTED`, indício de token roubado), registra eventos de segurança em log e roda um hash "dummy" quando o e-mail não existe, para o tempo de resposta do login não vazar quais e-mails têm conta (proteção contra enumeração).
- `auth.service.spec.ts` — testes unitários do serviço acima.
- `argon2.config.ts` — parâmetros do algoritmo de hash de senha Argon2id (custo de memória/tempo).
- `duration.util.ts` — converte strings de duração tipo `"15m"`/`"7d"` (usadas em `JWT_ACCESS_EXPIRES_IN`) em milissegundos.
- `jwt-payload.ts` — formato (tipo TypeScript) do conteúdo dentro de um JWT emitido pelo sistema.
- `role-hierarchy.ts` — define a ordem hierárquica dos perfis de usuário (ROOT > ADMINISTRADOR > GESTOR > SUPERVISOR > PESQUISADOR/VISUALIZADOR), usada para decidir quem pode gerenciar quem.
- `decorators/current-user.decorator.ts` — decorator `@CurrentUser()` que extrai o usuário autenticado da requisição, sem repetir esse código em cada controller.
- `decorators/roles.decorator.ts` — decorator `@Roles(...)` que marca quais perfis podem acessar uma rota; lido pelo `RolesGuard`.
- `guards/jwt-auth.guard.ts` — bloqueia requisições sem um JWT de acesso válido.
- `guards/roles.guard.ts` — bloqueia requisições cujo usuário não tem nenhum dos perfis exigidos por `@Roles(...)`.
- `guards/hierarchy.guard.ts` — bloqueia ações de gestão de usuário (ex: editar/desativar) quando o alvo tem um perfil igual ou superior ao de quem está pedindo, usando `role-hierarchy.ts`.
- `dto/login.dto.ts`, `dto/logout.dto.ts`, `dto/refresh.dto.ts` — formato e validação do corpo (`body`) de cada requisição de autenticação.

**`users/`** — CRUD de usuários.
- `users.controller.ts` — rotas de listagem, criação, edição e desativação de usuários; criação e edição/desativação passam pelo `HierarchyGuard`, e a criação tem rate limit próprio (defesa em profundidade contra criação de contas em massa).
- `users.service.ts` — regra de negócio (reforça a checagem de hierarquia independentemente do guard do controller, gera hash de senha ao criar/editar).
- `dto/create-user.dto.ts`, `dto/update-user.dto.ts`, `dto/list-users-query.dto.ts` — validação de entrada de cada rota.

**`surveys/`** — pesquisas e formulários.
- `surveys.controller.ts` — rotas de CRUD de pesquisas, publicação de versão, arquivamento, duplicação e listagem de versões/respostas.
- `surveys.service.ts` — regra de negócio: ao publicar uma pesquisa, desnormaliza o schema JSON em linhas de `Question`/`QuestionOption` (mais fácil de consultar depois) e incrementa a versão (Contrato C1 — nunca sobrescreve uma versão publicada).
- `surveys.service.spec.ts` — testes unitários.
- `survey-schema.validator.ts` — valida a estrutura do schema JSON de um formulário antes de aceitar a publicação (tipos de campo válidos, ids únicos, etc.).
- `dto/create-survey.dto.ts`, `dto/update-survey.dto.ts`, `dto/publish-survey.dto.ts`, `dto/list-surveys-query.dto.ts`, `dto/list-survey-responses-query.dto.ts` — validação de entrada de cada rota.

**`sync/`** — motor de sincronização, o coração do offline-first.
- `sync.controller.ts` — rota `POST /sync` (recebe lotes de respostas coletadas offline) e `GET /sync/status`; tem rate limit próprio (30 req/min).
- `sync.service.ts` — regra de negócio mais crítica do sistema: idempotência por UUID (reenviar a mesma resposta não duplica nada), validação de versão do formulário (Contrato C3) e de relógio do dispositivo (Contrato C4), persistência de `Response`/`Answer`/`Location`/`SyncRecord`, e detecção de conflito (Contrato C2: mesma `surveyId` + `collectedAt` exato + mesmo conjunto de `answers`, sem depender de `locationHash`/`respondentId`) — que cria um `ConflictRecord` e publica um job na fila.
- `sync.service.spec.ts` — testes unitários dessa lógica.
- `dto/sync-request.dto.ts`, `dto/sync-status-query.dto.ts` — formato do lote de sincronização e da consulta de status.

**`conflicts/`** — resolução de conflitos.
- `conflicts.controller.ts` — rotas de listagem e resolução (`KEEP_FIRST`/`KEEP_SECOND`/`DISCARD_BOTH`) de conflitos.
- `conflicts.service.ts` — regra de negócio da resolução.
- `conflicts.service.spec.ts` — testes unitários.
- `dto/list-conflicts-query.dto.ts`, `dto/resolve-conflict.dto.ts` — validação de entrada.

**`analytics/`** — relatórios e exportação.
- `analytics.controller.ts` — rotas de listagem/detalhe de respostas, agregações (`by-researcher`, `by-period`), localizações e exportação (CSV/JSON).
- `analytics.service.ts` — consultas agregadas (incluindo SQL bruto parametrizado para `date_trunc`), montagem do CSV (com BOM UTF-8, separador `;` para abrir certo no Excel em pt-BR, e prefixo `'` em valores que comecem com `= + - @` para neutralizar injeção de fórmula) e a regra de LGPD: o identificador do respondente só entra na exportação se `includePii=true` for passado explicitamente, e isso fica registrado em `AuditLog`.
- `analytics.service.spec.ts` — testes unitários.
- `dto/analytics-filter-query.dto.ts`, `dto/by-period-query.dto.ts`, `dto/export-query.dto.ts`, `dto/list-analytics-responses-query.dto.ts` — validação de entrada de cada rota.

**`health/`** — verificação de disponibilidade.
- `health.controller.ts` — rota `GET /health` usada pelo Nginx/Docker/monitoramento para saber se o Backend está de pé.
- `health.module.ts` — declaração do módulo.

**`responses/`** — pasta reservada no desenho original da arquitetura; no MVP implementado, a lógica de respostas de pesquisa vive dentro dos módulos `sync/` (gravação) e `analytics/` (consulta/exportação), então esta pasta está vazia.

### `apps/backend/test/`

| Arquivo | Descrição |
| ------- | --------- |
| `app.e2e-spec.ts` | Teste de integração básico gerado pelo `nest new`, validando que a aplicação sobe corretamente. |
| `sync.e2e-spec.ts` | Teste de integração real do motor de sincronização: sobe a aplicação inteira contra um Postgres de verdade, cria dados de teste com IDs/e-mail gerados por execução (`randomUUID()`, evita colisão entre execuções repetidas contra um Postgres não resetado), faz login real e testa 5 cenários do `POST /sync` (sincronização válida, reenvio idempotente, versão de formulário inexistente, relógio do dispositivo adiantado, requisição sem token). |
| `jest-e2e.json` | Configuração do Jest usada só pelos testes de integração (pasta, padrão de arquivo, timeout maior). |

---

## `apps/web/` — Painel do gestor (Next.js)

Aplicação Next.js (App Router) usada pelos gestores/administradores no
navegador: gestão de pesquisas, construtor de formulários, dashboard,
analytics com mapas e gráficos, e administração de usuários/sessões. Nunca
fala diretamente com o Backend a partir do navegador — todo tráfego passa
por um "BFF" (Backend for Frontend): rotas internas do próprio Next.js que
repassam a requisição ao Backend, escondendo o token de acesso num cookie
`httpOnly` (o JavaScript do navegador nunca vê o token).

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `Dockerfile` | Build multi-estágio: compila o Next.js em modo `standalone` (só o necessário para rodar, sem o restante do `node_modules`) e roda como usuário não-root. |
| `.dockerignore`, `.gitignore` | Arquivos ignorados na imagem Docker e no Git. |
| `eslint.config.mjs` | Regras de lint específicas do Web. |
| `next.config.ts` | Configuração do Next.js (ex: modo de output `standalone` usado pelo Dockerfile). |
| `next-env.d.ts` | Arquivo gerado automaticamente pelo Next.js com os tipos globais do framework — não editar manualmente. |
| `package.json` / `package-lock.json` | Dependências e scripts (`dev`, `build`, `lint`) do Web. |
| `postcss.config.mjs` | Configuração do PostCSS usada pelo Tailwind CSS. |
| `.prettierrc` | Regras de formatação de código. |
| `components.json` | Configuração do shadcn/ui (biblioteca de componentes usada em `src/components/ui/`). |
| `tsconfig.json` | Configuração do compilador TypeScript. |
| `tsconfig.tsbuildinfo` | Cache incremental de compilação gerado pelo `tsc` — não editar/versionar manualmente. |
| `AGENTS.md` / `CLAUDE.md` | Nota gerada automaticamente pelo `next dev` alertando assistentes de IA a consultar a documentação local do Next.js antes de gerar código (evita usar APIs de versões antigas); não é código da aplicação. |
| `README.md` | README padrão gerado pelo `create-next-app`. |
| `src/app/icon.png` | Ícone da aba do navegador (convenção do App Router — substitui o antigo `favicon.ico`). |
| `public/*.svg` | Ícones estáticos padrão do template do Next.js (não personalizados neste projeto). |

### `apps/web/src/app/` — páginas (App Router)

Cada pasta com um `page.tsx` é uma rota do site; pastas entre colchetes
(`[id]`) são segmentos dinâmicos (ex: `/surveys/123`).

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `layout.tsx` | Layout raiz compartilhado por todas as páginas (fontes, `<html>`/`<body>`, provider de autenticação). |
| `globals.css` | Estilos globais e configuração do Tailwind CSS. |
| `page.tsx` | Rota `/` — redireciona automaticamente para `/dashboard` (não é mais uma página de boas-vindas estática). |
| `login/page.tsx` | Tela de login. |
| `dashboard/page.tsx` | Painel inicial após o login (visão geral). |
| `surveys/page.tsx` | Lista de pesquisas, com criação e arquivamento (com confirmação). |
| `surveys/[id]/page.tsx` | Detalhe/edição de uma pesquisa (inclui o construtor de formulário). |
| `surveys/[id]/dashboard/page.tsx` | Dashboard específico de uma pesquisa (KPIs, série temporal, widget de conflitos). |
| `surveys/[id]/responses/page.tsx` | Tabela de respostas recebidas para aquela pesquisa. |
| `surveys/[id]/analytics/page.tsx` | Página de Analytics: filtros, tabela paginada, gráficos (`BarChart`/`LineChart`) e mapa com clustering, mais exportação CSV/JSON. |
| `surveys/[id]/analytics/responses/[responseId]/page.tsx` | Detalhe completo de uma resposta específica (respostas por pergunta, localização). |
| `conflicts/[id]/page.tsx` | Tela de resolução de um conflito específico (comparação lado a lado + confirmação ao escolher "descartar ambos") — a listagem de conflitos pendentes vive dentro do Painel Operacional de cada pesquisa, não numa aba própria. |
| `sessions/page.tsx` | Lista de sessões/dispositivos ativos do usuário logado, com opção de revogar (com confirmação) e o QR code de pareamento de um novo dispositivo Mobile (`device-pairing-qr.tsx`). |
| `users/page.tsx` | CRUD de usuários (ativar/desativar com confirmação, respeitando a hierarquia de perfis). |

### `apps/web/src/app/api/` — o "BFF" (Backend for Frontend)

Rotas internas do próprio Next.js (nunca chamadas diretamente pelo
navegador do usuário final fora deste site) que fazem a ponte com o
Backend real, guardando o token de acesso num cookie `httpOnly`.

| Arquivo | Descrição |
| ------- | --------- |
| `api/auth/login/route.ts` | Recebe email/senha do formulário de login, chama o Backend e grava os tokens recebidos em cookies `httpOnly`. |
| `api/auth/refresh/route.ts` | Renova o token de acesso usando o refresh token guardado no cookie. |
| `api/auth/logout/route.ts` | Invalida a sessão no Backend e limpa os cookies. |
| `api/backend/[...path]/route.ts` | Proxy genérico: qualquer chamada `/api/backend/<qualquer-coisa>` feita pelo front-end é repassada ao Backend real, anexando o token do cookie como `Authorization`. Usa `arrayBuffer()` (não `.text()`) para repassar o corpo da resposta sem corromper bytes especiais (ex: o BOM UTF-8 dos exports CSV) e também repassa o cabeçalho `Content-Disposition`. |
| `api/config/route.ts` | Expõe em runtime o `EXPO_DEV_SERVER_URL` resolvido automaticamente pelo serviço `mobile` (ver `apps/mobile/docker-entrypoint.sh`), lido pela aba Sessões para montar o QR code de pareamento sempre com o IP Tailscale atual, mesmo que ele mude entre reinícios. |

### `apps/web/src/components/`

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `nav-bar.tsx` | Barra de navegação superior, presente em todas as páginas autenticadas; usa `flex-wrap` para não quebrar o layout em telas de tablet. |
| `device-pairing-qr.tsx` | QR code (aba Sessões) para parear um novo dispositivo Mobile com o Expo Go, usando a URL resolvida por `api/config/route.ts`. |
| `analytics/survey-map.tsx` | Mapa (Leaflet + `react-leaflet-cluster`) que plota as localizações das respostas, agrupando marcadores próximos (clustering); carregado dinamicamente sem SSR, pois bibliotecas de mapa dependem do navegador. |
| `survey-builder/survey-builder.tsx` | Componente principal do construtor visual de formulários: monta a lista de seções/perguntas. |
| `survey-builder/question-row.tsx` | Uma linha/pergunta dentro do construtor, com arrastar-e-soltar (`dnd-kit`) para reordenar. |
| `survey-builder/config-editor.tsx` | Editor das opções específicas de cada tipo de pergunta (ex: lista de alternativas de uma pergunta de múltipla escolha). |
| `survey-builder/preview.tsx` | Pré-visualização ao vivo de como o formulário vai aparecer no app Mobile. |
| `survey-builder/types.ts` | Tipos TypeScript compartilhados entre os componentes do construtor (formato de uma seção/pergunta). |
| `ui/badge.tsx`, `ui/button.tsx`, `ui/card.tsx`, `ui/input.tsx`, `ui/label.tsx`, `ui/password-input.tsx`, `ui/toast-viewport.tsx` | Componentes de interface genéricos e reutilizáveis (biblioteca shadcn/ui), sem lógica de negócio própria. |

### `apps/web/src/contexts/`, `src/lib/`

| Arquivo | Descrição |
| ------- | --------- |
| `contexts/auth-context.tsx` | Contexto React que guarda o usuário logado e expõe funções de login/logout para o restante da aplicação. |
| `contexts/toast-context.tsx` | Contexto React para notificações toast (sucesso/erro de ações como salvar, publicar, revogar sessão). |
| `lib/backend.ts` | Função utilitária para montar chamadas ao Backend a partir do lado servidor do Next.js (Route Handlers), usando `BACKEND_INTERNAL_URL`. |
| `lib/cookies.ts` | Funções auxiliares de leitura/escrita dos cookies `httpOnly` de sessão. |
| `lib/error-message.ts` | Traduz códigos de erro da API (`INVALID_CREDENTIALS`, etc.) em mensagens amigáveis para exibir na interface. |
| `lib/utils.ts` | Utilitários genéricos (ex: composição de classes CSS usada pelos componentes shadcn/ui). |
| `proxy.ts` | Lógica compartilhada de repasse de requisição usada pela rota de proxy genérica (`api/backend/[...path]/route.ts`). |

---

## `apps/mobile/` — App do pesquisador de campo (Expo / React Native)

Aplicativo Android usado em campo pelos pesquisadores, com **funcionamento
offline como regra**: toda coleta é salva localmente (SQLite) e só depois
enviada ao Backend quando houver conectividade.

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `App.tsx` | Componente raiz: controla qual "tela" está sendo exibida (não usa uma biblioteca de navegação — é uma máquina de estados simples entre as telas de `src/screens/`), inicializa os serviços de sincronização automática/notificações e, após o login, intercala o aviso de LGPD (`LgpdNoticeScreen`, RF10) antes de liberar o restante do fluxo, se ainda não reconhecido neste aparelho. |
| `index.ts` | Ponto de entrada registrado pelo Expo, que renderiza `App.tsx`. |
| `app.json` | Configuração do Expo: nome do app, ícones, permissão de localização e os *plugins* nativos usados (`expo-sqlite`, `expo-secure-store`, `expo-location`, `expo-notifications`). |
| `package.json` / `package-lock.json` | Dependências e scripts (`start`, `android`, `test`, `lint`) do Mobile. |
| `tsconfig.json` | Configuração do compilador TypeScript (estende a base do Expo; inclui `"types": ["jest"]` para os testes automatizados reconhecerem `describe`/`it`/`expect`). |
| `eslint.config.js` | Regras de lint específicas do Mobile. |
| `.prettierrc` | Regras de formatação de código. |
| `.gitignore` / `.dockerignore` | Arquivos ignorados no Git e na imagem Docker (`.expo/`, `node_modules/`, etc.). |
| `LICENSE` | Licença gerada pelo template padrão do `create-expo-app`. |
| `Dockerfile` / `docker-entrypoint.sh` | Usados só pelo serviço `mobile` do `docker-compose.dev.yml` (dev server do Expo dentro do Docker, Linux): o entrypoint lê o socket compartilhado do `tailscaled` para resolver sozinho o IP Tailscale atual da máquina, exporta como `EXPO_PUBLIC_API_URL`/`REACT_NATIVE_PACKAGER_HOSTNAME` e grava num volume compartilhado que o Web (`api/config/route.ts`) também lê, para o QR code de pareamento sempre apontar para o IP certo mesmo que ele mude entre reinícios. |
| `assets/*.png` | Ícones do aplicativo (launcher Android, splash screen, favicon web). |

### `apps/mobile/src/database/`

| Arquivo | Descrição |
| ------- | --------- |
| `schema.ts` | Definição das tabelas do banco SQLite local (`app_config`, `local_user`, `surveys`, `survey_versions`, `drafts`, `saved_headers`, `responses`, `sync_queue`) e seus índices — o "espelho offline" do banco do servidor (a tabela `files` foi removida junto com a captura de fotos). |
| `index.ts` | Abre/inicializa a conexão com o banco SQLite local e roda as tabelas do `schema.ts` na primeira execução. |

### `apps/mobile/src/screens/`

Cada arquivo é uma tela cheia do aplicativo.

| Arquivo | Descrição |
| ------- | --------- |
| `LoginScreen.tsx` | Tela de login (email/senha), salva a sessão no `expo-secure-store`. |
| `LgpdNoticeScreen.tsx` | Aviso de coleta de dados pessoais (LGPD, RF10), exibido uma única vez por instalação logo após o primeiro login, antes de qualquer tela funcional — ver `acknowledgeLgpdNotice`/`isLgpdNoticeAcknowledged` em `config/app-config-repository.ts`. |
| `HomeScreen.tsx` | Tela inicial após o login, com acesso às demais telas. |
| `SurveysScreen.tsx` | Lista de todas as pesquisas `PUBLISHED` da organização (lidas do cache SQLite, funciona offline — não há mais atribuição manual de pesquisador por pesquisa). |
| `FormRendererScreen.tsx` | Renderiza dinamicamente o formulário de uma pesquisa a partir do schema em cache, com validação de campos obrigatórios, navegação entre seções, salvamento automático de rascunho e captura de GPS ao concluir. |
| `LocalResponsesScreen.tsx` | Lista de coletas já feitas neste aparelho ("Minhas coletas"), com status de sincronização e botão de sincronizar manualmente. |
| `ResponseDetailScreen.tsx` | Detalhe de uma coleta local específica: respostas por pergunta, localização e status de sincronização. |

### `apps/mobile/src/services/`

Lógica de negócio e acesso a dados, separada das telas.

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `api/client.ts` | Cliente HTTP central: monta a URL a partir de `EXPO_PUBLIC_API_URL`, anexa o token de acesso em toda requisição (sempre `application/json`) e, se o Backend responder `401`, tenta renovar o token uma única vez via refresh antes de desistir e encerrar a sessão. |
| `auth/auth-context.tsx` | Contexto React (Context API) que guarda o usuário logado e expõe login/logout para as telas. |
| `auth/session-store.ts` | Leitura/escrita dos tokens de sessão no `expo-secure-store` (armazenamento criptografado do sistema operacional). |
| `auth/device-id.ts` | Gera (uma única vez) e recupera um identificador único e estável para este aparelho, usado em login/sync. |
| `auth/revocation-bus.ts` | Mecanismo simples de "pub/sub" para avisar o restante do app quando a sessão é revogada em outro lugar do código (ex: dentro do interceptor HTTP), sem acoplar tudo ao `auth-context.tsx`. |
| `collection/session-context.ts` | Implementa a "Sessão de Coleta" (RF11): mantém em memória o valor de perguntas marcadas como `sessionScoped` para reaproveitar entre respostas consecutivas da mesma pesquisa (ex: não perguntar o turno de trabalho a cada nova coleta). |
| `collection/saved-headers-repository.ts` | Persiste no SQLite o último cabeçalho preenchido por pesquisa, usado pelas ações "Editar cabeçalho" e "Limpar dados preenchidos" da tela de coleta. |
| `config/app-config-repository.ts` | Leitura/escrita de configurações do app persistidas no SQLite (ex: intervalo de retry automático de sincronização, e o reconhecimento do aviso de LGPD — `lgpd_notice_acknowledged`, ver `LgpdNoticeScreen.tsx`). |
| `drafts/drafts-repository.ts` | Salva e recupera rascunhos de formulário em andamento (para não perder uma coleta se o app fechar no meio). |
| `location/location.ts` | Captura a localização GPS do aparelho e calcula o `location_hash` (arredondamento de latitude/longitude a 3 casas decimais, usado na detecção de conflito — Contrato C2). |
| `location/location.spec.ts` | Testes unitários do cálculo de `location_hash` (o único teste automatizado de lógica pura do Mobile). |
| `notifications/sync-notifications.ts` | Dispara uma notificação local (`expo-notifications`) quando uma sincronização automática termina, resumindo quantas respostas foram enviadas. |
| `responses/responses-repository.ts` | Leitura/escrita de respostas de pesquisa no SQLite local (criação, listagem, detalhe). |
| `surveys/surveys-repository.ts` | Leitura/escrita do cache local de pesquisas e de suas versões de schema publicadas. |
| `surveys/schema-types.ts` | Tipos TypeScript que descrevem o formato do schema de formulário (espelham o Contrato C1 do Backend). |
| `sync/auto-sync.ts` | Dispara a sincronização automaticamente ao detectar conectividade (via `@react-native-community/netinfo`) e reagenda tentativas a cada `sync_retry_interval_minutes`, até o limite `sync_max_auto_retries`. |
| `sync/sync-repository.ts` | Monta os lotes de respostas pendentes e envia ao Backend via `POST /sync`, atualizando o status local de cada resposta conforme a resposta do servidor. |
| `sync/sync-status.ts` | Estado compartilhado do indicador global de sincronização (exibido na barra de status do app). |

### `apps/mobile/src/utils/`

| Arquivo | Descrição |
| ------- | --------- |
| `uuid.ts` | Geração de identificadores únicos (UUID) usados como chave idempotente das respostas enviadas ao Backend. |
| `alert.ts` | Helper único para exibir avisos ao usuário via popup nativo (`Alert.alert`), usado em vez de toasts próprios — todo aviso do Mobile passa por aqui. |

---

## `infra/` — infraestrutura compartilhada

Tudo que não é código de nenhuma das três aplicações, mas é necessário para
rodá-las juntas.

| Arquivo/Pasta | Descrição |
| -------------- | --------- |
| `nginx/nginx.conf` | Proxy reverso único de entrada: roteia `/` para o Web e `/api` para o Backend, aplica rate limiting por IP (limites diferentes para rotas gerais, login e sync), propaga cabeçalhos (`X-Forwarded-For`, `X-Request-Id`) e traz (comentado) o bloco HTTPS pronto para ativar quando o servidor tiver um domínio público. |
| `nginx/certs/.gitkeep` | Mantém a pasta `certs/` versionada mesmo vazia (onde entram os certificados HTTPS reais, que nunca são commitados). |
| `postgres/init.sql` | Script executado automaticamente na primeira inicialização do container Postgres: cria as extensões `postgis`, `uuid-ossp` e `pg_trgm` necessárias ao schema do Prisma. |
| `scripts/backup.sh` | Script de backup manual/automático: gera um dump do Postgres (`pg_dump --format=custom`), apagando backups mais antigos que `RETENTION_DAYS`. Rodado manualmente ou automaticamente pelo `deploy.yml` antes de cada deploy. |

---

## `.github/workflows/` — CI/CD

| Arquivo | Descrição |
| ------- | --------- |
| `ci.yml` | Roda em todo Pull Request: sobe um Postgres/PostGIS de teste, aplica as migrations, faz lint, roda os testes unitários e de integração do Backend, roda `npm audit` (reportando sem bloquear, ver comentário no arquivo) e o build; lint do Web e lint+testes do Mobile em jobs separados, cada um com seu próprio `npm audit` não-bloqueante. |
| `deploy.yml` | Roda em todo push na branch `main`: builda e publica as imagens Docker de Backend/Web no GitHub Container Registry (GHCR); se a variável `VPS_CONFIGURED` do repositório estiver `true`, conecta via SSH no servidor, faz backup, sobe as novas imagens, aplica migrations, garante o Administrador (`prisma db seed`, idempotente — ver `prisma/seed.ts`) e roda um smoke test pós-deploy (interrompendo o pipeline sem limpar as imagens antigas se o smoke test falhar). |

---

## `docs/`

| Arquivo | Descrição |
| ------- | --------- |
| `FieldSync_Especificacao_Tecnica.md` | Especificação técnica completa do projeto: arquitetura, contratos críticos (C1-C4), requisitos de LGPD, checklist OWASP, schema de dados e contrato de API. |
| `FieldSync_Detalhamento_Estrutura_Projeto.md` | Este arquivo — descrição pasta a pasta e arquivo a arquivo do repositório. |
