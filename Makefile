.PHONY: db-up db-down db-reset db-migrate db-seed db-studio dev build setup install

db-up:
	docker compose up -d

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d
	sleep 3
	npx prisma migrate dev --name init
	npx prisma db seed

db-migrate:
	npx prisma migrate dev

db-seed:
	npx prisma db seed

db-studio:
	npx prisma studio

dev:
	npm run dev

build:
	npm run build

install:
	npm install

setup: install
	docker compose up -d
	sleep 3
	npx prisma migrate dev --name init
	npx prisma db seed
	@echo ""
	@echo "✅ Goal Planner is ready!"
	@echo "Run 'make dev' to start the app at http://localhost:3000"
	@echo "Demo login: demo@example.com / demo123"
