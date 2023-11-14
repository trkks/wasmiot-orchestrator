//! Description of orchestrator interface in the form of (TODO) the `OrchestratorApi` trait and a
//! basic implementation of it `WasmiotOrchestrator`.

use std::thread;

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

/// Trait to hide a document database or other similar data storage behind a tiny "almost CRUD"
/// interface.
pub trait KeyValueStore<T> : Send {
    fn read(&self, id: Option<&str>) -> Result<Vec<T>, KeyValueStoreError>;
    fn upsert(&self, id: Option<&str>, value: T) -> Result<(), KeyValueStoreError>;
    fn delete(&self, id: Option<&str>) -> Result<(), KeyValueStoreError>;
}

impl<T: Send> KeyValueStore<T> for mongodb::Collection<T> {
    fn read(&self, id: Option<&str>) -> Result<Vec<T>, KeyValueStoreError> {
        todo!()
    }

    fn upsert(&self, id: Option<&str>, value: T) -> Result<(), KeyValueStoreError> {
        todo!()
    }

    fn delete(&self, id: Option<&str>) -> Result<(), KeyValueStoreError> {
        todo!()
    }
}

/// Implementation of Wasm-IoT orchestrator's inner workings.
///
/// This implementation is meant to be run in a corouting, where it begins an endless loop. In the
/// loop different events are polled, resources (computing and data) are checked and deployments
/// are reconfigured. Interacting with the loop happens directly through channels (events) or
/// indirectly with the database (resources).
pub struct WasmiotOrchestrator {
    device_scanner_handle: Option<thread::JoinHandle<()>>,
    devices: Box<dyn KeyValueStore<device::Device>>,
}

impl WasmiotOrchestrator {
    pub fn new(devices: mongodb::Collection<device::Device>) -> Self {
        Self {
            device_scanner_handle: None,
            devices: Box::new(devices),
        }
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

    fn device_scan<Kvs:KeyValueStore<device::Device>>(service_type: &str, device_collection: Kvs) {
        let mdns = mdns_sd::ServiceDaemon::new()
            .expect("failed creating mDNS daemon");

        let receiver = mdns.browse(service_type)
            .expect("failed browsing of mDNS services");

        let mut devices = vec![];
        while let Ok(event) = receiver.recv() {
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    println!("Service resolved: {:?}", info);
                    devices.push(<mdns_sd::ServiceInfo as Into<device::Device>>::into(info));
                },
                other => {
                    println!("Received some other event: {:?}", &other);
                },
            }
        }

        mdns.shutdown().expect("failed at mDNS daemon shutdown");
        
        for device in devices {
            device_collection.upsert(None, device).unwrap();
        }
    }
}

//impl OrchestratorApi for WasmiotOrchestrator {
impl WasmiotOrchestrator {
    //type Supervisor = HttpSupervisor;

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
