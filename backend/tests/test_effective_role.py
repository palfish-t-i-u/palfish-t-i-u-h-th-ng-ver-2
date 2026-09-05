from rbac import _effective_role


def test_sale_unchanged():
    assert _effective_role("sale", "sale", False) == "sale"


def test_staff_promotes_leader():
    assert _effective_role("sale", "leader", False) == "leader"


def test_staff_promotes_manager():
    assert _effective_role("sale", "manager", False) == "manager"


def test_staff_cannot_downgrade_system():
    # Sự cố 5/9: kế toán auth=system nhưng staff role=sale
    assert _effective_role("system", "sale", False) == "system"


def test_env_admin_is_floor():
    assert _effective_role("sale", "sale", True) == "system"


def test_no_staff_role_uses_auth():
    assert _effective_role("system", None, False) == "system"
