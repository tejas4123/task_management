from django.http import JsonResponse
from django.urls import include, path


def healthz(_request):
    return JsonResponse({"status": "ok", "service": "engagement-service"})


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("api/v1/", include("clients.urls")),
    path("api/v1/", include("services.urls")),
    path("api/v1/", include("engagements.urls")),
]
