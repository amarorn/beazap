# Imagem Docker (WPPConnect Server)

## Build

Na raiz do `wppconnect-server`:

```bash
docker build -t wppconnect-server-beazap:latest -t wppconnect-server-beazap:2.9.0 .
```

## Run

API na porta **21465**. Ajuste `webhook.url` e `secretKey` no `src/config.ts` **antes** do build, ou use rede Docker e variáveis se o projeto passar a suportar.

```bash
docker run --rm -p 21465:21465 \
  -v wpp-userdata:/usr/src/wpp-server/userDataDir \
  -v wpp-tokens:/usr/src/wpp-server/tokens \
  --name wpp-server \
  wppconnect-server-beazap:latest
```

## Compose

```bash
docker compose up -d --build
```

O `docker-compose.yml` monta tokens e expõe `21465`. Para persistir sessões do Chrome, adicione volume em `userDataDir` (ver exemplo acima).

## Publicar no Docker Hub

1. Crie o repositório em [hub.docker.com](https://hub.docker.com) (ex.: `wppconnect-server-beazap`), se ainda não existir.

2. Login (uma vez por máquina):

```bash
docker login
```

3. **Troque `meudockerhub` pelo seu usuário Docker Hub (sempre em minúsculas).**  
   Não use o texto literal `SEU_USUARIO` — o Docker exige nome de repositório em lowercase.

```bash
cd wppconnect-server
docker compose build
# exemplo: usuário dockerhub = joseamaro  -> joseamaro/wppconnect-server-beazap
docker tag wppconnect-server-beazap:latest meudockerhub/wppconnect-server-beazap:latest
docker tag wppconnect-server-beazap:latest meudockerhub/wppconnect-server-beazap:2.9.0
docker push meudockerhub/wppconnect-server-beazap:latest
docker push meudockerhub/wppconnect-server-beazap:2.9.0
```

4. Em outro host, puxar e subir (mesmo prefixo `meudockerhub/` que você usou no push):

```bash
docker pull meudockerhub/wppconnect-server-beazap:latest
docker run --rm -p 21465:21465 meudockerhub/wppconnect-server-beazap:latest
```

Ou no `docker-compose.yml`, troque `image:` para `meudockerhub/wppconnect-server-beazap:latest`.

**Script:** use **seu login real** do Docker Hub (o que você usa em `docker login`), não `seu_usuario` nem `meudockerhub`:

```bash
docker login
export DOCKERHUB_USER=joseamaro
./scripts/push-dockerhub.sh
```

Se aparecer `denied: requested access to the resource is denied`: login errado, repositório não criado no Hub, ou `DOCKERHUB_USER` ainda é placeholder.

Opcional: `TAG_VERSION=2.9.0` (padrão já é 2.9.0).

## Notas

- Base: `node:22.22.1-alpine` (alinhado ao `engines` do package.json).
- Chromium e vips vêm no estágio runtime.
- O build usa `yarn install` sem `--immutable` para evitar falha quando o lockfile foi gerado em outro ambiente.
