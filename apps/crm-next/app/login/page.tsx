'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@koddahub.local');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error || 'Credenciais invalidas');
      return;
    }

    window.location.href = '/';
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <img src="/koddahub-logo-v2.png" alt="Ícone Kodda" className="login-brand-icon" />
          <div className="login-brand-text">
            <h1 aria-label="KoddaCRM">
              <span className="kodda">Kodda</span>
              <span className="crm">CRM</span>
            </h1>
            <p>Acesso compartilhado da operação.</p>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <div className="inline-error">{error}</div> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no KoddaCRM'}
          </button>
        </form>
      </section>
    </main>
  );
}
