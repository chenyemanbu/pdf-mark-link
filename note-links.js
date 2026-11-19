function toPageLinks(content, entries, id) {
  let output = content;
  for (const entry of [...entries].sort((a, b) => b.position.start.offset - a.position.start.offset)) {
    const start = entry.position.start.offset;
    const end = entry.position.end.offset;
    if (content.slice(start, end) !== entry.original) {
      throw new Error("关联笔记正在更新，请稍后重试删除。");
    }
    const revisedLink = entry.link.replace(new RegExp("&annotation=" + id + "(?=&|$)"), "");
    const replacement = entry.original.replace(entry.link, revisedLink);
    if (replacement === entry.original) throw new Error("无法更新对应链接，请先手动改为页码链接。");
    output = output.slice(0, start) + replacement + output.slice(end);
  }
  return output;
}

module.exports = { toPageLinks };
