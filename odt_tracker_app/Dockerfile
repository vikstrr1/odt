FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ODT_WORKBOOK_PATH=/data/odt_tracker.xlsm

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

# Use the combined Socket.IO + FastAPI ASGI app
CMD ["uvicorn", "app:sio_app", "--host", "0.0.0.0", "--port", "8080"]
