import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { lifecycleByStageCode, resolvePipelineAndStages } from '@/lib/deals';
import { ensureIntegrationAuth } from '@/lib/integration-auth';
import { prisma } from '@/lib/prisma';

type IngestPayload = {
  project?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function parseOptionalCents(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function parseLimit(raw: string | null, fallback = 80) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(200, Math.round(value)));
}

async function ensureAuthorized(req: NextRequest) {
  const adminDenied = ensureApiAuth(req);
  if (!adminDenied) return null;
  return ensureIntegrationAuth(req);
}

export async function GET(req: NextRequest) {
  const denied = await ensureAuthorized(req);
  if (denied) return denied;

  const dealId = String(req.nextUrl.searchParams.get('dealId') || '').trim();
  const status = String(req.nextUrl.searchParams.get('status') || '').trim().toUpperCase();
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));

  const where: string[] = [];
  const binds: unknown[] = [];

  if (dealId) {
    binds.push(dealId);
    where.push(`t.deal_id = $${binds.length}::uuid`);
  }
  if (status) {
    binds.push(status);
    where.push(`t.status = $${binds.length}`);
  }

  binds.push(limit);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limitBind = `$${binds.length}`;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
      SELECT
        t.id::text AS id,
        t.deal_id::text AS deal_id,
        t.status,
        t.project_link,
        t.project_title,
        t.project_payload,
        t.analysis_payload,
        t.proposal_text,
        t.offer_amount_cents,
        t.final_offer_amount_cents,
        t.estimated_duration_text,
        t.details_text,
        t.review_notes,
        t.approved_by,
        t.approved_at,
        t.integration_execution_id,
        t.created_at,
        t.updated_at
      FROM crm.freelas_proposal_ticket t
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT ${limitBind}
    `,
    ...binds,
  );
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const denied = await ensureAuthorized(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({})) as IngestPayload;
  const project = (body.project && typeof body.project === 'object') ? body.project : {};
  const analysis = (body.analysis && typeof body.analysis === 'object') ? body.analysis : {};
  const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata : {};

  const projectLink = String(project.link || '').trim();
  const projectTitle = String(project.title || '').trim().slice(0, 300);
  const proposalText = String((analysis.proposal_text ?? analysis.proposalText) || '').trim();
  const executionId = String((metadata.execution_id ?? metadata.executionId) || '').trim() || null;

  if (!projectLink || !projectTitle || !proposalText) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes: project.link, project.title e analysis.proposal_text' },
      { status: 422 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (executionId) {
        const existingTicket = await tx.$queryRaw<Array<{ id: string; deal_id: string; status: string }>>`
          SELECT id::text, deal_id::text, status
          FROM crm.freelas_proposal_ticket
          WHERE project_link = ${projectLink}
            AND integration_execution_id = ${executionId}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (existingTicket.length > 0) {
          return {
            deduplicated: true,
            dealId: existingTicket[0].deal_id,
            ticketId: existingTicket[0].id,
            status: existingTicket[0].status,
          };
        }
      }

      const pipeline = await resolvePipelineAndStages('avulsos');
      const stage = pipeline.stages.find((item) => item.code === 'proposta_enviada') || pipeline.stages[0];
      const lifecycle = lifecycleByStageCode(stage.code);

      const existingDeal = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT d.id::text
        FROM crm.deal d
        WHERE d.pipeline_id = ${pipeline.id}::uuid
          AND d.origin = 'FREELAS_N8N'
          AND d.metadata->>'project_link' = ${projectLink}
        ORDER BY d.updated_at DESC
        LIMIT 1
      `;

      let dealId = existingDeal[0]?.id || null;
      const scoreNumber = Number(analysis.score);
      const offerCents = parseOptionalCents(analysis.offer_amount_cents);
      const finalOfferCents = parseOptionalCents(analysis.final_offer_amount_cents);
      const estimatedDuration = String(analysis.estimated_timeline || '').trim().slice(0, 120) || null;
      const detailsText = String(analysis.proposal_text || '').trim();

      if (dealId) {
        await tx.deal.update({
          where: { id: dealId },
          data: {
            stageId: stage.id,
            title: projectTitle,
            dealType: 'PROJETO_AVULSO',
            category: 'AVULSO',
            intent: 'projeto_avulso',
            origin: 'FREELAS_N8N',
            productCode: 'site_institucional',
            valueCents: Number.isFinite(scoreNumber) ? Math.max(0, Math.round(scoreNumber * 10000)) : null,
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            updatedAt: new Date(),
            metadata: {
              source: 'freelas_n8n',
              project_link: projectLink,
              execution_id: executionId,
              workflow_name: metadata.workflow_name || null,
              node_name: metadata.node_name || null,
              score: Number.isFinite(scoreNumber) ? scoreNumber : null,
            },
          },
        });
      } else {
        const positionIndex = await tx.deal.count({
          where: {
            pipelineId: pipeline.id,
            stageId: stage.id,
            lifecycleStatus: { not: 'CLIENT' },
          },
        });

        const deal = await tx.deal.create({
          data: {
            pipelineId: pipeline.id,
            stageId: stage.id,
            title: projectTitle,
            contactName: null,
            contactEmail: null,
            contactPhone: null,
            dealType: 'PROJETO_AVULSO',
            category: 'AVULSO',
            intent: 'projeto_avulso',
            origin: 'FREELAS_N8N',
            productCode: 'site_institucional',
            valueCents: Number.isFinite(scoreNumber) ? Math.max(0, Math.round(scoreNumber * 10000)) : null,
            positionIndex,
            lifecycleStatus: lifecycle.lifecycleStatus,
            isClosed: lifecycle.isClosed,
            closedAt: lifecycle.closedAt,
            metadata: {
              source: 'freelas_n8n',
              project_link: projectLink,
              execution_id: executionId,
              workflow_name: metadata.workflow_name || null,
              node_name: metadata.node_name || null,
              score: Number.isFinite(scoreNumber) ? scoreNumber : null,
            },
          },
        });

        dealId = deal.id;
      }

      const ticketRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        INSERT INTO crm.freelas_proposal_ticket (
          deal_id,
          status,
          project_link,
          project_title,
          project_payload,
          analysis_payload,
          proposal_text,
          offer_amount_cents,
          final_offer_amount_cents,
          estimated_duration_text,
          details_text,
          review_notes,
          integration_execution_id,
          created_at,
          updated_at
        )
        VALUES (
          ${dealId}::uuid,
          'NEW',
          ${projectLink},
          ${projectTitle},
          ${JSON.stringify(project)}::jsonb,
          ${JSON.stringify({ ...analysis, metadata })}::jsonb,
          ${proposalText},
          ${offerCents},
          ${finalOfferCents},
          ${estimatedDuration},
          ${detailsText},
          NULL,
          ${executionId},
          now(),
          now()
        )
        RETURNING id::text, status
      `;

      const ticketId = ticketRows[0].id;

      await tx.dealActivity.create({
        data: {
          dealId,
          activityType: 'FREELAS_TICKET_CREATED',
          content: `Ticket Freelas criado para revisão da proposta (${projectTitle}).`,
          metadata: {
            ticketId,
            projectLink,
            executionId,
            source: 'n8n',
          },
          createdBy: 'FREELAS_N8N',
        },
      });

      return { deduplicated: false, dealId, ticketId, status: ticketRows[0].status };
    });

    return NextResponse.json({ ok: true, ...result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Falha ao criar ticket Freelas', details: String(error) },
      { status: 500 },
    );
  }
}
