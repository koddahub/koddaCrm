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
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {}
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
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

    setTab('login');
    setStep(1);
    initAuthKeyBehavior();

    const qp = new URLSearchParams(window.location.search || '');
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

    const validSections = new Set(['dashboard', 'chamados', 'pagamentos', 'operacao', 'planos', 'perfil']);
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
      $$('[data-nav-section]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const section = item.dataset.navSection || 'dashboard';
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

    const featurePlanChangeWebhookConfirmed = document.body?.dataset?.featurePlanChangeWebhookConfirmed === '1';
    const featureCancelSubscription = document.body?.dataset?.featureCancelSubscription === '1';
    const parseApiJson = async (response) => {
      try {
        return await response.json();
      } catch (_) {
        return {};
      }
    };

    const ticketForm = $('#ticketForm');
    const ticketSubmitBtn = $('#ticketSubmitBtn');
    const ticketInlineNotice = $('#ticketInlineNotice');

    const planForm = $('#planForm');
    const planSubmitBtn = $('#planSubmitBtn');
    const planCodeSelect = $('#planCodeSelect');
    const planReason = $('#planReason');
    const planInlineNotice = $('#planInlineNotice');
    const planJustificationCounter = $('#planJustificationCounter');
    const planCurrentCode = (planForm?.dataset?.currentPlan || '').trim().toLowerCase();
    const planPickButtons = $$('.plan-pick-btn');
    const planTiles = $$('.plan-tile[data-plan-code]');
    const planChangeConfirmModal = $('#planChangeConfirmModal');
    const planChangeConfirmText = $('#planChangeConfirmText');
    const planChangeConfirmNotice = $('#planChangeConfirmNotice');
    const planUpgradePaymentWrap = $('#planUpgradePaymentWrap');
    const planUpgradePaymentMethod = $('#planUpgradePaymentMethod');
    const planUpgradePixWrap = $('#planUpgradePixWrap');
    const planUpgradePixPayload = $('#planUpgradePixPayload');
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
    const paymentAlternativeNotice = $('#paymentAlternativeNotice');
    const paymentAlternativeConfirmBtn = $('#paymentAlternativeConfirmBtn');
    const paymentAlternativeCancelBtn = $('#paymentAlternativeCancelBtn');
    const paymentAlternativeCloseBtn = $('#paymentAlternativeCloseBtn');
    const paymentAlternativePixBox = $('#paymentAlternativePixBox');
    const paymentAlternativePixPayload = $('#paymentAlternativePixPayload');
    const paymentAlternativeBoletoBox = $('#paymentAlternativeBoletoBox');
    const paymentAlternativeDigitableLine = $('#paymentAlternativeDigitableLine');
    let paymentAlternativeMode = 'OVERDUE';

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
    const closePortalModal = (el) => {
      if (!el) return;
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

    const pendingPlanStorageKey = (() => {
      const sid = String(planForm?.querySelector('[name="asaas_subscription_id"]')?.value || '').trim();
      return sid ? `portal_plan_change_pending_${sid}` : '';
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
      if (!planSubmitBtn || !featurePlanChangeWebhookConfirmed) return;
      const pending = readPendingPlanChange();
      if (!pending) return;
      const requested = String(pending?.requested_plan_code || '').toLowerCase();
      if (requested && requested === planCurrentCode) {
        clearPendingPlanChange();
        return;
      }
      planSubmitBtn.setAttribute('disabled', 'disabled');
      setInlineAlert(planInlineNotice, 'warning', `Solicitação de troca para ${planNameMap[requested] || requested.toUpperCase()} já enviada e aguardando confirmação do ASAAS.`);
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
          value = String(copySource?.textContent || '').trim();
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
    syncPlanTiles();
    syncPlanCounter();
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

    const executePlanChange = async () => {
      if (!planForm || !planCodeSelect || planSubmitInFlight) return;
      setInlineAlert(planInlineNotice, '', '');
      setInlineAlert(planChangeConfirmNotice, '', '');
      const body = Object.fromEntries(new FormData(planForm).entries());
      const sid = String(body.asaas_subscription_id || '').trim();
      const nextPlanCode = String(body.plan_code || '').trim().toLowerCase();
      const selectedUpgradePaymentMethod = String(planUpgradePaymentMethod?.value || 'CREDIT_CARD').toUpperCase();
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

      planSubmitInFlight = true;
      setButtonLoading(planSubmitBtn, true);
      setButtonLoading(planChangeConfirmSubmitBtn, true);
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/change-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            upgrade_payment_method: selectedUpgradePaymentMethod,
          }),
        });
        const data = await parseApiJson(response);
        if (!response.ok) {
          const requestId = String(data?.request_id || '').trim();
          const errMsg = `${data.error || 'Não foi possível enviar a solicitação de troca.'}${requestId ? ` (request_id: ${requestId})` : ''}`;
          setInlineAlert(planInlineNotice, 'danger', errMsg);
          setInlineAlert(planChangeConfirmNotice, 'danger', errMsg);
          showToast('danger', 'Falha na troca de plano', errMsg);
          setPortalNotice(errMsg, 'err');
          return;
        }

        const direction = String(data.direction || '').toUpperCase();
        if (direction === 'UPGRADE') {
          const prorataAmount = Number(data.prorata_amount || 0);
          const charge = data && typeof data.upgrade_charge === 'object' ? data.upgrade_charge : null;
          const chargeMethod = String(charge?.method || selectedUpgradePaymentMethod || '').toUpperCase();
          const upgradeMsg = prorataAmount > 0
            ? `Upgrade solicitado. Diferença pró-rata: ${formatMoney(prorataAmount)}.`
            : 'Upgrade solicitado com sucesso.';
          setInlineAlert(planInlineNotice, 'success', upgradeMsg);
          setInlineAlert(planChangeConfirmNotice, 'success', upgradeMsg);
          if (chargeMethod === 'PIX') {
            const pixPayload = String(charge?.pix?.payload || '').trim();
            if (planUpgradePixPayload) {
              planUpgradePixPayload.value = pixPayload || 'PIX indisponível no momento.';
            }
            planUpgradePixWrap?.classList.remove('d-none');
            const pixMsg = pixPayload
              ? `${upgradeMsg} Copie o código PIX abaixo para concluir a diferença.`
              : `${upgradeMsg} Não foi possível obter o código PIX agora.`;
            setInlineAlert(planInlineNotice, pixPayload ? 'success' : 'warning', pixMsg);
            setInlineAlert(planChangeConfirmNotice, pixPayload ? 'success' : 'warning', pixMsg);
          } else {
            planUpgradePixWrap?.classList.add('d-none');
            if (planUpgradePixPayload) planUpgradePixPayload.value = '';
          }
          showToast('success', 'Upgrade solicitado', upgradeMsg);
          setPortalNotice(upgradeMsg, 'ok');
          clearPendingPlanChange();
          await loadBillingSnapshot(false);
        } else if (direction === 'DOWNGRADE' || data.scheduled) {
          clearPendingPlanChange();
          const effectiveAt = String(data.effective_at || '').trim();
          const scheduledMsg = effectiveAt
            ? `Downgrade agendado para ${formatDate(effectiveAt, true)}. A mudança entra em vigor no próximo vencimento.`
            : 'Downgrade agendado. A mudança entra em vigor no próximo vencimento.';
          setInlineAlert(planInlineNotice, 'warning', scheduledMsg);
          setInlineAlert(planChangeConfirmNotice, 'warning', scheduledMsg);
          showToast('info', 'Mudança agendada', scheduledMsg);
          setPortalNotice(scheduledMsg, 'ok');
        } else if (featurePlanChangeWebhookConfirmed) {
          const payload = {
            requested_plan_code: nextPlanCode,
            action_id: data?.action_id || null,
            request_id: data?.request_id || null,
            created_at: new Date().toISOString(),
          };
          writePendingPlanChange(payload);
          planSubmitBtn.setAttribute('disabled', 'disabled');
          const pendingMsg = 'Solicitação enviada. Aguardando confirmação do ASAAS para aplicar a troca.';
          setInlineAlert(planInlineNotice, 'warning', pendingMsg);
          showToast('info', 'Troca solicitada', pendingMsg);
          setPortalNotice(pendingMsg, 'ok');
        } else {
          clearPendingPlanChange();
          const successMsg = direction === 'NOOP'
            ? 'Plano já está no valor atual (sem alterações).'
            : 'Troca de plano solicitada com sucesso.';
          setInlineAlert(planInlineNotice, 'success', successMsg);
          setInlineAlert(planChangeConfirmNotice, 'success', successMsg);
          showToast('success', 'Troca de plano', successMsg);
          setPortalNotice(successMsg, 'ok');
          await loadBillingSnapshot(false);
        }
        if (direction !== 'UPGRADE' || String(data?.upgrade_charge?.method || '').toUpperCase() !== 'PIX') {
          closePortalModal(planChangeConfirmModal);
        }
      } finally {
        planSubmitInFlight = false;
        setButtonLoading(planSubmitBtn, false);
        setButtonLoading(planChangeConfirmSubmitBtn, false);
        applyPendingPlanUi();
      }
    };

    planForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setInlineAlert(planInlineNotice, '', '');
      setInlineAlert(planChangeConfirmNotice, '', '');
      if (featurePlanChangeWebhookConfirmed) {
        const existingPending = readPendingPlanChange();
        const pendingRequested = String(existingPending?.requested_plan_code || '').toLowerCase();
        if (existingPending && pendingRequested && pendingRequested !== planCurrentCode) {
          setInlineAlert(planInlineNotice, 'warning', 'Já existe uma solicitação de troca pendente de confirmação.');
          return;
        }
      }
      const selectedCode = String(planCodeSelect?.value || '').toLowerCase();
      const selectedName = planNameMap[selectedCode] || selectedCode.toUpperCase();
      const currentName = planNameMap[planCurrentCode] || planCurrentCode.toUpperCase();
      const planPriceMap = { basic: 149.99, profissional: 249.00, pro: 399.00 };
      const selectedValue = Number(planPriceMap[selectedCode] || 0);
      const currentValue = Number(planPriceMap[planCurrentCode] || 0);
      const isUpgrade = selectedValue > currentValue;
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
      if (planUpgradePixWrap) {
        planUpgradePixWrap.classList.add('d-none');
      }
      if (planUpgradePixPayload) {
        planUpgradePixPayload.value = '';
      }
      if (planUpgradePaymentMethod) {
        planUpgradePaymentMethod.value = 'CREDIT_CARD';
      }
      openPortalModal(planChangeConfirmModal);
      planChangeConfirmSubmitBtn?.focus();
    });
    planChangeConfirmSubmitBtn?.addEventListener('click', executePlanChange);
    planChangeConfirmCancelBtn?.addEventListener('click', () => closePortalModal(planChangeConfirmModal));
    planChangeConfirmCloseBtn?.addEventListener('click', () => closePortalModal(planChangeConfirmModal));
    planChangeConfirmModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(planChangeConfirmModal));

    const openPaymentAlternativeModal = (mode) => {
      paymentAlternativeMode = mode;
      if (paymentAlternativeTitle) {
        paymentAlternativeTitle.textContent = mode === 'ANTICIPATE' ? 'Antecipar cobrança via PIX/BOLETO' : 'Pagar cobrança em atraso';
      }
      if (paymentAlternativeMethod) {
        paymentAlternativeMethod.value = mode === 'ANTICIPATE' ? 'PIX' : 'PIX';
      }
      if (paymentAlternativePixBox) paymentAlternativePixBox.hidden = true;
      if (paymentAlternativeBoletoBox) paymentAlternativeBoletoBox.hidden = true;
      if (paymentAlternativePixPayload) paymentAlternativePixPayload.value = '';
      if (paymentAlternativeDigitableLine) paymentAlternativeDigitableLine.value = '';
      setInlineAlert(paymentAlternativeNotice, '', '');
      openPortalModal(paymentAlternativeModal);
      paymentAlternativeMethod?.focus();
    };
    payNowBtn?.addEventListener('click', () => openPaymentAlternativeModal('OVERDUE'));
    anticipatePixBtn?.addEventListener('click', () => openPaymentAlternativeModal('ANTICIPATE'));
    paymentAlternativeCancelBtn?.addEventListener('click', () => closePortalModal(paymentAlternativeModal));
    paymentAlternativeCloseBtn?.addEventListener('click', () => closePortalModal(paymentAlternativeModal));
    paymentAlternativeModal?.querySelector('.portal-modal-backdrop')?.addEventListener('click', () => closePortalModal(paymentAlternativeModal));
    paymentAlternativeConfirmBtn?.addEventListener('click', async () => {
      const sid = String(payNowBtn?.dataset?.subscriptionId || '').trim();
      if (!sid) {
        setInlineAlert(paymentAlternativeNotice, 'danger', 'Assinatura inválida para cobrança.');
        return;
      }
      const billingType = String(paymentAlternativeMethod?.value || 'PIX').toUpperCase();
      setInlineAlert(paymentAlternativeNotice, '', '');
      setButtonLoading(paymentAlternativeConfirmBtn, true);
      try {
        const response = await apiFetch(`/api/billing/subscriptions/${encodeURIComponent(sid)}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billing_type: billingType, mode: paymentAlternativeMode }),
        });
        const data = await parseApiJson(response);
        const protocol = normalizeProtocol(data);
        renderProtocol(paymentProtocolCard, protocol, 'Protocolo financeiro');
        if (!response.ok) {
          const msg = `${data.error || 'Não foi possível gerar cobrança alternativa.'}${protocol?.requestId ? ` (request_id: ${protocol.requestId})` : ''}`;
          setInlineAlert(paymentAlternativeNotice, 'danger', msg);
          setInlineAlert(paymentInlineNotice, 'danger', msg);
          return;
        }
        if (data.billing_type === 'PIX') {
          const payload = String(data?.pix?.payload || '').trim();
          if (paymentAlternativePixBox) paymentAlternativePixBox.hidden = false;
          if (paymentAlternativeBoletoBox) paymentAlternativeBoletoBox.hidden = true;
          if (paymentAlternativePixPayload) paymentAlternativePixPayload.value = payload || 'Payload PIX indisponível no momento.';
        } else {
          const line = String(data.digitable_line || '').trim();
          if (paymentAlternativeBoletoBox) paymentAlternativeBoletoBox.hidden = false;
          if (paymentAlternativePixBox) paymentAlternativePixBox.hidden = true;
          if (paymentAlternativeDigitableLine) {
            paymentAlternativeDigitableLine.value = line || String(data.bank_slip_url || '').trim() || 'Linha digitável indisponível.';
          }
        }
        setInlineAlert(paymentAlternativeNotice, 'success', 'Cobrança alternativa gerada com sucesso.');
        setInlineAlert(paymentInlineNotice, 'success', 'Cobrança alternativa pronta no modal.');
        await loadBillingSnapshot(false);
      } finally {
        setButtonLoading(paymentAlternativeConfirmBtn, false);
      }
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
      if (!holderName || number.length < 13 || number.length > 19 || !expiryMonth || !expiryYear || ccv.length < 3 || ccv.length > 4) {
        setInlineAlert(updateCardNotice, 'danger', 'Preencha os dados do cartão corretamente.');
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
      modal?.classList.remove('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'false');
      clearBriefNotice();
    };
    const closeModal = () => {
      modal?.classList.add('hidden');
      if (modal) modal.setAttribute('aria-hidden', 'true');
      clearBriefNotice();
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
      $$('[data-brief-toggle]').forEach((control) => {
        const name = control.getAttribute('name');
        const value = control.value;
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
      const integrations = collectCheckedValues('integrationsNeeded');
      const pages = collectCheckedValues('pagesNeeded');
      fd.set('integrations', integrations.join(', '));
      fd.set('services', [fd.get('services') || '', pages.length ? `Páginas: ${pages.join(', ')}` : ''].filter(Boolean).join('\n'));
      fd.set('extra_requirements', [fd.get('extra_requirements') || '', fd.get('secondary_goals') || '', fd.get('has_differentiation') || ''].filter(Boolean).join('\n'));
      const r = await apiFetch('/api/onboarding/site-brief', { method: 'POST', body: fd });
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
      setPortalNotice('Briefing concluído com sucesso.', 'ok');
      localStorage.removeItem(draftKey);
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
