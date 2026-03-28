'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from '@phosphor-icons/react';

interface ArticleFeedbackProps {
  articleId: string;
}

export function ArticleFeedback({ articleId }: ArticleFeedbackProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function sendFeedback(type: 'up' | 'down', message?: string) {
    try {
      await fetch('/api/help/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, type, comment: message || '' }),
      });
    } catch {
      // Falha de rede não impede a interação local.
    }
  }

  const handleChoice = async (type: 'up' | 'down') => {
    setFeedback(type);
    if (type === 'up') {
      await sendFeedback(type);
      setSubmitted(true);
    }
  };

  const submitNegativeFeedback = async () => {
    await sendFeedback('down', comment.trim());
    setSubmitted(true);
  };

  return (
    <section className="bg-light border rounded-4 p-4 mt-4">
      <p className="mb-3 fw-semibold">Este artigo foi útil?</p>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => handleChoice('up')}
          className={`btn btn-sm ${feedback === 'up' ? 'btn-success' : 'btn-outline-secondary'}`}
        >
          <span className="d-inline-flex align-items-center gap-1">
            <ThumbsUp size={16} />
            Sim
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleChoice('down')}
          className={`btn btn-sm ${feedback === 'down' ? 'btn-danger' : 'btn-outline-secondary'}`}
        >
          <span className="d-inline-flex align-items-center gap-1">
            <ThumbsDown size={16} />
            Não
          </span>
        </button>
      </div>

      {feedback === 'down' && !submitted ? (
        <div>
          <label htmlFor="feedback-comment" className="form-label small">
            Conte como podemos melhorar este conteúdo:
          </label>
          <textarea
            id="feedback-comment"
            className="form-control"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Ex.: faltou explicar como desconectar a integração."
          />
          <button type="button" onClick={submitNegativeFeedback} className="btn btn-primary btn-sm mt-2">
            Enviar feedback
          </button>
        </div>
      ) : null}

      {submitted ? <p className="small text-success mb-0">Obrigado! Seu feedback foi registrado.</p> : null}
    </section>
  );
}
