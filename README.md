# FieldSync

Plataforma para pesquisas operacionais em campo (transporte e logística),
offline-first, com sincronização e georreferenciamento. Ver a especificação
técnica completa em [`docs/FieldSync_Especificacao_Tecnica.md`](docs/FieldSync_Especificacao_Tecnica.md).
Para uma descrição de cada pasta e cada arquivo do projeto, ver
[`docs/FieldSync_Detalhamento_Estrutura_Projeto.md`](docs/FieldSync_Detalhamento_Estrutura_Projeto.md).

## Como usar este guia

Este guia foi escrito para quem está pegando o projeto pela primeira vez e
**não precisa ter conhecimento prévio** de NestJS, Next.js, Expo, Docker ou
Postgres — cada passo traz o comando exato a rodar e o que esperar como
resultado. Ele é dividido em três modos, do mais simples ao mais formal:

- **Modo 1 — Desenvolvimento local**: tudo roda no **seu computador
  pessoal**, que faz o papel de "servidor" (Backend + banco de dados),
  enquanto o celular Android de campo se conecta a ele pela rede. Hot
  reload, dados de exemplo (seed) e credenciais conhecidas — é o modo usado
  no dia a dia do desenvolvimento e dos testes.
- **Modo 2 — Produção local (mesmo computador)**: mesmas imagens Docker
  usadas em produção de verdade, mas ainda rodando no seu computador —
  **sem** dados de exemplo, com um único usuário Administrador de senha
  forte definida por você. Útil para validar o comportamento real de
  produção antes de ter uma VPS.
- **Modo 3 — Produção em VPS**: quando a organização alocar uma máquina real
  (VPS/nuvem) para o FieldSync, as mesmas imagens são publicadas nela, com
  deploy automático via GitHub Actions. Mesma regra do Modo 2: nenhum dado
  de exemplo, só o Administrador.

Você pode ficar só no Modo 1 pelo tempo que quiser — os Modos 2 e 3 são
opcionais e só fazem sentido quando você quiser validar/publicar uma versão
de produção de verdade.

> ⚠️ **Em qualquer modo de produção (2 ou 3), o banco nunca recebe dados de
> exemplo** — nem as pesquisas/respostas de teste, nem os usuários
> GESTOR/SUPERVISOR/PESQUISADOR/VISUALIZADOR do seed de desenvolvimento. A
> única conta criada é o Administrador, com a senha forte que você definir em
> `ADMIN_PASSWORD` (nunca a mesma senha de desenvolvimento) — ver Modos 2 e 3
> abaixo.

## Pré-requisitos

Instale estas ferramentas **no computador que vai servir de "servidor"**
(o mesmo computador onde você vai rodar o Backend, o Web e o Docker).

| #   | Ferramenta                     | Para que serve                                                                    | Como instalar                                                                                                                                                                                                                                                           |
| --- | ------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Git**                        | baixar o código-fonte do repositório                                              | Windows/macOS: instalador em <https://git-scm.com/downloads>. Linux (Debian/Ubuntu): `sudo apt install git`                                                                                                                                                             |
| 2   | **Docker + Docker Compose**    | subir o Postgres, o Backend e o Web sem instalar cada um manualmente              | Windows/macOS: **Docker Desktop**, instalador em <https://www.docker.com/products/docker-desktop/> (já inclui o Compose). Linux: seguir <https://docs.docker.com/engine/install/> para a sua distribuição, depois `sudo usermod -aG docker $USER` e reiniciar a sessão  |
| 3   | **Node.js 24.20.x**            | rodar os testes automatizados e o Mobile (Expo) fora do Docker                    | Recomendado via **nvm** (Node Version Manager) — instalar o nvm em <https://github.com/nvm-sh/nvm#installing-and-updating>, depois, dentro da pasta do projeto: `nvm install` (lê a versão do arquivo `.nvmrc`)                                                         |
| 4   | **Expo Go** (app)              | abrir o app Mobile no celular sem precisar compilar um `.apk`                     | instalar pela Play Store no Android de teste                                                                                                                                                                                                                            |
| 5   | **Conta Tailscale** (opcional) | conectar o celular ao computador quando os dois **não** estão na mesma rede Wi-Fi | criar gratuitamente em <https://tailscale.com> — só é necessária se você optar pelo modo Tailscale no passo 1.8. No Linux, o Tailscale roda como um serviço do próprio Docker Compose (`tailscale`, ver `docker-compose.yml`) — não precisa instalar nada além da conta |

Confira se cada ferramenta foi instalada corretamente:

```bash
git --version
docker --version && docker compose version
node --version   # deve mostrar v24.20.x
```

