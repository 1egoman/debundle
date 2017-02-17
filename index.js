const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

const bundleContents = fs.readFileSync('./bundle.js');

let ast = acorn.parse(bundleContents, {});

// Browserify bundles start with an IIFE. Fetch the IIFE and get it's arguments (what we care about,
// and where all the module code is located)
let iifeModules = ast.body[0].expression.arguments[0];

if (iifeModules.type !== 'ObjectExpression') {
  throw new Error(`The root level IIFE didn't have an object for it's first parameter, aborting...`);
}

// Loop through each module
let modules = iifeModules.properties.map(moduleDescriptor => {
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
  let lookupTable = moduleLookup.properties.reduce((acc, i) => {
    acc[i.key.value] = i.value.value;
    return acc;
  }, {});
  console.log(`* Calculated module lookup table for ${id}`);

  return {
    id,
    code: moduleFunction,
    lookup: lookupTable,
  };
});

// Return the values of an object as an array.
function objectValues(obj) {
  return Object.keys(obj).map(k => obj[k]);
}

function getModulePath(modules, moduleId) {
  // For each module, attempt to lookup the module id.
  return modules.map(m => {
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
modules.map(i => {
  // Given a module, determine where it was imported within.
  let moduleHierarchy = getModulePath(modules, i.id);
  let fullModulePath;

  if (moduleHierarchy === undefined) {
    // Our entry point
    console.log(`* ${i.id} => (Entry Point)`);
    fullModulePath = 'index';
  } else {
    // Take a hierarchy and normalize it:
    // - If we encounter a
    let currentNodeModule = '.';
    console.log(moduleHierarchy);
    let moduleInFolder = moduleHierarchy.reduce((acc, i) => {
      if (i.startsWith('./')) {
        return [...acc, path.dirname(i.slice(2))];
      } else if (i.startsWith('../')) {
        // When an import has multiple ../s at the beginning, then 
        let parentDirectories = [];
        while (i.startsWith('../')) {
          i = i.slice(3);
          parentDirectories.push('..');
        }
        return [...acc, ...parentDirectories, i.slice(3)];
      } else {
        // its a node_modules dependency
        currentNodeModule = i;
        return [];
      }
    }, []);

    // Determine the name of the file that the cost is in.
    // If the path ends with a folder, or is just a node_modules depedency, then the filename should
    // be index.js.
    let basename = path.basename(moduleHierarchy.slice(-1)[0]);
    if (basename === currentNodeModule) {
      basename = "index";
    }

    fullModulePath = path.join(
      currentNodeModule,
      path.join.apply(path, moduleInFolder),
      basename
    );
    console.log(`* ${i.id} => ${fullModulePath}.js`);
  }

  let filePath = path.join('dist', fullModulePath);
  mkdirp(path.dirname(filePath), (err, resp) => {
    fs.writeFileSync(`${filePath}.js`, JSON.stringify(i.code));
  });
});

/* Browserify bundles start with an IIFE.
 *
 */

// console.log(modules);
