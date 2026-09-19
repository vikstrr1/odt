output "artifact_registry_full_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project}/odt-repo/odt"
}

output "service_account_email" {
  value = google_service_account.odt_ci.email
}

output "cloudsql_instance_connection_name" {
  value = google_sql_database_instance.odt_sql.connection_name
}

output "wif_pool_id" {
  value = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
}

output "wif_provider_id" {
  value = google_iam_workload_identity_pool_provider.github_provider.workload_identity_pool_provider_id
}