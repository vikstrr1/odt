Cloud SQL Terraform scaffold

This folder contains a minimal Terraform configuration to create a Cloud SQL Postgres instance and a database. It is a scaffold — you must run Terraform with appropriate credentials.

Example usage:

```bash
cd infra/cloudsql
terraform init
terraform plan -var="project=your-gcp-project" -var="region=us-central1"
terraform apply -var="project=your-gcp-project" -var="region=us-central1"
```

After apply, the Terraform output `instance_connection_name` will contain the connection string you should place in the GitHub secret `CLOUD_SQL_INSTANCE` for the CI workflow.
