//! Contains the main program that starts a ReSTful HTTP server for interacting with orchestrator.

use std::sync;

use actix_web::{http, middleware, web, App, HttpServer, HttpResponse};

use wasmiot_orchestrator::{
    model,
    orchestrator::WasmiotOrchestrator,
};


mod api;


/// State shared between application instances.
struct AppState {
    orchestrator: sync::Mutex<Box<WasmiotOrchestrator>>,
}

async fn default_handler(req_method: http::Method) -> HttpResponse {
    match req_method {
        http::Method::GET => HttpResponse::NotFound().finish(),
        _                 => HttpResponse::MethodNotAllowed().finish(),
    }
}

fn db_url_from_env() -> String {
    let host = std::env::var("MONGO_HOST").unwrap();
    let port = std::env::var("MONGO_PORT").unwrap();
    let user = std::env::var("MONGO_ROOT_USERNAME").unwrap();
    let pass = std::env::var("MONGO_ROOT_PASSWORD").unwrap();

    return format!(
        "mongodb://{}:{}@{}:{}",
        user, pass, host, port,
    )
}

/// For some time try connecting to database and exit current process if it failes.
async fn try_initialize_database() -> mongodb::Client {
    let mut tries = 0;
    let db_url = db_url_from_env();

    println!("Connecting to database '{db_url}'...");
    loop {
        println!("Try #{tries}");
        if tries > 3 {
            println!("Failed connecting to database");
            std::process::exit(1);
        }

        if let Ok(database_client) = mongodb::Client::with_uri_str(
                &db_url
            )
            .await
        {
            // Test that the client works.
            if let Ok(db_names) = database_client.list_database_names(None, None).await {
                for db_name in db_names {
                    println!("{}", db_name);
                }

                return database_client;
            }
        }

        tries += 1;
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(
        env_logger::Env::new().default_filter_or("info")
    );

    let database_client = try_initialize_database().await;

    // Get handles to all needed collections to fine-tunedly pass them to routes.
    let devices = database_client.database("wasmiot")
            .collection::<model::device::Device>("device");


    let app_state = web::Data::new(AppState {
        orchestrator: sync::Mutex::new(
            Box::new(WasmiotOrchestrator::new(devices.clone()))
        ),
    });

    HttpServer::new(move || {
        App::new()
            // Enable access-logging.
            .wrap(middleware::Logger::default())
            // Give all scopes access to common objects.
            .app_data(app_state.clone())
            // Map orchestrator API to HTTP endpoints.
            .service(
                web::scope("/api")
                    .service(
                        web::scope("/device")
                            .configure(api::device::configure)
                            .app_data(devices.clone())
                    )
                    .service(
                        web::scope("/module")
                            .configure(api::module::configure)
                    )
                    .service(
                        web::scope("/manifest")
                            .configure(api::deployment::configure)
                    )
            )
            .default_service(web::to(default_handler))
    })
    // TODO: Add an environment variable where to set the amount of threads.
    .workers(1)
    .bind(("0.0.0.0", 8000))?
    .run()
    .await
}
