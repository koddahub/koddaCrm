"use strict";(()=>{var e={};e.id=1708,e.ids=[1708],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},8899:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>N,patchFetch:()=>A,requestAsyncStorage:()=>p,routeModule:()=>E,serverHooks:()=>m,staticGenerationAsyncStorage:()=>T});var r={};t.r(r),t.d(r,{POST:()=>u});var d=t(3278),i=t(5002),o=t(4877),s=t(1309),n=t(7392),l=t(9004),_=t(4738),c=t(1043);async function u(e,{params:a}){let t=(0,n.I)(e);if(t)return t;let r=await e.json().catch(()=>({})),d=String(r.stageCode||"").trim(),i=String(r.reason||"Mudan\xe7a manual de etapa operacional").trim();if(!d)return s.NextResponse.json({error:"stageCode \xe9 obrigat\xf3rio"},{status:422});try{let e=await _._.$transaction(async e=>{let t=await e.deal.findUnique({where:{id:a.id},select:{id:!0,title:!0,dealType:!0,lifecycleStatus:!0}});if(!t)throw Error("Deal n\xe3o encontrado");if("CLIENT"!==t.lifecycleStatus)throw Error("Opera\xe7\xe3o dispon\xedvel apenas para cliente fechado");if(!new Set((0,l.dT)(t.dealType).map(e=>e.code)).has(d))throw Error("Etapa operacional inv\xe1lida");let r=await (0,l.hj)(e,{id:t.id,dealType:t.dealType},d);return await e.dealActivity.create({data:{dealId:t.id,activityType:"OPERATION_STAGE_CHANGED",content:`Etapa operacional alterada para ${r.stageName}.`,metadata:{stageCode:r.stageCode,reason:i},createdBy:"ADMIN"}}),{dealId:t.id,stageCode:r.stageCode,stageName:r.stageName,stageOrder:r.stageOrder}});return"publicacao"===e.stageCode&&await (0,c.js)(e.dealId),s.NextResponse.json({ok:!0,...e})}catch(e){return s.NextResponse.json({error:"Falha ao alterar etapa operacional",details:String(e)},{status:500})}}let E=new d.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/deals/[id]/operation/stage/route",pathname:"/api/deals/[id]/operation/stage",filename:"route",bundlePath:"app/api/deals/[id]/operation/stage/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/operation/stage/route.ts",nextConfigOutput:"standalone",userland:r}),{requestAsyncStorage:p,staticGenerationAsyncStorage:T,serverHooks:m}=E,N="/api/deals/[id]/operation/stage/route";function A(){return(0,o.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:T})}},7392:(e,a,t)=>{t.d(a,{I:()=>d});var r=t(1309);function d(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?r.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,a,t)=>{t.d(a,{Bt:()=>c,_g:()=>l,dT:()=>_,gL:()=>E,hj:()=>u,oM:()=>p});var r=t(4738);let d={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},i=new Set(["fechado_ganho","assinatura_ativa_ganho"]),o=new Set(["perdido","perdido_abandonado"]),s=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],n=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return i.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:o.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function _(e){return"HOSPEDAGEM"===e?s:n}async function c(e){let a=d[e],t=await r._.pipeline.findUnique({where:{code:a},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!t)throw Error(`Pipeline ${a} n\xe3o encontrado`);return t}async function u(e,a,t){let r=_(a.dealType),d=async()=>{let t=await e.dealOperation.findFirst({where:{dealId:a.id,operationType:a.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}}),r=await e.dealOperation.findFirst({where:{dealId:a.id,operationType:a.dealType,status:"COMPLETED"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}});if(t&&r&&Number(r.stageOrder||0)>Number(t.stageOrder||0)&&r.stageCode)return r.stageCode;if("HOSPEDAGEM"!==a.dealType)return null;let[d,i,o,s]=await Promise.all([e.dealClientApproval.findFirst({where:{dealId:a.id},orderBy:{createdAt:"desc"},select:{status:!0}}),e.dealTemplateRevision.findFirst({where:{dealId:a.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{status:!0}}),e.dealActivity.findFirst({where:{dealId:a.id,activityType:{in:["CLIENT_APPROVAL_REQUESTED","CLIENT_REQUESTED_CHANGES","CLIENT_APPROVED"]}},orderBy:{createdAt:"desc"},select:{activityType:!0}}),e.dealPromptRevision.findFirst({where:{dealId:a.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{id:!0}})]),n=String(d?.status||"").toUpperCase(),l=String(i?.status||"").toUpperCase(),_=String(o?.activityType||"").toUpperCase();return"APPROVED"===n||"APPROVED_CLIENT"===l||"CLIENT_APPROVED"===_?"publicacao":"CHANGES_REQUESTED"===n||"NEEDS_ADJUSTMENTS"===l||"CLIENT_REQUESTED_CHANGES"===_?"ajustes":"PENDING"===n||["SENT_CLIENT","IN_REVIEW"].includes(l)||"CLIENT_APPROVAL_REQUESTED"===_?"aprovacao_cliente":l?"template_v1":s?.id?"pre_prompt":null},i=await e.dealOperation.findFirst({where:{dealId:a.id,operationType:a.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}}),o=t;if(!o){let e=await d();if(!e&&i||e&&i&&(r.find(a=>a.code===e)?.order||0)<=Number(i.stageOrder||0))return i;e&&(o=e)}let s=o?r.find(e=>e.code===o):r[0];if(!s)throw Error("Etapa operacional inv\xe1lida");return i?.stageCode===s.code?i:(i&&await e.dealOperation.update({where:{id:i.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:a.id,operationType:a.dealType,stageCode:s.code,stageName:s.name,stageOrder:s.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function E(e,a){let t=await e.deal.findUnique({where:{id:a.dealId},include:{stage:!0,pipeline:!0}});if(!t)throw Error("Deal n\xe3o encontrado");let r=await e.pipelineStage.findUnique({where:{id:a.toStageId}});if(!r||r.pipelineId!==t.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let d=await e.deal.findMany({where:{pipelineId:t.pipelineId,stageId:t.stageId,id:{not:t.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),i=await e.deal.findMany({where:{pipelineId:t.pipelineId,stageId:r.id,id:{not:t.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),o=Math.max(0,Math.min(a.positionIndex??i.length,i.length)),s=i.map(e=>e.id);s.splice(o,0,t.id);let n=l(r.code),_=await e.deal.update({where:{id:t.id},data:{stageId:r.id,lifecycleStatus:n.lifecycleStatus,isClosed:n.isClosed,closedAt:n.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:t.id,fromStageId:t.stageId,toStageId:r.id,changedBy:a.changedBy||"ADMIN",reason:a.reason||null}});for(let a=0;a<d.length;a+=1)await e.deal.update({where:{id:d[a].id},data:{positionIndex:a}});for(let a=0;a<s.length;a+=1)await e.deal.update({where:{id:s[a]},data:{positionIndex:a}});return"CLIENT"===n.lifecycleStatus&&await u(e,{id:t.id,dealType:t.dealType}),_}function p(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,a,t)=>{t.d(a,{_:()=>d});var r=t(3524);let d=global.__prisma__??new r.PrismaClient({log:["error"]})},1043:(e,a,t)=>{t.d(a,{Bv:()=>T,CQ:()=>u,Df:()=>c,LO:()=>N,UH:()=>E,Ug:()=>p,js:()=>m,wP:()=>A});var r=t(5315),d=t.n(r),i=t(4738);let o=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",s=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],n=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function _(e){let a=d().resolve(String(e||"").trim());if(!a)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,a){let t=d().resolve(a),r=d().resolve(e);return r===t||r.startsWith(`${t}${d().sep}`)}(a,o))throw Error(`Caminho do modelo deve estar dentro de ${o}`);return a}function c(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function u(){if(!n){for(let e of(await i._.$executeRawUnsafe(`
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
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `),await i._.$executeRawUnsafe(`
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
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `),await i._.$executeRawUnsafe(`
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
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await i._.$executeRawUnsafe(`
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
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, version DESC)
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
      ON crm.deal_site_release(deal_id, status)
  `),await i._.$executeRawUnsafe(`
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
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
      ON crm.deal_site_variant(release_id, status)
  `),await i._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
      ON crm.deal_prompt_asset(release_id, asset_type)
  `),await i._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),l)){let a=_(d().resolve(o,e.folder));await i._.$queryRaw`
      INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
      VALUES (${e.code}, ${e.name}, ${a}, ${e.entryFile}, ${e.isDefault}, true, now(), now())
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        root_path = EXCLUDED.root_path,
        entry_file = EXCLUDED.entry_file,
        is_default = EXCLUDED.is_default,
        is_active = true,
        updated_at = now()
    `}await i._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),n=!0}}async function E(){return await u(),(await i._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function p(e){await u();let a=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!a)throw Error("C\xf3digo do modelo inv\xe1lido");let t=e.name.trim();if(!t)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let r=_(e.rootPath),d=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",o=!!e.isDefault,s=void 0===e.isActive||!!e.isActive;o&&await i._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let n=await i._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${a}, ${t}, ${r}, ${d}, ${o}, ${s}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return n[0]?.id||null}async function T(e){await u();let a=String(e||"").trim().toLowerCase(),t=a?await i._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${a}
          AND is_active = true
        LIMIT 1
      `:await i._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return t[0]?{id:t[0].id,code:t[0].code,name:t[0].name,rootPath:t[0].root_path,entryFile:t[0].entry_file,isDefault:t[0].is_default}:null}async function m(e){for(let a of(await u(),s))await i._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${a.code}, ${a.name}, ${a.order}, 'PENDING', ${a.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function N(e){return await u(),i._.$queryRaw`
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
  `}async function A(e){await u();let a=(await i._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},t=Number(a.required_total||0),r=Number(a.required_completed||0),d=Number(a.pending_total||0);return{requiredTotal:t,requiredCompleted:r,pendingTotal:d,ready:t>0&&0===d}}}};var a=require("../../../../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),r=a.X(0,[7787,4833],()=>t(8899));module.exports=r})();