import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureSite24hOperationSchema } from '@/lib/site24h-operation';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureSite24hOperationSchema();

  const body = await req.json().catch(() => ({}));
  const projectId = String(body.projectId || body.project_id || '').trim();
  const domain = String(body.domain || '').trim();
  const subject = String(body.subject || '[KoddaHub] Aprovação de domínio/publicação').trim();
  const message = String(body.message || '').trim();
  const dueAtRaw = String(body.dueAt || '').trim();
  const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
  const requestItemsInput: string[] = Array.isArray(body.requestItems)
    ? body.requestItems
    : String(body.requestItems || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
  const requestItems: string[] = requestItemsInput
    .map((item: unknown) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!message && requestItems.length === 0 && !domain) {
    return NextResponse.json({ error: 'Informe domínio, mensagem ou itens da solicitação.' }, { status: 422 });
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId é obrigatório.' }, { status: 422 });
  }

  const normalizedItems = [
    ...(domain ? [`Domínio para publicação: ${domain}`] : []),
    ...requestItems,
  ].slice(0, 20);

  try {
    const output = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: params.id },
        include: {
          organization: {
            select: {
              id: true,
              legalName: true,
              billingEmail: true,
            },
          },
        },
      });

      if (!deal) throw new Error('Deal não encontrado');
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Fluxo de publicação disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Fluxo de publicação disponível apenas para cliente fechado');
      const ownedProject = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM client.projects
        WHERE id = ${projectId}::uuid
          AND organization_id = ${deal.organizationId}::uuid
        LIMIT 1
      `;
      if (!ownedProject[0]?.id) throw new Error('Projeto inválido para este cliente.');

      const emailTo = deal.contactEmail || deal.organization?.billingEmail;
      let emailQueueId: string | null = null;
      if (emailTo) {
        const email = await tx.emailQueue.create({
          data: {
            organizationId: deal.organizationId || null,
            emailTo,
            subject: subject || '[KoddaHub] Aprovação de domínio/publicação',
            body: [
              'Olá!',
              '',
              'Para avançarmos na etapa de Publicação do seu site, precisamos da sua validação:',
              '',
              ...(normalizedItems.length > 0 ? normalizedItems.map((item, index) => `${index + 1}. ${item}`) : []),
              ...(message ? ['', message] : []),
              '',
              'Responda este e-mail com os dados solicitados.',
              'Equipe KoddaHub.',
            ].join('\n'),
            status: 'PENDING',
          },
        });
        emailQueueId = email.id;
      }

      const requestRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO crm.deal_prompt_request(
          deal_id,
          project_id,
          prompt_revision_id,
          subject,
          request_items,
          message,
          due_at,
          email_queue_id,
          status,
          created_by,
          created_at,
          updated_at
        )
        VALUES(
          ${deal.id}::uuid,
          ${projectId}::uuid,
          NULL,
          ${subject || '[KoddaHub] Aprovação de domínio/publicação'},
          ${JSON.stringify(normalizedItems)}::jsonb,
          ${message || 'Solicitação de validação para etapa de publicação.'},
          ${dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null},
          ${emailQueueId}::uuid,
          'SENT',
          'ADMIN',
          now(),
          now()
        )
        RETURNING id::text
      `;

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PUBLICATION_REQUEST_INFO',
          content: 'Solicitação de aprovação/informações de publicação enviada ao cliente.',
          metadata: {
            subject,
            domain,
            project_id: projectId,
            dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt.toISOString() : null,
            requestItems: normalizedItems,
            emailQueueId,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        requestId: requestRows[0]?.id || null,
        emailQueueId,
      };
    });

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao enviar solicitação de publicação', details: String(error) }, { status: 500 });
  }
}
