import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decimalToCents } from '@/lib/money';

const PAID_STATUSES = ['CONFIRMED', 'RECEIVED', 'PAID', 'RECEIVED_IN_CASH', 'SETTLED'];

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

async function querySingleNumericToCents(query: Prisma.Sql) {
  const rows = await prisma.$queryRaw<Array<{ total: Prisma.Decimal | null }>>(query);
  return decimalToCents(rows[0]?.total ?? null);
}

export async function getFinanceOverview() {
  const { start, end } = monthRange();

  const [mrr, recebidosMes, inadimplenciaAberta, avulsoMes, manualReceitas, despesasManuais] = await Promise.all([
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(p.monthly_price), 0) AS total
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE'
    `),
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.paid_at >= ${start}::timestamp
        AND p.paid_at < ${end}::timestamp
        AND p.status = ANY(${PAID_STATUSES}::text[])
    `),
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.due_date < CURRENT_DATE
        AND (p.status IS NULL OR p.status <> ALL(${PAID_STATUSES}::text[]))
    `),
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(dp.value_cents), 0) / 100.0 AS total
      FROM crm.deal_proposal dp
      WHERE dp.created_at >= ${start}::timestamp
        AND dp.created_at < ${end}::timestamp
        AND dp.status IN ('GERADA', 'ENVIADA', 'ACEITA', 'FECHADA')
    `),
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'RECEITA'
        AND fe.entry_date >= ${start}::date
        AND fe.entry_date < ${end}::date
    `),
    querySingleNumericToCents(Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'DESPESA'
        AND fe.entry_date >= ${start}::date
        AND fe.entry_date < ${end}::date
    `),
  ]);

  const receitaAvulsa = avulsoMes + manualReceitas;
  const dreResultadoMes = recebidosMes + receitaAvulsa - despesasManuais;

  const avgAvulso = receitaAvulsa > 0 ? receitaAvulsa : Math.round(recebidosMes * 0.15);

  return {
    mrr,
    recebidosMes,
    inadimplenciaAberta,
    avulsoMes: receitaAvulsa,
    dre: {
      receitaRecorrente: recebidosMes,
      receitaAvulsa,
      despesasManuais,
      resultado: dreResultadoMes,
    },
    projecao: {
      d30: mrr + avgAvulso,
      d60: mrr * 2 + avgAvulso * 2,
      d90: mrr * 3 + avgAvulso * 3,
    },
  };
}

export function isPaidStatus(status: string | null | undefined) {
  if (!status) return false;
  return PAID_STATUSES.includes(status.toUpperCase());
}
