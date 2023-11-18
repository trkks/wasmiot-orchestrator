//! Types used for building up deployment solutions and reasoning about modules on devices.

use std::collections;

use super::{
    DeploymentName,
    DeviceName,
    device::DeviceConfiguration,
    module::Module,
    WebAssemblyFunctionName,
};

/// Describes a single node in the graph of connections between functions on devices.
#[derive(Debug, serde::Serialize)]
pub struct ManifestNode {
    device: Option<DeviceName>,
    module: Module,
    function: WebAssemblyFunctionName,
}

/// Describes a plan or how a deployment _should be_ organised in terms of modules' functions and
/// possibly even as specifically as connections between devices.
///
/// The fine-grained control of connections between devices is supported for example if there are
/// functionally equivalent but contextually different devices available (e.g. cameras that point
/// in different directions).
pub type Manifest = Vec<ManifestNode>;

/// Describes what modules and connections are configured on which device in a deployment.
pub type DeploymentConfiguration = collections::HashMap<DeviceName, DeviceConfiguration>;

/// Contains current information about a specific deployment of modules to devices.
///
/// - `name` acts as an identifier for the deployment.
/// - `active` signifies if the deployment is active i.e., modules have been installed on devices
/// according to the manifest.
/// - `manifest` is the targeted state for the deployment.
/// - `configuration` is the solution created based on a manifest and available resources.
#[derive(serde::Serialize)]
pub struct Deployment {
    pub name: DeploymentName,
    pub active: bool,
    pub manifest: Manifest,
    pub configuration: DeploymentConfiguration,
}
