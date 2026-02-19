FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY apps/crm-next/package*.json ./
RUN npm install

COPY apps/crm-next ./
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
