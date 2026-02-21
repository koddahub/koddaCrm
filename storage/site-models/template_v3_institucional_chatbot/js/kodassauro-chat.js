/*
 * KODASSAURO-CHAT.JS
 * Chatbot local (sem IA) para KoddaHub.
 * Versão: 6.0.0 - Filtro de palavras impróprias
 * 
 * Funcionalidades:
 * - Filtro de palavras de baixo calão
 * - Resposta educada para linguagem inadequada
 * - Mensagens fofas e acolhedoras
 * - Opção de não informar telefone
 */

(() => {
  "use strict";

  const IS_DEMO_PAGE = /\/pages\//.test(window.location.pathname);
  const DEMO_PREFIX = IS_DEMO_PAGE ? "" : "pages/";
  const INDEX_PREFIX = IS_DEMO_PAGE ? "../" : "";

  // ============================================================================
  // CONFIGURAÇÕES GLOBAIS
  // ============================================================================

  const KODASSAURO_CONFIG = {
    copy: {
      brandName: "KoddaHub",
      assistantName: "Kodassauro",
      whatsappMessage: "Olá! Vim pelo site da KoddaHub e gostaria de falar com um especialista.",
    },
    channels: {
      whatsapp: {
        url: "https://wa.me/554192272854?text=",
        label: "WhatsApp",
        icon: "fab fa-whatsapp",
        color: "#25D366",
      },
      telegram: {
        url: "https://t.me/koddahub",
        label: "Telegram",
        icon: "fab fa-telegram-plane",
        color: "#0088cc",
      },
      instagram: {
        url: "https://instagram.com/koddahub",
        label: "Instagram",
        icon: "fab fa-instagram",
        color: "#E4405F",
      },
      email: {
        url: "mailto:contato@koddahub.com?subject=Contato%20KoddaHub&body=",
        label: "E-mail",
        icon: "fas fa-envelope",
        color: "#EA4335",
      },
    },
    notifications: {
      enabled: true,
      intervalMs: 120000,
      maxBadge: 9,
    },
    typing: {
      speed: 30,
      maxTime: 2000,
    },
    api: {
      scriptURL: "https://script.google.com/macros/s/AKfycbzL1cRLo7qBMGfwSaF6UF_nuv6qiPF0TdF36UD11A0RHpVohCeB7VW0y2I0F-ny0GkL/exec",
    },
    products: {
      institucional: {
        name: "Site Institucional",
        icon: "🏢",
        demo: "pages/demo-institucional.html"
      },
      ecommerce: {
        name: "E-commerce",
        icon: "🛒",
        demo: "pages/demo-ecommerce.html"
      },
      industrial: {
        name: "Site Industrial",
        icon: "🏭",
        demo: "pages/demo-industrial.html"
      },
      servicos: {
        name: "Site de Serviços",
        icon: "💼",
        demo: "pages/demo-servicos.html"
      },
      sistemas: {
        name: "Sistemas Empresariais",
        icon: "⚙️",
        demo: "#contato"
      },
      customizacao: {
        name: "Customização de Sistemas",
        icon: "🔧",
        demo: "#contato"
      },
      hospedagem: {
        name: "Plano de Hospedagem",
        icon: "🚀",
        demo: "#planos-hospedagem"
      }
    },
    // ============================================
    // FILTRO DE PALAVRAS IMPRÓPRIAS
    // ============================================
    profanityFilter: {
      enabled: true,
      // Lista de palavras proibidas (em minúsculo, sem acentos)
      blockedWords: [
        'cu', 'cú', 'caralho', 'porra', 'puta', 'puto', 'merda', 'bosta',
        'foda', 'foder', 'fuder', 'filho da puta', 'filha da puta', 'pau no cu',
        'vai tomar no cu', 'vtnc', 'tnc', 'arrombado', 'arrombada', 'desgraça',
        'desgracado', 'desgracada', 'viado', 'bicha', 'sapatão', 'boiola',
        'chupa', 'chupar', 'rola', 'pinto', 'piroca', 'pica', 'buceta', 'xota',
        'cacete', 'cacetinho', 'babaca', 'otário', 'otaria', 'idiota', 'imbecil',
        'retardado', 'retardada', 'mongol', 'mongoloide', 'trouxa', 'burro', 'burra',
        'canalha', 'pilantra', 'vagabundo', 'vagabunda', 'lixo', 'escoria',
        'escroto', 'escrota', 'fdp', 'pqp', 'kct', 'carai', 'krl', 'porr',
        'puta que pariu', 'puta que o pariu', 'puta merda'
      ],
      // Mensagens de resposta educada
      responses: [
        "😊 Opa! Vamos manter uma conversa respeitosa aqui? Como posso ajudar de verdade?",
        "🦕 Sou um assistente amigável! Que tal tentarmos de novo com palavras mais legais?",
        "🤗 Acredito que você possa se expressar melhor sem usar esse tipo de palavra. Como posso te ajudar?",
        "💙 Vamos manter um ambiente agradável para todos? Me diga como posso ajudar você!",
        "😅 Acho que não entendi... Pode reformular de outra forma?",
        "🌟 Por favor, vamos conversar numa boa! Me conta qual seu interesse?",
        "🫶 Aqui a gente gosta de conversas positivas! Em que posso ser útil?",
        "🥰 Sei que você pode ser mais legal! Vamos tentar de novo?"
      ]
    }
  };

  const STORAGE = {
    state: "kodassauro.chat.state.v16",
    leads: "kodassauro.chat.leads.v1",
    pendingSync: "kodassauro.chat.pending.v1",
    profanityLog: "kodassauro.chat.profanity.v1", // Log de tentativas
  };

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function nowTs() {
    return Date.now();
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function openUrl(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function validatePhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 10;
  }

  function calculateTypingDelay(text) {
    return Math.min(text.length * 30, 2000);
  }

  // ============================================================================
  // FILTRO DE PALAVRAS IMPRÓPRIAS
  // ============================================================================

  function containsProfanity(text) {
    if (!KODASSAURO_CONFIG.profanityFilter.enabled || !text) return false;
    
    const normalizedText = text.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, ' ') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
    
    // Verifica palavras exatas
    const words = normalizedText.split(' ');
    
    for (const word of words) {
      if (KODASSAURO_CONFIG.profanityFilter.blockedWords.includes(word)) {
        logProfanity(text, word);
        return true;
      }
    }
    
    // Verifica frases completas
    for (const blocked of KODASSAURO_CONFIG.profanityFilter.blockedWords) {
      if (blocked.includes(' ') && normalizedText.includes(blocked)) {
        logProfanity(text, blocked);
        return true;
      }
    }
    
    return false;
  }

  function logProfanity(originalText, detectedWord) {
    try {
      const log = load(STORAGE.profanityLog, []);
      log.push({
        timestamp: nowTs(),
        date: new Date().toISOString(),
        text: originalText,
        detected: detectedWord,
        page: window.location.pathname
      });
      // Mantém apenas os últimos 100 logs
      if (log.length > 100) log.shift();
      save(STORAGE.profanityLog, log);
    } catch {}
    
    console.warn(`[Kodassauro] Palavra imprópria detectada: "${detectedWord}"`);
  }

  function getRandomProfanityResponse() {
    const responses = KODASSAURO_CONFIG.profanityFilter.responses;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  function getProductFromCard(card) {
    const productHint = card?.dataset?.koddaProduct || '';
    const title = card.querySelector('h3')?.textContent || '';
    const link = card.querySelector('.btn-link')?.getAttribute('href') || '';

    if (productHint.includes('hospedagem')) return KODASSAURO_CONFIG.products.hospedagem;
    
    if (link.includes('institucional')) return KODASSAURO_CONFIG.products.institucional;
    if (link.includes('ecommerce')) return KODASSAURO_CONFIG.products.ecommerce;
    if (link.includes('industrial')) return KODASSAURO_CONFIG.products.industrial;
    if (link.includes('servicos')) return KODASSAURO_CONFIG.products.servicos;
    
    if (title.includes('Institucional')) return KODASSAURO_CONFIG.products.institucional;
    if (title.includes('E-commerce')) return KODASSAURO_CONFIG.products.ecommerce;
    if (title.includes('Industrial')) return KODASSAURO_CONFIG.products.industrial;
    if (title.includes('Serviços')) return KODASSAURO_CONFIG.products.servicos;
    if (title.includes('Sistemas')) return KODASSAURO_CONFIG.products.sistemas;
    if (title.includes('Customização')) return KODASSAURO_CONFIG.products.customizacao;
    if (title.includes('Básico') || title.includes('Profissional') || title.includes('Pro')) return KODASSAURO_CONFIG.products.hospedagem;
    
    return { name: "solução digital", icon: "💻" };
  }

  // ============================================================================
  // FUNÇÃO DE SCROLL
  // ============================================================================

  function scrollToBottom(element) {
    if (!element) return;
    
    element.scrollTo({
      top: element.scrollHeight,
      behavior: 'smooth'
    });
    
    setTimeout(() => {
      element.scrollTop = element.scrollHeight;
    }, 100);
  }

  // ============================================================================
  // SISTEMA DE MENSAGENS
  // ============================================================================

  const MessageSystem = {
    typingIndicator: null,
    isTyping: false,

    showTyping(container) {
      if (this.isTyping) return;
      this.isTyping = true;

      this.typingIndicator = document.createElement("div");
      this.typingIndicator.className = "kds-msg is-bot typing-indicator";
      this.typingIndicator.innerHTML = `
        <div class="kds-bubble">
          <div class="typing-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      `;
      container.appendChild(this.typingIndicator);
      scrollToBottom(container);
    },

    hideTyping() {
      this.isTyping = false;
      if (this.typingIndicator) {
        this.typingIndicator.remove();
        this.typingIndicator = null;
      }
    },

    addMessage(from, text, container) {
      const msg = { from, text: String(text || ""), ts: nowTs() };
      
      if (from === "user") {
        this.renderMessage(msg, container);
      } else {
        this.showTyping(container);
        setTimeout(() => {
          this.hideTyping();
          this.renderMessage(msg, container);
        }, calculateTypingDelay(text));
      }
      
      return msg;
    },

    renderMessage(msg, container) {
      const wrapper = document.createElement("div");
      wrapper.className = `kds-msg ${msg.from === "user" ? "is-user" : "is-bot"}`;

      const bubble = document.createElement("div");
      bubble.className = "kds-bubble";

      const content = document.createElement("div");
      if (msg.from === "bot") {
        content.innerHTML = msg.text
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>');
      } else {
        content.textContent = msg.text;
      }

      const time = document.createElement("span");
      time.className = "kds-time";
      time.textContent = fmtTime(msg.ts);

      bubble.appendChild(content);
      bubble.appendChild(time);
      wrapper.appendChild(bubble);
      container.appendChild(wrapper);
      
      scrollToBottom(container);
    },

    renderAll(messages, container) {
      container.innerHTML = "";
      messages.forEach(msg => this.renderMessage(msg, container));
    },
  };

  // ============================================================================
  // SISTEMA DE CANAIS
  // ============================================================================

  const ChannelSystem = {
    renderChannelButtons(container) {
      if (!container) return;
      
      container.innerHTML = '';
      
      const label = document.createElement("div");
      label.className = "channels-label";
      label.textContent = "ATENDIMENTO RÁPIDO";
      container.appendChild(label);
      
      const channelsDiv = document.createElement("div");
      channelsDiv.className = "channels-grid channels-grid-4";

      const channelOrder = ['whatsapp', 'telegram', 'instagram', 'email'];
      
      channelOrder.forEach(key => {
        const channel = KODASSAURO_CONFIG.channels[key];
        if (!channel) return;

        const btn = document.createElement("a");
        btn.href = "#";
        btn.className = `channel-btn ${key}-btn`;
        btn.setAttribute("data-channel", key);
        btn.setAttribute("title", `Conversar no ${channel.label}`);
        btn.style.backgroundColor = channel.color;
        btn.innerHTML = `<i class="${channel.icon}"></i><span>${channel.label}</span>`;

        btn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openChannel(key);
        });

        channelsDiv.appendChild(btn);
      });

      container.appendChild(channelsDiv);
    },

    openChannel(channelKey, customMessage = "") {
      const channel = KODASSAURO_CONFIG.channels[channelKey];
      if (!channel) return;

      let url = channel.url;
      if (channelKey === "whatsapp" || channelKey === "email") {
        url += encodeURIComponent(customMessage || KODASSAURO_CONFIG.copy.whatsappMessage);
      }
      openUrl(url);
    },
  };

  // ============================================================================
  // FLUXO DE CAPTURA - COM FILTRO DE PALAVRAS
  // ============================================================================

  const LeadCaptureFlow = {
    start(messagesEl, addMessage, appendLead, state, selectedProduct = null) {
      state.mode = "capture";
      state.step = "name";
      state.phoneAttempts = 0;
      state.profanityCount = 0; // Contador de palavras impróprias
      state.leadDraft = { 
        name: "", 
        phone: "", 
        email: "",
        product: selectedProduct || { name: "solução digital", icon: "💻" }
      };

      addMessage(
        "bot",
        `🦕 Oi! Sou o <strong>Kodassauro</strong>, seu amiguinho virtual da KoddaHub! ${state.leadDraft.product.icon}<br><br>` +
        `Que legal que você se interessou por <strong>${state.leadDraft.product.name}</strong>! Vou te ajudar com isso.`
      );

      setTimeout(() => {
        addMessage("bot", "✨ <strong>Primeiro, me conta seu nome?</strong> (pode ser só o primeiro nome mesmo 😊)");
      }, 2000);
    },

    handleInput(text, state, messagesEl, addMessage, appendLead) {
      const t = String(text || "").trim();
      if (!t) return;

      // ============================================
      // FILTRO DE PALAVRAS IMPRÓPRIAS
      // ============================================
      if (containsProfanity(t)) {
        state.profanityCount = (state.profanityCount || 0) + 1;
        
        // Se já passou de 3 tentativas, bloqueia
        if (state.profanityCount >= 3) {
          addMessage(
            "bot",
            "😔 <strong>Que pena...</strong> Parece que não estamos conseguindo conversar de forma respeitosa.<br><br>" +
            "Por favor, reinicie o chat e vamos tentar de novo numa boa! 🦕"
          );
          return;
        }
        
        // Resposta educada aleatória
        addMessage("bot", getRandomProfanityResponse());
        return;
      }

      // PASSO 1: Nome
      if (state.step === "name") {
        if (t.length < 2) {
          addMessage("bot", "🫢 Ah, não consegui entender direito... Pode me dizer seu nome novamente?");
          return;
        }
        
        state.leadDraft.name = t;
        state.step = "phone";
        
        setTimeout(() => {
          addMessage(
            "bot", 
            `🥰 <strong>Que nome lindo, ${state.leadDraft.name}!</strong><br><br>` +
            `Fiquei sabendo que você quer um <strong>${state.leadDraft.product.name}</strong>! 🎯<br><br>` +
            `Para continuar, <strong>qual seu WhatsApp</strong> com DDD? (ex: 41999999999)<br>` +
            `💡 *Se não quiser compartilhar, é só dizer "não quero"*`
          );
        }, 800);
        return;
      }

      // PASSO 2: WhatsApp (com tentativas e opção de pular)
      if (state.step === "phone") {
        
        // Verifica se usuário não quer informar
        const naoQuero = /não quero|nao quero|não|nao|skip|pular|depois|agora não/i.test(t);
        
        if (naoQuero) {
          state.step = "email";
          setTimeout(() => {
            addMessage(
              "bot",
              `🤗 <strong>Tudo bem, ${state.leadDraft.name}!</strong> Entendo que você não se sente confortável em compartilhar o telefone agora.<br><br>` +
              `Que tal me passar seu <strong>e-mail</strong>? Assim meus humanos podem entrar em contato de outro jeito! 📧`
            );
          }, 500);
          return;
        }
        
        const digits = t.replace(/\D/g, "");
        
        if (digits.length >= 10) {
          state.leadDraft.phone = t;
          state.phoneAttempts = 0;
          state.step = "email";
          
          setTimeout(() => {
            addMessage("bot", `📧 Agora, <strong>qual seu e-mail</strong> para eu enviar a proposta? (pode ficar tranquilo, não vou encher sua caixa de spam 😉)`);
          }, 800);
          return;
        }
        
        state.phoneAttempts = (state.phoneAttempts || 0) + 1;
        
        const messages = [
          "🫣 <strong>Ops! Percebi um pequeno erro...</strong><br><br>O número que você digitou não parece ser um telefone válido. Vamos tentar de novo? (ex: 41999999999)",
          
          "😅 <strong>Quase lá!</strong> Acho que ainda não é um número válido. Pode ser no formato 41999999999? Vamos tentar mais uma vez?",
          
          "🥺 <strong>Ah, vamos tentar de novo?</strong> Se preferir, pode me dizer 'não quero' e passamos direto para o e-mail!<br><br>Qual seu WhatsApp?"
        ];
        
        if (state.phoneAttempts <= 3) {
          addMessage("bot", messages[state.phoneAttempts - 1]);
          
          if (state.phoneAttempts === 3) {
            setTimeout(() => {
              addMessage("bot", "💡 <strong>Dica:</strong> Se não quiser informar o telefone, é só digitar <strong>'não quero'</strong> que a gente pula essa parte!");
            }, 1500);
          }
        } else {
          state.step = "email";
          setTimeout(() => {
            addMessage(
              "bot",
              `🤗 <strong>Entendo, ${state.leadDraft.name}!</strong> Vamos pular o telefone então.<br><br>` +
              `Me passa seu <strong>e-mail</strong> que meus humanos entram em contato por lá, combinado?`
            );
          }, 500);
        }
        return;
      }

      // PASSO 3: Email
      if (state.step === "email") {
        if (!validateEmail(t)) {
          addMessage("bot", "😕 Hmm, esse e-mail não parece válido. Pode verificar e tentar de novo? (ex: nome@email.com)");
          return;
        }
        
        state.leadDraft.email = t;
        appendLead(state.leadDraft);

        addMessage(
          "bot",
          `🎉 <strong>Perfeito, ${state.leadDraft.name}!</strong> Muito obrigado pelas informações!<br><br>` +
          `Agora vou te conectar com um especialista no WhatsApp para conversarmos sobre <strong>${state.leadDraft.product.name}</strong>! 🚀`
        );

        setTimeout(() => {
          const telefone = state.leadDraft.phone ? `Meu telefone é ${state.leadDraft.phone}. ` : '';
          const whatsappMessage = 
            `Olá! Me chamo ${state.leadDraft.name}. ` +
            `Tenho interesse em ${state.leadDraft.product.name}. ` +
            `${telefone}` +
            `Meu email é ${state.leadDraft.email}. ` +
            `Podemos conversar?`;
          
          ChannelSystem.openChannel("whatsapp", whatsappMessage);
        }, 2000);

        setTimeout(() => {
          state.mode = "idle";
          state.step = "idle";
          addMessage("bot", "😊 Em que mais posso ajudar? É só digitar!");
        }, 4000);
      }
    },
  };

  // ============================================================================
  // ESTADO INICIAL
  // ============================================================================

  const initialState = {
    isOpen: false,
    mode: "idle",
    step: "idle",
    messages: [],
    leadDraft: { name: "", phone: "", email: "", product: null },
    notifCount: 0,
    phoneAttempts: 0,
    profanityCount: 0,
  };

  // ============================================================================
  // FUNÇÃO PRINCIPAL DE SALVAR LEAD
  // ============================================================================

  function appendLead(lead) {
    const enrichedLead = { 
      ...lead, 
      productName: lead.product?.name || 'não informado',
      productIcon: lead.product?.icon || '',
      ts: nowTs(),
      date: new Date().toISOString(),
      page: window.location.pathname,
      pageName: window.location.pathname.split('/').pop() || 'index.html',
      userAgent: navigator.userAgent,
      sessionId: `session_${nowTs()}_${Math.random().toString(36).substr(2, 9)}`,
      forneceuTelefone: !!lead.phone,
      synced: false
    };

    const leads = load(STORAGE.leads, []);
    leads.push(enrichedLead);
    save(STORAGE.leads, leads);

    try {
      const formData = new URLSearchParams();
      formData.append('nome', lead.name || 'não informado');
      formData.append('email', lead.email || 'não informado');
      formData.append('telefone', lead.phone || 'não informado');
      formData.append('produto', lead.product?.name || 'não informado');
      formData.append('assunto', `Interesse em ${lead.product?.name || 'solução digital'}`);
      formData.append('pagina_origem', window.location.pathname.split('/').pop() || 'index.html');
      formData.append('fonte_lead', 'chat_kodassauro');
      formData.append('forneceu_telefone', lead.phone ? 'sim' : 'não');
      
      fetch(KODASSAURO_CONFIG.api.scriptURL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        mode: 'no-cors'
      }).catch(() => {});
    } catch {}

    return enrichedLead;
  }

  // ============================================================================
  // INICIALIZAÇÃO PRINCIPAL
  // ============================================================================

  function init() {
    try {
      const root = document.getElementById("kodassauroRoot");
      if (!root) return;

      const toggleBtn = $(".kodassauro-toggle", root);
      const badge = $(".kodassauro-badge", root);
      const panel = $("#kodassauroPanel", root);
      const closeBtn = $(".kodassauro-close", root);
      const messagesEl = $("#kodassauroMessages", root);
      const quickEl = $("#kodassauroQuick", root);
      const composer = $("#kodassauroComposer", root);
      const input = $("#kodassauroInput", root);

      if (!toggleBtn || !panel || !closeBtn || !messagesEl || !quickEl || !composer || !input) {
        return;
      }

      quickEl.style.display = 'none';
      quickEl.innerHTML = '';

      // ============================================
      // BOTÕES "PRICE"
      // ============================================
      function setupPriceButtons() {
        const priceButtons = $$('.price, button.price, .card-footer .price, .solution-card .price');
        priceButtons.forEach(button => {
          button.removeEventListener('click', handlePriceClick);
          button.addEventListener('click', handlePriceClick);
        });
      }

      function setupHostingButtons() {
        const hostingButtons = $$('.hosting-plan-cta[data-kodda-product]');
        hostingButtons.forEach(button => {
          button.removeEventListener('click', handleHostingClick);
          button.addEventListener('click', handleHostingClick);
        });
      }

      function handlePriceClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const card = e.currentTarget.closest('.solution-card, .modern-card');
        let selectedProduct = null;
        
        if (card) {
          selectedProduct = getProductFromCard(card);
        }
        
        if (window.KodassauroChat && typeof window.KodassauroChat.open === 'function') {
          window.KodassauroChat.open(selectedProduct);
          
          toggleBtn.classList.add('kodassauro-bark');
          setTimeout(() => toggleBtn.classList.remove('kodassauro-bark'), 900);
        }
      }

      function handleHostingClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const card = e.currentTarget.closest('.hosting-plan-card');
        const productType = e.currentTarget.getAttribute('data-kodda-product') || '';
        let selectedProduct = KODASSAURO_CONFIG.products.hospedagem;
        if (productType.includes('hospedagem')) selectedProduct = KODASSAURO_CONFIG.products.hospedagem;
        if (card) selectedProduct = getProductFromCard(card);

        if (window.KodassauroChat && typeof window.KodassauroChat.open === 'function') {
          window.KodassauroChat.open(selectedProduct);
          toggleBtn.classList.add('kodassauro-bark');
          setTimeout(() => toggleBtn.classList.remove('kodassauro-bark'), 900);
        }
      }

      // ============================================
      // NOTIFICAÇÕES
      // ============================================
      function updateNotificationBadge(count) {
        if (!badge) return;
        
        if (count <= 0) {
          badge.hidden = true;
          badge.textContent = '0';
        } else {
          badge.hidden = false;
          badge.textContent = count > 9 ? '9+' : String(count);
          badge.style.animation = 'none';
          badge.offsetHeight;
          badge.style.animation = 'pulse 2s infinite';
        }
      }

      // ============================================
      // CARREGAR ESTADO
      // ============================================
      const savedState = load(STORAGE.state, {});
      const state = { ...initialState, ...savedState, selectedProduct: null };

      function persist() {
        save(STORAGE.state, state);
      }

      let uiHydrated = false;

      function setBadge(n) {
        state.notifCount = n;
        updateNotificationBadge(n);
        persist();
      }

      function addMessage(from, text) {
        const msg = MessageSystem.addMessage(from, text, messagesEl);
        state.messages.push(msg);
        persist();
        return msg;
      }

      function hydrateUiIfNeeded() {
        if (uiHydrated) return;
        uiHydrated = true;
        
        if (state.messages.length > 0) {
          MessageSystem.renderAll(state.messages, messagesEl);
        }
        
        const channelsContainer = $(".kodassauro-channels-top", root);
        if (channelsContainer) {
          ChannelSystem.renderChannelButtons(channelsContainer);
        }
      }

      function openPanel(selectedProduct = null) {
        state.isOpen = true;
        panel.hidden = false;
        panel.classList.add("is-open");
        toggleBtn.setAttribute("aria-expanded", "true");
        
        setBadge(0);
        persist();

        hydrateUiIfNeeded();

        if (state.messages.length === 0) {
          LeadCaptureFlow.start(messagesEl, addMessage, appendLead, state, selectedProduct);
        }

        setTimeout(() => {
          input.focus();
          scrollToBottom(messagesEl);
        }, 300);
      }

      function closePanel() {
        state.isOpen = false;
        panel.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
        persist();
        setTimeout(() => panel.hidden = true, 300);
      }

      function resetChat() {
        state.messages = [];
        state.leadDraft = { name: "", phone: "", email: "", product: null };
        state.mode = "idle";
        state.step = "idle";
        state.phoneAttempts = 0;
        state.profanityCount = 0;
        messagesEl.innerHTML = "";
        uiHydrated = false;
        persist();
      }

      function handleUserText(text) {
        const raw = String(text || "").trim();
        if (!raw) return;

        addMessage("user", raw);

        if (state.mode === "capture") {
          setTimeout(() => {
            LeadCaptureFlow.handleInput(raw, state, messagesEl, addMessage, appendLead);
          }, 300);
        } else {
          // Verifica palavras impróprias também no modo idle
          if (containsProfanity(raw)) {
            setTimeout(() => {
              addMessage("bot", getRandomProfanityResponse());
            }, 500);
            return;
          }
          
          setTimeout(() => {
            addMessage("bot", "🥰 Vou chamar um especialista para te ajudar! Só um instantinho...");
            setTimeout(() => {
              ChannelSystem.openChannel("whatsapp", `Olá! Gostaria de falar sobre: ${raw}`);
            }, 1500);
          }, 500);
        }
      }

      // ============================================
      // EVENTOS
      // ============================================
      
      toggleBtn.addEventListener("click", () => {
        state.isOpen ? closePanel() : openPanel();
      });

      closeBtn.addEventListener("click", () => {
        closePanel();
        resetChat();
      });

      composer.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        handleUserText(text);
      });

      if (KODASSAURO_CONFIG.notifications.enabled) {
        setInterval(() => {
          if (!state.isOpen) {
            setBadge(state.notifCount + 1);
          }
        }, KODASSAURO_CONFIG.notifications.intervalMs);
      }

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.isOpen) closePanel();
      });

      document.addEventListener("click", (e) => {
        if (state.isOpen && !root.contains(e.target) && window.innerWidth <= 768) {
          closePanel();
        }
      });

      setTimeout(() => {
        setupPriceButtons();
        setupHostingButtons();
      }, 500);
      
      const observer = new MutationObserver(() => {
        setupPriceButtons();
        setupHostingButtons();
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // ============================================
      // PUBLIC API
      // ============================================
      window.KodassauroChat = {
        open: openPanel,
        close: closePanel,
        send: (text) => {
          addMessage("user", text);
          handleUserText(text);
        },
        getState: () => ({ ...state }),
        reset: resetChat,
      };

      updateNotificationBadge(state.notifCount);
      persist();
      
    } catch (err) {
      console.error("[Kodassauro] Erro:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
