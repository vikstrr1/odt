# ÖDT Tracker Web App

This project turns the Excel workbook `ÖDT Tracker 2025 edition_2.xlsm` into a small web dashboard that mirrors the tracked participant rankings, team standings and per-minute time series.

## Local run

1. Open a terminal in this folder.
2. Create a virtual environment and install deps:

   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

3. Start the app:

   uvicorn app:app --host 0.0.0.0 --port 8080

4. Open:

   http://localhost:8080

5. If the workbook is not in the default path, point it to the file:

   export ODT_WORKBOOK_PATH="/Users/rasmusvikstrom/Desktop/ÖDT Tracker 2025 edition_2.xlsm"

## Docker

Build and run:

   docker build -t odt-tracker .
   docker run --rm -p 8080:8080 -e ODT_WORKBOOK_PATH=/data/odt_tracker.xlsm -v /Users/rasmusvikstrom/Desktop:/data:ro odt-tracker

## GCP Cloud Run deployment

1. Authenticate:

   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID

2. Build the container:

   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/odt-tracker .

3. Deploy:

   gcloud run deploy odt-tracker --image gcr.io/YOUR_PROJECT_ID/odt-tracker --platform managed --region europe-north1 --allow-unauthorized --memory 512Mi --cpu 1

4. Mount the workbook file into a Cloud Storage bucket or a mounted volume, then set:

   ODT_WORKBOOK_PATH=/mnt/data/ÖDT\ Tracker\ 2025\ edition_2.xlsm

## AWS deployment

For AWS, the same Docker image can run in:

- Elastic Container Registry + ECS / Fargate
- App Runner
- Elastic Beanstalk

Example App Runner deployment:

   aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin <aws-account>.dkr.ecr.eu-north-1.amazonaws.com
   docker build -t odt-tracker .
   docker tag odt-tracker:latest <aws-account>.dkr.ecr.eu-north-1.amazonaws.com/odt-tracker:latest
   docker push <aws-account>.dkr.ecr.eu-north-1.amazonaws.com/odt-tracker:latest

Then create a service in App Runner or ECS and set the `ODT_WORKBOOK_PATH` environment variable to the mounted workbook path.

## Database configuration

By default the app uses SQLite at `data/odt_tracker.db` for local development.

For deployment, set a PostgreSQL connection string before starting the app:

   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/odt_tracker"

The app will automatically use PostgreSQL when `DATABASE_URL` is set, and fall back to SQLite otherwise.

This is the right setup for Cloud Run / App Runner / ECS deployments where the filesystem is not persistent.

## Notes

- The application reads the source workbook dynamically, so the calculations stay tied to the original Excel file.
- If the workbook is unavailable at runtime, the app still loads, but the dashboard will display a missing-workbook status instead of tracker data.
