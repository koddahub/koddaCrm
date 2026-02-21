"use strict";(()=>{var e={};e.id=8449,e.ids=[8449],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},2048:e=>{e.exports=require("fs")},5315:e=>{e.exports=require("path")},962:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>A,patchFetch:()=>N,requestAsyncStorage:()=>E,routeModule:()=>m,serverHooks:()=>f,staticGenerationAsyncStorage:()=>T});var i={};a.r(i),a.d(i,{GET:()=>_});var o=a(3278),r=a(5002),d=a(4877),n=a(1309),s=a(7392),l=a(9004),c=a(2840),u=a(1043),p=a(4738);async function _(e,{params:t}){let a=(0,s.I)(e);if(a)return a;let i=await p._.deal.findUnique({where:{id:t.id},include:{organization:{select:{id:!0,legalName:!0,domain:!0,billingEmail:!0}},operations:{orderBy:[{stageOrder:"asc"},{startedAt:"asc"}]},promptRevisions:{orderBy:[{version:"desc"},{createdAt:"desc"}]},templateRevisions:{orderBy:[{version:"desc"},{createdAt:"desc"}]},clientApprovals:{orderBy:{createdAt:"desc"},take:20},publishChecks:{orderBy:{checkedAt:"desc"},take:20},activities:{orderBy:{createdAt:"desc"},take:80}}});if(!i)return n.NextResponse.json({error:"Deal n\xe3o encontrado"},{status:404});let o=null;if(i.organizationId){let e=(0,c.P1)(i.organization?.legalName,i.organizationId),t=(0,c.Mb)(e);o=(0,c.m$)(t)}let r=i.templateRevisions[0]||null,d=r?(0,c.m$)(r.projectPath):o,_=(0,l.dT)(i.dealType).map(e=>({code:e.code,name:e.name,order:e.order})),m=i.operations.find(e=>"ACTIVE"===e.status)?.stageCode||_[0]?.code||null,E=await (0,u.UH)(),T=[],f={requiredTotal:0,requiredCompleted:0,pendingTotal:0,ready:!1};return"HOSPEDAGEM"===i.dealType&&(await (0,u.js)(i.id),T=await (0,u.LO)(i.id),f=await (0,u.wP)(i.id)),n.NextResponse.json({deal:{id:i.id,dealType:i.dealType,lifecycleStatus:i.lifecycleStatus,organizationId:i.organizationId,organizationName:i.organization?.legalName||null,organizationDomain:i.organization?.domain||null,billingEmail:i.organization?.billingEmail||i.contactEmail||null},operation:{activeStageCode:m,stageTabs:_,history:i.operations},prompt:{latest:i.promptRevisions[0]||null,revisions:i.promptRevisions},template:{latest:r,revisions:i.templateRevisions,vscode:d,sshConfig:(0,u.Df)(),catalog:E},approval:{latest:i.clientApprovals[0]||null,history:i.clientApprovals},publication:{checks:i.publishChecks,substeps:T.map(e=>({id:e.id,dealId:e.deal_id,stageCode:e.stage_code,substepCode:e.substep_code,substepName:e.substep_name,substepOrder:e.substep_order,status:e.status,isRequired:e.is_required,owner:e.owner,notes:e.notes,startedAt:e.started_at,completedAt:e.completed_at,createdAt:e.created_at,updatedAt:e.updated_at})),summary:f},operationLogsSummary:{totalActivities:i.activities.length,latestActivities:i.activities.slice(0,10),hint:"Hist\xf3rico completo dispon\xedvel na aba Atividades."}})}let m=new o.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/deals/[id]/operation-flow/route",pathname:"/api/deals/[id]/operation-flow",filename:"route",bundlePath:"app/api/deals/[id]/operation-flow/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/operation-flow/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:E,staticGenerationAsyncStorage:T,serverHooks:f}=m,A="/api/deals/[id]/operation-flow/route";function N(){return(0,d.patchFetch)({serverHooks:f,staticGenerationAsyncStorage:T})}},7392:(e,t,a)=>{a.d(t,{I:()=>o});var i=a(1309);function o(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>u,_g:()=>l,dT:()=>c,gL:()=>_,hj:()=>p,oM:()=>m});var i=a(4738);let o={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},r=new Set(["fechado_ganho","assinatura_ativa_ganho"]),d=new Set(["perdido","perdido_abandonado"]),n=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],s=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return r.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:d.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function c(e){return"HOSPEDAGEM"===e?n:s}async function u(e){let t=o[e],a=await i._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function p(e,t,a){let i=c(t.dealType),o=a?i.find(e=>e.code===a):i[0];if(!o)throw Error("Etapa operacional inv\xe1lida");let r=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}});return r?.stageCode===o.code?r:(r&&await e.dealOperation.update({where:{id:r.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:o.code,stageName:o.name,stageOrder:o.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function _(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let i=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!i||i.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let o=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),r=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:i.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=Math.max(0,Math.min(t.positionIndex??r.length,r.length)),n=r.map(e=>e.id);n.splice(d,0,a.id);let s=l(i.code),c=await e.deal.update({where:{id:a.id},data:{stageId:i.id,lifecycleStatus:s.lifecycleStatus,isClosed:s.isClosed,closedAt:s.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:i.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<o.length;t+=1)await e.deal.update({where:{id:o[t].id},data:{positionIndex:t}});for(let t=0;t<n.length;t+=1)await e.deal.update({where:{id:n[t]},data:{positionIndex:t}});return"CLIENT"===s.lifecycleStatus&&await p(e,{id:a.id,dealType:a.dealType}),c}function m(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>o});var i=a(3524);let o=global.__prisma__??new i.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>E,CQ:()=>p,Df:()=>u,LO:()=>f,UH:()=>_,Ug:()=>m,VW:()=>c,js:()=>T,wP:()=>A});var i=a(5315),o=a.n(i),r=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",n=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],s=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function c(e){let t=o().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=o().resolve(t),i=o().resolve(e);return i===a||i.startsWith(`${a}${o().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function u(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function p(){if(!s){for(let e of(await r._.$executeRawUnsafe(`
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
  `),await r._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
  `),await r._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `),await r._.$executeRawUnsafe(`
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
  `),await r._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `),await r._.$executeRawUnsafe(`
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
  `),await r._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `),await r._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await r._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),l)){let t=c(o().resolve(d,e.folder));await r._.$queryRaw`
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
    `}await r._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),s=!0}}async function _(){return await p(),(await r._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function m(e){await p();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let i=c(e.rootPath),o=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,n=void 0===e.isActive||!!e.isActive;d&&await r._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let s=await r._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${i}, ${o}, ${d}, ${n}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return s[0]?.id||null}async function E(e){await p();let t=String(e||"").trim().toLowerCase(),a=t?await r._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${t}
          AND is_active = true
        LIMIT 1
      `:await r._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function T(e){for(let t of(await p(),n))await r._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function f(e){return await p(),r._.$queryRaw`
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
  `}async function A(e){await p();let t=(await r._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),i=Number(t.required_completed||0),o=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:i,pendingTotal:o,ready:a>0&&0===o}}},2840:(e,t,a)=>{a.d(t,{EN:()=>E,H_:()=>n,Mb:()=>_,P1:()=>p,ag:()=>A,bg:()=>T,gK:()=>m,m$:()=>f});var i=a(4770),o=a(2048),r=a(5315),d=a.n(r);let n=process.env.CLIENT_PROJECTS_ROOT||"/home/server/projects/clientes";process.env.PREVIEW_BASE_URL;let s=process.env.CRM_PUBLIC_BASE_URL||"https://kodda-crm.koddahub.com.br",l=process.env.PORTAL_BASE_URL||"http://192.168.25.3:8081",c=process.env.VSCODE_SSH_HOST||"server",u=process.env.VSCODE_WEB_BASE_URL||"";function p(e,t){let a=(e||"cliente").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"cliente",i=t.replace(/-/g,"").slice(0,8);return`${a}-${i}`}function _(e){let t=d().resolve(n,e),a=d().resolve(n);if(!(t===a||t.startsWith(`${a}${d().sep}`)))throw Error("project_path_invalid");return t}async function m(e){let t=d().resolve(n),a=d().resolve(e);if(!(a===t||a.startsWith(`${t}${d().sep}`)))throw Error("project_path_outside_root");await o.promises.mkdir(a,{recursive:!0})}function E(e,t="index.html"){let a=s.replace(/\/+$/,""),i=t.replace(/^\/+/,"");return i&&"index.html"!==i?`${a}/${e}/previewv1?entry=${encodeURIComponent(i)}`:`${a}/${e}/previewv1`}function T(e){let t=l.replace(/\/+$/,"");return`${t}/portal/approval/${e}`}function f(e){let t=e.replace(/#/g,"%23");return{deepLink:`vscode://vscode-remote/ssh-remote+${c}${t}`,webLink:u?`${u.replace(/\/+$/,"")}/?folder=${encodeURIComponent(t)}`:null}}async function A(e,t="index.html"){var a;let r=d().resolve(e,t),n=d().resolve(e);if(!(r===n||r.startsWith(`${n}${d().sep}`)))throw Error("entry_file_invalid");return a=(await o.promises.readFile(r,"utf8")).replace(/<!--[\s\S]*?-->/g,"").replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/\bdata-timestamp="[^"]*"/gi,"").replace(/\bnonce="[^"]*"/gi,"").replace(/\s+/g," ").trim(),(0,i.createHash)("sha256").update(a).digest("hex")}}};var t=require("../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),i=t.X(0,[7787,4833],()=>a(962));module.exports=i})();