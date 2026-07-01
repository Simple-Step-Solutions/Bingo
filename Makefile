.PHONY: dev build preview lint clean install

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

lint:
	npm run lint

clean:
	npm run clean

install:
	npm ci
