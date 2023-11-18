//! Contains deployment-specific routes' handlers and associated data types.

use actix_web::{get, post, web, HttpResponse};

use wasmiot_orchestrator::{
    model::deployment::{Deployment, Manifest},
    orchestrator::OrchestratorApi,
};


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

impl From<DeploymentCreationInfo> for Manifest {
    fn from(value: DeploymentCreationInfo) -> Self {
        todo!()
    }
}

#[get("")]
async fn deployments(orch: web::Data<OrchestratorApi>) -> web::Json<Vec<Deployment>> {
    let deployments = orch.deployments();

    web::Json(deployments)
}

#[post("/{deployment_id}")]
async fn deployment_creation(
    orch: web::Data<OrchestratorApi>,
    deployment_id: web::Path<Option<String>>,
    manifest: web::Json<DeploymentCreationInfo>,
) -> web::Either<String, HttpResponse> {
    let manifest = manifest.into_inner().into();
    if let Some(id) = deployment_id.into_inner() {
        orch.update_deployment(&id, manifest);
        return web::Either::Right(HttpResponse::Accepted().finish());
    } else {
        let id = orch.create_deployment(manifest);
        return web::Either::Left(id);
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(
            web::scope("/")
                .service(deployments)
                .service(deployment_creation)
        );
}
