terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_sql_database_instance" "postgres" {
  name             = var.instance_name
  database_version = "POSTGRES_15"

  settings {
    tier = var.tier
    backup_configuration { enabled = true }
  }
}

resource "google_sql_database" "odt_db" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
}

output "instance_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}
