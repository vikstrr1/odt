# GCP Cloud Run deployment guide

1. Ensure Docker and the Google Cloud CLI are installed.
2. Authenticate and select the project:

   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID

3. Build and push the image:

   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/odt-tracker .

4. Deploy the service:

   gcloud run deploy odt-tracker \
     --image gcr.io/YOUR_PROJECT_ID/odt-tracker \
     --platform managed \
     --region europe-north1 \
     --allow-unauthorized \
     --memory 512Mi \
     --cpu 1

5. If the workbook sits in Cloud Storage, copy it to a mounted volume or expose it via a file share and set `ODT_WORKBOOK_PATH`.
6. Validate the app by visiting the generated Cloud Run URL.
