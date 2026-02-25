"use strict";(()=>{var a={};a.id=1109,a.ids=[1109],a.modules={3524:a=>{a.exports=require("@prisma/client")},399:a=>{a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:a=>{a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},6936:(a,e,t)=>{t.r(e),t.d(e,{originalPathname:()=>T,patchFetch:()=>E,requestAsyncStorage:()=>m,routeModule:()=>_,serverHooks:()=>p,staticGenerationAsyncStorage:()=>N});var i={};t.r(i),t.d(i,{POST:()=>u});var n=t(3278),s=t(5002),r=t(4877),o=t(1309),d=t(7392),l=t(85),c=t(4738);async function u(a,{params:e}){let t=(0,d.I)(a);if(t)return t;await (0,l.e)();let i=await a.json().catch(()=>({})),n="string"==typeof i.reason&&""!==i.reason.trim()?i.reason.trim():"Movido manualmente para lista fantasma",s=(await c._.$queryRawUnsafe(`
      SELECT deal_id::text, class_status, ghosted_at
      FROM crm.client_billing_classification
      WHERE deal_id = $1::uuid
      LIMIT 1
    `,e.dealId))[0];return s?s.class_status!==l.u.INATIVO?o.NextResponse.json({error:"Somente clientes inativos podem ir para a lista fantasma."},{status:422}):(await c._.$transaction(async a=>{await a.$executeRawUnsafe(`
        UPDATE crm.client_billing_classification
        SET ghosted_at = now(), ghost_reason = $2::text, updated_at = now()
        WHERE deal_id = $1::uuid
      `,e.dealId,n),await a.dealActivity.create({data:{dealId:e.dealId,activityType:"CLIENT_GHOSTED",content:"Cliente movido para lista fantasma.",metadata:{reason:n},createdBy:"ADMIN"}})}),o.NextResponse.json({ok:!0})):o.NextResponse.json({error:"Classifica\xe7\xe3o n\xe3o encontrada para este cliente."},{status:404})}let _=new n.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/clientes/[dealId]/ghost/route",pathname:"/api/clientes/[dealId]/ghost",filename:"route",bundlePath:"app/api/clientes/[dealId]/ghost/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/clientes/[dealId]/ghost/route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:m,staticGenerationAsyncStorage:N,serverHooks:p}=_,T="/api/clientes/[dealId]/ghost/route";function E(){return(0,r.patchFetch)({serverHooks:p,staticGenerationAsyncStorage:N})}},7392:(a,e,t)=>{t.d(e,{I:()=>n});var i=t(1309);function n(a){return a.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?i.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(a,e,t)=>{t.d(e,{e:()=>o,u:()=>n});var i=t(4738);let n={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function s(a){return a.toISOString().slice(0,10)}function r(a,e){return new Date(a.getTime()+864e5*e)}async function o(){for(let a of(await i._.$executeRawUnsafe(`
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
  `),[2026,2027,2028,2029,2030]))for(let e of function(a){let e=function(a){let e=a%19,t=Math.floor(a/100),i=a%100,n=(19*e+t-Math.floor(t/4)-Math.floor((t-Math.floor((t+8)/25)+1)/3)+15)%30,s=(32+t%4*2+2*Math.floor(i/4)-n-i%4)%7,r=Math.floor((e+11*n+22*s)/451);return new Date(Date.UTC(a,Math.floor((n+s-7*r+114)/31)-1,(n+s-7*r+114)%31+1))}(a),t=r(e,-48),i=r(e,-47),n=r(e,-2),o=r(e,60);return[{date:`${a}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:s(t),name:"Carnaval (segunda-feira)"},{date:s(i),name:"Carnaval (ter\xe7a-feira)"},{date:s(n),name:"Sexta-feira Santa"},{date:`${a}-04-21`,name:"Tiradentes"},{date:`${a}-05-01`,name:"Dia do Trabalho"},{date:s(o),name:"Corpus Christi"},{date:`${a}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${a}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${a}-11-02`,name:"Finados"},{date:`${a}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${a}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${a}-12-25`,name:"Natal"}]}(a))await i._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,e.date,e.name)}},4738:(a,e,t)=>{t.d(e,{_:()=>n});var i=t(3524);let n=global.__prisma__??new i.PrismaClient({log:["error"]})}};var e=require("../../../../../webpack-runtime.js");e.C(a);var t=a=>e(e.s=a),i=e.X(0,[7787,4833],()=>t(6936));module.exports=i})();