import "./globals.css";

export const metadata = {
  title: "XMCODE Licit - Portal Multicanal de Licitações de TI",
  description: "Encontre e gerencie as melhores licitações e editais de tecnologia do Brasil integrando múltiplos portais e bases públicas, sob a marca XMCODE.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
