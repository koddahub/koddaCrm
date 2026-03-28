"use strict";(()=>{var e={};e.id=8968,e.ids=[8968],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},4035:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>N,patchFetch:()=>m,requestAsyncStorage:()=>c,routeModule:()=>u,serverHooks:()=>p,staticGenerationAsyncStorage:()=>T});var i={};a.r(i),a.d(i,{POST:()=>E});var r=a(3278),o=a(5002),d=a(4877),s=a(1309),_=a(7392),n=a(1043),l=a(4738);async function E(e,{params:t}){let a=(0,_.I)(e);if(a)return a;await (0,n.CQ)();let i=await e.json().catch(()=>({})),r=String(i.projectId||i.project_id||"").trim(),o=String(i.domain||"").trim(),d=String(i.subject||"[KoddaHub] Aprova\xe7\xe3o de dom\xednio/publica\xe7\xe3o").trim(),E=String(i.message||"").trim(),u=String(i.dueAt||"").trim(),c=u?new Date(u):null,T=(Array.isArray(i.requestItems)?i.requestItems:String(i.requestItems||"").split("\n").map(e=>e.trim()).filter(Boolean)).map(e=>String(e||"").trim()).filter(Boolean).slice(0,20);if(!E&&0===T.length&&!o)return s.NextResponse.json({error:"Informe dom\xednio, mensagem ou itens da solicita\xe7\xe3o."},{status:422});if(!r)return s.NextResponse.json({error:"projectId \xe9 obrigat\xf3rio."},{status:422});let p=[...o?[`Dom\xednio para publica\xe7\xe3o: ${o}`]:[],...T].slice(0,20);try{let e=await l._.$transaction(async e=>{let a=await e.deal.findUnique({where:{id:t.id},include:{organization:{select:{id:!0,legalName:!0,billingEmail:!0}}}});if(!a)throw Error("Deal n\xe3o encontrado");if("HOSPEDAGEM"!==a.dealType)throw Error("Fluxo de publica\xe7\xe3o dispon\xedvel somente para hospedagem");if("CLIENT"!==a.lifecycleStatus)throw Error("Fluxo de publica\xe7\xe3o dispon\xedvel apenas para cliente fechado");let i=await e.$queryRaw`
        SELECT id::text
        FROM client.projects
        WHERE id = ${r}::uuid
          AND organization_id = ${a.organizationId}::uuid
        LIMIT 1
      `;if(!i[0]?.id)throw Error("Projeto inv\xe1lido para este cliente.");let s=a.contactEmail||a.organization?.billingEmail,_=null;s&&(_=(await e.emailQueue.create({data:{organizationId:a.organizationId||null,emailTo:s,subject:d||"[KoddaHub] Aprova\xe7\xe3o de dom\xednio/publica\xe7\xe3o",body:["Ol\xe1!","","Para avan\xe7armos na etapa de Publica\xe7\xe3o do seu site, precisamos da sua valida\xe7\xe3o:","",...p.length>0?p.map((e,t)=>`${t+1}. ${e}`):[],...E?["",E]:[],"","Responda este e-mail com os dados solicitados.","Equipe KoddaHub."].join("\n"),status:"PENDING"}})).id);let n=await e.$queryRaw`
        INSERT INTO crm.deal_prompt_request(
          deal_id,
          project_id,
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
          ${r}::uuid,
          NULL,
          ${d||"[KoddaHub] Aprova\xe7\xe3o de dom\xednio/publica\xe7\xe3o"},
          ${JSON.stringify(p)}::jsonb,
          ${E||"Solicita\xe7\xe3o de valida\xe7\xe3o para etapa de publica\xe7\xe3o."},
          ${c&&!Number.isNaN(c.getTime())?c:null},
          ${_}::uuid,
          'SENT',
          'ADMIN',
          now(),
          now()
        )
        RETURNING id::text
      `;return await e.dealActivity.create({data:{dealId:a.id,activityType:"PUBLICATION_REQUEST_INFO",content:"Solicita\xe7\xe3o de aprova\xe7\xe3o/informa\xe7\xf5es de publica\xe7\xe3o enviada ao cliente.",metadata:{subject:d,domain:o,project_id:r,dueAt:c&&!Number.isNaN(c.getTime())?c.toISOString():null,requestItems:p,emailQueueId:_},createdBy:"ADMIN"}}),{requestId:n[0]?.id||null,emailQueueId:_}});return s.NextResponse.json({ok:!0,...e})}catch(e){return s.NextResponse.json({error:"Falha ao enviar solicita\xe7\xe3o de publica\xe7\xe3o",details:String(e)},{status:500})}}let u=new r.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/deals/[id]/publication/request-info/route",pathname:"/api/deals/[id]/publication/request-info",filename:"route",bundlePath:"app/api/deals/[id]/publication/request-info/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/deals/[id]/publication/request-info/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:c,staticGenerationAsyncStorage:T,serverHooks:p}=u,N="/api/deals/[id]/publication/request-info/route";function m(){return(0,d.patchFetch)({serverHooks:p,staticGenerationAsyncStorage:T})}},7392:(e,t,a)=>{a.d(t,{I:()=>r});var i=a(1309);function r(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},4738:(e,t,a)=>{a.d(t,{_:()=>r});var i=a(3524);let r=global.__prisma__??new i.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>p,CQ:()=>u,Df:()=>E,LO:()=>m,UH:()=>c,Ug:()=>T,js:()=>N,wP:()=>A});var i=a(5315),r=a.n(i),o=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projeto-area-cliente/storage/site-models",s=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],_=!1,n=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function l(e){let t=r().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=r().resolve(t),i=r().resolve(e);return i===a||i.startsWith(`${a}${r().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function E(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function u(){if(!_){for(let e of(await o._.$executeRawUnsafe(`
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
  `),await o._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_operation_substep
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE CASCADE
  `),await o._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_operation_substep
    DROP CONSTRAINT IF EXISTS deal_operation_substep_deal_id_stage_code_substep_code_key
  `),await o._.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_operation_substep_project_stage_code
      ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_code)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, project_id, stage_code, substep_order)
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
  `),await o._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_prompt_request
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, project_id, created_at DESC)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await o._.$executeRawUnsafe(`
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
  `),await o._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_site_release
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES client.projects(id) ON DELETE SET NULL
  `),await o._.$executeRawUnsafe(`
    ALTER TABLE crm.deal_site_release
    DROP CONSTRAINT IF EXISTS deal_site_release_deal_id_version_key
  `),await o._.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_deal_site_release_project_version
      ON crm.deal_site_release(deal_id, project_id, version)
  `),await o._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, project_id, version DESC)
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
  `),n)){let t=l(r().resolve(d,e.folder));await o._.$queryRaw`
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
  `),_=!0}}async function c(){return await u(),(await o._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function T(e){await u();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let i=l(e.rootPath),r=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,s=void 0===e.isActive||!!e.isActive;d&&await o._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let _=await o._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${i}, ${r}, ${d}, ${s}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return _[0]?.id||null}async function p(e){await u();let t=String(e||"").trim().toLowerCase(),a=t?await o._.$queryRaw`
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
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function N(e,t){await u();let a=String(t||"").trim();for(let t of s)await o._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, project_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid,
        CASE WHEN ${a} <> '' THEN ${a}::uuid ELSE NULL END,
        'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, project_id, stage_code, substep_code) DO NOTHING
    `}async function m(e,t){await u();let a=String(t||"").trim();return o._.$queryRaw`
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
  `}async function A(e,t){await u();let a=String(t||"").trim(),i=(await o._.$queryRaw`
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
  `)[0]||{required_total:0,required_completed:0,pending_total:0},r=Number(i.required_total||0),d=Number(i.required_completed||0),s=Number(i.pending_total||0);return{requiredTotal:r,requiredCompleted:d,pendingTotal:s,ready:r>0&&0===s}}}};var t=require("../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),i=t.X(0,[9379,4833],()=>a(4035));module.exports=i})();