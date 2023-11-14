use crate::model::{
    DeploymentName,
    device,
    ExecutionId,
    ExecutionResponse,
    HistoryEntry,
    PlaceholderError,
    WebAssemblyType,
};


pub struct HttpSupervisor {
    device: device::Device,
}

impl HttpSupervisor {
    pub fn device(&self) -> &device::Device {
        &self.device
    }
}

//impl super::SupervisorApi for HttpSupervisor {
impl HttpSupervisor {
    /// Returns a current description of the device.
    pub fn description(&self) -> device::DeviceDescription {
        todo!()
    }

    /// Returns a current health report of the device.
    pub fn health(&self) -> device::DeviceHealth {
        todo!()
    }

    /// Configures the device according to given manifest.
    pub fn deploy(
        &mut self,
        deployment: &DeploymentName,
        configuration: &device::DeviceConfiguration,
    ) -> Result<(), PlaceholderError> {
        todo!()
    }

    /// Executes a function with given arguments.
    pub fn execute(
        &mut self,
        execution: ExecutionId,
        args: Vec<WebAssemblyType>,
    ) -> Result<ExecutionResponse, PlaceholderError> {
        todo!()
    }

    /// Returns the ordered list of function calls on the device.
    pub fn history(&self) -> Vec<HistoryEntry> {
        todo!()
    }
}
