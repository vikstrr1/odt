terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

data "google_project" "project" {
  project_id = var.project
}

locals {
  project_number = var.project_number != "" ? var.project_number : data.google_project.project.number
}

# ---- Enable required GCP APIs ----
resource "google_project_service" "artifact_registry" {
  project = var.project
  service = "artifactregistry.googleapis.com"
}

resource "google_project_service" "cloud_sql" {
  project = var.project
  service = "sqladmin.googleapis.com"
}

resource "google_project_service" "secret_manager" {
  project = var.project
  service = "secretmanager.googleapis.com"
}

resource "google_project_service" "cloud_run" {
  project = var.project
  service = "run.googleapis.com"
}

resource "google_project_service" "iam" {
  project = var.project
  service = "iam.googleapis.com"
}

resource "google_project_service" "iamcredentials" {
  project = var.project
  service = "iamcredentials.googleapis.com"
}

# ---- Artifact Registry ----
resource "google_artifact_registry_repository" "odt_repo" {
  location      = var.region
  repository_id = "odt-repo"
  description   = "Docker repo for odt"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

# ---- CI service account ----
resource "google_service_account" "odt_ci" {
  account_id   = "odt-ci"
  display_name = "ODT CI Service Account"
}

resource "google_project_iam_member" "odt_ci_run_admin" {
  project = var.project
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.odt_ci.email}"
}

resource "google_project_iam_member" "odt_ci_artifact_writer" {
  project = var.project
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.odt_ci.email}"
}

resource "google_project_iam_member" "odt_ci_cloudsql_client" {
  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.odt_ci.email}"
}

resource "google_project_iam_member" "odt_ci_secret_accessor" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.odt_ci.email}"
}

# ---- Workload Identity Pool + Provider for GitHub Actions OIDC ----
resource "google_iam_workload_identity_pool" "github_pool" {
  project                   = var.project
  workload_identity_pool_id = var.wif_pool_id
  display_name              = "GitHub Actions pool"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  project                           = var.project
  workload_identity_pool_id         = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = var.wif_provider_id
  display_name                      = "GitHub Actions OIDC"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "assertion.repository_owner == '${var.github_owner}'"
}

resource "google_service_account_iam_member" "allow_wif_impersonate" {
  service_account_id = google_service_account.odt_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/${var.wif_pool_id}/attribute.repository/${var.github_owner}/${var.github_repo}"
}

# ---- Cloud SQL Postgres (development-sized) ----
resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "google_sql_database_instance" "odt_sql" {
  name             = "odt-sql"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro"
    backup_configuration {
      enabled = true
    }
  }

  deletion_protection = false

  depends_on = [google_project_service.cloud_sql]
}

resource "google_sql_database" "odt_db" {
  name     = "odt_tracker"
  instance = google_sql_database_instance.odt_sql.name
}

resource "google_sql_user" "odt_user" {
  name     = "odt_admin"
  instance = google_sql_database_instance.odt_sql.name
  password = random_password.db_password.result
}

# ---- Secret Manager ----
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "JWT_SECRET"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "admin_email" {
  secret_id = "ADMIN_EMAIL"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url_v1" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://odt_admin:${urlencode(random_password.db_password.result)}@/odt_tracker?host=/cloudsql/${google_sql_database_instance.odt_sql.connection_name}"
}

resource "google_secret_manager_secret_version" "jwt_secret_v1" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "google_secret_manager_secret_version" "admin_email_v1" {
  secret      = google_secret_manager_secret.admin_email.id
  secret_data = var.admin_email
}