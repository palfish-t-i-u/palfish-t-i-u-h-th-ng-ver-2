"""Singleton Supabase client — per-request client creation leaked ~150MB/h
under load and OOM'd the 512MB Render instance (2026-07-09)."""


def _reset(main):
    main._sb_instance = None


def test_supabase_returns_same_instance(monkeypatch):
    import main
    import supabase

    _reset(main)
    calls = {"n": 0}
    sentinel = object()

    def fake_create(url, key):
        calls["n"] += 1
        return sentinel

    # raising=False: the repo has a supabase/ directory that shadows the Python
    # package on sys.path in tests, so create_client may not exist on the module yet.
    monkeypatch.setattr(supabase, "create_client", fake_create, raising=False)

    a = main._supabase()
    b = main._supabase()

    assert a is sentinel and b is sentinel
    assert calls["n"] == 1
    _reset(main)


def test_supabase_missing_env_returns_none_and_does_not_cache(monkeypatch):
    import main

    _reset(main)
    monkeypatch.setenv("SUPABASE_URL", "")

    assert main._supabase() is None
    assert main._sb_instance is None
    _reset(main)


def test_supabase_lock_exists():
    """Verify the module-level lock object exists. Structural guard only —
    does not verify the lock is actually acquired during init."""
    import main
    import threading

    assert isinstance(main._sb_lock, type(threading.Lock()))
