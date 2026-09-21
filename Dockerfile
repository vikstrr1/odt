FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ODT_WORKBOOK_PATH=/data/odt_tracker.xlsm

COPY odt_tracker_app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copy backend application
COPY odt_tracker_app/ ./odt_tracker_app/

# copy frontend build into the backend static directory
RUN mkdir -p ./odt_tracker_app/static/frontend
COPY --from=frontend-builder /app/frontend/dist ./odt_tracker_app/static/frontend

EXPOSE 8080
WORKDIR /app/odt_tracker_app
CMD ["uvicorn", "app:sio_app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "debug"]
