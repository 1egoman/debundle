const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const escodegen = require('escodegen');

// The below adds `module.exports = ` before the code.
function defaultExportData(code) {
  return {
    "type": "Program",
    "start": 0,
    "end": 199,
    "body": [
      {
        "type": "ExpressionStatement",
        "start": 179,
        "end": 199,
        "expression": {
          "type": "AssignmentExpression",
          "start": 179,
          "end": 199,
          "operator": "=",
          "left": {
            "type": "MemberExpression",
            "start": 179,
            "end": 193,
            "object": {
              "type": "Identifier",
              "start": 179,
              "end": 185,
              "name": "module"
            },
            "property": {
              "type": "Identifier",
              "start": 186,
              "end": 193,
              "name": "exports"
            },
            "computed": false
          },
          "right": code,
        }
      }
    ],
    "sourceType": "module"
  };
}

function writeFile(filePath, contents) {
  console.log(`* Writing file ${filePath}`);
  return fs.writeFileSync(filePath, contents);
}

function writeToDisk(files) {
  return files.forEach(({filePath, code}) => {
    let directory = path.dirname(filePath);

    // Any modules that are wrapped in a function (because they were bundled code) should be
    // collapsed with the wrapping funtion removed.
    if (code.body && code.body.type === 'BlockStatement') {
      code.type = 'Program';
      code.body = code.body.body;
    }

    try {
      code = escodegen.generate(
        code.type === 'Program' ? code : defaultExportData(code), // render the wrapping function's data or prepend non-function data with module.exports
        { format: { indent: { style: '  ' } } } // 2 space indentation
      );
    } catch(e) {
      throw new Error(`* Couldn't parse ast to file for ${filePath}: ${e}`);
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
