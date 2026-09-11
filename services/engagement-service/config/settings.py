"""Django settings for the Engagement Service.

Owns clients, service types, task templates and engagements. Publishes
``ENGAGEMENT_CREATED`` to Redis for the Worker Service to consume.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-django-secret")
DEBUG = _env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "").split(",")

INSTALLED_APPS = [
    # No django.contrib.auth / contenttypes / admin: this service owns no users
    # and no user tables are ever created in its database.
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "clients",
    "services",
    "engagements",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "common.logging.RequestIdMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("ENGAGEMENT_DB_NAME","engagement_db"),
        "USER": os.getenv("POSTGRES_USER", "task_admin"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "task_password"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "common.authentication.ServiceJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "EXCEPTION_HANDLER": "common.exceptions.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# Tokens are minted by the Auth Service and verified here with the shared key.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "development-secret")
JWT_ALGORITHM = "HS256"

INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "development-internal-token")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
CELERY_BROKER_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"

CORS_ALLOW_ALL_ORIGINS = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": (
                "%(asctime)s %(levelname)s [engagement-service] "
                "request_id=%(request_id)s %(name)s %(message)s"
            ),
        },
    },
    "filters": {
        "request_id": {"()": "common.logging.RequestIdFilter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
