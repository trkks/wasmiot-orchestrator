//! Describes the work units installable on devices in the form of WebAssembly modules and
//! associated files.

use std::collections;
use std::path;

use super::{
    ModuleName,
    WebAssemblyFunction,
    WebAssemblyFunctionName,
};


/// Unit containing execution data and logic installable on a device.
///
/// - `name` acts as an identifier for the module.
/// - `layers` contains the data and logic each dependent on previous ones (e.g., the last layer is
/// never a dependency for any other layer).
#[derive(serde::Serialize, Clone)]
pub struct Module {
    pub name: ModuleName,
    pub layers: Vec<Layer>,
}

/// Describes different separate that a module can consist of.
///
/// - `File` is for data, that is accessible through the filesystem.
/// - `WebAssembly` is for logic, that can depend on other layers.
#[derive(serde::Serialize, Clone)]
pub enum Layer {
    File(path::PathBuf),
    WebAssembly {
        functions: collections::HashMap<WebAssemblyFunctionName, WebAssemblyFunction>,
    },
}
