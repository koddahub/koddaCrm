"use strict";(()=>{var e={};e.id=4824,e.ids=[4824],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},559:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>x,patchFetch:()=>v,requestAsyncStorage:()=>b,routeModule:()=>g,serverHooks:()=>h,staticGenerationAsyncStorage:()=>f});var o={};t.r(o),t.d(o,{POST:()=>u});var s=t(3278),i=t(5002),n=t(4877),r=t(1309),l=t(7392),d=t(421);function p(e){return String(e||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function c(e,a,t){let o=new URL("/signup",e);return o.searchParams.set("tab","signup"),o.searchParams.set("plan",a),o.searchParams.set("source","crm_proposal"),o.searchParams.set("deal",t),o.toString()}var m=t(4738);async function u(e,{params:a}){let t=(0,l.I)(e);if(t)return t;let o=String((await e.json().catch(()=>({}))).proposalId||"").trim();if(!o)return r.NextResponse.json({error:"proposalId \xe9 obrigat\xf3rio"},{status:422});let s=await m._.dealProposal.findFirst({where:{id:o,dealId:a.id},include:{deal:{include:{organization:{select:{id:!0,legalName:!0,billingEmail:!0}}}}}});if(!s)return r.NextResponse.json({error:"Proposta n\xe3o encontrada para este deal"},{status:404});let i=s.deal.contactEmail||s.deal.organization?.billingEmail;if(!i)return r.NextResponse.json({error:"Deal sem e-mail de envio"},{status:422});let n=s.deal.organization?.id||null,u=s.snapshot&&"object"==typeof s.snapshot?s.snapshot:{},g="HOSPEDAGEM"===s.deal.dealType?"hospedagem":"personalizado",b=function(e,a){let t=String(e||"").toLowerCase();return"personalizado"===t?"personalizado":"hospedagem"===t?"hospedagem":a}(u.proposalType,g),f=String(u.planCode||s.deal.planCode||"basic").toLowerCase(),h="6x"===String(u.paymentCondition||"").toLowerCase()?"6x":"avista",x=String(u.projectType||s.deal.productCode||s.deal.intent||"Institucional"),v=Array.isArray(u.selectedFeatures)?u.selectedFeatures.map(e=>String(e).trim()).filter(Boolean):Array.isArray(u.features)?u.features.map(e=>String(e).trim()).filter(Boolean):[],C=function(e){let a=Number(e);return Number.isFinite(a)&&a>0?Math.round(a):null}(u.baseValueCents),y=String(u.notes||""),$=String(u.scope||s.scope||""),w="nao"===String(u.domainOwn||"sim")?"nao":"sim",P="sim"===String(u.migration||"nao")?"sim":"nao",S="nao"===String(u.emailProfessional||"sim")?"nao":"sim",z=String(u.pages||"1"),j=String(u.clientName||s.deal.contactName||s.deal.title||"Cliente"),k=String(u.companyName||s.deal.organization?.legalName||"-"),A=function(e,a){let t=(0,d.aG)(e),o=t.notes.trim(),s=t.scope.trim(),i=function(e){let a=String(e||"https://clientes.koddahub.com.br").trim().replace(/\/+$/,"")||"https://clientes.koddahub.com.br";return a.includes("://cliente.koddahub.com.br")?a.replace("://cliente.koddahub.com.br","://clientes.koddahub.com.br"):a}(a.portalBaseUrl),n=String(a.catalogUrl||"https://koddahub.com.br").trim()||"https://koddahub.com.br",r=String(a.whatsappPhone||"5541992272854").replace(/\D+/g,"")||"5541992272854",l=String(a.whatsappMessage||"Ol\xe1! Tenho d\xfavidas sobre a proposta da KoddaHub e gostaria de falar com o time.").trim(),m=`https://wa.me/${r}?text=${encodeURIComponent(l.trim())}`,u=c(i,t.selectedPlanCode,a.dealId);return`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${p(t.title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f4f7fb;
      font-family: Poppins, Arial, Helvetica, sans-serif;
      color: #1f2a37;
    }
    .container {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d4deea;
      border-radius: 20px;
      overflow: hidden;
    }
    .section {
      padding: 18px 20px;
      border-bottom: 1px solid #edf2f9;
    }
    .section:last-child {
      border-bottom: 0;
    }
    .proposal-header {
      background: linear-gradient(135deg, #0a1a2f, #1e3a5f);
      border-radius: 16px;
      color: #ffffff;
      padding: 18px;
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
      font-size: 28px;
      font-weight: 700;
      margin: 0;
      line-height: 1.1;
    }
    .brand .accent {
      color: #ff8a00;
    }
    .meta {
      margin: 8px 0 0;
      font-size: 12px;
      color: rgba(255, 255, 255, .85);
    }
    .hero {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      max-width: 360px;
    }
    .title {
      margin: 0 0 12px;
      color: #1e3a5f;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: .06em;
      font-weight: 700;
    }
    .box {
      border: 1px solid #d8e1ec;
      border-radius: 10px;
      background: #f9fbff;
      padding: 10px;
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
      color: #1f2a37;
    }
    .card {
      border: 1px solid #d8e1ec;
      border-radius: 12px;
      padding: 10px;
      background: #ffffff;
      margin: 0 6px 8px 0;
    }
    .card.active {
      border-color: #f0b90b;
      box-shadow: inset 0 0 0 2px rgba(240, 185, 11, 0.2);
    }
    .card h4 {
      margin: 0;
      font-size: 14px;
      color: #1f2a37;
    }
    .value {
      margin: 4px 0;
      font-size: 13px;
      font-weight: 700;
      color: #0a1a2f;
    }
    .desc {
      margin: 0;
      font-size: 12px;
      color: #64748b;
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
      color: #1f2a37;
    }
    .scope b {
      color: #0f2747;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .table th, .table td {
      border: 1px solid #e5eaf2;
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
      padding: 10px;
      border-radius: 10px;
      background: #f7fbff;
      border: 1px solid #d9e6f8;
      font-size: 12px;
      color: #334155;
    }
    .included {
      border: 1px solid #d9e6f8;
      background: #f8fbff;
      border-radius: 10px;
      padding: 9px;
      margin: 0 6px 8px 0;
      font-size: 12px;
      color: #1f2a37;
    }
    .included.off {
      color: #64748b;
      opacity: .75;
    }
    .cta {
      background: linear-gradient(180deg, #fffdf7, #ffffff);
    }
    .cta strong {
      color: #102c4f;
      font-size: 16px;
    }
    .cta p {
      margin: 8px 0 0;
      font-size: 12px;
      color: #475467;
    }
    .btn {
      display: inline-block;
      padding: 11px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      margin-right: 8px;
      margin-top: 8px;
    }
    .btn-dark {
      background: #0a1a2f;
      color: #ffffff;
    }
    .btn-gold {
      background: #f0b90b;
      color: #10213d;
    }
    .btn-green {
      background: #25d366;
      color: #083b1c;
    }
    .footer {
      background: #f8fbff;
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
      color: #1e3a5f;
      text-decoration: underline;
    }
    @media screen and (max-width: 640px) {
      .container {
        border-radius: 0;
        border-left: 0;
        border-right: 0;
      }
      .section {
        padding: 14px 12px;
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
        font-size: 19px;
      }
      .btn {
        display: block;
        width: 100%;
        text-align: center;
        margin-right: 0;
      }
    }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:16px;background:#f4f7fb;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="proposal-header">
                <tr>
                  <td class="mobile-col" style="vertical-align:top;">
                    <p class="brand"><span class="accent">Kodda</span>Hub</p>
                    <p class="meta">Proposta comercial • ${p(t.todayLabel)} • V\xe1lida por 7 dias</p>
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
                  <td class="col"><div class="box"><span>Cliente</span><strong>${p(t.clientName||"—")}</strong></div></td>
                  <td class="col"><div class="box"><span>Empresa</span><strong>${p(t.companyName||"—")}</strong></div></td>
                </tr>
                <tr>
                  <td class="col"><div class="box"><span>Tipo</span><strong>${p(t.proposalTypeLabel)}</strong></div></td>
                  <td class="col"><div class="box"><span>Pagamento projeto</span><strong>${p(t.paymentLabel)}</strong></div></td>
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
                      <div class="card ${e.active?"active":""}">
                        <h4>${p(e.name)}</h4>
                        <p class="value">${p(e.monthlyLabel)}</p>
                        <p class="desc">${p(e.description)}</p>
                        <ul class="list">
                          ${e.highlights.map(e=>`<li>${p(e)}</li>`).join("")}
                        </ul>
                        <a class="btn btn-dark" href="${p(c(i,e.code,a.dealId))}">Quero este plano</a>
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
                ${t.scopeItems.map(e=>`<li><b>${p(e.title)}:</b> ${p(e.description)}</li>`).join("")}
              </ul>
              ${s?`<p style="margin:10px 0 0;font-size:12px;color:#334155;"><b>Escopo adicional:</b> ${p(s)}</p>`:""}
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Investimento objetivo</h3>
              <table class="table" role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <thead><tr><th>Descri\xe7\xe3o</th><th>Valor</th></tr></thead>
                <tbody>
                  ${t.investmentRows.map(e=>`<tr><td>${p(e.label)}</td><td>${p(e.value)}</td></tr>`).join("")}
                </tbody>
              </table>
              <div class="summary">${p(t.financeSummary)}</div>
            </td>
          </tr>

          <tr>
            <td class="section">
              <h3 class="title">Condi\xe7\xf5es comerciais</h3>
              <ul class="list">
                ${t.terms.map(e=>`<li>${p(e)}</li>`).join("")}
              </ul>
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
                        ${p(e.label)}${e.off?" (n\xe3o incluso neste cen\xe1rio)":""}
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
                <a class="text-link" href="${p(n)}">${p(n)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="section cta">
              <strong>Pronto para decolar sua presen\xe7a digital?</strong>
              <p>Esta proposta \xe9 v\xe1lida por 7 dias. Se aprovar, iniciamos o cronograma imediatamente.</p>
              ${o?`<p><strong>Observa\xe7\xf5es:</strong> ${p(o)}</p>`:""}
              <p>
                <a class="btn btn-dark" href="${p(n)}">Conhecer KoddaHub</a>
                <a class="btn btn-gold" href="${p(u)}">Quero esse plano</a>
                <a class="btn btn-green" href="${p(m)}">Tirar d\xfavidas no WhatsApp</a>
              </p>
              <p>Ficou com d\xfavidas? Chame nosso time no WhatsApp e te orientamos no melhor plano para o seu neg\xf3cio.</p>
            </td>
          </tr>

          <tr>
            <td class="section footer">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="col mobile-col">
                    <h4>Contato</h4>
                    <p>contato@koddahub.com.br</p>
                    <p><a class="text-link" href="${p(n)}">www.koddahub.com.br</a></p>
                    <p><a class="text-link" href="${p(m)}">WhatsApp: +55 41 99227-2854</a></p>
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
</body>
</html>`}({title:s.title,clientName:j,companyName:k,proposalType:b,paymentCondition:h,planCode:f,projectType:x,domainOwn:w,migration:P,pages:z,emailProfessional:S,selectedFeatures:v,notes:y,scope:$,baseValueCents:C,createdAt:s.createdAt},{dealId:s.dealId,portalBaseUrl:process.env.PORTAL_BASE_URL,catalogUrl:"https://koddahub.com.br",whatsappPhone:"5541992272854",whatsappMessage:"Ol\xe1! Tenho d\xfavidas sobre a proposta da KoddaHub e gostaria de falar com o time."});return await m._.emailQueue.create({data:{organizationId:n,emailTo:i,subject:`[KoddaHub] ${s.title}`,body:A,attachments:[],status:"PENDING"}}),await m._.dealProposal.update({where:{id:s.id},data:{status:"ENVIADA",updatedAt:new Date}}),r.NextResponse.json({ok:!0})}let g=new s.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/deals/[id]/proposals/send-email/route",pathname:"/api/deals/[id]/proposals/send-email",filename:"route",bundlePath:"app/api/deals/[id]/proposals/send-email/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/deals/[id]/proposals/send-email/route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:b,staticGenerationAsyncStorage:f,serverHooks:h}=g,x="/api/deals/[id]/proposals/send-email/route";function v(){return(0,n.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:f})}},7392:(e,a,t)=>{t.d(a,{I:()=>s});var o=t(1309);function s(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?o.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},4738:(e,a,t)=>{t.d(a,{_:()=>s});var o=t(3524);let s=global.__prisma__??new o.PrismaClient({log:["error"]})},421:(e,a,t)=>{t.d(a,{LM:()=>p,aG:()=>c});let o=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),s={basic:{code:"basic",name:"B\xe1sico",monthlyCents:14999,description:"Plano inicial para presen\xe7a digital essencial.",highlights:["Site institucional b\xe1sico (1 p\xe1gina)","Dom\xednio incluso (se ainda n\xe3o tiver)","Migra\xe7\xe3o gratuita","1 e-mail profissional"]},profissional:{code:"profissional",name:"Profissional",monthlyCents:24900,description:"Plano completo para opera\xe7\xe3o comercial online.",highlights:["Site institucional at\xe9 3 p\xe1ginas","Formul\xe1rio de contato + bot\xe3o WhatsApp","E-mails profissionais ilimitados","Suporte t\xe9cnico e atualiza\xe7\xf5es"]},pro:{code:"pro",name:"Pro",monthlyCents:39900,description:"Plano avan\xe7ado para expans\xe3o digital e vendas.",highlights:["Chatbot incluso no site","E-commerce b\xe1sico incluso","Atualiza\xe7\xe3o de site industrial com cat\xe1logo","Ranqueamento profissional no Google"]}},i={Institucional:{baseCents:18e4,features:["At\xe9 5 p\xe1ginas","Blog integrado","Galeria de imagens","Formul\xe1rio de contato","Mapa interativo","WhatsApp integrado"]},Industrial:{baseCents:28e4,features:["Cat\xe1logo de produtos","Ficha t\xe9cnica","Solicita\xe7\xe3o de or\xe7amento","\xc1rea do representante","Multil\xedngue"]},"E-commerce":{baseCents:38e4,features:["Carrinho de compras","Pagamentos online","Gestor de estoque","Cupons de desconto","Avalia\xe7\xf5es","Integra\xe7\xe3o com marketplaces"]},Blog:{baseCents:15e4,features:["Editor de posts","Categorias","Coment\xe1rios","Newsletter","SEO otimizado"]},Sistemas:{baseCents:45e4,features:["\xc1rea logada","Banco de dados","Relat\xf3rios","API integra\xe7\xe3o","Dashboard administrativo"]},Serviços:{baseCents:22e4,features:["Agendamento online","Portf\xf3lio","Depoimentos","Or\xe7amento r\xe1pido"]}},n=["Hospedagem com SSL Gr\xe1tis","Dom\xednio .com.br incluso (12 meses)","Suporte T\xe9cnico Ilimitado","Backup Di\xe1rio Autom\xe1tico","Manuten\xe7\xe3o Mensal","Migra\xe7\xe3o Gr\xe1tis (se aplic\xe1vel)","Gestor de Ativos Web","E-mails Profissionais"];function r(e){return o.format((e||0)/100)}function l(e){let a=String(e||"").toLowerCase();return a in s?a:"basic"}function d(e){return i[e]?e:"Institucional"}function p(e){return"HOSPEDAGEM"===String(e.dealType||"").toUpperCase()?e.breakdown.monthlyCents:"personalizado"===e.proposalType?e.breakdown.projectTotalCents:e.breakdown.monthlyCents}function c(e){let a=e.createdAt||new Date,t=l(e.planCode),o=s[t],p=d(e.projectType),c="personalizado"===e.proposalType?"personalizado":"hospedagem",m=function(e){let a=s[l(e.planCode)],t=i[d(e.projectType)],o=(e.selectedFeatures||[]).map(e=>String(e).trim()).filter(Boolean),n=o.filter((e,a)=>o.indexOf(e)===a),r=e.baseValueCents&&e.baseValueCents>0?e.baseValueCents:t.baseCents,p=r+15e3*n.length;return{monthlyCents:a.monthlyCents,monthlyName:a.name,projectBaseCents:r,selectedFeatureCount:n.length,selectedFeatureNames:n,projectTotalCents:p}}({...e,planCode:t,projectType:p,proposalType:c}),u=[{title:"Recorr\xeancia mensal ativa",description:`Plano ${m.monthlyName}: hospedagem, suporte t\xe9cnico, manuten\xe7\xe3o mensal e SSL inclusos.`},{title:"Dom\xednio",description:"nao"===e.domainOwn?"Dom\xednio .com.br incluso por 12 meses.":"Configura\xe7\xe3o do dom\xednio pr\xf3prio inclusa."},{title:"Migra\xe7\xe3o",description:"sim"===e.migration?"Migra\xe7\xe3o de site existente inclu\xedda sem custo.":"Migra\xe7\xe3o n\xe3o inclu\xedda nesta proposta."},{title:"E-mails profissionais",description:"sim"===e.emailProfessional?"E-mails profissionais inclu\xeddos.":"E-mails profissionais n\xe3o inclusos."},{title:"Site incluso na recorr\xeancia",description:`Site simples com at\xe9 ${e.pages||"1"} p\xe1ginas inclu\xeddo na recorr\xeancia mensal.`}];"personalizado"===c&&(u.push({title:`Projeto personalizado ${p}`,description:`Escopo base de ${r(m.projectBaseCents)}.`}),u.push({title:"Funcionalidades extras",description:m.selectedFeatureCount>0?`${m.selectedFeatureCount} selecionada(s): ${m.selectedFeatureNames.join(", ")}.`:"Sem funcionalidades extras adicionadas no momento."}));let g=[{label:`Recorr\xeancia mensal (${m.monthlyName})`,value:`${r(m.monthlyCents)}/m\xeas`}];if("personalizado"===c){if(g.push({label:"Projeto personalizado",value:"Ativo"}),g.push({label:"Tipo de site",value:p}),g.push({label:"Valor base",value:r(m.projectBaseCents)}),g.push({label:`Funcionalidades (+${r(15e3)} cada)`,value:`${m.selectedFeatureCount} selecionada(s)`}),m.selectedFeatureCount>0)for(let e of m.selectedFeatureNames)g.push({label:`+ ${e}`,value:r(15e3)});else g.push({label:"+ Sem funcionalidades extras",value:r(0)});g.push({label:"Total do projeto personalizado",value:r(m.projectTotalCents)})}else g.push({label:"Projeto personalizado",value:"N\xe3o inclu\xeddo"});let b="personalizado"===c?"6x"===e.paymentCondition?`Projeto personalizado (${p}) com ${m.selectedFeatureCount} plus pode ser pago em 6x de ${r(Math.round(m.projectTotalCents/6))} sem juros. Recorr\xeancia mensal segue ativa em ${r(m.monthlyCents)}/m\xeas.`:`Projeto personalizado (${p}) com ${m.selectedFeatureCount} plus \xe0 vista em ${r(m.projectTotalCents)}. Recorr\xeancia mensal segue ativa em ${r(m.monthlyCents)}/m\xeas.`:`Sem projeto personalizado nesta proposta. Cobran\xe7a apenas recorrente: ${r(m.monthlyCents)}/m\xeas.`,f=["Tempo de contrato da recorr\xeancia: 36 meses.","Renova\xe7\xe3o autom\xe1tica se n\xe3o houver manifesta\xe7\xe3o 90 dias antes.",`Recorr\xeancia mensal (${m.monthlyName}): ${r(m.monthlyCents)}/m\xeas.`,"personalizado"===c?"6x"===e.paymentCondition?`Projeto personalizado: ${r(m.projectTotalCents)} em 6x sem juros.`:`Projeto personalizado: ${r(m.projectTotalCents)} \xe0 vista.`:"Projeto personalizado n\xe3o contratado nesta proposta.","Validade da proposta: 7 dias corridos."],h=n.map(a=>({label:a,off:a.includes("Migra\xe7\xe3o")&&"sim"!==e.migration||a.includes("Dom\xednio")&&"nao"!==e.domainOwn||a.includes("E-mails")&&"sim"!==e.emailProfessional})),x="personalizado"===c?`Mensal + Projeto (${p})`:"Mensal (sem projeto personalizado)",v="personalizado"===c?"6x"===e.paymentCondition?"Projeto em 6x":"Projeto \xe0 vista":"N\xe3o se aplica";return{todayLabel:a.toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"}),title:e.title,clientName:e.clientName,companyName:e.companyName,proposalTypeLabel:x,paymentLabel:v,notes:e.notes,scope:e.scope,selectedPlanCode:t,selectedPlanName:o.name,selectedPlanMonthlyLabel:`${r(o.monthlyCents)}/m\xeas`,selectedPlanHighlights:o.highlights,planCards:Object.values(s).map(e=>({code:e.code,name:e.name,monthlyLabel:`${r(e.monthlyCents)}/m\xeas`,description:e.description,highlights:e.highlights,active:e.code===t})),scopeItems:u,investmentRows:g,financeSummary:b,terms:f,includedItems:h,breakdown:m}}}};var a=require("../../../../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),o=a.X(0,[7787,4833],()=>t(559));module.exports=o})();