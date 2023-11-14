//! Contains deployment-specific routes' handlers and associated data types.

use actix_web::{get, post, web};

use wasmiot_orchestrator::model::deployment::Deployment;

use crate::AppState;


/// Information needed for creating a single node of a manifest.
#[derive(serde::Deserialize)]
struct ManifestNodeInfo {
    device: Option<String>,
    module: String,
    function: String,
}

/// Information needed for creating a manifest for a deployment.
type ManifestInfo = Vec<ManifestNodeInfo>;

/// Information needed for creating and activating a deployment.
#[derive(serde::Deserialize)]
struct DeploymentCreationInfo {
    name: String,
    manifest: ManifestInfo,
}

#[get("")]
async fn deployments(state: web::Data<AppState>) -> web::Json<Vec<Deployment>> {
    todo!()
}

#[post("")]
async fn deployment_creation(
    state: web::Data<AppState>,
    deployment_info: web::Json<DeploymentCreationInfo>,
) -> String {
    todo!()
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(
            web::scope("/")
                .service(deployments)
                .service(deployment_creation)
        );
}
