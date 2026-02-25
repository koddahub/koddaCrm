"use strict";(()=>{var e={};e.id=1313,e.ids=[1313],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1054:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>p,patchFetch:()=>E,requestAsyncStorage:()=>N,routeModule:()=>_,serverHooks:()=>T,staticGenerationAsyncStorage:()=>m});var i={};t.r(i),t.d(i,{POST:()=>u});var n=t(3278),r=t(5002),s=t(4877),o=t(1309),d=t(7392),l=t(85),c=t(4738);async function u(e,{params:a}){let t=(0,d.I)(e);if(t)return t;await (0,l.e)();let i=(await c._.$queryRawUnsafe(`
      SELECT deal_id::text, ghosted_at
      FROM crm.client_billing_classification
      WHERE deal_id = $1::uuid
      LIMIT 1
    `,a.dealId))[0];return i?i.ghosted_at?(await c._.$transaction(async e=>{await e.$executeRawUnsafe(`
        UPDATE crm.client_billing_classification
        SET ghosted_at = NULL, ghost_reason = NULL, updated_at = now()
        WHERE deal_id = $1::uuid
      `,a.dealId),await e.dealActivity.create({data:{dealId:a.dealId,activityType:"CLIENT_RESTORED",content:"Cliente removido da lista fantasma.",metadata:{},createdBy:"ADMIN"}})}),o.NextResponse.json({ok:!0})):o.NextResponse.json({error:"Cliente n\xe3o est\xe1 na lista fantasma."},{status:422}):o.NextResponse.json({error:"Classifica\xe7\xe3o n\xe3o encontrada para este cliente."},{status:404})}let _=new n.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/clientes/[dealId]/restore/route",pathname:"/api/clientes/[dealId]/restore",filename:"route",bundlePath:"app/api/clientes/[dealId]/restore/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/clientes/[dealId]/restore/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:N,staticGenerationAsyncStorage:m,serverHooks:T}=_,p="/api/clientes/[dealId]/restore/route";function E(){return(0,s.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:m})}},7392:(e,a,t)=>{t.d(a,{I:()=>n});var i=t(1309);function n(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(e,a,t)=>{t.d(a,{e:()=>o,u:()=>n});var i=t(4738);let n={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function r(e){return e.toISOString().slice(0,10)}function s(e,a){return new Date(e.getTime()+864e5*a)}async function o(){for(let e of(await i._.$executeRawUnsafe(`
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
  `),[2026,2027,2028,2029,2030]))for(let a of function(e){let a=function(e){let a=e%19,t=Math.floor(e/100),i=e%100,n=(19*a+t-Math.floor(t/4)-Math.floor((t-Math.floor((t+8)/25)+1)/3)+15)%30,r=(32+t%4*2+2*Math.floor(i/4)-n-i%4)%7,s=Math.floor((a+11*n+22*r)/451);return new Date(Date.UTC(e,Math.floor((n+r-7*s+114)/31)-1,(n+r-7*s+114)%31+1))}(e),t=s(a,-48),i=s(a,-47),n=s(a,-2),o=s(a,60);return[{date:`${e}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:r(t),name:"Carnaval (segunda-feira)"},{date:r(i),name:"Carnaval (ter\xe7a-feira)"},{date:r(n),name:"Sexta-feira Santa"},{date:`${e}-04-21`,name:"Tiradentes"},{date:`${e}-05-01`,name:"Dia do Trabalho"},{date:r(o),name:"Corpus Christi"},{date:`${e}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${e}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${e}-11-02`,name:"Finados"},{date:`${e}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${e}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${e}-12-25`,name:"Natal"}]}(e))await i._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,a.date,a.name)}},4738:(e,a,t)=>{t.d(a,{_:()=>n});var i=t(3524);let n=global.__prisma__??new i.PrismaClient({log:["error"]})}};var a=require("../../../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),i=a.X(0,[7787,4833],()=>t(1054));module.exports=i})();