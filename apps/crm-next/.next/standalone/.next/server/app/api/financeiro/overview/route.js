"use strict";(()=>{var e={};e.id=5974,e.ids=[5974],e.modules={3524:e=>{e.exports=require("@prisma/client")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1205:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>A,patchFetch:()=>S,requestAsyncStorage:()=>E,routeModule:()=>c,serverHooks:()=>m,staticGenerationAsyncStorage:()=>d});var a={};r.r(a),r.d(a,{GET:()=>l});var n=r(3278),i=r(5002),o=r(4877),s=r(1309),p=r(7392),u=r(6753);async function l(e){let t=(0,p.I)(e);if(t)return t;try{let e=await (0,u.a)();return s.NextResponse.json(e)}catch(e){return s.NextResponse.json({error:"Falha ao carregar overview financeiro",details:String(e)},{status:500})}}let c=new n.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/financeiro/overview/route",pathname:"/api/financeiro/overview",filename:"route",bundlePath:"app/api/financeiro/overview/route"},resolvedPagePath:"/home/server/projects/projeto-area-cliente/apps/crm-next/app/api/financeiro/overview/route.ts",nextConfigOutput:"standalone",userland:a}),{requestAsyncStorage:E,staticGenerationAsyncStorage:d,serverHooks:m}=c,A="/api/financeiro/overview/route";function S(){return(0,o.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:d})}},7392:(e,t,r)=>{r.d(t,{I:()=>n});var a=r(1309);function n(e){return e.cookies.get("crm_admin_session")?.value!==(process.env.CRM_ADMIN_SESSION_TOKEN||"koddahub-crm-v2-session")?a.NextResponse.json({error:"Nao autorizado"},{status:401}):null}},6753:(e,t,r)=>{r.d(t,{a:()=>p});var a=r(3524),n=r(4738),i=r(7844);let o=["CONFIRMED","RECEIVED","PAID","RECEIVED_IN_CASH","SETTLED"];async function s(e){let t=await n._.$queryRaw(e);return(0,i.jW)(t[0]?.total??null)}async function p(){let{start:e,end:t}=function(e=new Date){return{start:new Date(e.getFullYear(),e.getMonth(),1),end:new Date(e.getFullYear(),e.getMonth()+1,1)}}(),[r,n,i,p,u,l]=await Promise.all([s(a.Prisma.sql`
      SELECT COALESCE(SUM(p.monthly_price), 0) AS total
      FROM client.subscriptions s
      JOIN client.plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE'
    `),s(a.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.paid_at >= ${e}::timestamp
        AND p.paid_at < ${t}::timestamp
        AND p.status = ANY(${o}::text[])
    `),s(a.Prisma.sql`
      SELECT COALESCE(SUM(p.amount), 0) AS total
      FROM client.payments p
      WHERE p.due_date < CURRENT_DATE
        AND (p.status IS NULL OR p.status <> ALL(${o}::text[]))
    `),s(a.Prisma.sql`
      SELECT COALESCE(SUM(dp.value_cents), 0) / 100.0 AS total
      FROM crm.deal_proposal dp
      WHERE dp.created_at >= ${e}::timestamp
        AND dp.created_at < ${t}::timestamp
        AND dp.status IN ('GERADA', 'ENVIADA', 'ACEITA', 'FECHADA')
    `),s(a.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'RECEITA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `),s(a.Prisma.sql`
      SELECT COALESCE(SUM(fe.amount_cents), 0) / 100.0 AS total
      FROM crm.financial_entry fe
      WHERE fe.entry_type = 'DESPESA'
        AND fe.entry_date >= ${e}::date
        AND fe.entry_date < ${t}::date
    `)]),c=p+u,E=c>0?c:Math.round(.15*n);return{mrr:r,recebidosMes:n,inadimplenciaAberta:i,avulsoMes:c,dre:{receitaRecorrente:n,receitaAvulsa:c,despesasManuais:l,resultado:n+c-l},projecao:{d30:r+E,d60:2*r+2*E,d90:3*r+3*E}}}},7844:(e,t,r)=>{function a(e){return Number.isFinite(e)?Math.round(100*e):0}function n(e){return null==e?0:"number"==typeof e?a(e):a(Number(String(e).trim().replace(/\./g,"").replace(",",".")))}function i(e){return null==e?0:"number"==typeof e?a(e):a(e.toNumber())}r.d(t,{jW:()=>i,yv:()=>n})},4738:(e,t,r)=>{r.d(t,{_:()=>n});var a=r(3524);let n=global.__prisma__??new a.PrismaClient({log:["error"]})}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[9379,4833],()=>r(1205));module.exports=a})();