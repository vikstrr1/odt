# AWS App Runner deployment guide

1. Create an ECR repository:

   aws ecr create-repository --repository-name odt-tracker --region eu-north-1

2. Log in to ECR:

   aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin <aws-account>.dkr.ecr.eu-north-1.amazonaws.com

3. Build and push the image:

   docker build -t odt-tracker .
   docker tag odt-tracker:latest <aws-account>.dkr.ecr.eu-north-1.amazonaws.com/odt-tracker:latest
   docker push <aws-account>.dkr.ecr.eu-north-1.amazonaws.com/odt-tracker:latest

4. Create an App Runner service that points to the image.
5. Add the environment variable `ODT_WORKBOOK_PATH` and mount the workbook file at a reachable path such as `/mnt/data/odt_tracker.xlsm`.
6. Start the service and test the URL.

This is the equivalent AWS deployment pattern for the same containerized web app.
