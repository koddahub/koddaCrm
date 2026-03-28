"use strict";(()=>{var e={};e.id=1870,e.ids=[1870],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},8627:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>_,patchFetch:()=>m,requestAsyncStorage:()=>A,routeModule:()=>N,serverHooks:()=>T,staticGenerationAsyncStorage:()=>p});var s={};a.r(s),a.d(s,{GET:()=>u});var n=a(3278),i=a(5002),r=a(4877),o=a(1309),c=a(7392),d=a(85),l=a(6753),E=a(4738);async function u(e){let t=(0,c.I)(e);if(t)return t;await (0,d.e)();let a=new Date,s=new Date(a.getTime()-864e5),n=new Date(a.getTime()-6048e5),i=`
    d.deal_type = 'HOSPEDAGEM'
    AND (
      d.lifecycle_status = 'CLIENT'
      OR ps.code IN ('fechado_ganho', 'assinatura_ativa_ganho')
      OR (
        d.is_closed = true
        AND coalesce(ps.code, '') NOT IN ('perdido', 'perdido_abandonado')
      )
    )
  `,[r,u,N,A,p,T,_,m,O,I,L]=await Promise.all([E._.lead.count({where:{createdAt:{gte:s}}}),E._.lead.count({where:{createdAt:{gte:n}}}),E._.signupSession.count({where:{status:"ABANDONED",paymentConfirmed:!1}}),E._.deal.count({where:{dealType:"HOSPEDAGEM",lifecycleStatus:"CLIENT",updatedAt:{gte:n}}}),E._.deal.count({where:{dealType:"PROJETO_AVULSO",lifecycleStatus:"CLIENT",updatedAt:{gte:n}}}),E._.deal.count({where:{lifecycleStatus:"LOST",updatedAt:{gte:n}}}),E._.$queryRawUnsafe(`
        SELECT
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'ATIVO'
            AND c.ghosted_at IS NULL
          )::int AS ativos,
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'ATRASADO'
            AND c.ghosted_at IS NULL
          )::int AS atrasados,
          COUNT(*) FILTER (
            WHERE (
              CASE
                WHEN upper(coalesce(s.status::text, '')) = 'ACTIVE' THEN 'ATIVO'
                WHEN upper(coalesce(s.status::text, '')) = 'OVERDUE' THEN 'ATRASADO'
                WHEN upper(coalesce(s.status::text, '')) IN ('CANCELED', 'INACTIVE') THEN 'INATIVO'
                ELSE coalesce(c.class_status, 'ATIVO')
              END
            ) = 'INATIVO'
            AND c.ghosted_at IS NULL
          )::int AS inativos,
          COUNT(*) FILTER (WHERE c.ghosted_at IS NOT NULL)::int AS fantasma
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
        WHERE ${i}
      `),E._.dealOperation.count({where:{status:"ACTIVE"}}),E._.deal.count({where:{lifecycleStatus:{not:"CLIENT"},slaDeadline:{lt:a}}}),E._.ticketQueue.count({where:{status:{in:["NEW","OPEN","PENDING"]}}}),(0,l.a)()]),S=_[0]||{ativos:0,atrasados:0,inativos:0,fantasma:0};return o.NextResponse.json({prospeccao:{leads24h:r,leads7d:u,abandonos2h:N,ganhosHospedagem:A,ganhosAvulsos:p,perdidos:T},operacao:{clientesAtivos:S.ativos,clientesAtrasados:S.atrasados,clientesInativos:S.inativos,clientesFantasma:S.fantasma,operacoesEmCurso:m,slaRisco:O,ticketsAbertos:I},financeiro:{mrr:L.mrr,recebidosMes:L.recebidosMes,inadimplenciaAberta:L.inadimplenciaAberta,dreResultadoMes:L.dre.resultado}})}let N=new n.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/dashboard/kpis/route",pathname:"/api/dashboard/kpis",filename:"route",bundlePath:"app/api/dashboard/kpis/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/dashboard/kpis/route.ts",nextConfigOutput:"standalone",userland:s}),{requestAsyncStorage:A,staticGenerationAsyncStorage:p,serverHooks:T}=N,_="/api/dashboard/kpis/route";function m(){return(0,r.patchFetch)({serverHooks:T,staticGenerationAsyncStorage:p})}},7392:(e,t,a)=>{a.d(t,{I:()=>n});var s=a(1309);function n(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?s.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(e,t,a)=>{a.d(t,{e:()=>o,u:()=>n});var s=a(4738);let n={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function i(e){return e.toISOString().slice(0,10)}function r(e,t){return new Date(e.getTime()+864e5*t)}async function o(){for(let e of(await s._.$executeRawUnsafe(`
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
  `),[2026,2027,2028,2029,2030]))for(let t of function(e){let t=function(e){let t=e%19,a=Math.floor(e/100),s=e%100,n=(19*t+a-Math.floor(a/4)-Math.floor((a-Math.floor((a+8)/25)+1)/3)+15)%30,i=(32+a%4*2+2*Math.floor(s/4)-n-s%4)%7,r=Math.floor((t+11*n+22*i)/451);return new Date(Date.UTC(e,Math.floor((n+i-7*r+114)/31)-1,(n+i-7*r+114)%31+1))}(e),a=r(t,-48),s=r(t,-47),n=r(t,-2),o=r(t,60);return[{date:`${e}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:i(a),name:"Carnaval (segunda-feira)"},{date:i(s),name:"Carnaval (ter\xe7a-feira)"},{date:i(n),name:"Sexta-feira Santa"},{date:`${e}-04-21`,name:"Tiradentes"},{date:`${e}-05-01`,name:"Dia do Trabalho"},{date:i(o),name:"Corpus Christi"},{date:`${e}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${e}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${e}-11-02`,name:"Finados"},{date:`${e}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${e}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${e}-12-25`,name:"Natal"}]}(e))await s._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,t.date,t.name)}},6753:(e,t,a)=>{a.d(t,{a:()=>c});var s=a(3524),n=a(4738),i=a(7844);let r=["CONFIRMED","RECEIVED","PAID","RECEIVED_IN_CASH","SETTLED"];async function o(e){let t=await n._.$queryRaw(e);return(0,i.jW)(t[0]?.total??null)}async function c(){let{start:e,end:t}=function(e=new Date){return{start:new Date(e.getFullYear(),e.getMonth(),1),end:new Date(e.getFullYear(),e.getMonth()+1,1)}}(),[a,n,i,c,d,l]=await Promise.all([o(s.Prisma.sql`
      SELECT COALESCE(SUM(p.monthly_price), 0) AS total
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE'
    `),o(s.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.paid_at >= ${e}::timestamp
        AND p.paid_at < ${t}::timestamp
        AND p.status = ANY(${r}::text[])
    `),o(s.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.due_date < CURRENT_DATE
        AND (p.status IS NULL OR p.status <> ALL(${r}::text[]))
    `),o(s.Prisma.sql`
      SELECT COALESCE(SUM(dp.value_cents), 0) / 100.0 AS total
      FROM crm.deal_proposal dp
      WHERE dp.created_at >= ${e}::timestamp
        AND dp.created_at < ${t}::timestamp
        AND dp.status IN ('GERADA', 'ENVIADA', 'ACEITA', 'FECHADA')
    `),o(s.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'RECEITA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `),o(s.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'DESPESA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `)]),E=c+d,u=E>0?E:Math.round(.15*n);return{mrr:a,recebidosMes:n,inadimplenciaAberta:i,avulsoMes:E,dre:{receitaRecorrente:n,receitaAvulsa:E,despesasManuais:l,resultado:n+E-l},projecao:{d30:a+u,d60:2*a+2*u,d90:3*a+3*u}}}},7844:(e,t,a)=>{function s(e){return Number.isFinite(e)?Math.round(100*e):0}function n(e){return null==e?0:"number"==typeof e?s(e):s(Number(String(e).trim().replace(/\./g,"").replace(",",".")))}function i(e){return null==e?0:"number"==typeof e?s(e):s(e.toNumber())}a.d(t,{jW:()=>i,yv:()=>n})},4738:(e,t,a)=>{a.d(t,{_:()=>n});var s=a(3524);let n=global.__prisma__??new s.PrismaClient({log:["error"]})}};var t=require("../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),s=t.X(0,[9379,4833],()=>a(8627));module.exports=s})();