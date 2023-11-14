//! Contains device-specific routes' handlers and associated data types.

use actix_web::{get, post, web, HttpResponse};

use wasmiot_orchestrator::{
    model::device::Device,
    //orchestrator::OrchestratorApi,
};

use crate::AppState;


#[get("")]
async fn devices(
    device_collection: web::Data<mongodb::Collection<Device>>,
) -> web::Json<Vec<Device>> {
    let mut devices = vec![];
    let mut cursor = device_collection.find(None, None).await.unwrap();
    while cursor.advance().await.unwrap() {
        devices.push(cursor.deserialize_current().unwrap());
    }

    web::Json(devices)
}

#[post("")]
async fn scan(
    data: web::Data<AppState>,
) -> HttpResponse {
    const SERVICE_TYPE: &str = "_webthing._tcp.local.";

    data.orchestrator.lock().unwrap().scan(SERVICE_TYPE.to_owned());
    HttpResponse::Accepted().finish()
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(devices)
        .service(scan);
}
