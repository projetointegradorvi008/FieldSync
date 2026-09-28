#!/bin/sh
# Resolve o IP atual do Tailscale sozinho, em vez de depender de um valor
# fixo em .env (MOBILE_LAN_IP/EXPO_PUBLIC_API_URL) que fica desatualizado
# sempre que o nó do Tailscale muda de IP (ex: reset do volume de estado,
# rotação de TS_AUTHKEY) — foi exatamente isso que quebrou o app mobile
# depois de um restart completo da stack.
#
# Funciona falando direto com o tailscaled do serviço `tailscale` pelo
# socket de controle compartilhado (tailscale_run, montado em
# /var/run/tailscale só leitura) — sem precisar de `docker exec` nem acesso
# ao socket do Docker. Se o binário/; socket não estiverem disponíveis (ex:
# rodando fora deste docker-compose) ou a resolução falhar por qualquer
# motivo, cai de volta silenciosamente para as env vars normais
# (EXPO_PUBLIC_API_URL/MOBILE_LAN_IP vindas de .env), então nunca impede o
# app de subir.
set -eu

SOCKET=/var/run/tailscale/tailscaled.sock
RESOLVED_IP=""

if [ -S "$SOCKET" ] && command -v tailscale >/dev/null 2>&1; then
  RESOLVED_IP=$(tailscale --socket="$SOCKET" ip -4 2>/dev/null | head -n1 || true)
fi

if [ -n "$RESOLVED_IP" ]; then
  echo "[docker-entrypoint] IP do Tailscale resolvido automaticamente: $RESOLVED_IP"
  export REACT_NATIVE_PACKAGER_HOSTNAME="$RESOLVED_IP"
  export EXPO_PUBLIC_API_URL="http://$RESOLVED_IP/api"

  # Compartilha o IP com o Web (GET /api/config lê este arquivo) para o QR
  # code de pareamento também ficar sempre correto.
  if [ -d /shared-ip ]; then
    echo "$RESOLVED_IP" > /shared-ip/tailscale-ip
  fi
else
  echo "[docker-entrypoint] Não foi possível resolver o IP do Tailscale automaticamente — usando EXPO_PUBLIC_API_URL/MOBILE_LAN_IP de .env."
fi

exec "$@"
