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
    let ptr = bytes.as_ptr();
    let n = bytes.len();
    let cap = bytes.capacity();
    // Make sure the length is not greater than can be stored in u32.
    assert!(n <= u32::MAX as usize);
    std::mem::forget(bytes);
    (ptr, n as u32, cap)
}

/// Make a remote procedure call and return it's output bytes if it succeeded.
fn do_rpc(
    module_name: &str,
    function_name: &str,
    input: Option<Vec<u8>>,
    expected_output_size: usize
) -> Result<Vec<u8>, u32> {
    let (m_ptr, m_len, _) = ptrs_of(module_name.to_string().into_bytes());
    let (f_ptr, f_len, _) = ptrs_of(function_name.to_string().into_bytes());
    let (i_ptr, i_len, i_cap) = if let Some(input) = input {
        // TODO Should the block be expanded here to cover possible output as well?
        ptrs_of(input)
    } else {
        // Reserve memory for the output.
        ptrs_of(vec![0; expected_output_size])
    };
    // The buffer needs to be mutable.
    let i_ptr = i_ptr as *mut u8;

    let rpc_status = unsafe { rpc(m_ptr, m_len, f_ptr, f_len, i_ptr, i_len) };
    if rpc_status != 0 {
        return Err(rpc_status);
    }

    let output = unsafe { Vec::<u8>::from_raw_parts(i_ptr, expected_output_size as usize, i_cap) };
    return Ok(output);
}

/// Primitively parse the data from JSON and return last u32-value in array.
/// Return None if the array is empty.
fn parse_last_value(json_bytes: Vec<u8>) -> Option<u32> {
    let json = String::from_utf8(json_bytes)
        .expect("failed interpreting bytes into (JSON) string");
    println!("input: {}", json);
    let Some((_, rest)) = json.rsplit_once([',', '[']) else {
        panic!("failed parsing JSON array");
    };
    let Some((current_value_str, _)) = rest.trim().rsplit_once(']') else {
        panic!("failed parsing JSON array's last element");
    };
    if current_value_str.is_empty() {
        return None;
    }
    let current_value = current_value_str.trim().parse::<u32>()
        .expect("failed parsing integer from last element");

    return Some(current_value);
}

fn update_value(read_res: Result<Vec<u8>, u32>) -> u32 {
    match read_res {
        Ok(json_bytes) => {
            if let Some(current_value) = parse_last_value(json_bytes) {
                current_value + 1
            } else {
                // Initialize empty collection with a zero.
                0
            }
        },
        Err(e) => panic!("RPC failed with {}", e),
    }
}

fn handle_push(push_res: Result<Vec<u8>, u32>) -> Option<i32> {
    if let Ok(x_bytes) = push_res {
        parse_last_value(x_bytes).map(|x| x as i32)
    } else {
        None
    }
}

/// Fetch, update and store a _positive_ integer value in database, that is accessed with remote
/// procedure calls.
#[no_mangle]
pub fn counter() -> i32 {
    let value_read_result = do_rpc("core:Datalist", "get", None, 1024);
    let updated_value = update_value(value_read_result);
    let value_update_result = do_rpc("core:Datalist", "push", Some(updated_value.to_le_bytes().to_vec()), 1024);
    if handle_push(value_update_result).is_none() {
        -1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datalist_result(items: Vec<&[u8]>) -> Vec<u8> {
        [
            b"{\"result\":[ ".to_vec(),
            items.join(&b", "[..]),
            b"]}".to_vec()
        ].concat()
    }

    #[test]
    fn test_ptrs_of() {
        let (ptr, n, cap) = ptrs_of("foo".to_string().into_bytes());
        let s = unsafe { String::from_raw_parts(ptr as *mut u8, n as usize, cap) };
        assert_eq!(s, "foo".to_string());
    }

    #[test]
    #[should_panic]
    fn test_parse_last_value_gibberish() {
        parse_last_value(b"foo".to_vec());
    }

    #[test]
    fn test_parse_last_value_empty() {
        assert_eq!(parse_last_value(datalist_result(vec![])), None);
    }

    #[test]
    fn test_parse_last_value_one() {
        assert_eq!(parse_last_value(datalist_result(vec![b"10"])), Some(10));
    }

    #[test]
    fn test_parse_last_value_two() {
        assert_eq!(parse_last_value(datalist_result(vec![b"42", b"100"])), Some(100));
    }

    #[test]
    fn test_update_value_ok() {
        assert_eq!(update_value(Ok(datalist_result(vec![b"10"]))), 11);
        assert_eq!(update_value(Ok(datalist_result(vec![b"10", b"100"]))), 101);
    }

    #[test]
    fn test_update_value_empty() {
        assert_eq!(update_value(Ok(datalist_result(vec![]))), 0);
    }

    #[test]
    #[should_panic]
    fn test_update_value_err() {
        update_value(Err(2));
    }
}
