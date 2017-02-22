// Return the values of an object as an array.
function objectValues(obj) {
  return Object.keys(obj).map(k => obj[k]);
}


const knownPaths = {
  // 65: 'node_modules/@blueprintjs/core/src/index.js',
  // 452: './app/store',
  // 216: '@blueprintjs/core/src/components/index',
};

let getModulePathMemory = {};
function getModulePath(modules, moduleId, moduleStack=[]) {
  // console.log('* getModulePath', moduleId, moduleStack);
  
  // Memoize this beast. If a module has already been traversed, then just return it's cached
  // output.
  if (getModulePathMemory[moduleId]) {
    return getModulePathMemory[moduleId];
  }

  // For each module, attempt to lookup the module id. If the module id cannot be found, default to
  // false.
  let modulePath = false; // the path to the target module
  let requireRelativeModule = false; // the id of the module the path is relatve from.
  for (let moduleCt = 0; moduleCt < modules.length; moduleCt++) {
    let mod = modules[moduleCt];
    if (modulePath = moduleHasIdInLookupTable(mod, moduleId)) {
      requireRelativeModule = mod;
      break;
    }
  }

  // If a path to the module was found, then add it to the known require paths.
  if (modulePath) {

    Object.keys(knownPaths).map(i => [i, knownPaths[i]]).map(([key, value]) => {
      if (moduleHasIdInLookupTable(modules, key)) {
        return value.filter((i, ct) => {
          // If the require was done relative to the current module
          let relativePath = moduleHasIdInLookupTable(modules, i.relativeTo)
          if (relativePath) {
            knownPaths[key][ct] = {relativeTo: moduleId, path: [relativePath, ...path]};
          }
        });
      }
    });

    let newPath = {
      relativeTo: requireRelativeModule.id,
      path: [modulePath],
    };

    // Either append to the module id's key or create an array, which ever one is required.
    if (Array.isArray(knownPaths[moduleId])) {
      knownPaths[moduleId].push(newPath);
    } else {
      knownPaths[moduleId] = [newPath];
    }

    // Lastly, traverse another level up the tree. Look in the lookup table of the relatively
    // required module to find all the module ids that it references, then use those to move up the
    // tree.
    for (let moduleCt = 0; moduleCt < modules.length; moduleCt++) {
      let mod = modules[moduleCt];
      getModulePath(modules, mod);
    }
  } else {
    return false;
  }
}

// Given a module and another module's id, find if the given module has the other module in it's
// lookup table. If it does, return the relative path to that module from the current module.
// Otherwise, return false.
// moduleHasIdInLookupTable({id: 5, lookup: {'./foo': 6, './bar': 7}}, 7)
// => ./bar
// moduleHasIdInLookupTable({id: 5, lookup: {'./foo': 6, './bar': 7}}, 8)
// => false
function moduleHasIdInLookupTable(mod, id) {
  if (mod.lookup) {
    let reverseLookup = objectValues(mod.lookup);
    let moduleIdIndex = reverseLookup.indexOf(id);
    if (moduleIdIndex >= 0) {
      // Since the index's between keys / values are one-to-one, lookup in the other array.
      return Object.keys(mod.lookup)[moduleIdIndex];
    } else {
      return false;
    }
  } else {
    return false;
  }
}

module.exports = {
  default: getModulePath,
  getModulePathMemory,
};


const modpath = getModulePath([
  {id: 1, lookup: {'./foo': 2}},
  {id: 2, lookup: {'./bar/baz': 3}},
  {id: 3, lookup: {}},
], 3)

console.log(JSON.stringify(knownPaths, null, 2));
