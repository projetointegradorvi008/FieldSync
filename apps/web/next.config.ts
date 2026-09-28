import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone": gera um build autocontido em .next/standalone, copiado
  // pelo Dockerfile — evita levar o node_modules inteiro para a imagem.
  output: "standalone",
  // Esconde o indicador flutuante do Next.js (botão "N" no canto, só em
  // dev) — não faz parte da UI do produto. Erros de build/runtime continuam
  // aparecendo normalmente.
  devIndicators: false,
};

export default nextConfig;
