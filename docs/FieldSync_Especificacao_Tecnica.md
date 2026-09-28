# FieldSync — Especificação Técnica

---

### 📘 Como ler este documento

> Esta seção existe porque parte do time está aprendendo as tecnologias ao mesmo tempo em que implementa. Ela não substitui a documentação oficial de cada tecnologia — é um mapa para não se perder.

**Convenções usadas no documento:**

| Marcação | Significado                                                                               |
| -------- | ----------------------------------------------------------------------------------------- |
| ⚠️       | Ponto de atenção — erro comum ou decisão que impacta outros módulos. Não ignore.          |
| 📘       | Explicação "de conceito" para quem ainda não conhece o assunto — pode pular se já souber. |
| ✅       | Critério de aceite/conclusão — como saber que a parte que você implementou está correta.  |
| 🔴 🟠 🟡 | Prioridade (obrigatório / recomendado / evolução futura).                                 |

**Se você é novo no projeto, leia nesta ordem:**

1. **Proposta** e **Fluxo Geral do Sistema** (visão geral, 5 minutos).
2. **Contratos Críticos C1, C2, C3** — são o "contrato" entre Web, Backend e Mobile. Se você não entender isso, vai implementar algo que quebra a integração de outra pessoa.
3. A seção do módulo em que você foi alocado (1, 2, 3, 4 ou 5).
4. **Glossário** sempre que encontrar um termo que não conhece (ex: `locationHash`, `idempotência`, `survey_version_id`).

**Se você não entende um termo técnico usado aqui** (ex: "idempotência", "materialized view", "multi-stage build"), procure primeiro no **Glossário** no final do documento.

> **Cenário de implantação:** Servidor local na empresa + Tailscale → VPS → Nuvem (progressivo)

---

## Índice

