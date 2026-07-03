from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape
import smtplib
from typing import Any

from fastapi import HTTPException, status
import httpx

from .config import Settings


@dataclass(frozen=True, slots=True)
class EmailAttachment:
    content_base64: str
    content_type: str
    filename: str


@dataclass(frozen=True, slots=True)
class OutboundEmail:
    attachments: list[EmailAttachment]
    html_body: str
    subject: str
    text_body: str
    to_email: str


def send_league_qr_email(
    *,
    league_name: str,
    qr_png_base64: str,
    qr_value: str,
    recipient_email: str,
    settings: Settings,
) -> None:
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

    safe_filename = f"{_safe_filename(league_name)}-littlepickle-qr.png"
    email = OutboundEmail(
        attachments=[
            EmailAttachment(
                content_base64=base64.b64encode(qr_png).decode("ascii"),
                content_type="image/png",
                filename=safe_filename,
            )
        ],
        html_body=_league_qr_html_body(league_name=league_name, qr_value=qr_value),
        subject=f"{league_name} LittlePickle QR code",
        text_body=_league_qr_text_body(league_name=league_name, qr_value=qr_value),
        to_email=recipient,
    )

    _send_email(email=email, settings=settings)


def _send_email(*, email: OutboundEmail, settings: Settings) -> None:
    if not settings.email_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Email delivery is not configured. Set SMTP2GO_API_KEY and "
                "EMAIL_FROM, or configure SMTP_HOST and SMTP_SENDER."
            ),
        )

    if settings.smtp2go_configured:
        _send_with_smtp2go(email=email, settings=settings)
        return

    _send_with_smtp(email=email, settings=settings)


def _send_with_smtp2go(*, email: OutboundEmail, settings: Settings) -> None:
    payload = {
        "api_key": settings.smtp2go_api_key,
        "sender": _sender(settings),
        "to": [email.to_email],
        "subject": email.subject,
        "text_body": email.text_body,
        "html_body": email.html_body,
        "attachments": [
            {
                "filename": attachment.filename,
                "fileblob": attachment.content_base64,
                "mimetype": attachment.content_type,
            }
            for attachment in email.attachments
        ],
    }

    try:
        response = httpx.post(settings.smtp2go_api_url, json=payload, timeout=20)
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach SMTP2GO: {error}",
        ) from error

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMTP2GO rejected the email: {_response_detail(response)}",
        )

    body = _safe_json(response)
    failures = body.get("data", {}).get("failures") if isinstance(body, dict) else None

    if failures:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMTP2GO could not send the email: {failures}",
        )


def _send_with_smtp(*, email: OutboundEmail, settings: Settings) -> None:
    message = EmailMessage()
    message["From"] = _sender(settings)
    message["To"] = email.to_email
    message["Subject"] = email.subject
    message.set_content(email.text_body)
    message.add_alternative(email.html_body, subtype="html")

    for attachment in email.attachments:
        content_type, _, subtype = attachment.content_type.partition("/")
        message.add_attachment(
            base64.b64decode(attachment.content_base64),
            maintype=content_type or "application",
            subtype=subtype or "octet-stream",
            filename=attachment.filename,
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
            detail=f"Could not send email: {error}",
        ) from error


def _league_qr_text_body(*, league_name: str, qr_value: str) -> str:
    return "\n".join(
        [
            f"{league_name} was successfully created in LittlePickle.",
            "",
            "Your league QR code is attached. You can print it, share it, or save it for players to scan.",
            "",
            f"League QR value: {qr_value}",
        ]
    )


def _league_qr_html_body(*, league_name: str, qr_value: str) -> str:
    safe_league_name = escape(league_name)
    safe_qr_value = escape(qr_value)
    return f"""\
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #22283A; line-height: 1.5;">
    <h1 style="font-size: 22px;">{safe_league_name} is ready</h1>
    <p>Your league was successfully created in LittlePickle.</p>
    <p>Your league QR code is attached. You can print it, share it, or save it for players to scan.</p>
    <p style="color: #686D7A; font-size: 13px;">QR value: {safe_qr_value}</p>
  </body>
</html>
"""


def _sender(settings: Settings) -> str:
    sender_email = settings.sender_email

    if not settings.email_sender_name.strip():
        return sender_email

    return f"{settings.email_sender_name.strip()} <{sender_email}>"


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {}


def _response_detail(response: httpx.Response) -> str:
    body = _safe_json(response)
    return str(body or response.text)


def _safe_filename(value: str) -> str:
    filename = "".join(character.lower() if character.isalnum() else "-" for character in value)
    filename = "-".join(part for part in filename.split("-") if part)
    return filename[:48] or "league"
