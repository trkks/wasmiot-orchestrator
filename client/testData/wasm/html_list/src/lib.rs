//! This crate contains a function that acts bit like a template-engine, taking in some data and
//! generating HTML based on it. This HTML is then expected to be handed back for a user to
//! interact with.
//!
//! Expected mounts are:
//! - deploy-base.html
//! - out-index.html

const DEPLOY_FILE_NAME: &str = "deploy-base.html";
const OUTPUT_FILE_NAME: &str = "out-index.html";


use std::fs;


#[derive(Debug)]
enum MountReadFailed {
    Deploy = -1,
    Out = -2,
}

fn handle_error(error: std::io::Error, eenum: MountReadFailed) -> i32 {
    eprintln!("Error: Reading a mount-file ({:?}) failed: {:?}", eenum, error);

    eenum as i32
}

/// Into output file, create an HTML list of length `n` at the end of an existing HTML-document
/// base.
#[no_mangle]
fn html_list(n: u32) -> i32 {
    let mut base = match fs::read_to_string(DEPLOY_FILE_NAME) {
        Ok(x) => x,
        Err(e) => return handle_error(e, MountReadFailed::Deploy),
    };
    
    let mut list_html = (0..n).fold(
        String::from("<ul>"),
        |mut acc, i| {
            acc.push_str(&format!("<li>Item {}</li>", i));
            acc
        }
    );
    list_html.push_str("</ul>");
        
    // Check if the base looks like a valid HTML file and create one if not.
    let html = if base.contains("<body>") && base.contains("</body>") {
        let doc_end = base.find("</body>").unwrap();
        base.insert_str(doc_end, &list_html);
        base
    } else {
        format!("<!DOCTYPE html><html><body>{}</body></html>", list_html)
    };

    // Write it all to output file.
    if let Err(e) = fs::write(OUTPUT_FILE_NAME, html) {
        return handle_error(e, MountReadFailed::Out)
    }

    0
}
