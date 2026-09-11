FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000

# The Task Service serves HTTP only - entrypoint.sh migrates and then execs
# gunicorn. Celery belongs to worker-service and must never run here.
ENTRYPOINT ["./entrypoint.sh"]
