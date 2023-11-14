//! Contains module-specific routes' handlers and associated data types.

use actix_web::{
    get,
    post,
    web,
    http,
    Responder,
};

use wasmiot_orchestrator::{
    //orchestrator::OrchestratorApi,
    model::module::{Layer, Module},
};

use crate::AppState;


/// Information needed for creating and activating a deployment.
#[derive(serde::Deserialize)]
struct ModuleInfo {
    name: String,
}

/// Information in response to operations performed regarding a module.
#[derive(serde::Serialize)]
enum ModuleOperationInfo {
    /// Unspecified placeholder error.
    Other,
    Creation { name: String },
    LayerAddition,
}

#[get("")]
async fn modules(state: web::Data<AppState>) -> web::Json<Vec<Module>> {
    let orchestrator = state.orchestrator.lock().unwrap();
    web::Json(orchestrator.modules().into_iter().cloned().collect())
}

#[post("")]
async fn module_creation(
    state: web::Data<AppState>,
    module_info: web::Json<ModuleInfo>,
) -> web::Json<Result<ModuleOperationInfo, String>> {
    todo!()
}

#[post("/{name}")]
async fn module_file_upload(
    state: web::Data<AppState>,
    name: web::Path<String>,
    mut payload: actix_multipart::Multipart
) -> web::Json<ModuleOperationInfo> {
    todo!()
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(
            web::scope("/")
                .service(modules)
                .service(module_creation)
                .service(module_file_upload)
        );
}
