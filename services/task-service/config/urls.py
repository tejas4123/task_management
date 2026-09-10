from django.http import JsonResponse
from django.urls import include, path


def healthz(_request):
    return JsonResponse({"status": "ok", "service": "task-service"})


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("api/v1/", include("tasks.urls")),
]
