IMAGE   ?= wealthtrack
TAG     ?= latest
PORT    ?= 8080
DATA    ?= $(dir $(PWD))simple-wealth-tracker-data

.PHONY: install dev build docker-build docker-run docker-stop clean

## install: install npm dependencies for server and web
install:
	cd server && npm install
	cd web && npm install

## dev: start server (port 3000) and web dev server (port 5173) concurrently
dev:
	DATA_FILE=$(DATA)/database.yaml \
	DATA_POINTS_FILE=$(DATA)/datapoints.csv \
	LOGS_DIR=$(DATA)/logs \
	PORT=3000 npm --prefix server run dev & \
	npm --prefix web run dev

## build: compile server TypeScript + Vite-build web
build:
	cd server && npm run build
	cd web && npm run build

## docker-build: build the Docker image
docker-build:
	docker build -t $(IMAGE):$(TAG) .

## docker-run: run the Docker image, mounting ./data as /data
docker-run:
	mkdir -p $(DATA)
	docker run -d \
		--name $(IMAGE) \
		-p $(PORT):8080 \
		-v $(DATA):/data \
		$(IMAGE):$(TAG)
	@echo "Running at http://localhost:$(PORT)"

## docker-stop: stop and remove the container
docker-stop:
	docker stop $(IMAGE) && docker rm $(IMAGE)

## clean: remove build artefacts
clean:
	rm -rf server/dist web/dist web/.vite web/tsconfig.tsbuildinfo
