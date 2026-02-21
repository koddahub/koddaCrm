"use strict";(()=>{var e={};e.id=3035,e.ids=[3035],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},8386:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>p,patchFetch:()=>m,requestAsyncStorage:()=>N,routeModule:()=>u,serverHooks:()=>T,staticGenerationAsyncStorage:()=>E});var s={};t.r(s),t.d(s,{GET:()=>_});var i=t(3278),n=t(5002),c=t(4877),d=t(1309),l=t(7392),r=t(85),o=t(4738);async function _(e){let a=(0,l.I)(e);if(a)return a;await (0,r.e)();let t=(e.nextUrl.searchParams.get("status")||r.u.ATIVO).toUpperCase(),s=(e.nextUrl.searchParams.get("search")||"").trim(),i=Math.max(1,Number.parseInt(e.nextUrl.searchParams.get("page")||"1",10)||1),n=Math.max(1,Math.min(50,Number.parseInt(e.nextUrl.searchParams.get("pageSize")||"10",10)||10)),c=(i-1)*n,_="FANTASMA"===t;if(!new Set(["ATIVO","ATRASADO","INATIVO","FANTASMA"]).has(t))return d.NextResponse.json({error:"Status inv\xe1lido"},{status:422});let u=[],N=["d.deal_type = 'HOSPEDAGEM'","d.lifecycle_status = 'CLIENT'"];if(_?N.push("c.ghosted_at IS NOT NULL"):(u.push(t),N.push("c.ghosted_at IS NULL"),N.push(`coalesce(c.class_status, 'ATIVO') = $${u.length}`)),""!==s){u.push(`%${s}%`);let e=`$${u.length}`;N.push(`
      (
        d.title ILIKE ${e}
        OR coalesce(d.contact_name, '') ILIKE ${e}
        OR coalesce(d.contact_email, '') ILIKE ${e}
        OR coalesce(d.plan_code, '') ILIKE ${e}
        OR coalesce(d.product_code, '') ILIKE ${e}
      )
    `)}let E=N.join(" AND "),T=await o._.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE ${E}
    `,...u),p=T[0]?.total??0;u.push(n);let m=`$${u.length}`;u.push(c);let A=`$${u.length}`,O=await o._.$queryRawUnsafe(`
      SELECT
        d.id,
        d.title,
        d.contact_name,
        d.contact_email,
        d.deal_type,
        d.plan_code,
        d.product_code,
        d.value_cents,
        d.updated_at,
        coalesce(c.class_status, 'ATIVO') AS class_status,
        coalesce(c.days_late, 0) AS days_late,
        c.last_payment_status,
        c.reference_due_date,
        s.next_due_date,
        c.ghosted_at,
        c.ticket_id::text AS ticket_id,
        tq.sla_deadline
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      LEFT JOIN LATERAL (
        SELECT s1.next_due_date
        FROM client.subscriptions s1
        WHERE s1.organization_id = d.organization_id
        ORDER BY s1.created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT q.sla_deadline
        FROM crm.ticket_queue q
        WHERE q.ticket_id = c.ticket_id
        ORDER BY q.created_at DESC
        LIMIT 1
      ) tq ON true
      WHERE ${E}
      ORDER BY
        coalesce(c.days_late, 0) DESC,
        d.updated_at DESC
      LIMIT ${m} OFFSET ${A}
    `,...u),I=await o._.$queryRawUnsafe(`
      SELECT coalesce(c.class_status, 'ATIVO') AS class_status, COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type='HOSPEDAGEM'
        AND d.lifecycle_status='CLIENT'
        AND c.ghosted_at IS NULL
      GROUP BY 1
    `),L=await o._.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type='HOSPEDAGEM'
        AND d.lifecycle_status='CLIENT'
        AND c.ghosted_at IS NOT NULL
    `),h={ATIVO:0,ATRASADO:0,INATIVO:0,FANTASMA:L[0]?.total??0};for(let e of I)e.class_status in h&&(h[e.class_status]=e.total);return d.NextResponse.json({status:t,page:i,pageSize:n,total:p,totalPages:Math.max(1,Math.ceil(p/n)),counts:h,items:O.map(e=>({id:e.id,title:e.title,contactName:e.contact_name,contactEmail:e.contact_email,dealType:e.deal_type,planCode:e.plan_code,productCode:e.product_code,valueCents:e.value_cents,updatedAt:e.updated_at,classStatus:e.class_status??r.u.ATIVO,daysLate:e.days_late??0,lastPaymentStatus:e.last_payment_status,referenceDueDate:e.reference_due_date,nextDueDate:e.next_due_date,ghostedAt:e.ghosted_at,ticketId:e.ticket_id,ticketSlaDeadline:e.sla_deadline}))})}let u=new i.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/clientes/route",pathname:"/api/clientes",filename:"route",bundlePath:"app/api/clientes/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/clientes/route.ts",nextConfigOutput:"standalone",userland:s}),{requestAsyncStorage:N,staticGenerationAsyncStorage:E,serverHooks:T}=u,p="/api/clientes/route";function m(){return(0,c.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:E})}},7392:(e,a,t)=>{t.d(a,{I:()=>i});var s=t(1309);function i(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?s.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(e,a,t)=>{t.d(a,{e:()=>d,u:()=>i});var s=t(4738);let i={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function n(e){return e.toISOString().slice(0,10)}function c(e,a){return new Date(e.getTime()+864e5*a)}async function d(){for(let e of(await s._.$executeRawUnsafe(`
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
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_class_status
      ON crm.client_billing_classification(class_status)
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_org
      ON crm.client_billing_classification(organization_id)
  `),await s._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted
      ON crm.client_billing_classification(ghosted_at)
  `),await s._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
      holiday_date date PRIMARY KEY,
      name varchar(180) NOT NULL,
      scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `),[2026,2027,2028,2029,2030]))for(let a of function(e){let a=function(e){let a=e%19,t=Math.floor(e/100),s=e%100,i=(19*a+t-Math.floor(t/4)-Math.floor((t-Math.floor((t+8)/25)+1)/3)+15)%30,n=(32+t%4*2+2*Math.floor(s/4)-i-s%4)%7,c=Math.floor((a+11*i+22*n)/451);return new Date(Date.UTC(e,Math.floor((i+n-7*c+114)/31)-1,(i+n-7*c+114)%31+1))}(e),t=c(a,-48),s=c(a,-47),i=c(a,-2),d=c(a,60);return[{date:`${e}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:n(t),name:"Carnaval (segunda-feira)"},{date:n(s),name:"Carnaval (ter\xe7a-feira)"},{date:n(i),name:"Sexta-feira Santa"},{date:`${e}-04-21`,name:"Tiradentes"},{date:`${e}-05-01`,name:"Dia do Trabalho"},{date:n(d),name:"Corpus Christi"},{date:`${e}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${e}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${e}-11-02`,name:"Finados"},{date:`${e}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${e}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${e}-12-25`,name:"Natal"}]}(e))await s._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,a.date,a.name)}},4738:(e,a,t)=>{t.d(a,{_:()=>i});var s=t(3524);let i=global.__prisma__??new s.PrismaClient({log:["error"]})}};var a=require("../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),s=a.X(0,[7787,4833],()=>t(8386));module.exports=s})();