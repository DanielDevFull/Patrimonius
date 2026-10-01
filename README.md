# Patrimonius

**Gestão financeira pessoal inteligente, 100% offline e privada — com um agente financeiro que roda no seu dispositivo.**

O Patrimonius ajuda você a organizar receitas, despesas, contas, orçamentos, metas, dívidas e patrimônio.
O **Pat**, seu agente financeiro, conversa em português, registra lançamentos a partir de frases como
_"gastei 45,90 no ifood ontem"_, responde perguntas sobre o seu dinheiro e gera alertas e recomendações personalizadas.

> 🔒 **Sem conexão externa.** Não há integração com bancos, APIs ou servidores: todos os dados são digitados por você
> e ficam guardados apenas no navegador (IndexedDB). O agente é local — nenhuma informação é enviada para a internet.

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Painel** | Saldo, receitas, despesas e sobra do mês, saúde financeira (0–100), previsão de saldo até o fim do mês, gastos por categoria, próximos compromissos e recomendações do Pat |
| **Assistente (Pat)** | Chat em português: registra lançamentos, consulta gastos/saldos, define orçamentos, cria metas, avalia "posso gastar?", plano de quitação de dívidas, relatório do mês |
| **Lançamentos** | Despesas, receitas e transferências; parcelamento; pendentes; filtros e busca; categorização automática que aprende com seu histórico |
| **Contas** | Conta corrente, poupança, carteira, investimentos e cartão de crédito (limite, fatura, pagamento); ajuste de saldo |
| **Recorrências** | Contas fixas e salário gerados automaticamente como pendentes; detecção de gastos que se repetem |
| **Orçamentos** | Limite por categoria (padrão ou por mês), projeção de estouro, sugestões automáticas, regra 50/30/20 |
| **Metas** | Objetivos com prazo, aporte mensal necessário, ritmo atual e previsão de conclusão |
| **Dívidas** | Saldo devedor, juros, pagamentos e simulação de quitação (avalanche × bola de neve) |
| **Patrimônio** | Patrimônio líquido (contas + bens − dívidas) e sua evolução mês a mês |
| **Relatórios** | Fechamento do mês narrado pelo Pat, tendências por categoria, fluxo de caixa, comparativos, exportação CSV |
| **Simuladores** | Juros compostos, tempo até um objetivo, "posso comprar?", reserva de emergência, quitar × investir |
| **Configurações** | Categorias, preferências, tema claro/escuro, modo "ocultar valores", backup/restauração em arquivo JSON, dados de exemplo |

## Como usar

Pré-requisito: Node.js 20+.

```bash
npm install
npm run dev       # abre em http://localhost:5173
```

Para gerar a versão de produção (PWA instalável no celular e no computador):

```bash
npm run build
npm run preview
```

A pasta `dist/` pode ser servida por qualquer hospedagem estática. Depois de aberto uma vez, o app funciona offline.

### Seus dados

- Ficam no navegador/dispositivo onde você usa o app.
- Faça **backups** em _Configurações → Dados e privacidade → Exportar backup_ (arquivo `.json`) e restaure quando quiser.
- Limpar os dados do navegador apaga os dados do app — mantenha backups.

## Desenvolvimento

```bash
npm test           # testes (Vitest)
npm run typecheck  # verificação de tipos
npm run lint       # ESLint
```

Tecnologias: React 19, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB), Recharts, vite-plugin-pwa.

Arquitetura e convenções estão em [`CLAUDE.md`](./CLAUDE.md):

- `src/domain` — modelo de dados, dinheiro em centavos, datas sem fuso
- `src/db` — banco local, operações de dados, backup e dados de exemplo
- `src/analytics` — cálculos financeiros puros (saldos, orçamentos, previsão, dívidas, metas, patrimônio, saúde financeira)
- `src/agent` — agente Pat: compreensão de linguagem em pt-BR, categorização, insights, respostas e relatórios
- `src/features` — telas

> As análises e recomendações do Pat têm caráter educativo e não substituem orientação financeira profissional.
