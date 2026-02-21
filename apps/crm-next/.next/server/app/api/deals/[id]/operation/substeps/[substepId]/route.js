"use strict";(()=>{var e={};e.id=4019,e.ids=[4019],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5315:e=>{e.exports=require("path")},7537:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>N,patchFetch:()=>A,requestAsyncStorage:()=>p,routeModule:()=>E,serverHooks:()=>T,staticGenerationAsyncStorage:()=>m});var o={};a.r(o),a.d(o,{PATCH:()=>c});var r=a(3278),i=a(5002),d=a(4877),s=a(1309),n=a(7392),u=a(4738),_=a(1043);let l=new Set(["PENDING","IN_PROGRESS","COMPLETED","SKIPPED","BLOCKED"]);async function c(e,{params:t}){let a=(0,n.I)(e);if(a)return a;let o=await e.json().catch(()=>({})),r=String(o.status||"").trim().toUpperCase(),i=void 0===o.owner?void 0:String(o.owner||"").trim(),d=void 0===o.notes?void 0:String(o.notes||"").trim();if(r&&!l.has(r))return s.NextResponse.json({error:"Status de sub-etapa inv\xe1lido."},{status:422});try{let e=await u._.$transaction(async e=>{let a=(await e.$queryRaw`
        SELECT id::text, deal_id::text, stage_code, substep_name, status
        FROM crm.deal_operation_substep
        WHERE id = ${t.substepId}::uuid
          AND deal_id = ${t.id}::uuid
        LIMIT 1
      `)[0];if(!a)throw Error("Sub-etapa n\xe3o encontrada");if("publicacao"!==a.stage_code)throw Error("Somente sub-etapas de publica\xe7\xe3o s\xe3o suportadas nesta vers\xe3o");let o=new Date,s=r||a.status,n={status:s,owner:void 0===i?void 0:i||null,notes:void 0===d?void 0:d||null,startedAt:"IN_PROGRESS"===s?o:void 0,completedAt:["COMPLETED","SKIPPED"].includes(s)?o:void 0,updatedAt:o};return await e.$executeRaw`
        UPDATE crm.deal_operation_substep
        SET
          status = ${n.status},
          owner = COALESCE(${n.owner??null}, owner),
          notes = COALESCE(${n.notes??null}, notes),
          started_at = CASE
            WHEN ${!!n.startedAt} = true AND started_at IS NULL THEN ${n.startedAt??null}
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${!!n.completedAt} = true THEN ${n.completedAt??null}
            ELSE completed_at
          END,
          updated_at = now()
        WHERE id = ${t.substepId}::uuid
      `,await e.dealActivity.create({data:{dealId:t.id,activityType:"PUBLICATION_SUBSTEP_UPDATED",content:`Sub-etapa "${a.substep_name}" atualizada para ${s}.`,metadata:{substepId:t.substepId,stageCode:"publicacao",status:s,owner:i||null},createdBy:"ADMIN"}}),{ok:!0,substepId:t.substepId,status:s}}),a=await (0,_.wP)(t.id);return a.ready&&await u._.dealActivity.create({data:{dealId:t.id,activityType:"PUBLICATION_READY",content:"Todas as sub-etapas obrigat\xf3rias de publica\xe7\xe3o foram conclu\xeddas. Monitor estrito est\xe1 ativo.",metadata:a,createdBy:"SYSTEM"}}),s.NextResponse.json({...e,summary:a})}catch(e){return s.NextResponse.json({error:"Falha ao atualizar sub-etapa",details:String(e)},{status:500})}}let E=new r.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/deals/[id]/operation/substeps/[substepId]/route",pathname:"/api/deals/[id]/operation/substeps/[substepId]",filename:"route",bundlePath:"app/api/deals/[id]/operation/substeps/[substepId]/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/operation/substeps/[substepId]/route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:p,staticGenerationAsyncStorage:m,serverHooks:T}=E,N="/api/deals/[id]/operation/substeps/[substepId]/route";function A(){return(0,d.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:m})}},7392:(e,t,a)=>{a.d(t,{I:()=>r});var o=a(1309);function r(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?o.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},4738:(e,t,a)=>{a.d(t,{_:()=>r});var o=a(3524);let r=global.__prisma__??new o.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>m,CQ:()=>c,Df:()=>l,LO:()=>N,UH:()=>E,Ug:()=>p,VW:()=>_,js:()=>T,wP:()=>A});var o=a(5315),r=a.n(o),i=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",s=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],n=!1,u=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function _(e){let t=r().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=r().resolve(t),o=r().resolve(e);return o===a||o.startsWith(`${a}${r().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function l(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function c(){if(!n){for(let e of(await i._.$executeRawUnsafe(`
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
  `),u)){let t=_(r().resolve(d,e.folder));await i._.$queryRaw`
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
  `),n=!0}}async function E(){return await c(),(await i._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function p(e){await c();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let o=_(e.rootPath),r=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,s=void 0===e.isActive||!!e.isActive;d&&await i._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let n=await i._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${o}, ${r}, ${d}, ${s}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return n[0]?.id||null}async function m(e){await c();let t=String(e||"").trim().toLowerCase(),a=t?await i._.$queryRaw`
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
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function T(e){for(let t of(await c(),s))await i._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function N(e){return await c(),i._.$queryRaw`
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
  `}async function A(e){await c();let t=(await i._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),o=Number(t.required_completed||0),r=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:o,pendingTotal:r,ready:a>0&&0===r}}}};var t=require("../../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),o=t.X(0,[7787,4833],()=>a(7537));module.exports=o})();