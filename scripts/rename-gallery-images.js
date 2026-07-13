const fs = require('fs');
const path = require('path');

const GALLERY_DIR = path.join(__dirname, '../public/gallery');
const CONFIG_FILE = path.join(__dirname, '../data/gallery-images.json');

/**
 * 将文件名转换为 URL-safe 格式
 * - 移除或替换特殊字符 (#, 空格, 括号)
 * - 保留中文、字母、数字、点、下划线、连字符
 */
function toSafeFilename(filename) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  // 替换策略：
  // # 和空格 → 连字符
  // 括号及其内容 → 移除
  const safe = name
    .replace(/[()]/g, '')         // 移除括号
    .replace(/[#\s]+/g, '-')      // # 和空格转为连字符
    .replace(/-+/g, '-')          // 多个连字符合并为一个
    .replace(/^-+|-+$/g, '')      // 移除首尾连字符
    + ext;

  return safe;
}

/**
 * 生成唯一文件名（避免冲突）
 */
function getUniqueFilename(existingMap, desiredName, id) {
  let safeName = toSafeFilename(desiredName);

  // 如果文件名已经存在，添加 id 前缀
  if (existingMap.has(safeName)) {
    const ext = path.extname(safeName);
    const name = path.basename(safeName, ext);
    safeName = `${name}_${id}${ext}`;
  }

  return safeName;
}

async function main() {
  console.log('🔄 开始批量重命名...\n');

  // 读取配置文件
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  console.log(`📄 配置文件: ${config.length} 张图片\n`);

  // 构建现有文件名映射
  const existingFilenames = new Map();
  config.forEach(img => {
    existingFilenames.set(img.filename, img.id);
  });

  // 检查哪些文件需要重命名
  const needsRename = [];
  const renameMap = new Map(); // oldName -> newName

  for (const img of config) {
    const safeName = toSafeFilename(img.filename);
    if (safeName !== img.filename) {
      needsRename.push({
        id: img.id,
        oldName: img.filename,
        newName: safeName,
      });
      renameMap.set(img.filename, safeName);
    }
  }

  if (needsRename.length === 0) {
    console.log('✅ 所有文件名已经是 URL-safe 格式，无需重命名');
    return;
  }

  console.log(`📋 发现 ${needsRename.length} 个文件需要重命名\n`);
  console.log('前 10 个示例:');
  needsRename.slice(0, 10).forEach(({ id, oldName, newName }) => {
    console.log(`  [${id}] ${oldName} → ${newName}`);
  });
  if (needsRename.length > 10) {
    console.log(`  ... 还有 ${needsRename.length - 10} 个`);
  }

  // 检查是否有冲突（多个文件重命名后名称相同）
  const nameConflicts = [];
  const newNameCount = new Map();
  needsRename.forEach(({ oldName, newName }) => {
    const count = (newNameCount.get(newName) || 0) + 1;
    newNameCount.set(newName, count);
    if (count > 1) nameConflicts.push(newName);
  });

  if (nameConflicts.length > 0) {
    console.log(`\n⚠️  发现 ${nameConflicts.length} 个重命名冲突，将使用 ID 后缀解决\n`);
  }

  // 执行重命名
  let successCount = 0;
  let failCount = 0;

  for (const { id, oldName, newName } of needsRename) {
    const oldPath = path.join(GALLERY_DIR, oldName);

    // 检查源文件是否存在
    if (!fs.existsSync(oldPath)) {
      console.log(`❌ [${id}] 源文件不存在: ${oldName}`);
      failCount++;
      continue;
    }

    // 如果目标文件名已存在，添加 id 后缀
    let finalName = newName;
    if (fs.existsSync(path.join(GALLERY_DIR, newName))) {
      const ext = path.extname(newName);
      const name = path.basename(newName, ext);
      finalName = `${name}_${id}${ext}`;
    }

    const newPath = path.join(GALLERY_DIR, finalName);

    try {
      fs.renameSync(oldPath, newPath);

      // 更新配置
      const imgIndex = config.findIndex(img => img.id === id);
      if (imgIndex !== -1) {
        config[imgIndex].filename = finalName;
        config[imgIndex].alt = finalName.replace(/\.[^.]+$/, '');
      }

      console.log(`✅ [${id}] ${oldName} → ${finalName}`);
      successCount++;
    } catch (error) {
      console.log(`❌ [${id}] 重命名失败: ${error.message}`);
      failCount++;
    }
  }

  // 保存更新后的配置
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

  console.log(`\n✨ 重命名完成!`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log(`   总计: ${needsRename.length}`);
  console.log(`\n📄 配置文件已更新: data/gallery-images.json`);
}

main().catch(console.error);