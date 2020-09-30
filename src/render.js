const { ipcRenderer } = require('electron');
const Store = require('./store.js');
const path = require('path');
const puppet = require('puppeteer');
const https = require('https');
const fs = require('fs');
const sZip = require('node-stream-zip');
const chokidar = require('chokidar');

const store = new Store({
  configName: 'retail-path',
  defaults: {
    path: ''
  }
});


const selectDirBtn = document.getElementById('browseBtn');
const updateBtn = document.getElementById('updateBtn');

updateBtn.addEventListener('click', (event) => {
  updateElv();
})

selectDirBtn.addEventListener('click', (event) => {
  ipcRenderer.send('select-path-dialog', store)
});

ipcRenderer.on('path-selected', (event, path) => {
  filePath = `${path}`;
  console.log(filePath);
  if (filePath !== '') {
    store.set('path', filePath);
    document.getElementById('retailPath').value = filePath;
  }
})

window.onload = function () {
  let storedPath = store.get('path');
  if (storedPath !== '') {
    document.getElementById('retailPath').value = storedPath;
  }
};

async function updateElv() {
  let addonPath = store.get('path');
  // console.log(addonPath);
  let downloadDir = path.resolve(addonPath, '..') + '\\';
  // console.log(parentDir);
  let baseUrl = 'https://www.tukui.org/download.php?ui=elvui'
  zipL = await scrape(baseUrl);
  let baseFileName = path.basename(zipL);

  let plato = await downloadZip(downloadDir, zipL);
  if (!plato) {
    console.error('An error has occured while downloading');
  }

  var watcher = chokidar.watch(downloadDir + baseFileName,
    {
      ignored: /^\./,
      persistent: true,
      awaitWriteFinish: true,
    });

  watcher
    .on('add', function (path) { console.log('File', path, 'has been added'); extractZip(downloadDir, baseFileName, downloadDir + 'AddOns'); })
    .on('change', function (path) { console.log('File', path, 'has been changed'); })
    .on('unlink', function (path) { console.log('File', path, 'has been removed'); })
    .on('error', function (error) { console.error('Error happened', error); })
}

async function extractZip(dir, file, target) {
  const zip = new sZip({
    file: dir + file,
    storeEntries: true,
  });

  zip.on('error', err => console.log(err));
  zip.on('ready', () => {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
    }
    zip.extract(null, target, (err, count) => {
      console.log(err ? 'Extract error' : `Extracted ${count} entries`);
      zip.close();
    });
  });

  fs.unlink(dir+file, (err) => {
    if (err) throw err;
  });
}

function scrape(URL) {
  return getLinks(URL);
}

async function downloadZip(dir, URL) {
  const zipName = path.basename(URL);
  const req = https.get(URL, function (res) {
    const filestream = fs.createWriteStream(dir + zipName);
    res.pipe(filestream);

    filestream.on('error', function (err) {
      console.log('Error while writing file.');
      console.log(err);
      return false;
    })

    filestream.on('finish', function () {
      filestream.close();
      console.log('File Downloaded and saved at -> ' + dir);
      return false;
    })
  })
  req.on('error', function (err) {
    console.log('Error on https request');
    console.log(err);
    return false;
  })
  return true;
}

function getChromiumExecPath() {
  return puppet.executablePath().replace('app.asar', 'app.asar.unpacked');
}

async function getLinks(URL) {
  var zip = '';
  try {
    const browser = await puppet.launch({
      headless: false,
      executablePath: getChromiumExecPath(),
      defaultViewport: null,
      args: ['--no-sandbox'],
      ignoreDefaultArgs: ['--disable-extensions'],
    });

    const page = await browser.newPage();
    page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:81.0) Gecko/20100101 Firefox/81.0');
    await page.goto(URL);
    await page.waitForSelector('.mb-10');

    const links = await page.$$eval('a', as => as.map(a => a.href));

    for (const link of links) {
      if (isZip(link)) {
        zip = link;
        break;
      }
    }
  } catch (e) {
    console.log('Error ->', e);
  }

  return zip;
}

function isZip(URL) {
  var ext = URL.split('.').pop();
  return (ext === 'zip') ? true : false;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
