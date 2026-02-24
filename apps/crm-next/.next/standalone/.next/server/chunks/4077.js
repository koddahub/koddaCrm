"use strict";exports.id=4077,exports.ids=[4077],exports.modules={7392:(e,t,a)=>{a.d(t,{I:()=>i});var r=a(1309);function i(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?r.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>c,_g:()=>l,dT:()=>_,gL:()=>u,hj:()=>E,oM:()=>p});var r=a(4738);let i={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},d=new Set(["fechado_ganho","assinatura_ativa_ganho"]),o=new Set(["perdido","perdido_abandonado"]),s=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],n=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return d.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:o.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function _(e){return"HOSPEDAGEM"===e?s:n}async function c(e){let t=i[e],a=await r._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function E(e,t,a){let r=_(t.dealType),i=async()=>{let a=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}}),r=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"COMPLETED"},orderBy:{stageOrder:"desc"},select:{stageCode:!0,stageOrder:!0}});if(a&&r&&Number(r.stageOrder||0)>Number(a.stageOrder||0)&&r.stageCode)return r.stageCode;if("HOSPEDAGEM"!==t.dealType)return null;let[i,d,o,s,n]=await Promise.all([e.dealClientApproval.findFirst({where:{dealId:t.id},orderBy:{createdAt:"desc"},select:{status:!0}}),e.dealTemplateRevision.findFirst({where:{dealId:t.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{status:!0}}),e.dealActivity.findFirst({where:{dealId:t.id,activityType:{in:["CLIENT_APPROVAL_REQUESTED","CLIENT_REQUESTED_CHANGES","CLIENT_APPROVED"]}},orderBy:{createdAt:"desc"},select:{activityType:!0}}),e.dealPromptRevision.findFirst({where:{dealId:t.id},orderBy:[{version:"desc"},{createdAt:"desc"}],select:{id:!0}}),e.dealPublishCheck.findFirst({where:{dealId:t.id},orderBy:{checkedAt:"desc"},select:{matches:!0,lastHttpStatus:!0}})]),l=String(i?.status||"").toUpperCase(),_=String(d?.status||"").toUpperCase(),c=String(o?.activityType||"").toUpperCase();return n?.matches||200===Number(n?.lastHttpStatus||0)?"publicado":"APPROVED"===l||"APPROVED_CLIENT"===_||"CLIENT_APPROVED"===c?"publicacao":"CHANGES_REQUESTED"===l||"NEEDS_ADJUSTMENTS"===_||"CLIENT_REQUESTED_CHANGES"===c?"ajustes":"PENDING"===l||["SENT_CLIENT","IN_REVIEW"].includes(_)||"CLIENT_APPROVAL_REQUESTED"===c?"aprovacao_cliente":_?"template_v1":s?.id?"pre_prompt":null},d=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}}),o=a;if(!o){let e=await i();if(!e&&d||e&&d&&(r.find(t=>t.code===e)?.order||0)<=Number(d.stageOrder||0))return d;e&&(o=e)}let s=o?r.find(e=>e.code===o):r[0];if(!s)throw Error("Etapa operacional inv\xe1lida");return d?.stageCode===s.code?d:(d&&await e.dealOperation.update({where:{id:d.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:s.code,stageName:s.name,stageOrder:s.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function u(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let r=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!r||r.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let i=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:r.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),o=Math.max(0,Math.min(t.positionIndex??d.length,d.length)),s=d.map(e=>e.id);s.splice(o,0,a.id);let n=l(r.code),_=await e.deal.update({where:{id:a.id},data:{stageId:r.id,lifecycleStatus:n.lifecycleStatus,isClosed:n.isClosed,closedAt:n.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:r.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<i.length;t+=1)await e.deal.update({where:{id:i[t].id},data:{positionIndex:t}});for(let t=0;t<s.length;t+=1)await e.deal.update({where:{id:s[t]},data:{positionIndex:t}});return"CLIENT"===n.lifecycleStatus&&await E(e,{id:a.id,dealType:a.dealType}),_}function p(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>i});var r=a(3524);let i=global.__prisma__??new r.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>T,CQ:()=>E,Df:()=>c,LO:()=>A,UH:()=>u,Ug:()=>p,js:()=>m,wP:()=>N});var r=a(5315),i=a.n(r),d=a(4738);let o=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",s=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],n=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function _(e){let t=i().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=i().resolve(t),r=i().resolve(e);return r===a||r.startsWith(`${a}${i().sep}`)}(t,o))throw Error(`Caminho do modelo deve estar dentro de ${o}`);return t}function c(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function E(){if(!n){for(let e of(await d._.$executeRawUnsafe(`
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
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
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
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await d._.$executeRawUnsafe(`
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
  `),await d._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, version DESC)
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
  `),l)){let t=_(i().resolve(o,e.folder));await d._.$queryRaw`
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
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function p(e){await E();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let r=_(e.rootPath),i=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",o=!!e.isDefault,s=void 0===e.isActive||!!e.isActive;o&&await d._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let n=await d._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${r}, ${i}, ${o}, ${s}, now(), now())
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
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function m(e){for(let t of(await E(),s))await d._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function A(e){return await E(),d._.$queryRaw`
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
  `}async function N(e){await E();let t=(await d._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),r=Number(t.required_completed||0),i=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:r,pendingTotal:i,ready:a>0&&0===i}}},5617:(e,t,a)=>{a.d(t,{$Z:()=>L,A6:()=>T,KA:()=>p,KY:()=>m,L7:()=>_,Mu:()=>U,QE:()=>w,Sh:()=>E,nu:()=>f,qJ:()=>c,wC:()=>u});var r=a(2048),i=a(5315),d=a.n(i),o=a(4738),s=a(2840),n=a(1043);let l=["V1","V2","V3"];function _(e){let t=String(e||"").trim().toUpperCase();return"V2"===t?"V2":"V3"===t?"V3":"V1"}function c(e){if(null==e)return null;let t=String(e).trim().toLowerCase();if(!t)return null;let a=Number.parseInt(t.startsWith("v")?t.slice(1):t,10);return!Number.isFinite(a)||a<1?null:a}function E(e){let t=String(e||"").replace(/\\/g,"/"),a=t.match(/\/releases\/v(\d+)(?:\/|$)/i),r=t.match(/\/(modelo_v[123])(?:\/|$)/i),i=a?Number.parseInt(a[1],10):null,d=i?`v${i}`:null;return{releaseVersion:i,releaseLabel:d,variantCode:r?function(e){let t=String(e||"").toLowerCase();return"modelo_v2"===t||"v2"===t?"V2":"modelo_v3"===t||"v3"===t?"V3":"V1"}(r[1]):null}}async function u(){await o._.$executeRawUnsafe(`
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
  `)}async function p(e){await u();let t=await o._.$queryRaw`
    SELECT
      id::text,
      deal_id::text,
      version,
      status,
      project_root,
      assets_path,
      prompt_md_path,
      prompt_json_path,
      created_by,
      created_at,
      updated_at
    FROM crm.deal_site_release
    WHERE deal_id = ${e}::uuid
    ORDER BY version DESC
  `;if(0===t.length)return[];let a=await o._.$queryRaw`
    SELECT
      id::text,
      release_id::text,
      UPPER(variant_code)::text AS variant_code,
      folder_path,
      entry_file,
      preview_url,
      source_hash,
      status,
      created_at,
      updated_at
    FROM crm.deal_site_variant
    WHERE release_id IN (
      SELECT id
      FROM crm.deal_site_release
      WHERE deal_id = ${e}::uuid
    )
    ORDER BY created_at ASC
  `,r=new Map;for(let e of a){let t=r.get(e.release_id)||[];t.push({...e,variant_code:_(e.variant_code)}),r.set(e.release_id,t)}return t.map(e=>({...e,variants:(r.get(e.id)||[]).sort((e,t)=>e.variant_code.localeCompare(t.variant_code))}))}async function T(e,t){let a=await p(e);return 0===a.length?null:t?a.find(e=>e.version===t)||null:a[0]}async function m(e){let t=e.variantCode||"V1",a=await T(e.dealId,e.releaseVersion||null);if(!a)return null;let r=a.variants.find(e=>e.variant_code===t)||a.variants.find(e=>"V1"===e.variant_code)||a.variants[0];return r?{release:a,variant:r}:null}async function A(e){try{return await r.promises.access(e),!0}catch{return!1}}async function N(e){try{return await r.promises.readdir(e)}catch{return[]}}async function R(e){let t=await N(e);if(0===t.length)return null;let a=new Date,i=e=>String(e).padStart(2,"0"),o=d().resolve(e,`_backup_${a.getFullYear()}${i(a.getMonth()+1)}${i(a.getDate())}_${i(a.getHours())}${i(a.getMinutes())}${i(a.getSeconds())}`);await r.promises.mkdir(o,{recursive:!0});let s=0;for(let a of t){if(a.startsWith("_backup_"))continue;let t=d().resolve(e,a),i=d().resolve(o,a);await r.promises.rename(t,i),s+=1}return s?o:(await r.promises.rm(o,{recursive:!0,force:!0}),null)}async function L(e){await u();let t=await m({dealId:e.dealId,releaseVersion:e.releaseVersion||null,variantCode:"V1"});if(!t)throw Error("Nenhuma release encontrada para este deal. Envie um novo briefing para provisionar a release.");let a=t.release,i=[],_=!1;for(let t of l){let l=a.variants.find(e=>e.variant_code===t);if(!l)continue;let c=await (0,n.Bv)("V2"===t?"template_v2_institucional_3paginas":"V3"===t?"template_v3_institucional_chatbot":"template_v1_institucional_1pagina");if(!c||!await A(c.rootPath))continue;let E=l.entry_file||c.entryFile||"index.html",u=d().resolve(l.folder_path,E.replace(/^\/+/,"")),p=await A(u),T=(await N(l.folder_path)).length>0;if("if_empty_or_missing"===e.copyMode&&p&&T){let r=(0,s.EN)(e.orgSlug,E,{releaseVersion:a.version,variantCode:t});await o._.$executeRaw`
        UPDATE crm.deal_site_variant
        SET preview_url = ${r}, entry_file = ${E}, updated_at = now()
        WHERE id = ${l.id}::uuid
      `;continue}if(await r.promises.mkdir(l.folder_path,{recursive:!0}),"replace"===e.copyMode&&T){let e=await R(l.folder_path);e&&i.push(e)}for(let e of(await r.promises.readdir(c.rootPath,{withFileTypes:!0}))){let t=d().resolve(c.rootPath,e.name),a=d().resolve(l.folder_path,e.name);await r.promises.cp(t,a,{recursive:!0,force:!0})}let m=(0,s.EN)(e.orgSlug,E,{releaseVersion:a.version,variantCode:t});await o._.$executeRaw`
      UPDATE crm.deal_site_variant
      SET preview_url = ${m}, entry_file = ${E}, updated_at = now(), status = 'BASE_PREPARED'
      WHERE id = ${l.id}::uuid
    `,_=!0}return{releaseVersion:a.version,releaseLabel:`v${a.version}`,applied:_,backups:i,variants:(await T(e.dealId,a.version))?.variants||a.variants}}async function U(e,t){await u(),await o._.$executeRaw`
    UPDATE crm.deal_site_release
    SET status = ${t}, updated_at = now()
    WHERE id = ${e}::uuid
  `}async function w(e,t){await u(),await o._.$executeRaw`
    UPDATE crm.deal_site_variant
    SET status = ${t}, updated_at = now()
    WHERE id = ${e}::uuid
  `}async function f(e){let t={templateRevisionId:e.templateRevisionId,releaseVersion:e.releaseVersion,variantCode:e.variantCode};await o._.dealActivity.create({data:{dealId:e.dealId,activityType:"APPROVAL_VARIANT_SELECTED",content:"Variante selecionada para aprova\xe7\xe3o do cliente.",metadata:t,createdBy:"ADMIN"}})}},2840:(e,t,a)=>{a.d(t,{EN:()=>T,H_:()=>s,Mb:()=>u,P1:()=>E,ag:()=>N,bg:()=>m,gK:()=>p,m$:()=>A});var r=a(4770),i=a(2048),d=a(5315),o=a.n(d);let s=process.env.CLIENT_PROJECTS_ROOT||"/home/server/projects/clientes";process.env.PREVIEW_BASE_URL;let n=process.env.CRM_PUBLIC_BASE_URL||"https://koddacrm.koddahub.com.br",l=process.env.PORTAL_BASE_URL||"http://192.168.25.3:8081",_=process.env.VSCODE_SSH_HOST||"server",c=process.env.VSCODE_WEB_BASE_URL||"";function E(e,t){let a=(e||"cliente").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"cliente",r=t.replace(/-/g,"").slice(0,8);return`${a}-${r}`}function u(e){let t=o().resolve(s,e),a=o().resolve(s);if(!(t===a||t.startsWith(`${a}${o().sep}`)))throw Error("project_path_invalid");return t}async function p(e){let t=o().resolve(s),a=o().resolve(e);if(!(a===t||a.startsWith(`${t}${o().sep}`)))throw Error("project_path_outside_root");await i.promises.mkdir(a,{recursive:!0})}function T(e,t="index.html",a){let r=n.replace(/\/+$/,""),i=t.replace(/^\/+/,""),d=a?.releaseVersion??null,o=null!=d?String(d).trim().replace(/^v/i,""):"",s=String(a?.variantCode||"").trim().toLowerCase(),l=new URLSearchParams;o&&l.set("release",`v${o}`),s&&l.set("variant",s),i&&"index.html"!==i&&l.set("entry",i);let _=l.toString();return _?`${r}/${e}/previewv1?${_}`:`${r}/${e}/previewv1`}function m(e){let t=l.replace(/\/+$/,"");return`${t}/portal/approval/${e}`}function A(e){let t=e.replace(/#/g,"%23");return{deepLink:`vscode://vscode-remote/ssh-remote+${_}${t}`,webLink:c?`${c.replace(/\/+$/,"")}/?folder=${encodeURIComponent(t)}`:null}}async function N(e,t="index.html"){var a;let d=o().resolve(e,t),s=o().resolve(e);if(!(d===s||d.startsWith(`${s}${o().sep}`)))throw Error("entry_file_invalid");return a=(await i.promises.readFile(d,"utf8")).replace(/<!--[\s\S]*?-->/g,"").replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/\bdata-timestamp="[^"]*"/gi,"").replace(/\bnonce="[^"]*"/gi,"").replace(/\s+/g," ").trim(),(0,r.createHash)("sha256").update(a).digest("hex")}}};