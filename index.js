const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const escodegen = require('escodegen');
const inquirer = require('inquirer');
const args = require('minimist')(process.argv.slice(2));

// const bundleContents = fs.readFileSync('./webpack_bundle.js');
// const bundleContents = fs.readFileSync('./density_bundle.js');
const bundleContents = fs.readFileSync('./bundle.js');

let ast = acorn.parse(bundleContents, {});

// let iifeModules = ast.body[0].expression.argument.arguments[0].arguments[0];

// Browserify bundles start with an IIFE. Fetch the IIFE and get it's arguments (what we care about,
// and where all the module code is located)
let iifeModules = ast.body[0].expression.arguments[0];







// const webpackDecoder = require('./decoders/webpack');
// let modules = webpackDecoder(iifeModules);

const browserifyDecoder = require('./decoders/browserify');
let modules = browserifyDecoder(iifeModules);



const {default: getModulePath, getModulePathMemory} = require('./getModulePath');

function reverseObject(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[obj[i]] = i; // Reverse keys and values
    return acc;
  }, {});
}

// Assemble the file structure on disk.
let files = modules.map(i => {
  let moduleHierarchy;
  let modulePath;

  // If the module response contains a lookup table for modules that are required in by the current
  // module being iterated over, then calculate the hierachy of the requires to reconstruct the
  // tree.
  if (i.lookup) {
    // Given a module, determine where it was imported within.
    // console.log(`* Reconstructing require path for module ${i.id}...`);
    moduleHierarchy = getModulePath(modules, i.id);

    if (moduleHierarchy && moduleHierarchy.join('').indexOf('blueprint')) {
      console.log(moduleHierarchy);
    }
  } else {
    // console.log(`* No lookup tabie for module ${i.id}, so using identifier as require path...`);
    moduleHierarchy = [`./${i.id}`];
  }

  if (moduleHierarchy === undefined) {
    // Our entry point
    console.log(`* ${i.id} => (Entry Point)`);
    modulePath = 'index';
  } else {
    /* ['./foo'] => './foo'
     * ['../foo'] => '../foo'
     * ['uuid', './foo'] => 'node_modules/uuid/foo'
     * ['uuid', './foo', './bar'] => 'node_modules/uuid/bar'
     * ['uuid', './bar/foo', './baz'] => 'node_modules/uuid/bar/baz'
     * ['abc', './foo', 'uuid', './bar'] => 'node_modules/uuid/bar'
     */

    let rootNodeModule = '';
    let requirePath = moduleHierarchy.reduce((acc, [mod, stack], ct) => {
      if (!mod.startsWith('.')) {
        // A root node module overrides the require tree, since paths are relative to it.
        rootNodeModule = mod;
        return [];
      } else if (ct === moduleHierarchy.length - 1) {
        // When we get to the last item, return the filename as part of the require path.
        return [...acc, mod || 'index'];
      } else {
        // A file import. However, this part is the directory only since further requires will
        // "stack" on top of this one. Therefore, the file that's being included is irrelevant until
        // the last item in the hierarchy (ie, the above case).
        return [...acc, path.dirname(mod)];
      }
    }, []);

    if (requirePath.length > 0) {
      modulePath = path.join(...requirePath);
    } else {
      modulePath = 'index';
    }

    if (rootNodeModule) {
      modulePath = `node_modules/${rootNodeModule}/${modulePath}`;
    }

    console.log(`* ${i.id} => ${modulePath}.js`);
  }

  let filePath = path.join('dist', modulePath);

  // If a filePath has a bunch of `../`s at the end, then it's broken (it broke out of the dist
  // folder!) In this cae, tell the user we need an absolute path of one of the files in order to
  // resolve it.
  if (!filePath.startsWith('dist')) {
    let reversedGetModulePathMemory = reverseObject(getModulePathMemory);
    let err = `Don't have enough information to expand bundle into named files. The process requires the path of one of the below to be explicitly defined:
${moduleHierarchy.map(([mod, stack]) => `- ${mod} (${stack.slice(-1)[0]})`).join('\n')}`;

    throw new Error(err);
  }

  return {
    filePath,
    code: i.code,
  }
});


function writeFile(filePath, contents) {
  console.log(`* Writing file ${filePath}`);
  return fs.writeFileSync(filePath, contents);
}

function writeToDisk(files) {
  return files.forEach(({filePath, code}) => {
    let directory = path.dirname(filePath);
    try {
      code = escodegen.generate(code);
    } catch(e) {
      // FIXME: why does the code generator hickup here?
      console.log(`* Couldn't parse ast to file for ${filePath}.`);
      return
    }

    if (fs.existsSync(directory)) {
      return writeFile(`${filePath}.js`, code);
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

writeToDisk(files);
