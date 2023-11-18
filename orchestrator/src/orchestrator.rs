//! Description of orchestrator interface in the form of (TODO) the `OrchestratorApi` trait and a
//! basic implementation of it `WasmiotOrchestrator`.

use std::sync::mpsc;
use std::thread;

use mongodb::sync::Collection;

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
    Manifest(dep::Manifest),
}

/// An interface or ("facade" if you're pretentious) for a user to interact with the orchestrator
/// daemon.
pub struct OrchestratorApi {
    event_tx: mpsc::Sender<Event>,
}

impl OrchestratorApi {
    pub fn push_event(&self, event: Event) -> Result<(), mpsc::SendError<Event>> {
        self.event_tx.send(event)
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
    devices: Collection<device::Device>,
}

impl WasmiotOrchestrator {
    pub fn start(
        devices: Collection<device::Device>,
        deployments: Collection<dep::Deployment>,
    ) -> (thread::JoinHandle<Self>, OrchestratorApi) {
        let (event_tx, event_rx) = mpsc::channel();
        let daemon_handle = thread::spawn(
            move || loop {
                Self::orchestrator_loop(
                    &event_rx, &devices, &deployments,
                )
            }
        );
        let api = OrchestratorApi { event_tx };

        (daemon_handle, api)
    }

    fn orchestrator_loop(
        event_queue: &mpsc::Receiver<Event>,
        devices: &Collection<device::Device>,
        deployments: &Collection<dep::Deployment>,
    ) {
        if let Ok(event) = event_queue.try_recv() {
            println!("Got event: {:?}", event);
        } else {
            println!("Nothing queued...");
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

    fn device_scan(
        service_type: &str,
        devices: Collection<device::Device>,
    ) {
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
        
        devices.insert_many(found_devices, None).unwrap();
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
