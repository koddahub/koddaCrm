import { ensureApiAuth } from "@/lib/api-auth";
import { resolvePipelineAndStages } from "@/lib/deals";
import {
  inferCategory,
  inferDealType,
  normalizeIntent,
  normalizePhone,
  ORIGINS,
} from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

function dayBucket(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

// ✅ Função para adicionar headers CORS (já está correta)
const ALLOWED_ORIGINS = new Set([
  "https://koddahub.com.br",
  "https://www.koddahub.com.br",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5509",
  "http://127.0.0.1:5504",
  "http://localhost:5500",
  "http://localhost:5509",
  "http://localhost:5504",
]);

function addCorsHeaders(req: NextRequest, response: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// ✅ Handler OBRIGATÓRIO para OPTIONS (preflight)
export async function OPTIONS(req: NextRequest) {
  // Retorna 204 (No Content) com os headers CORS
  return addCorsHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return addCorsHeaders(req, denied);

  const mode = req.nextUrl.searchParams.get("mode");
  if (mode !== "list") {
    return addCorsHeaders(
      req,
      NextResponse.json({ error: "Modo inválido" }, { status: 400 }),
    );
  }

  const items = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    select: {
      id: true,
      source: true,
      name: true,
      email: true,
      phone: true,
      interest: true,
      stage: true,
      createdAt: true,
    },
  });

  return addCorsHeaders(req, NextResponse.json({ items }));
}

export async function POST(req: NextRequest) {
  // ⚠️ IMPORTANTE: Adicione addCorsHeaders a TODAS as respostas, inclusive as de erro.
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const phone = normalizePhone(body.phone ? String(body.phone) : null) || null;
  const rawAssunto = String(body.assunto || body.interest || "").trim();

  if (!name || (!email && !phone)) {
    // ✅ Resposta de erro com CORS
    return addCorsHeaders(
      req,
      NextResponse.json(
        { error: "name e contato são obrigatórios" },
        { status: 422 },
      ),
    );
  }

  const intent = normalizeIntent(String(body.intent || rawAssunto));
  const category = body.category
    ? String(body.category).toUpperCase()
    : inferCategory(intent);
  const dealType = inferDealType(category);
  const source = String(body.src || ORIGINS.SITE_FORM).toUpperCase();
  const now = new Date();
  const bucket = dayBucket(now);

  const dedupeBase = `${email || ""}|${phone || ""}|${intent}`;
  const pipelineType = category === "RECORRENTE" ? "hospedagem" : "avulsos";

  try {
    const pipeline = await resolvePipelineAndStages(pipelineType);
    const firstStage = pipeline.stages[0];

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          source: "site_form",
          sourceRef: source,
          name,
          email,
          phone,
          interest: rawAssunto || intent,
          payload: body,
          stage: "NOVO",
        },
      });

      await tx.leadDedupeKey.create({
        data: {
          source,
          dedupeKey: dedupeBase,
          leadId: lead.id,
          dayBucket: bucket,
        },
      });

      const stagePosition = await tx.deal.count({
        where: {
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          lifecycleStatus: { not: "CLIENT" },
        },
      });

      const deal = await tx.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          leadId: lead.id,
          title: `${name} - ${rawAssunto || intent}`,
          contactName: name,
          contactEmail: email,
          contactPhone: phone,
          dealType,
          category,
          intent,
          origin: source,
          planCode: intent.startsWith("hospedagem_")
            ? intent.replace("hospedagem_", "")
            : null,
          productCode: intent.startsWith("hospedagem_") ? null : intent,
          positionIndex: stagePosition,
          lifecycleStatus: "OPEN",
          isClosed: false,
          metadata: body,
        },
      });

      await tx.dealStageHistory.create({
        data: {
          dealId: deal.id,
          fromStageId: null,
          toStageId: firstStage.id,
          changedBy: "SYSTEM",
          reason: "Lead recebido do formulário do site",
        },
      });

      await tx.crmContactEvent.create({
        data: {
          leadId: lead.id,
          channel: "WEB_FORM",
          direction: "INBOUND",
          message: "Lead recebido via formulário do site",
          metadata: body,
        },
      });

      return { lead, deal };
    });

    // ✅ Resposta de sucesso com CORS
    return addCorsHeaders(
      req,
      NextResponse.json(
        { ok: true, leadId: result.lead.id, dealId: result.deal.id },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.leadDedupeKey.findFirst({
        where: { source, dedupeKey: dedupeBase, dayBucket: bucket },
        orderBy: { createdAt: "desc" },
      });
      // ✅ Resposta idempotente com CORS
      return addCorsHeaders(
        req,
        NextResponse.json({
          ok: true,
          idempotent: true,
          leadId: existing?.leadId || null,
        }),
      );
    }
    // ✅ Resposta de erro genérico com CORS
    return addCorsHeaders(
      req,
      NextResponse.json(
        { error: "Falha ao ingerir lead", details: String(error) },
        { status: 500 },
      ),
    );
  }
}
