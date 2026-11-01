# SmartKitchen - Kien truc Microservices

## Cau truc
- apps/web        : Next.js frontend
- apps/gateway     : API Gateway (dinh tuyen /api/<module> toi tung service)
- services/*       : Moi module la 1 service backend rieng, database rieng
- packages/shared  : Type/constant dung chung

## Chay tung service khi dev (khong dung Docker)
Vi du chay auth-service:
  cd services/auth-service
  copy .env.example .env
  npm install
  npm run prisma:migrate
  npm run dev

Lam tuong tu cho tat ca service con lai, moi service 1 terminal rieng.

Chay gateway:
  cd apps/gateway
  copy .env.example .env
  npm install
  npm run dev

Chay frontend:
  cd apps/web
  npm install
  npm run dev

## Chay toan bo bang Docker Compose (khuyen nghi khi da on dinh)
  docker compose up --build
