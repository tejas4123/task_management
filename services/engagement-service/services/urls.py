from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .internal_views import InternalTaskTemplateView
from .views import ServiceTypeViewSet, TaskTemplateViewSet

router = DefaultRouter()
router.register("services", ServiceTypeViewSet, basename="service-type")
router.register("templates", TaskTemplateViewSet, basename="task-template")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "internal/services/<int:service_type_id>/templates/",
        InternalTaskTemplateView.as_view(),
        name="internal-task-templates",
    ),
]
