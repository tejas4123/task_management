from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .internal_views import (
    InternalEngagementDetailView,
    InternalGenerateNextPeriodView,
)
from .views import EngagementViewSet

router = DefaultRouter()
router.register("engagements", EngagementViewSet, basename="engagement")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "internal/engagements/<int:engagement_id>/",
        InternalEngagementDetailView.as_view(),
        name="internal-engagement-detail",
    ),
    path(
        "internal/engagements/<int:engagement_id>/next-period/",
        InternalGenerateNextPeriodView.as_view(),
        name="internal-engagement-next-period",
    ),
]
