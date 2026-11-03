//! `centurion-logo <out-dir>`: reads one untrusted image (<= MAX_INPUT bytes) from stdin and writes
//! `{48,64,96,128,192}.{webp,png}` into `<out-dir>`
//! (a size whose output exceeds the byte cap is omitted). Run as a short-lived child process by the API so a decoder
//! fault can never take the API down. Exit codes: 0 ok, 2 rejected (format/size/dimensions), 3 decode error,
//! 4 I/O error. Never prints input bytes.
use std::io::Read;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(out) = std::env::args_os().nth(1) else {
        eprintln!("usage: centurion-logo <out-dir>");
        return ExitCode::from(4);
    };
    let mut input = Vec::new();
    if std::io::stdin()
        .take(logo::MAX_INPUT as u64 + 1)
        .read_to_end(&mut input)
        .is_err()
    {
        return ExitCode::from(4);
    }
    match logo::transcode_all(&input) {
        Ok(outputs) => {
            let dir = std::path::Path::new(&out);
            for o in outputs {
                if std::fs::write(dir.join(o.file_name()), &o.bytes).is_err() {
                    return ExitCode::from(4);
                }
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{}", e.code());
            ExitCode::from(if e.is_rejection() { 2 } else { 3 })
        }
    }
}