## Perfis de usuário e permissões

Cinco perfis (`role`), do mais para o menos privilegiado — cada um só
gerencia (edita/desativa/exclui/vê sessões de) usuários **estritamente
abaixo** dele na hierarquia, nunca do mesmo nível ou acima, nem a si mesmo
(regra aplicada pelo Backend, não só pela interface):

| Perfil            | Pesquisas                                                                                 | Analytics/Conflitos        | Usuários                             | Sessões (aba "Sessões")             | Coleta (Mobile)                                         |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------------------- |
| **ADMINISTRADOR** | Cria, edita, publica, arquiva, duplica                                                    | Vê tudo, resolve conflitos | Cria, edita, desativa, **exclui**    | Vê e revoga as de todo mundo abaixo | — (perfil de gestão, não coleta)                        |
| **GESTOR**        | Cria, edita, publica, arquiva, duplica                                                    | Vê tudo, resolve conflitos | Edita/desativa (não cria nem exclui) | Vê e revoga as de todo mundo abaixo | —                                                       |
| **SUPERVISOR**    | Só visualiza (lista/detalhe)                                                              | Sem acesso                 | Edita/desativa (não cria nem exclui) | Vê e revoga as de todo mundo abaixo | —                                                       |
| **PESQUISADOR**   | Só visualiza as `PUBLISHED` da organização (todas, sem atribuição manual por pesquisador) | Sem acesso                 | Sem acesso                           | Só a própria                        | Coleta e sincroniza qualquer `PUBLISHED` da organização |
| **VISUALIZADOR**  | Só visualiza as `PUBLISHED` da organização (todas, sem atribuição manual por pesquisador) | Sem acesso                 | Sem acesso                           | Só a própria                        | Mesmo acesso de leitura do PESQUISADOR, sem coletar     |

Notas:

- Editar só o **título** de uma pesquisa já publicada é permitido a
  ADMINISTRADOR/GESTOR mesmo fora de `DRAFT` — os demais campos (descrição,
  datas, pesquisadores) exigem `DRAFT`.
- O usuário criado pelo seed (`admin@fieldsync.dev`) é marcado como
  **usuário-raiz protegido** (`isRootAdmin`) — nem ele mesmo nem nenhum
  outro ADMINISTRADOR conseguem desativá-lo ou excluí-lo, garantindo que
  sempre exista pelo menos um administrador ativo na organização.
- Existe um sexto valor no enum (`ROOT`), reservado para o(s)
  mantenedor(es) do sistema — nunca é atribuído via API (só seria usado
  numa inserção direta no banco), então não aparece na tabela acima.
- Um novo login (no mesmo usuário, em qualquer dispositivo) encerra
  automaticamente qualquer sessão anterior desse mesmo usuário — sessão
  única por usuário. Desativar um usuário também encerra qualquer sessão
  aberta dele imediatamente.

## Modo 1 — Desenvolvimento local

### 1.1 Clonar o repositório

```bash
git clone <url-do-repositorio>
cd fieldsync
```

### 1.2 Configurar as variáveis de ambiente

O arquivo `.env.example` na raiz do projeto é o modelo; copie-o para `.env`
(este último nunca é enviado ao Git — ver `.gitignore`) e ajuste os valores:

```bash
cp .env.example .env
```

Abra o `.env` num editor de texto e revise cada bloco:

| Bloco          | Variável                         | O que fazer no computador pessoal (Modo 1)                                                                                                                          |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geral          | `NODE_ENV`                       | deixe `development`                                                                                                                                                 |
| Banco de Dados | `POSTGRES_DB`, `POSTGRES_USER`   | pode manter os valores de exemplo                                                                                                                                   |
| Banco de Dados | `POSTGRES_PASSWORD`              | troque por qualquer senha (mesmo simples, já que é só local)                                                                                                        |
| Banco de Dados | `DATABASE_URL`                   | troque só o trecho `CHANGE_ME` pela mesma senha escolhida acima                                                                                                     |
| Autenticação   | `JWT_SECRET`                     | troque por qualquer string aleatória de 32+ caracteres (ex: gere uma com `openssl rand -hex 32`)                                                                    |
| URLs públicas  | `API_URL`, `NEXT_PUBLIC_API_URL` | deixe `http://localhost/api` **por enquanto** — só precisa virar o IP da rede/Tailscale quando for testar no celular (passo 1.8)                                    |
| BFF            | `BACKEND_INTERNAL_URL`           | não mexer — é usado só entre os containers Docker                                                                                                                   |
| Mobile         | `EXPO_PUBLIC_API_URL`            | usado pelo serviço `mobile` do Docker Compose (passo 1.8); fora do Docker, o app lê do `apps/mobile/.env` separado                                                  |
| Mobile         | `MOBILE_LAN_IP`                  | IP Tailscale/LAN do computador (mesmo host de `API_URL`, sem porta) — usado pelo serviço `mobile` para o Metro bundler anunciar um endereço alcançável pelo celular |
| Mobile         | `EXPO_DEV_SERVER_URL`            | URL `exp://<MOBILE_LAN_IP>:8081` exibida como QR code na aba **Sessões** do Web, para parear um celular pela primeira vez                                           |
| Segurança      | `CORS_ORIGIN`                    | deixe `http://localhost:3000`                                                                                                                                       |
| Administrador  | `ADMIN_PASSWORD`, `ADMIN_EMAIL`  | deixe em branco — só são usados quando `NODE_ENV=production` (Modos 2 e 3); em desenvolvimento o seed cria as credenciais fixas da tabela abaixo                    |

