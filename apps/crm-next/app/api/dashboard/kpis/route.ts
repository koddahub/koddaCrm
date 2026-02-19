import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { getFinanceOverview } from '@/lib/finance';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

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
    clientesAtivos,
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
    prisma.deal.count({ where: { lifecycleStatus: 'CLIENT' } }),
    prisma.dealOperation.count({ where: { status: 'ACTIVE' } }),
    prisma.deal.count({ where: { lifecycleStatus: { not: 'CLIENT' }, slaDeadline: { lt: now } } }),
    prisma.ticketQueue.count({ where: { status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
    getFinanceOverview(),
  ]);

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
      clientesAtivos,
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
