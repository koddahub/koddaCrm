"use strict";(()=>{var e={};e.id=1870,e.ids=[1870],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5830:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>_,patchFetch:()=>S,requestAsyncStorage:()=>E,routeModule:()=>c,serverHooks:()=>A,staticGenerationAsyncStorage:()=>m});var r={};a.r(r),a.d(r,{GET:()=>p});var n=a(3278),s=a(5002),o=a(4877),i=a(1309),u=a(7392),l=a(6753),d=a(4738);async function p(e){let t=(0,u.I)(e);if(t)return t;let a=new Date,r=new Date(a.getTime()-864e5),n=new Date(a.getTime()-6048e5),[s,o,p,c,E,m,A,_,S,C,N]=await Promise.all([d._.lead.count({where:{createdAt:{gte:r}}}),d._.lead.count({where:{createdAt:{gte:n}}}),d._.signupSession.count({where:{status:"ABANDONED",paymentConfirmed:!1}}),d._.deal.count({where:{dealType:"HOSPEDAGEM",lifecycleStatus:"CLIENT",updatedAt:{gte:n}}}),d._.deal.count({where:{dealType:"PROJETO_AVULSO",lifecycleStatus:"CLIENT",updatedAt:{gte:n}}}),d._.deal.count({where:{lifecycleStatus:"LOST",updatedAt:{gte:n}}}),d._.deal.count({where:{lifecycleStatus:"CLIENT"}}),d._.dealOperation.count({where:{status:"ACTIVE"}}),d._.deal.count({where:{lifecycleStatus:{not:"CLIENT"},slaDeadline:{lt:a}}}),d._.ticketQueue.count({where:{status:{in:["NEW","OPEN","PENDING"]}}}),(0,l.a)()]);return i.NextResponse.json({prospeccao:{leads24h:s,leads7d:o,abandonos2h:p,ganhosHospedagem:c,ganhosAvulsos:E,perdidos:m},operacao:{clientesAtivos:A,operacoesEmCurso:_,slaRisco:S,ticketsAbertos:C},financeiro:{mrr:N.mrr,recebidosMes:N.recebidosMes,inadimplenciaAberta:N.inadimplenciaAberta,dreResultadoMes:N.dre.resultado}})}let c=new n.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/dashboard/kpis/route",pathname:"/api/dashboard/kpis",filename:"route",bundlePath:"app/api/dashboard/kpis/route"},resolvedPagePath:"/home/server/projects/projero-area-cliente/apps/crm-next/app/api/dashboard/kpis/route.ts",nextConfigOutput:"standalone",userland:r}),{requestAsyncStorage:E,staticGenerationAsyncStorage:m,serverHooks:A}=c,_="/api/dashboard/kpis/route";function S(){return(0,o.patchFetch)({serverHooks:A,staticGenerationAsyncStorage:m})}},7392:(e,t,a)=>{a.d(t,{I:()=>n});var r=a(1309);function n(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?r.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},6753:(e,t,a)=>{a.d(t,{a:()=>u});var r=a(3524),n=a(4738),s=a(7844);let o=["CONFIRMED","RECEIVED","PAID","RECEIVED_IN_CASH","SETTLED"];async function i(e){let t=await n._.$queryRaw(e);return(0,s.jW)(t[0]?.total??null)}async function u(){let{start:e,end:t}=function(e=new Date){return{start:new Date(e.getFullYear(),e.getMonth(),1),end:new Date(e.getFullYear(),e.getMonth()+1,1)}}(),[a,n,s,u,l,d]=await Promise.all([i(r.Prisma.sql`
      SELECT COALESCE(SUM(p.monthly_price), 0) AS total
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE'
    `),i(r.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.paid_at >= ${e}::timestamp
        AND p.paid_at < ${t}::timestamp
        AND p.status = ANY(${o}::text[])
    `),i(r.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.due_date < CURRENT_DATE
        AND (p.status IS NULL OR p.status <> ALL(${o}::text[]))
    `),i(r.Prisma.sql`
      SELECT COALESCE(SUM(dp.value_cents), 0) / 100.0 AS total
      FROM crm.deal_proposal dp
      WHERE dp.created_at >= ${e}::timestamp
        AND dp.created_at < ${t}::timestamp
        AND dp.status IN ('GERADA', 'ENVIADA', 'ACEITA', 'FECHADA')
    `),i(r.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'RECEITA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `),i(r.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'DESPESA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `)]),p=u+l,c=p>0?p:Math.round(.15*n);return{mrr:a,recebidosMes:n,inadimplenciaAberta:s,avulsoMes:p,dre:{receitaRecorrente:n,receitaAvulsa:p,despesasManuais:d,resultado:n+p-d},projecao:{d30:a+c,d60:2*a+2*c,d90:3*a+3*c}}}},7844:(e,t,a)=>{function r(e){return Number.isFinite(e)?Math.round(100*e):0}function n(e){return null==e?0:"number"==typeof e?r(e):r(Number(String(e).trim().replace(/\./g,"").replace(",",".")))}function s(e){return null==e?0:"number"==typeof e?r(e):r(e.toNumber())}a.d(t,{jW:()=>s,yv:()=>n})},4738:(e,t,a)=>{a.d(t,{_:()=>n});var r=a(3524);let n=global.__prisma__??new r.PrismaClient({log:["error"]})}};var t=require("../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),r=t.X(0,[7787,4833],()=>a(5830));module.exports=r})();