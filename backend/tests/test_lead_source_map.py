"""Unit tests cho utils.lead_source_map.resolve_lead_label."""
from __future__ import annotations

from utils.lead_source_map import resolve_lead_label, resolve_loai_from_lead_source


class TestResolveLeadLabel:
    def test_source_key_and_channel_code_both_mapped(self):
        assert resolve_lead_label("gioi_thieu", "832") == "Giới thiệu · Kênh giới thiệu"
        assert resolve_lead_label("quang_cao", "300265") == "Quảng cáo · FB - VN"
        assert resolve_lead_label("offline", "932") == "Offline · Offline events"

    def test_source_key_only_when_channel_missing(self):
        assert resolve_lead_label("gia_han", None) == "Gia hạn"
        assert resolve_lead_label("kho_chung", "") == "Kho Chung"
        assert resolve_lead_label("khac", None) == "Khác"

    def test_channel_only_when_source_missing(self):
        assert resolve_lead_label(None, "300301") == "Tiktok ads"
        assert resolve_lead_label("", "300391") == "VN KOC"

    def test_fallback_raw_when_unmapped(self):
        # Backward-compat: dữ liệu cũ có thể lưu label sẵn (không phải code)
        assert resolve_lead_label(None, "Facebook") == "Facebook"
        assert resolve_lead_label(None, "Kho chung - Imperia") == "Kho chung - Imperia"
        assert resolve_lead_label("custom_src", "custom_ch") == "custom_src · custom_ch"

    def test_empty_returns_question_mark(self):
        assert resolve_lead_label(None, None) == "?"
        assert resolve_lead_label("", "") == "?"
        assert resolve_lead_label("   ", "   ") == "?"

    def test_source_map_beats_channel_fallback_when_channel_unmapped(self):
        # Có source mapped + channel không mapped → chỉ hiện source label
        assert resolve_lead_label("gioi_thieu", "unknown-999") == "Giới thiệu"

    def test_channel_map_beats_source_fallback_when_source_unmapped(self):
        # Source không mapped + channel mapped → hiện channel label
        assert resolve_lead_label("unknown-src", "832") == "Kênh giới thiệu"


class TestResolveLoaiFromLeadSource:
    """resolve_loai_from_lead_source — map lead_source/channel → loai (vocab Sổ doanh thu/BC02)."""

    def test_source_key_maps_to_report_loai(self):
        assert resolve_loai_from_lead_source("quang_cao", None) == "广告"
        assert resolve_loai_from_lead_source("gioi_thieu", None) == "转介绍"
        assert resolve_loai_from_lead_source("gia_han", None) == "续费"
        assert resolve_loai_from_lead_source("kho_chung", None) == "公海"
        assert resolve_loai_from_lead_source("offline", None) == "Offline"
        assert resolve_loai_from_lead_source("koc", None) == "KOC"
        assert resolve_loai_from_lead_source("khac", None) == "Other"

    def test_channel_fallback_when_source_missing(self):
        # channel "300265" thuộc source quang_cao → loai suy ra từ channel
        assert resolve_loai_from_lead_source(None, "300265") == "广告"
        assert resolve_loai_from_lead_source("", "832") == "转介绍"

    def test_source_beats_channel_when_both_present(self):
        # source đã map được → không cần fallback qua channel
        assert resolve_loai_from_lead_source("gia_han", "300265") == "续费"

    def test_unmapped_returns_empty_string(self):
        # Không đoán bừa — để trống thay vì gán nhầm loai
        assert resolve_loai_from_lead_source(None, None) == ""
        assert resolve_loai_from_lead_source("unknown-src", "unknown-ch") == ""
        assert resolve_loai_from_lead_source("", "") == ""


class TestBuilderIntegrationForLeadSource:
    """Regression: builder now uses resolve_lead_label — verify tin production đúng."""

    def test_builder_shows_mapped_label_for_referral_source(self):
        from utils.zalo_message_builder import build_activation_request_created_message
        result = build_activation_request_created_message(
            {
                "id": "AR-2026-9999",
                "uids_data": [
                    {"uid": "1", "phone": "84-9", "courses": [{"name": "Gói X", "amount": 1_000_000}]}
                ],
            },
            {"lead_source": "gioi_thieu", "lead_channel": "832", "child_name": "Bé Test"},
            {"team": "Inhouse 2", "display_name": "Sale Test"},
        )
        assert "Nguồn: Giới thiệu · Kênh giới thiệu" in result["message"]

    def test_builder_shows_mapped_label_for_ads_source(self):
        from utils.zalo_message_builder import build_activation_request_created_message
        result = build_activation_request_created_message(
            {
                "id": "AR-2026-9998",
                "uids_data": [
                    {"uid": "1", "phone": "84-9", "courses": [{"name": "Gói Y", "amount": 2_000_000}]}
                ],
            },
            {"lead_source": "quang_cao", "lead_channel": "300265"},
            {"team": "Offline"},
        )
        assert "Nguồn: Quảng cáo · FB - VN" in result["message"]

    def test_builder_source_only_when_no_channel(self):
        from utils.zalo_message_builder import build_activation_request_created_message
        result = build_activation_request_created_message(
            {
                "id": "AR-2026-9997",
                "uids_data": [
                    {"uid": "1", "phone": "84-9", "courses": [{"name": "Gói Z", "amount": 500_000}]}
                ],
            },
            {"lead_source": "gia_han", "lead_channel": None},
            {"team": "Inhouse 2"},
        )
        assert "Nguồn: Gia hạn" in result["message"]
