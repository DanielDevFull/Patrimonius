# Patrimonius — guia para desenvolvimento

App de gestão financeira pessoal **100% offline**, com um agente financeiro local ("Pat").
Todos os dados são digitados manualmente pelo usuário e ficam no IndexedDB do navegador.

## Regras inegociáveis

- **Nenhuma conexão externa**: não adicione `fetch`, APIs, CDNs, fontes web, analytics ou integrações bancárias.
  O agente é por regras + análises locais — nada de LLM remoto.
- **Dinheiro em centavos inteiros** (`Cents`). Nunca use float para valores. Converta entrada com `parseMoney`
  e exiba com `<Money />` (ou `formatBRL`). Divida parcelas com `splitCents`.
- **Datas como string** `'YYYY-MM-DD'` (`ISODate`) e meses `'YYYY-MM'` (`MonthKey`). Use `@/domain/dates`
  (nunca `new Date('YYYY-MM-DD')`, que sofre com fuso horário).
- **Interface e textos em português do Brasil.**
- Toda escrita no banco passa por `@/db/repo`. Telas leem dados com `useFinanceData()` e calculam com `@/analytics`.
- Funções de `@/analytics` e `@/agent` são **puras e determinísticas** (recebem `today` como parâmetro).

## Estrutura

```
src/
  domain/      types.ts (modelo), money.ts, dates.ts, text.ts, defaults.ts (categorias padrão, CATEGORY_IDS)
  db/          db.ts (Dexie), repo.ts (CRUD + regras), hooks.ts (useFinanceData, useSettings, useToday...), backup.ts, demo.ts
  analytics/   cálculos puros: saldos, resumos, orçamentos, recorrências, previsão, dívidas, metas, patrimônio, saúde
  agent/       NLU pt-BR, categorizador, insights, respostas do chat, relatório mensal
  components/  ui/ (kit: Button, Card, Modal, Field, MoneyInput, Money, ProgressBar...), layout/AppShell
  features/    uma pasta por página (default export do componente da página)
  app/         router (HashRouter), navigation (ROUTES), tema
  test/        setup.ts, factories.ts (makeData, makeAccount, makeTransaction...)
```

## Convenções de código

- TypeScript estrito; alias `@/` = `src/`. Sem `any`.
- Estilo: Tailwind v4 (classes utilitárias), modo escuro via variante `dark:`. Cor da marca: `brand-*` (teal).
- Use o kit `@/components/ui` em vez de recriar botões/inputs/modais. Feedback: `useToast()` e `useConfirm()`.
- Valores na tela sempre com `<Money value={cents} />` (respeita o modo "ocultar valores").
- Rotas: use `ROUTES` e `newTransactionPath()` de `@/app/navigation`.
- Testes com Vitest + Testing Library (`*.test.ts(x)` ao lado do código). Use `@/test/factories`.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm test           # testes (vitest)
npm run typecheck  # tsc
npm run lint       # eslint
npm run build      # build de produção (PWA)
```
