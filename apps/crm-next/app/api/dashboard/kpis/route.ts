import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureClientBillingInfra } from '@/lib/client-billing';
import { getFinanceOverview } from '@/lib/finance';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;
  await ensureClientBillingInfra();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    leads24h,
    leads7d,
    abandonos2h,
    ganhosHospedagem,
    ganhosAvulsos,
    perdidos,
    clientClassRows,
    operacoesEmCurso,
    slaRisco,
    ticketsAbertos,
    finance,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.signupSession.count({ where: { status: 'ABANDONED', paymentConfirmed: false } }),
    prisma.deal.count({ where: { dealType: 'HOSPEDAGEM', lifecycleStatus: 'CLIENT', updatedAt: { gte: weekAgo } } }),
    prisma.deal.count({ where: { dealType: 'PROJETO_AVULSO', lifecycleStatus: 'CLIENT', updatedAt: { gte: weekAgo } } }),
    prisma.deal.count({ where: { lifecycleStatus: 'LOST', updatedAt: { gte: weekAgo } } }),
    prisma.$queryRaw<Array<{ ativos: number; atrasados: number; inativos: number; fantasma: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE coalesce(c.class_status, 'ATIVO') = 'ATIVO' AND c.ghosted_at IS NULL)::int AS ativos,
        COUNT(*) FILTER (WHERE c.class_status = 'ATRASADO' AND c.ghosted_at IS NULL)::int AS atrasados,
        COUNT(*) FILTER (WHERE c.class_status = 'INATIVO' AND c.ghosted_at IS NULL)::int AS inativos,
        COUNT(*) FILTER (WHERE c.ghosted_at IS NOT NULL)::int AS fantasma
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type = 'HOSPEDAGEM'
        AND d.lifecycle_status = 'CLIENT'
    `,
    prisma.dealOperation.count({ where: { status: 'ACTIVE' } }),
    prisma.deal.count({ where: { lifecycleStatus: { not: 'CLIENT' }, slaDeadline: { lt: now } } }),
    prisma.ticketQueue.count({ where: { status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
    getFinanceOverview(),
  ]);

  const classes = clientClassRows[0] || { ativos: 0, atrasados: 0, inativos: 0, fantasma: 0 };

  return NextResponse.json({
    prospeccao: {
      leads24h,
      leads7d,
      abandonos2h,
      ganhosHospedagem,
      ganhosAvulsos,
      perdidos,
    },
    operacao: {
      clientesAtivos: classes.ativos,
      clientesAtrasados: classes.atrasados,
      clientesInativos: classes.inativos,
      clientesFantasma: classes.fantasma,
      operacoesEmCurso,
      slaRisco,
      ticketsAbertos,
    },
    financeiro: {
      mrr: finance.mrr,
      recebidosMes: finance.recebidosMes,
      inadimplenciaAberta: finance.inadimplenciaAberta,
      dreResultadoMes: finance.dre.resultado,
    },
  });
}
