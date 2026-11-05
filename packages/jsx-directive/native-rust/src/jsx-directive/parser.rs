// tree-sitter TSX 解析器：thread_local 复用，避免每次转换重新构建。
use std::cell::RefCell;
use tree_sitter::Parser;

thread_local! {
    pub(crate) static TSX_PARSER: RefCell<Option<Parser>> = const { RefCell::new(None) };
}
