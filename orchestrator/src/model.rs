//! Common and generic types and typedefs shared between modules.

pub mod deployment;
pub mod device;
pub mod module;

/// Placeholder type until more specific errors have been come up with.
pub struct PlaceholderError;

pub type FunctionName = String;
pub type ModuleName = String;
pub type DeviceName = String;
pub type DeploymentName = String;

/// Represents different types that can be used when interacting with WebAssembly.
#[derive(serde::Serialize, Clone)]
pub enum WebAssemblyType {
    U32(u32),
    U64(u64),
    F32(f32),
    F64(f64),
}

type WebAssemblyFunctionName = String;

/// Describes a WebAssembly function and how it's called.
#[derive(serde::Serialize, Clone)]
pub struct WebAssemblyFunction {
    input: Vec<WebAssemblyType>,
    output: Vec<WebAssemblyType>,
}

/// Identifies a call of a function on a supervisor.
pub type ExecutionId = (DeploymentName, ModuleName, FunctionName);

pub type Timestamp = String;

/// Identifies a __single__ call of a function on a supervisor.
pub type HistoryEntryId = (ExecutionId, Timestamp);

/// Response of a supervisor in answer to a function execution request.
pub enum ExecutionResponse {
    Queued(HistoryEntryId),
    Output(Vec<WebAssemblyType>),
}

/// Represents a single call of a function on a supervisor.
pub struct HistoryEntry {
    id: HistoryEntryId,
    datetime: String,
    arguments: Vec<WebAssemblyType>,
}

