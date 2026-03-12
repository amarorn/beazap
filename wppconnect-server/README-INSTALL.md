# Instalação local (npm/yarn) — Puppeteer / Chrome

## Erro `Cannot find module 'once'`

O postinstall do Puppeteer usa `extract-zip` → `pump` → `once`. Se `once` não estiver na árvore, o download do Chrome falha.

**Correção:** o `package.json` inclui `"once": "^1.4.0"`. Depois:

```bash
cd wppconnect-server
rm -rf node_modules
npm install
# ou: yarn install
```

## Pular download do Chrome

Se quiser usar Chrome já instalado no sistema:

```bash
export PUPPETEER_SKIP_DOWNLOAD=true
npm install
```

Depois configure no server o caminho do executável (variável de ambiente ou config conforme wppconnect).

## packageManager

O repositório declara `yarn@4.12.0`. Com npm pode haver diferenças de hoisting; preferir:

```bash
corepack enable
yarn install
```

## Docker

Para não depender de Puppeteer local, use a imagem `wppconnect/server-cli` no `docker-compose.yml` do BeaZap.
