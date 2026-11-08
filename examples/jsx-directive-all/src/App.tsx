import { useState, Fragment } from "react";
import "./App.css";

type ViewState = "ready" | "loading" | "idle";

const ModelInput = ({
  modelValue,
  onUpdateModelValue,
}: {
  modelValue?: string;
  onUpdateModelValue?: (value: string) => void;
}) => (
  <input
    value={modelValue}
    onChange={(event) => onUpdateModelValue?.(event.target.value)}
  />
);

const NamedModelInput = ({
  first,
  onUpdateFirst,
}: {
  first?: string;
  onUpdateFirst?: (value: string) => void;
}) => (
  <input
    value={first}
    onChange={(event) => onUpdateFirst?.(event.target.value)}
  />
);

export default function App() {
  const [state, setState] = useState<ViewState>("idle");
  const [visible, setVisible] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [checkedNames, setCheckedNames] = useState<string[]>([]);
  const [picked, setPicked] = useState("One");
  const [selected, setSelected] = useState("a");
  const [selectedList, setSelectedList] = useState<string[]>(["a"]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  // 指令编译前，TypeScript 不会为 x-model 自动识别生成的 setter。
  void [
    setAgreed,
    setCheckedNames,
    setPicked,
    setSelected,
    setSelectedList,
    setEmail,
  ];

  const items = ["Alpha", "Beta", "Gamma"];
  // x-for 的局部变量由构建期生成的 map 回调提供；占位变量仅供源代码静态检查。
  const item = "";
  const imageAttrs = {
    src: "https://placehold.co/160x80",
    alt: "属性对象展开示例",
    width: 160,
  };
  const rawHtml = "<strong>x-html 注入的 HTML</strong>";

  return (
    <main className="content">
      <h1>JSX 指令示例</h1>

      <div className="toolbar">
        <button onClick={() => setState("ready")}>ready</button>
        <button onClick={() => setState("loading")}>loading</button>
        <button onClick={() => setState("idle")}>idle</button>
        <button onClick={() => setVisible((value) => !value)}>
          切换 x-show
        </button>
      </div>

      <VifElse state={state} />
      <VShow visible={visible} />

      <section className="panel">
        <h2>内容与列表</h2>
        <div x-html={rawHtml} />
        <p x-text={keyword}>这段初始内容会被 x-text 替换</p>
        <ul>
          <li x-for={item in items} key={item}>
            {item}
          </li>
        </ul>
        <ul>
          <li x-if={items.length > 0} x-for={item in items} key={item}>
            条件先判断，再循环：{item}
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>属性绑定</h2>
        <img x-bind={imageAttrs} />
        <img x-bind:src={imageAttrs.src} x-bind:alt={imageAttrs.alt} />
      </section>

      <section className="panel">
        <h2>x-model</h2>
        <label>
          文本：
          <input x-model={keyword} />
        </label>
        <label>
          显式 setter：
          <textarea x-model={[keyword, setKeyword]} />
        </label>
        <label>
          <input type="checkbox" x-model={agreed} /> 同意（布尔模型）
        </label>
        <label>
          <input type="checkbox" value="Jack" x-model={checkedNames} /> Jack
        </label>
        <label>
          <input type="checkbox" value="Mike" x-model={checkedNames} /> Mike
        </label>
        <p>已选：{checkedNames.join(", ") || "无"}</p>
        <label>
          <input type="radio" value="One" x-model={picked} /> One
        </label>
        <label>
          <input type="radio" value="Two" x-model={picked} /> Two
        </label>
        <p>单选：{picked}</p>
        <label>
          下拉单选：
          <select x-model={selected}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </label>
        <label>
          下拉多选：
          <select multiple x-model={selectedList}>
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
          </select>
        </label>
        <p>多选：{selectedList.join(", ")}</p>
        <label>
          组件输入：
          <ModelInput x-model={email} />
        </label>
        <p>组件模型：{email || "未填写"}</p>
        <label>
          具名输入：
          <NamedModelInput x-model:first={[firstName, setFirstName]} />
        </label>
        <p>具名模型：{firstName || "未填写"}</p>
      </section>
    </main>
  );
}

const VifElse = ({ state }: { state: ViewState }) => (
  <section className="panel">
    <p x-if={state === "ready"}>已就绪</p>
    <p x-else-if={state === "loading"}>加载中</p>
    <p x-else>暂不可用</p>
  </section>
);

const VShow = ({ visible }: { visible: boolean }) => (
  <section className="panel">
    <div x-show={visible}>x-show 保留元素，只切换 display</div>
    <div style={{ color: "#8ab4f8" }} x-show={visible}>
      <Fragment x-if={visible}>
        已有 style 表达式会先展开，再合并 x-show 的属性
      </Fragment>
    </div>
  </section>
);
