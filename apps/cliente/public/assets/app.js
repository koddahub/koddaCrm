(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const state = { step: 1, maxStep: 4, paymentPollTimer: null, paymentDeadlineTimer: null, pendingExpired: false, cepResolved: false };
  const csrfToken = document.body?.dataset?.csrfToken || '';
  let pendingSid = null;
  let pendingSignupSessionId = null;
  let pendingPaymentUrl = null;
  let pendingUntilEpoch = null;
  let authPendingBlocked = false;
  let pendingModalDismissed = false;
  let authStatePrimaryAction = null;

  const onlyDigits = (v) => String(v || '').replace(/\D+/g, '');
  const formatPhone = (v) => {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const formatCpfCnpj = (v) => {
    const d = onlyDigits(v).slice(0, 14);
    if (d.length <= 11) {
      return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };
  const formatZip = (v) => {
    const d = onlyDigits(v).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  };
  const formatCardNumber = (v) => {
    const d = onlyDigits(v).slice(0, 19);
    return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };
  const detectCardBrand = (digits) => {
    const d = String(digits || '');
    if (/^4/.test(d)) return 'VISA';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'MASTERCARD';
    if (/^3[47]/.test(d)) return 'AMEX';
    if (/^(4011(78|79)|431274|438935|451416|457393|4576(31|32)|504175|627780|636297|636368)/.test(d)) return 'ELO';
    if (/^(606282|3841)/.test(d)) return 'HIPERCARD';
    return '';
  };
  const isLuhnValid = (digits) => {
    const d = String(digits || '');
    if (!/^\d{13,19}$/.test(d)) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = d.length - 1; i >= 0; i -= 1) {
      let n = Number(d[i]);
      if (shouldDouble) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };
  const parsePossiblyNoisyJson = (raw) => {
    const text = String(raw || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {}

    const tryBalanced = (openChar, closeChar) => {
      const start = text.indexOf(openChar);
      if (start < 0) return null;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === openChar) {
          depth += 1;
          continue;
        }
        if (ch === closeChar) {
          depth -= 1;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch (_) {
              return null;
            }
          }
        }
      }
      return null;
    };

    const balanced = tryBalanced('{', '}') || tryBalanced('[', ']');
    if (balanced) return balanced;

    const starts = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '{' || text[i] === '[') starts.push(i);
    }
    for (const start of starts) {
      const candidate = text.slice(start).trim();
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch (_) {}
    }
    return null;
  };

  function setFieldError(el, msg = '') {
    if (!el) return;
    el.style.borderColor = msg ? 'rgba(239,68,68,.9)' : 'rgba(255,255,255,.18)';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function isValidCpf(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(cpf[10]);
  }

  function isValidCnpj(cnpj) {
    if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
    const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(cnpj[i]) * w1[i];
    let r = sum % 11;
    const d1 = r < 2 ? 0 : 11 - r;
    if (d1 !== Number(cnpj[12])) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(cnpj[i]) * w2[i];
    r = sum % 11;
    const d2 = r < 2 ? 0 : 11 - r;
    return d2 === Number(cnpj[13]);
  }

  function showFlowOverlay(title, message) {
    const wrap = $('#authFlowOverlay');
    if (!wrap) return;
    $('#authFlowTitle').textContent = title || 'Redirecionando...';
    $('#authFlowMessage').textContent = message || 'Aguarde...';
    wrap.classList.remove('hidden');
  }

  function hideFlowOverlay() {
    $('#authFlowOverlay')?.classList.add('hidden');
  }

  function showStateModal({
    title,
    text,
    richHtml = '',
    countdown = null,
    showRetry = false,
    showCheck = false,
    showClose = false,
    showPrimary = false,
    primaryLabel = 'Continuar',
    onPrimary = null,
    loading = false
  }) {
    const modal = $('#authStateModal');
    if (!modal) return;
    $('#authStateTitle').textContent = title || 'Aviso';
    $('#authStateText').textContent = text || '';
    const rich = $('#authStateRich');
    if (rich) {
      if (richHtml) {
        rich.innerHTML = richHtml;
        rich.classList.remove('hidden');
      } else {
        rich.innerHTML = '';
        rich.classList.add('hidden');
      }
    }
    $('#authStateSpinner')?.classList.toggle('hidden', !loading);
    const cd = $('#authStateCountdown');
    if (cd) {
      if (countdown) {
        cd.textContent = countdown;
        cd.classList.remove('hidden');
      } else {
        cd.classList.add('hidden');
      }
    }
    $('#authStateRetryBtn')?.classList.toggle('hidden', !showRetry);
    $('#authStateCheckBtn')?.classList.toggle('hidden', !showCheck);
    const primaryBtn = $('#authStatePrimaryBtn');
    if (primaryBtn) {
      primaryBtn.textContent = primaryLabel || 'Continuar';
      primaryBtn.classList.toggle('hidden', !showPrimary);
    }
    authStatePrimaryAction = typeof onPrimary === 'function' ? onPrimary : null;
    $('#authStateCloseBtn')?.classList.toggle('hidden', !showClose);
    modal.classList.remove('hidden');
  }

  function hideStateModal() {
    $('#authStateModal')?.classList.add('hidden');
    $('#authStateSpinner')?.classList.add('hidden');
    $('#authStateRich')?.classList.add('hidden');
    authStatePrimaryAction = null;
    if (pendingSid || pendingSignupSessionId) {
      pendingModalDismissed = true;
    }
  }

  function setAuthPendingBlocked(blocked) {
    authPendingBlocked = !!blocked;
  }

  async function checkPendingByIdentity({ email = '', cpfCnpj = '' } = {}) {
    const payload = {
      email: String(email || '').trim(),
      cpf_cnpj: String(cpfCnpj || '').trim(),
    };
    if (!payload.email && !payload.cpf_cnpj) return null;
    try {
      const res = await apiFetch('/api/auth/pending-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return null;
      if (data?.has_pending && (data?.sid || data?.signup_session_id)) {
        return data;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    if (!headers.has('X-Request-Id')) {
      headers.set('X-Request-Id', generateRequestId());
    }
    return fetch(url, { credentials: 'same-origin', ...options, headers });
  }

  function generateRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    const spinner = button.querySelector('.spinner-border');
    const label = button.querySelector('.btn-label');
    if (isLoading) {
      button.setAttribute('disabled', 'disabled');
      spinner?.classList.remove('d-none');
      label?.setAttribute('aria-hidden', 'true');
      return;
    }
    button.removeAttribute('disabled');
    spinner?.classList.add('d-none');
    label?.removeAttribute('aria-hidden');
  }

  function setInlineAlert(container, type, message) {
    if (!container) return;
    if (!message) {
      container.textContent = '';
      container.classList.add('d-none');
      container.classList.remove('alert-success', 'alert-danger', 'alert-warning', 'alert-info');
      return;
    }
    const mapped = type === 'success'
      ? 'alert-success'
      : (type === 'warning' ? 'alert-warning' : (type === 'info' ? 'alert-info' : 'alert-danger'));
    container.textContent = String(message || '');
    container.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning', 'alert-info');
    container.classList.add(mapped);
  }

  function normalizeProtocol(data = {}) {
    const actionId = String(data?.action_id || '').trim();
    const requestId = String(data?.request_id || '').trim();
    if (!actionId && !requestId) return null;
    return { actionId, requestId };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderProtocol(container, protocol, title = 'Protocolo da solicitação') {
    if (!container) return;
    if (!protocol) {
      container.classList.add('d-none');
      container.innerHTML = '';
      return;
    }
    const actionId = protocol.actionId || '-';
    const requestId = protocol.requestId || '-';
    container.innerHTML = `
      <div class="portal-protocol-head">${escapeHtml(title)}</div>
      <div class="portal-protocol-row"><span>action_id</span><code>${escapeHtml(actionId)}</code><button type="button" class="btn btn-outline-secondary btn-sm" data-copy-value="${escapeHtml(actionId)}" ${actionId === '-' ? 'disabled' : ''}>Copiar</button></div>
      <div class="portal-protocol-row"><span>request_id</span><code>${escapeHtml(requestId)}</code><button type="button" class="btn btn-outline-secondary btn-sm" data-copy-value="${escapeHtml(requestId)}" ${requestId === '-' ? 'disabled' : ''}>Copiar</button></div>
    `;
    container.classList.remove('d-none');
  }

  function showToast(type, title, message) {
    const host = $('#portalToastContainer');
    if (!host) return;
    const colorClass = type === 'success'
      ? 'text-bg-success'
      : (type === 'warning' ? 'text-bg-warning' : (type === 'info' ? 'text-bg-info' : 'text-bg-danger'));
    const toast = document.createElement('div');
    toast.className = `toast align-items-center border-0 ${colorClass} show`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <strong class="me-2">${escapeHtml(title || 'Aviso')}</strong>${escapeHtml(message || '')}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button>
      </div>
    `;
    const closeBtn = $('.btn-close', toast);
    closeBtn?.addEventListener('click', () => toast.remove());
    host.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 200);
    }, 5200);
  }

  async function copyText(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  function setNotice(message, type = 'err') {
    const notice = $('#authInlineNotice');
    if (!notice) return;
    notice.textContent = String(message || '');
    notice.classList.remove('hidden', 'ok', 'err');
    notice.classList.add(type === 'ok' ? 'ok' : 'err');
  }

  function clearNotice() {
    const notice = $('#authInlineNotice');
    if (!notice) return;
    notice.textContent = '';
    notice.classList.add('hidden');
    notice.classList.remove('ok', 'err');
  }

  function getTurnstileToken(formEl) {
    return (formEl?.querySelector('[name="cf-turnstile-response"]')?.value || '').trim();
  }

  function setTab(tab) {
    clearNotice();
    if (!$('.tab-login') || !$('.tab-signup')) return;
    $$('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('.tab-login').classList.toggle('hidden', tab !== 'login');
    $('.tab-signup').classList.toggle('hidden', tab !== 'signup');
  }

  function setStep(step) {
    if (!$$('.wizard-step').length) return;
    state.step = Math.max(1, Math.min(state.maxStep, step));
    $$('.wizard-step').forEach((el) => el.classList.add('hidden'));
    const current = $(`.wizard-step[data-step='${state.step}']`);
    if (current) current.classList.remove('hidden');

    const bars = $$('.step');
    bars.forEach((bar, i) => bar.classList.toggle('active', i < state.step));
    const label = $('.step-label');
    if (label) label.textContent = `Etapa ${state.step} de ${state.maxStep}`;

    const prev = $('#wizardPrev');
    const next = $('#wizardNext');
    const submit = $('#wizardSubmit');
    if (prev) prev.disabled = state.step === 1;
    if (next) next.classList.toggle('hidden', state.step === state.maxStep);
    if (submit) submit.classList.toggle('hidden', state.step !== state.maxStep);
  }

  async function runSignupStepPrecheck(step) {
    if (![1, 3].includes(Number(step))) return true;
    const payload = { step: Number(step) };
    if (Number(step) === 1) {
      payload.cpf_cnpj = ($('#cpf_cnpj')?.value || '').trim();
      payload.phone = ($('#phone')?.value || '').trim();
    } else if (Number(step) === 3) {
      payload.email = ($('#signup_email')?.value || '').trim();
      payload.lgpd = !!($('#signupForm input[name="lgpd"]')?.checked);
      payload.turnstile_token = getTurnstileToken($('#signupForm'));
    }
    try {
      const res = await apiFetch('/api/auth/signup-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.can_proceed === false) {
        const msg = data?.error || 'Não foi possível validar esta etapa. Tente novamente.';
        setNotice(msg);
        const fieldName = String(data?.field || '');
        const fieldMap = {
          cpf_cnpj: '#cpf_cnpj',
          phone: '#phone',
          email: '#signup_email',
          lgpd: '#signupForm input[name=\"lgpd\"]',
          turnstile: '.cf-turnstile',
        };
        const target = $(fieldMap[fieldName] || '');
        if (target && typeof target.focus === 'function') target.focus();
        return false;
      }
      return true;
    } catch (_) {
      setNotice('Falha ao validar etapa no servidor. Tente novamente em instantes.');
      return false;
    }
  }

  async function validateStep(step) {
    const block = $(`.wizard-step[data-step='${step}']`);
    if (!block) return true;

    const required = $$('[data-required="true"]', block);
    for (const field of required) {
      const isCheckbox = (field.type || '').toLowerCase() === 'checkbox';
      const empty = isCheckbox ? !field.checked : (!field.value || !String(field.value).trim());
      if (empty) {
        const labelText = field.id ? (block.querySelector(`label[for='${field.id}']`)?.textContent || 'campo obrigatório') : 'campo obrigatório';
        setNotice(`Preencha o campo "${labelText.trim()}" para continuar.`);
        field.focus();
        return false;
      }
    }

    if (step === 3) {
      const pass = $('#signup_password')?.value || '';
      const pass2 = $('#signup_password_confirm')?.value || '';
      if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass) || pass !== pass2) {
        setNotice('Senha deve ter no mínimo 8 caracteres, com letras e números, e confirmação igual.');
        return false;
      }
      if (!$('#signupForm input[name="lgpd"]')?.checked) {
        setNotice('Aceite os termos LGPD para continuar.');
        return false;
      }
      if (!getTurnstileToken($('#signupForm'))) {
        setNotice('CAPTCHA inválido, tente novamente.');
        return false;
      }
    }

    if (step === 1) {
      const docEl = $('#cpf_cnpj');
      const doc = onlyDigits(docEl?.value || '');
      const personType = $('#person_type')?.value || 'PF';
      const valid = personType === 'PJ' ? isValidCnpj(doc) : isValidCpf(doc);
      if (!valid) {
        setFieldError(docEl, 'invalid');
        setNotice('CPF/CNPJ inválido para o tipo selecionado.');
        docEl?.focus();
        return false;
      }
      setFieldError(docEl);
    }

    if (step === 2) {
      const zip = onlyDigits($('#billing_zip')?.value || '');
      if (zip.length !== 8) {
        setNotice('Informe um CEP válido.');
        $('#billing_zip')?.focus();
        return false;
      }
      if (!state.cepResolved) {
        setNotice('Preencha um CEP válido para buscar o endereço automaticamente.');
        $('#billing_zip')?.focus();
        return false;
      }
      const requiredAddress = ['#billing_street', '#billing_district', '#billing_city', '#billing_state'];
      for (const selector of requiredAddress) {
        const input = $(selector);
        if (!input || !String(input.value || '').trim()) {
          setNotice('Endereço não foi carregado pelo CEP. Revise o CEP e tente novamente.');
          $('#billing_zip')?.focus();
          return false;
        }
      }
    }

    if (step === 4) {
      const cardNumber = onlyDigits($('#card_number')?.value || '');
      const expMonth = Number(onlyDigits($('#card_expiry_month')?.value || '0'));
      const expYear = Number(onlyDigits($('#card_expiry_year')?.value || '0'));
      const ccv = onlyDigits($('#card_ccv')?.value || '');
      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth() + 1;
      if (cardNumber.length < 13 || cardNumber.length > 19) {
        setNotice('Número do cartão inválido.');
        $('#card_number')?.focus();
        return false;
      }
      if (!isLuhnValid(cardNumber)) {
        setNotice('Número do cartão inválido. Revise os dígitos e tente novamente.');
        $('#card_number')?.focus();
        return false;
      }
      if (expMonth < 1 || expMonth > 12) {
        setNotice('Mês de validade inválido.');
        $('#card_expiry_month')?.focus();
        return false;
      }
      if (expYear < nowYear || expYear > nowYear + 20 || (expYear === nowYear && expMonth < nowMonth)) {
        setNotice('Validade do cartão inválida.');
        $('#card_expiry_year')?.focus();
        return false;
      }
      if (ccv.length < 3 || ccv.length > 4) {
        setNotice('CVV inválido.');
        $('#card_ccv')?.focus();
        return false;
      }
    }

    return await runSignupStepPrecheck(step);
  }

  async function tryResolveCep() {
    const zipEl = $('#billing_zip');
    if (!zipEl) return;
    const zip = onlyDigits(zipEl.value);
    if (zip.length !== 8) {
      state.cepResolved = false;
      return;
    }
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      const data = await resp.json();
      if (!resp.ok || data?.erro) {
        state.cepResolved = false;
        ['#billing_street', '#billing_district', '#billing_city', '#billing_state'].forEach((selector) => {
          const field = $(selector);
          if (field) field.value = '';
        });
        showStateModal({
          title: 'CEP não encontrado',
          text: 'Não foi possível carregar o endereço pelo CEP. Revise o CEP informado para continuar.',
          showClose: true,
        });
        return;
      }
      if ($('#billing_street')) $('#billing_street').value = data.logradouro || '';
      if ($('#billing_district')) $('#billing_district').value = data.bairro || '';
      if ($('#billing_city')) $('#billing_city').value = data.localidade || '';
      if ($('#billing_state')) $('#billing_state').value = String(data.uf || '').toUpperCase();
      state.cepResolved = true;
    } catch (err) {
      state.cepResolved = false;
      ['#billing_street', '#billing_district', '#billing_city', '#billing_state'].forEach((selector) => {
        const field = $(selector);
        if (field) field.value = '';
      });
      showStateModal({
        title: 'Falha ao consultar CEP',
        text: 'Não conseguimos consultar o CEP agora. Tente novamente em alguns instantes.',
        showClose: true,
      });
    }
  }

  function clearPendingTimers() {
    if (state.paymentPollTimer) clearInterval(state.paymentPollTimer);
    if (state.paymentDeadlineTimer) clearInterval(state.paymentDeadlineTimer);
    state.paymentPollTimer = null;
    state.paymentDeadlineTimer = null;
  }

  function openPaymentTab(url) {
    if (!url) return false;
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    return !!tab;
  }

  function showWelcomeConfirmedModal() {
    showStateModal({
      title: 'Bem-vindo(a) à KoddaHub!',
      text: 'Pagamento confirmado e acesso liberado.',
      richHtml: `
        <ul>
          <li>Pagamento confirmado com sucesso</li>
          <li>Cadastro liberado na área do cliente</li>
          <li>Próximo passo: preencher o briefing do seu site</li>
        </ul>
      `,
      showPrimary: true,
      primaryLabel: 'Seguir para login',
      onPrimary: () => {
        hideStateModal();
        $('#login_email')?.focus();
      },
      showClose: true,
      loading: false,
    });
  }

  async function verifyPendingPaymentNow(showFeedback = false) {
    if (!pendingSid && !pendingSignupSessionId) return false;
    try {
      if (pendingSignupSessionId) {
        const resSession = await apiFetch('/api/auth/signup-session/' + encodeURIComponent(String(pendingSignupSessionId)) + '/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const sessionData = await resSession.json();
        if (resSession.ok) {
          if (sessionData?.sid && !pendingSid) pendingSid = String(sessionData.sid);
          if (sessionData?.payment_redirect_url && !pendingPaymentUrl) pendingPaymentUrl = String(sessionData.payment_redirect_url);
          if (sessionData?.ready) {
            clearPendingTimers();
            setAuthPendingBlocked(false);
            pendingSid = null;
            pendingSignupSessionId = null;
            pendingModalDismissed = false;
            setTimeout(() => {
              window.location.href = '/login?payment=confirmed';
            }, 1100);
            return true;
          }
          if (!pendingModalDismissed || showFeedback) {
            showStateModal({
              title: 'Aguardando pagamento',
              text: sessionData?.payment_confirmed
                ? 'Pagamento confirmado no ASAAS. Estamos sincronizando seu cadastro no CRM para liberar o login.'
                : 'Finalize a cobrança no ASAAS para liberar seu login.',
              showRetry: true,
              showCheck: false,
              showClose: true,
              loading: true,
            });
          }
          return false;
        }
      }

      if (!pendingSid) return false;
      const res = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(String(pendingSid)) + '/status');
      const data = await res.json();
      if (!res.ok) return false;
      if (data?.can_login) {
        clearPendingTimers();
        setAuthPendingBlocked(false);
        pendingSid = null;
        pendingSignupSessionId = null;
        pendingModalDismissed = false;
        setTimeout(() => {
          window.location.href = '/login?payment=confirmed';
        }, 1300);
        return true;
      }
      if (showFeedback) {
        showStateModal({
          title: 'Aguardando pagamento',
          text: 'Ainda estamos aguardando o ASAAS confirmar o pagamento.',
          showRetry: true,
          showCheck: false,
          showClose: true,
          loading: true,
        });
      }
    } catch (_) {}
    return false;
  }

  function startPendingFlow(sid, pendingUntilIso = null, paymentUrl = null, signupSessionId = null) {
    if (!sid && !signupSessionId) return;
    pendingSid = sid || null;
    pendingSignupSessionId = signupSessionId || null;
    pendingPaymentUrl = paymentUrl || null;
    setAuthPendingBlocked(true);
    pendingModalDismissed = false;
    state.pendingExpired = false;
    pendingUntilEpoch = pendingUntilIso ? Date.parse(pendingUntilIso) : (Date.now() + 15 * 60 * 1000);
    showStateModal({
      title: 'Aguardando pagamento',
      text: 'Estamos aguardando confirmação do ASAAS para liberar seu acesso.',
      showRetry: true,
      showCheck: false,
      showClose: true,
      loading: true,
    });

    const updateCountdown = () => {
      const remainMs = Math.max(0, pendingUntilEpoch - Date.now());
      const mins = String(Math.floor(remainMs / 60000)).padStart(2, '0');
      const secs = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
      const label = `Tempo restante: ${mins}:${secs}`;
      const countdownEl = $('#authStateCountdown');
      if (countdownEl) {
        countdownEl.classList.remove('hidden');
        countdownEl.textContent = label;
      }
      if (remainMs <= 0) {
        if (state.pendingExpired) return;
        state.pendingExpired = true;
        if (state.paymentDeadlineTimer) {
          clearInterval(state.paymentDeadlineTimer);
          state.paymentDeadlineTimer = null;
        }
        showStateModal({
          title: 'Falha ao completar transação',
          text: 'Pagamento não confirmado em 15 minutos. Reabra o link e conclua a cobrança para liberar o acesso.',
          showRetry: true,
          showCheck: false,
          showClose: true,
          loading: false,
        });
      }
    };

    const pollStatus = async () => verifyPendingPaymentNow(false);

    clearPendingTimers();
    updateCountdown();
    pollStatus();
    state.paymentDeadlineTimer = setInterval(updateCountdown, 1000);
    state.paymentPollTimer = setInterval(pollStatus, 10000);
  }

  async function loginSubmit(e) {
    e.preventDefault();
    clearNotice();
    if (!getTurnstileToken($('#loginForm'))) {
      setNotice('CAPTCHA inválido, tente novamente.');
      return;
    }
    const body = Object.fromEntries(new FormData(e.target).entries());
    const res = await apiFetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice((data.error || 'Falha no login') + (data.action_hint ? ` ${data.action_hint}` : ''));
      return;
    }
    location.href = data.redirect || '/portal/dashboard';
  }

  async function signupSubmit(e) {
    e.preventDefault();
    if (e.target.dataset.submitting === '1') return;
    clearNotice();
    hideStateModal();
    for (let i = 1; i <= state.maxStep; i++) {
      if (!(await validateStep(i))) { setStep(i); return; }
    }
    e.target.dataset.submitting = '1';
    $('#wizardSubmit')?.setAttribute('disabled', 'disabled');
    showFlowOverlay('Ativando assinatura no cartão...', 'Estamos tokenizando o cartão e criando sua assinatura recorrente no Asaas.');
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const pendingCheck = await checkPendingByIdentity({
      email: String(body.email || body.billing_email || '').trim(),
      cpfCnpj: String(body.cpf_cnpj || '').trim(),
    });
    if (pendingCheck?.sid || pendingCheck?.signup_session_id) {
      hideFlowOverlay();
      startPendingFlow(
        pendingCheck?.sid ? String(pendingCheck.sid) : null,
        pendingCheck.pending_until || null,
        pendingCheck.payment_redirect_url || null,
        pendingCheck?.signup_session_id ? String(pendingCheck.signup_session_id) : null
      );
      return;
    }

    try {
      const res = await apiFetch('/api/auth/register-contract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const raw = await res.text();
      const data = parsePossiblyNoisyJson(raw) || { error: 'Resposta inesperada da API de cadastro/pagamento.' };
      if (!res.ok) {
        if (data?.asaas_subscription_id && data?.payment_redirect_url) {
          hideFlowOverlay();
          const sid = String(data.asaas_subscription_id);
          const ssid = data?.signup_session_id ? String(data.signup_session_id) : '';
          openPaymentTab(data.payment_redirect_url);
          startPendingFlow(sid, data.pending_until || null, data.payment_redirect_url, ssid || null);
          return;
        }
        hideFlowOverlay();
        let message = data.error || 'Falha no cadastro';
        if (data.action_hint) {
          message += ` ${String(data.action_hint)}`;
        }
        if (data.gateway_message) {
          message += ` (${data.gateway_message})`;
        }
        if (data.details && typeof data.details === 'object') {
          const firstDetail = Object.values(data.details)[0];
          if (firstDetail) message = String(firstDetail);
        }
        showStateModal({
          title: 'Não foi possível ativar a assinatura',
          text: message,
          showClose: true,
        });
        return;
      }

      hideFlowOverlay();
      window.location.href = `/portal/dashboard?new=1&subscription_id=${encodeURIComponent(data.subscription_id || '')}`;
    } catch (err) {
      hideFlowOverlay();
      showStateModal({
        title: 'Falha de comunicação',
        text: 'Não foi possível completar o cadastro agora. Tente novamente em alguns segundos.',
        showClose: true,
      });
    } finally {
      e.target.dataset.submitting = '0';
      $('#wizardSubmit')?.removeAttribute('disabled');
    }
  }

  function initAuthInputEnhancements() {
    const phone = $('#phone');
    const doc = $('#cpf_cnpj');
    const zip = $('#billing_zip');
    const stateUf = $('#billing_state');
    const street = $('#billing_street');
    const district = $('#billing_district');
    const city = $('#billing_city');

    phone?.addEventListener('input', () => { phone.value = formatPhone(phone.value); });
    doc?.addEventListener('input', () => { doc.value = formatCpfCnpj(doc.value); });
    const signupCardNumber = $('#card_number');
    const signupCardHolder = $('#card_holder_name');
    signupCardNumber?.addEventListener('input', () => {
      signupCardNumber.value = formatCardNumber(signupCardNumber.value);
      refreshSignupCardPreview();
    });
    signupCardHolder?.addEventListener('input', refreshSignupCardPreview);
    const signupCardExpMonth = $('#card_expiry_month');
    signupCardExpMonth?.addEventListener('input', () => {
      signupCardExpMonth.value = onlyDigits(signupCardExpMonth.value).slice(0, 2);
      refreshSignupCardPreview();
    });
    const signupCardExpYear = $('#card_expiry_year');
    signupCardExpYear?.addEventListener('input', () => {
      signupCardExpYear.value = onlyDigits(signupCardExpYear.value).slice(0, 4);
      refreshSignupCardPreview();
    });
    const signupCardCcv = $('#card_ccv');
    signupCardCcv?.addEventListener('input', () => {
      signupCardCcv.value = onlyDigits(signupCardCcv.value).slice(0, 4);
    });
    zip?.addEventListener('input', () => {
      zip.value = formatZip(zip.value);
      state.cepResolved = false;
      if (onlyDigits(zip.value).length < 8) {
        if (street) street.value = '';
        if (district) district.value = '';
        if (city) city.value = '';
        if (stateUf) stateUf.value = '';
      }
    });
    zip?.addEventListener('blur', tryResolveCep);
    [street, district, city, stateUf].forEach((el) => {
      if (el) el.setAttribute('readonly', 'readonly');
    });

    doc?.addEventListener('blur', () => {
      const personType = $('#person_type')?.value || 'PF';
      const digits = onlyDigits(doc.value);
      const valid = personType === 'PJ' ? isValidCnpj(digits) : isValidCpf(digits);
      setFieldError(doc, valid ? '' : 'invalid');
      if (!valid) setNotice('CPF/CNPJ inválido para o tipo selecionado.');
    });
    refreshSignupCardPreview();
  }

  function refreshSignupCardPreview() {
    const numberEl = $('#card_number');
    const holderEl = $('#card_holder_name');
    const monthEl = $('#card_expiry_month');
    const yearEl = $('#card_expiry_year');
    const previewNumber = $('#card_preview_number');
    const previewHolder = $('#card_preview_holder');
    const previewExpiry = $('#card_preview_expiry');
    const previewBrand = $('#card_brand_chip');
    const previewCard = $('#signupCardPreview');
    if (!numberEl || !previewNumber || !previewHolder || !previewExpiry || !previewBrand || !previewCard) return;

    const digits = onlyDigits(numberEl.value);
    const formatted = formatCardNumber(digits);
    const brand = detectCardBrand(digits);
    const holder = String(holderEl?.value || '').trim().toUpperCase();
    const mm = onlyDigits(monthEl?.value || '').slice(0, 2);
    const yyyy = onlyDigits(yearEl?.value || '').slice(0, 4);

    previewNumber.textContent = formatted || '•••• •••• •••• ••••';
    previewHolder.textContent = holder || 'NOME DO TITULAR';
    previewExpiry.textContent = (mm && yyyy) ? `${mm}/${yyyy}` : 'MM/AAAA';
    previewBrand.textContent = brand || 'Bandeira não identificada';
    previewCard.classList.toggle('brand-known', !!brand);
  }

  function initAuthKeyBehavior() {
    const signupForm = $('#signupForm');
    signupForm?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'BUTTON') return;
      if (target.id === 'billing_zip') {
        e.preventDefault();
        tryResolveCep();
        target.blur();
        return;
      }
      e.preventDefault();
      target.blur();
    });

    const loginForm = $('#loginForm');
    loginForm?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'BUTTON') return;
      e.preventDefault();
      target.blur();
    });
  }

  function mount() {
    applyRealtimeValidation();
    initAuthInputEnhancements();

    if (document.body.dataset.page === 'dashboard') {
      initDashboard();
      return;
    }

    $$('.tabbtn').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

    $('#wizardPrev')?.addEventListener('click', () => setStep(state.step - 1));
    $('#wizardNext')?.addEventListener('click', async () => {
      if (!(await validateStep(state.step))) return;
      setStep(state.step + 1);
    });

    $('#authStateCloseBtn')?.addEventListener('click', hideStateModal);
    $('#authStatePrimaryBtn')?.addEventListener('click', () => {
      if (typeof authStatePrimaryAction === 'function') {
        authStatePrimaryAction();
      }
    });
    $('#authStateRetryBtn')?.addEventListener('click', async () => {
      if (pendingPaymentUrl) {
        openPaymentTab(pendingPaymentUrl);
        return;
      }
      if (!pendingSid) {
        return;
      }
      try {
        const retry = await apiFetch('/api/billing/subscriptions/' + encodeURIComponent(String(pendingSid)) + '/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const retryData = await retry.json();
        if (retry.ok && retryData?.payment_redirect_url) {
          pendingPaymentUrl = String(retryData.payment_redirect_url);
          openPaymentTab(pendingPaymentUrl);
          return;
        }
      } catch (_) {}
      showStateModal({
        title: 'Link indisponível no momento',
        text: 'Não foi possível recuperar o link de pagamento agora. Tente novamente em instantes.',
        showRetry: true,
        showClose: true,
        loading: false,
      });
    });
    ['#login_email', '#billing_email', '#cpf_cnpj'].forEach((selector) => {
      const el = $(selector);
      el?.addEventListener('blur', async () => {
        const pendingCheck = await checkPendingByIdentity({
          email: ($('#login_email')?.value || $('#billing_email')?.value || '').trim(),
          cpfCnpj: ($('#cpf_cnpj')?.value || '').trim(),
        });
        if (pendingCheck?.sid || pendingCheck?.signup_session_id) {
          startPendingFlow(
            pendingCheck?.sid ? String(pendingCheck.sid) : null,
            pendingCheck.pending_until || null,
            pendingCheck.payment_redirect_url || null,
            pendingCheck?.signup_session_id ? String(pendingCheck.signup_session_id) : null
          );
        }
      });
    });

    $('#loginForm')?.addEventListener('submit', loginSubmit);
    $('#signupForm')?.addEventListener('submit', signupSubmit);

    const personType = $('#person_type');
    const trade = $('#trade_name_col');
    personType?.addEventListener('change', () => {
      const pj = personType.value === 'PJ';
      trade?.classList.toggle('hidden', !pj);
    });

    $$('.select-plan-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = btn.dataset.plan || 'basic';
        const select = $('#plan_code');
        if (select) select.value = plan;
        setTab('signup');
        setStep(1);
        setNotice(`Plano ${plan.toUpperCase()} pré-selecionado. Complete o cadastro e confirme o cartão para ativar sua assinatura.`, 'ok');
        $('#person_type')?.focus();
      });
    });

    $('#planPreviewToggle')?.addEventListener('click', () => {
      const wrap = $('.plan-preview-wrap');
      if (!wrap) return;
      wrap.classList.toggle('open');
      const open = wrap.classList.contains('open');
      const toggleBtn = $('#planPreviewToggle');
      if (toggleBtn) toggleBtn.textContent = open ? 'Ocultar planos' : 'Ver planos';
    });

    const qp = new URLSearchParams(window.location.search || '');
    const requestedTab = (qp.get('tab') || '').trim().toLowerCase();
    const requestedPlan = (qp.get('plan') || '').trim().toLowerCase();
    const requestedSource = (qp.get('source') || '').trim().toLowerCase();
    const requestedDeal = (qp.get('deal') || '').trim();
    const initialTab = requestedTab === 'signup' ? 'signup' : 'login';

    setTab(initialTab);
    setStep(1);
    initAuthKeyBehavior();

    if (requestedPlan && ['basic', 'profissional', 'pro'].includes(requestedPlan)) {
      const select = $('#plan_code');
      if (select) select.value = requestedPlan;
      if (initialTab === 'signup') {
        const sourceSuffix = requestedSource === 'crm_proposal' ? ' via proposta' : '';
        const dealSuffix = requestedDeal ? ` (deal ${requestedDeal})` : '';
        setNotice(`Plano ${requestedPlan.toUpperCase()} pré-selecionado${sourceSuffix}${dealSuffix}. Complete o cadastro para ativar.`, 'ok');
      }
    }

    const sidParam = (qp.get('sid') || '').trim();
    const ssidParam = (qp.get('ssid') || '').trim();
    const paymentState = (qp.get('payment') || '').trim();
    if (paymentState === 'pending' && (sidParam || ssidParam)) {
      startPendingFlow(sidParam || null, null, null, ssidParam || null);
    } else if (paymentState === 'confirmed') {
      setAuthPendingBlocked(false);
      pendingSid = null;
      pendingSignupSessionId = null;
      showWelcomeConfirmedModal();
      clearPaymentQueryParams();
    }
  }

  function clearPaymentQueryParams() {
    try {
      const url = new URL(window.location.href);
      const hasPaymentParams =
        url.searchParams.has('payment')
        || url.searchParams.has('sid')
        || url.searchParams.has('ssid');
      if (!hasPaymentParams) return;
      url.searchParams.delete('payment');
      url.searchParams.delete('sid');
      url.searchParams.delete('ssid');
      const nextUrl = url.pathname + (url.search ? url.search : '') + (url.hash || '');
      window.history.replaceState({}, '', nextUrl);
    } catch (_) {}
  }

  function applyRealtimeValidation() {
    $$('input[required], textarea[required], select[required]').forEach((el) => {
      const check = () => {
        if (!el.value || !String(el.value).trim()) {
          el.style.borderColor = 'rgba(239,68,68,.7)';
          return;
        }
        el.style.borderColor = 'rgba(255,255,255,.18)';
      };
      el.addEventListener('input', check);
      el.addEventListener('change', check);
    });
  }

  function initDashboard() {
    const notice = $('#portalNotice');
    const setPortalNotice = (msg, type = 'ok') => {
      if (!notice) return;
      notice.textContent = msg;
      notice.classList.remove('hidden', 'ok', 'err');
      notice.classList.add(type);
    };

    const projectViewMode = String(document.body?.dataset?.projectViewMode || '').toUpperCase() === 'PROJECT' ? 'PROJECT' : 'GLOBAL';
    const sectionsByMode = {
      GLOBAL: new Set(['dashboard', 'chamados', 'pagamentos', 'perfil']),
      PROJECT: new Set(['dashboard', 'operacao', 'chamados', 'planos', 'pagamentos', 'perfil']),
    };
    const validSections = sectionsByMode[projectViewMode];
    const navVisibleInMode = (itemScope) => {
      const scope = String(itemScope || 'ALL').toUpperCase();
      return scope === 'ALL' || scope === projectViewMode;
    };
    const getHashSection = () => {
      const value = (window.location.hash || '#dashboard').replace('#', '').trim();
      return validSections.has(value) ? value : 'dashboard';
    };
    const loadSection = (sectionId) => {
      const target = validSections.has(sectionId) ? sectionId : 'dashboard';
      $$('.portal-section').forEach((section) => section.classList.toggle('active', section.dataset.section === target));
      $$('[data-nav-section]').forEach((item) => item.classList.toggle('active', item.dataset.navSection === target));
    };
    const initNavigation = () => {
      $$('[data-nav-scope]').forEach((item) => {
        if (!navVisibleInMode(item.dataset.navScope || 'ALL')) {
          item.classList.add('d-none');
        }
      });
      $$('[data-nav-section]').forEach((item) => {
        item.addEventListener('click', (e) => {
          if (!navVisibleInMode(item.dataset.navScope || 'ALL')) return;
          e.preventDefault();
          const section = item.dataset.navSection || 'dashboard';
          if (!validSections.has(section)) {
            window.location.hash = 'dashboard';
            loadSection('dashboard');
            return;
          }
          window.location.hash = section;
          loadSection(section);
        });
      });
      window.addEventListener('hashchange', () => loadSection(getHashSection()));
      loadSection(getHashSection());
    };
    const initDashboardTheme = () => {
      const themeKey = 'koddahub_portal_theme';
      const body = document.body;
      const toggle = $('#themeToggle');
      const applyTheme = (theme) => {
        const normalized = theme === 'light' ? 'light' : 'dark';
        body.setAttribute('data-theme', normalized);
        if (toggle) {
          toggle.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
          toggle.innerHTML = normalized === 'dark'
            ? '<i class="bi bi-moon-stars-fill" aria-hidden="true"></i> Escuro'
            : '<i class="bi bi-sun-fill" aria-hidden="true"></i> Claro';
        }
      };
      const saved = (localStorage.getItem(themeKey) || '').toLowerCase();
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light'));
      toggle?.addEventListener('click', () => {
        const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(themeKey, next);
      });
    };
    initDashboardTheme();
    initNavigation();

    const featureCancelSubscription = document.body?.dataset?.featureCancelSubscription === '1';
    const featureBillingPixSessionFlow = document.body?.dataset?.featureBillingPixSessionFlow === '1';
    const parseApiJson = async (response) => {
      try {
        const text = await response.text();
        const parsed = parsePossiblyNoisyJson(text);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
        return { __raw_text: text || '', __parse_error: true };
      } catch (_) {
        return { __raw_text: '', __parse_error: true };
      }
    };
    const projectContextSelect = $('#projectContextSelect');
    const openProjectCreateBtn = $('#openProjectCreateBtn');
    const openProjectCreateBtnDashboard = $('#openProjectCreateBtnDashboard');
    const projectCreateModal = $('#projectCreateModal');
    const projectCreateForm = $('#projectCreateForm');
    const projectCreateType = $('#projectCreateType');
    const projectCreatePlanCode = $('#projectCreatePlanCode');
    const projectCreateNotice = $('#projectCreateNotice');
    const projectCreateSubmitBtn = $('#projectCreateSubmitBtn');
    const projectCreateCancelBtn = $('#projectCreateCancelBtn');
    const projectCreateCloseBtn = $('#projectCreateCloseBtn');
    const briefProjectIdInput = $('#briefProjectId');
    const briefSourceInput = $('#briefSource');
    const briefPlanCodeInput = $('#briefPlanCode');
    let projectContextSyncInFlight = false;
    let projectCreateSubmitting = false;
    let projectCreateFlowPayload = null;
    let currentProjectSelection = String(projectContextSelect?.value || document.body?.dataset?.currentProjectId || '').trim();

    const ticketForm = $('#ticketForm');
    const ticketSubmitBtn = $('#ticketSubmitBtn');
    const ticketInlineNotice = $('#ticketInlineNotice');

    const planForm = $('#planForm');
    const planSubmitBtn = $('#planSubmitBtn');
    const planCodeSelect = $('#planCodeSelect');
    const planReason = $('#planReason');
    const planInlineNotice = $('#planInlineNotice');
    const planJustificationCounter = $('#planJustificationCounter');
    let planCurrentCode = (planForm?.dataset?.currentPlan || '').trim().toLowerCase();
    const planPickButtons = $$('.plan-pick-btn');
    const planTiles = $$('.plan-tile[data-plan-code]');
    const planChangeConfirmModal = $('#planChangeConfirmModal');
    const planChangeConfirmText = $('#planChangeConfirmText');
    const planChangeConfirmNotice = $('#planChangeConfirmNotice');
    const planUpgradeAmountInfo = $('#planUpgradeAmountInfo');
    const planUpgradePaymentWrap = $('#planUpgradePaymentWrap');
    const planUpgradePaymentMethod = $('#planUpgradePaymentMethod');
    const planUpgradeTabPix = $('#planUpgradeTabPix');
    const planUpgradeTabCard = $('#planUpgradeTabCard');
    const planUpgradeCardModeWrap = $('#planUpgradeCardModeWrap');
    const planUpgradeCardModeSavedBtn = $('#planUpgradeCardModeSavedBtn');
    const planUpgradeCardModeNewBtn = $('#planUpgradeCardModeNewBtn');
    const planUpgradeCardForm = $('#planUpgradeCardForm');
    const planUpgradeCardHolderName = $('#planUpgradeCardHolderName');
    const planUpgradeCardNumber = $('#planUpgradeCardNumber');
    const planUpgradeCardExpMonth = $('#planUpgradeCardExpMonth');
    const planUpgradeCardExpYear = $('#planUpgradeCardExpYear');
    const planUpgradeCardCcv = $('#planUpgradeCardCcv');
    const planUpgradePixWrap = $('#planUpgradePixWrap');
    const planUpgradePixQr = $('#planUpgradePixQr');
    const planUpgradePixPayload = $('#planUpgradePixPayload');
    const planUpgradePixCountdown = $('#planUpgradePixCountdown');
    const planChangeConfirmSubmitBtn = $('#planChangeConfirmSubmitBtn');
    const planChangeConfirmCancelBtn = $('#planChangeConfirmCancelBtn');
    const planChangeConfirmCloseBtn = $('#planChangeConfirmCloseBtn');
    let planSubmitInFlight = false;

    const payNowBtn = $('#payNowBtn');
    const anticipatePixBtn = $('#anticipatePixBtn');
    const updateCardBtn = $('#updateCardBtn');
    const paymentInlineNotice = $('#paymentInlineNotice');
    const paymentProtocolCard = $('#paymentProtocolCard');
    const billingStatusBadge = $('#billingStatusBadge');
    const billingNextDueDate = $('#billingNextDueDate');
    const billingOverdueText = $('#billingOverdueText');
    const billingCardSummary = $('#billingCardSummary');
    const billingCardExpiry = $('#billingCardExpiry');
    const paymentOverdueAlert = $('#paymentOverdueAlert');
    const paymentOverdueAlertText = $('#paymentOverdueAlertText');
    const paymentsTableBody = $('#paymentsTableBody');
    const paymentsCountBadge = $('#paymentsCountBadge');
    const updateCardModal = $('#updateCardModal');
    const updateCardNotice = $('#updateCardNotice');
    const updateCardConfirmBtn = $('#updateCardConfirmBtn');
    const updateCardCancelBtn = $('#updateCardCancelBtn');
    const updateCardCloseBtn = $('#updateCardCloseBtn');
    const updateCardForm = $('#updateCardForm');
    const paymentAlternativeModal = $('#paymentAlternativeModal');
    const paymentAlternativeTitle = $('#paymentAlternativeTitle');
    const paymentAlternativeMethod = $('#paymentAlternativeMethod');
    const paymentAlternativeTabPix = $('#paymentAlternativeTabPix');
    const paymentAlternativeTabCard = $('#paymentAlternativeTabCard');
    const paymentAlternativeCardModeWrap = $('#paymentAlternativeCardModeWrap');
    const paymentAlternativeCardModeSavedBtn = $('#paymentAlternativeCardModeSavedBtn');
    const paymentAlternativeCardModeNewBtn = $('#paymentAlternativeCardModeNewBtn');
    const paymentAlternativeNotice = $('#paymentAlternativeNotice');
    const paymentAlternativeConfirmBtn = $('#paymentAlternativeConfirmBtn');
    const paymentAlternativeCancelBtn = $('#paymentAlternativeCancelBtn');
    const paymentAlternativeCloseBtn = $('#paymentAlternativeCloseBtn');
    const paymentAlternativeCardForm = $('#paymentAlternativeCardForm');
    const paymentAlternativeCardHolderName = $('#paymentAlternativeCardHolderName');
    const paymentAlternativeCardNumber = $('#paymentAlternativeCardNumber');
    const paymentAlternativeCardExpMonth = $('#paymentAlternativeCardExpMonth');
    const paymentAlternativeCardExpYear = $('#paymentAlternativeCardExpYear');
    const paymentAlternativeCardCcv = $('#paymentAlternativeCardCcv');
    const paymentAlternativePixBox = $('#paymentAlternativePixBox');
    const paymentAlternativePixQr = $('#paymentAlternativePixQr');
    const paymentAlternativePixPayload = $('#paymentAlternativePixPayload');
    const paymentAlternativePixCountdown = $('#paymentAlternativePixCountdown');
    let paymentAlternativeMode = 'OVERDUE';
    let paymentAlternativeLocked = false;
    let paymentAlternativePollingTimer = null;
    let planChangeLocked = false;
    let planChangePollingTimer = null;
    let planPixCountdownTimer = null;
    let paymentPixCountdownTimer = null;
    let planPendingPaymentId = '';
    let planPendingPaymentMethod = '';
    let planPixSessionId = '';
    let planPixFlowState = 'IDLE';
    let retryPendingPaymentId = '';
    let retryPendingPaymentMethod = '';
    let planChangeRequiresPayment = false;
    let autoPlanPixTriggered = false;
    let autoRetryPixTriggered = false;

    const cancelSubscriptionBtn = $('#cancelSubscriptionBtn');
    const cancelSubscriptionModal = $('#cancelSubscriptionModal');
    const cancelSubscriptionForm = $('#cancelSubscriptionForm');
    const cancelSubscriptionNotice = $('#cancelSubscriptionNotice');
    const cancelSubscriptionSubmitBtn = $('#cancelSubscriptionSubmitBtn');
    const cancelSubscriptionCancelBtn = $('#cancelSubscriptionCancelBtn');
    const cancelSubscriptionCloseBtn = $('#cancelSubscriptionCloseBtn');
    const cancelConfirmText = $('#cancelConfirmText');
    let billingSnapshot = null;

    const portalApprovalNotice = $('#portalApprovalNotice');
    const setPortalApprovalNotice = (msg, ok = false) => {
      if (!portalApprovalNotice) {
        setPortalNotice(msg, ok ? 'ok' : 'err');
        return;
      }
      portalApprovalNotice.textContent = msg || '';
      portalApprovalNotice.classList.remove('hidden', 'ok', 'err');
      portalApprovalNotice.classList.add(ok ? 'ok' : 'err');
    };

    const portalApprovalConfirmModal = $('#portalApprovalConfirmModal');
    const portalRequestChangesModal = $('#portalRequestChangesModal');
    const portalApproveBtn = $('#portalApproveBtn');
    const portalChangesBtn = $('#portalChangesBtn');
    const portalApproveConfirmBtn = $('#portalApproveConfirmBtn');
    const portalApproveCancelBtn = $('#portalApproveCancelBtn');
    const portalChangesCancelBtn = $('#portalChangesCancelBtn');
    const portalRequestChangesForm = $('#portalRequestChangesForm');
    const portalDescricaoAjuste = $('#portalDescricaoAjuste');
    const portalDescricaoCounter = $('#portalDescricaoCounter');
    const portalDescricaoCounterFill = $('#portalDescricaoCounterFill');
    const portalChangesSubmitBtn = $('#portalChangesSubmitBtn');
    const portalChangesNotice = $('#portalChangesNotice');
    const portalPublicationNotice = $('#portalPublicationNotice');
    const portalPublicationRespondBtn = $('#portalPublicationRespondBtn');
    const portalPublicationDomainModal = $('#portalPublicationDomainModal');
    const portalPublicationDomainForm = $('#portalPublicationDomainForm');
    const portalPublicationRequestId = $('#portalPublicationRequestId');
    const portalPublicationAction = $('#portalPublicationAction');
    const portalPublicationDomain = $('#portalPublicationDomain');
    const portalPublicationDomainHint = $('#portalPublicationDomainHint');
    const portalPublicationNote = $('#portalPublicationNote');
    const portalPublicationDomainNotice = $('#portalPublicationDomainNotice');
    const portalPublicationDomainSubmitBtn = $('#portalPublicationDomainSubmitBtn');
    const portalPublicationDomainCancelBtn = $('#portalPublicationDomainCancelBtn');
    const portalPublicationDomainCloseBtn = $('#portalPublicationDomainCloseBtn');
    let portalApproveSending = false;
    let portalChangesSending = false;
    let portalPublicationSending = false;

    const openPortalModal = (el) => {
      if (!el) return;
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
    };
    const closePortalModal = (el, force = false) => {
      if (!el) return;
      if (!force) {
        if (el === planChangeConfirmModal && planChangeLocked) return;
        if (el === paymentAlternativeModal && paymentAlternativeLocked) return;
      }
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    };
    const setPortalChangesNotice = (msg, ok = false) => {
      if (!portalChangesNotice) return;
      portalChangesNotice.textContent = msg || '';
      portalChangesNotice.classList.remove('hidden', 'ok', 'err');
      portalChangesNotice.classList.add(ok ? 'ok' : 'err');
    };
    const clearPortalChangesNotice = () => {
      if (!portalChangesNotice) return;
      portalChangesNotice.textContent = '';
      portalChangesNotice.classList.add('hidden');
      portalChangesNotice.classList.remove('ok', 'err');
    };
    const setPortalPublicationNotice = (msg, ok = false) => {
      if (!portalPublicationNotice) return;
      portalPublicationNotice.textContent = msg || '';
      portalPublicationNotice.classList.remove('hidden', 'ok', 'err');
      portalPublicationNotice.classList.add(ok ? 'ok' : 'err');
    };
    const setPortalPublicationDomainNotice = (msg, ok = false) => {
      if (!portalPublicationDomainNotice) return;
      portalPublicationDomainNotice.textContent = msg || '';
      portalPublicationDomainNotice.classList.remove('hidden', 'ok', 'err');
      portalPublicationDomainNotice.classList.add(ok ? 'ok' : 'err');
    };
    const clearPortalPublicationDomainNotice = () => {
      if (!portalPublicationDomainNotice) return;
      portalPublicationDomainNotice.textContent = '';
      portalPublicationDomainNotice.classList.add('hidden');
      portalPublicationDomainNotice.classList.remove('ok', 'err');
    };
    const sanitizeDomainInput = (value) => {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/\.$/, '');
    };
    const isDomainValid = (value) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(String(value || ''));
    const syncPublicationActionUi = () => {
      const action = String(portalPublicationAction?.value || 'approve');
      if (!portalPublicationDomain || !portalPublicationDomainHint) return;
      const required = action === 'reject';
      portalPublicationDomain.required = required;
      portalPublicationDomainHint.textContent = required
        ? 'Obrigatório ao rejeitar. Informe o domínio sugerido.'
        : 'Opcional para aprovação. Se vazio, manteremos o domínio atual.';
    };
    const openPublicationDomainModal = () => {
      if (!portalPublicationDomainModal) return;
      const requestId = portalPublicationRespondBtn?.dataset?.requestId || '';
      const requestDomain = portalPublicationRespondBtn?.dataset?.requestDomain || '';
      if (portalPublicationRequestId) portalPublicationRequestId.value = requestId;
      if (portalPublicationDomain) portalPublicationDomain.value = requestDomain;
      if (portalPublicationAction) portalPublicationAction.value = 'approve';
      if (portalPublicationNote) portalPublicationNote.value = '';
      clearPortalPublicationDomainNotice();
      syncPublicationActionUi();
      openPortalModal(portalPublicationDomainModal);
      portalPublicationAction?.focus();
    };
    const closePublicationDomainModal = () => {
      closePortalModal(portalPublicationDomainModal);
      portalPublicationDomainSubmitBtn?.removeAttribute('disabled');
      portalPublicationSending = false;
    };
    const updatePortalDescricaoCounter = () => {
      if (!portalDescricaoAjuste || !portalDescricaoCounter || !portalDescricaoCounterFill || !portalChangesSubmitBtn) return;
      const length = String(portalDescricaoAjuste.value || '').trim().length;
      const pct = Math.min(100, (length / 100) * 100);
      portalDescricaoCounter.textContent = `${length} / 2000 (mínimo 100)`;
      portalDescricaoCounterFill.style.width = `${pct}%`;
      const valid = length >= 100;
      portalChangesSubmitBtn.disabled = !valid || portalChangesSending;
      portalDescricaoCounter.classList.toggle('text-success', valid);
      portalDescricaoCounter.classList.toggle('text-danger', !valid);
    };
    const setProjectCreateNotice = (type, message) => {
      setInlineAlert(projectCreateNotice, type, message);
    };
    const abortPendingProject = async (projectId) => {
      const pid = String(projectId || '').trim();
      if (!pid) return;
      try {
        await apiFetch(`/api/projects/${encodeURIComponent(pid)}/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'USER_ABORTED_FLOW' }),
        });
      } catch (_) {}
    };
    const startProjectProrataPayment = async (projectId, planCode) => {
      const pid = String(projectId || '').trim();
      if (!pid) throw new Error('Projeto inválido para iniciar cobrança.');
      const prepareRes = await apiFetch(`/api/billing/items/${encodeURIComponent(pid)}/prorata/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_code: planCode || null }),
      });
      const prepareData = await parseApiJson(prepareRes);
      if (!prepareRes.ok || !prepareData?.ok) {
        throw new Error(prepareData?.error || 'Não foi possível calcular o pró-rata do projeto.');
      }
      const amount = Number(prepareData?.pricing?.prorata_amount || 0);
      const approveMsg = amount > 0
        ? `Para ativar este novo projeto, confirme a cobrança pró-rata de ${formatMoney(amount)} até o próximo vencimento.`
        : 'Não há cobrança imediata para este projeto. Deseja finalizar a ativação agora?';
      if (!window.confirm(approveMsg)) {
        await abortPendingProject(pid);
        throw new Error('Solicitação cancelada. O projeto pendente foi removido.');
      }
      const confirmRes = await apiFetch(`/api/billing/items/${encodeURIComponent(pid)}/prorata/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `project-prorata-confirm-${generateRequestId()}`,
        },
        body: JSON.stringify({
          plan_code: planCode || null,
          payment_method: 'PIX',
        }),
      });
      const confirmData = await parseApiJson(confirmRes);
      if (!confirmRes.ok || !confirmData?.ok) {
        await abortPendingProject(pid);
        throw new Error(confirmData?.error || 'Não foi possível confirmar a cobrança pró-rata.');
      }
      const paymentUrl = String(confirmData?.result?.payment?.invoice_url || '').trim();
      const pixPayload = String(confirmData?.result?.payment?.pix_payload || '').trim();
      if (paymentUrl) {
        window.open(paymentUrl, '_blank', 'noopener,noreferrer');
      } else if (pixPayload) {
        navigator.clipboard.writeText(pixPayload).catch(() => {});
      }
      return {
        pendingActivation: !!confirmData?.result?.activation_pending,
      };
    };
    const setProjectCreateSubmitting = (loading) => {
      projectCreateSubmitting = !!loading;
      setButtonLoading(projectCreateSubmitBtn, loading);
      if (loading) {
        projectCreateCancelBtn?.setAttribute('disabled', 'disabled');
        projectCreateCloseBtn?.setAttribute('disabled', 'disabled');
        projectCreateForm?.querySelectorAll('input, select').forEach((field) => {
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
            field.setAttribute('disabled', 'disabled');
          }
        });
        return;
      }
      projectCreateCancelBtn?.removeAttribute('disabled');
      projectCreateCloseBtn?.removeAttribute('disabled');
      projectCreateForm?.querySelectorAll('input, select').forEach((field) => {
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
          field.removeAttribute('disabled');
        }
      });
    };
    const resetProjectCreateModalState = () => {
      if (projectCreateForm) {
        projectCreateForm.reset();
      }
      projectCreatePlanCode?.classList.remove('is-invalid');
      setProjectCreateNotice('', '');
    };
    const openProjectCreateModal = () => {
      if (!projectCreateModal) return;
      resetProjectCreateModalState();
      openPortalModal(projectCreateModal);
      projectCreatePlanCode?.focus();
    };
    const closeProjectCreateModal = () => {
      if (projectCreateSubmitting) return;
      closePortalModal(projectCreateModal);
    };
    const reloadDashboardWithCurrentSection = (delayMs = 0) => {
      const reload = () => {
        if (!window.location.hash) {
          window.location.reload();
          return;
        }
        window.location.href = `/portal/dashboard${window.location.hash}`;
      };
      if (delayMs > 0) {
        window.setTimeout(reload, delayMs);
        return;
      }
      reload();
    };
    const submitProjectCreate = async () => {
      if (!projectCreateForm || projectCreateSubmitting) return;
      const projectType = String(projectCreateType?.value || 'hospedagem').trim().toLowerCase();
      const planCode = String(projectCreatePlanCode?.value || '').trim().toLowerCase();
      projectCreatePlanCode?.classList.remove('is-invalid');
      setProjectCreateNotice('', '');
      if (!planCode) {
        projectCreatePlanCode?.classList.add('is-invalid');
        setProjectCreateNotice('danger', 'Selecione um plano para o novo projeto.');
        projectCreatePlanCode?.focus();
        return;
      }

      const idempotencyKey = `project-create-${generateRequestId()}`;
      setProjectCreateSubmitting(true);
      try {
        const response = await apiFetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            project_type: projectType,
            plan_code: planCode,
          }),
        });
        if (response.redirected || String(response.url || '').includes('/login')) {
          throw new Error('Sua sessão expirou. Faça login novamente para continuar.');
        }
        const data = await parseApiJson(response);
        if (data?.__parse_error) {
          throw new Error('Resposta inválida do servidor ao criar o projeto.');
        }
        if (!response.ok || !data?.ok) {
          const details = data?.details && typeof data.details === 'object' ? data.details : {};
          if (details?.plan_code) projectCreatePlanCode?.classList.add('is-invalid');
          throw new Error(data?.error || 'Não foi possível criar o projeto agora.');
        }

        const resultProject = data?.result?.project && typeof data.result.project === 'object' ? data.result.project : null;
        const createdLabel = String(resultProject?.domain || resultProject?.project_tag || resultProject?.label || '');
        const successMsg = data?.idempotent
          ? `Solicitação já registrada para ${createdLabel || 'este projeto'}.`
          : `Projeto ${createdLabel || 'novo'} solicitado com sucesso.`;
        setProjectCreateNotice('success', successMsg);
        setPortalNotice(successMsg, 'ok');
        showToast('success', 'Projeto solicitado', successMsg);
        const createdProjectId = String(resultProject?.id || '');
        projectCreateFlowPayload = {
          projectId: createdProjectId,
          planCode,
        };
        await startProjectProrataPayment(createdProjectId, planCode);
        if (briefProjectIdInput) briefProjectIdInput.value = createdProjectId;
        if (briefSourceInput) briefSourceInput.value = 'project_create';
        if (briefPlanCodeInput) briefPlanCodeInput.value = planCode;
        closePortalModal(projectCreateModal);
        setPortalNotice('Cobrança iniciada com sucesso. Agora finalize o briefing para concluir o projeto.', 'ok');
        openModal();
      } catch (err) {
        const message = err?.message || 'Falha ao criar projeto.';
        setProjectCreateNotice('danger', message);
        setPortalNotice(message, 'err');
        showToast('danger', 'Novo projeto', message);
      } finally {
        setProjectCreateSubmitting(false);
      }
    };

    projectContextSelect?.addEventListener('change', async () => {
      if (projectContextSyncInFlight) return;
      const nextProjectId = String(projectContextSelect.value || '').trim();
      if (nextProjectId === currentProjectSelection) return;
      projectContextSyncInFlight = true;
      projectContextSelect.setAttribute('disabled', 'disabled');
      setPortalNotice('Atualizando contexto do projeto...', 'ok');
      try {
        const response = await apiFetch('/api/projects/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: nextProjectId || null }),
        });
        if (response.redirected || String(response.url || '').includes('/login')) {
          throw new Error('Sua sessão expirou. Faça login novamente para continuar.');
        }
        const data = await parseApiJson(response);
        if (data?.__parse_error) {
          throw new Error('Resposta inválida ao trocar o contexto do projeto.');
        }
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Não foi possível trocar o contexto do projeto.');
        }
        currentProjectSelection = String(data?.current_project_id || '').trim();
        document.body.dataset.currentProjectId = currentProjectSelection;
        document.body.dataset.projectViewMode = String(data?.mode || (currentProjectSelection ? 'PROJECT' : 'GLOBAL')).toUpperCase();
        const successMsg = currentProjectSelection ? 'Projeto ativo atualizado.' : 'Visão geral consolidada ativada.';
        setPortalNotice(successMsg, 'ok');
        showToast('success', 'Projeto ativo', successMsg);
        reloadDashboardWithCurrentSection(160);
      } catch (err) {
        if (projectContextSelect) projectContextSelect.value = currentProjectSelection;
        const message = err?.message || 'Falha ao trocar o projeto ativo.';
        setPortalNotice(message, 'err');
        showToast('danger', 'Projeto ativo', message);
      } finally {
        projectContextSyncInFlight = false;
        projectContextSelect?.removeAttribute('disabled');
      }
    });

    projectCreatePlanCode?.addEventListener('change', () => projectCreatePlanCode.classList.remove('is-invalid'));
    projectCreateForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitProjectCreate();
    });
    openProjectCreateBtn?.addEventListener('click', openProjectCreateModal);
    openProjectCreateBtnDashboard?.addEventListener('click', openProjectCreateModal);
    projectCreateSubmitBtn?.addEventListener('click', submitProjectCreate);
    projectCreateCancelBtn?.addEventListener('click', closeProjectCreateModal);
    projectCreateCloseBtn?.addEventListener('click', closeProjectCreateModal);
    projectCreateModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', closeProjectCreateModal);

    const pendingPlanStorageKey = (() => {
      const sid = String(planForm?.querySelector('[name="asaas_subscription_id"]')?.value || '').trim();
      const pendingVersion = 'v3';
      return sid ? `portal_plan_change_pending_${pendingVersion}_${sid}` : '';
    })();
    const planNameMap = {
      basic: 'Básico',
      profissional: 'Profissional',
      pro: 'Pro',
    };
    const syncPlanTiles = () => {
      const selected = String(planCodeSelect?.value || '').toLowerCase();
      planTiles.forEach((tile) => {
        tile.classList.toggle('is-selected', tile.dataset.planCode === selected);
      });
    };
    const syncPlanCounter = () => {
      if (!planReason || !planJustificationCounter) return;
      const len = String(planReason.value || '').length;
      planJustificationCounter.textContent = `${len} / 500`;
    };
    const readPendingPlanChange = () => {
      if (!pendingPlanStorageKey) return null;
      try {
        const raw = localStorage.getItem(pendingPlanStorageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (_) {
        return null;
      }
    };
    const writePendingPlanChange = (payload) => {
      if (!pendingPlanStorageKey) return;
      try {
        localStorage.setItem(pendingPlanStorageKey, JSON.stringify(payload));
      } catch (_) {}
    };
    const clearPendingPlanChange = () => {
      if (!pendingPlanStorageKey) return;
      try {
        localStorage.removeItem(pendingPlanStorageKey);
      } catch (_) {}
    };
    const applyPendingPlanUi = () => {
      if (!planSubmitBtn) return;
      clearPendingPlanChange();
      planSubmitBtn.removeAttribute('disabled');
      if (String(planInlineNotice?.textContent || '').includes('aguardando confirmação do ASAAS')) {
        setInlineAlert(planInlineNotice, '', '');
      }
    };
    const formatDate = (value, withTime = false) => {
      const raw = String(value || '').trim();
      if (!raw) return 'N/D';
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) return raw;
      return dt.toLocaleString('pt-BR', withTime
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const formatMoney = (value) => {
      const num = Number(value || 0);
      return Number.isFinite(num)
        ? num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'R$ 0,00';
    };
    const normalizePaymentMethod = (value) => {
      const raw = String(value || '').trim().toUpperCase();
      if (raw === 'CREDIT_CARD_NEW' || raw === 'CREDIT_CARD_SAVED' || raw === 'PIX') return raw;
      if (raw === 'CREDIT_CARD') return 'CREDIT_CARD_SAVED';
      return 'PIX';
    };
    const collectCardPayload = ({ holderEl, numberEl, monthEl, yearEl, ccvEl }) => {
      const holderName = String(holderEl?.value || '').trim();
      const number = onlyDigits(numberEl?.value || '');
      const expiryMonth = onlyDigits(monthEl?.value || '');
      const expiryYear = onlyDigits(yearEl?.value || '');
      const ccv = onlyDigits(ccvEl?.value || '');
      const expiryMonthNum = Number(expiryMonth || '0');
      const expiryYearNum = Number(expiryYear || '0');
      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth() + 1;
      if (!holderName || number.length < 13 || number.length > 19 || !expiryMonth || !expiryYear || ccv.length < 3 || ccv.length > 4) {
        return { ok: false, error: 'Preencha os dados do cartão corretamente.' };
      }
      if (!isLuhnValid(number)) {
        return { ok: false, error: 'Número do cartão inválido.' };
      }
      if (expiryMonthNum < 1 || expiryMonthNum > 12 || expiryYearNum < nowYear || expiryYearNum > nowYear + 20 || (expiryYearNum === nowYear && expiryMonthNum < nowMonth)) {
        return { ok: false, error: 'Validade do cartão inválida.' };
      }
      return {
        ok: true,
        card: {
          holder_name: holderName,
          number,
          expiry_month: expiryMonth,
          expiry_year: expiryYear,
          ccv,
        },
      };
    };
    const clearPaymentPolling = () => {
      if (paymentAlternativePollingTimer) {
        clearInterval(paymentAlternativePollingTimer);
        paymentAlternativePollingTimer = null;
      }
      if (planChangePollingTimer) {
        clearInterval(planChangePollingTimer);
        planChangePollingTimer = null;
      }
      if (planPixCountdownTimer) {
        clearInterval(planPixCountdownTimer);
        planPixCountdownTimer = null;
      }
      if (paymentPixCountdownTimer) {
        clearInterval(paymentPixCountdownTimer);
        paymentPixCountdownTimer = null;
      }
    };
    const parseDateSafe = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const dt = new Date(raw);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    const formatRemaining = (seconds) => {
      const total = Math.max(0, Number(seconds || 0));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    const startPixCountdown = ({ expiresAt, targetEl, setTimer, onExpire }) => {
      if (!targetEl) return;
      const expiration = parseDateSafe(expiresAt);
      if (!expiration) {
        targetEl.textContent = 'Aguardando confirmação do PIX...';
        setTimer(null);
        return;
      }
      const tick = () => {
        const now = Date.now();
        const diffSec = Math.floor((expiration.getTime() - now) / 1000);
        if (diffSec <= 0) {
          targetEl.textContent = 'PIX expirado. Gere uma nova cobrança para continuar.';
          const timerRef = setTimer(null);
          if (timerRef) {
            clearInterval(timerRef);
          }
          onExpire?.();
          return;
        }
        targetEl.textContent = `Tempo restante para pagamento PIX: ${formatRemaining(diffSec)}`;
      };
      tick();
      const timer = setInterval(tick, 1000);
      setTimer(timer);
    };
    const hasSavedCardToken = () => {
      const profile = billingSnapshot && typeof billingSnapshot === 'object' ? (billingSnapshot.billing_profile || null) : null;
      const tokenPresent = profile && Object.prototype.hasOwnProperty.call(profile, 'card_token_present')
        ? !!profile.card_token_present
        : !!String(profile?.card_token || '').trim();
      return tokenPresent;
    };
    const setPlanUpgradeTab = (tab) => {
      const selected = String(tab || 'PIX').toUpperCase() === 'CARD' ? 'CARD' : 'PIX';
      planUpgradeTabPix?.classList.toggle('is-active', selected === 'PIX');
      planUpgradeTabPix?.classList.toggle('active', selected === 'PIX');
      planUpgradeTabPix?.setAttribute('aria-selected', selected === 'PIX' ? 'true' : 'false');
      planUpgradeTabCard?.classList.toggle('is-active', selected === 'CARD');
      planUpgradeTabCard?.classList.toggle('active', selected === 'CARD');
      planUpgradeTabCard?.setAttribute('aria-selected', selected === 'CARD' ? 'true' : 'false');
      if (selected === 'PIX') {
        if (planUpgradePaymentMethod) planUpgradePaymentMethod.value = 'PIX';
      } else {
        const preferSaved = hasSavedCardToken();
        if (planUpgradePaymentMethod) {
          planUpgradePaymentMethod.value = preferSaved ? 'CREDIT_CARD_SAVED' : 'CREDIT_CARD_NEW';
        }
      }
      syncPlanUpgradePaymentUi();
    };
    const setPlanUpgradeCardMode = (mode) => {
      const normalized = String(mode || '').toUpperCase() === 'CREDIT_CARD_NEW' ? 'CREDIT_CARD_NEW' : 'CREDIT_CARD_SAVED';
      if (normalized === 'CREDIT_CARD_SAVED' && !hasSavedCardToken()) {
        if (planUpgradePaymentMethod) planUpgradePaymentMethod.value = 'CREDIT_CARD_NEW';
      } else if (planUpgradePaymentMethod) {
        planUpgradePaymentMethod.value = normalized;
      }
      syncPlanUpgradePaymentUi();
    };
    const setPaymentAlternativeTab = (tab) => {
      const selected = String(tab || 'PIX').toUpperCase() === 'CARD' ? 'CARD' : 'PIX';
      paymentAlternativeTabPix?.classList.toggle('is-active', selected === 'PIX');
      paymentAlternativeTabPix?.classList.toggle('active', selected === 'PIX');
      paymentAlternativeTabPix?.setAttribute('aria-selected', selected === 'PIX' ? 'true' : 'false');
      paymentAlternativeTabCard?.classList.toggle('is-active', selected === 'CARD');
      paymentAlternativeTabCard?.classList.toggle('active', selected === 'CARD');
      paymentAlternativeTabCard?.setAttribute('aria-selected', selected === 'CARD' ? 'true' : 'false');
      if (selected === 'PIX') {
        if (paymentAlternativeMethod) paymentAlternativeMethod.value = 'PIX';
      } else {
        const preferSaved = hasSavedCardToken();
        if (paymentAlternativeMethod) {
          paymentAlternativeMethod.value = preferSaved ? 'CREDIT_CARD_SAVED' : 'CREDIT_CARD_NEW';
        }
      }
      syncRetryPaymentUi();
    };
    const setPaymentAlternativeCardMode = (mode) => {
      const normalized = String(mode || '').toUpperCase() === 'CREDIT_CARD_NEW' ? 'CREDIT_CARD_NEW' : 'CREDIT_CARD_SAVED';
      if (normalized === 'CREDIT_CARD_SAVED' && !hasSavedCardToken()) {
        if (paymentAlternativeMethod) paymentAlternativeMethod.value = 'CREDIT_CARD_NEW';
      } else if (paymentAlternativeMethod) {
        paymentAlternativeMethod.value = normalized;
      }
      syncRetryPaymentUi();
    };
    const resetPlanUpgradeModalState = () => {
      if (planUpgradePaymentMethod) {
        planUpgradePaymentMethod.value = 'PIX';
      }
      if (planUpgradePixWrap) {
        planUpgradePixWrap.classList.add('d-none');
      }
      if (planUpgradePixQr) {
        planUpgradePixQr.removeAttribute('src');
        planUpgradePixQr.classList.add('d-none');
      }
      if (planUpgradePixPayload) {
        planUpgradePixPayload.value = '';
      }
      if (planUpgradePixCountdown) {
        planUpgradePixCountdown.textContent = 'Aguardando geração do PIX...';
      }
      [planUpgradeCardHolderName, planUpgradeCardNumber, planUpgradeCardExpMonth, planUpgradeCardExpYear, planUpgradeCardCcv].forEach((input) => {
        if (input) input.value = '';
      });
      planPendingPaymentId = '';
      planPendingPaymentMethod = '';
      planPixSessionId = '';
      setPlanUpgradeTab('PIX');
    };
    const resetPaymentAlternativeModalState = () => {
      if (paymentAlternativeMethod) {
        paymentAlternativeMethod.value = 'PIX';
      }
      if (paymentAlternativePixBox) {
        paymentAlternativePixBox.hidden = true;
      }
      if (paymentAlternativePixQr) {
        paymentAlternativePixQr.removeAttribute('src');
        paymentAlternativePixQr.classList.add('d-none');
      }
      if (paymentAlternativePixPayload) {
        paymentAlternativePixPayload.value = '';
      }
      if (paymentAlternativePixCountdown) {
        paymentAlternativePixCountdown.textContent = 'Aguardando geração do PIX...';
      }
      [paymentAlternativeCardHolderName, paymentAlternativeCardNumber, paymentAlternativeCardExpMonth, paymentAlternativeCardExpYear, paymentAlternativeCardCcv].forEach((input) => {
        if (input) input.value = '';
      });
      retryPendingPaymentId = '';
      retryPendingPaymentMethod = '';
      setPaymentAlternativeTab('PIX');
    };
    const cancelPendingPixPayment = async (paymentId) => {
      const pid = String(paymentId || '').trim();
      if (!pid) return { ok: true, skipped: true };
      try {
        const response = await apiFetch(`/api/billing/payments/${encodeURIComponent(pid)}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          return { ok: false, message: data?.error || 'Falha ao cancelar cobrança PIX.' };
        }
        return { ok: true };
      } catch (_) {
        return { ok: false, message: 'Falha de comunicação ao cancelar PIX.' };
      }
    };
    const syncPlanConfirmButton = () => {
      if (!planChangeConfirmSubmitBtn) return;
      const method = normalizePaymentMethod(planUpgradePaymentMethod?.value || 'PIX');
      if (!planChangeRequiresPayment) {
        planChangeConfirmSubmitBtn.classList.remove('d-none');
        const label = planChangeConfirmSubmitBtn.querySelector('.btn-label');
        if (label) label.textContent = 'Confirmar solicitação';
        return;
      }
      if (method === 'PIX') {
        planChangeConfirmSubmitBtn.classList.add('d-none');
      } else {
        planChangeConfirmSubmitBtn.classList.remove('d-none');
        const label = planChangeConfirmSubmitBtn.querySelector('.btn-label');
        if (label) label.textContent = 'Pagar com cartão';
      }
    };
    const syncRetryConfirmButton = () => {
      if (!paymentAlternativeConfirmBtn) return;
      const method = normalizePaymentMethod(paymentAlternativeMethod?.value || 'PIX');
      if (method === 'PIX') {
        paymentAlternativeConfirmBtn.classList.add('d-none');
      } else {
        paymentAlternativeConfirmBtn.classList.remove('d-none');
        const label = paymentAlternativeConfirmBtn.querySelector('.btn-label');
        if (label) label.textContent = 'Pagar com cartão';
      }
    };
    const setPlanModalLockedState = (locked) => {
      planChangeLocked = !!locked;
      if (locked) {
        planChangeConfirmCloseBtn?.setAttribute('disabled', 'disabled');
      } else {
        planChangeConfirmCloseBtn?.removeAttribute('disabled');
      }
    };
    const setRetryModalLockedState = (locked) => {
      paymentAlternativeLocked = !!locked;
      if (locked) {
        paymentAlternativeCloseBtn?.setAttribute('disabled', 'disabled');
      } else {
        paymentAlternativeCloseBtn?.removeAttribute('disabled');
      }
    };
    const pollPaymentStatus = ({ paymentId, onProgress, onConfirmed, onError }) => {
      if (!paymentId) return;
      let attempts = 0;
      const maxAttempts = 120;
      const run = async () => {
        attempts += 1;
        try {
          const response = await apiFetch(`/api/billing/payments/${encodeURIComponent(paymentId)}/status`, { method: 'GET' });
          const data = await parseApiJson(response);
          if (!response.ok) {
            if (attempts >= maxAttempts) {
              onError?.('Tempo excedido aguardando confirmação de pagamento.');
            }
            return;
          }
          onProgress?.(data);
          if (data?.confirmed) {
            onConfirmed?.(data);
          } else if (data?.cancelled) {
            onError?.('Pagamento cancelado antes da confirmação.');
          } else if (attempts >= maxAttempts) {
            onError?.('Tempo excedido aguardando confirmação de pagamento.');
          }
        } catch (_) {
          if (attempts >= maxAttempts) {
            onError?.('Falha ao acompanhar confirmação do pagamento.');
          }
        }
      };
      run();
      return setInterval(run, 5000);
    };
    const paymentStatusMeta = (status) => {
      const normalized = String(status || 'PENDING').trim().toUpperCase();
      if (['RECEIVED', 'PAID', 'CONFIRMED'].includes(normalized)) return { text: normalized, cls: 'text-bg-success' };
      if (normalized === 'PENDING') return { text: normalized, cls: 'text-bg-warning' };
      if (normalized === 'OVERDUE') return { text: normalized, cls: 'text-bg-danger' };
      if (['CANCELED', 'CANCELLED'].includes(normalized)) return { text: normalized, cls: 'text-bg-secondary' };
      return { text: normalized || 'N/D', cls: 'text-bg-secondary' };
    };
    const extractPaymentActionUrl = (payment = {}) => {
      const keys = ['invoice_url', 'invoiceUrl', 'bank_slip_url', 'bankSlipUrl', 'payment_link', 'paymentLink', 'checkout_url', 'checkoutUrl'];
      for (const key of keys) {
        const value = String(payment?.[key] || '').trim();
        if (value) return value;
      }
      return '';
    };
    const paymentMethodLabel = (method) => {
      const normalized = String(method || '').trim().toUpperCase();
      if (!normalized) return 'N/D';
      return normalized.replaceAll('_', ' ');
    };
    const renderBillingPayments = (payments) => {
      if (!paymentsTableBody) return;
      const list = Array.isArray(payments) ? payments : [];
      if (paymentsCountBadge) {
        paymentsCountBadge.textContent = `${list.length} registro(s)`;
      }
      if (!list.length) {
        paymentsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-4">Nenhum pagamento recente.</td></tr>';
        return;
      }
      paymentsTableBody.innerHTML = list.map((payment) => {
        const dueDate = formatDate(payment?.due_date || payment?.created_at || '');
        const status = paymentStatusMeta(payment?.status);
        const actionUrl = extractPaymentActionUrl(payment);
        const actionHtml = actionUrl
          ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
          : '-';
        return `<tr>
          <td data-label="Data/Vencimento">${escapeHtml(dueDate)}</td>
          <td data-label="Valor" class="text-end">${escapeHtml(formatMoney(payment?.amount))}</td>
          <td data-label="Método">${escapeHtml(paymentMethodLabel(payment?.billing_type))}</td>
          <td data-label="Status"><span class="badge ${escapeHtml(status.cls)}">${escapeHtml(status.text)}</span></td>
          <td data-label="Ação">${actionHtml}</td>
        </tr>`;
      }).join('');
    };
    const applyBillingSnapshot = (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return;
      billingSnapshot = snapshot;
      const subscription = snapshot?.subscription && typeof snapshot.subscription === 'object' ? snapshot.subscription : null;
      const profile = snapshot?.billing_profile && typeof snapshot.billing_profile === 'object' ? snapshot.billing_profile : null;
      const livePlanCode = String(subscription?.plan_code || '').trim().toLowerCase();
      if (livePlanCode) {
        planCurrentCode = livePlanCode;
        if (planForm) {
          planForm.dataset.currentPlan = livePlanCode;
        }
      }
      renderBillingPayments(snapshot?.payments || []);

      const statusText = String(subscription?.status || 'N/D').trim().toUpperCase() || 'N/D';
      if (billingStatusBadge) {
        billingStatusBadge.textContent = statusText;
        billingStatusBadge.classList.remove('text-bg-success', 'text-bg-warning', 'text-bg-danger', 'text-bg-secondary', 'text-bg-info');
        if (statusText === 'ACTIVE') {
          billingStatusBadge.classList.add('text-bg-success');
        } else if (statusText === 'OVERDUE') {
          billingStatusBadge.classList.add('text-bg-danger');
        } else if (statusText === 'PENDING') {
          billingStatusBadge.classList.add('text-bg-warning');
        } else {
          billingStatusBadge.classList.add('text-bg-secondary');
        }
      }

      if (billingNextDueDate) billingNextDueDate.textContent = formatDate(subscription?.next_due_date || '');
      const overdueDays = Number(subscription?.overdue_days || 0);
      const isOverdue = Boolean(subscription?.is_overdue);
      if (billingOverdueText) {
        billingOverdueText.textContent = isOverdue && overdueDays > 0
          ? `Atraso de ${overdueDays} dia(s).`
          : 'Sem atrasos relevantes.';
      }
      if (paymentOverdueAlert) {
        const showPayNow = isOverdue && overdueDays >= 2;
        paymentOverdueAlert.classList.toggle('d-none', !showPayNow);
        if (paymentOverdueAlertText) {
          paymentOverdueAlertText.textContent = showPayNow ? ` Atraso atual: ${overdueDays} dia(s).` : '';
        }
      }
      if (anticipatePixBtn) {
        const nextDueRaw = String(subscription?.next_due_date || '').trim();
        let showAnticipate = false;
        if (nextDueRaw) {
          const now = new Date();
          const due = new Date(nextDueRaw);
          if (!Number.isNaN(due.getTime())) {
            const days = Math.floor((due.setHours(0, 0, 0, 0) - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
            showAnticipate = days >= 0 && days <= 5;
          }
        }
        anticipatePixBtn.classList.toggle('d-none', !showAnticipate);
      }

      const brand = String(profile?.card_brand || '').trim();
      const last4 = String(profile?.card_last4 || '').trim();
      const expMonth = String(profile?.exp_month || '').trim();
      const expYear = String(profile?.exp_year || '').trim();
      if (billingCardSummary) billingCardSummary.textContent = `${brand || 'N/D'} •••• ${last4 || '----'}`;
      if (billingCardExpiry) billingCardExpiry.textContent = expMonth && expYear ? `${expMonth.padStart(2, '0')}/${expYear}` : 'N/D';

      const asaasSid = String(subscription?.asaas_subscription_id || '').trim();
      const localSid = String(subscription?.id || '').trim();
      if (updateCardBtn) {
        updateCardBtn.dataset.subscriptionId = asaasSid;
        updateCardBtn.disabled = !asaasSid;
      }
      if (payNowBtn) {
        payNowBtn.dataset.subscriptionId = asaasSid || localSid;
      }
      if (cancelSubscriptionBtn) {
        cancelSubscriptionBtn.dataset.subscriptionId = asaasSid || localSid;
      }
      const formSid = planForm?.querySelector('[name="asaas_subscription_id"]');
      if (formSid && asaasSid) formSid.value = asaasSid;
      const formDueDate = planForm?.querySelector('[name="next_due_date"]');
      if (formDueDate) formDueDate.value = String(subscription?.next_due_date || '');
      applyPendingPlanUi();
    };
    const loadBillingSnapshot = async (reconcile = false) => {
      setInlineAlert(paymentInlineNotice, 'info', 'Carregando dados financeiros...');
      try {
        const endpoint = reconcile ? '/api/billing/me?reconcile=1' : '/api/billing/me';
        const response = await apiFetch(endpoint, { method: 'GET' });
        const data = await parseApiJson(response);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Não foi possível carregar os dados financeiros.');
        }
        applyBillingSnapshot(data);
        setInlineAlert(paymentInlineNotice, '', '');
      } catch (err) {
        setInlineAlert(paymentInlineNotice, 'danger', err?.message || 'Falha ao carregar dados financeiros.');
      }
    };

    if (!document.body.dataset.portalCopyBound) {
      document.body.dataset.portalCopyBound = '1';
      document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const trigger = target.closest('[data-copy-target], [data-copy-value]');
        if (!(trigger instanceof HTMLElement)) return;
        const copyValue = String(trigger.getAttribute('data-copy-value') || '').trim();
        const copyTargetId = String(trigger.getAttribute('data-copy-target') || '').trim();
        let value = copyValue;
        if (!value && copyTargetId) {
          const copySource = document.getElementById(copyTargetId);
          if (copySource instanceof HTMLInputElement || copySource instanceof HTMLTextAreaElement) {
            value = String(copySource.value || '').trim();
          } else {
            value = String(copySource?.textContent || '').trim();
          }
        }
        if (!value || value === 'N/D' || value === '-') return;
        const copied = await copyText(value);
        showToast(copied ? 'success' : 'danger', copied ? 'Copiado' : 'Falha ao copiar', copied ? 'Código copiado para a área de transferência.' : 'Não foi possível copiar agora.');
      });
    }

    planPickButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!planCodeSelect) return;
        const nextPlan = String(btn.dataset.planCode || '').toLowerCase();
        if (!nextPlan) return;
        planCodeSelect.value = nextPlan;
        syncPlanTiles();
        planCodeSelect.focus();
      });
    });

    planCodeSelect?.addEventListener('change', syncPlanTiles);
    planReason?.addEventListener('input', syncPlanCounter);
    const syncPlanUpgradePaymentUi = () => {
      const method = normalizePaymentMethod(planUpgradePaymentMethod?.value || 'PIX');
      if (planUpgradePaymentMethod) {
        planUpgradePaymentMethod.value = method;
      }
      const cardTab = method !== 'PIX';
      const savedEnabled = hasSavedCardToken();
      planUpgradeTabPix?.classList.toggle('is-active', !cardTab);
      planUpgradeTabPix?.classList.toggle('active', !cardTab);
      planUpgradeTabPix?.setAttribute('aria-selected', !cardTab ? 'true' : 'false');
      planUpgradeTabCard?.classList.toggle('is-active', cardTab);
      planUpgradeTabCard?.classList.toggle('active', cardTab);
      planUpgradeTabCard?.setAttribute('aria-selected', cardTab ? 'true' : 'false');
      planUpgradeCardModeWrap?.classList.toggle('d-none', !cardTab);
      planUpgradeCardModeSavedBtn?.classList.toggle('is-active', method === 'CREDIT_CARD_SAVED');
      planUpgradeCardModeSavedBtn?.classList.toggle('active', method === 'CREDIT_CARD_SAVED');
      planUpgradeCardModeNewBtn?.classList.toggle('is-active', method === 'CREDIT_CARD_NEW');
      planUpgradeCardModeNewBtn?.classList.toggle('active', method === 'CREDIT_CARD_NEW');
      if (planUpgradeCardModeSavedBtn) {
        planUpgradeCardModeSavedBtn.disabled = !savedEnabled;
      }
      planUpgradeCardForm?.classList.toggle('d-none', method !== 'CREDIT_CARD_NEW');
      if (!cardTab) {
        if (planUpgradePixCountdown) {
          planUpgradePixCountdown.textContent = 'Aguardando geração do PIX...';
        }
      } else {
        planUpgradePixWrap?.classList.add('d-none');
      }
      syncPlanConfirmButton();
    };
    const syncRetryPaymentUi = () => {
      const method = normalizePaymentMethod(paymentAlternativeMethod?.value || 'PIX');
      if (paymentAlternativeMethod) {
        paymentAlternativeMethod.value = method;
      }
      const cardTab = method !== 'PIX';
      const savedEnabled = hasSavedCardToken();
      paymentAlternativeTabPix?.classList.toggle('is-active', !cardTab);
      paymentAlternativeTabCard?.classList.toggle('is-active', cardTab);
      paymentAlternativeCardModeWrap?.classList.toggle('d-none', !cardTab);
      paymentAlternativeCardModeSavedBtn?.classList.toggle('is-active', method === 'CREDIT_CARD_SAVED');
      paymentAlternativeCardModeSavedBtn?.classList.toggle('active', method === 'CREDIT_CARD_SAVED');
      paymentAlternativeCardModeNewBtn?.classList.toggle('is-active', method === 'CREDIT_CARD_NEW');
      paymentAlternativeCardModeNewBtn?.classList.toggle('active', method === 'CREDIT_CARD_NEW');
      if (paymentAlternativeCardModeSavedBtn) {
        paymentAlternativeCardModeSavedBtn.disabled = !savedEnabled;
      }
      paymentAlternativeCardForm?.classList.toggle('d-none', method !== 'CREDIT_CARD_NEW');
      if (!cardTab) {
        if (paymentAlternativePixCountdown) {
          paymentAlternativePixCountdown.textContent = 'Aguardando geração do PIX...';
        }
      } else if (paymentAlternativePixBox) {
        paymentAlternativePixBox.hidden = true;
      }
      syncRetryConfirmButton();
    };
    planUpgradePaymentMethod?.addEventListener('change', syncPlanUpgradePaymentUi);
    paymentAlternativeMethod?.addEventListener('change', syncRetryPaymentUi);
    planUpgradeTabPix?.addEventListener('click', () => {
      setPlanUpgradeTab('PIX');
      if (!planChangeConfirmModal?.classList.contains('hidden') && planChangeRequiresPayment && !autoPlanPixTriggered && !planSubmitInFlight && !planPixSessionId) {
        autoPlanPixTriggered = true;
        executePlanChange();
      }
    });
    planUpgradeTabCard?.addEventListener('click', async () => {
      if (featureBillingPixSessionFlow && planPixSessionId) {
        setInlineAlert(planChangeConfirmNotice, 'info', 'Cancelando PIX para seguir com pagamento em cartão...');
        const cancelSession = await cancelPlanPixSession();
        if (!cancelSession.ok) {
          setInlineAlert(planChangeConfirmNotice, 'warning', cancelSession.message || 'Não foi possível cancelar o PIX anterior.');
          return;
        }
        planPendingPaymentId = '';
        planPendingPaymentMethod = '';
        planUpgradePixWrap?.classList.add('d-none');
      }
      setPlanUpgradeTab('CARD');
    });
    planUpgradeCardModeSavedBtn?.addEventListener('click', () => setPlanUpgradeCardMode('CREDIT_CARD_SAVED'));
    planUpgradeCardModeNewBtn?.addEventListener('click', () => setPlanUpgradeCardMode('CREDIT_CARD_NEW'));
    paymentAlternativeTabPix?.addEventListener('click', () => {
      setPaymentAlternativeTab('PIX');
      if (!paymentAlternativeModal?.classList.contains('hidden') && !autoRetryPixTriggered) {
        autoRetryPixTriggered = true;
        paymentAlternativeConfirmBtn?.click();
      }
    });
    paymentAlternativeTabCard?.addEventListener('click', () => setPaymentAlternativeTab('CARD'));
    paymentAlternativeCardModeSavedBtn?.addEventListener('click', () => setPaymentAlternativeCardMode('CREDIT_CARD_SAVED'));
    paymentAlternativeCardModeNewBtn?.addEventListener('click', () => setPaymentAlternativeCardMode('CREDIT_CARD_NEW'));
    [
      ['#planUpgradeCardNumber', formatCardNumber],
      ['#paymentAlternativeCardNumber', formatCardNumber],
      ['#planUpgradeCardExpMonth', (v) => onlyDigits(v).slice(0, 2)],
      ['#paymentAlternativeCardExpMonth', (v) => onlyDigits(v).slice(0, 2)],
      ['#planUpgradeCardExpYear', (v) => onlyDigits(v).slice(0, 4)],
      ['#paymentAlternativeCardExpYear', (v) => onlyDigits(v).slice(0, 4)],
      ['#planUpgradeCardCcv', (v) => onlyDigits(v).slice(0, 4)],
      ['#paymentAlternativeCardCcv', (v) => onlyDigits(v).slice(0, 4)],
    ].forEach(([selector, formatter]) => {
      const input = $(selector);
      input?.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        target.value = formatter(target.value);
      });
    });
    syncPlanTiles();
    syncPlanCounter();
    syncPlanUpgradePaymentUi();
    syncRetryPaymentUi();
    applyPendingPlanUi();
    loadBillingSnapshot(false);

    ticketForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert(ticketInlineNotice, '', '');
      const body = Object.fromEntries(new FormData(ticketForm).entries());
      const subject = String(body.subject || '').trim();
      const description = String(body.description || '').trim();
      if (subject.length < 3) {
        setInlineAlert(ticketInlineNotice, 'danger', 'Informe um assunto com no mínimo 3 caracteres.');
        $('#ticketSubject')?.focus();
        return;
      }
      if (description.length < 10) {
        setInlineAlert(ticketInlineNotice, 'danger', 'A descrição precisa ter no mínimo 10 caracteres.');
        $('#ticketDescription')?.focus();
        return;
      }
      setButtonLoading(ticketSubmitBtn, true);
      try {
        const response = await apiFetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          const msg = data.error || 'Erro ao abrir chamado.';
          setInlineAlert(ticketInlineNotice, 'danger', msg);
          setPortalNotice(msg, 'err');
          return;
        }
        const protocol = String(data.ticket_id || '').trim();
        const successText = protocol ? `Chamado aberto com sucesso. Protocolo: ${protocol}` : 'Chamado aberto com sucesso.';
        setInlineAlert(ticketInlineNotice, 'success', successText);
        showToast('success', 'Chamado aberto', protocol ? `Protocolo ${protocol}` : 'Solicitação registrada com sucesso.');
        setPortalNotice(successText, 'ok');
        ticketForm.reset();
        window.setTimeout(() => window.location.reload(), 900);
      } finally {
        setButtonLoading(ticketSubmitBtn, false);
      }
    });

    const cancelPlanPixSession = async () => {
      const sid = String(planForm?.querySelector('[name="asaas_subscription_id"]')?.value || '').trim();
      if (!featureBillingPixSessionFlow || !planPixSessionId || !sid) return { ok: true, skipped: true };
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/change-plan/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modal_session_id: planPixSessionId }),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          return { ok: false, message: data?.error || 'Não foi possível cancelar a sessão PIX.' };
        }
        return { ok: true, data };
      } catch (_) {
        return { ok: false, message: 'Falha de comunicação ao cancelar sessão PIX.' };
      } finally {
        planPixSessionId = '';
      }
    };

    const confirmPlanPixSession = async ({ sid, paymentId }) => {
      const sessionId = String(planPixSessionId || '').trim();
      if (!featureBillingPixSessionFlow || !sessionId) return { ok: false, message: 'Sessão PIX inválida.' };
      const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/change-plan/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modal_session_id: sessionId,
          payment_id: paymentId,
        }),
      });
      const data = await parseApiJson(response);
      if (!response.ok || !data?.ok) {
        return { ok: false, message: data?.error || 'Não foi possível confirmar o upgrade após pagamento.' };
      }
      return { ok: true, data };
    };

    const preparePlanUpgradePix = async ({ sid, planCode }) => {
      if (!featureBillingPixSessionFlow) return { ok: false, message: 'Fluxo PIX por sessão desabilitado.' };
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/change-plan/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_code: planCode }),
        });
        if (response.redirected || String(response.url || '').includes('/login')) {
          return { ok: false, message: 'Sua sessão expirou. Faça login novamente para gerar o PIX do upgrade.' };
        }
        const data = await parseApiJson(response);
        if (data?.__parse_error) {
          return { ok: false, message: 'Resposta inválida do servidor para a troca de plano. Tente novamente.' };
        }
        if (!response.ok || !data?.ok) {
          return { ok: false, message: data?.error || 'Não foi possível preparar o PIX do upgrade.' };
        }
        const paymentId = String(data?.payment_id || '').trim();
        const sessionId = String(data?.modal_session_id || '').trim();
        const pixPayload = String(data?.pix?.payload || '').trim();
        const pixQr = String(data?.pix?.encodedImage || '').trim();
        if (!paymentId || !sessionId || (!pixPayload && !pixQr)) {
          return { ok: false, message: 'PIX retornado sem dados suficientes para pagamento.' };
        }
        planPixSessionId = sessionId;
        planPendingPaymentId = paymentId;
        planPendingPaymentMethod = 'PIX';
        if (planUpgradeAmountInfo) {
          const amount = Number(data?.amount || 0);
          if (Number.isFinite(amount) && amount > 0) {
            planUpgradeAmountInfo.textContent = `Diferença a pagar agora: ${formatMoney(amount)}.`;
            planUpgradeAmountInfo.classList.remove('d-none');
          }
        }
        planUpgradePixWrap?.classList.remove('d-none');
        if (planUpgradePixPayload) {
          planUpgradePixPayload.value = pixPayload || 'PIX indisponível no momento.';
        }
        if (planUpgradePixQr) {
          if (pixQr) {
            planUpgradePixQr.src = `data:image/png;base64,${pixQr}`;
            planUpgradePixQr.classList.remove('d-none');
          } else {
            planUpgradePixQr.removeAttribute('src');
            planUpgradePixQr.classList.add('d-none');
          }
        }
        startPixCountdown({
          expiresAt: String(data?.pix?.expirationDate || ''),
          targetEl: planUpgradePixCountdown,
          setTimer: (timer) => {
            const prev = planPixCountdownTimer;
            if (planPixCountdownTimer) clearInterval(planPixCountdownTimer);
            planPixCountdownTimer = timer;
            return prev;
          },
          onExpire: () => {
            planPixFlowState = 'EXPIRED';
            clearPaymentPolling();
            setPlanModalLockedState(true);
            planChangeConfirmCancelBtn?.removeAttribute('disabled');
            setInlineAlert(planChangeConfirmNotice, 'warning', 'PIX expirado. Gere uma nova cobrança para continuar.');
          },
        });
        setPlanModalLockedState(true);
        planChangeConfirmCancelBtn?.removeAttribute('disabled');
        setInlineAlert(planChangeConfirmNotice, 'info', 'PIX gerado. Aguardando confirmação de pagamento...');
        planPixFlowState = 'PAYMENT_PENDING_CONFIRMATION';
        clearPaymentPolling();
        planChangePollingTimer = pollPaymentStatus({
          paymentId,
          onProgress: () => {
            setInlineAlert(planChangeConfirmNotice, 'info', 'Processando pagamento... aguardando confirmação do Asaas.');
          },
          onConfirmed: async () => {
            clearPaymentPolling();
            const confirmResult = await confirmPlanPixSession({ sid, paymentId });
            if (!confirmResult.ok) {
              setInlineAlert(planChangeConfirmNotice, 'warning', confirmResult.message || 'Pagamento confirmado, mas sem aplicar upgrade.');
              return;
            }
            planPixFlowState = 'CONFIRMED';
            setPlanModalLockedState(false);
            autoPlanPixTriggered = false;
            planPendingPaymentId = '';
            planPendingPaymentMethod = '';
            planPixSessionId = '';
            const okMsg = 'Pagamento confirmado e upgrade aplicado com sucesso.';
            setInlineAlert(planInlineNotice, 'success', okMsg);
            setInlineAlert(planChangeConfirmNotice, 'success', okMsg);
            showToast('success', 'Upgrade confirmado', okMsg);
            setPortalNotice(okMsg, 'ok');
            await loadBillingSnapshot(true);
            closePortalModal(planChangeConfirmModal);
          },
          onError: (message) => {
            planPixFlowState = 'ERROR';
            clearPaymentPolling();
            setPlanModalLockedState(true);
            planChangeConfirmCancelBtn?.removeAttribute('disabled');
            setInlineAlert(planChangeConfirmNotice, 'warning', message || 'Não foi possível confirmar o pagamento do upgrade.');
          },
        });
        return { ok: true };
      } catch (_) {
        return { ok: false, message: 'Falha de comunicação ao preparar cobrança PIX.' };
      }
    };

    const executeProjectItemPlanChange = async () => {
      if (!planForm || !planCodeSelect || planSubmitInFlight) return;
      const projectId = String(document.body?.dataset?.currentProjectId || '').trim();
      if (!projectId) {
        setInlineAlert(planInlineNotice, 'warning', 'Selecione um projeto ativo para trocar plano.');
        return;
      }
      const selectedPlanCode = String(planCodeSelect.value || '').trim().toLowerCase();
      if (!selectedPlanCode || selectedPlanCode === planCurrentCode) {
        setInlineAlert(planInlineNotice, 'warning', 'Selecione um plano diferente do atual para continuar.');
        return;
      }

      planSubmitInFlight = true;
      setButtonLoading(planSubmitBtn, true);
      try {
        const response = await apiFetch(`/api/billing/items/${encodeURIComponent(projectId)}/change-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `project-item-plan-${generateRequestId()}`,
          },
          body: JSON.stringify({
            plan_code: selectedPlanCode,
            justificativa: String(planReason?.value || '').trim() || null,
          }),
        });
        const data = await parseApiJson(response);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || 'Não foi possível trocar o plano do projeto.');
        }
        const successMsg = 'Plano do projeto atualizado com sucesso.';
        setInlineAlert(planInlineNotice, 'success', successMsg);
        setPortalNotice(successMsg, 'ok');
        showToast('success', 'Planos', successMsg);
        await loadBillingSnapshot(true);
        window.setTimeout(() => window.location.reload(), 450);
      } catch (err) {
        const message = err?.message || 'Falha ao trocar plano do projeto.';
        setInlineAlert(planInlineNotice, 'danger', message);
        setPortalNotice(message, 'err');
        showToast('danger', 'Planos', message);
      } finally {
        planSubmitInFlight = false;
        setButtonLoading(planSubmitBtn, false);
      }
    };

    const executePlanChange = async () => {
      if (!planForm || !planCodeSelect || planSubmitInFlight) return;
      setInlineAlert(planInlineNotice, '', '');
      setInlineAlert(planChangeConfirmNotice, '', '');
      const body = Object.fromEntries(new FormData(planForm).entries());
      const sid = String(body.asaas_subscription_id || '').trim();
      const nextPlanCode = String(body.plan_code || '').trim().toLowerCase();
      const selectedUpgradePaymentMethod = normalizePaymentMethod(planUpgradePaymentMethod?.value || 'PIX');
      if (!sid) {
        setInlineAlert(planInlineNotice, 'danger', 'Assinatura não encontrada para troca de plano.');
        return;
      }
      if (!nextPlanCode) {
        setInlineAlert(planInlineNotice, 'danger', 'Selecione o plano desejado.');
        return;
      }
      if (nextPlanCode === planCurrentCode) {
        setInlineAlert(planInlineNotice, 'warning', 'O plano selecionado já é o plano atual.');
        return;
      }

      const isPixTabFlow = selectedUpgradePaymentMethod === 'PIX';
      if (featureBillingPixSessionFlow && planChangeRequiresPayment && isPixTabFlow) {
        const prepared = await preparePlanUpgradePix({ sid, planCode: nextPlanCode });
        if (!prepared.ok) {
          autoPlanPixTriggered = false;
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
          setInlineAlert(planInlineNotice, 'danger', prepared.message || 'Não foi possível gerar o PIX do upgrade.');
          setInlineAlert(planChangeConfirmNotice, 'danger', prepared.message || 'Não foi possível gerar o PIX do upgrade.');
        }
        return;
      }

      const payload = {
        ...body,
        upgrade_payment_method: selectedUpgradePaymentMethod,
      };
      const isPixFlow = planChangeRequiresPayment && selectedUpgradePaymentMethod === 'PIX';
      if (selectedUpgradePaymentMethod !== 'PIX' && String(planPendingPaymentMethod || '').toUpperCase() === 'PIX' && String(planPendingPaymentId || '').trim() !== '') {
        setInlineAlert(planChangeConfirmNotice, 'info', 'Cancelando PIX anterior para processar pagamento no cartão...');
        const cancelPix = await cancelPendingPixPayment(planPendingPaymentId);
        if (!cancelPix.ok) {
          setInlineAlert(planChangeConfirmNotice, 'warning', cancelPix.message || 'Não foi possível cancelar o PIX anterior.');
          return;
        }
        planPendingPaymentId = '';
        planPendingPaymentMethod = '';
      }
      if (selectedUpgradePaymentMethod === 'CREDIT_CARD_NEW') {
        const cardCheck = collectCardPayload({
          holderEl: planUpgradeCardHolderName,
          numberEl: planUpgradeCardNumber,
          monthEl: planUpgradeCardExpMonth,
          yearEl: planUpgradeCardExpYear,
          ccvEl: planUpgradeCardCcv,
        });
        if (!cardCheck.ok) {
          setInlineAlert(planChangeConfirmNotice, 'danger', cardCheck.error || 'Dados do cartão inválidos.');
          return;
        }
        payload.card = cardCheck.card;
      }

      planSubmitInFlight = true;
      setButtonLoading(planSubmitBtn, true);
      setButtonLoading(planChangeConfirmSubmitBtn, true);
      if (isPixFlow) {
        setPlanModalLockedState(true);
        planChangeConfirmCancelBtn?.setAttribute('disabled', 'disabled');
      }
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/change-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.redirected || String(response.url || '').includes('/login')) {
          autoPlanPixTriggered = false;
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
          const authMsg = 'Sua sessão expirou. Faça login novamente para continuar a troca de plano.';
          setInlineAlert(planInlineNotice, 'danger', authMsg);
          setInlineAlert(planChangeConfirmNotice, 'danger', authMsg);
          return;
        }
        const data = await parseApiJson(response);
        if (data?.__parse_error) {
          autoPlanPixTriggered = false;
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
          const raw = String(data?.__raw_text || '').toLowerCase();
          const msg = raw.includes('<html') || raw.includes('<!doctype')
            ? 'Resposta inesperada do servidor (HTML). Recarregue a página e tente novamente.'
            : 'Resposta inválida do servidor para a troca de plano. Tente novamente.';
          setInlineAlert(planInlineNotice, 'danger', msg);
          setInlineAlert(planChangeConfirmNotice, 'danger', msg);
          return;
        }
        if (!response.ok) {
          autoPlanPixTriggered = false;
          if (isPixFlow) {
            setPlanModalLockedState(false);
            planChangeConfirmCancelBtn?.removeAttribute('disabled');
          }
          const requestId = String(data?.request_id || '').trim();
          const errMsg = `${data.error || 'Não foi possível enviar a solicitação de troca.'}${requestId ? ` (request_id: ${requestId})` : ''}`;
          setInlineAlert(planInlineNotice, 'danger', errMsg);
          setInlineAlert(planChangeConfirmNotice, 'danger', errMsg);
          showToast('danger', 'Falha na troca de plano', errMsg);
          setPortalNotice(errMsg, 'err');
          return;
        }

        const direction = String(data.direction || '').toUpperCase();
        if (planChangeRequiresPayment && selectedUpgradePaymentMethod === 'PIX' && direction !== 'UPGRADE') {
          autoPlanPixTriggered = false;
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
          const errPix = 'Resposta inválida para upgrade via PIX. Gere uma nova cobrança e tente novamente.';
          setInlineAlert(planInlineNotice, 'danger', errPix);
          setInlineAlert(planChangeConfirmNotice, 'danger', errPix);
          showToast('danger', 'Falha no PIX', errPix);
          return;
        }
        if (direction === 'UPGRADE') {
          const prorataAmount = Number(data.prorata_amount || 0);
          const charge = data && typeof data.upgrade_charge === 'object' ? data.upgrade_charge : null;
          const chargeMethod = String(charge?.method || '').toUpperCase();
          const paymentId = String(charge?.payment_id || '').trim();
          const upgradeMsg = prorataAmount > 0
            ? `Upgrade solicitado. Diferença pró-rata: ${formatMoney(prorataAmount)}.`
            : 'Upgrade solicitado com sucesso.';
          if (prorataAmount < 0.01 || !paymentId) {
            if (selectedUpgradePaymentMethod === 'PIX') {
              autoPlanPixTriggered = false;
              setPlanModalLockedState(false);
              planChangeConfirmCancelBtn?.removeAttribute('disabled');
              const errPix = 'Não foi possível gerar o PIX da troca de plano. Tente novamente.';
              setInlineAlert(planInlineNotice, 'danger', errPix);
              setInlineAlert(planChangeConfirmNotice, 'danger', errPix);
              showToast('danger', 'Falha no PIX', errPix);
              return;
            }
            autoPlanPixTriggered = false;
            if (isPixFlow) {
              setPlanModalLockedState(false);
              planChangeConfirmCancelBtn?.removeAttribute('disabled');
            }
            clearPendingPlanChange();
            setInlineAlert(planInlineNotice, 'success', upgradeMsg);
            setInlineAlert(planChangeConfirmNotice, 'success', upgradeMsg);
            showToast('success', 'Upgrade solicitado', upgradeMsg);
            setPortalNotice(upgradeMsg, 'ok');
            await loadBillingSnapshot(true);
            closePortalModal(planChangeConfirmModal);
            return;
          }
          setInlineAlert(planInlineNotice, 'info', `${upgradeMsg} Aguardando confirmação de pagamento...`);
          setInlineAlert(planChangeConfirmNotice, 'info', `${upgradeMsg} Aguardando confirmação de pagamento...`);

          if (selectedUpgradePaymentMethod === 'PIX' && chargeMethod !== 'PIX') {
            autoPlanPixTriggered = false;
            setPlanModalLockedState(false);
            planChangeConfirmCancelBtn?.removeAttribute('disabled');
            const errPixMethod = 'O servidor não retornou cobrança PIX para este upgrade. Gere uma nova tentativa.';
            setInlineAlert(planInlineNotice, 'danger', errPixMethod);
            setInlineAlert(planChangeConfirmNotice, 'danger', errPixMethod);
            showToast('danger', 'Falha no PIX', errPixMethod);
            return;
          }

          if (chargeMethod === 'PIX') {
            const pixPayload = String(charge?.pix?.payload || '').trim();
            const pixQr = String(charge?.pix?.encodedImage || '').trim();
            const pixExpiration = String(charge?.pix?.expirationDate || '').trim();
            if (!pixPayload && !pixQr) {
              autoPlanPixTriggered = false;
              setPlanModalLockedState(false);
              planChangeConfirmCancelBtn?.removeAttribute('disabled');
              const errPix = 'PIX gerado sem QR Code/código copia e cola. Tente novamente.';
              setInlineAlert(planInlineNotice, 'danger', errPix);
              setInlineAlert(planChangeConfirmNotice, 'danger', errPix);
              showToast('danger', 'Falha no PIX', errPix);
              return;
            }
            planUpgradePixWrap?.classList.remove('d-none');
            if (planUpgradePixPayload) {
              planUpgradePixPayload.value = pixPayload || 'PIX indisponível no momento.';
            }
            if (planUpgradePixQr) {
              if (pixQr) {
                planUpgradePixQr.src = `data:image/png;base64,${pixQr}`;
                planUpgradePixQr.classList.remove('d-none');
              } else {
                planUpgradePixQr.removeAttribute('src');
                planUpgradePixQr.classList.add('d-none');
              }
            }
            startPixCountdown({
              expiresAt: pixExpiration,
              targetEl: planUpgradePixCountdown,
              setTimer: (timer) => {
                const prev = planPixCountdownTimer;
                if (planPixCountdownTimer) clearInterval(planPixCountdownTimer);
                planPixCountdownTimer = timer;
                return prev;
              },
              onExpire: () => {
                clearPaymentPolling();
                autoPlanPixTriggered = false;
                setPlanModalLockedState(true);
                planChangeConfirmCancelBtn?.removeAttribute('disabled');
                planChangeConfirmSubmitBtn?.removeAttribute('disabled');
                setInlineAlert(planChangeConfirmNotice, 'warning', 'PIX expirado. Gere uma nova cobrança para concluir o upgrade.');
              },
            });
          } else {
            if (planPixCountdownTimer) {
              clearInterval(planPixCountdownTimer);
              planPixCountdownTimer = null;
            }
            if (planUpgradePixCountdown) {
              planUpgradePixCountdown.textContent = 'Pagamento por cartão em processamento.';
            }
            planUpgradePixWrap?.classList.add('d-none');
          }
          planPendingPaymentId = paymentId;
          planPendingPaymentMethod = chargeMethod;

          if (paymentId) {
            setPlanModalLockedState(true);
            planChangeConfirmCancelBtn?.removeAttribute('disabled');
            clearPaymentPolling();
            planChangePollingTimer = pollPaymentStatus({
              paymentId,
              onProgress: () => {
                setInlineAlert(planChangeConfirmNotice, 'info', 'Processando pagamento... aguardando confirmação do Asaas.');
              },
              onConfirmed: async () => {
                clearPaymentPolling();
                setPlanModalLockedState(false);
                autoPlanPixTriggered = false;
                planPendingPaymentId = '';
                planPendingPaymentMethod = '';
                planChangeConfirmCancelBtn?.removeAttribute('disabled');
                clearPendingPlanChange();
                const okMsg = 'Pagamento confirmado e upgrade aplicado com sucesso.';
                setInlineAlert(planInlineNotice, 'success', okMsg);
                setInlineAlert(planChangeConfirmNotice, 'success', okMsg);
                showToast('success', 'Upgrade confirmado', okMsg);
                setPortalNotice(okMsg, 'ok');
                await loadBillingSnapshot(true);
                closePortalModal(planChangeConfirmModal);
              },
              onError: (message) => {
                clearPaymentPolling();
                autoPlanPixTriggered = false;
                setPlanModalLockedState(true);
                planChangeConfirmCancelBtn?.removeAttribute('disabled');
                const msg = message || 'Não foi possível confirmar o pagamento do upgrade.';
                setInlineAlert(planInlineNotice, 'warning', msg);
                setInlineAlert(planChangeConfirmNotice, 'warning', msg);
              },
            });
          }
          return;
        }

        if (direction === 'DOWNGRADE' || data.scheduled) {
          clearPendingPlanChange();
          const effectiveAt = String(data.effective_at || '').trim();
          const scheduledMsg = effectiveAt
            ? `Valor do plano reduzido agora. Funcionalidades atuais mantidas até ${formatDate(effectiveAt, true)}.`
            : 'Valor do plano reduzido agora. Funcionalidades atuais mantidas até o próximo vencimento.';
          setInlineAlert(planInlineNotice, 'info', scheduledMsg);
          setInlineAlert(planChangeConfirmNotice, 'info', scheduledMsg);
          showToast('info', 'Downgrade solicitado', scheduledMsg);
          setPortalNotice(scheduledMsg, 'ok');
          closePortalModal(planChangeConfirmModal);
          return;
        }

        clearPendingPlanChange();
        if (planChangeRequiresPayment && selectedUpgradePaymentMethod === 'PIX') {
          autoPlanPixTriggered = false;
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
          const errPix = 'Upgrade PIX sem cobrança válida. O plano não foi alterado.';
          setInlineAlert(planInlineNotice, 'danger', errPix);
          setInlineAlert(planChangeConfirmNotice, 'danger', errPix);
          showToast('danger', 'Falha no PIX', errPix);
          return;
        }
        const successMsg = direction === 'NOOP'
          ? 'Plano já está no valor atual (sem alterações).'
          : 'Troca de plano solicitada com sucesso.';
        setInlineAlert(planInlineNotice, 'success', successMsg);
        setInlineAlert(planChangeConfirmNotice, 'success', successMsg);
        showToast('success', 'Troca de plano', successMsg);
        setPortalNotice(successMsg, 'ok');
        await loadBillingSnapshot(true);
        closePortalModal(planChangeConfirmModal);
      } finally {
        if (!isPixFlow) {
          setPlanModalLockedState(false);
          planChangeConfirmCancelBtn?.removeAttribute('disabled');
        }
        planSubmitInFlight = false;
        setButtonLoading(planSubmitBtn, false);
        setButtonLoading(planChangeConfirmSubmitBtn, false);
        applyPendingPlanUi();
      }
    };

    planForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (projectViewMode === 'PROJECT') {
        await executeProjectItemPlanChange();
        return;
      }
      setInlineAlert(planInlineNotice, '', '');
      setInlineAlert(planChangeConfirmNotice, '', '');
      const selectedCode = String(planCodeSelect?.value || '').toLowerCase();
      const selectedName = planNameMap[selectedCode] || selectedCode.toUpperCase();
      const currentName = planNameMap[planCurrentCode] || planCurrentCode.toUpperCase();
      const planPriceMap = { basic: 149.99, profissional: 249.00, pro: 399.00 };
      const selectedValue = Number(planPriceMap[selectedCode] || 0);
      const currentValue = Number(planPriceMap[planCurrentCode] || 0);
      const isUpgrade = selectedValue > currentValue;
      const expectedDiff = Math.max(0, selectedValue - currentValue);
      planChangeRequiresPayment = isUpgrade;
      if (!selectedCode || selectedCode === planCurrentCode) {
        setInlineAlert(planInlineNotice, 'warning', 'Selecione um plano diferente do atual para continuar.');
        return;
      }
      if (!planChangeConfirmModal) {
        await executePlanChange();
        return;
      }
      if (planChangeConfirmText) {
        planChangeConfirmText.textContent = `Você está solicitando troca de ${currentName} para ${selectedName}. Deseja confirmar?`;
      }
      if (planUpgradePaymentWrap) {
        planUpgradePaymentWrap.classList.toggle('d-none', !isUpgrade);
      }
      if (planUpgradeAmountInfo) {
        if (isUpgrade) {
          planUpgradeAmountInfo.textContent = `Valor estimado da diferença: ${formatMoney(expectedDiff)} (pró-rata calculada no envio).`;
          planUpgradeAmountInfo.classList.remove('d-none');
        } else {
          planUpgradeAmountInfo.textContent = '';
          planUpgradeAmountInfo.classList.add('d-none');
        }
      }
      if (planUpgradeCardForm) {
        planUpgradeCardForm.classList.add('d-none');
      }
      if (planUpgradePaymentMethod) {
        planUpgradePaymentMethod.value = 'PIX';
      }
      planChangeLocked = false;
      clearPaymentPolling();
      autoPlanPixTriggered = false;
      planPixFlowState = 'IDLE';
      planPixSessionId = '';
      planChangeConfirmCancelBtn?.removeAttribute('disabled');
      planChangeConfirmCloseBtn?.removeAttribute('disabled');
      resetPlanUpgradeModalState();
      if (isUpgrade) {
        setPlanModalLockedState(true);
      }
      syncPlanConfirmButton();
      openPortalModal(planChangeConfirmModal);
      planChangeConfirmSubmitBtn?.focus();
      if (isUpgrade) {
        autoPlanPixTriggered = true;
        executePlanChange();
      }
    });
    planChangeConfirmSubmitBtn?.addEventListener('click', executePlanChange);
    planChangeConfirmCancelBtn?.addEventListener('click', async () => {
      const wasLocked = planChangeLocked;
      const pendingMethod = String(planPendingPaymentMethod || '').toUpperCase();
      const pendingPaymentId = String(planPendingPaymentId || '').trim();
      setPlanModalLockedState(false);
      clearPaymentPolling();
      if (featureBillingPixSessionFlow && planPixSessionId) {
        setInlineAlert(planChangeConfirmNotice, 'info', 'Cancelando sessão PIX em aberto...');
        const cancelSession = await cancelPlanPixSession();
        if (!cancelSession.ok) {
          setInlineAlert(planChangeConfirmNotice, 'warning', cancelSession.message || 'Não foi possível cancelar a sessão PIX agora.');
          return;
        }
      } else if (wasLocked && pendingMethod === 'PIX' && pendingPaymentId !== '') {
        setInlineAlert(planChangeConfirmNotice, 'info', 'Cancelando cobrança PIX em aberto...');
        const cancelResult = await cancelPendingPixPayment(pendingPaymentId);
        if (!cancelResult.ok) {
          setInlineAlert(planChangeConfirmNotice, 'warning', cancelResult.message || 'Não foi possível cancelar o PIX agora.');
          return;
        }
      }
      resetPlanUpgradeModalState();
      autoPlanPixTriggered = false;
      planPixFlowState = 'CANCELED';
      setInlineAlert(planChangeConfirmNotice, '', '');
      setInlineAlert(planInlineNotice, '', '');
      closePortalModal(planChangeConfirmModal);
      await loadBillingSnapshot(true);
    });
    planChangeConfirmCloseBtn?.addEventListener('click', async () => {
      if (planChangeLocked) return;
      if (featureBillingPixSessionFlow && planPixSessionId) {
        await cancelPlanPixSession();
      }
      closePortalModal(planChangeConfirmModal);
    });
    planChangeConfirmModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', async () => {
      if (planChangeLocked) return;
      if (featureBillingPixSessionFlow && planPixSessionId) {
        await cancelPlanPixSession();
      }
      closePortalModal(planChangeConfirmModal);
    });

    const openPaymentAlternativeModal = (mode) => {
      paymentAlternativeMode = mode;
      if (paymentAlternativeTitle) {
        paymentAlternativeTitle.textContent = mode === 'ANTICIPATE' ? 'Antecipar cobrança' : 'Pagar cobrança em atraso';
      }
      if (paymentAlternativeMethod) {
        paymentAlternativeMethod.value = 'PIX';
      }
      autoRetryPixTriggered = false;
      setRetryModalLockedState(false);
      clearPaymentPolling();
      paymentAlternativeCancelBtn?.removeAttribute('disabled');
      paymentAlternativeCloseBtn?.removeAttribute('disabled');
      paymentAlternativeConfirmBtn?.removeAttribute('disabled');
      setInlineAlert(paymentAlternativeNotice, '', '');
      resetPaymentAlternativeModalState();
      setRetryModalLockedState(true);
      syncRetryConfirmButton();
      openPortalModal(paymentAlternativeModal);
      paymentAlternativeConfirmBtn?.focus();
      autoRetryPixTriggered = true;
      paymentAlternativeConfirmBtn?.click();
    };
    payNowBtn?.addEventListener('click', () => openPaymentAlternativeModal('OVERDUE'));
    anticipatePixBtn?.addEventListener('click', () => openPaymentAlternativeModal('ANTICIPATE'));
    paymentAlternativeCancelBtn?.addEventListener('click', async () => {
      const wasLocked = paymentAlternativeLocked;
      const pendingMethod = String(retryPendingPaymentMethod || '').toUpperCase();
      const pendingPaymentId = String(retryPendingPaymentId || '').trim();
      setRetryModalLockedState(false);
      clearPaymentPolling();
      if (wasLocked && pendingMethod === 'PIX' && pendingPaymentId !== '') {
        setInlineAlert(paymentAlternativeNotice, 'info', 'Cancelando cobrança PIX em aberto...');
        const cancelResult = await cancelPendingPixPayment(pendingPaymentId);
        if (!cancelResult.ok) {
          setInlineAlert(paymentAlternativeNotice, 'warning', cancelResult.message || 'Não foi possível cancelar o PIX agora.');
          return;
        }
      }
      resetPaymentAlternativeModalState();
      setInlineAlert(paymentAlternativeNotice, '', '');
      closePortalModal(paymentAlternativeModal);
      await loadBillingSnapshot(true);
    });
    paymentAlternativeCloseBtn?.addEventListener('click', () => {
      if (paymentAlternativeLocked) return;
      closePortalModal(paymentAlternativeModal);
    });
    paymentAlternativeModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => {
      if (paymentAlternativeLocked) return;
      closePortalModal(paymentAlternativeModal);
    });
    paymentAlternativeConfirmBtn?.addEventListener('click', async () => {
      const sid = String(payNowBtn?.dataset?.subscriptionId || '').trim();
      if (!sid) {
        setInlineAlert(paymentAlternativeNotice, 'danger', 'Assinatura inválida para cobrança.');
        return;
      }
      const method = normalizePaymentMethod(paymentAlternativeMethod?.value || 'PIX');
      const isPixFlow = method === 'PIX';
      const payload = { billing_type: method, mode: paymentAlternativeMode };
      if (method !== 'PIX' && String(retryPendingPaymentMethod || '').toUpperCase() === 'PIX' && String(retryPendingPaymentId || '').trim() !== '') {
        setInlineAlert(paymentAlternativeNotice, 'info', 'Cancelando PIX anterior para processar pagamento no cartão...');
        const cancelPix = await cancelPendingPixPayment(retryPendingPaymentId);
        if (!cancelPix.ok) {
          setInlineAlert(paymentAlternativeNotice, 'warning', cancelPix.message || 'Não foi possível cancelar o PIX anterior.');
          return;
        }
        retryPendingPaymentId = '';
        retryPendingPaymentMethod = '';
      }
      if (method === 'CREDIT_CARD_NEW') {
        const cardCheck = collectCardPayload({
          holderEl: paymentAlternativeCardHolderName,
          numberEl: paymentAlternativeCardNumber,
          monthEl: paymentAlternativeCardExpMonth,
          yearEl: paymentAlternativeCardExpYear,
          ccvEl: paymentAlternativeCardCcv,
        });
        if (!cardCheck.ok) {
          setInlineAlert(paymentAlternativeNotice, 'danger', cardCheck.error || 'Dados do cartão inválidos.');
          return;
        }
        payload.card = cardCheck.card;
      }
      setInlineAlert(paymentAlternativeNotice, '', '');
      setButtonLoading(paymentAlternativeConfirmBtn, true);
      if (isPixFlow) {
        setRetryModalLockedState(true);
        paymentAlternativeCancelBtn?.setAttribute('disabled', 'disabled');
      }
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await parseApiJson(response);
        renderProtocol(paymentProtocolCard, null);
        if (!response.ok) {
          autoRetryPixTriggered = false;
          if (isPixFlow) {
            setRetryModalLockedState(false);
            paymentAlternativeCancelBtn?.removeAttribute('disabled');
          }
          const msg = `${data.error || 'Não foi possível gerar cobrança alternativa.'}`;
          setInlineAlert(paymentAlternativeNotice, 'danger', msg);
          setInlineAlert(paymentInlineNotice, 'danger', msg);
          return;
        }
        const paymentId = String(data?.payment_id || '').trim();
        if (String(data?.billing_type || '').toUpperCase() === 'PIX') {
          const pixPayload = String(data?.pix?.payload || '').trim();
          const pixQr = String(data?.pix?.encodedImage || '').trim();
          const pixExpiration = String(data?.pix?.expirationDate || '').trim();
          if (paymentAlternativePixBox) paymentAlternativePixBox.hidden = false;
          if (paymentAlternativePixPayload) paymentAlternativePixPayload.value = pixPayload || 'Payload PIX indisponível no momento.';
          if (paymentAlternativePixQr) {
            if (pixQr) {
              paymentAlternativePixQr.src = `data:image/png;base64,${pixQr}`;
              paymentAlternativePixQr.classList.remove('d-none');
            } else {
              paymentAlternativePixQr.removeAttribute('src');
              paymentAlternativePixQr.classList.add('d-none');
            }
          }
          startPixCountdown({
            expiresAt: pixExpiration,
            targetEl: paymentAlternativePixCountdown,
            setTimer: (timer) => {
              const prev = paymentPixCountdownTimer;
              if (paymentPixCountdownTimer) clearInterval(paymentPixCountdownTimer);
              paymentPixCountdownTimer = timer;
              return prev;
            },
            onExpire: () => {
              clearPaymentPolling();
              setRetryModalLockedState(true);
              autoRetryPixTriggered = false;
              paymentAlternativeCancelBtn?.removeAttribute('disabled');
              paymentAlternativeConfirmBtn?.removeAttribute('disabled');
              setInlineAlert(paymentAlternativeNotice, 'warning', 'PIX expirado. Gere uma nova cobrança para continuar.');
            },
          });
        }
        retryPendingPaymentId = paymentId;
        retryPendingPaymentMethod = String(data?.billing_type || '').toUpperCase();
        setRetryModalLockedState(true);
        paymentAlternativeCancelBtn?.removeAttribute('disabled');
        paymentAlternativeConfirmBtn?.setAttribute('disabled', 'disabled');
        setInlineAlert(paymentAlternativeNotice, 'info', 'Pagamento gerado. Aguardando confirmação do Asaas...');
        if (paymentId) {
          clearPaymentPolling();
          paymentAlternativePollingTimer = pollPaymentStatus({
            paymentId,
            onProgress: () => {
              setInlineAlert(paymentAlternativeNotice, 'info', 'Processando pagamento... aguardando confirmação do Asaas.');
            },
            onConfirmed: async () => {
              clearPaymentPolling();
              setRetryModalLockedState(false);
              autoRetryPixTriggered = false;
              retryPendingPaymentId = '';
              retryPendingPaymentMethod = '';
              paymentAlternativeConfirmBtn?.removeAttribute('disabled');
              const okMsg = 'Pagamento confirmado com sucesso.';
              setInlineAlert(paymentAlternativeNotice, 'success', okMsg);
              setInlineAlert(paymentInlineNotice, 'success', okMsg);
              await loadBillingSnapshot(true);
              closePortalModal(paymentAlternativeModal);
            },
            onError: (message) => {
              clearPaymentPolling();
              setRetryModalLockedState(true);
              autoRetryPixTriggered = false;
              paymentAlternativeCancelBtn?.removeAttribute('disabled');
              paymentAlternativeConfirmBtn?.removeAttribute('disabled');
              setInlineAlert(paymentAlternativeNotice, 'warning', message || 'Não foi possível confirmar pagamento agora.');
            },
          });
        } else {
          setRetryModalLockedState(false);
          autoRetryPixTriggered = false;
          paymentAlternativeCancelBtn?.removeAttribute('disabled');
          paymentAlternativeConfirmBtn?.removeAttribute('disabled');
          setInlineAlert(paymentAlternativeNotice, 'warning', 'Pagamento gerado, mas sem identificador para acompanhar confirmação.');
        }
      } finally {
        if (!isPixFlow) {
          setRetryModalLockedState(false);
          paymentAlternativeCancelBtn?.removeAttribute('disabled');
        }
        setButtonLoading(paymentAlternativeConfirmBtn, false);
      }
    });

    $('#updateCardNumber')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      target.value = formatCardNumber(target.value);
    });
    $('#updateCardExpMonth')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      target.value = onlyDigits(target.value).slice(0, 2);
    });
    $('#updateCardExpYear')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      target.value = onlyDigits(target.value).slice(0, 4);
    });
    $('#updateCardCcv')?.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      target.value = onlyDigits(target.value).slice(0, 4);
    });

    updateCardBtn?.addEventListener('click', () => {
      setInlineAlert(updateCardNotice, '', '');
      if (updateCardForm) updateCardForm.reset();
      openPortalModal(updateCardModal);
      $('#updateCardHolderName')?.focus();
    });
    updateCardCancelBtn?.addEventListener('click', () => closePortalModal(updateCardModal));
    updateCardCloseBtn?.addEventListener('click', () => closePortalModal(updateCardModal));
    updateCardModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(updateCardModal));
    updateCardConfirmBtn?.addEventListener('click', async () => {
      const sid = String(updateCardBtn?.dataset?.subscriptionId || '').trim();
      if (!sid) {
        setInlineAlert(updateCardNotice, 'danger', 'Assinatura sem vínculo no provedor de cobrança.');
        return;
      }
      const holderName = String(updateCardForm?.querySelector('[name="holder_name"]')?.value || '').trim();
      const number = onlyDigits(updateCardForm?.querySelector('[name="number"]')?.value || '');
      const expiryMonth = onlyDigits(updateCardForm?.querySelector('[name="expiry_month"]')?.value || '');
      const expiryYear = onlyDigits(updateCardForm?.querySelector('[name="expiry_year"]')?.value || '');
      const ccv = onlyDigits(updateCardForm?.querySelector('[name="ccv"]')?.value || '');
      const expiryMonthNum = Number(expiryMonth || '0');
      const expiryYearNum = Number(expiryYear || '0');
      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth() + 1;
      if (!holderName || number.length < 13 || number.length > 19 || !expiryMonth || !expiryYear || ccv.length < 3 || ccv.length > 4) {
        setInlineAlert(updateCardNotice, 'danger', 'Preencha os dados do cartão corretamente.');
        return;
      }
      if (!isLuhnValid(number)) {
        setInlineAlert(updateCardNotice, 'danger', 'Número do cartão inválido.');
        return;
      }
      if (expiryMonthNum < 1 || expiryMonthNum > 12 || expiryYearNum < nowYear || expiryYearNum > nowYear + 20 || (expiryYearNum === nowYear && expiryMonthNum < nowMonth)) {
        setInlineAlert(updateCardNotice, 'danger', 'Validade do cartão inválida.');
        return;
      }
      setInlineAlert(updateCardNotice, '', '');
      setInlineAlert(paymentInlineNotice, '', '');
      setButtonLoading(updateCardConfirmBtn, true);
      try {
        const response = await apiFetch('/api/billing/card/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asaas_subscription_id: sid || null,
            card: {
              holder_name: holderName,
              number,
              expiry_month: expiryMonth,
              expiry_year: expiryYear,
              ccv,
            },
          }),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          const requestId = String(data?.request_id || '').trim();
          const msg = `${data.error || 'Atualização de cartão indisponível no momento.'}${requestId ? ` (request_id: ${requestId})` : ''}`;
          setInlineAlert(updateCardNotice, 'danger', msg);
          setInlineAlert(paymentInlineNotice, 'danger', msg);
          showToast('danger', 'Atualização de cartão', msg);
          setPortalNotice(msg, 'err');
          return;
        }
        const providerFlow = String(data.provider_flow || '').trim();
        const okMsg = `Cartão atualizado sem cobrança imediata (${providerFlow || 'ASAAS_SUBSCRIPTION_CREDITCARD_PUT'}).`;
        setInlineAlert(paymentInlineNotice, 'success', okMsg);
        showToast('success', 'Atualização de cartão', okMsg);
        setPortalNotice(okMsg, 'ok');
        await loadBillingSnapshot(true);
        closePortalModal(updateCardModal);
      } finally {
        setButtonLoading(updateCardConfirmBtn, false);
      }
    });

    if (featureCancelSubscription && cancelSubscriptionBtn && cancelSubscriptionModal) {
      const syncCancelSubmitState = () => {
        const canConfirm = String(cancelConfirmText?.value || '').trim().toUpperCase() === 'CANCELAR';
        if (cancelSubscriptionSubmitBtn) {
          cancelSubscriptionSubmitBtn.disabled = !canConfirm;
        }
      };
      cancelSubscriptionBtn.addEventListener('click', () => {
        setInlineAlert(cancelSubscriptionNotice, '', '');
        if (cancelConfirmText) cancelConfirmText.value = '';
        syncCancelSubmitState();
        openPortalModal(cancelSubscriptionModal);
        cancelConfirmText?.focus();
      });
      cancelSubscriptionCancelBtn?.addEventListener('click', () => closePortalModal(cancelSubscriptionModal));
      cancelSubscriptionCloseBtn?.addEventListener('click', () => closePortalModal(cancelSubscriptionModal));
      cancelSubscriptionModal.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(cancelSubscriptionModal));
      cancelConfirmText?.addEventListener('input', syncCancelSubmitState);
      syncCancelSubmitState();
      cancelSubscriptionForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (String(cancelConfirmText?.value || '').trim().toUpperCase() !== 'CANCELAR') {
          setInlineAlert(cancelSubscriptionNotice, 'danger', 'Digite CANCELAR para confirmar.');
          cancelConfirmText?.focus();
          return;
        }
        const sid = String(cancelSubscriptionBtn.dataset.subscriptionId || '').trim();
        if (!sid) {
          setInlineAlert(cancelSubscriptionNotice, 'danger', 'Assinatura inválida para cancelamento.');
          return;
        }
        setButtonLoading(cancelSubscriptionSubmitBtn, true);
        setInlineAlert(cancelSubscriptionNotice, '', '');
        try {
          const formPayload = Object.fromEntries(new FormData(cancelSubscriptionForm).entries());
          const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: String(formPayload.mode || 'END_OF_CYCLE') }),
          });
          const data = await parseApiJson(response);
          const protocol = normalizeProtocol(data);
          renderProtocol(paymentProtocolCard, protocol, 'Protocolo de cancelamento');
          if (!response.ok) {
            const errMsg = `${data.error || 'Falha ao solicitar cancelamento.'}${protocol?.requestId ? ` (request_id: ${protocol.requestId})` : ''}`;
            setInlineAlert(cancelSubscriptionNotice, 'danger', errMsg);
            showToast('danger', 'Cancelamento', errMsg);
            return;
          }
          const okMsg = 'Solicitação de cancelamento enviada com sucesso.';
          setInlineAlert(cancelSubscriptionNotice, 'success', okMsg);
          setInlineAlert(paymentInlineNotice, 'warning', `${okMsg} Aguarde a confirmação final pelo webhook.`);
          showToast('success', 'Cancelamento solicitado', okMsg);
          closePortalModal(cancelSubscriptionModal);
          await loadBillingSnapshot(false);
        } finally {
          setButtonLoading(cancelSubscriptionSubmitBtn, false);
          syncCancelSubmitState();
        }
      });
    }

    portalApproveBtn?.addEventListener('click', () => {
      setPortalApprovalNotice('', true);
      portalApprovalNotice?.classList.add('hidden');
      openPortalModal(portalApprovalConfirmModal);
    });
    portalApproveCancelBtn?.addEventListener('click', () => closePortalModal(portalApprovalConfirmModal));
    portalApprovalConfirmModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(portalApprovalConfirmModal));

    portalApproveConfirmBtn?.addEventListener('click', async () => {
      if (portalApproveSending) return;
      portalApproveSending = true;
      portalApproveConfirmBtn.setAttribute('disabled', 'disabled');
      portalApproveBtn?.setAttribute('disabled', 'disabled');
      try {
        const res = await apiFetch('/api/portal/approval/current/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Aprovação confirmada via portal do cliente.' }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível aprovar o site neste momento.');
        }
        closePortalModal(portalApprovalConfirmModal);
        setPortalApprovalNotice('Site aprovado com sucesso. Movendo para publicação...', true);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalApprovalNotice(err?.message || 'Erro ao aprovar o site.', false);
      } finally {
        portalApproveSending = false;
        portalApproveConfirmBtn.removeAttribute('disabled');
        portalApproveBtn?.removeAttribute('disabled');
      }
    });

    portalChangesBtn?.addEventListener('click', () => {
      clearPortalChangesNotice();
      openPortalModal(portalRequestChangesModal);
      portalDescricaoAjuste?.focus();
      updatePortalDescricaoCounter();
    });
    portalChangesCancelBtn?.addEventListener('click', () => closePortalModal(portalRequestChangesModal));
    portalRequestChangesModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(portalRequestChangesModal));
    portalDescricaoAjuste?.addEventListener('input', updatePortalDescricaoCounter);
    updatePortalDescricaoCounter();

    portalRequestChangesForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (portalChangesSending) return;
      clearPortalChangesNotice();
      const descriptionLength = String(portalDescricaoAjuste?.value || '').trim().length;
      if (descriptionLength < 100) {
        setPortalChangesNotice('Descreva sua solicitação com no mínimo 100 caracteres.', false);
        updatePortalDescricaoCounter();
        return;
      }
      portalChangesSending = true;
      portalChangesSubmitBtn?.setAttribute('disabled', 'disabled');
      try {
        const formData = new FormData(portalRequestChangesForm);
        const res = await apiFetch('/api/portal/approval/current/request-changes', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível enviar sua solicitação de ajustes.');
        }
        closePortalModal(portalRequestChangesModal);
        setPortalApprovalNotice(`Solicitação enviada com sucesso (${data.ticket || 'protocolo gerado'}).`, true);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalChangesNotice(err?.message || 'Erro ao enviar solicitação de ajustes.', false);
      } finally {
        portalChangesSending = false;
        updatePortalDescricaoCounter();
      }
    });

    portalPublicationRespondBtn?.addEventListener('click', () => {
      setPortalPublicationNotice('', true);
      portalPublicationNotice?.classList.add('hidden');
      openPublicationDomainModal();
    });
    portalPublicationDomainCancelBtn?.addEventListener('click', closePublicationDomainModal);
    portalPublicationDomainCloseBtn?.addEventListener('click', closePublicationDomainModal);
    portalPublicationAction?.addEventListener('change', syncPublicationActionUi);
    portalPublicationDomainForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (portalPublicationSending) return;
      clearPortalPublicationDomainNotice();

      const requestId = String(portalPublicationRequestId?.value || '').trim();
      const action = String(portalPublicationAction?.value || '').trim().toLowerCase();
      const note = String(portalPublicationNote?.value || '').trim();
      const domain = sanitizeDomainInput(portalPublicationDomain?.value || '');
      if (!requestId) {
        setPortalPublicationDomainNotice('Solicitação inválida para resposta.', false);
        return;
      }
      if (!['approve', 'reject'].includes(action)) {
        setPortalPublicationDomainNotice('Ação inválida.', false);
        return;
      }
      if (action === 'reject' && !domain) {
        setPortalPublicationDomainNotice('Informe o domínio sugerido para rejeitar.', false);
        portalPublicationDomain?.focus();
        return;
      }
      if (domain && !isDomainValid(domain)) {
        setPortalPublicationDomainNotice('Domínio inválido. Use o formato exemplo.com.br', false);
        portalPublicationDomain?.focus();
        return;
      }

      portalPublicationSending = true;
      portalPublicationDomainSubmitBtn?.setAttribute('disabled', 'disabled');
      try {
        const res = await apiFetch('/api/portal/publication/domain/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: requestId,
            action,
            domain: domain || null,
            note: note || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível registrar sua resposta.');
        }
        closePublicationDomainModal();
        setPortalPublicationNotice(
          action === 'approve'
            ? 'Domínio aprovado com sucesso. O monitoramento foi iniciado automaticamente.'
            : 'Rejeição enviada com domínio sugerido. A equipe KoddaHub irá revisar.',
          true,
        );
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setPortalPublicationDomainNotice(err?.message || 'Erro ao enviar resposta de domínio.', false);
      } finally {
        portalPublicationSending = false;
        portalPublicationDomainSubmitBtn?.removeAttribute('disabled');
      }
    });

    $('#operationHistoryToggle')?.addEventListener('click', () => {
      const body = $('#operationHistoryBody');
      if (!body) return;
      body.classList.toggle('hidden');
    });

    const profileForm = $('#profileForm');
    const profileInlineNotice = $('#profileInlineNotice');
    const profileSubmitBtn = $('#profileSubmitBtn');
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert(profileInlineNotice, '', '');
      $$('input', profileForm).forEach((field) => field.classList.remove('is-invalid'));
      const body = Object.fromEntries(new FormData(profileForm).entries());
      const newPassword = String(body.new_password || '').trim();
      const newPasswordConfirm = String(body.new_password_confirm || '').trim();
      if ((newPassword || newPasswordConfirm) && newPassword !== newPasswordConfirm) {
        setInlineAlert(profileInlineNotice, 'danger', 'A confirmação da nova senha não confere.');
        $('#profileNewPasswordConfirm')?.classList.add('is-invalid');
        $('#profileNewPasswordConfirm')?.focus();
        return;
      }
      setButtonLoading(profileSubmitBtn, true);
      try {
        const response = await apiFetch('/api/profile/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          const details = data?.details && typeof data.details === 'object' ? data.details : {};
          const firstError = Object.values(details).find((msg) => !!msg);
          const message = String(firstError || data.error || 'Erro ao atualizar perfil.');
          Object.entries(details).forEach(([key]) => {
            const field = profileForm.querySelector(`[name="${key}"]`);
            field?.classList.add('is-invalid');
          });
          setInlineAlert(profileInlineNotice, 'danger', message);
          setPortalNotice(message, 'err');
          return;
        }
        const successMessage = String(data.message || 'Perfil atualizado com sucesso.');
        setInlineAlert(profileInlineNotice, 'success', successMessage);
        setPortalNotice(successMessage, 'ok');
        showToast('success', 'Perfil atualizado', successMessage);
        const pwd = profileForm.querySelector('[name="account_password"]');
        const np = profileForm.querySelector('[name="new_password"]');
        const npc = profileForm.querySelector('[name="new_password_confirm"]');
        if (pwd) pwd.value = '';
        if (np) np.value = '';
        if (npc) npc.value = '';
      } finally {
        setButtonLoading(profileSubmitBtn, false);
      }
    });

    const modal = $('#briefingModal');
    const briefInlineNotice = $('#briefInlineNotice');
    const setBriefNotice = (msg, type = 'err') => {
      if (!briefInlineNotice) return;
      briefInlineNotice.textContent = msg;
      briefInlineNotice.classList.remove('hidden', 'ok', 'err');
      briefInlineNotice.classList.add(type === 'ok' ? 'ok' : 'err');
    };
    const clearBriefNotice = () => {
      if (!briefInlineNotice) return;
      briefInlineNotice.textContent = '';
      briefInlineNotice.classList.add('hidden');
      briefInlineNotice.classList.remove('ok', 'err');
    };
    const initBriefUploaders = () => {
      $$('.brief-file-input').forEach((input) => {
        const wrap = input.closest('.file-uploader');
        const meta = wrap?.querySelector('.file-uploader-meta');
        const refresh = () => {
          if (!meta) return;
          const files = input.files ? Array.from(input.files) : [];
          if (!files.length) {
            meta.textContent = 'Nenhum arquivo selecionado';
          } else if (files.length === 1) {
            meta.textContent = files[0].name;
          } else {
            meta.textContent = `${files.length} arquivos selecionados`;
          }
        };
        input.addEventListener('change', refresh);
        refresh();
      });
    };
    const openModal = () => {
      if (briefProjectIdInput && !String(briefProjectIdInput.value || '').trim()) {
        briefProjectIdInput.value = String(projectContextSelect?.value || document.body?.dataset?.currentProjectId || '').trim();
      }
      if (briefSourceInput && !String(briefSourceInput.value || '').trim()) {
        briefSourceInput.value = 'dashboard';
      }
      modal?.classList.remove('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('briefing-open');
      clearBriefNotice();
    };
    const closeModal = () => {
      modal?.classList.add('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('briefing-open');
      clearBriefNotice();
      projectCreateFlowPayload = null;
    };
    $$('[data-modal-close]').forEach((el) => el.addEventListener('click', closeModal));
    $('.sidebar-open-briefing')?.addEventListener('click', openModal);

    const draftKey = 'koddahub_briefing_draft_v2';
    const encouragementByStep = {
      1: 'Ótimo começo!',
      2: 'Metade do caminho!',
      3: 'Quase lá!',
      4: 'Últimos detalhes!',
      5: 'Pronto para revisar!',
    };
    let briefStep = 0;
    const maxBriefStep = 5;
    const applyBusinessSuggestions = () => {
      const type = $('select[name="business_type"]')?.value || '';
      const objective = $('textarea[name="objective"]');
      const cta = $('select[name="cta_text"]');
      if (!type || !objective || !cta) return;
      if ((objective.value || '').trim().length > 0) return;
      if (type === 'servicos') {
        objective.value = 'Gerar novos contatos de clientes para orçamento de serviços.';
        cta.value = 'Entrar em contato via WhatsApp';
      } else if (type === 'produtos') {
        objective.value = 'Apresentar produtos e aumentar conversões de vendas.';
        cta.value = 'Comprar agora';
      } else if (type === 'restaurante') {
        objective.value = 'Receber pedidos e reservas com mais agilidade.';
        cta.value = 'Agendar horário';
      }
    };
    const collectCheckedValues = (containerId) => {
      return $$(`#${containerId} input[type="checkbox"]:checked`).map((i) => i.value.trim()).filter(Boolean);
    };
    const buildReview = () => {
      const review = $('#briefReview');
      if (!review) return;
      const data = new FormData($('#briefModalForm'));
      const integrations = collectCheckedValues('integrationsNeeded');
      const pages = collectCheckedValues('pagesNeeded');
      const sections = [
        ['Identidade Visual', [
          `Logo: ${data.get('has_logo') === 'yes' ? 'Já possui' : 'Precisa de criação'}`,
          `Manual de marca: ${data.get('has_brand_manual') || 'Não informado'}`,
          `Cores: ${data.get('brand_colors') || data.get('color_palette') || 'A definir'}`
        ]],
        ['Negócio', [
          `Tipo: ${data.get('business_type') || 'Não informado'}`,
          `Objetivo: ${data.get('objective') || 'Não informado'}`,
          `Público: ${data.get('audience') || 'Não informado'}`
        ]],
        ['Estilo', [
          `Tom: ${data.get('tone_of_voice') || 'Não informado'}`,
          `Estilo visual: ${data.get('style_vibe') || 'Não informado'}`,
          `CTA: ${data.get('cta_text') || 'Não informado'}`
        ]],
        ['Conteúdo', [
          `Páginas: ${pages.join(', ') || 'Não informado'}`,
          `Integrações: ${integrations.join(', ') || 'Não informado'}`,
          `Domínio: ${data.get('domain_target') || 'Não informado'}`
        ]]
      ];
      review.innerHTML = sections.map(([title, items]) => (
        `<article class="brief-review-card"><h5>${title}</h5><ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul></article>`
      )).join('');
    };
    const saveDraft = () => {
      const form = $('#briefModalForm');
      if (!form) return;
      const fd = new FormData(form);
      const obj = {};
      fd.forEach((value, key) => {
        if (value instanceof File) return;
        if (obj[key]) {
          obj[key] = Array.isArray(obj[key]) ? [...obj[key], value] : [obj[key], value];
        } else {
          obj[key] = value;
        }
      });
      obj.pages_needed = collectCheckedValues('pagesNeeded');
      obj.integrations_needed = collectCheckedValues('integrationsNeeded');
      localStorage.setItem(draftKey, JSON.stringify(obj));
    };
    const loadDraft = () => {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      const form = $('#briefModalForm');
      if (!form || !data || typeof data !== 'object') return;
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'pages_needed' || key === 'integrations_needed') return;
        const radio = form.querySelector(`input[name="${key}"][value="${String(value)}"]`);
        if (radio) {
          radio.checked = true;
          return;
        }
        const field = form.querySelector(`[name="${key}"]`);
        if (field && typeof value === 'string') field.value = value;
      });
      (data.pages_needed || []).forEach((v) => {
        const cb = document.querySelector(`#pagesNeeded input[value="${String(v).replace(/"/g, '\\"')}"]`);
        if (cb) cb.checked = true;
      });
      (data.integrations_needed || []).forEach((v) => {
        const cb = document.querySelector(`#integrationsNeeded input[value="${String(v).replace(/"/g, '\\"')}"]`);
        if (cb) cb.checked = true;
      });
    };
    const validateBriefStep = (step) => {
      if (step === 1) {
        const hasLogo = $('input[name="has_logo"]:checked')?.value || '';
        if (!hasLogo) return false;
        if (hasLogo === 'yes' && !$('input[name="logo_file"]')?.files?.length) {
          setBriefNotice('Envie sua logo para continuar (ou escolha que não possui logo).', 'err');
          return false;
        }
        if (hasLogo === 'no' && !($('textarea[name="logo_description"]')?.value || '').trim()) {
          setBriefNotice('Descreva como gostaria da sua logo.', 'err');
          return false;
        }
      }
      if (step === 2) {
        if (!($('textarea[name="objective"]')?.value || '').trim() || !($('textarea[name="audience"]')?.value || '').trim()) {
          setBriefNotice('Preencha objetivo e público-alvo para continuar.', 'err');
          return false;
        }
      }
      if (step === 3) {
        if (!($('select[name="style_vibe"]')?.value || '').trim() || !($('select[name="cta_text"]')?.value || '').trim()) {
          setBriefNotice('Defina estilo visual e CTA principal.', 'err');
          return false;
        }
      }
      if (step === 5 && !$('#briefTerms')?.checked) {
        setBriefNotice('Você precisa concordar com os termos para finalizar.', 'err');
        return false;
      }
      clearBriefNotice();
      return true;
    };
    const renderBriefStep = () => {
      $$('.brief-step').forEach((s) => s.classList.add('hidden'));
      $(`.brief-step[data-brief-step='${briefStep}']`)?.classList.remove('hidden');
      $('#briefPrev') && ($('#briefPrev').disabled = briefStep === 0);
      $('#briefNext')?.classList.toggle('hidden', briefStep === maxBriefStep);
      $('#briefSubmit')?.classList.toggle('hidden', briefStep !== maxBriefStep);
      const percent = ((briefStep + 1) / (maxBriefStep + 1)) * 100;
      const bar = $('#briefProgressBar');
      if (bar) bar.style.width = `${percent}%`;
      $$('.brief-progress-labels span').forEach((el) => {
        const idx = Number(el.getAttribute('data-progress-step') || '-1');
        el.classList.toggle('active', idx <= briefStep);
      });
      const hint = $('#briefProgressHint');
      if (hint) {
        hint.textContent = briefStep === 0
          ? 'Tempo médio: 5-8 minutos'
          : (encouragementByStep[briefStep] || 'Continue preenchendo.');
      }
      if (briefStep === 5) buildReview();
    };

    const toggleConditionalFields = () => {
      const handledNames = new Set();
      $$('[data-brief-toggle]').forEach((control) => {
        const name = control.getAttribute('name');
        if (!name || handledNames.has(name)) return;
        handledNames.add(name);
        const checkedRadio = $(`input[name="${name}"]:checked[data-brief-toggle]`);
        const controlByName = $(`[data-brief-toggle][name="${name}"]`);
        const value = checkedRadio?.value || controlByName?.value || '';
        $$(`.conditional-field[data-show-if^='${name}:']`).forEach((el) => {
          const expected = (el.getAttribute('data-show-if') || '').split(':')[1];
          const allowed = expected.split('|').map((v) => v.trim());
          el.classList.toggle('hidden', !allowed.includes(value));
        });
      });
    };
    $$('[data-brief-toggle]').forEach((control) => control.addEventListener('change', toggleConditionalFields));
    $('select[name="business_type"]')?.addEventListener('change', applyBusinessSuggestions);
    toggleConditionalFields();
    loadDraft();

    $('#briefPrev')?.addEventListener('click', () => { briefStep = Math.max(0, briefStep - 1); renderBriefStep(); });
    $('#briefNext')?.addEventListener('click', () => {
      if (!validateBriefStep(briefStep)) return;
      briefStep = Math.min(maxBriefStep, briefStep + 1);
      renderBriefStep();
    });

    const briefForm = $('#briefModalForm');
    let draftTimer;
    briefForm?.addEventListener('input', () => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 300);
    });
    briefForm?.addEventListener('change', saveDraft);
    briefForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateBriefStep(briefStep)) return;
      const fd = new FormData(briefForm);
      const briefProjectId = String(fd.get('project_id') || '').trim();
      const briefSource = String(fd.get('brief_source') || 'dashboard').trim().toLowerCase();
      const briefPlanCode = String(fd.get('brief_plan_code') || '').trim().toLowerCase();
      const integrations = collectCheckedValues('integrationsNeeded');
      const pages = collectCheckedValues('pagesNeeded');
      fd.set('integrations', integrations.join(', '));
      fd.set('services', [fd.get('services') || '', pages.length ? `Páginas: ${pages.join(', ')}` : ''].filter(Boolean).join('\n'));
      fd.set('extra_requirements', [fd.get('extra_requirements') || '', fd.get('secondary_goals') || '', fd.get('has_differentiation') || ''].filter(Boolean).join('\n'));
      const briefEndpoint = briefProjectId ? `/api/projects/${encodeURIComponent(briefProjectId)}/briefing` : '/api/onboarding/site-brief';
      const r = await apiFetch(briefEndpoint, { method: 'POST', body: fd });
      const d = await r.json();
      const out = $('#briefPromptResult');
      if (!r.ok) {
        if (out) {
          out.classList.remove('hidden', 'ok');
          out.classList.add('err');
          out.textContent = d.error || 'Erro ao salvar briefing';
        }
        setBriefNotice(d.error || 'Erro ao salvar briefing. Revise os dados e tente novamente.', 'err');
        return;
      }
      if (out) {
        out.classList.remove('hidden', 'err');
        out.classList.add('ok');
        out.textContent = 'Briefing enviado com sucesso! Nossa equipe vai analisar e responder em até 24h.';
      }
      setBriefNotice('Briefing enviado com sucesso.', 'ok');
      if (briefSource === 'project_create' && briefProjectId) {
        setPortalNotice('Briefing enviado. Acompanhe o pagamento para ativação completa do projeto.', 'ok');
      } else {
        setPortalNotice('Briefing concluído com sucesso.', 'ok');
      }
      localStorage.removeItem(draftKey);
      projectCreateFlowPayload = null;
      if (briefProjectIdInput) briefProjectIdInput.value = String(projectContextSelect?.value || '').trim();
      if (briefSourceInput) briefSourceInput.value = 'dashboard';
      if (briefPlanCodeInput) briefPlanCodeInput.value = '';
      setTimeout(() => location.reload(), 1000);
    });

    initBriefUploaders();
    renderBriefStep();
    if (document.body.dataset.openBriefing === '1') {
      openModal();
    }

    window.setTimeout(() => {
      $$('.skeleton-ready').forEach((el) => el.classList.remove('skeleton-ready'));
    }, 900);
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
