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
  // 指令编译前，TypeScript 不会为 v-model 自动识别生成的 setter。
  void [setAgreed, setCheckedNames, setPicked, setSelected, setSelectedList, setEmail];

  const items = ["Alpha", "Beta", "Gamma"];
  // v-for 的局部变量由构建期生成的 map 回调提供；占位变量仅供源代码静态检查。
  const item = "";
  const imageAttrs = {
    src: "https://placehold.co/160x80",
    alt: "属性对象展开示例",
    width: 160,
  };
  const rawHtml = "<strong>v-html 注入的 HTML</strong>";

  return (
    <main className="content">
      <h1>JSX 指令示例</h1>

      <div className="toolbar">
        <button onClick={() => setState("ready")}>ready</button>
        <button onClick={() => setState("loading")}>loading</button>
        <button onClick={() => setState("idle")}>idle</button>
        <button onClick={() => setVisible((value) => !value)}>
          切换 v-show
        </button>
      </div>

      <VifElse state={state} />
      <VShow visible={visible} />

      <section className="panel">
        <h2>内容与列表</h2>
        <div v-html={rawHtml} />
        <p v-text={keyword}>这段初始内容会被 v-text 替换</p>
        <ul>
          <li v-for={item in items} key={item}>{item}</li>
        </ul>
        <ul>
          <li
            v-if={items.length > 0}
            v-for={item in items}
            key={item}
          >
            条件先判断，再循环：{item}
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>属性绑定</h2>
        <img v-bind={imageAttrs} />
        <img v-bind:src={imageAttrs.src} v-bind:alt={imageAttrs.alt} />
      </section>

      <section className="panel">
        <h2>v-model</h2>
        <label>文本：<input v-model={keyword} /></label>
        <label>显式 setter：<textarea v-model={[keyword, setKeyword]} /></label>
        <label>
          <input type="checkbox" v-model={agreed} /> 同意（布尔模型）
        </label>
        <label>
          <input
            type="checkbox"
            value="Jack"
            v-model={checkedNames}
          /> Jack
        </label>
        <label>
          <input
            type="checkbox"
            value="Mike"
            v-model={checkedNames}
          /> Mike
        </label>
        <p>已选：{checkedNames.join(", ") || "无"}</p>
        <label>
          <input type="radio" value="One" v-model={picked} /> One
        </label>
        <label>
          <input type="radio" value="Two" v-model={picked} /> Two
        </label>
        <p>单选：{picked}</p>
        <label>
          下拉单选：
          <select v-model={selected}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </label>
        <label>
          下拉多选：
          <select multiple v-model={selectedList}>
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
          </select>
        </label>
        <p>多选：{selectedList.join(", ")}</p>
        <label>组件输入：<ModelInput v-model={email} /></label>
        <p>组件模型：{email || "未填写"}</p>
        <label>具名输入：<NamedModelInput v-model:first={[firstName, setFirstName]} /></label>
        <p>具名模型：{firstName || "未填写"}</p>
      </section>
    </main>
  );
}

const VifElse = ({ state }: { state: ViewState }) => (
  <section className="panel">
    <p v-if={state === "ready"}>已就绪</p><p v-else-if={state === "loading"}>加载中</p><p v-else>暂不可用</p>
  </section>
  );

const VShow = ({ visible }: { visible: boolean }) => (
  <section className="panel">
    <div v-show={visible}>v-show 保留元素，只切换 display</div>
    <div style={{ color: "#8ab4f8" }} v-show={visible}>
      <Fragment v-if={visible}>
        已有 style 表达式会先展开，再合并 v-show 的属性
      </Fragment>
    </div>
  </section>
  );
