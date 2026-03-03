import smtplib
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from app.core.config import settings


def send_qrcode_email(to_email: str, instance_name: str, qrcode_base64: str) -> bool:
    """Sends an email with the QR code image. Returns True if sent successfully."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        return False

    # Strip data URL prefix if present (e.g. "data:image/png;base64,...")
    raw_b64 = qrcode_base64.split(",")[-1].strip().replace(" ", "").replace("\n", "")

    msg = MIMEMultipart("related")
    msg["Subject"] = f"BeaZap — QR Code da instância {instance_name}"
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to_email

    html = f"""
    <html>
    <body style="font-family: sans-serif; color: #333; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #059669;">BeaZap — Conectar instância</h2>
      <p>Escaneie o QR Code abaixo com o <strong>WhatsApp</strong> para conectar a instância
         <strong>{instance_name}</strong>.</p>
      <div style="text-align: center; margin: 24px 0;">
        <img src="cid:qrcode" style="width: 280px; height: 280px; border: 1px solid #e5e7eb; border-radius: 8px;" />
      </div>
      <p style="font-size: 13px; color: #6b7280;">
        O QR expira em cerca de 60 segundos — escaneie imediatamente.
      </p>
      <p style="font-size: 12px; color: #9ca3af;">
        Se a imagem acima não funcionar, baixe o anexo <strong>qrcode.png</strong> e escaneie o arquivo.
      </p>
    </body>
    </html>
    """
    msg.attach(MIMEText(html, "html"))

    img_data = base64.b64decode(raw_b64)
    img_inline = MIMEImage(img_data, _subtype="png")
    img_inline.add_header("Content-ID", "<qrcode>")
    img_inline.add_header("Content-Disposition", "inline")
    msg.attach(img_inline)

    img_attach = MIMEImage(img_data, _subtype="png")
    img_attach.add_header("Content-Disposition", "attachment", filename=f"qrcode-{instance_name}.png")
    msg.attach(img_attach)

    try:
        port = settings.SMTP_PORT
        if port == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, port, timeout=30) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, port, timeout=30) as server:
                server.ehlo()
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        return True
    except Exception as e:
        print(f"[email_service] Erro ao enviar email: {e}")
        return False
