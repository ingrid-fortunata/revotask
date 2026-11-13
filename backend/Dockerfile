# Flask API image for local Docker Compose and the Render Docker Web Service (BE01, DB07).
# The Python version matches backend/.python-version. Runtime dependencies come from the exact
# pins in requirements.txt. Secrets and the database URL are supplied at runtime, never copied in.
FROM python:3.14.5-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=5001

WORKDIR /app

RUN groupadd --system revotask \
    && useradd --system --gid revotask --home-dir /app --shell /usr/sbin/nologin revotask

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY migrations ./migrations

USER revotask

EXPOSE 5001

# Render sets PORT at runtime. Compose sets PORT=5001. The shell form expands ${PORT}.
# Access logs stay off because the app already logs one line per request.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS:-2} --error-logfile - 'app:create_app()'"]
