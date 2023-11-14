//! Contains module-specific routes' handlers and associated data types.
//!
//! Different from the other API routes (i.e. device and deployment), modules are decoupled from
//! orchestrator which instead of managing, only uses them in deployments.

use actix_web::{
    get,
    post,
    web,
};

use wasmiot_orchestrator::{
    model::module::Module,
    orchestrator::KeyValueStore,
};


/// Information in response to operations performed regarding a module.
#[derive(serde::Serialize)]
enum ModuleOperationInfo {
    /// Unspecified placeholder error.
    Creation { name: String },
    Description,
}

/// Newtype containing part of Module information parsed from creation request.
struct ModuleCreation(Module);

#[derive(Debug)]
enum ModuleCreationError {
    UnsupportedWasm,
}

impl TryFrom<actix_multipart::Multipart> for ModuleCreation {
    type Error = ModuleCreationError;
    fn try_from(value: actix_multipart::Multipart) -> Result<Self, Self::Error> {
        todo!()
    }
}

/// Newtype containing part of Module information parsed from description request.
struct ModuleDescription(Module);

#[derive(Debug)]
enum ModuleDescriptionError {
    MissingFile { path: String },
}

impl TryFrom<actix_multipart::Multipart> for ModuleDescription {
    type Error = ModuleCreationError;
    fn try_from(value: actix_multipart::Multipart) -> Result<Self, Self::Error> {
        todo!()
    }
}

#[get("")]
async fn modules(module_collection: web::Data<mongodb::Collection<Module>>) -> web::Json<Vec<Module>> {
    let modules = module_collection.read(None).unwrap();

    web::Json(modules)
}

#[post("")]
async fn module_creation(
    module_collection: web::Data<mongodb::Collection<Module>>,
    mut payload: actix_multipart::Multipart
) -> web::Json<Result<ModuleOperationInfo, String>> {
    let ModuleCreation(module_part) = payload.try_into().unwrap();
    let insert_result = module_collection.upsert(None, module_part).unwrap();

    let insert_response = ModuleOperationInfo::Creation { name: insert_result.id };

    web::Json(insert_response) 
}

#[post("/{name}")]
async fn module_description(
    module_collection: web::Data<mongodb::Collection<Module>>,
    name: web::Path<String>,
    mut payload: actix_multipart::Multipart
) -> web::Json<ModuleOperationInfo> {
    let ModuleDescription(module_part) = payload.try_into().unwrap();
    let upsert_result = module_collection.upsert(Some(name), module_part).unwrap();

    let upsert_response = ModuleOperationInfo::Description;
    
    web::Json(upsert_response)
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
