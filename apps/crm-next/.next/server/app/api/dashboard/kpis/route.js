"use strict";(()=>{var e={};e.id=1870,e.ids=[1870],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5830:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>m,patchFetch:()=>T,requestAsyncStorage:()=>_,routeModule:()=>p,serverHooks:()=>N,staticGenerationAsyncStorage:()=>A});var n={};a.r(n),a.d(n,{GET:()=>E});var i=a(3278),r=a(5002),s=a(4877),o=a(1309),d=a(7392),l=a(85),c=a(6753),u=a(4738);async function E(e){let t=(0,d.I)(e);if(t)return t;await (0,l.e)();let a=new Date,n=new Date(a.getTime()-864e5),i=new Date(a.getTime()-6048e5),[r,s,E,p,_,A,N,m,T,L,O]=await Promise.all([u._.lead.count({where:{createdAt:{gte:n}}}),u._.lead.count({where:{createdAt:{gte:i}}}),u._.signupSession.count({where:{status:"ABANDONED",paymentConfirmed:!1}}),u._.deal.count({where:{dealType:"HOSPEDAGEM",lifecycleStatus:"CLIENT",updatedAt:{gte:i}}}),u._.deal.count({where:{dealType:"PROJETO_AVULSO",lifecycleStatus:"CLIENT",updatedAt:{gte:i}}}),u._.deal.count({where:{lifecycleStatus:"LOST",updatedAt:{gte:i}}}),u._.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE coalesce(c.class_status, 'ATIVO') = 'ATIVO' AND c.ghosted_at IS NULL)::int AS ativos,
        COUNT(*) FILTER (WHERE c.class_status = 'ATRASADO' AND c.ghosted_at IS NULL)::int AS atrasados,
        COUNT(*) FILTER (WHERE c.class_status = 'INATIVO' AND c.ghosted_at IS NULL)::int AS inativos,
        COUNT(*) FILTER (WHERE c.ghosted_at IS NOT NULL)::int AS fantasma
      FROM crm.deal d
      LEFT JOIN crm.client_billing_classification c ON c.deal_id = d.id
      WHERE d.deal_type = 'HOSPEDAGEM'
        AND d.lifecycle_status = 'CLIENT'
    `,u._.dealOperation.count({where:{status:"ACTIVE"}}),u._.deal.count({where:{lifecycleStatus:{not:"CLIENT"},slaDeadline:{lt:a}}}),u._.ticketQueue.count({where:{status:{in:["NEW","OPEN","PENDING"]}}}),(0,c.a)()]),S=N[0]||{ativos:0,atrasados:0,inativos:0,fantasma:0};return o.NextResponse.json({prospeccao:{leads24h:r,leads7d:s,abandonos2h:E,ganhosHospedagem:p,ganhosAvulsos:_,perdidos:A},operacao:{clientesAtivos:S.ativos,clientesAtrasados:S.atrasados,clientesInativos:S.inativos,clientesFantasma:S.fantasma,operacoesEmCurso:m,slaRisco:T,ticketsAbertos:L},financeiro:{mrr:O.mrr,recebidosMes:O.recebidosMes,inadimplenciaAberta:O.inadimplenciaAberta,dreResultadoMes:O.dre.resultado}})}let p=new i.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/dashboard/kpis/route",pathname:"/api/dashboard/kpis",filename:"route",bundlePath:"app/api/dashboard/kpis/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/dashboard/kpis/route.ts",nextConfigOutput:"standalone",userland:n}),{requestAsyncStorage:_,staticGenerationAsyncStorage:A,serverHooks:N}=p,m="/api/dashboard/kpis/route";function T(){return(0,s.patchFetch)({serverHooks:N,staticGenerationAsyncStorage:A})}},7392:(e,t,a)=>{a.d(t,{I:()=>i});var n=a(1309);function i(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?n.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},85:(e,t,a)=>{a.d(t,{e:()=>o,u:()=>i});var n=a(4738);let i={ATIVO:"ATIVO",ATRASADO:"ATRASADO",INATIVO:"INATIVO"};function r(e){return e.toISOString().slice(0,10)}function s(e,t){return new Date(e.getTime()+864e5*t)}async function o(){for(let e of(await n._.$executeRawUnsafe(`
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
  `),await n._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_class_status
      ON crm.client_billing_classification(class_status)
  `),await n._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_org
      ON crm.client_billing_classification(organization_id)
  `),await n._.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_client_billing_ghosted
      ON crm.client_billing_classification(ghosted_at)
  `),await n._.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm.holiday_calendar (
      holiday_date date PRIMARY KEY,
      name varchar(180) NOT NULL,
      scope varchar(20) NOT NULL DEFAULT 'NACIONAL',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `),[2026,2027,2028,2029,2030]))for(let t of function(e){let t=function(e){let t=e%19,a=Math.floor(e/100),n=e%100,i=(19*t+a-Math.floor(a/4)-Math.floor((a-Math.floor((a+8)/25)+1)/3)+15)%30,r=(32+a%4*2+2*Math.floor(n/4)-i-n%4)%7,s=Math.floor((t+11*i+22*r)/451);return new Date(Date.UTC(e,Math.floor((i+r-7*s+114)/31)-1,(i+r-7*s+114)%31+1))}(e),a=s(t,-48),n=s(t,-47),i=s(t,-2),o=s(t,60);return[{date:`${e}-01-01`,name:"Confraterniza\xe7\xe3o Universal"},{date:r(a),name:"Carnaval (segunda-feira)"},{date:r(n),name:"Carnaval (ter\xe7a-feira)"},{date:r(i),name:"Sexta-feira Santa"},{date:`${e}-04-21`,name:"Tiradentes"},{date:`${e}-05-01`,name:"Dia do Trabalho"},{date:r(o),name:"Corpus Christi"},{date:`${e}-09-07`,name:"Independ\xeancia do Brasil"},{date:`${e}-10-12`,name:"Nossa Senhora Aparecida"},{date:`${e}-11-02`,name:"Finados"},{date:`${e}-11-15`,name:"Proclama\xe7\xe3o da Rep\xfablica"},{date:`${e}-11-20`,name:"Dia da Consci\xeancia Negra"},{date:`${e}-12-25`,name:"Natal"}]}(e))await n._.$executeRawUnsafe(`
          INSERT INTO crm.holiday_calendar (holiday_date, name, scope)
          VALUES ($1::date, $2::varchar, 'NACIONAL')
          ON CONFLICT (holiday_date) DO NOTHING
        `,t.date,t.name)}},6753:(e,t,a)=>{a.d(t,{a:()=>d});var n=a(3524),i=a(4738),r=a(7844);let s=["CONFIRMED","RECEIVED","PAID","RECEIVED_IN_CASH","SETTLED"];async function o(e){let t=await i._.$queryRaw(e);return(0,r.jW)(t[0]?.total??null)}async function d(){let{start:e,end:t}=function(e=new Date){return{start:new Date(e.getFullYear(),e.getMonth(),1),end:new Date(e.getFullYear(),e.getMonth()+1,1)}}(),[a,i,r,d,l,c]=await Promise.all([o(n.Prisma.sql`
      SELECT COALESCE(SUM(p.monthly_price), 0) AS total
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE'
    `),o(n.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.paid_at >= ${e}::timestamp
        AND p.paid_at < ${t}::timestamp
        AND p.status = ANY(${s}::text[])
    `),o(n.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.due_date < CURRENT_DATE
        AND (p.status IS NULL OR p.status <> ALL(${s}::text[]))
    `),o(n.Prisma.sql`
      SELECT COALESCE(SUM(dp.value_cents), 0) / 100.0 AS total
      FROM crm.deal_proposal dp
      WHERE dp.created_at >= ${e}::timestamp
        AND dp.created_at < ${t}::timestamp
        AND dp.status IN ('GERADA', 'ENVIADA', 'ACEITA', 'FECHADA')
    `),o(n.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'RECEITA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `),o(n.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'DESPESA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `)]),u=d+l,E=u>0?u:Math.round(.15*i);return{mrr:a,recebidosMes:i,inadimplenciaAberta:r,avulsoMes:u,dre:{receitaRecorrente:i,receitaAvulsa:u,despesasManuais:c,resultado:i+u-c},projecao:{d30:a+E,d60:2*a+2*E,d90:3*a+3*E}}}},7844:(e,t,a)=>{function n(e){return Number.isFinite(e)?Math.round(100*e):0}function i(e){return null==e?0:"number"==typeof e?n(e):n(Number(String(e).trim().replace(/\./g,"").replace(",",".")))}function r(e){return null==e?0:"number"==typeof e?n(e):n(e.toNumber())}a.d(t,{jW:()=>r,yv:()=>i})},4738:(e,t,a)=>{a.d(t,{_:()=>i});var n=a(3524);let i=global.__prisma__??new n.PrismaClient({log:["error"]})}};var t=require("../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),n=t.X(0,[7787,4833],()=>a(5830));module.exports=n})();