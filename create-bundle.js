const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

console.log('Starting the deployment bundling process...');

// --- Step 1: Run a clean install and production build ---
console.log('Running npm install...');
execSync('npm install', { stdio: 'inherit' });

console.log('Running npm run build...');
execSync('npm run build', { stdio: 'inherit' });

// --- Step 2: Define what to include in the zip ---
const output = fs.createWriteStream(path.join(__dirname, 'deploy.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

// --- Step 3: Handle the zip stream ---
output.on('close', function() {
  console.log(`\nBundle created successfully: deploy.zip (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
  console.log('You can now transfer deploy.zip to your server.');
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// --- Step 4: Add all the necessary files and folders to the zip ---
console.log('\nAdding files to the deployment bundle...');

const files_and_folders_to_bundle = [
    'node_modules',
    '.next',
    'public',
    'src',
    'package.json',
    'package-lock.json',
    'next.config.js',
    'server.js',
    'tailwind.config.ts',
    'postcss.config.mjs'
];

files_and_folders_to_bundle.forEach(item => {
    const itemPath = path.join(__dirname, item);
    if (fs.existsSync(itemPath)) {
        if (fs.lstatSync(itemPath).isDirectory()) {
            console.log(`- Adding directory: ${item}/`);
            archive.directory(itemPath, item);
        } else {
            console.log(`- Adding file: ${item}`);
            archive.file(itemPath, { name: item });
        }
    } else {
        console.warn(`- Skipping (not found): ${item}`);
    }
});


// Finalize the archive (this starts the zipping process)
archive.finalize();