> Nunca reutilize os valores deste `.env` local em produção — nos Modos 2 e 3
> cada variável recebe um valor novo e forte (ver as seções correspondentes).

### 1.3 Subir o ambiente com Docker Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Isso baixa e inicia 6 containers: `postgres` (banco com PostGIS), `backend`,
`web`, `nginx` (proxy reverso, é por onde `http://localhost` responde),
`mobile` (dev server do Expo — ver passo 1.8; só funciona com
`network_mode: host`, ou seja, **Linux**; em macOS/Windows via Docker
Desktop, pare este serviço e rode o Mobile fora do Docker como descrito no
passo 1.8) e `tailscale` (opcional — só entra no tailnet se `TS_AUTHKEY`
estiver preenchido no `.env`; sem isso fica parado sem erro, ver passo 1.8
Opção B). Confira que os serviços de longa duração subiram como esperado:

```bash
docker compose ps
```

Espere `postgres` e `backend` com status `healthy`, e `web` e `mobile` com
status `Up` (não têm healthcheck configurado). Se algo não subir, veja a
seção "Solução de problemas comuns" no fim deste documento.

### 1.4 Rodar as migrations do banco

Cria todas as tabelas (Organization, User, Survey, Response, etc.) descritas
em `apps/backend/prisma/schema.prisma`:

```bash
docker compose exec backend npx prisma migrate deploy
```

### 1.5 Popular dados de teste (opcional, mas recomendado)

```bash
docker compose exec backend npx prisma db seed
```

Isso cria uma organização de teste ("Auto Viação Urubupungá"), sete
usuários e três pesquisas — ver credenciais na tabela abaixo.

#### Credenciais de desenvolvimento (seed)

**Nunca usar estas credenciais em produção.**

| Perfil        | Email                         | Senha             |
| ------------- | ----------------------------- | ----------------- |
| ADMINISTRADOR | `admin@fieldsync.dev`         | `admin123456`     |
| GESTOR        | `gestor@fieldsync.dev`        | `gestor123456`    |
| SUPERVISOR    | `supervisor@fieldsync.dev`    | `supervisor123`   |
| VISUALIZADOR  | `visualizador@fieldsync.dev`  | `visualizador123` |
| PESQUISADOR   | `pesquisador01@fieldsync.dev` | `pesquisador123`  |
| PESQUISADOR   | `pesquisador02@fieldsync.dev` | `pesquisador123`  |
| PESQUISADOR   | `pesquisador03@fieldsync.dev` | `pesquisador123`  |

