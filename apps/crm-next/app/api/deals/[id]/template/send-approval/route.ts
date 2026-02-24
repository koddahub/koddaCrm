import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { ensureDealOperation } from '@/lib/deals';
import { prisma } from '@/lib/prisma';
import { buildPortalApprovalUrl } from '@/lib/site24h';
import {
  ensureSiteReleaseSchema,
  markApprovalSelection,
  normalizeReleaseVersion,
  normalizeVariantCode,
  parseReleaseVariantFromPath,
  resolveDealReleaseVariant,
  updateReleaseStatus,
  updateVariantStatus,
} from '@/lib/site24h-release';

class ApprovalSendError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function matchesReleaseVariant(projectPath: string, releaseVersion: number | null, variantCode: string) {
  const parsed = parseReleaseVariantFromPath(projectPath);
  const sameVariant = (parsed.variantCode || 'V1') === variantCode;
  const sameRelease = releaseVersion ? parsed.releaseVersion === releaseVersion : true;
  return sameVariant && sameRelease;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;
  await ensureSiteReleaseSchema();

  const body = await req.json().catch(() => ({}));
  const templateRevisionId = body.templateRevisionId ? String(body.templateRevisionId) : null;
  const expiresHours = Math.max(1, Number(body.expiresHours || 72));
  const variantInput = String(body.variantCode || '').trim();
  if (!variantInput) {
    return NextResponse.json({
      error: 'variantCode é obrigatório (V1|V2|V3).',
      error_code: 'VARIANT_REQUIRED',
    }, { status: 422 });
  }
  const variantCode = normalizeVariantCode(variantInput);
  const releaseVersion = normalizeReleaseVersion(body.releaseVersion);

  try {
    const result = await prisma.$transaction(async (tx) => {
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
          templateRevisions: {
            orderBy: { version: 'desc' },
            take: 80,
          },
        },
      });

      if (!deal) throw new ApprovalSendError('DEAL_NOT_FOUND', 'Deal não encontrado', 404);
      if (deal.dealType !== 'HOSPEDAGEM') {
        throw new ApprovalSendError('DEAL_NOT_HOSPEDAGEM', 'Envio de aprovação disponível somente para hospedagem');
      }
      if (deal.lifecycleStatus !== 'CLIENT') {
        throw new ApprovalSendError('DEAL_NOT_CLIENT', 'Deal precisa estar fechado para aprovação do cliente', 409);
      }

      const releaseVariant = await resolveDealReleaseVariant({
        dealId: deal.id,
        releaseVersion,
        variantCode,
      });
      if (!releaseVariant) {
        throw new ApprovalSendError('RELEASE_VARIANT_NOT_FOUND', 'Release/variante não encontrada para envio de aprovação.');
      }

      const revision = templateRevisionId
        ? await tx.dealTemplateRevision.findFirst({
            where: { id: templateRevisionId, dealId: deal.id },
          })
        : deal.templateRevisions.find((item) => matchesReleaseVariant(item.projectPath, releaseVariant.release.version, variantCode));

      if (!revision) {
        throw new ApprovalSendError('REVISION_NOT_FOUND', 'Nenhuma revisão de template disponível para a variante selecionada.');
      }

      if (!matchesReleaseVariant(revision.projectPath, releaseVariant.release.version, variantCode)) {
        throw new ApprovalSendError('REVISION_VARIANT_MISMATCH', 'A revisão selecionada não pertence à release/variante informada.');
      }

      await tx.dealClientApproval.updateMany({
        where: { dealId: deal.id, status: 'PENDING' },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date(),
        },
      });

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

      const approval = await tx.dealClientApproval.create({
        data: {
          dealId: deal.id,
          templateRevisionId: revision.id,
          tokenHash,
          expiresAt,
          status: 'PENDING',
        },
      });

      await tx.dealTemplateRevision.update({
        where: { id: revision.id },
        data: {
          status: 'SENT_CLIENT',
          updatedAt: new Date(),
        },
      });

      await ensureDealOperation(tx, { id: deal.id, dealType: deal.dealType }, 'aprovacao_cliente');

      const approvalLink = buildPortalApprovalUrl(rawToken);
      const emailTo = deal.contactEmail || deal.organization?.billingEmail;
      if (emailTo) {
        await tx.emailQueue.create({
          data: {
            organizationId: deal.organizationId || null,
            emailTo,
            subject: '[KoddaHub] Aprovação da versão do seu site',
            body: `Olá!\n\nSua versão do site está pronta para aprovação.\n\nAcesse o link abaixo e aprove ou solicite micro ajustes:\n${approvalLink}\n\nEste link expira em ${expiresHours}h.\n\nEquipe KoddaHub.`,
            status: 'PENDING',
          },
        });
      }

      await tx.dealActivity.create({
        data: {
          dealId: deal.id,
          activityType: 'CLIENT_APPROVAL_REQUESTED',
          content: `Link de aprovação enviado ao cliente para ${variantCode} (${`v${releaseVariant.release.version}`}).`,
          metadata: {
            approvalId: approval.id,
            templateRevisionId: revision.id,
            releaseId: releaseVariant.release.id,
            releaseVersion: releaseVariant.release.version,
            variantId: releaseVariant.variant.id,
            variantCode,
            expiresAt,
          },
          createdBy: 'ADMIN',
        },
      });

      return {
        approvalId: approval.id,
        approvalLink,
        expiresAt,
        releaseId: releaseVariant.release.id,
        releaseVersion: releaseVariant.release.version,
        variantId: releaseVariant.variant.id,
        variantCode,
        templateRevisionId: revision.id,
      };
    });

    await updateVariantStatus(result.variantId, 'SENT_CLIENT');
    await updateReleaseStatus(result.releaseId, 'IN_REVIEW');
    await markApprovalSelection({
      dealId: params.id,
      templateRevisionId: result.templateRevisionId,
      releaseVersion: result.releaseVersion,
      variantCode: result.variantCode as 'V1' | 'V2' | 'V3',
    });

    return NextResponse.json({
      ok: true,
      approvalId: result.approvalId,
      approvalLink: result.approvalLink,
      expiresAt: result.expiresAt,
      releaseVersion: result.releaseVersion,
      variantCode: result.variantCode,
    });
  } catch (error) {
    if (error instanceof ApprovalSendError) {
      return NextResponse.json({
        error: error.message,
        error_code: error.code,
      }, { status: error.status });
    }
    return NextResponse.json({
      error: 'Falha ao enviar aprovação ao cliente',
      error_code: 'SEND_APPROVAL_FAILED',
      details: String(error),
    }, { status: 500 });
  }
}
