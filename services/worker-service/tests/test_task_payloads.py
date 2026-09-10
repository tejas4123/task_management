from datetime import date

from app.tasks import build_task_payloads

TEMPLATES = [
    {"id": 1, "title": "Collect registers", "description": "", "default_due_days": 3},
    {"id": 2, "title": "File GSTR-3B", "description": "Compute liability", "default_due_days": 15},
]


def test_due_dates_are_anchored_to_the_period_not_to_today():
    payloads = build_task_payloads(TEMPLATES, date(2026, 9, 1))

    assert [p["due_date"] for p in payloads] == ["2026-09-04", "2026-09-16"]


def test_template_id_is_carried_through_for_idempotency():
    payloads = build_task_payloads(TEMPLATES, date(2026, 9, 1))

    # (engagement_id, template_id) is the uniqueness key on the Task Service.
    assert [p["template_id"] for p in payloads] == [1, 2]


def test_missing_description_becomes_an_empty_string():
    payloads = build_task_payloads(
        [{"id": 9, "title": "Ad-hoc", "default_due_days": 1}], date(2026, 9, 1)
    )

    assert payloads[0]["description"] == ""
