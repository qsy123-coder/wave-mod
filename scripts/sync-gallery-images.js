const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GALLERY_DIR = path.join(__dirname, '../public/gallery');
const CONFIG_FILE = path.join(__dirname, '../data/gallery-images.json');

async function getImageSize(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width || 1024,
      height: metadata.height || 768,
    };
  } catch (error) {
    console.warn(`Failed to read ${filePath}:`, error.message);
    return { width: 1024, height: 768 };
  }
}

async function main() {
  // 读取现有配置
  const existing = [];
  try {
    const existingContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const existingJson = JSON.parse(existingContent);
    existingJson.forEach(item => {
      existing.push(item.filename);
    });
  } catch (error) {
    console.log('No existing config found, creating new one');
  }

  // 读取目录中的所有文件
  const files = fs.readdirSync(GALLERY_DIR).filter(f => {
    return f.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  });

  // 找出新增的文件
  const newFiles = files.filter(f => !existing.includes(f));

  if (newFiles.length === 0) {
    console.log('No new files to add');
    return;
  }

  console.log(`Found ${newFiles.length} new files`);

  // 读取现有配置的最后一个 id
  let lastId = 0;
  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    lastId = Math.max(...config.map(item => item.id));
  }

  // 为每个新文件获取尺寸
  const newItems = [];
  for (const filename of newFiles) {
    const filePath = path.join(GALLERY_DIR, filename);
    const size = await getImageSize(filePath);
    lastId++;

    const alt = path.basename(filename, path.extname(filename));

    newItems.push({
      id: lastId,
      filename,
      alt,
      width: size.width,
      height: size.height,
    });

    console.log(`Added ${filename} (${size.width}x${size.height})`);
  }

  // 合并配置
  let config = [];
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
  config = [...config, ...newItems];

  // 写入配置文件
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`\nConfig updated: ${config.length} total items`);
}

main().catch(console.error);