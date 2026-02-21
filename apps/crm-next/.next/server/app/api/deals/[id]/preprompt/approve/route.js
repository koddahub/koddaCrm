"use strict";(()=>{var e={};e.id=4180,e.ids=[4180],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},2048:e=>{e.exports=require("fs")},5315:e=>{e.exports=require("path")},48:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>S,patchFetch:()=>y,requestAsyncStorage:()=>L,routeModule:()=>R,serverHooks:()=>D,staticGenerationAsyncStorage:()=>I});var r={};a.r(r),a.d(r,{POST:()=>h,runtime:()=>g});var o=a(3278),i=a(5002),d=a(4877),n=a(2048),s=a(5315),l=a.n(s),p=a(1309),c=a(7392),u=a(9004),_=a(4738),m=a(2840),E=a(1043);async function T(e){return(await _._.$queryRaw`
    SELECT ap.prompt_text, ap.prompt_json
    FROM client.ai_prompts ap
    JOIN client.project_briefs pb ON pb.id = ap.brief_id
    WHERE pb.organization_id = ${e}::uuid
    ORDER BY ap.created_at DESC
    LIMIT 1
  `)[0]||null}async function f(e){try{return await n.promises.access(e),!0}catch{return!1}}async function w(e){try{return await n.promises.readdir(e,{withFileTypes:!0})}catch{return[]}}async function N(e){let t=await w(e),a=`_backup_${function(e=new Date){let t=e=>String(e).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}_${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}()}`,r=l().resolve(e,a),o=0;for(let i of(await n.promises.mkdir(r,{recursive:!0}),t)){if(i.name===a||i.name.startsWith("_backup_"))continue;let t=l().resolve(e,i.name),d=l().resolve(r,i.name);await n.promises.rename(t,d),o+=1}return 0===o?(await n.promises.rm(r,{recursive:!0,force:!0}),null):r}async function v(e,t){for(let a of(await n.promises.readdir(e,{withFileTypes:!0}))){let r=l().resolve(e,a.name),o=l().resolve(t,a.name);await n.promises.cp(r,o,{recursive:!0,force:!0})}}async function A(e){let{templateRootPath:t,templateEntryFile:a,projectPath:r,copyMode:o}=e;await (0,m.gK)(r);let i=(await w(r)).length>0,d=l().resolve(r,a.replace(/^\/+/,"")),n=await f(d);if("if_empty_or_missing"===o&&i&&n)return{templateApplied:!1,backupPath:null,reason:"project_already_ready"};let s=null;return"replace"===o&&i&&(s=await N(r)),await v(t,r),{templateApplied:!0,backupPath:s,reason:"replace"===o?"project_replaced":i?"project_incomplete_repaired":"project_created"}}let g="nodejs";async function h(e,{params:t}){let a=(0,c.I)(e);if(a)return a;let r=await e.json().catch(()=>({})),o="string"==typeof r.promptText?r.promptText.trim():"",i=r.promptJson??null,d="string"==typeof r.templateModelCode?r.templateModelCode.trim():"",s="replace"===r.copyMode?"replace":"if_empty_or_missing";try{let e=await (0,E.Bv)(d||null);if(!e)return p.NextResponse.json({error:"Modelo de template n\xe3o encontrado no cat\xe1logo ativo."},{status:422});let a=(0,E.VW)(e.rootPath),r=await _._.$transaction(async r=>{let d=await r.deal.findUnique({where:{id:t.id},include:{organization:{select:{id:!0,legalName:!0,billingEmail:!0}}}});if(!d)throw Error("Deal n\xe3o encontrado");if("HOSPEDAGEM"!==d.dealType)throw Error("Aprova\xe7\xe3o de pr\xe9-prompt dispon\xedvel somente para hospedagem");if("CLIENT"!==d.lifecycleStatus)throw Error("Deal ainda n\xe3o fechado para opera\xe7\xe3o");if(!d.organizationId)throw Error("Deal sem organiza\xe7\xe3o vinculada");let p=(0,m.P1)(d.organization?.legalName,d.organizationId),c=(0,m.Mb)(p);await (0,m.gK)(c);let _=await A({templateRootPath:a,templateEntryFile:e.entryFile||"index.html",projectPath:c,copyMode:s}),E=await r.dealPromptRevision.findFirst({where:{dealId:d.id},orderBy:{version:"desc"}}),f=o||E?.promptText||"",w=i??E?.promptJson??null;if(!f){let e=await T(d.organizationId);f=String(e?.prompt_text||""),w=e?.prompt_json||null}if(!f)throw Error("Prompt vazio. Salve o briefing ou edite o texto antes de aprovar.");let N=E&&"APPROVED"!==E.status?await r.dealPromptRevision.update({where:{id:E.id},data:{promptText:f,promptJson:w,status:"APPROVED",requestedNotes:null,updatedAt:new Date}}):await r.dealPromptRevision.create({data:{dealId:d.id,version:(E?.version||0)+1,promptText:f,promptJson:w,status:"APPROVED",requestedNotes:null,createdBy:"ADMIN"}}),v=l().resolve(c,`prompt_v${N.version}.md`);return await n.promises.writeFile(v,f,"utf8"),await (0,u.hj)(r,{id:d.id,dealType:d.dealType},"template_v1"),await r.dealActivity.create({data:{dealId:d.id,activityType:"PREPROMPT_APPROVED",content:`Pr\xe9-prompt aprovado (v${N.version}) e pronto para Template V1.`,metadata:{revisionId:N.id,promptFile:v,templateModelCode:e.code,templateSourceRoot:a,templateApplied:_.templateApplied,templateCopyReason:_.reason,templateBackupPath:_.backupPath,copyModeUsed:s},createdBy:"ADMIN"}}),{revisionId:N.id,version:N.version,projectPath:c,promptFile:v,templateApplied:_.templateApplied,templateModel:{code:e.code,name:e.name,rootPath:a,entryFile:e.entryFile||"index.html"},copyModeUsed:s,templateBackupPath:_.backupPath}});return p.NextResponse.json({ok:!0,...r,vscode:(0,m.m$)(r.projectPath)})}catch(e){return p.NextResponse.json({error:"Falha ao aprovar pr\xe9-prompt",details:String(e)},{status:500})}}let R=new o.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/deals/[id]/preprompt/approve/route",pathname:"/api/deals/[id]/preprompt/approve",filename:"route",bundlePath:"app/api/deals/[id]/preprompt/approve/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/deals/[id]/preprompt/approve/route.ts",nextConfigOutput:"standalone",userland:r}),{requestAsyncStorage:L,staticGenerationAsyncStorage:I,serverHooks:D}=R,S="/api/deals/[id]/preprompt/approve/route";function y(){return(0,d.patchFetch)({serverHooks:D,staticGenerationAsyncStorage:I})}},7392:(e,t,a)=>{a.d(t,{I:()=>o});var r=a(1309);function o(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?r.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},9004:(e,t,a)=>{a.d(t,{Bt:()=>c,_g:()=>l,dT:()=>p,gL:()=>_,hj:()=>u,oM:()=>m});var r=a(4738);let o={hospedagem:"comercial_hospedagem",avulsos:"comercial_avulsos"},i=new Set(["fechado_ganho","assinatura_ativa_ganho"]),d=new Set(["perdido","perdido_abandonado"]),n=[{code:"briefing_pendente",name:"Briefing pendente",order:1},{code:"pre_prompt",name:"Pr\xe9-prompt",order:2},{code:"template_v1",name:"Template V1",order:3},{code:"ajustes",name:"Ajustes",order:4},{code:"aprovacao_cliente",name:"Aprova\xe7\xe3o do cliente",order:5},{code:"publicacao",name:"Publica\xe7\xe3o",order:6},{code:"publicado",name:"Publicado",order:7}],s=[{code:"kickoff",name:"Kickoff",order:1},{code:"requisitos",name:"Requisitos",order:2},{code:"desenvolvimento",name:"Desenvolvimento",order:3},{code:"validacao",name:"Valida\xe7\xe3o",order:4},{code:"entrega",name:"Entrega",order:5},{code:"suporte_inicial",name:"Suporte inicial",order:6}];function l(e){return i.has(e)?{lifecycleStatus:"CLIENT",isClosed:!0,closedAt:new Date}:d.has(e)?{lifecycleStatus:"LOST",isClosed:!0,closedAt:new Date}:{lifecycleStatus:"OPEN",isClosed:!1,closedAt:null}}function p(e){return"HOSPEDAGEM"===e?n:s}async function c(e){let t=o[e],a=await r._.pipeline.findUnique({where:{code:t},include:{stages:{orderBy:{stageOrder:"asc"}}}});if(!a)throw Error(`Pipeline ${t} n\xe3o encontrado`);return a}async function u(e,t,a){let r=p(t.dealType),o=a?r.find(e=>e.code===a):r[0];if(!o)throw Error("Etapa operacional inv\xe1lida");let i=await e.dealOperation.findFirst({where:{dealId:t.id,operationType:t.dealType,status:"ACTIVE"},orderBy:{stageOrder:"desc"}});return i?.stageCode===o.code?i:(i&&await e.dealOperation.update({where:{id:i.id},data:{status:"COMPLETED",completedAt:new Date,updatedAt:new Date}}),e.dealOperation.create({data:{dealId:t.id,operationType:t.dealType,stageCode:o.code,stageName:o.name,stageOrder:o.order,status:"ACTIVE",startedAt:new Date,updatedAt:new Date}}))}async function _(e,t){let a=await e.deal.findUnique({where:{id:t.dealId},include:{stage:!0,pipeline:!0}});if(!a)throw Error("Deal n\xe3o encontrado");let r=await e.pipelineStage.findUnique({where:{id:t.toStageId}});if(!r||r.pipelineId!==a.pipelineId)throw Error("Est\xe1gio inv\xe1lido para este pipeline");let o=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:a.stageId,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),i=await e.deal.findMany({where:{pipelineId:a.pipelineId,stageId:r.id,id:{not:a.id},lifecycleStatus:{not:"CLIENT"}},orderBy:[{positionIndex:"asc"},{createdAt:"asc"}],select:{id:!0}}),d=Math.max(0,Math.min(t.positionIndex??i.length,i.length)),n=i.map(e=>e.id);n.splice(d,0,a.id);let s=l(r.code),p=await e.deal.update({where:{id:a.id},data:{stageId:r.id,lifecycleStatus:s.lifecycleStatus,isClosed:s.isClosed,closedAt:s.closedAt,updatedAt:new Date}});await e.dealStageHistory.create({data:{dealId:a.id,fromStageId:a.stageId,toStageId:r.id,changedBy:t.changedBy||"ADMIN",reason:t.reason||null}});for(let t=0;t<o.length;t+=1)await e.deal.update({where:{id:o[t].id},data:{positionIndex:t}});for(let t=0;t<n.length;t+=1)await e.deal.update({where:{id:n[t]},data:{positionIndex:t}});return"CLIENT"===s.lifecycleStatus&&await u(e,{id:a.id,dealType:a.dealType}),p}function m(e){return"hospedagem"===e?"hospedagem":"avulsos"===e?"avulsos":null}},4738:(e,t,a)=>{a.d(t,{_:()=>o});var r=a(3524);let o=global.__prisma__??new r.PrismaClient({log:["error"]})},1043:(e,t,a)=>{a.d(t,{Bv:()=>E,CQ:()=>u,Df:()=>c,LO:()=>f,UH:()=>_,Ug:()=>m,VW:()=>p,js:()=>T,wP:()=>w});var r=a(5315),o=a.n(r),i=a(4738);let d=process.env.SITE24H_TEMPLATE_LIBRARY_ROOT||"/home/server/projects/projero-area-cliente/storage/site-models",n=[{code:"dominio_decisao",name:"Dom\xednio j\xe1 existe / precisa contratar",order:1,required:!0},{code:"dominio_registro",name:"Registro/transfer\xeancia de dom\xednio",order:2,required:!0},{code:"dns_config",name:"Configura\xe7\xe3o de DNS e apontamentos",order:3,required:!0},{code:"hostgator_account",name:"Cadastro/ajuste na Hostgator",order:4,required:!0},{code:"deploy_ssl",name:"Deploy + SSL + valida\xe7\xe3o t\xe9cnica",order:5,required:!0},{code:"go_live_monitor",name:"Monitoramento de entrada no ar",order:6,required:!0}],s=!1,l=[{code:"template_v1_institucional_1pagina",name:"V1 - Institucional 1 p\xe1gina",folder:"template_v1_institucional_1pagina",entryFile:"index.html",isDefault:!0},{code:"template_v2_institucional_3paginas",name:"V2 - Institucional 3 p\xe1ginas",folder:"template_v2_institucional_3paginas",entryFile:"index.html",isDefault:!1},{code:"template_v3_institucional_chatbot",name:"V3 - Institucional com chatbot",folder:"template_v3_institucional_chatbot",entryFile:"index.html",isDefault:!1}];function p(e){let t=o().resolve(String(e||"").trim());if(!t)throw Error("Caminho do modelo \xe9 obrigat\xf3rio");if(!function(e,t){let a=o().resolve(t),r=o().resolve(e);return r===a||r.startsWith(`${a}${o().sep}`)}(t,d))throw Error(`Caminho do modelo deve estar dentro de ${d}`);return t}function c(){return"Host server\n    HostName ssh.koddahub.com.br\n    User server\n    ProxyCommand cloudflared access ssh --hostname %h\n    IdentityFile ~/.ssh/id_rsa\n    ServerAliveInterval 30\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n    ConnectTimeout 180"}async function u(){if(!s){for(let e of(await i._.$executeRawUnsafe(`
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
  `),l)){let t=p(o().resolve(d,e.folder));await i._.$queryRaw`
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
  `),s=!0}}async function _(){return await u(),(await i._.$queryRaw`
    SELECT id::text, code, name, root_path, entry_file, is_default, is_active, created_at, updated_at
    FROM crm.template_model_catalog
    WHERE is_active = true
    ORDER BY is_default DESC, name ASC
  `).map(e=>({id:e.id,code:e.code,name:e.name,rootPath:e.root_path,entryFile:e.entry_file,isDefault:e.is_default,isActive:e.is_active,createdAt:e.created_at,updatedAt:e.updated_at}))}async function m(e){await u();let t=e.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_");if(!t)throw Error("C\xf3digo do modelo inv\xe1lido");let a=e.name.trim();if(!a)throw Error("Nome do modelo \xe9 obrigat\xf3rio");let r=p(e.rootPath),o=(e.entryFile||"index.html").replace(/^\/+/,"").trim()||"index.html",d=!!e.isDefault,n=void 0===e.isActive||!!e.isActive;d&&await i._.$executeRaw`UPDATE crm.template_model_catalog SET is_default=false, updated_at=now()`;let s=await i._.$queryRaw`
    INSERT INTO crm.template_model_catalog (code, name, root_path, entry_file, is_default, is_active, created_at, updated_at)
    VALUES (${t}, ${a}, ${r}, ${o}, ${d}, ${n}, now(), now())
    ON CONFLICT (code)
    DO UPDATE SET
      name = EXCLUDED.name,
      root_path = EXCLUDED.root_path,
      entry_file = EXCLUDED.entry_file,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id::text
  `;return s[0]?.id||null}async function E(e){await u();let t=String(e||"").trim().toLowerCase(),a=t?await i._.$queryRaw`
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
      `;return a[0]?{id:a[0].id,code:a[0].code,name:a[0].name,rootPath:a[0].root_path,entryFile:a[0].entry_file,isDefault:a[0].is_default}:null}async function T(e){for(let t of(await u(),n))await i._.$executeRaw`
      INSERT INTO crm.deal_operation_substep (
        deal_id, stage_code, substep_code, substep_name, substep_order, status, is_required, created_at, updated_at
      )
      VALUES (
        ${e}::uuid, 'publicacao', ${t.code}, ${t.name}, ${t.order}, 'PENDING', ${t.required}, now(), now()
      )
      ON CONFLICT (deal_id, stage_code, substep_code) DO NOTHING
    `}async function f(e){return await u(),i._.$queryRaw`
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
  `}async function w(e){await u();let t=(await i._.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_required = true) AS required_total,
      COUNT(*) FILTER (WHERE is_required = true AND status IN ('COMPLETED', 'SKIPPED')) AS required_completed,
      COUNT(*) FILTER (WHERE is_required = true AND status NOT IN ('COMPLETED', 'SKIPPED')) AS pending_total
    FROM crm.deal_operation_substep
    WHERE deal_id = ${e}::uuid
      AND stage_code = 'publicacao'
  `)[0]||{required_total:0,required_completed:0,pending_total:0},a=Number(t.required_total||0),r=Number(t.required_completed||0),o=Number(t.pending_total||0);return{requiredTotal:a,requiredCompleted:r,pendingTotal:o,ready:a>0&&0===o}}},2840:(e,t,a)=>{a.d(t,{EN:()=>E,H_:()=>n,Mb:()=>_,P1:()=>u,ag:()=>w,bg:()=>T,gK:()=>m,m$:()=>f});var r=a(4770),o=a(2048),i=a(5315),d=a.n(i);let n=process.env.CLIENT_PROJECTS_ROOT||"/home/server/projects/clientes";process.env.PREVIEW_BASE_URL;let s=process.env.CRM_PUBLIC_BASE_URL||"https://kodda-crm.koddahub.com.br",l=process.env.PORTAL_BASE_URL||"http://192.168.25.3:8081",p=process.env.VSCODE_SSH_HOST||"server",c=process.env.VSCODE_WEB_BASE_URL||"";function u(e,t){let a=(e||"cliente").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"cliente",r=t.replace(/-/g,"").slice(0,8);return`${a}-${r}`}function _(e){let t=d().resolve(n,e),a=d().resolve(n);if(!(t===a||t.startsWith(`${a}${d().sep}`)))throw Error("project_path_invalid");return t}async function m(e){let t=d().resolve(n),a=d().resolve(e);if(!(a===t||a.startsWith(`${t}${d().sep}`)))throw Error("project_path_outside_root");await o.promises.mkdir(a,{recursive:!0})}function E(e,t="index.html"){let a=s.replace(/\/+$/,""),r=t.replace(/^\/+/,"");return r&&"index.html"!==r?`${a}/${e}/previewv1?entry=${encodeURIComponent(r)}`:`${a}/${e}/previewv1`}function T(e){let t=l.replace(/\/+$/,"");return`${t}/portal/approval/${e}`}function f(e){let t=e.replace(/#/g,"%23");return{deepLink:`vscode://vscode-remote/ssh-remote+${p}${t}`,webLink:c?`${c.replace(/\/+$/,"")}/?folder=${encodeURIComponent(t)}`:null}}async function w(e,t="index.html"){var a;let i=d().resolve(e,t),n=d().resolve(e);if(!(i===n||i.startsWith(`${n}${d().sep}`)))throw Error("entry_file_invalid");return a=(await o.promises.readFile(i,"utf8")).replace(/<!--[\s\S]*?-->/g,"").replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/\bdata-timestamp="[^"]*"/gi,"").replace(/\bnonce="[^"]*"/gi,"").replace(/\s+/g," ").trim(),(0,r.createHash)("sha256").update(a).digest("hex")}}};var t=require("../../../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),r=t.X(0,[7787,4833],()=>a(48));module.exports=r})();