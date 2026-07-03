from fastapi import HTTPException

from app.config import Settings
import app.email_delivery as email_delivery
from app.email_delivery import send_league_qr_email


def test_league_qr_email_uses_smtp2go_api(monkeypatch):
    requests: list[dict] = []

    def fake_post(url, json, timeout):
        requests.append({"json": json, "timeout": timeout, "url": url})
        return FakeResponse({"data": {"succeeded": 1, "failed": 0, "failures": []}})

    monkeypatch.setattr(email_delivery.httpx, "post", fake_post)

    send_league_qr_email(
        league_name="Rose Park",
        qr_png_base64="cG5n",
        qr_value="littlepickle://league/rose-park",
        recipient_email="admin@example.com",
        settings=Settings(SMTP2GO_API_KEY="smtp2go-key"),
    )

    assert requests == [
        {
            "url": "https://api.smtp2go.com/v3/email/send",
            "timeout": 20,
            "json": {
                "api_key": "smtp2go-key",
                "sender": "LittlePickle <support@joinlittlepickle.com>",
                "to": ["admin@example.com"],
                "subject": "Rose Park LittlePickle QR code",
                "text_body": (
                    "Rose Park was successfully created in LittlePickle.\n"
                    "\n"
                    "Your league QR code is attached. You can print it, share it, or save it for players to scan.\n"
                    "\n"
                    "League QR value: littlepickle://league/rose-park"
                ),
                "html_body": (
                    "<!doctype html>\n"
                    "<html>\n"
                    "  <body style=\"font-family: Arial, sans-serif; color: #22283A; line-height: 1.5;\">\n"
                    "    <h1 style=\"font-size: 22px;\">Rose Park is ready</h1>\n"
                    "    <p>Your league was successfully created in LittlePickle.</p>\n"
                    "    <p>Your league QR code is attached. You can print it, share it, or save it for players to scan.</p>\n"
                    "    <p style=\"color: #686D7A; font-size: 13px;\">QR value: littlepickle://league/rose-park</p>\n"
                    "  </body>\n"
                    "</html>\n"
                ),
                "attachments": [
                    {
                        "filename": "rose-park-littlepickle-qr.png",
                        "fileblob": "cG5n",
                        "mimetype": "image/png",
                    }
                ],
            },
        }
    ]


def test_league_qr_email_requires_email_provider():
    try:
        send_league_qr_email(
            league_name="Rose Park",
            qr_png_base64="cG5n",
            qr_value="littlepickle://league/rose-park",
            recipient_email="admin@example.com",
            settings=Settings(),
        )
    except HTTPException as error:
        assert error.status_code == 503
        assert "Email delivery is not configured" in str(error.detail)
    else:
        raise AssertionError("expected HTTPException")


def test_league_qr_email_validates_base64_payload():
    try:
        send_league_qr_email(
            league_name="Rose Park",
            qr_png_base64="not base64",
            qr_value="littlepickle://league/rose-park",
            recipient_email="admin@example.com",
            settings=Settings(SMTP2GO_API_KEY="smtp2go-key"),
        )
    except HTTPException as error:
        assert error.status_code == 400
        assert "base64" in str(error.detail)
    else:
        raise AssertionError("expected HTTPException")


def test_league_qr_email_surfaces_smtp2go_failures(monkeypatch):
    def fake_post(url, json, timeout):
        return FakeResponse(
            {"data": {"succeeded": 0, "failed": 1, "failures": ["recipient rejected"]}},
        )

    monkeypatch.setattr(email_delivery.httpx, "post", fake_post)

    try:
        send_league_qr_email(
            league_name="Rose Park",
            qr_png_base64="cG5n",
            qr_value="littlepickle://league/rose-park",
            recipient_email="admin@example.com",
            settings=Settings(SMTP2GO_API_KEY="smtp2go-key"),
        )
    except HTTPException as error:
        assert error.status_code == 502
        assert "recipient rejected" in str(error.detail)
    else:
        raise AssertionError("expected HTTPException")


class FakeResponse:
    def __init__(self, body, status_code=200):
        self._body = body
        self.status_code = status_code
        self.text = str(body)

    def json(self):
        return self._body
