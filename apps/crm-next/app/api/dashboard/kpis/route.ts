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
  const eligibleClosedHostingExpr = `
    d.deal_type = 'HOSPEDAGEM'
    AND (
      d.lifecycle_status = 'CLIENT'
      OR ps.code IN ('fechado_ganho', 'assinatura_ativa_ganho')
      OR (
        d.is_closed = true
        AND coalesce(ps.code, '') NOT IN ('perdido', 'perdido_abandonado')
      )
    )
  `;

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
    leadNotificationRows,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.signupSession.count({ where: { status: 'ABANDONED', paymentConfirmed: false } }),
    prisma.deal.count({ where: { dealType: 'HOSPEDAGEM', lifecycleStatus: 'CLIENT', updatedAt: { gte: weekAgo } } }),
    prisma.deal.count({ where: { dealType: 'PROJETO_AVULSO', lifecycleStatus: 'CLIENT', updatedAt: { gte: weekAgo } } }),
    prisma.deal.count({ where: { lifecycleStatus: 'LOST', updatedAt: { gte: weekAgo } } }),
    prisma.$queryRawUnsafe<Array<{ ativos: number; atrasados: number; inativos: number; fantasma: number }>>(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'ATIVO'
            AND c.ghosted_at IS NULL
          )::int AS ativos,
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'ATRASADO'
            AND c.ghosted_at IS NULL
          )::int AS atrasados,
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'INATIVO'
            AND c.ghosted_at IS NULL
          )::int AS inativos,
          COUNT(*) FILTER (WHERE c.ghosted_at IS NOT NULL)::int AS fantasma
        FROM crm.deal d
        LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
        LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
        LEFT JOIN LATERAL (
          SELECT s1.status
          FROM client.subscriptions s1
          WHERE s1.organization_id = d.organization_id
          ORDER BY s1.created_at DESC
          LIMIT 1
        ) s ON true
        WHERE ${eligibleClosedHostingExpr}
      `
    ),
    prisma.dealOperation.count({ where: { status: 'ACTIVE' } }),
    prisma.deal.count({ where: { lifecycleStatus: { not: 'CLIENT' }, slaDeadline: { lt: now } } }),
    prisma.ticketQueue.count({ where: { status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
    getFinanceOverview(),
    prisma.$queryRawUnsafe<
      Array<{
        sent24h: number;
        failed24h: number;
        pending24h: number;
        simulated24h: number;
        total24h: number;
        pendingOver10m: number;
        lastSentAt: Date | null;
        lastFailedAt: Date | null;
      }>
    >(
      `
        SELECT
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'SENT'
              AND q.created_at >= now() - interval '24 hours') AS "sent24h",
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'FAILED'
              AND q.created_at >= now() - interval '24 hours') AS "failed24h",
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'PENDING'
              AND q.created_at >= now() - interval '24 hours') AS "pending24h",
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'SENT_SIMULATED'
              AND q.created_at >= now() - interval '24 hours') AS "simulated24h",
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.created_at >= now() - interval '24 hours') AS "total24h",
          (SELECT COUNT(*)::int FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'PENDING'
              AND q.created_at < now() - interval '10 minutes') AS "pendingOver10m",
          (SELECT MAX(q.processed_at) FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'SENT') AS "lastSentAt",
          (SELECT MAX(COALESCE(q.processed_at, q.created_at)) FROM crm.email_queue q
            WHERE q.subject ILIKE '[CRM] Novo lead recebido:%'
              AND q.status = 'FAILED') AS "lastFailedAt"
      `
    ),
  ]);

  const classes = clientClassRows[0] || { ativos: 0, atrasados: 0, inativos: 0, fantasma: 0 };
  const leadNotification = leadNotificationRows[0] || {
    sent24h: 0,
    failed24h: 0,
    pending24h: 0,
    simulated24h: 0,
    total24h: 0,
    pendingOver10m: 0,
    lastSentAt: null,
    lastFailedAt: null,
  };

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
    comunicacao: {
      leadNotification: {
        sent24h: leadNotification.sent24h,
        failed24h: leadNotification.failed24h,
        pending24h: leadNotification.pending24h,
        simulated24h: leadNotification.simulated24h,
        total24h: leadNotification.total24h,
        pendingOver10m: leadNotification.pendingOver10m,
        lastSentAt: leadNotification.lastSentAt,
        lastFailedAt: leadNotification.lastFailedAt,
      },
    },
  });
}
