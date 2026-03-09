#!/usr/bin/env python3
"""
Registra um JID LID no cache IsOnWhatsapp da Evolution API para permitir envio.
Use quando um contato for identificado por LID (ex: 56337169940573@lid) e o
envio falhar com 'O WhatsApp não conseguiu localizar este contato'.

Requer DATABASE_SAVE_DATA_IS_ON_WHATSAPP=true no container da Evolution.
Conexão: mesmo Postgres do docker-compose, DB evolution (porta 5434).
"""
import argparse
import os
import sys
import uuid
from datetime import datetime, timezone

try:
    import psycopg2
except ImportError:
    print("Instale: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description="Registra JID LID no cache Evolution IsOnWhatsapp")
    ap.add_argument("jid", help="JID completo, ex: 56337169940573@lid")
    ap.add_argument(
        "--host", default=os.environ.get("EVOLUTION_DB_HOST", "localhost"),
        help="Host do Postgres (Evolution)",
    )
    ap.add_argument("--port", type=int, default=int(os.environ.get("EVOLUTION_DB_PORT", "5434")))
    ap.add_argument("--user", default=os.environ.get("EVOLUTION_DB_USER", "evolution"))
    ap.add_argument("--password", default=os.environ.get("EVOLUTION_DB_PASSWORD", "evolution123"))
    ap.add_argument("--db", default=os.environ.get("EVOLUTION_DB_NAME", "evolution"))
    args = ap.parse_args()

    jid = args.jid.strip()
    if not jid or "@" not in jid:
        print("Forneça um JID completo, ex: 56337169940573@lid", file=sys.stderr)
        sys.exit(1)

    base = jid.split("@")[0]
    jid_options = f"{base},{jid}"

    conn = psycopg2.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        dbname=args.db,
    )
    cur = conn.cursor()
    try:
        cur.execute(
            'SELECT id FROM "IsOnWhatsapp" WHERE "remoteJid" = %s',
            (jid,),
        )
        row = cur.fetchone()
        now = datetime.now(timezone.utc)
        if row:
            cur.execute(
                'UPDATE "IsOnWhatsapp" SET "jidOptions" = %s, "updatedAt" = %s WHERE "remoteJid" = %s',
                (jid_options, now, jid),
            )
            conn.commit()
            print(f"Atualizado cache para {jid}")
        else:
            uid = "lid_" + uuid.uuid4().hex[:20]
            cur.execute(
                """INSERT INTO "IsOnWhatsapp" (id, "remoteJid", "jidOptions", "createdAt", "updatedAt")
                   VALUES (%s, %s, %s, %s, %s)""",
                (uid, jid, jid_options, now, now),
            )
            conn.commit()
            print(f"Inserido cache para {jid}. Reinicie o container evolution se já estiver rodando.")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
