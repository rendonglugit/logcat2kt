# logcat2kt

把 logcat 里复制出来的日志，直接转成可折叠的 JSON 树和 Kotlin data class。

**在线使用：<https://rendonglugit.github.io/logcat2kt/>**

[English](README.md) | 简体中文

单文件网页，零依赖、不联网、不上传。日志只在本地浏览器里处理。

---

## 解决的问题

联调期从 logcat 复制一条响应日志，到手上有一个能用的 data class，中间通常有四步机械劳动：

1. 日志被截断（单条约 4KB 上限），复制出来是一堆带前缀的碎片
2. 接缝常落在字符串中间，得逐行删前缀、手工对齐引号
3. 拼回去还要再找个格式化网站展开 JSON（业务数据贴到第三方网站也不合适）
4. 对着内容一个个敲字段名、可空标记、类型

这个工具把四步压成一次粘贴。一天重复十几遍的动作，省下来的时间不多，但省下来的注意力不少。

---

## 功能

支持三种输入形态，自动识别，按信息量从多到少依次尝试：

| 输入 | 例子 |
|---|---|
| JSON | `{"code":0,"data":{...}}` |
| Kotlin / Java `toString` | `Response(code=0, data=Data(id=1))` |
| Protocol Buffer | TextFormat（`id: 1`、`user { }`）与二进制 hex dump |

处理管线：

```
行解析（剥前缀 / 识别 tag）
  → 条目合并（括号平衡扫描，拼接被截断的多条日志）
  → 结构识别（toString / TextFormat / JSON / hex，四种策略按序尝试）
  → 宽容解析（非标准 JSON：单引号、无引号 key、尾逗号、注释…）
  → 可折叠树 + 类型推断 + Kotlin 生成
```

几个有意的设计选择：

- **按 tag 分组**。一屏日志里可能混着五六个接口，全合并会得到字段全可空、互相污染的巨型类。现在各生成一套，类名用 tag 前缀区分。
- **默认全部可空 + `= null`**。字段缺失不崩，字段多出来也不崩。
- **扁平输出**。所有 data class 平铺，Gson / kotlinx.serialization / Moshi 都能直接用。
- **丢段会明说**。状态栏出现「日志缺失 N 处已跳过」时，说明这段日志中间被系统丢了一块，断点前后结构已自动对齐，但缺失段的字段确实找不回来。

---

## 使用

打开 <https://rendonglugit.github.io/logcat2kt/>，或本地双击 `index.html`。

1. 从 logcat 框选复制（多选几条没关系，混着别的日志也行）
2. 粘贴到左边
3. 右边看树，点 `▾` 折叠，切到 Kotlin 标签页复制

顶部选项：

| 选项 | 说明 |
|---|---|
| 根类名 | 顶层类名，默认 `Response`；多组时拼上 tag 前缀 |
| 注解 | 无 / Gson / kotlinx.serialization / Moshi |
| 可空策略 | 全部可空（推荐）/ 按样本推断 / 全部非空 |
| 命名 | 转 camelCase / 保持原样 |
| 时间戳字段用 Long | 名字像时间的整数字段升为 `Long` |

`index.html#kotlin` 会直接落在 Kotlin 标签页，可以存成书签。

---

## 本地开发

没有构建步骤，改完 `index.html` 刷新就行。测试用 Node 跑，mock 了最小 DOM，执行的就是页面里的脚本：

```bash
node test.js
# ===== 86 passed, 0 failed =====
```

`samples/long-text.log` 是触发丢段问题的真实样本，改解析逻辑后可以拿它做回归。

parser 和生成器是纯函数，没有一行 DOM 依赖。想搬到 CLI、AS 插件或者接进 CI，直接拿 `parseLog / extractNodes / parseLoose / parseProtoText / decodeHexDump / typeOf / genKotlin` 这几个函数即可。

---

## 设计笔记

为什么这么写、踩过哪些坑（前缀格式、截断拼接、中间丢段、19 位数字精度、命名冲突、protobuf 二进制解码），都在 [docs/design.md](docs/design.md)。

## License

MIT
