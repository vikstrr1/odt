variable "project" {
  description = "GCP project id"
  type        = string
  default     = "odt-project-12345"
}

variable "project_number" {
  description = "GCP project number (optional; derived from the project data source when empty)"
  type        = string
  default     = ""
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "europe-west1"
}

variable "wif_pool_id" {
  description = "Workload Identity Pool id"
  type        = string
  default     = "github-actions-pool"
}

variable "wif_provider_id" {
  description = "Workload Identity Provider id"
  type        = string
  default     = "github-provider"
}

variable "github_owner" {
  description = "GitHub owner/org for OIDC attribute mapping"
  type        = string
  default     = "vikstrr1"
}

variable "github_repo" {
  description = "GitHub repository name for OIDC attribute mapping"
  type        = string
  default     = "odt"
}

variable "admin_email" {
  description = "Google account allowed to administer the app (stored in the ADMIN_EMAIL secret)"
  type        = string
  default     = "rasse.vikstrom@gmail.com"
}