from __future__ import annotations

import base64
import binascii
from email.message import EmailMessage
import smtplib

from fastapi import HTTPException, status

from .config import Settings


def send_league_qr_email(
    *,
    league_name: str,
    qr_png_base64: str,
    qr_value: str,
    recipient_email: str,
    settings: Settings,
) -> None:
    if not settings.smtp_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "QR email delivery is not configured. Set SMTP_HOST and "
                "SMTP_SENDER on the backend."
            ),
        )

    recipient = recipient_email.strip()

    if "@" not in recipient or "." not in recipient.rsplit("@", 1)[-1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recipient email address is invalid.",
        )

    try:
        qr_png = base64.b64decode(qr_png_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QR image payload must be base64-encoded PNG data.",
        ) from error

    message = EmailMessage()
    message["From"] = settings.smtp_sender or ""
    message["To"] = recipient
    message["Subject"] = f"{league_name} LittlePickle QR code"
    message.set_content(
        "\n".join(
            [
                f"{league_name} was successfully created in LittlePickle.",
                "",
                "Your league QR code is attached. You can print it, share it, or save it for players to scan.",
            ]
        )
    )
    message.add_attachment(
        qr_png,
        maintype="image",
        subtype="png",
        filename=f"{_safe_filename(league_name)}-littlepickle-qr.png",
    )

    try:
        with smtplib.SMTP(settings.smtp_host or "", settings.smtp_port, timeout=20) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except OSError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send QR email: {error}",
        ) from error


def _safe_filename(value: str) -> str:
    filename = "".join(character.lower() if character.isalnum() else "-" for character in value)
    filename = "-".join(part for part in filename.split("-") if part)
    return filename[:48] or "league"
