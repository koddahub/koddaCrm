"use strict";(()=>{var e={};e.id=4019,e.ids=[4019],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},7537:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>m,patchFetch:()=>A,requestAsyncStorage:()=>T,routeModule:()=>c,serverHooks:()=>N,staticGenerationAsyncStorage:()=>p});var r={};a.r(r),a.d(r,{PATCH:()=>l});var o=a(3278),s=a(5002),i=a(4877),d=a(1309),_=a(7392),n=a(4738),u=a(1043);let E=new Set(["PENDING","IN_PROGRESS","COMPLETED","SKIPPED","BLOCKED"]);async function l(e,{params:t}){let a=(0,_.I)(e);if(a)return a;let r=await e.json().catch(()=>({})),o=String(r.status||"").trim().toUpperCase(),s=void 0!==r.owner,i=void 0!==r.notes,l=s?String(r.owner||"").trim():void 0,c=i?String(r.notes||"").trim():void 0;if(o&&!E.has(o))return d.NextResponse.json({error:"Status de sub-etapa inv\xe1lido."},{status:422});try{let e=await n._.$transaction(async e=>{let a=(await e.$queryRaw`
        SELECT id::text, deal_id::text, stage_code, substep_name, status
        FROM crm.deal_operation_substep
        WHERE id = ${t.substepId}::uuid
          AND deal_id = ${t.id}::uuid
        LIMIT 1
      `)[0];if(!a)throw Error("Sub-etapa n\xe3o encontrada");if("publicacao"!==a.stage_code)throw Error("Somente sub-etapas de publica\xe7\xe3o s\xe3o suportadas nesta vers\xe3o");let r=o||a.status,d="IN_PROGRESS"===r,_=["COMPLETED","SKIPPED"].includes(r),n="PENDING"===r,u=["PENDING","IN_PROGRESS","BLOCKED"].includes(r),E={status:r,owner:s&&l||null,notes:i&&c||null,shouldStart:d,shouldComplete:_,shouldResetStarted:n,shouldResetCompleted:u};return await e.$executeRaw`
        UPDATE crm.deal_operation_substep
        SET
          status = ${E.status},
          owner = CASE
            WHEN ${s} = true THEN ${E.owner}
            ELSE owner
          END,
          notes = CASE
            WHEN ${i} = true THEN ${E.notes}
            ELSE notes
          END,
          started_at = CASE
            WHEN ${E.shouldStart} = true AND started_at IS NULL THEN now()
            WHEN ${E.shouldResetStarted} = true THEN NULL
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${E.shouldComplete} = true THEN now()
            WHEN ${E.shouldResetCompleted} = true THEN NULL
            ELSE completed_at
          END,
          updated_at = now()
        WHERE id = ${t.substepId}::uuid
      `,await e.dealActivity.create({data:{dealId:t.id,activityType:"PUBLICATION_SUBSTEP_UPDATED",content:`Sub-etapa "${a.substep_name}" atualizada para ${r}.`,metadata:{substepId:t.substepId,stageCode:"publicacao",status:r,owner:l||null,notes:c??null},createdBy:"ADMIN"}}),{ok:!0,substepId:t.substepId,status:r}}),a=await (0,u.wP)(t.id);return a.ready&&await n._.dealActivity.create({data:{dealId:t.id,activityType:"PUBLICATION_READY",content:"Todas as sub-etapas obrigat\xf3rias de publica\xe7\xe3o foram conclu\xeddas. Monitor estrito est\xe1 ativo.",metadata:a,createdBy:"SYSTEM"}}),d.NextResponse.json({...e,summary:a})}catch(e){return d.NextResponse.json({error:"Falha ao atualizar sub-etapa",details:String(e)},{status:500})}}let c=new o.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/deals/[id]/operation/substeps/[substepId]/route",pathname:"/api/deals/[id]/operation/substeps/[substepId]",filename:"route",bundlePath:"app/api/deals/[id]/operation/substeps/[substepId]/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/operation/substeps/[substepId]/route.ts",nextConfigOutput:"standalone",userland:r}),{requestAsyncStorage:T,staticGenerationAsyncStorage:p,serverHooks:N}=c,m="/api/deals/[id]/operation/substeps/[substepId]/route";function A(){return(0,i.patchFetch)({serverHooks:N,staticGenerationAsyncStorage:p})}},7392:(e,t,a)=>{a.d(t,{I:()=>o});var r=a(1309);function o(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?r.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},4738:(e,t,a)=>{a.d(t,{_:()=>o});var r=a(3524);let o=global.__prisma__??new r.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>p,CQ:()=>l,Df:()=>E,LO:()=>m,UH:()=>c,Ug:()=>T,js:()=>N,wP:()=>A});var r=a(5315),o=a.n(r),s=a(4738);let i=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",d=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],_=!1,n=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function u(e){let t=o().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=o().resolve(t),r=o().resolve(e);return r===a||r.startsWith(`${a}${o().sep}`)}(t,i))throw Error(`Caminho do modelo deve estar dentro de ${i}`);return t}function E(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function l(){if(!_){for(let e of(await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_order
      ON crm.deal_operation_substep(deal_id, stage_code, substep_order)
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_operation_substep_status
      ON crm.deal_operation_substep(deal_id, stage_code, status)
  `),await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_template_model_catalog_active
      ON crm.template_model_catalog(is_active, is_default)
  `),await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_deal
      ON crm.deal_prompt_request(deal_id, created_at DESC)
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_request_status
      ON crm.deal_prompt_request(status, due_at)
  `),await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_version
      ON crm.deal_site_release(deal_id, version DESC)
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_release_deal_status
      ON crm.deal_site_release(deal_id, status)
  `),await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_site_variant_release_status
      ON crm.deal_site_variant(release_id, status)
  `),await s._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_prompt_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      release_id UUID NOT NULL REFERENCES crm.deal_site_release(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      original_path VARCHAR(500) NOT NULL,
      release_path VARCHAR(500) NOT NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_deal_prompt_asset_release_type
      ON crm.deal_prompt_asset(release_id, asset_type)
  `),await s._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_default = false, updated_at = now()
    WHERE is_default = true
  `),n)){let t=u(o().resolve(i,e.folder));await s._.$queryRaw`
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
    `}await s._.$executeRawUnsafe(`
    UPDATE crm.template_model_catalog
    SET is_active = false, is_default = false, updated_at = now()
    WHERE code = 'institucional_padrao'
  `),_=!0}}async function c(){return await l(),(await s._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function T(e){await l();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let r=u(e.rootPath),o=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",i=!!e.isDefault,d=void 0===e.isActive||!!e.isActive;i&&await s._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let _=await s._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${r}, ${o}, ${i}, ${d}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return _[0]?.id||null}async function p(e){await l();let t=String(e||"").trim().toLowerCase(),a=t?await s._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE code = ${t}
          AND is_active = true
        LIMIT 1
      `:await s._.$queryRaw`
        SELECT id::text, code, name, root_path, entry_file, is_default
        FROM crm.template_model_catalog
        WHERE is_active = true
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function N(e){for(let t of(await l(),d))await s._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function m(e){return await l(),s._.$queryRaw`
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
  `}async function A(e){await l();let t=(await s._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),r=Number(t.required_completed||0),o=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:r,pendingTotal:o,ready:a>0&&0===o}}}};var t=require("../../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),r=t.X(0,[7787,4833],()=>a(7537));module.exports=r})();