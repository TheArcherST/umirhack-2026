AEZA DNS Backend.<br>
Stack:
<ul>
    <li>Dishka</li>
    <li>sqlalchemy</li>
    <li>fastapi</li>
    <li>postgresql</li>
    <li>redis</li>
    <li>taskiq</li>
</ul>

Tests:
<ul>
    <li>PING</li>
    <li>DNS</li>
    <li>HTTP/S</li>
    <li>TCP/UDP</li>
    <li>TRACEROUTE</li>
    <li>GEOIP</li>
    <li>NMAP</li>
</ul>

How to deploy (using Makefile shortcuts for docker commands):
1. Ensure you installed docker and make on your host
2. Fill all .env files with provided .env.example templates.
3. Create `nginx/default.conf` from `nginx/default.conf.example`
4. `make up`
5. Open frontend via `http://<COMPOSE__NGINX__HOST>:<COMPOSE__NGINX__PORT>`, backend API via `/api`

API contract workflow:
1. Update backend routes or schemas
2. Run `make openapi`
3. Share or commit `shared/openapi.json` for frontend work

CI/CD deployment workflow:
1. Push to `master`
2. GitHub Actions runs `make test`
3. If tests pass, Actions SSHes to the server and runs `./scripts/deploy.sh <tested-sha>`
4. The server fetches the repository, checks out the exact tested revision, and runs `make up`

Required GitHub Actions secrets:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `DEPLOY_PORT` (optional, defaults to `22`)

Compose layout:
- `compose.yaml` is the root entrypoint and uses `include`
- `compose/infra.yaml` contains infrastructure services
- `compose/backend.yaml` contains backend services and workers
- `compose/web.yaml` contains frontend and nginx

How to connect agent:
1. Ensure you installed docker on your host
2. Create new directory for the deployment
3. Place downloaded from frontend compose.yaml into it
4. `docker compose up -d`
