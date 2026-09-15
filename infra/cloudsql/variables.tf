variable "project" {
  type = string
}

variable "region" {
  type = string
  default = "us-central1"
}

variable "instance_name" {
  type = string
  default = "odt-postgres"
}

variable "database_name" {
  type = string
  default = "odt"
}

variable "tier" {
  type = string
  default = "db-f1-micro"
}
