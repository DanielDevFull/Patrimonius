import type { BudgetGroup, Category, CategoryKind, ID, Settings } from './types';

interface CategorySeed {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  group: BudgetGroup | null;
  keywords: string[];
}

/**
 * Categorias padrão (IDs estáveis — podem ser referenciados pelo código, ex.: CATEGORY_IDS.dividas).
 * Palavras-chave em minúsculas e COM acento (são exibidas nas Configurações); a NLU e o categorizador as
 * comparam já sem acento (`fold`), então "condomínio" casa com "condominio" e vice-versa.
 */
export const DEFAULT_CATEGORY_SEEDS: CategorySeed[] = [
  // ---------------- Despesas: necessidades ----------------
  {
    id: 'cat-moradia',
    name: 'Moradia',
    kind: 'despesa',
    icon: '🏠',
    color: '#6366f1',
    group: 'necessidades',
    keywords: ['aluguel', 'condomínio', 'iptu', 'reforma', 'casa', 'apartamento', 'imobiliária', 'manutenção'],
  },
  {
    id: 'cat-contas',
    name: 'Contas da casa',
    kind: 'despesa',
    icon: '💡',
    color: '#f59e0b',
    group: 'necessidades',
    keywords: [
      'luz',
      'energia',
      'enel',
      'cemig',
      'copel',
      'light',
      'água',
      'sabesp',
      'gás',
      'internet',
      'telefone',
      'celular',
      'vivo',
      'claro',
      'tim',
      'oi',
      'conta de',
    ],
  },
  {
    id: 'cat-mercado',
    name: 'Mercado',
    kind: 'despesa',
    icon: '🛒',
    color: '#22c55e',
    group: 'necessidades',
    keywords: [
      'mercado',
      'supermercado',
      'feira',
      'hortifruti',
      'açougue',
      'padaria',
      'atacadão',
      'assaí',
      'carrefour',
      'pão de açúcar',
      'extra',
      'compras do mês',
    ],
  },
  {
    id: 'cat-transporte',
    name: 'Transporte',
    kind: 'despesa',
    icon: '🚗',
    color: '#0ea5e9',
    group: 'necessidades',
    keywords: [
      'uber',
      '99',
      'táxi',
      'ônibus',
      'metrô',
      'combustível',
      'gasolina',
      'etanol',
      'posto',
      'estacionamento',
      'pedágio',
      'ipva',
      'seguro do carro',
      'mecânico',
      'oficina',
      'passagem',
    ],
  },
  {
    id: 'cat-saude',
    name: 'Saúde',
    kind: 'despesa',
    icon: '🩺',
    color: '#ef4444',
    group: 'necessidades',
    keywords: [
      'farmácia',
      'remédio',
      'médico',
      'consulta',
      'exame',
      'plano de saúde',
      'dentista',
      'hospital',
      'drogaria',
      'psicólogo',
      'terapia',
    ],
  },
  {
    id: 'cat-educacao',
    name: 'Educação',
    kind: 'despesa',
    icon: '📚',
    color: '#8b5cf6',
    group: 'necessidades',
    keywords: ['escola', 'faculdade', 'curso', 'livro', 'mensalidade', 'material escolar', 'udemy', 'alura'],
  },
  {
    id: 'cat-impostos',
    name: 'Impostos e taxas',
    kind: 'despesa',
    icon: '🧾',
    color: '#64748b',
    group: 'necessidades',
    keywords: ['imposto', 'taxa', 'tarifa', 'irpf', 'darf', 'anuidade', 'multa', 'cartório'],
  },
  // ---------------- Despesas: desejos ----------------
  {
    id: 'cat-alimentacao-fora',
    name: 'Restaurantes e delivery',
    kind: 'despesa',
    icon: '🍽️',
    color: '#f97316',
    group: 'desejos',
    keywords: [
      'restaurante',
      'ifood',
      'delivery',
      'lanche',
      'pizza',
      'hambúrguer',
      'almoço',
      'jantar',
      'café',
      'bar',
      'rappi',
      'sushi',
      'lanchonete',
    ],
  },
  {
    id: 'cat-lazer',
    name: 'Lazer',
    kind: 'despesa',
    icon: '🎉',
    color: '#ec4899',
    group: 'desejos',
    keywords: ['cinema', 'show', 'festa', 'viagem', 'passeio', 'teatro', 'ingresso', 'hotel', 'jogo', 'parque'],
  },
  {
    id: 'cat-compras',
    name: 'Compras',
    kind: 'despesa',
    icon: '🛍️',
    color: '#d946ef',
    group: 'desejos',
    keywords: [
      'roupa',
      'sapato',
      'tênis',
      'shopping',
      'amazon',
      'mercado livre',
      'shopee',
      'magalu',
      'eletrônico',
      'presente',
      'loja',
    ],
  },
  {
    id: 'cat-assinaturas',
    name: 'Assinaturas',
    kind: 'despesa',
    icon: '📺',
    color: '#14b8a6',
    group: 'desejos',
    keywords: [
      'netflix',
      'spotify',
      'assinatura',
      'prime video',
      'disney',
      'hbo',
      'max',
      'youtube premium',
      'globoplay',
      'icloud',
      'google one',
      'academia',
      'gympass',
      'wellhub',
    ],
  },
  {
    id: 'cat-cuidados',
    name: 'Cuidados pessoais',
    kind: 'despesa',
    icon: '💇',
    color: '#f43f5e',
    group: 'desejos',
    keywords: ['salão', 'cabelo', 'barbearia', 'manicure', 'cosmético', 'perfume', 'estética'],
  },
  {
    id: 'cat-pets',
    name: 'Pets',
    kind: 'despesa',
    icon: '🐾',
    color: '#a16207',
    group: 'desejos',
    keywords: ['pet', 'ração', 'veterinário', 'petshop', 'banho e tosa'],
  },
  {
    id: 'cat-doacoes',
    name: 'Presentes e doações',
    kind: 'despesa',
    icon: '🎁',
    color: '#be185d',
    group: 'desejos',
    keywords: ['doação', 'dízimo', 'oferta', 'vaquinha', 'caridade'],
  },
  // ---------------- Despesas: objetivos ----------------
  {
    id: 'cat-investimentos',
    name: 'Investimentos e reserva',
    kind: 'despesa',
    icon: '📈',
    color: '#10b981',
    group: 'objetivos',
    keywords: ['investimento', 'aporte', 'tesouro', 'cdb', 'ações', 'fii', 'reserva', 'previdência', 'poupança'],
  },
  {
    id: 'cat-dividas',
    name: 'Dívidas e empréstimos',
    kind: 'despesa',
    icon: '💳',
    color: '#dc2626',
    group: 'objetivos',
    keywords: ['empréstimo', 'financiamento', 'parcela', 'dívida', 'consignado', 'acordo', 'juros'],
  },
  {
    id: 'cat-outros-despesa',
    name: 'Outras despesas',
    kind: 'despesa',
    icon: '📦',
    color: '#94a3b8',
    group: 'desejos',
    keywords: [],
  },
  // ---------------- Receitas ----------------
  {
    id: 'cat-salario',
    name: 'Salário',
    kind: 'receita',
    icon: '💼',
    color: '#16a34a',
    group: null,
    keywords: ['salário', 'pagamento', 'holerite', 'adiantamento', 'vale', '13º', 'décimo terceiro', 'férias', 'plr'],
  },
  {
    id: 'cat-freelance',
    name: 'Renda extra',
    kind: 'receita',
    icon: '🧑‍💻',
    color: '#0d9488',
    group: null,
    keywords: ['freela', 'freelance', 'bico', 'serviço', 'projeto', 'comissão', 'venda', 'extra'],
  },
  {
    id: 'cat-rendimentos',
    name: 'Rendimentos',
    kind: 'receita',
    icon: '💰',
    color: '#059669',
    group: null,
    keywords: ['rendimento', 'dividendo', 'juros', 'aluguel recebido', 'cashback', 'resgate'],
  },
  {
    id: 'cat-reembolso',
    name: 'Reembolsos',
    kind: 'receita',
    icon: '↩️',
    color: '#0891b2',
    group: null,
    keywords: ['reembolso', 'estorno', 'devolução', 'restituição'],
  },
  {
    id: 'cat-outros-receita',
    name: 'Outras receitas',
    kind: 'receita',
    icon: '✨',
    color: '#84cc16',
    group: null,
    keywords: ['presente', 'pix recebido', 'prêmio'],
  },
];