O seed cria três pesquisas: uma em `DRAFT` ("Levantamento de Pontos de
Ônibus"), uma `PUBLISHED` sem respostas ("Pesquisa de Satisfação de
Passageiros") e uma terceira `PUBLISHED` **já respondida** ("Pesquisa de
Satisfação — Todos os Tipos de Pergunta"), com 60 respostas cobrindo os 8
tipos de pergunta (TEXT, NUMBER, BOOLEAN, SINGLE_CHOICE, MULTIPLE_CHOICE,
DATE, TIME, GPS), 3 pesquisadores, datas espalhadas nos últimos 30
dias e uma mistura de status (a maioria `SYNCED`, alguns `CONFLICT` já
com pares registrados — um resolvido, dois pendentes — e alguns `ERROR`) —
use-a para avaliar os gráficos do Dashboard/Analytics sem precisar coletar
dados manualmente pelo Mobile.

### 1.6 Validar que o Backend está de pé

```bash
curl http://localhost/api/v1/health
# esperado: {"status":"ok", ...}
```

### 1.7 Validar o Front-End Web

Abra `http://localhost:3000` no navegador. Você deve ver a tela de login;
entre com uma das credenciais da tabela acima (ex: `admin@fieldsync.dev` /
`admin123456`).

### 1.8 Rodando o app Mobile no celular de campo

O Backend, nesta fase, roda **no seu computador**, não na internet — então o
celular Android precisa conseguir "enxergar" o IP do computador na rede.

**No Linux, não é preciso iniciar o app separadamente** — o passo 1.3 já
sobe o dev server do Expo dentro do container `mobile` junto com o resto do
Docker Compose. Basta preencher `MOBILE_LAN_IP` e `EXPO_DEV_SERVER_URL` no
`.env` com o IP Wi-Fi/Tailscale do computador (descoberto na Opção A ou B
abaixo) e, se já tinha subido o ambiente antes de preencher essas variáveis,
reiniciar o serviço:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mobile
```

Depois, abra a aba **Sessões** no Web (`http://localhost:3000/sessions`) e
escaneie o QR code exibido lá com o app **Expo Go** no celular — mais rápido
do que copiar a URL manualmente na primeira sincronização.

> `network_mode: host` (necessário para o Metro bundler ficar acessível no
> IP real da máquina) só funciona de forma confiável no **Linux**. Em
> macOS/Windows via Docker Desktop, o container `mobile` não sobe utilizável
> — pare-o (`docker compose stop mobile`) e rode o Mobile fora do Docker:

```bash
cd apps/mobile
npm install
npx expo start
```

Escaneie o QR code exibido no terminal com o app **Expo Go** no celular.
Antes disso, descubra o IP do computador na rede com a Opção A ou B abaixo e
crie `apps/mobile/.env` com `EXPO_PUBLIC_API_URL=http://<IP>/api`.

#### Descobrindo o IP do computador na rede

Existem duas formas de expor o Backend na rede para o celular; escolha a que
combina com o seu teste:

#### Opção A — celular e computador na mesma rede Wi-Fi (mais simples)

1. Descubra o IP local do computador na rede Wi-Fi:
   - **Windows**: `ipconfig` (procure "Endereço IPv4" da placa Wi-Fi, algo
     como `192.168.0.x`)
   - **macOS**: `ipconfig getifaddr en0`
   - **Linux**: `ip addr show | grep "inet "` (ou `hostname -I`)
2. Use esse IP como `MOBILE_LAN_IP`/`API_URL` no `.env` da raiz (Linux, passo
   1.2) ou como `EXPO_PUBLIC_API_URL=http://<IP>/api` em `apps/mobile/.env`
   (macOS/Windows, ver acima) — ex: `http://192.168.0.42/api`.
3. Certifique-se de que o celular está na **mesma rede Wi-Fi** do
   computador (não em dados móveis).

#### Opção B — celular e computador em redes diferentes (Tailscale)

Use esta opção quando o celular de campo precisa se conectar de qualquer
lugar (dados móveis, outra rede), não só da mesma Wi-Fi do computador.

**No Linux (recomendado): Tailscale roda dentro do Docker**, junto com os
demais containers — não precisa instalar nada direto no sistema operacional:

1. Gere uma chave de autenticação em
   <https://login.tailscale.com/admin/settings/keys> (reusable, sem
   expiração) e cole em `TS_AUTHKEY` no `.env` da raiz.
2. Suba (ou reinicie) o serviço `tailscale`:

   ```bash
   docker compose up -d tailscale
   ```

3. Confira que entrou no tailnet e anote o IP `100.x.x.x`:

   ```bash
   docker compose exec tailscale tailscale ip
   ```

Em **macOS/Windows** (onde `network_mode: host` não funciona do mesmo jeito
— mesma limitação do serviço `mobile`), instale o Tailscale direto no
sistema operacional:

```bash
# No computador que faz o papel de servidor (macOS/WSL)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip   # anote o IP 100.x.x.x
```

No celular: instalar o app **Tailscale** pela Play Store e entrar com a
mesma conta usada no computador. Use o IP `100.x.x.x` anotado acima como
`MOBILE_LAN_IP`/`API_URL` (Linux) ou `EXPO_PUBLIC_API_URL` (macOS/Windows),
como descrito no início desta seção.

> ⚠️ **No app Tailscale do celular, desative "Use Tailscale DNS"**
> (Configurações → DNS). Com essa opção ligada, o Tailscale assume o DNS do
> sistema Android, o que interfere na resolução usada pelo Google Play
> Services para aquisição de localização (GPS) — o app fica preso em
> "Location request failed due to unsatisfied device settings" mesmo com
> GPS e permissão ativados. Desligar essa opção não afeta a conectividade
> com o Backend (o IP Tailscale continua funcionando normalmente).

