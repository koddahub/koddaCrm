"use strict";(()=>{var e={};e.id=1708,e.ids=[1708],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},8899:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>N,patchFetch:()=>f,requestAsyncStorage:()=>E,routeModule:()=>p,serverHooks:()=>T,staticGenerationAsyncStorage:()=>m});var o={};a.r(o),a.d(o,{POST:()=>_});var r=a(3278),i=a(5002),d=a(4877),n=a(1309),s=a(7392),l=a(9004),c=a(4738),u=a(1043);async function _(e,{params:t}){let a=(0,s.I)(e);if(a)return a;let o=await e.json().catch(()=>({})),r=String(o.stageCode||"").trim(),i=String(o.reason||"Mudan\xe7a manual de etapa operacional").trim();if(!r)return n.NextResponse.json({error:"stageCode \xe9 obrigat\xf3rio"},{status:422});try{let e=await c._.$transaction(async e=>{let a=await e.deal.findUnique({where:{id:t.id},select:{id:!0,title:!0,dealType:!0,lifecycleStatus:!0}});if(!a)throw Error("Deal n\xe3o encontrado");if("CLIENT"!==a.lifecycleStatus)throw Error("Opera\xe7\xe3o dispon\xedvel apenas para cliente fechado");if(!new Set((0,l.dT)(a.dealType).map(e=>e.code)).has(r))throw Error("Etapa operacional inv\xe1lida");let o=await (0,l.hj)(e,{id:a.id,dealType:a.dealType},r);return await e.dealActivity.create({data:{dealId:a.id,activityType:"OPERATION_STAGE_CHANGED",content:`Etapa operacional alterada para ${o.stageName}.`,metadata:{stageCode:o.stageCode,reason:i},createdBy:"ADMIN"}}),{dealId:a.id,stageCode:o.stageCode,stageName:o.stageName,stageOrder:o.stageOrder}});return"publicacao"===e.stageCode&&await (0,u.js)(e.dealId),n.NextResponse.json({ok:!0,...e})}catch(e){return n.NextResponse.json({error:"Falha ao alterar etapa operacional",details:String(e)},{status:500})}}let p=new r.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/deals/[id]/operation/stage/route",pathname:"/api/deals/[id]/operation/stage",filename:"route",bundlePath:"app/api/deals/[id]/operation/stage/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/operation/stage/route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:E,staticGenerationAsyncStorage:m,serverHooks:T}=p,N="/api/deals/[id]/operation/stage/route";function f(){return(0,d.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:m})}},7392:(e,t,a)=>{a.d(t,{I:()=>r});var o=a(1309);function r(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?o.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>u,_g:()=>l,dT:()=>c,gL:()=>p,hj:()=>_,oM:()=>E});var o=a(4738);let r={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},i=new Set(["fechado_ganho","assinatura_ativa_ganho"]),d=new Set(["perdido","perdido_abandonado"]),n=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],s=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return i.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:d.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function c(e){return"HOSPEDAGEM"===e?n:s}async function u(e){let t=r[e],a=await o._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function _(e,t,a){let o=c(t.dealType),r=a?o.find(e=>e.code===a):o[0];if(!r)throw Error("Etapa operacional inv\xe1lida");let i=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}});return i?.stageCode===r.code?i:(i&&await e.dealOperation.update({where:{id:i.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:r.code,stageName:r.name,stageOrder:r.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function p(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let o=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!o||o.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let r=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),i=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:o.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=Math.max(0,Math.min(t.positionIndex??i.length,i.length)),n=i.map(e=>e.id);n.splice(d,0,a.id);let s=l(o.code),c=await e.deal.update({where:{id:a.id},data:{stageId:o.id,lifecycleStatus:s.lifecycleStatus,isClosed:s.isClosed,closedAt:s.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:o.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<r.length;t+=1)await e.deal.update({where:{id:r[t].id},data:{positionIndex:t}});for(let t=0;t<n.length;t+=1)await e.deal.update({where:{id:n[t]},data:{positionIndex:t}});return"CLIENT"===s.lifecycleStatus&&await _(e,{id:a.id,dealType:a.dealType}),c}function E(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>r});var o=a(3524);let r=global.__prisma__??new o.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>m,CQ:()=>_,Df:()=>u,LO:()=>N,UH:()=>p,Ug:()=>E,VW:()=>c,js:()=>T,wP:()=>f});var o=a(5315),r=a.n(o),i=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",n=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],s=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function c(e){let t=r().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=r().resolve(t),o=r().resolve(e);return o===a||o.startsWith(`${a}${r().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function u(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function _(){if(!s){for(let e of(await i._.$executeRawUnsafe(`
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
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),l)){let t=c(r().resolve(d,e.folder));await i._.$queryRaw`
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
    `}await i._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),s=!0}}async function p(){return await _(),(await i._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function E(e){await _();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let o=c(e.rootPath),r=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,n=void 0===e.isActive||!!e.isActive;d&&await i._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let s=await i._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${o}, ${r}, ${d}, ${n}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return s[0]?.id||null}async function m(e){await _();let t=String(e||"").trim().toLowerCase(),a=t?await i._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${t}
          AND is_active = true
        LIMIT 1
      `:await i._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function T(e){for(let t of(await _(),n))await i._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function N(e){return await _(),i._.$queryRaw`
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
  `}async function f(e){await _();let t=(await i._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),o=Number(t.required_completed||0),r=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:o,pendingTotal:r,ready:a>0&&0===r}}}};var t=require("../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),o=t.X(0,[7787,4833],()=>a(8899));module.exports=o})();