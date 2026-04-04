.PHONY: alembic artifacts run-migrations generate-migrations up openapi lint-python format-python install-hooks deploy test update logs down

# related with migrations
alembic:
	docker compose run --rm --build tool-alembic $(command)
artifacts:
	docker compose --profile tools run --rm --build -e ARTIFACTS_ARGS='$(if $(version),--version $(version) ,)$(if $(args),$(args),--container-only)' tool-artifacts
run-migrations:
	make alembic command="upgrade head"
generate-migrations:
	make alembic command="revision -m '$(m) $(msg) $(message)' --autogenerate"

# related with end-user workflow
up:
	docker compose up --build -d && make run-migrations && docker compose restart nginx
openapi:
	mkdir -p shared
	cd python && UV_CACHE_DIR=/tmp/uv-cache uv run python -m hack_backend.rest_server.main.export_openapi ../shared/openapi.json
lint-python:
	python/.venv/bin/ruff check python/src
format-python:
	./scripts/run-ruff-python.sh
install-hooks:
	chmod +x .githooks/pre-commit scripts/run-ruff-python.sh
	git config core.hooksPath .githooks
deploy:
	./scripts/deploy.sh $(rev)
test:
	./scripts/run-compose-tests.sh $(args)
update:
	git pull && make up && make test
logs:
	docker compose logs -f
down:
	docker compose down
sync-artifacts:
	cd artifacts/rust/hack-agent && rsync -a . v:~/umirhack-2026/artifacts/rust/hack-agent