Verifique a conectividade a partir do próprio celular (pelo navegador do
Android, ou via `adb shell curl` se preferir):

```text
http://100.x.x.x/api/v1/health   → {"status":"ok", ...}
```

> 📘 O app pede permissão de **localização** (GPS) ao finalizar uma coleta.
> No Expo Go essa permissão funciona com o texto padrão do sistema; a
> mensagem personalizada configurada em `app.json` (`plugins`) só aparece em
> um build de desenvolvimento próprio (`npx expo prebuild` / EAS Build).
>
> Sem conectividade nenhuma (nem Wi-Fi, nem Tailscale), o app Mobile continua
> funcionando normalmente em modo offline — a conectividade só é necessária
> para **sincronizar**, nunca para **coletar** (ver "Regra fundamental de
> sincronização" na especificação técnica).

### 1.9 Rodando os testes automatizados

```bash
# Backend — dentro ou fora do container, ambos funcionam; fora é mais rápido
# para iterar (requer Node 24.20.x e as dependências instaladas: npm install)
cd apps/backend
npm test          # testes unitários (Jest) — Auth, Users, Surveys, Sync, Conflicts e Analytics
npm run test:e2e  # testes de integração contra Postgres real — motor de sync (POST /sync)

# Teste de carga sintético do /sync (ver 6.4 na especificação).
# Os 12 "dispositivos" batem do mesmo IP de teste — suba o Backend com os
# limites de rate limiting temporariamente ajustados para essa simulação:
SYNC_RATE_LIMIT_PER_MINUTE=200 LOGIN_RATE_LIMIT_PER_MINUTE=50 node dist/main.js &
node scripts/load-test-sync.js --devices=12 --rounds=6 --intervalMs=20000
```

```bash
# Mobile
cd apps/mobile
npm test   # testes unitários (Jest/jest-expo) — cálculo de location_hash
```

### 1.10 Documentação interativa da API (Swagger)

Com o Backend rodando, a documentação OpenAPI (todas as rotas, parâmetros e
schemas) fica disponível em `http://localhost:3001/api/docs` (fora do
Docker) ou `http://localhost/api/docs` (via Nginx, no compose padrão). Só
existe fora de produção — com `NODE_ENV=production` (Modos 2 e 3) o Backend
nem monta essa rota, para não expor o mapa completo da API sem autenticação.

### 1.11 Parando o ambiente

Use os **mesmos arquivos `-f`** usados para subir (passo 1.3) — `docker compose down` sozinho só enxerga os serviços do `docker-compose.yml` base, então o container `mobile` (definido só no `docker-compose.dev.yml`) fica de pé mesmo depois do `down`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down     # para os containers, mantém os dados
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v  # para os containers E apaga os dados (Postgres)
```

Se isso já aconteceu com você (algum container "esquecido" de pé), pare-o
manualmente ou rode com `--remove-orphans`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
```

## Modo 2 — Produção local (mesmo computador)

Mesmas imagens Docker do Modo 3 (VPS), mas construídas e rodando **no seu
próprio computador**, sem GHCR nem servidor remoto — útil para validar o
comportamento real de produção (sem dados de exemplo, só o Administrador)
antes de ter uma VPS de verdade.

> ⚠️ **Nenhum dado de exemplo é criado neste modo** — nem as pesquisas de
> teste, nem os usuários GESTOR/SUPERVISOR/PESQUISADOR/VISUALIZADOR do seed
> de desenvolvimento. A única conta que existe é o Administrador, com a
> senha forte que você definir em `ADMIN_PASSWORD` abaixo.

### 2.1 Configurar as variáveis de ambiente

Repita o passo 1.2 (`cp .env.example .env`, se ainda não tiver um `.env`),
mas ajuste em vez disso para produção:

- `NODE_ENV=production`
- `POSTGRES_PASSWORD`, `JWT_SECRET` — gere valores novos e fortes (ex:
  `openssl rand -hex 32`), diferentes dos usados no Modo 1
- `ADMIN_PASSWORD` — a senha do único usuário Administrador criado neste
  modo. Mínimo 16 caracteres, misturando maiúsculas/minúsculas/números ou
  símbolos, e **nunca** a senha de desenvolvimento (`admin123456`) — o
  Backend recusa subir e o seed recusa rodar caso contrário. Guarde-a você
  mesmo (ela nunca é impressa em nenhum log).
- `ADMIN_EMAIL` (opcional) — e-mail do Administrador; se não definir, usa
  `admin@fieldsync.local`
- `CORS_ORIGIN` — deixe `http://localhost:3000` (ainda é local)

### 2.2 Buildar e subir

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed   # cria só o Administrador
```

### 2.3 Validar

```bash
curl http://localhost/api/v1/health   # deve responder {"status":"ok"}
```

Faça login em `http://localhost:3000` com o e-mail/senha do Administrador
definidos acima — nenhuma outra conta existe. `http://localhost/api/docs`
(Swagger) não fica mais disponível neste modo (só em desenvolvimento).

## Modo 3 — Produção em VPS

Quando a organização alocar um servidor (VPS/nuvem) para o FieldSync, o
mesmo Docker Compose usado localmente é reaproveitado, trocando apenas o
arquivo de overrides de `docker-compose.dev.yml` para `docker-compose.prod.yml`
(imagens já compiladas do GHCR, limites de CPU/memória, monitoramento via
Uptime Kuma) e configurando o deploy automático por GitHub Actions.

> ⚠️ Mesma regra do Modo 2: **nenhum dado de exemplo** — só o Administrador,
> com a senha forte definida em `ADMIN_PASSWORD`.

### 3.1 Preparar o servidor

No servidor (Ubuntu/Debian recomendado):

```bash
# Instalar Docker + Compose (mesmo passo do pré-requisito 2, mas no servidor)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Criar a pasta onde o projeto vai viver
sudo mkdir -p /opt/fieldsync
sudo chown $USER:$USER /opt/fieldsync
cd /opt/fieldsync
git clone <url-do-repositorio> .
```

Crie o `.env` de produção (mesmo template do `.env.example`, mas agora com
valores **fortes e únicos**, nunca reaproveitados do ambiente local):

```bash
cp .env.example .env
```

Ajuste **todas** as variáveis abaixo — não é uma lista opcional, é o que
diferencia um `.env` de produção de um `.env.example` copiado sem revisar:

| Variável                          | Valor em produção                                                                                                                                                   | Se deixar errado/no padrão do `.env.example`...                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `production`                                                                                                                                                        | `prisma db seed` roda o seed de **desenvolvimento** inteiro (todos os usuários de teste + pesquisas de exemplo) contra o banco de produção — sintoma clássico de "apareceram vários usuários que eu não criei" |
| `GHCR_REPOSITORY`                 | owner/repo **exato** do GitHub, minúsculo (ex: `joaosilva/fieldsync`) — o mesmo valor que aparece em `.github/workflows/deploy.yml` como `${{ github.repository }}` | `docker compose ... pull` falha com "manifest unknown" (imagem `ghcr.io/seu-usuario/...` não existe)                                                                                                           |
| `VERSION`                         | uma tag **já publicada** no GHCR (ver 3.2/3.3) — nunca `latest`, o CI nunca publica essa tag                                                                        | mesma falha de pull acima, mesmo com `GHCR_REPOSITORY` certo                                                                                                                                                   |
| `POSTGRES_PASSWORD`               | valor novo e forte (`openssl rand -hex 32`)                                                                                                                         | banco fica com a senha de exemplo do repositório, pública para quem ler o `.env.example`                                                                                                                       |
| `JWT_SECRET`                      | valor novo e forte (`openssl rand -hex 32`), nunca reaproveitado do ambiente local                                                                                  | tokens de sessão assinados com um segredo conhecido/previsível                                                                                                                                                 |
| `ADMIN_PASSWORD`                  | senha forte, mínimo 16 caracteres, nunca `admin123456`                                                                                                              | Backend recusa subir e o seed recusa rodar (validação em `env.validation.ts`)                                                                                                                                  |
| `ADMIN_EMAIL`                     | e-mail real do Administrador (opcional; padrão `admin@fieldsync.local`)                                                                                             | login continua funcionando, só fica com e-mail genérico                                                                                                                                                        |
| `API_URL` / `NEXT_PUBLIC_API_URL` | domínio público (`https://...`) ou IP Tailscale do servidor                                                                                                         | Web/Mobile não conseguem falar com o Backend                                                                                                                                                                   |
| `CORS_ORIGIN`                     | URL pública real do Web, nunca `*` nem em branco                                                                                                                    | Backend recusa (CORS) chamadas do Web em produção, ou fica aberto demais se deixado `*`                                                                                                                        |
| `TS_AUTHKEY`                      | chave do Tailscale, se o servidor usa a VPN (ver serviço `tailscale`)                                                                                               | container `tailscale` sobe mas não entra na tailnet                                                                                                                                                            |

> ⚠️ O container `mobile` (Metro bundler do Expo) existe **só** em
> `docker-compose.dev.yml` e não deveria subir aqui — não é bug se ele não
> aparecer em `docker compose ps` no Modo 3. O app mobile de produção é
> distribuído como APK/build nativo instalado no celular do pesquisador,
> apontando via `EXPO_PUBLIC_API_URL` (build separado, fora deste
> `docker-compose.prod.yml`) para o mesmo `API_URL` acima.

### 3.2 Deploy manual (primeira vez)

Antes do primeiro deploy automático (passo 3.3), ainda não existe nenhuma
imagem publicada no GHCR para esse repositório — builde localmente no
servidor uma única vez (igual ao Modo 2), senão o `pull` abaixo falha por
imagem inexistente:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed   # cria só o Administrador
curl http://localhost/api/v1/health   # deve responder {"status":"ok"}
```

A partir do primeiro push na `main` com o GitHub Actions configurado (passo
3.3), o CI já builda e publica a imagem com `VERSION` = SHA do commit — não
precisa mais rodar `build` manualmente nem manter `VERSION`/`GHCR_REPOSITORY`
atualizados à mão, o workflow exporta os dois automaticamente antes do
`pull`.

### 3.3 Deploy automático (GitHub Actions)

A partir do segundo deploy, use `.github/workflows/deploy.yml`: a cada push
na branch `main`, ele builda e publica as imagens Backend/Web no GHCR e,
se a variável de ambiente do repositório `VPS_CONFIGURED` estiver como
`'true'`, conecta no servidor via SSH e aplica o deploy (com backup
automático antes das migrations, o bootstrap do Administrador via `prisma db
seed` — idempotente, não recria dados de exemplo nem sobrescreve a senha se
o Administrador já existir — e rollback manual se o smoke test pós-deploy
falhar). Para ativar essa etapa, configure em **Settings → Secrets and
variables → Actions** do repositório no GitHub:

| Tipo     | Nome             | Valor                                     |
| -------- | ---------------- | ----------------------------------------- |
| Variable | `VPS_CONFIGURED` | `true`                                    |
| Secret   | `VPS_HOST`       | IP ou domínio do servidor                 |
| Secret   | `VPS_USER`       | usuário SSH com acesso a `/opt/fieldsync` |
| Secret   | `VPS_SSH_KEY`    | chave privada SSH correspondente          |

### 3.4 HTTPS (domínio público)

Por padrão o `infra/nginx/nginx.conf` serve tudo em HTTP (porta 80), que é
suficiente atrás de uma VPN como o Tailscale. Se o servidor for exposto num
domínio público, descomente o bloco `server { listen 443 ssl; ... }` no
final do arquivo e aponte `ssl_certificate`/`ssl_certificate_key` para um
certificado válido (ex: gerado com `certbot`) montado em
`infra/nginx/certs/`.

## Backup e restauração

Relevante para os Modos 2 e 3 (produção) — no Modo 1 (desenvolvimento) o
banco é descartável (dados de exemplo recriados a qualquer momento pelo
seed), então normalmente não há nada que valha a pena fazer backup.

```bash
# Backup manual (dump do Postgres)
./infra/scripts/backup.sh

# Restaurar um backup específico
docker compose exec -i postgres pg_restore \
  -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  --clean --if-exists < /opt/fieldsync/backups/postgres_<timestamp>.dump
```

Em produção (VPS), `backup.sh` roda automaticamente antes de cada deploy via
`.github/workflows/deploy.yml` — ver "Rollback de Deploy e Migrations" na
especificação técnica para o procedimento completo caso o smoke test
pós-deploy falhe.

## Estrutura do repositório

```text
fieldsync/
├── apps/
│   ├── backend/   ← NestJS + Prisma + PostgreSQL/PostGIS
│   ├── web/       ← Next.js (painel do gestor)
│   └── mobile/    ← Expo / React Native (app do pesquisador)
├── infra/
│   ├── nginx/     ← proxy reverso
│   ├── postgres/  ← extensões e scripts de init
│   └── scripts/   ← backup.sh (backup e restauração)
├── .github/workflows/  ← CI (lint, testes) e deploy (inativo sem VPS)
└── docs/          ← especificação técnica
```

Essa é só a visão geral — a descrição pasta a pasta e **arquivo a arquivo**
está em [`docs/FieldSync_Detalhamento_Estrutura_Projeto.md`](docs/FieldSync_Detalhamento_Estrutura_Projeto.md).

## Comandos úteis

```bash
# Logs em tempo real de um serviço
docker compose logs -f backend

# Executar comando dentro do container do backend
docker compose exec backend bash

# Abrir Prisma Studio (UI de banco de dados)
docker compose exec backend npx prisma studio

# Parar o ambiente (sem apagar dados) — use os mesmos -f do passo 1.3,
# senão o container `mobile` (só no docker-compose.dev.yml) fica de pé
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Solução de problemas comuns

| Sintoma                                                                                 | Causa provável                                                                                                                                                                                                                                         | Como resolver                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker compose ps` mostra algum serviço reiniciando sem parar                          | variável faltando/errada no `.env`                                                                                                                                                                                                                     | `docker compose logs -f <serviço>` para ver o erro exato; confira o `.env` contra a tabela do passo 1.2                                                                                                                                                |
| Erro "port is already allocated"                                                        | outra aplicação já usa a porta 80/3000/3001/5432/9000                                                                                                                                                                                                  | pare a outra aplicação, ou edite a porta do lado esquerdo em `docker-compose.dev.yml` (ex: `'8080:80'`)                                                                                                                                                |
| `curl http://localhost/api/v1/health` não responde                                      | Backend ainda subindo, ou Nginx não rodando                                                                                                                                                                                                            | espere alguns segundos e repita; confira `docker compose ps`                                                                                                                                                                                           |
| App Mobile mostra erro de rede ao tentar logar                                          | `EXPO_PUBLIC_API_URL` errado, ou celular em rede diferente do computador                                                                                                                                                                               | revise o passo 1.8; teste primeiro `curl http://<IP>/api/v1/health` de outro dispositivo na mesma rede                                                                                                                                                 |
| `prisma migrate deploy` falha com erro de extensão (postgis/uuid-ossp)                  | banco subiu antes do `infra/postgres/init.sql` rodar, ou volume antigo sem as extensões                                                                                                                                                                | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v` (apaga os dados) e repita os passos 1.3-1.4                                                                                                                                   |
| Alterei o `.env` mas o container continua com o valor antigo                            | Docker cacheia as variáveis no momento em que o container sobe                                                                                                                                                                                         | `docker compose up -d --force-recreate <serviço>`                                                                                                                                                                                                      |
| `docker compose down` para os outros containers, mas o `mobile` continua `Up`           | `down` sem `-f docker-compose.dev.yml` não enxerga esse serviço (só existe no override de dev)                                                                                                                                                         | repita com `-f docker-compose.yml -f docker-compose.dev.yml`, ou `docker compose down --remove-orphans`                                                                                                                                                |
| Aviso de conflito na porta `5353` ao subir o Docker (Docker Desktop)                    | `network_mode: host` (usado por `tailscale`/`mobile`) exige o recurso "host networking" do Docker Desktop, que reserva a porta `5353` (mDNS) no host real — outro app que já usa mDNS (ex: Spotify, AirPlay, impressora de rede) disputa a mesma porta | normalmente é só um aviso, não impede o container de subir (confira com `docker compose ps` e `docker compose logs tailscale`); para eliminar o aviso, feche o app que usa mDNS antes de subir o Docker                                                |
| `docker compose ... pull` falha com "manifest unknown"/"not found" (Modo 3)             | `GHCR_REPOSITORY` ainda com o placeholder `seu-usuario/fieldsync`, ou `VERSION` (`latest`) sem imagem publicada com essa tag no GHCR                                                                                                                   | ajuste `GHCR_REPOSITORY` no `.env` para o owner/repo real do GitHub e `VERSION` para uma tag já publicada, ou rode `build` localmente uma vez (ver 3.2)                                                                                                |
| Container `mobile` não aparece em produção (Modo 2/3)                                   | comportamento esperado — `mobile` só existe em `docker-compose.dev.yml`, não faz parte do stack de produção                                                                                                                                            | nenhuma ação necessária; o app mobile em produção é um APK/build nativo instalado no celular, não um container                                                                                                                                         |
| `prisma db seed` criou vários usuários (GESTOR/SUPERVISOR/PESQUISADOR/etc.) em produção | `.env` do servidor está com `NODE_ENV=development` (valor padrão do `.env.example`), então rodou o seed de desenvolvimento                                                                                                                             | corrija `NODE_ENV=production` no `.env`, suba de novo com `--force-recreate` no backend, e apague manualmente os usuários/pesquisas de exemplo criados por engano (não há rotina automática de limpeza, para não arriscar apagar dado real por engano) |

Mais detalhes de arquitetura, contratos entre módulos (C1-C4), schema de dados
e contrato de API estão na
[especificação técnica](docs/FieldSync_Especificacao_Tecnica.md).
