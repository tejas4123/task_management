from datetime import date, timedelta

import pytest

from tasks.models import Task


@pytest.fixture
def make_task(db):
    def _make(
        *,
        status: str = Task.Status.NOT_STARTED,
        assigned_to_id: int | None = 3,
        engagement_id: int = 1,
        template_id: int | None = None,
        due_date: date | None = None,
    ) -> Task:
        _make.counter += 1
        return Task.objects.create(
            engagement_id=engagement_id,
            template_id=template_id or _make.counter,
            title=f"Task {_make.counter}",
            assigned_to_id=assigned_to_id,
            created_by_id=None,
            created_by_type=Task.CreatorType.SYSTEM,
            due_date=due_date or date.today() + timedelta(days=7),
            status=status,
        )

    _make.counter = 0
    return _make
