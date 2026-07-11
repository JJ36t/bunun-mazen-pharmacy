// Legacy HMAC — backward compatibility for old licenses
use ring::hmac;
use hex;
use subtle::ConstantTimeEq;
use obfstr::obfstr;

pub fn verify_hmac_license(device_id: &str, input_key: &str) -> bool {
    let secret: Vec<u8> = obfstr!("IRAQ_PHARMA_SECRET_2024_HMAC").as_bytes().to_vec();
    let key = hmac::Key::new(hmac::HMAC_SHA256, &secret);
    let tag = hmac::sign(&key, device_id.as_bytes());
    let hex_tag = hex::encode(tag).to_uppercase();
    let expected_key = format!("{}-{}-{}", &hex_tag[0..4], &hex_tag[4..8], &hex_tag[8..12]);
    expected_key.as_bytes().ct_eq(input_key.as_bytes()).unwrap_u8() == 1
}
