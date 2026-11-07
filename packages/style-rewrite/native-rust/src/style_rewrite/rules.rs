// 结构定位：在压缩后的 CSS 中查找声明块的结束位置，括号与字符串内的花括号不参与计数。

pub(crate) fn find_block_end(code: &str, open: usize) -> Option<usize> {
    let bytes = code.as_bytes();
    if bytes.get(open) != Some(&b'{') {
        return None;
    }

    let mut depth = 0usize;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    let mut index = open;

    while index < bytes.len() {
        let current = bytes[index];

        if let Some(quote_character) = quote {
            if escaped {
                escaped = false;
            } else if current == b'\\' {
                escaped = true;
            } else if current == quote_character {
                quote = None;
            }
        } else if current == b'\'' || current == b'"' {
            quote = Some(current);
        } else if current == b'{' {
            depth += 1;
        } else if current == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }

        index += 1;
    }

    None
}
