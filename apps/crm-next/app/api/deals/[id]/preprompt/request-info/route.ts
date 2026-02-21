import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { ensureSite24hOperationSchema } from '@/lib/site24h-operation';
import { prisma } from '@/lib/prisma';

async function latestPromptFromPortal(organizationId: string) {
  const rows = await prisma.$queryRaw<Array<{ prompt_text: string | null; prompt_json: unknown }>>`
    SELECT ap.prompt_text, ap.prompt_json
    FROM client.ai_prompts ap
    JOIN client.project_briefs pb ON pb.id = ap.brief_id
    WHERE pb.organization_id = ${organizationId}::uuid
    ORDER BY ap.created_at DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureSite24hOperationSchema();

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || '[KoddaHub] Precisamos de mais informações do briefing').trim();
  const message = String(body.message || body.notes || '').trim();
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

  if (!message && requestItems.length === 0) {
    return NextResponse.json({ error: 'Informe a mensagem ou pelo menos 1 item solicitado.' }, { status: 422 });
  }

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
      if (deal.dealType !== 'HOSPEDAGEM') throw new Error('Fluxo pré-prompt disponível somente para hospedagem');
      if (deal.lifecycleStatus !== 'CLIENT') throw new Error('Fluxo pré-prompt disponível apenas para cliente fechado');

      const latestRevision = await tx.dealPromptRevision.findFirst({
        where: { dealId: deal.id },
        orderBy: { version: 'desc' },
      });

      let promptText = latestRevision?.promptText || '';
      let promptJson: unknown = latestRevision?.promptJson || null;

      if (!promptText && deal.organizationId) {
        const portalPrompt = await latestPromptFromPortal(deal.organizationId);
        promptText = String(portalPrompt?.prompt_text || '');
        promptJson = portalPrompt?.prompt_json || null;
      }

      const targetVersion = latestRevision ? latestRevision.version : 1;
      const incomingPromptText = typeof body.promptText === 'string' ? body.promptText.trim() : '';
      const incomingPromptJson = body.promptJson ?? null;
      if (incomingPromptText) {
        promptText = incomingPromptText;
      }
      if (incomingPromptJson) {
        promptJson = incomingPromptJson;
      }

      const revision = latestRevision
        ? await tx.dealPromptRevision.update({
            where: { id: latestRevision.id },
            data: {
              promptText: promptText || 'Prompt pendente de refinamento.',
              promptJson: promptJson as never,
              status: 'REQUESTED_INFO',
              requestedNotes: message || requestItems.join(' | ') || null,
              updatedAt: new Date(),
            },
          })
        : await tx.dealPromptRevision.create({
            data: {
              dealId: deal.id,
              version: targetVersion,
              promptText: promptText || 'Prompt pendente de refinamento.',
              promptJson: promptJson as never,
              status: 'REQUESTED_INFO',
              requestedNotes: message || requestItems.join(' | ') || null,
              createdBy: 'ADMIN',
            },
          });

      const emailTo = deal.contactEmail || deal.organization?.billingEmail;
      let emailQueueId: string | null = null;
      if (emailTo) {
        const email = await tx.emailQueue.create({
          data: {
            organizationId: deal.organizationId || null,
            emailTo,
            subject: subject || '[KoddaHub] Precisamos de mais informações para seu site',
            body: [
              'Olá!',
              '',
              'Para avançarmos na etapa Pré-prompt do seu Site 24h, precisamos destes detalhes:',
              '',
              ...(requestItems.length > 0 ? requestItems.map((item, index) => `${index + 1}. ${item}`) : []),
              ...(message ? ['', message] : []),
              '',
              'Responda este e-mail com as informações solicitadas.',
              'Equipe KoddaHub.',
            ].join('\n'),
            status: 'PENDING',
          },
        });
        emailQueueId = email.id;
      }

      const promptRequestRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO crm.deal_prompt_request(
          deal_id,
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
          ${revision.id}::uuid,
          ${subject || '[KoddaHub] Solicitação de informações adicionais'},
          ${JSON.stringify(requestItems)}::jsonb,
          ${message || requestItems.join('\n') || 'Solicitação de informações adicionais'},
          ${dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null},
          ${emailQueueId}::uuid,
          'SENT',
          'ADMIN',
          now(),
          now()
        )
        RETURNING id::text
      `;

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'pre_prompt');

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_REQUEST_INFO',
          content: 'Solicitação de informação adicional enviada ao cliente por e-mail.',
          metadata: {
            subject,
            dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt.toISOString() : null,
            requestItems,
            revisionVersion: revision.version,
            emailQueueId,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        requestId: promptRequestRows[0]?.id || null,
        emailQueueId,
        revisionId: revision.id,
        version: revision.version,
      };
    });

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao solicitar informações adicionais', details: String(error) }, { status: 500 });
  }
}
