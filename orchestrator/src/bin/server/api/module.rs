//! Contains module-specific routes' handlers and associated data types.
//!
//! Different from the other API routes (i.e. device and deployment), modules are decoupled from
//! orchestrator which instead of managing, only uses them in deployments.

use actix_web::{
    get,
    post,
    web,
};

use mongodb::{
    bson::doc,
    sync::Collection,
};

use wasmiot_orchestrator::model::module::Module;


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
async fn modules(module_collection: web::Data<Collection<Module>>) -> web::Json<Vec<Module>> {
    let modules = module_collection.find(None, None);

    web::Json(modules);
    todo!()
}

#[post("")]
async fn module_creation(
    module_collection: web::Data<Collection<Module>>,
    payload: actix_multipart::Multipart
) -> web::Json<ModuleOperationInfo> {
    let ModuleCreation(module_part) = payload.try_into().unwrap();
    let insert_result = module_collection.insert_one(module_part, None).unwrap();

    let insert_response = ModuleOperationInfo::Creation { name: insert_result.inserted_id.to_string() };

    web::Json(insert_response)
}

#[post("/{name}")]
async fn module_description(
    module_collection: web::Data<Collection<Module>>,
    name: web::Path<String>,
    mut payload: actix_multipart::Multipart
) -> web::Json<ModuleOperationInfo> {
    let ModuleDescription(module_part) = payload.try_into().unwrap();
    let upsert_result = module_collection.update_one(
        doc! {},
        Some(name.into_inner()),
        module_part,
    ).unwrap();

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
