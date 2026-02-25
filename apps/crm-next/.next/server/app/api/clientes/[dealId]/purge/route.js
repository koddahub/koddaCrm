"use strict";(()=>{var a={};a.id=1209,a.ids=[1209],a.modules={3524:a=>{a.exports=require("@prisma/client")},399:a=>{a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:a=>{a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},8621:(a,e,t)=>{t.r(e),t.d(e,{originalPathname:()=>L,patchFetch:()=>N,requestAsyncStorage:()=>p,routeModule:()=>_,serverHooks:()=>T,staticGenerationAsyncStorage:()=>R});var i={};t.r(i),t.d(i,{DELETE:()=>l});var n=t(3278),r=t(5002),s=t(4877),o=t(1309),d=t(7392),E=t(85),c=t(4384),u=t(4738);async function l(a,{params:e}){let t=(0,d.I)(a);if(t)return t;await (0,E.e)(),await (0,c.C)();try{return await u._.$transaction(async a=>{let t=(await a.$queryRawUnsafe(`
          SELECT
            d.id::text AS deal_id,
            d.organization_id::text AS organization_id,
            d.deal_type,
            d.lifecycle_status,
            c.ghosted_at
          FROM crm.deal d
          JOIN crm.client_billing_classification c ON c.deal_id = d.id
          WHERE d.id = $1::uuid
          LIMIT 1
        `,e.dealId))[0];if(!t)throw Error("E_NOT_FOUND:Cliente n\xe3o encontrado para purge.");if(!t.ghosted_at)throw Error("E_NOT_GHOST:Exclus\xe3o permanente permitida apenas para clientes da lista fantasma.");if(!t.organization_id)throw Error("E_NO_ORG:Cliente sem organiza\xe7\xe3o vinculada para purge.");if("HOSPEDAGEM"!==t.deal_type)throw Error("E_INVALID_TYPE:Purge dispon\xedvel apenas para hospedagem nesta vers\xe3o.");if("CLIENT"!==t.lifecycle_status)throw Error("E_INVALID_LIFECYCLE:Purge dispon\xedvel apenas para clientes fechados.");await (0,c.I)(a,t.organization_id)}),o.NextResponse.json({ok:!0,purge:"full"})}catch(i){let a=i instanceof Error?i.message:String(i),[e,t]=a.includes(":")?a.split(/:(.+)/,2):["",a];return o.NextResponse.json({error:"Falha ao excluir permanentemente",details:t},{status:"E_NOT_FOUND"===e?404:"E_NOT_GHOST"===e||"E_NO_ORG"===e||"E_INVALID_TYPE"===e||"E_INVALID_LIFECYCLE"===e?422:500})}}let _=new n.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/clientes/[dealId]/purge/route",pathname:"/api/clientes/[dealId]/purge",filename:"route",bundlePath:"app/api/clientes/[dealId]/purge/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/clientes/[dealId]/purge/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:p,staticGenerationAsyncStorage:R,serverHooks:T}=_,L="/api/clientes/[dealId]/purge/route";function N(){return(0,s.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:R})}},7392:(a,e,t)=>{t.d(e,{I:()=>n});var i=t(1309);function n(a){return a.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(a,e,t)=>{t.d(e,{e:()=>o,u:()=>n});var i=t(4738);let n={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function r(a){return a.toISOString().slice(0,10)}function s(a,e){return new Date(a.getTime()+864e5*e)}async function o(){for(let a of(await i._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.client_billing_classification (
      deal_id uuid PRIMARY KEY REFERENCES crm.deal(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL,
      class_status varchar(20) NOT NULL CHECK (class_status IN ('ATIVO','ATRASADO','INATIVO')),
      days_late int NOT NULL DEFAULT 0,
      reference_due_date date NULL,
      last_payment_status varchar(40) NULL,
      last_payment_id uuid NULL,
      ticket_id uuid NULL,
      ticket_created_at timestamptz NULL,
      ghosted_at timestamptz NULL,
      ghost_reason text NULL,
      last_transition_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_class_status
      ON crm.client_billing_classification(class_status)
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_org
      ON crm.client_billing_classification(organization_id)
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted
      ON crm.client_billing_classification(ghosted_at)
  `),await i._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
      holiday_date date PRIMARY KEY,
      name varchar(180) NOT NULL,
      scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `),[2026,2027,2028,2029,2030]))for(let e of function(a){let e=function(a){let e=a%19,t=Math.floor(a/100),i=a%100,n=(19*e+t-Math.floor(t/4)-Math.floor((t-Math.floor((t+8)/25)+1)/3)+15)%30,r=(32+t%4*2+2*Math.floor(i/4)-n-i%4)%7,s=Math.floor((e+11*n+22*r)/451);return new Date(Date.UTC(a,Math.floor((n+r-7*s+114)/31)-1,(n+r-7*s+114)%31+1))}(a),t=s(e,-48),i=s(e,-47),n=s(e,-2),o=s(e,60);return[{date:`${a}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:r(t),name:"Carnaval (segunda-feira)"},{date:r(i),name:"Carnaval (ter\xe7a-feira)"},{date:r(n),name:"Sexta-feira Santa"},{date:`${a}-04-21`,name:"Tiradentes"},{date:`${a}-05-01`,name:"Dia do Trabalho"},{date:r(o),name:"Corpus Christi"},{date:`${a}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${a}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${a}-11-02`,name:"Finados"},{date:`${a}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${a}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${a}-12-25`,name:"Natal"}]}(a))await i._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,e.date,e.name)}},4384:(a,e,t)=>{t.d(e,{C:()=>n,I:()=>r});var i=t(4738);async function n(){await i._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.deal_suppression (
      organization_id uuid NOT NULL,
      deal_type varchar(40) NOT NULL,
      subscription_id uuid NULL,
      reason text NULL,
      created_by varchar(120) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, deal_type)
    )
  `),await i._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS deal_suppression_subscription_idx
      ON crm.deal_suppression(subscription_id)
  `)}async function r(a,e){let t=await a.$queryRawUnsafe(`
      SELECT id::text AS id, user_id::text AS user_id
      FROM client.organizations
      WHERE id = $1::uuid
      LIMIT 1
    `,e),i=t[0]?.user_id??null;if(await a.$executeRawUnsafe("DELETE FROM crm.deal WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.pipeline_card WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.proposal_avulsa WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.signup_session WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.email_queue WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.manual_whatsapp_queue WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.financial_entry WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.collection_action WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.accounts WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.deal_suppression WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM crm.client_billing_classification WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM client.tickets WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM client.project_briefs WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM client.payments WHERE subscription_id IN (SELECT id FROM client.subscriptions WHERE organization_id = $1::uuid)",e),await a.$executeRawUnsafe("DELETE FROM client.subscriptions WHERE organization_id = $1::uuid",e),await a.$executeRawUnsafe("DELETE FROM client.organizations WHERE id = $1::uuid",e),i){let e=await a.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS c
        FROM client.organizations
        WHERE user_id = $1::uuid
      `,i);(e[0]?.c??0)===0&&await a.$executeRawUnsafe("DELETE FROM client.users WHERE id = $1::uuid",i)}await a.$executeRawUnsafe(`
    DELETE FROM crm.lead_dedupe_key k
    WHERE NOT EXISTS (
      SELECT 1 FROM crm.deal d WHERE d.lead_id = k.lead_id
    )
  `),await a.$executeRawUnsafe(`
    DELETE FROM crm.leads l
    WHERE NOT EXISTS (
      SELECT 1 FROM crm.deal d WHERE d.lead_id = l.id
    )
  `)}},4738:(a,e,t)=>{t.d(e,{_:()=>n});var i=t(3524);let n=global.__prisma__??new i.PrismaClient({log:["error"]})}};var e=require("../../../../../webpack-runtime.js");e.C(a);var t=a=>e(e.s=a),i=e.X(0,[7787,4833],()=>t(8621));module.exports=i})();