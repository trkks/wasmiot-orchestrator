#[link(wasm_import_module="communication")]
extern {
    /// Run a function with possible inputs interpreted from data_ptr and outputs written into
    /// data_ptr. Return 0 if successfull, otherwise the function failed.
    #[link_name="rpc"]
    fn rpc(
        module_name: *const u8,
        module_name_len: u32,
        func_name: *const u8,
        func_name_len: u32,
        data_ptr: *mut u8,
        data_len: u32,
    ) -> u32;
}

/// Turn the input bytes into a pointer, byte-length and capacity on the heap.
fn ptrs_of(bytes: Vec<u8>) -> (*const u8, u32, usize) {
    let bytes = std::mem::ManuallyDrop::new(bytes);
    let ptr = bytes.as_ptr();
    let n = bytes.len();
    let cap = bytes.capacity();
    // Make sure the length is not greater than can be stored in u32.
    assert!(n <= u32::MAX as usize);
    (ptr, n as u32, cap)
}

/// Turn the input bytes into a mutable pointer, byte-length and capacity on the heap.
fn mut_ptrs_of(bytes: Vec<u8>) -> (*mut u8, u32, usize) {
    let mut bytes = std::mem::ManuallyDrop::new(bytes);
    let ptr = bytes.as_mut_ptr();
    let n = bytes.len();
    let cap = bytes.capacity();
    // Make sure the length is not greater than can be stored in u32.
    assert!(n <= u32::MAX as usize);
    (ptr, n as u32, cap)
}

fn prepare_args(
    module_name: &str,
    function_name: &str,
    input: Option<Vec<u8>>,
    expected_output_size: usize,
) -> (*const u8, u32, *const u8, u32, *mut u8, u32, usize) {
    let module_name = module_name.to_string().into_bytes();
    let function_name = function_name.to_string().into_bytes();
    let (m_ptr, m_len, _) = ptrs_of(module_name);
    let (f_ptr, f_len, _) = ptrs_of(function_name);

    let mut in_and_out_buffer = vec![0; expected_output_size];
    // Write possible input at the start.
    if let Some(input) = input {
        if input.len() > expected_output_size {
            // Use the larger buffer size of the two.
            in_and_out_buffer = vec![0; input.len()];
        }
        for (i, b) in input.into_iter().enumerate() {
            in_and_out_buffer[i] = b;
        }
    }
    let (i_ptr, i_len, i_cap) = mut_ptrs_of(in_and_out_buffer);
    
    (m_ptr, m_len, f_ptr, f_len, i_ptr, i_len, i_cap)
}

/// Make a remote procedure call and return it's output bytes if it succeeded.
pub fn do_rpc(
    module_name: &str,
    function_name: &str,
    input: Option<Vec<u8>>,
    expected_output_size: usize
) -> Result<Vec<u8>, u32> {
    let (m_ptr, m_len, f_ptr, f_len, i_ptr, i_len, i_cap) =
        prepare_args(module_name, function_name, input, expected_output_size);
    let rpc_status = unsafe { rpc(m_ptr, m_len, f_ptr, f_len, i_ptr, i_len) };

    if rpc_status != 0 {
        return Err(rpc_status);
    }

    let output = unsafe {
        Vec::<u8>::from_raw_parts(i_ptr, expected_output_size as usize, i_cap)
    };
    return Ok(output);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ptrs_of() {
        let (ptr, n, cap) = ptrs_of("foo".to_string().into_bytes());
        let s = unsafe { String::from_raw_parts(ptr as *mut u8, n as usize, cap) };
        assert_eq!(s, "foo");
    }

    #[test]
    fn test_mut_ptrs_of() {
        let (ptr, n, cap) = mut_ptrs_of(b"bar".to_vec());
        let bs = unsafe { Vec::<u8>::from_raw_parts(ptr, n as usize, cap) };
        assert_eq!(bs, b"bar");
    }
}
