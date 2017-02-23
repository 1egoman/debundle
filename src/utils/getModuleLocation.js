const {default: getModulePath, getModulePathMemory} = require('./getModulePath');
const path = require('path');

// Given a module, return it's location on disk.
function getModuleLocation(modules, mod, knownPaths, pathPrefix="dist/") {
  let moduleHierarchy;
  let modulePath;

  // If the module response contains a lookup table for modules that are required in by the current
  // module being iterated over, then calculate the hierachy of the requires to reconstruct the
  // tree.
  if (mod.lookup) {
    // Given a module, determine where it was imported within.
    console.log(`* Reconstructing require path for module ${mod.id}...`);
    moduleHierarchy = getModulePath(modules, mod.id, knownPaths);
  } else {
    console.log(`* No lookup tabie for module ${mod.id}, so using identifier as require path...`);
    moduleHierarchy = knownPaths[mod.id] ?  [[knownPaths[mod.id], [mod.id]]] : [[`./${mod.id}`, [mod.id]]];
  }

  if (moduleHierarchy === undefined) {
    // Our entry point
    console.log(`* ${mod.id} => (Entry Point)`);
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

    console.log(`* ${mod.id} => ${modulePath}.js`);
  }

  let filePath = path.join(pathPrefix, modulePath);

  // If a filePath has a bunch of `../`s at the end, then it's broken (it broke out of the dist
  // folder!) In this cae, tell the user we need an absolute path of one of the files in order to
  // resolve it. Log out each of the paths along the require tree and it's respective module id.
  if (!filePath.startsWith(pathPrefix)) {
    let reversedGetModulePathMemory = reverseObject(getModulePathMemory);
    let err = `Don't have enough information to expand bundle into named files. The process requires the path of one of the below to be explicitly defined:
${moduleHierarchy.map(([mod, stack]) => `- ${mod} (${stack.slice(-1)[0]})`).join('\n')}`;

    throw new Error(err);
  }

  return filePath;
}

function reverseObject(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[obj[i]] = i; // Reverse keys and values
    return acc;
  }, {});
}

module.exports = getModuleLocation;
