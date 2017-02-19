const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const escodegen = require('escodegen');

const bundleContents = fs.readFileSync('./bundle.js');

let ast = acorn.parse(bundleContents, {});

// Browserify bundles start with an IIFE. Fetch the IIFE and get it's arguments (what we care about,
// and where all the module code is located)
let iifeModules = ast.body[0].expression.arguments[0];

if (iifeModules.type !== 'ObjectExpression') {
  throw new Error(`The root level IIFE didn't have an object for it's first parameter, aborting...`);
}




// {
//   1: [
//     function(require, module, exports) {
//       // the code goes here
//       var foo = require('./foo');
//     }, {
//       './foo': 2
//     }
//   ],
//   2: [
//     function(require, module, exports) {
//       // this the contents of foo.js
//     }, {
//       // No modules to look up
//     }
//   ],
// }
function browserifyDecoder(moduleArrayAST) {
  // Loop through each module
  return moduleArrayAST.properties.map(moduleDescriptor => {
    // `moduleDescriptor` is the AST for the number-to-array mapping that browserify uses to lookup
    // modules.
    if (moduleDescriptor.type !== 'Property') {
      throw new Error(`The module array AST doesn't contain a Property, make sure that the first argument passed to the rool level IIFE is an object.`);
    }

    // Extract the identifier used by the module within the bundle
    let id = moduleDescriptor.key.value;
    console.log(`* Discovered module ${id}`);

    if (moduleDescriptor.value.type !== 'ArrayExpression') {
      throw new Error(`Module ${id} has a valid key, but maps to something that isn't an array.`);
    }

    // Extract the function that wraps the module.
    let moduleFunction = moduleDescriptor.value.elements[0];
    console.log(`* Extracted module code for ${id}`);

    // Extract the lookup table for mapping module identifier to its name.
    let moduleLookup = moduleDescriptor.value.elements[1];
    if (moduleLookup.type !== 'ObjectExpression') {
      throw new Error(`Moduel ${id} has a valid key and code, but the 2nd argument passed to the module (what is assumed to be the lookup table) isn't an object.`);
    }
    console.log(`* Extracted module lookup table for ${id}`);

    // Using the ast, create the lookup table. This maps module name to identitfier.
    // To be clear, this just converts the 2nd array arg's AST to a native javascript object.
    let lookupTable = moduleLookup.properties.reduce((acc, i) => {
      acc[i.key.value] = i.value.value;
      return acc;
    }, {});
    console.log(`* Calculated module lookup table for ${id}`);

    return {
      id,
      code: moduleFunction.body,
      lookup: lookupTable,
    };
  });
}

// Loop through each module
let modules = browserifyDecoder(iifeModules);





// Return the values of an object as an array.
function objectValues(obj) {
  return Object.keys(obj).map(k => obj[k]);
}

function getModulePath(modules, moduleId) {
  // For each module, attempt to lookup the module id.
  return modules.map(m => {
    // If the module doesn't have modules to lookup, then return false.
    if (!m.lookup) { return false; }

    // Do a reverse lookup since we need to get the module names (keys) that match a specified value
    // (module id)
    let reverseLookup = objectValues(m.lookup);
    let moduleIdIndex = reverseLookup.indexOf(moduleId);
    if (moduleIdIndex >= 0) {
      // Since the index's between keys / values are one-to-one, lookup in the other array.
      let moduleName = Object.keys(m.lookup)[moduleIdIndex];
      let parentModule = getModulePath(modules, m.id);
      if (parentModule) {
        return [...parentModule, moduleName];
      } else {
        return [moduleName];
      }
    } else {
      // Module isn't in the lookup table, move on to the next module in the list.
      return false;
    }
  }).find(i => i); // Find the first module that matches.
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
    console.log(`* Reconstructing require path for module ${i.id}...`);
    moduleHierarchy = getModulePath(modules, i.id);
  } else {
    console.log(`* No lookup tabie for module ${i.id}, so using identifier as require path...`);
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
    let requirePath = moduleHierarchy.reduce((acc, mod, ct) => {
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
  return {
    filePath,
    code: i.code,
  }
});


// function makeDirectoryIfDoesntExist(filePath) {
//   return new Promise((resolve, reject) => {
//     let directory = path.dirname(filePath);
//   });
// }

function writeFile(filePath, contents) {
  console.log(`* Writing file ${filePath}`);
  return fs.writeFileSync(filePath, contents);
}

files.forEach(({filePath, code}) => {
  let directory = path.dirname(filePath);
  code = escodegen.generate(code);

  if (fs.existsSync(directory)) {
    return writeFile(`${filePath}.js`);
  } else {
    console.log(`* ${directory} doesn't exist, creating...`);
    mkdirp(directory, (err, resp) => {
      if (err) {
        throw err;
      } else {
        return writeFile(`${filePath}.js`);
      }
    });
  }
});
