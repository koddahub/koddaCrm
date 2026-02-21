import { prisma } from '@/lib/prisma';

export const CLIENT_CLASS_STATUS = {
  ATIVO: 'ATIVO',
  ATRASADO: 'ATRASADO',
  INATIVO: 'INATIVO',
} as const;

export type ClientClassStatus = (typeof CLIENT_CLASS_STATUS)[keyof typeof CLIENT_CLASS_STATUS];

type HolidaySeed = {
  date: string;
  name: string;
};

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function brazilNationalHolidays(year: number): HolidaySeed[] {
  const easter = easterDate(year);
  const carnivalMonday = addDays(easter, -48);
  const carnivalTuesday = addDays(easter, -47);
  const goodFriday = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);

  return [
    { date: `${year}-01-01`, name: 'Confraternização Universal' },
    { date: formatDate(carnivalMonday), name: 'Carnaval (segunda-feira)' },
    { date: formatDate(carnivalTuesday), name: 'Carnaval (terça-feira)' },
    { date: formatDate(goodFriday), name: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, name: 'Tiradentes' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho' },
    { date: formatDate(corpusChristi), name: 'Corpus Christi' },
    { date: `${year}-09-07`, name: 'Independência do Brasil' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, name: 'Finados' },
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-11-20`, name: 'Dia da Consciência Negra' },
    { date: `${year}-12-25`, name: 'Natal' },
  ];
}

export async function ensureClientBillingInfra(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.client_billing_classification (
      deal_id uuid PRIMARY KEY REFERENCES crm.deal(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL,
      class_status varchar(20) NOT NULL CHECK (class_status IN ('ATIVO','ATRASADO','INATIVO')),
      days_late int NOT NULL DEFAULT 0,
      reference_due_date date NULL,
      last_payment_status varchar(40) NULL,
      last_payment_id uuid NULL,
      ticket_id uuid NULL,
      ticket_created_at timestamptz NULL,
      ghosted_at timestamptz NULL,
      ghost_reason text NULL,
      last_transition_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_class_status
      ON crm.client_billing_classification(class_status)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_org
      ON crm.client_billing_classification(organization_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted
      ON crm.client_billing_classification(ghosted_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
      holiday_date date PRIMARY KEY,
      name varchar(180) NOT NULL,
      scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const years = [2026, 2027, 2028, 2029, 2030];
  for (const year of years) {
    const holidays = brazilNationalHolidays(year);
    for (const holiday of holidays) {
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,
        holiday.date,
        holiday.name
      );
    }
  }
}
