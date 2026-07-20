import "./globals.css";

export const metadata = {
  title: "XMCODE Licit - Portal de Licitações de TI (PNCP)",
  description: "Encontre e gerencie as melhores licitações e editais de tecnologia do Brasil diretamente do Portal Nacional de Contratações Públicas (PNCP), sob a marca XMCODE.",
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
