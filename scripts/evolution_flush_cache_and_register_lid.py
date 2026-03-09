#!/usr/bin/env python3
"""
Limpa o cache Redis da Evolution e registra o JID LID no Postgres (IsOnWhatsapp).
Execute quando o envio para contato LID continuar falhando apos reiniciar o container.

Uso: python3 scripts/evolution_flush_cache_and_register_lid.py "56337169940573@lid"
"""
import argparse
import os
import sys
import uuid
from datetime import datetime, timezone

def flush_redis(host="localhost", port=6381, db=1):
    try:
        import redis
    except ImportError:
        print("Redis: pip install redis (opcional)", file=sys.stderr)
        return False
    try:
        r = redis.Redis(host=host, port=port, db=db, decode_responses=True)
        keys = r.keys("evolution*")
        if keys:
            r.delete(*keys)
            print(f"Redis: removidos {len(keys)} chaves evolution*")
        else:
            print("Redis: nenhuma chave evolution* encontrada")
        return True
    except Exception as e:
        print(f"Redis: {e}", file=sys.stderr)
        return False

def register_lid(jid, host, port, user, password, dbname):
    try:
        import psycopg2
    except ImportError:
        print("Postgres: pip install psycopg2-binary", file=sys.stderr)
        return False
    base = jid.split("@")[0]
    jid_options = f"{base},{jid}"
    now = datetime.now(timezone.utc)
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
        cur = conn.cursor()
        cur.execute('SELECT id FROM "IsOnWhatsapp" WHERE "remoteJid" = %s', (jid,))
        row = cur.fetchone()
        if row:
            cur.execute(
                'UPDATE "IsOnWhatsapp" SET "jidOptions" = %s, "updatedAt" = %s WHERE "remoteJid" = %s',
                (jid_options, now, jid),
            )
            print(f"Postgres: cache atualizado para {jid}")
        else:
            uid = "lid_" + uuid.uuid4().hex[:20]
            cur.execute(
                """INSERT INTO "IsOnWhatsapp" (id, "remoteJid", "jidOptions", "createdAt", "updatedAt")
                   VALUES (%s, %s, %s, %s, %s)""",
                (uid, jid, jid_options, now, now),
            )
            print(f"Postgres: inserido cache para {jid}")
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Postgres: {e}", file=sys.stderr)
        return False

def main():
    ap = argparse.ArgumentParser(description="Flush Redis Evolution + registrar LID no cache")
    ap.add_argument("jid", help="JID completo, ex: 56337169940573@lid")
    ap.add_argument("--redis-port", type=int, default=int(os.environ.get("REDIS_PORT", "6381")))
    ap.add_argument("--db-host", default=os.environ.get("EVOLUTION_DB_HOST", "localhost"))
    ap.add_argument("--db-port", type=int, default=int(os.environ.get("EVOLUTION_DB_PORT", "5434")))
    ap.add_argument("--db-user", default=os.environ.get("EVOLUTION_DB_USER", "evolution"))
    ap.add_argument("--db-password", default=os.environ.get("EVOLUTION_DB_PASSWORD", "evolution123"))
    ap.add_argument("--db-name", default=os.environ.get("EVOLUTION_DB_NAME", "evolution"))
    ap.add_argument("--no-redis", action="store_true", help="Nao limpar Redis")
    args = ap.parse_args()

    jid = args.jid.strip()
    if not jid or "@" not in jid:
        print("Forneca um JID completo, ex: 56337169940573@lid", file=sys.stderr)
        sys.exit(1)

    if not args.no_redis:
        flush_redis(port=args.redis_port)
    ok = register_lid(jid, args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    if not ok:
        sys.exit(1)
    print("Pronto. Reinicie o container: docker compose up -d evolution   Depois tente enviar de novo.")


if __name__ == "__main__":
    main()
