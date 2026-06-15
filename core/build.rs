fn main() {
    println!("cargo:rerun-if-env-changed=YOLE_UPDATER_PUBKEY");
    println!("cargo:rerun-if-env-changed=YOLE_UPDATER_ENDPOINT");
    println!("cargo:rerun-if-env-changed=YOLE_PROVISIONER_URL");
    if std::env::var("CARGO_CFG_WINDOWS").is_ok()
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        compile_windows_test_manifest();
    }
    tauri_build::build()
}

fn compile_windows_test_manifest() {
    use std::path::PathBuf;
    use std::process::Command;

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let rc_file = out_dir.join("yole-test-common-controls.rc");
    let lib_file = out_dir.join("yole_test_common_controls.lib");
    std::fs::write(
        &rc_file,
        r#"#pragma code_page(65001)
1 24
{
" <assembly xmlns=""urn:schemas-microsoft-com:asm.v1"" manifestVersion=""1.0""> "
" <dependency> "
" <dependentAssembly> "
" <assemblyIdentity "
" type=""win32"" "
" name=""Microsoft.Windows.Common-Controls"" "
" version=""6.0.0.0"" "
" processorArchitecture=""*"" "
" publicKeyToken=""6595b64144ccf1df"" "
" language=""*"" "
" /> "
" </dependentAssembly> "
" </dependency> "
" </assembly> "
}
"#,
    )
    .expect("write Windows test manifest resource");

    let rc =
        embed_resource::find_windows_sdk_tool("rc.exe").unwrap_or_else(|| PathBuf::from("rc.exe"));
    let status = Command::new(&rc)
        .arg("/nologo")
        .arg("/fo")
        .arg(&lib_file)
        .arg(&rc_file)
        .status()
        .expect("run rc.exe for Windows test manifest");
    assert!(
        status.success(),
        "rc.exe failed to compile Windows test manifest resource"
    );

    println!("cargo:rustc-link-search=native={}", out_dir.display());
}
