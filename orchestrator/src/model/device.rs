//! Types used for interacting with and inspecting devices.

use std::collections;

use super::{
    FunctionName,
    DeviceName,
    ModuleName,
    WebAssemblyFunction,
};


/// Describes what functionalities a device offers for modules to use.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DeviceDescription {
    interfaces: collections::HashSet<String>,
}

/// Describes the state of a device in terms of computational resources.
///
/// - `up` signifies that a device was previously able to answer to a health query.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DeviceHealth {
    up: bool
}

type Url = String;

/// Describes what modules are required on a device and where they can be fetched. In addition also
/// describes what external connections to other modules are available on this device to use.
#[derive(serde::Serialize)]
pub struct DeviceConfiguration {
    pub modules: collections::HashMap<ModuleName, Url>,
    pub connections: collections::HashMap<FunctionName, WebAssemblyFunction>,
}

/// Contains information about a specific device.
///
/// - `name` acts as an identifier for the device.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Device {
    name: DeviceName,
    description: DeviceDescription,
    health: DeviceHealth,
}

impl From<mdns_sd::ServiceInfo> for Device {
    fn from(value: mdns_sd::ServiceInfo) -> Self {
        todo!()
    }
}
