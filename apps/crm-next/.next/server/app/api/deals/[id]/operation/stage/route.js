"use strict";(()=>{var e={};e.id=1708,e.ids=[1708],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},7408:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>A,patchFetch:()=>R,requestAsyncStorage:()=>T,routeModule:()=>p,serverHooks:()=>m,staticGenerationAsyncStorage:()=>N});var i={};a.r(i),a.d(i,{POST:()=>u});var r=a(3278),d=a(5002),o=a(4877),s=a(1309),n=a(7392),l=a(9004),_=a(4738),c=a(1043);class E extends Error{constructor(e,t){super(e),this.status=t}}async function u(e,{params:t}){let a=(0,n.I)(e);if(a)return a;let i=await e.json().catch(()=>({})),r=String(i.stageCode||"").trim(),d=String(i.projectId||"").trim(),o=String(i.reason||"Mudan\xe7a manual de etapa operacional").trim();if(!r)return s.NextResponse.json({error:"stageCode \xe9 obrigat\xf3rio"},{status:422});if(!d)return s.NextResponse.json({error:"projectId \xe9 obrigat\xf3rio"},{status:422});try{let e=await _._.$transaction(async e=>{let a=await e.deal.findUnique({where:{id:t.id},select:{id:!0,title:!0,dealType:!0,lifecycleStatus:!0,organizationId:!0}});if(!a)throw new E("Deal n\xe3o encontrado",404);if("CLIENT"!==a.lifecycleStatus)throw new E("Opera\xe7\xe3o dispon\xedvel apenas para cliente fechado",409);if(!a.organizationId)throw new E("Deal sem organiza\xe7\xe3o vinculada",422);if(!new Set((0,l.dT)(a.dealType).map(e=>e.code)).has(r))throw new E("Etapa operacional inv\xe1lida",422);let i=(await e.$queryRaw`
        SELECT id::text AS id, domain
        FROM client.projects
        WHERE id = ${d}::uuid
        LIMIT 1
      `)[0]||null;if(!i)throw new E("Projeto n\xe3o encontrado",404);let s=await e.$queryRaw`
        SELECT 1 AS ok
        FROM client.projects
        WHERE id = ${d}::uuid
          AND organization_id = ${a.organizationId}::uuid
        LIMIT 1
      `;if(!s[0]?.ok)throw new E("Projeto n\xe3o pertence ao cliente deste deal",403);let n=await (0,l.hj)(e,{id:a.id,dealType:a.dealType},r);return await e.$executeRaw`
        INSERT INTO crm.project_operation_state (
          organization_id, project_id, deal_id, stage, created_at, updated_at
        )
        VALUES (
          ${a.organizationId}::uuid, ${d}::uuid, ${a.id}::uuid, ${n.stageCode}, now(), now()
        )
        ON CONFLICT (project_id)
        DO UPDATE SET
          stage = EXCLUDED.stage,
          deal_id = EXCLUDED.deal_id,
          updated_at = now()
      `,await e.dealActivity.create({data:{dealId:a.id,activityType:"OPERATION_STAGE_CHANGED",content:`Etapa operacional do projeto alterada para ${n.stageName}.`,metadata:{stageCode:n.stageCode,reason:o,project_id:d,project_domain:i.domain||null},createdBy:"ADMIN"}}),{dealId:a.id,projectId:d,stageCode:n.stageCode,stageName:n.stageName,stageOrder:n.stageOrder}});return"publicacao"===e.stageCode&&await (0,c.js)(e.dealId),s.NextResponse.json({ok:!0,...e})}catch(e){if(e instanceof E)return s.NextResponse.json({error:e.message},{status:e.status});return s.NextResponse.json({error:"Falha ao alterar etapa operacional",details:String(e)},{status:500})}}let p=new r.AppRouteRouteModule({definition:{kind:d.x.APP_ROUTE,page:"/api/deals/[id]/operation/stage/route",pathname:"/api/deals/[id]/operation/stage",filename:"route",bundlePath:"app/api/deals/[id]/operation/stage/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/deals/[id]/operation/stage/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:T,staticGenerationAsyncStorage:N,serverHooks:m}=p,A="/api/deals/[id]/operation/stage/route";function R(){return(0,o.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:N})}},7392:(e,t,a)=>{a.d(t,{I:()=>r});var i=a(1309);function r(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>c,_g:()=>l,dT:()=>_,gL:()=>u,hj:()=>E,oM:()=>p});var i=a(4738);let r={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},d=new Set(["fechado_ganho","assinatura_ativa_ganho"]),o=new Set(["perdido","perdido_abandonado"]),s=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],n=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return d.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:o.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function _(e){return"HOSPEDAGEM"===e?s:n}async function c(e){let t=r[e],a=await i._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function E(e,t,a){let i=_(t.dealType),r=async()=>{let a=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}}),i=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"COMPLETED"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}});if(a&&i&&Number(i.stageOrder||0)>Number(a.stageOrder||0)&&i.stageCode)return i.stageCode;if("HOSPEDAGEM"!==t.dealType)return null;let[r,d,o,s,n]=await Promise.all([e.dealClientApproval.findFirst({where:{dealId:t.id},orderBy:{createdAt:"desc"},select:{status:!0}}),e.dealTemplateRevision.findFirst({where:{dealId:t.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{status:!0}}),e.dealActivity.findFirst({where:{dealId:t.id,activityType:{in:["CLIENT_APPROVAL_REQUESTED","CLIENT_REQUESTED_CHANGES","CLIENT_APPROVED"]}},orderBy:{createdAt:"desc"},select:{activityType:!0}}),e.dealPromptRevision.findFirst({where:{dealId:t.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{id:!0}}),e.dealPublishCheck.findFirst({where:{dealId:t.id},orderBy:{checkedAt:"desc"},select:{matches:!0,lastHttpStatus:!0}})]),l=String(r?.status||"").toUpperCase(),_=String(d?.status||"").toUpperCase(),c=String(o?.activityType||"").toUpperCase();return n?.matches||200===Number(n?.lastHttpStatus||0)?"publicado":"APPROVED"===l||"APPROVED_CLIENT"===_||"CLIENT_APPROVED"===c?"publicacao":"CHANGES_REQUESTED"===l||"NEEDS_ADJUSTMENTS"===_||"CLIENT_REQUESTED_CHANGES"===c?"ajustes":"PENDING"===l||["SENT_CLIENT","IN_REVIEW"].includes(_)||"CLIENT_APPROVAL_REQUESTED"===c?"aprovacao_cliente":_?"template_v1":s?.id?"pre_prompt":null},d=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}}),o=a;if(!o){let e=await r();if(!e&&d||e&&d&&(i.find(t=>t.code===e)?.order||0)<=Number(d.stageOrder||0))return d;e&&(o=e)}let s=o?i.find(e=>e.code===o):i[0];if(!s)throw Error("Etapa operacional inv\xe1lida");return d?.stageCode===s.code?d:(d&&await e.dealOperation.update({where:{id:d.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:s.code,stageName:s.name,stageOrder:s.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function u(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let i=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!i||i.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let r=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:i.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),o=Math.max(0,Math.min(t.positionIndex??d.length,d.length)),s=d.map(e=>e.id);s.splice(o,0,a.id);let n=l(i.code),_=await e.deal.update({where:{id:a.id},data:{stageId:i.id,lifecycleStatus:n.lifecycleStatus,isClosed:n.isClosed,closedAt:n.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:i.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<r.length;t+=1)await e.deal.update({where:{id:r[t].id},data:{positionIndex:t}});for(let t=0;t<s.length;t+=1)await e.deal.update({where:{id:s[t]},data:{positionIndex:t}});return"CLIENT"===n.lifecycleStatus&&await E(e,{id:a.id,dealType:a.dealType}),_}function p(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>r});var i=a(3524);let r=global.__prisma__??new i.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>T,CQ:()=>E,Df:()=>c,LO:()=>m,UH:()=>u,Ug:()=>p,js:()=>N,wP:()=>A});var i=a(5315),r=a.n(i),d=a(4738);let o=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projeto-area-cliente/storage/site-models",s=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],n=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function _(e){let t=r().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=r().resolve(t),i=r().resolve(e);return i===a||i.startsWith(`${a}${r().sep}`)}(t,o))throw Error(`Caminho do modelo deve estar dentro de ${o}`);return t}function c(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function E(){if(!n){for(let e of(await d._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_operation_substep (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      project_id UUID REFERENCES client.projects(id) ON DELETE CASCADE,
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
      UNIQUE (deal_id, project_id, stage_code, substep_code)
    )
  `),await d._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_operation_substep
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE CASCADE
  `),await d._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_operation_substep
    DROP CONSTRAINT IF EXISTS deal_operation_substep_deal_id_stage_code_substep_code_key
  `),await d._.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_operation_substep_project_stage_code
      ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_code)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_order)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `),await d._.$executeRawUnsafe(`
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
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `),await d._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_request (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL,
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
  `),await d._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_prompt_request
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, project_id, created_at DESC)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await d._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_site_release (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES crm.deal(id) ON DELETE CASCADE,
      project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL,
      version INT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      project_root VARCHAR(500) NOT NULL,
      assets_path VARCHAR(500) NOT NULL,
      prompt_md_path VARCHAR(500),
      prompt_json_path VARCHAR(500),
      created_by VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (deal_id, project_id, version)
    )
  `),await d._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_site_release
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL
  `),await d._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_site_release
    DROP CONSTRAINT IF EXISTS deal_site_release_deal_id_version_key
  `),await d._.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_site_release_project_version
      ON crm.deal_site_release(deal_id, project_id, version)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, project_id, version DESC)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
      ON crm.deal_site_release(deal_id, status)
  `),await d._.$executeRawUnsafe(`
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
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
      ON crm.deal_site_variant(release_id, status)
  `),await d._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
      ON crm.deal_prompt_asset(release_id, asset_type)
  `),await d._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),l)){let t=_(r().resolve(o,e.folder));await d._.$queryRaw`
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
    `}await d._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),n=!0}}async function u(){return await E(),(await d._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function p(e){await E();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let i=_(e.rootPath),r=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",o=!!e.isDefault,s=void 0===e.isActive||!!e.isActive;o&&await d._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let n=await d._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${i}, ${r}, ${o}, ${s}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return n[0]?.id||null}async function T(e){await E();let t=String(e||"").trim().toLowerCase(),a=t?await d._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${t}
          AND is_active = true
        LIMIT 1
      `:await d._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function N(e,t){await E();let a=String(t||"").trim();for(let t of s)await d._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, project_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid,
        CASE WHEN ${a} <> '' THEN ${a}::uuid ELSE NULL END,
        'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, project_id, stage_code, substep_code) DO NOTHING
    `}async function m(e,t){await E();let a=String(t||"").trim();return d._.$queryRaw`
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
      AND (
        ${a} = ''
        OR project_id = ${a}::uuid
      )
      AND stage_code = 'publicacao'
    ORDER BY substep_order ASC, created_at ASC
  `}async function A(e,t){await E();let a=String(t||"").trim(),i=(await d._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND (
        ${a} = ''
        OR project_id = ${a}::uuid
      )
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},r=Number(i.required_total||0),o=Number(i.required_completed||0),s=Number(i.pending_total||0);return{requiredTotal:r,requiredCompleted:o,pendingTotal:s,ready:r>0&&0===s}}}};var t=require("../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),i=t.X(0,[9379,4833],()=>a(7408));module.exports=i})();