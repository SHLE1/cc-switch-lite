#[test]
fn tray_id_is_unique_to_app() {
    assert_eq!(cc_switch_lib::tray::TRAY_ID, "cc-switch");
    assert_ne!(cc_switch_lib::tray::TRAY_ID, "main");
}
