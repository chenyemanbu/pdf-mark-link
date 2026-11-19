# 发布到 Obsidian 社区目录

## 当前发布候选

插件 ID 为 `pdf-mark-link`，市场名称为 PDF Mark Link，中文操作界面为「PDF 标注与笔记链接」，版本为 `0.1.5`，采用 MIT 许可证。

已验证 Windows 桌面端。macOS 和 Linux 尚未实机验收。手机和平板暂不在本次发布范围。

## GitHub

1. 使用自己的 GitHub 账号创建公开仓库，建议命名 `pdf-mark-link`。
2. 将本插件源码放在仓库根目录，根目录应直接包含 `manifest.json`、`README.md`、`LICENSE`、`package.json` 和源码。
3. 排除 `node_modules/`、`dist/`、测试知识库和私人文件。源码 ZIP 已按文件清单打包。
4. 执行 `npm ci`、`npm test`、`npm run build`。
5. 推送新版本到 main。仓库中的发布工作流会创建与 manifest 版本一致的标签和 Release，并上传附件。已有版本不会被覆盖。
6. 也可手动创建同名 GitHub Release，上传构建结果中的 `main.js`、`manifest.json`、`styles.css`、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`。

## Obsidian 社区目录

登录 [Obsidian 社区目录](https://community.obsidian.md)，在个人资料中连接自己的 GitHub 账号，再添加插件，填写公开仓库地址。安装所需的 Release 标签须与默认分支的 manifest 版本一致。

社区目录会检查源码、构建、许可证和发布附件。收到审查结果后，处理错误并发布递增版本。是否通过以社区目录的实际结果为准。

## 下次更新

同步修改 `package.json`、`manifest.json`、`versions.json`，生成新版本并发布同名标签。社区目录通过首次审核后，后续版本通过 GitHub Releases 分发。

## 参考

- [官方提交步骤](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [插件提交要求](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [开发者政策](https://docs.obsidian.md/community-directory/developer-policies)
