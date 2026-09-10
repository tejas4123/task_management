from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .internal_views import BulkTaskCreationView
from .views import TaskViewSet

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "internal/tasks/bulk-create/",
        BulkTaskCreationView.as_view(),
        name="internal-task-bulk-create",
    ),
]
