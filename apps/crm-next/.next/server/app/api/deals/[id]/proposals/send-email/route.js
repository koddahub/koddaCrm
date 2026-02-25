"use strict";(()=>{var e={};e.id=4824,e.ids=[4824],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},559:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>y,patchFetch:()=>C,requestAsyncStorage:()=>x,routeModule:()=>f,serverHooks:()=>$,staticGenerationAsyncStorage:()=>v});var o={};t.r(o),t.d(o,{POST:()=>h});var i=t(3278),n=t(5002),s=t(4877),r=t(1309),l=t(7392),d=t(421);function p(e){return String(e||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function c(e){return p(e).replace(/(^|[\s(])\.(com(?:\.br)?)/gi,"$1&#8203;.$2")}function m(e){let a=String(e||"").trim();return a.includes("://clientes.koddahub.com.br")?a.replace(/\/+$/,""):"https://clientes.koddahub.com.br"}function u(e,a,t){let o=new URL("/signup",e);return o.searchParams.set("tab","signup"),o.searchParams.set("plan",a),o.searchParams.set("source","crm_proposal"),o.searchParams.set("deal",t),o.toString()}function g(e){return encodeURIComponent(e.trim())}var b=t(4738);async function h(e,{params:a}){let t=(0,l.I)(e);if(t)return t;let o=String((await e.json().catch(()=>({}))).proposalId||"").trim();if(!o)return r.NextResponse.json({error:"proposalId \xe9 obrigat\xf3rio"},{status:422});let i=await b._.dealProposal.findFirst({where:{id:o,dealId:a.id},include:{deal:{include:{organization:{select:{id:!0,legalName:!0,billingEmail:!0}}}}}});if(!i)return r.NextResponse.json({error:"Proposta n\xe3o encontrada para este deal"},{status:404});let n=i.deal.contactEmail||i.deal.organization?.billingEmail;if(!n)return r.NextResponse.json({error:"Deal sem e-mail de envio"},{status:422});let s=i.deal.organization?.id||null,h=i.snapshot&&"object"==typeof i.snapshot?i.snapshot:{},f="HOSPEDAGEM"===i.deal.dealType?"hospedagem":"personalizado",x=function(e,a){let t=String(e||"").toLowerCase();return"personalizado"===t?"personalizado":"hospedagem"===t?"hospedagem":a}(h.proposalType,f),v=String(h.planCode||i.deal.planCode||"basic").toLowerCase(),$="6x"===String(h.paymentCondition||"").toLowerCase()?"6x":"avista",y=String(h.projectType||i.deal.productCode||i.deal.intent||"Institucional"),C=Array.isArray(h.selectedFeatures)?h.selectedFeatures.map(e=>String(e).trim()).filter(Boolean):Array.isArray(h.features)?h.features.map(e=>String(e).trim()).filter(Boolean):[],w=function(e){let a=Number(e);return Number.isFinite(a)&&a>0?Math.round(a):null}(h.baseValueCents),S=String(h.notes||""),P=String(h.scope||i.scope||""),j="nao"===String(h.domainOwn||"sim")?"nao":"sim",z="sim"===String(h.migration||"nao")?"sim":"nao",k="nao"===String(h.emailProfessional||"sim")?"nao":"sim",A=String(h.pages||"1"),N=String(h.clientName||i.deal.contactName||i.deal.title||"Cliente"),I=String(h.companyName||i.deal.organization?.legalName||"-"),E={title:i.title,clientName:N,companyName:I,proposalType:x,paymentCondition:$,planCode:v,projectType:y,domainOwn:j,migration:z,pages:A,emailProfessional:k,selectedFeatures:C,notes:S,scope:P,baseValueCents:w,createdAt:i.createdAt},T={dealId:i.dealId,portalBaseUrl:process.env.PORTAL_BASE_URL,catalogUrl:"https://koddahub.com.br",whatsappPhone:"5541992272854",whatsappMessage:"Ol\xe1! Tenho d\xfavidas sobre a proposta da KoddaHub e gostaria de falar com o time."},R=function(e,a){let t=(0,d.aG)(e),o=t.notes.trim(),i=t.scope.trim(),n=m(a.portalBaseUrl),s=String(a.catalogUrl||"https://koddahub.com.br").trim()||"https://koddahub.com.br",r=String(a.whatsappPhone||"5541992272854").replace(/\D+/g,"")||"5541992272854",l=String(a.whatsappMessage||"Ol\xe1! Tenho d\xfavidas sobre a proposta da KoddaHub e gostaria de falar com o time.").trim(),b=`https://wa.me/${r}?text=${g(l)}`,h=u(n,t.selectedPlanCode,a.dealId);return`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${c(t.title)}</title>
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    body {
      margin: 0;
      padding: 0;
      background: #eef3fb;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
    }
    .shell {
      width: 100%;
      max-width: 700px;
      margin: 0 auto;
    }
    .proposal-card {
      width: 100%;
      background: #ffffff;
      border: 1px solid #d9e4f2;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
    }
    .section {
      padding: 18px 20px;
      border-bottom: 1px solid #e7eef8;
    }
    .section:last-child {
      border-bottom: 0;
    }
    .proposal-header {
      background: radial-gradient(circle at top right, #2d5ea0, #0c213f 60%);
      border-radius: 14px;
      color: #ffffff;
      padding: 20px;
    }
    .row {
      width: 100%;
    }
    .col {
      width: 50%;
      vertical-align: top;
    }
    .col-3 {
      width: 33.33%;
      vertical-align: top;
    }
    .brand {
      font-size: 30px;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
      letter-spacing: 0.2px;
    }
    .brand .accent {
      color: #ffb547;
    }
    .meta {
      margin: 10px 0 0;
      font-size: 12px;
      color: rgba(255, 255, 255, .85);
    }
    .hero {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      max-width: 320px;
      font-weight: 700;
    }
    .title {
      margin: 0 0 12px;
      color: #153968;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 700;
    }
    .box {
      border: 1px solid #dbe7f5;
      border-radius: 10px;
      background: #f7fbff;
      padding: 11px;
      margin: 0 6px 8px 0;
    }
    .box span {
      display: block;
      font-size: 11px;
      color: #667085;
      margin-bottom: 3px;
    }
    .box strong {
      font-size: 13px;
      color: #0f172a;
    }
    .plan-card {
      border: 1px solid #dbe7f5;
      border-radius: 14px;
      padding: 10px;
      background: #fdfefe;
      margin: 0 6px 8px 0;
    }
    .plan-card.active {
      border-color: #f0b90b;
      box-shadow: inset 0 0 0 2px rgba(240, 185, 11, 0.22);
    }
    .plan-card h4 {
      margin: 0;
      font-size: 14px;
      color: #0f172a;
    }
    .value {
      margin: 4px 0;
      font-size: 23px;
      font-weight: 700;
      color: #0b2a4d;
      line-height: 1.05;
    }
    .desc {
      margin: 0;
      font-size: 12px;
      color: #4f6179;
    }
    .list {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .list li {
      margin-bottom: 6px;
      font-size: 12px;
      color: #334155;
    }
    .scope li {
      margin-bottom: 8px;
      font-size: 12px;
      color: #1e293b;
    }
    .scope b {
      color: #0d2f58;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .table th, .table td {
      border: 1px solid #e3eaf5;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    .table th {
      background: #f7faff;
      color: #1f2a37;
    }
    .summary {
      margin-top: 10px;
      padding: 12px;
      border-radius: 10px;
      background: #f7fbff;
      border: 1px solid #d9e6f8;
      font-size: 12px;
      color: #334155;
    }
    .included {
      border: 1px solid #d9e6f8;
      background: #f7fbff;
      border-radius: 10px;
      padding: 9px;
      margin: 0 6px 8px 0;
      font-size: 12px;
      color: #1f2a37;
    }
    .included.off {
      color: #64748b;
      opacity: .75;
      text-decoration: line-through;
      text-decoration-thickness: from-font;
    }
    .cta {
      background: linear-gradient(180deg, #fffef9, #ffffff);
    }
    .cta strong {
      color: #0f2e56;
      font-size: 22px;
      line-height: 1.15;
      display: block;
      margin-bottom: 6px;
    }
    .cta p {
      margin: 8px 0 0;
      font-size: 13px;
      color: #475569;
    }
    .btn-wrap {
      width: 100%;
      border-collapse: separate;
      border-spacing: 10px 0;
      margin-top: 16px;
      table-layout: fixed;
    }
    .btn-cell {
      width: 33.33%;
      vertical-align: top;
    }
    .btn {
      display: inline-block;
      width: 100%;
      min-height: 46px;
      box-sizing: border-box;
      padding: 13px 16px;
      border-radius: 12px;
      border: 1px solid transparent;
      font-family: Arial, "Segoe UI", Roboto, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 20px;
      font-weight: 700;
      letter-spacing: 0.1px;
      text-align: center;
      text-decoration: none;
      white-space: nowrap;
      mso-line-height-rule: exactly;
    }
    .btn-dark {
      background: #0f2d52;
      border-color: #0b2341;
      color: #ffffff !important;
    }
    .btn-gold {
      background: #f2be2d;
      border-color: #d6a315;
      color: #1f2937 !important;
    }
    .btn-green {
      background: #25c267;
      border-color: #1ea458;
      color: #0e2a1b !important;
    }
    .plan-card .btn {
      min-height: 42px;
      padding: 11px 14px;
      font-size: 13px;
      line-height: 18px;
      border-radius: 10px;
    }
    .footer {
      background: #f6f9ff;
    }
    .footer h4 {
      margin: 0 0 6px;
      color: #0a1a2f;
      font-size: 14px;
    }
    .footer p {
      margin: 2px 0;
      font-size: 12px;
      color: #475467;
    }
    .text-link {
      color: #173f72;
      text-decoration: underline;
    }
    .muted {
      color: #64748b;
      font-size: 12px;
    }
    @media screen and (max-width: 640px) {
      .shell {
        width: 100% !important;
      }
      .section {
        padding: 14px 14px;
      }
      .col,
      .col-3,
      .mobile-col {
        width: 100% !important;
        display: block !important;
      }
      .hero {
        margin-top: 12px;
        max-width: none;
        font-size: 20px;
      }
      .btn-wrap {
        border-spacing: 0 !important;
        margin-top: 14px;
      }
      .btn-wrap tbody,
      .btn-wrap tr {
        display: block !important;
        width: 100% !important;
      }
      .btn-cell {
        width: 100% !important;
        display: block !important;
        padding: 0 0 12px 0 !important;
      }
      .btn-cell:last-child {
        padding-bottom: 0 !important;
      }
      .btn {
        display: block !important;
        width: 100% !important;
        margin: 0 !important;
        min-height: 46px;
        padding: 13px 14px;
        font-size: 14px;
        line-height: 20px;
      }
      .plan-card .btn {
        width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:20px 10px;background:#eef3fb;">
    <tr>
      <td align="center">
        <table role="presentation" class="shell" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <table role="presentation" class="proposal-card" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="proposal-header">
                <tr>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="brand"><span class="accent">Kodda</span>Hub</p>
                    <p class="meta">Proposta comercial • ${c(t.todayLabel)} • V\xe1lida por 7 dias</p>
                  </td>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="hero">Sua Presen\xe7a Digital Completa por um Pre\xe7o Imbat\xedvel</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Dados do cliente</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col"><div class="box"><span>Cliente</span><strong>${c(t.clientName||"—")}</strong></div></td>
                  <td class="col"><div class="box"><span>Empresa</span><strong>${c(t.companyName||"—")}</strong></div></td>
                </tr>
                <tr>
                  <td class="col"><div class="box"><span>Tipo</span><strong>${c(t.proposalTypeLabel)}</strong></div></td>
                  <td class="col"><div class="box"><span>Pagamento projeto</span><strong>${c(t.paymentLabel)}</strong></div></td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Planos mensais (recorr\xeancia)</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  ${t.planCards.map(e=>`
                    <td class="col-3 mobile-col">
                      <div class="plan-card ${e.active?"active":""}">
                        <h4>${c(e.name)}</h4>
                        <p class="value">${c(e.monthlyLabel)}</p>
                        <p class="desc">${c(e.description)}</p>
                        <ul class="list">
                          ${e.highlights.map(e=>`<li>${c(e)}</li>`).join("")}
                        </ul>
                        <a class="btn btn-dark" href="${p(u(n,e.code,a.dealId))}">Quero este plano</a>
                      </div>
                    </td>
                  `).join("")}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Escopo do projeto</h3>
              <ul class="list scope">
                ${t.scopeItems.map(e=>`<li><b>${c(e.title)}:</b> ${c(e.description)}</li>`).join("")}
              </ul>
              ${i?`<p style="margin:10px 0 0;font-size:12px;color:#334155;"><b>Escopo adicional:</b> ${c(i)}</p>`:""}
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Investimento objetivo</h3>
              <table class="table" role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <thead><tr><th>Descri\xe7\xe3o</th><th>Valor</th></tr></thead>
                <tbody>
                  ${t.investmentRows.map(e=>`<tr><td>${c(e.label)}</td><td>${c(e.value)}</td></tr>`).join("")}
                </tbody>
              </table>
              <div class="summary">${c(t.financeSummary)}</div>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Condi\xe7\xf5es comerciais</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${t.terms.map(e=>`
                  <tr>
                    <td style="padding:0 0 8px 0;font-size:12px;color:#334155;">• ${c(e)}</td>
                  </tr>
                `).join("")}
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">O que est\xe1 incluso</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  ${t.includedItems.map((e,a)=>`
                    ${a>0&&a%2==0?"</tr><tr>":""}
                    <td class="col mobile-col">
                      <div class="included ${e.off?"off":""}">
                        ${c(e.label)}${e.off?" (n\xe3o incluso neste cen\xe1rio)":""}
                      </div>
                    </td>
                  `).join("")}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Portf\xf3lio / demos</h3>
              <p style="margin:0;font-size:12px;">
                <a class="text-link" href="${p(s)}">Ver portf\xf3lio KoddaHub</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="section cta">
              <strong>Pronto para decolar sua presen\xe7a digital?</strong>
              <p>Esta proposta \xe9 v\xe1lida por 7 dias. Se aprovar, iniciamos o cronograma imediatamente.</p>
              ${o?`<p><strong>Observa\xe7\xf5es:</strong> ${c(o)}</p>`:""}
              <table role="presentation" class="btn-wrap" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="btn-cell mobile-col"><a class="btn btn-dark" href="${p(s)}">Conhecer KoddaHub</a></td>
                  <td class="btn-cell mobile-col"><a class="btn btn-gold" href="${p(h)}">Quero esse plano</a></td>
                  <td class="btn-cell mobile-col"><a class="btn btn-green" href="${p(b)}">Tirar d\xfavidas no WhatsApp</a></td>
                </tr>
              </table>
              <p>Ficou com d\xfavidas? Chame nosso time no WhatsApp e te orientamos no melhor plano para o seu neg\xf3cio.</p>
              <p class="muted">Ao clicar em qualquer plano, abrimos a \xe1rea do cliente com o cadastro j\xe1 aberto e plano pr\xe9-selecionado.</p>
            </td>
          </tr>

          <tr>
            <td class="section footer">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col mobile-col">
                    <h4>Contato</h4>
                    <p>contato@koddahub.com.br</p>
                    <p><a class="text-link" href="${p(s)}">Site institucional KoddaHub</a></p>
                    <p><a class="text-link" href="${p(b)}">WhatsApp: +55 41 99227-2854</a></p>
                    <p>Instagram: @koddahub</p>
                    <p>LinkedIn: /company/koddahub</p>
                  </td>
                  <td class="col mobile-col">
                    <h4>Garantias</h4>
                    <p>Hospedagem com SSL gr\xe1tis</p>
                    <p>Backup di\xe1rio autom\xe1tico</p>
                    <p>Suporte t\xe9cnico ilimitado</p>
                    <p>Manuten\xe7\xe3o mensal</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}(E,T),M=function(e,a){let t=(0,d.aG)(e);t.notes.trim();let o=t.scope.trim(),i=m(a.portalBaseUrl),n=String(a.catalogUrl||"https://koddahub.com.br").trim()||"https://koddahub.com.br",s=String(a.whatsappPhone||"5541992272854").replace(/\D+/g,"")||"5541992272854",r=String(a.whatsappMessage||"Ol\xe1! Tenho d\xfavidas sobre a proposta da KoddaHub e gostaria de falar com o time.").trim(),l=`https://wa.me/${s}?text=${g(r)}`,p=u(i,t.selectedPlanCode,a.dealId),c=t.planCards.map(e=>`- ${e.name} (${e.monthlyLabel}) -> ${u(i,e.code,a.dealId)}`).join("\n"),b=t.investmentRows.map(e=>`- ${e.label}: ${e.value}`).join("\n"),h=t.terms.map(e=>`- ${e}`).join("\n"),f=t.includedItems.map(e=>`- ${e.label}${e.off?" (n\xe3o incluso neste cen\xe1rio)":""}`).join("\n");return[`${t.title}`,"",`Proposta comercial KoddaHub • ${t.todayLabel}`,"Validade: 7 dias","","Dados do cliente",`- Cliente: ${t.clientName||"—"}`,`- Empresa: ${t.companyName||"—"}`,`- Tipo: ${t.proposalTypeLabel}`,`- Pagamento projeto: ${t.paymentLabel}`,"","Planos mensais (recorr\xeancia)",c,"","Escopo do projeto",...t.scopeItems.map(e=>`- ${e.title}: ${e.description}`),...o?[`- Escopo adicional: ${o}`]:[],"","Investimento objetivo",b,"",`Resumo financeiro: ${t.financeSummary}`,"","Condi\xe7\xf5es comerciais",h,"","O que est\xe1 incluso",f,"","A\xe7\xf5es r\xe1pidas",`- Conhecer KoddaHub: ${n}`,`- Quero esse plano: ${p}`,`- Tirar d\xfavidas no WhatsApp: ${l}`,"","Contato","- E-mail: contato@koddahub.com.br",`- Site: ${n}`,"- WhatsApp: +55 41 99227-2854"].join("\n")}(E,T),F=`KH_MIME_V1:${JSON.stringify({html:R,text:M})}`;return await b._.emailQueue.create({data:{organizationId:s,emailTo:n,subject:`[KoddaHub] ${i.title}`,body:F,attachments:[],status:"PENDING"}}),await b._.dealProposal.update({where:{id:i.id},data:{status:"ENVIADA",updatedAt:new Date}}),r.NextResponse.json({ok:!0})}let f=new i.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/deals/[id]/proposals/send-email/route",pathname:"/api/deals/[id]/proposals/send-email",filename:"route",bundlePath:"app/api/deals/[id]/proposals/send-email/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/deals/[id]/proposals/send-email/route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:x,staticGenerationAsyncStorage:v,serverHooks:$}=f,y="/api/deals/[id]/proposals/send-email/route";function C(){return(0,s.patchFetch)({serverHooks:$,staticGenerationAsyncStorage:v})}},7392:(e,a,t)=>{t.d(a,{I:()=>i});var o=t(1309);function i(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?o.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},4738:(e,a,t)=>{t.d(a,{_:()=>i});var o=t(3524);let i=global.__prisma__??new o.PrismaClient({log:["error"]})},421:(e,a,t)=>{t.d(a,{LM:()=>p,aG:()=>c});let o=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),i={basic:{code:"basic",name:"B\xe1sico",monthlyCents:14999,description:"Plano inicial para presen\xe7a digital essencial.",highlights:["Site institucional b\xe1sico (1 p\xe1gina)","Dom\xednio incluso (se ainda n\xe3o tiver)","Migra\xe7\xe3o gratuita","1 e-mail profissional"]},profissional:{code:"profissional",name:"Profissional",monthlyCents:24900,description:"Plano completo para opera\xe7\xe3o comercial online.",highlights:["Site institucional at\xe9 3 p\xe1ginas","Formul\xe1rio de contato + bot\xe3o WhatsApp","E-mails profissionais ilimitados","Suporte t\xe9cnico e atualiza\xe7\xf5es"]},pro:{code:"pro",name:"Pro",monthlyCents:39900,description:"Plano avan\xe7ado para expans\xe3o digital e vendas.",highlights:["Chatbot incluso no site","E-commerce b\xe1sico incluso","Atualiza\xe7\xe3o de site industrial com cat\xe1logo","Ranqueamento profissional no Google"]}},n={Institucional:{baseCents:18e4,features:["At\xe9 5 p\xe1ginas","Blog integrado","Galeria de imagens","Formul\xe1rio de contato","Mapa interativo","WhatsApp integrado"]},Industrial:{baseCents:28e4,features:["Cat\xe1logo de produtos","Ficha t\xe9cnica","Solicita\xe7\xe3o de or\xe7amento","\xc1rea do representante","Multil\xedngue"]},"E-commerce":{baseCents:38e4,features:["Carrinho de compras","Pagamentos online","Gestor de estoque","Cupons de desconto","Avalia\xe7\xf5es","Integra\xe7\xe3o com marketplaces"]},Blog:{baseCents:15e4,features:["Editor de posts","Categorias","Coment\xe1rios","Newsletter","SEO otimizado"]},Sistemas:{baseCents:45e4,features:["\xc1rea logada","Banco de dados","Relat\xf3rios","API integra\xe7\xe3o","Dashboard administrativo"]},Serviços:{baseCents:22e4,features:["Agendamento online","Portf\xf3lio","Depoimentos","Or\xe7amento r\xe1pido"]}},s=["Hospedagem com SSL Gr\xe1tis","Dom\xednio nacional incluso (12 meses)","Suporte T\xe9cnico Ilimitado","Backup Di\xe1rio Autom\xe1tico","Manuten\xe7\xe3o Mensal","Migra\xe7\xe3o Gr\xe1tis (se aplic\xe1vel)","Gestor de Ativos Web","E-mails Profissionais"];function r(e){return o.format((e||0)/100)}function l(e){let a=String(e||"").toLowerCase();return a in i?a:"basic"}function d(e){return n[e]?e:"Institucional"}function p(e){return"HOSPEDAGEM"===String(e.dealType||"").toUpperCase()?e.breakdown.monthlyCents:"personalizado"===e.proposalType?e.breakdown.projectTotalCents:e.breakdown.monthlyCents}function c(e){let a=e.createdAt||new Date,t=l(e.planCode),o=i[t],p=d(e.projectType),c="personalizado"===e.proposalType?"personalizado":"hospedagem",m=function(e){let a=i[l(e.planCode)],t=n[d(e.projectType)],o=(e.selectedFeatures||[]).map(e=>String(e).trim()).filter(Boolean),s=o.filter((e,a)=>o.indexOf(e)===a),r=e.baseValueCents&&e.baseValueCents>0?e.baseValueCents:t.baseCents,p=r+15e3*s.length;return{monthlyCents:a.monthlyCents,monthlyName:a.name,projectBaseCents:r,selectedFeatureCount:s.length,selectedFeatureNames:s,projectTotalCents:p}}({...e,planCode:t,projectType:p,proposalType:c}),u=[{title:"Recorr\xeancia mensal ativa",description:`Plano ${m.monthlyName}: hospedagem, suporte t\xe9cnico, manuten\xe7\xe3o mensal e SSL inclusos.`},{title:"Dom\xednio",description:"nao"===e.domainOwn?"Dom\xednio nacional incluso por 12 meses.":"Configura\xe7\xe3o do dom\xednio pr\xf3prio inclusa."},{title:"Migra\xe7\xe3o",description:"sim"===e.migration?"Migra\xe7\xe3o de site existente inclu\xedda sem custo.":"Migra\xe7\xe3o n\xe3o inclu\xedda nesta proposta."},{title:"E-mails profissionais",description:"sim"===e.emailProfessional?"E-mails profissionais inclu\xeddos.":"E-mails profissionais n\xe3o inclusos."},{title:"Site incluso na recorr\xeancia",description:`Site simples com at\xe9 ${e.pages||"1"} p\xe1ginas inclu\xeddo na recorr\xeancia mensal.`}];"personalizado"===c&&(u.push({title:`Projeto personalizado ${p}`,description:`Escopo base de ${r(m.projectBaseCents)}.`}),u.push({title:"Funcionalidades extras",description:m.selectedFeatureCount>0?`${m.selectedFeatureCount} selecionada(s): ${m.selectedFeatureNames.join(", ")}.`:"Sem funcionalidades extras adicionadas no momento."}));let g=[{label:`Recorr\xeancia mensal (${m.monthlyName})`,value:`${r(m.monthlyCents)}/m\xeas`}];if("personalizado"===c){if(g.push({label:"Projeto personalizado",value:"Ativo"}),g.push({label:"Tipo de site",value:p}),g.push({label:"Valor base",value:r(m.projectBaseCents)}),g.push({label:`Funcionalidades (+${r(15e3)} cada)`,value:`${m.selectedFeatureCount} selecionada(s)`}),m.selectedFeatureCount>0)for(let e of m.selectedFeatureNames)g.push({label:`+ ${e}`,value:r(15e3)});else g.push({label:"+ Sem funcionalidades extras",value:r(0)});g.push({label:"Total do projeto personalizado",value:r(m.projectTotalCents)})}else g.push({label:"Projeto personalizado",value:"N\xe3o inclu\xeddo"});let b="personalizado"===c?"6x"===e.paymentCondition?`Projeto personalizado (${p}) com ${m.selectedFeatureCount} plus pode ser pago em 6x de ${r(Math.round(m.projectTotalCents/6))} sem juros. Recorr\xeancia mensal segue ativa em ${r(m.monthlyCents)}/m\xeas.`:`Projeto personalizado (${p}) com ${m.selectedFeatureCount} plus \xe0 vista em ${r(m.projectTotalCents)}. Recorr\xeancia mensal segue ativa em ${r(m.monthlyCents)}/m\xeas.`:`Sem projeto personalizado nesta proposta. Cobran\xe7a apenas recorrente: ${r(m.monthlyCents)}/m\xeas.`,h=["Tempo de contrato da recorr\xeancia: 36 meses.","Renova\xe7\xe3o autom\xe1tica se n\xe3o houver manifesta\xe7\xe3o 90 dias antes.",`Recorr\xeancia mensal (${m.monthlyName}): ${r(m.monthlyCents)}/m\xeas.`,"personalizado"===c?"6x"===e.paymentCondition?`Projeto personalizado: ${r(m.projectTotalCents)} em 6x sem juros.`:`Projeto personalizado: ${r(m.projectTotalCents)} \xe0 vista.`:"Projeto personalizado n\xe3o contratado nesta proposta.","Validade da proposta: 7 dias corridos."],f=s.map(a=>({label:a,off:a.includes("Migra\xe7\xe3o")&&"sim"!==e.migration||a.includes("Dom\xednio")&&"nao"!==e.domainOwn||a.includes("E-mails")&&"sim"!==e.emailProfessional})),x="personalizado"===c?`Mensal + Projeto (${p})`:"Mensal (sem projeto personalizado)",v="personalizado"===c?"6x"===e.paymentCondition?"Projeto em 6x":"Projeto \xe0 vista":"N\xe3o se aplica";return{todayLabel:a.toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"}),title:e.title,clientName:e.clientName,companyName:e.companyName,proposalTypeLabel:x,paymentLabel:v,notes:e.notes,scope:e.scope,selectedPlanCode:t,selectedPlanName:o.name,selectedPlanMonthlyLabel:`${r(o.monthlyCents)}/m\xeas`,selectedPlanHighlights:o.highlights,planCards:Object.values(i).map(e=>({code:e.code,name:e.name,monthlyLabel:`${r(e.monthlyCents)}/m\xeas`,description:e.description,highlights:e.highlights,active:e.code===t})),scopeItems:u,investmentRows:g,financeSummary:b,terms:h,includedItems:f,breakdown:m}}}};var a=require("../../../../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),o=a.X(0,[7787,4833],()=>t(559));module.exports=o})();