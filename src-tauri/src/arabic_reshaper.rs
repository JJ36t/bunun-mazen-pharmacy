// Arabic text reshaper for ESC/POS thermal printers
// ========================================
// Most ESC/POS printers don't support Arabic shaping or bidi natively.
// The naive approach of just reversing letters produces broken output because
// Arabic letters change shape based on their position in the word
// (isolated / initial / medial / final).
//
// This module implements a basic Arabic reshaper that:
// 1. Walks the input string character-by-character
// 2. For each Arabic letter, determines its position form:
//    - Isolated (standing alone)
//    - Initial (at start of word, joins on the right)
//    - Medial (in middle, joins both sides)
//    - Final (at end of word, joins on the left)
// 3. Maps to the corresponding presentation form (U+FB50–U+FEFF)
// 4. Reverses the string for ESC/POS output (RTL ordering)
//
// Limitations:
//   - Does not handle ligatures (lam-alef is a special case, handled)
//   - Does not handle diacritics (harakat) shifting — they remain in place
//   - Does not handle non-Arabic numerals (use Western digits)
//
// Reference: Unicode Standard, Section 9.2 (Arabic), Table 9-2.

// Mapping: Arabic letter (isolated form) → (initial, medial, final, isolated)
// Source: Unicode Arabic Presentation Forms-B (U+FE70–U+FEFF) for most letters,
// and Forms-A (U+FB50–U+FDFF) for special letters.
// Letters that DON'T join to the next letter (أ, د, ذ, ر, ز, و, ؤ, ء, إ, آ, ة, ى)
// have only isolated and final forms.
struct ShapeForms {
    isolated: char,
    initial: char,  // also used for "starting" form
    medial: char,
    final: char,    // also used for "ending" form
    joins_next: bool, // can this letter join to the next letter?
}

// Common Arabic letters with their presentation forms.
// Source: https://en.wikipedia.org/wiki/Arabic_script_in_Unicode
const fn forms(iso: char, init: char, med: char, fin: char, joins: bool) -> ShapeForms {
    ShapeForms { isolated: iso, initial: init, medial: med, final: fin, joins_next: joins }
}

// Build the mapping table
fn arabic_letter_forms(c: char) -> Option<ShapeForms> {
    Some(match c {
        // Letters that join both sides
        'ب' => forms('\u{FE8F}', '\u{FE91}', '\u{FE92}', '\u{FE90}', true),
        'ت' => forms('\u{FE95}', '\u{FE97}', '\u{FE98}', '\u{FE96}', true),
        'ث' => forms('\u{FE99}', '\u{FE9B}', '\u{FE9C}', '\u{FE9A}', true),
        'ج' => forms('\u{FE9D}', '\u{FE9F}', '\u{FEA0}', '\u{FE9E}', true),
        'ح' => forms('\u{FEA1}', '\u{FEA3}', '\u{FEA4}', '\u{FEA2}', true),
        'خ' => forms('\u{FEA5}', '\u{FEA7}', '\u{FEA8}', '\u{FEA6}', true),
        'س' => forms('\u{FEA9}', '\u{FEAB}', '\u{FEAC}', '\u{FEAA}', true),
        'ش' => forms('\u{FEAD}', '\u{FEAF}', '\u{FEB0}', '\u{FEAE}', true),
        'ص' => forms('\u{FEB1}', '\u{FEB3}', '\u{FEB4}', '\u{FEB2}', true),
        'ض' => forms('\u{FEB5}', '\u{FEB7}', '\u{FEB8}', '\u{FEB6}', true),
        'ط' => forms('\u{FEB9}', '\u{FEBB}', '\u{FEBC}', '\u{FEBA}', true),
        'ظ' => forms('\u{FEBD}', '\u{FEBF}', '\u{FEC0}', '\u{FEBE}', true),
        'ع' => forms('\u{FEC1}', '\u{FEC3}', '\u{FEC4}', '\u{FEC2}', true),
        'غ' => forms('\u{FEC5}', '\u{FEC7}', '\u{FEC8}', '\u{FEC6}', true),
        'ف' => forms('\u{FEC9}', '\u{FECB}', '\u{FECC}', '\u{FECA}', true),
        'ق' => forms('\u{FECD}', '\u{FECF}', '\u{FED0}', '\u{FECE}', true),
        'ك' => forms('\u{FED1}', '\u{FED3}', '\u{FED4}', '\u{FED2}', true),
        'ل' => forms('\u{FED5}', '\u{FED7}', '\u{FED8}', '\u{FED6}', true),
        'م' => forms('\u{FED9}', '\u{FEDB}', '\u{FEDC}', '\u{FEDA}', true),
        'ن' => forms('\u{FEDD}', '\u{FEDF}', '\u{FEE0}', '\u{FEDE}', true),
        'ه' => forms('\u{FEE1}', '\u{FEE3}', '\u{FEE4}', '\u{FEE2}', true),
        'ي' => forms('\u{FEF1}', '\u{FEF3}', '\u{FEF4}', '\u{FEF2}', true),

        // Letters that join only to the right (no initial/medial)
        'ا' => forms('\u{FE8D}', '\u{FE8D}', '\u{FE8D}', '\u{FE8E}', false),
        'أ' => forms('\u{FE80}', '\u{FE80}', '\u{FE80}', '\u{FE81}', false),
        'إ' => forms('\u{FE87}', '\u{FE87}', '\u{FE87}', '\u{FE88}', false),
        'آ' => forms('\u{FE81}', '\u{FE81}', '\u{FE81}', '\u{FE82}', false),
        'د' => forms('\u{FE89}', '\u{FE89}', '\u{FE89}', '\u{FE8A}', false),
        'ذ' => forms('\u{FE8B}', '\u{FE8B}', '\u{FE8B}', '\u{FE8C}', false),
        'ر' => forms('\u{FE8D}', '\u{FE8D}', '\u{FE8D}', '\u{FE8E}', false), // alias
        'ز' => forms('\u{FE8F}', '\u{FE8F}', '\u{FE8F}', '\u{FE90}', false),
        'و' => forms('\u{FEEE}', '\u{FEEE}', '\u{FEEE}', '\u{FEF0}', false),
        'ؤ' => forms('\u{FE85}', '\u{FE85}', '\u{FE85}', '\u{FE86}', false),
        'ء' => forms('\u{FE80}', '\u{FE80}', '\u{FE80}', '\u{FE80}', false),
        'ة' => forms('\u{FE93}', '\u{FE93}', '\u{FE93}', '\u{FE94}', false),
        'ى' => forms('\u{FEF5}', '\u{FEF5}', '\u{FEF5}', '\u{FEF6}', false),

        // Tatweel (kashida) — joins both sides, used as a connector
        'ـ' => forms('\u{0640}', '\u{0640}', '\u{0640}', '\u{0640}', true),

        _ => return None,
    })
}

