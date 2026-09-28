'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// QR code de pareamento: encoda a mesma URL exibida pelo `expo start`
// (exp://<host>:8081, ver EXPO_DEV_SERVER_URL no .env.example e o serviço
// `mobile` do docker-compose.dev.yml) para que o pesquisador escaneie com o
// Expo Go direto da aba de Sessões, sem precisar procurar o QR no terminal
// ou no Expo Dev Tools na primeira sincronização de um dispositivo.
export function DevicePairingQr() {
  const [expoDevServerUrl, setExpoDevServerUrl] = useState<string | null | undefined>(undefined);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setExpoDevServerUrl(data.expoDevServerUrl);
      })
      .catch(() => {
        if (!cancelled) setExpoDevServerUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Nada a gerar sem URL — e o componente nem chega a renderizar o
    // qrDataUrl neste caso (return null mais abaixo), então não há estado
    // para limpar aqui.
    if (!expoDevServerUrl) return;
    let cancelled = false;
    QRCode.toDataURL(expoDevServerUrl, { margin: 1, width: 176 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [expoDevServerUrl]);

  // Ainda não sabemos se a URL está configurada — evita "piscar" o card.
  if (expoDevServerUrl === undefined) return null;
  // Sem EXPO_DEV_SERVER_URL configurada (ex: build sem o serviço `mobile`
  // do Docker) — não há o que mostrar.
  if (!expoDevServerUrl) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parear novo dispositivo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL gerada localmente, sem otimização de imagem cabível
          <img src={qrDataUrl} alt="QR code para abrir o app no Expo Go" width={176} height={176} className="rounded-md border" />
        ) : (
          <div className="flex h-[176px] w-[176px] items-center justify-center rounded-md border text-xs text-muted-foreground">
            Gerando QR code...
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            No celular, abra o app <strong>Expo Go</strong> e escaneie este código para conectar ao servidor de
            desenvolvimento.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
