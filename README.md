# 🔍 XMCODE - Portal de Busca de Licitações Multicanal

Plataforma inteligente desenvolvida em **Next.js** para monitorar, centralizar e filtrar licitações públicas de Tecnologia da Informação (TI) coletadas de múltiplos portais governamentais do Brasil.

---

## 📌 Resumo do Projeto

O **XMCODE Busca Portal** automatiza o acompanhamento diário de editais de compras públicas, com foco estratégico em serviços e equipamentos de TI (desenvolvimento de software, infraestrutura de redes, computadores, suporte técnico, nuvem e conectividade). 

A aplicação consolida os editais em um banco de dados de alta performance e oferece uma interface gráfica moderna, rápida e responsiva para consulta, ordenação e exportação.

---

## ✨ Principais Funcionalidades

- **🌐 Coleta Multicanal e Deduplicação Inteligente**: Captura dados do Portal Nacional de Contratações Públicas (PNCP) e identifica a origem do edital (PNCP, Compras.gov.br, Portal Compras Públicas, LicitaNet, BNC Compras, Compras BR).
- **⚡ Processamento Paralelo Ultra-Rápido**: Motor de busca refatorado com requisições assíncronas paralelas (`Promise.all`), concluindo a sincronização em menos de **3 segundos** (compatível com os limites do Vercel Cron).
- **🎯 Filtro Especializado para TI**: Algoritmo ajustado para identificar termos de tecnologia e remover ruídos irrelevantes (obras civis, drenagem, recapeamento).
- **📊 Ordenação Global e Filtros por Coluna**: Ordenação por Maior/Menor Valor, Data de Publicação e Abertura incidindo sobre 100% dos resultados da busca, além de campos de busca rápida por coluna.
- **📄 Paginação Flexível**: Paginação no rodapé com seletor de quantidade de itens por página (20, 50 ou 100).
- **☁️ Armazenamento Híbrido (Redis + Gzip)**: Persistência no **Upstash Redis** em nuvem com compactação Gzip (reduz a carga em até 85%), com cópia de fallback local em JSON.
- **🔒 Autenticação e Segurança**: Painel administrativo protegido por cookies HTTP-only e tokens de sessão dinâmicos calculados via variáveis de ambiente.

---

## 🛠️ Tecnologias Utilizadas

- **Core**: [Next.js](https://nextjs.org/) (App Router, Turbopack) & [React 19](https://react.dev/)
- **Estilização**: CSS3 Vanilla (Design System com Glassmorphism, Micro-animações e Dark Mode)
- **Banco de Dados & Cache**: [Upstash Redis](https://upstash.com/) (Serverless KV Store)
- **Compactação**: Zlib Gzip
- **Deploy & Agendamento**: Vercel Serverless Functions + Vercel Cron (07h00 BRT)

---

## 🚀 Como Iniciar o Projeto Localmente

### 1. Pré-requisitos
Certifique-se de ter instalado em sua máquina:
- [Node.js](https://nodejs.org/) (Versão 18.x ou superior)
- `npm` ou `yarn`

### 2. Passo a Passo de Instalação

```bash
# 1. Clone o repositório
git clone git@github.com:ldfxavier/buscar_edital.git

# 2. Acesse a pasta do projeto
cd busca-portal

# 3. Instale as dependências
npm install

# 4. Configure o arquivo de variáveis de ambiente
cp .env.example .env
```

### 3. Configuração do `.env`
Abra o arquivo `.env` gerado e defina suas credenciais reais:

```env
# Credenciais de Login do Administrador
ADMIN_USER=admin
ADMIN_PASS=sua_senha_segura_aqui
SESSION_SECRET=seu_segredo_de_sessao_aqui

# Conexão com o Upstash Redis (Nuvem)
UPSTASH_REDIS_REST_URL=https://sua-instancia.upstash.io
UPSTASH_REDIS_REST_TOKEN=seu_token_upstash_aqui

# (Opcional) Chave para Integração de IA
GEMINI_API_KEY=sua_chave_gemini_aqui
```

### 4. Executando o Projeto

```bash
# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 🔄 Sincronização de Dados

A sincronização de novos editais pode ocorrer de três formas:
1. **Vercel Cron (Automático)**: Disparado diariamente às **07h00 BRT (10h00 UTC)** via endpoint `/api/sync?sync=true`.
2. **Execução Local por Linha de Comando**:
   ```bash
   node --env-file=.env -e "import('./lib/sync.js').then(m => m.syncWithPncp({ currentMonthOnly: true }))"
   ```
3. **URL Manual de Sincronização**:
   Acesse `/api/sync?sync=true` para disparar a atualização sob demanda.

---

## 📦 Build para Produção

Para validar e gerar a compilação de produção:

```bash
npm run build
npm run start
```

---

## 🌐 Deploy na Vercel

1. Importe o repositório na [Vercel](https://vercel.com).
2. Adicione as Variáveis de Ambiente no painel da Vercel (`ADMIN_PASS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SESSION_SECRET`).
3. O arquivo `vercel.json` já está pré-configurado para ativar o Cron Job diário:
   ```json
   {
     "crons": [
       {
         "path": "/api/sync?sync=true",
         "schedule": "0 10 * * *"
       }
     ]
   }
   ```

---

## 📄 Licença e Contribuição

Este projeto é **Open Source** e de código aberto sob a licença [MIT](LICENSE). Sinta-se totalmente à vontade para utilizar, modificar, adaptar e contribuir com melhorias!
