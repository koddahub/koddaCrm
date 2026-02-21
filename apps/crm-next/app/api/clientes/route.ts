import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/api-auth';
import { CLIENT_CLASS_STATUS, ensureClientBillingInfra } from '@/lib/client-billing';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = ensureApiAuth(req);
  if (denied) return denied;

  await ensureClientBillingInfra();

  const statusParam = (req.nextUrl.searchParams.get('status') || CLIENT_CLASS_STATUS.ATIVO).toUpperCase();
  const search = (req.nextUrl.searchParams.get('search') || '').trim();
  const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
  const pageSizeRaw = Number.parseInt(req.nextUrl.searchParams.get('pageSize') || '10', 10) || 10;
  const pageSize = Math.max(1, Math.min(50, pageSizeRaw));
  const offset = (page - 1) * pageSize;

  const isGhost = statusParam === 'FANTASMA';
  const validStatuses = new Set(['ATIVO', 'ATRASADO', 'INATIVO', 'FANTASMA']);
  if (!validStatuses.has(statusParam)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 422 });
  }

  const params: Array<string | number> = [];
  const whereParts: string[] = [
    `d.deal_type = 'HOSPEDAGEM'`,
    `d.lifecycle_status = 'CLIENT'`,
  ];

  if (isGhost) {
    whereParts.push(`c.ghosted_at IS NOT NULL`);
  } else {
    params.push(statusParam);
    whereParts.push(`c.ghosted_at IS NULL`);
    whereParts.push(`coalesce(c.class_status, 'ATIVO') = $${params.length}`);
  }

  if (search !== '') {
    params.push(`%${search}%`);
    const searchBind = `$${params.length}`;
    whereParts.push(`
      (
        d.title ILIKE ${searchBind}
        OR coalesce(d.contact_name, '') ILIKE ${searchBind}
        OR coalesce(d.contact_email, '') ILIKE ${searchBind}
        OR coalesce(d.plan_code, '') ILIKE ${searchBind}
        OR coalesce(d.product_code, '') ILIKE ${searchBind}
      )
    `);
  }

  const whereSql = whereParts.join(' AND ');

  const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE ${whereSql}
    `,
    ...params
  );
  const total = totalRows[0]?.total ?? 0;

  params.push(pageSize);
  const limitBind = `$${params.length}`;
  params.push(offset);
  const offsetBind = `$${params.length}`;

  const items = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      contact_name: string | null;
      contact_email: string | null;
      deal_type: string;
      plan_code: string | null;
      product_code: string | null;
      value_cents: number | null;
      updated_at: Date;
      class_status: string | null;
      days_late: number | null;
      last_payment_status: string | null;
      reference_due_date: Date | null;
      next_due_date: Date | null;
      ghosted_at: Date | null;
      ticket_id: string | null;
      sla_deadline: Date | null;
    }>
  >(
    `
      SELECT
        d.id,
        d.title,
        d.contact_name,
        d.contact_email,
        d.deal_type,
        d.plan_code,
        d.product_code,
        d.value_cents,
        d.updated_at,
        coalesce(c.class_status, 'ATIVO') AS class_status,
        coalesce(c.days_late, 0) AS days_late,
        c.last_payment_status,
        c.reference_due_date,
        s.next_due_date,
        c.ghosted_at,
        c.ticket_id::text AS ticket_id,
        tq.sla_deadline
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      LEFT JOIN LATERAL (
        SELECT s1.next_due_date
        FROM client.subscriptions s1
        WHERE s1.organization_id = d.organization_id
        ORDER BY s1.created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT q.sla_deadline
        FROM crm.ticket_queue q
        WHERE q.ticket_id = c.ticket_id
        ORDER BY q.created_at DESC
        LIMIT 1
      ) tq ON true
      WHERE ${whereSql}
      ORDER BY
        coalesce(c.days_late, 0) DESC,
        d.updated_at DESC
      LIMIT ${limitBind} OFFSET ${offsetBind}
    `,
    ...params
  );

  const countsRows = await prisma.$queryRawUnsafe<Array<{ class_status: string; total: number }>>(
    `
      SELECT coalesce(c.class_status, 'ATIVO') AS class_status, COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type='HOSPEDAGEM'
        AND d.lifecycle_status='CLIENT'
        AND c.ghosted_at IS NULL
      GROUP BY 1
    `
  );
  const ghostRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type='HOSPEDAGEM'
        AND d.lifecycle_status='CLIENT'
        AND c.ghosted_at IS NOT NULL
    `
  );

  const counts = {
    ATIVO: 0,
    ATRASADO: 0,
    INATIVO: 0,
    FANTASMA: ghostRows[0]?.total ?? 0,
  };
  for (const row of countsRows) {
    if (row.class_status in counts) {
      counts[row.class_status as keyof typeof counts] = row.total;
    }
  }

  return NextResponse.json({
    status: statusParam,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      contactName: item.contact_name,
      contactEmail: item.contact_email,
      dealType: item.deal_type,
      planCode: item.plan_code,
      productCode: item.product_code,
      valueCents: item.value_cents,
      updatedAt: item.updated_at,
      classStatus: item.class_status ?? CLIENT_CLASS_STATUS.ATIVO,
      daysLate: item.days_late ?? 0,
      lastPaymentStatus: item.last_payment_status,
      referenceDueDate: item.reference_due_date,
      nextDueDate: item.next_due_date,
      ghostedAt: item.ghosted_at,
      ticketId: item.ticket_id,
      ticketSlaDeadline: item.sla_deadline,
    })),
  });
}
