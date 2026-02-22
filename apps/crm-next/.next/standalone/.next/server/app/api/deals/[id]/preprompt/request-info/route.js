"use strict";(()=>{var e={};e.id=7604,e.ids=[7604],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},4897:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>A,patchFetch:()=>R,requestAsyncStorage:()=>m,routeModule:()=>E,serverHooks:()=>N,staticGenerationAsyncStorage:()=>T});var i={};a.r(i),a.d(i,{POST:()=>p});var r=a(3278),o=a(5002),d=a(4877),n=a(1309),s=a(7392),l=a(9004),_=a(1043),u=a(4738);async function c(e){return(await u._.$queryRaw`
    SELECT ap.prompt_text, ap.prompt_json
    FROM client.ai_prompts ap
    JOIN client.project_briefs pb ON pb.id = ap.brief_id
    WHERE pb.organization_id = ${e}::uuid
    ORDER BY ap.created_at DESC
    LIMIT 1
  `)[0]||null}async function p(e,{params:t}){let a=(0,s.I)(e);if(a)return a;await (0,_.CQ)();let i=await e.json().catch(()=>({})),r=String(i.subject||"[KoddaHub] Precisamos de mais informa\xe7\xf5es do briefing").trim(),o=String(i.message||i.notes||"").trim(),d=String(i.dueAt||"").trim(),p=d?new Date(d):null,E=(Array.isArray(i.requestItems)?i.requestItems:String(i.requestItems||"").split("\n").map(e=>e.trim()).filter(Boolean)).map(e=>String(e||"").trim()).filter(Boolean).slice(0,20);if(!o&&0===E.length)return n.NextResponse.json({error:"Informe a mensagem ou pelo menos 1 item solicitado."},{status:422});try{let e=await u._.$transaction(async e=>{let a=await e.deal.findUnique({where:{id:t.id},include:{organization:{select:{id:!0,legalName:!0,billingEmail:!0}}}});if(!a)throw Error("Deal n\xe3o encontrado");if("HOSPEDAGEM"!==a.dealType)throw Error("Fluxo pr\xe9-prompt dispon\xedvel somente para hospedagem");if("CLIENT"!==a.lifecycleStatus)throw Error("Fluxo pr\xe9-prompt dispon\xedvel apenas para cliente fechado");let d=await e.dealPromptRevision.findFirst({where:{dealId:a.id},orderBy:{version:"desc"}}),n=d?.promptText||"",s=d?.promptJson||null;if(!n&&a.organizationId){let e=await c(a.organizationId);n=String(e?.prompt_text||""),s=e?.prompt_json||null}let _=d?d.version:1,u="string"==typeof i.promptText?i.promptText.trim():"",m=i.promptJson??null;u&&(n=u),m&&(s=m);let T=d?await e.dealPromptRevision.update({where:{id:d.id},data:{promptText:n||"Prompt pendente de refinamento.",promptJson:s,status:"REQUESTED_INFO",requestedNotes:o||E.join(" | ")||null,updatedAt:new Date}}):await e.dealPromptRevision.create({data:{dealId:a.id,version:_,promptText:n||"Prompt pendente de refinamento.",promptJson:s,status:"REQUESTED_INFO",requestedNotes:o||E.join(" | ")||null,createdBy:"ADMIN"}}),N=a.contactEmail||a.organization?.billingEmail,A=null;N&&(A=(await e.emailQueue.create({data:{organizationId:a.organizationId||null,emailTo:N,subject:r||"[KoddaHub] Precisamos de mais informa\xe7\xf5es para seu site",body:["Ol\xe1!","","Para avan\xe7armos na etapa Pr\xe9-prompt do seu Site 24h, precisamos destes detalhes:","",...E.length>0?E.map((e,t)=>`${t+1}. ${e}`):[],...o?["",o]:[],"","Responda este e-mail com as informa\xe7\xf5es solicitadas.","Equipe KoddaHub."].join("\n"),status:"PENDING"}})).id);let R=await e.$queryRaw`
        INSERT INTO crm.deal_prompt_request(
          deal_id,
          prompt_revision_id,
          subject,
          request_items,
          message,
          due_at,
          email_queue_id,
          status,
          created_by,
          created_at,
          updated_at
        )
        VALUES(
          ${a.id}::uuid,
          ${T.id}::uuid,
          ${r||"[KoddaHub] Solicita\xe7\xe3o de informa\xe7\xf5es adicionais"},
          ${JSON.stringify(E)}::jsonb,
          ${o||E.join("\n")||"Solicita\xe7\xe3o de informa\xe7\xf5es adicionais"},
          ${p&&!Number.isNaN(p.getTime())?p:null},
          ${A}::uuid,
          'SENT',
          'ADMIN',
          now(),
          now()
        )
        RETURNING id::text
      `;return await (0,l.hj)(e,{id:a.id,dealType:a.dealType},"pre_prompt"),await e.dealActivity.create({data:{dealId:a.id,activityType:"PREPROMPT_REQUEST_INFO",content:"Solicita\xe7\xe3o de informa\xe7\xe3o adicional enviada ao cliente por e-mail.",metadata:{subject:r,dueAt:p&&!Number.isNaN(p.getTime())?p.toISOString():null,requestItems:E,revisionVersion:T.version,emailQueueId:A},createdBy:"ADMIN"}}),{requestId:R[0]?.id||null,emailQueueId:A,revisionId:T.id,version:T.version}});return n.NextResponse.json({ok:!0,...e})}catch(e){return n.NextResponse.json({error:"Falha ao solicitar informa\xe7\xf5es adicionais",details:String(e)},{status:500})}}let E=new r.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/deals/[id]/preprompt/request-info/route",pathname:"/api/deals/[id]/preprompt/request-info",filename:"route",bundlePath:"app/api/deals/[id]/preprompt/request-info/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/preprompt/request-info/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:m,staticGenerationAsyncStorage:T,serverHooks:N}=E,A="/api/deals/[id]/preprompt/request-info/route";function R(){return(0,d.patchFetch)({serverHooks:N,staticGenerationAsyncStorage:T})}},7392:(e,t,a)=>{a.d(t,{I:()=>r});var i=a(1309);function r(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>u,_g:()=>l,dT:()=>_,gL:()=>p,hj:()=>c,oM:()=>E});var i=a(4738);let r={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},o=new Set(["fechado_ganho","assinatura_ativa_ganho"]),d=new Set(["perdido","perdido_abandonado"]),n=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],s=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return o.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:d.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function _(e){return"HOSPEDAGEM"===e?n:s}async function u(e){let t=r[e],a=await i._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function c(e,t,a){let i=_(t.dealType),r=a?i.find(e=>e.code===a):i[0];if(!r)throw Error("Etapa operacional inv\xe1lida");let o=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}});return o?.stageCode===r.code?o:(o&&await e.dealOperation.update({where:{id:o.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:r.code,stageName:r.name,stageOrder:r.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function p(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let i=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!i||i.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let r=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),o=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:i.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=Math.max(0,Math.min(t.positionIndex??o.length,o.length)),n=o.map(e=>e.id);n.splice(d,0,a.id);let s=l(i.code),_=await e.deal.update({where:{id:a.id},data:{stageId:i.id,lifecycleStatus:s.lifecycleStatus,isClosed:s.isClosed,closedAt:s.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:i.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<r.length;t+=1)await e.deal.update({where:{id:r[t].id},data:{positionIndex:t}});for(let t=0;t<n.length;t+=1)await e.deal.update({where:{id:n[t]},data:{positionIndex:t}});return"CLIENT"===s.lifecycleStatus&&await c(e,{id:a.id,dealType:a.dealType}),_}function E(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>r});var i=a(3524);let r=global.__prisma__??new i.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>m,CQ:()=>c,Df:()=>u,LO:()=>N,UH:()=>p,Ug:()=>E,js:()=>T,wP:()=>A});var i=a(5315),r=a.n(i),o=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",n=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],s=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function _(e){let t=r().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=r().resolve(t),i=r().resolve(e);return i===a||i.startsWith(`${a}${r().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function u(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function c(){if(!s){for(let e of(await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_operation_substep (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      stage_code VARCHAR(80) NOT NULL,
      substep_code VARCHAR(80) NOT NULL,
      substep_name VARCHAR(140) NOT NULL,
      substep_order INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      is_required BOOLEAN NOT NULL DEFAULT true,
      owner VARCHAR(120),
      notes TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, stage_code, substep_code)
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `),await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.template_model_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      root_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `),await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_request (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      prompt_revision_id UUID REFERENCES crm.deal_prompt_revision(id) ON DELETE SET NULL,
      subject VARCHAR(220) NOT NULL,
      request_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      message TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      email_queue_id UUID,
      status VARCHAR(20) NOT NULL DEFAULT 'SENT',
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_site_release (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      version INT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      project_root VARCHAR(500) NOT NULL,
      assets_path VARCHAR(500) NOT NULL,
      prompt_md_path VARCHAR(500),
      prompt_json_path VARCHAR(500),
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, version)
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, version DESC)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
      ON crm.deal_site_release(deal_id, status)
  `),await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_site_variant (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      variant_code VARCHAR(10) NOT NULL,
      folder_path VARCHAR(500) NOT NULL,
      entry_file VARCHAR(255) NOT NULL DEFAULT 'index.html',
      preview_url VARCHAR(500),
      source_hash VARCHAR(128),
      status VARCHAR(40) NOT NULL DEFAULT 'BASE_PREPARED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (release_id, variant_code)
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
      ON crm.deal_site_variant(release_id, status)
  `),await o._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
      ON crm.deal_prompt_asset(release_id, asset_type)
  `),await o._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),l)){let t=_(r().resolve(d,e.folder));await o._.$queryRaw`
      INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
      VALUES (${e.code}, ${e.name}, ${t}, ${e.entryFile}, ${e.isDefault}, true, now(), now())
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        root_path = EXCLUDED.root_path,
        entry_file = EXCLUDED.entry_file,
        is_default = EXCLUDED.is_default,
        is_active = true,
        updated_at = now()
    `}await o._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),s=!0}}async function p(){return await c(),(await o._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function E(e){await c();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let i=_(e.rootPath),r=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,n=void 0===e.isActive||!!e.isActive;d&&await o._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let s=await o._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${i}, ${r}, ${d}, ${n}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return s[0]?.id||null}async function m(e){await c();let t=String(e||"").trim().toLowerCase(),a=t?await o._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${t}
          AND is_active = true
        LIMIT 1
      `:await o._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function T(e){for(let t of(await c(),n))await o._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function N(e){return await c(),o._.$queryRaw`
    SELECT
      id::text,
      deal_id::text,
      stage_code,
      substep_code,
      substep_name,
      substep_order,
      status,
      is_required,
      owner,
      notes,
      started_at,
      completed_at,
      created_at,
      updated_at
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
    ORDER BY substep_order ASC, created_at ASC
  `}async function A(e){await c();let t=(await o._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),i=Number(t.required_completed||0),r=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:i,pendingTotal:r,ready:a>0&&0===r}}}};var t=require("../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),i=t.X(0,[7787,4833],()=>a(4897));module.exports=i})();