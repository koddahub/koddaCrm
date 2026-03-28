import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { articleId, type, comment } = payload || {};

    if (!articleId || !type) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    // Endpoint inicial: pronto para integrar persistência futura.
    return NextResponse.json({
      success: true,
      articleId,
      type,
      comment: comment || '',
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível registrar feedback' }, { status: 500 });
  }
}
