import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
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

  const body = await req.json().catch(() => ({}));
  const notes = String(body.notes || '').trim();
  if (!notes) {
    return NextResponse.json({ error: 'Informe o que precisa ser complementado no pré-prompt.' }, { status: 422 });
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
      const revision = latestRevision
        ? await tx.dealPromptRevision.update({
            where: { id: latestRevision.id },
            data: {
              promptText: promptText || 'Prompt pendente de refinamento.',
              promptJson: promptJson as never,
              status: 'REQUESTED_INFO',
              requestedNotes: notes,
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
              requestedNotes: notes,
              createdBy: 'ADMIN',
            },
          });

      const emailTo = deal.contactEmail || deal.organization?.billingEmail;
      if (emailTo) {
        await tx.emailQueue.create({
          data: {
            organizationId: deal.organizationId || null,
            emailTo,
            subject: '[KoddaHub] Precisamos de mais informações para seu site',
            body: `Olá!\n\nPara avançarmos na etapa Pré-prompt do seu Site 24h, precisamos destes detalhes:\n\n${notes}\n\nResponda este e-mail com as informações solicitadas.\n\nEquipe KoddaHub.`,
            status: 'PENDING',
          },
        });
      }

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'pre_prompt');

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'PREPROMPT_REQUEST_INFO',
          content: 'Solicitação de informação adicional enviada ao cliente por e-mail.',
          metadata: { notes, revisionVersion: revision.version },
          createdBy: 'ADMIN',
        },
      });

      return {
        revisionId: revision.id,
        version: revision.version,
      };
    });

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao solicitar informações adicionais', details: String(error) }, { status: 500 });
  }
}

