//! Description of orchestrator daemon and an interface for messaging with it.

use std::sync::mpsc;

use mongodb::Collection;
use tokio::task;

use crate::model::{
    DeploymentName,
    deployment as dep,
    device,
    module,
    PlaceholderError,
};
use crate::supervisor::http_supervisor::HttpSupervisor;



#[derive(Debug)]
pub enum KeyValueStoreError {
    NotFound,
}

pub struct UpsertOk {
    id: String,
}

#[derive(Debug)]
pub enum Event {
    Scan(String),
    Manifest(dep::Manifest),
    Shutdown,
}

/// An interface or ("facade" if you're pretentious) for a user to interact with the orchestrator
/// daemon.
#[derive(Clone)]
pub struct OrchestratorApi {
    event_tx: mpsc::Sender<Event>,
}

impl OrchestratorApi {
    pub fn devices(&self) -> Vec<device::Device> {
        todo!()
    }

    pub fn scan(&self, service_type: &str) {
        let _ = self.event_tx.send(
            Event::Scan(service_type.to_owned())
        );
    }

    pub fn deployments(&self) -> Vec<dep::Deployment> {
        todo!()
    }

    pub fn create_deployment(&self, manifest: dep::Manifest) -> String {
        todo!()
    }

    pub fn update_deployment(&self, id: &str, manifest: dep::Manifest) {
        todo!()
    }

    pub fn shutdown(self) {
         let _ = self.event_tx.send(
            Event::Shutdown
        );
    }
}


/// Implementation of Wasm-IoT orchestrator's inner workings.
///
/// This implementation is meant to be run in a corouting, where it begins an endless loop. In the
/// loop different events are polled, resources (computing and data) are checked and deployments
/// are reconfigured. Interacting with the loop happens directly through channels (events) or
/// indirectly with the database (resources).
pub struct WasmiotOrchestrator;

impl WasmiotOrchestrator {
    pub async fn start(
        devices: Collection<device::Device>,
        deployments: Collection<dep::Deployment>,
    ) -> (task::JoinHandle<()>, OrchestratorApi) {
        let (event_tx, event_rx) = mpsc::channel();
        let daemon_handle = tokio::spawn(
            async move {
                loop {
                    if !Self::orchestrator_loop(
                        &event_rx, &devices, &deployments,
                    ) {
                        break;
                    }
                }
            }
        );
        let api = OrchestratorApi { event_tx };

        (daemon_handle, api)
    }

    fn orchestrator_loop(
        event_queue: &mpsc::Receiver<Event>,
        devices: &Collection<device::Device>,
        deployments: &Collection<dep::Deployment>,
    ) -> bool {
        match event_queue.recv() {
            Err(_) => return false,
            Ok(other_event) => match other_event {
                Event::Scan(st) => log::debug!("Scanning '{}'...", st),
                Event::Manifest(m) => log::debug!("Manifesting {} nodes", m.len()),
                Event::Shutdown => {
                    log::debug!("Shutting down...");
                    return false;
                },
            }
        }
        true
    }

    fn solve(
        &self,
        manifest: &dep::Manifest,
    ) -> Result<dep::DeploymentConfiguration, PlaceholderError> {
        todo!()
    }

    fn deploy(
        &mut self,
        name: &DeploymentName,
        configuration: &dep::DeploymentConfiguration,
    ) -> Result<(), PlaceholderError> {
        todo!()
    }

    async fn device_scan(
        service_type: &str,
        devices: Collection<device::Device>,
    ) -> Result<mongodb::results::InsertManyResult, mongodb::error::Error> {
        let mdns = mdns_sd::ServiceDaemon::new()
            .expect("failed creating mDNS daemon");

        let receiver = mdns.browse(service_type)
            .expect("failed browsing of mDNS services");

        let mut found_devices = vec![];
        while let Ok(event) = receiver.recv() {
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    println!("Service resolved: {:?}", info);
                    found_devices.push(<mdns_sd::ServiceInfo as Into<device::Device>>::into(info));
                },
                other => {
                    println!("Received some other event: {:?}", &other);
                },
            }
        }

        mdns.shutdown().expect("failed at mDNS daemon shutdown");
        
        devices.insert_many(found_devices, None).await
    }
}

impl WasmiotOrchestrator {
    /// Returns a list of modules currently available.
    pub fn modules(&self) -> Vec<&module::Module> {
        todo!()
    }

    /// Updates an existing module if a matching name exists or add a new one.
    pub fn upsert_module(&mut self, module: module::Module) -> Result<(), PlaceholderError> {
        todo!()
    }

    /// Returns a list of devices currently available.
    pub fn devices(&self) -> Vec<&device::Device> {
        todo!()
    }

    /// Start searching for new devices of the specified type.
    pub fn scan(&mut self, service_type: String) -> Result<(), PlaceholderError> {
        todo!()
    }

    /// Returns a list of deployments currently available.
    pub fn deployments(&self) -> Vec<&dep::Deployment> {
        todo!()
    }

    /// Updates an existing deployment if a matching name exists or add a new one.
    pub fn upsert_deployment(
        &mut self,
        name: DeploymentName,
        manifest: dep::Manifest,
    ) -> Result<(), PlaceholderError> {
        todo!()
    }
}
