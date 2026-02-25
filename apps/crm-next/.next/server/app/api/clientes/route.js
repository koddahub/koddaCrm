"use strict";(()=>{var e={};e.id=3035,e.ids=[3035],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},2702:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>T,patchFetch:()=>O,requestAsyncStorage:()=>E,routeModule:()=>u,serverHooks:()=>p,staticGenerationAsyncStorage:()=>N});var s={};a.r(s),a.d(s,{GET:()=>_});var i=a(3278),n=a(5002),d=a(4877),c=a(1309),r=a(7392),l=a(85),o=a(4738);async function _(e){let t=(0,r.I)(e);if(t)return t;await (0,l.e)();let a=(e.nextUrl.searchParams.get("status")||l.u.ATIVO).toUpperCase(),s=(e.nextUrl.searchParams.get("search")||"").trim(),i=Math.max(1,Number.parseInt(e.nextUrl.searchParams.get("page")||"1",10)||1),n=Math.max(1,Math.min(50,Number.parseInt(e.nextUrl.searchParams.get("pageSize")||"10",10)||10)),d=(i-1)*n,_="FANTASMA"===a;if(!new Set(["ATIVO","ATRASADO","INATIVO","FANTASMA"]).has(a))return c.NextResponse.json({error:"Status inv\xe1lido"},{status:422});let u=[],E=`
    CASE
      WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
      WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
      WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
      ELSE coalesce(c.class_status, 'ATIVO')
    END
  `,N=`
    d.deal_type = 'HOSPEDAGEM'
    AND (
      d.lifecycle_status = 'CLIENT'
      OR ps.code IN ('fechado_ganho', 'assinatura_ativa_ganho')
      OR (
        d.is_closed = true
        AND coalesce(ps.code, '') NOT IN ('perdido', 'perdido_abandonado')
      )
    )
  `,p=[N];if(_?p.push("c.ghosted_at IS NOT NULL"):(u.push(a),p.push("c.ghosted_at IS NULL"),p.push(`${E} = $${u.length}`)),""!==s){u.push(`%${s}%`);let e=`$${u.length}`;p.push(`
      (
        d.title ILIKE ${e}
        OR coalesce(d.contact_name, '') ILIKE ${e}
        OR coalesce(d.contact_email, '') ILIKE ${e}
        OR coalesce(d.plan_code, '') ILIKE ${e}
        OR coalesce(d.product_code, '') ILIKE ${e}
      )
    `)}let T=p.join(" AND "),O=await o._.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      LEFT JOIN LATERAL (
        SELECT s1.status
        FROM client.subscriptions s1
        WHERE s1.organization_id = d.organization_id
        ORDER BY s1.created_at DESC
        LIMIT 1
      ) s ON true
      WHERE ${T}
    `,...u),A=O[0]?.total??0;u.push(n);let I=`$${u.length}`;u.push(d);let m=`$${u.length}`,L=await o._.$queryRawUnsafe(`
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
        ${E} AS class_status,
        coalesce(c.days_late, 0) AS days_late,
        c.last_payment_status,
        c.reference_due_date,
        s.next_due_date,
        c.ghosted_at,
        c.ticket_id::text AS ticket_id,
        tq.sla_deadline
      FROM crm.deal d
      LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      LEFT JOIN LATERAL (
        SELECT s1.status, s1.next_due_date
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
      WHERE ${T}
      ORDER BY
        coalesce(c.days_late, 0) DESC,
        d.updated_at DESC
      LIMIT ${I} OFFSET ${m}
    `,...u),R=await o._.$queryRawUnsafe(`
      SELECT ${E} AS class_status, COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      LEFT JOIN LATERAL (
        SELECT s1.status
        FROM client.subscriptions s1
        WHERE s1.organization_id = d.organization_id
        ORDER BY s1.created_at DESC
        LIMIT 1
      ) s ON true
      WHERE ${N}
        AND c.ghosted_at IS NULL
      GROUP BY 1
    `),S=await o._.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total
      FROM crm.deal d
      LEFT JOIN crm.pipeline_stage ps ON ps.id = d.stage_id
      JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE ${N}
        AND c.ghosted_at IS NOT NULL
    `),h={ATIVO:0,ATRASADO:0,INATIVO:0,FANTASMA:S[0]?.total??0};for(let e of R)e.class_status in h&&(h[e.class_status]=e.total);return c.NextResponse.json({status:a,page:i,pageSize:n,total:A,totalPages:Math.max(1,Math.ceil(A/n)),counts:h,items:L.map(e=>({id:e.id,title:e.title,contactName:e.contact_name,contactEmail:e.contact_email,dealType:e.deal_type,planCode:e.plan_code,productCode:e.product_code,valueCents:e.value_cents,updatedAt:e.updated_at,classStatus:e.class_status??l.u.ATIVO,daysLate:e.days_late??0,lastPaymentStatus:e.last_payment_status,referenceDueDate:e.reference_due_date,nextDueDate:e.next_due_date,ghostedAt:e.ghosted_at,ticketId:e.ticket_id,ticketSlaDeadline:e.sla_deadline}))})}let u=new i.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/clientes/route",pathname:"/api/clientes",filename:"route",bundlePath:"app/api/clientes/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/clientes/route.ts",nextConfigOutput:"standalone",userland:s}),{requestAsyncStorage:E,staticGenerationAsyncStorage:N,serverHooks:p}=u,T="/api/clientes/route";function O(){return(0,d.patchFetch)({serverHooks:p,staticGenerationAsyncStorage:N})}},7392:(e,t,a)=>{a.d(t,{I:()=>i});var s=a(1309);function i(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?s.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(e,t,a)=>{a.d(t,{e:()=>c,u:()=>i});var s=a(4738);let i={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function n(e){return e.toISOString().slice(0,10)}function d(e,t){return new Date(e.getTime()+864e5*t)}async function c(){for(let e of(await s._.$executeRawUnsafe(`
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
  `),[2026,2027,2028,2029,2030]))for(let t of function(e){let t=function(e){let t=e%19,a=Math.floor(e/100),s=e%100,i=(19*t+a-Math.floor(a/4)-Math.floor((a-Math.floor((a+8)/25)+1)/3)+15)%30,n=(32+a%4*2+2*Math.floor(s/4)-i-s%4)%7,d=Math.floor((t+11*i+22*n)/451);return new Date(Date.UTC(e,Math.floor((i+n-7*d+114)/31)-1,(i+n-7*d+114)%31+1))}(e),a=d(t,-48),s=d(t,-47),i=d(t,-2),c=d(t,60);return[{date:`${e}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:n(a),name:"Carnaval (segunda-feira)"},{date:n(s),name:"Carnaval (ter\xe7a-feira)"},{date:n(i),name:"Sexta-feira Santa"},{date:`${e}-04-21`,name:"Tiradentes"},{date:`${e}-05-01`,name:"Dia do Trabalho"},{date:n(c),name:"Corpus Christi"},{date:`${e}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${e}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${e}-11-02`,name:"Finados"},{date:`${e}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${e}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${e}-12-25`,name:"Natal"}]}(e))await s._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,t.date,t.name)}},4738:(e,t,a)=>{a.d(t,{_:()=>i});var s=a(3524);let i=global.__prisma__??new s.PrismaClient({log:["error"]})}};var t=require("../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),s=t.X(0,[7787,4833],()=>a(2702));module.exports=s})();