import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ service: 'crm-next', status: 'ok', time: new Date().toISOString() });
}