- [Guia Rápido de Onboarding](#guia-rápido-de-onboarding)
- [Proposta](#proposta)
- [Requisitos e Critérios de Aceite](#requisitos-e-critérios-de-aceite)
- [Contexto de Implantação](#contexto-de-implantação)
- [Arquitetura Macro](#arquitetura-macro)
- [Contratos Críticos — Definir Antes do Código](#contratos-críticos--definir-antes-do-código)
- [Privacidade e Proteção de Dados (LGPD)](#privacidade-e-proteção-de-dados-lgpd)
- [Segurança — Checklist Consolidado (OWASP)](#segurança--checklist-consolidado-owasp)
- [1. Front-End Web](#1-front-end-web)
- [2. Backend](#2-backend)
- [3. Dados](#3-dados)
- [4. Mobile](#4-mobile)
- [5. Infraestrutura e DevOps](#5-infraestrutura-e-devops)
- [6. Estratégia de Testes e Homologação](#6-estratégia-de-testes-e-homologação)
- [Stack Consolidada](#stack-consolidada)
- [Contrato de API](#contrato-de-api)
- [Escopo do Projeto](#escopo-do-projeto)
- [Prioridades de Implementação](#prioridades-de-implementação)
- [Riscos e Mitigações](#riscos-e-mitigações)

---

## Guia Rápido de Onboarding

O passo a passo completo de instalação e execução — pré-requisitos,
variáveis de ambiente, Docker Compose, migrations, seed, Tailscale, Mobile —
vive em [`README.md`](../README.md), na raiz do repositório, dividido em três
modos (**Modo 1 — Desenvolvimento local**, **Modo 2 — Produção local**,
**Modo 3 — Produção em VPS**). Este documento não duplica esse conteúdo para
não divergir dele; use o README como guia operacional e volte aqui para
arquitetura, contratos entre módulos e schema de dados.

Antes de escrever qualquer código que toque em formulários, sincronização ou
conflitos, leia a seção **Contratos Críticos — Definir Antes do Código**
abaixo — são as regras que Web, Backend e Mobile precisam respeitar em
conjunto.

> 📘 **Não sabe o que é Tailscale, PostGIS, ou "idempotência"?** Vá direto ao [Glossário](#glossário) no final do documento — está lá, explicado em uma frase.

---

## Proposta

Desenvolver uma plataforma para pesquisas operacionais em campo, especialmente no setor de transportes e logística. A ideia é criar um aplicativo modular, com banco de dados estruturado, georreferenciamento e funcionamento offline-first, garantindo que, mesmo sem internet, nenhuma informação seja perdida através do salvamento local e sincronização quando há o retorno da conexão.

Além disso, o gestor dispõe de uma interface web para criar pesquisas sem programar. Ele monta as perguntas no painel, e o sistema gera automaticamente um arquivo de configuração que a aplicação lê, permitindo um processo modular e adaptável a diferentes cenários.

Em vez de apenas exportar resultados brutos, a plataforma oferece um dashboard nativo com o andamento das pesquisas. Como diferencial futuro, análise de sentimentos para respostas abertas pode ser incorporada de forma leve.

O projeto é estruturado como SaaS com foco em reduzir o tempo entre a criação da pesquisa e a apresentação dos resultados.

### Contexto real de aplicação

O contexto inicial de validação do FieldSync é o setor de **transporte público rodoviário**, junto à empresa **Auto Viação Urubupungá**, comunidade externa parceira do projeto. Essa origem é relevante para a especificação por dois motivos:

1. **Confirma o domínio de aplicação inicial** (pesquisas de campo relacionadas a transporte público — ex: pesquisas de satisfação, fluxo, condições de linhas/rotas), o que já é compatível com o exemplo do Contrato C1 e com a seção de LGPD (dados "quase anônimos", sobre o fenômeno pesquisado, não sobre o entrevistado).
2. **Reforça, como requisito de produto e não só como boa prática de engenharia, que a plataforma precisa ser genuinamente reutilizável por outras organizações e outros tipos de pesquisa no futuro** — não apenas transporte. Isso já vinha sendo endereçado tecnicamente pela entidade `Organization` (single-tenant no MVP, "estrutura preparada para multi-tenancy" — ver [3.1 Banco de Dados](#31-banco-de-dados)); esta seção agora deixa explícito que essa preparação **não é opcional para o futuro**, é parte do objetivo declarado do projeto.

---

## Requisitos e Critérios de Aceite

> ⚠️ Sem requisitos não funcionais explícitos (latência, disponibilidade, throughput), não há como saber objetivamente quando um módulo está "pronto" nem como priorizar otimizações. As metas abaixo foram validadas com o time de produto: por se tratar de um protótipo em fase inicial, são aceitas como estão e serão revisitadas se o escopo crescer além dos 12 dispositivos atuais.

### Requisitos Funcionais (RF) — visão consolidada

| #    | Requisito Funcional                                                                                                                                                                                   | Módulo(s)     | Prioridade |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| RF01 | Gestor cria, edita, publica e arquiva pesquisas sem escrever código                                                                                                                                   | 1.3, 1.4, 2.4 | 🔴         |
| RF02 | Pesquisador coleta dados 100% offline, sem perda de informação                                                                                                                                        | 4.3, 4.4, 4.6 | 🔴         |
| RF03 | Dados coletados offline sincronizam automaticamente ao detectar conexão                                                                                                                               | 4.7, 4.8, 2.6 | 🔴         |
| RF04 | Sistema nunca duplica uma resposta reenviada (idempotência)                                                                                                                                           | 2.5, 2.6      | 🔴         |
| RF05 | Sistema detecta e isola respostas conflitantes para revisão do gestor                                                                                                                                 | 2.6 (C2)      | 🔴         |
| RF06 | Respostas coletadas com uma versão antiga do formulário continuam válidas                                                                                                                             | 2.5 (C3)      | 🔴         |
| RF07 | Gestor revoga remotamente o acesso de um dispositivo perdido/roubado                                                                                                                                  | 1.5, 2.2, 4.1 | 🔴         |
| RF08 | Gestor acompanha progresso da coleta e visualiza resultados em dashboard e mapa                                                                                                                       | 1.6, 1.7, 1.9 | 🔴         |
| RF09 | Gestor exporta dados coletados (CSV), com controle sobre dados identificáveis                                                                                                                         | 1.8, 2.10     | 🟠         |
| RF10 | Sistema informa o pesquisador, na primeira tela, sobre a coleta de dados pessoais (LGPD)                                                                                                              | 4.1           | 🔴         |
| RF11 | Pesquisador define uma vez campos de contexto de uma sessão de coleta (ex: turno, linha/rota) e o app os reaproveita automaticamente nas respostas seguintes da mesma sessão, sem repetir a digitação | 1.4, 4.3, 4.4 | 🔴         |

### Requisitos Não Funcionais (RNF)

| Categoria                   | Requisito                                                 | Meta proposta                                                                                                                                       | Como validar                                                                          |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Disponibilidade**         | Estágio LOCAL (PI)                                        | Sem SLA formal — depende de energia/internet da empresa; indisponibilidade aceitável fora do horário de coleta                                      | Não aplicável — monitorado apenas por observação direta                               |
| **Disponibilidade**         | Estágio VPS (MVP)                                         | 99% de uptime mensal (~7h de indisponibilidade/mês tolerável)                                                                                       | Uptime Kuma (5.8), revisão mensal                                                     |
| **Recuperação de desastre** | RPO (perda máxima de dados aceitável)                     | ≤ 24h (backup diário)                                                                                                                               | Teste de restauração trimestral (ver 5.9)                                             |
| **Recuperação de desastre** | RTO (tempo máximo para restaurar serviço)                 | ≤ 2h em VPS                                                                                                                                         | Simulação de disaster recovery pré-deploy                                             |
| **Performance**             | `POST /api/v1/sync` — lote de até 50 respostas             | p95 < 2s (spec mínima de VPS, seção 5.10)                                                                                                           | Teste de carga (ver [6. Estratégia de Testes](#6-estratégia-de-testes-e-homologação)) |
| **Performance**             | `GET /api/v1/analytics/.../kpis` (via view materializada) | p95 < 300ms                                                                                                                                         | Teste de carga + `EXPLAIN ANALYZE`                                                    |
| **Performance**             | Login (`POST /api/v1/auth/login`)                         | p95 < 500ms                                                                                                                                         | Teste de integração                                                                   |
| **Throughput / Escala**     | Dispositivos simultâneos sincronizando                    | 12 dispositivos hoje (número de pesquisadores de campo atuais) sem erro nem timeout — **confirmado que pode crescer futuramente** (ver nota abaixo) | Teste de carga sintético                                                              |
| **Resiliência offline**     | Coleta sem sincronizar                                    | Sem perda de dados por até 7+ dias offline contínuos                                                                                                | Teste manual extenso                                                                  |
| **Segurança**               | Hash de senha, rotação de refresh token, RBAC, TLS (VPS+) | Ver [Segurança — Checklist Consolidado](#segurança--checklist-consolidado-owasp)                                                                    | Revisão de segurança pré-deploy                                                       |
| **Conformidade**            | Tratamento de dado pessoal conforme LGPD                  | Ver [Privacidade e Proteção de Dados (LGPD)](#privacidade-e-proteção-de-dados-lgpd)                                                                 | Checklist de conformidade pré-deploy                                                  |
| **Observabilidade**         | Cobertura de Request ID                                   | 100% dos endpoints do Backend                                                                                                                       | Revisão de código                                                                     |
| **Usabilidade**             | Pesquisador opera o app de campo após treinamento         | < 15 minutos de treinamento (meta a validar com o time de produto)                                                                                  | Observação em campo durante UAT                                                       |

> 📘 **Por que "propostas" e não "definitivas"?** Metas de performance e disponibilidade custam decisões de arquitetura (ex: quantos vCPUs na VPS, se compensa Redis antes do previsto). Colocá-las por escrito agora, mesmo como proposta, evita que cada dev defina seu próprio critério informal de "rápido o suficiente".

> ⚠️ **Sobre o crescimento futuro do número de dispositivos:** o time confirmou que 12 é o número de pesquisadores de campo _hoje_, mas pode crescer. Diversas decisões técnicas do documento foram tomadas assumindo essa escala pequena — em especial **polling de 30s** (1.2), **retry com intervalo fixo em vez de backoff exponencial** (4.8) e **pg-boss em vez de Redis/BullMQ** (2.8). Nenhuma dessas decisões precisa mudar agora, mas todas devem ser **revisitadas explicitamente** se o número de dispositivos crescer de forma significativa (ordem de grandeza — dezenas para centenas). Ver também [Riscos e Mitigações](#riscos-e-mitigações).

### Critérios de Aceite — cenários críticos (formato Dado/Quando/Então)

```
CENÁRIO: Sincronização idempotente
  Dado que o Mobile enviou uma resposta com UUID "X" e recebeu timeout antes da confirmação
  Quando o Mobile reenvia a mesma resposta com UUID "X"
  Então o Backend responde "ALREADY_SYNCED" e não cria um segundo registro

CENÁRIO: Conflito de coleta duplicada (C2)
  Dado que dois pesquisadores coletaram a mesma pesquisa, com o mesmo
       collectedAt exato e o mesmo conjunto de respostas (answers idêntico)
  Quando ambas as respostas chegam ao Backend
  Então a segunda resposta recebida é marcada como CONFLICT e aparece no
       painel do gestor para revisão — nenhuma é perdida ou sobrescrita silenciosamente
       (ver critério exato em C2 — localização e respondentId não entram nele)

CENÁRIO: Validação retroativa por versão (C3)
  Dado que um pesquisador coletou 50 respostas com a versão 1 de um formulário
  E que o gestor publicou a versão 2 com uma nova pergunta obrigatória
  Quando as 50 respostas da versão 1 são sincronizadas
  Então todas são validadas contra a versão 1 (não a versão 2) e nenhuma falha por
       causa da pergunta nova

CENÁRIO: Revogação remota de sessão
  Dado que um dispositivo de campo foi reportado como perdido
  Quando o gestor clica em "Revogar sessão" para aquele dispositivo
  Então a próxima tentativa de refresh daquele dispositivo retorna 401 TOKEN_REVOKED
  E os dados ainda não sincronizados permanecem intactos no SQLite do aparelho
       (não é responsabilidade do sistema apagá-los remotamente)

CENÁRIO: Relógio de dispositivo incorreto (C4)
  Dado que o relógio de um Android está configurado 3 dias no futuro
  Quando esse dispositivo sincroniza uma resposta com esse `collectedAt`
  Então o Backend rejeita o item com status ERROR / reason INVALID_TIMESTAMP
  E o item NÃO é tratado como um CONFLICT
```

---

## Contexto de Implantação

> ⚠️ **Esta seção define a estratégia de implantação e deve ser lida antes de qualquer decisão técnica de infraestrutura.**

> ✅ **Gatilho de migração LOCAL → VPS:** a migração para VPS **não** acontece em uma data fixa do roadmap. Ela ocorre quando o sistema estiver funcionando de forma estável no servidor local + Tailscale **e** houver alto índice de aceitação/aprovação por parte da empresa/contratante sobre o funcionamento inicial. Até lá, o time deve manter o código pronto para migrar com o mínimo de alterações possível — o que já é garantido pela "Regra de ouro" desta seção (nenhuma mudança de código entre estágios, apenas variáveis de ambiente). Isso também vale para o estágio VPS → Nuvem: **não é implementado** até haver esse mesmo nível de aprovação.

Operacionalmente, isso se traduz em três modos de execução, documentados passo a passo no `README.md`: **Modo 1** (desenvolvimento local, com dados de exemplo), **Modo 2** (produção local — mesma máquina, mesmas imagens Docker de produção, sem dados de exemplo) e **Modo 3** (produção em VPS). Em qualquer modo de produção (2 ou 3), o banco nunca recebe dados de exemplo: `npx prisma db seed` com `NODE_ENV=production` cria só uma Organization e um usuário ADMINISTRADOR a partir de `ADMIN_PASSWORD` (senha forte, obrigatória, nunca a de desenvolvimento) — ver [2.2 Autenticação e Autorização](#22-autenticação-e-autorização) e [3.1 Banco de Dados](#31-banco-de-dados).

### Cenário operacional real

```
12 dispositivos Android em campo
  ↓ (coletam dados offline)
Conectam à internet (dados móveis ou Wi-Fi público)
  ↓ (sincronizam)
Servidor local na empresa (máquina física ou notebook dedicado)
  ↓ (futuramente migra para)
VPS → Nuvem
```

### O problema central: servidor local + dispositivos remotos via internet

Um servidor local atrás de roteador doméstico ou corporativo **não é acessível diretamente** da internet por padrão. Para que os 12 dispositivos em campo consigam enviar dados ao servidor da empresa, é necessário um mecanismo de acesso remoto.

**Solução adotada: Tailscale VPN**

Tailscale é uma VPN mesh gratuita (até 3 usuários / 100 dispositivos no plano gratuito) que cria uma rede privada virtual entre o servidor e todos os dispositivos. Cada dispositivo recebe um IP estável no formato `100.x.x.x`.

```
┌─────────────────────────────────────────────────────┐
│                  TAILSCALE TAILNET                   │
│                                                      │
│  Servidor da empresa        Dispositivos em campo    │
│  [fieldsync-server]         [android-01] 100.x.x.2  │
│  100.x.x.1                  [android-02] 100.x.x.3  │
│  (NestJS + PostgreSQL       ...                      │
│   + Nginx)                  [android-12] 100.x.x.13 │
│                                                      │
│  Tráfego criptografado peer-to-peer via Tailscale   │
└─────────────────────────────────────────────────────┘
```

**Por que Tailscale:**

| Critério                  | Tailscale                  | DDNS + Port Forwarding | ngrok               |
| ------------------------- | -------------------------- | ---------------------- | ------------------- |
| Complexidade de setup     | Baixa                      | Média                  | Muito baixa         |
| Requer acesso ao roteador | Não                        | Sim                    | Não                 |
| Estabilidade              | Alta                       | Média                  | Baixa (free tier)   |
| Custo                     | Gratuito (até 100 devices) | Gratuito               | Gratuito (limitado) |
| Criptografia              | Sim (WireGuard)            | Depende do TLS         | Sim                 |
| Adequado para PI          | ✅                         | ✅                     | Apenas demos        |
| Adequado para MVP         | ✅                         | ✅                     | ❌                  |

**Setup do Tailscale (resumo):**

```bash
# 1. No servidor da empresa (Ubuntu/Debian)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 2. Em cada Android: instalar "Tailscale" na Play Store
#    → entrar com a mesma conta Google/GitHub da equipe

# 3. Verificar IPs no painel: https://login.tailscale.com/admin/machines
#    Servidor aparece como: 100.x.x.1 (anotar este IP)

# 4. Configurar .env do Mobile:
API_URL=http://100.x.x.1/api
```

**Regra fundamental de conectividade:**

```
Mobile com Tailscale ativo → acessa servidor via 100.x.x.1
Mobile sem Tailscale / sem internet → coleta normalmente offline
Servidor NUNCA precisa de IP público ou domínio no estágio local
```

### Estratégia de migração progressiva

| Estágio            | Onde roda              | Como acessar              | TLS                                                |
| ------------------ | ---------------------- | ------------------------- | -------------------------------------------------- |
| **LOCAL (PI)**     | Máquina da empresa     | Tailscale VPN (100.x.x.x) | Autoassinado ou sem TLS (Tailscale já criptografa) |
| **VPS (MVP)**      | DigitalOcean / Hetzner | IP público + domínio      | Let's Encrypt                                      |
| **NUVEM (escala)** | AWS / GCP / Azure      | Load Balancer gerenciado  | Gerenciado pelo provedor                           |

> **Regra de ouro:** o código da aplicação **nunca muda** entre estágios. Apenas as variáveis de ambiente.

---

## Arquitetura Macro

```
FIELDSYNC
│
├── 1. FRONT-END WEB
│   ├── 1.1 Autenticação e Acesso
│   ├── 1.2 Painel do Gestor
│   ├── 1.3 Gestão de Pesquisas
│   ├── 1.4 Construtor de Pesquisas
│   ├── 1.5 Gestão de Usuários
│   ├── 1.6 Acompanhamento das Coletas
│   ├── 1.7 Dashboard
│   ├── 1.8 Analytics e Relatórios
│   └── 1.9 Mapas e Visualizações
│
├── 2. BACKEND
│   ├── 2.1 API
│   ├── 2.2 Autenticação e Autorização  ← revogação por dispositivo
│   ├── 2.3 Regras de Negócio
│   ├── 2.4 Gestão de Pesquisas
│   ├── 2.5 Gestão de Respostas         ← validação por versão
│   ├── 2.6 Motor de Sincronização      ← política de conflito definida
│   ├── 2.7 Cache
│   ├── 2.8 Filas e Jobs
│   ├── 2.9 Gerenciamento de Arquivos   ← fluxo obrigatório via backend
│   └── 2.10 Analytics e Processamento  ← views materializadas
│
├── 3. DADOS
│   ├── 3.1 Banco de Dados
│   └── 3.2 Armazenamento de Arquivos e Mídias
│
└── 4. MOBILE
    ├── 4.1 Autenticação                ← revogação remota de sessão
    ├── 4.2 Pesquisas
    ├── 4.3 Formulários Dinâmicos       ← contrato JSON versionado
    ├── 4.4 Coleta
    ├── 4.5 GPS / Geolocalização
    ├── 4.6 Banco Local / Offline
    ├── 4.7 Controle Offline / Online
    └── 4.8 Fila de Sincronização       ← estados para arquivos binários
```

### Fluxo Geral do Sistema

```
① Gestor cria e gerencia pesquisas no painel web (acesso via rede local ou Tailscale)
        ↓
② Backend aplica regras, processa e disponibiliza as pesquisas
        ↓
③ Dados são armazenados com segurança e integridade
        ↓
④ Pesquisador coleta dados no app mobile (mesmo offline — 12 dispositivos em campo)
        ↓
⑤ Ao conectar internet → Tailscale ativo → dados sincronizam com servidor da empresa
        ↓
⑥ Resultados são processados e exibidos no dashboard e mapas
```

> **Regra fundamental de sincronização:** `Sem internet ≠ sistema indisponível`
> A internet (via Tailscale) é necessária para **sincronização**, não para a **coleta**.

> 📘 **O que significa "offline-first" na prática:** a maioria dos apps assume que a rede está disponível e só trata a falta dela como um caso de erro. Um app **offline-first** inverte essa lógica — o comportamento padrão é funcionar sem rede (gravando tudo localmente no SQLite), e a sincronização com o servidor é tratada como uma etapa **posterior e independente**, que pode acontecer minutos, horas ou dias depois da coleta. É por isso que o Mobile precisa do seu próprio banco de dados local (4.6), de uma fila de sincronização (4.8) e de contratos como C2/C3 — sem eles, qualquer coisa feita offline arriscaria se perder ou colidir com dados de outro dispositivo quando a conexão voltasse.

---

## Contratos Críticos — Definir Antes do Código

> ⚠️ As decisões abaixo impactam múltiplos módulos e **devem ser tomadas antes de qualquer implementação de Auth/Users**.

### C1 — Contrato JSON do Formulário (entre 1.4, 2.4 e 4.3)

Este é o ponto de acoplamento mais crítico da arquitetura. O gestor gera a configuração na Web, o Backend a armazena e serve, e o Mobile a renderiza. Evoluções independentes quebram a integração.

**Decisão obrigatória:** Schema JSON tipado, versionado no repositório, usado como fonte de verdade para validação no Backend (2.5) e no Mobile (4.3).

```json
{
  "surveyId": "uuid",
  "versionId": "uuid",
  "version": 3,
  "title": "Pesquisa de Satisfação",
  "sections": [
    {
      "id": "s1",
      "title": "Identificação",
      "questions": [
        {
          "id": "q1",
          "type": "TEXT",
          "label": "Nome do entrevistado",
          "required": true,
          "orderIndex": 0,
          "config": { "maxLength": 120 }
        },
        {
          "id": "q2",
          "type": "GPS",
          "label": "Localização da coleta",
          "required": true,
          "orderIndex": 1,
          "config": { "precisionThreshold": 20 }
        },
        {
          "id": "q3",
          "type": "SINGLE_CHOICE",
          "label": "Faixa etária",
          "required": true,
          "orderIndex": 2,
          "config": { "options": ["18-24", "25-34", "35-44", "45+"] }
        }
      ]
    }
  ]
}
```

**Tipos de campo suportados no MVP:**

| Tipo              | Descrição               | Config relevante                      |
| ----------------- | ----------------------- | ------------------------------------- |
| `TEXT`            | Texto livre             | `maxLength`, `required`               |
| `NUMBER`          | Numérico                | `min`, `max`, `required`              |
| `BOOLEAN`         | Sim / Não               | `required`                            |
| `SINGLE_CHOICE`   | Escolha única           | `options[]`, `required`               |
| `MULTIPLE_CHOICE` | Múltipla escolha        | `options[]`, `minSelect`, `maxSelect` |
| `DATE`            | Data                    | `format`, `minDate`, `maxDate`        |
| `TIME`            | Hora                    | `format`                              |
| `GPS`             | Coordenadas geográficas | `precisionThreshold`                  |

> 📘 **Outro atributo geral de config, além de `containsPII` (abaixo):** `sessionScoped: true` marca uma pergunta como reaproveitável durante uma sessão de coleta (RF11) — ver comportamento completo em [1.4 Construtor de Pesquisas](#14-construtor-de-pesquisas) e [4.4 Coleta](#44-coleta).

#### Preparação para tipos de campo sensíveis (CPF/RG)

> ⚠️ Nenhum campo de documento (CPF, RG) é coletado no MVP, mas isso **pode vir a acontecer no futuro** — não é uma hipótese descartável (ver [seção de LGPD](#privacidade-e-proteção-de-dados-lgpd)). Para evitar reescrever o Contrato C1 quando isso ocorrer, o schema já reserva o suporte, mas **desativado por padrão**:

```
1. Todo tipo de campo no config JSON (C1) ganha um atributo opcional:
     "containsPII": true | false   (padrão: false)

2. Tipos futuros reservados (ainda NÃO habilitados no MVP):
     CPF   → containsPII: true (obrigatório), validação de dígito verificador
     RG    → containsPII: true (obrigatório)

3. Feature flag no Backend: ENABLE_PII_FIELD_TYPES (padrão: false)
     → enquanto false, o Backend rejeita a publicação de qualquer
       SurveyVersion cujo schema contenha um tipo de campo com
       containsPII: true, com erro 422 PII_FIELDS_DISABLED.
     → quando o time de produto decidir habilitar CPF/RG, a mudança é
       (a) ativar a flag e (b) revisar a seção de LGPD deste documento
       antes — não é uma mudança apenas técnica.
```

> 📘 **Por que uma feature flag e não só "implementar quando pedirem"?** Porque o risco não é técnico, é de conformidade: se um campo desse tipo for publicado sem que ninguém tenha revisado a base legal, o consentimento e a política de retenção para dado sensível, o sistema estaria coletando CPF/RG sem cobertura LGPD adequada. A flag garante que isso só acontece de forma deliberada.

### C2 — Política de Resolução de Conflitos (para 2.6 e 4.8)

**Cenário:** Dois dos 12 pesquisadores offline respondem à mesma pesquisa para o mesmo ponto geográfico e sincronizam em momentos diferentes.

**Política adotada para o MVP:** Registro de conflito com isolamento para revisão do gestor.

```
Resposta A (pesquisador 1, sync às 14h)  →  Aceita, status = SYNCED
Resposta A (pesquisador 2, sync às 15h)  →  Detectada duplicidade por:
                                              mesma surveyId + collectedAt idêntico
                                              + respostas (answers) idênticas
                                              → status = CONFLICT
                                              → notifica gestor no painel (1.6)
                                              → gestor decide: manter uma das duas, ou descartar ambas
```

> ⚠️ **Critério exato:** duas respostas da mesma pesquisa só são conflito se tiverem o **mesmo `collectedAt`** (timestamp exato, não "mesmo dia") **e** o **mesmo conjunto de respostas** (`answers` idêntico — arrays normalizados antes de comparar). Localização (`locationHash`) e `respondentId` **não** entram no critério — dois pesquisadores no mesmo ponto físico respondendo em horários diferentes, ou com uma única resposta diferente, não geram conflito.

**Campos relevantes em cada item do lote de sync** (ver `apps/backend/src/sync/dto/sync-request.dto.ts`):

```
id              UUID gerado no dispositivo (idempotency key)
surveyVersionId Versão do formulário no momento da coleta
collectedAt     Timestamp local da coleta (não da sincronização) — usado no critério de conflito acima
deviceId        Identificador do dispositivo (no payload do lote, não por item)
respondentId    Identificador do entrevistado, opcional (não usado na detecção de conflito)
locationHash    Hash de coordenadas arredondadas (informativo/analytics, não usado na detecção de conflito)
```

### C3 — Regra de Validação por Versão de Formulário (para 2.5)

**Cenário:** Pesquisador baixa formulário v1, coleta 50 respostas offline. Gestor publica v2 com nova pergunta obrigatória. Ao sincronizar, as respostas v1 não podem falhar na validação da v2.

**Regra:** O Backend valida cada resposta contra a versão do formulário declarada no payload, não contra a versão atual.

```json
{
  "responses": [
    {
      "survey_version_id": "uuid-da-versao-1",
      "answers": { "...": "..." }
    }
  ]
}
```

> O campo `survey_version_id` deve ser armazenado no SQLite no momento do download do formulário e incluído em toda resposta sincronizada.

### C4 — Validação de Relógio do Dispositivo (para 2.5 e 2.6)

**Cenário:** o `collectedAt` de uma resposta vem do relógio do próprio Android, que pode estar errado (fuso incorreto, usuário alterou manualmente, bateria zerada resetou o relógio). Como o Contrato C2 usa o valor exato de `collectedAt` (não "o mesmo dia") para detectar conflitos e o C3 usa `survey_version_id` (não `collectedAt`) para validação de schema, um relógio errado não quebra a validação — mas pode quebrar a **detecção de conflito** e distorcer relatórios por período.

**Decisão:** o Backend não confia cegamente no relógio do dispositivo. Ao receber cada item no `POST /api/v1/sync`, valida:

```
1. collectedAt está no futuro em relação ao horário do servidor?
     → SIM, mais de 24h no futuro → status = ERROR, reason = "INVALID_TIMESTAMP"
     → NÃO → prossegue

2. collectedAt é anterior à data de publicação (publishedAt) da SurveyVersion declarada?
     → SIM → logicamente impossível (não dá para coletar com uma versão antes dela existir)
              → status = ERROR, reason = "INVALID_TIMESTAMP"
     → NÃO → prossegue normalmente
```

> 📘 **Por que 24h de tolerância e não zero?** Fusos horários mal configurados e pequenas divergências de relógio são comuns e não indicam má-fé — só bloqueamos casos claramente impossíveis (relógio muito adiantado, ou coleta "antes" da própria versão do formulário existir). Isso evita falsos positivos que forçariam o gestor a resolver manualmente conflitos que não são conflitos reais.

> ⚠️ Diferente do C2 (conflito de duplicidade), um erro de `INVALID_TIMESTAMP` **não** gera `ConflictRecord` — é um erro de dado (`status: ERROR` na resposta de sync), não uma disputa entre duas respostas válidas. O pesquisador vê a mensagem e pode reenviar depois de corrigir o relógio do aparelho.

Sem este contrato, um relógio de dispositivo desconfigurado poderia corromper silenciosamente os dados de `collectedAt` usados no Dashboard e na detecção de conflitos.

---

## Privacidade e Proteção de Dados (LGPD)

> ⚠️ Todo dev que mexer em `responses`, `answers`, `locations` ou no export de CSV deve ler esta seção. Dados de pesquisa de campo envolvem pessoas reais, mesmo quando o foco não é sobre elas.

### 📘 Por que isso importa

O FieldSync não é uma calculadora — ele coleta dados sobre pessoas e lugares reais em nome de uma empresa contratante. A LGPD (Lei Geral de Proteção de Dados, Lei 13.709/2018) se aplica a qualquer sistema brasileiro que trate dado pessoal, independentemente do tamanho do projeto ser um PI acadêmico.

### Natureza dos dados coletados

**Confirmado com o time de produto:** a coleta é, na prática, **quase anônima**. A maioria das perguntas de uma pesquisa (ex: sobre transporte, fluxo, condições de uma via) **não são sobre a pessoa entrevistada**, e sim sobre um fenômeno ou local. Ainda assim, dois campos exigem cuidado:

| Dado                                     | O que é                                                                                                                                       | Classificação LGPD                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `respondentId` / nome do entrevistado    | Campo **opcional**, preenchido no máximo com o nome do entrevistado                                                                           | Dado pessoal (não sensível)                                                              |
| `location` (GPS da coleta)               | Coordenada de **onde o pesquisador estava coletando**, para mapeamento posterior das pesquisas — não é o endereço residencial do entrevistado | Dado pessoal quando associável a um indivíduo, tratado com o mesmo cuidado por precaução |
| Respostas de `TEXT`/`SINGLE_CHOICE`/etc. | Depende do que o gestor perguntar — na maioria dos casos, dados sobre o fenômeno pesquisado, não sobre o indivíduo                            | Não pessoal, na maioria dos casos                                                        |

**Base legal recomendada (Art. 7º da LGPD):** legítimo interesse / execução de pesquisa contratada pela organização (Art. 7º, IX), já que não há coleta de dados sensíveis (saúde, biometria, origem racial etc.) previstos no MVP.

### O que deve ser implementado no MVP (mínimo viável de conformidade)

1. **Aviso de coleta no app Mobile:** antes de iniciar uma pesquisa, uma tela simples informando que dados de localização e, se aplicável, o nome do entrevistado serão coletados para fins da pesquisa contratada — sem precisar de um fluxo de consentimento assinado (não é dado sensível), mas com transparência.
2. **Campo de nome do entrevistado é opcional por padrão** — o construtor de pesquisas (1.4) deve deixar claro para o gestor que marcar esse campo como obrigatório aumenta a responsabilidade sobre os dados coletados.
3. **Nenhum dado de documento (CPF, RG, etc.) é coletado no MVP.** O time de produto confirmou que isso pode vir a ser necessário futuramente — por isso o Contrato C1 já reserva o suporte técnico (tipos `CPF`/`RG`, atributo `containsPII`), mas **mantido desativado** por trás da feature flag `ENABLE_PII_FIELD_TYPES` (ver [C1](#contratos-críticos--definir-antes-do-código)). Antes de essa flag ser ativada em produção, esta seção de LGPD precisa ser revisada — em especial a base legal (que deixaria de ser apenas "legítimo interesse") e a política de retenção para dado sensível.
4. **Retenção de dados:** ver [4.6 Banco Local / Offline](#46-banco-local--offline) para a política no Mobile (7 dias após sincronização confirmada, configurável) e a seção 3.1 para retenção no servidor (dados de pesquisa ficam armazenados enquanto a pesquisa/organização estiver ativa — não há expurgo automático no MVP; isso deve ser revisitado se o sistema for usado em produção real com múltiplos clientes).
5. **Exportação (CSV/analytics):** o export (2.10 / `GET /analytics/.../export`) não deve incluir colunas de PII (nome do entrevistado) por padrão — apenas quando o usuário exportador marcar explicitamente uma opção "incluir dados identificáveis", registrada no `AuditLog`.

> 📘 **Nota para quem está aprendendo:** "dado pessoal" na LGPD é qualquer informação relacionada a pessoa natural identificada ou identificável — isso inclui uma coordenada de GPS quando cruzada com outros dados pode apontar para uma pessoa específica. Por isso tratamos localização com cuidado mesmo sem ser o "alvo" da pesquisa.

---

## Segurança — Checklist Consolidado (OWASP)

| #   | OWASP Top 10 (2021)                        | Controle implementado                                                                                                                                                                                    | Pendências conhecidas                                                                                                                                                        |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 | Quebra de Controle de Acesso               | RBAC via NestJS Guards (2.2), com verificação de hierarquia entre perfis (`HierarchyGuard`); pesquisador só vê pesquisas `PUBLISHED`                                                                       | ✅ Coberto por testes de autorização por perfil (ver Seção 6)                                                                                                              |
| A02 | Falhas Criptográficas                      | Argon2id parametrizado (2.2); TLS em VPS/Nuvem via Let's Encrypt (5.4)                                                                                                                                     | ⚠️ TLS precisa de renovação automática — configurar `certbot renew` via cron na VPS                                                                                        |
| A03 | Injeção                                    | Prisma (ORM parametrizado/tagged templates) em toda consulta, inclusive o SQL bruto do PostGIS e do `by-period` do Analytics; `class-validator` (DTOs) em todos os endpoints                              | ✅ Nenhuma ação adicional                                                                                                                                                   |
| A04 | Design Inseguro                            | Contratos C1-C4 e política de retry/conflito são bons exemplos de "secure by design"                                                                                                                       | ✅ Nenhuma ação adicional                                                                                                                                                   |
| A05 | Configuração Incorreta de Segurança        | `helmet()` (cabeçalhos HTTP), CORS explícito por allow-list (`CORS_ORIGIN`, obrigatório desde o boot), variáveis de ambiente validadas na inicialização (5.3), usuário não-root no Docker (5.1), Swagger desabilitado em produção (`NODE_ENV=production`) | ⚠️ Usuário do PostgreSQL de aplicação com permissões mínimas (sem `SUPERUSER`), separado do usuário usado para rodar migrations                                            |
| A06 | Componentes Vulneráveis e Desatualizados   | Versões de imagens Docker fixadas (5.1, 5.2); `npm audit` não-bloqueante no CI para os três apps (backend/web/mobile)                                                                                     | ⚠️ Backend tem vulnerabilidades ALTAS pré-existentes só corrigíveis via upgrade de major do NestJS (10→11/12) — aceito por ora, `npm audit` continua reportando novas       |
| A07 | Falhas de Identificação e Autenticação     | JWT + Argon2id + rotação de refresh token + detecção de reuso (`REUSE_DETECTED`) (2.2); rate limit dedicado em `/auth/login` e `/auth/refresh`; tempo de resposta do login equalizado (hash dummy) para não permitir enumerar e-mails cadastrados | ⚠️ Política mínima de senha para usuários criados via `POST /users` (hoje só o Administrador de produção, via `ADMIN_PASSWORD`, tem força mínima obrigatória)             |
| A08 | Falhas de Integridade de Software e Dados  | Idempotência (2.6), validação por versão (C3), multi-stage build (5.1); seed de produção nunca sobrescreve a senha de um Administrador já existente                                                       | ⚠️ Adicionar verificação de assinatura/checksum das imagens publicadas no GHCR antes do deploy                                                                             |
| A09 | Falhas de Log e Monitoramento de Segurança | Logs estruturados com Request ID (5.8); eventos de segurança logados explicitamente (login falho, `REUSE_DETECTED`, revogação de sessão)                                                                  | ✅ Nenhuma ação adicional                                                                                                                                                   |
| A10 | Server-Side Request Forgery (SSRF)         | Baixo risco no MVP (sistema não busca URLs fornecidas por usuário)                                                                                                                                         | ✅ Nenhuma ação adicional no MVP — reavaliar se uma feature futura permitir importar dados de uma URL externa                                                             |

### Itens adicionais fora da lista OWASP

| Item                    | Situação atual                                                                                                                                    | Ação recomendada                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injeção de fórmula (CSV) | Export de Analytics em CSV neutraliza valores de célula que comecem com `= + - @` (prefixo `'`), evitando execução de fórmula ao abrir no Excel | ✅ Nenhuma ação adicional                                                                                                                                                                                              |
| Segredos em CI/CD       | `.env` fora do Git, segredos de deploy em GitHub Secrets (5.7)                                                                                     | Adicionar **scanner de segredos no CI** (ex: `gitleaks`) para pegar credenciais commitadas por engano antes que cheguem à `main`                                                                                       |
| Firewall do servidor    | Tailscale cobre a rede privada; Nginx expõe 80/443                                                                                                 | Na VPS (Modo 3), configurar `ufw` (ou equivalente) permitindo apenas 80, 443 e SSH — a porta do PostgreSQL não deve estar acessível publicamente (já não está, via rede Docker interna)                               |
| Dados de exemplo em produção | O seed de produção (`NODE_ENV=production`) cria só 1 Organization + 1 Administrador (`ADMIN_PASSWORD`, validado por força); nenhum dado de exemplo | ✅ Nenhuma ação adicional                                                                                                                                                                                              |

> ✅ **Critério de aceite desta seção:** antes do deploy em VPS, todos os itens marcados com ⚠️ acima devem estar implementados ou conscientemente adiados com justificativa registrada (seguindo a mesma "Regra de Avaliação de Tecnologia" do restante do documento).

---

## 1. Front-End Web

> Única aplicação Next.js com os módulos abaixo.

---

### 1.1 Autenticação e Acesso

**O que é:** Controla o acesso dos usuários ao painel web.

```
Usuário → Login → Credenciais válidas? → Sessão autenticada
  → Sistema verifica permissões (via Backend) → Painel do perfil
```

**O que deve ser desenvolvido:**

- Tela de login, validação, gerenciamento de sessão.
- Logout, recuperação de acesso, controle de sessão expirada.
- Redirecionamento conforme perfil, proteção de rotas privadas.

**Funções:** Login/Logout, recuperação de senha, persistência e renovação de sessão, controle de acesso.

**Tecnologias:**

| Componente | Tecnologia                                   |
| ---------- | -------------------------------------------- |
| Linguagem  | TypeScript                                   |
| Framework  | Next.js + React                              |
| Auth       | Solução JWT própria (access + refresh token) |

**Alternativas:** Vue/Nuxt, Angular, Auth.js/Keycloak.

> ⚠️ O Front-end **não valida sozinho** permissões de segurança. A autorização real ocorre **no Backend** em cada endpoint.

**Depende de:** 2.2 Autenticação e Autorização.

---

### 1.2 Painel do Gestor

**O que é:** Centro de comando da plataforma.

**Funções:**

- Resumo de pesquisas (ativas, concluídas, rascunho).
- Quantidade de respostas, pesquisadores ativos, sincronizações pendentes.
- Indicadores gerais, conflitos aguardando revisão (ver **C2**).
- Acesso rápido às principais funções.

**Acompanhamento "em tempo real" — MVP:**

> WebSocket está no roadmap pós-MVP. Para o MVP, o painel atualiza os dados via **polling HTTP a cada 30 segundos** (`setInterval` + `fetch`). Simples, confiável, sem infraestrutura adicional.

```
MVP:  Browser → GET /api/v1/analytics/.../kpis (a cada 30s) → atualiza cards
Pós-MVP: WebSocket → servidor envia push a cada nova resposta sincronizada
```

**Tecnologias:** TypeScript, React, Next.js, biblioteca de componentes UI (Shadcn/ui).

> O painel deve ser responsivo — gestores podem utilizá-lo em tablets.

---

### 1.3 Gestão de Pesquisas

**O que é:** Módulo responsável pelo ciclo de vida das pesquisas.

```
CRIAR → EDITAR → VALIDAR → PUBLICAR → COLETAR → ANALISAR → ARQUIVAR
```

**Funções:**

- CRUD de pesquisas, status, datas, responsáveis.
- Criar, editar, duplicar, visualizar, publicar, despublicar, arquivar.
- Definir período e regras da coleta.

**Tecnologias:** TypeScript, React, Next.js, REST com Backend.

**Depende de:** 2.4 Gestão de Pesquisas, 2.3 Regras de Negócio, 3.1 Banco de Dados, 1.1/2.2.

---

### 1.4 Construtor de Pesquisas

**O que é:** Permite ao gestor criar formulários sem programar. Principal diferencial funcional do FieldSync.

```
Adicionar pergunta → Escolher tipo (conforme C1) → Definir label e validações
  → Configurar obrigatoriedade → Ordenar / criar seções
  → Salvar configuração (gera nova versão) → Publicar
```

**Tipos de pergunta (MVP):** TEXT, NUMBER, BOOLEAN, SINGLE_CHOICE, MULTIPLE_CHOICE, DATE, TIME, GPS.

**Funções:**

- Adicionar, remover, editar, reordenar perguntas.
- Definir obrigatoriedade e opções.
- Criar seções, visualizar prévia, validar formulário.
- **Salvar e versionar** (cada publicação gera um `SurveyVersion`).
- **Marcar uma pergunta como "reaproveitável na sessão de coleta"** (RF11 — ver abaixo).

### Contexto de Sessão de Coleta (RF11)

> 📘 **O problema que isso resolve:** em uma sessão de trabalho, o pesquisador costuma responder várias pesquisas seguidas com alguns dados de contexto idênticos (ex: turno, linha/rota, ponto de ônibus). Sem esse recurso, o pesquisador digitaria "Turno: Manhã" e "Linha: 042" em toda resposta — repetitivo e fonte comum de erro de digitação.

**No Construtor (1.4):** ao adicionar uma pergunta, o gestor pode marcar a config `sessionScoped: true` (checkbox "Reaproveitar valor durante a sessão de coleta"). Faz sentido tipicamente para perguntas `TEXT`, `SINGLE_CHOICE` ou `NUMBER` que descrevem o contexto da coleta, não o entrevistado.

```json
{
  "id": "q0",
  "type": "SINGLE_CHOICE",
  "label": "Turno",
  "required": true,
  "orderIndex": 0,
  "config": { "options": ["Manhã", "Tarde", "Noite"], "sessionScoped": true }
}
```

**No Mobile (4.4):** ao responder uma pergunta `sessionScoped` pela primeira vez em uma sessão de coleta, o app armazena o valor localmente (associado à combinação `survey_version_id` + sessão em aberto) e **pré-preenche automaticamente** essa mesma pergunta nas respostas seguintes da mesma pesquisa, dentro da mesma sessão — o pesquisador pode revisar e alterar o valor a qualquer momento (não é travado, apenas pré-preenchido). Uma sessão de coleta se encerra quando o pesquisador fecha explicitamente a pesquisa atual ou troca de pesquisa.

> ⚠️ O reaproveitamento é **só de conveniência de digitação** — cada resposta ainda salva seu próprio valor para aquele campo (não há referência compartilhada entre respostas no banco). Isso evita qualquer acoplamento estranho entre registros e mantém compatível com a validação por versão (C3): cada resposta é, para o Backend, uma unidade independente e completa.

**Tecnologias:** TypeScript, React, Next.js, biblioteca drag-and-drop (dnd-kit).

**Alternativas:** Vue + Vue Draggable, Angular CDK, Form.io, JSON Forms.

> O construtor gera uma **configuração JSON**, não código. Toda alteração publicada incrementa o `version`. O histórico de versões é preservado para validação retroativa (ver **C3**).

```
GESTOR → CONSTRUTOR → JSON → BACKEND → BANCO → MOBILE → FORMULÁRIO RENDERIZADO
```

---

### 1.5 Gestão de Usuários

**O que é:** Administração dos usuários da organização.

**Funções:**

- Criar, editar, bloquear, ativar usuário.
- Alterar perfil.
- Redefinir acesso, visualizar atividade.
- **Revogar sessões ativas por usuário e por dispositivo** (ver 2.2).
- **Gerenciar autoridade de outros usuários respeitando a hierarquia de perfis** (ver abaixo).

**Perfis e hierarquia:**

```
Nível 0 — ROOT            → reservado ao(s) programador(es)/mantenedor(es) do sistema.
                              Único perfil que pode criar ou promover um ADMINISTRADOR.
                              Não é atribuído a usuários da organização-cliente.

Nível 1 — ADMINISTRADOR   → "super admin" da organização. Pode gerenciar (criar,
                              editar, bloquear, revogar) qualquer usuário de nível 2
                              a 4. NÃO pode alterar outro ADMINISTRADOR nem o ROOT.

Nível 2 — GESTOR          → cria e gerencia pesquisas, revoga sessões de
                              pesquisadores. Pode gerenciar SUPERVISOR, PESQUISADOR
                              e VISUALIZADOR (nível 3–4). Não gerencia outro GESTOR.

Nível 3 — SUPERVISOR      → acompanha coletas, sem criar pesquisas. Sem autoridade
                              de gestão sobre outros usuários.

Nível 4 — PESQUISADOR     → coleta dados via Mobile. Sem autoridade de gestão.
Nível 4 — VISUALIZADOR    → leitura dos resultados apenas. Sem autoridade de gestão.
```

**Regra de aplicação:** ao editar o perfil (`role`) ou o status (`isActive`) de um usuário, o Backend verifica se `nivel_hierárquico(usuário_alvo) > nivel_hierárquico(usuário_solicitante)`. Se falso, retorna `403 PERMISSION_DENIED`. Ver implementação em [2.2 Autenticação e Autorização](#22-autenticação-e-autorização).

**Tecnologias:** TypeScript, React, Next.js.

---

### 1.6 Acompanhamento das Coletas

**O que é:** Progresso das pesquisas com atualização periódica (polling 30s).

**Painel operacional:**

```
Planejadas / Realizadas / Sincronizadas / Pendentes / Com erro / Em conflito
```

**Funções:**

- Progresso geral, por pesquisador, por região.
- Respostas por período, sincronizações pendentes.
- **Conflitos aguardando revisão do gestor** (ver **C2**).
- Filtros por pesquisa, pesquisador, status.

**Tecnologias:** React, Next.js, TypeScript, Recharts.

---

### 1.7 Dashboard

**O que é:** Interface de apresentação dos principais indicadores.

```
┌──────────────┬─────────────┬───────────────┬────────────────┐
│  RESPOSTAS   │  CONCLUÍDO  │ PESQUISADORES │   CONFLITOS    │
│    1.250     │     87%     │      12       │       2        │
└──────────────┴─────────────┴───────────────┴────────────────┘
```

**Funções:** KPIs, gráficos, filtros, períodos, comparações, exportação.

**Tecnologias:** React, Next.js, TypeScript, Recharts.

**Alternativas:** Chart.js, Apache ECharts, D3.js.

> O Dashboard **não calcula no navegador**:
>
> ```
> Backend → calcula/agrega (via views materializadas ou cache)
> Web     → apresenta
> ```

---

### 1.8 Analytics e Relatórios

**O que é:** Análise detalhada dos dados coletados.

**Funções:**

- Filtrar e agrupar respostas (pesquisador, período, status, região).
- Comparar períodos, pesquisadores, regiões.
- Exportar CSV e relatório formatado.

**Tecnologias:** TypeScript, React, Recharts, APIs do Backend.

---

### 1.9 Mapas e Visualizações

**O que é:** Interface geográfica para visualizar onde as pesquisas foram realizadas.

**Funções:**

- Mapa com marcadores, clustering de pontos próximos.
- Informações ao clicar (pesquisador, data, status).
- Filtros por pesquisa, período, pesquisador.
- Heatmap (evolução futura).

**Tecnologias:** React, Leaflet (OpenStreetMap — gratuito, sem limite para uso não comercial).

**Alternativas:** MapLibre, OpenLayers, Mapbox (comercial).

---

## 2. Backend

> Núcleo da plataforma. Todos os módulos usam **NestJS + TypeScript** como base.

---

### 2.1 API

**O que é:** Interface de comunicação entre Web, Mobile e camada de Dados.

```
Web
 ↓
API  ←→  Mobile (12 dispositivos)
 ↓
Dados
```

**O que deve ser desenvolvido:**

- Endpoints REST com validação, serialização, tratamento de erros.
- Documentação automática (Swagger / OpenAPI via `@nestjs/swagger`).
- Versionamento `/api/v1/...`.
- Controle de acesso por endpoint via Guards.

**Endpoints principais:**

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:deviceId

GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

GET    /api/v1/surveys
POST   /api/v1/surveys
GET    /api/v1/surveys/:id
PATCH  /api/v1/surveys/:id
DELETE /api/v1/surveys/:id
POST   /api/v1/surveys/:id/publish
POST   /api/v1/surveys/:id/archive
POST   /api/v1/surveys/:id/unarchive
POST   /api/v1/surveys/:id/duplicate
GET    /api/v1/surveys/:id/versions
GET    /api/v1/surveys/:id/versions/:version
POST   /api/v1/surveys/:id/versions/:version/activate
DELETE /api/v1/surveys/:id/versions/:version
GET    /api/v1/surveys/:id/responses

POST   /api/v1/sync
GET    /api/v1/sync/status
GET    /api/v1/conflicts
GET    /api/v1/conflicts/:id
PATCH  /api/v1/conflicts/:id/resolve

GET    /api/v1/analytics/surveys/locations
GET    /api/v1/analytics/surveys/:id/kpis
GET    /api/v1/analytics/surveys/:id/responses
GET    /api/v1/analytics/surveys/:id/responses/:responseId
GET    /api/v1/analytics/surveys/:id/by-researcher
GET    /api/v1/analytics/surveys/:id/by-period
GET    /api/v1/analytics/surveys/:id/locations
GET    /api/v1/analytics/surveys/:id/export

GET    /api/v1/health
```

**Tecnologias:**

| Componente   | Tecnologia                |
| ------------ | ------------------------- |
| Linguagem    | TypeScript                |
| Framework    | NestJS                    |
| Protocolo    | HTTP/HTTPS                |
| Estilo       | REST                      |
| Documentação | Swagger (NestJS built-in) |

**Alternativas:** Python + FastAPI, Java + Spring Boot, C# + ASP.NET Core.

### Correlação e Rastreamento (Request ID)

> 📘 **O problema que isso resolve:** quando um pesquisador reporta "minha sincronização deu erro ontem à tarde", sem um identificador comum é preciso caçar manualmente nos logs do Backend por horário aproximado. Com um Request ID, o Mobile mostra o ID na tela de erro, e qualquer dev busca esse ID exato nos logs — imediato.

**Regra:** todo request no Backend recebe (ou gera, se ausente) um `X-Request-Id`, propagado por toda a cadeia:

```
Mobile → gera um UUID por chamada → header X-Request-Id
  ↓
Nginx → repassa o header (e loga no access log — ver 5.4)
  ↓
Backend (middleware NestJS) → se o header não existir, gera um novo
  ↓
Todo log da requisição (incluindo erros) inclui esse Request ID
  ↓
Resposta ao cliente inclui o mesmo X-Request-Id no header — o app pode exibir em telas de erro
```

**Implementação mínima no NestJS:** um middleware global que lê/gera o `X-Request-Id` e injeta em um contexto (ex: `AsyncLocalStorage` ou biblioteca como `nestjs-cls`), usado pelo logger em toda a aplicação.

> Isso não é "observabilidade enterprise" (não estamos adicionando OpenTelemetry/Jaeger no MVP — seria overengineering nesta escala, seguindo a mesma "Regra de Avaliação de Tecnologia" do restante do documento). É o mínimo para conseguir debugar um caso específico sem grep por horário.

---

### 2.2 Autenticação e Autorização

**O que é:** Controla identidade e permissões. Suporta revogação de sessão por dispositivo.

**O que deve ser desenvolvido:**

- Autenticação com JWT + Argon2.
- Tabela `refresh_tokens` com controle por dispositivo.
- RBAC com NestJS Guards, **incluindo verificação de hierarquia entre perfis** (ver abaixo).
- Revogação remota de sessão por `device_id`.

### RBAC Hierárquico

> A hierarquia de perfis está descrita em [1.5 Gestão de Usuários](#15-gestão-de-usuários). Aqui fica a regra de implementação no Backend.

```
enum UserRole (ordenado do mais para o menos privilegiado):
  ROOT = 0            (reservado ao(s) mantenedor(es) do sistema)
  ADMINISTRADOR = 1
  GESTOR = 2
  SUPERVISOR = 3
  PESQUISADOR = 4
  VISUALIZADOR = 4
```

**Guard adicional (`HierarchyGuard`):** em qualquer endpoint que altere `role`, `isActive` ou revogue sessão de **outro usuário** (não o próprio), o Guard compara o nível do usuário autenticado com o nível do usuário-alvo:

```
SE nível(usuário_autenticado) >= nível(usuário_alvo)
  → 403 PERMISSION_DENIED  (não pode gerenciar alguém do mesmo nível ou acima)
SENÃO
  → operação permitida
```

> ⚠️ O perfil `ROOT` não é criado por nenhum fluxo da aplicação (não existe `POST /users` com `role: "ROOT"`). É provisionado manualmente (seed controlado, fora do alcance de usuários da organização-cliente) — isso evita que qualquer bug de RBAC permita a auto-promoção de um usuário a `ROOT`.

**Fluxo de autenticação:**

```
Login (email + senha + deviceId)
  ↓
Backend valida credenciais (Argon2id)
  ↓
Gera: access_token (TTL: 15min) + refresh_token (TTL: 7 dias)
  ↓
Persiste refresh_token na tabela refresh_tokens
  ↓
Mobile armazena tokens em SecureStore
```

> ⚠️ **Proteção contra enumeração de e-mail:** quando o e-mail informado não existe (ou o usuário está inativo), o Backend roda um `argon2.verify` contra um hash fixo pré-computado antes de retornar o erro genérico `INVALID_CREDENTIALS` — sem isso, esse caminho responde bem mais rápido do que o caminho "senha incorreta" (que espera o `verify()` real completar), permitindo descobrir quais e-mails têm conta só medindo o tempo de resposta do login.

### 📘 Parâmetros do Argon2

Seguindo a recomendação da OWASP para **Argon2id** (variante recomendada, resistente tanto a ataques de canal lateral quanto a GPU cracking):

```
Algoritmo:     argon2id
memoryCost:    19456  (≈ 19 MB)
timeCost:      2      (iterações)
parallelism:   1
hashLength:    32 bytes
```

> Biblioteca recomendada: `argon2` (bindings nativos) ou `@node-rs/argon2` no NestJS. Esses parâmetros devem ficar centralizados em uma constante (`src/auth/argon2.config.ts`), nunca hardcoded em múltiplos lugares.

### Rotação de Refresh Token

> Segue a prática recomendada pela OWASP para o cenário do FieldSync (dispositivos de campo, risco real de perda/roubo de aparelho).

**Regra: refresh token de uso único ("rotating refresh tokens").** A cada chamada em `POST /api/v1/auth/refresh`, o token antigo é invalidado e um novo é emitido — nunca se reutiliza o mesmo refresh token duas vezes.

```
POST /auth/refresh { refreshToken: "A" }
  ↓
Backend verifica: token "A" existe, não expirou, não foi revogado?
  ↓
  SIM → gera novo access_token + novo refresh_token "B"
         → marca "A" como usado (revokedAt = NOW(), reason = "ROTATED")
         → retorna "B" ao Mobile
  ↓
  Se alguém tentar reusar "A" depois de já ter sido rotacionado:
    → **sinal de possível roubo de token** (dois lugares tentando usar o mesmo token)
    → Backend revoga TODOS os refresh tokens daquele device_id (não só o "A")
    → Próximo acesso legítimo do dispositivo real exige novo login
```

> 📘 **Por que isso importa:** sem rotação, um refresh token vazado (ex: aparelho roubado antes do gestor conseguir revogar manualmente) fica válido por até 7 dias inteiros. Com rotação + detecção de reuso, um token roubado só funciona até a próxima vez que o dispositivo legítimo tentar renovar — e nesse momento o sistema já percebe a anomalia e derruba a sessão inteira, sem esperar o gestor agir manualmente.

`POST /auth/refresh` tem rate limit próprio (10 req/min por IP, configurável via `REFRESH_RATE_LIMIT_PER_MINUTE`, aplicado tanto no NestJS `@Throttle` quanto na zona `refresh` do Nginx) — sem isso, a rotação/detecção de reuso ficaria só no limite geral da API (100/min), alto demais para uma rota que escreve no banco a cada chamada.

**Coluna adicional em `refresh_tokens`:** `replaced_by_token_hash TEXT` (referencia o token que substituiu este, usado para detectar reuso) e `revoke_reason TEXT` (`"MANUAL"` | `"ROTATED"` | `"REUSE_DETECTED"`).

**Tabela `refresh_tokens`:**

```sql
id                     UUID PRIMARY KEY
user_id                UUID REFERENCES users(id)
device_id              TEXT NOT NULL         -- identifica o dispositivo
device_name            TEXT                  -- "Samsung Galaxy A54"
platform               TEXT                  -- "android" | "ios"
token_hash             TEXT NOT NULL         -- hash do refresh token
expires_at             TIMESTAMP NOT NULL
revoked_at             TIMESTAMP             -- NULL = ativo; preenchido = revogado
revoke_reason          TEXT                  -- "MANUAL" | "ROTATED" | "REUSE_DETECTED"
replaced_by_token_hash TEXT                  -- token que substituiu este (rotação)
created_at             TIMESTAMP DEFAULT NOW()
```

**Fluxo de revogação:**

```
Gestor → 1.5 → seleciona pesquisador → "Revogar sessão"
  ↓
Backend: UPDATE refresh_tokens SET revoked_at = NOW() WHERE device_id = ?
  ↓
Próximo refresh do dispositivo → 401 TOKEN_REVOKED
  ↓
App exige novo login (dados offline preservados no SQLite)
```

**Funções:** Login, logout, refresh, RBAC, listagem de sessões ativas, revogação remota.

**Tecnologias:** JWT, Argon2id, NestJS Guards, PostgreSQL (`refresh_tokens`).

**Recomendação:** JWT + Argon2id + RBAC para MVP. Keycloak pode ser apresentado como alternativa profissional na defesa do PI.

---

### 2.3 Regras de Negócio

**O que é:** Camada onde ficam as regras que determinam como o FieldSync funciona. Centraliza lógica de domínio.

**Exemplos de regras:**

```
Pesquisa arquivada     → não pode receber resposta
Pergunta obrigatória   → precisa ter resposta
Pesquisador            → acessa qualquer pesquisa PUBLISHED da organização
Formulário v1 coletado → valida contra v1, não contra versão atual (C3)
Resposta duplicada     → idempotência por UUID — ignorar silenciosamente
Conflito detectado     → registrar como CONFLICT e notificar gestor (C2)
```

**Funções:**

- Validações de pesquisa, coleta, sincronização.
- Permissões e integridade de dados.
- Política de resolução de conflitos (C2).
- Validação retroativa por versão de formulário (C3).

**Tecnologias:** TypeScript, NestJS (Services / Use Cases), arquitetura modular por domínio.

---

### 2.4 Gestão de Pesquisas

**O que é:** Executa operações relacionadas às pesquisas.

**O que deve ser desenvolvido:** Services, Controllers, Repositories, validações, versionamento, publicação.

**Funções:**

- CRUD de pesquisas (criar, editar, duplicar, visualizar, arquivar).
- Publicar → gera nova `SurveyVersion`.
- Associar pesquisadores à pesquisa.
- Manter histórico de versões.

**Tecnologias:** NestJS, TypeScript, Prisma, PostgreSQL.

---

### 2.5 Gestão de Respostas

**O que é:** Recebe, valida e processa respostas. Validação por versão de formulário.

**Fluxo:**

```
Receber payload (survey_version_id obrigatório)
  ↓
Verificar idempotência (UUID já existe?)
  → SIM: retornar confirmação silenciosa (200 OK + ALREADY_SYNCED)
  → NÃO: prosseguir
  ↓
Validar collectedAt contra relógio do servidor e publishedAt da versão (C4)
  → INVÁLIDO: status = ERROR, reason = "INVALID_TIMESTAMP"
  → VÁLIDO: prosseguir
  ↓
Carregar SurveyVersion declarada no payload (não a versão atual)
  ↓
Validar estrutura da resposta contra aquela versão
  ↓
Verificar autorização do pesquisador
  ↓
Verificar conflito (location_hash + respondent_id)
  → CONFLITO: registrar ConflictRecord, notificar gestor
  → OK: persistir com status SYNCED
  ↓
Retornar confirmação com status final
```

**Tecnologias:** NestJS, TypeScript, PostgreSQL, Prisma.

---

### 2.6 Motor de Sincronização

**O que é:** Componente mais crítico. Recebe e processa lotes de dados coletados offline pelos 12 dispositivos.

**O que deve ser desenvolvido:**

- Recebimento em lote via `POST /api/v1/sync`.
- Idempotência por UUID.
- Detecção de conflito (C2) e validação por versão (C3).
- Confirmação item a item.
- Retry e tratamento de erros.

**Fluxo por item:**

```
Para cada item no lote:
  ├── Verificar idempotência (UUID)
  │     → Já existe: ALREADY_SYNCED (não duplicar)
  ├── Validar collectedAt (C4 — clock skew)
  │     → Inválido: status = ERROR, reason = "INVALID_TIMESTAMP" (não conta como CONFLICT)
  ├── Carregar SurveyVersion declarada
  ├── Validar estrutura contra aquela versão
  ├── Verificar autorização do pesquisador
  ├── Verificar conflito (location_hash + respondent_id + dia)
  │     → Conflito: status = CONFLICT, enfileirar notificação ao gestor
  │     → OK: persistir, status = SYNCED
  └── Retornar status individual
```

**Resposta de sincronização:**

```json
{
  "results": [
    { "id": "uuid-1", "status": "SYNCED" },
    { "id": "uuid-2", "status": "ALREADY_SYNCED" },
    { "id": "uuid-3", "status": "CONFLICT", "conflict_id": "uuid-conflito" },
    { "id": "uuid-4", "status": "ERROR", "reason": "survey_version not found" }
  ]
}
```

> **Idempotência obrigatória:** se o app enviar a mesma resposta duas vezes (falha de rede, retry automático), o servidor detecta pelo UUID e **não cria dois registros**.

> 📘 **O que é idempotência, na prática:** uma operação é idempotente quando executá-la várias vezes produz o mesmo resultado que executá-la uma vez só. Aqui isso funciona porque o UUID de cada resposta é gerado **no dispositivo**, não no servidor — assim, se o Mobile perde a conexão depois de enviar mas antes de receber a confirmação, ele reenvia o mesmo UUID, e o servidor simplesmente responde "já recebi esse" (`ALREADY_SYNCED`) em vez de criar uma resposta duplicada. Sem isso, toda falha de rede no meio de um sync viraria um dado duplicado no banco.

**Tecnologias:** TypeScript, NestJS, PostgreSQL, UUID como chave de idempotência.

---

### 2.7 Cache

**O que é:** Armazena temporariamente dados frequentes para reduzir consultas.

**O que deve ser desenvolvido (MVP):**

- Cache de configurações de formulários.
- Cache de queries frequentes de dashboard.

**Tecnologia principal:** Cache em memória da aplicação (NestJS CacheManager) para MVP.

**Recomendação:**

> Redis **fica opcional no MVP**. Iniciar com cache em memória. Migrar para Redis quando houver múltiplas instâncias do backend.

**Alternativas:** Redis, Memcached.

---

### 2.8 Filas e Jobs

**O que é:** Executa tarefas assíncronas sem bloquear o ciclo de requisição/resposta.

**Exemplo:**

```
Usuário solicita relatório CSV grande
  ↓
Backend registra job na fila
  ↓
Worker processa (gera o CSV/JSON do export)
  ↓
Disponibiliza URL de download
```

**Funções:** Geração de relatórios, processamento de imagens, notificações de conflito ao gestor, refresh da view materializada de KPIs.

**Tecnologia:** PostgreSQL como fila (via `pg-boss`) para MVP — sem Redis adicional.

**Recomendação:**

> Não usar Kafka ou RabbitMQ no MVP. `pg-boss` elimina dependência de Redis e é suficiente para o volume do PI.

**Alternativas pós-MVP:** BullMQ + Redis, RabbitMQ.

---

### 2.10 Analytics e Processamento

**O que é:** Transforma dados brutos em informações analíticas.

**O que deve ser desenvolvido:**

- Consultas agregadas, indicadores, estatísticas.
- Filtros por pesquisa, período, pesquisador, região.
- Processamento geográfico via PostGIS.
- **Índices otimizados para queries analíticas.**
- **Views materializadas para KPIs do Dashboard.**

**Índices mínimos:**

```sql
CREATE INDEX idx_responses_survey_created
  ON responses(survey_id, created_at DESC);

CREATE INDEX idx_responses_researcher_survey
  ON responses(researcher_id, survey_id, created_at DESC);

CREATE INDEX idx_answers_question
  ON answers(question_id, response_id);
```

**View materializada para KPIs:**

```sql
CREATE MATERIALIZED VIEW mv_survey_kpis AS
SELECT
  survey_id,
  COUNT(*)                                    AS total_responses,
  COUNT(*) FILTER (WHERE status = 'SYNCED')   AS synced,
  COUNT(*) FILTER (WHERE status = 'CONFLICT') AS conflicts,
  COUNT(*) FILTER (WHERE status = 'ERROR')    AS errors,
  MAX(created_at)                             AS last_response_at
FROM responses
GROUP BY survey_id;

-- Atualizada pelo job agendado (2.8)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_survey_kpis;
```

**Tecnologia:** TypeScript/NestJS, PostgreSQL + PostGIS, SQL.

> ⚠️ **Implementação atual diverge do desenho acima:** `GET
> /api/v1/analytics/surveys/:id/kpis` calcula os KPIs **ao vivo**, por
> agregação direta em `analytics.service.ts` (não lendo `mv_survey_kpis`) —
> para o Dashboard nunca ficar defasado em relação ao resto do Analytics
> (ver [Escopo do Projeto](#escopo-do-projeto), seção Backend). A view
> `mv_survey_kpis` ainda existe e continua sendo atualizada pelo job
> agendado (2.8), mas está órfã — nenhuma query a lê hoje; mantida para
> um uso futuro (ex: um endpoint de KPIs agregados entre várias pesquisas,
> onde a leitura via agregação ao vivo ficaria cara).

> Para o PI: PostgreSQL + SQL + views materializadas demonstra maturidade técnica suficiente.

> 📘 **View materializada, em uma frase:** uma view normal (`CREATE VIEW`) roda a query de novo toda vez que é consultada. Uma view **materializada** roda a query uma vez e **salva o resultado** como se fosse uma tabela — leituras subsequentes são instantâneas, mas o conteúdo só se atualiza quando alguém manda explicitamente (`REFRESH MATERIALIZED VIEW`). Por isso o Dashboard não fica lento mesmo com muitas respostas acumuladas: ele nunca recalcula o `COUNT()`/`GROUP BY` na hora — só lê um resultado já pronto, atualizado periodicamente pelo job do módulo 2.8.

---

## 3. Dados

---

### 3.1 Banco de Dados

**O que é:** Armazenamento estruturado e persistente de todas as informações.

**Entidades principais:**

```
Organization        ← single-tenant no MVP; estrutura preparada para multi-tenancy
User
RefreshToken        ← controle de sessões por dispositivo (2.2)
Device              ← metadados dos dispositivos
Survey
SurveyVersion       ← crítico: suporte ao Contrato C3
Question
QuestionOption
Response            ← inclui: survey_version_id, device_id, collected_at, location_hash
Answer
Location            ← PostGIS: POINT geometry
File
SyncRecord          ← status: SYNCED / CONFLICT / ERROR / ALREADY_SYNCED
ConflictRecord      ← registro de conflitos aguardando revisão (C2)
AuditLog
```

> **Single-tenant no MVP:** uma organização por instância. A entidade `Organization` existe para facilitar futura migração para multi-tenancy sem reescrita de schema.

**Por que PostgreSQL:**

| Necessidade          | Suporte         |
| -------------------- | --------------- |
| Dados relacionais    | ✅ Nativo       |
| Consultas complexas  | ✅ Nativo       |
| Transações ACID      | ✅ Nativo       |
| Geolocalização       | ✅ Via PostGIS  |
| JSON semiestruturado | ✅ JSONB nativo |
| Views materializadas | ✅ Nativo       |

**ORM:** Prisma.

**Alternativas de ORM:** Drizzle, TypeORM, SQL direto.

---

## 4. Mobile

> Aplicativo do Pesquisador. **12 dispositivos Android.** Tecnologia: React Native + Expo + TypeScript.

---

### 4.1 Autenticação

**O que é:** Acesso do pesquisador ao aplicativo com suporte a revogação remota.

**O que deve ser desenvolvido:**

- Login com armazenamento seguro (Expo SecureStore).
- Renovação automática via refresh token.
- **Tratamento de sessão revogada remotamente (TOKEN_REVOKED).**
- Preservação de dados offline após logout.

**Fluxo de revogação:**

```
Gestor revoga sessão no painel (1.5)
  ↓
Backend invalida refresh_token
  ↓
Próxima tentativa de refresh → 401 TOKEN_REVOKED
  ↓
App limpa tokens do SecureStore → redireciona para login
  ↓
Pesquisador faz novo login
```

> ⚠️ Dados coletados offline e não sincronizados **devem ser preservados** após logout forçado. O SQLite não é apagado automaticamente.

**Tecnologia:** React Native + Expo + TypeScript + Expo SecureStore.

---

### 4.2 Pesquisas

**O que é:** Acesso do pesquisador às pesquisas publicadas da organização (não há mais atribuição manual por pesquisador — decisão de produto: a coleta de campo não depende disso).

**Funções:**

- Listar pesquisas publicadas da organização.
- Baixar configuração com `survey_version_id` (crítico para C3).
- Detectar e baixar nova versão disponível.
- Visualizar status, abrir formulário.

**Tecnologia:** React Native + TypeScript.

---

### 4.3 Formulários Dinâmicos

**O que é:** Motor que transforma o JSON do Backend em interface de coleta.

```
JSON (com survey_version_id) → Form Renderer → Componente do tipo → Campo na tela
```

**Form Renderer — tipos suportados no MVP:**

```
TEXT          → <TextInput>
NUMBER        → TextInput numérico + validação
BOOLEAN       → Switch / RadioGroup Sim|Não
SINGLE_CHOICE → RadioGroup com opções do schema
MULTIPLE_CHOICE → CheckboxGroup
DATE          → DatePicker nativo
TIME          → TimePicker nativo
GPS           → botão "Capturar localização" → Expo Location
```

**Funções:**

- Renderizar campo conforme tipo.
- Validar conforme regras do schema.
- Navegação entre seções.
- Salvar rascunho localmente, restaurar preenchimento interrompido.
- **Armazenar `survey_version_id` junto com cada resposta** (obrigatório para C3).

**Tecnologia:** React Native + TypeScript + Zod (validação do contrato C1).

---

### 4.4 Coleta

**O que é:** Funcionalidade operacional do pesquisador em campo.

**Funções:**

- Iniciar coleta, salvar rascunho, continuar, finalizar, cancelar.
- Validar campos obrigatórios antes de finalizar.
- Registrar localização GPS.
- **Pré-preencher automaticamente perguntas marcadas como `sessionScoped`** com o último valor informado na sessão atual (RF11 — ver detalhamento em [1.4 Construtor de Pesquisas](#14-construtor-de-pesquisas)); pesquisador pode alterar livremente.
- **Encerrar sessão de coleta** (limpa os valores de contexto reaproveitados) ao trocar de pesquisa ou ao voltar para a lista de pesquisas.

**Tecnologia:** React Native + TypeScript.

---

### 4.5 GPS / Geolocalização

**O que é:** Registra a localização da coleta com precisão e timestamp.

**Captura:** Latitude, Longitude, Precisão (metros), Timestamp.

**Funções:**

- Solicitar permissão, capturar coordenadas.
- Verificar precisão (limiar configurável — padrão: 20 metros).
- Armazenar e associar à resposta.

**Tecnologia:** Expo Location.

---

### 4.6 Banco Local / Offline

**O que é:** Permite funcionamento sem conexão.

**Estrutura do SQLite local:**

```
surveys          ← inclui survey_version_id de cada versão baixada
questions
responses        ← inclui survey_version_id, device_id, collected_at
answers
saved_headers    ← último cabeçalho preenchido por pesquisa (editar/limpar)
sync_queue       ← fila de operações pendentes
app_config       ← chave/valor para configurações locais (ver retenção abaixo)
```

**Tecnologia:** SQLite via `expo-sqlite`.

**Alternativas:** WatermelonDB, Realm.

### Política de Retenção de Dados no Mobile

```
Resposta com status = SYNCED (confirmado pelo servidor, sem erro)
  ↓
Permanece no SQLite por MOBILE_RETENTION_DAYS (padrão: 7 dias, configurável via app_config)
  ↓
Job local de limpeza (roda ao abrir o app, no máximo 1x/dia):
  DELETE FROM responses
  WHERE status = 'SYNCED' AND synced_at < (agora - MOBILE_RETENTION_DAYS dias)
```

> 📘 **Por que 7 dias e não apagar na hora?** Os 7 dias funcionam como uma "rede de segurança": se por algum motivo o servidor perder o dado depois de confirmar o recebimento (bug, falha de disco não coberta pelo backup), o pesquisador ainda consegue reenviar manualmente durante essa janela. Depois disso, temos que confiar no backup do servidor (ver [5.9 Backup e Recuperação](#59-backup-e-recuperação)).

> ⚠️ **Só é elegível para exclusão o que está `SYNCED`.** Respostas em `PENDING`, `FAILED_MANUAL_REQUIRED` ou `CONFLICT` nunca são apagadas automaticamente — apenas dados que o servidor já confirmou.

**Chave em `app_config`:** `mobile_retention_days` (inteiro, padrão `7`) — gerenciável futuramente por uma tela de configurações do app; no MVP pode ser uma constante no código com esse nome, desde que centralizada em um único arquivo de configuração (não espalhada pelo código).

### Monitoramento de Armazenamento Local

**O que é:** não há um limite prático rígido de coleta offline (na prática, dificilmente um pesquisador passa mais de 2 dias sem conexão), mas o app deve avisar o pesquisador antes que o armazenamento do Android vire um problema — respostas acumuladas em modo offline prolongado ainda ocupam espaço no SQLite local.

```
A cada abertura do app (e periodicamente em background, se possível):
  ↓
Verificar espaço livre do dispositivo (expo-file-system: getFreeDiskStorageAsync)
  ↓
Uso do armazenamento ≥ STORAGE_WARNING_THRESHOLD (padrão: 80%)?
  → SIM: exibir banner "Armazenamento quase cheio — sincronize e libere espaço"
          → botão de atalho para sincronização manual
  → NÃO: nenhuma ação
```

> 📘 Não é necessário bloquear a coleta quando o armazenamento está alto — isso deixaria o pesquisador sem conseguir trabalhar em campo, que é justamente o cenário que o app existe para suportar. A ideia é **avisar**, não impedir.

**Chave em `app_config`:** `storage_warning_threshold_percent` (inteiro, padrão `80`).

---

### 4.7 Controle Offline / Online

**O que é:** Detecta conectividade e muda o comportamento do app.

```
ONLINE (Tailscale ativo + internet) → sincroniza dados
OFFLINE (sem internet ou sem Tailscale) → coleta normalmente → armazena localmente
```

**Funções:**

- Detectar conexão e mostrar status ao pesquisador.
- Iniciar sincronização automática ao detectar Tailscale/internet.
- Exibir indicador de sincronização na barra de status.

**Tecnologia:** `@react-native-community/netinfo`.

> **Importante:** o app verifica apenas se há internet geral. A acessibilidade ao servidor via Tailscale é validada na tentativa de sync (se falhar, entra em retry).

---

### 4.8 Fila de Sincronização

**O que é:** Fila local que controla o envio de dados ao Backend.

**Estrutura de cada operação:**

```
id              UUID (idempotency key — gerado no dispositivo)
payload         JSON da resposta
survey_version  Versão do formulário no momento da coleta (C3)
device_id       Identificador do dispositivo (C2)
collected_at    Timestamp da coleta (não da sincronização)
location_hash   Hash de coordenadas (detecção de conflito — C2)
attempts        Contador de tentativas
status          PENDING | SYNCING | SYNCED | FAILED | FAILED_MANUAL_REQUIRED | CONFLICT
error           Mensagem do último erro
```

**Estados e transições:**

```
Resposta:  PENDING → SYNCING → SYNCED
                             → FAILED → RETRY (ver política de retry abaixo)
                             → CONFLICT (aguarda ação do gestor)
```

### Política de Retry

```
Falha de sincronização (erro de rede ou 5xx do servidor):
  ↓
Aguardar SYNC_RETRY_INTERVAL_MINUTES (padrão: 60 minutos, configurável em app_config)
  ↓
Tentar novamente automaticamente
  ↓
Repetir até SYNC_MAX_AUTO_RETRIES (padrão: 3 tentativas, configurável)
  ↓
Se as 3 tentativas falharem → status = FAILED_MANUAL_REQUIRED
  ↓
App exibe alerta: "Não foi possível sincronizar automaticamente. Toque para tentar novamente."
  ↓
Pesquisador aciona sincronização manual (botão) quando quiser tentar de novo
```

> 📘 **Por que não é backoff exponencial?** Backoff exponencial (esperar cada vez mais tempo entre tentativas) é útil quando você tem milhares de clientes e quer evitar sobrecarregar o servidor com retries simultâneos ("thundering herd"). Com 12 dispositivos isso não é um risco real — um intervalo fixo e configurável é mais fácil de explicar ao usuário final e de debugar.

> ⚠️ **Erros que NÃO devem entrar no ciclo de retry automático:** respostas com erro `4xx` de validação (ex: `VERSION_NOT_FOUND`, `SCHEMA_INVALID`) não devem ser reenviadas automaticamente — o problema não é de rede, é de dado, e reenviar vai falhar de novo. Esses casos vão direto para `FAILED_MANUAL_REQUIRED` com o motivo do erro visível ao pesquisador, sem consumir as 3 tentativas de retry de rede.

**Colunas adicionais na tabela `responses` do SQLite (ver [4.6](#46-banco-local--offline)):**

```
sync_attempts      INTEGER  -- incrementado a cada tentativa automática
next_retry_at      TEXT     -- calculado como agora + SYNC_RETRY_INTERVAL_MINUTES
last_error         TEXT     -- motivo da última falha
```

**Tecnologia:** SQLite + mecanismo próprio de sincronização.

**Recomendação:** Mecanismo próprio simples e controlado, pois a sincronização é um diferencial técnico positivo na apresentação do PI.

---

## 5. Infraestrutura e DevOps

> **Estratégia:** Local (Tailscale) → VPS → Nuvem. Sem reescrita de código entre estágios.

---

### Filosofia de Infraestrutura

```
PRINCÍPIO CENTRAL:
  O ambiente local deve ser idêntico ao de produção.
  "Funciona na minha máquina" não é aceitável.

ESTRATÉGIA DE MIGRAÇÃO:
  Local (servidor da empresa + Tailscale)
    ↓  mesmo Docker Compose, apenas variáveis mudam
  VPS (produção aprovada)
    ↓  mesmo Docker Compose, apenas variáveis e volumes mudam
  Nuvem (escala)
    ↓  containers migram para serviços gerenciados (RDS, S3, ECS)
```

---

### Arquitetura de Infraestrutura

```
┌──────────────────────────────────────────────────────────────┐
│              DISPOSITIVOS (12 celulares em campo)            │
│              Tailscale instalado → IP 100.x.x.2-13          │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS via Tailscale (100.x.x.1)
┌───────────────────────────▼──────────────────────────────────┐
│                SERVIDOR DA EMPRESA                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Nginx (Proxy Reverso)                     │ │
│  │   Roteamento, TLS autoassinado, Rate Limiting           │ │
│  └──────┬──────────────────┬───────────────────────────────┘ │
│         │ /                │ /api                            │ │
│  ┌──────▼──────┐   ┌───────▼────────┐                        │
│  │  WEB        │   │  BACKEND       │                        │
│  │  Next.js    │   │  NestJS        │                        │
│  │  :3000      │   │  :3001         │                        │
│  └─────────────┘   └───────┬────────┘                        │
│                            │                                  │
│               ┌────────────┘                                  │
│               │                                               │
│  ┌────────────▼────────────┐                                  │
│  │  POSTGRESQL + PostGIS   │                                  │
│  │  :5432                  │                                  │
│  └─────────────────────────┘                                  │
│                                                               │
│  Tailscale: sudo tailscale up → IP 100.x.x.1                 │
└───────────────────────────────────────────────────────────────┘
```

> Redis é **opcional no MVP**. Não adicionado à arquitetura até haver necessidade concreta.

---

### Estágios de Implantação

| Estágio                | Ambiente               | Orquestração                          | Acesso dos dispositivos    |
| ---------------------- | ---------------------- | ------------------------------------- | -------------------------- |
| **LOCAL (PI)**         | Servidor da empresa    | Docker Compose                        | Tailscale VPN (100.x.x.x)  |
| **VPS (MVP aprovado)** | DigitalOcean / Hetzner | Docker Compose                        | IP público + domínio + TLS |
| **NUVEM (escala)**     | AWS / GCP              | Docker Compose → serviços gerenciados | Load Balancer              |

---

### 5.1 Containerização (Docker)

**O que é:** Cada serviço roda em container isolado. Comportamento idêntico em qualquer máquina.

**Dockerfiles por serviço:**

```
fieldsync/
  ├── apps/
  │   ├── backend/Dockerfile
  │   └── web/Dockerfile
  └── infra/
      └── nginx/nginx.conf
```

#### Dockerfile — Backend (NestJS) e Front-End Web (Next.js)

Ambos usam multi-stage build sobre `node:24.20.0-alpine` (versão **fixada** — nunca `node:latest`): um estágio `builder` completo (todas as dependências, compila TypeScript/Next.js) e um estágio `production` enxuto, rodando como usuário não-root. Ver os arquivos reais em `apps/backend/Dockerfile` e `apps/web/Dockerfile` — o do Backend também copia `prisma/`, `src/` e os tsconfigs para o estágio final (não só `dist/`), porque `prisma migrate deploy`/`db seed` (bootstrap do Administrador em produção) rodam dentro do próprio container de produção.

> 📘 **Por que "multi-stage build"?** O estágio `builder` precisa do TypeScript, do NestJS CLI e de outras ferramentas de desenvolvimento para _compilar_ o código — mas esses pacotes não são necessários para _rodar_ a aplicação já compilada. Um Dockerfile de único estágio levaria tudo isso para a imagem final, deixando-a maior e com mais superfície de ataque (mais pacotes = mais CVEs em potencial). Com múltiplos estágios, o estágio `production` copia só o necessário do `builder` e reinstala apenas as dependências de produção.

---

### 5.2 Orquestração (Docker Compose)

**O que é:** Liga todos os serviços com um único comando, via três arquivos na raiz do repositório — não duplicados aqui para não divergir deles:

- **`docker-compose.yml`** — base compartilhada por todos os modos: `tailscale` (VPN, opcional), `postgres` (PostGIS), `backend`, `web`, `nginx` (proxy reverso, único ponto de entrada nas portas 80/443).
- **`docker-compose.dev.yml`** — overrides de desenvolvimento (Modo 1): builda até o estágio `builder`, monta o código como volume (hot reload), expõe a porta do Postgres no host e adiciona o serviço `mobile` (dev server do Expo, só Linux).
- **`docker-compose.prod.yml`** — overrides de produção (Modos 2 e 3): usa as imagens já compiladas (`ghcr.io/.../backend`, `.../web` em VPS, build local no Modo 2), aplica limites de CPU/memória e adiciona o `uptime-kuma` (monitoramento).

`docker compose -f docker-compose.yml -f <override>.yml up -d` sobe a rede interna isolada e os volumes persistentes automaticamente. Ver o passo a passo completo (incluindo os três modos de execução) no `README.md`.

---

### 5.3 Variáveis de Ambiente e Segredos

**O que é:** Centraliza configuração sensível fora do código-fonte.

**Arquivos:**

```
.env.example      ← commitado: template com valores fictícios
.env              ← NÃO commitado: valores reais
.gitignore        ← bloqueia .env desde o primeiro commit
```

#### `.env.example` — Template

O template completo, sempre atualizado, é o próprio `.env.example` na raiz do repositório (copiar para `.env` e preencher — nunca commitado). Blocos: Geral (`NODE_ENV`, `VERSION`), Tailscale (`TS_AUTHKEY`, opcional), Banco de Dados (`POSTGRES_*`, `DATABASE_URL`), Autenticação (`JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`), URLs públicas (`API_URL`, `NEXT_PUBLIC_API_URL`), BFF (`BACKEND_INTERNAL_URL`), Mobile (`EXPO_PUBLIC_API_URL`, `MOBILE_LAN_IP`, `EXPO_DEV_SERVER_URL`), Segurança (`CORS_ORIGIN`) e Administrador de produção (`ADMIN_PASSWORD`, `ADMIN_EMAIL` — só usadas quando `NODE_ENV=production`, ver 5.10 e o `README.md`).

#### Variáveis por estágio

| Variável         | Modo 1 (dev local)                      | Modo 2 (produção local)   | Modo 3 (VPS)               |
| ---------------- | ---------------------------------------- | -------------------------- | --------------------------- |
| `NODE_ENV`       | `development`                             | `production`               | `production`                |
| `DATABASE_URL`   | `@postgres:5432` (via Docker)             | `@postgres:5432`           | `@postgres:5432`            |
| `API_URL`        | `http://localhost/api`                    | `http://localhost/api`     | `https://dominio.com/api`   |
| `ADMIN_PASSWORD` | (não usada)                                | senha forte, obrigatória   | senha forte, obrigatória    |
| `JWT_SECRET`     | qualquer string ≥32 chars                 | secret novo e forte        | secret novo e forte         |
| TLS              | nenhum (HTTP local)                       | nenhum (HTTP local)        | Let's Encrypt (5.4)         |

#### Validação de variáveis no Backend (NestJS)

`apps/backend/src/config/env.validation.ts` valida, no boot (`ConfigModule.forRoot({ validate })`), que `JWT_SECRET` (mín. 32 caracteres), `DATABASE_URL` e `CORS_ORIGIN` existem e têm o formato esperado, e que `NODE_ENV` (quando definido) é um dos valores esperados. Quando `NODE_ENV=production`, também exige e valida `ADMIN_PASSWORD` (mín. 16 caracteres, mistura de maiúsculas/minúsculas/dígito-ou-símbolo, nunca igual à senha de desenvolvimento conhecida) — a mesma checagem é reaproveitada por `prisma/seed.ts` (exportada como `validateAdminPasswordStrength`), já que o seed roda fora do boot do Nest e não pode depender dessa validação já ter acontecido.

> O Backend **rejeita a inicialização** se variáveis obrigatórias estiverem ausentes ou inválidas.

---

### 5.4 Rede e Proxy Reverso (Nginx)

**O que é:** Ponto de entrada único. Roteia requisições, termina TLS, aplica rate limiting.

```
Mobile (via Tailscale) / Browser
  ↓ HTTPS / HTTP
Nginx (porta 80/443)
  ├── /      → Web (Next.js :3000)
  └── /api   → Backend (NestJS :3001)
```

#### `infra/nginx/nginx.conf`

```nginx
events {
  worker_connections 1024;
}

http {

  # ── Rate Limiting ───────────────────────────────────────────
  limit_req_zone $binary_remote_addr zone=api:10m     rate=60r/m;
  limit_req_zone $binary_remote_addr zone=auth:10m    rate=5r/m;
  limit_req_zone $binary_remote_addr zone=refresh:10m rate=10r/m;
  limit_req_zone $binary_remote_addr zone=sync:10m    rate=30r/m;

  upstream web_service     { server web:3000; }
  upstream backend_service { server backend:3001; }

  # ── HTTP (redireciona para HTTPS em VPS; serve direto em local) ──
  server {
    listen 80;

    client_max_body_size 15M;

    location /api {
      limit_req zone=api burst=20 nodelay;
      proxy_pass         http://backend_service;
      proxy_set_header   Host              $host;
      proxy_set_header   X-Real-IP         $remote_addr;
      proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
      proxy_set_header   X-Request-Id      $request_id;   # ver "Correlação e Rastreamento" em 2.1
    }

    location /api/v1/auth/login {
      limit_req zone=auth burst=3 nodelay;
      proxy_pass http://backend_service;
    }

    location /api/v1/auth/refresh {
      limit_req zone=refresh burst=5 nodelay;
      proxy_pass http://backend_service;
    }

    location /api/v1/sync {
      limit_req zone=sync burst=50 nodelay;
      client_max_body_size 5M;           # lotes de sync são só JSON (sem fotos)
      proxy_pass http://backend_service;
      proxy_read_timeout 120s;
    }

    location / {
      proxy_pass         http://web_service;
      proxy_set_header   Host $host;
    }
  }

  # ── HTTPS (apenas VPS/Nuvem — descomentar ao migrar) ────────
  # server {
  #   listen 443 ssl;
  #   server_name seu-dominio.com;
  #   ssl_certificate     /etc/nginx/certs/fullchain.pem;
  #   ssl_certificate_key /etc/nginx/certs/privkey.pem;
  #   ssl_protocols       TLSv1.2 TLSv1.3;
  #   ...mesma configuração de location acima...
  # }
}
```

> **Local com Tailscale:** o tráfego já é criptografado pelo WireGuard da Tailscale. Não é necessário configurar TLS no Nginx para o estágio local. O bloco HTTPS fica comentado e é ativado ao migrar para VPS.

#### TLS em VPS (Let's Encrypt)

```bash
# Na VPS — domínio deve apontar para o IP público antes de rodar
docker run --rm \
  -v ./infra/nginx/certs:/etc/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d seu-dominio.com --email seu@email.com --agree-tos
```

---

### 5.5 Banco de Dados em Container

**O que é:** PostgreSQL 16 + PostGIS 3.4 em container com volume persistente.

#### `infra/postgres/init.sql`

```sql
-- Executado automaticamente na primeira inicialização
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca por texto

CREATE SCHEMA IF NOT EXISTS audit;
```

#### Ciclo de migrations (Prisma)

```bash
# Criar nova migration (desenvolvimento)
docker compose exec backend npx prisma migrate dev --name descricao_da_migration

# Aplicar em VPS/produção
docker compose exec backend npx prisma migrate deploy

# Status
docker compose exec backend npx prisma migrate status

# Seed — em desenvolvimento cria dados de exemplo; com NODE_ENV=production
# cria só o Administrador (ver ADMIN_PASSWORD, 5.3, e 5.10)
docker compose exec backend npx prisma db seed
```

**Tecnologia:** `postgis/postgis:16-3.4-alpine`.

---

### 5.7 CI/CD

**O que é:** Pipeline automatizado de testes, build e deploy.

```
Push/PR → GitHub Actions → Lint + Testes → Build Docker → Push GHCR → Deploy
```

#### Estrutura de workflows

```
.github/
  └── workflows/
      ├── ci.yml      ← todo PR: lint, testes unitários e de integração, build
      └── deploy.yml  ← merge na main: build + push + deploy em staging/VPS
```

#### `.github/workflows/ci.yml` e `.github/workflows/deploy.yml`

Os workflows reais (sempre atualizados, não duplicados aqui) rodam:

- **`ci.yml`** — em todo PR, três jobs: `test-backend` (sobe Postgres/PostGIS de teste, aplica migrations, lint, testes unitários e de integração, `npm audit` não-bloqueante, build), `lint-web` (lint) e `lint-mobile` (lint + testes + `npm audit` não-bloqueante). Node 24.20.0 fixado via `.nvmrc` em todos os jobs.
- **`deploy.yml`** — a cada push em `main`: builda e publica as imagens Backend/Web no GHCR; se a variável de repositório `VPS_CONFIGURED` estiver `true`, conecta via SSH na VPS e executa, em ordem: (1) `backup.sh` antes de qualquer migration, (2) sobe as novas imagens, (3) `prisma migrate deploy`, (3b) `prisma db seed` — idempotente, bootstra o Administrador sem recriar dados de exemplo nem sobrescrever uma senha já definida (ver 5.10), (4) smoke test em `GET /api/v1/health` com até 5 tentativas — se falhar, o job para sem limpar imagens antigas, para investigação com o container anterior ainda disponível, (5) só então `docker image prune`.

> **Para o Modo 1/2 (local):** o deploy é manual (`docker compose ... up`, ver README). O workflow de deploy para VPS fica inativo até `VPS_CONFIGURED=true` ser definido nas variáveis do repositório.

### Rollback de Deploy e Migrations

**Antes de todo deploy em VPS:** o pipeline roda `backup.sh` automaticamente (dump do Postgres) antes de tocar em qualquer container. Isso garante que sempre existe um ponto de restauração de, no máximo, poucos minutos antes do deploy.

**Se o smoke test falhar após o deploy:**

```
1. NÃO rodar `docker image prune` (o job já para antes disso — ver deploy.yml acima)
2. Reverter os containers para a imagem anterior:
     docker compose -f docker-compose.yml -f docker-compose.prod.yml \
       pull backend:<sha-anterior> web:<sha-anterior>
     docker compose up -d
3. Se a migration aplicada foi destrutiva (ex: removeu uma coluna) e o schema
   antigo não é mais compatível com o banco novo:
     docker compose exec -T postgres pg_restore --clean --if-exists \
       -U ${POSTGRES_USER} -d ${POSTGRES_DB} < backup_<timestamp_pré_deploy>.dump
4. Investigar a causa antes de tentar o deploy novamente.
```

**Regra para migrations potencialmente destrutivas** (`DROP COLUMN`, `DROP TABLE`, renomear coluna, alterar tipo de forma incompatível): a PR que introduz a migration precisa descrever, na própria descrição do PR, como reverter manualmente (nem que seja "restaurar backup pré-deploy") — não é necessário automatizar uma migration de "down" para cada mudança, o que seria esforço desproporcional para a escala do projeto, mas a reversão não pode depender de alguém "lembrar como fazer" sob pressão durante um incidente.

> 📘 **Por que não uma solução mais sofisticada (blue/green, migrations com "down" automatizado)?** Seguindo a mesma régua já usada no resto do documento: com uma única VPS e um time pequeno, o custo de manter infraestrutura blue/green não se paga. Backup + smoke test + procedimento manual documentado cobre o risco real desta escala sem adicionar complexidade permanente ao pipeline.

---

### 5.8 Monitoramento, Logs e Health Check

#### Logs estruturados

> ⚠️ `docker compose logs -f backend` mostra texto solto — suficiente para acompanhar em tempo real, mas ruim para buscar um caso específico depois. O Backend deve logar em **JSON estruturado** (uma linha = um objeto JSON), incluindo sempre: `timestamp`, `level`, `requestId` (ver "Correlação e Rastreamento" em 2.1), `message`, e contexto relevante (ex: `deviceId`, `surveyId` em logs do módulo de sync).

**Biblioteca recomendada:** `nestjs-pino` (ou o logger built-in do NestJS configurado para JSON) — evita reinventar formatação de log.

```json
{
  "timestamp": "2026-09-01T14:30:00.000Z",
  "level": "error",
  "requestId": "a1b2c3d4",
  "context": "SyncService",
  "message": "Falha ao persistir resposta",
  "deviceId": "uuid-device",
  "responseId": "uuid-resp"
}
```

> 📘 Mesmo em `docker compose logs`, log estruturado ajuda: dá para filtrar com `| grep '"level":"error"'` ou `| jq 'select(.requestId=="a1b2c3d4")'` em vez de ler tudo manualmente.

#### Métricas mínimas de sincronização

Além de disponibilidade (ping), o painel do gestor (1.2/1.6) já expõe "sincronizações pendentes" e "conflitos" — isso **é** a métrica de negócio mais importante do sistema e já está coberta pelo endpoint de KPIs do Analytics (2.10). Não é necessário adicionar Prometheus/Grafana no MVP para isso (overengineering para 12 dispositivos); o próprio Dashboard já cumpre esse papel. Uptime Kuma cobre a camada de infraestrutura (o servidor está no ar?).

#### Endpoint `/api/v1/health` (NestJS)

```typescript
// src/health/health.controller.ts
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() };
  }
}
```

> 📘 Só existe a checagem simples acima — sem autenticação, usada pelo Docker/Nginx/CI/smoke test pós-deploy (5.7). Um `GET /health/detailed` (checando conectividade do banco, por exemplo) ficou fora do MVP; se vier a ser necessário, deve continuar sem autenticação apenas se não vazar informação sensível, ou exigir `@Roles('ADMINISTRADOR')` como qualquer outro endpoint interno.

| Estágio | Monitoramento                     |
| ------- | --------------------------------- |
| Local   | `docker compose logs -f backend`  |
| VPS     | Uptime Kuma (container, gratuito) |
| Nuvem   | Datadog / Grafana + Prometheus    |

> Uptime Kuma para VPS: interface visual, alertas por email/Telegram, gratuito e auto-hospedado. Impressiona na apresentação.

---

### 5.9 Backup e Recuperação

#### Script de backup (`infra/scripts/backup.sh`)

```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/fieldsync/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"
echo "[${DATE}] Iniciando backup..."

# Dump PostgreSQL
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom > "${BACKUP_DIR}/postgres_${DATE}.dump"

# Remover backups antigos
find "${BACKUP_DIR}" -mtime +${RETENTION_DAYS} -delete

echo "[${DATE}] Backup concluído."
```

```bash
# Agendar no cron do servidor (VPS)
0 2 * * * /opt/fieldsync/infra/scripts/backup.sh >> /var/log/fieldsync-backup.log 2>&1
```

> Testar restauração **ao menos uma vez**. Backup não testado não é backup.

---

### 5.10 Migração Local → VPS → Nuvem

#### Estágio 1 — Local com Tailscale (PI)

```bash
# Setup em qualquer máquina que será o servidor
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# → anotar o IP Tailscale (ex: 100.64.0.1)

git clone https://github.com/seu-org/fieldsync
cd fieldsync
cp .env.example .env
# → preencher API_URL=http://100.64.0.1/api

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed   # dados de exemplo (dev)

# → Backend acessível em http://100.64.0.1/api (para dispositivos com Tailscale)
# → Painel web acessível em http://100.64.0.1
```

> 📘 Este é o Modo 1 (desenvolvimento) do `README.md`. Para rodar com as imagens/comportamento reais de produção **sem sair do computador local** (nenhum dado de exemplo, só o Administrador), ver o Modo 2 do README antes de migrar para uma VPS de verdade.

#### Estágio 2 — VPS (MVP aprovado)

**Requisitos mínimos:**

| Recurso | Mínimo           | Recomendado      |
| ------- | ---------------- | ---------------- |
| CPU     | 1 vCPU           | 2 vCPU           |
| RAM     | 2 GB             | 4 GB             |
| Disco   | 20 GB SSD        | 50 GB SSD        |
| SO      | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

**Provedores:**

| Provedor          | Custo              | Observação             |
| ----------------- | ------------------ | ---------------------- |
| Hetzner Cloud     | ~€4/mês (2GB)      | Melhor custo-benefício |
| DigitalOcean      | ~$12/mês (2GB)     | Boa documentação       |
| Oracle Cloud Free | Gratuito (4GB ARM) | Sem SLA                |

```bash
# Setup na VPS
curl -fsSL https://get.docker.com | sh
git clone https://github.com/seu-org/fieldsync /opt/fieldsync
cd /opt/fieldsync
cp .env.example .env   # preencher com valores de produção, incluindo
                        # ADMIN_PASSWORD (senha forte e única do Administrador)

# TLS (domínio deve apontar para o IP da VPS)
docker run --rm -p 80:80 \
  -v ./infra/nginx/certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d seu-dominio.com --email seu@email.com --agree-tos

# Descomentar bloco HTTPS no nginx.conf
# Ativar variável VPS_CONFIGURED=true no GitHub

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed   # cria só o Administrador
chmod +x infra/scripts/backup.sh
crontab -e   # 0 2 * * * /opt/fieldsync/infra/scripts/backup.sh
```

A partir daqui, `deploy.yml` automatiza os mesmos passos (migrate + seed + smoke test) a cada push em `main` (ver 5.7).

#### Estágio 3 — Nuvem (escala)

| Container  | Serviço gerenciado         |
| ---------- | -------------------------- |
| `postgres` | AWS RDS / Supabase         |
| `backend`  | AWS ECS / Cloud Run        |
| `web`      | Vercel / AWS Amplify       |
| `nginx`    | AWS ALB / Cloudflare Proxy |

**O que muda:** apenas variáveis de ambiente. Nenhuma linha de código da aplicação.

---

## 6. Estratégia de Testes e Homologação

### 6.1 Pirâmide de Testes do FieldSync

```
                    ▲
                   ╱ ╲        E2E / Homologação manual (poucos, críticos)
                  ╱───╲       → golden path completo, testado por humano
                 ╱     ╲
                ╱───────╲     Testes de Integração (Backend)
               ╱         ╲    → endpoints reais contra banco de teste
              ╱───────────╲
             ╱             ╲  Testes Unitários (Backend + Mobile)
            ╱───────────────╲ → regras de negócio isoladas, rápidos, muitos
```

> 📘 **Por que essa forma de pirâmide?** Testes unitários são rápidos e baratos de escrever — por isso devem ser a maioria. Testes de integração (que sobem um banco real) são mais lentos e mais caros — usados para validar os fluxos que **atravessam** camadas, como o motor de sincronização. Testes E2E manuais são os mais caros de todos (uma pessoa testando na prática) — reservados para o que realmente importa não quebrar no dia da apresentação/entrega.

### 6.2 Backend — o que testar e quando

| Módulo   | O que deve ganhar teste automatizado                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Auth     | Unitário: hashing Argon2id, geração/validação de JWT, rotação de refresh token, detecção de `REUSE_DETECTED`                           |
| Surveys — publicação | Unitário: regras de publicação de pesquisa (não pode editar `PUBLISHED`, não pode responder `ARCHIVED`)                  |
| Surveys — schema (C1) | Unitário: validação do schema JSON do Contrato C1                                                                        |
| Sync — idempotência | Integração: `POST /api/v1/sync` — idempotência (reenvio do mesmo UUID)                                                     |
| Sync — conflito/versão/relógio | Integração: `POST /api/v1/sync` — conflito (C2), validação por versão (C3), validação de relógio (C4)           |
| Analytics | Integração: endpoints de analytics; `EXPLAIN ANALYZE` nas queries mais pesadas                                                       |
| Release  | Regressão completa + carga sintética (ver 6.4) + revisão de segurança (ver [Checklist OWASP](#segurança--checklist-consolidado-owasp)) |

**Meta de cobertura:** o time de produto decidiu **não fixar um número de cobertura**. A qualidade dos testes é avaliada Pull Request a Pull Request, no code review — cada PR que altera um módulo crítico (`auth`, `sync`, `surveys`) deve vir acompanhado dos testes que cobrem a mudança, sem exigir uma porcentagem mínima formal de cobertura total do projeto.

**Ferramentas:** Jest (padrão do NestJS) para unitários; Jest + Supertest contra banco PostgreSQL de teste (já configurado no `ci.yml`, ver 5.7) para integração.

### 6.3 Mobile e Web

| Camada | Testes manuais (já previstos)                                     | Testes automatizados recomendados (novo)                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile | Coleta em modo avião, retry de rede, conflito simulado | Unitário: validação de campos obrigatórios do `FormRenderer`, cálculo de `location_hash`, transições de estado da `SyncQueue` (`PENDING → SYNCING → SYNCED/FAILED`) — usar Jest + React Native Testing Library           |
| Web    | Nenhum teste manual formal — cobertura pela homologação (6.5)     | E2E mínimo (Playwright ou Cypress) cobrindo o **golden path**: login → criar pesquisa → publicar → visualizar no dashboard. Não precisa cobrir toda a UI — só o caminho que, se quebrar, invalida a demonstração/entrega |

### 6.4 Teste de Carga / Estresse

Um teste de carga sintético é executado antes do deploy em produção (ver [Escopo do Projeto](#escopo-do-projeto) e `apps/backend/scripts/load-test-sync.js`):

```
OBJETIVO: confirmar que 12 dispositivos sincronizando ao mesmo tempo não
          derruba o Backend nem estoura o RNF de performance definido em
          "Requisitos e Critérios de Aceite".

FERRAMENTA: autocannon (Node) ou 12 processos `curl` em paralelo — não
            precisa de ferramenta de carga enterprise (ex: k6, Locust)
            para este volume.

CENÁRIO MÍNIMO:
  - 12 conexões simultâneas
  - cada uma enviando um lote de ~10 respostas por rodada
  - repetir por 5 minutos (não apenas um disparo único)

CRITÉRIOS DE PASSA/FALHA:
  - 0% de erros 5xx
  - p95 de latência do /sync dentro da meta definida em RNF (< 2s)
  - Backend não reinicia nem atinge limite de memória do container
    (ver limites em docker-compose.prod.yml, 5.2)
  - Após o teste, nenhuma resposta duplicada no banco (validar idempotência
    sob carga, não só em teste unitário isolado)
```

### 6.5 Homologação (UAT) — antes de qualquer deploy em produção real

> ⚠️ Testes automatizados provam que o código faz o que o time _acha_ que deveria fazer — a homologação prova que faz o que o **usuário real** precisa.

**Homologação em duas etapas:**

```
ETAPA 1 — Homologação interna (obrigatória antes de qualquer
          avaliação externa)
  → Conduzida pela própria equipe. Um dos integrantes do time é
    funcionário da empresa parceira e tem contexto suficiente para
    avaliar se o fluxo está pronto para ser exposto a pesquisadores
    reais ou à banca/contratante.
  → Só após o sign-off desta etapa interna é que se avança para uma
    homologação externa mais ampla (se necessária).

ETAPA 2 — Roteiro mínimo de homologação (interna, com dispositivos reais)
  a. Coletar 5 respostas reais offline (avião ligado).
  b. Sincronizar ao voltar o sinal — confirmar que nada se perdeu.
  c. Dois pesquisadores (ou dois dispositivos operados pela equipe)
     coletarem a mesma pesquisa de propósito com o mesmo `collectedAt`
     exato e as mesmas respostas (ver critério exato em C2 — não basta
     "mesmo local, mesmo dia"), para validar que o conflito aparece no
     painel do gestor — validar o fluxo E2E de conflito com um cenário
     real, não só teste automatizado.
  d. Gestor revisa e resolve o conflito pelo painel.
```

**Critério de sign-off:** o integrante da equipe que é funcionário da empresa parceira confirma por escrito (ex: comentário na issue de homologação) que o fluxo está adequado para uso real — esse é o gate antes de qualquer exposição externa do sistema.

### 6.6 Classificação de Severidade de Defeitos (proposta)

| Severidade    | Definição                                                  | Prazo de correção sugerido (escala PI/MVP) |
| ------------- | ---------------------------------------------------------- | ------------------------------------------ |
| 🔴 Bloqueador | Impede coleta, sincronização ou login                      | Corrigir antes de prosseguir              |
| 🟠 Crítico    | Afeta um fluxo importante mas com contorno manual possível | Corrigir no mesmo ciclo de trabalho        |
| 🟡 Maior      | Bug visível mas não bloqueia o fluxo principal             | Corrigir antes da entrega                  |
| ⚪ Menor      | Cosmético, texto, alinhamento                              | Backlog pós-MVP                            |

---

## Stack Consolidada

| Camada  | Componente    | Principal                                 | Alternativas         |
| ------- | ------------- | ----------------------------------------- | -------------------- |
| Web     | Interface     | React / Next.js                           | Vue/Nuxt, Angular    |
| Web     | Linguagem     | TypeScript                                | —                    |
| Web     | Gráficos      | Recharts                                  | ECharts, Chart.js    |
| Web     | Mapas         | Leaflet (OpenStreetMap)                   | MapLibre, Mapbox     |
| Web     | UI Components | Shadcn/ui                                 | Radix UI, MUI        |
| Web     | Drag-and-drop | dnd-kit                                   | react-beautiful-dnd  |
| Backend | Framework     | NestJS                                    | FastAPI, Spring Boot |
| Backend | Linguagem     | TypeScript                                | Python, Java         |
| Backend | Auth          | JWT + Argon2id + refresh_tokens (rotação) | Keycloak, OAuth/OIDC |
| Backend | Cache         | Em memória/NestJS MVP → Redis             | Memcached            |
| Backend | Filas         | pg-boss (MVP) → BullMQ                    | RabbitMQ             |
| Backend | API Style     | REST                                      | GraphQL, gRPC        |
| Backend | Documentação  | Swagger (NestJS built-in)                 | —                    |
| Dados   | Banco         | PostgreSQL 16 + PostGIS 3.4               | —                    |
| Dados   | ORM           | Prisma                                    | Drizzle, TypeORM     |
| Mobile  | Framework     | React Native + Expo                       | Flutter              |
| Mobile  | Linguagem     | TypeScript                                | Dart                 |
| Mobile  | Banco local   | SQLite (expo-sqlite)                      | WatermelonDB         |
| Mobile  | GPS           | Expo Location                             | —                    |
| Mobile  | Auth storage  | Expo SecureStore                          | —                    |
| Mobile  | Sync          | Mecanismo próprio + SQLite                | Realm Sync           |
| Mobile  | Conectividade | @react-native-community/netinfo           | —                    |
| Infra   | Containers    | Docker + Docker Compose                   | Podman               |
| Infra   | Proxy         | Nginx                                     | Traefik, Caddy       |
| Infra   | VPN (local)   | Tailscale                                 | WireGuard manual     |
| Infra   | CI/CD         | GitHub Actions                            | GitLab CI            |
| Infra   | Registry      | GitHub Container Registry                 | Docker Hub           |
| Infra   | Monitoramento | Uptime Kuma                               | Grafana + Prometheus |

---

## Contrato de API

> **Base URL:** `/api/v1`
> **Protocolo:** HTTPS (VPS/Nuvem) · HTTP via Tailscale (Local)
> **Autenticação:** Bearer Token (JWT access token) no header `Authorization`
> **Formato:** JSON (`Content-Type: application/json`)

---

### Convenções Gerais

#### Paginação

```
GET /api/v1/surveys?page=1&limit=20&sort=createdAt&order=desc
```

```json
{
  "data": [...],
  "meta": { "total": 87, "page": 1, "limit": 20, "totalPages": 5 }
}
```

#### Datas

ISO 8601 UTC: `"2024-08-15T14:30:00.000Z"`. O campo `collectedAt` reflete o timestamp **do dispositivo**, não do servidor.

#### Códigos HTTP

| Código | Situação                            |
| ------ | ----------------------------------- |
| `200`  | Sucesso em GET, PATCH               |
| `201`  | Criado com sucesso                  |
| `204`  | Sucesso sem corpo (DELETE, logout)  |
| `400`  | Payload inválido                    |
| `401`  | Token ausente, expirado ou revogado |
| `403`  | Token válido mas sem permissão      |
| `404`  | Recurso não encontrado              |
| `409`  | Conflito de estado                  |
| `422`  | Regra de negócio violada            |
| `429`  | Rate limit atingido                 |
| `503`  | Serviço degradado                   |

#### Envelope de Erro

```json
{
  "error": {
    "code": "SURVEY_ARCHIVED",
    "message": "A pesquisa está arquivada e não aceita novas respostas.",
    "details": {}
  }
}
```

**Códigos de erro de domínio:**

| Código                 | Situação                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| `INVALID_CREDENTIALS`  | Email ou senha incorretos                                                     |
| `TOKEN_EXPIRED`        | Access token expirado                                                         |
| `TOKEN_REVOKED`        | Refresh token revogado remotamente                                            |
| `SURVEY_NOT_FOUND`     | Pesquisa não existe ou sem acesso                                             |
| `SURVEY_ARCHIVED`      | Operação inválida em pesquisa arquivada                                       |
| `SURVEY_NOT_PUBLISHED` | Pesquisa não publicada                                                        |
| `VERSION_NOT_FOUND`    | Versão do formulário não encontrada                                           |
| `ALREADY_SYNCED`       | Resposta já sincronizada (idempotência)                                       |
| `CONFLICT_DETECTED`    | Resposta em conflito                                                          |
| `INVALID_TIMESTAMP`    | `collectedAt` inválido — relógio do dispositivo implausível (ver Contrato C4) |
| `FILE_TOO_LARGE`       | Arquivo excede limite                                                         |
| `MIME_NOT_ALLOWED`     | Tipo de arquivo não permitido                                                 |
| `PERMISSION_DENIED`    | Perfil sem permissão                                                          |

---

### Auth — Autenticação

#### `POST /api/v1/auth/login`

**Rate limit:** 5 req/min por IP.

```json
{
  "email": "pesquisador@empresa.com",
  "password": "senhaSegura123",
  "deviceId": "uuid-do-dispositivo",
  "deviceName": "Samsung Galaxy A54",
  "platform": "android"
}
```

**Response `200 OK`:**

```json
{
  "user": { "id": "uuid", "name": "João", "email": "...", "role": "PESQUISADOR" },
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
}
```

#### `POST /api/v1/auth/refresh`

```json
{ "refreshToken": "...", "deviceId": "uuid" }
```

**Errors:** `401 TOKEN_EXPIRED`, `401 TOKEN_REVOKED`

#### `POST /api/v1/auth/logout`

```json
{ "refreshToken": "...", "deviceId": "uuid" }
```

**Response `204 No Content`**

#### `GET /api/v1/auth/sessions`

Lista sessões ativas do usuário autenticado.

**Response `200 OK`:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "deviceId": "uuid",
      "deviceName": "Samsung Galaxy A54",
      "platform": "android",
      "lastSeenAt": "2024-08-15T14:00:00.000Z",
      "current": true
    }
  ]
}
```

#### `DELETE /api/v1/auth/sessions/:deviceId`

Revoga sessão de um dispositivo. **Perfis:** próprio usuário ou GESTOR/ADMINISTRADOR.

**Response `204 No Content`**

> 📘 **Fora do MVP:** recuperação de senha por e-mail (`POST /auth/password/reset-request`) não está implementada — hoje, redefinir a senha de um usuário é uma ação administrativa (`PATCH /api/v1/users/:id`, por quem tem hierarquia sobre ele). Se implementado no futuro, deve sempre retornar `200 OK` independente de o e-mail existir, para não permitir enumerar contas cadastradas — mesmo racional já aplicado ao login (ver [2.2 Autenticação e Autorização](#22-autenticação-e-autorização)).

---

### Users — Usuários

#### `GET /api/v1/users`

**Perfis:** ADMINISTRADOR, GESTOR, SUPERVISOR.

```
?page=1&limit=20&role=PESQUISADOR&isActive=true&search=joão
```

#### `POST /api/v1/users`

**Perfil:** ADMINISTRADOR.

```json
{
  "name": "Maria Santos",
  "email": "maria@empresa.com",
  "password": "provisorio123",
  "role": "PESQUISADOR"
}
```

**Response `201 Created`:** objeto UserProfile.

#### `PATCH /api/v1/users/:id`

**Perfis:** ROOT ou ADMINISTRADOR podem editar `role`/`isActive` de usuários de nível hierárquico inferior ao seu (ver [RBAC Hierárquico](#22-autenticação-e-autorização)); qualquer usuário pode editar o próprio `name`. Alterar `role` de usuário do mesmo nível ou superior retorna `403 PERMISSION_DENIED`.

---

### Surveys — Pesquisas

#### `GET /api/v1/surveys`

**Comportamento por perfil:**

- GESTOR/ADMINISTRADOR: todas da organização.
- PESQUISADOR/VISUALIZADOR: apenas as `PUBLISHED` da organização (não há mais atribuição manual por pesquisador — decisão de produto: a coleta de campo não depende disso).

```
?page=1&limit=20&status=PUBLISHED&search=satisfação
```

#### `POST /api/v1/surveys`

**Perfis:** GESTOR, ADMINISTRADOR.

```json
{
  "title": "Pesquisa de Campo 2024",
  "description": "Levantamento socioeconômico",
  "startsAt": "2024-09-01T00:00:00.000Z",
  "endsAt": "2024-11-30T23:59:59.000Z"
}
```

**Response `201 Created`:** `{ "data": { "id": "uuid", "status": "DRAFT", ... } }`

#### `GET /api/v1/surveys/:id`

Retorna detalhes completos com estatísticas (`totalResponses`, `conflictResponses`, etc.).

#### `PATCH /api/v1/surveys/:id`

Edita metadados. Apenas status DRAFT. **Error:** `422 SURVEY_ARCHIVED`.

#### `POST /api/v1/surveys/:id/publish`

Publica com schema do formulário. Gera nova `SurveyVersion`.

**Request:** `{ "schema": { "sections": [...] } }` — conforme Contrato C1.

**Response `201 Created`:**

```json
{
  "data": {
    "surveyId": "uuid",
    "versionId": "uuid",
    "version": 3,
    "publishedAt": "2024-08-15T10:00:00.000Z"
  }
}
```

**Errors:** `422 SURVEY_ARCHIVED`, `400 SCHEMA_INVALID`

#### `POST /api/v1/surveys/:id/archive`

**Response `200 OK`:** survey com `status: "ARCHIVED"`.

#### `POST /api/v1/surveys/:id/duplicate`

**Response `201 Created`:** nova survey com `status: "DRAFT"`.

#### `GET /api/v1/surveys/:id/versions`

Lista versões publicadas da pesquisa.

#### `GET /api/v1/surveys/:id/versions/:version`

Retorna schema completo de uma versão específica (Contrato C1). Usado pelo Mobile no download.

---

### Sync — Sincronização

#### `POST /api/v1/sync`

Endpoint mais crítico. Recebe lote de respostas dos dispositivos.

**Rate limit:** 30 req/min por IP.

**Request** (ver `apps/backend/src/sync/dto/sync-request.dto.ts`):

```json
{
  "deviceId": "uuid-dispositivo",
  "responses": [
    {
      "id": "uuid-gerado-no-device",
      "surveyVersionId": "uuid-da-versao",
      "collectedAt": "2024-08-15T09:30:00.000Z",
      "locationHash": "abc123",
      "location": { "latitude": -23.55052, "longitude": -46.633308, "accuracy": 8.5 },
      "respondentId": "opcional",
      "answers": {
        "q1": "Maria Santos",
        "q3": "25-34"
      }
    }
  ]
}
```

**Response `200 OK`:**

```json
{
  "results": [
    { "id": "uuid-1", "status": "SYNCED" },
    { "id": "uuid-2", "status": "ALREADY_SYNCED" },
    { "id": "uuid-3", "status": "CONFLICT", "conflictId": "uuid-conflito" },
    { "id": "uuid-4", "status": "ERROR", "reason": "SURVEY_VERSION_NOT_FOUND" }
  ]
}
```

> Motivos de `ERROR` incluem `SURVEY_VERSION_NOT_FOUND` (C3), `INVALID_TIMESTAMP` (C4, `collectedAt` mais de 24h no futuro ou anterior à publicação da versão) e `MISSING_REQUIRED_ANSWER:<externalId>`.

#### `GET /api/v1/sync/status`

```
?ids=uuid-1,uuid-2,uuid-3
```

Consulta status de respostas por UUIDs.

#### `GET /api/v1/conflicts`

Lista conflitos pendentes de revisão.

```
?surveyId=uuid&page=1&limit=20
```

#### `GET /api/v1/conflicts/:id`

Detalhe de um conflito: as duas respostas envolvidas lado a lado (respostas, localização). **Perfis:** ADMINISTRADOR, GESTOR.

#### `PATCH /api/v1/conflicts/:id/resolve`

```json
{ "resolution": "KEEP_FIRST" | "KEEP_SECOND" | "DISCARD_BOTH" }
```

**Response `200 OK`:** conflito resolvido — a resolução é só um registro auditável (`resolvedById`, `resolvedAt`); nenhuma das duas `Response` originais é alterada ou apagada, já que KPIs e a própria tela de comparação dependem delas continuarem intactas.

---

**Fields:**

### Analytics — Relatórios

#### `GET /api/v1/analytics/surveys/:id/kpis`

KPIs calculados ao vivo por agregação direta (não via `mv_survey_kpis` — ver nota em [2.10](#210-analytics-e-processamento)).

**Response `200 OK`:**

```json
{
  "data": {
    "surveyId": "uuid",
    "totalResponses": 148,
    "synced": 145,
    "conflicts": 2,
    "errors": 1,
    "activeResearchers": 5,
    "completionRate": 0.87,
    "lastResponseAt": "2024-08-15T13:45:00.000Z",
    "updatedAt": "2024-08-15T14:00:00.000Z"
  }
}
```

#### `GET /api/v1/analytics/surveys/:id/responses`

```
?page=1&limit=20&researcherId=uuid&status=SYNCED&from=...&to=...&sort=collectedAt&order=desc
```

#### `GET /api/v1/analytics/surveys/:id/responses/:responseId`

Resposta completa com todas as answers e arquivos.

#### `GET /api/v1/analytics/surveys/:id/by-researcher`

Agrupamento por pesquisador.

#### `GET /api/v1/analytics/surveys/:id/by-period`

```
?groupBy=day|week|month&from=...&to=...
```

#### `GET /api/v1/analytics/surveys/:id/locations`

Coordenadas para renderização no mapa Leaflet.

**Response `200 OK`:**

```json
{
  "data": [
    {
      "responseId": "uuid",
      "latitude": -23.55052,
      "longitude": -46.633308,
      "collectedAt": "2024-08-15T09:30:00.000Z",
      "researcher": { "id": "uuid", "name": "João" },
      "status": "SYNCED"
    }
  ]
}
```

#### `GET /api/v1/analytics/surveys/:id/export`

```
?format=csv|json&from=...&to=...&researcherId=uuid
```

Para datasets grandes: enfileira job (2.8) e retorna URL de download.

---

### Health — Monitoramento

#### `GET /api/v1/health`

```json
{ "status": "ok", "timestamp": "...", "uptime": 86400 }
```

#### `GET /api/v1/health/detailed`

**Perfil:** ADMINISTRADOR.

```json
{
  "status": "ok",
  "services": {
    "database": { "status": "ok", "latencyMs": 3 },
    "storage": { "status": "ok", "latencyMs": 12 }
  }
}
```

**Response `503`** quando alguma dependência falha.

---

## Escopo do Projeto

> **Time:** 4–5 pessoas
> **Frentes:** Backend (NestJS + TypeScript + PostgreSQL), Front-End Web (Next.js + React + TypeScript), Mobile (React Native + Expo + TypeScript), Infra/DevOps (Docker + GitHub Actions + Tailscale).

**Regra crítica de dependência entre frentes:**

```
Backend precisa estar funcionalmente pronto antes do Mobile e do Web
consumirem o mesmo recurso.
Mobile não implementa sync sem /sync funcionando.
Web não exibe dados sem endpoints de analytics funcionando.
```

Esta seção descreve o escopo entregue, organizado por frente.

### Infra / DevOps

- Repositório no GitHub com a estrutura `apps/backend`, `apps/web`, `apps/mobile`, `infra/`.
- `.gitignore` bloqueando `.env`; `.env.example` com todas as variáveis.
- `docker-compose.yml` base + `docker-compose.dev.yml`; `Dockerfile` multi-stage do Backend e do Front-End Web; `nginx.conf` com roteamento básico; `infra/postgres/init.sql` com extensões PostGIS.
- Tailscale instalado no servidor da empresa e em Androids de campo, validando conectividade ponta a ponta (`curl http://100.x.x.x/api/v1/health`).
- Workflow de CI (lint, testes unitários e de integração, `npm audit`).
- `README.md` com instruções de setup local e de conexão via Tailscale.
- Backup manual e automático pré-deploy (ver "Rollback de Deploy e Migrations" em 5.7), com restauração testada; smoke test pós-deploy; Uptime Kuma opcional para monitoramento.

### Backend

- Base NestJS + Prisma (`schema.prisma` completo, migrations, PostGIS) e `GET /api/v1/health`.
- Autenticação: `POST /api/v1/auth/login` (Argon2id — parâmetros da seção 2.2, JWT, tabela `refresh_tokens` com `deviceId`), `POST /api/v1/auth/refresh` (rotação de refresh token de uso único + detecção de reuso), `POST /api/v1/auth/logout`, `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:deviceId`. Guards `JwtAuthGuard`/`RolesGuard`.
- Usuários: `GET/POST/PATCH /api/v1/users`.
- Pesquisas: CRUD completo (`GET`, `POST`, `PATCH`, `GET /:id`), `POST /:id/publish` (valida o schema JSON — Contrato C1 — e incrementa a versão, nunca sobrescrevendo uma versão já publicada), `POST /:id/archive`, `POST /:id/duplicate`, `GET /:id/versions`, `GET /:id/versions/:version`; desnormalização de `Question`/`QuestionOption` ao publicar. Regra: pesquisador vê qualquer pesquisa PUBLISHED da organização (sem atribuição manual); pesquisa arquivada não aceita edição.
- Sincronização: `POST /api/v1/sync` com idempotência por UUID, validação de versão do formulário (C3) e de relógio do dispositivo (C4), persistência de `Response`/`Answer`/`Location`/`SyncRecord`, e detecção de conflito (C2: mesma `surveyId` + `collectedAt` idêntico + `answers` idênticas) publicando `ConflictRecord` + notificação enfileirada (pg-boss). `GET /api/v1/sync/status`, `GET /api/v1/conflicts`, `PATCH /api/v1/conflicts/:id/resolve`.
- KPIs/Dashboard: `GET /api/v1/analytics/surveys/:id/kpis` calculado ao vivo (agregação direta, não pela *materialized view* — evita defasagem entre o Dashboard e o resto do Analytics); `mv_survey_kpis` ainda existe e é atualizada por job agendado (`REFRESH MATERIALIZED VIEW CONCURRENTLY`) para outros usos futuros.
- Analytics completo: `responses`, `by-researcher`, `by-period`, `locations`, `export` (CSV/JSON), com índices revisados via `EXPLAIN ANALYZE`.
- Testes unitários (motor de sync, validação por versão, revogação/rotação de token, validação de `collectedAt`) e de integração (`POST /api/v1/sync`); teste de carga sintético do `/sync` (ver 6.4); rate limiting ajustado; revisão de segurança (CORS, headers HTTP, validação de inputs); Swagger completo.

### Front-End Web

- Login (email + senha), armazenamento do access token em memória + refresh via cookie httpOnly, redirecionamento por perfil, proteção de rotas (middleware Next.js), logout e tratamento de sessão expirada.
- Página de Gestão de Usuários (lista, criar, editar, ativar/desativar) e página de sessões ativas com botão "Revogar".
- Listagem de pesquisas com filtros, card com indicadores rápidos, página de detalhe, modal de criação, ações (editar, duplicar, arquivar), listagem de versões publicadas.
- Construtor de pesquisas: lista de perguntas com prévia ao vivo, todos os tipos do MVP, edição/reordenação (drag-and-drop via dnd-kit)/exclusão, criação de seções, checkbox "Reaproveitar valor durante a sessão de coleta" (`sessionScoped`, RF11 — obrigatório), botão "Publicar" (gera `SurveyVersion`, muda status).
- Página de acompanhamento com painel operacional: contadores de planejadas/realizadas/sincronizadas/pendentes/erros, tabela de respostas com filtros.
- Dashboard com KPIs e gráfico de série temporal (Recharts), widget de conflitos com link para resolução, página de detalhe de conflito comparando dois registros lado a lado.
- Página de analytics com filtros e tabela paginada, gráficos (Recharts BarChart + LineChart), mapa Leaflet com marcadores/clustering/popups/filtros, exportação CSV.
- Responsividade em tablets, estados de loading/erro em todas as páginas, confirmações para ações destrutivas.

### Mobile

- Tela de login (email + senha + `deviceId` persistido), tokens em `expo-secure-store`, interceptor HTTP com refresh automático ao receber 401, tratamento de `TOKEN_REVOKED` (limpa storage, redireciona ao login preservando o SQLite de dados offline).
- Aviso de coleta de dados pessoais — LGPD (RF10 — obrigatório): tela exibida logo após o primeiro login, antes de qualquer tela funcional, informando que a localização (GPS) e, quando a pesquisa pedir, o nome do entrevistado serão coletados para os fins da pesquisa contratada; reconhecimento persistido em `app_config` (`lgpd_notice_acknowledged`) para aparecer uma única vez por instalação, não a cada login.
- Tela de listagem de todas as pesquisas `PUBLISHED` da organização (sem atribuição manual por pesquisador), download e cache local do schema da versão atual (`survey_version_id` armazenado no SQLite junto com o schema baixado — crítico para a validação C3), pull-to-refresh para verificar novas versões.
- `FormRenderer` que lê o schema JSON e renderiza todos os tipos do MVP (TEXT, NUMBER, BOOLEAN, SINGLE_CHOICE, MULTIPLE_CHOICE, DATE, TIME, GPS), validação de obrigatórios antes de avançar, navegação entre seções, rascunho salvo e restaurado no SQLite, reconhecimento de campos `sessionScoped` no schema.
- Coleta offline completa: resposta salva no SQLite com status `PENDING` ao finalizar, UUID gerado no dispositivo, GPS capturado junto com a resposta, tela de respostas locais com status visual. Contexto de Sessão de Coleta (RF11 — obrigatório, ver [4.4 Coleta](#44-coleta)): ao responder um campo `sessionScoped` pela primeira vez, o valor é armazenado em memória/estado da sessão atual e pré-preenche esse mesmo campo nas respostas seguintes da mesma pesquisa, limpo ao trocar de pesquisa ou voltar à lista.
- `SyncQueue` com os estados completos de C2/C3; sync automático ao detectar Tailscale + internet; retry automático a cada `SYNC_RETRY_INTERVAL_MINUTES` (padrão 60min) até `SYNC_MAX_AUTO_RETRIES` (padrão 3) — depois disso, `FAILED_MANUAL_REQUIRED` + botão de sincronização manual; indicador global de sincronização.
- Tela de detalhe de resposta coletada com status visual por resposta; notificação local ao finalizar sync.
- Testes de sync offline extenso (lote de respostas em modo avião), de retry (falha de rede durante sincronização) e de conflito (simular 2 dispositivos no mesmo ponto); build `.apk` Android para demo.

### Critérios de Aceite Consolidados

```
✅ Admin/Gestor faz login na Web e vê o painel; cria pesquisador; revoga
   sessão de um pesquisador → o Mobile dele exige novo login, com os
   dados SQLite preservados
✅ Pesquisador faz login no Mobile via Tailscale (Android de campo) e vê
   todas as pesquisas `PUBLISHED` da organização
✅ Gestor cria pesquisa e publica; Mobile baixa o schema da versão atual e
   o armazena no SQLite
✅ Gestor monta formulário com múltiplos tipos de pergunta — incluindo ao
   menos uma marcada como "reaproveitável na sessão" — e publica; Mobile
   renderiza todos os campos, valida obrigatórios e restaura o rascunho
   após fechar o app
✅ Pesquisador coleta respostas em modo avião; ao reconectar via
   Tailscale, sync manual e automático enviam os dados para o Backend;
   reenviar a mesma resposta não duplica (ALREADY_SYNCED); fotos são
   enviadas após o sync textual; o campo sessionScoped preenchido na
   primeira resposta aparece pré-preenchido (e editável) nas seguintes
   da mesma sessão
✅ Múltiplos dispositivos sincronizando simultaneamente não geram erro;
   conflito de sincronização é detectado, aparece no painel do gestor e
   é resolvido; Dashboard exibe KPIs corretos
✅ Gestor filtra respostas por pesquisador e período no Analytics; o mapa
   exibe todos os pontos coletados; a exportação CSV abre corretamente
   no Excel
✅ Fluxo completo de ponta a ponta: login → criar pesquisa → publicar →
   coletar offline → sincronizar → dashboard → mapa → exportar CSV
✅ Backup executado e restauração validada
```

---

## Prioridades de Implementação

### 🔴 Obrigatório no MVP

```
Tailscale no servidor da empresa + nos 12 Androids
Web (frontend) + Backend (NestJS + REST) + PostgreSQL + PostGIS
Mobile (React Native + Expo) + SQLite offline-first
Sincronização com fila local (SyncQueue)
GPS em campo
Survey Builder (construtor de pesquisas)
Dashboard básico
Contrato JSON versionado (C1)
Política de conflito (C2)
Validação por versão de formulário (C3)
Validação de relógio do dispositivo (C4)
Revogação de sessão por dispositivo
Rotação de refresh token
Retenção de dados no Mobile (7 dias configurável)
Aviso de coleta de dados (LGPD) na primeira tela do Mobile
Contexto de Sessão de Coleta — reaproveitamento de campos (RF11)
```

### 🟠 Recomendado (após MVP funcional)

```
Docker + Docker Compose (todos os serviços containerizados)
GitHub Actions CI (lint + testes no PR)
Testes automatizados (unitários + integração do sync)
Teste de carga sintético do /sync
Segurança (rate limiting, headers HTTP)
Health check endpoint + logs estruturados + Request ID
Backup automático pré-deploy + smoke test pós-deploy
Views materializadas para analytics
```

### 🟡 Evolução (pós-PI)

```
Migração para VPS (quando aprovado)
Migração de Tailscale para IP público + domínio + TLS
Redis + BullMQ (quando múltiplas instâncias)
WebSocket (atualizações em tempo real no Dashboard)
Relatórios avançados
IA / análise de sentimentos para respostas abertas
Heatmap geográfico
Multi-tenancy (múltiplas organizações no mesmo backend)
```

---

## Riscos e Mitigações

| Risco                                                                | Prob. | Impacto | Mitigação                                                                                                             |
| -------------------------------------------------------------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Tailscale não funcionar em redes corporativas restritas              | Média | Alto    | Testar com os Androids reais desde o setup inicial; alternativa: DDNS + port forwarding                              |
| Motor de sync mais complexo que o previsto                           | Alta  | Alto    | Implementar primeiro sem conflito, depois com conflito                                                                |
| Form Renderer não suportar todos os tipos a tempo                    | Média | Médio   | Implementar TEXT, NUMBER, SINGLE_CHOICE, GPS primeiro                                                                 |
| Schema divergente entre Web e Mobile                                 | Média | Alto    | Definir e aprovar C1 **antes** de implementar o construtor de pesquisas                                               |
| Performance em queries analíticas com 12 dispositivos                | Baixa | Médio   | Views materializadas desde o início do motor de sync; EXPLAIN ANALYZE no Analytics                                   |
| PostGIS desconhecido pela equipe                                     | Média | Médio   | Spike de geolocalização no setup inicial                                                                              |
| Conflito de merge frequente em código compartilhado                  | Média | Baixo   | Definir owner por módulo; PRs pequenos e frequentes                                                                   |
| 12 dispositivos sincronizando ao mesmo tempo sobrecarregam o backend | Baixa | Alto    | Teste de carga sintético (ver [Escopo do Projeto](#escopo-do-projeto)); endpoint `/sync` roda isolado do restante via fila (2.8) se necessário |
| Migration destrutiva quebra produção sem plano de reversão           | Baixa | Alto    | Backup automático pré-deploy + smoke test + procedimento de rollback documentado (ver 5.7)                            |

---

## Estrutura de Diretórios

```
fieldsync/
│
├── apps/
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── surveys/
│   │   │   ├── responses/
│   │   │   ├── sync/
│   │   │   ├── files/
│   │   │   ├── analytics/
│   │   │   ├── health/
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   ├── web/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── mobile/
│       ├── src/
│       │   ├── screens/
│       │   ├── components/
│       │   ├── services/
│       │   │   ├── sync/
│       │   │   ├── database/
│       │   │   └── api/
│       │   └── navigation/
│       ├── app.json
│       └── package.json
│
├── infra/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── certs/                       ← não commitado
│   ├── postgres/
│   │   └── init.sql
│   └── scripts/
│       ├── backup.sh
│       └── restore.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── .env.example                         ← commitado
├── .env                                 ← NÃO commitado
├── .gitignore
└── README.md
```

---

## Ordem de Implementação por Frente

### Backend — sequência linear obrigatória

```
1. Migration do banco (Prisma schema completo)
2. Autenticação + Guards
3. CRUD de Surveys
4. Publicação (SurveyVersion)
5. Sync básico (sem conflito)
6. Sync completo (com conflito — C2)
7. Analytics + views materializadas
```

### Web — pode usar mock enquanto backend não entrega

```
1. Auth + proteção de rotas
2. Survey list (mock)
3. Form Builder (independente de API)
4. Integração com Backend
5. Dashboard + Analytics
6. Mapa Leaflet
```

### Mobile — SQLite é a fundação

```
1. Auth + SecureStore
2. Schema SQLite local
3. Survey list (offline-first)
4. Form Renderer (independente de API)
5. Coleta + salvar no SQLite
6. SyncQueue automático via Tailscale
```

> **Regra:** se o backend atrasar, Mobile e Web usam **mocks locais** para não bloquear. PRs são desbloqueados pela implementação de contratos, não pela disponibilidade do servidor.

---

## Schema de Dados

### Prisma Schema Completo (`prisma/schema.prisma`)

```prisma
// FieldSync — schema.prisma
// ORM: Prisma
// Banco: PostgreSQL 16 + PostGIS 3.4
//
// ⚠️ Este bloco é uma cópia fiel do apps/backend/prisma/schema.prisma atual
// (não a versão original de quando este documento foi escrito) — mantenha
// os dois em sincronia sempre que o schema real mudar.

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis, uuidOssp(map: "uuid-ossp"), pgTrgm(map: "pg_trgm")]
}

// ─────────────────────────────────────────────
// ORGANIZAÇÃO — single-tenant no MVP
// Estrutura mantida para futura migração multi-tenant sem reescrita de schema
// ─────────────────────────────────────────────

model Organization {
  id        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  name      String
  slug      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users    User[]
  surveys  Survey[]
  devices  Device[]

  @@map("organizations")
}

// ─────────────────────────────────────────────
// USUÁRIOS E SESSÕES
// ─────────────────────────────────────────────

enum UserRole {
  ROOT           // reservado ao(s) mantenedor(es) do sistema — nunca atribuído via API
  ADMINISTRADOR
  GESTOR
  SUPERVISOR
  PESQUISADOR
  VISUALIZADOR
}

model User {
  id             String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String       @db.Uuid
  name           String
  email          String       @unique
  passwordHash   String
  role           UserRole     @default(PESQUISADOR)
  isActive       Boolean      @default(true)
  // Usuário-raiz do bootstrap (seed) — nunca pode ser desativado ou
  // excluído, por ninguém (nem por si mesmo). Não é o enum UserRole.ROOT
  // (que travaria em toda rota com @Roles(ADMINISTRADOR, ...), uma
  // allowlist exata, não hierárquica) — este usuário continua ADMINISTRADOR
  // normalmente, só ganha essa proteção extra.
  isRootAdmin    Boolean      @default(false)
  lastLoginAt    DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  organization   Organization  @relation(fields: [organizationId], references: [id])
  refreshTokens  RefreshToken[]
  devices        Device[]
  responses      Response[]
  auditLogs      AuditLog[]
  createdSurveys Survey[]      @relation("SurveyCreator")

  @@index([organizationId])
  @@index([email])
  @@map("users")
}

model RefreshToken {
  id                  String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  userId              String    @db.Uuid
  deviceId            String
  deviceName          String?
  platform            String?   // "android" | "ios" | "web"
  tokenHash           String
  expiresAt           DateTime
  revokedAt           DateTime?   // NULL = ativo; preenchido = revogado
  revokeReason        String?     // "MANUAL" | "ROTATED" | "REUSE_DETECTED" — ver 2.2
  replacedByTokenHash String?     // token que substituiu este, via rotação — ver 2.2
  createdAt           DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([deviceId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}

model Device {
  id             String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String       @db.Uuid
  // Opcional + SetNull: excluir um pesquisador (ver UsersService.remove) não
  // pode ficar bloqueado pelos dispositivos que ele já usou para coletar
  // respostas (Response.deviceId é obrigatório e não pode ser apagado em
  // cascata) — o device permanece, só perde o dono. Mesmo padrão de
  // Response.researcherId.
  userId         String?      @db.Uuid
  deviceIdentifier String     @unique  // UUID gerado no primeiro login do app
  deviceName     String?
  platform       String?
  appVersion     String?
  lastSeenAt     DateTime?
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  responses      Response[]

  @@index([organizationId])
  @@index([userId])
  @@map("devices")
}

// ─────────────────────────────────────────────
// PESQUISAS E VERSIONAMENTO
// ─────────────────────────────────────────────

enum SurveyStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model Survey {
  id             String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  organizationId String       @db.Uuid
  createdById    String       @db.Uuid
  title          String
  description    String?
  type           String?      // Categoria livre definida pelo Gestor (ex: "Censo", "Satisfação") — metadado descritivo, não um enum fixo.
  questionStyle  String?      // Estilo predominante das perguntas (ex: "Likert", "Aberta") — também livre, definido pelo Gestor.
  status         SurveyStatus @default(DRAFT)
  currentVersion Int          @default(0)
  startsAt       DateTime?
  endsAt         DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  organization   Organization   @relation(fields: [organizationId], references: [id])
  createdBy      User           @relation("SurveyCreator", fields: [createdById], references: [id])
  versions       SurveyVersion[]
  responses      Response[]
  syncRecords    SyncRecord[]

  @@index([organizationId, status])
  @@index([organizationId, createdAt(sort: Desc)])
  @@map("surveys")
}

model SurveyVersion {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  surveyId    String   @db.Uuid
  version     Int
  schema      Json     // contrato C1 completo — armazenado como JSONB
  publishedAt DateTime @default(now())
  publishedBy String   @db.Uuid

  survey      Survey     @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  questions   Question[]
  responses   Response[]

  @@unique([surveyId, version])
  @@index([surveyId])
  @@map("survey_versions")
}

// ─────────────────────────────────────────────
// PERGUNTAS (desnormalizado ao publicar para leitura rápida)
// ─────────────────────────────────────────────

enum QuestionType {
  TEXT
  NUMBER
  BOOLEAN
  SINGLE_CHOICE
  MULTIPLE_CHOICE
  DATE
  TIME
  GPS
}

model Question {
  id              String       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  surveyVersionId String       @db.Uuid
  externalId      String       // "q1", "q2" — id do JSON do construtor
  type            QuestionType
  label           String
  isRequired      Boolean      @default(false)
  orderIndex      Int
  sectionId       String?
  sectionTitle    String?
  // Denormalizado de section.isHeader (ver survey-schema.validator.ts) — o
  // Detalhe da Resposta usa para separar "Cabeçalho" (preenchido uma vez por
  // sessão) das perguntas de campo, sem precisar reparsear o schema JSON.
  isHeader        Boolean      @default(false)
  config          Json?        // configurações específicas por tipo

  surveyVersion   SurveyVersion    @relation(fields: [surveyVersionId], references: [id], onDelete: Cascade)
  options         QuestionOption[]
  answers         Answer[]

  @@index([surveyVersionId])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  questionId String   @db.Uuid
  label      String
  value      String
  orderIndex Int

  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([questionId])
  @@map("question_options")
}

// ─────────────────────────────────────────────
// RESPOSTAS E COLETAS
// ─────────────────────────────────────────────

enum ResponseStatus {
  SYNCED
  CONFLICT
  ERROR
}

model Response {
  id              String         @id @db.Uuid  // UUID gerado NO dispositivo (idempotency key)
  surveyId        String         @db.Uuid
  surveyVersionId String         @db.Uuid      // versão no momento da coleta (Contrato C3)
  // Opcional + SetNull: excluir um pesquisador (ver UsersService.remove) não
  // pode apagar nem bloquear a exclusão de respostas já coletadas por ele —
  // a pesquisa e as respostas permanecem intactas, só perdem a referência ao
  // autor. Mesmo padrão já usado em AuditLog.userId.
  researcherId    String?        @db.Uuid
  deviceId        String         @db.Uuid
  respondentId    String?        // identificador externo do entrevistado
  status          ResponseStatus @default(SYNCED)
  locationHash    String?        // hash de coordenadas para detecção de conflito (C2)
  collectedAt     DateTime       // timestamp do DISPOSITIVO, não do servidor
  syncedAt        DateTime       @default(now())

  survey          Survey         @relation(fields: [surveyId], references: [id])
  surveyVersion   SurveyVersion  @relation(fields: [surveyVersionId], references: [id])
  researcher      User?          @relation(fields: [researcherId], references: [id], onDelete: SetNull)
  device          Device         @relation(fields: [deviceId], references: [id])
  answers         Answer[]
  location        Location?
  syncRecord      SyncRecord?
  conflict        ConflictRecord? @relation("ConflictResponse")
  conflictWith    ConflictRecord[] @relation("ConflictWithResponse")

  // Índices para queries analíticas — ver 2.10
  @@index([surveyId, collectedAt(sort: Desc)])
  @@index([researcherId, surveyId, collectedAt(sort: Desc)])
  @@index([surveyVersionId])
  @@index([status])
  @@map("responses")
}

model Answer {
  id         String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  responseId String   @db.Uuid
  questionId String   @db.Uuid
  value      Json     // TEXT → string; NUMBER → number; GPS → {lat,lng}; MULTIPLE_CHOICE → string[]

  response   Response @relation(fields: [responseId], references: [id], onDelete: Cascade)
  question   Question @relation(fields: [questionId], references: [id])

  @@unique([responseId, questionId])
  @@index([questionId, responseId])
  @@map("answers")
}

// ─────────────────────────────────────────────
// LOCALIZAÇÃO (PostGIS)
// ─────────────────────────────────────────────

model Location {
  id          String                  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  responseId  String                  @unique @db.Uuid
  latitude    Float
  longitude   Float
  accuracy    Float?                  // metros
  altitude    Float?
  coordinates Unsupported("geometry(Point, 4326)")?  // PostGIS
  capturedAt  DateTime

  response    Response @relation(fields: [responseId], references: [id], onDelete: Cascade)

  @@map("locations")
}

// ─────────────────────────────────────────────
// ARQUIVOS — removido do produto (captura/armazenamento de fotos não faz
// mais parte do MVP, ver "Status atual" no README); não existe mais modelo
// File nem o tipo de pergunta PHOTO.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SINCRONIZAÇÃO
// ─────────────────────────────────────────────

enum SyncStatus {
  SYNCED
  ALREADY_SYNCED
  CONFLICT
  ERROR
}

model SyncRecord {
  id          String     @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  responseId  String     @unique @db.Uuid
  surveyId    String     @db.Uuid
  deviceId    String
  status      SyncStatus
  errorReason String?
  syncedAt    DateTime   @default(now())

  response    Response   @relation(fields: [responseId], references: [id])
  survey      Survey     @relation(fields: [surveyId], references: [id])

  @@index([surveyId, status])
  @@map("sync_records")
}

enum ConflictStatus {
  PENDING
  RESOLVED
}

enum ConflictResolution {
  KEEP_FIRST
  KEEP_SECOND
  DISCARD_BOTH
}

model ConflictRecord {
  id               String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  responseId       String              @unique @db.Uuid    // resposta que causou o conflito
  conflictWithId   String              @db.Uuid            // resposta já existente
  status           ConflictStatus      @default(PENDING)
  resolution       ConflictResolution?
  resolvedById     String?             @db.Uuid
  resolvedAt       DateTime?
  detectedAt       DateTime            @default(now())

  response         Response            @relation("ConflictResponse",     fields: [responseId],     references: [id])
  conflictWith     Response            @relation("ConflictWithResponse", fields: [conflictWithId], references: [id])

  @@index([status])
  @@map("conflict_records")
}

// ─────────────────────────────────────────────
// AUDITORIA
// ─────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  userId     String?  @db.Uuid
  action     String   // "SURVEY_PUBLISHED", "CONFLICT_RESOLVED", "USER_CREATED"
  entityType String   // "Survey", "Response", "User"
  entityId   String?
  metadata   Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  // SetNull: excluir um usuário (ver UsersService.remove) não deve apagar
  // o histórico de auditoria — o log sobrevive, só perde a referência.
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

---

### View Materializada de KPIs (`infra/postgres/views.sql`)

```sql
-- Executar após as migrations do Prisma
-- Atualização agendada via pg-boss (Módulo 2.8)

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_survey_kpis AS
SELECT
  r.survey_id,
  COUNT(*)                                              AS total_responses,
  COUNT(*) FILTER (WHERE r.status = 'SYNCED')           AS synced,
  COUNT(*) FILTER (WHERE r.status = 'CONFLICT')         AS conflicts,
  COUNT(*) FILTER (WHERE r.status = 'ERROR')            AS errors,
  COUNT(DISTINCT r.researcher_id)                       AS active_researchers,
  COUNT(*) FILTER (WHERE r.status = 'SYNCED')::FLOAT
    / NULLIF(COUNT(*), 0)                               AS completion_rate,
  MAX(r.collected_at)                                   AS last_response_at,
  NOW()                                                 AS updated_at
FROM responses r
GROUP BY r.survey_id;

-- Índice na view para lookup por survey_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_survey_kpis_survey_id
  ON mv_survey_kpis(survey_id);

-- Atualizar sem bloquear leituras (requer o índice UNIQUE acima)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_survey_kpis;

-- Índice espacial para queries geográficas
CREATE INDEX IF NOT EXISTS idx_locations_coordinates
  ON locations USING GIST(coordinates);
```

---

### Schema SQLite do Mobile (`apps/mobile/src/database/schema.ts`)

```typescript
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

  -- Arquivos locais associados a respostas
  CREATE TABLE IF NOT EXISTS files (
    id           TEXT PRIMARY KEY,  -- UUID gerado no device
    response_id  TEXT NOT NULL,
    local_path   TEXT NOT NULL,     -- file:///data/user/.../foto.jpg
    mime_type    TEXT NOT NULL,
    size_bytes   INTEGER,
    status       TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | UPLOADING | UPLOADED | FAILED
    upload_attempts INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    uploaded_at  TEXT,
    FOREIGN KEY (response_id) REFERENCES responses(id)
  );

  -- Fila de sincronização (controla ordem e retry)
  CREATE TABLE IF NOT EXISTS sync_queue (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,     -- 'RESPONSE' | 'FILE'
    reference_id TEXT NOT NULL,     -- response.id ou file.id
    priority     INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'PENDING',
    next_retry   TEXT,              -- backoff exponencial
    created_at   TEXT NOT NULL
  );

  -- Índices para performance offline
  CREATE INDEX IF NOT EXISTS idx_responses_status      ON responses(status);
  CREATE INDEX IF NOT EXISTS idx_responses_survey      ON responses(survey_id);
  CREATE INDEX IF NOT EXISTS idx_files_status          ON files(status);
  CREATE INDEX IF NOT EXISTS idx_files_response        ON files(response_id);
  CREATE INDEX IF NOT EXISTS idx_sync_queue_status     ON sync_queue(status, next_retry);
  CREATE INDEX IF NOT EXISTS idx_survey_versions_survey ON survey_versions(survey_id);
`;
```

---

## Regra de Avaliação de Tecnologia

Para evitar complexidade desnecessária, cada componente deve ser avaliado pela seguinte sequência antes de ser adicionado à stack:

```
NECESSIDADE
  ↓
Existe problema concreto e mensurável?
  NÃO → Não usar. Registrar decisão no documento.
  SIM → A solução atual não resolve?
          NÃO → Adaptar solução atual.
          SIM → Precisa de componente externo?
                  ↓
                Escolher tecnologia mais simples que resolve
                  ↓
                Principal × Alternativas → Documentar escolha
                  ↓
                Implementar apenas o necessário
```

**Exemplos de aplicação desta regra no FieldSync:**

| Necessidade    | Decisão              | Justificativa                                                 |
| -------------- | -------------------- | ------------------------------------------------------------- |
| Fila de jobs   | pg-boss (PostgreSQL) | Sem Redis adicional no MVP; volume pequeno                    |
| Cache          | In-memory (NestJS)   | MVP com instância única; Redis quando houver múltiplas        |
| WebSocket      | Polling 30s no MVP   | WebSocket tem custo de infra; polling resolve para 12 devices |
| Kubernetes     | Não adotar           | Docker Compose resolve até centenas de usuarios               |
| IA/Sentimentos | Pós-MVP              | Complexidade desnecessária antes de ter dados reais           |
| Redis          | Pós-MVP              | Apenas quando cache in-memory se tornar gargalo               |

> Não adicionar Redis, RabbitMQ, Kafka, Kubernetes, microserviços ou IA simplesmente para "parecer profissional". Cada tecnologia deve resolver um problema concreto, presente e mensurável.

---

## Cheat Sheet de Comandos

### Docker Compose

```bash
# Subir ambiente de desenvolvimento (com hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Subir ambiente de produção
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Logs em tempo real de um serviço
docker compose logs -f backend
docker compose logs -f nginx

# Executar comando dentro do container
docker compose exec backend bash
docker compose exec postgres psql -U fieldsync_user -d fieldsync

# Parar sem remover volumes
docker compose down

# Parar e remover volumes (⚠️ apaga dados)
docker compose down -v

# Rebuild forçado de um serviço
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
```

### Prisma

```bash
# Criar nova migration (desenvolvimento)
docker compose exec backend npx prisma migrate dev --name descricao_curta

# Aplicar migrations em produção/VPS (sem perguntar)
docker compose exec backend npx prisma migrate deploy

# Ver status das migrations
docker compose exec backend npx prisma migrate status

# Abrir Prisma Studio (UI de banco de dados)
docker compose exec backend npx prisma studio

# Rodar seed
docker compose exec backend npx prisma db seed

# Resetar banco (⚠️ apaga tudo — apenas dev)
docker compose exec backend npx prisma migrate reset
```

### Tailscale

```bash
# Instalar no servidor (Ubuntu/Debian)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Ver IP Tailscale do servidor
tailscale ip

# Ver dispositivos conectados ao tailnet
tailscale status

# Verificar conectividade de um Android para o servidor
# (executar no Android via Tailscale — usar IP exibido por `tailscale ip`)
curl http://100.x.x.x/api/v1/health
```

### Backup e Restauração

```bash
# Backup manual do banco
docker compose exec postgres pg_dump \
  -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --format=custom > backup_$(date +%Y%m%d).dump

# Restaurar backup
docker compose exec -i postgres pg_restore \
  -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --clean --if-exists < backup_20240815.dump
```

---

## Glossário

| Termo                          | Definição                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Survey**                     | Pesquisa criada pelo gestor                                                                                                                    |
| **SurveyVersion**              | Snapshot imutável de um formulário ao ser publicado                                                                                            |
| **Response**                   | Conjunto de respostas coletadas por um pesquisador                                                                                             |
| **Answer**                     | Resposta individual para uma pergunta                                                                                                          |
| **SyncQueue**                  | Fila local no SQLite do Mobile com respostas pendentes de envio                                                                                |
| **Idempotência**               | Propriedade que garante que enviar a mesma resposta duas vezes não cria duplicatas                                                             |
| **locationHash**               | Hash de lat/lng arredondados — usado para detectar respostas no mesmo ponto geográfico                                                         |
| **collectedAt**                | Timestamp de quando a resposta foi coletada no dispositivo (não de quando foi sincronizada)                                                    |
| **deviceId**                   | Identificador único do dispositivo, gerado no primeiro login e persistido                                                                      |
| **Tailscale**                  | VPN mesh que conecta os 12 Androids ao servidor local da empresa                                                                               |
| **survey_version_id**          | Referência imutável à versão do formulário — crítica para o Contrato C3                                                                        |
| **Conflito**                   | Situação onde dois pesquisadores respondem a mesma pesquisa no mesmo ponto                                                                     |
| **TOKEN_REVOKED**              | Erro retornado quando o gestor revoga remotamente a sessão de um dispositivo                                                                   |
| **Polling**                    | Estratégia MVP de "tempo real": o frontend consulta o servidor a cada 30 segundos                                                              |
| **pg-boss**                    | Biblioteca de filas de jobs que usa o próprio PostgreSQL, sem Redis adicional                                                                  |
| **PostGIS**                    | Extensão do PostgreSQL que adiciona suporte a dados geoespaciais                                                                               |
| **MinIO**                      | Servidor de object storage com API compatível com AWS S3                                                                                       |
| **Argon2 / Argon2id**          | Algoritmo de hash de senha resistente a ataques de força bruta; Argon2id é a variante recomendada pela OWASP (ver 2.2)                         |
| **Multi-stage build**          | Técnica Docker que usa múltiplos estágios para reduzir o tamanho da imagem final                                                               |
| **Rotação de refresh token**   | Prática de invalidar o refresh token a cada uso, emitindo um novo — reduz a janela de exposição de um token roubado (ver 2.2)                  |
| **Reuse detection**            | Detecção de reuso de um refresh token já rotacionado — sinal de possível roubo, gatilho para revogar todas as sessões do dispositivo (ver 2.2) |
| **Request ID**                 | Identificador único por requisição, propagado do Mobile ao Backend, usado para correlacionar logs de um mesmo erro (ver 2.1)                   |
| **Retenção de dados (Mobile)** | Período (padrão 7 dias, configurável) que uma resposta já sincronizada permanece no SQLite antes de ser apagada localmente (ver 4.6)           |
| **INVALID_TIMESTAMP**          | Erro retornado quando o `collectedAt` de uma resposta é implausível em relação ao relógio do servidor (Contrato C4)                            |
| **Smoke test**                 | Verificação rápida (ex: chamar `/health`) logo após um deploy, para confirmar que a aplicação subiu corretamente antes de finalizar o pipeline |
