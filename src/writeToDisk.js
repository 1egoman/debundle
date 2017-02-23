const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const escodegen = require('escodegen');

function writeFile(filePath, contents) {
  console.log(`* Writing file ${filePath}`);
  return fs.writeFileSync(filePath, contents);
}

function writeToDisk(files) {
  return files.forEach(({filePath, code}) => {
    let directory = path.dirname(filePath);
    try {
      code = escodegen.generate(code.body, {
        format: { indent: { style: '  ' } }, // 2 space indentation
      });
    } catch(e) {
      // FIXME: why does the code generator hickup here?
      console.log(`* Couldn't parse ast to file for ${filePath}.`);
      return
    }

    if (fs.existsSync(directory)) {
      return writeFile(`${path.normalize(filePath)}.js`, code);
    } else {
      console.log(`* ${directory} doesn't exist, creating...`);
      mkdirp(directory, (err, resp) => {
        if (err) {
          throw err;
        } else {
          return writeFile(`${filePath}.js`, code);
        }
      });
    }
  });
}

module.exports = writeToDisk;