/** IDs estáveis das categorias padrão mais usadas pelo código. */
export const CATEGORY_IDS = {
  moradia: 'cat-moradia',
  contas: 'cat-contas',
  mercado: 'cat-mercado',
  transporte: 'cat-transporte',
  saude: 'cat-saude',
  educacao: 'cat-educacao',
  impostos: 'cat-impostos',
  restaurantes: 'cat-alimentacao-fora',
  lazer: 'cat-lazer',
  compras: 'cat-compras',
  assinaturas: 'cat-assinaturas',
  cuidados: 'cat-cuidados',
  pets: 'cat-pets',
  doacoes: 'cat-doacoes',
  investimentos: 'cat-investimentos',
  dividas: 'cat-dividas',
  outrosDespesa: 'cat-outros-despesa',
  salario: 'cat-salario',
  rendaExtra: 'cat-freelance',
  rendimentos: 'cat-rendimentos',
  reembolso: 'cat-reembolso',
  outrosReceita: 'cat-outros-receita',
} as const;

/**
 * Categorias usadas diretamente pelo código (destino padrão ao excluir, aportes em metas e pagamentos de dívidas).
 * Não podem ser excluídas (só arquivadas) e são recriadas se faltarem (ex.: backup importado sem elas).
 * Fonte única para o repositório (@/db/repo) e para a tela de categorias.
 */
export const SYSTEM_CATEGORY_IDS: readonly ID[] = [
  CATEGORY_IDS.outrosDespesa,
  CATEGORY_IDS.outrosReceita,
  CATEGORY_IDS.investimentos,
  CATEGORY_IDS.dividas,
];

/**
 * Regra 50/30/20: fração da renda sugerida para cada grupo de categorias. Necessidades e desejos são tetos;
 * objetivos (reserva, metas e dívidas) é um piso. Fonte única para análises, orçamentos, relatórios e o agente.
 */
export const RULE_50_30_20: Readonly<Record<BudgetGroup, number>> = {
  necessidades: 0.5,
  desejos: 0.3,
  objetivos: 0.2,
};

export function buildDefaultCategories(now: string): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((seed) => ({
    ...seed,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildDefaultSettings(now: string): Settings {
  return {
    id: 'settings',
    userName: '',
    agentName: 'Pat',
    emergencyFundTargetMonths: 6,
    savingsRateTarget: 20,
    monthlyIncomeEstimate: null,
    theme: 'system',
    onboardingDone: false,
    hideValues: false,
    dismissedInsights: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Paleta sugerida para contas/metas/categorias criadas pelo usuário. */
export const COLOR_PALETTE = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#475569',
  '#dc2626',
];

export const ACCOUNT_TYPE_ICONS = {
  corrente: '🏦',
  poupanca: '🐷',
  carteira: '👛',
  investimento: '📈',
  cartao_credito: '💳',
  outro: '💼',
} as const;