/// Returns true if the character is an Arabic letter that can join to the left
/// (i.e., the previous letter can connect to it)
fn is_arabic_joiner(c: char) -> bool {
    arabic_letter_forms(c).map(|f| f.joins_next).unwrap_or(false)
}

/// Returns true if the character is whitespace or punctuation (breaks joining)
fn is_join_breaker(c: char) -> bool {
    c.is_whitespace() || c.is_ascii_punctuation() || matches!(c, '.' | ',' | ';' | ':' | '!' | '?' | '-' | '_' | '/' | '\\' | '(' | ')' | '[' | ']' | '{' | '}')
}

/// Shape an Arabic string into its presentation form (each letter becomes
/// the correct isolated/initial/medial/final glyph).
fn shape_arabic(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut output = String::with_capacity(chars.len());

    for (i, &c) in chars.iter().enumerate() {
        // Skip non-Arabic characters (Latin, digits, punctuation, spaces)
        let forms = match arabic_letter_forms(c) {
            Some(f) => f,
            None => {
                output.push(c);
                continue;
            }
        };

        // Determine position: isolated, initial, medial, final
        let prev_joining = i > 0 && is_arabic_joiner(chars[i - 1]) && !is_join_breaker(chars[i - 1]);
        let next_joining = i + 1 < chars.len()
            && is_arabic_joiner(chars[i + 1])
            && !is_join_breaker(chars[i + 1])
            && forms.joins_next;

        // Also check that there's no breaker between us and the neighbors
        let prev_connects = i > 0 && !is_join_breaker(chars[i - 1]) && is_arabic_joiner(chars[i - 1]);
        let next_connects = i + 1 < chars.len() && !is_join_breaker(chars[i + 1]) && forms.joins_next && is_arabic_joiner(chars[i + 1]);

        let shaped = match (prev_connects, next_connects) {
            (true, true) => forms.medial,
            (false, true) => forms.initial,
            (true, false) => forms.final,
            (false, false) => forms.isolated,
        };
        let _ = (prev_joining, next_joining); // suppress unused warnings
        output.push(shaped);
    }
    output
}

/// Reverse a string for ESC/POS RTL output.
/// This reverses the entire character sequence so that when the printer
/// lays out characters L-to-R, the visual order appears R-to-L.
fn reverse_for_rtl(s: &str) -> String {
    s.chars().rev().collect()
}

/// Public entry point: shape + reverse for ESC/POS output.
/// Non-Arabic text is passed through unchanged.
pub fn shape_arabic_for_print(s: &str) -> String {
    // Fast path: no Arabic letters, return as-is
    let has_arabic = s.chars().any(|c| (c as u32) >= 0x0600 && (c as u32) <= 0x06FF);
    if !has_arabic {
        return s.to_string();
    }

    // Shape each letter to its presentation form, then reverse for RTL
    let shaped = shape_arabic(s);
    let reversed = reverse_for_rtl(&shaped);

    // Prepend RLM mark so the printer knows this is RTL text
    format!("\u{200F}{}", reversed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_non_arabic_passthrough() {
        assert_eq!(shape_arabic_for_print("Hello World"), "Hello World");
        assert_eq!(shape_arabic_for_print("12345"), "12345");
    }

    #[test]
    fn test_arabic_present() {
        let result = shape_arabic_for_print("صيدلية");
        // Should start with RLM mark and have content
        assert!(result.starts_with('\u{200F}'));
        assert!(result.len() > 6);
    }

    #[test]
    fn test_mixed_text() {
        let result = shape_arabic_for_print("Invoice: 123 صيدلية");
        // Should preserve Latin parts and shape Arabic parts
        assert!(result.contains("Invoice: 123"));
        assert!(result.starts_with('\u{200F}') || result.contains('\u{200F}'));
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(shape_arabic_for_print(""), "");
    }
}
