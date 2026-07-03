import pytest
import httpx
from unittest.mock import MagicMock
from zalo_notifier import (
    _fetch_image_bytes,
    _upload_image,
    send_image_to_group,
    ZaloAPIError,
)

class FakeResponse:
    def __init__(self, content=b"", status_code=200, headers=None, text="", json_data=None):
        self.content = content
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text
        self._json = json_data
    
    def json(self):
        if self._json is not None:
            return self._json
        raise ValueError("No JSON")
        
    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("Error", request=MagicMock(), response=self)


def test_fetch_image_bytes_success(monkeypatch):
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url):
            return FakeResponse(
                content=b"fake-image",
                headers={"content-disposition": "attachment; filename=\"test.jpg\""}
            )
            
    monkeypatch.setattr(httpx, "Client", FakeClient)
    
    content, filename = _fetch_image_bytes("http://example.com/image")
    assert content == b"fake-image"
    assert filename == "test.jpg"

def test_fetch_image_bytes_404_raises(monkeypatch):
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url):
            return FakeResponse(status_code=404)
            
    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(ZaloAPIError):
        _fetch_image_bytes("http://example.com/image")


def test_upload_image_success(monkeypatch):
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, files=None, headers=None):
            return FakeResponse(json_data={"error": 0, "data": {"attachment_id": "abc1234"}})
            
    monkeypatch.setattr(httpx, "Client", FakeClient)
    
    attachment_id = _upload_image(b"fake", "test.jpg", "token")
    assert attachment_id == "abc1234"

def test_upload_image_zalo_error(monkeypatch):
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, files=None, headers=None):
            return FakeResponse(json_data={"error": -201, "message": "Invalid token"})
            
    monkeypatch.setattr(httpx, "Client", FakeClient)
    
    with pytest.raises(ZaloAPIError):
        _upload_image(b"fake", "test.jpg", "token")


def test_send_image_to_group_happy_path(monkeypatch):
    # Mock credentials
    import zalo_notifier
    from datetime import datetime, timedelta, timezone
    
    creds = zalo_notifier.ZaloCredentials("app", "sec", "token", "refresh", datetime.now(timezone.utc) + timedelta(days=1))
    monkeypatch.setattr(zalo_notifier, "_read_credentials", lambda sb: creds)
    
    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url):
            return FakeResponse(content=b"img")
        def post(self, url, **kwargs):
            if "upload" in url:
                return FakeResponse(json_data={"error": 0, "data": {"attachment_id": "att1"}})
            else:
                return FakeResponse(json_data={"error": 0, "data": {"message_id": "msg1"}})
                
    monkeypatch.setattr(httpx, "Client", FakeClient)
    
    msg_id = send_image_to_group("grp", "http://img")
    assert msg_id == "msg1"
