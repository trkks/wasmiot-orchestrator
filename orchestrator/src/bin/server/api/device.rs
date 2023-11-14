//! Contains device-specific routes' handlers and associated data types.

use actix_web::{get, post, web, HttpResponse};

use wasmiot_orchestrator::{
    model::device::Device,
    orchestrator::OrchestratorApi,
};


#[get("")]
async fn devices(
    orch: web::Data<OrchestratorApi>,
) -> web::Json<Vec<Device>> {
    let devices = orch.devices();

    web::Json(devices)
}

#[post("")]
async fn scan(
    orch: web::Data<OrchestratorApi>,
) -> HttpResponse {
    const SERVICE_TYPE: &str = "_webthing._tcp.local.";
    orch.scan(SERVICE_TYPE);

    HttpResponse::Accepted().finish()
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(devices)
        .service(scan);
}
